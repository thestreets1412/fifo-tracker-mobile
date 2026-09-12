# FIFO Stock Tracker — Mobile Standalone Design

**Date:** 2026-09-12
**Status:** Approved, ready for implementation planning
**Scope:** A new, separate Android application. Not a change to this Django repo.

## Why This Exists

The Django web app runs on a Raspberry Pi behind a Cloudflare Tunnel and serves a single
owner. This design covers a different product: a standalone Android app, distributed free
through the Play Store, where the entire portfolio lives on the user's device and no server
of ours ever sees it.

The two products stay fully separate — separate repositories, separate codebases, separate
data. Nothing syncs between them. The Django deployment milestone (Phases 2-6 in
`.planning/ROADMAP.md`) continues independently and is unaffected by this work.

The mobile app reuses the *ideas* of the web app — the FIFO algorithm, the report layout,
the dual-currency model — but shares no code with it.

## Core Value

The user owns their investment data outright. There is no account, no login, no server.
The developer cannot see a user's portfolio because there is no mechanism by which it
could ever be transmitted.

This is a claim the app must be able to keep literally, so every design decision below is
measured against it.

## Non-Goals

- Syncing with the Django web app, or with anything else
- Multi-user or multi-device support
- iOS in v1 (the stack keeps it cheap to add later, but it is not in scope)
- Broker API integration, bulk import from broker statements, tax-year filtering
- Encryption of the on-device database beyond what Android already provides

---

## 1. Platform and Stack

**Expo (React Native) with `expo-sqlite`.**

| Concern | Choice |
|---|---|
| Database | `expo-sqlite` |
| Decimal arithmetic | `decimal.js` |
| PDF generation | `expo-print` (HTML to PDF), `expo-sharing` |
| Evidence images | `expo-image-picker` (gallery only), `expo-file-system` |
| Secrets | `expo-secure-store` (Android Keystore backed) |
| Biometrics | `expo-local-authentication` |
| Routing | `expo-router` |
| State | `zustand`, one small store |
| In-app purchase | RevenueCat (free below $2.5k/month revenue) over Google Play Billing |
| Build | EAS Build |
| Updates | EAS Update for JavaScript changes, Play Store for native changes |

### Why Expo over the alternatives

The decisive factor is that the developer is not an Android developer. EAS Build produces
a signed APK/AAB in the cloud, so Gradle and Android Studio never have to be installed or
debugged. That removes the single largest source of friction for someone coming from
Python and vanilla JavaScript.

EAS Update also over-delivers on the "must be updatable" requirement: JavaScript-only
fixes reach users immediately rather than waiting one to three days for Play Store review.

**Capacitor** was the runner-up. It would have allowed reusing the existing Bootstrap CSS
and design tokens directly, but it requires local Gradle builds, its over-the-air update
path is a paid product, its AdMob plugin is less maintained, and a WebView UI has known
keyboard and scrolling problems on Android.

**Kotlin with Jetpack Compose** was ruled out on developer familiarity.

**Chaquopy** (running the existing Python on Android) was ruled out on APK size, ARM wheel
availability for pandas/numpy, and Play Store review friction.

**PWA wrapped as a Trusted Web Activity** was ruled out because a TWA requires the site to
be genuinely hosted. The app would depend on the Raspberry Pi staying online, which
contradicts standalone operation outright.

### What carries over from the Django app

Reusable: the FIFO algorithm itself, the PDF report layout, the design tokens, the
four-table schema shape.

Discarded: Django ORM, ReportLab, yfinance, forms, views, templates.

---

## 2. Data Model

### 2.1 Decimal handling

Three rules, all non-negotiable. The web app's correctness rests on Python's `Decimal`;
JavaScript has only IEEE-754 doubles, so the equivalent discipline has to be enforced by
hand.

```js
Decimal.set({ precision: 28 });  // matches Python's default Decimal context
```

**Rule 1 — money and quantities are stored as `TEXT`, never `REAL`.** SQLite's `REAL` is
the same float64 that makes `0.1 + 0.2` inexact. Values are stored as fixed-precision
decimal strings, using the same decimal places as the Django model fields:

| Field | Decimal places | Stored as |
|---|---|---|
| `price_usd` | 6 | `"142.350000"` |
| `qty`, `qty_sold`, `qty_allocated` | 8 | `"10.00000000"` |
| `fx_rate_usd_thb` | 4 | `"36.2100"` |
| `fee_usd` | 4 | `"0.0000"` |
| `cost_basis_thb` | 4 | `"51565.6350"` |

