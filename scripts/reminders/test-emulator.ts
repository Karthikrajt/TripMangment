/**
 * Emulator check for send.ts (made-up data only):
 *   npx firebase emulators:exec --only firestore --project demo-trip "cd scripts/reminders && npx tsx test-emulator.ts"
 */
import { execFileSync } from 'node:child_process';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Run inside the Firestore emulator.');
initializeApp({ projectId: 'demo-trip' });
const db = getFirestore();
const base = db.doc('trips/main');
const assert = (ok: unknown, msg: string) => {
  if (!ok) throw new Error('FAIL: ' + msg);
  console.log('ok -', msg);
};

await base.set({ name: 'Test Trip', startDate: '2026-12-20', endDate: '2026-12-22', ownerUid: 'acc1' });
await base.collection('members').doc('acc1').set({ uid: 'acc1', displayName: 'Admin', status: 'approved', role: 'admin', personId: 'p_a' });
await base.collection('members').doc('p_a').set({ uid: 'p_a', displayName: 'Asha', status: 'approved', role: 'member', hasLogin: false, linkedUid: 'acc1' });
await base.collection('members').doc('acc2').set({ uid: 'acc2', displayName: 'Ben', status: 'approved', role: 'member' });
await base.collection('tickets').doc('t1').set({ trainName: 'Test Express', trainNumber: '12345', journeyDate: '2026-12-20', departureTime: '21:00', boardingStation: 'AAA', destinationStation: 'BBB', pnr: '1234567890', passengerUids: ['p_a'] });
await base.collection('transport').doc('v1').set({ vehicleType: 'Tempo', registrationNumber: 'XX 01', pickupDate: '2026-12-21', pickupTime: '09:00', pickupLocation: 'Gate', memberUids: ['p_a', 'acc2'] });
await base.collection('itinerary').doc('i1').set({ dayNumber: 1, date: '2026-12-20', startTime: '10:00', title: 'Temple', published: true });

const run = (iso: string) => execFileSync('npx', ['tsx', 'send.ts'], { env: { ...process.env, NOW_MS: String(Date.parse(iso)), FIREBASE_SERVICE_ACCOUNT: '' }, encoding: 'utf8' });

// 20 Dec 07:10 IST → morning plan due; 3h-before-train (18:00) not yet.
console.log(run('2026-12-20T07:10:00+05:30').trim());
let n = (await base.collection('notifications').get()).docs.map((d) => d.data());
assert(n.length === 1 && n[0].target === 'all' && n[0].title.startsWith("Today's plan"), 'morning plan sent to everyone');

// Run again → no duplicate.
run('2026-12-20T07:20:00+05:30');
assert((await base.collection('notifications').get()).size === 1, 'no duplicate on the next run');

// 18:05 IST → train in 3 hours, only to Asha's account (acc1).
run('2026-12-20T18:05:00+05:30');
n = (await base.collection('notifications').where('type', '==', 'reminder').get()).docs.map((d) => d.data());
const train = n.find((x) => x.title.startsWith('Train in 3 hours'));
assert(train && train.target === 'acc1' && train.createdBy === 'system', 'train reminder to the passenger’s account only');

// 21 Dec 08:10 IST → pickup in 1 hour to acc1 + acc2.
run('2026-12-21T08:10:00+05:30');
const pick = (await base.collection('notifications').get()).docs.map((d) => d.data()).filter((x) => x.title.startsWith('Pickup'));
assert(pick.length === 2 && pick.map((x) => x.target).sort().join() === 'acc1,acc2', 'pickup reminder to both people in the vehicle');

// Long after the trip → quick exit.
assert(run('2027-02-01T08:00:00+05:30').includes('Trip is over'), 'does nothing after the trip');
console.log('All reminder checks passed.');
process.exit(0);
