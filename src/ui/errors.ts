import type { InsufficientLotsError } from '../core/fifo';
import type { SymbolRow } from '../core/types';
import { formatQty } from './format';

/**
 * Builds the Thai message explaining why a sale could not draw enough
 * quantity from the lots held on its sell date. Pure string construction —
 * screens decide how to present it (Alert.alert, inline text, etc.), and
 * this stays a plain function so it is testable under plain Node.
 */
export function insufficientLotsMessage(e: InsufficientLotsError, symbols: readonly SymbolRow[]): string {
  const ticker = symbols.find((s) => s.id === e.symbolId)?.ticker ?? '';
  return `ขาย ${ticker} จำนวน ${formatQty(e.requested)} ในวันที่ ${e.sellDate} ไม่ได้ — มีอยู่เพียง ${formatQty(e.available)} ณ วันนั้น`;
}