Fixed decimal places make the strings sort and compare correctly and make round-trips
lossless.

**Rule 2 — never `SUM()` a money or quantity column in SQL.** SQLite silently coerces
`TEXT` to float for aggregation, which reintroduces the precision loss the `TEXT` storage
was chosen to avoid. Rows are fetched and summed in JavaScript with `decimal.js`. At
personal-portfolio scale (tens to low hundreds of rows per symbol) the cost is negligible.

**Rule 3 — monetary values never exist as a JavaScript `number`.** Form input goes from
string straight to `Decimal`; display goes from `Decimal` through `.toFixed()`. The only
place a `number` is acceptable is chart rendering.

### 2.2 Schema

```sql
PRAGMA foreign_keys = ON;   -- expo-sqlite defaults this OFF; set it on every connection

CREATE TABLE symbols (
  id     INTEGER PRIMARY KEY AUTOINCREMENT,
  ticker TEXT NOT NULL UNIQUE,
  name   TEXT NOT NULL DEFAULT ''
);

CREATE TABLE lots (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  symbol_id       INTEGER NOT NULL REFERENCES symbols(id),
  buy_date        TEXT    NOT NULL,   -- 'YYYY-MM-DD'
  price_usd       TEXT    NOT NULL,   -- 6 dp
  qty             TEXT    NOT NULL,   -- 8 dp
  fx_rate_usd_thb TEXT    NOT NULL,   -- 4 dp
  created_at      TEXT    NOT NULL,   -- ISO 8601 UTC
  evidence_file   TEXT                -- filename only, never an absolute path
);
CREATE INDEX lots_fifo ON lots(symbol_id, buy_date, created_at, id);

CREATE TABLE sales (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  symbol_id       INTEGER NOT NULL REFERENCES symbols(id),
  sell_date       TEXT    NOT NULL,
  qty_sold        TEXT    NOT NULL,   -- 8 dp
  sale_price_usd  TEXT    NOT NULL,   -- 6 dp
  fee_usd         TEXT    NOT NULL DEFAULT '0.0000',
  fx_rate_usd_thb TEXT    NOT NULL,
  created_at      TEXT    NOT NULL,
  evidence_file   TEXT
);
CREATE INDEX sales_fifo ON sales(symbol_id, sell_date, created_at, id);

CREATE TABLE sale_allocations (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  sale_id        INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  lot_id         INTEGER NOT NULL REFERENCES lots(id)  ON DELETE CASCADE,
  qty_allocated  TEXT    NOT NULL,
  cost_basis_thb TEXT    NOT NULL
);

CREATE TABLE fx_rates (rate_date TEXT PRIMARY KEY, usd_thb   TEXT NOT NULL, fetched_at TEXT NOT NULL);
CREATE TABLE quotes   (ticker    TEXT PRIMARY KEY, price_usd TEXT NOT NULL, fetched_at TEXT NOT NULL);
```

Differences from the Django schema:

- No `owner` column. There is one user and no login.
- `evidence_file` stores a bare filename, not a path. Absolute paths to an app's document
  directory change between installs and updates on iOS; storing one would orphan every
  image. The full path is resolved at read time.
- Explicit FIFO indexes.
- `fx_rates` and `quotes` cache tables (see section 5).

### 2.3 Deterministic FIFO ordering

The Django model orders by `('buy_date', 'created_at')`. `auto_now_add` gives microsecond
resolution, so ties effectively never happen in interactive use.

Restoring a backup breaks that assumption: many rows can carry identical `created_at`
values, leaving the FIFO order ambiguous and letting two runs over the same data produce
different cost bases.

Ordering is therefore `ORDER BY buy_date, created_at, id`, with `id` as the final
tiebreaker, **and the JSON backup preserves original `id` values** so that a restore
reproduces the same order.

### 2.4 Allocations are derived, not history

The web app treats lots and sales as immutable and expects corrections to be made through
offsetting transactions. That works there because Django admin is available as an escape
hatch. On mobile there is no admin. A user who mistypes a quantity would be stuck with the
error permanently.

Allowing deletion naively is also wrong: removing an old sale frees quantity in an old lot
while later sales keep allocations pointing at newer lots, producing a ledger state that
FIFO could never have generated.

