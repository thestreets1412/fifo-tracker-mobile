import { CURRENT_SCHEMA_VERSION } from '../db/schema';
import { backupCsv, backupJson, canonicalData, dataFromCsv, differences, evidenceNames, parseBackupJson, type BackupData, type Difference } from './data';
import type { ArchiveFiles } from './zip';

export type Hash = (bytes: Uint8Array) => Promise<string>;
const encode = (s: string) => new TextEncoder().encode(s);
const decode = (b: Uint8Array) => new TextDecoder('utf-8', { fatal: true }).decode(b);
export interface ImportReview { json: BackupData; csv?: BackupData; differences: Difference[]; csvError?: string; files: ArchiveFiles; exportedAt: string }

export async function buildArchiveFiles(data: BackupData, readEvidence: (name: string) => Promise<Uint8Array>, hash: Hash, exportedAt: string, appVersion: string): Promise<ArchiveFiles> {
  const canonical = canonicalData(data);
  const files: ArchiveFiles = new Map([
    ['backup.json', encode(backupJson(canonical))], ['lots.csv', encode(backupCsv(canonical, 'lots'))], ['sales.csv', encode(backupCsv(canonical, 'sales'))],
  ]);
  let total = [...files.values()].reduce((sum, b) => sum + b.length, 0);
  for (const name of evidenceNames(canonical)) {
    const bytes = await readEvidence(name); total += bytes.length;
    if (total > 64 * 1024 * 1024) throw new Error('Backup too large');
    files.set('evidence/' + name, bytes);
  }
  const checksums: Record<string, string> = {};
  for (const [name, bytes] of files) checksums[name] = 'sha256-' + await hash(bytes);
  const manifest = {
    format: 'fifo-tracker-backup', version: 1, schema_version: CURRENT_SCHEMA_VERSION, app_version: appVersion, exported_at: exportedAt,
    counts: { symbols: canonical.symbols.length, lots: canonical.lots.length, sales: canonical.sales.length, evidence: evidenceNames(canonical).length }, checksums,
  };
  files.set('manifest.json', encode(JSON.stringify(manifest, null, 2) + '\n'));
  return files;
}

export async function inspectArchive(files: ArchiveFiles, hash: Hash): Promise<ImportReview> {
  const get = (name: string) => { const b = files.get(name); if (!b) throw new Error('Missing backup file'); return b; };
  const m = JSON.parse(decode(get('manifest.json')));
  if (m?.format !== 'fifo-tracker-backup' || m.version !== 1 || !Number.isInteger(m.schema_version) || m.schema_version < 1 || m.schema_version > CURRENT_SCHEMA_VERSION) throw new Error('Unsupported backup version');
  if (typeof m.exported_at !== 'string' || !Number.isFinite(Date.parse(m.exported_at)) || !m.checksums || typeof m.checksums !== 'object') throw new Error('Invalid manifest');
  let csvChanged = false;
  for (const [name, bytes] of files) {
    if (name === 'manifest.json') continue;
    const expected = m.checksums[name];
    if (typeof expected !== 'string' || !/^sha256-[a-f0-9]{64}$/.test(expected)) throw new Error('Missing checksum');
    if ('sha256-' + await hash(bytes) !== expected) {
      if (name === 'lots.csv' || name === 'sales.csv') csvChanged = true;
      else throw new Error('Backup checksum mismatch');
    }
  }
  if (Object.keys(m.checksums).length !== files.size - 1 || Object.keys(m.checksums).some(k => !files.has(k))) throw new Error('Manifest files mismatch');
  const json = parseBackupJson(decode(get('backup.json')));
  const names = evidenceNames(json);
  const counts = { symbols: json.symbols.length, lots: json.lots.length, sales: json.sales.length, evidence: names.length };
  if (Object.entries(counts).some(([k, v]) => m.counts?.[k] !== v)) throw new Error('Backup counts mismatch');
  for (const name of names) get('evidence/' + name);
  if ([...files.keys()].filter(k => k.startsWith('evidence/')).length !== names.length) throw new Error('Unexpected evidence');
  get('lots.csv'); get('sales.csv');
  const base: ImportReview = { json, differences: [], files, exportedAt: m.exported_at };
  if (!csvChanged) return base;
  try {
    const csv = dataFromCsv(json, decode(get('lots.csv')), decode(get('sales.csv')));
    for (const name of evidenceNames(csv)) get('evidence/' + name);
    return { ...base, csv, differences: differences(json, csv) };
  } catch {
    return { ...base, csvError: 'อ่าน CSV ไม่ได้ หรืออ้างถึงรูปที่ไม่มีในไฟล์สำรอง เลือกใช้ JSON ต้นฉบับได้' };
  }
}
