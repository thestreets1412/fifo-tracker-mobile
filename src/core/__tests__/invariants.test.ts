import Decimal from 'decimal.js';
import { rebuildAllocations, InsufficientLotsError } from '../fifo';
import { lotQtyRemaining } from '../derive';
import type { Lot, Sale } from '../types';
import { makeLot, makeSale, resetIds } from './factories';

beforeEach(resetIds);

/**
 * A tiny deterministic generator. Seeded so a failure is reproducible from
 * the printed seed rather than being a flaky one-off.
 */
function makeRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648;
  };
}

function buildScenario(seed: number): { lots: Lot[]; sales: Sale[] } {
  const random = makeRandom(seed);
  const lots: Lot[] = [];
  const sales: Sale[] = [];
  let id = 1;
  let held = new Decimal(0);

  for (let month = 1; month <= 8; month++) {
    const date = `2026-${String(month).padStart(2, '0')}-01`;

    const qty = new Decimal(Math.floor(random() * 100) + 1).dividedBy(4);
    lots.push(makeLot({
      id: id++,
      buyDate: date,
      createdAt: `${date}T00:00:00Z`,
      qty,
      priceUsd: new Decimal(Math.floor(random() * 50000) / 100 + 1),
      fxRateUsdThb: new Decimal(Math.floor(random() * 1000) / 100 + 30),
    }));
    held = held.plus(qty);

    if (random() > 0.4 && held.greaterThan(0)) {
      const sold = held.times(Math.floor(random() * 80) / 100).toDecimalPlaces(8);
      if (sold.greaterThan(0)) {
        sales.push(makeSale({
          id: id++,
          sellDate: date,
          createdAt: `${date}T12:00:00Z`,
          qtySold: sold,
          salePriceUsd: new Decimal(Math.floor(random() * 50000) / 100 + 1),
          fxRateUsdThb: new Decimal(Math.floor(random() * 1000) / 100 + 30),
          feeUsd: new Decimal(0),
        }));
        held = held.minus(sold);
      }
    }
  }

  return { lots, sales };
}

describe('invariants over generated ledgers', () => {
  const seeds = [1, 2, 3, 7, 11, 42, 99, 123, 2026, 31337];

  it.each(seeds)('allocates exactly the quantity sold (seed %i)', (seed) => {
    const { lots, sales } = buildScenario(seed);
    const allocations = rebuildAllocations(lots, sales);

    const allocated = allocations.reduce((t, a) => t.plus(a.qtyAllocated), new Decimal(0));
    const sold = sales.reduce((t, s) => t.plus(s.qtySold), new Decimal(0));

    expect(allocated.equals(sold)).toBe(true);
  });

  it.each(seeds)('never over-allocates a lot (seed %i)', (seed) => {
    const { lots, sales } = buildScenario(seed);
    const allocations = rebuildAllocations(lots, sales);

    for (const lot of lots) {
      expect(lotQtyRemaining(lot, allocations).isNegative()).toBe(false);
    }
  });

  it.each(seeds)('never draws from a lot bought after the sale (seed %i)', (seed) => {
    const { lots, sales } = buildScenario(seed);
    const allocations = rebuildAllocations(lots, sales);

    const lotById = new Map(lots.map((lot) => [lot.id, lot]));
    const saleById = new Map(sales.map((sale) => [sale.id, sale]));

    for (const allocation of allocations) {
      const lot = lotById.get(allocation.lotId)!;
      const sale = saleById.get(allocation.saleId)!;
      expect(lot.buyDate <= sale.sellDate).toBe(true);
    }
  });

  it.each(seeds)('produces identical output when run twice (seed %i)', (seed) => {
    const { lots, sales } = buildScenario(seed);

    const first = rebuildAllocations(lots, sales);
    const second = rebuildAllocations(lots, sales);

    const serialize = (allocations: ReturnType<typeof rebuildAllocations>) =>
      allocations.map((a) => [a.saleId, a.lotId, a.qtyAllocated.toString(), a.costBasisThb.toString()]);

    expect(serialize(first)).toEqual(serialize(second));
  });

  it.each(seeds)('is unaffected by the order of the input arrays (seed %i)', (seed) => {
    const { lots, sales } = buildScenario(seed);

    const forward = rebuildAllocations(lots, sales);
    const reversed = rebuildAllocations([...lots].reverse(), [...sales].reverse());

    const serialize = (allocations: ReturnType<typeof rebuildAllocations>) =>
      allocations.map((a) => [a.saleId, a.lotId, a.qtyAllocated.toString()]);

    expect(serialize(forward)).toEqual(serialize(reversed));
  });

  it('does not mutate the arrays it is given', () => {
    const { lots, sales } = buildScenario(42);
    const lotIds = lots.map((lot) => lot.id);
    const saleIds = sales.map((sale) => sale.id);

    rebuildAllocations(lots, sales);

    expect(lots.map((lot) => lot.id)).toEqual(lotIds);
    expect(sales.map((sale) => sale.id)).toEqual(saleIds);
  });

  it('reports the failing sale rather than a generic error when a ledger is inconsistent', () => {
    const lot = makeLot({ id: 1, buyDate: '2026-01-01', qty: new Decimal('1') });
    const ok = makeSale({ id: 2, sellDate: '2026-02-01', qtySold: new Decimal('1') });
    const broken = makeSale({ id: 3, sellDate: '2026-03-01', qtySold: new Decimal('1') });

    try {
      rebuildAllocations([lot], [ok, broken]);
      throw new Error('expected rebuildAllocations to throw');
    } catch (error) {
      expect((error as InsufficientLotsError).saleId).toBe(3);
    }
  });
});