The resolution:

> `lots` and `sales` are the source of truth.
> `sale_allocations` is a derived materialization that can be discarded and rebuilt at any
> time.

Every mutation — add, edit, or delete — clears all allocations and replays every sale in
order via `rebuildAllocations()`. At this data scale the rebuild takes single-digit
milliseconds.

This buys four things:

1. Transactions become safely editable and deletable while the ledger stays consistent.
2. The backup only has to carry lots and sales, making it smaller and easier for a human
   to read.
3. Import always converges on the same canonical state, because it is recomputed from
   scratch.
4. The rebuild doubles as an integrity check on imported data (section 4.4).

**Accepted trade-off:** this departs from strict append-only ledger accounting. A
void-by-reversing-entry scheme would preserve a full audit trail, but roughly doubles the
UI complexity and confuses non-accountant users. Revisit only if a concrete need appears.

---

## 3. FIFO Engine

### 3.1 Purity

`core/fifo.ts` imports nothing from React, Expo, or the database layer.

```ts
export function rebuildAllocations(
  lots:  readonly Lot[],    // pre-sorted by buy_date, created_at, id
  sales: readonly Sale[],   // pre-sorted by sell_date, created_at, id
): Allocation[]             // throws InsufficientLotsError
```

Same input, same output, always. No hidden state.

This is the part of the codebase where a bug costs real money, so it is also the part that
must be the cheapest to test: plain Node, no emulator, no database. It supports property
tests such as "the sum of `qty_allocated` always equals the sum of `qty_sold`".

The Django implementation calls `lot.qty_remaining` inside its allocation loop, which is a
query per lot. The pure function tracks remaining quantities in a `Map` while walking, so
it completes in a single pass.

### 3.2 Sales may only draw from lots bought on or before the sale date

`record_sale()` in the web app filters lots by owner and symbol only — it never checks
that a lot was acquired before the sale. A sale dated 2026-03-01 can therefore be matched
against a lot bought 2026-05-01: selling shares that were not yet owned.

This rarely surfaces on the web because transactions are entered in chronological order.
Rebuilding from scratch makes it surface immediately.

The mobile engine **enforces `lot.buy_date <= sale.sell_date`**. When the holding at the
sale date is insufficient, it fails with a specific message:

```
Cannot sell 10 shares of NVDA on 2026-03-01 —
only 4 shares were held on that date.
```

This catches mistyped years and months that the web version silently absorbed. It is a
deliberate behavioral divergence from the web app, acceptable because the two products are
fully separate.

---

## 4. Backup and Restore

### 4.1 One encrypted archive, not loose files

Evidence images have to be in the backup — a backup without the broker slips is not a
backup — and images cannot live inside a CSV or JSON file. An archive is therefore
required regardless of any other consideration.

It also removes the more likely real-world failure. Two separate files invite the user to
send only one of them and discover six months later that restore is impossible.

```
fifo-backup-2026-09-12.zip        (ZIP AES-256)
├── manifest.json     version, counts, checksums
├── backup.json       authoritative data
├── lots.csv          human-readable
├── sales.csv         human-readable
└── evidence/
    ├── a3f9c1.jpg
    └── ...
```

Standard ZIP AES-256 keeps the archive openable by 7-Zip, WinRAR, and Keka, so after
entering the password the user can still open `lots.csv` in a spreadsheet and check it.

### 4.2 CSV format

The existing ledger-style report CSV — interleaved `BUY LOT`, `SALE`, and `-> ALLOCATION`
rows — is a *report*, not an interchange format, and is awkward to parse back. The two
roles are split:

- `report.csv` — the existing flat ledger, for reading and for sending to an accountant.
  Always free. Not part of backup.
- `lots.csv` and `sales.csv` — backup. One row per record, columns matching the fields
  exactly. Readable by a non-programmer in Excel *and* cleanly round-trippable.

```
lots.csv
id,ticker,buy_date,price_usd,qty,fx_rate_usd_thb,created_at,evidence
1,NVDA,2026-03-14,142.350000,10.00000000,36.2100,2026-03-14T08:21:03Z,a3f9c1.jpg
```

Allocations are not in the backup — they are derived (section 2.4).

### 4.3 JSON format

