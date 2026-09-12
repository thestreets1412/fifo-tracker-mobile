import type { SymbolRow } from '../core/types';

export interface ComboResult {
  matches: SymbolRow[];
  exactMatch: SymbolRow | null;
  canAdd: boolean;
  addTicker: string;
}

export function filterSymbols(query: string, symbols: readonly SymbolRow[]): ComboResult {
  const normalized = query.trim().toUpperCase();
  if (normalized === '') {
    return { matches: [...symbols], exactMatch: null, canAdd: false, addTicker: '' };
  }
  const matches = symbols.filter(
    (s) => s.ticker.includes(normalized) || s.name.toUpperCase().includes(normalized),
  );
  const exactMatch = symbols.find((s) => s.ticker === normalized) ?? null;
  return { matches, exactMatch, canAdd: exactMatch === null, addTicker: normalized };
}
