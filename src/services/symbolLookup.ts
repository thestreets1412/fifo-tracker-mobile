import type { SymbolRow } from '../core/types';
import type { SqlDatabase } from '../db/sqlDatabase';
import { listSymbols, renameSymbol } from '../db/repo';
import { defaultNetDeps, type NetDeps } from './fx';
import { fetchQuote } from './quotes';

/**
 * Spec §7.4: on add, the app attempts to validate the ticker against the
 * quote endpoint and populate `name` from the response — but "validation is
 * advisory, never blocking". A symbol is created offline with an empty name
 * and the name is backfilled on a later successful lookup.
 *
 * Every function here swallows every failure and returns null / a count.
 * Nothing in this file may ever throw at a caller: a UI that awaited it
 * would be gating data entry on the network, which is exactly what the spec
 * forbids.
 */

/** Returns the name it wrote, or null if it wrote nothing. Never throws. */
export async function backfillSymbolName(
  db: SqlDatabase,
  symbol: SymbolRow,
  deps: NetDeps = defaultNetDeps,
): Promise<string | null> {
  if (symbol.name.trim() !== '') return null;

  try {
    const quote = await fetchQuote(symbol.ticker, deps);
    if (!quote.name) return null;
    renameSymbol(db, symbol.id, quote.name);
    return quote.name;
  } catch {
    return null;
  }
}

/** Attempts every unnamed symbol; returns how many names were written. Never throws. */
export async function backfillMissingSymbolNames(
  db: SqlDatabase,
  deps: NetDeps = defaultNetDeps,
): Promise<number> {
  try {
    const unnamed = listSymbols(db).filter((symbol) => symbol.name.trim() === '');

    // Sequential, not parallel: this runs against two unofficial endpoints
    // that rate-limit, and a burst of simultaneous requests is the most
    // reliable way to get every one of them refused.
    let filled = 0;
    for (const symbol of unnamed) {
      if (await backfillSymbolName(db, symbol, deps)) filled += 1;
    }
    return filled;
  } catch {
    return 0;
  }
}
