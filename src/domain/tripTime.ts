import type { ItineraryItem } from './types';
import { daysUntil, nowTimeIST, todayIST } from '../lib/format';

export type TripPhase = { phase: 'before'; daysToGo: number } | { phase: 'during'; dayNumber: number; totalDays: number } | { phase: 'after' } | { phase: 'unknown' };

export function tripPhase(startDate: string, endDate: string, now = new Date()): TripPhase {
  if (!startDate || !endDate) return { phase: 'unknown' };
  const toStart = daysUntil(startDate, now);
  const toEnd = daysUntil(endDate, now);
  const totalDays = daysUntil(endDate, new Date(startDate + 'T12:00:00+05:30')) + 1;
  if (toStart > 0) return { phase: 'before', daysToGo: toStart };
  if (toEnd >= 0) return { phase: 'during', dayNumber: 1 - toStart, totalDays };
  return { phase: 'after' };
}

export function todaysItems(items: ItineraryItem[], now = new Date()) {
  const today = todayIST(now);
  return items.filter((i) => i.date === today);
}

export function upcomingItems(items: ItineraryItem[], count: number, now = new Date()) {
  const today = todayIST(now);
  const time = nowTimeIST(now);
  return items.filter((i) => i.date > today || (i.date === today && (i.endTime || i.startTime || '23:59') >= time)).slice(0, count);
}

/** Is this activity happening right now? */
export function isNow(i: ItineraryItem, now = new Date()) {
  const t = nowTimeIST(now);
  return i.date === todayIST(now) && !!i.startTime && i.startTime <= t && (!i.endTime || i.endTime >= t);
}
