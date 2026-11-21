import { describe, expect, it } from 'vitest';
import { computeSplits, equalSplit, isSplitConsistent } from './split';
import { formatINR, paiseToInput, rupeesToPaise } from './money';

describe('money', () => {
  it('parses rupee strings into paise', () => {
    expect(rupeesToPaise('1,250.5')).toBe(125050);
    expect(rupeesToPaise('100')).toBe(10000);
    expect(rupeesToPaise('0.07')).toBe(7);
    expect(rupeesToPaise('12.345')).toBeNull();
    expect(rupeesToPaise('-5')).toBeNull();
    expect(rupeesToPaise('abc')).toBeNull();
  });
  it('formats', () => {
    expect(paiseToInput(125050)).toBe('1250.50');
    expect(paiseToInput(10000)).toBe('100');
    expect(formatINR(1000000)).toBe('₹10,000');
    expect(formatINR(150)).toBe('₹1.50');
  });
});

describe('equalSplit', () => {
  it('sums exactly with remainders', () => {
    const s = equalSplit(1000, ['c', 'a', 'b']);
    expect(s).toEqual({ a: 334, b: 333, c: 333 });
    expect(Object.values(s).reduce((x, y) => x + y)).toBe(1000);
  });
  it('dedupes members', () => {
    expect(equalSplit(100, ['a', 'a'])).toEqual({ a: 100 });
  });
});

describe('computeSplits', () => {
  const all = ['a', 'b', 'c', 'd'];
  it('equal among all members', () => {
    const r = computeSplits({ method: 'equal_all', amount: 1000, allMemberUids: all, selectedUids: [], custom: {} });
    expect(r.ok && Object.keys(r.splits).length).toBe(4);
  });
  it('trip-wide behaves like all members', () => {
    const r = computeSplits({ method: 'trip_wide', amount: 1001, allMemberUids: all, selectedUids: [], custom: {} });
    expect(r.ok && isSplitConsistent(1001, r.splits)).toBe(true);
  });
  it('selected members only', () => {
    const r = computeSplits({ method: 'equal_selected', amount: 900, allMemberUids: all, selectedUids: ['a', 'b'], custom: {} });
    expect(r).toEqual({ ok: true, splits: { a: 450, b: 450 } });
  });
  it('requires a selection', () => {
    expect(computeSplits({ method: 'equal_selected', amount: 900, allMemberUids: all, selectedUids: [], custom: {} }).ok).toBe(false);
  });
  it('custom amounts must add up exactly', () => {
    const bad = computeSplits({ method: 'custom', amount: 1000, allMemberUids: all, selectedUids: ['a', 'b'], custom: { a: 600, b: 300 } });
    expect(bad.ok).toBe(false);
    const good = computeSplits({ method: 'custom', amount: 1000, allMemberUids: all, selectedUids: ['a', 'b'], custom: { a: 700, b: 300 } });
    expect(good).toEqual({ ok: true, splits: { a: 700, b: 300 } });
  });
  it('rejects zero amounts', () => {
    expect(computeSplits({ method: 'equal_all', amount: 0, allMemberUids: all, selectedUids: [], custom: {} }).ok).toBe(false);
  });
});
