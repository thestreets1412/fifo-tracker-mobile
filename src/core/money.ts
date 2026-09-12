import Decimal from 'decimal.js';

// Matches Python's default Decimal context, which the Django app relies on.
Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_EVEN });

export const DP = Object.freeze({
  price: 6,
  qty: 8,
  fxRate: 4,
  money: 4,
});

/**
 * Renders a Decimal as the fixed-precision string that goes into SQLite.
 *
 * Fixed decimal places are what make stored values sort and compare
 * correctly as text. toFixed also avoids exponential notation, which
 * toString would emit for very small or very large magnitudes.
 */
export function toStored(value: Decimal, dp: number): string {
  return value.toFixed(dp, Decimal.ROUND_HALF_EVEN);
}

export function fromStored(text: string): Decimal {
  return new Decimal(text);
}
