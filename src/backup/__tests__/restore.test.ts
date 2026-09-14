import { captureBackup, restoreBackup } from '../../services/backup';
import { backupJson, canonicalData } from '../data';
import * as repo from '../../db/repo';
import { evidenceDirectory } from '../../db/backupRepo';
import { runMigrations } from '../../db/schema';
import { data, database } from './fixtures';

test('replace rebuilds FIFO with original tied IDs, excludes caches, and exports identical JSON', () => {
  const db = database(); const snapshot = backupJson(captureBackup(db).data); const expected = repo.listAllocations(db);
  repo.upsertQuoteRow(db, { ticker: 'NVDA', priceUsd: '1.000000', fetchedAt: '2026-09-13T00:00:00Z' });
  restoreBackup(db, data, 'evidence-restore-bbbb', snapshot);
  expect(backupJson(captureBackup(db).data)).toBe(snapshot); expect(repo.listAllocations(db)).toEqual(expected);
  expect(repo.listAllocations(db).map(a => a.lotId)).toEqual([2, 5]);
  expect(repo.getQuoteRow(db, 'NVDA')).toBeNull(); expect(evidenceDirectory(db)).toBe('evidence-restore-bbbb');
});
test('insufficient lots rolls back ledger, allocations, caches and evidence pointer', () => {
  const db = database(); const snapshot = backupJson(captureBackup(db).data); const allocations = repo.listAllocations(db);
  const edited = canonicalData({ ...data, lots: data.lots.map(l => l.id === 2 ? { ...l, qty: '1' } : l) });
  expect(() => restoreBackup(db, edited, 'evidence-restore-bbbb', snapshot)).toThrow();
  expect(backupJson(captureBackup(db).data)).toBe(snapshot); expect(repo.listAllocations(db)).toEqual(allocations); expect(evidenceDirectory(db)).toBe('evidence-restore-aaaa');
});
test('stale restore is rejected', () => {
  const db = database(); const snapshot = backupJson(captureBackup(db).data); repo.renameSymbol(db, 3, 'Changed');
  expect(() => restoreBackup(db, data, 'evidence-restore-bbbb', snapshot)).toThrow('Ledger changed');
  expect(repo.listSymbols(db).find(s => s.id === 3)?.name).toBe('Changed');
});
test('empty, buy-only, fully sold and unknown ticker restores succeed', () => {
  for (const seed of [
    { symbols: [], lots: [], sales: [] },
    { ...data, sales: [] },
    canonicalData({ ...data, sales: data.sales.map(s => ({ ...s, qtySold: '10.20000000' })) }),
    { ...data, symbols: data.symbols.map(s => ({ ...s, ticker: s.ticker + 'X' })) },
  ]) {
    const db = database(); restoreBackup(db, seed, 'evidence-restore-bbbb', backupJson(captureBackup(db).data));
    expect(backupJson(captureBackup(db).data)).toBe(backupJson(seed));
  }
});
test('schema 1 migration preserves ledger and selects legacy evidence directory', () => {
  const db = database(); const before = repo.listLots(db);
  db.execSync('DROP TABLE evidence_storage; PRAGMA user_version = 1;');
  runMigrations(db); expect(evidenceDirectory(db)).toBe('evidence'); expect(repo.listLots(db)).toEqual(before);
});
