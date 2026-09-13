import Decimal from 'decimal.js';
import { openTestDatabase } from '../../db/__tests__/testDatabase';
import { runMigrations } from '../../db/schema';
import { getFxRateRow, upsertFxRateRow } from '../../db/repo';
import type { SqlDatabase } from '../../db/sqlDatabase';
import type { HttpFetch, HttpResponse } from '../http';
import {
  frankfurterUrl, parseFrankfurter, fetchUsdThbRate,
  getFxRateForDate, getTodayFxRate, FxRateFetchError, CACHE_TTL_MS,
  type NetDeps,
} from '../fx';

const BODY = '{"amount":1.0,"base":"USD","date":"2026-09-11","rates":{"THB":36.2137}}';

function ok(body: string): HttpResponse {
  return { ok: true, status: 200, text: async () => body };
}

/** A NetDeps whose clock is fixed and whose fetch returns `body`, recording every URL. */
function deps(body: string | Error, nowIso: string, urls: string[] = []): NetDeps {
  const fetchImpl: HttpFetch = async (url) => {
    urls.push(url);
    if (body instanceof Error) throw body;
    return ok(body);
  };
  return { fetch: fetchImpl, now: () => new Date(nowIso) };
}

let db: SqlDatabase;
beforeEach(() => {
  db = openTestDatabase();
  runMigrations(db);
});

describe('frankfurterUrl', () => {
  it('builds the keyless USD→THB URL for a date', () => {
    expect(frankfurterUrl('2026-09-11')).toBe('https://api.frankfurter.app/2026-09-11?from=USD&to=THB');
  });
});

describe('parseFrankfurter', () => {
  it('reads rates.THB as a Decimal without float arithmetic', () => {
    expect(parseFrankfurter(BODY, '2026-09-11').toString()).toBe('36.2137');
  });

  it('throws FxRateFetchError when THB is absent', () => {
    expect(() => parseFrankfurter('{"rates":{"EUR":0.9}}', '2026-09-11')).toThrow(FxRateFetchError);
  });

  it('throws FxRateFetchError on a non-positive rate', () => {
    expect(() => parseFrankfurter('{"rates":{"THB":0}}', '2026-09-11')).toThrow(FxRateFetchError);
  });

  it('throws FxRateFetchError on a non-JSON body', () => {
    expect(() => parseFrankfurter('<html>502</html>', '2026-09-11')).toThrow(FxRateFetchError);
  });
});

describe('fetchUsdThbRate', () => {
  it('fetches and parses', async () => {
    const urls: string[] = [];
    await expect(fetchUsdThbRate('2026-09-11', deps(BODY, '2026-09-13T09:00:00.000Z', urls)))
      .resolves.toEqual(new Decimal('36.2137'));
    expect(urls).toEqual(['https://api.frankfurter.app/2026-09-11?from=USD&to=THB']);
  });

  it('turns a transport failure into FxRateFetchError', async () => {
    await expect(fetchUsdThbRate('2026-09-11', deps(new TypeError('offline'), '2026-09-13T09:00:00.000Z')))
      .rejects.toThrow(FxRateFetchError);
  });
});

describe('getFxRateForDate', () => {
  it('fetches, caches, and reports the result as fresh', async () => {
    const urls: string[] = [];
    const result = await getFxRateForDate(db, '2026-09-11', deps(BODY, '2026-09-13T09:00:00.000Z', urls));
    expect(result).not.toBeNull();
    expect(result!.rate.toString()).toBe('36.2137');
    expect(result!.rateDate).toBe('2026-09-11');
    expect(result!.stale).toBe(false);
    expect(getFxRateRow(db, '2026-09-11')).toEqual({
      rateDate: '2026-09-11', usdThb: '36.2137', fetchedAt: '2026-09-13T09:00:00.000Z',
    });
    expect(urls).toHaveLength(1);
  });

  it('never refetches a past date, however old the cached row is', async () => {
    upsertFxRateRow(db, { rateDate: '2020-01-02', usdThb: '30.1000', fetchedAt: '2020-01-02T00:00:00.000Z' });
    const urls: string[] = [];
    const result = await getFxRateForDate(db, '2020-01-02', deps(BODY, '2026-09-13T09:00:00.000Z', urls));
    expect(result!.rate.toString()).toBe('30.1');
    expect(result!.stale).toBe(false);
    expect(urls).toEqual([]); // historical rates never change — spec §5
  });

  it('refetches today once the cached row passes the TTL', async () => {
    const nowIso = '2026-09-13T09:00:00.000Z';
    const stale = new Date(new Date(nowIso).getTime() - CACHE_TTL_MS - 1).toISOString();
    // Cache today under the LOCAL date the service will compute for `nowIso`.
    const today = new Date(nowIso);
    const localToday = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    upsertFxRateRow(db, { rateDate: localToday, usdThb: '35.0000', fetchedAt: stale });

    const urls: string[] = [];
    const result = await getFxRateForDate(db, localToday, deps(BODY, nowIso, urls));
    expect(result!.rate.toString()).toBe('36.2137');
    expect(urls).toHaveLength(1);
  });

  it('returns the cached row marked stale when the fetch fails', async () => {
    upsertFxRateRow(db, { rateDate: '2026-09-13', usdThb: '35.0000', fetchedAt: '2020-01-01T00:00:00.000Z' });
    const result = await getFxRateForDate(db, '2026-09-13', deps(new TypeError('offline'), '2026-09-13T09:00:00.000Z'));
    expect(result!.rate.toString()).toBe('35');
    expect(result!.stale).toBe(true);
  });

  it('returns null when the fetch fails and nothing is cached for that date', async () => {
    await expect(getFxRateForDate(db, '2026-09-11', deps(new TypeError('offline'), '2026-09-13T09:00:00.000Z')))
      .resolves.toBeNull();
  });
});

describe('getTodayFxRate', () => {
  it('falls back to the newest cached date and reports which date it used', async () => {
    upsertFxRateRow(db, { rateDate: '2026-09-10', usdThb: '36.0000', fetchedAt: '2026-09-10T00:00:00.000Z' });
    upsertFxRateRow(db, { rateDate: '2026-09-12', usdThb: '36.4000', fetchedAt: '2026-09-12T00:00:00.000Z' });

    const result = await getTodayFxRate(db, deps(new TypeError('offline'), '2026-09-13T09:00:00.000Z'));
    expect(result!.rate.toString()).toBe('36.4');
    expect(result!.rateDate).toBe('2026-09-12');
    expect(result!.stale).toBe(true);
  });

  it('returns null when offline with a completely empty cache', async () => {
    await expect(getTodayFxRate(db, deps(new TypeError('offline'), '2026-09-13T09:00:00.000Z')))
      .resolves.toBeNull();
  });
});
