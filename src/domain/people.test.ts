import { describe, expect, it } from 'vitest';
import { ageLabel, ageSummary, familyNames, groupByFamily, hasCustomShare, headCount, peopleOf, personIdOf, sharesFromTrip, weightOf } from './people';
import type { Member } from './types';

// Made-up data only.
const m = (p: Partial<Member>) => ({ uid: Math.random().toString(36), status: 'approved', displayName: 'X', relationship: '', ...p }) as Member;

describe('share weights', () => {
  const d = { child: 60, infant: 10 };
  it('adults are always 100', () => {
    expect(weightOf(m({}), d)).toBe(100);
    expect(weightOf(m({ ageGroup: 'adult', shareWeight: 40, customShare: true }), d)).toBe(100);
  });
  it('children and infants follow the trip default', () => {
    expect(weightOf(m({ ageGroup: 'child' }), d)).toBe(60);
    expect(weightOf(m({ ageGroup: 'infant' }), d)).toBe(10);
    expect(weightOf(m({ ageGroup: 'child', shareWeight: 75, customShare: false }), d)).toBe(60);
  });
  it('a custom share overrides the default, including for infants', () => {
    expect(weightOf(m({ ageGroup: 'child', shareWeight: 75, customShare: true }), d)).toBe(75);
    expect(weightOf(m({ ageGroup: 'infant', shareWeight: 25, customShare: true }), d)).toBe(25);
  });
  it('treats older records as custom only when they differ from the old default', () => {
    expect(hasCustomShare(m({ ageGroup: 'child', shareWeight: 50 }))).toBe(false);
    expect(hasCustomShare(m({ ageGroup: 'child', shareWeight: 70 }))).toBe(true);
    expect(hasCustomShare(m({ ageGroup: 'infant', shareWeight: 0 }))).toBe(false);
  });
  it('reads defaults from the trip with safe fallbacks', () => {
    expect(sharesFromTrip(null)).toEqual({ child: 50, infant: 0 });
    expect(sharesFromTrip({ childSharePercent: 40, infantSharePercent: 5 })).toEqual({ child: 40, infant: 5 });
    expect(sharesFromTrip({ childSharePercent: 140, infantSharePercent: -1 })).toEqual({ child: 50, infant: 0 });
  });
  it('labels', () => {
    expect(ageLabel(m({ ageGroup: 'infant' }))).toBe('Infant · not counted');
    expect(ageLabel(m({ ageGroup: 'infant' }), { child: 50, infant: 20 })).toBe('Infant · 20%');
  });
  it('counts heads', () => {
    expect(headCount([m({}), m({ ageGroup: 'child' }), m({ ageGroup: 'infant' })])).toBe(1.5);
    expect(headCount([m({}), m({ ageGroup: 'child' }), m({ ageGroup: 'infant' })], { child: 30, infant: 10 })).toBe(1.4);
  });
});

describe('people', () => {
  it('hides linked sign-in accounts and non-approved members', () => {
    const list = [m({ uid: 'p1' }), m({ uid: 'login', personId: 'p1' }), m({ uid: 'pend', status: 'pending' })];
    expect(peopleOf(list).map((x) => x.uid)).toEqual(['p1']);
  });
  it('resolves the acting person', () => {
    expect(personIdOf(m({ uid: 'login', personId: 'p1' }))).toBe('p1');
    expect(personIdOf(m({ uid: 'admin' }))).toBe('admin');
  });
});

describe('families', () => {
  const people = [
    m({ displayName: 'B', relationship: 'Alpha Family' }),
    m({ displayName: 'A', relationship: 'alpha family ' }),
    m({ displayName: 'C', relationship: 'Beta Family' }),
    m({ displayName: 'D', relationship: '' }),
  ];
  it('lists distinct family names ignoring case and spacing', () => {
    expect(familyNames(people)).toEqual(['Alpha Family', 'Beta Family']);
  });
  it('groups people by family with no-family last', () => {
    const g = groupByFamily(people);
    expect(g.map((x) => [x.name, x.members.map((p) => p.displayName)])).toEqual([
      ['Alpha Family', ['A', 'B']],
      ['Beta Family', ['C']],
      ['', ['D']],
    ]);
  });
});

describe('ageSummary', () => {
  it('hides zero groups', () => {
    expect(ageSummary([m({})])).toBe('1 adult');
    expect(ageSummary([m({}), m({}), m({ ageGroup: 'infant' })])).toBe('2 adults, 1 infant');
    expect(ageSummary([])).toBe('no one yet');
  });
});
