import { doc, getDoc, serverTimestamp, setDoc, updateDoc, writeBatch } from 'firebase/firestore';
import type { User } from 'firebase/auth';
import { db, tripPath } from '../lib/firebase';
import type { Trip } from '../domain/types';
import { logAudit, strip } from './base';
import { newId } from '../lib/ids';
import { makeCallRoom } from '../domain/call';

/** A new random video-call room id (changing it makes old call links useless). */
export const newCallRoom = () => makeCallRoom(() => newId() + newId());

export const tripRef = () => doc(db, tripPath());
export const publicSummaryRef = () => doc(db, tripPath('public', 'summary'));

export interface PublicSummary {
  /** mirrors trip.openJoin so people who have not joined yet know whether approval is needed */
  openJoin?: boolean;
  name: string;
  destination: string;
  startDate: string;
  endDate: string;
}

export async function getPublicSummary(): Promise<PublicSummary | null> {
  const s = await getDoc(publicSummaryRef());
  return s.exists() ? (s.data() as PublicSummary) : null;
}

export type TripInput = Pick<Trip, 'name' | 'destination' | 'description' | 'startDate' | 'endDate' | 'emergencyInfo' | 'importantContacts' | 'ticketsLocked'> &
  Partial<Pick<Trip, 'childSharePercent' | 'infantSharePercent' | 'openJoin' | 'callRoom' | 'whatsappGroupUrl' | 'googleMeetUrl'>>;

/** First-run setup by the bootstrap admin: trip + public summary + admin membership, atomically. */
export async function createTrip(user: User, input: TripInput): Promise<void> {
  const b = writeBatch(db);
  b.set(tripRef(), { ...input, ownerUid: user.uid, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  b.set(publicSummaryRef(), { name: input.name, destination: input.destination, startDate: input.startDate, endDate: input.endDate });
  b.set(doc(db, tripPath('members', user.uid)), {
    uid: user.uid,
    displayName: user.displayName ?? '',
    email: user.email ?? '',
    photoURL: user.photoURL ?? '',
    phone: '',
    emergencyContact: '',
    relationship: '',
    role: 'admin',
    status: 'approved',
    requestNote: '',
    requestedAt: serverTimestamp(),
    decidedAt: serverTimestamp(),
    decidedBy: user.uid,
    updatedAt: serverTimestamp(),
  });
  await b.commit();
}

export async function updateTrip(before: Trip, input: TripInput): Promise<void> {
  await updateDoc(tripRef(), { ...input, updatedAt: serverTimestamp() });
  await setDoc(publicSummaryRef(), { name: input.name, destination: input.destination, startDate: input.startDate, endDate: input.endDate, openJoin: input.openJoin ?? before.openJoin ?? true });
  await logAudit('update', 'trip', before.id, `Updated trip settings`, strip(before as never), input as never);
}

/** Video-call settings are saved on their own, so the rest of the form can't block them. */
export async function updateCallSettings(trip: Trip, patch: Partial<Pick<Trip, 'callRoom' | 'whatsappGroupUrl' | 'googleMeetUrl'>>): Promise<void> {
  await updateDoc(tripRef(), { ...patch, updatedAt: serverTimestamp() });
  await logAudit('update', 'trip', trip.id, `Updated video call settings (${Object.keys(patch).join(', ')})`, null, patch as never);
}
