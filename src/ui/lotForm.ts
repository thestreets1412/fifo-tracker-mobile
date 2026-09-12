import Decimal from 'decimal.js';
import { parseInput, InvalidNumberError, DP } from '../core/money';
import { isValidYmd } from './dateInput';
import type { NewLotInput } from '../services/ledger';

export interface LotFormState {
  symbolId: number | null;
  buyDate: string;
  priceUsd: string;
  qty: string;
  fxRateUsdThb: string;
  evidenceFile: string | null;
}

export type LotFormErrors = Partial<
  Record<'symbol' | 'buyDate' | 'priceUsd' | 'qty' | 'fxRateUsdThb', string>
>;

export interface LotFormResult {
  input: NewLotInput | null;
  errors: LotFormErrors;
}

/** Parses one positive decimal field, returning the Decimal or an error message. */
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

export function validateLotForm(state: LotFormState): LotFormResult {
  const errors: LotFormErrors = {};

  if (state.symbolId === null) errors.symbol = 'เลือกหรือเพิ่มสัญลักษณ์ก่อน';
  if (!isValidYmd(state.buyDate)) errors.buyDate = 'วันที่ไม่ถูกต้อง';

  const price = positive(state.priceUsd, DP.price, 'ราคา');
  if (price.error) errors.priceUsd = price.error;
  const qty = positive(state.qty, DP.qty, 'จำนวน');
  if (qty.error) errors.qty = qty.error;
  const fx = positive(state.fxRateUsdThb, DP.fxRate, 'เรตแลกเงิน');
  if (fx.error) errors.fxRateUsdThb = fx.error;

  if (Object.keys(errors).length > 0) return { input: null, errors };

  return {
    errors: {},
    input: {
      symbolId: state.symbolId!,
      buyDate: state.buyDate,
      priceUsd: price.value!,
      qty: qty.value!,
      fxRateUsdThb: fx.value!,
      evidenceFile: state.evidenceFile,
    },
  };
}
