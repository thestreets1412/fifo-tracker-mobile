import Decimal from 'decimal.js';
import { DP } from '../core/money';
import { chartPalette } from '../theme/tokens';

/**
 * The allocation chart of spec §7.1, reduced to data.
 *
 * `percent` is the one JavaScript `number` this plan permits (CLAUDE.md:
 * "number is allowed only for chart rendering") — it exists solely to drive
 * a flexbox width. `costThb` travels alongside it as an exact decimal
 * string so no consumer is ever tempted to recover a money value from the
 * percentage.
 */
export interface AllocationSegment {
  ticker: string;
  /** Exact cost, 4 dp decimal string. The authoritative figure. */
  costThb: string;
  /** Share of total cost, 0-100, 2 dp. Layout only — never money. */
  percent: number;
  color: string;
}

export function buildAllocationSegments(
  rows: ReadonlyArray<{ ticker: string; costThb: Decimal }>,
): AllocationSegment[] {
  const held = rows.filter((row) => row.costThb.greaterThan(0));
  if (held.length === 0) return [];

  const total = held.reduce((sum, row) => sum.plus(row.costThb), new Decimal(0));
  if (total.lessThanOrEqualTo(0)) return [];

  // Largest slice first; ticker breaks ties so two equal positions never
  // swap places between renders.
  const ordered = [...held].sort((a, b) => {
    const byCost = b.costThb.comparedTo(a.costThb);
    return byCost !== 0 ? byCost : a.ticker.localeCompare(b.ticker);
  });

  return ordered.map((row, index) => ({
    ticker: row.ticker,
    costThb: row.costThb.toFixed(DP.money, Decimal.ROUND_HALF_EVEN),
    percent: row.costThb.dividedBy(total).times(100).toDecimalPlaces(2, Decimal.ROUND_HALF_EVEN).toNumber(),
    color: chartPalette[index % chartPalette.length]!,
  }));
}
