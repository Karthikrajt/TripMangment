import { useMemo, useState } from 'react';
import { Mail, Phone, Pencil, Shield, ShieldOff, UserX, UserCheck, Trash2, Users, UserPlus, LogIn, Baby } from 'lucide-react';
import { useSession, useIsAdmin } from '../store/session';
import { useExpenses, useRooms, useTickets } from '../hooks/data';
import { PageHeader } from '../components/ui/PageHeader';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Badge, EmptyState, Notice } from '../components/ui/Feedback';
import { Avatar } from '../components/ui/Avatar';
import { Modal } from '../components/ui/Modal';
import { FormError, SelectField, TextField } from '../components/ui/Field';
import { confirm } from '../components/ui/Confirm';
import { toast } from '../components/ui/Toast';
import { addPerson, decideMember, removeMember, setMemberRole, updateMemberProfile } from '../services/members';
import { formatINR, sumPaise } from '../domain/money';
import { ageGroupOf, ageLabel, ageSummary, DEFAULT_WEIGHT, headCount, peopleOf, personIdOf, weightOf } from '../domain/people';
import { telHref } from '../lib/format';
import { errorMessage } from '../lib/retry';
import { isPhone } from '../domain/validation';
import type { AgeGroup, Member, MemberStatus } from '../domain/types';

const statusTone: Record<MemberStatus, 'green' | 'amber' | 'red' | 'slate'> = { approved: 'green', pending: 'amber', rejected: 'red', disabled: 'slate' };

