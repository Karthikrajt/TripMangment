import { deleteDoc, doc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import type { User } from 'firebase/auth';
import { db, tripPath } from '../lib/firebase';
import type { Member, MemberStatus, Role } from '../domain/types';
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

export async function decideMember(adminUid: string, m: Member, status: MemberStatus) {
  await updateDoc(ref(m.uid), { status, decidedAt: serverTimestamp(), decidedBy: adminUid, updatedAt: serverTimestamp() });
  await logAudit(status, 'member', m.uid, `${status} ${m.displayName} (${m.email})`, { status: m.status }, { status });
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

export type ProfileInput = Pick<Member, 'displayName' | 'phone' | 'emergencyContact' | 'relationship'>;

export async function updateMemberProfile(m: Member, input: ProfileInput, asAdmin: boolean) {
  const data = {
    displayName: input.displayName.trim().slice(0, 100),
    phone: input.phone.trim().slice(0, 30),
    emergencyContact: input.emergencyContact.trim().slice(0, 200),
    relationship: input.relationship.trim().slice(0, 100),
    updatedAt: serverTimestamp(),
  };
  await updateDoc(ref(m.uid), data);
  if (asAdmin) await logAudit('update', 'member', m.uid, `Edited ${m.displayName}'s details`, strip(m as never), data as never);
}

export async function removeMember(m: Member) {
  await deleteDoc(ref(m.uid));
  await logAudit('delete', 'member', m.uid, `Removed ${m.displayName} (${m.email})`, strip(m as never), null);
}
