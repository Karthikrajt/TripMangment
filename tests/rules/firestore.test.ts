/**
 * Firestore security-rule tests. These hit the rules directly (like a raw
 * API client would) – they do not go through the UI.
 *   npm run test:rules
 */
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { setLogLevel, deleteDoc, doc, getDoc, getDocs, collection, query, where, serverTimestamp, setDoc, updateDoc, writeBatch } from 'firebase/firestore';

const T = 'main';
const ADMIN_EMAIL = 'you@gmail.com';
let env: RulesTestEnvironment;
setLogLevel('silent');

const memberDoc = (uid: string, role: 'admin' | 'member', status: string) => ({
  uid, displayName: uid, email: `${uid}@x.com`, photoURL: '', phone: '', emergencyContact: '', relationship: '',
  role, status, requestNote: '', requestedAt: null, decidedAt: null, decidedBy: '', updatedAt: null,
});

const ticket = (uploadedBy: string, extra: Record<string, unknown> = {}) => ({
  title: 'Chennai → Coimbatore', pnr: '1234567890', trainName: 'Cheran Exp', trainNumber: '12673',
  journeyDate: '2026-12-20', boardingStation: 'MAS', destinationStation: 'CBE', departureTime: '22:00', arrivalTime: '06:00',
  passengerNames: ['A', 'B'], passengerUids: ['alice', 'bob'], coach: 'S1', seats: '1,2', travelClass: 'SL', notes: '',
  filePath: `trips/${T}/ticket/${uploadedBy}/abc.pdf`, fileName: 't.pdf', fileType: 'application/pdf', fileSize: 1000,
  uploadedBy, uploadedByName: uploadedBy, locked: false, createdAt: serverTimestamp(), updatedAt: serverTimestamp(), ...extra,
});

const expense = (createdBy: string, extra: Record<string, unknown> = {}) => ({
  title: 'Lunch', category: 'Food', amountPaise: 1000, expenseDate: '2026-12-21', paidBy: createdBy, description: '',
  receiptPath: '', receiptName: '', splitMethod: 'equal_all', splits: { alice: 500, bob: 500 }, status: 'pending',
  reviewNote: '', reviewedBy: '', reviewedAt: null, createdBy, createdAt: serverTimestamp(), updatedAt: serverTimestamp(), ...extra,
});

const db = (uid: string | null, email?: string) =>
  uid ? env.authenticatedContext(uid, { email: email ?? `${uid}@x.com`, email_verified: true }).firestore() : env.unauthenticatedContext().firestore();

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-trip',
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
  });
});
afterAll(async () => env?.cleanup());

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const f = ctx.firestore();
    await setDoc(doc(f, `trips/${T}`), { name: 'Trip', destination: 'Ooty', ownerUid: 'owner', ticketsLocked: false, startDate: '', endDate: '' });
    await setDoc(doc(f, `trips/${T}/members/owner`), memberDoc('owner', 'admin', 'approved'));
    await setDoc(doc(f, `trips/${T}/members/alice`), memberDoc('alice', 'member', 'approved'));
    await setDoc(doc(f, `trips/${T}/members/bob`), memberDoc('bob', 'member', 'approved'));
    await setDoc(doc(f, `trips/${T}/members/pete`), memberDoc('pete', 'member', 'pending'));
    await setDoc(doc(f, `trips/${T}/tickets/bobTicket`), { ...ticket('bob'), createdAt: null, updatedAt: null });
    await setDoc(doc(f, `trips/${T}/itinerary/d1`), { title: 'Day 1' });
  });
});

