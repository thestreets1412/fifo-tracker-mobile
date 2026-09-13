# Session Handoff — 2026-09-13

State of `D:\Python\fifo-tracker-mobile` after implementing plan 5. Read this first if you
are picking the project up cold.

---

## One-paragraph summary

Plans 1–4 are built and locally merged. Plan 5 is implemented as uncommitted changes
on `develop`: English PDF/CSV reports, whole-portfolio or single-ticker selection,
HTML preview, save and share, and actual PDF footers. Its automated checks pass;
desktop Chromium PDF rendering was visually inspected, but the Android UI, printer,
picker and share sheet have not been exercised on a device or emulator. Plans 6–8
(backup/restore, PIN lock, monetization) still need implementation plans. PDF access
is intentionally open for testing until plan 8; CSV remains free.

## Verified state

| Fact | Value |
|---|---|
| Working branch | `develop` at `77ceb37`, with uncommitted plan-5 changes |
| `main` | `6b51e78`; `develop` has one additional committed handoff document plus uncommitted plan 5 |
| Unpushed | `main` is 26 commits ahead of `origin/main`; nothing has been pushed |
| Tests | 39 suites, 347 tests, all passing (Jest, serial, project-local cache) |
| Types | `npm run typecheck` clean |
| Source files | 107 under `src/` |

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

**Plan 5 — PDF and CSV reports**
(`docs/superpowers/plans/2026-09-13-mobile-pdf-csv-report.md`)
`src/services/report.ts` captures the ledger in one read transaction. `src/report/`
renders the English HTML and CSV, stamps actual PDF pages with `pdf-lib`, and
coordinates file generation through injected dependencies. `platform.ts` connects
Expo Print, FileSystem v57 and Sharing. `/report` provides selection, full-screen
HTML preview, and save/share for both formats. No schema or core changes.

The user explicitly chose: include free CSV now; let tickers continue across pages;
offer all/one-ticker reports; keep real PDF page numbers; enable PDF for testing
until plan 8. Preview is HTML, not a PDF viewer. The printer adds pagination and
the footer afterward. No owner/date-filter/evidence/live-price additions.

Validation: typecheck and 347 Jest tests pass, Android Metro/Hermes export passes,
and 3-page/11-page desktop Chromium PDFs were inspected with Poppler and pypdf/
pdfplumber (page numbers, repeated headers, margins, no trailing blank page).
The long document is a synthetic layout stress fixture, not an accounting sample.
These are proxies only: no Android screen or native interaction has been verified.

## What is left

Plans 6 through 8 exist only as spec sections. **No plan documents have been written
for them.** Write and agree each implementation plan before executing it. The
`superpowers:writing-plans` skill referenced by earlier sessions was unavailable
in the plan-5 Codex session; the user approved the plan directly instead.

| # | Subsystem | Spec sections | Notes |
|---|---|---|---|
| 6 | Backup and restore | §4.1–§4.6 | One AES-256 ZIP containing `manifest.json`, `backup.json`, `lots.csv`, `sales.csv`, `evidence/`. Restore is replace-only and auto-exports first. Export hands the file to the share sheet; the app never uploads. |
| 7 | PIN lock | §6.1–§6.4 | PIN, recovery answers, data at rest, and a separate export password. The export password is deliberately not the PIN — §6.4 explains why. |
| 8 | Monetization | §8, §8.1 | One-time in-app purchase, no advertising. PDF report is the only paid feature; export and backup stay free. |

The two remaining disabled rows in `src/app/(tabs)/more.tsx` cover backup/restore
and settings/lock. Plan 8 must gate PDF actions in `/report`; CSV stays ungated.

## Blockers to resolve before planning 6–8

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

**A human device pass.** No Android device or emulator has been used in this project.
Every manual-verification checklist item in plans 3, 4 and 5 is deferred and
unconfirmed. The automated proxy used instead was `npm run typecheck && npm test` plus
`npx expo export --platform android` to prove the bundle builds under Metro and Hermes.
That proves it compiles and bundles. It does not prove a single screen renders.

For plan 5 specifically: verify full-screen preview scroll/zoom and back navigation,
PDF margins and long tables on the Android print engine, SAF cancellation/save and
opening from Files, sharing/opening on another device, and airplane-mode operation.
PDF currently has no entitlement gate, by user decision; add it in plan 8 before release.

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
  whole-branch review at the end. Plan 5 was implemented and reviewed in the current
  Codex task without subagents. Do not describe it as independently subagent-reviewed.
- The SDD ledger under `.superpowers/sdd/` is git-ignored scratch and is deleted when a
  plan completes. It does not exist right now, which is correct.

## Suggested opening line for the next session

> Read `docs/HANDOFF.md`. Plan 5 is implemented but needs an Android device pass.
> For plan 6, first resolve the React Native AES-256 ZIP compatibility question,
> then write the backup/restore plan from spec §4 before implementing it.
