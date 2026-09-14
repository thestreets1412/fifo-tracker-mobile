import { freshAttempts, KDF, normalizeAnswers, parseLockRecord, reserveAttempt, TIMEOUTS, validatePin, validateQuestions, type LockRecord, type Verifier } from '../lock/credentials';

export interface LockDependencies {
  read(): Promise<string | null>; write(value: string): Promise<void>;
  hasMarker(): Promise<boolean>; markConfigured(): Promise<void>;
  derive(secret: string, salt: string): Promise<string>; verify(secret: string, verifier: Verifier): Promise<boolean>;
  salt(): string; now(): number; monotonic(): number;
  biometricAvailable(): Promise<boolean>;
  authenticate(): Promise<'success' | 'failure' | 'cancelled'>;
}
export interface LockSnapshot {
  mode: 'loading' | 'setup' | 'locked' | 'unlocked' | 'error'; active: boolean; busy: boolean;
  questions: string[]; timeout: number; biometrics: boolean; pinUntil: number; recoveryUntil: number;
  clock: number; error?: string; session: number;
}
export class LockController {
  private record: LockRecord | null = null;
  private state: LockSnapshot = { mode: 'loading', active: true, busy: false, questions: [], timeout: 60000, biometrics: false, pinUntil: 0, recoveryUntil: 0, clock: 0, session: 0 };
  private listeners = new Set<() => void>();
  private generation = 0;
  private left: { wall: number; mono: number } | null = null;
  private pulse: { wall: number; mono: number } | null = null;
  private biometricPending = false;
  constructor(private deps: LockDependencies) {}
  snapshot = (): LockSnapshot => this.state;
  subscribe = (fn: () => void): (() => void) => { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; };
  private emit(patch: Partial<LockSnapshot> = {}) {
    this.state = { ...this.state, ...patch, clock: this.clock(), questions: this.record?.questions ?? [], timeout: this.record?.timeout ?? 60000, biometrics: this.record?.biometrics ?? false, pinUntil: this.record?.pinAttempts.blockedUntil ?? 0, recoveryUntil: this.record?.recoveryAttempts.blockedUntil ?? 0 };
    this.listeners.forEach(fn => fn());
  }
  private clock(): number { return Math.max(this.deps.now(), this.record?.lastWall ?? 0); }
  private fatal(): never {
    this.generation++; this.emit({ mode: 'error', session: this.state.session + 1, error: 'อ่านหรือบันทึกข้อมูลล็อกไม่สำเร็จ กรุณาลองใหม่ ข้อมูลพอร์ตยังอยู่' });
    throw new Error('ไม่สามารถเข้าถึงข้อมูลล็อกได้');
  }
  private async save(record: LockRecord): Promise<void> {
    try { await this.deps.write(JSON.stringify(record)); this.record = record; this.emit(); }
    catch { this.fatal(); }
  }
  private async exclusive<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state.busy) throw new Error('กำลังทำรายการ กรุณารอสักครู่');
    this.emit({ busy: true });
    try { return await fn(); } finally { this.emit({ busy: false }); }
  }
  initialize(): Promise<void> {
    return this.exclusive(async () => {
      this.generation++; this.emit({ mode: 'loading', error: undefined, session: this.state.session + 1 });
      try {
        const raw = await this.deps.read();
        if (raw === null) {
          if (await this.deps.hasMarker()) throw new Error('Missing credentials');
          this.record = null; this.emit({ mode: 'setup' });
        } else {
          this.record = parseLockRecord(raw); await this.deps.markConfigured(); this.emit({ mode: 'locked' });
        }
      } catch { this.fatal(); }
    });
  }
  private async verifier(secret: string): Promise<Verifier> {
    const salt = this.deps.salt(); return { salt, hash: await this.deps.derive(secret, salt) };
  }
  private requireActive() {
    if (!this.state.active || this.state.mode === 'loading' || this.state.mode === 'error') throw new Error('กรุณาปลดล็อกแอปก่อน');
  }
  private accept(generation: number): void {
    if (generation !== this.generation || !this.state.active) throw new Error('สถานะแอปเปลี่ยน กรุณาปลดล็อกอีกครั้ง');
    this.pulse = { wall: this.deps.now(), mono: this.deps.monotonic() };
    this.emit({ mode: 'unlocked', session: this.state.session + 1 });
  }
  setup(pin: string, confirmation: string, questions: string[], answers: string[]): Promise<void> {
    return this.exclusive(async () => {
      this.requireActive(); if (this.state.mode !== 'setup' || this.record) throw new Error('ตั้งค่า PIN แล้ว');
      validatePin(pin); if (pin !== confirmation) throw new Error('PIN สองช่องไม่ตรงกัน');
      const q = validateQuestions(questions); const a = normalizeAnswers(answers); const generation = this.generation;
      const record: LockRecord = { version: 1, kdf: KDF, pin: await this.verifier(pin), recovery: await this.verifier(a), questions: q, timeout: 60000, biometrics: false, pinAttempts: freshAttempts(), recoveryAttempts: freshAttempts(), lastWall: this.clock() };
      await this.save(record);
      try { await this.deps.markConfigured(); } catch { this.fatal(); }
      // Configuration may complete in the background; it never grants a late unlock.
      this.emit({ mode: 'locked' }); this.accept(generation);
    });
  }
  private async verifyAttempt(kind: 'pin' | 'recovery', secret: string): Promise<boolean> {
    this.requireActive(); const r = this.record; if (!r) throw new Error('ยังไม่ได้ตั้งค่า PIN');
    const key = kind === 'pin' ? 'pinAttempts' : 'recoveryAttempts'; const now = this.clock();
    if (now < r[key].blockedUntil) throw new Error('กรอกผิดหลายครั้ง กรุณารอจนหมดเวลาที่แสดง');
    await this.save({ ...r, [key]: reserveAttempt(r[key], kind, now), lastWall: now });
    const valid = await this.deps.verify(secret, r[kind]);
    if (valid) await this.save({ ...this.record!, [key]: freshAttempts(), lastWall: this.clock() });
    return valid;
  }
  unlockPin(pin: string): Promise<boolean> {
    return this.exclusive(async () => {
      validatePin(pin); const generation = this.generation;
      if (!await this.verifyAttempt('pin', pin)) return false;
      this.accept(generation); return true;
    });
  }
  recover(answers: string[], pin: string, confirmation: string): Promise<boolean> {
    return this.exclusive(async () => {
      validatePin(pin); if (pin !== confirmation) throw new Error('PIN สองช่องไม่ตรงกัน');
      const normalized = normalizeAnswers(answers); const generation = this.generation;
      if (!await this.verifyAttempt('recovery', normalized)) return false;
      const verifier = await this.verifier(pin);
      if (generation !== this.generation || !this.state.active) throw new Error('สถานะแอปเปลี่ยน กรุณาลองใหม่');
      await this.save({ ...this.record!, pin: verifier, pinAttempts: freshAttempts(), recoveryAttempts: freshAttempts(), lastWall: this.clock() });
      this.accept(generation); return true;
    });
  }
  unlockBiometric(): Promise<boolean> {
    return this.exclusive(async () => {
      this.requireActive(); const r = this.record;
      if (!r?.biometrics || !await this.deps.biometricAvailable()) throw new Error('ใช้ลายนิ้วมือหรือใบหน้าไม่ได้ กรุณาใช้ PIN');
      const now = this.clock(); if (now < r.pinAttempts.blockedUntil) throw new Error('กรุณารอจนหมดเวลาที่แสดง');
      const generation = this.generation;
      await this.save({ ...r, pinAttempts: reserveAttempt(r.pinAttempts, 'pin', now), lastWall: now });
      this.biometricPending = true;
      try {
        const result = await this.deps.authenticate();
        if (result === 'cancelled') { await this.save({ ...this.record!, pinAttempts: r.pinAttempts }); return false; }
        if (result !== 'success') return false;
        await this.save({ ...this.record!, pinAttempts: freshAttempts(), lastWall: this.clock() });
        this.accept(generation); return true;
      } finally { this.biometricPending = false; }
    });
  }
  updateSettings(currentPin: string, options: { timeout: number; biometrics: boolean; newPin?: string; confirmation?: string; questions?: string[]; answers?: string[] }): Promise<void> {
    return this.exclusive(async () => {
      if (!this.isUnlocked()) throw new Error('กรุณาปลดล็อกแอปก่อน');
      validatePin(currentPin); const generation = this.generation;
      if (!TIMEOUTS.includes(options.timeout as typeof TIMEOUTS[number])) throw new Error('ระยะเวลาล็อกไม่ถูกต้อง');
      if (options.newPin) { validatePin(options.newPin); if (options.newPin !== options.confirmation) throw new Error('PIN สองช่องไม่ตรงกัน'); }
      const q = options.questions ? validateQuestions(options.questions) : undefined;
      const a = options.answers ? normalizeAnswers(options.answers) : undefined;
      if (!!q !== !!a) throw new Error('กรุณากรอกคำถามและคำตอบให้ครบ');
      if (!await this.verifyAttempt('pin', currentPin)) throw new Error('PIN ปัจจุบันไม่ถูกต้อง');
      if (options.biometrics && !await this.deps.biometricAvailable()) throw new Error('เครื่องนี้ยังไม่มีลายนิ้วมือหรือใบหน้าที่รองรับ');
      const r = this.record!;
      const next = { ...r, timeout: options.timeout, biometrics: options.biometrics,
        pin: options.newPin ? await this.verifier(options.newPin) : r.pin,
        recovery: a ? await this.verifier(a) : r.recovery, questions: q ?? r.questions };
      if (generation !== this.generation || !this.isUnlocked()) throw new Error('สถานะแอปเปลี่ยน กรุณาลองใหม่');
      await this.save(next);
      // Invalidate old export leases when credentials change, without retaining PIN text.
      if (options.newPin || q) this.emit({ session: this.state.session + 1 });
    });
  }
  isUnlocked = (): boolean => this.state.mode === 'unlocked' && this.state.active;
  sessionId = (): number => this.state.session;
  lock = (): void => { this.generation++; this.emit({ mode: this.record ? 'locked' : this.state.mode, session: this.state.session + 1 }); };
  suspend(kind: 'background' | 'blur' = 'background'): void {
    if (kind === 'blur' && this.biometricPending) return;
    if (!this.left) this.left = { wall: this.deps.now(), mono: this.deps.monotonic() };
    this.generation++; this.emit({ active: false });
    if (this.record?.timeout === 0 && this.state.mode === 'unlocked') this.lock();
  }
  resume(): void {
    if (this.left) {
      const wall = this.deps.now() - this.left.wall; const mono = this.deps.monotonic() - this.left.mono;
      if (wall < 0 || mono < 0 || Math.max(wall, mono) >= this.state.timeout) this.lock();
    }
    this.left = null; this.pulse = { wall: this.deps.now(), mono: this.deps.monotonic() }; this.emit({ active: true });
  }
  tick(): void {
    const wall = this.deps.now(); const mono = this.deps.monotonic();
    if (this.state.active && this.pulse && this.state.mode === 'unlocked') {
      const gap = Math.max(wall - this.pulse.wall, mono - this.pulse.mono);
      // Fallback for a missed lifecycle event: a suspended JS heartbeat requires reauth.
      if (wall < this.pulse.wall || mono < this.pulse.mono || gap > Math.max(2500, this.state.timeout)) this.lock();
    }
    this.pulse = { wall, mono }; this.emit();
  }
  async containsPin(password: string): Promise<boolean> {
    const assert = this.lease(); const verifier = this.record!.pin;
    const candidates = new Set<string>();
    for (let i = 0; i <= password.length - 6; i++) if (/^\d{6}$/.test(password.slice(i, i + 6))) candidates.add(password.slice(i, i + 6));
    for (const pin of candidates) { assert(); const match = await this.deps.verify(pin, verifier); assert(); if (match) return true; }
    return false;
  }
  lease = (): (() => void) => {
    const session = this.state.session;
    const check = () => { if (!this.isUnlocked() || session !== this.state.session) throw new Error('แอปถูกล็อก กรุณาปลดล็อกแล้วทำรายการใหม่'); };
    check(); return check;
  };
}
