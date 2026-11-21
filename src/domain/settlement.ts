import type { Expense, Paise, Settlement } from './types';
import { isSplitConsistent } from './split';

export interface MemberBalance {
  uid: string;
  paid: Paise; // total paid for approved expenses
  share: Paise; // total allocated share
  settledOut: Paise; // settlements this member has paid (marked paid)
  settledIn: Paise; // settlements this member has received (marked paid)
  /** paid - share (before settlements) */
  net: Paise;
  /** net adjusted for completed settlements: >0 receive, <0 pay */
  outstanding: Paise;
}

export interface Transfer {
  fromUid: string;
  toUid: string;
  amountPaise: Paise;
}

export interface SettlementSummary {
  totalApproved: Paise;
  balances: MemberBalance[];
  suggestions: Transfer[];
  /** approved expenses skipped because split data does not add up */
  inconsistent: Expense[];
}

/**
 * Compute balances from APPROVED expenses only. Completed (paid) settlement
 * records are applied separately so original expenses are never altered.
 */
export function computeSettlement(
  expenses: Expense[],
  settlements: Settlement[],
  memberUids: string[],
): SettlementSummary {
  const map = new Map<string, MemberBalance>();
  const get = (uid: string) => {
    let b = map.get(uid);
    if (!b) {
      b = { uid, paid: 0, share: 0, settledOut: 0, settledIn: 0, net: 0, outstanding: 0 };
      map.set(uid, b);
    }
    return b;
  };
  memberUids.forEach(get);

  let totalApproved = 0;
  const inconsistent: Expense[] = [];
  for (const e of expenses) {
    if (e.status !== 'approved') continue;
    if (!isSplitConsistent(e.amountPaise, e.splits)) {
      inconsistent.push(e);
      continue;
    }
    totalApproved += e.amountPaise;
    get(e.paidBy).paid += e.amountPaise;
    for (const [uid, share] of Object.entries(e.splits)) get(uid).share += share;
  }

  for (const s of settlements) {
    if (s.status !== 'paid') continue;
    get(s.fromUid).settledOut += s.amountPaise;
    get(s.toUid).settledIn += s.amountPaise;
  }

  const balances = [...map.values()].map((b) => {
    const net = b.paid - b.share;
    return { ...b, net, outstanding: net + b.settledOut - b.settledIn };
  });
  balances.sort((a, b) => b.outstanding - a.outstanding || a.uid.localeCompare(b.uid));

  return { totalApproved, balances, suggestions: suggestTransfers(balances), inconsistent };
}

/**
 * Greedy minimum-cash-flow: repeatedly match the largest debtor with the
 * largest creditor. Produces at most n-1 transfers and settles exactly.
 */
export function suggestTransfers(balances: Pick<MemberBalance, 'uid' | 'outstanding'>[]): Transfer[] {
  const creditors = balances.filter((b) => b.outstanding > 0).map((b) => ({ uid: b.uid, amt: b.outstanding }));
  const debtors = balances.filter((b) => b.outstanding < 0).map((b) => ({ uid: b.uid, amt: -b.outstanding }));
  const byAmt = (a: { uid: string; amt: number }, b: { uid: string; amt: number }) => b.amt - a.amt || a.uid.localeCompare(b.uid);
  const out: Transfer[] = [];
  while (creditors.length && debtors.length) {
    creditors.sort(byAmt);
    debtors.sort(byAmt);
    const c = creditors[0];
    const d = debtors[0];
    const amt = Math.min(c.amt, d.amt);
    out.push({ fromUid: d.uid, toUid: c.uid, amountPaise: amt });
    c.amt -= amt;
    d.amt -= amt;
    if (c.amt === 0) creditors.shift();
    if (d.amt === 0) debtors.shift();
  }
  return out;
}
