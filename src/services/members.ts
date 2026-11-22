import { deleteDoc, doc, serverTimestamp, setDoc, updateDoc, writeBatch, type DocumentData } from 'firebase/firestore';
import type { User } from 'firebase/auth';
import { db, tripPath } from '../lib/firebase';
import type { AgeGroup, Member, MemberStatus, Role } from '../domain/types';
import { newId } from '../lib/ids';
import { familyOf } from '../domain/people';
import { logAudit, notify, strip } from './base';

const ref = (uid: string) => doc(db, tripPath('members', uid));

export async function requestAccess(user: User, note: string, profile: { phone: string; relationship: string }, existing: Member | null) {
  const data = {
    displayName: user.displayName ?? user.email ?? 'Guest',
    photoURL: user.photoURL ?? '',
    phone: profile.phone.trim().slice(0, 30),
    emergencyContact: existing?.emergencyContact ?? '',
    relationship: profile.relationship.trim().slice(0, 100),
    requestNote: note.trim().slice(0, 500),
    requestedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    status: 'pending' as const,
  };
  if (existing) {
    await updateDoc(ref(user.uid), { ...data, role: 'member' });
  } else {
    await setDoc(ref(user.uid), {
      ...data,
      uid: user.uid,
      email: user.email ?? '',
      role: 'member',
      decidedAt: null,
      decidedBy: '',
    });
  }
  await notify({
    type: 'access_request',
    title: 'New access request',
    body: `${data.displayName} wants to join the trip.`,
    link: '/admin/approvals',
    target: 'admins',
  });
}

/**
 * Approve/reject/disable. When approving, `linkTo` connects this sign-in
 * account to an existing traveller (added by the admin), so expenses,
 * tickets and rooms of that traveller become "mine" for this account.
 */
export async function decideMember(adminUid: string, m: Member, status: MemberStatus, linkTo?: Member | null) {
  await updateDoc(ref(m.uid), {
    status,
    decidedAt: serverTimestamp(),
    decidedBy: adminUid,
    updatedAt: serverTimestamp(),
    // linkTo === undefined keeps any existing link; null means "a new traveller".
    ...(status === 'approved' && linkTo !== undefined ? { personId: linkTo?.uid ?? '' } : {}),
  });
  if (status === 'approved' && linkTo) {
    await updateDoc(ref(linkTo.uid), { linkedUid: m.uid, updatedAt: serverTimestamp() });
  }
  await logAudit(status, 'member', m.uid, `${status} ${m.displayName} (${m.email})${linkTo ? ` as ${linkTo.displayName}` : ''}`, { status: m.status }, { status, personId: linkTo?.uid ?? '' });
  if (status === 'approved' || status === 'rejected') {
    await notify({
      type: 'member_decision',
      title: status === 'approved' ? 'Welcome to the trip!' : 'Access request declined',
      body: status === 'approved' ? 'Your access has been approved.' : 'Your request to join the trip was declined.',
      link: '/',
      target: m.uid,
    });
  }
}

export async function setMemberRole(m: Member, role: Role) {
  await updateDoc(ref(m.uid), { role, updatedAt: serverTimestamp() });
  await logAudit('role', 'member', m.uid, `Changed ${m.displayName}'s role to ${role}`, { role: m.role }, { role });
}

export type ProfileInput = Pick<Member, 'displayName' | 'phone' | 'emergencyContact' | 'relationship'> & {
  email?: string;
  ageGroup?: AgeGroup;
  /** true = use shareWeight instead of the trip default (children / infants only) */
  customShare?: boolean;
  shareWeight?: number;
};

function clampPct(w: number | undefined): number {
  const v = Math.round(Number(w));
  return Number.isFinite(v) ? Math.min(100, Math.max(0, v)) : 0;
}

/** Share fields to store: adults are always 100; others follow the trip default unless customised. */
export function shareFields(ageGroup: AgeGroup, customShare: boolean | undefined, shareWeight: number | undefined) {
  if (ageGroup === 'adult') return { ageGroup, customShare: false, shareWeight: 100 };
  const custom = Boolean(customShare);
  return { ageGroup, customShare: custom, shareWeight: custom ? clampPct(shareWeight) : 0 };
}

