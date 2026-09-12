import { openTestDatabase } from './testDatabase';
import { runMigrations } from '../schema';
import { createSymbol, insertLot, insertSale, replaceAllAllocations, listAllocations } from '../repo';
import type { SqlDatabase } from '../repo';

function freshDbWithLotAndSale(): { db: SqlDatabase; lotId: number; saleId: number } {
  const db = openTestDatabase();
  runMigrations(db);
  const symbol = createSymbol(db, 'NVDA', 'NVIDIA');
  const lot = insertLot(db, {
    symbolId: symbol.id, buyDate: '2026-01-01', priceUsd: '100.000000',
    qty: '10.00000000', fxRateUsdThb: '36.0000', createdAt: '2026-01-01T00:00:00Z', evidenceFile: null,
  });
  const sale = insertSale(db, {
    symbolId: symbol.id, sellDate: '2026-06-01', qtySold: '4.00000000', salePriceUsd: '150.000000',
    feeUsd: '0.0000', fxRateUsdThb: '36.0000', createdAt: '2026-06-01T00:00:00Z', evidenceFile: null,
  });
  return { db, lotId: lot.id, saleId: sale.id };
}

describe('replaceAllAllocations', () => {
  it('inserts the given allocations', () => {
    const { db, lotId, saleId } = freshDbWithLotAndSale();
    replaceAllAllocations(db, [{ saleId, lotId, qtyAllocated: '4.00000000', costBasisThb: '14400.0000' }]);
    expect(listAllocations(db)).toEqual([{ saleId, lotId, qtyAllocated: '4.00000000', costBasisThb: '14400.0000' }]);
  });

  it('replaces the entire set, discarding whatever was there before', () => {
    const { db, lotId, saleId } = freshDbWithLotAndSale();
    replaceAllAllocations(db, [{ saleId, lotId, qtyAllocated: '4.00000000', costBasisThb: '14400.0000' }]);
    replaceAllAllocations(db, []);
    expect(listAllocations(db)).toEqual([]);
  });

  it('rejects an allocation whose sale or lot does not exist', () => {
    const { db } = freshDbWithLotAndSale();
    expect(() => replaceAllAllocations(db, [{ saleId: 999, lotId: 999, qtyAllocated: '1', costBasisThb: '1' }])).toThrow();
  });
});

describe('listAllocations', () => {
  it('filters by saleId', () => {
    const { db, lotId, saleId } = freshDbWithLotAndSale();
    replaceAllAllocations(db, [{ saleId, lotId, qtyAllocated: '4.00000000', costBasisThb: '14400.0000' }]);
    expect(listAllocations(db, { saleId })).toHaveLength(1);
    expect(listAllocations(db, { saleId: 999 })).toHaveLength(0);
  });

  it('filters by lotId', () => {
    const { db, lotId, saleId } = freshDbWithLotAndSale();
    replaceAllAllocations(db, [{ saleId, lotId, qtyAllocated: '4.00000000', costBasisThb: '14400.0000' }]);
    expect(listAllocations(db, { lotId })).toHaveLength(1);
    expect(listAllocations(db, { lotId: 999 })).toHaveLength(0);
  });
});
