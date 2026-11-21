/**
 * `notify` Edge Function – best-effort Web Push via Firebase Cloud Messaging.
 *
 * The caller must already have written the in-app notification document to
 * Firestore (source of truth). This function:
 *   1. verifies the caller's Firebase ID token and approved membership,
 *   2. re-reads that notification document with the CALLER's token (so it
 *      can only fan out notifications that the rules allowed them to create
 *      and that they authored),
 *   3. resolves recipients (all approved members / admins / one uid),
 *   4. sends FCM HTTP v1 messages and prunes dead tokens.
 *
 * POST { tripId, notificationId }
 */
import { corsHeaders, HttpError, json } from '../_shared/cors.ts';
import { verifyFirebaseToken } from '../_shared/firebaseAuth.ts';
import { decodeFields, getDocAs, requireApprovedMember } from '../_shared/firestore.ts';
import { googleAccessToken, serviceAccount } from '../_shared/google.ts';

const ALLOWED_TRIP = Deno.env.get('TRIP_ID') ?? 'main';
const APP_URL = (Deno.env.get('APP_URL') ?? '').replace(/\/$/, '');
const MAX_RECIPIENT_DOCS = 200;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) });
  if (req.method !== 'POST') return json(req, 405, { error: 'Method not allowed' });
  try {
    const user = await verifyFirebaseToken(req);
    const body = await req.json().catch(() => ({}));
    const tripId = String(body.tripId ?? '');
    const notificationId = String(body.notificationId ?? '');
    if (tripId !== ALLOWED_TRIP || !/^[A-Za-z0-9_-]{1,128}$/.test(notificationId)) throw new HttpError(400, 'Invalid request.');

    // Pending users may create access-request notifications, so membership
    // is required only for everything else.
    const n = await getDocAs(user.idToken, `trips/${tripId}/notifications/${notificationId}`).catch(() => null);
    const sa = serviceAccount();
    if (!sa) return json(req, 200, { sent: 0, skipped: 'push not configured' });

    const projectId = sa.project_id;
    const token = await googleAccessToken(sa);
    const base = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/trips/${tripId}`;
    const adminGet = async (p: string) => {
      const r = await fetch(`${base}/${p}`, { headers: { Authorization: `Bearer ${token}` } });
      return r.ok ? decodeFields((await r.json()).fields ?? {}) : null;
    };

    // Approved members can read notifications targeted at them; pending users
    // cannot read any – fall back to an admin read and verify authorship.
    const notif = n ?? (await adminGet(`notifications/${notificationId}`));
    if (!notif || notif.createdBy !== user.uid) throw new HttpError(403, 'Not allowed.');
    if (notif.type !== 'access_request') await requireApprovedMember(user.idToken, tripId, user.uid);
    const created = Date.parse(String(notif.createdAt ?? ''));
    if (!Number.isFinite(created) || Date.now() - created > 10 * 60_000) throw new HttpError(400, 'Notification too old.');

    // Resolve recipients.
    const target = String(notif.target ?? '');
    const membersRes = await fetch(`${base}/members?pageSize=${MAX_RECIPIENT_DOCS}`, { headers: { Authorization: `Bearer ${token}` } });
    const members = membersRes.ok
      ? ((await membersRes.json()).documents ?? []).map((d: { fields: Record<string, never> }) => decodeFields(d.fields))
      : [];
    const recipients = members
      .filter((m: Record<string, unknown>) => m.status === 'approved' && m.uid !== user.uid)
      .filter((m: Record<string, unknown>) => target === 'all' || (target === 'admins' ? m.role === 'admin' : m.uid === target))
      .map((m: Record<string, unknown>) => String(m.uid));

    let sent = 0;
    for (const uid of recipients) {
      const doc = await adminGet(`pushTokens/${uid}`);
      const tokens = Array.isArray(doc?.tokens) ? (doc!.tokens as string[]) : [];
      const alive: string[] = [];
      for (const t of tokens) {
        const res = await fetch(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: {
              token: t,
              notification: { title: String(notif.title).slice(0, 150), body: String(notif.body).slice(0, 300) },
              data: { link: String(notif.link ?? '/notifications') },
              webpush: {
                fcm_options: APP_URL ? { link: APP_URL + String(notif.link ?? '/notifications') } : undefined,
                notification: { icon: '/icons/icon-192.png', badge: '/icons/badge-72.png', tag: String(notif.type) },
              },
            },
          }),
        });
        if (res.ok) {
          sent += 1;
          alive.push(t);
        } else if (res.status !== 404 && res.status !== 400) {
          alive.push(t); // transient – keep token
        }
      }
      if (alive.length !== tokens.length) {
        await fetch(`${base}/pushTokens/${uid}?updateMask.fieldPaths=tokens`, {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ fields: { tokens: { arrayValue: { values: alive.map((s) => ({ stringValue: s })) } } } }),
        });
      }
    }
    return json(req, 200, { sent });
  } catch (e) {
    if (e instanceof HttpError) return json(req, e.status, { error: e.message });
    console.error(e);
    return json(req, 500, { error: 'Unexpected server error.' });
  }
});
