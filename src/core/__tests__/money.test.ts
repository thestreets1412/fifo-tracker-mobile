import Decimal from 'decimal.js';
import { DP, toStored, fromStored } from '../money';

describe('DP', () => {
  it('matches the decimal places of the Django model fields', () => {
    expect(DP).toEqual({ price: 6, qty: 8, fxRate: 4, money: 4 });
  });
});

describe('toStored', () => {
  it('pads to the exact number of decimal places', () => {
    expect(toStored(new Decimal('10'), DP.qty)).toBe('10.00000000');
    expect(toStored(new Decimal('142.35'), DP.price)).toBe('142.350000');
    expect(toStored(new Decimal('36.21'), DP.fxRate)).toBe('36.2100');
  });

  it('never produces exponential notation', () => {
    expect(toStored(new Decimal('0.00000001'), DP.qty)).toBe('0.00000001');
    expect(toStored(new Decimal('1e-8'), DP.qty)).toBe('0.00000001');
    expect(toStored(new Decimal('12345678901234'), DP.money)).toBe('12345678901234.0000');
  });

  it('rounds half to even, matching Django format_number', () => {
    expect(toStored(new Decimal('0.00005'), DP.money)).toBe('0.0000');
    expect(toStored(new Decimal('0.00015'), DP.money)).toBe('0.0002');
  });

  it('keeps the sign on negative values', () => {
    expect(toStored(new Decimal('-5.5'), DP.money)).toBe('-5.5000');
  });
});

describe('fromStored', () => {
  it('round-trips through toStored without loss', () => {
    const original = new Decimal('51565.6350');
    expect(fromStored(toStored(original, DP.money)).equals(original)).toBe(true);
  });

  it('reads a stored string back as an exact Decimal', () => {
    expect(fromStored('10.00000000').equals(new Decimal(10))).toBe(true);
  });
});
