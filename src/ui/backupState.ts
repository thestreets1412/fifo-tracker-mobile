import { InsufficientLotsError } from '../core/fifo';

export const backupFieldLabels: Record<string, string> = {
  record: 'รายการ', ticker: 'หุ้น', buyDate: 'วันที่ซื้อ', sellDate: 'วันที่ขาย',
  qty: 'จำนวนหุ้น', qtySold: 'จำนวนหุ้นขาย', priceUsd: 'ราคาซื้อ (USD)',
  salePriceUsd: 'ราคาขาย (USD)', feeUsd: 'ค่าธรรมเนียม (USD)',
  fxRateUsdThb: 'อัตราแลกเปลี่ยน', createdAt: 'เวลาสร้างรายการ', evidenceFile: 'รูปหลักฐาน',
};
export function backupDifferenceValue(field: string, value: string): string {
  return field === 'record' ? (value === 'present' ? 'มีรายการ' : 'ไม่มีรายการ') : (value || 'ไม่มี');
}

export function backupErrorMessage(error: unknown): string {
  if (error instanceof InsufficientLotsError) return `กู้คืนไม่ได้: รายการขาย #${error.saleId} วันที่ ${error.sellDate} ขาย ${error.requested.toFixed()} หุ้น แต่มีเพียง ${error.available.toFixed()} หุ้น ข้อมูลเดิมยังอยู่`;
  const message = error instanceof Error ? error.message : '';
  if (/Invalid password|authentication/i.test(message)) return 'รหัสผ่านไม่ถูกต้อง หรือไฟล์เข้ารหัสเสียหาย';
  if (/too large|Too many/.test(message)) return 'ข้อมูลสำรองเกินขนาดที่รองรับ (64 MiB หรือ 5,000 ไฟล์)';
  if (/version/.test(message)) return 'ไฟล์สำรองเป็นเวอร์ชันที่แอปนี้ยังไม่รองรับ';
  if (/Ledger changed/.test(message)) return 'ข้อมูลมีการเปลี่ยนแปลง กรุณาตรวจไฟล์และกู้คืนใหม่';
  if (/[ก-๙]/.test(message)) return message;
  return 'ทำรายการไม่สำเร็จ กรุณาตรวจรหัสผ่าน ไฟล์สำรอง และพื้นที่ว่าง แล้วลองใหม่';
}
