import { createHash } from 'node:crypto';
import { openTestDatabase } from '../../db/__tests__/testDatabase';
import { runMigrations } from '../../db/schema';
import { replaceBackupRows } from '../../db/backupRepo';
import { rebuildLedger, withTransaction } from '../../services/ledger';
import { canonicalData, type BackupData } from '../data';
export const password = 'cedar lantern harbor violet otter';
export const hash = async (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
export const encode = (s: string) => new TextEncoder().encode(s);
export const decode = (b: Uint8Array) => new TextDecoder().decode(b);
export const data: BackupData = canonicalData({
  symbols: [{ id: 3, ticker: 'NVDA', name: 'NVIDIA ไทย' }, { id: 8, ticker: '00700', name: 'Tencent' }, { id: 11, ticker: 'UNUSED', name: '' }],
  lots: [
    { id: 5, symbolId: 3, buyDate: '2026-01-01', priceUsd: '0.100000', qty: '0.20000000', fxRateUsdThb: '35.1234', createdAt: '2026-01-01T00:00:00Z', evidenceFile: 'receipt.jpg' },
    { id: 2, symbolId: 3, buyDate: '2026-01-01', priceUsd: '142.350000', qty: '10.00000000', fxRateUsdThb: '36.2100', createdAt: '2026-01-01T00:00:00Z', evidenceFile: null },
    { id: 9, symbolId: 8, buyDate: '2026-01-01', priceUsd: '1.000000', qty: '2.00000000', fxRateUsdThb: '36.0000', createdAt: '2026-01-01T00:00:00Z', evidenceFile: null },
  ],
  sales: [{ id: 4, symbolId: 3, sellDate: '2026-02-01', qtySold: '10.10000000', salePriceUsd: '155.100000', feeUsd: '1.2500', fxRateUsdThb: '36.1000', createdAt: '2026-02-01T00:00:00Z', evidenceFile: 'receipt.jpg' }],
});
export function database(seed = data) {
  const db = openTestDatabase(); runMigrations(db);
  withTransaction(db, () => { replaceBackupRows(db, seed, 'evidence-restore-aaaa'); rebuildLedger(db); });
  return db;
}
