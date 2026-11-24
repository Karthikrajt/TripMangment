import { beforeEach, describe, expect, it, vi } from 'vitest';

// Stand-ins for storage and the file service (no network, no IndexedDB).
const store = new Map<string, { id: string; path: string }>();
const saveOffline = vi.fn(async (id: string, path: string) => {
  if (path.includes('broken')) throw new Error('download failed');
  store.set(id, { id, path });
});
vi.mock('./offlineFiles', () => ({
  listOffline: async () => [...store.values()],
  saveOffline: (id: string, path: string) => saveOffline(id, path),
  removeOffline: async (id: string) => void store.delete(id),
}));
vi.mock('./files', () => ({ filesConfigured: true }));
vi.mock('./firebase', () => ({ isSharedDevice: () => false }));
vi.mock('../services/base', () => ({ tripCol: () => null }));
vi.mock('./sync', () => ({ useSync: { getState: () => ({ markSynced: () => undefined }) } }));

const { syncTicketFiles } = await import('./offlineSync');

beforeEach(() => {
  store.clear();
  saveOffline.mockClear();
  vi.stubGlobal('navigator', { onLine: true });
  vi.stubGlobal('window', { dispatchEvent: () => true });
});

describe('syncTicketFiles', () => {
  it('downloads missing and changed files, skips unchanged, removes deleted', async () => {
    store.set('same', { id: 'same', path: 'trips/main/ticket/u/a.pdf' });
    store.set('changed', { id: 'changed', path: 'trips/main/ticket/u/old.pdf' });
    store.set('gone', { id: 'gone', path: 'trips/main/ticket/u/x.pdf' });
    const r = await syncTicketFiles([
      { id: 'same', filePath: 'trips/main/ticket/u/a.pdf', fileName: 'a.pdf' },
      { id: 'changed', filePath: 'trips/main/ticket/u/new.pdf', fileName: 'n.pdf' },
      { id: 'new', filePath: 'trips/main/ticket/u/b.pdf', fileName: 'b.pdf' },
    ]);
    expect(r).toEqual({ downloaded: 2, removed: 1, failed: 0 });
    expect(saveOffline.mock.calls.map((c) => c[0]).sort()).toEqual(['changed', 'new']);
    expect([...store.keys()].sort()).toEqual(['changed', 'new', 'same']);
    expect(store.get('changed')?.path).toBe('trips/main/ticket/u/new.pdf');
  });
  it('counts failures and keeps going', async () => {
    const r = await syncTicketFiles([
      { id: 'a', filePath: 'trips/main/ticket/u/broken.pdf', fileName: 'x.pdf' },
      { id: 'b', filePath: 'trips/main/ticket/u/ok.pdf', fileName: 'y.pdf' },
    ]);
    expect(r).toEqual({ downloaded: 1, removed: 0, failed: 1 });
  });
  it('does nothing offline', async () => {
    vi.stubGlobal('navigator', { onLine: false });
    const r = await syncTicketFiles([{ id: 'a', filePath: 'trips/main/ticket/u/a.pdf', fileName: 'a.pdf' }]);
    expect(r).toEqual({ downloaded: 0, removed: 0, failed: 0 });
    expect(saveOffline).not.toHaveBeenCalled();
  });
});
