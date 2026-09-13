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

// ========== ALLOCATION REPOSITORY ==========

export interface AllocationRow {
  saleId: number;
  lotId: number;
  qtyAllocated: string;
  costBasisThb: string;
}

interface AllocationDbRow {
  sale_id: number;
  lot_id: number;
  qty_allocated: string;
  cost_basis_thb: string;
}

function toAllocationRow(row: AllocationDbRow): AllocationRow {
  return {
    saleId: row.sale_id,
    lotId: row.lot_id,
    qtyAllocated: row.qty_allocated,
    costBasisThb: row.cost_basis_thb,
  };
}

/**
 * Discards every existing allocation and inserts the given set. Allocations
 * are derived data (spec §2.4) — there is no update-in-place, only
 * wholesale replacement after every rebuild.
 */
export function replaceAllAllocations(db: SqlDatabase, allocations: readonly AllocationRow[]): void {
  db.runSync('DELETE FROM sale_allocations;');
  for (const allocation of allocations) {
    db.runSync(
      'INSERT INTO sale_allocations (sale_id, lot_id, qty_allocated, cost_basis_thb) VALUES (?, ?, ?, ?);',
      [allocation.saleId, allocation.lotId, allocation.qtyAllocated, allocation.costBasisThb],
    );
  }
}

export function listAllocations(
  db: SqlDatabase,
  filter?: { saleId?: number; lotId?: number },
): AllocationRow[] {
  if (filter?.saleId !== undefined) {
    return db
      .getAllSync<AllocationDbRow>('SELECT * FROM sale_allocations WHERE sale_id = ?;', [filter.saleId])
      .map(toAllocationRow);
  }
  if (filter?.lotId !== undefined) {
    return db
      .getAllSync<AllocationDbRow>('SELECT * FROM sale_allocations WHERE lot_id = ?;', [filter.lotId])
      .map(toAllocationRow);
  }
  return db.getAllSync<AllocationDbRow>('SELECT * FROM sale_allocations;').map(toAllocationRow);
}

// ========== CACHE REPOSITORIES (fx_rates, quotes) ==========
//
// Both tables are pure caches (spec §5): reconstructible, excluded from
// backups, and never a source of truth. They are the only tables in the
// schema whose rows may be discarded without consequence.

export interface FxRateRow {
  /** 'YYYY-MM-DD' — the date the rate applies to, not when it was fetched. */
  rateDate: string;
  /** 4 dp decimal string. */
  usdThb: string;
  /** ISO 8601 UTC. */
  fetchedAt: string;
}

interface FxRateDbRow {
  rate_date: string;
  usd_thb: string;
  fetched_at: string;
}

function toFxRateRow(row: FxRateDbRow): FxRateRow {
  return { rateDate: row.rate_date, usdThb: row.usd_thb, fetchedAt: row.fetched_at };
}

export function getFxRateRow(db: SqlDatabase, rateDate: string): FxRateRow | null {
  const [row] = db.getAllSync<FxRateDbRow>('SELECT * FROM fx_rates WHERE rate_date = ?;', [rateDate]);
  return row ? toFxRateRow(row) : null;
}

export function upsertFxRateRow(db: SqlDatabase, row: FxRateRow): void {
  db.runSync(
    `INSERT INTO fx_rates (rate_date, usd_thb, fetched_at) VALUES (?, ?, ?)
     ON CONFLICT(rate_date) DO UPDATE SET usd_thb = excluded.usd_thb, fetched_at = excluded.fetched_at;`,
    [row.rateDate, row.usdThb, row.fetchedAt],
  );
}

/**
 * The most recent date any rate was cached for. Used only as the dashboard's
 * last-resort fallback when today's rate cannot be fetched — the caller is
 * responsible for telling the user which date the figure came from.
 * Ordered by rate_date, not fetched_at: what matters is which rate is
 * closest to today, not which request happened to run last.
 */
export function latestFxRateRow(db: SqlDatabase): FxRateRow | null {
  const [row] = db.getAllSync<FxRateDbRow>('SELECT * FROM fx_rates ORDER BY rate_date DESC LIMIT 1;');
  return row ? toFxRateRow(row) : null;
}

export interface QuoteRow {
  /** Uppercase, trimmed. */
  ticker: string;
  /** 6 dp decimal string. */
  priceUsd: string;
  /** ISO 8601 UTC. */
  fetchedAt: string;
}

interface QuoteDbRow {
  ticker: string;
  price_usd: string;
  fetched_at: string;
}

function toQuoteRow(row: QuoteDbRow): QuoteRow {
  return { ticker: row.ticker, priceUsd: row.price_usd, fetchedAt: row.fetched_at };
}

/**
 * Same normalization as symbols (spec §7.4): `nvda`, `NVDA`, and `NVDA `
 * must never become three cache entries for one instrument.
 * Reuses the normalizeTicker function defined for symbols above.
 */
export function getQuoteRow(db: SqlDatabase, ticker: string): QuoteRow | null {
  const [row] = db.getAllSync<QuoteDbRow>('SELECT * FROM quotes WHERE ticker = ?;', [normalizeTicker(ticker)]);
  return row ? toQuoteRow(row) : null;
}

export function upsertQuoteRow(db: SqlDatabase, row: QuoteRow): void {
  db.runSync(
    `INSERT INTO quotes (ticker, price_usd, fetched_at) VALUES (?, ?, ?)
     ON CONFLICT(ticker) DO UPDATE SET price_usd = excluded.price_usd, fetched_at = excluded.fetched_at;`,
    [normalizeTicker(row.ticker), row.priceUsd, row.fetchedAt],
  );
}
