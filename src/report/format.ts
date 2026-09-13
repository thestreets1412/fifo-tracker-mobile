import Decimal from 'decimal.js';

export const fixed = (value: Decimal, places: number): string => value.toFixed(places, Decimal.ROUND_HALF_EVEN);

export function money(value: Decimal): string {
  const [integer = '0', fraction = '00'] = fixed(value, 2).split('.');
  return `${integer.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${fraction}`;
}

export const thb = (value: Decimal): string => `THB ${money(value)}`;

export function qty(value: Decimal): string {
  return fixed(value, 8).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
}

export const status = (remaining: Decimal): string => remaining.gt(0) ? 'Open' : 'Fully Consumed';

export function generatedLabel(iso: string): string {
  return `${new Date(iso).toISOString().slice(0, 16).replace('T', ' ')} UTC`;
}
