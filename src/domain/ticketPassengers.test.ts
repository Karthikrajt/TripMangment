import { describe, expect, it } from 'vitest';
import { berthLabel, derivedTicketFields, emptyPassenger as P, normaliseStatus, passengersOf, statusKind, ticketStatusSummary, validatePassengers } from './ticketPassengers';

// Made-up data only.
const names: Record<string, string> = { p1: 'Asha Test', p2: 'Ben Sample' };
const nameOf = (id: string) => names[id] ?? '';

describe('status', () => {
  it('normalises typed statuses', () => {
    expect(normaliseStatus(' cnf ')).toBe('CNF');
    expect(normaliseStatus('rlwl4')).toBe('RLWL 4');
    expect(normaliseStatus('wl-12')).toBe('WL 12');
    expect(normaliseStatus('RAC 3')).toBe('RAC 3');
  });
  it('classifies', () => {
    expect(statusKind('CNF')).toBe('confirmed');
    expect(statusKind('RAC 3')).toBe('rac');
    expect(statusKind('RLWL 4')).toBe('waiting');
    expect(statusKind('GNWL 20')).toBe('waiting');
    expect(statusKind('CAN')).toBe('cancelled');
    expect(statusKind('')).toBe('unknown');
  });
  it('summarises a ticket', () => {
    expect(ticketStatusSummary([P({ status: 'CNF' }), P({ status: 'cnf' })])).toBe('CNF');
    expect(ticketStatusSummary([P({ status: 'RLWL 4' }), P({ status: 'RLWL 7' }), P({ status: 'RLWL 5' })])).toBe('RLWL 4–7');
    expect(ticketStatusSummary([P({ status: 'WL 3' })])).toBe('WL 3');
    expect(ticketStatusSummary([P({ status: 'CNF' }), P({ status: 'WL 2' })])).toBe('CNF + WL');
    expect(ticketStatusSummary([P({ status: 'CAN' })])).toBe('CAN');
    expect(ticketStatusSummary([P({ status: 'CNF' }), P({ status: 'CAN' })])).toBe('CNF');
    expect(ticketStatusSummary([])).toBe('');
  });
});

describe('berthLabel', () => {
  it('formats coach, berth and type', () => {
    expect(berthLabel({ coach: 'M2', berth: '58', berthType: 'MB' })).toBe('M2 · 58 MB');
    expect(berthLabel({ coach: 'S1', berth: '', berthType: '' })).toBe('S1');
    expect(berthLabel({ coach: '', berth: '', berthType: '' })).toBe('');
  });
});

describe('passengersOf', () => {
  it('rebuilds older tickets from ids and names', () => {
    const r = passengersOf({ passengerUids: ['p1'], passengerNames: ['Guest'], coach: 'S1' }, nameOf);
    expect(r.map((p) => [p.name, p.personId, p.coach, p.status])).toEqual([['Asha Test', 'p1', 'S1', ''], ['Guest', '', 'S1', '']]);
  });
  it('uses stored passengers and fills linked names', () => {
    const r = passengersOf({ passengers: [P({ personId: 'p2', name: '', berth: '12' })], passengerUids: ['p2'], passengerNames: [], coach: '' }, nameOf);
    expect(r[0].name).toBe('Ben Sample');
    expect(r[0].berth).toBe('12');
  });
});

describe('derivedTicketFields', () => {
  it('keeps passengerUids / names / coach / seats in sync', () => {
    const d = derivedTicketFields([
      P({ personId: 'p1', name: 'Asha Test', coach: 'm2', berth: '58', berthType: 'MB', status: 'cnf', age: 36 }),
      P({ name: 'Guest One', coach: 'M2', berth: '61', berthType: 'MB', status: 'CNF', age: 200 }),
      P({ name: '  ' }),
    ]);
    expect(d.passengerUids).toEqual(['p1']);
    expect(d.passengerNames).toEqual(['Guest One']);
    expect(d.coach).toBe('M2');
    expect(d.seats).toBe('58 MB, 61 MB');
    expect(d.passengers).toHaveLength(2);
    expect(d.passengers[0].status).toBe('CNF');
    expect(d.passengers[1].age).toBe(0);
  });
});

describe('validatePassengers', () => {
  it('needs at least one passenger and sane ages', () => {
    expect(validatePassengers([P()])).toBeTruthy();
    expect(validatePassengers([P({ name: 'A', age: 150 })])).toBeTruthy();
    expect(validatePassengers([P({ name: 'A', age: 30 })])).toBeNull();
  });
});
