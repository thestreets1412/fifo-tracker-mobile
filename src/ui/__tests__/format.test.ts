import Decimal from 'decimal.js';
import {
  formatMoneyThb, formatUsd, formatPrice, formatQty, formatSignedThb, formatFxRate,
} from '../format';

test('formatMoneyThb groups thousands and fixes 2 dp with baht suffix', () => {
  expect(formatMoneyThb('51565.6350')).toBe('51,565.64'.concat(' ฿')); // HALF_EVEN: .635 → .64
  expect(formatMoneyThb('0')).toBe('0.00 ฿');
  expect(formatMoneyThb(new Decimal('1234567.005'))).toBe('1,234,567.00 ฿'); // HALF_EVEN: .005 → .00
});

test('formatUsd fixes 2 dp with a dollar prefix', () => {
  expect(formatUsd('1423.5')).toBe('$1,423.50');
  expect(formatUsd('0')).toBe('$0.00');
});

test('formatPrice keeps 2 dp minimum and trims trailing zeros up to 6 dp', () => {
  expect(formatPrice('142.350000')).toBe('$142.35');
  expect(formatPrice('142.355000')).toBe('$142.355');
  expect(formatPrice('142')).toBe('$142.00');
});

test('formatQty trims trailing zeros, dropping the point when whole', () => {
  expect(formatQty('10.00000000')).toBe('10');
  expect(formatQty('1.50000000')).toBe('1.5');
  expect(formatQty('0.12345678')).toBe('0.12345678');
});

test('formatSignedThb prefixes + for non-negative, - for negative', () => {
  expect(formatSignedThb('982.0260')).toBe('+982.03 ฿');
  expect(formatSignedThb('-120')).toBe('-120.00 ฿');
  expect(formatSignedThb('0')).toBe('+0.00 ฿');
});

test('formatFxRate fixes 4 dp', () => {
  expect(formatFxRate('36.21')).toBe('36.2100');
});