Decimal values are JSON **strings**, never JSON numbers. `JSON.parse` converts numbers to
float64, which would reintroduce exactly the precision loss the `TEXT` storage avoids.

```json
{ "qty": "10.00000000", "price_usd": "142.350000" }   // correct
{ "qty": 10.0,          "price_usd": 142.35       }   // wrong
```

Pretty-printed with two-space indentation so it stays readable by eye.

`manifest.json` carries `schema_version`, allowing old backups to be migrated as the app
evolves.

```json
{
  "format": "fifo-tracker-backup",
  "version": 1,
  "schema_version": 1,
  "app_version": "1.0.0",
  "exported_at": "2026-09-12T04:12:33Z",
  "counts": { "symbols": 4, "lots": 37, "sales": 12, "evidence": 9 },
  "checksums": {
    "backup.json": "sha256-...",
    "lots.csv":    "sha256-...",
    "sales.csv":   "sha256-..."
  }
}
```

### 4.4 Import

The user should be able to correct a mistake by editing the CSV, with a safety net if the
edit diverges from the JSON. A naive "always compare both sides" flow does not deliver
that, because Excel corrupts CSV files on its own: it rewrites `2026-09-12` as
`12/09/2026`, truncates `10.00000000` to `10`, converts long numbers to scientific
notation, and strips leading zeros from tickers. Comparing raw text would raise a conflict
prompt on nearly every import, from damage the user never made, and train them to dismiss
it unread.

```
1. Open the archive, read manifest.json
2. Compare the SHA-256 of lots.csv and sales.csv against the manifest
   ├── match:    the CSVs are untouched. Import from backup.json silently.   (the common case)
   └── mismatch: a CSV was edited. Continue to step 3.
3. Parse both the CSVs and the JSON into canonical form (Decimal + ISO dates, section 2.1)
4. Compare AFTER normalization, so that
     - 12/09/2026 and 2026-09-12 are equal
     - 10 and 10.00000000 are equal
   Excel's cosmetic damage produces no differences.
5. Show only genuine value differences. Resolve per row, or choose a side wholesale.
6. If a CSV cannot be parsed at all, that is an error rather than a difference:
   offer to fall back to backup.json.
```

The whole import runs inside one transaction: load, `rebuildAllocations()`, validate,
commit.

That rebuild is the second safety net. If an edited CSV reduces a lot's quantity below
what later sales consumed, the FIFO replay fails loudly instead of silently corrupting the
ledger, and the transaction rolls back leaving existing data untouched.

### 4.5 Restore replaces everything

Merge semantics (id collisions, duplicate detection, partially-consumed sales) are hard
and rarely wanted. v1 supports replace-only:

1. Explicit confirmation that current data will be replaced.
2. The app automatically exports the current data first, as
   `auto-before-restore-<timestamp>.zip`.
3. Then it replaces.

Step 2 makes the most dangerous button in the app reversible.

### 4.6 Export shares, it does not upload

Export hands the archive to the Android share sheet via `expo-sharing`. The user chooses
Drive, LINE, email, or local storage. The app never transmits it anywhere itself.

---

## 5. Prices and FX

Historical FX rates never change, so `fx_rates` is cached permanently; only the current
day's rate is refetched. Stock quotes are cached for 15 minutes so that opening the
dashboard does not trigger a request every time.

When offline, the dashboard shows the cached value with its age ("price from 2 hours ago")
rather than a blank. Per-symbol failure degrades that symbol only, matching
`build_dashboard_summary`'s existing behavior — a failed NVDA lookup must not break the
whole dashboard.

Neither cache table is included in backups; both are reconstructible.

**API key constraint.** Any key shipped inside an APK is public — it can be extracted by
decompiling, which means it will be abused and revoked. Keyed free tiers (Finnhub, Alpha
Vantage) are therefore unusable without a proxy server, and a proxy server contradicts
standalone operation. Only keyless endpoints are viable: Yahoo's unofficial
`query1.finance.yahoo.com` endpoint, or stooq.com's CSV feed. Both can break without
notice, so quote fetching must fail gracefully by design, not as an afterthought.

FX uses Frankfurter, which is keyless and stable, with manual entry as the fallback —
the same arrangement the web app already has.

---

## 6. App Lock

### 6.1 PIN

```
First launch:        set a 6-digit PIN, confirm it
Subsequent launches: enter the PIN
Return from background past the timeout: enter the PIN
```

