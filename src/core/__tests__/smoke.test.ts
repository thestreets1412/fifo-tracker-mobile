import Decimal from 'decimal.js';

describe('test runner', () => {
  it('runs TypeScript', () => {
    expect(1 + 1).toBe(2);
  });

  it('has decimal.js, which does not suffer float error', () => {
    expect(new Decimal('0.1').plus('0.2').equals(new Decimal('0.3'))).toBe(true);
    expect(0.1 + 0.2 === 0.3).toBe(false);
  });
});
