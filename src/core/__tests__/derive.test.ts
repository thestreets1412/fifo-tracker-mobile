import Decimal from 'decimal.js';
import {
  lotQtyRemaining,
  lotCostThb,
  lotRemainingCostThb,
  saleProceedsThb,
  saleCostBasisThb,
  saleCapitalGainThb,
} from '../derive';
import { rebuildAllocations } from '../fifo';
import type { Allocation, Lot } from '../types';
import { makeLot, makeSale, resetIds } from './factories';

beforeEach(resetIds);

describe('lotQtyRemaining', () => {
  it('is the full quantity when nothing has been allocated', () => {
    const lot = makeLot({ id: 1, qty: new Decimal('10') });
    expect(lotQtyRemaining(lot, []).equals(new Decimal('10'))).toBe(true);
  });

  it('subtracts every allocation drawn from this lot', () => {
    const lot = makeLot({ id: 1, qty: new Decimal('10') });
    const sale = makeSale({ id: 2, qtySold: new Decimal('4') });
    const allocations = rebuildAllocations([lot], [sale]);

    expect(lotQtyRemaining(lot, allocations).equals(new Decimal('6'))).toBe(true);
  });

  it('ignores allocations belonging to other lots', () => {
    const a = makeLot({ id: 1, buyDate: '2026-01-01', qty: new Decimal('5') });
    const b = makeLot({ id: 2, buyDate: '2026-02-01', qty: new Decimal('5') });
    const sale = makeSale({ id: 3, qtySold: new Decimal('5') });
    const allocations = rebuildAllocations([a, b], [sale]);

    expect(lotQtyRemaining(b, allocations).equals(new Decimal('5'))).toBe(true);
  });

  it('reaches exactly zero for a fully consumed lot, never a tiny residue', () => {
    const lot = makeLot({ id: 1, qty: new Decimal('0.1') });
    const first = makeSale({ id: 2, sellDate: '2026-06-01', qtySold: new Decimal('0.05') });
    const second = makeSale({ id: 3, sellDate: '2026-07-01', qtySold: new Decimal('0.05') });
    const allocations = rebuildAllocations([lot], [first, second]);

    expect(lotQtyRemaining(lot, allocations).isZero()).toBe(true);
  });
});

describe('lotCostThb', () => {
  it('is price * qty * the lot FX rate', () => {
    const lot = makeLot({
      qty: new Decimal('10'),
      priceUsd: new Decimal('142.35'),
      fxRateUsdThb: new Decimal('36.21'),
    });
    expect(lotCostThb(lot).equals(new Decimal('51544.935'))).toBe(true);
  });
});

describe('saleProceedsThb', () => {
  it('subtracts the fee in USD before converting to THB', () => {
    const sale = makeSale({
      qtySold: new Decimal('10'),
      salePriceUsd: new Decimal('150'),
      feeUsd: new Decimal('5'),
      fxRateUsdThb: new Decimal('36'),
    });
    // (150 * 10 - 5) * 36 = 53820
    expect(saleProceedsThb(sale).equals(new Decimal('53820'))).toBe(true);
  });
});

describe('saleCapitalGainThb', () => {
  it('is proceeds minus the cost basis of the lots it consumed', () => {
    const lot = makeLot({
      id: 1,
      buyDate: '2026-01-01',
      qty: new Decimal('10'),
      priceUsd: new Decimal('100'),
      fxRateUsdThb: new Decimal('36'),
    });
    const sale = makeSale({
      id: 2,
      sellDate: '2026-06-01',
      qtySold: new Decimal('10'),
      salePriceUsd: new Decimal('150'),
      feeUsd: new Decimal('0'),
      fxRateUsdThb: new Decimal('36'),
    });
    const allocations = rebuildAllocations([lot], [sale]);

    // cost 10*100*36 = 36000, proceeds 10*150*36 = 54000
    expect(saleCostBasisThb(sale, allocations).equals(new Decimal('36000'))).toBe(true);
    expect(saleCapitalGainThb(sale, allocations).equals(new Decimal('18000'))).toBe(true);
  });

  it('is negative on a loss', () => {
    const lot = makeLot({
      id: 1, buyDate: '2026-01-01', qty: new Decimal('1'),
      priceUsd: new Decimal('200'), fxRateUsdThb: new Decimal('36'),
    });
    const sale = makeSale({
      id: 2, sellDate: '2026-06-01', qtySold: new Decimal('1'),
      salePriceUsd: new Decimal('100'), feeUsd: new Decimal('0'),
      fxRateUsdThb: new Decimal('36'),
    });
    const allocations = rebuildAllocations([lot], [sale]);

    expect(saleCapitalGainThb(sale, allocations).isNegative()).toBe(true);
  });
});

describe('lotRemainingCostThb', () => {
  it('is the full lot cost when nothing has been sold', () => {
    const lot: Lot = {
      id: 1, symbolId: 1, buyDate: '2026-01-01',
      priceUsd: new Decimal('100'), qty: new Decimal('10'), fxRateUsdThb: new Decimal('36'),
      createdAt: '2026-01-01T00:00:00.000Z', evidenceFile: null,
    };
    expect(lotRemainingCostThb(lot, []).toString()).toBe('36000');
    expect(lotRemainingCostThb(lot, []).toString()).toBe(lotCostThb(lot).toString());
  });

  it('costs only the unsold shares once part of the lot is allocated', () => {
    const lot: Lot = {
      id: 1, symbolId: 1, buyDate: '2026-01-01',
      priceUsd: new Decimal('100'), qty: new Decimal('10'), fxRateUsdThb: new Decimal('36'),
      createdAt: '2026-01-01T00:00:00.000Z', evidenceFile: null,
    };
    const allocations: Allocation[] = [
      { saleId: 1, lotId: 1, qtyAllocated: new Decimal('4'), costBasisThb: new Decimal('14400') },
    ];
    expect(lotRemainingCostThb(lot, allocations).toString()).toBe('21600');
  });

  it('is zero for a fully-sold lot, while lotCostThb still reports what it cost', () => {
    const lot: Lot = {
      id: 1, symbolId: 1, buyDate: '2026-01-01',
      priceUsd: new Decimal('100'), qty: new Decimal('10'), fxRateUsdThb: new Decimal('36'),
      createdAt: '2026-01-01T00:00:00.000Z', evidenceFile: null,
    };
    const allocations: Allocation[] = [
      { saleId: 1, lotId: 1, qtyAllocated: new Decimal('10'), costBasisThb: new Decimal('36000') },
    ];
    expect(lotRemainingCostThb(lot, allocations).toString()).toBe('0');
    expect(lotCostThb(lot).toString()).toBe('36000');
  });

  it('rounds to money precision with ROUND_HALF_EVEN', () => {
    const lot: Lot = {
      id: 1, symbolId: 1, buyDate: '2026-01-01',
      priceUsd: new Decimal('1.234567'), qty: new Decimal('3'), fxRateUsdThb: new Decimal('36.2137'),
      createdAt: '2026-01-01T00:00:00.000Z', evidenceFile: null,
    };
    // 1.234567 * 3 * 36.2137 = 134.11815... → 4 dp half-even
    expect(lotRemainingCostThb(lot, []).decimalPlaces()).toBeLessThanOrEqual(4);
    expect(lotRemainingCostThb(lot, []).toFixed(4)).toBe(
      new Decimal('1.234567').times(3).times('36.2137').toFixed(4, Decimal.ROUND_HALF_EVEN),
    );
  });
});
