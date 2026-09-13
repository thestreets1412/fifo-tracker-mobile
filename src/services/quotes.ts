import Decimal from 'decimal.js';
import { DP, toStored, fromStored } from '../core/money';
import type { SqlDatabase } from '../db/sqlDatabase';
import { getQuoteRow, upsertQuoteRow } from '../db/repo';
import { httpGetText } from './http';
import { CACHE_TTL_MS, defaultNetDeps, type NetDeps } from './fx';

/**
 * Two providers, tried in order, because spec §5 says both "can break
 * without notice" and neither needs an API key (a key shipped in an APK is
 * public, so keyed tiers are unusable without a proxy, and a proxy
 * contradicts standalone operation).
 *
 * Yahoo goes first: it also returns the company name, which the advisory
 * symbol-name backfill of spec §7.4 needs. Stooq is the fallback and
 * returns a price only.
 */

export class QuoteFetchError extends Error {
  constructor(readonly ticker: string, reason: string) {
    super(`Could not fetch quote for ${ticker}: ${reason}`);
    this.name = 'QuoteFetchError';
  }
}

export interface QuoteLookup {
  priceUsd: Decimal;
  /** Company name when the provider supplies one; stooq never does. */
  name: string | null;
}

function normalizeTicker(ticker: string): string {
  return ticker.trim().toUpperCase();
}

// ---------- Yahoo ----------

export function yahooChartUrl(ticker: string): string {
  return `https://query1.finance.yahoo.com/v8/finance/chart/${normalizeTicker(ticker)}?interval=1d&range=1d`;
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

export function parseYahooChart(body: string, ticker: string): QuoteLookup {
  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    throw new QuoteFetchError(ticker, 'yahoo response was not JSON');
  }

  const meta = (payload as { chart?: { result?: Array<{ meta?: Record<string, unknown> }> } } | null)
    ?.chart?.result?.[0]?.meta;
  if (!meta) {
    throw new QuoteFetchError(ticker, 'yahoo returned no chart result');
  }

  // The whole app is USD-priced with a separate USD→THB rate. A quote in
  // another currency would be multiplied by the FX rate anyway and produce a
  // silently wrong portfolio value, so refuse it outright.
  if (meta['currency'] !== 'USD') {
    throw new QuoteFetchError(ticker, `yahoo quote currency is ${String(meta['currency'])}, expected USD`);
  }

  const raw = meta['regularMarketPrice'];
  if (typeof raw !== 'number' || !Number.isFinite(raw)) {
    throw new QuoteFetchError(ticker, 'yahoo returned no regularMarketPrice');
  }
  const priceUsd = new Decimal(String(raw));
  if (priceUsd.lessThanOrEqualTo(0)) {
    throw new QuoteFetchError(ticker, `yahoo returned non-positive price ${priceUsd.toString()}`);
  }

  return { priceUsd, name: nonEmptyString(meta['longName']) ?? nonEmptyString(meta['shortName']) };
}

// ---------- stooq ----------

export function stooqCsvUrl(ticker: string): string {
  return `https://stooq.com/q/l/?s=${normalizeTicker(ticker).toLowerCase()}.us&f=sd2t2ohlcv&h&e=csv`;
}

const PLAIN_NUMBER = /^\d+(\.\d+)?$/;

export function parseStooqCsv(body: string, ticker: string): QuoteLookup {
  const lines = body.split(/\r?\n/).filter((line) => line.trim() !== '');
  const header = lines[0];
  const data = lines[1];
  if (!header || !data) {
    throw new QuoteFetchError(ticker, 'stooq returned no data row');
  }

  // By header name, not position: stooq's column set depends on the `f=`
  // parameter, and a positional read would silently return the wrong field
  // if that string is ever edited.
  const closeIndex = header.split(',').findIndex((name) => name.trim().toLowerCase() === 'close');
  if (closeIndex < 0) {
    throw new QuoteFetchError(ticker, 'stooq response has no Close column');
  }

  const value = data.split(',')[closeIndex]?.trim();
  // stooq answers an unknown ticker with 'N/D' in every field rather than an error status.
  if (!value || !PLAIN_NUMBER.test(value)) {
    throw new QuoteFetchError(ticker, `stooq returned no usable close price (${String(value)})`);
  }

  const priceUsd = new Decimal(value);
  if (priceUsd.lessThanOrEqualTo(0)) {
    throw new QuoteFetchError(ticker, `stooq returned non-positive price ${priceUsd.toString()}`);
  }
  return { priceUsd, name: null };
}

// ---------- chain ----------

function reason(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function fetchQuote(ticker: string, deps: NetDeps = defaultNetDeps): Promise<QuoteLookup> {
  const normalized = normalizeTicker(ticker);

  let yahooReason: string;
  try {
    return parseYahooChart(await httpGetText(yahooChartUrl(normalized), deps.fetch), normalized);
  } catch (error) {
    yahooReason = reason(error);
  }

  let stooqReason: string;
  try {
    return parseStooqCsv(await httpGetText(stooqCsvUrl(normalized), deps.fetch), normalized);
  } catch (error) {
    stooqReason = reason(error);
  }

  throw new QuoteFetchError(normalized, `yahoo: ${yahooReason}; stooq: ${stooqReason}`);
}

// ---------- cache ----------

export interface QuoteResult {
  priceUsd: Decimal;
  /** ISO 8601 UTC — when this price was actually retrieved. */
  fetchedAt: string;
  /** True when this did not come from a successful fetch just now. */
  stale: boolean;
}

function isFresh(fetchedAt: string, now: Date): boolean {
  const age = now.getTime() - new Date(fetchedAt).getTime();
  return Number.isFinite(age) && age >= 0 && age < CACHE_TTL_MS;
}

/**
 * Spec §5: quotes are cached for 15 minutes so opening the dashboard does
 * not fire a request every time, and an offline device shows the cached
 * value with its age rather than a blank.
 *
 * Returns null only when there is nothing at all to show for this ticker.
 * A null must degrade that one symbol — never the whole dashboard.
 */
export async function getQuote(
  db: SqlDatabase,
  ticker: string,
  deps: NetDeps = defaultNetDeps,
): Promise<QuoteResult | null> {
  const normalized = normalizeTicker(ticker);
  const now = deps.now();
  const cached = getQuoteRow(db, normalized);

  if (cached && isFresh(cached.fetchedAt, now)) {
    return { priceUsd: fromStored(cached.priceUsd), fetchedAt: cached.fetchedAt, stale: false };
  }

  try {
    const quote = await fetchQuote(normalized, deps);
    const fetchedAt = now.toISOString();
    upsertQuoteRow(db, { ticker: normalized, priceUsd: toStored(quote.priceUsd, DP.price), fetchedAt });
    return { priceUsd: quote.priceUsd, fetchedAt, stale: false };
  } catch {
    if (cached) {
      return { priceUsd: fromStored(cached.priceUsd), fetchedAt: cached.fetchedAt, stale: true };
    }
    return null;
  }
}
