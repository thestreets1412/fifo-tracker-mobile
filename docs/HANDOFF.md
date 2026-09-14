# Session Handoff — 2026-09-14

State of `D:\Python\fifo-tracker-mobile` after implementing plan 8. Read this first if you
are picking the project up cold.

---

## One-paragraph summary

Plans 1–4 are built and locally merged. Plan 5 was committed and pushed on `develop`
as `6d2128d`. Plans 6–8 are implemented as uncommitted changes: encrypted ZIP
backup/restore, PIN lock, and RevenueCat-gated PDF reports. Android Metro/Hermes bundling
and automated tests pass; no native device checks have been performed. RevenueCat and
Google Play setup remain before a release build can unlock PDF. CSV and backup stay free.
Follow `AGENTS.md`.

## Verified state

| Fact | Value |
|---|---|
| Working branch | `develop` at `6d2128d`, with uncommitted plans 6–8 changes and the user's AGENTS.md update |
| `main` | `6b51e78`; no merge performed for plans 5 or 6 |
| Remote | `origin/develop` at `6d2128d`; plans 6–8 have not been committed or pushed |
| Tests | Full Jest run: 53 suites / 434 tests pass |
| Types | `npm run typecheck` clean |
| Schema | 2; schema-1 migration preserves the ledger and legacy evidence location |

Confirmed by running the suite on 2026-09-14, not carried over from an earlier session.
Final typecheck and Android Metro/Hermes export also pass (1,772 modules, 8.4 MB
bytecode). The dependency patch reapplies successfully with `--error-on-fail`.
No physical Android device or emulator was available. All test/tool caches and
artifacts are under the project (`.local-tools/` and ignored `dist/`).

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

**Plan 6 — encrypted backup and restore**
(`docs/superpowers/plans/2026-09-13-mobile-backup-restore.md`)
`src/backup/` implements JSON/CSV normalization, integrity checks, encrypted ZIP,
password policy and injectable operations. `src/services/backup.ts` captures and
replaces the ledger. `/backup` offers export/share, archive inspection, JSON/CSV
selection, confirmed replacement and access to durable automatic backups.

Evidence is staged in a new directory and read back before its pointer switches
alongside ledger rows in one SQLite transaction. Failed or interrupted preparation
leaves the existing data usable. The automatic archive is verified before any
replacement. Old evidence generations are removed during later export cleanup;
automatic backups are retained in app documents and should be shared off-device.

The archive is bounded to 64 MiB (compressed and expanded), 5,000 entries and
10,000 rows per table. Only encrypted AES-256 entries are accepted; no extraction
to arbitrary archive paths occurs. The pinned zip.js 2.14.1 needs the checked-in
`patch-package` patch to disable optional external codec imports for Hermes.
`postinstall` applies it. Node tests exchange real AES-256 archives with 7-Zip in
both directions; this is not proof of Android runtime compatibility.

**Plan 7 integration:** `configureBackupSecurity` now receives the lock session gate.
Remembering/prefilling the export password only works after PIN unlock. The backup
controller checks a session lease before and after long export/restore work, and rejects
an export password containing the actual six-digit PIN.

**Plan 7 — PIN lock**
(`docs/superpowers/plans/2026-09-14-mobile-app-lock.md`)
`src/services/lock.ts` is a React-free state machine with injected storage, time, and
biometric dependencies. Its versioned SecureStore record contains salted scrypt
verifiers, recovery questions, timeout/biometric settings, and persisted failed-attempt
state, never a PIN or recovery answer. Missing credentials after the configured marker
fails closed. `/settings` provides timeout, biometric opt-in, PIN change, and replacement
of all recovery questions.

The Android runtime uses strong biometrics with system credential fallback disabled and
holds FLAG_SECURE through Expo ScreenCapture. The timeout state machine checks wall and
monotonic time, clock rollback, and missed lifecycle pulses. PIN failures start a 30-second
lock at five attempts; recovery failures start a one-hour lock at three attempts; both
increase exponentially with caps. SQLCipher remains out of scope for v1.

