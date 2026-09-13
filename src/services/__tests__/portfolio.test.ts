import Decimal from 'decimal.js';
import { openTestDatabase } from '../../db/__tests__/testDatabase';
import { runMigrations } from '../../db/schema';
import { createSymbol } from '../../db/repo';
import type { SqlDatabase } from '../../db/sqlDatabase';
import { addLot, addSale } from '../ledger';
import { listPortfolioSymbols, buildPortfolioSummary, type LivePrice } from '../portfolio';

let db: SqlDatabase;
let nvdaId: number;
let aaplId: number;

function price(value: string, stale = false): LivePrice {
  return { priceUsd: new Decimal(value), fetchedAt: '2026-09-13T09:00:00.000Z', stale };
}

beforeEach(() => {
  db = openTestDatabase();
  runMigrations(db);
  nvdaId = createSymbol(db, 'NVDA').id;
  aaplId = createSymbol(db, 'AAPL').id;
});

describe('listPortfolioSymbols', () => {
  it('returns nothing when no transactions exist', () => {
    expect(listPortfolioSymbols(db)).toEqual([]);
  });

  it('omits a symbol with neither lots nor sales, and orders by ticker', () => {
    addLot(db, { symbolId: nvdaId, buyDate: '2026-01-01', priceUsd: new Decimal('100'), qty: new Decimal('10'), fxRateUsdThb: new Decimal('36'), evidenceFile: null });
    addLot(db, { symbolId: aaplId, buyDate: '2026-01-01', priceUsd: new Decimal('200'), qty: new Decimal('5'), fxRateUsdThb: new Decimal('36'), evidenceFile: null });
    createSymbol(db, 'ZZZZ');
    expect(listPortfolioSymbols(db).map((s) => s.ticker)).toEqual(['AAPL', 'NVDA']);
  });

  it('includes a symbol that has been fully sold', () => {
    addLot(db, { symbolId: nvdaId, buyDate: '2026-01-01', priceUsd: new Decimal('100'), qty: new Decimal('10'), fxRateUsdThb: new Decimal('36'), evidenceFile: null });
    addSale(db, { symbolId: nvdaId, sellDate: '2026-02-01', qtySold: new Decimal('10'), salePriceUsd: new Decimal('120'), feeUsd: new Decimal('0'), fxRateUsdThb: new Decimal('36'), evidenceFile: null });
    expect(listPortfolioSymbols(db).map((s) => s.ticker)).toEqual(['NVDA']);
  });
});

