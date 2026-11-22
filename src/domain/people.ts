/**
 * "People" = the travellers the trip is planned and split for.
 * - Admin-added travellers (no login) and approved sign-in accounts that are
 *   NOT linked to a traveller are people.
 * - A sign-in account linked to a traveller (`personId`) is represented by
 *   that traveller, so it is not listed separately.
 */
import type { AgeGroup, Member } from './types';

export const DEFAULT_WEIGHT: Record<AgeGroup, number> = { adult: 100, child: 50, infant: 0 };

export function ageGroupOf(m: Pick<Member, 'ageGroup'>): AgeGroup {
  return m.ageGroup ?? 'adult';
}

/** Share weight in percent (0–100). Infants are always 0. */
export function weightOf(m: Pick<Member, 'ageGroup' | 'shareWeight'>): number {
  const g = ageGroupOf(m);
  if (g === 'infant') return 0;
  const w = m.shareWeight ?? DEFAULT_WEIGHT[g];
  return Number.isInteger(w) && w >= 0 && w <= 100 ? w : DEFAULT_WEIGHT[g];
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

export function weightsOf(people: Member[]): Record<string, number> {
  return Object.fromEntries(people.map((p) => [p.uid, weightOf(p)]));
}

/** Sum of weights / 100, i.e. how many "full adult shares" the group has. */
export function headCount(people: Member[]): number {
  return people.reduce((a, p) => a + weightOf(p), 0) / 100;
}

export function countByAge(people: Member[]) {
  return {
    adult: people.filter((p) => ageGroupOf(p) === 'adult').length,
    child: people.filter((p) => ageGroupOf(p) === 'child').length,
    infant: people.filter((p) => ageGroupOf(p) === 'infant').length,
  };
}

export function ageLabel(m: Pick<Member, 'ageGroup' | 'shareWeight'>): string {
  const g = ageGroupOf(m);
  if (g === 'infant') return 'Infant · not counted';
  if (g === 'child') return `Child · ${weightOf(m)}%`;
  return weightOf(m) === 100 ? 'Adult' : `Adult · ${weightOf(m)}%`;
}

export function ageSummary(people: Member[]): string {
  const c = countByAge(people);
  const n = (k: number, one: string, many: string) => `${k} ${k === 1 ? one : many}`;
  return [n(c.adult, 'adult', 'adults'), n(c.child, 'child', 'children'), n(c.infant, 'infant', 'infants')].join(', ');
}
