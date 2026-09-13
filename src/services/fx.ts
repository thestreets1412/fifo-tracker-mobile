import Decimal from 'decimal.js';
import { DP, toStored, fromStored } from '../core/money';
import type { SqlDatabase } from '../db/sqlDatabase';
import { getFxRateRow, upsertFxRateRow, latestFxRateRow } from '../db/repo';
import { todayYmd } from '../ui/dateInput';
import { httpGetText, platformFetch, type HttpFetch } from './http';

/**
 * How long a cached value for *today* stays usable. Historical rates never
 * change and are cached permanently (spec §5); only today's is refetched.
 *
 * 15 minutes matches the quote TTL the spec fixes, and refreshes today's
 * rate shortly after Frankfurter's once-daily ECB publication — a rate
 * cached at 09:00 is still the previous day's figure filed under today's
 * key, so caching it permanently would freeze it.
 */
export const CACHE_TTL_MS = 15 * 60 * 1000;

/**
 * The injected outside world: the network and the clock. Tests pass stubs;
 * screens pass `defaultNetDeps`. No function in this file reads a global.
 */
export interface NetDeps {
  fetch: HttpFetch;
  now: () => Date;
}

export const defaultNetDeps: NetDeps = { fetch: platformFetch, now: () => new Date() };

export class FxRateFetchError extends Error {
  constructor(readonly rateDate: string, reason: string) {
    super(`Could not fetch USD/THB rate for ${rateDate}: ${reason}`);
    this.name = 'FxRateFetchError';
  }
}

/**
 * Frankfurter: keyless, open-source, ECB-backed. The same endpoint the
 * Django app uses (docs/reference/django/services.py:50), so rates agree
 * between the two apps for the same date.
 */
export function frankfurterUrl(rateDate: string): string {
  return `https://api.frankfurter.app/${rateDate}?from=USD&to=THB`;
}

export function parseFrankfurter(body: string, rateDate: string): Decimal {
  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    throw new FxRateFetchError(rateDate, 'response was not JSON');
  }

  const rates = (payload as { rates?: Record<string, unknown> } | null)?.rates;
  const raw = rates?.['THB'];
  if (typeof raw !== 'number' || !Number.isFinite(raw)) {
    throw new FxRateFetchError(rateDate, 'no THB rate in response');
  }

  // String(number), never arithmetic on the number — matches Django's
  // Decimal(str(...)) so ported values agree.
  const rate = new Decimal(String(raw));
  if (rate.lessThanOrEqualTo(0)) {
    throw new FxRateFetchError(rateDate, `non-positive rate ${rate.toString()}`);
  }
  return rate;
}

export async function fetchUsdThbRate(rateDate: string, deps: NetDeps): Promise<Decimal> {
  let body: string;
  try {
    body = await httpGetText(frankfurterUrl(rateDate), deps.fetch);
  } catch (error) {
    throw new FxRateFetchError(rateDate, error instanceof Error ? error.message : String(error));
  }
  return parseFrankfurter(body, rateDate);
}

export interface FxRateResult {
  rate: Decimal;
  /** The date this rate actually applies to — not always the date asked for. */
  rateDate: string;
  /** ISO 8601 UTC. */
  fetchedAt: string;
  /** True when this did not come from a successful fetch just now. */
  stale: boolean;
}

function isFresh(fetchedAt: string, now: Date): boolean {
  const age = now.getTime() - new Date(fetchedAt).getTime();
  return Number.isFinite(age) && age >= 0 && age < CACHE_TTL_MS;
}

/**
 * The rate for one specific date, from cache or the network.
 *
 * Returns null only when there is nothing to show at all: the fetch failed
 * and no row was ever cached for that date. Callers must handle null by
 * degrading, never by throwing — spec §5 treats network failure as a normal
 * state.
 */
export async function getFxRateForDate(
  db: SqlDatabase,
  rateDate: string,
  deps: NetDeps = defaultNetDeps,
): Promise<FxRateResult | null> {
  const now = deps.now();
  const cached = getFxRateRow(db, rateDate);
  const isPast = rateDate < todayYmd(now);

  if (cached && (isPast || isFresh(cached.fetchedAt, now))) {
    return { rate: fromStored(cached.usdThb), rateDate, fetchedAt: cached.fetchedAt, stale: false };
  }

  try {
    const rate = await fetchUsdThbRate(rateDate, deps);
    const fetchedAt = now.toISOString();
    upsertFxRateRow(db, { rateDate, usdThb: toStored(rate, DP.fxRate), fetchedAt });
    return { rate, rateDate, fetchedAt, stale: false };
  } catch {
    if (cached) {
      return { rate: fromStored(cached.usdThb), rateDate, fetchedAt: cached.fetchedAt, stale: true };
    }
    return null;
  }
}

/**
 * Today's rate, with one extra fallback the dashboard needs and the
 * transaction forms must not have: when today cannot be resolved at all,
 * fall back to the most recent rate ever cached. The result's `rateDate`
 * reports which day that was, so the UI can say so rather than silently
 * presenting an old rate as today's.
 */
export async function getTodayFxRate(
  db: SqlDatabase,
  deps: NetDeps = defaultNetDeps,
): Promise<FxRateResult | null> {
  const today = todayYmd(deps.now());
  const result = await getFxRateForDate(db, today, deps);
  if (result) return result;

  const latest = latestFxRateRow(db);
  if (!latest) return null;
  return {
    rate: fromStored(latest.usdThb),
    rateDate: latest.rateDate,
    fetchedAt: latest.fetchedAt,
    stale: true,
  };
}
