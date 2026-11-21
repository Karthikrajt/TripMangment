import { doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import type { User } from 'firebase/auth';
import { db } from '../lib/firebase';

/** Create or refresh the private users/{uid} profile on sign-in. */
export async function upsertUserProfile(u: User): Promise<void> {
  const ref = doc(db, 'users', u.uid);
  const snap = await getDoc(ref).catch(() => null);
  const base = { uid: u.uid, displayName: u.displayName ?? '', email: u.email ?? '', photoURL: u.photoURL ?? '', updatedAt: serverTimestamp() };
  if (snap?.exists()) await updateDoc(ref, base);
  else await setDoc(ref, { ...base, notifLastReadAt: null, chatLastReadAt: null, createdAt: serverTimestamp() });
}

export async function markRead(uid: string, field: 'notifLastReadAt' | 'chatLastReadAt') {
  await updateDoc(doc(db, 'users', uid), { [field]: serverTimestamp(), updatedAt: serverTimestamp() }).catch(() => undefined);
}
