import { describe, expect, it } from 'vitest';
import { accountsFor, computeReminders, dueReminders, istToMs, prevDate } from './reminders';
import type { ItineraryItem, Member, Ticket, Vehicle } from './types';

const m = (p: Partial<Member>): Member => ({ uid: 'x', displayName: 'X', email: '', photoURL: '', phone: '', emergencyContact: '', relationship: '', role: 'member', status: 'approved', requestNote: '', requestedAt: null, decidedAt: null, decidedBy: '', updatedAt: null, ...p });
const members = [
  m({ uid: 'p_kid', hasLogin: false, linkedUid: '' }),
  m({ uid: 'p_mum', hasLogin: false, linkedUid: 'acc1' }),
  m({ uid: 'acc1', personId: 'p_mum' }),
  m({ uid: 'acc2' }),
  m({ uid: 'acc3', status: 'disabled' }),
];
const ticket = { id: 't1', title: '', trainName: 'Test Express', trainNumber: '12345', pnr: '1234567890', journeyDate: '2026-12-20', departureTime: '06:15', boardingStation: 'AAA', destinationStation: 'BBB', passengerUids: ['p_mum', 'p_kid', 'acc2'] } as unknown as Ticket;
const vehicle = { id: 'v1', vehicleType: 'Tempo', registrationNumber: 'XX 01', pickupDate: '2026-12-21', pickupTime: '09:30', pickupLocation: 'Hotel gate', driverPhone: '9000000000', memberUids: ['acc3', 'acc2'] } as unknown as Vehicle;
const item = (p: Partial<ItineraryItem>) => ({ id: 'i', dayNumber: 1, date: '2026-12-20', startTime: '', endTime: '', title: 'x', published: true, ...p }) as ItineraryItem;

describe('reminders', () => {
  it('IST helpers', () => {
    expect(new Date(istToMs('2026-12-20', '06:15')).toISOString()).toBe('2026-12-20T00:45:00.000Z');
    expect(prevDate('2026-01-01')).toBe('2025-12-31');
  });
  it('maps travellers to their sign-in accounts', () => {
    expect(accountsFor(['p_mum', 'p_kid', 'acc2', 'acc3'], members).sort()).toEqual(['acc1', 'acc2']);
  });
  it('computes train, pickup and morning plan reminders', () => {
    const r = computeReminders({
      tickets: [ticket],
      vehicles: [vehicle],
      itinerary: [item({ id: 'a', startTime: '10:00', title: 'Temple' }), item({ id: 'b', startTime: '08:00', title: 'Breakfast' }), item({ id: 'c', published: false }), item({ id: 'd', date: '2027-01-05' })],
      members,
      startDate: '2026-12-20',
      endDate: '2026-12-22',
    });
    const byKey = Object.fromEntries(r.map((x) => [x.key, x]));
    expect(Object.keys(byKey).sort()).toEqual(['pick-1h-v1', 'plan-2026-12-20', 'tkt-3h-t1', 'tkt-eve-t1']);
    expect(new Date(byKey['tkt-eve-t1'].at).toISOString()).toBe('2026-12-19T13:30:00.000Z');
    expect(new Date(byKey['tkt-3h-t1'].at).toISOString()).toBe('2026-12-19T21:45:00.000Z');
    expect(byKey['tkt-3h-t1'].uids.sort()).toEqual(['acc1', 'acc2']);
    expect(byKey['tkt-eve-t1'].body).toContain('6:15 AM');
    expect(byKey['pick-1h-v1'].uids).toEqual(['acc2']);
    expect(new Date(byKey['pick-1h-v1'].at).toISOString()).toBe('2026-12-21T03:00:00.000Z');
    expect(byKey['plan-2026-12-20'].body).toBe('8:00 AM Breakfast · 10:00 AM Temple');
    expect(byKey['plan-2026-12-20'].uids).toEqual([]);
  });
  it('selects reminders that are due, within the grace window', () => {
    const r = [{ key: 'a', at: 1000 }, { key: 'b', at: 5000 }, { key: 'c', at: 9000 }] as never;
    expect(dueReminders(r, 6000, 3000).map((x: { key: string }) => x.key)).toEqual(['b']);
  });
});
