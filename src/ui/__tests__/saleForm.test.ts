import Decimal from 'decimal.js';
import { validateSaleForm, type SaleFormState } from '../saleForm';

const base: SaleFormState = {
  symbolId: 1, sellDate: '2026-04-01', qtySold: '5', salePriceUsd: '150', feeUsd: '', fxRateUsdThb: '36.5', evidenceFile: null,
};

test('valid form with empty fee defaults fee to 0', () => {
  const { input, errors } = validateSaleForm(base);
  expect(errors).toEqual({});
  expect(input).not.toBeNull();
  expect(input!.feeUsd).toBeInstanceOf(Decimal);
  expect(input!.feeUsd.toString()).toBe('0');
  expect(input!.qtySold.toString()).toBe('5');
});

test('explicit fee is parsed', () => {
  const { input } = validateSaleForm({ ...base, feeUsd: '1.25' });
  expect(input!.feeUsd.toString()).toBe('1.25');
});

test('negative fee is rejected; zero fee is allowed', () => {
  expect(validateSaleForm({ ...base, feeUsd: '-1' }).errors.feeUsd).toBeDefined();
  expect(validateSaleForm({ ...base, feeUsd: '0' }).errors.feeUsd).toBeUndefined();
});

test('missing symbol, bad date, non-positive qty/price/fx are errors', () => {
  expect(validateSaleForm({ ...base, symbolId: null }).errors.symbol).toBeDefined();
  expect(validateSaleForm({ ...base, sellDate: '2026-02-31' }).errors.sellDate).toBeDefined();
  expect(validateSaleForm({ ...base, qtySold: '0' }).errors.qtySold).toBeDefined();
  expect(validateSaleForm({ ...base, salePriceUsd: '0' }).errors.salePriceUsd).toBeDefined();
  expect(validateSaleForm({ ...base, fxRateUsdThb: '0' }).errors.fxRateUsdThb).toBeDefined();
});

test('comma/exponent and over-precision are rejected', () => {
  expect(validateSaleForm({ ...base, qtySold: '1,000' }).errors.qtySold).toBeDefined();
  expect(validateSaleForm({ ...base, salePriceUsd: '1.1234567' }).errors.salePriceUsd).toBeDefined(); // price 6 dp
});
