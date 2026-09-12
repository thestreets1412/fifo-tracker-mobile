import Decimal from 'decimal.js';
import type { Lot, Sale } from '../types';

let nextId = 1;

export function resetIds(): void {
  nextId = 1;
}

export function makeLot(overrides: Partial<Lot> = {}): Lot {
  const id = overrides.id ?? nextId++;
  return {
    id,
    symbolId: 1,
    buyDate: '2026-01-01',
    priceUsd: new Decimal('100'),
    qty: new Decimal('10'),
    fxRateUsdThb: new Decimal('36'),
    createdAt: `2026-01-01T00:00:${String(id).padStart(2, '0')}Z`,
    evidenceFile: null,
    ...overrides,
  };
}

export function makeSale(overrides: Partial<Sale> = {}): Sale {
  const id = overrides.id ?? nextId++;
  return {
    id,
    symbolId: 1,
    sellDate: '2026-06-01',
    qtySold: new Decimal('5'),
    salePriceUsd: new Decimal('150'),
    feeUsd: new Decimal('0'),
    fxRateUsdThb: new Decimal('36'),
    createdAt: `2026-06-01T00:00:${String(id).padStart(2, '0')}Z`,
    evidenceFile: null,
    ...overrides,
  };
}
