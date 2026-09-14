import type { SqlDatabase } from '../db/sqlDatabase';
import * as repo from '../db/repo';
import { evidenceDirectory, replaceBackupRows } from '../db/backupRepo';
import { withTransaction, rebuildLedger, toDomainLot, toDomainSale } from './ledger';
import { rebuildAllocations } from '../core/fifo';
import { canonicalData, backupJson, type BackupData } from '../backup/data';

export function captureBackup(db: SqlDatabase): { data: BackupData; directory: string } {
  return withTransaction(db, () => ({
    data: canonicalData({ symbols: repo.listSymbols(db), lots: repo.listLots(db), sales: repo.listSales(db) }),
    directory: evidenceDirectory(db),
  }));
}
export function validateBackupLedger(data: BackupData): void {
  rebuildAllocations(data.lots.map(toDomainLot), data.sales.map(toDomainSale));
}
export function restoreBackup(db: SqlDatabase, data: BackupData, directory: string, expected: string): void {
  withTransaction(db, () => {
    if (backupJson(captureBackup(db).data) !== expected) throw new Error('Ledger changed; retry restore');
    replaceBackupRows(db, canonicalData(data), directory);
    rebuildLedger(db);
  });
}
