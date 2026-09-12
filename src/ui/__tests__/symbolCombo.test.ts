import { filterSymbols } from '../symbolCombo';
import type { SymbolRow } from '../../core/types';

const symbols: SymbolRow[] = [
  { id: 1, ticker: 'NVDA', name: 'NVIDIA' },
  { id: 2, ticker: 'AAPL', name: 'Apple' },
  { id: 3, ticker: 'NFLX', name: 'Netflix' },
];

test('empty query matches everything and offers no add', () => {
  const r = filterSymbols('', symbols);
  expect(r.matches).toHaveLength(3);
  expect(r.canAdd).toBe(false);
  expect(r.exactMatch).toBeNull();
});

test('prefix matches are case- and whitespace-insensitive', () => {
  const r = filterSymbols(' nf ', symbols);
  expect(r.matches.map((s) => s.ticker)).toEqual(['NFLX']);
  expect(r.addTicker).toBe('NF');
});

test('matches on name too', () => {
  const r = filterSymbols('apple', symbols);
  expect(r.matches.map((s) => s.ticker)).toEqual(['AAPL']);
});

test('exact ticker match is reported and suppresses add', () => {
  const r = filterSymbols('nvda', symbols);
  expect(r.exactMatch?.id).toBe(1);
  expect(r.canAdd).toBe(false);
});

test('a non-matching non-empty query offers to add the normalized ticker', () => {
  const r = filterSymbols('tsla', symbols);
  expect(r.matches).toHaveLength(0);
  expect(r.canAdd).toBe(true);
  expect(r.addTicker).toBe('TSLA');
});
