import { openTestDatabase } from '../../db/__tests__/testDatabase';
import { runMigrations } from '../../db/schema';
import { getQuoteRow, upsertQuoteRow } from '../../db/repo';
import type { SqlDatabase } from '../../db/sqlDatabase';
import type { HttpFetch, HttpResponse } from '../http';
import { CACHE_TTL_MS, type NetDeps } from '../fx';
import {
  yahooChartUrl, parseYahooChart, stooqCsvUrl, parseStooqCsv,
  fetchQuote, getQuote, QuoteFetchError,
} from '../quotes';

const YAHOO_OK = JSON.stringify({
  chart: {
    result: [{ meta: { currency: 'USD', symbol: 'NVDA', regularMarketPrice: 171.23, shortName: 'NVIDIA Corp', longName: 'NVIDIA Corporation' } }],
    error: null,
  },
});

const STOOQ_OK = 'Symbol,Date,Time,Open,High,Low,Close,Volume\nNVDA.US,2026-09-12,22:00:15,170.5,172.1,169.8,171.23,180000000\n';
const STOOQ_UNKNOWN = 'Symbol,Date,Time,Open,High,Low,Close,Volume\nZZZZ.US,N/D,N/D,N/D,N/D,N/D,N/D,N/D\n';

function ok(body: string): HttpResponse {
  return { ok: true, status: 200, text: async () => body };
}

/**
 * A NetDeps whose fetch answers per-host: `yahoo` and `stooq` are each
 * either a body string or an Error to throw.
 */
function deps(
  responses: { yahoo?: string | Error; stooq?: string | Error },
  nowIso = '2026-09-13T09:00:00.000Z',
  urls: string[] = [],
): NetDeps {
  const fetchImpl: HttpFetch = async (url) => {
    urls.push(url);
    const which = url.includes('yahoo') ? responses.yahoo : responses.stooq;
    if (which === undefined) throw new TypeError('no stub for this host');
    if (which instanceof Error) throw which;
    return ok(which);
  };
  return { fetch: fetchImpl, now: () => new Date(nowIso) };
}

let db: SqlDatabase;
beforeEach(() => {
  db = openTestDatabase();
  runMigrations(db);
});

describe('provider URLs', () => {
  it('builds the keyless Yahoo chart URL, normalizing the ticker', () => {
    expect(yahooChartUrl(' nvda ')).toBe('https://query1.finance.yahoo.com/v8/finance/chart/NVDA?interval=1d&range=1d');
  });

  it('builds the stooq CSV URL with the .us suffix, lowercased', () => {
    expect(stooqCsvUrl(' NVDA ')).toBe('https://stooq.com/q/l/?s=nvda.us&f=sd2t2ohlcv&h&e=csv');
  });
});

describe('parseYahooChart', () => {
  it('reads the price and prefers longName for the company name', () => {
    const quote = parseYahooChart(YAHOO_OK, 'NVDA');
    expect(quote.priceUsd.toString()).toBe('171.23');
    expect(quote.name).toBe('NVIDIA Corporation');
  });

  it('falls back to shortName when longName is missing', () => {
    const body = JSON.stringify({ chart: { result: [{ meta: { currency: 'USD', regularMarketPrice: 10, shortName: 'Acme' } }] } });
    expect(parseYahooChart(body, 'ACME').name).toBe('Acme');
  });

  it('returns a null name when neither name field is present', () => {
    const body = JSON.stringify({ chart: { result: [{ meta: { currency: 'USD', regularMarketPrice: 10 } }] } });
    expect(parseYahooChart(body, 'ACME').name).toBeNull();
  });

  it('rejects a non-USD quote — the app is USD/THB only', () => {
    const body = JSON.stringify({ chart: { result: [{ meta: { currency: 'EUR', regularMarketPrice: 10 } }] } });
    expect(() => parseYahooChart(body, 'ACME')).toThrow(/EUR/);
  });

  it('rejects an unknown ticker (empty result array)', () => {
    expect(() => parseYahooChart('{"chart":{"result":[],"error":null}}', 'ZZZZ')).toThrow(QuoteFetchError);
  });

  it('rejects a non-positive price', () => {
    const body = JSON.stringify({ chart: { result: [{ meta: { currency: 'USD', regularMarketPrice: 0 } }] } });
    expect(() => parseYahooChart(body, 'ACME')).toThrow(QuoteFetchError);
  });

  it('rejects a non-JSON body (an HTML error page)', () => {
    expect(() => parseYahooChart('<html>429</html>', 'NVDA')).toThrow(QuoteFetchError);
  });
});

describe('parseStooqCsv', () => {
  it('reads Close by header name, not by column position', () => {
    const quote = parseStooqCsv(STOOQ_OK, 'NVDA');
    expect(quote.priceUsd.toString()).toBe('171.23');
    expect(quote.name).toBeNull();
  });

  it('handles CRLF line endings', () => {
    expect(parseStooqCsv(STOOQ_OK.replace(/\n/g, '\r\n'), 'NVDA').priceUsd.toString()).toBe('171.23');
  });

  it('rejects an unknown ticker (N/D close)', () => {
    expect(() => parseStooqCsv(STOOQ_UNKNOWN, 'ZZZZ')).toThrow(QuoteFetchError);
  });

  it('rejects a body with no data row', () => {
    expect(() => parseStooqCsv('Symbol,Date,Time,Open,High,Low,Close,Volume\n', 'NVDA')).toThrow(QuoteFetchError);
  });

  it('rejects a body with no Close column', () => {
    expect(() => parseStooqCsv('Symbol,Date\nNVDA.US,2026-09-12\n', 'NVDA')).toThrow(QuoteFetchError);
  });
});

