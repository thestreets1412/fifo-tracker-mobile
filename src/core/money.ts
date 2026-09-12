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

export class InvalidNumberError extends Error {
  constructor(readonly input: string, reason: string) {
    super(`Invalid number ${JSON.stringify(input)}: ${reason}`);
    this.name = 'InvalidNumberError';
  }
}

// Optional sign, digits, optional fractional part. No exponent, no
// separators. Deliberately stricter than the Decimal constructor: a user
// typing "1e8" or "1,234" made a mistake, and silently accepting it would
// store a quantity they did not intend.
const PLAIN_DECIMAL = /^-?\d+(\.\d+)?$/;

export function parseInput(text: string, dp: number): Decimal {
  const trimmed = text.trim();
  if (trimmed === '') {
    throw new InvalidNumberError(text, 'empty');
  }
  if (!PLAIN_DECIMAL.test(trimmed)) {
    throw new InvalidNumberError(text, 'not a plain decimal number');
  }
  const fraction = trimmed.split('.')[1];
  if (fraction !== undefined && fraction.length > dp) {
    throw new InvalidNumberError(text, `more than ${dp} decimal places`);
  }
  return new Decimal(trimmed);
}
