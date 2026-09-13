import { PDFDocument, PDFRawStream, decodePDFRawStream, StandardFonts } from 'pdf-lib';
import { A4, stampPdfFooter } from '../pdf';
import { generatedAt } from './fixture';

test('stamps every physical page, preserves original content and opens again', async () => {
  const original = await PDFDocument.create();
  const font = await original.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < 3; i++) original.addPage([A4.width, A4.height]).drawText(`Original ${i}`, { font });
  const result = await stampPdfFooter(await original.save(), generatedAt);
  const reloaded = await PDFDocument.load(result);
  expect(reloaded.getPageCount()).toBe(3);
  expect(reloaded.getPages().every((p) => p.getWidth() === A4.width)).toBe(true);
  // Inspect real decoded content streams, not mocked drawText calls.
  const content = reloaded.context.enumerateIndirectObjects()
    .filter((entry): entry is [typeof entry[0], PDFRawStream] => entry[1] instanceof PDFRawStream)
    .map(([, stream]) => Buffer.from(decodePDFRawStream(stream).decode()).toString('latin1')).join('\n');
  for (let i = 1; i <= 3; i++) expect(content).toContain(Buffer.from(`Page ${i} of 3`).toString('hex').toUpperCase());
  expect(content).toContain(Buffer.from('Original 0').toString('hex').toUpperCase());
  expect(content.match(new RegExp(Buffer.from('Generated 2026-09-13 04:12 UTC').toString('hex').toUpperCase(), 'g'))).toHaveLength(3);
});

test('rejects invalid PDF bytes instead of exporting an incomplete file', async () => {
  await expect(stampPdfFooter(new Uint8Array([1, 2]), generatedAt)).rejects.toThrow();
});
