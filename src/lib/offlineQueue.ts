/**
 * Offline writes: Firestore keeps writes made without internet in the
 * device's database and sends them automatically when the connection
 * returns – even if the app was closed in between. This module only tracks
 * that something is waiting so the app can say "All offline changes synced".
 */
import { waitForPendingWrites } from 'firebase/firestore';
import { db } from './firebase';

const KEY = 'tm.queuedWrites';
const listeners = new Set<() => void>();

export function hasQueuedWrites(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export function noteQueuedWrite() {
  try {
    localStorage.setItem(KEY, '1');
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l());
}

export function onQueueChange(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

let inflight: Promise<boolean> | null = null;

/**
 * Resolve once everything queued on this device has reached the server.
 * Returns true only for the call that actually flushed something, so the
 * "synced" message is shown once even if "online" fires twice.
 */
export function flushQueuedWrites(): Promise<boolean> {
  if (inflight) return inflight.then(() => false);
  if (!hasQueuedWrites()) return Promise.resolve(false);
  inflight = waitForPendingWrites(db)
    .then(() => {
      try {
        localStorage.removeItem(KEY);
      } catch {
        /* ignore */
      }
      listeners.forEach((l) => l());
      return true;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

/**
 * Run a Firestore write. Online: wait for the server as usual. Offline: the
 * write is applied on the device immediately and queued; return at once.
 */
export async function writeOrQueue(write: Promise<unknown>): Promise<'saved' | 'queued'> {
  if (navigator.onLine) {
    await write;
    return 'saved';
  }
  noteQueuedWrite();
  write.catch((e) => console.warn('queued write failed', e));
  return 'queued';
}
