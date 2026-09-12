import { openTestDatabase } from '../../db/__tests__/testDatabase';
import { runMigrations } from '../../db/schema';
import { createSymbol } from '../../db/repo';
import { addLot, addSale } from '../ledger';
import { listSymbolsWithCounts } from '../symbols';
import Decimal from 'decimal.js';
import type { SqlDatabase } from '../../db/sqlDatabase';

function freshDb(): SqlDatabase {
  const db = openTestDatabase();
  runMigrations(db);
  return db;
}

test('counts lots and sales per symbol, ticker-ordered, zero for unused', () => {
  const db = freshDb();
  const nvda = createSymbol(db, 'NVDA');
  const aapl = createSymbol(db, 'AAPL');
  createSymbol(db, 'ZZZZ'); // unused

  addLot(db, { symbolId: nvda.id, buyDate: '2026-01-01', priceUsd: new Decimal('100'), qty: new Decimal('10'), fxRateUsdThb: new Decimal('36'), evidenceFile: null });
  addLot(db, { symbolId: nvda.id, buyDate: '2026-01-02', priceUsd: new Decimal('110'), qty: new Decimal('5'), fxRateUsdThb: new Decimal('36'), evidenceFile: null });
  addSale(db, { symbolId: nvda.id, sellDate: '2026-02-01', qtySold: new Decimal('3'), salePriceUsd: new Decimal('120'), feeUsd: new Decimal('0'), fxRateUsdThb: new Decimal('36'), evidenceFile: null });
  addLot(db, { symbolId: aapl.id, buyDate: '2026-01-01', priceUsd: new Decimal('50'), qty: new Decimal('4'), fxRateUsdThb: new Decimal('36'), evidenceFile: null });

  const result = listSymbolsWithCounts(db);
  expect(result.map((r) => r.symbol.ticker)).toEqual(['AAPL', 'NVDA', 'ZZZZ']);
  const byTicker = Object.fromEntries(result.map((r) => [r.symbol.ticker, r]));
  expect(byTicker.NVDA).toMatchObject({ lotCount: 2, saleCount: 1 });
  expect(byTicker.AAPL).toMatchObject({ lotCount: 1, saleCount: 0 });
  expect(byTicker.ZZZZ).toMatchObject({ lotCount: 0, saleCount: 0 });
});
