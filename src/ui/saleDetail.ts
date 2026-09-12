import type Decimal from 'decimal.js';
import type { Allocation, Lot, Sale, SymbolRow } from '../core/types';
import { saleProceedsThb, saleCostBasisThb, saleCapitalGainThb } from '../core/derive';

export interface SaleDetailLine {
  lotId: number;
  buyDate: string;
  qtyAllocated: Decimal;
  costBasisThb: Decimal;
}

export interface SaleDetail {
  symbol: SymbolRow;
  sale: Sale;
  lines: SaleDetailLine[];
  proceedsThb: Decimal;
  costBasisThb: Decimal;
  capitalGainThb: Decimal;
}

export function buildSaleDetail(
  symbol: SymbolRow,
  sale: Sale,
  lots: readonly Lot[],
  allocations: readonly Allocation[],
): SaleDetail {
  const buyDateByLot = new Map(lots.map((lot) => [lot.id, lot.buyDate]));
  const lines: SaleDetailLine[] = allocations
    .filter((a) => a.saleId === sale.id)
    .map((a) => ({
      lotId: a.lotId,
      buyDate: buyDateByLot.get(a.lotId) ?? '',
      qtyAllocated: a.qtyAllocated,
      costBasisThb: a.costBasisThb,
    }))
    .sort((x, y) => (x.buyDate < y.buyDate ? -1 : x.buyDate > y.buyDate ? 1 : x.lotId - y.lotId));

  return {
    symbol,
    sale,
    lines,
    proceedsThb: saleProceedsThb(sale),
    costBasisThb: saleCostBasisThb(sale, allocations),
    capitalGainThb: saleCapitalGainThb(sale, allocations),
  };
}
