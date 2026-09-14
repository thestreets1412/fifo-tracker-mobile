import { LockController, type LockDependencies } from '../../services/lock';
import { type Verifier } from '../credentials';

function fixture() {
  let value: string | null = null; let marker = false; let wall = 1000000; let mono = 1000;
  let biometric: 'success' | 'failure' | 'cancelled' = 'success'; let enrolled = true;
  const derive = async (secret: string, salt: string) => {
    let value = 5381;
    for (const char of secret + salt) value = ((value * 33) ^ char.charCodeAt(0)) >>> 0;
    return value.toString(16).padStart(8, '0').repeat(8);
  };
  const deps: LockDependencies = {
    read: async () => value, write: async next => { value = next; }, hasMarker: async () => marker, markConfigured: async () => { marker = true; },
    derive, verify: async (secret, verifier: Verifier) => await derive(secret, verifier.salt) === verifier.hash,
    salt: () => 'a'.repeat(32), now: () => wall, monotonic: () => mono,
    biometricAvailable: async () => enrolled, authenticate: async () => biometric,
  };
  return { deps, get value() { return value; }, set value(v: string | null) { value = v; }, get marker() { return marker; }, set marker(v: boolean) { marker = v; }, advance(ms: number) { wall += ms; mono += ms; }, rollback(ms: number) { wall -= ms; }, setBiometric(v: typeof biometric) { biometric = v; }, setEnrolled(v: boolean) { enrolled = v; } };
}
async function configured() {
  const f = fixture(); const lock = new LockController(f.deps); await lock.initialize();
  await lock.setup('123456', '123456', ['Where did we first hike?', 'Which book was hardest to finish?', 'What was the name of our first project?'], ['doi inthanon', 'the long road', 'lotus ledger']);
  return { f, lock };
}
test('first launch requires setup and stores no plaintext PIN or answers', async () => {
  const f = fixture(); const lock = new LockController(f.deps); await lock.initialize(); expect(lock.snapshot().mode).toBe('setup');
  await lock.setup('123456', '123456', ['Where did we first hike?', 'Which book was hardest to finish?', 'What was the name of our first project?'], ['doi inthanon', 'the long road', 'lotus ledger']);
  expect(lock.isUnlocked()).toBe(true); expect(f.marker).toBe(true); expect(f.value).not.toContain('123456'); expect(f.value).not.toContain('DOI INTHANON');
});
test.each([
  ['12345', '12345'], ['abcdef', 'abcdef'], ['123456', '654321'],
])('setup rejects invalid PIN %s', async (pin, confirmation) => {
  const f = fixture(); const lock = new LockController(f.deps); await lock.initialize();
  await expect(lock.setup(pin, confirmation, ['Where did we first hike?', 'Which book was hardest to finish?', 'What was the name of our first project?'], ['doi inthanon', 'the long road', 'lotus ledger'])).rejects.toThrow();
});
test('setup validates distinct personal questions and normalized answers', async () => {
  const f = fixture(); const lock = new LockController(f.deps); await lock.initialize();
  await expect(lock.setup('123456', '123456', ['same same?', 'same same?', 'x'], [' aaaa ', 'bbbb', 'cccc'])).rejects.toThrow();
  await expect(lock.setup('123456', '123456', ['Where did we first hike?', 'Which book was hardest to finish?', 'What was the name of our first project?'], ['x', 'bbbb', 'cccc'])).rejects.toThrow();
});
test('wrong PIN persists an exponential lockout across controller restart', async () => {
  const { f, lock } = await configured(); lock.lock();
  for (let i = 0; i < 5; i++) expect(await lock.unlockPin('000000')).toBe(false);
  expect(lock.snapshot().pinUntil).toBe(1030000);
  const restart = new LockController(f.deps); await restart.initialize();
  await expect(restart.unlockPin('123456')).rejects.toThrow('รอ'); f.advance(30000);
  expect(await restart.unlockPin('123456')).toBe(true); expect(restart.snapshot().pinUntil).toBe(0);
});
test('recovery requires all normalized answers, resets PIN, and backs off after three failures', async () => {
  const { f, lock } = await configured(); lock.lock();
  for (let i = 0; i < 3; i++) expect(await lock.recover(['wrong', 'answers', 'here'], '654321', '654321')).toBe(false);
  expect(lock.snapshot().recoveryUntil).toBe(4600000); await expect(lock.recover(['doi inthanon', 'the long road', 'lotus ledger'], '654321', '654321')).rejects.toThrow('รอ');
  f.advance(3600000); expect(await lock.recover([' DOI INTHANON ', 'THE LONG ROAD', 'lotus ledger'], '654321', '654321')).toBe(true);
  lock.lock(); expect(await lock.unlockPin('123456')).toBe(false); expect(await lock.unlockPin('654321')).toBe(true);
});
test('background timeout, immediate timeout, clock rollback and missed lifecycle heartbeat lock the app', async () => {
  const { f, lock } = await configured(); lock.suspend(); f.advance(60000); lock.resume(); expect(lock.isUnlocked()).toBe(false);
  await lock.unlockPin('123456'); await lock.updateSettings('123456', { timeout: 0, biometrics: false }); lock.suspend(); lock.resume(); expect(lock.isUnlocked()).toBe(false);
  await lock.unlockPin('123456'); f.rollback(10); lock.tick(); expect(lock.isUnlocked()).toBe(false);
  await lock.unlockPin('123456'); f.advance(61000); lock.tick(); expect(lock.isUnlocked()).toBe(false);
});
test('biometric needs explicit opt-in, failure consumes attempt, cancel does not, and background invalidates success', async () => {
  const { f, lock } = await configured(); lock.lock(); await expect(lock.unlockBiometric()).rejects.toThrow('PIN');
  await lock.unlockPin('123456'); await lock.updateSettings('123456', { timeout: 60000, biometrics: true }); lock.lock();
  f.setBiometric('cancelled'); expect(await lock.unlockBiometric()).toBe(false); expect(lock.snapshot().pinUntil).toBe(0);
  f.setBiometric('failure'); expect(await lock.unlockBiometric()).toBe(false); expect(lock.snapshot().pinUntil).toBe(0); // first failure below threshold
  f.setBiometric('success'); expect(await lock.unlockBiometric()).toBe(true);
  lock.lock(); let resolve!: (v: 'success') => void; f.deps.authenticate = () => new Promise(r => { resolve = r; }); const pending = lock.unlockBiometric();
  for (let i = 0; i < 10 && !resolve; i++) await new Promise<void>(done => setImmediate(done));
  lock.suspend(); resolve('success'); await expect(pending).rejects.toThrow('สถานะแอปเปลี่ยน');
});
test('settings require current PIN and invalidate export leases after credential changes', async () => {
  const { lock } = await configured(); const lease = lock.lease();
  await expect(lock.updateSettings('000000', { timeout: 900000, biometrics: false })).rejects.toThrow('PIN');
  await lock.updateSettings('123456', { timeout: 900000, biometrics: false, newPin: '654321', confirmation: '654321' });
  expect(lock.snapshot().timeout).toBe(900000); expect(lease).toThrow('ล็อก');
});
test('a current unlocked session rejects an export password containing its actual PIN', async () => {
  const { lock } = await configured();
  expect(await lock.containsPin('cedar 123456 harbor')).toBe(true);
  expect(await lock.containsPin('cedar 654321 harbor')).toBe(false);
  lock.lock(); await expect(lock.containsPin('cedar 123456 harbor')).rejects.toThrow('ล็อก');
});
test('missing locked credential with persisted marker fails closed', async () => {
  const f = fixture(); f.marker = true; const lock = new LockController(f.deps); await expect(lock.initialize()).rejects.toThrow(); expect(lock.snapshot().mode).toBe('error');
});
