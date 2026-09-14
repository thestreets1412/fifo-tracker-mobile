import Decimal from 'decimal.js';
import { DP, toStored } from '../core/money';
import type { SymbolRow } from '../core/types';
import type { LotRow, SaleRow } from '../db/repo';
import { safeEvidenceName } from './paths';

export interface BackupData { symbols: SymbolRow[]; lots: LotRow[]; sales: SaleRow[] }
export const LOT_HEADERS = ['id', 'ticker', 'buy_date', 'price_usd', 'qty', 'fx_rate_usd_thb', 'created_at', 'evidence'];
export const SALE_HEADERS = ['id', 'ticker', 'sell_date', 'qty_sold', 'sale_price_usd', 'fee_usd', 'fx_rate_usd_thb', 'created_at', 'evidence'];
const MAX_ROWS = 10000;

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected object');
  return value as Record<string, unknown>;
}
function text(value: unknown, max = 500): string {
  if (typeof value !== 'string' || value.length > max || /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(value)) throw new Error('Invalid text');
  return value;
}
function id(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) throw new Error('Invalid ID');
  return value;
}
function rows(value: unknown): unknown[] {
  if (!Array.isArray(value) || value.length > MAX_ROWS) throw new Error('Invalid rows');
  return value;
}
export function decimal(value: unknown, dp: number, allowZero = false): string {
  const input = text(value, 80).trim();
  if (!/^[+-]?\d+(?:\.\d+)?(?:[eE][+-]?\d{1,3})?$/.test(input)) throw new Error('Invalid decimal');
  const d = new Decimal(input);
  if (!d.isFinite() || d.lt(0) || (!allowZero && d.isZero()) || d.gte('1e20') || d.decimalPlaces() > dp) throw new Error('Invalid decimal precision or range');
  return toStored(d, dp);
}
export function date(value: unknown): string {
  let s = text(value, 10).trim();
  const slash = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (slash) s = `${slash[3]}-${slash[2]!.padStart(2, '0')}-${slash[1]!.padStart(2, '0')}`;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || !Number.isFinite(Date.parse(s)) || new Date(s).toISOString().slice(0, 10) !== s) throw new Error('Invalid date');
  return s;
}
function timestamp(value: unknown): string {
  const s = text(value, 30);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(s)) throw new Error('Invalid UTC timestamp');
  date(s.slice(0, 10));
  const result = new Date(s).toISOString();
  if (result.slice(0, 19) !== s.slice(0, 19)) throw new Error('Invalid UTC timestamp');
  return result;
}
function evidence(value: unknown): string | null {
  if (value === null || value === '') return null;
  const s = text(value, 180);
  if (!safeEvidenceName(s)) throw new Error('Unsafe evidence filename');
  return s;
}
function ticker(value: unknown): string {
  const s = text(value, 40).trim().toUpperCase();
  if (!s || /[\r\n\t]/.test(s)) throw new Error('Invalid ticker');
  return s;
}
function unique<T>(values: T[], key: (v: T) => unknown): void {
  if (new Set(values.map(key)).size !== values.length) throw new Error('Duplicate record');
}

export function parseBackupJson(input: string): BackupData {
  const raw = object(JSON.parse(input));
  const symbols = rows(raw.symbols).map(v => {
    const r = object(v);
    return { id: id(r.id), ticker: ticker(r.ticker), name: text(r.name) };
  }).sort((a, b) => a.id - b.id);
  unique(symbols, s => s.id); unique(symbols, s => s.ticker);
  const common = (r: Record<string, unknown>) => ({
    id: id(r.id), symbolId: id(r.symbol_id), fxRateUsdThb: decimal(r.fx_rate_usd_thb, DP.fxRate),
    createdAt: timestamp(r.created_at), evidenceFile: evidence(r.evidence_file),
  });
  const lots = rows(raw.lots).map(v => {
    const r = object(v);
    return { ...common(r), buyDate: date(r.buy_date), priceUsd: decimal(r.price_usd, DP.price), qty: decimal(r.qty, DP.qty) };
  }).sort((a, b) => a.id - b.id);
  const sales = rows(raw.sales).map(v => {
    const r = object(v);
    return { ...common(r), sellDate: date(r.sell_date), qtySold: decimal(r.qty_sold, DP.qty), salePriceUsd: decimal(r.sale_price_usd, DP.price), feeUsd: decimal(r.fee_usd, DP.money, true) };
  }).sort((a, b) => a.id - b.id);
  unique(lots, r => r.id); unique(sales, r => r.id);
  const ids = new Set(symbols.map(s => s.id));
  if ([...lots, ...sales].some(r => !ids.has(r.symbolId))) throw new Error('Unknown symbol ID');
  return { symbols, lots, sales };
}

export function jsonRecords(data: BackupData) {
  return {
    symbols: [...data.symbols].sort((a, b) => a.id - b.id).map(s => ({ id: s.id, ticker: s.ticker, name: s.name })),
    lots: [...data.lots].sort((a, b) => a.id - b.id).map(r => ({ id: r.id, symbol_id: r.symbolId, buy_date: r.buyDate, price_usd: r.priceUsd, qty: r.qty, fx_rate_usd_thb: r.fxRateUsdThb, created_at: r.createdAt, evidence_file: r.evidenceFile })),
    sales: [...data.sales].sort((a, b) => a.id - b.id).map(r => ({ id: r.id, symbol_id: r.symbolId, sell_date: r.sellDate, qty_sold: r.qtySold, sale_price_usd: r.salePriceUsd, fee_usd: r.feeUsd, fx_rate_usd_thb: r.fxRateUsdThb, created_at: r.createdAt, evidence_file: r.evidenceFile })),
  };
}
export const backupJson = (data: BackupData): string => JSON.stringify(jsonRecords(data), null, 2) + '\n';
export const canonicalData = (data: BackupData): BackupData => parseBackupJson(backupJson(data));
export const evidenceNames = (data: BackupData): string[] => [...new Set([...data.lots, ...data.sales].flatMap(r => r.evidenceFile ? [r.evidenceFile] : []))].sort();

