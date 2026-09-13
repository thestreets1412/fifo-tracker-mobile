import type { FifoReport } from './types';
import { fixed, status, generatedLabel } from './format';

export const CSV_HEADERS = ['Ticker', 'Record Type', 'Date', 'Description', 'Price (USD)', 'Qty', 'FX Rate',
  'Value (USD)', 'Value (THB)', 'Qty Remaining', 'Cost Basis (THB)', 'Capital Gain (THB)', 'Notes'] as const;

/** Only untrusted text goes through this. Numeric losses must remain numeric. */
function safeText(value: string): string {
  return /^[\s\u0000-\u001f]*[=+@-]/.test(value) || /^[\t\r\n]/.test(value) ? `'${value}` : value;
}

function cell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function renderReportCsv(report: FifoReport): string {
  const rows: (readonly string[])[] = [
    ['FIFO Portfolio Report'], [`Generated: ${generatedLabel(report.generatedAt)}`], [], CSV_HEADERS,
  ];
  for (const section of report.sections) {
    const ticker = safeText(section.symbol.ticker);
    rows.push([safeText(`=== TICKER: ${section.symbol.ticker} ===`)]);
    for (const lot of section.lots) {
      rows.push([ticker, 'BUY LOT', lot.buyDate, '', fixed(lot.priceUsd, 6), fixed(lot.qty, 8),
        fixed(lot.fxRateUsdThb, 4), fixed(lot.priceUsd.times(lot.qty), 2), fixed(lot.costThb, 2),
        fixed(lot.remainingQty, 8), fixed(lot.costThb, 2), '', status(lot.remainingQty)]);
    }
    for (const sale of section.sales) {
      rows.push([ticker, 'SALE', sale.sellDate, '', fixed(sale.salePriceUsd, 6), fixed(sale.qtySold, 8),
        fixed(sale.fxRateUsdThb, 4), fixed(sale.salePriceUsd.times(sale.qtySold).minus(sale.feeUsd), 2),
        fixed(sale.proceedsThb, 2), '', fixed(sale.costBasisThb, 2), fixed(sale.gainThb, 2), '']);
      for (const a of sale.allocations) {
        rows.push([ticker, '  -> ALLOCATION', a.buyDate, `from lot bought ${a.buyDate}`, '',
          fixed(a.qtyAllocated, 8), '', '', '', '', fixed(a.costBasisThb, 2), '', '']);
      }
    }
    rows.push([ticker, 'TICKER TOTAL', '', '', '', '', '', '', '', '',
      fixed(section.remainingCostThb, 2), fixed(section.realizedGainThb, 2), ''], []);
  }
  rows.push([safeText('=== PORTFOLIO SUMMARY ===')], ['Ticker', 'Open Cost Basis (THB)', 'Realized Gain/Loss (THB)']);
  for (const section of report.sections) {
    rows.push([safeText(section.symbol.ticker), fixed(section.remainingCostThb, 2), fixed(section.realizedGainThb, 2)]);
  }
  rows.push(['TOTAL', fixed(report.totalOpenCostThb, 2), fixed(report.totalRealizedGainThb, 2)]);
  return `\uFEFF${rows.map((row) => row.map(cell).join(',')).join('\r\n')}\r\n`;
}
