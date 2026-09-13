import Decimal from 'decimal.js';
import { openTestDatabase } from '../../db/__tests__/testDatabase';
import { runMigrations } from '../../db/schema';
import { createSymbol } from '../../db/repo';
import { addLot, addSale } from '../../services/ledger';
import { buildFifoReport } from '../../services/report';

export const generatedAt = '2026-09-13T04:12:33.000Z';

export function fixture(ticker = 'NVDA') {
  const db = openTestDatabase();
  runMigrations(db);
  const symbol = createSymbol(db, ticker);
  const buy = (price: string, quantity: string, date = '2026-01-01') => addLot(db, {
    symbolId: symbol.id, buyDate: date, priceUsd: new Decimal(price), qty: new Decimal(quantity),
    fxRateUsdThb: new Decimal('35'), evidenceFile: null,
  });
  const sell = (price: string, quantity: string, fee = '0') => addSale(db, {
    symbolId: symbol.id, sellDate: '2026-02-01', salePriceUsd: new Decimal(price), qtySold: new Decimal(quantity),
    feeUsd: new Decimal(fee), fxRateUsdThb: new Decimal('36'), evidenceFile: null,
  });
  return { db, symbol, buy, sell, report: () => buildFifoReport(db, { generatedAt }) };
}