export default function Members() {
  const { members, member: me, trip } = useSession();
  const admin = useIsAdmin();
  const expenses = useExpenses();
  const tickets = useTickets();
  const rooms = useRooms();
  const [editing, setEditing] = useState<Member | 'new' | null>(null);
  const [detail, setDetail] = useState<Member | null>(null);

  const people = useMemo(() => peopleOf(members), [members]);
  const accounts = useMemo(() => members.filter((m) => m.hasLogin !== false && (m.status !== 'approved' || m.personId)), [members]);
  const myId = personIdOf(me);
  const groups = useMemo(() => {
    const g = new Map<string, Member[]>();
    for (const m of people) {
      const k = m.relationship || 'Other';
      g.set(k, [...(g.get(k) ?? []), m]);
    }
    return [...g.entries()].sort((a, b) => (a[0] === 'Other' ? 1 : b[0] === 'Other' ? -1 : a[0].localeCompare(b[0])));
  }, [people]);

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
      used: expenses.data.some((e) => e.paidBy === uid || uid in e.splits),
    };
  };
  const loginFor = (p: Member) => (p.linkedUid ? members.find((m) => m.uid === p.linkedUid) : p.hasLogin === false ? undefined : p);

  return (
    <div>
      <PageHeader
        title={admin ? 'Member Management' : 'Trip Members'}
        subtitle={`${people.length} people · ${ageSummary(people)} · ${headCount(people)} full shares`}
        actions={admin && <Button icon={<UserPlus className="size-5" />} onClick={() => setEditing('new')}>Add traveller</Button>}
      />
      {admin && (
        <div className="mb-5">
          <Notice>
            Add everyone travelling – with or without an email. Only people who need to add expenses or upload tickets have to sign in. When someone signs in, link them to their name under <b>Member Approvals</b>.
          </Notice>
        </div>
      )}
      {people.length === 0 ? <EmptyState icon={<Users className="size-7" />} title="No travellers yet" action={admin && <Button onClick={() => setEditing('new')}>Add traveller</Button>} /> : (
        <div className="space-y-6">
          {groups.map(([group, ms]) => (
            <section key={group}>
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
                {group} ({ms.length}) · {headCount(ms)} shares
              </h2>
              <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {ms.map((m) => {
                  const isOwner = trip?.ownerUid === m.uid;
                  const login = loginFor(m);
                  const s = stats(m.uid);
                  return (
                    <Card as="li" key={m.uid} className="p-4">
                      <button className="flex w-full items-center gap-3 text-left" onClick={() => setDetail(m)}>
                        <Avatar name={m.displayName} photo={m.photoURL || login?.photoURL} size={48} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-semibold">{m.displayName}{m.uid === myId && ' (you)'}</span>
                          <span className="flex flex-wrap gap-1">
                            {(m.role === 'admin' || login?.role === 'admin') && <Badge tone="violet"><Shield className="size-3" /> Admin</Badge>}
                            {ageGroupOf(m) !== 'adult' ? <Badge tone="amber">{ageGroupOf(m) === 'infant' && <Baby className="size-3" />}{ageLabel(m)}</Badge> : <Badge>Adult</Badge>}
                            {login ? <Badge tone="sky"><LogIn className="size-3" /> Signs in</Badge> : <Badge>No login</Badge>}
                          </span>
                        </span>
                      </button>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {m.phone && <a href={telHref(m.phone)} className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-2.5 py-1.5 text-sm font-semibold text-emerald-800"><Phone className="size-4" /> Call</a>}
                        {admin && (
                          <>
                            <Button size="sm" variant="ghost" icon={<Pencil className="size-4" />} onClick={() => setEditing(m)}>Edit</Button>
                            {m.hasLogin !== false && !isOwner && m.uid !== me?.uid && (
                              <Button size="sm" variant="ghost" icon={m.role === 'admin' ? <ShieldOff className="size-4" /> : <Shield className="size-4" />}
                                onClick={async () => (await confirm({ title: m.role === 'admin' ? 'Remove admin rights?' : 'Make admin?', message: `${m.displayName} will ${m.role === 'admin' ? 'become a regular member' : 'get full admin access to the trip'}.` })) && act(() => setMemberRole(m, m.role === 'admin' ? 'member' : 'admin'), 'Role updated')}>
                                {m.role === 'admin' ? 'Remove admin' : 'Make admin'}
                              </Button>
                            )}
                            {m.hasLogin !== false && !isOwner && m.uid !== me?.uid && (
                              <Button size="sm" variant="ghost" className="text-red-700" icon={<UserX className="size-4" />}
                                onClick={async () => (await confirm({ title: 'Disable access?', message: `${m.displayName} will immediately lose access to all trip data and files.`, danger: true, confirmLabel: 'Disable' })) && act(() => decideMember(me!.uid, m, 'disabled'), 'Access disabled')}>
                                Disable
                              </Button>
                            )}
                            {m.hasLogin === false && (
                              <Button size="sm" variant="ghost" className="text-red-700" aria-label="Remove traveller" icon={<Trash2 className="size-4" />}
                                onClick={async () => {
                                  if (s.used) return toast.error(`${m.displayName} is part of recorded expenses. Edit those expenses first.`);
                                  if (await confirm({ title: 'Remove traveller?', message: `${m.displayName} will be removed from the trip.`, danger: true, confirmLabel: 'Remove' })) act(() => removeMember(m), 'Traveller removed');
                                }} />
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

      {admin && accounts.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-2 text-lg font-semibold">Sign-in accounts</h2>
          <Card>
            <ul className="divide-y divide-slate-100">
              {accounts.map((a) => {
                const person = a.personId ? members.find((m) => m.uid === a.personId) : undefined;
                return (
                  <li key={a.uid} className="flex flex-wrap items-center gap-3 px-4 py-3">
                    <Avatar name={a.displayName} photo={a.photoURL} size={36} />
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium">{a.displayName} <span className="text-sm text-slate-500">{a.email}</span></span>
                      {person && <span className="text-sm text-slate-600">Signs in as <b>{person.displayName}</b></span>}
                    </span>
                    <Badge tone={statusTone[a.status]}>{a.status}</Badge>
                    {a.status !== 'approved' && a.status !== 'pending' && (
                      <Button size="sm" variant="ghost" icon={<UserCheck className="size-4" />} onClick={() => act(() => decideMember(me!.uid, a, 'approved', person ?? null), 'Access restored')}>Approve</Button>
                    )}
                    {a.status === 'approved' && trip?.ownerUid !== a.uid && a.uid !== me?.uid && (
                      <Button size="sm" variant="ghost" className="text-red-700" icon={<UserX className="size-4" />}
                        onClick={async () => (await confirm({ title: 'Disable access?', message: `${a.displayName} will lose access. ${person ? `${person.displayName} stays on the trip.` : ''}`, danger: true, confirmLabel: 'Disable' })) && act(() => decideMember(me!.uid, a, 'disabled'), 'Access disabled')}>
                        Disable
                      </Button>
                    )}
                    {a.status !== 'approved' && trip?.ownerUid !== a.uid && (
                      <Button size="sm" variant="ghost" className="text-red-700" aria-label="Remove account" icon={<Trash2 className="size-4" />}
                        onClick={async () => (await confirm({ title: 'Remove account record?', message: `${a.displayName}'s sign-in record will be deleted.`, danger: true, confirmLabel: 'Remove' })) && act(() => removeMember(a), 'Account removed')} />
                    )}
                  </li>
                );
              })}
            </ul>
          </Card>
        </section>
      )}

      {editing && <PersonForm person={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      {detail && (() => {
        const s = stats(detail.uid);
        const login = loginFor(detail);
        return (
          <Modal open onClose={() => setDetail(null)} title={detail.displayName}>
            <div className="space-y-3">
              <div className="flex items-center gap-3"><Avatar name={detail.displayName} photo={detail.photoURL || login?.photoURL} size={56} /><div><p className="font-semibold">{detail.displayName}</p><p className="text-sm text-slate-500">{[detail.relationship, ageLabel(detail)].filter(Boolean).join(' · ')}</p></div></div>
              {(detail.email || login?.email) && <p className="flex items-center gap-2"><Mail className="size-4 text-slate-400" /> {detail.email || login?.email}</p>}
              {detail.phone && <p className="flex items-center gap-2"><Phone className="size-4 text-slate-400" /> <a className="font-semibold text-brand-700" href={telHref(detail.phone)}>{detail.phone}</a></p>}
              {detail.emergencyContact && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-900">🚑 Emergency contact: {detail.emergencyContact}</p>}
              <dl className="grid grid-cols-2 gap-2 rounded-xl bg-slate-50 p-3 text-sm">
                <div><dt className="text-slate-500">Share</dt><dd className="font-semibold">{weightOf(detail)}% of a head</dd></div>
                <div><dt className="text-slate-500">Sign-in</dt><dd className="font-semibold">{login ? login.email || 'Yes' : 'No login'}</dd></div>
                <div><dt className="text-slate-500">Paid</dt><dd className="font-semibold">{formatINR(s.paid)}</dd></div>
                <div><dt className="text-slate-500">Expense share</dt><dd className="font-semibold">{formatINR(s.share)}</dd></div>
                <div><dt className="text-slate-500">Tickets</dt><dd className="font-semibold">{s.tickets.length ? s.tickets.map((t) => t.title).join(', ') : '—'}</dd></div>
                <div><dt className="text-slate-500">Room</dt><dd className="font-semibold">{s.room?.name ?? '—'}</dd></div>
              </dl>
            </div>
          </Modal>
        );
      })()}
    </div>
  );
}

/** Add or edit a traveller. Admins can set age group / share; members edit only their own basic details. */
export function PersonForm({ person, onClose }: { person: Member | null; onClose: () => void }) {
  const me = useSession((s) => s.member);
  const admin = useIsAdmin();
  const [v, setV] = useState({
    displayName: person?.displayName ?? '',
    email: person?.hasLogin === false ? person.email : '',
    phone: person?.phone ?? '',
    emergencyContact: person?.emergencyContact ?? '',
    relationship: person?.relationship ?? '',
    ageGroup: (person ? ageGroupOf(person) : 'adult') as AgeGroup,
    shareWeight: String(person ? weightOf(person) : 100),
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canSetAge = admin;
  const offline = !person || person.hasLogin === false;

  const setAge = (g: AgeGroup) => setV({ ...v, ageGroup: g, shareWeight: String(DEFAULT_WEIGHT[g]) });

  const save = async () => {
    if (!v.displayName.trim()) return setError('Name is required.');
    if (v.phone && !isPhone(v.phone)) return setError('Invalid mobile number.');
    if (v.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email.trim())) return setError('Invalid email address.');
    const w = Number(v.shareWeight);
    if (v.ageGroup === 'child' && (!Number.isInteger(w) || w < 0 || w > 100)) return setError('Child share must be 0–100%.');
    setBusy(true);
    try {
      const input = { ...v, shareWeight: v.ageGroup === 'adult' ? 100 : w, email: offline ? v.email : undefined };
      if (person) await updateMemberProfile(person, canSetAge ? input : { ...input, ageGroup: undefined }, me?.uid !== person.uid);
      else await addPerson(input);
      toast.success(person ? 'Details saved' : `${v.displayName} added`);
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={person ? `Edit ${person.displayName}` : 'Add traveller'} footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={busy} onClick={save}>{person ? 'Save' : 'Add'}</Button></>}>
      <div className="space-y-4">
        <TextField label="Full name" required maxLength={100} value={v.displayName} onChange={(e) => setV({ ...v, displayName: e.target.value })} />
        {canSetAge && (
          <div className="grid grid-cols-2 gap-3">
            <SelectField label="Age group" value={v.ageGroup} onChange={(e) => setAge(e.target.value as AgeGroup)}>
              <option value="adult">Adult (full share)</option>
              <option value="child">Child (% share)</option>
              <option value="infant">Infant (not counted)</option>
            </SelectField>
            {v.ageGroup === 'child' ? (
              <TextField label="Child share %" type="number" min={0} max={100} value={v.shareWeight} onChange={(e) => setV({ ...v, shareWeight: e.target.value })} hint="e.g. 50 = half of an adult" />
            ) : (
              <TextField label="Share" value={v.ageGroup === 'infant' ? '0% (free)' : '100%'} disabled />
            )}
          </div>
        )}
        {offline && admin && <TextField label="Email (optional)" type="email" maxLength={200} value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} hint="Not needed. Only used to recognise them if they sign in later." />}
        <TextField label="Mobile number" inputMode="tel" maxLength={30} value={v.phone} onChange={(e) => setV({ ...v, phone: e.target.value })} />
        <TextField label="Family / group" maxLength={100} value={v.relationship} onChange={(e) => setV({ ...v, relationship: e.target.value })} placeholder="Kumar family" />
        <TextField label="Emergency contact" maxLength={200} value={v.emergencyContact} onChange={(e) => setV({ ...v, emergencyContact: e.target.value })} placeholder="Name – phone" />
        <FormError message={error} />
      </div>
    </Modal>
  );
}

/** Kept for Profile page compatibility. */
export const EditMember = ({ member, onClose }: { member: Member; onClose: () => void }) => <PersonForm person={member} onClose={onClose} />;
