import { randomFillSync } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { password, encode } from './fixtures';

// Match the React Native JS-crypto path, not Node's crypto.subtle implementation.
Object.defineProperty(globalThis, 'crypto', { value: { getRandomValues: randomFillSync }, configurable: true });
const { encryptArchive, decryptArchive } = require('../zip') as typeof import('../zip');
const { ZipWriter, Uint8ArrayReader, Uint8ArrayWriter } = require('@zip.js/zip.js/index-native.js') as typeof import('@zip.js/zip.js/index-native.js');
const base = path.resolve('.local-tools'); mkdirSync(base, { recursive: true });
const temp = mkdtempSync(path.join(base, 'zip-test-'));
afterAll(() => { if (temp.startsWith(base + path.sep)) rmSync(temp, { recursive: true, force: true }); });
test('AES256 archive round-trip and wrong password rejection', async () => {
  const files = new Map([['backup.json', encode('ไทย 0.10000000')], ['evidence/receipt.jpg', new Uint8Array([0, 1, 255])]]);
  const bytes = await encryptArchive(files, password);
  expect(await decryptArchive(bytes, password)).toEqual(files);
  await expect(decryptArchive(bytes, 'wrong')).rejects.toThrow();
});
test('bidirectional interoperability with 7-Zip using real AES256 archives', async () => {
  const bin = require('7zip-bin').path7za;
  const source = encode('FIFO ไทย 142.350000');
  const bytes = await encryptArchive(new Map([['backup.json', source]]), password);
  writeFileSync(path.join(temp, 'app.zip'), bytes);
  execFileSync(bin, ['x', path.join(temp, 'app.zip'), '-p' + password, '-y', '-o' + path.join(temp, 'out')], { stdio: 'pipe' });
  expect(readFileSync(path.join(temp, 'out/backup.json'))).toEqual(Buffer.from(source));
  execFileSync(bin, ['a', '-tzip', '-mem=AES256', '-p' + password, path.join(temp, '7zip.zip'), 'backup.json'], { cwd: path.join(temp, 'out'), stdio: 'pipe' });
  const result = await decryptArchive(readFileSync(path.join(temp, '7zip.zip')), password);
  expect(result.get('backup.json')).toEqual(source);
});
test.each([{ password: undefined }, { password, zipCrypto: true }, { password, encryptionStrength: 1 as const }])('unencrypted and weak encryption fail closed', async options => {
  const writer = new ZipWriter(new Uint8ArrayWriter(), options);
  await writer.add('backup.json', new Uint8ArrayReader(encode('data')));
  await expect(decryptArchive(await writer.close(), password)).rejects.toThrow('AES-256');
});
test('unexpected paths and symlinks are rejected without extraction', async () => {
  for (const [name, mode] of [['../backup.json', 0o100644], ['evidence/receipt.jpg', 0o120777]] as const) {
    const writer = new ZipWriter(new Uint8ArrayWriter(), { password, encryptionStrength: 3 });
    await writer.add(name, new Uint8ArrayReader(encode('data')), { unixMode: mode });
    await expect(decryptArchive(await writer.close(), password)).rejects.toThrow('Unsafe');
  }
});
test('truncated archive and tampered encrypted bytes fail', async () => {
  const bytes = await encryptArchive(new Map([['backup.json', encode('secret data')]]), password);
  await expect(decryptArchive(bytes.slice(0, bytes.length - 20), password)).rejects.toThrow();
  const corrupt = bytes.slice();
  const view = new DataView(corrupt.buffer); const offset = 30 + view.getUint16(26, true) + view.getUint16(28, true);
  corrupt[offset + 20] = corrupt[offset + 20]! ^ 255;
  await expect(decryptArchive(corrupt, password)).rejects.toThrow();
});
test('oversized declared decompression is rejected before allocating output', async () => {
  const bytes = await encryptArchive(new Map([['backup.json', encode('small')]]), password);
  const corrupt = Buffer.from(bytes);
  const central = corrupt.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
  corrupt.writeUInt32LE(64 * 1024 * 1024 + 1, central + 24);
  await expect(decryptArchive(corrupt, password)).rejects.toThrow('too large');
});