- The PIN is stored as a salted hash produced by a slow KDF, never as the PIN itself.
- Storage is `expo-secure-store`, backed by the Android Keystore. Never `AsyncStorage`,
  which is a plain readable file.
- `expo-local-authentication` provides fingerprint or face unlock with the PIN as
  fallback. Without it, users type six digits a dozen times a day and abandon the app.
- Failed attempts back off exponentially (five failures, then a 30-second lock, escalating).
- `FLAG_SECURE` suppresses the thumbnail in the recent-apps switcher, which would otherwise
  expose the portfolio during app switching.
- The timeout is measured by recording a timestamp on leaving and comparing on return.
  Android's background lifecycle events are not reliably delivered and must not be trusted.
- Configurable timeout: immediate, 1 minute, 5 minutes, 15 minutes.

### 6.2 PIN recovery

There is no server, no email, and no account, so identity cannot be verified remotely.
Recovery uses three security questions answered at first launch.

The known weakness is entropy. Canned questions have few realistic answers — "first phone
brand" has roughly ten, and "favorite stock" is especially guessable among users of a
stock app — and the realistic attacker for a phone-based finance app is someone close to
the user, who would answer canned questions correctly.

Four mitigations make this acceptable, given that guessing happens through the app UI
where it can be rate-limited rather than against a file that can be attacked offline:

1. **The user writes their own questions.** Examples may be offered for inspiration, but
   never a fixed list to choose from.
2. No "phone brand" style question, whose answer space is too small to contribute anything.
3. Answers must be at least 4 characters; all three must match.
4. Stored as a salted KDF hash of the three answers concatenated, never as plaintext.
   Three failures lock for one hour, escalating.

Answers are normalized to uppercase with surrounding whitespace trimmed, so a user who
remembers the answer but types it differently is not locked out.

The setup screen states the trade-off plainly: anyone who knows the user well enough to
answer all three questions can enter the app. That lets the user choose harder questions
up front.

### 6.3 Data at rest

Android 10 and later encrypt app data by default, keyed to the device lock screen, so a
powered-off stolen phone is already protected. The app PIN adds a layer for the case that
actually remains: an unlocked phone picked up by someone else.

SQLCipher would add another layer but requires replacing `expo-sqlite` with `op-sqlite`.
**Out of scope for v1** — the complexity outweighs the marginal gain. It can be added later
without invalidating anything here.

### 6.4 Export password

The export password is **separate from the PIN**.

A 6-digit PIN has 10^6 possibilities. ZIP AES-256 derives its key with PBKDF2 at 1,000
iterations, so exhausting that space costs around 10^9 hash operations — seconds on a
single GPU. A backup archive locked with a 6-digit PIN is, against anyone who genuinely
wants to open it, equivalent to an unencrypted file. Since the archive is the artifact most
likely to leak (sent over LINE, stored in Drive), this matters more here than anywhere else
in the app.

Reuse would compound it two further ways: anyone who shoulder-surfs the unlock PIN gains
access to every backup ever exported, and changing the PIN silently strands every older
archive under a password the user no longer remembers.

Rules:

- **ASCII only.** This is a correctness requirement, not a preference. The ZIP format does
  not specify a password encoding, and 7-Zip, WinRAR, and macOS disagree on how to
  interpret non-ASCII bytes. A password containing Thai characters or emoji can be set on
  one machine and be unopenable on another — permanent data loss.
- **Minimum 12 characters**, with a strength meter, rejecting anything too weak.
- **No composition requirement.** Mandating upper, lower, and digit produces predictable
  shapes (capital first, digits appended) such as `Minotaur2026`, which passes the rule
  while remaining easy to guess. NIST withdrew this guidance years ago on measured
  evidence. A generated passphrase like `correct horse battery staple` has no capitals and
  no digits and is far stronger.
- Reject any password containing the PIN, common passwords, and repeated or sequential
  runs (`aaaa`, `1234`, `qwerty`).
- A "generate for me" button produces a five-word passphrase with copy-to-clipboard.

**The last-used export password is remembered in `expo-secure-store`** (reachable only
after PIN unlock) and pre-filled on the next export. The user can change it at any time.
Most backups will therefore share one password the user actually knows, because a backup
that cannot be opened is not a backup.

---

## 7. Application Structure

