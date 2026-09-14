import type { SqlDatabase } from './sqlDatabase';
import type { BackupData } from '../backup/data';

export function evidenceDirectory(db: SqlDatabase): string {
  const name = db.getAllSync<{ directory: string }>('SELECT directory FROM evidence_storage WHERE singleton = 1;')[0]?.directory;
  if (!name || !/^(evidence|evidence-restore-[a-f0-9-]+)$/.test(name)) throw new Error('Invalid evidence directory');
  return name;
}

/** Caller owns the transaction and must rebuild allocations before committing. */
export function replaceBackupRows(db: SqlDatabase, data: BackupData, directory: string): void {
  if (!/^evidence-restore-[a-f0-9-]+$/.test(directory)) throw new Error('Invalid restore directory');
  db.execSync('DELETE FROM sale_allocations; DELETE FROM sales; DELETE FROM lots; DELETE FROM symbols; DELETE FROM quotes; DELETE FROM fx_rates;');
  for (const s of data.symbols) db.runSync('INSERT INTO symbols (id, ticker, name) VALUES (?, ?, ?);', [s.id, s.ticker, s.name]);
  for (const r of data.lots) db.runSync(
    'INSERT INTO lots (id, symbol_id, buy_date, price_usd, qty, fx_rate_usd_thb, created_at, evidence_file) VALUES (?, ?, ?, ?, ?, ?, ?, ?);',
    [r.id, r.symbolId, r.buyDate, r.priceUsd, r.qty, r.fxRateUsdThb, r.createdAt, r.evidenceFile]);
  for (const r of data.sales) db.runSync(
    'INSERT INTO sales (id, symbol_id, sell_date, qty_sold, sale_price_usd, fee_usd, fx_rate_usd_thb, created_at, evidence_file) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);',
    [r.id, r.symbolId, r.sellDate, r.qtySold, r.salePriceUsd, r.feeUsd, r.fxRateUsdThb, r.createdAt, r.evidenceFile]);
  db.runSync('UPDATE evidence_storage SET directory = ? WHERE singleton = 1;', [directory]);
}
