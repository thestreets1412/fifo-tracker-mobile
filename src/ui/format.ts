import Decimal from 'decimal.js';

type Num = Decimal | string;

function d(value: Num): Decimal {
  return value instanceof Decimal ? value : new Decimal(value);
}

/** Groups the integer part with commas; `frac` is an already-fixed fractional string (no point). */
function group(intPart: string): string {
  const neg = intPart.startsWith('-');
  const digits = neg ? intPart.slice(1) : intPart;
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return neg ? `-${grouped}` : grouped;
}

function fixed(value: Num, dp: number): string {
  const s = d(value).toFixed(dp, Decimal.ROUND_HALF_EVEN); // e.g. "-51565.64" or "142"
  const [intPart, frac] = s.split('.');
  const groupedInt = group(intPart ?? '0');
  return frac === undefined ? groupedInt : `${groupedInt}.${frac}`;
}

export function formatMoneyThb(value: Num): string {
  return `${fixed(value, 2)} ฿`;
}

export function formatUsd(value: Num): string {
  return `$${fixed(value, 2)}`;
}

export function formatFxRate(value: Num): string {
  return fixed(value, 4);
}

export function formatPrice(value: Num): string {
  // 2 dp minimum, up to 6, trailing zeros beyond 2 dp trimmed.
  const full = d(value).toFixed(6, Decimal.ROUND_HALF_EVEN); // "142.355000"
  const [intPart, frac = ''] = full.split('.');
  let trimmed = frac.replace(/0+$/, '');
  if (trimmed.length < 2) trimmed = frac.slice(0, 2); // keep at least 2 dp
  return `$${group(intPart ?? '0')}.${trimmed}`;
}

export function formatQty(value: Num): string {
  const full = d(value).toFixed(8, Decimal.ROUND_HALF_EVEN); // "10.00000000"
  const [intPart, frac = ''] = full.split('.');
  const trimmed = frac.replace(/0+$/, '');
  return trimmed === '' ? group(intPart ?? '0') : `${group(intPart ?? '0')}.${trimmed}`;
}

export function formatSignedThb(value: Num): string {
  const n = d(value);
  const sign = n.greaterThanOrEqualTo(0) ? '+' : '';
  return `${sign}${fixed(n, 2)} ฿`;
}
