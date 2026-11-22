/**
 * "People" = the travellers the trip is planned and split for.
 * - Admin-added travellers (no login) and approved sign-in accounts that are
 *   NOT linked to a traveller are people.
 * - A sign-in account linked to a traveller (`personId`) is represented by
 *   that traveller, so it is not listed separately.
 *
 * Share weights (percent of an adult head):
 * - adult: always 100
 * - child / infant: the trip default (Trip Settings), unless the person has a
 *   custom share (`customShare: true`, value in `shareWeight`).
 */
import type { AgeGroup, Member, Trip } from './types';

export interface ShareDefaults {
  child: number;
  infant: number;
}

/** Built-in defaults when the trip has none set. */
export const DEFAULT_SHARES: ShareDefaults = { child: 50, infant: 0 };
/** Values the app stored before trip defaults existed; equal values mean "not customised". */
const LEGACY_DEFAULT: Record<AgeGroup, number> = { adult: 100, child: 50, infant: 0 };

const clampPct = (v: unknown, fallback: number) =>
  typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 100 ? v : fallback;

export function sharesFromTrip(trip: Pick<Trip, 'childSharePercent' | 'infantSharePercent'> | null | undefined): ShareDefaults {
  return {
    child: clampPct(trip?.childSharePercent, DEFAULT_SHARES.child),
    infant: clampPct(trip?.infantSharePercent, DEFAULT_SHARES.infant),
  };
}

export function ageGroupOf(m: Pick<Member, 'ageGroup'>): AgeGroup {
  return m.ageGroup ?? 'adult';
}

type ShareFields = Pick<Member, 'ageGroup' | 'shareWeight' | 'customShare'>;

/** Does this person have their own share instead of the trip default? */
export function hasCustomShare(m: ShareFields): boolean {
  const g = ageGroupOf(m);
  if (g === 'adult') return false;
  if (typeof m.customShare === 'boolean') return m.customShare;
  // Older records: a stored value different from the old default was a deliberate choice.
  return typeof m.shareWeight === 'number' && m.shareWeight !== LEGACY_DEFAULT[g];
}

/** Share weight in percent (0–100) of an adult head. */
export function weightOf(m: ShareFields, d: ShareDefaults = DEFAULT_SHARES): number {
  const g = ageGroupOf(m);
  if (g === 'adult') return 100;
  return hasCustomShare(m) ? clampPct(m.shareWeight, d[g]) : d[g];
}

export function isPerson(m: Member): boolean {
  return m.status === 'approved' && !m.personId;
}

export function peopleOf(members: Member[]): Member[] {
  return members.filter(isPerson);
}

/** The person id the signed-in member acts as. */
export function personIdOf(me: Pick<Member, 'uid' | 'personId'> | null | undefined): string {
  return me?.personId || me?.uid || '';
}

export function weightsOf(people: Member[], d: ShareDefaults = DEFAULT_SHARES): Record<string, number> {
  return Object.fromEntries(people.map((p) => [p.uid, weightOf(p, d)]));
}

/** Sum of weights / 100, i.e. how many "full adult shares" the group has. */
export function headCount(people: Member[], d: ShareDefaults = DEFAULT_SHARES): number {
  return Math.round(people.reduce((a, p) => a + weightOf(p, d), 0)) / 100;
}

export function countByAge(people: Member[]) {
  return {
    adult: people.filter((p) => ageGroupOf(p) === 'adult').length,
    child: people.filter((p) => ageGroupOf(p) === 'child').length,
    infant: people.filter((p) => ageGroupOf(p) === 'infant').length,
  };
}

export function ageSummary(people: Member[]): string {
  const c = countByAge(people);
  const n = (k: number, one: string, many: string) => `${k} ${k === 1 ? one : many}`;
  const parts = [
    c.adult ? n(c.adult, 'adult', 'adults') : '',
    c.child ? n(c.child, 'child', 'children') : '',
    c.infant ? n(c.infant, 'infant', 'infants') : '',
  ].filter(Boolean);
  return parts.join(', ') || 'no one yet';
}

export function sharesLabel(heads: number): string {
  return `${heads} ${heads === 1 ? 'share' : 'shares'}`;
}

export function ageLabel(m: ShareFields, d: ShareDefaults = DEFAULT_SHARES): string {
  const g = ageGroupOf(m);
  if (g === 'adult') return 'Adult';
  const w = weightOf(m, d);
  const name = g === 'child' ? 'Child' : 'Infant';
  if (w === 0) return `${name} · not counted`;
  return `${name} · ${w}%`;
}

// ---------- families ----------

export const NO_FAMILY = 'No family';

/** Family name of a person (stored in the `relationship` field). */
export function familyOf(m: Pick<Member, 'relationship'>): string {
  return (m.relationship ?? '').trim().replace(/\s+/g, ' ');
}

/** Distinct family names, case-insensitively de-duplicated, sorted. */
export function familyNames(people: Member[]): string[] {
  const seen = new Map<string, string>();
  for (const p of people) {
    const f = familyOf(p);
    if (f && !seen.has(f.toLowerCase())) seen.set(f.toLowerCase(), f);
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b));
}

export interface FamilyGroup {
  name: string; // '' for people without a family
  members: Member[];
}

/** People grouped by family (sorted), with "no family" last. */
export function groupByFamily(people: Member[]): FamilyGroup[] {
  const map = new Map<string, FamilyGroup>();
  for (const p of people) {
    const f = familyOf(p);
    const key = f.toLowerCase();
    if (!map.has(key)) map.set(key, { name: f, members: [] });
    map.get(key)!.members.push(p);
  }
  const groups = [...map.values()];
  groups.forEach((g) => g.members.sort((a, b) => a.displayName.localeCompare(b.displayName)));
  return groups.sort((a, b) => (!a.name ? 1 : !b.name ? -1 : a.name.localeCompare(b.name)));
}
