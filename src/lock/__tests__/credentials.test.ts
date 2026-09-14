import { normalizeAnswers, parseLockRecord, reserveAttempt, validateQuestions } from '../credentials';
test('answer normalization preserves boundaries and case-insensitivity', () => {
  expect(normalizeAnswers([' Abcd ', 'EFGH', 'ไทย ไทย'])).toBe('["ABCD","EFGH","ไทย ไทย"]');
  expect(normalizeAnswers(['abcd', 'cdef', 'ghij'])).not.toBe(normalizeAnswers(['abcde', 'cdef', 'ghij']));
});
test('lockout doubles then caps', () => {
  let attempts = { failures: 0, blockedUntil: 0 }; for (let i = 0; i < 5; i++) attempts = reserveAttempt(attempts, 'pin', 1000);
  expect(attempts).toEqual({ failures: 5, blockedUntil: 31000 }); attempts = reserveAttempt(attempts, 'pin', 1000); expect(attempts.blockedUntil).toBe(61000);
  expect(reserveAttempt({ failures: 999999, blockedUntil: 0 }, 'recovery', 1000).blockedUntil).toBe(7 * 86400000 + 1000);
});
test('malformed persisted lock records fail closed', () => {
  expect(() => parseLockRecord('{}')).toThrow(); expect(() => validateQuestions(['same question?', 'same question?', 'third question?'])).toThrow();
});
