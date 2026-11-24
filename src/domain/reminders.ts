/**
 * Automatic trip reminders. Pure functions: given the trip data and "now",
 * work out which reminders are due. Used by scripts/reminders (run on a
 * schedule by GitHub Actions) – kept here so it is unit-tested with the app.
 *
 * All dates/times are Asia/Kolkata (IST, UTC+05:30, no daylight saving).
 */
import type { ItineraryItem, Member, Ticket, Vehicle } from './types';

export interface Reminder {
  /** stable id → a marker document stops it being sent twice */
  key: string;
  /** when it should go out (ms since epoch) */
  at: number;
  title: string;
  body: string;
  link: string;
  /** sign-in account uids; empty = everyone on the trip */
  uids: string[];
}

/** IST wall-clock → epoch ms. */
export function istToMs(date: string, time: string): number {
  return Date.parse(`${date}T${time || '00:00'}:00+05:30`);
}

export function prevDate(date: string): string {
  const d = new Date(`${date}T12:00:00+05:30`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

function clock(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

const safe = (s: string) => s.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 60);

/** Traveller ids → the sign-in accounts that act as them (or are them). */
export function accountsFor(personIds: string[], members: Member[]): string[] {
  const out = new Set<string>();
  for (const id of personIds) {
    for (const m of members) {
      if (m.status !== 'approved' || m.hasLogin === false) continue;
      if (m.uid === id || m.personId === id) out.add(m.uid);
    }
  }
  return [...out];
}

export const EVENING_BEFORE = '19:00';
export const MORNING_PLAN = '07:00';

export function computeReminders(data: { tickets: Ticket[]; vehicles: Vehicle[]; itinerary: ItineraryItem[]; members: Member[]; startDate: string; endDate: string }): Reminder[] {
  const out: Reminder[] = [];
  for (const t of data.tickets) {
    if (!t.journeyDate || !t.departureTime) continue;
    const dep = istToMs(t.journeyDate, t.departureTime);
    const uids = accountsFor(t.passengerUids ?? [], data.members);
    const train = [t.trainName, t.trainNumber && `#${t.trainNumber}`].filter(Boolean).join(' ') || t.title || 'Train';
    const route = [t.boardingStation, t.destinationStation].filter(Boolean).join(' → ');
    // Evening before; skip if the train leaves before that evening is over anyway (early-morning trains still get it).
    out.push({
      key: `tkt-eve-${safe(t.id)}`,
      at: istToMs(prevDate(t.journeyDate), EVENING_BEFORE),
      title: `Tomorrow: ${train}`,
      body: `${route} departs ${clock(t.departureTime)}${t.pnr ? ` · PNR ${t.pnr}` : ''}. Pack tonight and keep your ID ready.`,
      link: '/tickets',
      uids,
    });
    out.push({
      key: `tkt-3h-${safe(t.id)}`,
      at: dep - 3 * 3600_000,
      title: `Train in 3 hours: ${train}`,
      body: `${route} at ${clock(t.departureTime)}. Leave for ${t.boardingStation || 'the station'} in good time.`,
      link: '/tickets',
      uids,
    });
  }
  for (const v of data.vehicles) {
    if (!v.pickupDate || !v.pickupTime) continue;
    out.push({
      key: `pick-1h-${safe(v.id)}`,
      at: istToMs(v.pickupDate, v.pickupTime) - 3600_000,
      title: `Pickup in 1 hour – ${clock(v.pickupTime)}`,
      body: `${[v.vehicleType, v.registrationNumber].filter(Boolean).join(' ')}${v.pickupLocation ? ` at ${v.pickupLocation}` : ''}${v.driverPhone ? ` · Driver ${v.driverPhone}` : ''}`,
      link: '/transport',
      uids: accountsFor(v.memberUids ?? [], data.members),
    });
  }
  // Morning plan for each trip day that has published activities.
  const byDate = new Map<string, ItineraryItem[]>();
  for (const i of data.itinerary) {
    if (!i.published || !i.date) continue;
    byDate.set(i.date, [...(byDate.get(i.date) ?? []), i]);
  }
  for (const [date, items] of byDate) {
    if (data.startDate && date < data.startDate) continue;
    if (data.endDate && date > data.endDate) continue;
    items.sort((a, b) => (a.startTime || '99').localeCompare(b.startTime || '99'));
    const first = items[0];
    out.push({
      key: `plan-${date}`,
      at: istToMs(date, MORNING_PLAN),
      title: `Today's plan${first.dayNumber ? ` – Day ${first.dayNumber}` : ''}`,
      body: items.slice(0, 4).map((i) => `${i.startTime ? clock(i.startTime) + ' ' : ''}${i.title}`).join(' · ') + (items.length > 4 ? ` +${items.length - 4} more` : ''),
      link: '/live',
      uids: [],
    });
  }
  return out;
}

/** Reminders due now: time has come, but not older than `graceMs` (a late run still sends; a very old one is dropped). */
export function dueReminders(all: Reminder[], now: number, graceMs = 90 * 60_000): Reminder[] {
  return all.filter((r) => Number.isFinite(r.at) && r.at <= now && now - r.at <= graceMs);
}
