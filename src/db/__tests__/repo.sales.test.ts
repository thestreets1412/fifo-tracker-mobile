import { openTestDatabase } from './testDatabase';
import { runMigrations } from '../schema';
import { createSymbol, insertSale, listSales, getSale, updateSale, deleteSale } from '../repo';
import type { NewSaleRow, SqlDatabase } from '../repo';

function freshDbWithSymbol(): { db: SqlDatabase; symbolId: number } {
  const db = openTestDatabase();
  runMigrations(db);
  const symbol = createSymbol(db, 'NVDA', 'NVIDIA');
  return { db, symbolId: symbol.id };
}

const baseSale = (symbolId: number, overrides: Partial<NewSaleRow> = {}): NewSaleRow => ({
  symbolId,
  sellDate: '2026-06-01',
  qtySold: '4.00000000',
  salePriceUsd: '150.000000',
  feeUsd: '0.0000',
  fxRateUsdThb: '36.0000',
  createdAt: '2026-06-01T00:00:00Z',
  evidenceFile: null,
  ...overrides,
});

describe('insertSale', () => {
  it('inserts a sale and returns it with an id', () => {
    const { db, symbolId } = freshDbWithSymbol();
    const sale = insertSale(db, baseSale(symbolId));
    expect(sale).toEqual({ id: expect.any(Number), ...baseSale(symbolId) });
  });

  it('rejects an unknown symbol id via the foreign key', () => {
    const { db } = freshDbWithSymbol();
    expect(() => insertSale(db, baseSale(999))).toThrow();
  });
});

describe('listSales', () => {
  it('orders by sell_date, created_at, id', () => {
    const { db, symbolId } = freshDbWithSymbol();
    const later = insertSale(db, baseSale(symbolId, { sellDate: '2026-08-01', createdAt: '2026-08-01T00:00:00Z' }));
    const earlier = insertSale(db, baseSale(symbolId, { sellDate: '2026-06-01', createdAt: '2026-06-01T00:00:00Z' }));
    expect(listSales(db).map((s) => s.id)).toEqual([earlier.id, later.id]);
  });

  it('filters by symbolId when given', () => {
    const { db, symbolId } = freshDbWithSymbol();
    const other = createSymbol(db, 'TSLA', 'Tesla');
    insertSale(db, baseSale(symbolId));
    insertSale(db, baseSale(other.id));
    expect(listSales(db, symbolId)).toHaveLength(1);
  });
});

describe('getSale', () => {
  it('returns null for an id that does not exist', () => {
    const { db } = freshDbWithSymbol();
    expect(getSale(db, 999)).toBeNull();
  });
});

describe('updateSale', () => {
  it('updates fields but never created_at', () => {
    const { db, symbolId } = freshDbWithSymbol();
    const sale = insertSale(db, baseSale(symbolId));
    updateSale(db, sale.id, baseSale(symbolId, { qtySold: '2.00000000', createdAt: '2099-01-01T00:00:00Z' }));
    const updated = getSale(db, sale.id);
    expect(updated?.qtySold).toBe('2.00000000');
    expect(updated?.createdAt).toBe(sale.createdAt);
  });
});

describe('deleteSale', () => {
  it('removes the sale', () => {
    const { db, symbolId } = freshDbWithSymbol();
    const sale = insertSale(db, baseSale(symbolId));
    deleteSale(db, sale.id);
    expect(getSale(db, sale.id)).toBeNull();
  });
});
