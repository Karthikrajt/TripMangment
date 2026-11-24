import { deleteDoc, getDoc, serverTimestamp, setDoc, updateDoc, addDoc } from 'firebase/firestore';
import { tripCol, tripDoc, logAudit, notify, strip } from './base';
import { deleteFile } from '../lib/files';
import { writeOrQueue } from '../lib/offlineQueue';
import { formatINR } from '../domain/money';
import { isSplitConsistent } from '../domain/split';
import type { Expense, ExpenseStatus, Settlement } from '../domain/types';

export type ExpenseInput = Pick<
  Expense,
  'title' | 'category' | 'amountPaise' | 'expenseDate' | 'paidBy' | 'description' | 'receiptPath' | 'receiptName' | 'splitMethod' | 'splits'
>;

/**
 * Submit an expense. `idempotencyKey` is the document id: Firestore's offline
 * queue retries the same write, and a second submit with the same key can
 * only ever touch the same record, so duplicates are impossible.
 * The local write is applied immediately (works offline); the returned
 * promise resolves when the server has acknowledged it.
 */
export async function submitExpense(idempotencyKey: string, input: ExpenseInput, by: { uid: string; name: string }): Promise<'saved' | 'queued'> {
  if (!isSplitConsistent(input.amountPaise, input.splits)) throw new Error('Split amounts must add up exactly to the total.');
  const ref = tripDoc('expenses', idempotencyKey);
  const result = await writeOrQueue(setDoc(ref, {
    ...input,
    status: 'pending',
    reviewNote: '',
    reviewedBy: '',
    reviewedAt: null,
    createdBy: by.uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }));
  // Audit and in-app notification are queued too when offline.
  await logAudit('create', 'expense', idempotencyKey, `Submitted expense “${input.title}” ${formatINR(input.amountPaise)}`, null, input as never);
  await notify({ type: 'expense_submitted', title: 'Expense awaiting approval', body: `${by.name}: ${input.title} – ${formatINR(input.amountPaise)}`, link: '/expenses?tab=review', target: 'admins' });
  return result;
}

export async function updateExpense(before: Expense, input: ExpenseInput): Promise<'saved' | 'queued'> {
  if (!isSplitConsistent(input.amountPaise, input.splits)) throw new Error('Split amounts must add up exactly to the total.');
  const result = await writeOrQueue(updateDoc(tripDoc('expenses', before.id), { ...input, updatedAt: serverTimestamp() }));
  if (result === 'saved' && before.receiptPath && before.receiptPath !== input.receiptPath) await deleteFile(before.receiptPath).catch(() => undefined);
  await logAudit('update', 'expense', before.id, `Edited expense “${input.title}”`, strip(before as never), input as never);
  return result;
}

export async function reviewExpense(e: Expense, status: ExpenseStatus, adminUid: string, note: string) {
  if (status === 'approved' && !isSplitConsistent(e.amountPaise, e.splits)) {
    throw new Error('This expense’s split does not add up to its total. Edit it before approving.');
  }
  await updateDoc(tripDoc('expenses', e.id), {
    status,
    reviewNote: note.trim().slice(0, 500),
    reviewedBy: adminUid,
    reviewedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  await logAudit(status === 'approved' ? 'approve' : status === 'rejected' ? 'reject' : 'reopen', 'expense', e.id, `${status} expense “${e.title}” ${formatINR(e.amountPaise)}`, { status: e.status }, { status, reviewNote: note });
  if (status !== 'pending') {
    await notify({ type: 'expense_reviewed', title: `Expense ${status}`, body: `“${e.title}” (${formatINR(e.amountPaise)}) was ${status}${note ? `: ${note}` : ''}`, link: '/expenses', target: e.createdBy });
  }
}

export async function deleteExpense(e: Expense) {
  if (e.receiptPath) await deleteFile(e.receiptPath).catch(() => undefined);
  await deleteDoc(tripDoc('expenses', e.id));
  await logAudit('delete', 'expense', e.id, `Deleted expense “${e.title}” ${formatINR(e.amountPaise)}`, strip(e as never), null);
}

export async function expenseExists(id: string): Promise<boolean> {
  const s = await getDoc(tripDoc('expenses', id)).catch(() => null);
  return Boolean(s?.exists());
}

// ---------- settlements (separate from expenses) ----------
export async function recordSettlement(input: Pick<Settlement, 'fromUid' | 'toUid' | 'amountPaise' | 'status' | 'paidDate' | 'reference' | 'notes'>, adminUid: string) {
  const ref = await addDoc(tripCol('settlements'), { ...input, createdBy: adminUid, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  await logAudit('create', 'settlement', ref.id, `Recorded settlement ${formatINR(input.amountPaise)} (${input.status})`, null, input as never);
  await notify({ type: 'settlement_updated', title: 'Settlement recorded', body: `${formatINR(input.amountPaise)} marked ${input.status}`, link: '/settlements', target: input.fromUid });
  await notify({ type: 'settlement_updated', title: 'Settlement recorded', body: `${formatINR(input.amountPaise)} marked ${input.status}`, link: '/settlements', target: input.toUid });
}

export async function updateSettlement(before: Settlement, patch: Partial<Pick<Settlement, 'status' | 'paidDate' | 'reference' | 'notes'>>) {
  await updateDoc(tripDoc('settlements', before.id), { ...patch, updatedAt: serverTimestamp() });
  await logAudit('update', 'settlement', before.id, `Updated settlement ${formatINR(before.amountPaise)} → ${patch.status ?? before.status}`, strip(before as never), patch);
}

/** Payer: "I've paid" – waits for the receiver or admin to confirm before it counts. */
export async function reportPayment(input: { fromUid: string; toUid: string; amountPaise: number; reference: string; notes: string; paidDate: string }, byUid: string, receiverAccounts: string[]) {
  const data = { ...input, status: 'reported' as const, createdBy: byUid, createdAt: serverTimestamp(), updatedAt: serverTimestamp() };
  const ref = await addDoc(tripCol('settlements'), data);
  await logAudit('report', 'settlement', ref.id, `Reported payment ${formatINR(input.amountPaise)}`, null, input as never);
  const targets = receiverAccounts.length ? receiverAccounts : ['admins'];
  for (const target of targets) {
    await notify({ type: 'payment_reported', title: 'Payment sent – please confirm', body: `${formatINR(input.amountPaise)} was sent to you. Check your UPI app and tap Confirm.`, link: '/settlements', target });
  }
  if (receiverAccounts.length) await notify({ type: 'payment_reported', title: 'Payment reported', body: `${formatINR(input.amountPaise)} reported as paid, waiting for confirmation.`, link: '/settlements', target: 'admins' });
}

/** Receiver or admin: the money arrived. */
export async function confirmPayment(s: Settlement, paidDate: string) {
  await updateDoc(tripDoc('settlements', s.id), { status: 'paid', paidDate: s.paidDate || paidDate, updatedAt: serverTimestamp() });
  await logAudit('confirm', 'settlement', s.id, `Confirmed payment ${formatINR(s.amountPaise)}`, { status: s.status }, { status: 'paid' });
  await notify({ type: 'settlement_updated', title: 'Payment confirmed', body: `${formatINR(s.amountPaise)} confirmed as received. Thank you!`, link: '/settlements', target: s.createdBy });
}

export async function deleteSettlement(s: Settlement) {
  await deleteDoc(tripDoc('settlements', s.id));
  await logAudit('delete', 'settlement', s.id, `Deleted settlement ${formatINR(s.amountPaise)}`, strip(s as never), null);
}
