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


/** iPhone/iPad Safari only allows web push after "Add to Home Screen". */
export function needsHomeScreenForPush(): boolean {
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return ios && !standalone;
}

/**
 * Keep this device's token fresh. FCM tokens can change (browser update,
 * storage cleared); re-registering once per app start keeps reminders arriving.
 */
export async function refreshPush(uid: string): Promise<void> {
  try {
    if (!pushEnabledLocally() || !(await pushSupported())) return;
    const registration = await navigator.serviceWorker.ready;
    const token = await getToken(getMessaging(app), { vapidKey: env.vapidKey, serviceWorkerRegistration: registration });
    if (!token) return;
    const ref = doc(db, tripPath('pushTokens', uid));
    const snap = await getDoc(ref);
    const tokens: string[] = snap.exists() ? (snap.data().tokens as string[]) ?? [] : [];
    if (tokens[0] === token && localStorage.getItem('tm.pushToken') === token) return;
    await setDoc(ref, { tokens: [token, ...tokens.filter((t) => t !== token && t !== localStorage.getItem('tm.pushToken'))].slice(0, 5), updatedAt: serverTimestamp() });
    localStorage.setItem('tm.pushToken', token);
  } catch {
    /* best-effort */
  }
}
