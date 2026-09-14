import './runtime';
import { Directory, File, Paths } from 'expo-file-system';
import * as Crypto from 'expo-crypto';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import Constants from 'expo-constants';
import { useAppStore } from '../store/useAppStore';
import { evidenceDirectory } from '../db/backupRepo';
import { decryptArchive, encryptArchive, MAX_BACKUP_BYTES, type ArchiveFiles } from './zip';
import type { BackupAdapter } from './controller';
import { validateExportSecret } from './secrets';
import { safeEvidenceName } from './paths';

function backupDir(): Directory {
  const d = new Directory(Paths.document, 'backups'); d.create({ idempotent: true }); return d;
}
function cacheDir(): Directory {
  const d = new Directory(Paths.cache, 'fifo-backups'); d.create({ idempotent: true }); return d;
}
function evidenceDir(name: string): Directory {
  if (!/^(evidence|evidence-restore-[a-f0-9-]+)$/.test(name)) throw new Error('Unsafe evidence directory');
  return new Directory(Paths.document, name);
}
function write(file: File, bytes: Uint8Array): void {
  file.create({ overwrite: false });
  try { file.write(bytes); } catch (error) { try { file.delete(); } catch {} throw error; }
}
export async function pickBackup(): Promise<Uint8Array | null> {
  const result = await DocumentPicker.getDocumentAsync({ type: ['application/zip', 'application/x-zip-compressed', 'application/octet-stream'], copyToCacheDirectory: true, multiple: false });
  if (result.canceled) return null;
  const file = new File(result.assets[0]!.uri);
  try {
    if (file.size > MAX_BACKUP_BYTES) throw new Error('ไฟล์สำรองต้องไม่เกิน 64 MiB');
    return await file.bytes();
  } finally {
    // Only delete the picker-owned cache copy, never the user's source document.
    if (file.uri.startsWith(Paths.cache.uri.replace(/\/?$/, '/'))) try { file.delete(); } catch {}
  }
}
export async function shareBackup(uri: string): Promise<void> {
  if (!await Sharing.isAvailableAsync()) throw new Error('เครื่องนี้ไม่รองรับการแชร์ไฟล์');
  await Sharing.shareAsync(uri, { mimeType: 'application/zip', dialogTitle: 'แชร์ข้อมูลสำรอง FIFO' });
}
export function listAutomaticBackups(): { name: string; uri: string }[] {
  return backupDir().list().filter((f): f is File => f instanceof File && /^auto-before-restore-.*\.zip$/.test(f.name))
    .map(f => ({ name: f.name, uri: f.uri })).sort((a, b) => b.name.localeCompare(a.name));
}
export async function readAutomaticBackup(uri: string): Promise<Uint8Array> {
  if (!listAutomaticBackups().some(f => f.uri === uri)) throw new Error('Unknown automatic backup');
  const file = new File(uri);
  if (file.size > MAX_BACKUP_BYTES) throw new Error('Backup too large');
  return file.bytes();
}

export const backupPlatform: BackupAdapter = {
  hash: async bytes => Array.from(new Uint8Array(await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, new Uint8Array(bytes))), n => n.toString(16).padStart(2, '0')).join(''),
  encrypt: encryptArchive, decrypt: decryptArchive, validatePassword: validateExportSecret,
  now: () => new Date().toISOString(), appVersion: Constants.expoConfig?.version ?? '1.0.0',
  async readEvidence(directory, name) {
    if (!safeEvidenceName(name)) throw new Error('Unsafe evidence filename');
    const file = new File(evidenceDir(directory), name);
    if (!file.exists) throw new Error('ไม่พบรูปหลักฐาน จึงยังสำรองข้อมูลให้ครบไม่ได้');
    if (file.size > MAX_BACKUP_BYTES) throw new Error('Backup too large');
    return file.bytes();
  },
  async writeArchive(bytes, automatic) {
    const name = `${automatic ? 'auto-before-restore' : 'fifo-backup'}-${new Date().toISOString().replace(/[:.]/g, '-')}-${Crypto.randomUUID()}.zip`;
    const file = new File(automatic ? backupDir() : cacheDir(), name);
    write(file, bytes);
    try {
      // Read back before allowing a destructive restore to proceed.
      const read = await file.bytes();
      if (await backupPlatform.hash(read) !== await backupPlatform.hash(bytes)) throw new Error('Backup write verification failed');
      return file.uri;
    } catch (error) { try { file.delete(); } catch {} throw error; }
  },
  share: shareBackup,
  async stageEvidence(files: ArchiveFiles, names) {
    const name = 'evidence-restore-' + Crypto.randomUUID(); const dir = evidenceDir(name);
    dir.create();
    try {
      for (const filename of names) {
        if (!safeEvidenceName(filename)) throw new Error('Unsafe evidence filename');
        const bytes = files.get('evidence/' + filename);
        if (!bytes) throw new Error('Missing evidence');
        const file = new File(dir, filename); write(file, bytes);
        if (await backupPlatform.hash(await file.bytes()) !== await backupPlatform.hash(bytes)) throw new Error('Evidence write verification failed');
      }
      return name;
    } catch (error) { try { dir.delete(); } catch {} throw error; }
  },
  async removeStage(name) { const dir = evidenceDir(name); if (dir.exists) dir.delete(); },
  async cleanup() {
    const before = Date.now() - 86400000;
    for (const file of cacheDir().list()) {
      if (file instanceof File && /^fifo-backup-.*\.zip$/.test(file.name) && file.modificationTime !== null && file.modificationTime < before) try { file.delete(); } catch {}
    }
    const db = useAppStore.getState().db;
    if (!db) return;
    const active = evidenceDirectory(db);
    for (const dir of Paths.document.list()) {
      if (dir instanceof Directory && /^(evidence|evidence-restore-[a-f0-9-]+)$/.test(dir.name) && dir.name !== active) try { dir.delete(); } catch {}
    }
  },
};