/** Admin adds a traveller who does not need to sign in. Email is optional. */
export async function addPerson(input: ProfileInput): Promise<string> {
  const id = 'p_' + newId().replace(/-/g, '');
  const ageGroup = input.ageGroup ?? 'adult';
  const data = {
    uid: id,
    displayName: input.displayName.trim().slice(0, 100),
    email: (input.email ?? '').trim().toLowerCase().slice(0, 200),
    photoURL: '',
    phone: input.phone.trim().slice(0, 30),
    emergencyContact: input.emergencyContact.trim().slice(0, 200),
    relationship: input.relationship.trim().slice(0, 100),
    role: 'member' as const,
    status: 'approved' as const,
    requestNote: '',
    requestedAt: serverTimestamp(),
    decidedAt: serverTimestamp(),
    decidedBy: '',
    updatedAt: serverTimestamp(),
    ...shareFields(ageGroup, input.customShare, input.shareWeight),
    hasLogin: false,
    personId: '',
    linkedUid: '',
  };
  await setDoc(ref(id), data);
  await logAudit('create', 'member', id, `Added traveller ${data.displayName} (${ageGroup}${data.customShare ? ` ${data.shareWeight}%` : ''}${data.relationship ? `, ${data.relationship}` : ''})`, null, data as never);
  return id;
}

export async function updateMemberProfile(m: Member, input: ProfileInput, asAdmin: boolean) {
  const data: DocumentData = {
    displayName: input.displayName.trim().slice(0, 100),
    phone: input.phone.trim().slice(0, 30),
    emergencyContact: input.emergencyContact.trim().slice(0, 200),
    relationship: input.relationship.trim().slice(0, 100),
    updatedAt: serverTimestamp(),
  };
  if (asAdmin && input.ageGroup) Object.assign(data, shareFields(input.ageGroup, input.customShare, input.shareWeight));
  if (asAdmin && m.hasLogin === false && input.email !== undefined) data.email = input.email.trim().toLowerCase().slice(0, 200);
  await updateDoc(ref(m.uid), data);
  if (asAdmin) await logAudit('update', 'member', m.uid, `Edited ${m.displayName}'s details`, strip(m as never), data as never);
}

export async function removeMember(m: Member) {
  await deleteDoc(ref(m.uid));
  if (m.personId) await updateDoc(ref(m.personId), { linkedUid: '', updatedAt: serverTimestamp() }).catch(() => undefined);
  await logAudit('delete', 'member', m.uid, `Removed ${m.displayName} (${m.email})`, strip(m as never), null);
}

/** Rename a family: updates every member whose family matches (case-insensitive). */
export async function renameFamily(from: string, to: string, members: Member[]) {
  const target = to.trim().replace(/\s+/g, ' ').slice(0, 100);
  if (!target) throw new Error('Family name is required.');
  const affected = members.filter((m) => familyOf(m).toLowerCase() === from.trim().toLowerCase());
  const b = writeBatch(db);
  for (const m of affected) b.update(ref(m.uid), { relationship: target, updatedAt: serverTimestamp() });
  await b.commit();
  await logAudit('update', 'family', target, `Renamed family “${from}” to “${target}” (${affected.length} people)`);
}

/** Move one person to a family ('' = no family). Used by the drag-and-drop board. */
export async function setFamily(m: Member, family: string) {
  const name = family.trim().replace(/\s+/g, ' ').slice(0, 100);
  if (familyOf(m) === name) return;
  await updateDoc(ref(m.uid), { relationship: name, updatedAt: serverTimestamp() });
  await logAudit('update', 'family', m.uid, `Moved ${m.displayName} ${name ? `to “${name}”` : 'out of their family'}${familyOf(m) ? ` (was “${familyOf(m)}”)` : ''}`, { relationship: m.relationship }, { relationship: name });
}