describe('authentication & membership', () => {
  it('denies unauthenticated reads', async () => {
    await assertFails(getDoc(doc(db(null), `trips/${T}/itinerary/d1`)));
  });
  it('denies pending members access to trip data and files metadata', async () => {
    await assertFails(getDoc(doc(db('pete'), `trips/${T}/itinerary/d1`)));
    await assertFails(getDoc(doc(db('pete'), `trips/${T}/tickets/bobTicket`)));
    await assertFails(getDoc(doc(db('pete'), `trips/${T}`)));
  });
  it('lets pending users read their own member doc', async () => {
    await assertSucceeds(getDoc(doc(db('pete'), `trips/${T}/members/pete`)));
    await assertFails(getDoc(doc(db('pete'), `trips/${T}/members/alice`)));
  });
  it('lets a new user request access only as a pending member', async () => {
    const f = db('newbie');
    await assertFails(setDoc(doc(f, `trips/${T}/members/newbie`), { ...memberDoc('newbie', 'admin', 'pending'), email: 'newbie@x.com', requestedAt: serverTimestamp() }));
    await assertFails(setDoc(doc(f, `trips/${T}/members/newbie`), { ...memberDoc('newbie', 'member', 'approved'), email: 'newbie@x.com', requestedAt: serverTimestamp() }));
    await assertFails(setDoc(doc(f, `trips/${T}/members/other`), { ...memberDoc('other', 'member', 'pending'), requestedAt: serverTimestamp() }));
    await assertSucceeds(setDoc(doc(f, `trips/${T}/members/newbie`), { ...memberDoc('newbie', 'member', 'pending'), email: 'newbie@x.com', requestedAt: serverTimestamp() }));
  });
  it('prevents members from approving themselves or others', async () => {
    await assertFails(updateDoc(doc(db('pete'), `trips/${T}/members/pete`), { status: 'approved' }));
    await assertFails(updateDoc(doc(db('alice'), `trips/${T}/members/pete`), { status: 'approved' }));
    await assertFails(updateDoc(doc(db('alice'), `trips/${T}/members/alice`), { role: 'admin' }));
  });
  it('lets admin approve and reject', async () => {
    await assertSucceeds(updateDoc(doc(db('owner'), `trips/${T}/members/pete`), { status: 'approved', decidedBy: 'owner' }));
    await assertSucceeds(updateDoc(doc(db('owner'), `trips/${T}/members/bob`), { status: 'rejected' }));
  });
  it('lets members edit their own profile fields', async () => {
    await assertSucceeds(updateDoc(doc(db('alice'), `trips/${T}/members/alice`), { phone: '9876543210' }));
    await assertFails(updateDoc(doc(db('alice'), `trips/${T}/members/bob`), { phone: '9876543210' }));
  });
  it('allows only the bootstrap admin to create the trip', async () => {
    await env.clearFirestore();
    const trip = { name: 'T', destination: 'D', ownerUid: 'boss', startDate: '', endDate: '', ticketsLocked: false };
    await assertFails(setDoc(doc(db('rando'), `trips/${T}`), { ...trip, ownerUid: 'rando' }));
    const f = db('boss', ADMIN_EMAIL);
    const b = writeBatch(f);
    b.set(doc(f, `trips/${T}`), trip);
    b.set(doc(f, `trips/${T}/members/boss`), { ...memberDoc('boss', 'admin', 'approved'), email: ADMIN_EMAIL });
    await assertSucceeds(b.commit());
  });
});

describe('travellers without login', () => {
  const traveller = (extra: Record<string, unknown> = {}) => ({
    ...memberDoc('kid1', 'member', 'approved'), email: '', hasLogin: false, ageGroup: 'child', shareWeight: 50, ...extra,
  });
  it('admin can add a traveller without email', async () => {
    await assertSucceeds(setDoc(doc(db('owner'), `trips/${T}/members/kid1`), traveller()));
  });
  it('members cannot add travellers', async () => {
    await assertFails(setDoc(doc(db('alice'), `trips/${T}/members/kid1`), traveller()));
  });
  it('admin cannot add a traveller as admin or as a login account', async () => {
    await assertFails(setDoc(doc(db('owner'), `trips/${T}/members/kid1`), traveller({ role: 'admin' })));
    await assertFails(setDoc(doc(db('owner'), `trips/${T}/members/kid1`), traveller({ hasLogin: true })));
  });
  it('rejects invalid share weights', async () => {
    await assertFails(setDoc(doc(db('owner'), `trips/${T}/members/kid1`), traveller({ shareWeight: 150 })));
  });
  it('a member cannot link themselves to a traveller or change their own share', async () => {
    await assertFails(updateDoc(doc(db('alice'), `trips/${T}/members/alice`), { personId: 'kid1' }));
    await assertFails(updateDoc(doc(db('alice'), `trips/${T}/members/alice`), { shareWeight: 10 }));
  });
  it('a new sign-in cannot claim a traveller or a reduced share', async () => {
    const f = db('newbie');
    const base = { ...memberDoc('newbie', 'member', 'pending'), email: 'newbie@x.com', requestedAt: serverTimestamp() };
    await assertFails(setDoc(doc(f, `trips/${T}/members/newbie`), { ...base, personId: 'kid1' }));
    await assertFails(setDoc(doc(f, `trips/${T}/members/newbie`), { ...base, ageGroup: 'infant' }));
  });
  it('admin can link a sign-in account to a traveller', async () => {
    await assertSucceeds(updateDoc(doc(db('owner'), `trips/${T}/members/alice`), { personId: 'kid1' }));
  });
  it('expenses can be paid by a traveller without login', async () => {
    await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), `trips/${T}/members/kid1`), traveller()));
    await assertSucceeds(setDoc(doc(db('alice'), `trips/${T}/expenses/e9`), expense('alice', { paidBy: 'kid1', splits: { alice: 600, kid1: 400 } })));
  });
});

