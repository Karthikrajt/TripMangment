/** Tracks when each dataset was last confirmed by the server (not from cache). */
import { create } from 'zustand';

const KEY = 'tm.lastSynced';
const load = (): Record<string, number> => {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}');
  } catch {
    return {};
  }
};

interface SyncState {
  lastSynced: Record<string, number>;
  pendingWrites: Record<string, boolean>;
  markSynced: (key: string) => void;
  setPending: (key: string, pending: boolean) => void;
}

export const useSync = create<SyncState>((set, get) => ({
  lastSynced: load(),
  pendingWrites: {},
  markSynced: (key) => {
    const next = { ...get().lastSynced, [key]: Date.now() };
    set({ lastSynced: next });
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  },
  setPending: (key, pending) => {
    if (get().pendingWrites[key] === pending) return;
    set({ pendingWrites: { ...get().pendingWrites, [key]: pending } });
  },
}));

export function clearSyncState() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  useSync.setState({ lastSynced: {}, pendingWrites: {} });
}
