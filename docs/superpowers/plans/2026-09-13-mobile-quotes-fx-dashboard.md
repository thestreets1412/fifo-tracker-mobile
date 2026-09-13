# Quotes, FX, and the Portfolio Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the keyless network layer (stock quotes and USD/THB FX), its two SQLite cache tables, the portfolio summary calculation, and the live Dashboard screen that replaces the plan-3 placeholder — including graceful per-symbol degradation when a lookup fails, advisory symbol-name backfill, and FX-rate autofill on the transaction forms.

**Architecture:** Every network call goes through one timeout-bounded helper (`src/services/http.ts`) whose `fetch` implementation is an injected dependency, so the whole network layer runs under plain-Node Jest against stub responses and **never touches the real network in a test**. Quote and FX responses are parsed by exported pure functions that take a response body string — those carry the parsing tests. Cache policy lives in `src/services/fx.ts` and `src/services/quotes.ts` over the `fx_rates`/`quotes` tables created (but never written) by plan 2. The money math is isolated in `src/services/portfolio.ts`, which takes an **already-resolved price map** rather than performing I/O, so the dashboard's arithmetic is fully testable without a network or a device. The Dashboard screen does the fetching, feeds the map in, and renders.

**Tech Stack:** No new dependencies. Platform `fetch` + `AbortController` (present in both Node 24 and React Native 0.86), `decimal.js`, `expo-sqlite` via the existing `SqlDatabase` port, `zustand`, Expo Router, Jest/ts-jest with `better-sqlite3` for in-memory database tests. The allocation chart is built from plain `View`s — no chart library.