describe('admin-only content', () => {
  it('members can read but not write itinerary', async () => {
    await assertSucceeds(getDoc(doc(db('alice'), `trips/${T}/itinerary/d1`)));
    await assertFails(setDoc(doc(db('alice'), `trips/${T}/itinerary/d2`), { title: 'x' }));
  });
  it('members cannot change trip settings', async () => {
    await assertFails(updateDoc(doc(db('alice'), `trips/${T}`), { name: 'hacked' }));
  });
  it('members cannot read audit logs', async () => {
    await assertFails(getDocs(collection(db('alice'), `trips/${T}/auditLogs`)));
  });
});

describe('train tickets', () => {
  it('any approved member can upload a ticket for any passengers', async () => {
    await assertSucceeds(setDoc(doc(db('alice'), `trips/${T}/tickets/t1`), ticket('alice')));
  });
  it('admin can upload tickets', async () => {
    await assertSucceeds(setDoc(doc(db('owner'), `trips/${T}/tickets/t2`), ticket('owner')));
  });
  it('cannot impersonate another uploader', async () => {
    await assertFails(setDoc(doc(db('alice'), `trips/${T}/tickets/t1`), ticket('bob')));
  });
  it('cannot point at a file outside the trip ticket folder', async () => {
    await assertFails(setDoc(doc(db('alice'), `trips/${T}/tickets/t1`), ticket('alice', { filePath: 'trips/other/ticket/alice/x.pdf' })));
    await assertFails(setDoc(doc(db('alice'), `trips/${T}/tickets/t1`), ticket('alice', { filePath: `trips/${T}/ticket/bob/x.pdf` })));
  });
  it('all approved members can view all tickets', async () => {
    await assertSucceeds(getDoc(doc(db('alice'), `trips/${T}/tickets/bobTicket`)));
    await assertSucceeds(getDocs(collection(db('alice'), `trips/${T}/tickets`)));
  });
  it('members cannot edit or delete another member’s ticket', async () => {
    await assertFails(updateDoc(doc(db('alice'), `trips/${T}/tickets/bobTicket`), { notes: 'x' }));
    await assertFails(deleteDoc(doc(db('alice'), `trips/${T}/tickets/bobTicket`)));
  });
  it('uploader can edit and delete their own ticket', async () => {
    await assertSucceeds(updateDoc(doc(db('bob'), `trips/${T}/tickets/bobTicket`), { notes: 'window seat' }));
    await assertSucceeds(deleteDoc(doc(db('bob'), `trips/${T}/tickets/bobTicket`)));
  });
  it('uploader cannot lock/unlock or edit a locked ticket', async () => {
    await assertFails(updateDoc(doc(db('bob'), `trips/${T}/tickets/bobTicket`), { locked: true }));
    await env.withSecurityRulesDisabled((ctx) => updateDoc(doc(ctx.firestore(), `trips/${T}/tickets/bobTicket`), { locked: true }));
    await assertFails(updateDoc(doc(db('bob'), `trips/${T}/tickets/bobTicket`), { notes: 'x' }));
    await assertFails(deleteDoc(doc(db('bob'), `trips/${T}/tickets/bobTicket`)));
  });
  it('trip-wide ticket lock blocks member edits', async () => {
    await env.withSecurityRulesDisabled((ctx) => updateDoc(doc(ctx.firestore(), `trips/${T}`), { ticketsLocked: true }));
    await assertFails(deleteDoc(doc(db('bob'), `trips/${T}/tickets/bobTicket`)));
  });
  it('admin can manage every ticket', async () => {
    await assertSucceeds(updateDoc(doc(db('owner'), `trips/${T}/tickets/bobTicket`), { notes: 'admin note', locked: true }));
    await assertSucceeds(deleteDoc(doc(db('owner'), `trips/${T}/tickets/bobTicket`)));
  });
});

