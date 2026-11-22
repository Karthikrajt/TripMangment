import type { Paise, SplitMethod } from './types';
import { sumPaise } from './money';

/**
 * Split `amount` paise in proportion to `weights` (per-head percentages:
 * adult 100, child e.g. 50, infant 0). Uses the largest-remainder method so
 * the parts always sum exactly to `amount`; ties break by id for determinism.
 * Zero-weight people get no share.
 */
export function weightedSplit(amount: Paise, weights: Record<string, number>): Record<string, Paise> {
  const ids = Object.keys(weights).filter((id) => weights[id] > 0).sort();
  const total = ids.reduce((a, id) => a + weights[id], 0);
  if (!ids.length || total <= 0) return {};
  const out: Record<string, Paise> = {};
  const rema: { id: string; r: number }[] = [];
  let allocated = 0;
  for (const id of ids) {
    const exact = amount * weights[id];
    const base = Math.floor(exact / total);
    out[id] = base;
    allocated += base;
    rema.push({ id, r: exact - base * total });
  }
  rema.sort((a, b) => b.r - a.r || a.id.localeCompare(b.id));
  for (let i = 0; allocated < amount; i++, allocated++) out[rema[i % rema.length].id] += 1;
  return out;
}

/** Equal split (everyone weight 1). */
export function equalSplit(amount: Paise, uids: string[]): Record<string, Paise> {
  return weightedSplit(amount, Object.fromEntries([...new Set(uids)].map((u) => [u, 1])));
}

export interface SplitInput {
  method: SplitMethod;
  amount: Paise;
  /** all people on the trip (used for equal_all / trip_wide) */
  allMemberUids: string[];
  /** selected people (equal_selected / custom) */
  selectedUids: string[];
  /** custom amounts per person (custom only) */
  custom: Record<string, Paise>;
  /** per-head weights in percent; missing ids count as 100 (adult) */
  weights?: Record<string, number>;
}

export type SplitResult = { ok: true; splits: Record<string, Paise> } | { ok: false; error: string };

export function computeSplits(input: SplitInput): SplitResult {
  const { method, amount } = input;
  if (!Number.isSafeInteger(amount) || amount <= 0) return { ok: false, error: 'Amount must be greater than zero.' };
  const w = (ids: string[]) => Object.fromEntries([...new Set(ids)].map((id) => [id, input.weights?.[id] ?? 100]));

  switch (method) {
    case 'equal_all':
    case 'trip_wide': {
      if (input.allMemberUids.length === 0) return { ok: false, error: 'There are no people on the trip to split with.' };
      const splits = weightedSplit(amount, w(input.allMemberUids));
      if (!Object.keys(splits).length) return { ok: false, error: 'Nobody is counted for this split (infants are not counted).' };
      return { ok: true, splits };
    }
    case 'equal_selected': {
      if (input.selectedUids.length === 0) return { ok: false, error: 'Select at least one person.' };
      const splits = weightedSplit(amount, w(input.selectedUids));
      if (!Object.keys(splits).length) return { ok: false, error: 'Only infants are selected, and infants are not counted. Use a custom split instead.' };
      return { ok: true, splits };
    }
    case 'custom': {
      const splits: Record<string, Paise> = {};
      for (const uid of input.selectedUids) {
        const v = input.custom[uid] ?? 0;
        if (!Number.isSafeInteger(v) || v < 0) return { ok: false, error: 'Custom amounts must be valid positive numbers.' };
        if (v > 0) splits[uid] = v;
      }
      if (Object.keys(splits).length === 0) return { ok: false, error: 'Enter an amount for at least one person.' };
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
  equal_all: 'Per head – everyone (children by %, infants free)',
  equal_selected: 'Per head – selected people only',
  custom: 'Custom amount per person',
  trip_wide: 'Per head – everyone (trip-wide)',
};

/** Methods offered in the form (trip_wide kept only for older records). */
export const SPLIT_METHODS_OFFERED: SplitMethod[] = ['equal_all', 'equal_selected', 'custom'];
