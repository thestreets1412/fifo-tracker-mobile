import type { SymbolRow } from '../core/types';
import type { SqlDatabase } from '../db/sqlDatabase';
import { listSymbols } from '../db/repo';

export interface SymbolWithCounts {
  symbol: SymbolRow;
  lotCount: number;
  saleCount: number;
}

export function listSymbolsWithCounts(db: SqlDatabase): SymbolWithCounts[] {
  const symbols = listSymbols(db); // already ORDER BY ticker
  const lotCounts = countBySymbol(db, 'lots');
  const saleCounts = countBySymbol(db, 'sales');
  return symbols.map((symbol) => ({
    symbol,
    lotCount: lotCounts.get(symbol.id) ?? 0,
    saleCount: saleCounts.get(symbol.id) ?? 0,
  }));
}

function countBySymbol(db: SqlDatabase, table: 'lots' | 'sales'): Map<number, number> {
  const rows = db.getAllSync<{ symbolId: number; count: number }>(
    `SELECT symbol_id AS symbolId, COUNT(*) AS count FROM ${table} GROUP BY symbol_id;`,
  );
  return new Map(rows.map((r) => [r.symbolId, r.count]));
}
