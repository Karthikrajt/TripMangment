import { describe, expect, it } from 'vitest';
import { matchTravellers, nameScore, unclaimedTravellers } from './matchPeople';
import type { Member } from './types';

// Made-up names only.
const t = (displayName: string, p: Partial<Member> = {}) =>
  ({ uid: displayName, displayName, email: '', status: 'approved', hasLogin: false, linkedUid: '', ...p }) as Member;

describe('nameScore', () => {
  it('matches identical names ignoring case and punctuation', () => {
    expect(nameScore('Asha Test', 'ASHA TEST')).toBeGreaterThanOrEqual(90);
    expect(nameScore('Asha  Test.', 'asha test')).toBeGreaterThanOrEqual(90);
  });
  it('treats initials as matching', () => {
    expect(nameScore('Ravi Kumar T', 'Ravi Kumar Testname')).toBeGreaterThanOrEqual(70);
    expect(nameScore('R Kumar', 'Ravi Kumar')).toBeGreaterThanOrEqual(60);
  });
  it('partial first-name match scores lower', () => {
    const s = nameScore('Ravi Kumar', 'Ravi Shankar');
    expect(s).toBeGreaterThan(0);
    expect(s).toBeLessThan(60);
  });
  it('initials alone or unrelated names do not match', () => {
    expect(nameScore('R K', 'Ravi Kumar')).toBe(0);
    expect(nameScore('Asha Test', 'Ben Sample')).toBe(0);
    expect(nameScore('', 'Ben Sample')).toBe(0);
  });
});

describe('matchTravellers', () => {
  const list = [
    t('Ravi Kumar Testname'),
    t('Ravi Shankar'),
    t('Ben Sample', { email: 'ben@example.com' }),
    t('Asha Test', { linkedUid: 'someone' }),
    t('Old Login', { hasLogin: true }),
  ];
  it('email match comes first with certainty', () => {
    const r = matchTravellers('B S', 'BEN@example.com', list);
    expect(r[0]).toMatchObject({ reason: 'email', score: 100 });
    expect(r[0].person.displayName).toBe('Ben Sample');
  });
  it('ranks names and skips already-linked or login travellers', () => {
    const r = matchTravellers('Ravi Kumar T', 'x@example.com', list);
    // first-name-only matches are too weak to suggest; the full list is still offered
    expect(r.map((c) => c.person.displayName)).toEqual(['Ravi Kumar Testname']);
    expect(matchTravellers('Asha Test', '', list)).toEqual([]);
  });
  it('lists unclaimed travellers alphabetically', () => {
    expect(unclaimedTravellers(list).map((p) => p.displayName)).toEqual(['Ben Sample', 'Ravi Kumar Testname', 'Ravi Shankar']);
  });
});
