import type { Paise, SplitMethod } from './types';
import { sumPaise } from './money';

/**
 * Split `amount` paise equally among `uids`. Remainder paise are distributed
 * one each to the first members in a stable (sorted) order so the result is
 * deterministic and always sums exactly to `amount`.
 */
export function equalSplit(amount: Paise, uids: string[]): Record<string, Paise> {
  const unique = [...new Set(uids)].sort();
  if (unique.length === 0) return {};
  const base = Math.floor(amount / unique.length);
  let remainder = amount - base * unique.length;
  const out: Record<string, Paise> = {};
  for (const uid of unique) {
    out[uid] = base + (remainder > 0 ? 1 : 0);
    if (remainder > 0) remainder -= 1;
  }
  return out;
}

export interface SplitInput {
  method: SplitMethod;
  amount: Paise;
  /** all approved member uids (used for equal_all / trip_wide) */
  allMemberUids: string[];
  /** selected members (equal_selected / custom) */
  selectedUids: string[];
  /** custom amounts per uid (custom only) */
  custom: Record<string, Paise>;
}

export type SplitResult = { ok: true; splits: Record<string, Paise> } | { ok: false; error: string };

export function computeSplits(input: SplitInput): SplitResult {
  const { method, amount } = input;
  if (!Number.isSafeInteger(amount) || amount <= 0) return { ok: false, error: 'Amount must be greater than zero.' };

  switch (method) {
    case 'equal_all':
    case 'trip_wide': {
      if (input.allMemberUids.length === 0) return { ok: false, error: 'There are no approved members to split with.' };
      return { ok: true, splits: equalSplit(amount, input.allMemberUids) };
    }
    case 'equal_selected': {
      if (input.selectedUids.length === 0) return { ok: false, error: 'Select at least one member.' };
      return { ok: true, splits: equalSplit(amount, input.selectedUids) };
    }
    case 'custom': {
      const splits: Record<string, Paise> = {};
      for (const uid of input.selectedUids) {
        const v = input.custom[uid] ?? 0;
        if (!Number.isSafeInteger(v) || v < 0) return { ok: false, error: 'Custom amounts must be valid positive numbers.' };
        if (v > 0) splits[uid] = v;
      }
      if (Object.keys(splits).length === 0) return { ok: false, error: 'Enter an amount for at least one member.' };
      const total = sumPaise(Object.values(splits));
      if (total !== amount) {
        return { ok: false, error: `Split amounts add up to ${(total / 100).toFixed(2)} but the expense is ${(amount / 100).toFixed(2)}.` };
      }
      return { ok: true, splits };
    }
    default:
      return { ok: false, error: 'Unknown split method.' };
  }
}

/** True when a stored split map is internally consistent with the total. */
export function isSplitConsistent(amount: Paise, splits: Record<string, Paise>): boolean {
  const values = Object.values(splits ?? {});
  if (values.length === 0) return false;
  if (values.some((v) => !Number.isSafeInteger(v) || v < 0)) return false;
  return sumPaise(values) === amount;
}

export const SPLIT_METHOD_LABELS: Record<SplitMethod, string> = {
  equal_all: 'Equal – all members',
  equal_selected: 'Equal – selected members',
  custom: 'Custom amount per member',
  trip_wide: 'Trip-wide shared expense',
};
