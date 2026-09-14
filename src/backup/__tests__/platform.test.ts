jest.mock('../runtime', () => ({}));
jest.mock('../zip', () => ({ MAX_BACKUP_BYTES: 64 * 1024 * 1024, encryptArchive: jest.fn(), decryptArchive: jest.fn() }));
jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { version: '1.0.0' } } }));
jest.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: { SHA256: 'SHA256' },
  digest: async (_: string, b: Uint8Array) => require('node:crypto').createHash('sha256').update(b).digest(),
  randomUUID: () => 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
}));
jest.mock('expo-secure-store', () => ({ getItemAsync: jest.fn(), setItemAsync: jest.fn() }));
jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }));
jest.mock('expo-sharing', () => ({ isAvailableAsync: jest.fn(), shareAsync: jest.fn() }));
jest.mock('expo-file-system', () => {
  const entries = new Map<string, Uint8Array | null>();
  const faults = { write: false, read: false };
  class Directory {
    uri: string;
    constructor(...parts: (string | Directory)[]) { this.uri = parts.map(p => typeof p === 'string' ? p : p.uri).join('/').replace(/\/+$/, ''); }
    get name() { return this.uri.split('/').at(-1)!; }
    get exists() { return entries.has(this.uri); }
    create() { entries.set(this.uri, null); }
    delete() { for (const uri of entries.keys()) if (uri === this.uri || uri.startsWith(this.uri + '/')) entries.delete(uri); }
    list() { return [...entries.keys()].filter(u => u.startsWith(this.uri + '/') && !u.slice(this.uri.length + 1).includes('/')).map(u => entries.get(u) === null ? new Directory(u) : new File(u)); }
  }
  class File {
    uri: string;
    constructor(...parts: (string | Directory)[]) { this.uri = parts.map(p => typeof p === 'string' ? p : p.uri).join('/'); }
    get name() { return this.uri.split('/').at(-1)!; }
    get exists() { return entries.has(this.uri); }
    get size() { return entries.get(this.uri)?.length ?? 0; }
    get modificationTime() { return Date.now(); }
    create() { if (this.exists) throw new Error('exists'); entries.set(this.uri, new Uint8Array()); }
    write(bytes: Uint8Array) { entries.set(this.uri, bytes.slice(0, 1)); if (faults.write) throw new Error('write failed'); entries.set(this.uri, bytes); }
    async bytes() { if (faults.read) throw new Error('read failed'); return entries.get(this.uri); }
    delete() { entries.delete(this.uri); }
  }
  return { Directory, File, Paths: { cache: new Directory('file:///cache/'), document: new Directory('file:///documents/') }, entries, faults };
});
import { getDocumentAsync } from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import { backupPlatform, pickBackup, shareBackup, listAutomaticBackups } from '../platform';
const fs = jest.requireMock('expo-file-system') as { entries: Map<string, Uint8Array | null>; faults: { write: boolean; read: boolean } };
beforeEach(() => { fs.entries.clear(); fs.faults.write = false; fs.faults.read = false; jest.clearAllMocks(); });
test('picker cancellation returns null without reading or deleting files', async () => {
  (getDocumentAsync as jest.Mock).mockResolvedValue({ canceled: true });
  expect(await pickBackup()).toBeNull(); expect(fs.entries.size).toBe(0);
});
test('picker deletes its cache copy but preserves source content URI', async () => {
  for (const uri of ['file:///cache/picked.zip', 'content://source/archive.zip']) {
    fs.entries.set(uri, new Uint8Array([1, 2]));
    (getDocumentAsync as jest.Mock).mockResolvedValue({ canceled: false, assets: [{ uri }] });
    expect(await pickBackup()).toEqual(new Uint8Array([1, 2]));
    expect(fs.entries.has(uri)).toBe(uri.startsWith('content:'));
  }
});
test.each(['write', 'read'] as const)('automatic archive %s failure removes partial output', async fault => {
  fs.faults[fault] = true;
  await expect(backupPlatform.writeArchive(new Uint8Array([1, 2]), true)).rejects.toThrow();
  expect(listAutomaticBackups()).toEqual([]);
});
test('evidence staging failure deletes only new generation; original bytes remain', async () => {
  fs.entries.set('file:///documents/evidence/receipt.jpg', new Uint8Array([9]));
  fs.faults.write = true;
  await expect(backupPlatform.stageEvidence(new Map([['evidence/receipt.jpg', new Uint8Array([1, 2])]]), ['receipt.jpg'])).rejects.toThrow();
  expect([...fs.entries.keys()]).toEqual(['file:///documents/evidence/receipt.jpg']);
});
test('share availability and share failure are not reported as success', async () => {
  (Sharing.isAvailableAsync as jest.Mock).mockResolvedValue(false);
  await expect(shareBackup('file:///backup.zip')).rejects.toThrow(); expect(Sharing.shareAsync).not.toHaveBeenCalled();
  (Sharing.isAvailableAsync as jest.Mock).mockResolvedValue(true); (Sharing.shareAsync as jest.Mock).mockRejectedValue(new Error('share failed'));
  await expect(shareBackup('file:///backup.zip')).rejects.toThrow('share failed');
});
