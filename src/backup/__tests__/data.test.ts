import { backupCsv, backupJson, canonicalData, dataFromCsv, differences, parseBackupJson, parseCsv } from '../data';
import { data } from './fixtures';

test('JSON and both CSVs round-trip IDs, decimals, symbols, evidence and creation ties', () => {
  expect(parseBackupJson(backupJson(data))).toEqual(data);
  expect(dataFromCsv(data, backupCsv(data, 'lots'), backupCsv(data, 'sales'))).toEqual(data);
  expect(backupCsv(data, 'lots')).toMatch(/^\ufeffid,ticker,buy_date,price_usd,qty,fx_rate_usd_thb,created_at,evidence\r\n/);
  expect(parseCsv(backupCsv(data, 'sales')).every(r => r.length === 9)).toBe(true);
});
test('Excel date, precision, exponent, line endings and lost ticker zeros normalize without differences', () => {
  const csv = backupCsv(data, 'lots').replace(/2026-01-01,/g, '1/1/2026,').replace('10.00000000', '1E1').replace('0.20000000', '0.2').replace('00700', '700').replace(/\r\n/g, '\n');
  expect(differences(data, dataFromCsv(data, csv, backupCsv(data, 'sales')))).toEqual([]);
});
test('real changes, additions, deletions and new tickers are visible', () => {
  const original = backupCsv(data, 'lots');
  const csv = original.replace('142.350000', '142.36').replace('00700', 'new').replace(/^5,.*\r\n/m, '');
  const candidate = dataFromCsv(data, csv, backupCsv(data, 'sales'));
  expect(candidate.symbols.at(-1)?.ticker).toBe('NEW');
  expect(differences(data, candidate).map(d => d.field)).toEqual(expect.arrayContaining(['priceUsd', 'record', 'ticker']));
});
test('CSV quotes and formula protection round-trip literal ticker text', () => {
  const tricky = canonicalData({ ...data, symbols: data.symbols.map(s => s.id === 3 ? { ...s, ticker: '=SUM("A",1)' } : s) });
  expect(backupCsv(tricky, 'lots')).toContain('"\'=SUM(""A"",1)"');
  expect(dataFromCsv(tricky, backupCsv(tricky, 'lots'), backupCsv(tricky, 'sales'))).toEqual(tricky);
  const apostrophe = canonicalData({ ...data, symbols: data.symbols.map(s => s.id === 3 ? { ...s, ticker: "'NAME" } : s) });
  expect(dataFromCsv(apostrophe, backupCsv(apostrophe, 'lots'), backupCsv(apostrophe, 'sales'))).toEqual(apostrophe);
});
test.each(['"unclosed', 'a"b,c', '"a"b,c'])('rejects malformed CSV %s', value => expect(() => parseCsv(value)).toThrow());
test.each([
  (s: string) => s.replace('"10.00000000"', '10'),
  (s: string) => s.replace('10.00000000', '-1'),
  (s: string) => s.replace('10.00000000', '0'),
  (s: string) => s.replace('10.00000000', 'Infinity'),
  (s: string) => s.replace('10.00000000', '1e999'),
  (s: string) => s.replace('10.00000000', '0.000000001'),
  (s: string) => s.replace('receipt.jpg', '../receipt.jpg'),
  (s: string) => s.replace('2026-01-01', '2026-02-30'),
  (s: string) => s.replace('"symbol_id": 3', '"symbol_id": 99'),
])('rejects invalid authoritative data', change => expect(() => parseBackupJson(change(backupJson(data)))).toThrow());
test('duplicate IDs and normalized duplicate tickers fail', () => {
  expect(() => canonicalData({ ...data, lots: [...data.lots, data.lots[0]!] })).toThrow();
  expect(() => canonicalData({ ...data, symbols: [...data.symbols, { id: 50, ticker: ' nvda ', name: '' }] })).toThrow();
});