describe('buildPortfolioSummary', () => {
  it('reports zeros and an empty row list for an empty ledger', () => {
    const summary = buildPortfolioSummary(db, new Map(), new Decimal('36'));
    expect(summary.rows).toEqual([]);
    expect(summary.totalCostThb.toString()).toBe('0');
    expect(summary.totalRealizedGainThb.toString()).toBe('0');
    expect(summary.hasFullValue).toBe(true);
    expect(summary.totalValueThb!.toString()).toBe('0');
  });

  it('computes remaining cost, live value, and unrealized gain for one open lot', () => {
    addLot(db, { symbolId: nvdaId, buyDate: '2026-01-01', priceUsd: new Decimal('100'), qty: new Decimal('10'), fxRateUsdThb: new Decimal('36'), evidenceFile: null });

    const summary = buildPortfolioSummary(db, new Map([[nvdaId, price('120')]]), new Decimal('36'));
    const row = summary.rows[0]!;
    expect(row.symbol.ticker).toBe('NVDA');
    expect(row.remainingQty.toString()).toBe('10');
    expect(row.costThb.toString()).toBe('36000');          // 10 * 100 * 36
    expect(row.currentValueThb!.toString()).toBe('43200');  // 10 * 120 * 36
    expect(row.unrealizedGainThb!.toString()).toBe('7200');
    expect(row.unrealizedGainPct!.toFixed(2)).toBe('20.00');
    expect(row.realizedGainThb.toString()).toBe('0');
    expect(summary.hasFullValue).toBe(true);
  });

  it('counts only the unsold shares in cost and value after a partial sale', () => {
    addLot(db, { symbolId: nvdaId, buyDate: '2026-01-01', priceUsd: new Decimal('100'), qty: new Decimal('10'), fxRateUsdThb: new Decimal('36'), evidenceFile: null });
    addSale(db, { symbolId: nvdaId, sellDate: '2026-02-01', qtySold: new Decimal('4'), salePriceUsd: new Decimal('150'), feeUsd: new Decimal('0'), fxRateUsdThb: new Decimal('36'), evidenceFile: null });

    const summary = buildPortfolioSummary(db, new Map([[nvdaId, price('120')]]), new Decimal('36'));
    const row = summary.rows[0]!;
    expect(row.remainingQty.toString()).toBe('6');
    expect(row.costThb.toString()).toBe('21600');            // 6 * 100 * 36
    expect(row.currentValueThb!.toString()).toBe('25920');   // 6 * 120 * 36
    expect(row.unrealizedGainThb!.toString()).toBe('4320');
    // proceeds 4*150*36 = 21600; basis 4*100*36 = 14400
    expect(row.realizedGainThb.toString()).toBe('7200');
  });

  it('reports a fully-sold symbol as zero cost, zero value, and no unrealized gain', () => {
    addLot(db, { symbolId: nvdaId, buyDate: '2026-01-01', priceUsd: new Decimal('100'), qty: new Decimal('10'), fxRateUsdThb: new Decimal('36'), evidenceFile: null });
    addSale(db, { symbolId: nvdaId, sellDate: '2026-02-01', qtySold: new Decimal('10'), salePriceUsd: new Decimal('120'), feeUsd: new Decimal('0'), fxRateUsdThb: new Decimal('36'), evidenceFile: null });

    const summary = buildPortfolioSummary(db, new Map(), new Decimal('36'));
    const row = summary.rows[0]!;
    expect(row.remainingQty.toString()).toBe('0');
    expect(row.costThb.toString()).toBe('0');
    expect(row.currentValueThb!.toString()).toBe('0');
    expect(row.unrealizedGainThb!.toString()).toBe('0');
    expect(row.unrealizedGainPct).toBeNull();     // no cost basis to divide by
    expect(row.realizedGainThb.toString()).toBe('7200');
    expect(summary.hasFullValue).toBe(true);      // nothing needed a price
  });

  it('degrades one symbol only when its price is missing', () => {
    addLot(db, { symbolId: nvdaId, buyDate: '2026-01-01', priceUsd: new Decimal('100'), qty: new Decimal('10'), fxRateUsdThb: new Decimal('36'), evidenceFile: null });
    addLot(db, { symbolId: aaplId, buyDate: '2026-01-01', priceUsd: new Decimal('200'), qty: new Decimal('5'), fxRateUsdThb: new Decimal('36'), evidenceFile: null });

    const summary = buildPortfolioSummary(db, new Map([[nvdaId, price('120')]]), new Decimal('36'));
    const aapl = summary.rows.find((r) => r.symbol.ticker === 'AAPL')!;
    const nvda = summary.rows.find((r) => r.symbol.ticker === 'NVDA')!;

    expect(aapl.currentValueThb).toBeNull();
    expect(aapl.unrealizedGainThb).toBeNull();
    expect(aapl.costThb.toString()).toBe('36000');   // cost basis still shown
    expect(nvda.currentValueThb!.toString()).toBe('43200');

    expect(summary.totalCostThb.toString()).toBe('72000');
    expect(summary.hasFullValue).toBe(false);
    expect(summary.totalValueThb).toBeNull();
    expect(summary.totalUnrealizedGainThb).toBeNull();
    expect(summary.totalRealizedGainThb.toString()).toBe('0'); // realized totals never degrade
  });

  it('shows cost basis only, with no live figures, when the FX rate is unavailable', () => {
    addLot(db, { symbolId: nvdaId, buyDate: '2026-01-01', priceUsd: new Decimal('100'), qty: new Decimal('10'), fxRateUsdThb: new Decimal('36'), evidenceFile: null });

    const summary = buildPortfolioSummary(db, new Map([[nvdaId, price('120')]]), null);
    expect(summary.rows[0]!.costThb.toString()).toBe('36000');
    expect(summary.rows[0]!.currentValueThb).toBeNull();
    expect(summary.hasFullValue).toBe(false);
    expect(summary.totalValueThb).toBeNull();
  });

  it("carries each row's price staleness and fetch time through for display", () => {
    addLot(db, { symbolId: nvdaId, buyDate: '2026-01-01', priceUsd: new Decimal('100'), qty: new Decimal('10'), fxRateUsdThb: new Decimal('36'), evidenceFile: null });

    const summary = buildPortfolioSummary(db, new Map([[nvdaId, price('120', true)]]), new Decimal('36'));
    expect(summary.rows[0]!.priceStale).toBe(true);
    expect(summary.rows[0]!.priceFetchedAt).toBe('2026-09-13T09:00:00.000Z');
    expect(summary.rows[0]!.currentValueThb!.toString()).toBe('43200'); // a stale price is still a price
  });

  it('sums totals across symbols in Decimal, not float', () => {
    addLot(db, { symbolId: nvdaId, buyDate: '2026-01-01', priceUsd: new Decimal('0.1'), qty: new Decimal('1'), fxRateUsdThb: new Decimal('1'), evidenceFile: null });
    addLot(db, { symbolId: aaplId, buyDate: '2026-01-01', priceUsd: new Decimal('0.2'), qty: new Decimal('1'), fxRateUsdThb: new Decimal('1'), evidenceFile: null });

    const summary = buildPortfolioSummary(db, new Map(), null);
    expect(summary.totalCostThb.toString()).toBe('0.3'); // 0.1 + 0.2, exactly
  });
});
