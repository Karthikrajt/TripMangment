/**
 * Travel-day checklist and "Who's on board?" roll calls. Ticks are written as
 * single map fields (done.<key>) so two phones ticking at once never clash,
 * and they work offline (queued and sent when back online).
 */
import { addDoc, deleteDoc, deleteField, serverTimestamp, updateDoc } from 'firebase/firestore';
import { tripCol, tripDoc, notify } from './base';
import { writeOrQueue } from '../lib/offlineQueue';
import type { ChecklistItem, ChecklistScope, Member, RollCall } from '../domain/types';

/**
 * Tick keys: a person's id (letters/digits only), 'f_<family>' or 'group'.
 * Firestore field paths may not contain dots etc., which family names can.
 */
export function familyKey(name: string): string {
  return 'f_' + (name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 90) || '_');
}
export const GROUP_KEY = 'group';

export const DEFAULT_CHECKLIST: { title: string; scope: ChecklistScope }[] = [
  { title: 'ID card (Aadhaar / licence) for the train', scope: 'person' },
  { title: 'Phone charged + power bank', scope: 'person' },
  { title: 'Medicines', scope: 'person' },
  { title: 'Tickets saved offline in the app', scope: 'person' },
  { title: 'Water bottles & snacks', scope: 'family' },
  { title: 'House locked, gas off', scope: 'family' },
  { title: 'Bedsheets / blanket for the train', scope: 'family' },
  { title: 'First-aid kit', scope: 'group' },
];

export async function addChecklistItem(title: string, scope: ChecklistScope, me: Member) {
  return writeOrQueue(
    addDoc(tripCol('checklist'), {
      title: title.trim().slice(0, 150),
      scope,
      done: {},
      createdBy: me.uid,
      createdByName: me.displayName.slice(0, 100),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }),
  );
}

export async function setTick(item: ChecklistItem, key: string, on: boolean) {
  return writeOrQueue(updateDoc(tripDoc('checklist', item.id), { [`done.${key}`]: on ? true : deleteField(), updatedAt: serverTimestamp() }));
}

export async function deleteChecklistItem(item: ChecklistItem) {
  return writeOrQueue(deleteDoc(tripDoc('checklist', item.id)));
}

export async function startRollCall(title: string, personIds: string[], me: Member): Promise<string> {
  const ref = await addDoc(tripCol('rollcalls'), {
    title: title.trim().slice(0, 150),
    personIds: personIds.slice(0, 300),
    present: {},
    open: true,
    createdBy: me.uid,
    createdByName: me.displayName.slice(0, 100),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  await notify({ type: 'roll_call', title: `Roll call: ${title}`.slice(0, 150), body: `${me.displayName} started a head count. Open the app and tap “I’m here”.`, link: `/checklist?roll=${ref.id}`, target: 'all' });
  return ref.id;
}

export async function markPresent(r: RollCall, personId: string, on: boolean) {
  return writeOrQueue(updateDoc(tripDoc('rollcalls', r.id), { [`present.${personId}`]: on ? true : deleteField(), updatedAt: serverTimestamp() }));
}

export async function closeRollCall(r: RollCall, open = false) {
  return writeOrQueue(updateDoc(tripDoc('rollcalls', r.id), { open, updatedAt: serverTimestamp() }));
}

export async function deleteRollCall(r: RollCall) {
  return writeOrQueue(deleteDoc(tripDoc('rollcalls', r.id)));
}
