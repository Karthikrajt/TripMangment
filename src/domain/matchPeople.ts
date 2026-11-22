/**
 * Suggest which traveller (added by the admin) a newly signed-in person is,
 * from their Google name and email. Email match is certain; names are
 * compared word by word, ignoring case, punctuation and initials
 * ("KARTHIK RAJ T" ≈ "Karthik Raj Thangavel").
 */
import type { Member } from './types';

export interface MatchCandidate {
  person: Member;
  score: number; // 0–100
  reason: 'email' | 'name';
}

const words = (s: string) =>
  (s ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);

/** Name similarity 0–100. Initials match a word starting with that letter. */
export function nameScore(a: string, b: string): number {
  const A = words(a);
  const B = words(b);
  if (!A.length || !B.length) return 0;
  const full = (w: string[]) => w.filter((x) => x.length > 1);
  const fa = full(A);
  const fb = full(B);
  if (fa.join(' ') && fa.join(' ') === fb.join(' ')) return 95;
  let hits = 0;
  const used = new Set<number>();
  for (const w of A) {
    const idx = B.findIndex((x, i) => !used.has(i) && (x === w || (w.length === 1 && x.startsWith(w)) || (x.length === 1 && w.startsWith(x))));
    if (idx >= 0) {
      used.add(idx);
      hits += w.length === 1 || B[idx].length === 1 ? 0.5 : 1;
    }
  }
  // Need at least one full-word match; initials alone never count.
  const fullHits = fa.filter((w) => fb.includes(w)).length;
  if (!fullHits) return 0;
  return Math.round((hits / Math.max(A.length, B.length)) * 90);
}

/** Unlinked travellers, best match first; only reasonable matches are returned. */
export function matchTravellers(displayName: string, email: string, travellers: Member[]): MatchCandidate[] {
  const mail = (email ?? '').trim().toLowerCase();
  return travellers
    .filter((p) => p.hasLogin === false && !p.linkedUid && p.status === 'approved')
    .map((p): MatchCandidate => {
      if (mail && p.email && p.email.toLowerCase() === mail) return { person: p, score: 100, reason: 'email' };
      return { person: p, score: nameScore(displayName, p.displayName), reason: 'name' };
    })
    .filter((c) => c.score >= 40)
    .sort((a, b) => b.score - a.score || a.person.displayName.localeCompare(b.person.displayName));
}

/** Travellers that a newly joined person could still claim. */
export function unclaimedTravellers(members: Member[]): Member[] {
  return members.filter((p) => p.hasLogin === false && !p.linkedUid && p.status === 'approved').sort((a, b) => a.displayName.localeCompare(b.displayName));
}
