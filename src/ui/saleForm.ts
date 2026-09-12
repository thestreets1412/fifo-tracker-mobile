import Decimal from 'decimal.js';
import { parseInput, InvalidNumberError, DP } from '../core/money';
import { isValidYmd } from './dateInput';
import type { NewSaleInput } from '../services/ledger';

export interface SaleFormState {
  symbolId: number | null;
  sellDate: string;
  qtySold: string;
  salePriceUsd: string;
  feeUsd: string;
  fxRateUsdThb: string;
  evidenceFile: string | null;
}

export type SaleFormErrors = Partial<
  Record<'symbol' | 'sellDate' | 'qtySold' | 'salePriceUsd' | 'feeUsd' | 'fxRateUsdThb', string>
>;

export interface SaleFormResult {
  input: NewSaleInput | null;
  errors: SaleFormErrors;
}

function positive(text: string, dp: number, label: string): { value?: Decimal; error?: string } {
  let value: Decimal;
  try {
    value = parseInput(text, dp);
  } catch (e) {
    if (e instanceof InvalidNumberError) return { error: `${label}ไม่ถูกต้อง` };
    throw e;
  }
  if (value.lessThanOrEqualTo(0)) return { error: `${label}ต้องมากกว่า 0` };
  return { value };
}

/** Fee: empty means 0; otherwise a non-negative decimal. */
function fee(text: string): { value?: Decimal; error?: string } {
  if (text.trim() === '') return { value: new Decimal(0) };
  let value: Decimal;
  try {
    value = parseInput(text, DP.money);
  } catch (e) {
    if (e instanceof InvalidNumberError) return { error: 'ค่าธรรมเนียมไม่ถูกต้อง' };
    throw e;
  }
  if (value.lessThan(0)) return { error: 'ค่าธรรมเนียมต้องไม่ติดลบ' };
  return { value };
}

export function validateSaleForm(state: SaleFormState): SaleFormResult {
  const errors: SaleFormErrors = {};

  if (state.symbolId === null) errors.symbol = 'เลือกหรือเพิ่มสัญลักษณ์ก่อน';
  if (!isValidYmd(state.sellDate)) errors.sellDate = 'วันที่ไม่ถูกต้อง';

  const qty = positive(state.qtySold, DP.qty, 'จำนวน');
  if (qty.error) errors.qtySold = qty.error;
  const price = positive(state.salePriceUsd, DP.price, 'ราคาขาย');
  if (price.error) errors.salePriceUsd = price.error;
  const fx = positive(state.fxRateUsdThb, DP.fxRate, 'เรตแลกเงิน');
  if (fx.error) errors.fxRateUsdThb = fx.error;
  const f = fee(state.feeUsd);
  if (f.error) errors.feeUsd = f.error;

  if (Object.keys(errors).length > 0) return { input: null, errors };

  return {
    errors: {},
    input: {
      symbolId: state.symbolId!,
      sellDate: state.sellDate,
      qtySold: qty.value!,
      salePriceUsd: price.value!,
      feeUsd: f.value!,
      fxRateUsdThb: fx.value!,
      evidenceFile: state.evidenceFile,
    },
  };
}
