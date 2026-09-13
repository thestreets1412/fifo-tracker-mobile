import Decimal from 'decimal.js';
import { lotQtyRemaining, lotRemainingCostThb, saleCapitalGainThb } from '../core/derive';
import { fromStored, DP } from '../core/money';
import type { Allocation, SymbolRow } from '../core/types';
import type { SqlDatabase } from '../db/sqlDatabase';
import { listAllocations, listLots, listSales } from '../db/repo';
import { toDomainLot, toDomainSale } from './ledger';

/**
 * The dashboard summary (spec §7.1), ported from the Django original's
 * build_dashboard_summary (docs/reference/django/services.py:219).
 *
 * This module performs NO I/O beyond reading the ledger tables: live prices
 * arrive already resolved, in a map. That is deliberate — it keeps every
 * money calculation on the dashboard testable under plain Node with no
 * network and no stubbed fetch, and it means a slow or failed lookup can
 * never change an arithmetic result, only leave a field null.
 */

export interface LivePrice {
  priceUsd: Decimal;
  /** ISO 8601 UTC. */
  fetchedAt: string;
  stale: boolean;
}

export interface PortfolioRow {
  symbol: SymbolRow;
  remainingQty: Decimal;
  /** Cost of the shares still held — not what the lots originally cost. */
  costThb: Decimal;
  realizedGainThb: Decimal;
  /** null when no price was available for this symbol, or no FX rate at all. */
  currentValueThb: Decimal | null;
  unrealizedGainThb: Decimal | null;
  /** null when there is no cost basis to divide by. */
  unrealizedGainPct: Decimal | null;
  priceStale: boolean;
  priceFetchedAt: string | null;
}

export interface PortfolioSummary {
  rows: PortfolioRow[];
  totalCostThb: Decimal;
  totalRealizedGainThb: Decimal;
  /** null unless every symbol that needed a price got one. */
  totalValueThb: Decimal | null;
  totalUnrealizedGainThb: Decimal | null;
  hasFullValue: boolean;
}

/**
 * Every symbol with at least one lot or sale, ordered by ticker.
 *
 * EXISTS, never SUM or JOIN over a money column: SQLite coerces TEXT to
 * float for aggregation, which is precisely what storing money as TEXT
 * exists to prevent. Row presence is the only thing SQL is asked for here.
 */
export function listPortfolioSymbols(db: SqlDatabase): SymbolRow[] {
  return db.getAllSync<SymbolRow>(
    `SELECT s.id, s.ticker, s.name FROM symbols s
     WHERE EXISTS (SELECT 1 FROM lots  l WHERE l.symbol_id  = s.id)
        OR EXISTS (SELECT 1 FROM sales sa WHERE sa.symbol_id = s.id)
     ORDER BY s.ticker;`,
  );
}

export function buildPortfolioSummary(
  db: SqlDatabase,
  prices: ReadonlyMap<number, LivePrice>,
  fxRate: Decimal | null,
): PortfolioSummary {
  const allocations: Allocation[] = listAllocations(db).map((a) => ({
    saleId: a.saleId,
    lotId: a.lotId,
    qtyAllocated: fromStored(a.qtyAllocated),
    costBasisThb: fromStored(a.costBasisThb),
  }));

  const rows: PortfolioRow[] = [];
  let totalCostThb = new Decimal(0);
  let totalValueThb = new Decimal(0);
  let totalUnrealizedGainThb = new Decimal(0);
  let totalRealizedGainThb = new Decimal(0);
  let hasFullValue = fxRate !== null;

  for (const symbol of listPortfolioSymbols(db)) {
    const lots = listLots(db, symbol.id).map(toDomainLot);
    const sales = listSales(db, symbol.id).map(toDomainSale);

    const remainingQty = lots.reduce((total, lot) => total.plus(lotQtyRemaining(lot, allocations)), new Decimal(0));
    const costThb = lots.reduce((total, lot) => total.plus(lotRemainingCostThb(lot, allocations)), new Decimal(0));
    const realizedGainThb = sales.reduce((total, sale) => total.plus(saleCapitalGainThb(sale, allocations)), new Decimal(0));

    totalCostThb = totalCostThb.plus(costThb);
    totalRealizedGainThb = totalRealizedGainThb.plus(realizedGainThb);

    const price = prices.get(symbol.id);
    let currentValueThb: Decimal | null = null;
    let unrealizedGainThb: Decimal | null = null;
    let unrealizedGainPct: Decimal | null = null;

    if (fxRate === null) {
      // No FX rate means no THB figure is computable for anything.
    } else if (remainingQty.isZero()) {
      // Nothing held: value is exactly zero and no lookup was needed.
      currentValueThb = new Decimal(0);
      unrealizedGainThb = new Decimal(0).minus(costThb);
    } else if (price) {
      currentValueThb = remainingQty
        .times(price.priceUsd)
        .times(fxRate)
        .toDecimalPlaces(DP.money, Decimal.ROUND_HALF_EVEN);
      unrealizedGainThb = currentValueThb.minus(costThb);
    } else {
      // This one symbol degrades; the rest of the dashboard does not.
      hasFullValue = false;
    }

    if (unrealizedGainThb !== null && costThb.greaterThan(0)) {
      unrealizedGainPct = unrealizedGainThb.dividedBy(costThb).times(100).toDecimalPlaces(2, Decimal.ROUND_HALF_EVEN);
    }

    if (currentValueThb !== null) totalValueThb = totalValueThb.plus(currentValueThb);
    if (unrealizedGainThb !== null) totalUnrealizedGainThb = totalUnrealizedGainThb.plus(unrealizedGainThb);

    rows.push({
      symbol,
      remainingQty,
      costThb,
      realizedGainThb,
      currentValueThb,
      unrealizedGainThb,
      unrealizedGainPct,
      priceStale: price?.stale ?? false,
      priceFetchedAt: price?.fetchedAt ?? null,
    });
  }

  return {
    rows,
    totalCostThb,
    totalRealizedGainThb,
    // Realized gain is ledger arithmetic and never degrades. The live
    // totals do: a partial total would read as a portfolio that shrank.
    totalValueThb: hasFullValue ? totalValueThb : null,
    totalUnrealizedGainThb: hasFullValue ? totalUnrealizedGainThb : null,
    hasFullValue,
  };
}
