/**
 * Keep the trip usable without internet:
 * 1. warmOfflineCache(): while online, read every trip collection once so
 *    Firestore's on-device cache has all details (tickets, itinerary,
 *    hotels, rooms, transport, Hotels & Travel, expenses…), even for pages
 *    never opened. Throttled to limit Firestore reads (free-tier quota).
 * 2. syncTicketFiles(): if "Keep tickets on this phone" is on, download
 *    every ticket PDF/photo into on-device storage and keep it up to date.
 */
import { getDocs, limit, orderBy, query } from 'firebase/firestore';
import { tripCol } from '../services/base';
import { useSync } from './sync';
import { isSharedDevice } from './firebase';
import { filesConfigured } from './files';
import { listOffline, removeOffline, saveOffline } from './offlineFiles';
import type { Ticket } from '../domain/types';

const WARM_KEY = 'tm.lastWarm';
const AUTO_KEY = 'tm.autoOfflineTickets';
const WARM_EVERY_MS = 6 * 60 * 60 * 1000;
const COLLECTIONS = ['itinerary', 'tickets', 'accommodations', 'rooms', 'transport', 'vendors', 'expenses', 'settlements', 'checklist', 'rollcalls'];

const read = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const write = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* ignore */
  }
};

/** Default on, except on shared/borrowed devices. */
export function autoOfflineTickets(): boolean {
  const v = read(AUTO_KEY);
  return v === null ? !isSharedDevice() : v === '1';
}
export function setAutoOfflineTickets(on: boolean) {
  write(AUTO_KEY, on ? '1' : '0');
}

let running: Promise<void> | null = null;

export function warmOfflineCache(opts: { force?: boolean } = {}): Promise<void> {
  if (!navigator.onLine) return Promise.resolve();
  const last = Number(read(WARM_KEY) ?? 0);
  if (!opts.force && Date.now() - last < WARM_EVERY_MS) {
    // Details are fresh enough; still make sure ticket files are on the phone.
    return autoOfflineTickets() ? syncTicketFilesFromCache() : Promise.resolve();
  }
  running ??= (async () => {
    try {
      const markSynced = useSync.getState().markSynced;
      const snaps = await Promise.all(
        COLLECTIONS.map((c) =>
          getDocs(tripCol(c)).then((s) => {
            markSynced(c);
            return [c, s] as const;
          }),
        ),
      );
      await getDocs(query(tripCol('announcements'), orderBy('createdAt', 'desc'), limit(20)));
      write(WARM_KEY, String(Date.now()));
      const tickets = snaps.find(([c]) => c === 'tickets')?.[1];
      if (tickets && autoOfflineTickets()) await syncTicketFiles(tickets.docs.map((d) => ({ id: d.id, ...d.data() }) as Ticket));
    } catch (e) {
      console.warn('offline cache warm-up failed', e);
    } finally {
      running = null;
    }
  })();
  return running;
}

async function syncTicketFilesFromCache() {
  try {
    const snap = await getDocs(tripCol('tickets'));
    await syncTicketFiles(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Ticket));
  } catch {
    /* offline or not allowed */
  }
}

export interface TicketFileSyncResult {
  downloaded: number;
  removed: number;
  failed: number;
}

/** Download missing/changed ticket files; drop copies of deleted tickets. */
export async function syncTicketFiles(tickets: Pick<Ticket, 'id' | 'filePath' | 'fileName'>[]): Promise<TicketFileSyncResult> {
  const out = { downloaded: 0, removed: 0, failed: 0 };
  if (!filesConfigured || !navigator.onLine) return out;
  const saved = new Map((await listOffline()).map((f) => [f.id, f]));
  for (const t of tickets) {
    if (!t.filePath) continue;
    const have = saved.get(t.id);
    if (have && have.path === t.filePath) continue;
    try {
      await saveOffline(t.id, t.filePath, t.fileName);
      out.downloaded += 1;
    } catch {
      out.failed += 1;
    }
  }
  const ids = new Set(tickets.map((t) => t.id));
  for (const id of saved.keys()) {
    if (!ids.has(id)) {
      await removeOffline(id).catch(() => undefined);
      out.removed += 1;
    }
  }
  if (out.downloaded || out.removed) window.dispatchEvent(new Event('tm:offline-files'));
  return out;
}
