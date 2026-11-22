import { describe, expect, it } from 'vitest';
import {
  addDaysISO, applyFilters, dateOptions, EMPTY_FILTERS, isTicketCompleted, NONE, pruneSelection,
  splitByCompletion, trainKey, trainOptions, type FilterContext,
} from './ticketFilters';
import { todayIST } from '../lib/format';
import type { Ticket } from './types';

// Made-up data only.
const tk = (p: Partial<Ticket>): Ticket =>
  ({
    id: Math.random().toString(36).slice(2), title: 'Test', pnr: '1111111111', trainName: '', trainNumber: '', journeyDate: '',
    boardingStation: 'AAA', destinationStation: 'BBB', departureTime: '', arrivalTime: '', passengerNames: [], passengerUids: [],
    coach: '', seats: '', travelClass: '', notes: '', filePath: '', fileName: '', fileType: 'application/pdf', fileSize: 1,
    uploadedBy: 'u1', uploadedByName: 'Tester', locked: false, createdAt: null, updatedAt: null, ...p,
  }) as Ticket;

const ctx: FilterContext = { myPersonId: 'p1', myUid: 'u1', nameOf: (id) => ({ p1: 'Asha Test', p2: 'Ben Sample' })[id] ?? '' };

describe('addDaysISO', () => {
  it('rolls over months and years', () => {
    expect(addDaysISO('2027-01-30', 2)).toBe('2027-02-01');
    expect(addDaysISO('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDaysISO('2028-02-28', 1)).toBe('2028-02-29'); // leap year
    expect(addDaysISO('2027-02-28', 2)).toBe('2027-03-02');
  });
});

describe('isTicketCompleted', () => {
  const t = tk({ journeyDate: '2027-01-15' });
  it('is active on the journey day and the day after, completed from day +2', () => {
    expect(isTicketCompleted(t, '2027-01-15')).toBe(false);
    expect(isTicketCompleted(t, '2027-01-16')).toBe(false);
    expect(isTicketCompleted(t, '2027-01-17')).toBe(true);
    expect(isTicketCompleted(t, '2027-03-01')).toBe(true);
  });
  it('uses IST midnight, not UTC', () => {
    // 18:29 UTC on 16 Jan = 23:59 IST on 16 Jan → still active
    expect(isTicketCompleted(t, todayIST(new Date('2027-01-16T18:29:00Z')))).toBe(false);
    // 18:30 UTC on 16 Jan = 00:00 IST on 17 Jan → completed
    expect(isTicketCompleted(t, todayIST(new Date('2027-01-16T18:30:00Z')))).toBe(true);
  });
  it('handles month and year rollover', () => {
    expect(isTicketCompleted(tk({ journeyDate: '2026-12-30' }), '2027-01-01')).toBe(true);
    expect(isTicketCompleted(tk({ journeyDate: '2026-12-31' }), '2027-01-01')).toBe(false);
    expect(isTicketCompleted(tk({ journeyDate: '2027-01-31' }), '2027-02-02')).toBe(true);
  });
  it('never completes a ticket without a date', () => {
    expect(isTicketCompleted(tk({ journeyDate: '' }), '2099-01-01')).toBe(false);
  });
});

describe('options', () => {
  const list = [
    tk({ journeyDate: '2027-01-18', trainNumber: '11111', trainName: 'TEST EXP' }),
    tk({ journeyDate: '2027-01-18', trainNumber: '11111', trainName: '' }),
    tk({ journeyDate: '2027-01-10', trainNumber: '', trainName: 'Sample Mail' }),
    tk({ journeyDate: '', trainNumber: '', trainName: '' }),
  ];
  it('lists dates earliest first with counts and Date not set last', () => {
    expect(dateOptions(list)).toEqual([
      { value: '2027-01-10', label: '10-01-2027', count: 1 },
      { value: '2027-01-18', label: '18-01-2027', count: 2 },
      { value: NONE, label: 'Date not set', count: 1 },
    ]);
  });
  it('groups trains by number, falls back to name, and adds Train not set', () => {
    expect(trainOptions(list)).toEqual([
      { value: 'no:11111', label: '11111 TEST EXP', count: 2 },
      { value: 'name:SAMPLE MAIL', label: 'Sample Mail', count: 1 },
      { value: NONE, label: 'Train not set', count: 1 },
    ]);
    expect(trainKey({ trainNumber: '  ', trainName: '  ' })).toBe(NONE);
  });
});

describe('applyFilters', () => {
  const a = tk({ journeyDate: '2027-01-18', trainNumber: '11111', passengerUids: ['p1'], uploadedBy: 'u2' });
  const b = tk({ journeyDate: '2027-01-18', trainNumber: '22222', passengerUids: ['p2'], uploadedBy: 'u1', passengerNames: ['Guest One'] });
  const c = tk({ journeyDate: '2027-01-20', trainNumber: '11111', passengerUids: ['p2'], uploadedBy: 'u1' });
  const d = tk({ journeyDate: '', trainNumber: '' });
  const all = [a, b, c, d];

  it('combines date, train, tab and search', () => {
    expect(applyFilters(all, { ...EMPTY_FILTERS, date: '2027-01-18' }, ctx)).toEqual([a, b]);
    expect(applyFilters(all, { ...EMPTY_FILTERS, date: '2027-01-18', train: 'no:11111' }, ctx)).toEqual([a]);
    expect(applyFilters(all, { ...EMPTY_FILTERS, train: 'no:11111', tab: 'uploaded' }, ctx)).toEqual([c]);
    expect(applyFilters(all, { ...EMPTY_FILTERS, tab: 'mine' }, ctx)).toEqual([a]);
    expect(applyFilters(all, { ...EMPTY_FILTERS, date: NONE, train: NONE }, ctx)).toEqual([d]);
    expect(applyFilters(all, { ...EMPTY_FILTERS, date: '2027-01-18', q: 'guest' }, ctx)).toEqual([b]);
  });
  it('searches the displayed date and member names', () => {
    expect(applyFilters(all, { ...EMPTY_FILTERS, q: '20-01-2027' }, ctx)).toEqual([c]);
    expect(applyFilters(all, { ...EMPTY_FILTERS, q: 'asha' }, ctx)).toEqual([a]);
  });
  it('resets selections whose option disappeared', () => {
    const f = { ...EMPTY_FILTERS, date: '2027-01-20', train: 'no:99999' };
    const pruned = pruneSelection(f, dateOptions([a, b]), trainOptions([a, b]));
    expect(pruned).toEqual({ ...f, date: '', train: '' });
    const kept = { ...EMPTY_FILTERS, date: '2027-01-18' };
    expect(pruneSelection(kept, dateOptions([a]), trainOptions([a]))).toBe(kept);
  });
});

describe('splitByCompletion', () => {
  it('puts completed below, newest first; undated stay active and last', () => {
    const old1 = tk({ journeyDate: '2027-01-01' });
    const old2 = tk({ journeyDate: '2027-01-05' });
    const soon = tk({ journeyDate: '2027-01-20' });
    const yday = tk({ journeyDate: '2027-01-09' });
    const undated = tk({ journeyDate: '' });
    const r = splitByCompletion([undated, old1, soon, old2, yday], '2027-01-10');
    expect(r.active).toEqual([yday, soon, undated]);
    expect(r.completed).toEqual([old2, old1]);
  });
});
