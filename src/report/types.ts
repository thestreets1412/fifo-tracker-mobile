import type Decimal from 'decimal.js';
import type { Allocation, Lot, Sale, SymbolRow } from '../core/types';

export interface ReportLot extends Lot {
  costThb: Decimal;
  remainingQty: Decimal;
}

export interface ReportAllocation extends Allocation {
  buyDate: string;
}

export interface ReportSale extends Sale {
  proceedsThb: Decimal;
  costBasisThb: Decimal;
  gainThb: Decimal;
  allocations: readonly ReportAllocation[];
}

export interface ReportSection {
  symbol: SymbolRow;
  lots: readonly ReportLot[];
  sales: readonly ReportSale[];
  remainingQty: Decimal;
  remainingCostThb: Decimal;
  realizedGainThb: Decimal;
}

export interface FifoReport {
  generatedAt: string;
  symbolId?: number;
  sections: readonly ReportSection[];
  totalOpenCostThb: Decimal;
  totalRealizedGainThb: Decimal;
}
