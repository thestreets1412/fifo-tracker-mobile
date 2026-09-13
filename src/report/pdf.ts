import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { generatedLabel } from './format';

// Android expo-print declares these as Int (72 dpi); CSS also specifies A4.
export const A4 = { width: 595, height: 842 } as const;

/** Actual physical pages, including overflow pages, get a footer after printing. */
export async function stampPdfFooter(bytes: Uint8Array, generatedAt: string): Promise<Uint8Array> {
  const pdf = await PDFDocument.load(bytes, { updateMetadata: false });
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const pages = pdf.getPages();
  const inset = 18 * 72 / 25.4;
  const y = 10 * 72 / 25.4;
  for (const [index, page] of pages.entries()) {
    const label = `Page ${index + 1} of ${pages.length}`;
    const style = { font, size: 8, color: rgb(0.3, 0.3, 0.3), y };
    page.drawText(`Generated ${generatedLabel(generatedAt)}`, { ...style, x: inset });
    page.drawText(label, { ...style, x: page.getWidth() - inset - font.widthOfTextAtSize(label, 8) });
  }
  pdf.setTitle('FIFO Portfolio Report');
  pdf.setCreationDate(new Date(generatedAt));
  pdf.setModificationDate(new Date(generatedAt));
  return pdf.save();
}
