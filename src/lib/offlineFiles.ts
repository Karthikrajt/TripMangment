/**
 * Offline copies of tickets – ONLY when the user explicitly taps
 * "Save for offline". Nothing sensitive is cached automatically.
 */
import { createStore, del, get, keys, set, clear } from 'idb-keyval';
import { fetchFileBlob } from './files';

const store = createStore('trip-offline-files', 'files');

export interface OfflineFile {
  id: string; // ticket id
  path: string;
  name: string;
  type: string;
  savedAt: number;
  blob: Blob;
}

export async function saveOffline(id: string, path: string, name: string): Promise<void> {
  const blob = await fetchFileBlob(path);
  await set(id, { id, path, name, type: blob.type, savedAt: Date.now(), blob } satisfies OfflineFile, store);
}

export const getOffline = (id: string) => get<OfflineFile>(id, store);
export const removeOffline = (id: string) => del(id, store);
export const clearOffline = () => clear(store);
export async function listOffline(): Promise<OfflineFile[]> {
  const ks = await keys(store);
  const all = await Promise.all(ks.map((k) => get<OfflineFile>(k, store)));
  return all.filter((x): x is OfflineFile => Boolean(x));
}

export function openBlob(file: OfflineFile, download = false) {
  const url = URL.createObjectURL(file.blob);
  if (download) {
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name;
    a.click();
  } else {
    window.open(url, '_blank', 'noopener');
  }
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
