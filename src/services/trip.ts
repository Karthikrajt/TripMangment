import { doc, getDoc, serverTimestamp, setDoc, updateDoc, writeBatch } from 'firebase/firestore';
import type { User } from 'firebase/auth';
import { db, tripPath } from '../lib/firebase';
import type { Trip } from '../domain/types';
import { logAudit, strip } from './base';

export const tripRef = () => doc(db, tripPath());
export const publicSummaryRef = () => doc(db, tripPath('public', 'summary'));

export interface PublicSummary {
  name: string;
  destination: string;
  startDate: string;
  endDate: string;
}

export async function getPublicSummary(): Promise<PublicSummary | null> {
  const s = await getDoc(publicSummaryRef());
  return s.exists() ? (s.data() as PublicSummary) : null;
}

export type TripInput = Pick<Trip, 'name' | 'destination' | 'description' | 'startDate' | 'endDate' | 'emergencyInfo' | 'importantContacts' | 'ticketsLocked'>;

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
  await setDoc(publicSummaryRef(), { name: input.name, destination: input.destination, startDate: input.startDate, endDate: input.endDate });
  await logAudit('update', 'trip', before.id, `Updated trip settings`, strip(before as never), input as never);
}
