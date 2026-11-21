import {
  addDoc,
  collection,
  doc,
  serverTimestamp,
  type DocumentData,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';
import { db, tripPath, tripId, auth } from '../lib/firebase';
import { env } from '../config/env';
import type { NotificationTarget, NotificationType } from '../domain/types';

export const tripCol = (name: string) => collection(db, tripPath(name));
export const tripDoc = (name: string, id: string) => doc(db, tripPath(name, id));

export function fromSnap<T>(s: QueryDocumentSnapshot<DocumentData>): T {
  return { id: s.id, ...s.data() } as T;
}

/** Remove keys we never want to copy into audit logs or write back. */
export function strip<T extends Record<string, unknown>>(obj: T, keys: string[] = ['id']): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) if (!keys.includes(k) && v !== undefined) out[k] = v;
  return out;
}

function auditSafe(v: Record<string, unknown> | null | undefined): Record<string, unknown> | null {
  if (!v) return null;
  const out: Record<string, unknown> = {};
  for (const [k, val] of Object.entries(v)) {
    if (k === 'id' || k === 'createdAt' || k === 'updatedAt' || k === 'reviewedAt' || k === 'requestedAt' || k === 'decidedAt') continue;
    if (val === undefined) continue;
    out[k] = typeof val === 'string' ? val.slice(0, 300) : val;
  }
  return out;
}

/** Append-only audit entry. Failure is logged but never blocks the user action. */
export async function logAudit(
  action: string,
  entity: string,
  entityId: string,
  summary: string,
  before?: Record<string, unknown> | null,
  after?: Record<string, unknown> | null,
): Promise<void> {
  const u = auth.currentUser;
  if (!u) return;
  try {
    await addDoc(tripCol('auditLogs'), {
      action,
      entity,
      entityId,
      summary: summary.slice(0, 500),
      actorUid: u.uid,
      actorName: u.displayName ?? u.email ?? '',
      before: auditSafe(before),
      after: auditSafe(after),
      createdAt: serverTimestamp(),
    });
  } catch (e) {
    console.warn('audit log failed', e);
  }
}

/**
 * Create an in-app notification (source of truth), then ask the `notify`
 * Edge Function to deliver a best-effort push. Never throws.
 */
export async function notify(n: { type: NotificationType; title: string; body: string; link: string; target: NotificationTarget }) {
  const u = auth.currentUser;
  if (!u) return;
  try {
    const ref = await addDoc(tripCol('notifications'), {
      type: n.type,
      title: n.title.slice(0, 150),
      body: n.body.slice(0, 500),
      link: n.link.slice(0, 200),
      target: n.target,
      createdBy: u.uid,
      createdAt: serverTimestamp(),
    });
    if (!env.supabaseUrl || !navigator.onLine) return;
    const token = await u.getIdToken();
    fetch(`${env.supabaseUrl}/functions/v1/notify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, apikey: env.supabaseAnonKey },
      body: JSON.stringify({ tripId, notificationId: ref.id }),
      keepalive: true,
    }).catch(() => undefined);
  } catch (e) {
    console.warn('notification failed', e);
  }
}

export const now = serverTimestamp;
