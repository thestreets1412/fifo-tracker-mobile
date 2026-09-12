import type Decimal from 'decimal.js';

export interface SymbolRow {
  id: number;
  ticker: string;
  name: string;
}

/** One BUY transaction. */
export interface Lot {
  id: number;
  symbolId: number;
  /** 'YYYY-MM-DD' */
  buyDate: string;
  priceUsd: Decimal;
  qty: Decimal;
  fxRateUsdThb: Decimal;
  /** ISO 8601 UTC */
  createdAt: string;
  evidenceFile: string | null;
}

/** One SELL transaction. */
export interface Sale {
  id: number;
  symbolId: number;
  /** 'YYYY-MM-DD' */
  sellDate: string;
  qtySold: Decimal;
  salePriceUsd: Decimal;
  feeUsd: Decimal;
  fxRateUsdThb: Decimal;
  /** ISO 8601 UTC */
  createdAt: string;
  evidenceFile: string | null;
}

/** Which lot a sale drew from, and how much it took. Always derived. */
export interface Allocation {
  saleId: number;
  lotId: number;
  qtyAllocated: Decimal;
  costBasisThb: Decimal;
}
