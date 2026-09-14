# Plan 6 — Backup and Restore: Implementation Decisions

Requirements: [approved design](../specs/2026-09-12-mobile-standalone-design.md),
sections 4, 6.4, 7.4 and 10. This document records implementation decisions rather
than duplicating the specification.

- ZIP: `@zip.js/zip.js` 2.14.1, native JavaScript compression/crypto path, workers
  and compression streams disabled. Expo Crypto supplies secure random values;
  Web Streams are polyfilled only when absent. No WASM or network codec loading.
  A two-line `patch-package` patch disables optional dynamic codec imports in
  both ESM and CJS builds, which Hermes cannot compile. Keep the version pinned
  and revalidate the patch, AES interoperability and Android bundle on upgrades.
- Backups contain encrypted JSON, both CSVs and referenced evidence; all payload
  files have SHA-256 checksums. JSON/evidence checksum failures are fatal. Changed
  CSV checksums trigger normalization and a genuine-value comparison. Users
  choose JSON or CSV wholesale; malformed CSV offers explicit JSON fallback.
- IDs and UTC creation times survive restore. CSV ticker identity is normalized;
  an original row ID disambiguates Excel's removal of numeric-ticker leading
  zeros. Slash dates mean day/month/year. Numeric strings accept scientific
  notation but reject excess precision rather than rounding away an edit.
- Schema 2 adds only `evidence_storage`, a singleton containing a **bare directory
  name**. Restore writes and verifies a fresh evidence generation, then replaces
  ledger rows, rebuilds FIFO and switches that pointer in one SQLite transaction.
  Failure or process interruption before commit leaves the old ledger and images
  usable. Interrupted staging may leave an unreferenced directory; later export
  cleanup removes inactive generations. No cross-filesystem rename is relied on.
  Archive schema versions 1 and 2 use the same ledger payload and are accepted.
- Before replacement, a complete encrypted automatic backup is written to app
  documents and read back for verification. It is retained across restarts and
  listed for sharing or restoring. It is not dependent on a share-sheet result.
  Normal export files remain in the dedicated cache for 24 hours; the next export
  cleans expired files. Automatic backups are not expired automatically.
- The in-memory archive implementation limits both archive and expanded content
  to 64 MiB, at most 5,000 entries and 10,000 rows per table. Unsupported inputs
  fail before replacement. Larger portfolios require a future streaming design.
- Passwords use local zxcvbn dictionaries, ASCII 12–128 characters, a score of at
  least 3, and explicit repetition/sequence rejection. Five-word generation uses
  rejection-sampled native randomness and the bundled English word dictionary.
  No password is logged. A Plan 7 session gate connects PIN-containment checks and
  SecureStore remembering/prefilling; the latter fails closed until that gate
  exists. Manual export/restore passwords work now.

## Verification

Automated checks cover canonical JSON round trips, Excel normalization, conflicts,
malformed CSV fallback, checksum damage, financial/FIFO rollback, schema migration,
stale/concurrent operations, automatic-backup ordering, picker cancellation,
write/read/share failures, password policy and secure-session gating. AES-256
archives were exchanged in both directions with the bundled 7-Zip test binary,
including a spike without crypto.subtle, CompressionStream or WebAssembly.
See [HANDOFF](../../HANDOFF.md) for final test totals and status.

Still requires physical Android verification: export/import with evidence,
DocumentPicker and share sheet (including cancellation), cold restart after
restore, interruption during staging, screen/keyboard behavior, passphrase copy,
large-archive memory/time, and airplane-mode operation. Desktop tests and a
successful Metro/Hermes bundle do not establish native runtime compatibility.

References: [Expo v57](https://docs.expo.dev/versions/v57.0.0/),
[DocumentPicker](https://docs.expo.dev/versions/v57.0.0/sdk/document-picker/),
[Crypto](https://docs.expo.dev/versions/v57.0.0/sdk/crypto/),
[zip.js](https://gildas-lormeau.github.io/zip.js/).
