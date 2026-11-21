import { LOCALE, TIMEZONE } from '../config/constants';
import type { TS } from '../domain/types';

/** Today's date in Asia/Kolkata as YYYY-MM-DD. */
export function todayIST(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  return parts; // en-CA yields YYYY-MM-DD
}

/** Current IST clock time as HH:mm. */
export function nowTimeIST(now = new Date()): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: TIMEZONE, hour: '2-digit', minute: '2-digit', hour12: false }).format(now);
}

/** YYYY-MM-DD → DD-MM-YYYY */
export function formatDate(iso: string | undefined | null): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return '';
  const [y, m, d] = iso.split('-');
  return `${d}-${m}-${y}`;
}

/** YYYY-MM-DD → "Sat, 20 Dec" */
export function formatDateLong(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso + 'T12:00:00+05:30');
  return new Intl.DateTimeFormat(LOCALE, { timeZone: TIMEZONE, weekday: 'short', day: 'numeric', month: 'short' }).format(d);
}

/** HH:mm → "9:30 PM" */
export function formatTime(hhmm: string | undefined | null): string {
  if (!hhmm || !/^\d{2}:\d{2}$/.test(hhmm)) return '';
  const [h, m] = hhmm.split(':').map(Number);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${suffix}`;
}

export function tsToDate(ts: TS | undefined): Date | null {
  return ts && typeof ts.toDate === 'function' ? ts.toDate() : null;
}

/** Firestore timestamp → "DD-MM-YYYY, 9:30 PM" in IST. */
export function formatDateTime(ts: TS | undefined): string {
  const d = tsToDate(ts);
  if (!d) return '';
  const date = formatDate(todayIST(d));
  const time = new Intl.DateTimeFormat(LOCALE, { timeZone: TIMEZONE, hour: 'numeric', minute: '2-digit', hour12: true }).format(d);
  return `${date}, ${time.toUpperCase()}`;
}

export function formatClock(ts: TS | undefined): string {
  const d = tsToDate(ts);
  if (!d) return '';
  return new Intl.DateTimeFormat(LOCALE, { timeZone: TIMEZONE, hour: 'numeric', minute: '2-digit', hour12: true }).format(d).toUpperCase();
}

export function timeAgo(ts: TS | undefined, now = Date.now()): string {
  const d = tsToDate(ts);
  if (!d) return 'just now';
  const s = Math.round((now - d.getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} hr ago`;
  return formatDateTime(ts);
}

/** Whole days from today (IST) until the given date; negative when past. */
export function daysUntil(iso: string, now = new Date()): number {
  const a = Date.parse(todayIST(now) + 'T00:00:00Z');
  const b = Date.parse(iso + 'T00:00:00Z');
  return Math.round((b - a) / 86400000);
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');
}

/** Build a Google Maps search URL for an address (no API key needed). */
export function mapsSearchUrl(query: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

export function telHref(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, '')}`;
}
