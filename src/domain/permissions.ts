/**
 * UI-side permission helpers. These only decide what to SHOW – the same rules
 * are enforced authoritatively by firestore.rules and the Edge Functions.
 */
import type { Expense, Member, Ticket } from './types';

export const isApproved = (m: Member | null | undefined) => m?.status === 'approved';
export const isAdmin = (m: Member | null | undefined) => isApproved(m) && m!.role === 'admin';

export function canEditTicket(me: Member | null, t: Ticket): boolean {
  if (isAdmin(me)) return true;
  return isApproved(me) && t.uploadedBy === me!.uid && !t.locked;
}

export function canEditExpense(me: Member | null, e: Expense): boolean {
  if (isAdmin(me)) return true;
  return isApproved(me) && e.createdBy === me!.uid && e.status === 'pending';
}
