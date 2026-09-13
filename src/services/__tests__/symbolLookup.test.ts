import { openTestDatabase } from '../../db/__tests__/testDatabase';
import { runMigrations } from '../../db/schema';
import { createSymbol, listSymbols } from '../../db/repo';
import type { SqlDatabase } from '../../db/sqlDatabase';
import type { HttpFetch, HttpResponse } from '../http';
import type { NetDeps } from '../fx';
import { backfillSymbolName, backfillMissingSymbolNames } from '../symbolLookup';

function yahooBody(name: string): string {
  return JSON.stringify({ chart: { result: [{ meta: { currency: 'USD', regularMarketPrice: 100, longName: name } }] } });
}

/** Answers Yahoo per ticker; anything else (including stooq) fails. */
function deps(namesByTicker: Record<string, string>, urls: string[] = []): NetDeps {
  const fetchImpl: HttpFetch = async (url) => {
    urls.push(url);
    const match = /chart\/([A-Z]+)\?/.exec(url);
    const name = match ? namesByTicker[match[1]!] : undefined;
    if (!name) throw new TypeError('not found');
    return { ok: true, status: 200, text: async () => yahooBody(name) } as HttpResponse;
  };
  return { fetch: fetchImpl, now: () => new Date('2026-09-13T09:00:00.000Z') };
}

let db: SqlDatabase;
beforeEach(() => {
  db = openTestDatabase();
  runMigrations(db);
});

describe('backfillSymbolName', () => {
  it('writes the fetched name onto a symbol that has none', async () => {
    const symbol = createSymbol(db, 'NVDA');
    await expect(backfillSymbolName(db, symbol, deps({ NVDA: 'NVIDIA Corporation' })))
      .resolves.toBe('NVIDIA Corporation');
    expect(listSymbols(db)[0]!.name).toBe('NVIDIA Corporation');
  });

  it('makes no request and changes nothing when the symbol already has a name', async () => {
    const symbol = createSymbol(db, 'NVDA', 'Hand typed');
    const urls: string[] = [];
    await expect(backfillSymbolName(db, symbol, deps({ NVDA: 'NVIDIA Corporation' }, urls))).resolves.toBeNull();
    expect(urls).toEqual([]);
    expect(listSymbols(db)[0]!.name).toBe('Hand typed');
  });

  it('returns null and leaves the symbol alone when the lookup fails', async () => {
    const symbol = createSymbol(db, 'ZZZZ');
    await expect(backfillSymbolName(db, symbol, deps({}))).resolves.toBeNull();
    expect(listSymbols(db)[0]!.name).toBe('');
  });

  it('never throws, whatever the network does — the lookup is advisory', async () => {
    const symbol = createSymbol(db, 'NVDA');
    const exploding: NetDeps = {
      fetch: async () => { throw new Error('boom'); },
      now: () => new Date('2026-09-13T09:00:00.000Z'),
    };
    await expect(backfillSymbolName(db, symbol, exploding)).resolves.toBeNull();
  });
});

describe('backfillMissingSymbolNames', () => {
  it('fills every unnamed symbol it can and reports how many it filled', async () => {
    createSymbol(db, 'NVDA');
    createSymbol(db, 'AAPL');
    createSymbol(db, 'ZZZZ');
    createSymbol(db, 'MSFT', 'Already named');

    const urls: string[] = [];
    const filled = await backfillMissingSymbolNames(db, deps({ NVDA: 'NVIDIA Corporation', AAPL: 'Apple Inc.' }, urls));
    expect(filled).toBe(2);

    const byTicker = new Map(listSymbols(db).map((s) => [s.ticker, s.name]));
    expect(byTicker.get('NVDA')).toBe('NVIDIA Corporation');
    expect(byTicker.get('AAPL')).toBe('Apple Inc.');
    expect(byTicker.get('ZZZZ')).toBe('');
    expect(byTicker.get('MSFT')).toBe('Already named');
    // MSFT already had a name, so only the three unnamed ones were attempted.
    expect(urls.filter((u) => u.includes('yahoo'))).toHaveLength(3);
  });

  it('reports zero on an empty symbol table', async () => {
    await expect(backfillMissingSymbolNames(db, deps({}))).resolves.toBe(0);
  });

  it('never throws when the database fails — the lookup is advisory', async () => {
    const brokenDb = {
      getAllSync: () => { throw new Error('db connection closed'); },
    } as unknown as SqlDatabase;
    await expect(backfillMissingSymbolNames(brokenDb, deps({}))).resolves.toBe(0);
  });
});
