import { openTestDatabase } from './testDatabase';
import { runMigrations } from '../schema';
import {
  getFxRateRow, upsertFxRateRow, latestFxRateRow,
  getQuoteRow, upsertQuoteRow,
} from '../repo';
import type { SqlDatabase } from '../sqlDatabase';

let db: SqlDatabase;
beforeEach(() => {
  db = openTestDatabase();
  runMigrations(db);
});

describe('fx_rates cache repository', () => {
  it('returns null for a date that was never cached', () => {
    expect(getFxRateRow(db, '2026-09-01')).toBeNull();
  });

  it('round-trips a rate without touching its decimal string', () => {
    upsertFxRateRow(db, { rateDate: '2026-09-01', usdThb: '36.2100', fetchedAt: '2026-09-01T10:00:00.000Z' });
    expect(getFxRateRow(db, '2026-09-01')).toEqual({
      rateDate: '2026-09-01', usdThb: '36.2100', fetchedAt: '2026-09-01T10:00:00.000Z',
    });
  });

  it('overwrites the rate and fetched_at for a date already cached', () => {
    upsertFxRateRow(db, { rateDate: '2026-09-01', usdThb: '36.2100', fetchedAt: '2026-09-01T10:00:00.000Z' });
    upsertFxRateRow(db, { rateDate: '2026-09-01', usdThb: '36.5000', fetchedAt: '2026-09-01T11:00:00.000Z' });
    expect(getFxRateRow(db, '2026-09-01')).toEqual({
      rateDate: '2026-09-01', usdThb: '36.5000', fetchedAt: '2026-09-01T11:00:00.000Z',
    });
  });

  it('latestFxRateRow returns the newest rate_date, not the newest fetched_at', () => {
    upsertFxRateRow(db, { rateDate: '2026-09-05', usdThb: '36.0000', fetchedAt: '2026-09-09T10:00:00.000Z' });
    upsertFxRateRow(db, { rateDate: '2026-09-08', usdThb: '36.4000', fetchedAt: '2026-09-08T10:00:00.000Z' });
    expect(latestFxRateRow(db)?.rateDate).toBe('2026-09-08');
  });

  it('latestFxRateRow returns null on an empty cache', () => {
    expect(latestFxRateRow(db)).toBeNull();
  });
});

describe('quotes cache repository', () => {
  it('returns null for a ticker that was never cached', () => {
    expect(getQuoteRow(db, 'NVDA')).toBeNull();
  });

  it('round-trips a quote without touching its decimal string', () => {
    upsertQuoteRow(db, { ticker: 'NVDA', priceUsd: '171.230000', fetchedAt: '2026-09-13T09:00:00.000Z' });
    expect(getQuoteRow(db, 'NVDA')).toEqual({
      ticker: 'NVDA', priceUsd: '171.230000', fetchedAt: '2026-09-13T09:00:00.000Z',
    });
  });

  it('normalizes the ticker on write and on read, so nvda and NVDA are one row', () => {
    upsertQuoteRow(db, { ticker: ' nvda ', priceUsd: '171.230000', fetchedAt: '2026-09-13T09:00:00.000Z' });
    expect(getQuoteRow(db, 'NVDA')?.ticker).toBe('NVDA');
    expect(getQuoteRow(db, 'nvda')?.priceUsd).toBe('171.230000');
    expect(db.getAllSync('SELECT * FROM quotes;')).toHaveLength(1);
  });

  it('overwrites the price and fetched_at for a ticker already cached', () => {
    upsertQuoteRow(db, { ticker: 'NVDA', priceUsd: '171.230000', fetchedAt: '2026-09-13T09:00:00.000Z' });
    upsertQuoteRow(db, { ticker: 'NVDA', priceUsd: '175.000000', fetchedAt: '2026-09-13T09:20:00.000Z' });
    expect(getQuoteRow(db, 'NVDA')).toEqual({
      ticker: 'NVDA', priceUsd: '175.000000', fetchedAt: '2026-09-13T09:20:00.000Z',
    });
  });
});