**Spec:** `D:\Python\fifo-tracker-mobile\docs\superpowers\specs\2026-09-12-mobile-standalone-design.md` (sections 5, 7.1, 7.4, 2.2, 10 are load-bearing for this plan; the "Open Items" section's quote-source question is resolved below).

---

## Global Constraints

- **Project root:** `D:\Python\fifo-tracker-mobile`. The implementer's working directory **is** the repo root — treat it as such and never `cd` elsewhere. Nothing here writes to `D:\Python\stock-fifo-web-app`.
- **Branch:** this plan executes on the existing `develop` branch. Do not start from or merge into `main` without explicit consent.
- **Money never touches a JavaScript `number`** (CLAUDE.md). Prices, FX rates, quantities, costs, and gains are `decimal.js` `Decimal` throughout; strings at the SQLite boundary. **The single permitted exception in this plan is the allocation chart's `percent` field** (`src/ui/allocation.ts`), which exists only to drive a flexbox width — CLAUDE.md: *"`number` is allowed only for chart rendering."* Every segment also carries its `costThb` as a string so no consumer is tempted to do arithmetic on the percentage.
- **JSON numbers become `Decimal` via `new Decimal(String(value))`**, never via arithmetic on the parsed `number`. This matches the Django original's `Decimal(str(payload['rates']['THB']))` (`docs/reference/django/services.py:55`); JS `String(number)` and Python 3 `str(float)` both emit the shortest round-tripping representation, so ported values agree.
- **Never `SUM()` a money or quantity column in SQL** (CLAUDE.md). `COUNT(*)`/`EXISTS` for row presence is fine; every total in this plan is summed in JavaScript with `Decimal`.
- **Rounding is `Decimal.ROUND_HALF_EVEN` everywhere**, quantized to the `DP` constants in `src/core/money.ts` (`price: 6, qty: 8, fxRate: 4, money: 4`).
- **`src/core/` imports nothing from React, Expo, or `src/db/`** (CLAUDE.md). This plan adds exactly one pure function to the existing `src/core/derive.ts` and **creates no new file under `src/core/`** — `src/core/__tests__/isolation.test.ts` asserts the exact file list `['derive.ts','fifo.ts','money.ts','types.ts']` and must stay green untouched.
- **`src/services/http.ts`, `fx.ts`, `quotes.ts`, `portfolio.ts`, `symbolLookup.ts` and all `src/ui/*.ts` (not `src/ui/components/`) import nothing from `react`, `react-native`, or `expo*`.** They are the device-independent layer and must run under the Node Jest environment.
- **No test may perform a real network request.** Every network-touching test injects a stub `fetch`. The real `platformFetch` is only ever passed in from a screen.
- **Only keyless endpoints** (spec §5). An API key shipped in an APK is public. The three endpoints this plan may contact, and no others: `https://api.frankfurter.app/...`, `https://query1.finance.yahoo.com/...`, `https://stooq.com/q/l/...`.
- **Privacy is a product constraint** (CLAUDE.md). The only data that leaves the device is a ticker symbol and a date. Never a quantity, cost basis, gain, symbol *count*, or any identifier. No analytics, no crash reporting, no `User-Agent` carrying device identity.
- **Network failure is a normal state, not an exception path** (spec §5). Every fetch in this plan has a bounded timeout, and every caller has a defined behavior for "it failed": show the cached value with its age, or degrade that one symbol. A failed NVDA lookup must never blank the dashboard.
- **Neither cache table is included in backups** (spec §5) — both are reconstructible. Nothing in this plan adds them to any export (backup is plan 6); just do not create a coupling that would make that hard.
- **Dates** are `'YYYY-MM-DD'` strings; **timestamps** are ISO 8601 UTC strings (`new Date().toISOString()`).
- **TypeScript strict mode** stays on (`tsconfig.json` has `strict` + `noUncheckedIndexedAccess`).
- **App UI language is Thai.** All user-facing copy added by this plan is Thai. Error messages thrown by services are English technical strings; screens map them to Thai copy.
- Node 24.18.0 and npm 11.16.0 are installed and confirmed on this machine.

---

## Decisions Made Before Task 1

These resolve open questions so no implementer has to guess. Each is binding.

**1. Quote source: try Yahoo, fall back to stooq — do not choose one.**
Spec "Open Items" lists *"Quote source: Yahoo unofficial endpoint versus stooq CSV — needs a spike to compare reliability and rate limits from a mobile client."* A spike cannot settle this, because spec §5 already states both *"can break without notice."* Picking one and waiting for it to break is the failure mode the spec warns about. The plan therefore implements **both** as ~25-line pure parsers behind one `fetchQuote()` chain: Yahoo first (it also returns the company name, which §7.4's backfill needs), stooq second. The marginal cost over picking one is one parser and one test file; the payoff is that either endpoint dying degrades to "slower" instead of "broken". *If wrong:* a dead provider costs one deleted function.

**2. The dashboard's cost basis is the cost of the *unsold* quantity, not `lotCostThb`.**
Plan 1's final review flagged, unresolved, *"how `lotCostThb` relates to summed allocation cost basis for a fully-sold lot."* Resolved here: they answer different questions and both stay. `lotCostThb` is what the whole lot cost when bought (used on the lot detail screen). The dashboard needs what the *remaining* shares cost, which the Django original computes as `remaining * price_usd * fx_rate` (`docs/reference/django/services.py:167-169`). Task 4 adds `lotRemainingCostThb()` for exactly that. A fully-sold lot contributes `0` to the dashboard and still shows its original `lotCostThb` on its own screen. *If wrong:* the number is one function, changed in one place.

**3. One cache TTL constant, 15 minutes, for quotes and for today's FX row.**
Spec §5 fixes quotes at 15 minutes and says *"only the current day's rate is refetched"* for FX. A row for a **past** date is permanent and never refetched. A row for **today** needs *some* TTL: Frankfurter publishes once daily around 16:00 CET, so a rate cached at 09:00 is the *previous* day's figure filed under today's key, and caching it permanently would freeze it. 15 minutes — the same constant as quotes — refreshes it shortly after publication, costs one request per quarter hour at worst, and leaves one number to reason about instead of two. *If wrong:* one constant.

**4. No chart library for the allocation chart.**
A horizontal stacked bar of flex-weighted `View`s plus a legend renders the whole of spec §7.1's "allocation chart" with zero new native dependencies, zero bundle growth, and no library that can break on an Expo SDK bump. *If wrong:* the component is ~50 lines and replaceable.

**5. `src/services/fx.ts` imports `todayYmd` from `src/ui/dateInput.ts`.**
`dateInput.ts` is a pure date-string utility that imports nothing; the alternative is a second copy of the same local-date formatter, which is the DRY violation a reviewer would rightly flag. Task 2 widens its signature to `todayYmd(now: Date = new Date())` so the service can inject a clock. No import cycle is created — `dateInput.ts` imports nothing from `src/services/`.

**6. The dashboard fetches quotes only for symbols with remaining quantity > 0.**
A fully-sold position has no live value to show, so requesting its price is a wasted round trip and a needless disclosure of a ticker the user no longer holds. This matches the Django original, which guards on `remaining_qty > 0` before calling `fetch_current_price` (`docs/reference/django/services.py:257`).

---

## Testing Strategy for This Plan — read before Task 1

Same split as plan 3, and for the same reason (spec §10: *"Screens — manual verification on a physical device. UI correctness is not claimed from test results."*).

- **React-free logic modules get real Jest tests, written test-first:** `src/services/http.ts`, `fx.ts`, `quotes.ts`, `portfolio.ts`, `symbolLookup.ts`; `src/ui/quoteAge.ts`, `allocation.ts`; the new `src/db/repo.ts` cache functions; the new `src/core/derive.ts` function. This is where all the money math and all the cache/fallback policy lives, so this is where the test investment goes.
- **React Native components and screens are not unit-tested:** `src/ui/components/*.tsx`, `src/app/**/*.tsx`. Their per-task verification is `npm run typecheck` plus the explicit manual checklist each task prints.
- **Network stubbing:** every network test injects a `HttpFetch` stub. Parsers are exported and tested directly against fixture body strings, so most coverage needs no stub at all.

### Environment note — read this before writing a "manual verification" step

**This execution environment has no attached Android device, no emulator, and no web target** (`react-native-web` is deliberately not installed — this is an Android-only app). The same substitution plan 3 used applies, unchanged:

- The **automated gate after every task** is `npm run typecheck` && `npm test`. Both must be green before the task is committed.
- The **final task additionally runs** `npx expo export --platform android`, which pushes the whole file graph through Metro/Hermes and proves every screen, import, and native-module reference resolves and bundles.
- Each task still **lists its manual checks explicitly**, marked as deferred to a human device pass. Do not claim a visual or interaction behavior was verified. Report them as unconfirmed.

This is sufficient to merge into `develop`. A human device pass is still owed before `develop` is promoted for release.

---

## File Structure

```
src/
├── core/
│   └── derive.ts               MODIFY: + lotRemainingCostThb(lot, allocations)
├── db/
│   └── repo.ts                 MODIFY: + fx_rates / quotes cache row CRUD
├── services/
│   ├── http.ts                 NEW  timeout-bounded GET; HttpFetch seam; HttpError
│   ├── fx.ts                   NEW  Frankfurter fetch/parse + fx_rates cache policy
│   ├── quotes.ts               NEW  Yahoo + stooq parsers, provider chain, quotes cache
│   ├── portfolio.ts            NEW  buildPortfolioSummary — network-free money math
│   └── symbolLookup.ts         NEW  advisory symbol-name backfill (spec §7.4)
├── ui/
│   ├── dateInput.ts            MODIFY: todayYmd(now = new Date())
│   ├── quoteAge.ts             NEW  formatQuoteAge(fetchedAt, now) → Thai age label
│   ├── allocation.ts           NEW  buildAllocationSegments(rows) → chart segments
│   └── components/
│       ├── Screen.tsx          MODIFY: + optional refreshControl passthrough
│       ├── StatTile.tsx        NEW  big-number tile
│       ├── AllocationBar.tsx   NEW  stacked bar + legend (no chart library)
│       └── FxRateField.tsx     NEW  FX input + "ดึงเรต" fetch button
├── theme/
│   └── tokens.ts               MODIFY: + chartPalette
└── app/
    ├── (tabs)/index.tsx        REPLACE placeholder with the live Dashboard
    ├── lot/new.tsx             MODIFY: FxRateField + name backfill
    ├── lot/[id]/edit.tsx       MODIFY: FxRateField + name backfill
    ├── sale/new.tsx            MODIFY: FxRateField + name backfill
    ├── sale/[id]/edit.tsx      MODIFY: FxRateField + name backfill
    └── symbols/index.tsx       MODIFY: + "ดึงชื่อจากอินเทอร์เน็ต" button
```

---

### Task 1: HTTP helper and the two cache repositories

**Files:**
- Create: `src/services/http.ts`
- Create: `src/services/__tests__/http.test.ts`
- Modify: `src/db/repo.ts` (append a new section at end of file)
- Create: `src/db/__tests__/repo.cache.test.ts`

**Interfaces:**
- Consumes: `SqlDatabase` from `src/db/sqlDatabase.ts`; `openTestDatabase()` from `src/db/__tests__/testDatabase.ts`; `runMigrations` from `src/db/schema.ts`.
- Produces:
  - `src/services/http.ts` exports `interface HttpResponse { ok: boolean; status: number; text(): Promise<string> }`, `type HttpFetch = (url: string, init?: { headers?: Record<string, string>; signal?: AbortSignal }) => Promise<HttpResponse>`, `class HttpError extends Error` (fields `url: string`), `const USER_AGENT: string`, `const REQUEST_TIMEOUT_MS: number`, `const platformFetch: HttpFetch`, `async function httpGetText(url: string, fetchImpl: HttpFetch, timeoutMs?: number): Promise<string>`.
  - `src/db/repo.ts` exports `interface FxRateRow { rateDate: string; usdThb: string; fetchedAt: string }`, `getFxRateRow(db, rateDate: string): FxRateRow | null`, `upsertFxRateRow(db, row: FxRateRow): void`, `latestFxRateRow(db): FxRateRow | null`, `interface QuoteRow { ticker: string; priceUsd: string; fetchedAt: string }`, `getQuoteRow(db, ticker: string): QuoteRow | null`, `upsertQuoteRow(db, row: QuoteRow): void`.

- [ ] **Step 1: Write the failing test for the HTTP helper**

Create `src/services/__tests__/http.test.ts`:

```ts
import { httpGetText, HttpError, USER_AGENT, type HttpFetch, type HttpResponse } from '../http';

function okResponse(body: string): HttpResponse {
  return { ok: true, status: 200, text: async () => body };
}

describe('httpGetText', () => {
  it('returns the response body and sends the app User-Agent', async () => {
    const seen: Array<{ url: string; headers?: Record<string, string> }> = [];
    const fetchImpl: HttpFetch = async (url, init) => {
      seen.push({ url, headers: init?.headers });
      return okResponse('hello');
    };

    await expect(httpGetText('https://example.test/a', fetchImpl)).resolves.toBe('hello');
    expect(seen).toHaveLength(1);
    expect(seen[0]!.url).toBe('https://example.test/a');
    expect(seen[0]!.headers?.['User-Agent']).toBe(USER_AGENT);
  });

  it('throws HttpError on a non-2xx status, naming the status', async () => {
    const fetchImpl: HttpFetch = async () => ({ ok: false, status: 429, text: async () => '' });
    await expect(httpGetText('https://example.test/b', fetchImpl)).rejects.toThrow(HttpError);
    await expect(httpGetText('https://example.test/b', fetchImpl)).rejects.toThrow(/HTTP 429/);
  });

  it('wraps a transport failure in HttpError rather than leaking it', async () => {
    const fetchImpl: HttpFetch = async () => {
      throw new TypeError('Network request failed');
    };
    await expect(httpGetText('https://example.test/c', fetchImpl)).rejects.toThrow(HttpError);
    await expect(httpGetText('https://example.test/c', fetchImpl)).rejects.toThrow(/Network request failed/);
  });

  it('times out a hanging request and aborts the signal', async () => {
    let aborted = false;
    const fetchImpl: HttpFetch = (_url, init) =>
      new Promise<HttpResponse>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          aborted = true;
          reject(new Error('aborted'));
        });
      });

    await expect(httpGetText('https://example.test/d', fetchImpl, 10)).rejects.toThrow(/timed out after 10ms/);
    expect(aborted).toBe(true);
  });

  it('does not leave a pending timer after a fast success', async () => {
    const fetchImpl: HttpFetch = async () => okResponse('fast');
    await expect(httpGetText('https://example.test/e', fetchImpl, 50)).resolves.toBe('fast');
    // If the timer were still armed, Jest would warn about an open handle.
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx jest src/services/__tests__/http.test.ts`
Expected: FAIL — `Cannot find module '../http'`.

- [ ] **Step 3: Write `src/services/http.ts`**

```ts
/**
 * The single outbound-network seam for the whole app.
 *
 * `fetch` is an injected parameter, not a global, for two reasons: tests run
 * under plain Node with a stub and never touch the network, and React
 * Native's fetch and Node's fetch are different implementations that happen
 * to share a shape — depending on either one's types here would couple this
 * file to a platform it should not know about.
 *
 * Every request is timeout-bounded. Spec §5 states both quote endpoints "can
 * break without notice", and a mobile radio can stall a request indefinitely
 * without failing it; an unbounded fetch would hang the dashboard forever
 * rather than falling back to the cached value.
 */

export interface HttpResponse {
  ok: boolean;
  status: number;
  text(): Promise<string>;
}

export type HttpFetch = (
  url: string,
  init?: { headers?: Record<string, string>; signal?: AbortSignal },
) => Promise<HttpResponse>;

export class HttpError extends Error {
  constructor(readonly url: string, reason: string) {
    super(`GET ${url} failed: ${reason}`);
    this.name = 'HttpError';
  }
}

/**
 * Identifies the app and its version only. Deliberately carries no device,
 * install, or user identifier — spec "Privacy Is a Product Constraint": the
 * only thing that may leave the device is a ticker and a date.
 */
export const USER_AGENT = 'fifo-tracker-mobile/1.0';

export const REQUEST_TIMEOUT_MS = 5000;

/** The real platform fetch, structurally narrowed to HttpFetch. Never used in a test. */
export const platformFetch: HttpFetch = (url, init) =>
  (globalThis as unknown as { fetch: (u: string, i?: unknown) => Promise<HttpResponse> }).fetch(url, init);

export async function httpGetText(
  url: string,
  fetchImpl: HttpFetch,
  timeoutMs: number = REQUEST_TIMEOUT_MS,
): Promise<string> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;

  // Raced against the request as well as aborted, because a fetch
  // implementation that ignores `signal` would otherwise never reject.
  const expiry = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new HttpError(url, `timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  try {
    const response = await Promise.race([
      fetchImpl(url, {
        headers: { 'User-Agent': USER_AGENT, Accept: '*/*' },
        signal: controller.signal,
      }),
      expiry,
    ]);
    if (!response.ok) {
      throw new HttpError(url, `HTTP ${response.status}`);
    }
    return await Promise.race([response.text(), expiry]);
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(url, error instanceof Error ? error.message : String(error));
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx jest src/services/__tests__/http.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Write the failing test for the cache repositories**

Create `src/db/__tests__/repo.cache.test.ts`:

```ts
import { openTestDatabase } from './testDatabase';
import { runMigrations } from '../schema';
import {
  getFxRateRow, upsertFxRateRow, latestFxRateRow,
  getQuoteRow, upsertQuoteRow,
} from '../repo';
import type { SqlDatabase } from '../sqlDatabase';

let db: SqlDatabase;
beforeEach(() => {
  db = openTestDatabase();
  runMigrations(db);
});

describe('fx_rates cache repository', () => {
  it('returns null for a date that was never cached', () => {
    expect(getFxRateRow(db, '2026-09-01')).toBeNull();
  });

  it('round-trips a rate without touching its decimal string', () => {
    upsertFxRateRow(db, { rateDate: '2026-09-01', usdThb: '36.2100', fetchedAt: '2026-09-01T10:00:00.000Z' });
    expect(getFxRateRow(db, '2026-09-01')).toEqual({
      rateDate: '2026-09-01', usdThb: '36.2100', fetchedAt: '2026-09-01T10:00:00.000Z',
    });
  });

  it('overwrites the rate and fetched_at for a date already cached', () => {
    upsertFxRateRow(db, { rateDate: '2026-09-01', usdThb: '36.2100', fetchedAt: '2026-09-01T10:00:00.000Z' });
    upsertFxRateRow(db, { rateDate: '2026-09-01', usdThb: '36.5000', fetchedAt: '2026-09-01T11:00:00.000Z' });
    expect(getFxRateRow(db, '2026-09-01')).toEqual({
      rateDate: '2026-09-01', usdThb: '36.5000', fetchedAt: '2026-09-01T11:00:00.000Z',
    });
  });

  it('latestFxRateRow returns the newest rate_date, not the newest fetched_at', () => {
    upsertFxRateRow(db, { rateDate: '2026-09-05', usdThb: '36.0000', fetchedAt: '2026-09-09T10:00:00.000Z' });
    upsertFxRateRow(db, { rateDate: '2026-09-08', usdThb: '36.4000', fetchedAt: '2026-09-08T10:00:00.000Z' });
    expect(latestFxRateRow(db)?.rateDate).toBe('2026-09-08');
  });

  it('latestFxRateRow returns null on an empty cache', () => {
    expect(latestFxRateRow(db)).toBeNull();
  });
});

describe('quotes cache repository', () => {
  it('returns null for a ticker that was never cached', () => {
    expect(getQuoteRow(db, 'NVDA')).toBeNull();
  });

  it('round-trips a quote without touching its decimal string', () => {
    upsertQuoteRow(db, { ticker: 'NVDA', priceUsd: '171.230000', fetchedAt: '2026-09-13T09:00:00.000Z' });
    expect(getQuoteRow(db, 'NVDA')).toEqual({
      ticker: 'NVDA', priceUsd: '171.230000', fetchedAt: '2026-09-13T09:00:00.000Z',
    });
  });

  it('normalizes the ticker on write and on read, so nvda and NVDA are one row', () => {
    upsertQuoteRow(db, { ticker: ' nvda ', priceUsd: '171.230000', fetchedAt: '2026-09-13T09:00:00.000Z' });
    expect(getQuoteRow(db, 'NVDA')?.ticker).toBe('NVDA');
    expect(getQuoteRow(db, 'nvda')?.priceUsd).toBe('171.230000');
    expect(db.getAllSync('SELECT * FROM quotes;')).toHaveLength(1);
  });

  it('overwrites the price and fetched_at for a ticker already cached', () => {
    upsertQuoteRow(db, { ticker: 'NVDA', priceUsd: '171.230000', fetchedAt: '2026-09-13T09:00:00.000Z' });
    upsertQuoteRow(db, { ticker: 'NVDA', priceUsd: '175.000000', fetchedAt: '2026-09-13T09:20:00.000Z' });
    expect(getQuoteRow(db, 'NVDA')).toEqual({
      ticker: 'NVDA', priceUsd: '175.000000', fetchedAt: '2026-09-13T09:20:00.000Z',
    });
  });
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `npx jest src/db/__tests__/repo.cache.test.ts`
Expected: FAIL — `getFxRateRow is not a function` (or a TypeScript "has no exported member" error from ts-jest).

- [ ] **Step 7: Append the cache repositories to `src/db/repo.ts`**

Add at the end of `src/db/repo.ts`:

```ts
// ========== CACHE REPOSITORIES (fx_rates, quotes) ==========
//
// Both tables are pure caches (spec §5): reconstructible, excluded from
// backups, and never a source of truth. They are the only tables in the
// schema whose rows may be discarded without consequence.

export interface FxRateRow {
  /** 'YYYY-MM-DD' — the date the rate applies to, not when it was fetched. */
  rateDate: string;
  /** 4 dp decimal string. */
  usdThb: string;
  /** ISO 8601 UTC. */
  fetchedAt: string;
}

interface FxRateDbRow {
  rate_date: string;
  usd_thb: string;
  fetched_at: string;
}

function toFxRateRow(row: FxRateDbRow): FxRateRow {
  return { rateDate: row.rate_date, usdThb: row.usd_thb, fetchedAt: row.fetched_at };
}

export function getFxRateRow(db: SqlDatabase, rateDate: string): FxRateRow | null {
  const [row] = db.getAllSync<FxRateDbRow>('SELECT * FROM fx_rates WHERE rate_date = ?;', [rateDate]);
  return row ? toFxRateRow(row) : null;
}

export function upsertFxRateRow(db: SqlDatabase, row: FxRateRow): void {
  db.runSync(
    `INSERT INTO fx_rates (rate_date, usd_thb, fetched_at) VALUES (?, ?, ?)
     ON CONFLICT(rate_date) DO UPDATE SET usd_thb = excluded.usd_thb, fetched_at = excluded.fetched_at;`,
    [row.rateDate, row.usdThb, row.fetchedAt],
  );
}

/**
 * The most recent date any rate was cached for. Used only as the dashboard's
 * last-resort fallback when today's rate cannot be fetched — the caller is
 * responsible for telling the user which date the figure came from.
 * Ordered by rate_date, not fetched_at: what matters is which rate is
 * closest to today, not which request happened to run last.
 */
export function latestFxRateRow(db: SqlDatabase): FxRateRow | null {
  const [row] = db.getAllSync<FxRateDbRow>('SELECT * FROM fx_rates ORDER BY rate_date DESC LIMIT 1;');
  return row ? toFxRateRow(row) : null;
}

export interface QuoteRow {
  /** Uppercase, trimmed. */
  ticker: string;
  /** 6 dp decimal string. */
  priceUsd: string;
  /** ISO 8601 UTC. */
  fetchedAt: string;
}

interface QuoteDbRow {
  ticker: string;
  price_usd: string;
  fetched_at: string;
}

function toQuoteRow(row: QuoteDbRow): QuoteRow {
  return { ticker: row.ticker, priceUsd: row.price_usd, fetchedAt: row.fetched_at };
}

/**
 * Same normalization as symbols (spec §7.4): `nvda`, `NVDA`, and `NVDA `
 * must never become three cache entries for one instrument.
 */
function normalizeTicker(ticker: string): string {
  return ticker.trim().toUpperCase();
}

export function getQuoteRow(db: SqlDatabase, ticker: string): QuoteRow | null {
  const [row] = db.getAllSync<QuoteDbRow>('SELECT * FROM quotes WHERE ticker = ?;', [normalizeTicker(ticker)]);
  return row ? toQuoteRow(row) : null;
}

export function upsertQuoteRow(db: SqlDatabase, row: QuoteRow): void {
  db.runSync(
    `INSERT INTO quotes (ticker, price_usd, fetched_at) VALUES (?, ?, ?)
     ON CONFLICT(ticker) DO UPDATE SET price_usd = excluded.price_usd, fetched_at = excluded.fetched_at;`,
    [normalizeTicker(row.ticker), row.priceUsd, row.fetchedAt],
  );
}
```

- [ ] **Step 8: Run the cache tests to verify they pass**

Run: `npx jest src/db/__tests__/repo.cache.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 9: Run the automated gate**

Run: `npm run typecheck && npm test`
Expected: `tsc --noEmit` exits silently with no output; Jest reports all suites passing (the plan-3 baseline was 24 suites / 207 tests; this task adds 2 suites / 14 tests).

- [ ] **Step 10: Commit**

```bash
git add src/services/http.ts src/services/__tests__/http.test.ts src/db/repo.ts src/db/__tests__/repo.cache.test.ts
git commit -m "feat: add timeout-bounded HTTP helper and fx/quote cache repositories"
```

**Manual verification (deferred to a human device pass):** none — this task adds no UI.

---

### Task 2: FX service — Frankfurter fetch, parse, and cache policy

**Files:**
- Modify: `src/ui/dateInput.ts` (widen `todayYmd` to accept an injected clock)
- Create: `src/services/fx.ts`
- Create: `src/services/__tests__/fx.test.ts`

**Interfaces:**
- Consumes: `httpGetText`, `HttpError`, `HttpFetch`, `platformFetch` from `src/services/http.ts`; `getFxRateRow`, `upsertFxRateRow`, `latestFxRateRow` from `src/db/repo.ts`; `DP`, `toStored`, `fromStored` from `src/core/money.ts`; `todayYmd` from `src/ui/dateInput.ts`.
- Produces:
  - `src/ui/dateInput.ts` exports `todayYmd(now?: Date): string` (existing zero-argument calls keep working).
  - `src/services/fx.ts` exports `const CACHE_TTL_MS: number`, `interface NetDeps { fetch: HttpFetch; now: () => Date }`, `const defaultNetDeps: NetDeps`, `class FxRateFetchError extends Error` (field `rateDate: string`), `function frankfurterUrl(rateDate: string): string`, `function parseFrankfurter(body: string, rateDate: string): Decimal`, `async function fetchUsdThbRate(rateDate: string, deps: NetDeps): Promise<Decimal>`, `interface FxRateResult { rate: Decimal; rateDate: string; fetchedAt: string; stale: boolean }`, `async function getFxRateForDate(db: SqlDatabase, rateDate: string, deps?: NetDeps): Promise<FxRateResult | null>`, `async function getTodayFxRate(db: SqlDatabase, deps?: NetDeps): Promise<FxRateResult | null>`.

- [ ] **Step 1: Widen `todayYmd` to accept an injected clock**

In `src/ui/dateInput.ts`, replace the `todayYmd` function with:

```ts
/**
 * Today in the device's local timezone as 'YYYY-MM-DD'. Local, not UTC:
 * a user in Bangkok filing a trade at 02:00 means today's Bangkok date,
 * not yesterday's UTC one.
 *
 * `now` is injectable so services can be tested against a fixed clock.
 */
export function todayYmd(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
```

- [ ] **Step 2: Write the failing test**

Create `src/services/__tests__/fx.test.ts`:

```ts
import Decimal from 'decimal.js';
import { openTestDatabase } from '../../db/__tests__/testDatabase';
import { runMigrations } from '../../db/schema';
import { getFxRateRow, upsertFxRateRow } from '../../db/repo';
import type { SqlDatabase } from '../../db/sqlDatabase';
import type { HttpFetch, HttpResponse } from '../http';
import {
  frankfurterUrl, parseFrankfurter, fetchUsdThbRate,
  getFxRateForDate, getTodayFxRate, FxRateFetchError, CACHE_TTL_MS,
  type NetDeps,
} from '../fx';

const BODY = '{"amount":1.0,"base":"USD","date":"2026-09-11","rates":{"THB":36.2137}}';

function ok(body: string): HttpResponse {
  return { ok: true, status: 200, text: async () => body };
}

/** A NetDeps whose clock is fixed and whose fetch returns `body`, recording every URL. */
function deps(body: string | Error, nowIso: string, urls: string[] = []): NetDeps {
  const fetchImpl: HttpFetch = async (url) => {
    urls.push(url);
    if (body instanceof Error) throw body;
    return ok(body);
  };
  return { fetch: fetchImpl, now: () => new Date(nowIso) };
}

let db: SqlDatabase;
beforeEach(() => {
  db = openTestDatabase();
  runMigrations(db);
});

describe('frankfurterUrl', () => {
  it('builds the keyless USD→THB URL for a date', () => {
    expect(frankfurterUrl('2026-09-11')).toBe('https://api.frankfurter.app/2026-09-11?from=USD&to=THB');
  });
});

describe('parseFrankfurter', () => {
  it('reads rates.THB as a Decimal without float arithmetic', () => {
    expect(parseFrankfurter(BODY, '2026-09-11').toString()).toBe('36.2137');
  });

  it('throws FxRateFetchError when THB is absent', () => {
    expect(() => parseFrankfurter('{"rates":{"EUR":0.9}}', '2026-09-11')).toThrow(FxRateFetchError);
  });

  it('throws FxRateFetchError on a non-positive rate', () => {
    expect(() => parseFrankfurter('{"rates":{"THB":0}}', '2026-09-11')).toThrow(FxRateFetchError);
  });

  it('throws FxRateFetchError on a non-JSON body', () => {
    expect(() => parseFrankfurter('<html>502</html>', '2026-09-11')).toThrow(FxRateFetchError);
  });
});

describe('fetchUsdThbRate', () => {
  it('fetches and parses', async () => {
    const urls: string[] = [];
    await expect(fetchUsdThbRate('2026-09-11', deps(BODY, '2026-09-13T09:00:00.000Z', urls)))
      .resolves.toEqual(new Decimal('36.2137'));
    expect(urls).toEqual(['https://api.frankfurter.app/2026-09-11?from=USD&to=THB']);
  });

  it('turns a transport failure into FxRateFetchError', async () => {
    await expect(fetchUsdThbRate('2026-09-11', deps(new TypeError('offline'), '2026-09-13T09:00:00.000Z')))
      .rejects.toThrow(FxRateFetchError);
  });
});

describe('getFxRateForDate', () => {
  it('fetches, caches, and reports the result as fresh', async () => {
    const urls: string[] = [];
    const result = await getFxRateForDate(db, '2026-09-11', deps(BODY, '2026-09-13T09:00:00.000Z', urls));
    expect(result).not.toBeNull();
    expect(result!.rate.toString()).toBe('36.2137');
    expect(result!.rateDate).toBe('2026-09-11');
    expect(result!.stale).toBe(false);
    expect(getFxRateRow(db, '2026-09-11')).toEqual({
      rateDate: '2026-09-11', usdThb: '36.2137', fetchedAt: '2026-09-13T09:00:00.000Z',
    });
    expect(urls).toHaveLength(1);
  });

  it('never refetches a past date, however old the cached row is', async () => {
    upsertFxRateRow(db, { rateDate: '2020-01-02', usdThb: '30.1000', fetchedAt: '2020-01-02T00:00:00.000Z' });
    const urls: string[] = [];
    const result = await getFxRateForDate(db, '2020-01-02', deps(BODY, '2026-09-13T09:00:00.000Z', urls));
    expect(result!.rate.toString()).toBe('30.1');
    expect(result!.stale).toBe(false);
    expect(urls).toEqual([]); // historical rates never change — spec §5
  });

  it('refetches today once the cached row passes the TTL', async () => {
    const nowIso = '2026-09-13T09:00:00.000Z';
    const stale = new Date(new Date(nowIso).getTime() - CACHE_TTL_MS - 1).toISOString();
    // Cache today under the LOCAL date the service will compute for `nowIso`.
    const today = new Date(nowIso);
    const localToday = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    upsertFxRateRow(db, { rateDate: localToday, usdThb: '35.0000', fetchedAt: stale });

    const urls: string[] = [];
    const result = await getFxRateForDate(db, localToday, deps(BODY, nowIso, urls));
    expect(result!.rate.toString()).toBe('36.2137');
    expect(urls).toHaveLength(1);
  });

  it('returns the cached row marked stale when the fetch fails', async () => {
    upsertFxRateRow(db, { rateDate: '2026-09-13', usdThb: '35.0000', fetchedAt: '2020-01-01T00:00:00.000Z' });
    const result = await getFxRateForDate(db, '2026-09-13', deps(new TypeError('offline'), '2026-09-13T09:00:00.000Z'));
    expect(result!.rate.toString()).toBe('35');
    expect(result!.stale).toBe(true);
  });

  it('returns null when the fetch fails and nothing is cached for that date', async () => {
    await expect(getFxRateForDate(db, '2026-09-11', deps(new TypeError('offline'), '2026-09-13T09:00:00.000Z')))
      .resolves.toBeNull();
  });
});

describe('getTodayFxRate', () => {
  it('falls back to the newest cached date and reports which date it used', async () => {
    upsertFxRateRow(db, { rateDate: '2026-09-10', usdThb: '36.0000', fetchedAt: '2026-09-10T00:00:00.000Z' });
    upsertFxRateRow(db, { rateDate: '2026-09-12', usdThb: '36.4000', fetchedAt: '2026-09-12T00:00:00.000Z' });

    const result = await getTodayFxRate(db, deps(new TypeError('offline'), '2026-09-13T09:00:00.000Z'));
    expect(result!.rate.toString()).toBe('36.4');
    expect(result!.rateDate).toBe('2026-09-12');
    expect(result!.stale).toBe(true);
  });

  it('returns null when offline with a completely empty cache', async () => {
    await expect(getTodayFxRate(db, deps(new TypeError('offline'), '2026-09-13T09:00:00.000Z')))
      .resolves.toBeNull();
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npx jest src/services/__tests__/fx.test.ts`
Expected: FAIL — `Cannot find module '../fx'`.

- [ ] **Step 4: Write `src/services/fx.ts`**

```ts
import Decimal from 'decimal.js';
import { DP, toStored, fromStored } from '../core/money';
import type { SqlDatabase } from '../db/sqlDatabase';
import { getFxRateRow, upsertFxRateRow, latestFxRateRow } from '../db/repo';
import { todayYmd } from '../ui/dateInput';
import { httpGetText, platformFetch, type HttpFetch } from './http';

/**
 * How long a cached value for *today* stays usable. Historical rates never
 * change and are cached permanently (spec §5); only today's is refetched.
 *
 * 15 minutes matches the quote TTL the spec fixes, and refreshes today's
 * rate shortly after Frankfurter's once-daily ECB publication — a rate
 * cached at 09:00 is still the previous day's figure filed under today's
 * key, so caching it permanently would freeze it.
 */
export const CACHE_TTL_MS = 15 * 60 * 1000;

/**
 * The injected outside world: the network and the clock. Tests pass stubs;
 * screens pass `defaultNetDeps`. No function in this file reads a global.
 */
export interface NetDeps {
  fetch: HttpFetch;
  now: () => Date;
}

export const defaultNetDeps: NetDeps = { fetch: platformFetch, now: () => new Date() };

export class FxRateFetchError extends Error {
  constructor(readonly rateDate: string, reason: string) {
    super(`Could not fetch USD/THB rate for ${rateDate}: ${reason}`);
    this.name = 'FxRateFetchError';
  }
}

/**
 * Frankfurter: keyless, open-source, ECB-backed. The same endpoint the
 * Django app uses (docs/reference/django/services.py:50), so rates agree
 * between the two apps for the same date.
 */
export function frankfurterUrl(rateDate: string): string {
  return `https://api.frankfurter.app/${rateDate}?from=USD&to=THB`;
}

export function parseFrankfurter(body: string, rateDate: string): Decimal {
  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    throw new FxRateFetchError(rateDate, 'response was not JSON');
  }

  const rates = (payload as { rates?: Record<string, unknown> } | null)?.rates;
  const raw = rates?.['THB'];
  if (typeof raw !== 'number' || !Number.isFinite(raw)) {
    throw new FxRateFetchError(rateDate, 'no THB rate in response');
  }

  // String(number), never arithmetic on the number — matches Django's
  // Decimal(str(...)) so ported values agree.
  const rate = new Decimal(String(raw));
  if (rate.lessThanOrEqualTo(0)) {
    throw new FxRateFetchError(rateDate, `non-positive rate ${rate.toString()}`);
  }
  return rate;
}

export async function fetchUsdThbRate(rateDate: string, deps: NetDeps): Promise<Decimal> {
  let body: string;
  try {
    body = await httpGetText(frankfurterUrl(rateDate), deps.fetch);
  } catch (error) {
    throw new FxRateFetchError(rateDate, error instanceof Error ? error.message : String(error));
  }
  return parseFrankfurter(body, rateDate);
}

export interface FxRateResult {
  rate: Decimal;
  /** The date this rate actually applies to — not always the date asked for. */
  rateDate: string;
  /** ISO 8601 UTC. */
  fetchedAt: string;
  /** True when this did not come from a successful fetch just now. */
  stale: boolean;
}

function isFresh(fetchedAt: string, now: Date): boolean {
  const age = now.getTime() - new Date(fetchedAt).getTime();
  return Number.isFinite(age) && age >= 0 && age < CACHE_TTL_MS;
}

/**
 * The rate for one specific date, from cache or the network.
 *
 * Returns null only when there is nothing to show at all: the fetch failed
 * and no row was ever cached for that date. Callers must handle null by
 * degrading, never by throwing — spec §5 treats network failure as a normal
 * state.
 */
export async function getFxRateForDate(
  db: SqlDatabase,
  rateDate: string,
  deps: NetDeps = defaultNetDeps,
): Promise<FxRateResult | null> {
  const now = deps.now();
  const cached = getFxRateRow(db, rateDate);
  const isPast = rateDate < todayYmd(now);

  if (cached && (isPast || isFresh(cached.fetchedAt, now))) {
    return { rate: fromStored(cached.usdThb), rateDate, fetchedAt: cached.fetchedAt, stale: false };
  }

  try {
    const rate = await fetchUsdThbRate(rateDate, deps);
    const fetchedAt = now.toISOString();
    upsertFxRateRow(db, { rateDate, usdThb: toStored(rate, DP.fxRate), fetchedAt });
    return { rate, rateDate, fetchedAt, stale: false };
  } catch {
    if (cached) {
      return { rate: fromStored(cached.usdThb), rateDate, fetchedAt: cached.fetchedAt, stale: true };
    }
    return null;
  }
}

/**
 * Today's rate, with one extra fallback the dashboard needs and the
 * transaction forms must not have: when today cannot be resolved at all,
 * fall back to the most recent rate ever cached. The result's `rateDate`
 * reports which day that was, so the UI can say so rather than silently
 * presenting an old rate as today's.
 */
export async function getTodayFxRate(
  db: SqlDatabase,
  deps: NetDeps = defaultNetDeps,
): Promise<FxRateResult | null> {
  const today = todayYmd(deps.now());
  const result = await getFxRateForDate(db, today, deps);
  if (result) return result;

  const latest = latestFxRateRow(db);
  if (!latest) return null;
  return {
    rate: fromStored(latest.usdThb),
    rateDate: latest.rateDate,
    fetchedAt: latest.fetchedAt,
    stale: true,
  };
}
```

- [ ] **Step 5: Run it to verify it passes**

Run: `npx jest src/services/__tests__/fx.test.ts`
Expected: PASS, 14 tests.

- [ ] **Step 6: Run the automated gate**

Run: `npm run typecheck && npm test`
Expected: `tsc --noEmit` silent; all Jest suites pass. `src/ui/__tests__/dateInput.test.ts` (if present from plan 3) must still pass — the `todayYmd()` signature change is backward compatible.

- [ ] **Step 7: Commit**

```bash
git add src/services/fx.ts src/services/__tests__/fx.test.ts src/ui/dateInput.ts
git commit -m "feat: add Frankfurter USD/THB service with permanent historical cache"
```

**Manual verification (deferred to a human device pass):** none — this task adds no UI.

---

### Task 3: Quote service — Yahoo and stooq parsers, provider chain, 15-minute cache

**Files:**
- Create: `src/services/quotes.ts`
- Create: `src/services/__tests__/quotes.test.ts`

**Interfaces:**
- Consumes: `httpGetText`, `HttpFetch` from `src/services/http.ts`; `NetDeps`, `defaultNetDeps`, `CACHE_TTL_MS` from `src/services/fx.ts`; `getQuoteRow`, `upsertQuoteRow` from `src/db/repo.ts`; `DP`, `toStored`, `fromStored` from `src/core/money.ts`.
- Produces: `src/services/quotes.ts` exports `class QuoteFetchError extends Error` (field `ticker: string`), `interface QuoteLookup { priceUsd: Decimal; name: string | null }`, `function yahooChartUrl(ticker: string): string`, `function parseYahooChart(body: string, ticker: string): QuoteLookup`, `function stooqCsvUrl(ticker: string): string`, `function parseStooqCsv(body: string, ticker: string): QuoteLookup`, `async function fetchQuote(ticker: string, deps?: NetDeps): Promise<QuoteLookup>`, `interface QuoteResult { priceUsd: Decimal; fetchedAt: string; stale: boolean }`, `async function getQuote(db: SqlDatabase, ticker: string, deps?: NetDeps): Promise<QuoteResult | null>`.

- [ ] **Step 1: Write the failing test**

Create `src/services/__tests__/quotes.test.ts`:

```ts
import { openTestDatabase } from '../../db/__tests__/testDatabase';
import { runMigrations } from '../../db/schema';
import { getQuoteRow, upsertQuoteRow } from '../../db/repo';
import type { SqlDatabase } from '../../db/sqlDatabase';
import type { HttpFetch, HttpResponse } from '../http';
import { CACHE_TTL_MS, type NetDeps } from '../fx';
import {
  yahooChartUrl, parseYahooChart, stooqCsvUrl, parseStooqCsv,
  fetchQuote, getQuote, QuoteFetchError,
} from '../quotes';

const YAHOO_OK = JSON.stringify({
  chart: {
    result: [{ meta: { currency: 'USD', symbol: 'NVDA', regularMarketPrice: 171.23, shortName: 'NVIDIA Corp', longName: 'NVIDIA Corporation' } }],
    error: null,
  },
});

const STOOQ_OK = 'Symbol,Date,Time,Open,High,Low,Close,Volume\nNVDA.US,2026-09-12,22:00:15,170.5,172.1,169.8,171.23,180000000\n';
const STOOQ_UNKNOWN = 'Symbol,Date,Time,Open,High,Low,Close,Volume\nZZZZ.US,N/D,N/D,N/D,N/D,N/D,N/D,N/D\n';

function ok(body: string): HttpResponse {
  return { ok: true, status: 200, text: async () => body };
}

/**
 * A NetDeps whose fetch answers per-host: `yahoo` and `stooq` are each
 * either a body string or an Error to throw.
 */
function deps(
  responses: { yahoo?: string | Error; stooq?: string | Error },
  nowIso = '2026-09-13T09:00:00.000Z',
  urls: string[] = [],
): NetDeps {
  const fetchImpl: HttpFetch = async (url) => {
    urls.push(url);
    const which = url.includes('yahoo') ? responses.yahoo : responses.stooq;
    if (which === undefined) throw new TypeError('no stub for this host');
    if (which instanceof Error) throw which;
    return ok(which);
  };
  return { fetch: fetchImpl, now: () => new Date(nowIso) };
}

let db: SqlDatabase;
beforeEach(() => {
  db = openTestDatabase();
  runMigrations(db);
});

describe('provider URLs', () => {
  it('builds the keyless Yahoo chart URL, normalizing the ticker', () => {
    expect(yahooChartUrl(' nvda ')).toBe('https://query1.finance.yahoo.com/v8/finance/chart/NVDA?interval=1d&range=1d');
  });

  it('builds the stooq CSV URL with the .us suffix, lowercased', () => {
    expect(stooqCsvUrl(' NVDA ')).toBe('https://stooq.com/q/l/?s=nvda.us&f=sd2t2ohlcv&h&e=csv');
  });
});

describe('parseYahooChart', () => {
  it('reads the price and prefers longName for the company name', () => {
    const quote = parseYahooChart(YAHOO_OK, 'NVDA');
    expect(quote.priceUsd.toString()).toBe('171.23');
    expect(quote.name).toBe('NVIDIA Corporation');
  });

  it('falls back to shortName when longName is missing', () => {
    const body = JSON.stringify({ chart: { result: [{ meta: { currency: 'USD', regularMarketPrice: 10, shortName: 'Acme' } }] } });
    expect(parseYahooChart(body, 'ACME').name).toBe('Acme');
  });

  it('returns a null name when neither name field is present', () => {
    const body = JSON.stringify({ chart: { result: [{ meta: { currency: 'USD', regularMarketPrice: 10 } }] } });
    expect(parseYahooChart(body, 'ACME').name).toBeNull();
  });

  it('rejects a non-USD quote — the app is USD/THB only', () => {
    const body = JSON.stringify({ chart: { result: [{ meta: { currency: 'EUR', regularMarketPrice: 10 } }] } });
    expect(() => parseYahooChart(body, 'ACME')).toThrow(/EUR/);
  });

  it('rejects an unknown ticker (empty result array)', () => {
    expect(() => parseYahooChart('{"chart":{"result":[],"error":null}}', 'ZZZZ')).toThrow(QuoteFetchError);
  });

  it('rejects a non-positive price', () => {
    const body = JSON.stringify({ chart: { result: [{ meta: { currency: 'USD', regularMarketPrice: 0 } }] } });
    expect(() => parseYahooChart(body, 'ACME')).toThrow(QuoteFetchError);
  });

  it('rejects a non-JSON body (an HTML error page)', () => {
    expect(() => parseYahooChart('<html>429</html>', 'NVDA')).toThrow(QuoteFetchError);
  });
});

describe('parseStooqCsv', () => {
  it('reads Close by header name, not by column position', () => {
    const quote = parseStooqCsv(STOOQ_OK, 'NVDA');
    expect(quote.priceUsd.toString()).toBe('171.23');
    expect(quote.name).toBeNull();
  });

  it('handles CRLF line endings', () => {
    expect(parseStooqCsv(STOOQ_OK.replace(/\n/g, '\r\n'), 'NVDA').priceUsd.toString()).toBe('171.23');
  });

  it('rejects an unknown ticker (N/D close)', () => {
    expect(() => parseStooqCsv(STOOQ_UNKNOWN, 'ZZZZ')).toThrow(QuoteFetchError);
  });

  it('rejects a body with no data row', () => {
    expect(() => parseStooqCsv('Symbol,Date,Time,Open,High,Low,Close,Volume\n', 'NVDA')).toThrow(QuoteFetchError);
  });

  it('rejects a body with no Close column', () => {
    expect(() => parseStooqCsv('Symbol,Date\nNVDA.US,2026-09-12\n', 'NVDA')).toThrow(QuoteFetchError);
  });
});

describe('fetchQuote provider chain', () => {
  it('uses Yahoo and never calls stooq when Yahoo succeeds', async () => {
    const urls: string[] = [];
    const quote = await fetchQuote('NVDA', deps({ yahoo: YAHOO_OK, stooq: STOOQ_OK }, '2026-09-13T09:00:00.000Z', urls));
    expect(quote.priceUsd.toString()).toBe('171.23');
    expect(urls).toHaveLength(1);
    expect(urls[0]).toContain('yahoo');
  });

  it('falls back to stooq when Yahoo is unreachable', async () => {
    const urls: string[] = [];
    const quote = await fetchQuote('NVDA', deps({ yahoo: new TypeError('offline'), stooq: STOOQ_OK }, '2026-09-13T09:00:00.000Z', urls));
    expect(quote.priceUsd.toString()).toBe('171.23');
    expect(quote.name).toBeNull();
    expect(urls).toHaveLength(2);
    expect(urls[1]).toContain('stooq');
  });

  it('falls back to stooq when Yahoo returns an unparseable body', async () => {
    const quote = await fetchQuote('NVDA', deps({ yahoo: '<html>429</html>', stooq: STOOQ_OK }));
    expect(quote.priceUsd.toString()).toBe('171.23');
  });

  it('throws QuoteFetchError naming both providers when both fail', async () => {
    const promise = fetchQuote('ZZZZ', deps({ yahoo: new TypeError('offline'), stooq: STOOQ_UNKNOWN }));
    await expect(promise).rejects.toThrow(QuoteFetchError);
    await expect(fetchQuote('ZZZZ', deps({ yahoo: new TypeError('offline'), stooq: STOOQ_UNKNOWN })))
      .rejects.toThrow(/yahoo.*stooq/is);
  });
});

describe('getQuote cache policy', () => {
  it('fetches, caches at 6 dp, and reports fresh', async () => {
    const result = await getQuote(db, 'NVDA', deps({ yahoo: YAHOO_OK }));
    expect(result!.priceUsd.toString()).toBe('171.23');
    expect(result!.stale).toBe(false);
    expect(getQuoteRow(db, 'NVDA')).toEqual({
      ticker: 'NVDA', priceUsd: '171.230000', fetchedAt: '2026-09-13T09:00:00.000Z',
    });
  });

  it('serves a cached quote inside the TTL without any request', async () => {
    const nowIso = '2026-09-13T09:00:00.000Z';
    const fresh = new Date(new Date(nowIso).getTime() - 60_000).toISOString();
    upsertQuoteRow(db, { ticker: 'NVDA', priceUsd: '100.000000', fetchedAt: fresh });

    const urls: string[] = [];
    const result = await getQuote(db, 'NVDA', deps({ yahoo: YAHOO_OK }, nowIso, urls));
    expect(result!.priceUsd.toString()).toBe('100');
    expect(result!.stale).toBe(false);
    expect(urls).toEqual([]);
  });

  it('refetches once the cached quote passes the TTL', async () => {
    const nowIso = '2026-09-13T09:00:00.000Z';
    const old = new Date(new Date(nowIso).getTime() - CACHE_TTL_MS - 1).toISOString();
    upsertQuoteRow(db, { ticker: 'NVDA', priceUsd: '100.000000', fetchedAt: old });

    const result = await getQuote(db, 'NVDA', deps({ yahoo: YAHOO_OK }, nowIso));
    expect(result!.priceUsd.toString()).toBe('171.23');
  });

  it('returns the stale cached quote when both providers fail', async () => {
    upsertQuoteRow(db, { ticker: 'NVDA', priceUsd: '100.000000', fetchedAt: '2020-01-01T00:00:00.000Z' });
    const result = await getQuote(db, 'NVDA', deps({ yahoo: new TypeError('offline'), stooq: new TypeError('offline') }));
    expect(result!.priceUsd.toString()).toBe('100');
    expect(result!.stale).toBe(true);
    expect(result!.fetchedAt).toBe('2020-01-01T00:00:00.000Z');
  });

  it('returns null when both providers fail and nothing is cached', async () => {
    await expect(getQuote(db, 'ZZZZ', deps({ yahoo: new TypeError('offline'), stooq: new TypeError('offline') })))
      .resolves.toBeNull();
  });

  it('treats nvda and NVDA as one cache entry', async () => {
    await getQuote(db, 'nvda', deps({ yahoo: YAHOO_OK }));
    expect(getQuoteRow(db, 'NVDA')).not.toBeNull();
    expect(db.getAllSync('SELECT * FROM quotes;')).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx jest src/services/__tests__/quotes.test.ts`
Expected: FAIL — `Cannot find module '../quotes'`.

- [ ] **Step 3: Write `src/services/quotes.ts`**

```ts
import Decimal from 'decimal.js';
import { DP, toStored, fromStored } from '../core/money';
import type { SqlDatabase } from '../db/sqlDatabase';
import { getQuoteRow, upsertQuoteRow } from '../db/repo';
import { httpGetText } from './http';
import { CACHE_TTL_MS, defaultNetDeps, type NetDeps } from './fx';

/**
 * Two providers, tried in order, because spec §5 says both "can break
 * without notice" and neither needs an API key (a key shipped in an APK is
 * public, so keyed tiers are unusable without a proxy, and a proxy
 * contradicts standalone operation).
 *
 * Yahoo goes first: it also returns the company name, which the advisory
 * symbol-name backfill of spec §7.4 needs. Stooq is the fallback and
 * returns a price only.
 */

export class QuoteFetchError extends Error {
  constructor(readonly ticker: string, reason: string) {
    super(`Could not fetch quote for ${ticker}: ${reason}`);
    this.name = 'QuoteFetchError';
  }
}

export interface QuoteLookup {
  priceUsd: Decimal;
  /** Company name when the provider supplies one; stooq never does. */
  name: string | null;
}

function normalizeTicker(ticker: string): string {
  return ticker.trim().toUpperCase();
}

// ---------- Yahoo ----------

export function yahooChartUrl(ticker: string): string {
  return `https://query1.finance.yahoo.com/v8/finance/chart/${normalizeTicker(ticker)}?interval=1d&range=1d`;
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

export function parseYahooChart(body: string, ticker: string): QuoteLookup {
  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    throw new QuoteFetchError(ticker, 'yahoo response was not JSON');
  }

  const meta = (payload as { chart?: { result?: Array<{ meta?: Record<string, unknown> }> } } | null)
    ?.chart?.result?.[0]?.meta;
  if (!meta) {
    throw new QuoteFetchError(ticker, 'yahoo returned no chart result');
  }

  // The whole app is USD-priced with a separate USD→THB rate. A quote in
  // another currency would be multiplied by the FX rate anyway and produce a
  // silently wrong portfolio value, so refuse it outright.
  if (meta['currency'] !== 'USD') {
    throw new QuoteFetchError(ticker, `yahoo quote currency is ${String(meta['currency'])}, expected USD`);
  }

  const raw = meta['regularMarketPrice'];
  if (typeof raw !== 'number' || !Number.isFinite(raw)) {
    throw new QuoteFetchError(ticker, 'yahoo returned no regularMarketPrice');
  }
  const priceUsd = new Decimal(String(raw));
  if (priceUsd.lessThanOrEqualTo(0)) {
    throw new QuoteFetchError(ticker, `yahoo returned non-positive price ${priceUsd.toString()}`);
  }

  return { priceUsd, name: nonEmptyString(meta['longName']) ?? nonEmptyString(meta['shortName']) };
}

// ---------- stooq ----------

export function stooqCsvUrl(ticker: string): string {
  return `https://stooq.com/q/l/?s=${normalizeTicker(ticker).toLowerCase()}.us&f=sd2t2ohlcv&h&e=csv`;
}

const PLAIN_NUMBER = /^\d+(\.\d+)?$/;

export function parseStooqCsv(body: string, ticker: string): QuoteLookup {
  const lines = body.split(/\r?\n/).filter((line) => line.trim() !== '');
  const header = lines[0];
  const data = lines[1];
  if (!header || !data) {
    throw new QuoteFetchError(ticker, 'stooq returned no data row');
  }

  // By header name, not position: stooq's column set depends on the `f=`
  // parameter, and a positional read would silently return the wrong field
  // if that string is ever edited.
  const closeIndex = header.split(',').findIndex((name) => name.trim().toLowerCase() === 'close');
  if (closeIndex < 0) {
    throw new QuoteFetchError(ticker, 'stooq response has no Close column');
  }

  const value = data.split(',')[closeIndex]?.trim();
  // stooq answers an unknown ticker with 'N/D' in every field rather than an error status.
  if (!value || !PLAIN_NUMBER.test(value)) {
    throw new QuoteFetchError(ticker, `stooq returned no usable close price (${String(value)})`);
  }

  const priceUsd = new Decimal(value);
  if (priceUsd.lessThanOrEqualTo(0)) {
    throw new QuoteFetchError(ticker, `stooq returned non-positive price ${priceUsd.toString()}`);
  }
  return { priceUsd, name: null };
}

// ---------- chain ----------

function reason(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function fetchQuote(ticker: string, deps: NetDeps = defaultNetDeps): Promise<QuoteLookup> {
  const normalized = normalizeTicker(ticker);

  let yahooReason: string;
  try {
    return parseYahooChart(await httpGetText(yahooChartUrl(normalized), deps.fetch), normalized);
  } catch (error) {
    yahooReason = reason(error);
  }

  let stooqReason: string;
  try {
    return parseStooqCsv(await httpGetText(stooqCsvUrl(normalized), deps.fetch), normalized);
  } catch (error) {
    stooqReason = reason(error);
  }

  throw new QuoteFetchError(normalized, `yahoo: ${yahooReason}; stooq: ${stooqReason}`);
}

// ---------- cache ----------

export interface QuoteResult {
  priceUsd: Decimal;
  /** ISO 8601 UTC — when this price was actually retrieved. */
  fetchedAt: string;
  /** True when this did not come from a successful fetch just now. */
  stale: boolean;
}

function isFresh(fetchedAt: string, now: Date): boolean {
  const age = now.getTime() - new Date(fetchedAt).getTime();
  return Number.isFinite(age) && age >= 0 && age < CACHE_TTL_MS;
}

/**
 * Spec §5: quotes are cached for 15 minutes so opening the dashboard does
 * not fire a request every time, and an offline device shows the cached
 * value with its age rather than a blank.
 *
 * Returns null only when there is nothing at all to show for this ticker.
 * A null must degrade that one symbol — never the whole dashboard.
 */
export async function getQuote(
  db: SqlDatabase,
  ticker: string,
  deps: NetDeps = defaultNetDeps,
): Promise<QuoteResult | null> {
  const normalized = normalizeTicker(ticker);
  const now = deps.now();
  const cached = getQuoteRow(db, normalized);

  if (cached && isFresh(cached.fetchedAt, now)) {
    return { priceUsd: fromStored(cached.priceUsd), fetchedAt: cached.fetchedAt, stale: false };
  }

  try {
    const quote = await fetchQuote(normalized, deps);
    const fetchedAt = now.toISOString();
    upsertQuoteRow(db, { ticker: normalized, priceUsd: toStored(quote.priceUsd, DP.price), fetchedAt });
    return { priceUsd: quote.priceUsd, fetchedAt, stale: false };
  } catch {
    if (cached) {
      return { priceUsd: fromStored(cached.priceUsd), fetchedAt: cached.fetchedAt, stale: true };
    }
    return null;
  }
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx jest src/services/__tests__/quotes.test.ts`
Expected: PASS, 22 tests.

- [ ] **Step 5: Run the automated gate**

Run: `npm run typecheck && npm test`
Expected: `tsc --noEmit` silent; all Jest suites pass.

- [ ] **Step 6: Commit**

```bash
git add src/services/quotes.ts src/services/__tests__/quotes.test.ts
git commit -m "feat: add keyless quote service with yahoo/stooq fallback and 15-minute cache"
```

**Manual verification (deferred to a human device pass):** none — this task adds no UI.

---

### Task 4: Remaining-cost derivation and the portfolio summary

**Files:**
- Modify: `src/core/derive.ts` (append one function — do **not** create a new file under `src/core/`)
- Modify: `src/core/__tests__/derive.test.ts` (append a describe block)
- Create: `src/services/portfolio.ts`
- Create: `src/services/__tests__/portfolio.test.ts`

**Interfaces:**
- Consumes: `Lot`, `Sale`, `Allocation`, `SymbolRow` from `src/core/types.ts`; `lotQtyRemaining`, `saleCapitalGainThb` from `src/core/derive.ts`; `DP`, `fromStored` from `src/core/money.ts`; `listLots`, `listSales`, `listAllocations` from `src/db/repo.ts`; `toDomainLot`, `toDomainSale` from `src/services/ledger.ts`.
- Produces:
  - `src/core/derive.ts` exports `lotRemainingCostThb(lot: Lot, allocations: readonly Allocation[]): Decimal`.
  - `src/services/portfolio.ts` exports `interface LivePrice { priceUsd: Decimal; fetchedAt: string; stale: boolean }`, `interface PortfolioRow`, `interface PortfolioSummary`, `function listPortfolioSymbols(db: SqlDatabase): SymbolRow[]`, `function buildPortfolioSummary(db: SqlDatabase, prices: ReadonlyMap<number, LivePrice>, fxRate: Decimal | null): PortfolioSummary`.

- [ ] **Step 1: Write the failing test for `lotRemainingCostThb`**

Append to `src/core/__tests__/derive.test.ts`:

```ts
describe('lotRemainingCostThb', () => {
  it('is the full lot cost when nothing has been sold', () => {
    const lot: Lot = {
      id: 1, symbolId: 1, buyDate: '2026-01-01',
      priceUsd: new Decimal('100'), qty: new Decimal('10'), fxRateUsdThb: new Decimal('36'),
      createdAt: '2026-01-01T00:00:00.000Z', evidenceFile: null,
    };
    expect(lotRemainingCostThb(lot, []).toString()).toBe('36000');
    expect(lotRemainingCostThb(lot, []).toString()).toBe(lotCostThb(lot).toString());
  });

  it('costs only the unsold shares once part of the lot is allocated', () => {
    const lot: Lot = {
      id: 1, symbolId: 1, buyDate: '2026-01-01',
      priceUsd: new Decimal('100'), qty: new Decimal('10'), fxRateUsdThb: new Decimal('36'),
      createdAt: '2026-01-01T00:00:00.000Z', evidenceFile: null,
    };
    const allocations: Allocation[] = [
      { saleId: 1, lotId: 1, qtyAllocated: new Decimal('4'), costBasisThb: new Decimal('14400') },
    ];
    expect(lotRemainingCostThb(lot, allocations).toString()).toBe('21600');
  });

  it('is zero for a fully-sold lot, while lotCostThb still reports what it cost', () => {
    const lot: Lot = {
      id: 1, symbolId: 1, buyDate: '2026-01-01',
      priceUsd: new Decimal('100'), qty: new Decimal('10'), fxRateUsdThb: new Decimal('36'),
      createdAt: '2026-01-01T00:00:00.000Z', evidenceFile: null,
    };
    const allocations: Allocation[] = [
      { saleId: 1, lotId: 1, qtyAllocated: new Decimal('10'), costBasisThb: new Decimal('36000') },
    ];
    expect(lotRemainingCostThb(lot, allocations).toString()).toBe('0');
    expect(lotCostThb(lot).toString()).toBe('36000');
  });

  it('rounds to money precision with ROUND_HALF_EVEN', () => {
    const lot: Lot = {
      id: 1, symbolId: 1, buyDate: '2026-01-01',
      priceUsd: new Decimal('1.234567'), qty: new Decimal('3'), fxRateUsdThb: new Decimal('36.2137'),
      createdAt: '2026-01-01T00:00:00.000Z', evidenceFile: null,
    };
    // 1.234567 * 3 * 36.2137 = 134.11815... → 4 dp half-even
    expect(lotRemainingCostThb(lot, []).decimalPlaces()).toBeLessThanOrEqual(4);
    expect(lotRemainingCostThb(lot, []).toFixed(4)).toBe(
      new Decimal('1.234567').times(3).times('36.2137').toFixed(4, Decimal.ROUND_HALF_EVEN),
    );
  });
});
```

Make sure the file's existing import line includes `lotRemainingCostThb` and `lotCostThb`, and that `Allocation` and `Lot` are imported as types. If `src/core/__tests__/derive.test.ts` already imports from `'../derive'` and `'../types'`, add the new names to those import lists rather than adding new import statements.

- [ ] **Step 2: Run it to verify it fails**

Run: `npx jest src/core/__tests__/derive.test.ts`
Expected: FAIL — `'"../derive"' has no exported member named 'lotRemainingCostThb'`.

- [ ] **Step 3: Append `lotRemainingCostThb` to `src/core/derive.ts`**

```ts
/**
 * What the *unsold* portion of this lot cost, in THB.
 *
 * Distinct from lotCostThb, which is what the whole lot cost when it was
 * bought. Both are needed and neither replaces the other: the lot detail
 * screen shows the purchase cost; the dashboard shows the cost of what is
 * still held, so a fully-sold lot contributes nothing to portfolio cost
 * basis. This is the figure the Django original computes inline as
 * `remaining * price_usd * fx_rate` (docs/reference/django/services.py:167).
 */
export function lotRemainingCostThb(lot: Lot, allocations: readonly Allocation[]): Decimal {
  return lotQtyRemaining(lot, allocations)
    .times(lot.priceUsd)
    .times(lot.fxRateUsdThb)
    .toDecimalPlaces(DP.money, Decimal.ROUND_HALF_EVEN);
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx jest src/core/__tests__/derive.test.ts src/core/__tests__/isolation.test.ts`
Expected: PASS. The isolation test must still pass untouched — no new file was added to `src/core/`.

- [ ] **Step 5: Write the failing test for the portfolio summary**

Create `src/services/__tests__/portfolio.test.ts`:

```ts
import Decimal from 'decimal.js';
import { openTestDatabase } from '../../db/__tests__/testDatabase';
import { runMigrations } from '../../db/schema';
import { createSymbol } from '../../db/repo';
import type { SqlDatabase } from '../../db/sqlDatabase';
import { addLot, addSale } from '../ledger';
import { listPortfolioSymbols, buildPortfolioSummary, type LivePrice } from '../portfolio';

let db: SqlDatabase;
let nvdaId: number;
let aaplId: number;

function price(value: string, stale = false): LivePrice {
  return { priceUsd: new Decimal(value), fetchedAt: '2026-09-13T09:00:00.000Z', stale };
}

beforeEach(() => {
  db = openTestDatabase();
  runMigrations(db);
  nvdaId = createSymbol(db, 'NVDA').id;
  aaplId = createSymbol(db, 'AAPL').id;
});

describe('listPortfolioSymbols', () => {
  it('returns nothing when no transactions exist', () => {
    expect(listPortfolioSymbols(db)).toEqual([]);
  });

  it('omits a symbol with neither lots nor sales, and orders by ticker', () => {
    addLot(db, { symbolId: nvdaId, buyDate: '2026-01-01', priceUsd: new Decimal('100'), qty: new Decimal('10'), fxRateUsdThb: new Decimal('36'), evidenceFile: null });
    addLot(db, { symbolId: aaplId, buyDate: '2026-01-01', priceUsd: new Decimal('200'), qty: new Decimal('5'), fxRateUsdThb: new Decimal('36'), evidenceFile: null });
    createSymbol(db, 'ZZZZ');
    expect(listPortfolioSymbols(db).map((s) => s.ticker)).toEqual(['AAPL', 'NVDA']);
  });

  it('includes a symbol that has been fully sold', () => {
    addLot(db, { symbolId: nvdaId, buyDate: '2026-01-01', priceUsd: new Decimal('100'), qty: new Decimal('10'), fxRateUsdThb: new Decimal('36'), evidenceFile: null });
    addSale(db, { symbolId: nvdaId, sellDate: '2026-02-01', qtySold: new Decimal('10'), salePriceUsd: new Decimal('120'), feeUsd: new Decimal('0'), fxRateUsdThb: new Decimal('36'), evidenceFile: null });
    expect(listPortfolioSymbols(db).map((s) => s.ticker)).toEqual(['NVDA']);
  });
});

describe('buildPortfolioSummary', () => {
  it('reports zeros and an empty row list for an empty ledger', () => {
    const summary = buildPortfolioSummary(db, new Map(), new Decimal('36'));
    expect(summary.rows).toEqual([]);
    expect(summary.totalCostThb.toString()).toBe('0');
    expect(summary.totalRealizedGainThb.toString()).toBe('0');
    expect(summary.hasFullValue).toBe(true);
    expect(summary.totalValueThb!.toString()).toBe('0');
  });

  it('computes remaining cost, live value, and unrealized gain for one open lot', () => {
    addLot(db, { symbolId: nvdaId, buyDate: '2026-01-01', priceUsd: new Decimal('100'), qty: new Decimal('10'), fxRateUsdThb: new Decimal('36'), evidenceFile: null });

    const summary = buildPortfolioSummary(db, new Map([[nvdaId, price('120')]]), new Decimal('36'));
    const row = summary.rows[0]!;
    expect(row.symbol.ticker).toBe('NVDA');
    expect(row.remainingQty.toString()).toBe('10');
    expect(row.costThb.toString()).toBe('36000');          // 10 * 100 * 36
    expect(row.currentValueThb!.toString()).toBe('43200');  // 10 * 120 * 36
    expect(row.unrealizedGainThb!.toString()).toBe('7200');
    expect(row.unrealizedGainPct!.toFixed(2)).toBe('20.00');
    expect(row.realizedGainThb.toString()).toBe('0');
    expect(summary.hasFullValue).toBe(true);
  });

  it('counts only the unsold shares in cost and value after a partial sale', () => {
    addLot(db, { symbolId: nvdaId, buyDate: '2026-01-01', priceUsd: new Decimal('100'), qty: new Decimal('10'), fxRateUsdThb: new Decimal('36'), evidenceFile: null });
    addSale(db, { symbolId: nvdaId, sellDate: '2026-02-01', qtySold: new Decimal('4'), salePriceUsd: new Decimal('150'), feeUsd: new Decimal('0'), fxRateUsdThb: new Decimal('36'), evidenceFile: null });

    const summary = buildPortfolioSummary(db, new Map([[nvdaId, price('120')]]), new Decimal('36'));
    const row = summary.rows[0]!;
    expect(row.remainingQty.toString()).toBe('6');
    expect(row.costThb.toString()).toBe('21600');            // 6 * 100 * 36
    expect(row.currentValueThb!.toString()).toBe('25920');   // 6 * 120 * 36
    expect(row.unrealizedGainThb!.toString()).toBe('4320');
    // proceeds 4*150*36 = 21600; basis 4*100*36 = 14400
    expect(row.realizedGainThb.toString()).toBe('7200');
  });

  it('reports a fully-sold symbol as zero cost, zero value, and no unrealized gain', () => {
    addLot(db, { symbolId: nvdaId, buyDate: '2026-01-01', priceUsd: new Decimal('100'), qty: new Decimal('10'), fxRateUsdThb: new Decimal('36'), evidenceFile: null });
    addSale(db, { symbolId: nvdaId, sellDate: '2026-02-01', qtySold: new Decimal('10'), salePriceUsd: new Decimal('120'), feeUsd: new Decimal('0'), fxRateUsdThb: new Decimal('36'), evidenceFile: null });

    const summary = buildPortfolioSummary(db, new Map(), new Decimal('36'));
    const row = summary.rows[0]!;
    expect(row.remainingQty.toString()).toBe('0');
    expect(row.costThb.toString()).toBe('0');
    expect(row.currentValueThb!.toString()).toBe('0');
    expect(row.unrealizedGainThb!.toString()).toBe('0');
    expect(row.unrealizedGainPct).toBeNull();     // no cost basis to divide by
    expect(row.realizedGainThb.toString()).toBe('7200');
    expect(summary.hasFullValue).toBe(true);      // nothing needed a price
  });

  it('degrades one symbol only when its price is missing', () => {
    addLot(db, { symbolId: nvdaId, buyDate: '2026-01-01', priceUsd: new Decimal('100'), qty: new Decimal('10'), fxRateUsdThb: new Decimal('36'), evidenceFile: null });
    addLot(db, { symbolId: aaplId, buyDate: '2026-01-01', priceUsd: new Decimal('200'), qty: new Decimal('5'), fxRateUsdThb: new Decimal('36'), evidenceFile: null });

    const summary = buildPortfolioSummary(db, new Map([[nvdaId, price('120')]]), new Decimal('36'));
    const aapl = summary.rows.find((r) => r.symbol.ticker === 'AAPL')!;
    const nvda = summary.rows.find((r) => r.symbol.ticker === 'NVDA')!;

    expect(aapl.currentValueThb).toBeNull();
    expect(aapl.unrealizedGainThb).toBeNull();
    expect(aapl.costThb.toString()).toBe('36000');   // cost basis still shown
    expect(nvda.currentValueThb!.toString()).toBe('43200');

    expect(summary.totalCostThb.toString()).toBe('72000');
    expect(summary.hasFullValue).toBe(false);
    expect(summary.totalValueThb).toBeNull();
    expect(summary.totalUnrealizedGainThb).toBeNull();
    expect(summary.totalRealizedGainThb.toString()).toBe('0'); // realized totals never degrade
  });

  it('shows cost basis only, with no live figures, when the FX rate is unavailable', () => {
    addLot(db, { symbolId: nvdaId, buyDate: '2026-01-01', priceUsd: new Decimal('100'), qty: new Decimal('10'), fxRateUsdThb: new Decimal('36'), evidenceFile: null });

    const summary = buildPortfolioSummary(db, new Map([[nvdaId, price('120')]]), null);
    expect(summary.rows[0]!.costThb.toString()).toBe('36000');
    expect(summary.rows[0]!.currentValueThb).toBeNull();
    expect(summary.hasFullValue).toBe(false);
    expect(summary.totalValueThb).toBeNull();
  });

  it('carries each row's price staleness and fetch time through for display', () => {
    addLot(db, { symbolId: nvdaId, buyDate: '2026-01-01', priceUsd: new Decimal('100'), qty: new Decimal('10'), fxRateUsdThb: new Decimal('36'), evidenceFile: null });

    const summary = buildPortfolioSummary(db, new Map([[nvdaId, price('120', true)]]), new Decimal('36'));
    expect(summary.rows[0]!.priceStale).toBe(true);
    expect(summary.rows[0]!.priceFetchedAt).toBe('2026-09-13T09:00:00.000Z');
    expect(summary.rows[0]!.currentValueThb!.toString()).toBe('43200'); // a stale price is still a price
  });

  it('sums totals across symbols in Decimal, not float', () => {
    addLot(db, { symbolId: nvdaId, buyDate: '2026-01-01', priceUsd: new Decimal('0.1'), qty: new Decimal('1'), fxRateUsdThb: new Decimal('1'), evidenceFile: null });
    addLot(db, { symbolId: aaplId, buyDate: '2026-01-01', priceUsd: new Decimal('0.2'), qty: new Decimal('1'), fxRateUsdThb: new Decimal('1'), evidenceFile: null });

    const summary = buildPortfolioSummary(db, new Map(), null);
    expect(summary.totalCostThb.toString()).toBe('0.3'); // 0.1 + 0.2, exactly
  });
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `npx jest src/services/__tests__/portfolio.test.ts`
Expected: FAIL — `Cannot find module '../portfolio'`.

- [ ] **Step 7: Write `src/services/portfolio.ts`**

```ts
import Decimal from 'decimal.js';
import { lotQtyRemaining, lotRemainingCostThb, saleCapitalGainThb } from '../core/derive';
import { fromStored, DP } from '../core/money';
import type { Allocation, SymbolRow } from '../core/types';
import type { SqlDatabase } from '../db/sqlDatabase';
import { listAllocations, listLots, listSales } from '../db/repo';
import { toDomainLot, toDomainSale } from './ledger';

/**
 * The dashboard summary (spec §7.1), ported from the Django original's
 * build_dashboard_summary (docs/reference/django/services.py:219).
 *
 * This module performs NO I/O beyond reading the ledger tables: live prices
 * arrive already resolved, in a map. That is deliberate — it keeps every
 * money calculation on the dashboard testable under plain Node with no
 * network and no stubbed fetch, and it means a slow or failed lookup can
 * never change an arithmetic result, only leave a field null.
 */

export interface LivePrice {
  priceUsd: Decimal;
  /** ISO 8601 UTC. */
  fetchedAt: string;
  stale: boolean;
}

export interface PortfolioRow {
  symbol: SymbolRow;
  remainingQty: Decimal;
  /** Cost of the shares still held — not what the lots originally cost. */
  costThb: Decimal;
  realizedGainThb: Decimal;
  /** null when no price was available for this symbol, or no FX rate at all. */
  currentValueThb: Decimal | null;
  unrealizedGainThb: Decimal | null;
  /** null when there is no cost basis to divide by. */
  unrealizedGainPct: Decimal | null;
  priceStale: boolean;
  priceFetchedAt: string | null;
}

export interface PortfolioSummary {
  rows: PortfolioRow[];
  totalCostThb: Decimal;
  totalRealizedGainThb: Decimal;
  /** null unless every symbol that needed a price got one. */
  totalValueThb: Decimal | null;
  totalUnrealizedGainThb: Decimal | null;
  hasFullValue: boolean;
}

/**
 * Every symbol with at least one lot or sale, ordered by ticker.
 *
 * EXISTS, never SUM or JOIN over a money column: SQLite coerces TEXT to
 * float for aggregation, which is precisely what storing money as TEXT
 * exists to prevent. Row presence is the only thing SQL is asked for here.
 */
export function listPortfolioSymbols(db: SqlDatabase): SymbolRow[] {
  return db.getAllSync<SymbolRow>(
    `SELECT s.id, s.ticker, s.name FROM symbols s
     WHERE EXISTS (SELECT 1 FROM lots  l WHERE l.symbol_id  = s.id)
        OR EXISTS (SELECT 1 FROM sales sa WHERE sa.symbol_id = s.id)
     ORDER BY s.ticker;`,
  );
}

export function buildPortfolioSummary(
  db: SqlDatabase,
  prices: ReadonlyMap<number, LivePrice>,
  fxRate: Decimal | null,
): PortfolioSummary {
  const allocations: Allocation[] = listAllocations(db).map((a) => ({
    saleId: a.saleId,
    lotId: a.lotId,
    qtyAllocated: fromStored(a.qtyAllocated),
    costBasisThb: fromStored(a.costBasisThb),
  }));

  const rows: PortfolioRow[] = [];
  let totalCostThb = new Decimal(0);
  let totalValueThb = new Decimal(0);
  let totalUnrealizedGainThb = new Decimal(0);
  let totalRealizedGainThb = new Decimal(0);
  let hasFullValue = fxRate !== null;

  for (const symbol of listPortfolioSymbols(db)) {
    const lots = listLots(db, symbol.id).map(toDomainLot);
    const sales = listSales(db, symbol.id).map(toDomainSale);

    const remainingQty = lots.reduce((total, lot) => total.plus(lotQtyRemaining(lot, allocations)), new Decimal(0));
    const costThb = lots.reduce((total, lot) => total.plus(lotRemainingCostThb(lot, allocations)), new Decimal(0));
    const realizedGainThb = sales.reduce((total, sale) => total.plus(saleCapitalGainThb(sale, allocations)), new Decimal(0));

    totalCostThb = totalCostThb.plus(costThb);
    totalRealizedGainThb = totalRealizedGainThb.plus(realizedGainThb);

    const price = prices.get(symbol.id);
    let currentValueThb: Decimal | null = null;
    let unrealizedGainThb: Decimal | null = null;
    let unrealizedGainPct: Decimal | null = null;

    if (fxRate === null) {
      // No FX rate means no THB figure is computable for anything.
    } else if (remainingQty.isZero()) {
      // Nothing held: value is exactly zero and no lookup was needed.
      currentValueThb = new Decimal(0);
      unrealizedGainThb = new Decimal(0).minus(costThb);
    } else if (price) {
      currentValueThb = remainingQty
        .times(price.priceUsd)
        .times(fxRate)
        .toDecimalPlaces(DP.money, Decimal.ROUND_HALF_EVEN);
      unrealizedGainThb = currentValueThb.minus(costThb);
    } else {
      // This one symbol degrades; the rest of the dashboard does not.
      hasFullValue = false;
    }

    if (unrealizedGainThb !== null && costThb.greaterThan(0)) {
      unrealizedGainPct = unrealizedGainThb.dividedBy(costThb).times(100).toDecimalPlaces(2, Decimal.ROUND_HALF_EVEN);
    }

    if (currentValueThb !== null) totalValueThb = totalValueThb.plus(currentValueThb);
    if (unrealizedGainThb !== null) totalUnrealizedGainThb = totalUnrealizedGainThb.plus(unrealizedGainThb);

    rows.push({
      symbol,
      remainingQty,
      costThb,
      realizedGainThb,
      currentValueThb,
      unrealizedGainThb,
      unrealizedGainPct,
      priceStale: price?.stale ?? false,
      priceFetchedAt: price?.fetchedAt ?? null,
    });
  }

  return {
    rows,
    totalCostThb,
    totalRealizedGainThb,
    // Realized gain is ledger arithmetic and never degrades. The live
    // totals do: a partial total would read as a portfolio that shrank.
    totalValueThb: hasFullValue ? totalValueThb : null,
    totalUnrealizedGainThb: hasFullValue ? totalUnrealizedGainThb : null,
    hasFullValue,
  };
}
```

- [ ] **Step 8: Run it to verify it passes**

Run: `npx jest src/services/__tests__/portfolio.test.ts`
Expected: PASS, 12 tests.

Note for the implementer: the test `"carries each row's price staleness…"` contains an apostrophe inside a single-quoted JS string. Write that test name with double quotes (`it("carries each row's price staleness and fetch time through for display", ...)`) so it parses.

- [ ] **Step 9: Run the automated gate**

Run: `npm run typecheck && npm test`
Expected: `tsc --noEmit` silent; all Jest suites pass, including `src/core/__tests__/isolation.test.ts` unmodified.

- [ ] **Step 10: Commit**

```bash
git add src/core/derive.ts src/core/__tests__/derive.test.ts src/services/portfolio.ts src/services/__tests__/portfolio.test.ts
git commit -m "feat: add remaining-cost derivation and the network-free portfolio summary"
```

**Manual verification (deferred to a human device pass):** none — this task adds no UI.

---

### Task 5: Display logic — quote age and allocation segments

**Files:**
- Modify: `src/theme/tokens.ts` (append `chartPalette`)
- Create: `src/ui/quoteAge.ts`
- Create: `src/ui/__tests__/quoteAge.test.ts`
- Create: `src/ui/allocation.ts`
- Create: `src/ui/__tests__/allocation.test.ts`

**Interfaces:**
- Consumes: `chartPalette` from `src/theme/tokens.ts`; `DP` from `src/core/money.ts`.
- Produces:
  - `src/theme/tokens.ts` exports `const chartPalette: readonly string[]`.
  - `src/ui/quoteAge.ts` exports `function formatQuoteAge(fetchedAt: string, now: Date): string`.
  - `src/ui/allocation.ts` exports `interface AllocationSegment { ticker: string; costThb: string; percent: number; color: string }` and `function buildAllocationSegments(rows: ReadonlyArray<{ ticker: string; costThb: Decimal }>): AllocationSegment[]`.

- [ ] **Step 1: Write the failing test for `formatQuoteAge`**

Create `src/ui/__tests__/quoteAge.test.ts`:

```ts
import { formatQuoteAge } from '../quoteAge';

const NOW = new Date('2026-09-13T12:00:00.000Z');

function ago(ms: number): string {
  return new Date(NOW.getTime() - ms).toISOString();
}

describe('formatQuoteAge', () => {
  it('says just now for anything under a minute', () => {
    expect(formatQuoteAge(ago(0), NOW)).toBe('เมื่อสักครู่');
    expect(formatQuoteAge(ago(59_000), NOW)).toBe('เมื่อสักครู่');
  });

  it('counts whole minutes under an hour', () => {
    expect(formatQuoteAge(ago(60_000), NOW)).toBe('1 นาทีที่แล้ว');
    expect(formatQuoteAge(ago(59 * 60_000), NOW)).toBe('59 นาทีที่แล้ว');
  });

  it('counts whole hours under a day', () => {
    expect(formatQuoteAge(ago(2 * 3_600_000), NOW)).toBe('2 ชั่วโมงที่แล้ว');
    expect(formatQuoteAge(ago(23 * 3_600_000), NOW)).toBe('23 ชั่วโมงที่แล้ว');
  });

  it('counts whole days beyond that', () => {
    expect(formatQuoteAge(ago(24 * 3_600_000), NOW)).toBe('1 วันที่แล้ว');
    expect(formatQuoteAge(ago(10 * 24 * 3_600_000), NOW)).toBe('10 วันที่แล้ว');
  });

  it('treats a clock that has gone backwards as just now rather than a negative age', () => {
    expect(formatQuoteAge(new Date(NOW.getTime() + 60_000).toISOString(), NOW)).toBe('เมื่อสักครู่');
  });

  it('says the time is unknown for an unparseable timestamp', () => {
    expect(formatQuoteAge('not a date', NOW)).toBe('ไม่ทราบเวลา');
    expect(formatQuoteAge('', NOW)).toBe('ไม่ทราบเวลา');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx jest src/ui/__tests__/quoteAge.test.ts`
Expected: FAIL — `Cannot find module '../quoteAge'`.

- [ ] **Step 3: Write `src/ui/quoteAge.ts`**

```ts
/**
 * Spec §5: when offline, the dashboard shows the cached value with its age
 * ("price from 2 hours ago") rather than a blank. This is that label.
 *
 * Ages are floored, never rounded up: "2 ชั่วโมงที่แล้ว" for anything from
 * two hours to just under three. Overstating freshness would be the one
 * mistake that matters here.
 */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export function formatQuoteAge(fetchedAt: string, now: Date): string {
  const then = new Date(fetchedAt).getTime();
  if (!Number.isFinite(then)) return 'ไม่ทราบเวลา';

  // A device clock that moved backwards (manual change, NTP correction)
  // would otherwise produce a negative age.
  const age = Math.max(0, now.getTime() - then);

  if (age < MINUTE) return 'เมื่อสักครู่';
  if (age < HOUR) return `${Math.floor(age / MINUTE)} นาทีที่แล้ว`;
  if (age < DAY) return `${Math.floor(age / HOUR)} ชั่วโมงที่แล้ว`;
  return `${Math.floor(age / DAY)} วันที่แล้ว`;
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx jest src/ui/__tests__/quoteAge.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Append `chartPalette` to `src/theme/tokens.ts`**

```ts
/**
 * Allocation-chart series colors, in order. Drawn from the Quantum Neon
 * accents so a chart slice and a gain figure never share a color and
 * imply a relationship that is not there.
 */
export const chartPalette = [
  '#00f0ff', '#ff2e93', '#39ff14', '#ffc107',
  '#8a6cff', '#ff7a45', '#00d4a0', '#ff5c8a',
] as const;
```

- [ ] **Step 6: Write the failing test for `buildAllocationSegments`**

Create `src/ui/__tests__/allocation.test.ts`:

```ts
import Decimal from 'decimal.js';
import { buildAllocationSegments } from '../allocation';
import { chartPalette } from '../../theme/tokens';

describe('buildAllocationSegments', () => {
  it('returns nothing for an empty portfolio', () => {
    expect(buildAllocationSegments([])).toEqual([]);
  });

  it('returns nothing when every position has zero cost', () => {
    expect(buildAllocationSegments([{ ticker: 'NVDA', costThb: new Decimal('0') }])).toEqual([]);
  });

  it('gives a single position 100 percent', () => {
    const segments = buildAllocationSegments([{ ticker: 'NVDA', costThb: new Decimal('36000') }]);
    expect(segments).toHaveLength(1);
    expect(segments[0]!.percent).toBe(100);
    expect(segments[0]!.ticker).toBe('NVDA');
    expect(segments[0]!.costThb).toBe('36000.0000');
    expect(segments[0]!.color).toBe(chartPalette[0]);
  });

  it('splits by share of total cost', () => {
    const segments = buildAllocationSegments([
      { ticker: 'NVDA', costThb: new Decimal('30000') },
      { ticker: 'AAPL', costThb: new Decimal('10000') },
    ]);
    expect(segments.map((s) => s.percent)).toEqual([75, 25]);
  });

  it('sorts largest first, breaking ties by ticker so the order is deterministic', () => {
    const segments = buildAllocationSegments([
      { ticker: 'MSFT', costThb: new Decimal('100') },
      { ticker: 'AAPL', costThb: new Decimal('100') },
      { ticker: 'NVDA', costThb: new Decimal('300') },
    ]);
    expect(segments.map((s) => s.ticker)).toEqual(['NVDA', 'AAPL', 'MSFT']);
  });

  it('drops zero and negative-cost positions but keeps the rest whole', () => {
    const segments = buildAllocationSegments([
      { ticker: 'NVDA', costThb: new Decimal('30000') },
      { ticker: 'SOLD', costThb: new Decimal('0') },
      { ticker: 'AAPL', costThb: new Decimal('10000') },
    ]);
    expect(segments.map((s) => s.ticker)).toEqual(['NVDA', 'AAPL']);
    expect(segments.map((s) => s.percent)).toEqual([75, 25]);
  });

  it('cycles the palette past its length rather than running out of colors', () => {
    const rows = Array.from({ length: chartPalette.length + 2 }, (_unused, index) => ({
      ticker: `T${String(index).padStart(2, '0')}`,
      costThb: new Decimal(100 - index),
    }));
    const segments = buildAllocationSegments(rows);
    expect(segments).toHaveLength(chartPalette.length + 2);
    expect(segments[chartPalette.length]!.color).toBe(chartPalette[0]);
  });

  it('keeps the exact cost as a string so nobody does arithmetic on the percentage', () => {
    const segments = buildAllocationSegments([
      { ticker: 'A', costThb: new Decimal('0.1') },
      { ticker: 'B', costThb: new Decimal('0.2') },
    ]);
    expect(segments.map((s) => s.costThb)).toEqual(['0.2000', '0.1000']);
  });
});
```

- [ ] **Step 7: Run it to verify it fails**

Run: `npx jest src/ui/__tests__/allocation.test.ts`
Expected: FAIL — `Cannot find module '../allocation'`.

- [ ] **Step 8: Write `src/ui/allocation.ts`**

```ts
import Decimal from 'decimal.js';
import { DP } from '../core/money';
import { chartPalette } from '../theme/tokens';

/**
 * The allocation chart of spec §7.1, reduced to data.
 *
 * `percent` is the one JavaScript `number` this plan permits (CLAUDE.md:
 * "number is allowed only for chart rendering") — it exists solely to drive
 * a flexbox width. `costThb` travels alongside it as an exact decimal
 * string so no consumer is ever tempted to recover a money value from the
 * percentage.
 */
export interface AllocationSegment {
  ticker: string;
  /** Exact cost, 4 dp decimal string. The authoritative figure. */
  costThb: string;
  /** Share of total cost, 0-100, 2 dp. Layout only — never money. */
  percent: number;
  color: string;
}

export function buildAllocationSegments(
  rows: ReadonlyArray<{ ticker: string; costThb: Decimal }>,
): AllocationSegment[] {
  const held = rows.filter((row) => row.costThb.greaterThan(0));
  if (held.length === 0) return [];

  const total = held.reduce((sum, row) => sum.plus(row.costThb), new Decimal(0));
  if (total.lessThanOrEqualTo(0)) return [];

  // Largest slice first; ticker breaks ties so two equal positions never
  // swap places between renders.
  const ordered = [...held].sort((a, b) => {
    const byCost = b.costThb.comparedTo(a.costThb);
    return byCost !== 0 ? byCost : a.ticker.localeCompare(b.ticker);
  });

  return ordered.map((row, index) => ({
    ticker: row.ticker,
    costThb: row.costThb.toFixed(DP.money, Decimal.ROUND_HALF_EVEN),
    percent: row.costThb.dividedBy(total).times(100).toDecimalPlaces(2, Decimal.ROUND_HALF_EVEN).toNumber(),
    color: chartPalette[index % chartPalette.length]!,
  }));
}
```

- [ ] **Step 9: Run it to verify it passes**

Run: `npx jest src/ui/__tests__/allocation.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 10: Run the automated gate**

Run: `npm run typecheck && npm test`
Expected: `tsc --noEmit` silent; all Jest suites pass.

- [ ] **Step 11: Commit**

```bash
git add src/theme/tokens.ts src/ui/quoteAge.ts src/ui/allocation.ts src/ui/__tests__/quoteAge.test.ts src/ui/__tests__/allocation.test.ts
git commit -m "feat: add quote-age labels and allocation chart segment builder"
```

**Manual verification (deferred to a human device pass):** none — this task adds no UI.

---

### Task 6: The Dashboard screen

**Files:**
- Modify: `src/ui/components/Screen.tsx` (add an optional `refreshControl` passthrough)
- Create: `src/ui/components/StatTile.tsx`
- Create: `src/ui/components/AllocationBar.tsx`
- Modify: `src/app/(tabs)/index.tsx` (replace the plan-3 placeholder entirely)

**Interfaces:**
- Consumes: `buildPortfolioSummary`, `listPortfolioSymbols`, `LivePrice`, `PortfolioSummary` from `src/services/portfolio.ts`; `getQuote` from `src/services/quotes.ts`; `getTodayFxRate`, `FxRateResult` from `src/services/fx.ts`; `buildAllocationSegments` from `src/ui/allocation.ts`; `formatQuoteAge` from `src/ui/quoteAge.ts`; `formatMoneyThb`, `formatSignedThb`, `formatQty`, `formatFxRate` from `src/ui/format.ts`; `useAppStore` from `src/store/useAppStore.ts`; `Screen`, `Card`, `CardTitle`, `ListRow`, `EmptyState`, `GainLoss` from `src/ui/components/`.
- Produces:
  - `src/ui/components/Screen.tsx` exports `Screen({ children, scroll, refreshControl })` — `refreshControl?: React.ReactElement`, honored only when `scroll` is true.
  - `src/ui/components/StatTile.tsx` exports `StatTile({ label, value, tone, sub })` where `tone?: 'neutral' | 'gain' | 'loss'`.
  - `src/ui/components/AllocationBar.tsx` exports `AllocationBar({ segments })` taking `readonly AllocationSegment[]`.

- [ ] **Step 1: Add the `refreshControl` passthrough to `Screen`**

Replace `src/ui/components/Screen.tsx` with:

```tsx
import { ScrollView, View, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { color, space } from '../../theme/tokens';

export function Screen({
  children, scroll = false, refreshControl,
}: {
  children: React.ReactNode;
  scroll?: boolean;
  /** Pull-to-refresh; only meaningful together with `scroll`. */
  refreshControl?: React.ReactElement;
}) {
  const inner = <View style={styles.body}>{children}</View>;
  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          refreshControl={refreshControl}
        >
          {children}
        </ScrollView>
      ) : inner}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: color.pageBg },
  body: { flex: 1, padding: space[3] },
  scroll: { padding: space[3] },
});
```

- [ ] **Step 2: Create `src/ui/components/StatTile.tsx`**

```tsx
import { View, Text, StyleSheet, type ViewStyle } from 'react-native';
import { color, radius, space, font, fontFamily } from '../../theme/tokens';

export function StatTile({
  label, value, tone = 'neutral', sub, style,
}: {
  label: string;
  value: string;
  tone?: 'neutral' | 'gain' | 'loss';
  sub?: string;
  style?: ViewStyle;
}) {
  const valueColor = tone === 'gain' ? color.gain : tone === 'loss' ? color.loss : color.textBody;
  return (
    <View style={[styles.tile, style]}>
      <Text style={styles.label}>{label}</Text>
      <Text style={[styles.value, { color: valueColor }]} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      {sub ? <Text style={styles.sub}>{sub}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    flexGrow: 1, flexBasis: '46%',
    backgroundColor: color.cardBg, borderColor: color.cardBorder, borderWidth: 1,
    borderRadius: radius.lg, padding: space[3],
  },
  label: { color: color.textMuted, fontFamily: fontFamily.sansRegular, fontSize: font.size.xs },
  value: { fontFamily: fontFamily.monoSemibold, fontSize: font.size.lg, marginTop: space[1] },
  sub: { color: color.textMuted, fontFamily: fontFamily.sansRegular, fontSize: font.size.xs, marginTop: 2 },
});
```

- [ ] **Step 3: Create `src/ui/components/AllocationBar.tsx`**

```tsx
import { View, Text, StyleSheet } from 'react-native';
import type { AllocationSegment } from '../allocation';
import { formatMoneyThb } from '../format';
import { color, radius, space, font, fontFamily } from '../../theme/tokens';

/**
 * Spec §7.1's allocation chart as a stacked bar plus legend. No chart
 * library: a flex-weighted row of Views renders this exactly, adds no
 * native dependency, and cannot break on an Expo SDK bump.
 *
 * `segment.percent` drives flex only. Every money figure in the legend
 * comes from `segment.costThb`, the exact decimal string.
 */
export function AllocationBar({ segments }: { segments: readonly AllocationSegment[] }) {
  if (segments.length === 0) return null;

  return (
    <View>
      <View style={styles.bar}>
        {segments.map((segment) => (
          <View key={segment.ticker} style={{ flex: segment.percent, backgroundColor: segment.color }} />
        ))}
      </View>
      <View style={styles.legend}>
        {segments.map((segment) => (
          <View key={segment.ticker} style={styles.legendItem}>
            <View style={[styles.swatch, { backgroundColor: segment.color }]} />
            <Text style={styles.legendTicker}>{segment.ticker}</Text>
            <Text style={styles.legendValue}>
              {segment.percent.toFixed(1)}% · {formatMoneyThb(segment.costThb)}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', height: 14, borderRadius: radius.pill, overflow: 'hidden', backgroundColor: color.inputBg },
  legend: { marginTop: space[3], gap: space[2] },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  swatch: { width: 10, height: 10, borderRadius: radius.pill },
  legendTicker: { color: color.textBody, fontFamily: fontFamily.monoSemibold, fontSize: font.size.sm, minWidth: 56 },
  legendValue: { color: color.textMuted, fontFamily: fontFamily.sansRegular, fontSize: font.size.xs },
});
```

- [ ] **Step 4: Replace `src/app/(tabs)/index.tsx` with the live Dashboard**

```tsx
import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, RefreshControl, ActivityIndicator } from 'react-native';
import Decimal from 'decimal.js';
import { useRouter } from 'expo-router';
import { Screen } from '../../ui/components/Screen';
import { Card, CardTitle } from '../../ui/components/Card';
import { ListRow } from '../../ui/components/ListRow';
import { EmptyState } from '../../ui/components/EmptyState';
import { GainLoss } from '../../ui/components/GainLoss';
import { StatTile } from '../../ui/components/StatTile';
import { AllocationBar } from '../../ui/components/AllocationBar';
import { useAppStore } from '../../store/useAppStore';
import { buildPortfolioSummary, listPortfolioSymbols, type LivePrice } from '../../services/portfolio';
import { getQuote } from '../../services/quotes';
import { getTodayFxRate, type FxRateResult } from '../../services/fx';
import { lotQtyRemaining } from '../../core/derive';
import { fromStored } from '../../core/money';
import { listLots, listAllocations } from '../../db/repo';
import { toDomainLot } from '../../services/ledger';
import { buildAllocationSegments } from '../../ui/allocation';
import { formatQuoteAge } from '../../ui/quoteAge';
import { formatMoneyThb, formatSignedThb, formatQty, formatFxRate } from '../../ui/format';
import { color, space, font, fontFamily } from '../../theme/tokens';

export default function DashboardScreen() {
  const db = useAppStore((s) => s.db)!;
  const dataVersion = useAppStore((s) => s.dataVersion);
  const router = useRouter();

  const [prices, setPrices] = useState<ReadonlyMap<number, LivePrice>>(new Map());
  const [fx, setFx] = useState<FxRateResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  /**
   * Which symbols actually need a price: only those still holding shares.
   * A fully-sold position has no live value, so requesting its quote would
   * be a wasted round trip and a needless disclosure of a ticker the user
   * no longer holds.
   */
  const symbolsNeedingPrice = useMemo(() => {
    const allocations = listAllocations(db).map((a) => ({
      saleId: a.saleId, lotId: a.lotId,
      qtyAllocated: fromStored(a.qtyAllocated), costBasisThb: fromStored(a.costBasisThb),
    }));
    return listPortfolioSymbols(db).filter((symbol) => {
      const remaining = listLots(db, symbol.id)
        .map(toDomainLot)
        .reduce((total, lot) => total.plus(lotQtyRemaining(lot, allocations)), new Decimal(0));
      return remaining.greaterThan(0);
    });
  }, [db, dataVersion]);

  const loadLive = useCallback(
    async (isCancelled: () => boolean) => {
      const rate = await getTodayFxRate(db);
      if (isCancelled()) return;
      setFx(rate);

      // allSettled, not all: spec §5 requires one failed lookup to degrade
      // that symbol only. getQuote already resolves to null instead of
      // throwing, so a rejection here would mean a genuine bug — it is
      // still tolerated so the other symbols survive it.
      const results = await Promise.allSettled(
        symbolsNeedingPrice.map(async (symbol) => ({ symbol, quote: await getQuote(db, symbol.ticker) })),
      );
      if (isCancelled()) return;

      const next = new Map<number, LivePrice>();
      for (const result of results) {
        if (result.status !== 'fulfilled' || !result.value.quote) continue;
        const { symbol, quote } = result.value;
        next.set(symbol.id, { priceUsd: quote.priceUsd, fetchedAt: quote.fetchedAt, stale: quote.stale });
      }
      setPrices(next);
    },
    [db, symbolsNeedingPrice],
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    loadLive(() => cancelled).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [loadLive]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadLive(() => false).finally(() => setRefreshing(false));
  }, [loadLive]);

  const summary = useMemo(
    () => buildPortfolioSummary(db, prices, fx?.rate ?? null),
    [db, dataVersion, prices, fx],
  );

  const segments = useMemo(
    () => buildAllocationSegments(summary.rows.map((row) => ({ ticker: row.symbol.ticker, costThb: row.costThb }))),
    [summary],
  );

  const now = new Date();
  const unrealized = summary.totalUnrealizedGainThb;

  if (summary.rows.length === 0) {
    return (
      <Screen scroll>
        <EmptyState title="ยังไม่มีข้อมูลพอร์ต" hint="บันทึกการซื้อรายการแรกในแท็บ “ซื้อ”" />
      </Screen>
    );
  }

  return (
    <Screen
      scroll
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={color.actionPrimary} />
      }
    >
      <View style={styles.tiles}>
        <StatTile
          label="มูลค่าพอร์ต"
          value={summary.totalValueThb ? formatMoneyThb(summary.totalValueThb) : '—'}
          sub={summary.totalValueThb ? undefined : 'ราคาบางตัวยังดึงไม่ได้'}
        />
        <StatTile
          label="กำไรยังไม่รับรู้"
          value={unrealized ? formatSignedThb(unrealized) : '—'}
          tone={unrealized ? (unrealized.greaterThanOrEqualTo(0) ? 'gain' : 'loss') : 'neutral'}
        />
        <StatTile label="ต้นทุนคงเหลือ" value={formatMoneyThb(summary.totalCostThb)} />
        <StatTile
          label="กำไรรับรู้แล้ว"
          value={formatSignedThb(summary.totalRealizedGainThb)}
          tone={summary.totalRealizedGainThb.greaterThanOrEqualTo(0) ? 'gain' : 'loss'}
        />
      </View>

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={color.actionPrimary} />
          <Text style={styles.note}>กำลังดึงราคาล่าสุด…</Text>
        </View>
      ) : null}

      {fx ? (
        <Text style={styles.note}>
          เรต USD/THB {formatFxRate(fx.rate)}
          {fx.stale ? ` · ของวันที่ ${fx.rateDate} (ออฟไลน์)` : ''}
        </Text>
      ) : (
        <Text style={styles.warn}>ดึงเรตแลกเงินไม่ได้ — แสดงเฉพาะต้นทุน</Text>
      )}

      {segments.length > 0 ? (
        <Card style={{ marginTop: space[3] }}>
          <CardTitle>สัดส่วนต้นทุน</CardTitle>
          <AllocationBar segments={segments} />
        </Card>
      ) : null}

      <Card style={{ marginTop: space[3] }}>
        <CardTitle>รายตัว</CardTitle>
        {summary.rows.map((row) => (
          <ListRow key={row.symbol.id} onPress={() => router.push('/lots')}>
            <View style={{ flex: 1 }}>
              <Text style={styles.ticker}>{row.symbol.ticker}</Text>
              <Text style={styles.meta}>
                {formatQty(row.remainingQty)} หน่วย · ต้นทุน {formatMoneyThb(row.costThb)}
              </Text>
              {row.priceFetchedAt ? (
                <Text style={row.priceStale ? styles.warnSmall : styles.meta}>
                  ราคา{formatQuoteAge(row.priceFetchedAt, now)}
                </Text>
              ) : row.remainingQty.greaterThan(0) ? (
                <Text style={styles.warnSmall}>ดึงราคาไม่ได้</Text>
              ) : null}
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={styles.value}>
                {row.currentValueThb ? formatMoneyThb(row.currentValueThb) : '—'}
              </Text>
              {row.unrealizedGainThb ? (
                <GainLoss
                  value={row.unrealizedGainThb.toString()}
                  display={`${formatSignedThb(row.unrealizedGainThb)}${
                    row.unrealizedGainPct ? ` (${row.unrealizedGainPct.toFixed(2)}%)` : ''
                  }`}
                />
              ) : null}
            </View>
          </ListRow>
        ))}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
  loading: { flexDirection: 'row', alignItems: 'center', gap: space[2], marginTop: space[3] },
  note: { color: color.textMuted, fontFamily: fontFamily.sansRegular, fontSize: font.size.xs, marginTop: space[3] },
  warn: { color: color.warning, fontFamily: fontFamily.sansRegular, fontSize: font.size.xs, marginTop: space[3] },
  warnSmall: { color: color.warning, fontFamily: fontFamily.sansRegular, fontSize: font.size.xs, marginTop: 2 },
  ticker: { color: color.textBody, fontFamily: fontFamily.monoSemibold, fontSize: font.size.md },
  value: { color: color.textBody, fontFamily: fontFamily.monoMedium, fontSize: font.size.md },
  meta: { color: color.textMuted, fontFamily: fontFamily.sansRegular, fontSize: font.size.xs, marginTop: 2 },
});
```

- [ ] **Step 5: Run the automated gate**

Run: `npm run typecheck && npm test`
Expected: `tsc --noEmit` silent (this is the only automated check that covers the screen code); all Jest suites pass unchanged — no `.test.ts` file imports a screen, so the Node test environment never loads React Native.

- [ ] **Step 6: Verify the whole graph bundles**

Run: `npx expo export --platform android`
Expected: completes without error. This pushes every screen, import, and native-module reference through Metro/Hermes and is the strongest available proof that the dashboard compiles and resolves in this environment.

Then remove the export output so it is never committed: `rm -rf dist`

- [ ] **Step 7: Commit**

```bash
git add src/ui/components/Screen.tsx src/ui/components/StatTile.tsx src/ui/components/AllocationBar.tsx "src/app/(tabs)/index.tsx"
git commit -m "feat: replace dashboard placeholder with live portfolio value, allocation, and per-symbol rows"
```

**Manual verification (deferred to a human device pass) — report these as unconfirmed:**
1. With at least two symbols holding shares, the dashboard shows four stat tiles, a stacked allocation bar with a legend, and one row per symbol.
2. Pull down on the dashboard: the spinner appears, prices refresh, and the "ราคาเมื่อสักครู่" labels reset.
3. Turn on airplane mode and pull to refresh: every symbol still shows its cost basis, the stat tiles for value and unrealized gain show `—`, and each row shows its cached price age in the warning color. Nothing is blank and nothing crashes.
4. With an unknown ticker (e.g. a symbol created for a delisted name) among real ones: that row alone shows "ดึงราคาไม่ได้" while the others show live values.
5. With an empty ledger the dashboard shows the "ยังไม่มีข้อมูลพอร์ต" empty state, not a crash.
6. Add a lot from the ซื้อ tab and return to the dashboard: totals update without restarting the app.

---

### Task 7: FX-rate autofill on the transaction forms

**Files:**
- Create: `src/ui/components/FxRateField.tsx`
- Modify: `src/app/lot/new.tsx`
- Modify: `src/app/lot/[id]/edit.tsx`
- Modify: `src/app/sale/new.tsx`
- Modify: `src/app/sale/[id]/edit.tsx`

**Interfaces:**
- Consumes: `getFxRateForDate`, `FxRateResult` from `src/services/fx.ts`; `isValidYmd` from `src/ui/dateInput.ts`; `DP` from `src/core/money.ts`; `useAppStore`; `FormField`, `DecimalInput` from `src/ui/components/Field.tsx`; `Button`.
- Produces: `src/ui/components/FxRateField.tsx` exports `FxRateField({ value, date, onChange, error })`.

This task replaces the same four-line block in four screens. It is deliberately one task, not four: the edit is identical in each file and a reviewer gains nothing from four separate diffs.

- [ ] **Step 1: Create `src/ui/components/FxRateField.tsx`**

```tsx
import { useState } from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { Button } from './Button';
import { FormField, DecimalInput } from './Field';
import { useAppStore } from '../../store/useAppStore';
import { getFxRateForDate } from '../../services/fx';
import { isValidYmd } from '../dateInput';
import { DP } from '../../core/money';
import { color, space, font, fontFamily } from '../../theme/tokens';

/**
 * The FX rate field, with a button that fills it from Frankfurter for the
 * date already entered on the form.
 *
 * The lookup is a convenience and never a gate (spec §5 names manual entry
 * as the fallback): the field stays fully typeable, a failure only prints a
 * line of text, and saving never waits on the network.
 */
export function FxRateField({
  value, date, onChange, error,
}: {
  value: string;
  /** The buy or sell date already on the form, 'YYYY-MM-DD'. */
  date: string;
  onChange: (text: string) => void;
  error?: string;
}) {
  const db = useAppStore((s) => s.db)!;
  const [fetching, setFetching] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const dateUsable = isValidYmd(date);

  async function fill() {
    setFetching(true);
    setStatus(null);
    try {
      const result = await getFxRateForDate(db, date);
      if (!result) {
        setStatus('ดึงเรตไม่สำเร็จ — กรอกเอง');
        return;
      }
      onChange(result.rate.toFixed(DP.fxRate));
      setStatus(result.stale ? `เรตวันที่ ${result.rateDate} (จากแคช)` : `เรตวันที่ ${result.rateDate}`);
    } finally {
      setFetching(false);
    }
  }

  return (
    <FormField label="เรตแลกเงิน USD/THB" error={error}>
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <DecimalInput value={value} onChangeText={onChange} placeholder="36.21" error={!!error} />
        </View>
        {fetching ? (
          <ActivityIndicator color={color.actionPrimary} style={styles.spinner} />
        ) : (
          <Button title="ดึงเรต" variant="outline" disabled={!dateUsable} onPress={() => { void fill(); }} />
        )}
      </View>
      {status ? <Text style={styles.status}>{status}</Text> : null}
    </FormField>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  spinner: { width: 64 },
  status: { color: color.textMuted, fontFamily: fontFamily.sansRegular, fontSize: font.size.xs, marginTop: space[1] },
});
```

- [ ] **Step 2: Swap the FX block in `src/app/lot/new.tsx`**

Add the import alongside the other component imports:

```tsx
import { FxRateField } from '../../ui/components/FxRateField';
```

Replace this block:

```tsx
      <FormField label="เรตแลกเงิน USD/THB" error={errors.fxRateUsdThb}>
        <DecimalInput value={form.fxRateUsdThb} onChangeText={(fxRateUsdThb) => setForm((f) => ({ ...f, fxRateUsdThb }))} placeholder="36.21" />
      </FormField>
```

with:

```tsx
      <FxRateField
        value={form.fxRateUsdThb}
        date={form.buyDate}
        onChange={(fxRateUsdThb) => setForm((f) => ({ ...f, fxRateUsdThb }))}
        error={errors.fxRateUsdThb}
      />
```

- [ ] **Step 3: Make the same swap in `src/app/lot/[id]/edit.tsx`**

Import path is one level deeper: `import { FxRateField } from '../../../ui/components/FxRateField';`. Replace the same `FormField`/`DecimalInput` FX block with the same `<FxRateField … date={form.buyDate} … />` element, matching that file's existing `setForm` style.

- [ ] **Step 4: Make the same swap in `src/app/sale/new.tsx`**

Import: `import { FxRateField } from '../../ui/components/FxRateField';`. The date prop here is the **sell** date:

```tsx
      <FxRateField
        value={form.fxRateUsdThb}
        date={form.sellDate}
        onChange={(fxRateUsdThb) => setForm((f) => ({ ...f, fxRateUsdThb }))}
        error={errors.fxRateUsdThb}
      />
```

- [ ] **Step 5: Make the same swap in `src/app/sale/[id]/edit.tsx`**

Import: `import { FxRateField } from '../../../ui/components/FxRateField';`. Same element as Step 4, with `date={form.sellDate}`.

- [ ] **Step 6: Remove now-unused imports**

In each of the four files, if `FormField` or `DecimalInput` is no longer referenced after the swap, drop it from that file's import list. `npm run typecheck` will not catch an unused import, so check each file by eye. (`sale/new.tsx` and `sale/[id]/edit.tsx` still use both for price, quantity, and fee; the lot forms still use both for price and quantity. In practice no import should need removing — confirm rather than assume.)

- [ ] **Step 7: Run the automated gate**

Run: `npm run typecheck && npm test`
Expected: `tsc --noEmit` silent; all Jest suites pass unchanged.

- [ ] **Step 8: Commit**

```bash
git add src/ui/components/FxRateField.tsx src/app/lot/new.tsx "src/app/lot/[id]/edit.tsx" src/app/sale/new.tsx "src/app/sale/[id]/edit.tsx"
git commit -m "feat: add FX rate autofill button to the four transaction forms"
```

**Manual verification (deferred to a human device pass) — report these as unconfirmed:**
1. On the buy form, pick a past weekday date and tap "ดึงเรต": the field fills with a 4 dp rate and a line below names the date.
2. Tap it a second time for the same date: it fills instantly with no visible delay (served from `fx_rates`, no request).
3. Clear the date or enter an invalid one: the "ดึงเรต" button is disabled.
4. In airplane mode with an empty cache, tap "ดึงเรต": the field stays as it was and "ดึงเรตไม่สำเร็จ — กรอกเอง" appears. The form still saves with a hand-typed rate.
5. Repeat 1 and 4 on the sell form and on both edit forms.

---

### Task 8: Advisory symbol-name backfill

**Files:**
- Create: `src/services/symbolLookup.ts`
- Create: `src/services/__tests__/symbolLookup.test.ts`
- Modify: `src/app/lot/new.tsx`
- Modify: `src/app/lot/[id]/edit.tsx`
- Modify: `src/app/sale/new.tsx`
- Modify: `src/app/sale/[id]/edit.tsx`
- Modify: `src/app/symbols/index.tsx`

**Interfaces:**
- Consumes: `fetchQuote` from `src/services/quotes.ts`; `NetDeps`, `defaultNetDeps` from `src/services/fx.ts`; `listSymbols`, `renameSymbol` from `src/db/repo.ts`; `SymbolRow` from `src/core/types.ts`.
- Produces: `src/services/symbolLookup.ts` exports `async function backfillSymbolName(db: SqlDatabase, symbol: SymbolRow, deps?: NetDeps): Promise<string | null>` and `async function backfillMissingSymbolNames(db: SqlDatabase, deps?: NetDeps): Promise<number>`.

- [ ] **Step 1: Write the failing test**

Create `src/services/__tests__/symbolLookup.test.ts`:

```ts
import { openTestDatabase } from '../../db/__tests__/testDatabase';
import { runMigrations } from '../../db/schema';
import { createSymbol, listSymbols } from '../../db/repo';
import type { SqlDatabase } from '../../db/sqlDatabase';
import type { HttpFetch, HttpResponse } from '../http';
import type { NetDeps } from '../fx';
import { backfillSymbolName, backfillMissingSymbolNames } from '../symbolLookup';

function yahooBody(name: string): string {
  return JSON.stringify({ chart: { result: [{ meta: { currency: 'USD', regularMarketPrice: 100, longName: name } }] } });
}

/** Answers Yahoo per ticker; anything else (including stooq) fails. */
function deps(namesByTicker: Record<string, string>, urls: string[] = []): NetDeps {
  const fetchImpl: HttpFetch = async (url) => {
    urls.push(url);
    const match = /chart\/([A-Z]+)\?/.exec(url);
    const name = match ? namesByTicker[match[1]!] : undefined;
    if (!name) throw new TypeError('not found');
    return { ok: true, status: 200, text: async () => yahooBody(name) } as HttpResponse;
  };
  return { fetch: fetchImpl, now: () => new Date('2026-09-13T09:00:00.000Z') };
}

let db: SqlDatabase;
beforeEach(() => {
  db = openTestDatabase();
  runMigrations(db);
});

describe('backfillSymbolName', () => {
  it('writes the fetched name onto a symbol that has none', async () => {
    const symbol = createSymbol(db, 'NVDA');
    await expect(backfillSymbolName(db, symbol, deps({ NVDA: 'NVIDIA Corporation' })))
      .resolves.toBe('NVIDIA Corporation');
    expect(listSymbols(db)[0]!.name).toBe('NVIDIA Corporation');
  });

  it('makes no request and changes nothing when the symbol already has a name', async () => {
    const symbol = createSymbol(db, 'NVDA', 'Hand typed');
    const urls: string[] = [];
    await expect(backfillSymbolName(db, symbol, deps({ NVDA: 'NVIDIA Corporation' }, urls))).resolves.toBeNull();
    expect(urls).toEqual([]);
    expect(listSymbols(db)[0]!.name).toBe('Hand typed');
  });

  it('returns null and leaves the symbol alone when the lookup fails', async () => {
    const symbol = createSymbol(db, 'ZZZZ');
    await expect(backfillSymbolName(db, symbol, deps({}))).resolves.toBeNull();
    expect(listSymbols(db)[0]!.name).toBe('');
  });

  it('never throws, whatever the network does — the lookup is advisory', async () => {
    const symbol = createSymbol(db, 'NVDA');
    const exploding: NetDeps = {
      fetch: async () => { throw new Error('boom'); },
      now: () => new Date('2026-09-13T09:00:00.000Z'),
    };
    await expect(backfillSymbolName(db, symbol, exploding)).resolves.toBeNull();
  });
});

describe('backfillMissingSymbolNames', () => {
  it('fills every unnamed symbol it can and reports how many it filled', async () => {
    createSymbol(db, 'NVDA');
    createSymbol(db, 'AAPL');
    createSymbol(db, 'ZZZZ');
    createSymbol(db, 'MSFT', 'Already named');

    const urls: string[] = [];
    const filled = await backfillMissingSymbolNames(db, deps({ NVDA: 'NVIDIA Corporation', AAPL: 'Apple Inc.' }, urls));
    expect(filled).toBe(2);

    const byTicker = new Map(listSymbols(db).map((s) => [s.ticker, s.name]));
    expect(byTicker.get('NVDA')).toBe('NVIDIA Corporation');
    expect(byTicker.get('AAPL')).toBe('Apple Inc.');
    expect(byTicker.get('ZZZZ')).toBe('');
    expect(byTicker.get('MSFT')).toBe('Already named');
    // MSFT already had a name, so only the three unnamed ones were attempted.
    expect(urls.filter((u) => u.includes('yahoo'))).toHaveLength(3);
  });

  it('reports zero on an empty symbol table', async () => {
    await expect(backfillMissingSymbolNames(db, deps({}))).resolves.toBe(0);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx jest src/services/__tests__/symbolLookup.test.ts`
Expected: FAIL — `Cannot find module '../symbolLookup'`.

- [ ] **Step 3: Write `src/services/symbolLookup.ts`**

```ts
import type { SymbolRow } from '../core/types';
import type { SqlDatabase } from '../db/sqlDatabase';
import { listSymbols, renameSymbol } from '../db/repo';
import { defaultNetDeps, type NetDeps } from './fx';
import { fetchQuote } from './quotes';

/**
 * Spec §7.4: on add, the app attempts to validate the ticker against the
 * quote endpoint and populate `name` from the response — but "validation is
 * advisory, never blocking". A symbol is created offline with an empty name
 * and the name is backfilled on a later successful lookup.
 *
 * Every function here swallows every failure and returns null / a count.
 * Nothing in this file may ever throw at a caller: a UI that awaited it
 * would be gating data entry on the network, which is exactly what the spec
 * forbids.
 */

/** Returns the name it wrote, or null if it wrote nothing. Never throws. */
export async function backfillSymbolName(
  db: SqlDatabase,
  symbol: SymbolRow,
  deps: NetDeps = defaultNetDeps,
): Promise<string | null> {
  if (symbol.name.trim() !== '') return null;

  try {
    const quote = await fetchQuote(symbol.ticker, deps);
    if (!quote.name) return null;
    renameSymbol(db, symbol.id, quote.name);
    return quote.name;
  } catch {
    return null;
  }
}

/** Attempts every unnamed symbol; returns how many names were written. Never throws. */
export async function backfillMissingSymbolNames(
  db: SqlDatabase,
  deps: NetDeps = defaultNetDeps,
): Promise<number> {
  const unnamed = listSymbols(db).filter((symbol) => symbol.name.trim() === '');

  // Sequential, not parallel: this runs against two unofficial endpoints
  // that rate-limit, and a burst of simultaneous requests is the most
  // reliable way to get every one of them refused.
  let filled = 0;
  for (const symbol of unnamed) {
    if (await backfillSymbolName(db, symbol, deps)) filled += 1;
  }
  return filled;
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx jest src/services/__tests__/symbolLookup.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Fire the advisory lookup from all four forms' `add()`**

Each of `src/app/lot/new.tsx`, `src/app/lot/[id]/edit.tsx`, `src/app/sale/new.tsx`, `src/app/sale/[id]/edit.tsx` has an `add(ticker)` that calls `createSymbol`. Add the import (adjust `../` depth per file — two levels for `new.tsx`, three for `[id]/edit.tsx`):

```tsx
import { backfillSymbolName } from '../../services/symbolLookup';
```

and add the fire-and-forget lookup immediately after `pick(created)` in each `add()`. For `src/app/lot/new.tsx` the whole function becomes:

```tsx
  function add(ticker: string) {
    try {
      const created = createSymbol(db, ticker);
      reload();
      pick(created);
      // Advisory only (spec §7.4): the symbol already exists and the form
      // is already usable. If a name comes back, the list refreshes; if
      // not, nothing happens and nothing is reported.
      void backfillSymbolName(db, created).then((name) => { if (name) reload(); });
    } catch (e) {
      if (e instanceof DuplicateTickerError) Alert.alert('มีสัญลักษณ์นี้แล้ว', ticker);
      else throw e;
    }
  }
```

The other three files write `add()` on one line (`try { const c = createSymbol(db, ticker); reload(); pick(c); }`). Expand each to the multi-line form above, keeping that file's existing variable name and its existing `catch`.

- [ ] **Step 6: Add the backfill button to the Symbols screen**

In `src/app/symbols/index.tsx`, add the import and a `useState` for the in-flight state:

```tsx
import { backfillMissingSymbolNames } from '../../services/symbolLookup';
```

Add to the component body, next to the existing `editing` state:

```tsx
  const [lookingUp, setLookingUp] = useState(false);

  async function fillNames() {
    setLookingUp(true);
    try {
      const filled = await backfillMissingSymbolNames(db);
      reload();
      Alert.alert(
        'ดึงชื่อเสร็จแล้ว',
        filled === 0 ? 'ไม่พบชื่อใหม่' : `เติมชื่อได้ ${filled} รายการ`,
      );
    } finally {
      setLookingUp(false);
    }
  }
```

and render the button directly under the `<Stack.Screen …>` line, above the list:

```tsx
      <Button
        title={lookingUp ? 'กำลังดึงชื่อ…' : 'ดึงชื่อจากอินเทอร์เน็ต'}
        variant="outline"
        disabled={lookingUp}
        onPress={() => { void fillNames(); }}
        style={{ marginBottom: space[3] }}
      />
```

`Button`, `space`, `useState`, `Alert`, and `reload` are already imported in that file.

- [ ] **Step 7: Run the automated gate**

Run: `npm run typecheck && npm test`
Expected: `tsc --noEmit` silent; all Jest suites pass.

- [ ] **Step 8: Verify the whole graph bundles one final time**

Run: `npx expo export --platform android`
Expected: completes without error. Then: `rm -rf dist`

- [ ] **Step 9: Commit**

```bash
git add src/services/symbolLookup.ts src/services/__tests__/symbolLookup.test.ts src/app/lot/new.tsx "src/app/lot/[id]/edit.tsx" src/app/sale/new.tsx "src/app/sale/[id]/edit.tsx" src/app/symbols/index.tsx
git commit -m "feat: backfill symbol names from the quote endpoint, advisory and non-blocking"
```

**Manual verification (deferred to a human device pass) — report these as unconfirmed:**
1. On the buy form, type an unknown real ticker (e.g. `MSFT`) and tap "เพิ่ม MSFT": the symbol is selected **immediately**, with no spinner and no wait. A second or two later the dropdown shows its company name.
2. Repeat in airplane mode: the symbol is still created immediately, stays selected, gets no name, and nothing is reported to the user. The form saves normally.
3. On the Symbols screen, tap "ดึงชื่อจากอินเทอร์เน็ต": unnamed symbols gain names and an alert reports the count.
4. Tap it again straight away: the alert reports "ไม่พบชื่อใหม่" (every symbol now has a name, so nothing is requested).
5. Tap it in airplane mode: the alert reports "ไม่พบชื่อใหม่" and nothing crashes.

---

## Self-Review

Run against the spec with fresh eyes, per the writing-plans skill.

**1. Spec coverage**

- **§5 "historical FX rates never change, cached permanently; only the current day's rate is refetched"** — Task 2, `getFxRateForDate`, tested by *"never refetches a past date, however old the cached row is"*.
- **§5 "stock quotes cached for 15 minutes"** — Task 3, `CACHE_TTL_MS` shared with FX (Decision 3), tested by *"serves a cached quote inside the TTL without any request"*.
- **§5 "when offline, shows the cached value with its age"** — Tasks 3 (`stale` flag, `fetchedAt`) and 5 (`formatQuoteAge`), rendered in Task 6.
- **§5 "per-symbol failure degrades that symbol only"** — Task 4, tested by *"degrades one symbol only when its price is missing"*; wired with `Promise.allSettled` in Task 6.
- **§5 "only keyless endpoints are viable"** — Global Constraints name the three permitted hosts; no key appears anywhere in the plan.
- **§5 "both can break without notice, so quote fetching must fail gracefully by design"** — Decision 1 (provider chain), Task 1 (bounded timeout), Task 3 (`getQuote` returns null rather than throwing).
- **§5 "FX uses Frankfurter, with manual entry as the fallback"** — Task 2 (Frankfurter), Task 7 (the field stays typeable and the button is pure convenience).
- **§5 "neither cache table is included in backups"** — Global Constraints; nothing here couples the cache tables to an export. Backup itself is plan 6.
- **§7.1 "Dashboard — portfolio value, unrealized gain, allocation chart"** — Task 6 (all three), built on Task 4's summary and Task 5's segments.
- **§7.4 "on add, validate against the quote endpoint and populate name; advisory, never blocking; backfilled on a later successful lookup"** — Task 8, tested by *"never throws, whatever the network does"* and by the fire-and-forget call site.
- **§2.2 `fx_rates` / `quotes` schema** — Task 1 writes to exactly the columns plan 2 created; no migration is needed and `CURRENT_SCHEMA_VERSION` stays at 1.
- **§10 "Screens — manual verification on a physical device"** — the Testing Strategy section, with this environment's substitution stated explicitly.
- **Privacy Is a Product Constraint** — Global Constraints; the `User-Agent` is documented as carrying no identity, and Decision 6 keeps sold-out tickers off the wire entirely.
- **Spec Open Item "Quote source: Yahoo versus stooq — needs a spike"** — resolved by Decision 1 as a chain rather than a choice.
- **Plan 1's flagged open item, `lotCostThb` versus allocation cost basis** — resolved by Decision 2 and Task 4's `lotRemainingCostThb`, with a test asserting both figures for a fully-sold lot.

Not covered, and deliberately: PIN/lock (plan 7), backup/restore (plan 6), PDF and CSV report (plan 5), monetization (plan 8), date-range filtering of the dashboard (the Django original's `date_from`/`date_to` — the spec's mobile dashboard has no date filter, so porting the parameters would add an unused code path).

**2. Placeholder scan**

No "TBD", no "add appropriate error handling", no "similar to Task N". Every code step carries the literal code. Every test step carries the literal test. The four near-identical form edits in Task 7 and Task 8 spell out each file's import depth and each file's date field rather than saying "same as above". The one genuine cross-reference — Task 7 Steps 3–5 pointing back at Step 2's element — still states what differs per file, which is the only thing that differs.

**3. Type consistency**

- `NetDeps` is defined once in `src/services/fx.ts` (Task 2) and imported by `quotes.ts` (Task 3) and `symbolLookup.ts` (Task 8). `CACHE_TTL_MS` likewise.
- `HttpFetch` / `HttpResponse` / `httpGetText` are defined in Task 1 and consumed unchanged in Tasks 2, 3, and 8's test stubs.
- `LivePrice` (Task 4) has exactly the three fields Task 6 builds it from, and `QuoteResult` (Task 3) has exactly those three field names, so the Task 6 mapping is field-for-field.
- `FxRateResult.rate` is a `Decimal`; Task 6 passes `fx?.rate ?? null` into `buildPortfolioSummary`'s `fxRate: Decimal | null`, and Task 7 renders it with `.toFixed(DP.fxRate)`.
- `AllocationSegment` (Task 5) is consumed by `AllocationBar` (Task 6) using exactly `ticker`, `costThb`, `percent`, `color`.
- `listPortfolioSymbols` is named identically in `portfolio.ts`, its test, and the Dashboard. (The Django original's `build_dashboard_summary` name was deliberately not ported — the mobile version takes different arguments.)
- `todayYmd(now?: Date)` (Task 2) is backward compatible with every plan-3 call site, which passes nothing.
- `formatQuoteAge(fetchedAt, now)` takes `now` explicitly rather than reading the clock, so it is deterministic under test and the Dashboard supplies one `now` per render.
