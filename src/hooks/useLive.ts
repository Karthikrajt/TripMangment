import { useEffect, useRef, useState } from 'react';
import { onSnapshot, type DocumentReference, type Query } from 'firebase/firestore';
import { useSync } from '../lib/sync';
import { errorMessage } from '../lib/retry';

export interface LiveState<T> {
  data: T;
  loading: boolean;
  error: string | null;
  fromCache: boolean;
}

/**
 * Subscribe to a Firestore query. Pass `null` to stay idle (e.g. until the
 * user is approved). `key` identifies the dataset for "last synced" tracking
 * and must change whenever the query changes.
 */
export function useLiveQuery<T>(key: string | null, makeQuery: () => Query | null, map: (id: string, d: Record<string, unknown>) => T): LiveState<T[]> {
  const [state, setState] = useState<LiveState<T[]>>({ data: [], loading: true, error: null, fromCache: false });
  const mapRef = useRef(map);
  mapRef.current = map;
  const markSynced = useSync((s) => s.markSynced);
  const setPending = useSync((s) => s.setPending);

  useEffect(() => {
    if (!key) {
      setState({ data: [], loading: false, error: null, fromCache: false });
      return;
    }
    const q = makeQuery();
    if (!q) return;
    setState((s) => ({ ...s, loading: true, error: null }));
    const unsub = onSnapshot(
      q,
      { includeMetadataChanges: true },
      (snap) => {
        setState({ data: snap.docs.map((d) => mapRef.current(d.id, d.data())), loading: false, error: null, fromCache: snap.metadata.fromCache });
        if (!snap.metadata.fromCache) markSynced(key);
        setPending(key, snap.metadata.hasPendingWrites);
      },
      (err) => setState((s) => ({ ...s, loading: false, error: errorMessage(err) })),
    );
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return state;
}

export function useLiveDoc<T>(key: string | null, makeRef: () => DocumentReference | null, map: (id: string, d: Record<string, unknown>) => T): LiveState<T | null> {
  const [state, setState] = useState<LiveState<T | null>>({ data: null, loading: true, error: null, fromCache: false });
  const mapRef = useRef(map);
  mapRef.current = map;
  const markSynced = useSync((s) => s.markSynced);

  useEffect(() => {
    if (!key) {
      setState({ data: null, loading: false, error: null, fromCache: false });
      return;
    }
    const ref = makeRef();
    if (!ref) return;
    const unsub = onSnapshot(
      ref,
      (snap) => {
        setState({ data: snap.exists() ? mapRef.current(snap.id, snap.data()) : null, loading: false, error: null, fromCache: snap.metadata.fromCache });
        if (!snap.metadata.fromCache) markSynced(key);
      },
      (err) => setState((s) => ({ ...s, loading: false, error: errorMessage(err) })),
    );
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return state;
}

export const asType = <T,>(id: string, d: Record<string, unknown>) => ({ id, ...d }) as T;
