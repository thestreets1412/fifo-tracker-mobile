export function safeEvidenceName(name: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9_.-]{0,179}$/.test(name) && !name.includes('..') && !name.endsWith('.');
}
