/**
 * Spec §5: when offline, the dashboard shows the cached value with its age
 * ("price from 2 hours ago") rather than a blank. This is that label.
 *
 * Ages are floored, never rounded up: "2 ชั่วโมงที่แล้ว" for anything from
 * two hours to just under three. Overstating freshness would be the one
 * mistake that matters here.
 */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export function formatQuoteAge(fetchedAt: string, now: Date): string {
  const then = new Date(fetchedAt).getTime();
  if (!Number.isFinite(then)) return 'ไม่ทราบเวลา';

  // A device clock that moved backwards (manual change, NTP correction)
  // would otherwise produce a negative age.
  const age = Math.max(0, now.getTime() - then);

  if (age < MINUTE) return 'เมื่อสักครู่';
  if (age < HOUR) return `${Math.floor(age / MINUTE)} นาทีที่แล้ว`;
  if (age < DAY) return `${Math.floor(age / HOUR)} ชั่วโมงที่แล้ว`;
  return `${Math.floor(age / DAY)} วันที่แล้ว`;
}
