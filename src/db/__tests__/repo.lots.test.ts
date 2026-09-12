import { openTestDatabase } from './testDatabase';
import { runMigrations } from '../schema';
import { createSymbol, insertLot, listLots, getLot, updateLot, deleteLot } from '../repo';
import type { NewLotRow, SqlDatabase } from '../repo';

function freshDbWithSymbol(): { db: SqlDatabase; symbolId: number } {
  const db = openTestDatabase();
  runMigrations(db);
  const symbol = createSymbol(db, 'NVDA', 'NVIDIA');
  return { db, symbolId: symbol.id };
}

const baseLot = (symbolId: number, overrides: Partial<NewLotRow> = {}): NewLotRow => ({
  symbolId,
  buyDate: '2026-01-01',
  priceUsd: '142.350000',
  qty: '10.00000000',
  fxRateUsdThb: '36.2100',
  createdAt: '2026-01-01T00:00:00Z',
  evidenceFile: null,
  ...overrides,
});

describe('insertLot', () => {
  it('inserts a lot and returns it with an id', () => {
    const { db, symbolId } = freshDbWithSymbol();
    const lot = insertLot(db, baseLot(symbolId));
    expect(lot).toEqual({ id: expect.any(Number), ...baseLot(symbolId) });
  });

  it('stores every monetary field as the exact string given, never coerced', () => {
    const { db, symbolId } = freshDbWithSymbol();
    insertLot(db, baseLot(symbolId, { priceUsd: '0.000001', qty: '0.00000001' }));
    const [raw] = db.getAllSync<{ price_usd: string; qty: string }>('SELECT price_usd, qty FROM lots;');
    expect(raw!.price_usd).toBe('0.000001');
    expect(raw!.qty).toBe('0.00000001');
  });

  it('rejects an unknown symbol id via the foreign key', () => {
    const { db } = freshDbWithSymbol();
    expect(() => insertLot(db, baseLot(999))).toThrow();
  });
});

describe('listLots', () => {
  it('orders by buy_date, created_at, id — the FIFO order', () => {
    const { db, symbolId } = freshDbWithSymbol();
    const later = insertLot(db, baseLot(symbolId, { buyDate: '2026-03-01', createdAt: '2026-03-01T00:00:00Z' }));
    const earlier = insertLot(db, baseLot(symbolId, { buyDate: '2026-01-01', createdAt: '2026-01-01T00:00:00Z' }));
    expect(listLots(db).map((l) => l.id)).toEqual([earlier.id, later.id]);
  });

  it('filters by symbolId when given', () => {
    const { db, symbolId } = freshDbWithSymbol();
    const other = createSymbol(db, 'TSLA', 'Tesla');
    insertLot(db, baseLot(symbolId));
    insertLot(db, baseLot(other.id));
    expect(listLots(db, symbolId)).toHaveLength(1);
  });
});

describe('getLot', () => {
  it('returns null for an id that does not exist', () => {
    const { db } = freshDbWithSymbol();
    expect(getLot(db, 999)).toBeNull();
  });
});

describe('updateLot', () => {
  it('updates fields but never created_at', () => {
    const { db, symbolId } = freshDbWithSymbol();
    const lot = insertLot(db, baseLot(symbolId));
    updateLot(db, lot.id, baseLot(symbolId, { qty: '5.00000000', createdAt: '2099-01-01T00:00:00Z' }));
    const updated = getLot(db, lot.id);
    expect(updated?.qty).toBe('5.00000000');
    expect(updated?.createdAt).toBe(lot.createdAt);
  });
});

describe('deleteLot', () => {
  it('removes the lot', () => {
    const { db, symbolId } = freshDbWithSymbol();
    const lot = insertLot(db, baseLot(symbolId));
    deleteLot(db, lot.id);
    expect(getLot(db, lot.id)).toBeNull();
  });
});
