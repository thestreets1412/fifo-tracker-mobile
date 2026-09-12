import Decimal from 'decimal.js';
import {
  lotQtyRemaining,
  lotCostThb,
  saleProceedsThb,
  saleCostBasisThb,
  saleCapitalGainThb,
} from '../derive';
import { rebuildAllocations } from '../fifo';
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
