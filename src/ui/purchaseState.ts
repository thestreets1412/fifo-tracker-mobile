export function purchaseMessage(result: 'purchased' | 'cancelled' | 'unavailable' | 'failed' | 'restored' | 'none'): string {
  switch (result) {
    case 'purchased': return 'ปลดล็อก PDF แล้ว';
    case 'restored': return 'กู้คืนสิทธิ์ PDF แล้ว';
    case 'cancelled': return 'ยกเลิกการซื้อแล้ว';
    case 'none': return 'ไม่พบสิทธิ์ PDF สำหรับบัญชี Google นี้';
    case 'unavailable': return 'ยังไม่พบผลิตภัณฑ์ PDF กรุณาลองใหม่ภายหลัง';
    default: return 'ทำรายการไม่สำเร็จ กรุณาลองใหม่';
  }
}
