import Decimal from 'decimal.js';
import { InsufficientLotsError } from '../../core/fifo';
import type { SymbolRow } from '../../core/types';
import { insufficientLotsMessage } from '../errors';

const symbols: readonly SymbolRow[] = [
  { id: 1, ticker: 'NVDA', name: 'NVIDIA Corp' },
  { id: 2, ticker: 'AAPL', name: 'Apple Inc' },
];

test('insufficientLotsMessage builds the Thai sentence with looked-up ticker and formatted quantities', () => {
  const e = new InsufficientLotsError(42, 1, '2026-01-15', new Decimal('5.00000000'), new Decimal('3.50000000'));
  expect(insufficientLotsMessage(e, symbols)).toBe(
    'ขาย NVDA จำนวน 5 ในวันที่ 2026-01-15 ไม่ได้ — มีอยู่เพียง 3.5 ณ วันนั้น',
  );
});

test('insufficientLotsMessage falls back to an empty ticker when symbolId is unknown', () => {
  const e = new InsufficientLotsError(7, 999, '2026-02-01', new Decimal('10'), new Decimal('0'));
  expect(insufficientLotsMessage(e, symbols)).toBe(
    'ขาย  จำนวน 10 ในวันที่ 2026-02-01 ไม่ได้ — มีอยู่เพียง 0 ณ วันนั้น',
  );
});
