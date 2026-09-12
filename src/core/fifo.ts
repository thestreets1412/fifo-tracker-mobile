import Decimal from 'decimal.js';
import { DP } from './money';
import type { Allocation, Lot, Sale } from './types';

/**
 * A sale could not be covered by the lots held on its sale date.
 *
 * Carries structured fields rather than a sentence: core has no access to
 * ticker names, and the message has to be rendered in the user's language.
 */
export class InsufficientLotsError extends Error {
  constructor(
    readonly saleId: number,
    readonly symbolId: number,
    readonly sellDate: string,
    readonly requested: Decimal,
    readonly available: Decimal,
  ) {
    super(
      `Sale ${saleId} of symbol ${symbolId} on ${sellDate} requested ` +
        `${requested.toString()} but only ${available.toString()} was held`,
    );
    this.name = 'InsufficientLotsError';
  }
}

/**
 * Replays every sale against every lot, oldest lot first, and returns the
 * allocations that result.
 *
 * Pure: no database, no clock, no I/O. The same input always produces the
 * same output, which is what lets the caller throw allocations away and
 * rebuild them after any edit or import.
 *
 * Inputs are sorted here rather than trusted to arrive sorted — the sort
 * order IS the FIFO rule, so it belongs with the algorithm.
 */
export function rebuildAllocations(
  lots: readonly Lot[],
  sales: readonly Sale[],
): Allocation[] {
  const orderedLots = [...lots].sort(byLotOrder);
  const orderedSales = [...sales].sort(bySaleOrder);

  const remaining = new Map<number, Decimal>(
    orderedLots.map((lot) => [lot.id, lot.qty]),
  );
  const allocations: Allocation[] = [];

  for (const sale of orderedSales) {
    let outstanding = sale.qtySold;
    const drafted: Allocation[] = [];

    for (const lot of orderedLots) {
      if (outstanding.lessThanOrEqualTo(0)) break;
      if (lot.symbolId !== sale.symbolId) continue;
      // You cannot sell what you did not yet own. The Django app never
      // checked this, which let a mistyped year silently draw cost basis
      // from a lot bought after the sale.
      if (lot.buyDate > sale.sellDate) continue;

      const available = remaining.get(lot.id)!;
      if (available.lessThanOrEqualTo(0)) continue;

      const take = Decimal.min(available, outstanding);
      drafted.push({
        saleId: sale.id,
        lotId: lot.id,
        qtyAllocated: take,
        costBasisThb: take
          .times(lot.priceUsd)
          .times(lot.fxRateUsdThb)
          .toDecimalPlaces(DP.money, Decimal.ROUND_HALF_EVEN),
      });
      remaining.set(lot.id, available.minus(take));
      outstanding = outstanding.minus(take);
    }

    if (outstanding.greaterThan(0)) {
      throw new InsufficientLotsError(
        sale.id,
        sale.symbolId,
        sale.sellDate,
        sale.qtySold,
        sale.qtySold.minus(outstanding),
      );
    }

    allocations.push(...drafted);
  }

  return allocations;
}

function byLotOrder(a: Lot, b: Lot): number {
  return (
    compare(a.buyDate, b.buyDate) ||
    compare(a.createdAt, b.createdAt) ||
    a.id - b.id
  );
}

function bySaleOrder(a: Sale, b: Sale): number {
  return (
    compare(a.sellDate, b.sellDate) ||
    compare(a.createdAt, b.createdAt) ||
    a.id - b.id
  );
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
