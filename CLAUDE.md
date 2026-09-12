# CLAUDE.md

Guidance for Claude Code when working in this repository.

## Project

A standalone Android app for tracking personal stock trades with FIFO cost-basis
accounting and dual USD/THB currency. Everything lives on the user's device: no account, no
login, no server. Built with Expo and React Native, distributed free through the Play
Store, with a paid PDF report as the only monetization.

The design is fully specified before any code is written. **Read
`docs/superpowers/specs/2026-09-12-mobile-standalone-design.md` before making any
non-trivial change.** It records not just what was decided but why, including several
decisions that look wrong without their reasoning.

This project derives from a Django web app at `D:\Python\stock-fifo-web-app`, which
continues to run independently. **The two share no code and no data, and neither should
ever reach into the other.** A read-only snapshot of the parts worth porting is in
`docs/reference/` — read that rather than the other directory.

## Status

Pre-implementation. Plan 1 of 8 is written; no source code exists yet.

## Commands

```bash
npm test                 # Jest, plain Node — core/ needs no emulator
npm test -- fifo         # one suite
npx expo start           # dev server (once the app shell exists, plan 3)
```

## Non-Negotiable Rules

These are correctness constraints, not style preferences. Breaking any of them corrupts
financial data silently.

**Money never touches a JavaScript `number`.** Every monetary or quantity value is a
`decimal.js` `Decimal`. Strings in from the form, `Decimal` through the logic, strings out
to SQLite. `number` is allowed only for chart rendering.

**SQLite columns holding money or quantities are `TEXT`, never `REAL`.** `REAL` is float64.
Values are stored as fixed-precision decimal strings: price 6 dp, quantity 8 dp, FX rate
4 dp, money 4 dp.

**Never `SUM()` a money or quantity column in SQL.** SQLite silently coerces `TEXT` to
float for aggregation, which undoes the whole point of storing it as `TEXT`. Fetch the rows
and sum them in JavaScript with `decimal.js`.

**Rounding is `ROUND_HALF_EVEN` everywhere**, matching how Django quantized the same
fields, so ported values agree with the original.

**`src/core/` imports nothing from React, Expo, or `src/db/`.** It is the money-critical
layer and it stays testable under plain Node. A test enforces this by scanning the source;
do not weaken it.

**Allocations are derived, never authoritative.** `lots` and `sales` are the truth. Any
mutation clears `sale_allocations` and replays every sale through `rebuildAllocations()`.
Never hand-edit an allocation row.

**`PRAGMA foreign_keys = ON` on every connection.** `expo-sqlite` defaults it off.

**Evidence images are stored by filename, never absolute path.** Absolute paths to the app
document directory change between installs, which would orphan every image.

## Architecture

```
src/
├── core/       pure: money.ts, types.ts, fifo.ts, derive.ts — no I/O at all
├── db/         schema.ts (DDL + migrations), repo.ts (CRUD only, no logic)
├── services/   ledger, portfolio, quotes, backup, lock — glue between core and db
├── report/     html.ts (PDF template), csv.ts
└── app/        expo-router screens
```

The layering mirrors the Django app's choice to keep logic in `services.py` rather than in
views or models, pushed one step further: `core/` has no I/O whatsoever.

## Privacy Is a Product Constraint

The app's central promise is that the developer cannot see a user's portfolio, because no
mechanism exists by which it could be transmitted. Treat this as a hard constraint on every
change, not marketing copy.

The only outbound requests permitted are a ticker symbol to a quote endpoint and a date to
the FX endpoint. Quantities, cost basis, gains, evidence images, and any identifier must
never leave the device. No analytics, no crash reporting that includes user data, no
advertising SDK. Export and share hand a file to the OS share sheet; the app never uploads.

Any API key shipped in the APK is public, so keyed services cannot be used without a proxy,
and a proxy would contradict standalone operation.

## Planning Artifacts

- `docs/superpowers/specs/` — approved design. Change it through discussion, not in passing.
- `docs/superpowers/plans/` — implementation plans, one per subsystem, eight in total.
- `docs/reference/` — read-only snapshot of the Django original. Never imported or run.
- `.claude/skills/fifo-stock-tracker-design-system/` — the shared visual language. Consult
  it for colors, type, spacing, and component behavior rather than inventing new values.
