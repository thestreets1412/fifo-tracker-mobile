import { buildArchiveFiles, inspectArchive } from '../archive';
import { data, hash, encode, decode } from './fixtures';
const build = () => buildArchiveFiles(data, async () => encode('image'), hash, '2026-09-13T00:00:00Z', '1.0.0');
test('checksums include evidence; no allocations, caches or secrets', async () => {
  const files = await build(); const review = await inspectArchive(files, hash);
  expect(review.json).toEqual(data); expect(review.differences).toEqual([]); expect(review.csv).toBeUndefined();
  expect([...files.keys()].sort()).toEqual(['backup.json', 'evidence/receipt.jpg', 'lots.csv', 'manifest.json', 'sales.csv']);
  expect(decode(files.get('backup.json')!)).not.toMatch(/allocations|quotes|password|PIN/);
});
test('edited CSV cosmetic changes are silent, actual changes yield review', async () => {
  const files = await build(); const original = decode(files.get('lots.csv')!);
  files.set('lots.csv', encode(original.replace('10.00000000', '10')));
  expect((await inspectArchive(files, hash)).differences).toEqual([]);
  files.set('lots.csv', encode(original.replace('10.00000000', '9')));
  expect((await inspectArchive(files, hash)).differences[0]?.field).toBe('qty');
});
test('malformed CSV offers explicit JSON fallback', async () => {
  const files = await build(); files.set('sales.csv', encode('"broken'));
  const review = await inspectArchive(files, hash); expect(review.csvError).toBeTruthy(); expect(review.json).toEqual(data); expect(review.csv).toBeUndefined();
});
test.each(['backup.json', 'evidence/receipt.jpg'])('corrupt %s fails closed', async name => {
  const files = await build(); files.set(name, encode('bad'));
  await expect(inspectArchive(files, hash)).rejects.toThrow('checksum');
});
test('missing evidence and future schema fail; schema 1 remains readable', async () => {
  const files = await build(); const manifest = JSON.parse(decode(files.get('manifest.json')!));
  manifest.schema_version = 999; files.set('manifest.json', encode(JSON.stringify(manifest)));
  await expect(inspectArchive(files, hash)).rejects.toThrow('version');
  manifest.schema_version = 1; files.set('manifest.json', encode(JSON.stringify(manifest)));
  expect((await inspectArchive(files, hash)).json).toEqual(data);
  files.delete('evidence/receipt.jpg'); await expect(inspectArchive(files, hash)).rejects.toThrow();
});
