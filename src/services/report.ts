import Decimal from 'decimal.js';
import type { Allocation } from '../core/types';
import { fromStored } from '../core/money';
import { lotCostThb, lotQtyRemaining, lotRemainingCostThb, saleProceedsThb, saleCostBasisThb, saleCapitalGainThb } from '../core/derive';
import { listSymbols, listLots, listSales, listAllocations } from '../db/repo';
import type { SqlDatabase } from '../db/sqlDatabase';
import { toDomainLot, toDomainSale, withTransaction } from './ledger';
import type { FifoReport, ReportSection } from '../report/types';

/** Capture a consistent ledger snapshot. No network, writes, or native modules. */
export function buildFifoReport(
  db: SqlDatabase,
  options: { symbolId?: number; generatedAt: string },
): FifoReport {
  const generatedAt = new Date(options.generatedAt).toISOString();
  const snapshot = withTransaction(db, () => ({
    symbols: listSymbols(db),
    lots: listLots(db).map(toDomainLot),
    sales: listSales(db).map(toDomainSale),
    allocations: listAllocations(db).map((a): Allocation => ({
      ...a, qtyAllocated: fromStored(a.qtyAllocated), costBasisThb: fromStored(a.costBasisThb),
    })),
  }));
  const lotOrder = new Map(snapshot.lots.map((lot, index) => [lot.id, index]));
  const lotsById = new Map(snapshot.lots.map((lot) => [lot.id, lot]));
  const sections: ReportSection[] = [];
  for (const symbol of snapshot.symbols) {
    if (options.symbolId !== undefined && symbol.id !== options.symbolId) continue;
    const lots = snapshot.lots.filter((lot) => lot.symbolId === symbol.id);
    const sales = snapshot.sales.filter((sale) => sale.symbolId === symbol.id);
    if (lots.length === 0 && sales.length === 0) continue;
    const allocations = snapshot.allocations;
    const reportLots = lots.map((lot) => ({
      ...lot, costThb: lotCostThb(lot), remainingQty: lotQtyRemaining(lot, allocations),
    }));
    const reportSales = sales.map((sale) => ({
      ...sale,
      proceedsThb: saleProceedsThb(sale),
      costBasisThb: saleCostBasisThb(sale, allocations),
      gainThb: saleCapitalGainThb(sale, allocations),
      allocations: allocations.filter((a) => a.saleId === sale.id)
        .sort((a, b) => (lotOrder.get(a.lotId) ?? -1) - (lotOrder.get(b.lotId) ?? -1))
        .map((a) => {
          const lot = lotsById.get(a.lotId);
          if (!lot) throw new Error('Report allocation references a missing lot');
          return { ...a, buyDate: lot.buyDate };
        }),
    }));
    sections.push({
      symbol, lots: reportLots, sales: reportSales,
      remainingQty: reportLots.reduce((sum, lot) => sum.plus(lot.remainingQty), new Decimal(0)),
      remainingCostThb: lots.reduce((sum, lot) => sum.plus(lotRemainingCostThb(lot, allocations)), new Decimal(0)),
      realizedGainThb: reportSales.reduce((sum, sale) => sum.plus(sale.gainThb), new Decimal(0)),
    });
  }
  return {
    generatedAt, symbolId: options.symbolId, sections,
    totalOpenCostThb: sections.reduce((sum, s) => sum.plus(s.remainingCostThb), new Decimal(0)),
    totalRealizedGainThb: sections.reduce((sum, s) => sum.plus(s.realizedGainThb), new Decimal(0)),
  };
}
