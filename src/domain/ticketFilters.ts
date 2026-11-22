/**
 * Pure ticket filtering / grouping logic for the Tickets page.
 * Everything is derived from existing fields – no extra data is stored.
 */
import type { Ticket } from './types';
import { formatDate } from '../lib/format';

/** Sentinel select value for "Date not set" / "Train not set". */
export const NONE = '__none__';

export type TicketTab = 'all' | 'mine' | 'uploaded';

export interface TicketFilterState {
  tab: TicketTab;
  date: string; // '' = all dates, NONE = no date, else YYYY-MM-DD
  train: string; // '' = all trains, NONE = no train, else a trainKey
  q: string;
}

export const EMPTY_FILTERS: TicketFilterState = { tab: 'all', date: '', train: '', q: '' };

/** Add whole days to a YYYY-MM-DD date (calendar arithmetic, timezone-free). */
export function addDaysISO(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

/**
 * Completed once today (IST) is at least journeyDate + 2 days. Overnight
 * trains arrive the next day and arrival times are often blank, so a ticket
 * for the 15th is still active on the 16th and completed on the 17th.
 * Tickets without a valid date are never completed.
 */
export function isTicketCompleted(t: Pick<Ticket, 'journeyDate'>, todayIst: string): boolean {
  if (!t.journeyDate || !/^\d{4}-\d{2}-\d{2}$/.test(t.journeyDate)) return false;
  return todayIst >= addDaysISO(t.journeyDate, 2);
}

/** Group key for a train: by number, falling back to name; NONE when both are empty. */
export function trainKey(t: Pick<Ticket, 'trainNumber' | 'trainName'>): string {
  const num = (t.trainNumber ?? '').trim();
  if (num) return `no:${num.toUpperCase()}`;
  const name = (t.trainName ?? '').trim().replace(/\s+/g, ' ');
  return name ? `name:${name.toUpperCase()}` : NONE;
}

export function trainLabel(t: Pick<Ticket, 'trainNumber' | 'trainName'>): string {
  return [t.trainNumber?.trim(), t.trainName?.trim()].filter(Boolean).join(' ') || 'Train not set';
}

export interface FilterOption {
  value: string;
  label: string;
  count: number;
}

/** Distinct journey dates, earliest first, then "Date not set" if any. */
export function dateOptions(tickets: Ticket[]): FilterOption[] {
  const counts = new Map<string, number>();
  for (const t of tickets) {
    const k = t.journeyDate || NONE;
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const dated = [...counts.keys()].filter((k) => k !== NONE).sort();
  const out = dated.map((d) => ({ value: d, label: formatDate(d) || d, count: counts.get(d)! }));
  if (counts.has(NONE)) out.push({ value: NONE, label: 'Date not set', count: counts.get(NONE)! });
  return out;
}

/** Distinct trains (number + name), sorted by number/name, then "Train not set" if any. */
export function trainOptions(tickets: Ticket[]): FilterOption[] {
  const groups = new Map<string, { label: string; count: number; hasName: boolean }>();
  for (const t of tickets) {
    const k = trainKey(t);
    const g = groups.get(k);
    const hasName = Boolean(t.trainName?.trim());
    if (!g) groups.set(k, { label: k === NONE ? 'Train not set' : trainLabel(t), count: 1, hasName });
    else {
      g.count += 1;
      // Prefer a label that includes the train name.
      if (!g.hasName && hasName && k !== NONE) {
        g.label = trainLabel(t);
        g.hasName = true;
      }
    }
  }
  const out = [...groups.entries()]
    .filter(([k]) => k !== NONE)
    .map(([value, g]) => ({ value, label: g.label, count: g.count }))
    .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
  const none = groups.get(NONE);
  if (none) out.push({ value: NONE, label: 'Train not set', count: none.count });
  return out;
}

export interface FilterContext {
  /** person id the signed-in user acts as (for "My tickets") */
  myPersonId: string;
  /** signed-in account uid (for "Uploaded by me") */
  myUid: string;
  /** id → display name, for passenger search */
  nameOf: (id: string) => string;
}

export function matchesTab(t: Ticket, tab: TicketTab, ctx: FilterContext): boolean {
  if (tab === 'mine') return Boolean(ctx.myPersonId) && t.passengerUids.includes(ctx.myPersonId);
  if (tab === 'uploaded') return Boolean(ctx.myUid) && t.uploadedBy === ctx.myUid;
  return true;
}

export function matchesSearch(t: Ticket, q: string, ctx: FilterContext): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  const hay = [
    t.title, t.pnr, t.trainName, t.trainNumber, t.boardingStation, t.destinationStation, t.coach, t.seats, t.travelClass, t.notes,
    t.journeyDate, formatDate(t.journeyDate),
    ...t.passengerNames,
    ...t.passengerUids.map(ctx.nameOf),
  ]
    .join(' ')
    .toLowerCase();
  return hay.includes(needle);
}

export function matchesDate(t: Ticket, date: string): boolean {
  if (!date) return true;
  return date === NONE ? !t.journeyDate : t.journeyDate === date;
}

export function matchesTrain(t: Ticket, train: string): boolean {
  return !train || trainKey(t) === train;
}

export function applyFilters(tickets: Ticket[], f: TicketFilterState, ctx: FilterContext): Ticket[] {
  return tickets.filter((t) => matchesTab(t, f.tab, ctx) && matchesDate(t, f.date) && matchesTrain(t, f.train) && matchesSearch(t, f.q, ctx));
}

/** Drop a date/train selection whose option no longer exists. */
export function pruneSelection(f: TicketFilterState, dates: FilterOption[], trains: FilterOption[]): TicketFilterState {
  const date = f.date && !dates.some((o) => o.value === f.date) ? '' : f.date;
  const train = f.train && !trains.some((o) => o.value === f.train) ? '' : f.train;
  return date === f.date && train === f.train ? f : { ...f, date, train };
}

export const hasActiveFilters = (f: TicketFilterState) => f.tab !== 'all' || Boolean(f.date || f.train || f.q.trim());

const byJourney = (a: Ticket, b: Ticket) =>
  (a.journeyDate || '9999').localeCompare(b.journeyDate || '9999') ||
  (a.departureTime || '99').localeCompare(b.departureTime || '99') ||
  trainLabel(a).localeCompare(trainLabel(b), undefined, { numeric: true });

/** Split into active (soonest first; undated last) and completed (most recent first). */
export function splitByCompletion(tickets: Ticket[], todayIst: string): { active: Ticket[]; completed: Ticket[] } {
  const active: Ticket[] = [];
  const completed: Ticket[] = [];
  for (const t of tickets) (isTicketCompleted(t, todayIst) ? completed : active).push(t);
  active.sort(byJourney);
  completed.sort((a, b) => -byJourney(a, b));
  return { active, completed };
}
