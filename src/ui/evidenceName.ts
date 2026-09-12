/**
 * A bare, collision-resistant filename for a picked evidence image.
 * Only hex digits, a dot, and the extension — so it can never contain a
 * path separator, satisfying ledger.validateEvidenceFile (CLAUDE.md:
 * evidence is stored by filename, never an absolute path).
 */
export function generateEvidenceFilename(source: string): string {
  const match = /\.([A-Za-z0-9]+)(?:\?.*)?$/.exec(source.trim());
  const ext = (match?.[1] ?? 'jpg').toLowerCase();
  const rand = (Math.random().toString(16).slice(2) + Math.random().toString(16).slice(2)).slice(0, 16);
  const stamp = Date.now().toString(16);
  return `${stamp}${rand}.${ext}`;
}
