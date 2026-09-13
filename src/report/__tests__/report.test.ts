import Decimal from 'decimal.js';
import { createSymbol, listLots, listSales, listAllocations } from '../../db/repo';
import { buildFifoReport } from '../../services/report';
import { buildPortfolioSummary } from '../../services/portfolio';
import { deleteSale, editLot } from '../../services/ledger';
import { fixture, generatedAt } from './fixture';
import { money } from '../format';

test('empty ledger and unused symbols produce no sections', () => {
  const f = fixture();
  expect(f.report().sections).toEqual([]);
  expect(f.report().totalOpenCostThb.toString()).toBe('0');
});

test('reads each table once in a transaction and leaves ledger unchanged', () => {
  const f = fixture();
  f.buy('100', '10'); f.sell('120', '3', '1');
  const before = [listLots(f.db), listSales(f.db), listAllocations(f.db)];
  const reads = jest.spyOn(f.db, 'getAllSync');
  const writes = jest.spyOn(f.db, 'runSync');
  const tx = jest.spyOn(f.db, 'execSync');
  f.report();
  expect(reads).toHaveBeenCalledTimes(4);
  expect(writes).not.toHaveBeenCalled();
  expect(tx.mock.calls).toEqual([['BEGIN;'], ['COMMIT;']]);
  expect([listLots(f.db), listSales(f.db), listAllocations(f.db)]).toEqual(before);
});

test('multiple lots, fees and remaining cost agree with Dashboard', () => {
  const f = fixture();
  const first = f.buy('100', '2'); const second = f.buy('110', '3');
  f.sell('130', '4', '1');
  const r = f.report();
  const section = r.sections[0]!;
  expect(section.sales[0]!.allocations.map((a) => a.lotId)).toEqual([first.id, second.id]);
  expect(section.sales[0]!.costBasisThb.toString()).toBe('14700');
  expect(section.sales[0]!.proceedsThb.toString()).toBe('18684');
  expect(section.remainingQty.toString()).toBe('1');
  expect(r.totalOpenCostThb.toString()).toBe('3850');
  expect(r.totalRealizedGainThb.toString()).toBe('3984');
  const dashboard = buildPortfolioSummary(f.db, new Map(), null);
  expect(r.totalOpenCostThb.eq(dashboard.totalCostThb)).toBe(true);
  expect(r.totalRealizedGainThb.eq(dashboard.totalRealizedGainThb)).toBe(true);
});

test('fully sold symbols remain, filtering excludes other symbols', () => {
  const f = fixture(); f.buy('100', '2'); f.sell('90', '2');
  const other = createSymbol(f.db, 'AAPL');
  // Use an existing valid row shape to keep all monetary columns strings.
  f.db.runSync(`INSERT INTO lots (symbol_id,buy_date,price_usd,qty,fx_rate_usd_thb,created_at)
    VALUES (?, '2026-01-01', '1.000000', '1.00000000', '1.0000', '2026-01-01T00:00:00Z')`, [other.id]);
  expect(f.report().sections.map((s) => s.symbol.ticker)).toEqual(['AAPL', 'NVDA']);
  const filtered = buildFifoReport(f.db, { generatedAt, symbolId: f.symbol.id });
  expect(filtered.sections).toHaveLength(1);
  expect(filtered.totalOpenCostThb.toString()).toBe('0');
  expect(filtered.totalRealizedGainThb.isNegative()).toBe(true);
  expect(buildFifoReport(f.db, { generatedAt, symbolId: 999 }).sections).toEqual([]);
});

test('FIFO breaks same-date and same-createdAt ties by id', () => {
  const f = fixture(); const a = f.buy('1', '1'); const b = f.buy('2', '1');
  f.db.runSync('UPDATE lots SET created_at = ?', ['2026-01-01T00:00:00Z']);
  f.sell('3', '2');
  expect(f.report().sections[0]!.sales[0]!.allocations.map((x) => x.lotId)).toEqual([a.id, b.id]);
});

test('edits/deletes affect new snapshots but never prior snapshots', () => {
  const f = fixture(); const lot = f.buy('100', '2'); const sale = f.sell('120', '1');
  const original = f.report();
  deleteSale(f.db, sale.id);
  editLot(f.db, lot.id, { symbolId: f.symbol.id, buyDate: lot.buyDate,
    qty: new Decimal('3'), priceUsd: new Decimal('100'), fxRateUsdThb: new Decimal('35'), evidenceFile: null });
  expect(f.report().totalOpenCostThb.toString()).toBe('10500');
  expect(f.report().totalRealizedGainThb.toString()).toBe('0');
  expect(original.sections[0]!.remainingQty.toString()).toBe('1');
});

test('fractional quantities stay Decimal and open costs sum before display rounding', () => {
  const f = fixture(); f.buy('0.1', '0.1'); f.buy('0.2', '0.2');
  expect(f.report().sections[0]!.remainingQty.toString()).toBe('0.3');
  expect(f.report().totalOpenCostThb.toString()).toBe('1.75');
});

test('a failed read rolls back and permits another report', () => {
  const f = fixture(); f.buy('1', '1');
  const spy = jest.spyOn(f.db, 'getAllSync').mockImplementationOnce(() => { throw new Error('read failed'); });
  expect(() => f.report()).toThrow('read failed');
  spy.mockRestore();
  expect(f.report().sections).toHaveLength(1);
});

test('totals retain sub-cent precision until the display boundary', () => {
  const f = fixture(); f.buy('0.0001', '1'); f.buy('0.0001', '1');
  const report = f.report();
  expect(report.sections[0]!.lots.map((lot) => money(lot.costThb))).toEqual(['0.00', '0.00']);
  expect(report.totalOpenCostThb.toString()).toBe('0.007');
  expect(money(report.totalOpenCostThb)).toBe('0.01');
});

test('realized gain can be exactly zero including different purchase/sale FX', () => {
  const f = fixture(); f.buy('36', '1'); f.sell('35', '1');
  expect(f.report().totalRealizedGainThb.toString()).toBe('0');
});
