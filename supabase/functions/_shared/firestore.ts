/**
 * Minimal Firestore REST reader. Reads are performed WITH THE CALLER'S OWN
 * Firebase ID token, so Firestore Security Rules apply to the Edge Function's
 * lookups too (a pending user cannot read a ticket, etc.).
 */
import { HttpError } from './cors.ts';

const PROJECT_ID = Deno.env.get('FIREBASE_PROJECT_ID') ?? '';

type FsValue =
  | { stringValue: string }
  | { booleanValue: boolean }
  | { integerValue: string }
  | { doubleValue: number }
  | { nullValue: null }
  | { timestampValue: string }
  | { arrayValue: { values?: FsValue[] } }
  | { mapValue: { fields?: Record<string, FsValue> } };

function decode(v: FsValue): unknown {
  if ('stringValue' in v) return v.stringValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('nullValue' in v) return null;
  if ('timestampValue' in v) return v.timestampValue;
  if ('arrayValue' in v) return (v.arrayValue.values ?? []).map(decode);
  if ('mapValue' in v) return decodeFields(v.mapValue.fields ?? {});
  return undefined;
}

export function decodeFields(fields: Record<string, FsValue>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, decode(v)]));
}

export async function getDocAs(bearer: string, path: string): Promise<Record<string, unknown> | null> {
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/${path}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${bearer}` } });
  if (res.status === 404) return null;
  if (res.status === 403) return null; // rules denied → treat as not visible
  if (!res.ok) throw new HttpError(502, 'Could not verify trip membership. Try again.');
  const body = await res.json();
  return decodeFields(body.fields ?? {});
}

export interface Membership {
  role: 'admin' | 'member';
  status: string;
}

export async function requireApprovedMember(idToken: string, tripId: string, uid: string): Promise<Membership> {
  const m = await getDocAs(idToken, `trips/${tripId}/members/${uid}`);
  if (!m || m.status !== 'approved') throw new HttpError(403, 'Only approved trip members can access trip files.');
  return { role: m.role === 'admin' ? 'admin' : 'member', status: String(m.status) };
}
