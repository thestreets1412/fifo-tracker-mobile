import Decimal from 'decimal.js';
import { DP } from './money';
import type { Allocation, Lot, Sale } from './types';

/**
 * Values the Django app exposed as model properties. They live here rather
 * than in SQL because SUM() over a TEXT column coerces through float64,
 * which is exactly the precision loss the TEXT storage exists to avoid.
 *
 * Callers pass the allocation rows they already loaded; these functions
 * never query.
 */

export function lotQtyRemaining(lot: Lot, allocations: readonly Allocation[]): Decimal {
  return allocations
    .filter((allocation) => allocation.lotId === lot.id)
    .reduce((left, allocation) => left.minus(allocation.qtyAllocated), lot.qty);
}

export function lotCostThb(lot: Lot): Decimal {
  return lot.priceUsd
    .times(lot.qty)
    .times(lot.fxRateUsdThb)
    .toDecimalPlaces(DP.money, Decimal.ROUND_HALF_EVEN);
}

export function saleProceedsThb(sale: Sale): Decimal {
  return sale.salePriceUsd
    .times(sale.qtySold)
    .minus(sale.feeUsd)
    .times(sale.fxRateUsdThb)
    .toDecimalPlaces(DP.money, Decimal.ROUND_HALF_EVEN);
}

export function saleCostBasisThb(sale: Sale, allocations: readonly Allocation[]): Decimal {
  return allocations
    .filter((allocation) => allocation.saleId === sale.id)
    .reduce((total, allocation) => total.plus(allocation.costBasisThb), new Decimal(0));
}

export function saleCapitalGainThb(sale: Sale, allocations: readonly Allocation[]): Decimal {
  return saleProceedsThb(sale).minus(saleCostBasisThb(sale, allocations));
}
