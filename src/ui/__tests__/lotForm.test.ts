import Decimal from 'decimal.js';
import { validateLotForm, type LotFormState } from '../lotForm';

const base: LotFormState = {
  symbolId: 1, buyDate: '2026-03-14', priceUsd: '142.35', qty: '10', fxRateUsdThb: '36.21', evidenceFile: null,
};

test('a complete valid form yields a NewLotInput with Decimal fields', () => {
  const { input, errors } = validateLotForm(base);
  expect(errors).toEqual({});
  expect(input).not.toBeNull();
  expect(input!.symbolId).toBe(1);
  expect(input!.priceUsd).toBeInstanceOf(Decimal);
  expect(input!.priceUsd.toString()).toBe('142.35');
  expect(input!.qty.toString()).toBe('10');
  expect(input!.evidenceFile).toBeNull();
});

test('missing symbol is an error', () => {
  const { input, errors } = validateLotForm({ ...base, symbolId: null });
  expect(input).toBeNull();
  expect(errors.symbol).toBeDefined();
});

test('bad date is an error', () => {
  const { errors } = validateLotForm({ ...base, buyDate: '2026-02-31' });
  expect(errors.buyDate).toBeDefined();
});

test('a comma-grouped or exponential number is rejected', () => {
  expect(validateLotForm({ ...base, qty: '1,000' }).errors.qty).toBeDefined();
  expect(validateLotForm({ ...base, priceUsd: '1e3' }).errors.priceUsd).toBeDefined();
});

test('more decimal places than the field allows is rejected', () => {
  // price is 6 dp
  expect(validateLotForm({ ...base, priceUsd: '1.1234567' }).errors.priceUsd).toBeDefined();
  // qty is 8 dp
  expect(validateLotForm({ ...base, qty: '1.123456789' }).errors.qty).toBeDefined();
});

test('non-positive price, qty, or fx is rejected', () => {
  expect(validateLotForm({ ...base, qty: '0' }).errors.qty).toBeDefined();
  expect(validateLotForm({ ...base, priceUsd: '0' }).errors.priceUsd).toBeDefined();
  expect(validateLotForm({ ...base, fxRateUsdThb: '0' }).errors.fxRateUsdThb).toBeDefined();
});
