import Decimal from 'decimal.js';
import { fromStored, toStored, DP } from '../core/money';
import { rebuildAllocations } from '../core/fifo';
import type { Lot, Sale } from '../core/types';
import type { SqlDatabase } from '../db/sqlDatabase';
import * as repo from '../db/repo';

export interface NewLotInput {
  symbolId: number;
  buyDate: string;
  priceUsd: Decimal;
  qty: Decimal;
  fxRateUsdThb: Decimal;
  evidenceFile: string | null;
}

export interface NewSaleInput {
  symbolId: number;
  sellDate: string;
  qtySold: Decimal;
  salePriceUsd: Decimal;
  feeUsd: Decimal;
  fxRateUsdThb: Decimal;
  evidenceFile: string | null;
}

function toDomainLot(row: repo.LotRow): Lot {
  return {
    id: row.id,
    symbolId: row.symbolId,
    buyDate: row.buyDate,
    priceUsd: fromStored(row.priceUsd),
    qty: fromStored(row.qty),
    fxRateUsdThb: fromStored(row.fxRateUsdThb),
    createdAt: row.createdAt,
    evidenceFile: row.evidenceFile,
  };
}

function toDomainSale(row: repo.SaleRow): Sale {
  return {
    id: row.id,
    symbolId: row.symbolId,
    sellDate: row.sellDate,
    qtySold: fromStored(row.qtySold),
    salePriceUsd: fromStored(row.salePriceUsd),
    feeUsd: fromStored(row.feeUsd),
    fxRateUsdThb: fromStored(row.fxRateUsdThb),
    createdAt: row.createdAt,
    evidenceFile: row.evidenceFile,
  };
}

function toLotRow(input: NewLotInput, createdAt: string): repo.NewLotRow {
  return {
    symbolId: input.symbolId,
    buyDate: input.buyDate,
    priceUsd: toStored(input.priceUsd, DP.price),
    qty: toStored(input.qty, DP.qty),
    fxRateUsdThb: toStored(input.fxRateUsdThb, DP.fxRate),
    createdAt,
    evidenceFile: input.evidenceFile,
  };
}

function toSaleRow(input: NewSaleInput, createdAt: string): repo.NewSaleRow {
  return {
    symbolId: input.symbolId,
    sellDate: input.sellDate,
    qtySold: toStored(input.qtySold, DP.qty),
    salePriceUsd: toStored(input.salePriceUsd, DP.price),
    feeUsd: toStored(input.feeUsd, DP.money),
    fxRateUsdThb: toStored(input.fxRateUsdThb, DP.fxRate),
    createdAt,
    evidenceFile: input.evidenceFile,
  };
}

/**
 * Recomputes every allocation from scratch and replaces the
 * sale_allocations table with the result (spec §2.4: allocations are
 * derived, never authoritative). Runs inside the caller's transaction —
 * it never opens its own, so a caller can compose it with other writes
 * and roll everything back together.
 */
export function rebuildLedger(db: SqlDatabase): void {
  const lots = repo.listLots(db).map(toDomainLot);
  const sales = repo.listSales(db).map(toDomainSale);
  const allocations = rebuildAllocations(lots, sales);
  repo.replaceAllAllocations(
    db,
    allocations.map((allocation) => ({
      saleId: allocation.saleId,
      lotId: allocation.lotId,
      qtyAllocated: toStored(allocation.qtyAllocated, DP.qty),
      costBasisThb: toStored(allocation.costBasisThb, DP.money),
    })),
  );
}

// Tracks transaction nesting depth per database. Keyed by db instance
// (rather than a single module-level counter) so two databases used in the
// same process — as happens across independent tests — can never be
// mistaken for one nested call chain.
const transactionDepths = new WeakMap<SqlDatabase, number>();

/**
 * Runs `fn` inside a transaction. Only the outermost call issues a real
 * `BEGIN`/`COMMIT`/`ROLLBACK`; a call made while already inside one (e.g. a
 * future bulk-import service wrapping many addLot/addSale calls in one
 * atomic import) simply runs `fn` in place and lets any error propagate to
 * the outermost catch, which performs the actual rollback — so a failure
 * anywhere in a nested sequence undoes the whole sequence, not just the
 * innermost call. This intentionally does not use SAVEPOINTs: a partial
 * inner success is never meant to survive an outer failure here.
 */
export function withTransaction<T>(db: SqlDatabase, fn: () => T): T {
  const depth = transactionDepths.get(db) ?? 0;
  const isOutermost = depth === 0;
  transactionDepths.set(db, depth + 1);

  if (isOutermost) {
    db.execSync('BEGIN;');
  }
  try {
    const result = fn();
    if (isOutermost) {
      db.execSync('COMMIT;');
    }
    return result;
  } catch (error) {
    if (isOutermost) {
      try {
        db.execSync('ROLLBACK;');
      } catch {
        // SQLite may have already rolled back the transaction itself (e.g.
        // after SQLITE_FULL/SQLITE_IOERR/SQLITE_NOMEM), in which case this
        // ROLLBACK has nothing to do and would itself throw ("cannot
        // rollback - no transaction is active"). Database state is correct
        // either way; what must survive is the original error below.
      }
    }
    throw error;
  } finally {
    transactionDepths.set(db, depth);
  }
}

export function addLot(db: SqlDatabase, input: NewLotInput): repo.LotRow {
  return withTransaction(db, () => {
    const inserted = repo.insertLot(db, toLotRow(input, new Date().toISOString()));
    rebuildLedger(db);
    return inserted;
  });
}

export function editLot(db: SqlDatabase, id: number, input: NewLotInput): void {
  withTransaction(db, () => {
    const existing = repo.getLot(db, id);
    if (!existing) throw new Error(`Lot ${id} does not exist`);
    repo.updateLot(db, id, toLotRow(input, existing.createdAt));
    rebuildLedger(db);
  });
}

export function deleteLot(db: SqlDatabase, id: number): void {
  withTransaction(db, () => {
    repo.deleteLot(db, id);
    rebuildLedger(db);
  });
}

export function addSale(db: SqlDatabase, input: NewSaleInput): repo.SaleRow {
  return withTransaction(db, () => {
    const inserted = repo.insertSale(db, toSaleRow(input, new Date().toISOString()));
    rebuildLedger(db);
    return inserted;
  });
}

export function editSale(db: SqlDatabase, id: number, input: NewSaleInput): void {
  withTransaction(db, () => {
    const existing = repo.getSale(db, id);
    if (!existing) throw new Error(`Sale ${id} does not exist`);
    repo.updateSale(db, id, toSaleRow(input, existing.createdAt));
    rebuildLedger(db);
  });
}

export function deleteSale(db: SqlDatabase, id: number): void {
  withTransaction(db, () => {
    repo.deleteSale(db, id);
    rebuildLedger(db);
  });
}
