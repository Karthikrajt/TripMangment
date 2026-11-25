/**
 * Sends due trip reminders (run every 15 minutes by .github/workflows/reminders.yml):
 *   - the evening before each train (7 PM) and 3 hours before departure
 *   - 1 hour before each vehicle pickup
 *   - each trip morning (7 AM): the day's plan
 *
 * For each due reminder it
 *   1. creates a marker doc trips/{trip}/reminders/{key} – `create` fails if it
 *      already exists, so a reminder is never sent twice (even if runs overlap),
 *   2. writes the in-app notification (shows in the bell, works without push),
 *   3. sends Web Push via Firebase Cloud Messaging to the people's phones and
 *      removes tokens of uninstalled / expired devices.
 *
 * Env: FIREBASE_SERVICE_ACCOUNT (JSON), TRIP_ID (default main), APP_URL,
 *      NOW_MS (testing), FIRESTORE_EMULATOR_HOST (testing, skips push).
 */
import { cert, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { computeReminders, dueReminders, type Reminder } from '../../src/domain/reminders';
import type { ItineraryItem, Member, Ticket, Trip, Vehicle } from '../../src/domain/types';

const emulator = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
const raw = process.env.FIREBASE_SERVICE_ACCOUNT ?? '';
if (!raw && !emulator) {
  console.log('FIREBASE_SERVICE_ACCOUNT is not set – nothing to do.');
  process.exit(0);
}
const sa = raw ? JSON.parse(raw) : null;
const projectId = sa?.project_id ?? process.env.GCLOUD_PROJECT ?? 'demo-trip';
initializeApp(sa ? { credential: cert(sa), projectId } : { projectId });

const db = getFirestore();
const TRIP = process.env.TRIP_ID || 'main';
const APP_URL = (process.env.APP_URL || `https://${projectId}.web.app`).replace(/\/$/, '');
const now = Number(process.env.NOW_MS) || Date.now();
const base = db.doc(`trips/${TRIP}`);

const DAY = 864e5;
const istDate = (ms: number) => new Date(ms + 5.5 * 3600e3).toISOString().slice(0, 10);

async function list<T>(name: string): Promise<T[]> {
  const snap = await base.collection(name).get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as T);
}

async function pushTo(uids: string[], r: Reminder): Promise<number> {
  if (emulator || !uids.length) return 0;
  const refs = uids.map((u) => base.collection('pushTokens').doc(u));
  const docs = await db.getAll(...refs);
  const owners: { uid: string; token: string }[] = [];
  for (const d of docs) for (const token of (d.get('tokens') as string[] | undefined) ?? []) owners.push({ uid: d.id, token });
  if (!owners.length) return 0;
  const link = APP_URL + r.link;
  const res = await getMessaging().sendEach(
    owners.map((o) => ({
      token: o.token,
      notification: { title: r.title.slice(0, 150), body: r.body.slice(0, 300) },
      data: { link: r.link },
      webpush: { fcmOptions: { link }, notification: { icon: '/icons/icon-192.png', badge: '/icons/badge-72.png', tag: r.key } },
    })),
  );
  // Drop tokens of devices that uninstalled the app or cleared site data.
  const dead = new Map<string, string[]>();
  res.responses.forEach((x, i) => {
    const code = x.error?.code ?? '';
    if (code === 'messaging/registration-token-not-registered' || code === 'messaging/invalid-registration-token' || code === 'messaging/invalid-argument') {
      dead.set(owners[i].uid, [...(dead.get(owners[i].uid) ?? []), owners[i].token]);
    }
  });
  for (const [uid, tokens] of dead) await base.collection('pushTokens').doc(uid).update({ tokens: FieldValue.arrayRemove(...tokens) }).catch(() => undefined);
  return res.successCount;
}

async function main() {
  const tripSnap = await base.get();
  if (!tripSnap.exists) {
    console.log(`Trip ${TRIP} not found.`);
    return;
  }
  const trip = tripSnap.data() as Trip;
  // Cheap exit outside the trip (from 2 days before the start until the day after the end).
  const today = istDate(now);
  if (trip.startDate && today < istDate(Date.parse(`${trip.startDate}T12:00:00+05:30`) - 2 * DAY)) return console.log(`Trip has not started (${today}).`);
  if (trip.endDate && today > istDate(Date.parse(`${trip.endDate}T12:00:00+05:30`) + DAY)) return console.log(`Trip is over (${today}).`);

  const [tickets, vehicles, itinerary, members] = await Promise.all([list<Ticket>('tickets'), list<Vehicle>('transport'), list<ItineraryItem>('itinerary'), list<Member>('members')]);
  const all = computeReminders({ tickets, vehicles, itinerary, members, startDate: trip.startDate, endDate: trip.endDate });
  const due = dueReminders(all, now);
  console.log(`${all.length} reminders planned, ${due.length} due now.`);
  const everyone = members.filter((m) => m.status === 'approved' && m.hasLogin !== false).map((m) => m.uid);

  for (const r of due) {
    try {
      await base.collection('reminders').doc(r.key).create({ title: r.title, at: new Date(r.at), sentAt: FieldValue.serverTimestamp() });
    } catch (e) {
      if ((e as { code?: number }).code === 6) continue; // ALREADY_EXISTS – sent before
      throw e;
    }
    const targets = r.uids.length ? r.uids : ['all'];
    const batch = db.batch();
    for (const target of targets) {
      batch.set(base.collection('notifications').doc(), { type: 'reminder', title: r.title.slice(0, 150), body: r.body.slice(0, 500), link: r.link, target, createdBy: 'system', createdAt: FieldValue.serverTimestamp() });
    }
    await batch.commit();
    const sent = await pushTo(r.uids.length ? r.uids : everyone, r).catch((e) => {
      console.warn(`push failed for ${r.key}:`, e?.message ?? e);
      return 0;
    });
    console.log(`Sent "${r.title}" (${r.key}) → ${targets.length === 1 && targets[0] === 'all' ? 'everyone' : `${targets.length} people`}, ${sent} push`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