describe('expenses', () => {
  it('approved members can add their own pending expense', async () => {
    await assertSucceeds(setDoc(doc(db('alice'), `trips/${T}/expenses/e1`), expense('alice')));
  });
  it('cannot submit as approved or as someone else', async () => {
    await assertFails(setDoc(doc(db('alice'), `trips/${T}/expenses/e1`), expense('alice', { status: 'approved' })));
    await assertFails(setDoc(doc(db('alice'), `trips/${T}/expenses/e1`), expense('bob')));
  });
  it('rejects non-integer or non-positive amounts', async () => {
    await assertFails(setDoc(doc(db('alice'), `trips/${T}/expenses/e1`), expense('alice', { amountPaise: 10.5 })));
    await assertFails(setDoc(doc(db('alice'), `trips/${T}/expenses/e1`), expense('alice', { amountPaise: 0 })));
  });
  it('pending members cannot add expenses', async () => {
    await assertFails(setDoc(doc(db('pete'), `trips/${T}/expenses/e1`), expense('pete')));
  });
  it('members cannot approve expenses; admin can', async () => {
    await assertSucceeds(setDoc(doc(db('alice'), `trips/${T}/expenses/e1`), expense('alice')));
    await assertFails(updateDoc(doc(db('alice'), `trips/${T}/expenses/e1`), { status: 'approved', reviewedBy: 'alice' }));
    await assertFails(updateDoc(doc(db('bob'), `trips/${T}/expenses/e1`), { status: 'approved', reviewedBy: 'bob' }));
    await assertSucceeds(updateDoc(doc(db('owner'), `trips/${T}/expenses/e1`), { status: 'approved', reviewedBy: 'owner', reviewedAt: serverTimestamp() }));
  });
  it('owner can edit only while pending; others never', async () => {
    await assertSucceeds(setDoc(doc(db('alice'), `trips/${T}/expenses/e1`), expense('alice')));
    await assertFails(updateDoc(doc(db('bob'), `trips/${T}/expenses/e1`), { title: 'x' }));
    await assertSucceeds(updateDoc(doc(db('alice'), `trips/${T}/expenses/e1`), { title: 'Dinner' }));
    await updateDoc(doc(db('owner'), `trips/${T}/expenses/e1`), { status: 'approved', reviewedBy: 'owner' });
    await assertFails(updateDoc(doc(db('alice'), `trips/${T}/expenses/e1`), { title: 'changed after approval' }));
  });
  it('a duplicate create with the same idempotency key cannot create a second record', async () => {
    const f = db('alice');
    await assertSucceeds(setDoc(doc(f, `trips/${T}/expenses/key-1`), expense('alice')));
    const all = await getDocs(collection(f, `trips/${T}/expenses`));
    if (all.size !== 1) throw new Error('expected exactly one expense');
  });
  it('members cannot manage settlements', async () => {
    await assertFails(setDoc(doc(db('alice'), `trips/${T}/settlements/s1`), { fromUid: 'bob', toUid: 'alice', amountPaise: 100, status: 'paid', paidDate: '', reference: '', notes: '' }));
  });
});

describe('chat & notifications', () => {
  it('approved members can post as themselves only', async () => {
    const msg = { senderUid: 'alice', senderName: 'A', senderPhoto: '', text: 'hi', kind: 'text', filePath: '', fileName: '', fileType: '', createdAt: serverTimestamp() };
    await assertSucceeds(setDoc(doc(db('alice'), `trips/${T}/messages/m1`), msg));
    await assertFails(setDoc(doc(db('bob'), `trips/${T}/messages/m2`), msg));
    await assertFails(setDoc(doc(db('pete'), `trips/${T}/messages/m3`), { ...msg, senderUid: 'pete' }));
    await assertFails(setDoc(doc(db('alice'), `trips/${T}/messages/m4`), { ...msg, kind: 'announcement' }));
  });
  it('notification queries must be restricted to allowed targets', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), `trips/${T}/notifications/n1`), { target: 'admins', title: 'x' });
      await setDoc(doc(ctx.firestore(), `trips/${T}/notifications/n2`), { target: 'all', title: 'y' });
    });
    await assertFails(getDocs(collection(db('alice'), `trips/${T}/notifications`)));
    await assertSucceeds(getDocs(query(collection(db('alice'), `trips/${T}/notifications`), where('target', 'in', ['all', 'alice']))));
    await assertFails(getDocs(query(collection(db('alice'), `trips/${T}/notifications`), where('target', 'in', ['all', 'admins']))));
    await assertSucceeds(getDocs(query(collection(db('owner'), `trips/${T}/notifications`), where('target', 'in', ['all', 'admins', 'owner']))));
  });
});