```
src/
├── core/              no React, no Expo, no database
│   ├── money.ts       Decimal wrappers, decimal-place constants, parse/format
│   ├── fifo.ts        pure allocation functions
│   └── types.ts
├── db/
│   ├── schema.ts      DDL and migrations keyed to schema_version
│   └── repo.ts        CRUD only, no business logic
├── services/          glue: read the database, call core, write back
│   ├── ledger.ts      addLot / addSale / edit / delete, each followed by rebuild
│   ├── portfolio.ts   dashboard summary
│   ├── quotes.ts      prices, FX, caching
│   ├── backup.ts      archive export and import
│   └── lock.ts        PIN, timeout, recovery questions
├── report/
│   ├── html.ts        PDF template
│   └── csv.ts
└── app/               expo-router screens
```

The layering mirrors the web app's decision to keep business logic in `services.py` rather
than in views or models, pushed one step further: `core/` has no I/O at all.

### 7.1 Screens

```
(lock)/          PIN gate and first-run setup
(tabs)/
  index          Dashboard — portfolio value, unrealized gain, allocation chart
  lots           Buy transactions
  sales          Sell transactions
  more           Backup, PDF report, symbols, settings
symbols/         Manage tickers (section 7.4)
lot/[id]         Detail, evidence image, edit/delete
sale/[id]        Detail, and which lots it drew from
```

`sale/[id]` is the app's signature screen — it shows which lots a sale consumed, how much
from each, at what cost basis, for what gain. This is precisely what a spreadsheet cannot
do, and it deserves the most design attention.

### 7.2 Mobile-specific UI decisions

- Buy and sell forms are **full screens or bottom sheets, never modals**. The web app's
  Bootstrap modals break down on a small screen once the keyboard appears.
- `keyboardType="decimal-pad"` for quantities and prices, with `,` rejected on input.
- Native date pickers.
- A single small `zustand` store owns "reload from database"; screens subscribe to it. No
  Redux, no TanStack Query — the app is too small to earn either.

### 7.3 PDF report

`expo-print` renders HTML through the platform renderer, which brings a bonus: the same
HTML can be previewed in a `WebView` before export.

**The report must be shareable, not only viewable.** A phone screen is a poor surface for
reading a multi-page financial report. The expected use is taking the report somewhere —
opening it on a tablet or laptop while sitting with a tax officer, with the phone in hand
to show the corresponding evidence images inside the app and demonstrate that the report
matches the actual broker slips.

The report screen therefore offers three actions:

1. **Preview** in an in-app `WebView`
2. **Save** the PDF to device storage
3. **Share** through the Android share sheet via `expo-sharing` — email, Drive, LINE,
   AirDrop-equivalent, or a nearby device

As with backup export, sharing hands the file to the OS; the app never uploads it.

Two constraints:

1. **The report is English-only**, matching the existing `CSV_HEADERS` and PDF output, so
   it remains usable for a broker or the tax office. The app UI is Thai; the report is not.
   This also sidesteps embedding a Thai font in the PDF.
2. Page breaks require `page-break-after: always` in CSS to keep one ticker per page, as
   the ReportLab version does.

### 7.4 Symbol management

The web app has no user-facing way to create a `Symbol`. New tickers are added through
Django admin, which works for a single owner with server access. **Mobile has no admin, so
this has to become a real feature** — without it a user cannot record a purchase of any
ticker not already in the database.

**Ticker entry is a searchable combo field on the buy form.** The user types; matching
existing symbols are filtered live; if there is no match, the field offers "Add NVDA" 
inline. Adding never navigates away from the form being filled in.

On add, the app attempts to validate the ticker against the quote endpoint and populate
`name` from the response. **Validation is advisory, never blocking.** If the lookup fails
or the device is offline, the symbol is created anyway and flagged unverified, with the
name backfilled on a later successful lookup. Data entry must never depend on the network.

**Tickers are normalized to uppercase with whitespace trimmed before the uniqueness check**,
so `nvda`, `NVDA`, and `NVDA ` cannot become three separate symbols. The web app's
`unique=True` does not normalize, which would allow exactly that.

A **Symbols screen** under `more` lists every symbol with its usage count and allows
renaming the display name and deleting unused ones. Deletion is refused while any lot or
sale references the symbol, matching the `on_delete=PROTECT` behavior of the web app.

