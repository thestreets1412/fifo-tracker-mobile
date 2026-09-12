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

export class InvalidEvidenceFileError extends Error {
  constructor(readonly value: string) {
    super(`evidenceFile must be a bare filename, not a path: ${JSON.stringify(value)}`);
    this.name = 'InvalidEvidenceFileError';
  }
}

/**
 * Enforces the project rule that evidence images are stored by filename only
 * (CLAUDE.md: "Evidence images are stored by filename, never absolute
 * path."). Rejects anything that looks like a path or URI rather than a bare
 * filename, so a future image-picker integration can't accidentally persist
 * a `file:///...` URI that would orphan the image on reinstall.
 */
function validateEvidenceFile(value: string | null): void {
  if (value !== null && /[/\\:]/.test(value)) {
    throw new InvalidEvidenceFileError(value);
  }
}

export function toDomainLot(row: repo.LotRow): Lot {
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

export function toDomainSale(row: repo.SaleRow): Sale {
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
 * derived, never authoritative). Wraps itself in `withTransaction`, which
 * nests cleanly: when called from inside `addLot`/`editLot`/etc. (which
 * already hold the outer transaction) this is a no-op wrapper, and when
 * called bare — as tests do — it still gets real atomicity, so an
 * interruption between `replaceAllAllocations`'s DELETE and its N inserts
 * can never leave the allocation table partially populated.
 */
export function rebuildLedger(db: SqlDatabase): void {
  withTransaction(db, () => {
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
  });
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

  try {
    // BEGIN lives inside the try (not before it) so that if it itself
    // throws — e.g. "cannot start a transaction within a transaction"
    // because the connection was left mid-transaction by something
    // earlier — the catch below still runs and, critically, the finally
    // still resets the depth counter. Leaving BEGIN outside the try would
    // let a BEGIN failure skip the finally entirely, latching depth at a
    // nonzero value forever and silently disabling transactional
    // protection for every later call on this same database instance.
    if (isOutermost) {
      db.execSync('BEGIN;');
    }
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
        // Either BEGIN above never succeeded (nothing to roll back) or
        // SQLite already rolled back the transaction itself (e.g. after
        // SQLITE_FULL/SQLITE_IOERR/SQLITE_NOMEM), in which case this
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
  validateEvidenceFile(input.evidenceFile);
  return withTransaction(db, () => {
    const inserted = repo.insertLot(db, toLotRow(input, new Date().toISOString()));
    rebuildLedger(db);
    return inserted;
  });
}

export function editLot(db: SqlDatabase, id: number, input: NewLotInput): void {
  validateEvidenceFile(input.evidenceFile);
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
  validateEvidenceFile(input.evidenceFile);
  return withTransaction(db, () => {
    const inserted = repo.insertSale(db, toSaleRow(input, new Date().toISOString()));
    rebuildLedger(db);
    return inserted;
  });
}

export function editSale(db: SqlDatabase, id: number, input: NewSaleInput): void {
  validateEvidenceFile(input.evidenceFile);
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
