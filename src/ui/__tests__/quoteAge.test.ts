import { formatQuoteAge } from '../quoteAge';

const NOW = new Date('2026-09-13T12:00:00.000Z');

function ago(ms: number): string {
  return new Date(NOW.getTime() - ms).toISOString();
}

describe('formatQuoteAge', () => {
  it('says just now for anything under a minute', () => {
    expect(formatQuoteAge(ago(0), NOW)).toBe('เมื่อสักครู่');
    expect(formatQuoteAge(ago(59_000), NOW)).toBe('เมื่อสักครู่');
  });

  it('counts whole minutes under an hour', () => {
    expect(formatQuoteAge(ago(60_000), NOW)).toBe('1 นาทีที่แล้ว');
    expect(formatQuoteAge(ago(59 * 60_000), NOW)).toBe('59 นาทีที่แล้ว');
  });

  it('counts whole hours under a day', () => {
    expect(formatQuoteAge(ago(2 * 3_600_000), NOW)).toBe('2 ชั่วโมงที่แล้ว');
    expect(formatQuoteAge(ago(23 * 3_600_000), NOW)).toBe('23 ชั่วโมงที่แล้ว');
  });

  it('counts whole days beyond that', () => {
    expect(formatQuoteAge(ago(24 * 3_600_000), NOW)).toBe('1 วันที่แล้ว');
    expect(formatQuoteAge(ago(10 * 24 * 3_600_000), NOW)).toBe('10 วันที่แล้ว');
  });

  it('treats a clock that has gone backwards as just now rather than a negative age', () => {
    expect(formatQuoteAge(new Date(NOW.getTime() + 60_000).toISOString(), NOW)).toBe('เมื่อสักครู่');
  });

  it('says the time is unknown for an unparseable timestamp', () => {
    expect(formatQuoteAge('not a date', NOW)).toBe('ไม่ทราบเวลา');
    expect(formatQuoteAge('', NOW)).toBe('ไม่ทราบเวลา');
  });
});
