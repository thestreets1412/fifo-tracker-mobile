/** A preview is valid only for the selection and database version it was built from. */
export function reportSnapshotKey(dataVersion: number, symbolId?: number): string {
  return `${dataVersion}:${symbolId ?? 'all'}`;
}

export function allowReportNavigation(url: string): boolean {
  return url === 'about:blank' || url.startsWith('about:blank#');
}

export function reportErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message === 'REPORT_SHARING_UNAVAILABLE') {
    return 'อุปกรณ์นี้ยังแชร์ไฟล์ไม่ได้ กรุณาใช้ปุ่มบันทึกแทน';
  }
  return 'สร้างหรือส่งออกรายงานไม่สำเร็จ กรุณาตรวจสอบพื้นที่จัดเก็บและลองใหม่';
}
