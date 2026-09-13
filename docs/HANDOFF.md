# Session Handoff — 2026-09-13

State of `D:\Python\fifo-tracker-mobile` at the end of plan 4. Read this first if you
are picking the project up cold.

---

## One-paragraph summary

Four of the eight planned subsystems are built, reviewed, and merged. The app has a
working money engine, an on-device SQLite ledger, a full buy/sell transaction UI, and a
live portfolio dashboard with keyless quotes and FX. Plans 5 through 8 — PDF report,
backup/restore, PIN lock, and monetization — have not been written yet; only the spec
describes them. Nothing has ever run on a real Android device or emulator, so every
manual-verification item from plans 3 and 4 is still unconfirmed.

## Verified state

| Fact | Value |
|---|---|
| Working branch | `develop` (clean) |
| `main` | `6b51e78`, fast-forwarded from `develop`, identical content |
| Unpushed | `main` is 26 commits ahead of `origin/main`; nothing has been pushed |
| Tests | 32 suites, 296 tests, all passing (`npm test`) |
| Types | `npm run typecheck` clean |
| Source files | 89 under `src/` |

Confirmed by running the suite on 2026-09-13, not carried over from an earlier session.

## What is done

**Plan 1 — core engine** (`docs/superpowers/plans/2026-09-12-mobile-core-engine.md`)
`src/core/`: `money.ts`, `types.ts`, `fifo.ts`, `derive.ts`. Pure TypeScript, no I/O,
no React, no database. `src/core/__tests__/isolation.test.ts` asserts the exact file
list and fails if anything else appears in the directory.

**Plan 2 — persistence and ledger**
(`docs/superpowers/plans/2026-09-12-mobile-persistence-ledger.md`)
`src/db/` (`sqlDatabase.ts`, `connection.ts`, `schema.ts`, `repo.ts`) and
`src/services/ledger.ts`. Every mutation runs in one transaction that clears and
replays all allocations. Tests run against real in-memory SQLite through
`better-sqlite3`, not mocks.

**Plan 3 — app shell and transaction UI**
(`docs/superpowers/plans/2026-09-13-mobile-app-shell-transaction-ui.md`)
Expo Router shell, `zustand` store holding the database handle and a `dataVersion`
counter, lot and sale forms, list screens, the which-lots-did-this-sale-consume detail
screen, evidence image attachment, symbol management. All testable logic lives in
React-free modules under `src/ui/`.

**Plan 4 — quotes, FX, dashboard**
(`docs/superpowers/plans/2026-09-13-mobile-quotes-fx-dashboard.md`)
`src/services/http.ts`, `fx.ts`, `quotes.ts`, `portfolio.ts`, `symbolLookup.ts`, plus
the live Dashboard, `FxRateField`, `AllocationBar`, `StatTile`. `fetch` is an injected
dependency throughout, so no test ever touches the network.

## What is left

Plans 5 through 8 exist only as spec sections. **No plan documents have been written for
them.** Each needs `superpowers:writing-plans` before it can be executed.

| # | Subsystem | Spec sections | Notes |
|---|---|---|---|
| 5 | PDF report | §7.3, §4.2 | `expo-print` renders HTML; preview in WebView, save, share. Report is English-only on purpose. One ticker per page via `page-break-after: always`. Port the layout from `docs/reference/django/reports.py`. |
| 6 | Backup and restore | §4.1–§4.6 | One AES-256 ZIP containing `manifest.json`, `backup.json`, `lots.csv`, `sales.csv`, `evidence/`. Restore is replace-only and auto-exports first. Export hands the file to the share sheet; the app never uploads. |
| 7 | PIN lock | §6.1–§6.4 | PIN, recovery answers, data at rest, and a separate export password. The export password is deliberately not the PIN — §6.4 explains why. |
| 8 | Monetization | §8, §8.1 | One-time in-app purchase, no advertising. PDF report is the only paid feature; export and backup stay free. |

The three disabled rows in `src/app/(tabs)/more.tsx` are the entry points these plans
will fill in.

## Blockers to resolve before planning 5–8

