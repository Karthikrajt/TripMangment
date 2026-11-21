import { useMemo, useState } from 'react';
import { Mail, Phone, Pencil, Shield, ShieldOff, UserX, UserCheck, Trash2, Users } from 'lucide-react';
import { useSession, useIsAdmin } from '../store/session';
import { useExpenses, useRooms, useTickets } from '../hooks/data';
import { PageHeader } from '../components/ui/PageHeader';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Badge, EmptyState } from '../components/ui/Feedback';
import { Avatar } from '../components/ui/Avatar';
import { Modal } from '../components/ui/Modal';
import { FormError, TextField } from '../components/ui/Field';
import { confirm } from '../components/ui/Confirm';
import { toast } from '../components/ui/Toast';
import { decideMember, removeMember, setMemberRole, updateMemberProfile } from '../services/members';
import { formatINR, sumPaise } from '../domain/money';
import { telHref } from '../lib/format';
import { errorMessage } from '../lib/retry';
import { isPhone } from '../domain/validation';
import type { Member, MemberStatus } from '../domain/types';

const statusTone: Record<MemberStatus, 'green' | 'amber' | 'red' | 'slate'> = { approved: 'green', pending: 'amber', rejected: 'red', disabled: 'slate' };

export default function Members() {
  const { members, member: me, trip } = useSession();
  const admin = useIsAdmin();
  const expenses = useExpenses();
  const tickets = useTickets();
  const rooms = useRooms();
  const [filter, setFilter] = useState<'approved' | 'all'>('approved');
  const [editing, setEditing] = useState<Member | null>(null);
  const [detail, setDetail] = useState<Member | null>(null);

  const list = useMemo(() => (filter === 'approved' || !admin ? members.filter((m) => m.status === 'approved') : members), [members, filter, admin]);
  const groups = useMemo(() => {
    const g = new Map<string, Member[]>();
    for (const m of list) {
      const k = m.relationship || 'Other members';
      g.set(k, [...(g.get(k) ?? []), m]);
    }
    return [...g.entries()].sort((a, b) => (a[0] === 'Other members' ? 1 : b[0] === 'Other members' ? -1 : a[0].localeCompare(b[0])));
  }, [list]);

  const act = async (fn: () => Promise<void>, ok: string) => {
    try {
      await fn();
      toast.success(ok);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const stats = (uid: string) => {
    const approved = expenses.data.filter((e) => e.status === 'approved');
    return {
      paid: sumPaise(approved.filter((e) => e.paidBy === uid).map((e) => e.amountPaise)),
      share: sumPaise(approved.map((e) => e.splits[uid] ?? 0)),
      tickets: tickets.data.filter((t) => t.passengerUids.includes(uid)),
      room: rooms.data.find((r) => r.memberUids.includes(uid)),
    };
  };

  return (
    <div>
      <PageHeader title={admin ? 'Member Management' : 'Trip Members'} subtitle={`${members.filter((m) => m.status === 'approved').length} people on this trip`}
        actions={admin && (
          <div className="flex rounded-xl bg-slate-100 p-1">
            {(['approved', 'all'] as const).map((k) => (
              <button key={k} onClick={() => setFilter(k)} className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${filter === k ? 'bg-white shadow-sm' : 'text-slate-600'}`}>{k === 'approved' ? 'Approved' : 'Everyone'}</button>
            ))}
          </div>
        )} />
      {list.length === 0 ? <EmptyState icon={<Users className="size-7" />} title="No members yet" /> : (
        <div className="space-y-6">
          {groups.map(([group, ms]) => (
            <section key={group}>
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">{group} ({ms.length})</h2>
              <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {ms.map((m) => {
                  const isOwner = trip?.ownerUid === m.uid;
                  return (
                    <Card as="li" key={m.uid} className="p-4">
                      <button className="flex w-full items-center gap-3 text-left" onClick={() => setDetail(m)}>
                        <Avatar name={m.displayName} photo={m.photoURL} size={48} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-semibold">{m.displayName}{m.uid === me?.uid && ' (you)'}</span>
                          <span className="flex flex-wrap gap-1">
                            {m.role === 'admin' && <Badge tone="violet"><Shield className="size-3" /> Admin</Badge>}
                            {m.status !== 'approved' && <Badge tone={statusTone[m.status]}>{m.status}</Badge>}
                          </span>
                        </span>
                      </button>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {m.phone && <a href={telHref(m.phone)} className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-2.5 py-1.5 text-sm font-semibold text-emerald-800"><Phone className="size-4" /> Call</a>}
                        {admin && (
                          <>
                            <Button size="sm" variant="ghost" icon={<Pencil className="size-4" />} onClick={() => setEditing(m)}>Edit</Button>
                            {!isOwner && m.uid !== me?.uid && m.status === 'approved' && (
                              <Button size="sm" variant="ghost" icon={m.role === 'admin' ? <ShieldOff className="size-4" /> : <Shield className="size-4" />}
                                onClick={async () => (await confirm({ title: m.role === 'admin' ? 'Remove admin rights?' : 'Make admin?', message: `${m.displayName} will ${m.role === 'admin' ? 'become a regular member' : 'get full admin access to the trip'}.` })) && act(() => setMemberRole(m, m.role === 'admin' ? 'member' : 'admin'), 'Role updated')}>
                                {m.role === 'admin' ? 'Remove admin' : 'Make admin'}
                              </Button>
                            )}
                            {!isOwner && m.uid !== me?.uid && (m.status === 'approved' ? (
                              <Button size="sm" variant="ghost" className="text-red-700" icon={<UserX className="size-4" />}
                                onClick={async () => (await confirm({ title: 'Disable access?', message: `${m.displayName} will immediately lose access to all trip data and files.`, danger: true, confirmLabel: 'Disable' })) && act(() => decideMember(me!.uid, m, 'disabled'), 'Access disabled')}>
                                Disable
                              </Button>
                            ) : (
                              <Button size="sm" variant="ghost" icon={<UserCheck className="size-4" />} onClick={() => act(() => decideMember(me!.uid, m, 'approved'), 'Access restored')}>Approve</Button>
                            ))}
                            {!isOwner && m.status !== 'approved' && (
                              <Button size="sm" variant="ghost" className="text-red-700" aria-label="Remove member" icon={<Trash2 className="size-4" />}
                                onClick={async () => (await confirm({ title: 'Remove member record?', message: `${m.displayName}'s membership record will be deleted. Their past expenses stay in the history.`, danger: true, confirmLabel: 'Remove' })) && act(() => removeMember(m), 'Member removed')} />
                            )}
                          </>
                        )}
                      </div>
                    </Card>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
      {editing && <EditMember member={editing} onClose={() => setEditing(null)} />}
      {detail && (() => {
        const s = stats(detail.uid);
        return (
          <Modal open onClose={() => setDetail(null)} title={detail.displayName}>
            <div className="space-y-3">
              <div className="flex items-center gap-3"><Avatar name={detail.displayName} photo={detail.photoURL} size={56} /><div><p className="font-semibold">{detail.displayName}</p><p className="text-sm text-slate-500">{detail.relationship}</p></div></div>
              {detail.email && <p className="flex items-center gap-2"><Mail className="size-4 text-slate-400" /> {detail.email}</p>}
              {detail.phone && <p className="flex items-center gap-2"><Phone className="size-4 text-slate-400" /> <a className="text-brand-700 font-semibold" href={telHref(detail.phone)}>{detail.phone}</a></p>}
              {detail.emergencyContact && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-900">🚑 Emergency contact: {detail.emergencyContact}</p>}
              <dl className="grid grid-cols-2 gap-2 rounded-xl bg-slate-50 p-3 text-sm">
                <div><dt className="text-slate-500">Paid</dt><dd className="font-semibold">{formatINR(s.paid)}</dd></div>
                <div><dt className="text-slate-500">Share</dt><dd className="font-semibold">{formatINR(s.share)}</dd></div>
                <div><dt className="text-slate-500">Tickets</dt><dd className="font-semibold">{s.tickets.length ? s.tickets.map((t) => t.title).join(', ') : '—'}</dd></div>
                <div><dt className="text-slate-500">Room</dt><dd className="font-semibold">{s.room?.name ?? '—'}</dd></div>
              </dl>
              {admin && detail.requestNote && <p className="text-sm text-slate-600">Request note: “{detail.requestNote}”</p>}
            </div>
          </Modal>
        );
      })()}
    </div>
  );
}

export function EditMember({ member, onClose }: { member: Member; onClose: () => void }) {
  const me = useSession((s) => s.member);
  const [v, setV] = useState({ displayName: member.displayName, phone: member.phone, emergencyContact: member.emergencyContact, relationship: member.relationship });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = async () => {
    if (!v.displayName.trim()) return setError('Name is required.');
    if (v.phone && !isPhone(v.phone)) return setError('Invalid mobile number.');
    setBusy(true);
    try {
      await updateMemberProfile(member, v, me?.uid !== member.uid);
      toast.success('Details saved');
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open onClose={onClose} title={`Edit ${member.displayName}`} footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={busy} onClick={save}>Save</Button></>}>
      <div className="space-y-4">
        <TextField label="Full name" required maxLength={100} value={v.displayName} onChange={(e) => setV({ ...v, displayName: e.target.value })} />
        <TextField label="Mobile number" inputMode="tel" maxLength={30} value={v.phone} onChange={(e) => setV({ ...v, phone: e.target.value })} />
        <TextField label="Emergency contact" maxLength={200} value={v.emergencyContact} onChange={(e) => setV({ ...v, emergencyContact: e.target.value })} placeholder="Name – phone" />
        <TextField label="Family / group" maxLength={100} value={v.relationship} onChange={(e) => setV({ ...v, relationship: e.target.value })} placeholder="Kumar family" />
        <FormError message={error} />
      </div>
    </Modal>
  );
}
