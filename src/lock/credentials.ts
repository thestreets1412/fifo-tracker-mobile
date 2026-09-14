// 32 MiB working memory. JS cannot parallelize scrypt, so p=1 avoids a
// 3x UI delay without pretending that sequential work is parallel work.
export const KDF = { algorithm: 'scrypt', N: 32768, r: 8, p: 1, dkLen: 32 } as const;
export const TIMEOUTS = [0, 60000, 300000, 900000] as const;
export interface Verifier { salt: string; hash: string }
export interface Attempts { failures: number; blockedUntil: number }
export interface LockRecord {
  version: 1; kdf: typeof KDF; pin: Verifier; recovery: Verifier;
  questions: string[]; timeout: number; biometrics: boolean;
  pinAttempts: Attempts; recoveryAttempts: Attempts; lastWall: number;
}
export const freshAttempts = (): Attempts => ({ failures: 0, blockedUntil: 0 });
export function validatePin(pin: string): void {
  if (!/^\d{6}$/.test(pin)) throw new Error('PIN ต้องเป็นตัวเลข 6 หลัก');
}
export function normalizeAnswers(answers: string[]): string {
  if (answers.length !== 3) throw new Error('กรุณาตอบให้ครบทั้ง 3 ข้อ');
  const normalized = answers.map(a => a.trim().toUpperCase());
  if (normalized.some(a => [...a].length < 4 || a.length > 256)) throw new Error('คำตอบแต่ละข้อใช้ 4–256 ตัวอักษร');
  // Length-delimited JSON prevents collisions between adjacent answers.
  return JSON.stringify(normalized);
}
export function validateQuestions(questions: string[]): string[] {
  const q = questions.map(s => s.trim());
  if (q.length !== 3 || q.some(s => s.length < 8 || s.length > 100) || new Set(q.map(s => s.toUpperCase())).size !== 3) throw new Error('เขียนคำถามต่างกัน 3 ข้อ ข้อละ 8–100 ตัวอักษร');
  return q;
}
export function reserveAttempt(previous: Attempts, kind: 'pin' | 'recovery', now: number): Attempts {
  const failures = Math.min(previous.failures + 1, 1000000);
  const threshold = kind === 'pin' ? 5 : 3;
  const base = kind === 'pin' ? 30000 : 3600000;
  const cap = kind === 'pin' ? 86400000 : 7 * 86400000;
  return { failures, blockedUntil: failures < threshold ? 0 : now + Math.min(cap, base * 2 ** Math.min(20, failures - threshold)) };
}
export function parseLockRecord(value: string): LockRecord {
  const r = JSON.parse(value) as LockRecord;
  const validVerifier = (v: Verifier) => v && /^[a-f0-9]{32}$/.test(v.salt) && /^[a-f0-9]{64}$/.test(v.hash);
  const validAttempts = (a: Attempts) => a && Number.isSafeInteger(a.failures) && a.failures >= 0 && a.failures <= 1000000 && Number.isSafeInteger(a.blockedUntil) && a.blockedUntil >= 0;
  if (!r || r.version !== 1 || Object.entries(KDF).some(([k, v]) => r.kdf?.[k as keyof typeof KDF] !== v)
    || !validVerifier(r.pin) || !validVerifier(r.recovery) || !validAttempts(r.pinAttempts) || !validAttempts(r.recoveryAttempts)
    || !TIMEOUTS.includes(r.timeout as typeof TIMEOUTS[number]) || typeof r.biometrics !== 'boolean'
    || !Number.isSafeInteger(r.lastWall) || r.lastWall < 0) throw new Error('Invalid lock record');
  validateQuestions(r.questions);
  return r;
}
