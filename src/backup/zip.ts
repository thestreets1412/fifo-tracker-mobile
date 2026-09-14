import './streams';
import { safeEvidenceName } from './paths';
import { configure, ZipReader, ZipWriter, Uint8ArrayReader, Uint8ArrayWriter } from '@zip.js/zip.js/index-native.js';

// The native entry point contains a JS compression fallback: no WASM, workers or fetch.
configure({ useWebWorkers: false, useCompressionStream: false });
export const MAX_BACKUP_BYTES = 64 * 1024 * 1024;
export const MAX_ENTRIES = 5000;
export type ArchiveFiles = Map<string, Uint8Array>;

function safeEntry(name: string): boolean {
  return ['manifest.json', 'backup.json', 'lots.csv', 'sales.csv'].includes(name)
    || (name.startsWith('evidence/') && safeEvidenceName(name.slice(9)));
}

export async function encryptArchive(files: ArchiveFiles, password: string): Promise<Uint8Array> {
  if (!password || !/^[\x20-\x7e]+$/.test(password)) throw new Error('Invalid archive password');
  if (files.size > MAX_ENTRIES || [...files.values()].reduce((n, b) => n + b.length, 0) > MAX_BACKUP_BYTES) throw new Error('Backup too large');
  const writer = new ZipWriter(new Uint8ArrayWriter(), { password, encryptionStrength: 3, zipCrypto: false, level: 6 });
  for (const [name, bytes] of files) {
    if (!safeEntry(name)) throw new Error('Unsafe archive entry');
    await writer.add(name, new Uint8ArrayReader(bytes));
  }
  const result = await writer.close();
  if (result.length > MAX_BACKUP_BYTES) throw new Error('Backup too large');
  return result;
}

export async function decryptArchive(bytes: Uint8Array, password: string): Promise<ArchiveFiles> {
  if (bytes.length > MAX_BACKUP_BYTES) throw new Error('Backup too large');
  const reader = new ZipReader(new Uint8ArrayReader(bytes));
  const files: ArchiveFiles = new Map();
  let total = 0;
  try {
    let count = 0;
    for await (const entry of reader.getEntriesGenerator()) {
      if (++count > MAX_ENTRIES) throw new Error('Too many archive entries');
      if (entry.directory && entry.filename === 'evidence/') continue;
      if (entry.directory || entry.symlink || !safeEntry(entry.filename) || files.has(entry.filename)) throw new Error('Unsafe archive entry');
      if (!entry.encrypted || entry.zipCrypto || entry.extraFieldAES?.strength !== 3) throw new Error('AES-256 required');
      if (entry.uncompressedSize > MAX_BACKUP_BYTES - total) throw new Error('Backup too large');
      const chunks: Uint8Array[] = [];
      let size = 0;
      await entry.getData(new WritableStream<Uint8Array>({
        write(chunk) {
          size += chunk.length;
          total += chunk.length;
          if (total > MAX_BACKUP_BYTES) throw new Error('Backup too large');
          chunks.push(chunk.slice());
        },
      }), { password, checkSignature: true });
      if (size !== entry.uncompressedSize) throw new Error('Invalid entry size');
      const data = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) { data.set(chunk, offset); offset += chunk.length; }
      files.set(entry.filename, data);
    }
    return files;
  } finally { await reader.close(); }
}
