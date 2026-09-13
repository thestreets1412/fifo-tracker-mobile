# Plan 5 — FIFO PDF and CSV Reports

Approved 2026-09-13. Implement on `develop`. No push or publication. All workstation
outputs, tool caches and temporary files stay inside this repository.

## Agreed behavior

- Thai report screen, English documents. Entire portfolio (default) or one ticker.
- PDF preview, save and share; CSV save and share. CSV remains free. PDF is enabled
  for testing until plan 8 adds purchase checks, including before release.
- A4 portrait, 18 mm margins, cover, ticker sections, portfolio summary, original
  Django headings/columns/colors. Each ticker starts on a fresh page and may continue.
- Actual PDF page numbers and generation time on every page, added using pdf-lib.
- No date filters, owner names, evidence embedding, live quotes, backup or billing.

## Implementation tasks

1. Shared report model and read-only transaction: read each ledger table once; use
   existing Decimal domain functions; deterministic FIFO ordering; include sold-out
   symbols and exclude unused symbols. No schema or core-file additions.
2. CSV: original 13 ledger columns, BUY LOT / SALE / allocation / totals / summary;
   price 6dp, quantity 8dp, FX 4dp, money 2dp; HALF_EVEN; UTF-8 BOM, CRLF, CSV
   quoting and spreadsheet-formula protection for user text only.
3. HTML: escape user text; no scripts or remote resources; white formal report;
   repeat table headers and allow overflow without truncation. expo-print renders
   A4; pdf-lib stamps Helvetica 8pt footer below the content margin.
4. Platform adapter: Expo v57 File/Directory/Paths, expo-print, expo-sharing,
   react-native-webview, pdf-lib. Unique report-cache files; directory picker for
   save; OS sheet for share. Cancellation is normal. Clean incomplete files and
   intermediate PDF; only report cache older than 24h is swept on next export.
5. `/report` screen: existing theme/components; full-screen HTML preview with JS
   disabled and external navigation blocked; clear pagination explanation. Empty,
   busy, failure and retry states. dataVersion/filter invalidates old content;
   in-flight operations retain their snapshot, with duplicate presses prevented.
6. Validation and handoff: arithmetic/database, CSV, HTML, real PDF fixture and
   injected adapter tests; typecheck and Jest after components of work; final
   Android Metro/Hermes export and whole-change review. Update HANDOFF/CLAUDE status.

## Interfaces

- `buildFifoReport(db, { symbolId?, generatedAt }): FifoReport`
- `renderReportHtml(report): string`
- `renderReportCsv(report): string`
- `stampPdfFooter(bytes, generatedAt): Promise<Uint8Array>`

Report sections hold domain lots/sales, ordered allocation details, remaining
quantities/costs and realized gains. All money and quantity fields remain Decimal
until formatting. A transaction ends before any native dialog or file creation.

## Acceptance scenarios

Empty, buys only, partial/full sale, multiple tickers, single filter, multiple lots
per sale, same timestamp ties, fees, positive/negative/zero gain, fractional shares,
HALF_EVEN boundaries, Dashboard agreement, edits/deletes, no ledger mutation;
CSV escaping/precision/formula safety; HTML escaping/order/page breaks; multipage
PDF footer and valid reload; cancellation and print/write/share failures; duplicate
presses and snapshot changes.

## Human Android verification (required before release)

- Preview scrolling and zoom; all actions in airplane mode.
- A4 output, long tickers/numbers, many rows, repeated table headers, allocations
  retained, footer not overlapping content, no trailing blank page.
- Save through Android picker, open from Files, share and open on another device.
- Cancel picker/share, retry failures, switch filters after transaction edits.

Build success alone never marks these checks as passed.

## References

- Spec sections 2, 4.2, 7.3, 8 and 10; docs/reference/README.md and django/reports.py.
- https://docs.expo.dev/versions/v57.0.0/
- https://docs.expo.dev/versions/v57.0.0/sdk/print/
- https://docs.expo.dev/versions/v57.0.0/sdk/sharing/
- https://pdf-lib.js.org/

The referenced superpowers writing-plans skill is not available in this session;
this document records the approved plan directly. No external project is imported
or modified.

## Implementation result — 2026-09-13

- Tasks 1–6 implemented on `develop`, left uncommitted for review.
- 39 suites / 347 tests passed; TypeScript clean; Android Metro/Hermes export passed.
- Desktop Chromium proxy PDFs (3 and 11 pages) rendered and inspected. Page numbers,
  table continuation, repeated headers and clear footer margins verified in that engine.
- All human Android checks above remain unconfirmed. PDF remains enabled for testing.
- Tool outputs live in ignored `.local-tools/` (including temporary tool configuration,
  synthetic PDF/PNG QA fixtures and caches) and `dist/`. No push, merge or publication.