**Plan 8 — PDF monetization**
(`docs/superpowers/plans/2026-09-14-mobile-monetization.md`)
`src/services/purchase.ts` is a React-free, injected RevenueCat entitlement controller.
`src/purchase/platform.ts` is the only native SDK boundary. `/report` now checks the
`pdf_reports` entitlement before every PDF preview/save/share action and displays a Thai
paywall with the current Google Play price, purchase, and restore controls. CSV remains
ungated. A missing build-time RevenueCat API key fails closed: PDF stays locked.

`plugins/withRevenueCatLaunchMode.js` sets Android MainActivity to `singleTop` through
Expo CNG so external banking/payment activity does not cancel a purchase. The RevenueCat
SDK receives no portfolio data, subscriber attributes, diagnostics, or attribution IDs;
billing necessarily uses Google Play and RevenueCat with an anonymous app-install identity.

## What is left

All eight approved plans are implemented. Before release, configure the RevenueCat project,
Google Play one-time product, `pdf_reports` entitlement, current lifetime offering, and the
`EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY` EAS build variable. These are external account
actions and were not performed in this workspace. Follow `AGENTS.md` for any future work.

## Remaining implementation uncertainties

From the spec's own "Open Items for Implementation Planning" section, still open:

- ZIP interoperability is verified on Node, and the Android bundle compiles. Native
  React Native file/crypto/ZIP behavior still needs the device pass below.
- Repository visibility, app display name, and Play Store listing identity — blocks the
  plan 8 store submission, not the code.
- RevenueCat project/product/entitlement and EAS Android public API key have not been
  created or configured. A build without the key deliberately keeps PDF locked.

The quote-source question from that same list was resolved during plan 4: Yahoo first,
stooq as fallback.

## Owed before any release

**A human device pass.** No Android device or emulator has been used in this project.
Every manual-verification checklist item in plans 3 through 8 is deferred and
unconfirmed. The automated proxy used instead was `npm run typecheck && npm test` plus
`npx expo export --platform android` to prove the bundle builds under Metro and Hermes.
That proves it compiles and bundles. It does not prove a single screen renders.

For plan 5 specifically: verify full-screen preview scroll/zoom and back navigation,
PDF margins and long tables on the Android print engine, SAF cancellation/save and
opening from Files, sharing/opening on another device, and airplane-mode operation.
PDF actions are entitlement-gated; verify the purchase flow on Android before release.

For plan 6: verify an evidence-containing archive through 7-Zip on another machine
and back into Android, picker/share cancellation, cold restart after restore,
interruption while staging images, CSV conflict/fallback choices, keyboard and
password-copy behavior, large-archive memory/time, and airplane-mode operation.

For plan 7: build a fresh Android app because LocalAuthentication and ScreenCapture are
native modules. Verify first setup, PIN and strong-biometric unlock, recovery after failed
PIN attempts, timeout while backgrounded, Android app-switcher redaction, keyboard
behavior, and export/restore interrupted by locking.

For plan 8: build a fresh Android development or release build because RevenueCat is a
native module. In Google Play test billing, verify localized lifetime price, purchase,
cancel, network failure, restore after reinstall, backgrounding through a payment app,
and that preview/save/share remain locked without the active entitlement while CSV remains
available. Review Data Safety and the privacy policy before submission: billing traffic is
an exception to the portfolio-network claim but no portfolio data is sent.

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
- Commit, merge and push require explicit authorization. Plan 5's authorized commit
  and push are complete; that permission does not cover plans 6–8.
- Plans 1 through 4 were all executed with `superpowers:subagent-driven-development`: a
  fresh implementer subagent per task, a task-scoped review after each, and one
  whole-branch review at the end. Plans 5–8 were implemented and reviewed in the
  current Codex task without subagents. Do not claim an independent agent review.
- The SDD ledger under `.superpowers/sdd/` is git-ignored scratch and is deleted when a
  plan completes. It does not exist right now, which is correct.

## Suggested opening line for the next session

> Follow AGENTS.md and read HANDOFF.md. Plans 6–8 are implemented but uncommitted;
> native device and external RevenueCat/Google Play setup remain before release.