// Prefix text before CSV quoting. Undo only this exact marker during import.
function protect(s: string): string { return /^[\s]*[=+\-@\t\r\n']/.test(s) ? "'" + s : s; }
function unprotect(s: string): string { return s.startsWith("'") ? s.slice(1) : s; }
function cell(s: string): string { return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }
export function backupCsv(data: BackupData, kind: 'lots' | 'sales'): string {
  const symbols = new Map(data.symbols.map(s => [s.id, s.ticker]));
  const records = jsonRecords(data)[kind];
  const headers = kind === 'lots' ? LOT_HEADERS : SALE_HEADERS;
  return '\ufeff' + [headers, ...records.map(r => headers.map(h => {
    if (h === 'ticker') return protect(symbols.get(r.symbol_id)!);
    if (h === 'evidence') return r.evidence_file ?? '';
    return String((r as unknown as Record<string, unknown>)[h]);
  }))].map(r => r.map(cell).join(',')).join('\r\n') + '\r\n';
}

export function parseCsv(input: string): string[][] {
  const s = input.replace(/^\ufeff/, '');
  const out: string[][] = []; let row: string[] = []; let field = ''; let quoted = false; let closed = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!;
    if (quoted) {
      if (c === '"' && s[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') { quoted = false; closed = true; }
      else field += c;
    } else if (c === ',' || c === '\r' || c === '\n') {
      row.push(field); field = ''; closed = false;
      if (c !== ',') { if (c === '\r' && s[i + 1] === '\n') i++; out.push(row); row = []; }
    } else if (c === '"' && !field && !closed) quoted = true;
    else { if (closed || c === '"') throw new Error('Malformed CSV'); field += c; }
    if (out.length > MAX_ROWS + 1 || field.length > 1000) throw new Error('CSV too large');
  }
  if (quoted) throw new Error('Unclosed CSV quote');
  if (field || row.length || closed) { row.push(field); out.push(row); }
  return out;
}

export function dataFromCsv(json: BackupData, lotsCsv: string, salesCsv: string): BackupData {
  const symbols = json.symbols.map(s => ({ ...s }));
  let nextId = Math.max(0, ...symbols.map(s => s.id)) + 1;
  const read = (csv: string, kind: 'lots' | 'sales') => {
    const table = parseCsv(csv); const expected = kind === 'lots' ? LOT_HEADERS : SALE_HEADERS;
    if (JSON.stringify(table.shift()) !== JSON.stringify(expected)) throw new Error('Invalid CSV headers');
    return table.map(cells => {
      if (cells.length !== expected.length) throw new Error('Invalid CSV columns');
      const r = Object.fromEntries(expected.map((h, i) => [h, cells[i]!]));
      if (!/^\d+$/.test(r.id!)) throw new Error('Invalid CSV ID');
      const recordId = id(Number(r.id));
      let name = ticker(unprotect(r.ticker!));
      const original = json[kind].find(r => r.id === recordId);
      const originalTicker = symbols.find(s => s.id === original?.symbolId)?.ticker;
      // Recover leading zeros only when the row's preserved ID makes it unambiguous.
      if (originalTicker && /^\d+$/.test(originalTicker) && /^\d+(?:\.0+)?(?:E[+-]?\d+)?$/.test(name) && new Decimal(originalTicker).eq(name)) name = originalTicker;
      let symbol = symbols.find(s => s.ticker === name);
      if (!symbol) { symbol = { id: nextId++, ticker: name, name: '' }; symbols.push(symbol); }
      const { ticker: ignored, evidence: file, ...rest } = r;
      return { ...rest, id: recordId, symbol_id: symbol.id, evidence_file: file || null };
    });
  };
  const lots = read(lotsCsv, 'lots'); const sales = read(salesCsv, 'sales');
  return parseBackupJson(JSON.stringify({ symbols, lots, sales }));
}

export interface Difference { table: 'lots' | 'sales'; id: number; field: string; json: string; csv: string }
export function differences(a: BackupData, b: BackupData): Difference[] {
  const out: Difference[] = [];
  for (const table of ['lots', 'sales'] as const) {
    const left = new Map(a[table].map(r => [r.id, r])); const right = new Map(b[table].map(r => [r.id, r]));
    for (const id of [...new Set([...left.keys(), ...right.keys()])].sort((a, b) => a - b)) {
      const l = left.get(id); const r = right.get(id);
      if (!l || !r) { out.push({ table, id, field: 'record', json: l ? 'present' : 'absent', csv: r ? 'present' : 'absent' }); continue; }
      for (const field of Object.keys(l)) {
        const value = (data: BackupData, row: typeof l) => field === 'symbolId' ? data.symbols.find(s => s.id === row.symbolId)!.ticker : String((row as unknown as Record<string, unknown>)[field] ?? '');
        const json = value(a, l); const csv = value(b, r);
        if (json !== csv) out.push({ table, id, field: field === 'symbolId' ? 'ticker' : field, json, csv });
      }
    }
  }
  return out;
}
