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

describe('rebuildAllocations — multiple lots', () => {
  it('spans one sale across several lots, oldest first', () => {
    const a = makeLot({ id: 1, buyDate: '2026-01-01', qty: new Decimal('3') });
    const b = makeLot({ id: 2, buyDate: '2026-02-01', qty: new Decimal('3') });
    const c = makeLot({ id: 3, buyDate: '2026-03-01', qty: new Decimal('3') });
    const sale = makeSale({ id: 4, qtySold: new Decimal('7') });

    const allocations = rebuildAllocations([a, b, c], [sale]);

    expect(allocations.map((x) => x.lotId)).toEqual([1, 2, 3]);
    expect(allocations.map((x) => x.qtyAllocated.toString())).toEqual(['3', '3', '1']);
  });

  it('consumes the oldest lot first regardless of input array order', () => {
    const newer = makeLot({ id: 1, buyDate: '2026-05-01', qty: new Decimal('5') });
    const older = makeLot({ id: 2, buyDate: '2026-01-01', qty: new Decimal('5') });
    const sale = makeSale({ id: 3, qtySold: new Decimal('5') });

    const allocations = rebuildAllocations([newer, older], [sale]);

    expect(allocations).toHaveLength(1);
    expect(allocations[0]!.lotId).toBe(2);
  });

  it('skips a lot that earlier sales already exhausted', () => {
    const a = makeLot({ id: 1, buyDate: '2026-01-01', qty: new Decimal('5') });
    const b = makeLot({ id: 2, buyDate: '2026-02-01', qty: new Decimal('5') });
    const first = makeSale({ id: 3, sellDate: '2026-06-01', qtySold: new Decimal('5') });
    const second = makeSale({ id: 4, sellDate: '2026-07-01', qtySold: new Decimal('5') });

    const allocations = rebuildAllocations([a, b], [first, second]);

    expect(allocations).toHaveLength(2);
    expect(allocations[0]!.lotId).toBe(1);
    expect(allocations[1]!.lotId).toBe(2);
  });

  it('breaks a same-day tie by created_at, then by id', () => {
    const later = makeLot({
      id: 1, buyDate: '2026-01-01', createdAt: '2026-01-01T10:00:00Z', qty: new Decimal('1'),
    });
    const earlier = makeLot({
      id: 2, buyDate: '2026-01-01', createdAt: '2026-01-01T09:00:00Z', qty: new Decimal('1'),
    });
    const sale = makeSale({ id: 3, qtySold: new Decimal('1') });

    expect(rebuildAllocations([later, earlier], [sale])[0]!.lotId).toBe(2);
  });

  it('falls back to id when buy_date and created_at are both identical', () => {
    const stamp = '2026-01-01T00:00:00Z';
    const second = makeLot({ id: 9, buyDate: '2026-01-01', createdAt: stamp, qty: new Decimal('1') });
    const first = makeLot({ id: 4, buyDate: '2026-01-01', createdAt: stamp, qty: new Decimal('1') });
    const sale = makeSale({ id: 10, qtySold: new Decimal('1') });

    expect(rebuildAllocations([second, first], [sale])[0]!.lotId).toBe(4);
  });

  it('applies sales in date order even when passed out of order', () => {
    const lot = makeLot({ id: 1, buyDate: '2026-01-01', qty: new Decimal('10') });
    const later = makeSale({ id: 2, sellDate: '2026-08-01', qtySold: new Decimal('4') });
    const earlier = makeSale({ id: 3, sellDate: '2026-07-01', qtySold: new Decimal('6') });

    const allocations = rebuildAllocations([lot], [later, earlier]);

    expect(allocations.map((x) => x.saleId)).toEqual([3, 2]);
  });
});

describe('rebuildAllocations — symbol isolation', () => {
  it('never allocates a lot of one symbol to a sale of another', () => {
    const nvda = makeLot({ id: 1, symbolId: 1, qty: new Decimal('10') });
    const tsla = makeLot({ id: 2, symbolId: 2, qty: new Decimal('10') });
    const sellTsla = makeSale({ id: 3, symbolId: 2, qtySold: new Decimal('10') });

    const allocations = rebuildAllocations([nvda, tsla], [sellTsla]);

    expect(allocations).toHaveLength(1);
    expect(allocations[0]!.lotId).toBe(2);
  });
});
