/** Firebase Cloud Messaging registration (best-effort; in-app notifications are the source of truth). */
import { getMessaging, getToken, isSupported, onMessage, deleteToken } from 'firebase/messaging';
import { doc, getDoc, serverTimestamp, setDoc, updateDoc, arrayRemove } from 'firebase/firestore';
import { app, db, tripPath } from './firebase';
import { env } from '../config/env';

export async function pushSupported(): Promise<boolean> {
  return Boolean(env.vapidKey) && 'Notification' in window && 'serviceWorker' in navigator && (await isSupported().catch(() => false));
}

export async function enablePush(uid: string): Promise<'enabled' | 'denied' | 'unsupported'> {
  if (!(await pushSupported())) return 'unsupported';
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') return 'denied';
  const registration = await navigator.serviceWorker.ready;
  const token = await getToken(getMessaging(app), { vapidKey: env.vapidKey, serviceWorkerRegistration: registration });
  if (!token) return 'unsupported';
  const ref = doc(db, tripPath('pushTokens', uid));
  const snap = await getDoc(ref);
  const tokens: string[] = snap.exists() ? (snap.data().tokens as string[]) ?? [] : [];
  // keep the 5 most recent devices
  const next = [token, ...tokens.filter((t) => t !== token)].slice(0, 5);
  await setDoc(ref, { tokens: next, updatedAt: serverTimestamp() });
  localStorage.setItem('tm.pushToken', token);
  return 'enabled';
}

export async function disablePush(uid: string) {
  const token = localStorage.getItem('tm.pushToken');
  if (!token) return;
  try {
    await updateDoc(doc(db, tripPath('pushTokens', uid)), { tokens: arrayRemove(token), updatedAt: serverTimestamp() });
    await deleteToken(getMessaging(app));
  } catch {
    /* ignore */
  }
  localStorage.removeItem('tm.pushToken');
}

export const pushEnabledLocally = () => Boolean(localStorage.getItem('tm.pushToken')) && typeof Notification !== 'undefined' && Notification.permission === 'granted';

/** Foreground messages are already reflected by the live in-app feed; nothing to do but avoid duplicates. */
export async function listenForeground(cb: (title: string) => void) {
  if (!(await pushSupported())) return () => undefined;
  return onMessage(getMessaging(app), (p) => cb(p.notification?.title ?? 'New notification'));
}

