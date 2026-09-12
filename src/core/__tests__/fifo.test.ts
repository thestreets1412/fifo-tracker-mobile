import Decimal from 'decimal.js';
import { rebuildAllocations } from '../fifo';
import { makeLot, makeSale, resetIds } from './factories';

beforeEach(resetIds);

describe('rebuildAllocations — single lot', () => {
  it('returns no allocations when there are no sales', () => {
    expect(rebuildAllocations([makeLot()], [])).toEqual([]);
  });

  it('draws a sale entirely from one lot that covers it', () => {
    const lot = makeLot({ id: 1, qty: new Decimal('10') });
    const sale = makeSale({ id: 2, qtySold: new Decimal('4') });

    const allocations = rebuildAllocations([lot], [sale]);

    expect(allocations).toHaveLength(1);
    expect(allocations[0]!.saleId).toBe(2);
    expect(allocations[0]!.lotId).toBe(1);
    expect(allocations[0]!.qtyAllocated.equals(new Decimal('4'))).toBe(true);
  });

  it('computes cost basis as qty * lot price * the lot FX rate, not the sale FX rate', () => {
    const lot = makeLot({
      id: 1,
      qty: new Decimal('10'),
      priceUsd: new Decimal('142.35'),
      fxRateUsdThb: new Decimal('36.21'),
    });
    const sale = makeSale({
      id: 2,
      qtySold: new Decimal('10'),
      fxRateUsdThb: new Decimal('39.99'),
    });

    const [allocation] = rebuildAllocations([lot], [sale]);

    // 10 * 142.35 * 36.21 = 51544.935 (not 10 * 142.35 * 39.99)
    expect(allocation!.costBasisThb.equals(new Decimal('51544.935'))).toBe(true);
  });

  it('rounds cost basis to 4 decimal places', () => {
    const lot = makeLot({
      id: 1,
      qty: new Decimal('1'),
      priceUsd: new Decimal('0.123456'),
      fxRateUsdThb: new Decimal('1.2345'),
    });
    const sale = makeSale({ id: 2, qtySold: new Decimal('1') });

    const [allocation] = rebuildAllocations([lot], [sale]);

    // 0.123456 * 1.2345 = 0.152406432, half-even to 4 dp = 0.1524
    expect(allocation!.costBasisThb.equals(new Decimal('0.1524'))).toBe(true);
  });

  it('leaves the remainder of a partly consumed lot alone', () => {
    const lot = makeLot({ id: 1, qty: new Decimal('10') });
    const first = makeSale({ id: 2, qtySold: new Decimal('4') });
    const second = makeSale({ id: 3, qtySold: new Decimal('6') });

    const allocations = rebuildAllocations([lot], [first, second]);

    expect(allocations).toHaveLength(2);
    expect(allocations[1]!.qtyAllocated.equals(new Decimal('6'))).toBe(true);
  });
});
