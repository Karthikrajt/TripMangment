import { describe, expect, it } from 'vitest';
import { headCount, peopleOf, personIdOf, weightOf } from './people';
import type { Member } from './types';

const m = (p: Partial<Member>) => ({ uid: 'x', status: 'approved', ...p }) as Member;

describe('people', () => {
  it('weights by age group', () => {
    expect(weightOf(m({}))).toBe(100);
    expect(weightOf(m({ ageGroup: 'child' }))).toBe(50);
    expect(weightOf(m({ ageGroup: 'child', shareWeight: 75 }))).toBe(75);
    expect(weightOf(m({ ageGroup: 'infant', shareWeight: 50 }))).toBe(0);
  });
  it('hides linked sign-in accounts and non-approved members', () => {
    const list = [m({ uid: 'p1' }), m({ uid: 'login', personId: 'p1' }), m({ uid: 'pend', status: 'pending' })];
    expect(peopleOf(list).map((x) => x.uid)).toEqual(['p1']);
  });
  it('resolves the acting person', () => {
    expect(personIdOf(m({ uid: 'login', personId: 'p1' }))).toBe('p1');
    expect(personIdOf(m({ uid: 'admin' }))).toBe('admin');
  });
  it('counts heads', () => {
    expect(headCount([m({}), m({ ageGroup: 'child' }), m({ ageGroup: 'infant' })])).toBe(1.5);
  });
});
