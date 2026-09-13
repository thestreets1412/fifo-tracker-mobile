// Exercise the actual adapter's ownership/cancellation rules with an in-memory
// filesystem. Native dialogs/rendering themselves still require an Android pass.
jest.mock('expo-file-system', () => {
  const files = new Map<string, { bytes: Uint8Array; modificationTime: number }>();
  class File {
    uri: string;
    constructor(...parts: (string | { uri: string })[]) {
      this.uri = parts.map((p) => typeof p === 'string' ? p : p.uri).join('/');
    }
    get name() { return this.uri.split('/').pop(); }
    get exists() { return files.has(this.uri); }
    get modificationTime() { return files.get(this.uri)?.modificationTime ?? null; }
    create() {
      if (this.exists) throw new Error('exists');
      files.set(this.uri, { bytes: new Uint8Array(), modificationTime: Date.now() });
    }
    write(content: string | Uint8Array) {
      const bytes = typeof content === 'string' ? new Uint8Array(Buffer.from(content)) : content;
      files.set(this.uri, { bytes, modificationTime: Date.now() });
    }
    async bytes() {
      if (!this.exists) throw new Error('missing');
      return files.get(this.uri)!.bytes;
    }
    delete() { files.delete(this.uri); }
  }
  class Directory {
    uri: string;
    constructor(...parts: (string | { uri: string })[]) {
      this.uri = parts.map((p) => typeof p === 'string' ? p : p.uri).join('/');
    }
    create() {}
    list() {
      return [...files.keys()].filter((key) => key.startsWith(this.uri + '/')).map((key) => new File(key));
    }
    createFile(name: string) { const file = new File(this, name); file.create(); return file; }
    static async pickDirectoryAsync() { return new Directory('content://picked'); }
  }
  return { File, Directory, Paths: { cache: { uri: 'file:///cache' } } };
});
jest.mock('expo-print', () => ({ printToFileAsync: jest.fn(async () => ({ uri: 'file:///printed.pdf' })) }));
jest.mock('expo-sharing', () => ({ isAvailableAsync: jest.fn(async () => true), shareAsync: jest.fn(async () => {}) }));

import { Directory, File, Paths } from 'expo-file-system';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { reportPlatform } from '../platform';

beforeEach(() => {
  jest.restoreAllMocks();
  jest.clearAllMocks();
  for (const dir of [new Directory(Paths.cache), new Directory('content://picked')]) {
    for (const file of dir.list()) file.delete();
  }
});

test('requests integer A4 output from the native printer', async () => {
  await expect(reportPlatform.print('<html></html>')).resolves.toBe('file:///printed.pdf');
  expect(Print.printToFileAsync).toHaveBeenCalledWith({ html: '<html></html>', width: 595, height: 842, textZoom: 100 });
});

test('cancelled directory picker returns null; other picker errors propagate', async () => {
  const picker = jest.spyOn(Directory, 'pickDirectoryAsync');
  picker.mockRejectedValueOnce(Object.assign(new Error('cancelled'), { code: 'ERR_PICKER_CANCELLED' }));
  await expect(reportPlatform.save('file:///missing', 'report.pdf', 'application/pdf')).resolves.toBeNull();
  picker.mockRejectedValueOnce(new Error('permission failed'));
  await expect(reportPlatform.save('file:///missing', 'report.pdf', 'application/pdf')).rejects.toThrow('permission failed');
});

test('writes selected destination and refuses to overwrite it', async () => {
  const source = await reportPlatform.writeCache('fifo-report-test.pdf', new Uint8Array([1, 2, 3]));
  const uri = await reportPlatform.save(source, 'report.pdf', 'application/pdf');
  expect(await new File(uri!).bytes()).toEqual(new Uint8Array([1, 2, 3]));
  await expect(reportPlatform.save(source, 'report.pdf', 'application/pdf')).rejects.toThrow('already exists');
  expect(await new File(uri!).bytes()).toEqual(new Uint8Array([1, 2, 3]));
});

test('failed destination write deletes only the file created by that operation', async () => {
  const source = await reportPlatform.writeCache('fifo-report-source.pdf', new Uint8Array([1]));
  const existing = new File('content://picked/keep.pdf'); existing.create(); existing.write('keep');
  jest.spyOn(File.prototype, 'write').mockImplementationOnce(() => { throw new Error('disk full'); });
  await expect(reportPlatform.save(source, 'new.pdf', 'application/pdf')).rejects.toThrow('disk full');
  expect(new File('content://picked/new.pdf').exists).toBe(false);
  expect(existing.exists).toBe(true);
  expect(new File(source).exists).toBe(true);
});

test('failed cache write cleans its file but a name collision preserves existing file', async () => {
  jest.spyOn(File.prototype, 'write').mockImplementationOnce(() => { throw new Error('disk full'); });
  await expect(reportPlatform.writeCache('fifo-report-failed.csv', 'data')).rejects.toThrow('disk full');
  expect(new File(Paths.cache, 'fifo-reports', 'fifo-report-failed.csv').exists).toBe(false);
  const uri = await reportPlatform.writeCache('fifo-report-existing.csv', 'original');
  await expect(reportPlatform.writeCache('fifo-report-existing.csv', 'replacement')).rejects.toThrow('exists');
  expect(Buffer.from(await new File(uri).bytes()).toString()).toBe('original');
});

test('sweeps only expired generated reports, never evidence or other cache files', async () => {
  const now = Date.now();
  jest.spyOn(Date, 'now').mockReturnValue(now - 10000);
  const expired = await reportPlatform.writeCache('fifo-report-old.pdf', 'old');
  const unrelated = await reportPlatform.writeCache('keep.pdf', 'keep');
  const evidence = new File(Paths.cache, 'evidence', 'fifo-report-old.pdf'); evidence.create();
  jest.spyOn(Date, 'now').mockReturnValue(now);
  const fresh = await reportPlatform.writeCache('fifo-report-new.pdf', 'new');
  await reportPlatform.sweepCache(now - 1000);
  expect(new File(expired).exists).toBe(false);
  expect(new File(unrelated).exists).toBe(true);
  expect(new File(fresh).exists).toBe(true);
  expect(evidence.exists).toBe(true);
});

test('share checks availability and hands the local file to the OS', async () => {
  jest.spyOn(Sharing, 'isAvailableAsync').mockResolvedValueOnce(false);
  await expect(reportPlatform.share('file:///cache/report.csv', 'text/csv')).rejects.toThrow('REPORT_SHARING_UNAVAILABLE');
  expect(Sharing.shareAsync).not.toHaveBeenCalled();
  await reportPlatform.share('file:///cache/report.csv', 'text/csv');
  expect(Sharing.shareAsync).toHaveBeenCalledWith('file:///cache/report.csv', { mimeType: 'text/csv', dialogTitle: 'แชร์รายงาน FIFO' });
});
