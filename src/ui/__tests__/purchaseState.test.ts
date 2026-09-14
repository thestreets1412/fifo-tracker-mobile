import { purchaseMessage } from '../purchaseState';

test('purchase feedback is Thai and never exposes provider errors', () => {
  expect(purchaseMessage('purchased')).toContain('PDF');
  expect(purchaseMessage('cancelled')).toContain('ยกเลิก');
  expect(purchaseMessage('failed')).not.toContain('RevenueCat');
});
