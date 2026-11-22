/**
 * Core domain types. Firestore Timestamps are represented as `TS` so domain
 * logic stays independent of the SDK. Calendar dates are stored as
 * `YYYY-MM-DD` strings and clock times as `HH:mm` (24h) strings, both in
 * Asia/Kolkata local time, to avoid any timezone drift.
 */
import type { Timestamp } from 'firebase/firestore';

export type TS = Timestamp | null;
export type ISODate = string; // YYYY-MM-DD
export type ClockTime = string; // HH:mm
export type Paise = number; // integer money (₹1 = 100 paise)

export type Role = 'admin' | 'member';
export type AgeGroup = 'adult' | 'child' | 'infant';
export type MemberStatus = 'pending' | 'approved' | 'rejected' | 'disabled';

export interface Trip {
  id: string;
  name: string;
  destination: string;
  description: string;
  startDate: ISODate;
  endDate: ISODate;
  ownerUid: string;
  emergencyInfo: string;
  importantContacts: { name: string; phone: string; note?: string }[];
  ticketsLocked: boolean;
  createdAt: TS;
  updatedAt: TS;
}

export interface Member {
  uid: string;
  displayName: string;
  email: string;
  photoURL: string;
  phone: string;
  emergencyContact: string;
  relationship: string; // family / group label (optional)
  role: Role;
  status: MemberStatus;
  requestNote: string;
  requestedAt: TS;
  decidedAt: TS;
  decidedBy: string;
  updatedAt: TS;
  /**
   * People model: every traveller is a member document. Travellers added by
   * the admin have `hasLogin: false` and a random id; they never sign in.
   * A sign-in account can be linked to such a traveller via `personId`
   * (the account then acts as that person and is hidden from people lists).
   */
  ageGroup?: AgeGroup;
  /** Per-head share in percent: adult 100, child e.g. 50, infant 0. */
  shareWeight?: number;
  hasLogin?: boolean;
  personId?: string;
  /** On a traveller: the sign-in account linked to it. */
  linkedUid?: string;
}

export interface ItineraryItem {
  id: string;
  dayNumber: number;
  date: ISODate;
  startTime: ClockTime;
  endTime: ClockTime;
  title: string;
  description: string;
  location: string;
  mapsUrl: string;
  coordinator: string;
  instructions: string;
  notes: string;
  published: boolean;
  createdAt: TS;
  updatedAt: TS;
}

export interface Ticket {
  id: string;
  title: string;
  pnr: string;
  trainName: string;
  trainNumber: string;
  journeyDate: ISODate;
  boardingStation: string;
  destinationStation: string;
  departureTime: ClockTime;
  arrivalTime: ClockTime;
  passengerNames: string[];
  passengerUids: string[];
  coach: string;
  seats: string;
  travelClass: string;
  notes: string;
  filePath: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  uploadedBy: string;
  uploadedByName: string;
  locked: boolean;
  createdAt: TS;
  updatedAt: TS;
}

export interface Accommodation {
  id: string;
  name: string;
  address: string;
  contactNumber: string;
  bookingReference: string;
  checkInDate: ISODate;
  checkInTime: ClockTime;
  checkOutDate: ISODate;
  checkOutTime: ClockTime;
  numberOfRooms: number;
  totalCapacity: number;
  mapsUrl: string;
  instructions: string;
  filePath: string;
  fileName: string;
  createdAt: TS;
  updatedAt: TS;
}

export interface Room {
  id: string;
  accommodationId: string;
  name: string;
  roomType: string;
  bedCapacity: number;
  memberUids: string[];
  checkInDate: ISODate;
  checkOutDate: ISODate;
  notes: string;
  createdAt: TS;
  updatedAt: TS;
}

export interface Vehicle {
  id: string;
  vehicleType: string;
  registrationNumber: string;
  capacity: number;
  driverName: string;
  driverPhone: string;
  pickupLocation: string;
  pickupDate: ISODate;
  pickupTime: ClockTime;
  destination: string;
  routeDetails: string;
  mapsUrl: string;
  instructions: string;
  memberUids: string[];
  createdAt: TS;
  updatedAt: TS;
}

export const EXPENSE_CATEGORIES = [
  'Train',
  'Bus',
  'Hotel',
  'Food',
  'Snacks',
  'Fuel',
  'Local transport',
  'Entry tickets',
  'Shopping',
  'Other',
] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export type SplitMethod = 'equal_all' | 'equal_selected' | 'custom' | 'trip_wide';
export type ExpenseStatus = 'pending' | 'approved' | 'rejected';

export interface Expense {
  id: string; // also the idempotency key
  title: string;
  category: ExpenseCategory;
  amountPaise: Paise;
  expenseDate: ISODate;
  paidBy: string;
  description: string;
  receiptPath: string;
  receiptName: string;
  splitMethod: SplitMethod;
  /** uid → share in paise; always sums exactly to amountPaise */
  splits: Record<string, Paise>;
  status: ExpenseStatus;
  reviewNote: string;
  reviewedBy: string;
  reviewedAt: TS;
  createdBy: string;
  createdAt: TS;
  updatedAt: TS;
}

export type SettlementStatus = 'open' | 'paid';
export interface Settlement {
  id: string;
  fromUid: string;
  toUid: string;
  amountPaise: Paise;
  status: SettlementStatus;
  paidDate: ISODate;
  reference: string;
  notes: string;
  createdBy: string;
  createdAt: TS;
  updatedAt: TS;
}

export interface ChatMessage {
  id: string;
  senderUid: string;
  senderName: string;
  senderPhoto: string;
  text: string;
  kind: 'text' | 'image' | 'file' | 'announcement';
  filePath: string;
  fileName: string;
  fileType: string;
  createdAt: TS;
}

export interface Announcement {
  id: string;
  title: string;
  body: string;
  priority: 'normal' | 'important';
  createdBy: string;
  createdByName: string;
  createdAt: TS;
}

export type NotificationTarget = 'all' | 'admins' | string; // string = a uid
export type NotificationType =
  | 'access_request'
  | 'member_decision'
  | 'ticket_uploaded'
  | 'ticket_updated'
  | 'itinerary_changed'
  | 'hotel_changed'
  | 'room_updated'
  | 'transport_updated'
  | 'expense_submitted'
  | 'expense_reviewed'
  | 'chat_message'
  | 'announcement'
  | 'settlement_updated';

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  link: string;
  target: NotificationTarget;
  createdBy: string;
  createdAt: TS;
}

export interface AuditLog {
  id: string;
  action: string;
  entity: string;
  entityId: string;
  summary: string;
  actorUid: string;
  actorName: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  createdAt: TS;
}

export interface UserProfile {
  uid: string;
  displayName: string;
  email: string;
  photoURL: string;
  notifLastReadAt: TS;
  chatLastReadAt: TS;
  createdAt: TS;
  updatedAt: TS;
}
