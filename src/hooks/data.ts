/** Live data hooks. Every query here is fully readable by approved members (see firestore.rules). */
import { limit, orderBy, query } from 'firebase/firestore';
import { useMemo } from 'react';
import { useLiveQuery, asType } from './useLive';
import { tripCol } from '../services/base';
import { useSession } from '../store/session';
import type { Accommodation, Announcement, AuditLog, ChecklistItem, Expense, ItineraryItem, RollCall, Room, Settlement, Ticket, Vehicle, Vendor } from '../domain/types';
import { isAdmin } from '../domain/permissions';

const useApproved = () => useSession((s) => s.member?.status === 'approved');

function useCol<T>(name: string, sort?: (a: T, b: T) => number) {
  const approved = useApproved();
  const res = useLiveQuery<T>(approved ? name : null, () => tripCol(name), asType<T>);
  const data = useMemo(() => (sort ? [...res.data].sort(sort) : res.data), [res.data, sort]);
  return { ...res, data };
}

const byItinerary = (a: ItineraryItem, b: ItineraryItem) =>
  a.date.localeCompare(b.date) || a.dayNumber - b.dayNumber || (a.startTime || '99').localeCompare(b.startTime || '99');
const byJourney = (a: Ticket, b: Ticket) => a.journeyDate.localeCompare(b.journeyDate) || a.departureTime.localeCompare(b.departureTime);
const byCheckIn = (a: Accommodation, b: Accommodation) => a.checkInDate.localeCompare(b.checkInDate);
const byName = (a: Room, b: Room) => a.name.localeCompare(b.name, undefined, { numeric: true });
const byPickup = (a: Vehicle, b: Vehicle) => (a.pickupDate + a.pickupTime).localeCompare(b.pickupDate + b.pickupTime);
const byExpenseDate = (a: Expense, b: Expense) => b.expenseDate.localeCompare(a.expenseDate) || (b.createdAt?.toMillis?.() ?? Infinity) - (a.createdAt?.toMillis?.() ?? Infinity);
const byCreated = (a: Settlement, b: Settlement) => (b.createdAt?.toMillis?.() ?? Infinity) - (a.createdAt?.toMillis?.() ?? Infinity);

export function useItinerary() {
  const res = useCol<ItineraryItem>('itinerary', byItinerary);
  const admin = useSession((s) => isAdmin(s.member));
  const data = useMemo(() => (admin ? res.data : res.data.filter((i) => i.published)), [res.data, admin]);
  return { ...res, data };
}
export const useTickets = () => useCol<Ticket>('tickets', byJourney);
export const useAccommodations = () => useCol<Accommodation>('accommodations', byCheckIn);
export const useRooms = () => useCol<Room>('rooms', byName);
export const useTransport = () => useCol<Vehicle>('transport', byPickup);
export const useExpenses = () => useCol<Expense>('expenses', byExpenseDate);
export const useSettlements = () => useCol<Settlement>('settlements', byCreated);
export const useVendors = () => useCol<Vendor>('vendors');

export function useAnnouncements(max = 20) {
  const approved = useApproved();
  return useLiveQuery<Announcement>(approved ? `announcements:${max}` : null, () => query(tripCol('announcements'), orderBy('createdAt', 'desc'), limit(max)), asType<Announcement>);
}

export function useAuditLogs(max: number) {
  const admin = useSession((s) => isAdmin(s.member));
  return useLiveQuery<AuditLog>(admin ? `audit:${max}` : null, () => query(tripCol('auditLogs'), orderBy('createdAt', 'desc'), limit(max)), asType<AuditLog>);
}

const byChecklist = (a: ChecklistItem, b: ChecklistItem) => (a.createdAt?.toMillis?.() ?? Infinity) - (b.createdAt?.toMillis?.() ?? Infinity);
const byRollCall = (a: RollCall, b: RollCall) => (b.createdAt?.toMillis?.() ?? Infinity) - (a.createdAt?.toMillis?.() ?? Infinity);
export const useChecklist = () => useCol<ChecklistItem>('checklist', byChecklist);
export const useRollCalls = () => useCol<RollCall>('rollcalls', byRollCall);
