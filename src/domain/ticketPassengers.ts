/**
 * Per-passenger ticket details (name, age, coach / berth, status), with
 * compatibility for older tickets that only stored passenger ids/names and
 * one coach + seats string.
 */
import type { Ticket, TicketPassenger } from './types';

export const BERTH_LABELS: Record<string, string> = {
  LB: 'Lower', MB: 'Middle', UB: 'Upper', SL: 'Side lower', SU: 'Side upper', WS: 'Window', MS: 'Middle seat', AS: 'Aisle',
};

export function emptyPassenger(p: Partial<TicketPassenger> = {}): TicketPassenger {
  return { personId: '', name: '', age: 0, gender: '', coach: '', berth: '', berthType: '', status: 'CNF', ...p };
}

/** Normalise a status as people type it: "cnf" → "CNF", "rlwl4" → "RLWL 4", "wl-12" → "WL 12". */
export function normaliseStatus(s: string): string {
  const t = (s ?? '').trim().toUpperCase().replace(/[\s/-]+/g, ' ');
  const m = /^([A-Z]+)\s*(\d+)?$/.exec(t);
  if (!m) return t.slice(0, 20);
  return (m[2] ? `${m[1]} ${m[2]}` : m[1]).slice(0, 20);
}

export type StatusKind = 'confirmed' | 'rac' | 'waiting' | 'cancelled' | 'unknown';

export function statusKind(status: string): StatusKind {
  const s = normaliseStatus(status);
  if (!s) return 'unknown';
  if (s.startsWith('CNF') || s.startsWith('CONFIRM')) return 'confirmed';
  if (s.startsWith('RAC')) return 'rac';
  if (s.startsWith('CAN')) return 'cancelled';
  if (/^(WL|RLWL|GNWL|PQWL|RSWL|RQWL|TQWL|NOSB)/.test(s)) return 'waiting';
  return 'unknown';
}

/** Short label for a whole ticket: "CNF", "RLWL 4–7", "CNF + WL", "RAC". */
export function ticketStatusSummary(passengers: TicketPassenger[]): string {
  const live = passengers.filter((p) => statusKind(p.status) !== 'cancelled');
  if (!passengers.length) return '';
  if (!live.length) return 'CAN';
  const kinds = new Set(live.map((p) => statusKind(p.status)));
  if (kinds.size === 1) {
    const k = [...kinds][0];
    if (k === 'confirmed') return 'CNF';
    if (k === 'rac') return 'RAC';
    if (k === 'waiting') {
      const nums = live.map((p) => Number(/\d+/.exec(normaliseStatus(p.status))?.[0])).filter((n) => Number.isFinite(n));
      const prefix = normaliseStatus(live[0].status).split(' ')[0];
      if (!nums.length) return prefix;
      const lo = Math.min(...nums), hi = Math.max(...nums);
      return lo === hi ? `${prefix} ${lo}` : `${prefix} ${lo}–${hi}`;
    }
    return normaliseStatus(live[0].status);
  }
  const order: StatusKind[] = ['confirmed', 'rac', 'waiting', 'unknown'];
  const short: Record<StatusKind, string> = { confirmed: 'CNF', rac: 'RAC', waiting: 'WL', unknown: '?', cancelled: 'CAN' };
  return order.filter((k) => kinds.has(k)).map((k) => short[k]).join(' + ');
}

/** "M2 · 58 MB" */
export function berthLabel(p: Pick<TicketPassenger, 'coach' | 'berth' | 'berthType'>): string {
  const seat = [p.berth, p.berthType].filter(Boolean).join(' ');
  return [p.coach, seat].filter(Boolean).join(' · ');
}

/**
 * Passengers to show for a ticket. New tickets have `passengers`; older ones
 * are rebuilt from passengerUids / passengerNames with the ticket's coach.
 */
export function passengersOf(t: Pick<Ticket, 'passengers' | 'passengerUids' | 'passengerNames' | 'coach'>, nameOf: (id: string) => string): TicketPassenger[] {
  if (t.passengers?.length) return t.passengers.map((p) => emptyPassenger({ ...p, name: p.name || (p.personId ? nameOf(p.personId) : '') }));
  return [
    ...t.passengerUids.map((id) => emptyPassenger({ personId: id, name: nameOf(id), coach: t.coach, status: '' })),
    ...t.passengerNames.map((name) => emptyPassenger({ name, coach: t.coach, status: '' })),
  ];
}

/**
 * Fields kept in sync with `passengers` so filters, search, "My tickets",
 * member details and older screens keep working.
 */
export function derivedTicketFields(passengers: TicketPassenger[]) {
  const clean = passengers
    .map((p) => ({
      ...p,
      name: p.name.trim().slice(0, 100),
      coach: p.coach.trim().toUpperCase().slice(0, 10),
      berth: p.berth.trim().slice(0, 10),
      status: normaliseStatus(p.status),
      age: Number.isInteger(p.age) && p.age > 0 && p.age < 130 ? p.age : 0,
    }))
    .filter((p) => p.name || p.personId);
  const coaches = [...new Set(clean.map((p) => p.coach).filter(Boolean))];
  return {
    passengers: clean,
    passengerUids: [...new Set(clean.filter((p) => p.personId).map((p) => p.personId))],
    passengerNames: clean.filter((p) => !p.personId).map((p) => p.name),
    coach: coaches.join(', ').slice(0, 20),
    seats: clean.map((p) => [p.berth, p.berthType].filter(Boolean).join(' ')).filter(Boolean).join(', ').slice(0, 200),
  };
}

export function validatePassengers(passengers: TicketPassenger[]): string | null {
  if (!passengers.some((p) => p.name.trim() || p.personId)) return 'Add at least one passenger.';
  for (const p of passengers) {
    if (!p.name.trim() && !p.personId) continue;
    if (p.age && (!Number.isInteger(p.age) || p.age < 0 || p.age > 120)) return `Check the age for ${p.name || 'a passenger'}.`;
  }
  if (passengers.length > 50) return 'A ticket can have at most 50 passengers.';
  return null;
}
