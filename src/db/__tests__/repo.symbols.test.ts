import { openTestDatabase } from './testDatabase';
import { runMigrations } from '../schema';
import {
  createSymbol,
  findSymbolByTicker,
  findOrCreateSymbol,
  listSymbols,
  renameSymbol,
  deleteSymbol,
  DuplicateTickerError,
  SymbolInUseError,
} from '../repo';
import type { SqlDatabase } from '../sqlDatabase';

function freshDb(): SqlDatabase {
  const db = openTestDatabase();
  runMigrations(db);
  return db;
}

describe('createSymbol', () => {
  it('inserts a symbol and returns it with an id', () => {
    const db = freshDb();
    const symbol = createSymbol(db, 'NVDA', 'NVIDIA');
    expect(symbol).toEqual({ id: expect.any(Number), ticker: 'NVDA', name: 'NVIDIA' });
  });

  it('normalizes ticker to uppercase and trims whitespace', () => {
    const db = freshDb();
    const symbol = createSymbol(db, '  nvda ', 'NVIDIA');
    expect(symbol.ticker).toBe('NVDA');
  });

  it('defaults name to an empty string', () => {
    const db = freshDb();
    const symbol = createSymbol(db, 'NVDA');
    expect(symbol.name).toBe('');
  });

  it('rejects a duplicate ticker after normalization', () => {
    const db = freshDb();
    createSymbol(db, 'NVDA', 'NVIDIA');
    expect(() => createSymbol(db, ' nvda', 'x')).toThrow(DuplicateTickerError);
  });
});

describe('findSymbolByTicker', () => {
  it('resolves nvda, NVDA, and "NVDA " to the same symbol', () => {
    const db = freshDb();
    const created = createSymbol(db, 'NVDA', 'NVIDIA');
    expect(findSymbolByTicker(db, 'nvda')).toEqual(created);
    expect(findSymbolByTicker(db, 'NVDA')).toEqual(created);
    expect(findSymbolByTicker(db, 'NVDA ')).toEqual(created);
  });

  it('returns null when no symbol matches', () => {
    const db = freshDb();
    expect(findSymbolByTicker(db, 'NVDA')).toBeNull();
  });
});

describe('findOrCreateSymbol', () => {
  it('returns the existing symbol instead of creating a duplicate', () => {
    const db = freshDb();
    const created = createSymbol(db, 'NVDA', 'NVIDIA');
    const found = findOrCreateSymbol(db, 'nvda', 'ignored');
    expect(found).toEqual(created);
    expect(listSymbols(db)).toHaveLength(1);
  });

  it('creates the symbol when no match exists', () => {
    const db = freshDb();
    const symbol = findOrCreateSymbol(db, 'TSLA', 'Tesla');
    expect(symbol.ticker).toBe('TSLA');
    expect(listSymbols(db)).toHaveLength(1);
  });
});

describe('listSymbols', () => {
  it('returns symbols ordered by ticker', () => {
    const db = freshDb();
    createSymbol(db, 'TSLA', 'Tesla');
    createSymbol(db, 'NVDA', 'NVIDIA');
    expect(listSymbols(db).map((s) => s.ticker)).toEqual(['NVDA', 'TSLA']);
  });
});

describe('renameSymbol', () => {
  it('updates the display name without changing the ticker', () => {
    const db = freshDb();
    const symbol = createSymbol(db, 'NVDA', 'NVIDIA');
    renameSymbol(db, symbol.id, 'NVIDIA Corp');
    expect(findSymbolByTicker(db, 'NVDA')?.name).toBe('NVIDIA Corp');
  });
});

describe('deleteSymbol', () => {
  it('deletes a symbol with no lots or sales', () => {
    const db = freshDb();
    const symbol = createSymbol(db, 'NVDA', 'NVIDIA');
    deleteSymbol(db, symbol.id);
    expect(listSymbols(db)).toHaveLength(0);
  });

  it('refuses to delete a symbol referenced by a lot', () => {
    const db = freshDb();
    const symbol = createSymbol(db, 'NVDA', 'NVIDIA');
    db.runSync(
      `INSERT INTO lots (symbol_id, buy_date, price_usd, qty, fx_rate_usd_thb, created_at)
       VALUES (?, '2026-01-01', '100.000000', '10.00000000', '36.0000', '2026-01-01T00:00:00Z');`,
      [symbol.id],
    );
    expect(() => deleteSymbol(db, symbol.id)).toThrow(SymbolInUseError);
    expect(listSymbols(db)).toHaveLength(1);
  });

  it('refuses to delete a symbol referenced by a sale', () => {
    const db = freshDb();
    const symbol = createSymbol(db, 'NVDA', 'NVIDIA');
    db.runSync(
      `INSERT INTO sales (symbol_id, sell_date, qty_sold, sale_price_usd, fx_rate_usd_thb, created_at)
       VALUES (?, '2026-02-01', '5.00000000', '150.000000', '36.0000', '2026-02-01T00:00:00Z');`,
      [symbol.id],
    );
    expect(() => deleteSymbol(db, symbol.id)).toThrow(SymbolInUseError);
  });
});