Symbols are carried in the backup. `lots.csv` and `sales.csv` reference a `ticker` rather
than a `symbol_id`, so import resolves each ticker to an existing symbol or creates one,
which keeps the CSVs readable and makes symbol identity stable across devices.

---

## 8. Monetization

**No advertising.**

The economics do not justify it. Thai AdMob eCPM runs roughly $0.30-1.00; 500 users at ten
impressions a month yields two to five dollars. The cost is declaring "Device or other IDs
— collected, shared, for advertising" in Play Store Data Safety, displayed prominently next
to a claim that we never touch the user's data.

Instead: **freemium with a one-time in-app purchase**, which earns the "No data collected"
Data Safety badge that Google itself displays on the listing. For a personal-finance app
that badge is the product's main differentiator. Twenty purchases at 99 THB already beats
advertising at this scale.

The split follows one rule:

> **Never hold the user's data hostage. Export is always free.**

- **Free:** unlimited buy/sell entry, FIFO matching, dashboard, evidence attachment,
  **`report.csv` export and full encrypted backup/restore**.
- **Paid:** the **PDF report**. Possibly multiple portfolios later.

Selling presentation rather than access to one's own data keeps the business model
consistent with the ownership claim.

### 8.1 Claims the app can actually make

"Fully offline" would be false — the dashboard and automatic FX need network access. The
following is true and independently verifiable:

> The app sends out only a **ticker symbol and a date** (to Yahoo for a price, to
> Frankfurter for an FX rate).
> It never transmits share quantities, cost basis, gains, evidence images, or any identity.
> No account, no login, no server of ours.

Stated honestly, requesting a quote for NVDA does tell Yahoo that an IP address is
interested in NVDA — *which tickers are watched*, never *how much is held*. A "full offline
mode" toggle can close even that channel, at the cost of manual FX entry.

**Publishing the repository is a free trust multiplier.** A public repo lets anyone verify
the claims above rather than take them on faith, which suits this positioning better than
any marketing copy. It also argues for keeping the mobile repo separate from the private
Django one.

---

## 9. Play Store Constraints

**A privacy policy URL is mandatory**, without exception, even for a fully offline app that
collects nothing. Google requires the Data Safety declaration to be backed by a real,
reachable policy document, and verifies the URL automatically.

**Do not host it on `fifo-by-minotaur.uk`.** That domain was bought to learn with and may
be allowed to lapse. If the URL dies the app gets flagged and eventually removed. **GitHub
Pages** is the right host: free permanently, version-controlled, no renewal to forget.

**Closed testing is the larger obstacle.** Personal developer accounts created after
November 2023 must run a closed test with a minimum number of opted-in testers
(approximately 12) continuously for 14 days before production access can be requested.
Google has revised this number at least once, so the current requirement must be confirmed
in the Play Console before planning a timeline. Recruiting testers needs to start early —
it affects the schedule far more than the privacy policy does.

Also required: a one-time $25 developer registration fee, identity verification, and a
public developer contact email on the listing.

---

## 10. Testing Strategy

- `core/fifo.ts` — unit and property tests under plain Node. No emulator, no database.
  Invariants: allocated quantity always equals sold quantity; allocations never exceed lot
  quantity; a lot is never allocated to a sale dated before its `buy_date`; rebuilding
  twice yields identical output.
- `core/money.ts` — round-trip tests across every decimal-place configuration, including
  the values that break floats.
- `services/backup.ts` — export then import must reproduce a byte-identical
  `backup.json`; Excel-mangled CSV fixtures must normalize to zero differences; a
  quantity-reducing CSV edit must fail the rebuild and roll back.
- `db/schema.ts` — migration tests from each prior `schema_version`.
- Symbol handling — `nvda`, `NVDA`, and `NVDA ` must resolve to one symbol; deleting a
  referenced symbol must be refused; importing a backup with an unknown ticker must create
  the symbol rather than fail.
- Screens — manual verification on a physical device. UI correctness is not claimed from
  test results.

---

## Open Items for Implementation Planning

- Repository name, license, and public/private decision for the new repo
- App display name and Play Store listing identity
- Quote source: Yahoo unofficial endpoint versus stooq CSV — needs a spike to compare
  reliability and rate limits from a mobile client
- KDF choice and parameters for the PIN and recovery-answer hashes
- Which ZIP library to use, verified to produce AES-256 archives that 7-Zip opens