describe('fetchQuote provider chain', () => {
  it('uses Yahoo and never calls stooq when Yahoo succeeds', async () => {
    const urls: string[] = [];
    const quote = await fetchQuote('NVDA', deps({ yahoo: YAHOO_OK, stooq: STOOQ_OK }, '2026-09-13T09:00:00.000Z', urls));
    expect(quote.priceUsd.toString()).toBe('171.23');
    expect(urls).toHaveLength(1);
    expect(urls[0]).toContain('yahoo');
  });

  it('falls back to stooq when Yahoo is unreachable', async () => {
    const urls: string[] = [];
    const quote = await fetchQuote('NVDA', deps({ yahoo: new TypeError('offline'), stooq: STOOQ_OK }, '2026-09-13T09:00:00.000Z', urls));
    expect(quote.priceUsd.toString()).toBe('171.23');
    expect(quote.name).toBeNull();
    expect(urls).toHaveLength(2);
    expect(urls[1]).toContain('stooq');
  });

  it('falls back to stooq when Yahoo returns an unparseable body', async () => {
    const quote = await fetchQuote('NVDA', deps({ yahoo: '<html>429</html>', stooq: STOOQ_OK }));
    expect(quote.priceUsd.toString()).toBe('171.23');
  });

  it('throws QuoteFetchError naming both providers when both fail', async () => {
    const promise = fetchQuote('ZZZZ', deps({ yahoo: new TypeError('offline'), stooq: STOOQ_UNKNOWN }));
    await expect(promise).rejects.toThrow(QuoteFetchError);
    await expect(fetchQuote('ZZZZ', deps({ yahoo: new TypeError('offline'), stooq: STOOQ_UNKNOWN })))
      .rejects.toThrow(/yahoo.*stooq/is);
  });
});

describe('getQuote cache policy', () => {
  it('fetches, caches at 6 dp, and reports fresh', async () => {
    const result = await getQuote(db, 'NVDA', deps({ yahoo: YAHOO_OK }));
    expect(result!.priceUsd.toString()).toBe('171.23');
    expect(result!.stale).toBe(false);
    expect(getQuoteRow(db, 'NVDA')).toEqual({
      ticker: 'NVDA', priceUsd: '171.230000', fetchedAt: '2026-09-13T09:00:00.000Z',
    });
  });

  it('serves a cached quote inside the TTL without any request', async () => {
    const nowIso = '2026-09-13T09:00:00.000Z';
    const fresh = new Date(new Date(nowIso).getTime() - 60_000).toISOString();
    upsertQuoteRow(db, { ticker: 'NVDA', priceUsd: '100.000000', fetchedAt: fresh });

    const urls: string[] = [];
    const result = await getQuote(db, 'NVDA', deps({ yahoo: YAHOO_OK }, nowIso, urls));
    expect(result!.priceUsd.toString()).toBe('100');
    expect(result!.stale).toBe(false);
    expect(urls).toEqual([]);
  });

  it('refetches once the cached quote passes the TTL', async () => {
    const nowIso = '2026-09-13T09:00:00.000Z';
    const old = new Date(new Date(nowIso).getTime() - CACHE_TTL_MS - 1).toISOString();
    upsertQuoteRow(db, { ticker: 'NVDA', priceUsd: '100.000000', fetchedAt: old });

    const result = await getQuote(db, 'NVDA', deps({ yahoo: YAHOO_OK }, nowIso));
    expect(result!.priceUsd.toString()).toBe('171.23');
  });

  it('returns the stale cached quote when both providers fail', async () => {
    upsertQuoteRow(db, { ticker: 'NVDA', priceUsd: '100.000000', fetchedAt: '2020-01-01T00:00:00.000Z' });
    const result = await getQuote(db, 'NVDA', deps({ yahoo: new TypeError('offline'), stooq: new TypeError('offline') }));
    expect(result!.priceUsd.toString()).toBe('100');
    expect(result!.stale).toBe(true);
    expect(result!.fetchedAt).toBe('2020-01-01T00:00:00.000Z');
  });

  it('returns null when both providers fail and nothing is cached', async () => {
    await expect(getQuote(db, 'ZZZZ', deps({ yahoo: new TypeError('offline'), stooq: new TypeError('offline') })))
      .resolves.toBeNull();
  });

  it('treats nvda and NVDA as one cache entry', async () => {
    await getQuote(db, 'nvda', deps({ yahoo: YAHOO_OK }));
    expect(getQuoteRow(db, 'NVDA')).not.toBeNull();
    expect(db.getAllSync('SELECT * FROM quotes;')).toHaveLength(1);
  });
});
