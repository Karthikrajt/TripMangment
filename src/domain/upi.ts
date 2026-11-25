/**
 * UPI payments. The app never handles money: it only opens the payer's UPI
 * app (GPay, PhonePe, Paytm, BHIM …) with the receiver and amount filled in.
 */
import type { Paise } from './types';

/** name@bank, e.g. ravi.k@okicici – the format NPCI uses for VPAs. */
const UPI_RE = /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z][a-zA-Z0-9.\-]{1,63}$/;

export function normaliseUpiId(v: string): string {
  return v.trim().replace(/\s+/g, '').toLowerCase();
}

export function isValidUpiId(v: string): boolean {
  return UPI_RE.test(normaliseUpiId(v));
}

/** upi://pay deep link. Amount in rupees with 2 decimals, currency INR. */
export function upiPayUrl(opts: { upiId: string; name: string; amountPaise: Paise; note: string }): string {
  const params = new URLSearchParams({
    pa: normaliseUpiId(opts.upiId),
    pn: opts.name.slice(0, 50),
    am: (opts.amountPaise / 100).toFixed(2),
    cu: 'INR',
    tn: opts.note.slice(0, 50),
  });
  // URLSearchParams encodes spaces as '+', which some UPI apps show literally.
  return `upi://pay?${params.toString().replace(/\+/g, '%20')}`;
}
