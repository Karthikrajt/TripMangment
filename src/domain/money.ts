import type { Paise } from './types';

/** Parse a user-entered rupee string ("1,250.50") into integer paise. Returns null when invalid. */
export function rupeesToPaise(input: string | number): Paise | null {
  const s = String(input).replace(/[,₹\s]/g, '');
  if (!/^\d+(\.\d{0,2})?$/.test(s)) return null;
  const [whole, frac = ''] = s.split('.');
  const paise = Number(whole) * 100 + Number((frac + '00').slice(0, 2));
  return Number.isSafeInteger(paise) ? paise : null;
}

/** Plain decimal string for inputs: 125050 → "1250.50" (drops ".00"). */
export function paiseToInput(paise: Paise): string {
  const r = Math.floor(Math.abs(paise) / 100);
  const p = Math.abs(paise) % 100;
  return `${paise < 0 ? '-' : ''}${r}${p ? '.' + String(p).padStart(2, '0') : ''}`;
}

const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2 });
const inrWhole = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });

/** Display paise as ₹ with Indian digit grouping. Whole rupees drop the decimals. */
export function formatINR(paise: Paise): string {
  const value = paise / 100;
  return paise % 100 === 0 ? inrWhole.format(value) : inr.format(value);
}

export function sumPaise(values: Iterable<Paise>): Paise {
  let total = 0;
  for (const v of values) total += v;
  return total;
}
