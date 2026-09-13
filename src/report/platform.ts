import { Directory, File, Paths } from 'expo-file-system';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import type { ReportExportDeps } from './export';
import { A4, stampPdfFooter } from './pdf';

function cacheDirectory(): Directory {
  const directory = new Directory(Paths.cache, 'fifo-reports');
  directory.create({ idempotent: true, intermediates: true });
  return directory;
}

function removeFile(file: File): void {
  if (file.exists) file.delete();
}

export const reportPlatform: ReportExportDeps = {
  now: () => new Date(),
  async sweepCache(before) {
    for (const entry of cacheDirectory().list()) {
      if (entry instanceof File && /^fifo-report-.*\.(pdf|csv)$/.test(entry.name)
        && entry.modificationTime !== null && entry.modificationTime < before) {
        removeFile(entry);
      }
    }
  },
  async print(html) {
    const result = await Print.printToFileAsync({ html, ...A4, textZoom: 100 });
    return result.uri;
  },
  readBytes: (uri) => new File(uri).bytes(),
  stamp: stampPdfFooter,
  async writeCache(name, content) {
    const file = new File(cacheDirectory(), name);
    file.create({ overwrite: false });
    try {
      file.write(content);
      return file.uri;
    } catch (error) {
      try { removeFile(file); } catch { /* preserve write failure */ }
      throw error;
    }
  },
  async remove(uri) { removeFile(new File(uri)); },
  async save(uri, name, mime) {
    let directory: Directory;
    try {
      directory = await Directory.pickDirectoryAsync();
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ERR_PICKER_CANCELLED') return null;
      throw error;
    }
    // Read before creating the destination so a failed read cannot leave an empty file.
    const bytes = await new File(uri).bytes();
    if (directory.list().some((entry) => entry.name === name)) throw new Error('Report destination already exists');
    const destination = directory.createFile(name, mime);
    try {
      destination.write(bytes);
      return destination.uri;
    } catch (error) {
      try { removeFile(destination); } catch { /* preserve write failure */ }
      throw error;
    }
  },
  async share(uri, mimeType) {
    if (!await Sharing.isAvailableAsync()) throw new Error('REPORT_SHARING_UNAVAILABLE');
    await Sharing.shareAsync(uri, { mimeType, dialogTitle: 'แชร์รายงาน FIFO' });
  },
};
