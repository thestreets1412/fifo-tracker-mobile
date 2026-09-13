import Decimal from 'decimal.js';
import { buildAllocationSegments } from '../allocation';
import { chartPalette } from '../../theme/tokens';

describe('buildAllocationSegments', () => {
  it('returns nothing for an empty portfolio', () => {
    expect(buildAllocationSegments([])).toEqual([]);
  });

  it('returns nothing when every position has zero cost', () => {
    expect(buildAllocationSegments([{ ticker: 'NVDA', costThb: new Decimal('0') }])).toEqual([]);
  });

  it('gives a single position 100 percent', () => {
    const segments = buildAllocationSegments([{ ticker: 'NVDA', costThb: new Decimal('36000') }]);
    expect(segments).toHaveLength(1);
    expect(segments[0]!.percent).toBe(100);
    expect(segments[0]!.ticker).toBe('NVDA');
    expect(segments[0]!.costThb).toBe('36000.0000');
    expect(segments[0]!.color).toBe(chartPalette[0]);
  });

  it('splits by share of total cost', () => {
    const segments = buildAllocationSegments([
      { ticker: 'NVDA', costThb: new Decimal('30000') },
      { ticker: 'AAPL', costThb: new Decimal('10000') },
    ]);
    expect(segments.map((s) => s.percent)).toEqual([75, 25]);
  });

  it('sorts largest first, breaking ties by ticker so the order is deterministic', () => {
    const segments = buildAllocationSegments([
      { ticker: 'MSFT', costThb: new Decimal('100') },
      { ticker: 'AAPL', costThb: new Decimal('100') },
      { ticker: 'NVDA', costThb: new Decimal('300') },
    ]);
    expect(segments.map((s) => s.ticker)).toEqual(['NVDA', 'AAPL', 'MSFT']);
  });

  it('drops zero and negative-cost positions but keeps the rest whole', () => {
    const segments = buildAllocationSegments([
      { ticker: 'NVDA', costThb: new Decimal('30000') },
      { ticker: 'SOLD', costThb: new Decimal('0') },
      { ticker: 'AAPL', costThb: new Decimal('10000') },
    ]);
    expect(segments.map((s) => s.ticker)).toEqual(['NVDA', 'AAPL']);
    expect(segments.map((s) => s.percent)).toEqual([75, 25]);
  });

  it('cycles the palette past its length rather than running out of colors', () => {
    const rows = Array.from({ length: chartPalette.length + 2 }, (_unused, index) => ({
      ticker: `T${String(index).padStart(2, '0')}`,
      costThb: new Decimal(100 - index),
    }));
    const segments = buildAllocationSegments(rows);
    expect(segments).toHaveLength(chartPalette.length + 2);
    expect(segments[chartPalette.length]!.color).toBe(chartPalette[0]);
  });

  it('keeps the exact cost as a string so nobody does arithmetic on the percentage', () => {
    const segments = buildAllocationSegments([
      { ticker: 'A', costThb: new Decimal('0.1') },
      { ticker: 'B', costThb: new Decimal('0.2') },
    ]);
    expect(segments.map((s) => s.costThb)).toEqual(['0.2000', '0.1000']);
  });
});
