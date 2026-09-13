import Decimal from 'decimal.js';
import { renderReportCsv, CSV_HEADERS } from '../csv';
import { money, qty } from '../format';
import { fixture } from './fixture';

test('CSV preserves original 13-column ledger and allocation order', () => {
  const f = fixture(); f.buy('100.123456', '2.12345678'); f.sell('90', '1', '1');
  const csv = renderReportCsv(f.report());
  expect(csv.startsWith('\uFEFFFIFO Portfolio Report\r\n')).toBe(true);
  expect(csv).toContain(CSV_HEADERS.join(','));
  expect(csv).toContain('100.123456,2.12345678,35.0000');
  const records = csv.split('\r\n').filter((line) => /^NVDA,(BUY LOT|SALE|  -> ALLOCATION|TICKER TOTAL)/.test(line));
  expect(records.map((line) => line.split(',')[1])).toEqual(['BUY LOT', 'SALE', '  -> ALLOCATION', 'TICKER TOTAL']);
  expect(records.every((line) => line.split(',').length === 13)).toBe(true);
  expect(records[1]!.split(',')[11]).toMatch(/^-\d+\.\d{2}$/);
  expect(csv).not.toMatch(/(?<!\r)\n/);
});

test.each(['=1+1', '+SUM(1)', '-BAD', '@BAD', '\t=1', '\rBAD'])('neutralizes user ticker formula %s', (ticker) => {
  const f = fixture(ticker); f.buy('1', '1');
  const normalized = f.symbol.ticker;
  const csv = renderReportCsv(f.report());
  if (/^[=+@-]/.test(normalized)) expect(csv).toContain(`'${normalized},BUY LOT`);
  else expect(csv).toContain(`${normalized},BUY LOT`);
});

test('quotes commas, double quotes, and newlines', () => {
  const f = fixture('A,"B\nC'); f.buy('1', '1');
  expect(renderReportCsv(f.report())).toContain('"A,""B\nC",BUY LOT');
});

test('HALF_EVEN formatting and fixed notation', () => {
  expect(money(new Decimal('1.005'))).toBe('1.00');
  expect(money(new Decimal('1.015'))).toBe('1.02');
  expect(money(new Decimal('-12345.125'))).toBe('-12,345.12');
  expect(qty(new Decimal('0'))).toBe('0');
  expect(qty(new Decimal('10.01000000'))).toBe('10.01');
  expect(qty(new Decimal('0.00000001'))).toBe('0.00000001');
});
