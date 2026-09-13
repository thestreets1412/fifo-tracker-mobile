import type Decimal from 'decimal.js';
import type { FifoReport, ReportSection } from './types';
import { fixed, money, thb, qty, status, generatedLabel } from './format';

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

const gainClass = (value: Decimal): string => value.lt(0) ? 'loss' : 'gain';
const td = (text: string, className = ''): string => `<td class="${className}">${escapeHtml(text)}</td>`;
const heads = (labels: readonly string[]): string => `<thead><tr>${labels.map((s) => `<th scope="col">${escapeHtml(s)}</th>`).join('')}</tr></thead>`;

function sectionHtml(section: ReportSection): string {
  const lots = section.lots.map((lot) => `<tr>${[
    td(lot.buyDate, 'date'), td(money(lot.priceUsd)), td(qty(lot.qty)), td(fixed(lot.fxRateUsdThb, 4)),
    td(thb(lot.costThb)), td(qty(lot.remainingQty)), td(status(lot.remainingQty), 'text'),
  ].join('')}</tr>`).join('');
  const sales = section.sales.map((sale) => `<tr class="sale">${[
    td(sale.sellDate, 'date'), td(qty(sale.qtySold)), td(money(sale.salePriceUsd)), td(money(sale.feeUsd)),
    td(fixed(sale.fxRateUsdThb, 4)), td(thb(sale.proceedsThb)), td(thb(sale.costBasisThb)), td(thb(sale.gainThb), gainClass(sale.gainThb)),
  ].join('')}</tr>${sale.allocations.map((a) => `<tr class="allocation">${[
    `<td class="text">from lot<br><span class="date">${escapeHtml(a.buyDate)}</span></td>`, td(qty(a.qtyAllocated)), td(''), td(''), td(''), td(''), td(thb(a.costBasisThb)), td(''),
  ].join('')}</tr>`).join('')}`).join('');
  return `<section class="page-section ticker-section">
    <h1>FIFO Report - ${escapeHtml(section.symbol.ticker)}</h1>
    <h2>Buy Lots</h2><table class="lots">${heads(['Buy Date', 'Price (USD)', 'Qty', 'FX Rate', 'Cost (THB)', 'Qty Remaining', 'Status'])}
    <tbody>${lots || '<tr><td colspan="7" class="text">No buy lots.</td></tr>'}</tbody></table>
    <h2>Sales &amp; FIFO Allocations</h2><table class="sales">${heads(['Sell Date', 'Qty Sold', 'Price (USD)', 'Fee (USD)', 'FX Rate', 'Proceeds (THB)', 'Cost Basis (THB)', 'Gain/Loss (THB)'])}
    <tbody>${sales || '<tr><td colspan="8" class="text">No sales.</td></tr>'}</tbody></table>
    <p class="ticker-total">Ticker Total Realized Gain/Loss: <strong class="${gainClass(section.realizedGainThb)}">${thb(section.realizedGainThb)}</strong><br>
    Open Cost Basis Remaining: ${thb(section.remainingCostThb)}</p>
  </section>`;
}

/** Self-contained document: preview and printer receive this exact same string. */
export function renderReportHtml(report: FifoReport): string {
  const filtered = report.symbolId === undefined ? '' : `<p>Filtered to: ${escapeHtml(report.sections[0]?.symbol.ticker ?? 'No transactions')}</p>`;
  const summaryRows = report.sections.map((s) => `<tr>${td(s.symbol.ticker, 'text')}${td(thb(s.remainingCostThb))}${td(thb(s.realizedGainThb), gainClass(s.realizedGainThb))}</tr>`).join('');
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
<title>FIFO Portfolio Report</title>
<style>
@page { size: A4 portrait; margin: 18mm; }
* { box-sizing: border-box; }
body { margin: 0; color: #202020; background: white; font-family: Arial, Helvetica, sans-serif; font-size: 9pt; }
h1 { font-size: 20pt; text-align: center; overflow-wrap: anywhere; }
h2 { font-size: 12pt; margin: 6mm 0 3mm; break-after: avoid; page-break-after: avoid; }
p { line-height: 1.5; }
.page-section { page-break-after: always; break-after: page; }
.page-section:last-child { page-break-after: auto; break-after: auto; }
.cover { padding-top: 35mm; text-align: center; }
.cover h1 { font-size: 22pt; }
.cover table { margin-top: 16mm; }
.cover th, .cover td { text-align: center; }
.cover td { font-size: 13pt; font-weight: bold; }
.tickers { margin-top: 12mm; overflow-wrap: anywhere; }
table { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 8pt; }
thead { display: table-header-group; }
tr { break-inside: avoid; page-break-inside: avoid; }
th { color: #2c3e50; border-bottom: 1pt solid #2c3e50; font-weight: bold; }
th, td { padding: 4pt 3pt; text-align: right; vertical-align: top; overflow-wrap: anywhere; }
td { border-bottom: .5pt solid #dddddd; font-variant-numeric: tabular-nums; }
th:first-child, .text, .date { text-align: left; }
.date { white-space: nowrap; }
.cover th:first-child { text-align: center; }
.lots tbody tr:nth-child(even) { background: #f7f7f7; }
.allocation { color: #555555; }
.allocation td:first-child { padding-left: 7pt; }
.gain { color: #1e7e34; } .loss { color: #c0392b; }
.ticker-total { font-size: 10pt; }
.grand-total td { font-weight: bold; border-top: 1pt solid #202020; }
@media screen {
  body { padding: 12px; }
  .page-section { min-width: 174mm; max-width: 174mm; margin: 0 auto 24px; padding-bottom: 20px; border-bottom: 1px solid #dddddd; }
}
</style></head><body>
<section class="page-section cover"><h1>FIFO Portfolio Report</h1>
<p>Generated ${generatedLabel(report.generatedAt)}</p>${filtered}
<table>${heads(['Open Cost Basis (THB)', 'Realized Gain/Loss (THB)'])}<tbody><tr>
${td(thb(report.totalOpenCostThb))}${td(thb(report.totalRealizedGainThb), gainClass(report.totalRealizedGainThb))}
</tr></tbody></table><p class="tickers">Tickers covered: ${escapeHtml(report.sections.map((s) => s.symbol.ticker).join(', ') || 'None')}</p></section>
${report.sections.map(sectionHtml).join('')}
<section class="page-section summary"><h1>Portfolio Summary</h1><table>
${heads(['Ticker', 'Open Cost Basis (THB)', 'Realized Gain/Loss (THB)'])}<tbody>${summaryRows}
<tr class="grand-total">${td('TOTAL', 'text')}${td(thb(report.totalOpenCostThb))}${td(thb(report.totalRealizedGainThb), gainClass(report.totalRealizedGainThb))}</tr>
</tbody></table></section></body></html>`;
}
