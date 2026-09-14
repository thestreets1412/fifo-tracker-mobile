import { randomFillSync } from 'node:crypto';
import { assessPassword, generatePassphrase } from '../password';
test.each(['123456789012', 'passwordpassword', 'a'.repeat(20), 'qwerty-long-passphrase', 'ภาษาไทยยาวมากมาก', 'some-asdf-phrase-yes'])('rejects weak or incompatible password', p => expect(assessPassword(p).error).toBeTruthy());
test('PIN containment is forbidden without mandating composition', () => {
  expect(assessPassword('cedar lantern harbor violet otter').error).toBeUndefined();
  expect(assessPassword('cedar 592861 harbor violet otter', '592861').error).toBeTruthy();
});
test('generated five-word passphrases pass the policy', () => {
  for (let i = 0; i < 10; i++) {
    const p = generatePassphrase(randomFillSync); expect(p.split(' ')).toHaveLength(5); expect(assessPassword(p).error).toBeUndefined();
  }
});
