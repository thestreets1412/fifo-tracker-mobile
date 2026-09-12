import Decimal from 'decimal.js';
import { buildSaleDetail } from '../saleDetail';
import type { Lot, Sale, Allocation, SymbolRow } from '../../core/types';

const symbol: SymbolRow = { id: 1, ticker: 'NVDA', name: 'NVIDIA' };

function lot(id: number, buyDate: string): Lot {
  return { id, symbolId: 1, buyDate, priceUsd: new Decimal(0), qty: new Decimal(0), fxRateUsdThb: new Decimal(0), createdAt: '', evidenceFile: null };
}

const sale: Sale = {
  id: 5, symbolId: 1, sellDate: '2026-04-01',
  qtySold: new Decimal('5'), salePriceUsd: new Decimal('100'), feeUsd: new Decimal('0'), fxRateUsdThb: new Decimal('35'),
  createdAt: '', evidenceFile: null,
};

const lots: Lot[] = [lot(10, '2026-01-02'), lot(11, '2026-01-01')];
const allocations: Allocation[] = [
  { saleId: 5, lotId: 10, qtyAllocated: new Decimal('2'), costBasisThb: new Decimal('7000') },
  { saleId: 5, lotId: 11, qtyAllocated: new Decimal('3'), costBasisThb: new Decimal('9000') },
  { saleId: 99, lotId: 10, qtyAllocated: new Decimal('1'), costBasisThb: new Decimal('3500') }, // other sale — ignored
];

test('lines are this sale only, joined to lot buy dates, oldest lot first', () => {
  const d = buildSaleDetail(symbol, sale, lots, allocations);
  expect(d.lines.map((l) => l.lotId)).toEqual([11, 10]); // 2026-01-01 before 2026-01-02
  expect(d.lines.map((l) => l.buyDate)).toEqual(['2026-01-01', '2026-01-02']);
});

test('totals match the derive helpers', () => {
  const d = buildSaleDetail(symbol, sale, lots, allocations);
  expect(d.costBasisThb.equals('16000')).toBe(true);       // 7000 + 9000
  expect(d.proceedsThb.equals('17500')).toBe(true);         // 100*5*35
  expect(d.capitalGainThb.equals('1500')).toBe(true);       // 17500 - 16000
});
