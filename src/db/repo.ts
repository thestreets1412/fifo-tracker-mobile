import type { SymbolRow } from '../core/types';
import type { SqlDatabase } from './sqlDatabase';

export type { SqlDatabase } from './sqlDatabase';

export class DuplicateTickerError extends Error {
  constructor(readonly ticker: string) {
    super(`Symbol ${ticker} already exists`);
    this.name = 'DuplicateTickerError';
  }
}

export class SymbolInUseError extends Error {
  constructor(readonly symbolId: number, readonly ticker: string) {
    super(`Symbol ${ticker} (id ${symbolId}) is referenced by a lot or sale and cannot be deleted`);
    this.name = 'SymbolInUseError';
  }
}

function normalizeTicker(ticker: string): string {
  return ticker.trim().toUpperCase();
}

export function createSymbol(db: SqlDatabase, ticker: string, name = ''): SymbolRow {
  const normalized = normalizeTicker(ticker);
  if (findSymbolByTicker(db, normalized)) {
    throw new DuplicateTickerError(normalized);
  }
  const result = db.runSync('INSERT INTO symbols (ticker, name) VALUES (?, ?);', [normalized, name]);
  return { id: result.lastInsertRowId, ticker: normalized, name };
}

export function findSymbolByTicker(db: SqlDatabase, ticker: string): SymbolRow | null {
  const rows = db.getAllSync<SymbolRow>('SELECT * FROM symbols WHERE ticker = ?;', [normalizeTicker(ticker)]);
  return rows[0] ?? null;
}

/**
 * Resolves a ticker to its symbol, creating it if it does not exist yet.
 * Needed wherever a ticker arrives as free text rather than a chosen
 * symbol id — the buy-form combo field (plan 3) and backup import
 * (plan 6) both need this rather than duplicating it.
 */
export function findOrCreateSymbol(db: SqlDatabase, ticker: string, name = ''): SymbolRow {
  return findSymbolByTicker(db, ticker) ?? createSymbol(db, ticker, name);
}

export function listSymbols(db: SqlDatabase): SymbolRow[] {
  return db.getAllSync<SymbolRow>('SELECT * FROM symbols ORDER BY ticker;');
}

export function renameSymbol(db: SqlDatabase, id: number, name: string): void {
  db.runSync('UPDATE symbols SET name = ? WHERE id = ?;', [name, id]);
}

export function deleteSymbol(db: SqlDatabase, id: number): void {
  const [symbol] = db.getAllSync<SymbolRow>('SELECT * FROM symbols WHERE id = ?;', [id]);
  if (!symbol) return;

  const lotResults = db.getAllSync<{ count: number }>(
    'SELECT COUNT(*) as count FROM lots WHERE symbol_id = ?;',
    [id],
  );
  const lotCount = lotResults[0]?.count ?? 0;

  const saleResults = db.getAllSync<{ count: number }>(
    'SELECT COUNT(*) as count FROM sales WHERE symbol_id = ?;',
    [id],
  );
  const saleCount = saleResults[0]?.count ?? 0;

  if (lotCount > 0 || saleCount > 0) {
    throw new SymbolInUseError(id, symbol.ticker);
  }

  db.runSync('DELETE FROM symbols WHERE id = ?;', [id]);
}

// ========== LOT REPOSITORY ==========

export interface LotRow {
  id: number;
  symbolId: number;
  buyDate: string;
  priceUsd: string;
  qty: string;
  fxRateUsdThb: string;
  createdAt: string;
  evidenceFile: string | null;
}

export type NewLotRow = Omit<LotRow, 'id'>;

interface LotDbRow {
  id: number;
  symbol_id: number;
  buy_date: string;
  price_usd: string;
  qty: string;
  fx_rate_usd_thb: string;
  created_at: string;
  evidence_file: string | null;
}

function toLotRow(row: LotDbRow): LotRow {
  return {
    id: row.id,
    symbolId: row.symbol_id,
    buyDate: row.buy_date,
    priceUsd: row.price_usd,
    qty: row.qty,
    fxRateUsdThb: row.fx_rate_usd_thb,
    createdAt: row.created_at,
    evidenceFile: row.evidence_file,
  };
}

export function insertLot(db: SqlDatabase, lot: NewLotRow): LotRow {
  const result = db.runSync(
    `INSERT INTO lots (symbol_id, buy_date, price_usd, qty, fx_rate_usd_thb, created_at, evidence_file)
     VALUES (?, ?, ?, ?, ?, ?, ?);`,
    [lot.symbolId, lot.buyDate, lot.priceUsd, lot.qty, lot.fxRateUsdThb, lot.createdAt, lot.evidenceFile],
  );
  return { id: result.lastInsertRowId, ...lot };
}

