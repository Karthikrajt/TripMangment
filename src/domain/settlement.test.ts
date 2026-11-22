import { describe, expect, it } from 'vitest';
import { computeSettlement, familyBalances, suggestTransfers } from './settlement';
import type { Expense, Settlement } from './types';

const exp = (p: Partial<Expense>): Expense =>
  ({
    id: Math.random().toString(36),
    title: 't',
    category: 'Food',
    amountPaise: 0,
    expenseDate: '2026-12-01',
    paidBy: 'A',
    description: '',
    receiptPath: '',
    receiptName: '',
    splitMethod: 'equal_all',
    splits: {},
    status: 'approved',
    reviewNote: '',
    reviewedBy: '',
    reviewedAt: null,
    createdBy: 'A',
    createdAt: null,
    updatedAt: null,
    ...p,
  }) as Expense;

describe('computeSettlement', () => {
  it('matches the specification example', () => {
    // A paid 10,000; B paid 2,000; C paid 3,000; each owes 5,000.
    const share = { A: 166667, B: 166667, C: 166666 };
    const expenses = [
      exp({ paidBy: 'A', amountPaise: 1000000, splits: { A: 333334, B: 333333, C: 333333 } }),
      exp({ paidBy: 'B', amountPaise: 200000, splits: { A: 66667, B: 66667, C: 66666 } }),
      exp({ paidBy: 'C', amountPaise: 300000, splits: { A: 99999, B: 100000, C: 100001 } }),
    ];
    void share;
    const r = computeSettlement(expenses, [], ['A', 'B', 'C']);
    const by = Object.fromEntries(r.balances.map((b) => [b.uid, b]));
    expect(r.totalApproved).toBe(1500000);
    expect(by.A.net).toBe(500000);
    expect(by.B.net).toBe(-300000);
    expect(by.C.net).toBe(-200000);
    expect(r.suggestions).toEqual([
      { fromUid: 'B', toUid: 'A', amountPaise: 300000 },
      { fromUid: 'C', toUid: 'A', amountPaise: 200000 },
    ]);
  });

  it('ignores pending/rejected expenses and flags inconsistent ones', () => {
    const r = computeSettlement(
      [
        exp({ status: 'pending', amountPaise: 100, splits: { A: 100 } }),
        exp({ status: 'rejected', amountPaise: 100, splits: { A: 100 } }),
        exp({ amountPaise: 100, splits: { A: 50 } }),
      ],
      [],
      ['A'],
    );
    expect(r.totalApproved).toBe(0);
    expect(r.inconsistent).toHaveLength(1);
  });

  it('applies paid settlements without touching expenses', () => {
    const expenses = [exp({ paidBy: 'A', amountPaise: 1000, splits: { A: 500, B: 500 } })];
    const settlements: Settlement[] = [
      { id: 's', fromUid: 'B', toUid: 'A', amountPaise: 500, status: 'paid', paidDate: '', reference: '', notes: '', createdBy: 'A', createdAt: null, updatedAt: null },
    ];
    const r = computeSettlement(expenses, settlements, ['A', 'B']);
    expect(r.balances.every((b) => b.outstanding === 0)).toBe(true);
    expect(r.suggestions).toEqual([]);
  });
});

describe('suggestTransfers', () => {
  it('always balances to zero', () => {
    const balances = [
      { uid: 'a', outstanding: 700 },
      { uid: 'b', outstanding: -300 },
      { uid: 'c', outstanding: -250 },
      { uid: 'd', outstanding: -150 },
    ];
    const t = suggestTransfers(balances);
    const net: Record<string, number> = { a: 700, b: -300, c: -250, d: -150 };
    for (const x of t) {
      net[x.fromUid] += x.amountPaise;
      net[x.toUid] -= x.amountPaise;
    }
    expect(Object.values(net).every((v) => v === 0)).toBe(true);
    expect(t.length).toBeLessThanOrEqual(3);
  });
});

describe('familyBalances', () => {
  it('sums members per family and keeps no-family last', () => {
    const fam: Record<string, string> = { a: 'Alpha Family', b: 'alpha family', c: '' };
    const r = familyBalances(
      [
        { uid: 'a', paid: 1000, share: 400, settledIn: 0, settledOut: 0, net: 600, outstanding: 600 },
        { uid: 'b', paid: 0, share: 300, settledIn: 0, settledOut: 0, net: -300, outstanding: -300 },
        { uid: 'c', paid: 0, share: 300, settledIn: 0, settledOut: 0, net: -300, outstanding: -300 },
      ],
      (u) => fam[u],
    );
    expect(r).toEqual([
      { family: 'Alpha Family', uids: ['a', 'b'], paid: 1000, share: 700, outstanding: 300 },
      { family: '', uids: ['c'], paid: 0, share: 300, outstanding: -300 },
    ]);
  });
});
