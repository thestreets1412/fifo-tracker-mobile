import { isValidYmd, todayYmd } from '../dateInput';

test('accepts a real calendar date', () => {
  expect(isValidYmd('2026-03-14')).toBe(true);
});

test('rejects malformed or impossible dates', () => {
  expect(isValidYmd('2026-3-14')).toBe(false);   // not zero-padded
  expect(isValidYmd('2026-02-31')).toBe(false);   // no Feb 31
  expect(isValidYmd('2026-13-01')).toBe(false);   // month 13
  expect(isValidYmd('')).toBe(false);
  expect(isValidYmd('14/03/2026')).toBe(false);
});

test('todayYmd returns a value that passes isValidYmd', () => {
  expect(isValidYmd(todayYmd())).toBe(true);
});