export function listLots(db: SqlDatabase, symbolId?: number): LotRow[] {
  const rows = symbolId === undefined
    ? db.getAllSync<LotDbRow>('SELECT * FROM lots ORDER BY buy_date, created_at, id;')
    : db.getAllSync<LotDbRow>(
        'SELECT * FROM lots WHERE symbol_id = ? ORDER BY buy_date, created_at, id;',
        [symbolId],
      );
  return rows.map(toLotRow);
}

export function getLot(db: SqlDatabase, id: number): LotRow | null {
  const [row] = db.getAllSync<LotDbRow>('SELECT * FROM lots WHERE id = ?;', [id]);
  return row ? toLotRow(row) : null;
}

/** Never touches created_at — it is the FIFO tiebreak stamp, fixed at insert. */
export function updateLot(db: SqlDatabase, id: number, lot: NewLotRow): void {
  db.runSync(
    `UPDATE lots SET symbol_id = ?, buy_date = ?, price_usd = ?, qty = ?, fx_rate_usd_thb = ?, evidence_file = ?
     WHERE id = ?;`,
    [lot.symbolId, lot.buyDate, lot.priceUsd, lot.qty, lot.fxRateUsdThb, lot.evidenceFile, id],
  );
}

export function deleteLot(db: SqlDatabase, id: number): void {
  db.runSync('DELETE FROM lots WHERE id = ?;', [id]);
}

// ========== SALE REPOSITORY ==========

export interface SaleRow {
  id: number;
  symbolId: number;
  sellDate: string;
  qtySold: string;
  salePriceUsd: string;
  feeUsd: string;
  fxRateUsdThb: string;
  createdAt: string;
  evidenceFile: string | null;
}

export type NewSaleRow = Omit<SaleRow, 'id'>;

interface SaleDbRow {
  id: number;
  symbol_id: number;
  sell_date: string;
  qty_sold: string;
  sale_price_usd: string;
  fee_usd: string;
  fx_rate_usd_thb: string;
  created_at: string;
  evidence_file: string | null;
}

function toSaleRow(row: SaleDbRow): SaleRow {
  return {
    id: row.id,
    symbolId: row.symbol_id,
    sellDate: row.sell_date,
    qtySold: row.qty_sold,
    salePriceUsd: row.sale_price_usd,
    feeUsd: row.fee_usd,
    fxRateUsdThb: row.fx_rate_usd_thb,
    createdAt: row.created_at,
    evidenceFile: row.evidence_file,
  };
}

export function insertSale(db: SqlDatabase, sale: NewSaleRow): SaleRow {
  const result = db.runSync(
    `INSERT INTO sales (symbol_id, sell_date, qty_sold, sale_price_usd, fee_usd, fx_rate_usd_thb, created_at, evidence_file)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
    [
      sale.symbolId, sale.sellDate, sale.qtySold, sale.salePriceUsd,
      sale.feeUsd, sale.fxRateUsdThb, sale.createdAt, sale.evidenceFile,
    ],
  );
  return { id: result.lastInsertRowId, ...sale };
}

export function listSales(db: SqlDatabase, symbolId?: number): SaleRow[] {
  const rows = symbolId === undefined
    ? db.getAllSync<SaleDbRow>('SELECT * FROM sales ORDER BY sell_date, created_at, id;')
    : db.getAllSync<SaleDbRow>(
        'SELECT * FROM sales WHERE symbol_id = ? ORDER BY sell_date, created_at, id;',
        [symbolId],
      );
  return rows.map(toSaleRow);
}

export function getSale(db: SqlDatabase, id: number): SaleRow | null {
  const [row] = db.getAllSync<SaleDbRow>('SELECT * FROM sales WHERE id = ?;', [id]);
  return row ? toSaleRow(row) : null;
}

/** Never touches created_at — it is the FIFO tiebreak stamp, fixed at insert. */
export function updateSale(db: SqlDatabase, id: number, sale: NewSaleRow): void {
  db.runSync(
    `UPDATE sales SET symbol_id = ?, sell_date = ?, qty_sold = ?, sale_price_usd = ?,
       fee_usd = ?, fx_rate_usd_thb = ?, evidence_file = ?
     WHERE id = ?;`,
    [
      sale.symbolId, sale.sellDate, sale.qtySold, sale.salePriceUsd,
      sale.feeUsd, sale.fxRateUsdThb, sale.evidenceFile, id,
    ],
  );
}

export function deleteSale(db: SqlDatabase, id: number): void {
  db.runSync('DELETE FROM sales WHERE id = ?;', [id]);
}