From the spec's own "Open Items for Implementation Planning" section, still open:

- **KDF choice and parameters** for the PIN and recovery-answer hashes — blocks plan 7.
- **Which ZIP library** produces AES-256 archives that 7-Zip opens, verified on React
  Native — blocks plan 6. This is the riskiest unknown in the remaining work; the whole
  backup design assumes it exists.
- Repository visibility, app display name, and Play Store listing identity — blocks the
  plan 8 store submission, not the code.

The quote-source question from that same list was resolved during plan 4: Yahoo first,
stooq as fallback.

## Owed before any release

**A human device pass.** No Android device, emulator, or web target was available in any
session so far. Every manual-verification checklist item in plans 3 and 4 is deferred and
unconfirmed. The automated proxy used instead was `npm run typecheck && npm test` plus
`npx expo export --platform android` to prove the bundle builds under Metro and Hermes.
That proves it compiles and bundles. It does not prove a single screen renders.

## Known deferred items

Surfaced by plan 4's whole-branch review, judged not worth fixing at the time. Worth
addressing if a future plan touches the same area:

- The Dashboard recomputes remaining quantity per symbol in a `useMemo`, duplicating
  logic `src/services/portfolio.ts` already has, and issuing a second N+1 round of
  queries. Fix by exporting `listSymbolsNeedingPrice(db)` from `portfolio.ts`.
- `isFresh` is duplicated verbatim between `src/services/fx.ts` and
  `src/services/quotes.ts`.
- `NetDeps`, `defaultNetDeps`, and `CACHE_TTL_MS` live in `fx.ts`, which forces
  `quotes.ts` to import from `fx.ts` for unrelated reasons. They belong in `http.ts` or a
  new `net.ts`.
- `listPortfolioSymbols`'s raw SQL lives in `services/portfolio.ts` rather than
  `db/repo.ts`.
- Fully-sold symbols still render permanent zero rows in the dashboard's per-symbol list.
- The "ดึงชื่อจากอินเทอร์เน็ต" button renders even when the symbol list is empty.
- `chartPalette` still has entries matching `color.danger` and `color.warning`. The
  collisions with `color.gain` and `color.actionPrimary` were fixed.
- A freshly fetched quote is returned without being rounded to `DP.price`; only the
  cached copy is rounded.

## Where a new session should start

Read in this order. Do not read ahead of what you need.

1. `CLAUDE.md` — loads automatically. Eight non-negotiable rules; breaking any of them
   corrupts financial data silently.
2. `docs/superpowers/specs/2026-09-12-mobile-standalone-design.md` — the authority. Ten
   sections covering what was decided and why. Several decisions look wrong without their
   reasoning, notably why allocations are rebuildable rather than authoritative (§2.4)
   and why the export password is separate from the PIN (§6.4).
3. This file.
4. The plan document for whatever you are about to work on, if one exists.

Read only when the work actually touches them:

- `docs/reference/README.md` — before opening anything else in `docs/reference/`. It
  documents four deliberate differences from the Django original.
- `docs/reference/django/reports.py` and `docs/reference/django/tokens/` — plan 5.
- `.claude/skills/fifo-stock-tracker-design-system/` — any screen work.

## Branch and process conventions

- `develop` is the long-lived working branch for plans 4 through 8. It is never deleted
  after a merge, which is a deliberate departure from the
  `superpowers:finishing-a-development-branch` default.
- Each plan is merged into `main` locally as a fast-forward once its final review is
  clean. `main` has never been pushed.
- Pushing to `origin` requires explicit permission each time. It has not been given.
- Plans 1 through 4 were all executed with `superpowers:subagent-driven-development`: a
  fresh implementer subagent per task, a task-scoped review after each, and one
  whole-branch review at the end. Continue that pattern.
- The SDD ledger under `.superpowers/sdd/` is git-ignored scratch and is deleted when a
  plan completes. It does not exist right now, which is correct.

## Suggested opening line for the next session

> Read `docs/HANDOFF.md`, then write plan 5 (the PDF report) with
> `superpowers:writing-plans`, working from spec §7.3 and
> `docs/reference/django/reports.py`.
