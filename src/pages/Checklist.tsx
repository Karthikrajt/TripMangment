/**
 * Travel-day checklist + "Who's on board?" roll call.
 * - Checklist: shared items; each person / family / the group ticks their own.
 * - Roll call: a quick head count. Everyone taps "I'm here" on their phone, or
 *   the person counting taps names. Missing people are listed first.
 */
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Check, ClipboardCheck, ListChecks, Lock, Plus, RotateCcw, Trash2, UserCheck, Users } from 'lucide-react';
import { useChecklist, useRollCalls, useTickets, useTransport } from '../hooks/data';
import { useIsAdmin, useSession } from '../store/session';
import { familyOf, peopleOf, personIdOf } from '../domain/people';
import { PageHeader } from '../components/ui/PageHeader';
import { Button } from '../components/ui/Button';
import { Card, CardBody, CardHeader } from '../components/ui/Card';
import { Badge, EmptyState, Spinner } from '../components/ui/Feedback';
import { Modal } from '../components/ui/Modal';
import { FormError, SelectField, TextField } from '../components/ui/Field';
import { Avatar } from '../components/ui/Avatar';
import { confirm } from '../components/ui/Confirm';
import { toast } from '../components/ui/Toast';
import { ShareWhatsApp } from '../components/ShareWhatsApp';
import { addChecklistItem, closeRollCall, DEFAULT_CHECKLIST, deleteChecklistItem, deleteRollCall, familyKey, GROUP_KEY, markPresent, setTick, startRollCall } from '../services/checklist';
import { formatDate, formatDateTime, formatTime, todayIST } from '../lib/format';
import { errorMessage } from '../lib/retry';
import type { ChecklistItem, ChecklistScope, Member, RollCall } from '../domain/types';

const SCOPE_LABEL: Record<ChecklistScope, string> = { person: 'Each person', family: 'Each family', group: 'Whole group' };

export default function Checklist() {
  const [params] = useSearchParams();
  const rolls = useRollCalls();
  const items = useChecklist();
  if (rolls.loading || items.loading) return <Spinner />;
  return (
    <div className="space-y-6">
      <PageHeader title="Checklist & roll call" subtitle="Tick what’s done, and check everyone is on board." syncKey="checklist" />
      <RollCalls rolls={rolls.data} focus={params.get('roll')} />
      <ChecklistCard items={items.data} />
    </div>
  );
}

// ---------------------------------------------------------------- roll call

function RollCalls({ rolls, focus }: { rolls: RollCall[]; focus: string | null }) {
  const [starting, setStarting] = useState(false);
  const [showOld, setShowOld] = useState(false);
  const open = rolls.filter((r) => r.open);
  const closed = rolls.filter((r) => !r.open);
  return (
    <Card>
      <CardHeader
        icon={<UserCheck className="size-5" />}
        title="Who’s on board?"
        subtitle="Start a head count before a train, bus or after a stop."
        action={<Button size="sm" icon={<Plus className="size-4" />} onClick={() => setStarting(true)}>Start</Button>}
      />
      <CardBody className="space-y-4">
        {open.length === 0 && <p className="text-slate-500">No roll call running.</p>}
        {open.map((r) => <RollCallView key={r.id} roll={r} highlight={r.id === focus} />)}
        {closed.length > 0 && (
          <div>
            <button type="button" className="text-sm font-semibold text-brand-700" onClick={() => setShowOld((v) => !v)}>
              {showOld ? 'Hide' : 'Show'} earlier roll calls ({closed.length})
            </button>
            {showOld && <div className="mt-3 space-y-3">{closed.slice(0, 10).map((r) => <RollCallView key={r.id} roll={r} highlight={r.id === focus} />)}</div>}
          </div>
        )}
      </CardBody>
      {starting && <StartRollCall onClose={() => setStarting(false)} />}
    </Card>
  );
}

function RollCallView({ roll, highlight }: { roll: RollCall; highlight: boolean }) {
  const members = useSession((s) => s.members);
  const me = useSession((s) => s.member)!;
  const admin = useIsAdmin();
  const myId = personIdOf(me);
  const people = useMemo(() => {
    const all = peopleOf(members);
    const list = roll.personIds.length ? roll.personIds.map((id) => all.find((p) => p.uid === id)).filter((p): p is Member => !!p) : all;
    return [...list].sort((a, b) => familyOf(a).localeCompare(familyOf(b)) || a.displayName.localeCompare(b.displayName));
  }, [members, roll.personIds]);
  const here = people.filter((p) => roll.present[p.uid]);
  const missing = people.filter((p) => !roll.present[p.uid]);
  const iAmExpected = people.some((p) => p.uid === myId);
  const iAmHere = Boolean(roll.present[myId]);
  const manage = admin || roll.createdBy === me.uid;
  const pct = people.length ? Math.round((here.length / people.length) * 100) : 0;

  const toggle = async (p: Member) => {
    try {
      await markPresent(roll, p.uid, !roll.present[p.uid]);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };
  const close = async () => {
    try {
      await closeRollCall(roll, !roll.open);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };
  const remove = async () => {
    if (!(await confirm({ title: 'Delete roll call?', message: roll.title, danger: true, confirmLabel: 'Delete' }))) return;
    try {
      await deleteRollCall(roll);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };
  const missingText = () => `*${roll.title}* – ${here.length} of ${people.length} here.\nStill missing: ${missing.map((p) => p.displayName).join(', ') || 'nobody 🎉'}`;

  return (
    <div className={`rounded-2xl border p-4 ${highlight ? 'border-brand-500 ring-2 ring-brand-200' : 'border-slate-200'} ${roll.open ? '' : 'bg-slate-50'}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-lg font-bold">{roll.title}</p>
          <p className="text-sm text-slate-500">By {roll.createdByName} · {formatDateTime(roll.createdAt)}{!roll.open && ' · closed'}</p>
        </div>
        <span className={`rounded-xl px-3 py-1 text-xl font-extrabold tabular-nums ${missing.length ? 'bg-amber-100 text-amber-900' : 'bg-emerald-100 text-emerald-800'}`} aria-label={`${here.length} of ${people.length} here`}>
          {here.length}/{people.length}
        </span>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100" aria-hidden>
        <div className={`h-full ${missing.length ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${pct}%` }} />
      </div>

      {roll.open && iAmExpected && (
        <Button size="lg" variant={iAmHere ? 'secondary' : 'success'} className="mt-4 w-full" icon={<Check className="size-6" />} onClick={() => toggle(people.find((p) => p.uid === myId)!)}>
          {iAmHere ? 'You’re marked here (tap to undo)' : 'I’m here'}
        </Button>
      )}

      {missing.length > 0 && (
        <div className="mt-4">
          <p className="mb-2 text-sm font-semibold text-amber-800">Missing ({missing.length}){roll.open && ' – tap a name when you see them'}</p>
          <div className="flex flex-wrap gap-2">
            {missing.map((p) => (
              <button key={p.uid} type="button" disabled={!roll.open} onClick={() => toggle(p)} className="flex items-center gap-2 rounded-full border border-amber-300 bg-amber-50 py-1 pl-1 pr-3 text-sm font-semibold text-amber-900 disabled:opacity-70">
                <Avatar name={p.displayName} photo={p.photoURL} size={26} /> {p.displayName}
              </button>
            ))}
          </div>
        </div>
      )}
      {here.length > 0 && (
        <div className="mt-4">
          <p className="mb-2 text-sm font-semibold text-emerald-800">Here ({here.length})</p>
          <div className="flex flex-wrap gap-2">
            {here.map((p) => (
              <button key={p.uid} type="button" disabled={!roll.open} onClick={() => toggle(p)} className="flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 py-1 pl-1 pr-3 text-sm font-semibold text-emerald-900 disabled:opacity-70" aria-label={`${p.displayName} is here${roll.open ? ', tap to undo' : ''}`}>
                <Avatar name={p.displayName} photo={p.photoURL} size={26} /> {p.displayName} <Check className="size-4" />
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-3">
        <ShareWhatsApp size="sm" label="Share missing list" text={missingText} />
        {manage && (
          <>
            <Button size="sm" variant="secondary" icon={roll.open ? <Lock className="size-4" /> : <RotateCcw className="size-4" />} onClick={close}>{roll.open ? 'Close' : 'Reopen'}</Button>
            <Button size="sm" variant="ghost" className="text-red-700" icon={<Trash2 className="size-4" />} onClick={remove}>Delete</Button>
          </>
        )}
      </div>
    </div>
  );
}

function StartRollCall({ onClose }: { onClose: () => void }) {
  const me = useSession((s) => s.member)!;
  const members = useSession((s) => s.members);
  const tickets = useTickets();
  const transport = useTransport();
  const [, setParams] = useSearchParams();
  const people = useMemo(() => peopleOf(members), [members]);
  const families = useMemo(() => [...new Set(people.map(familyOf).filter(Boolean))].sort(), [people]);
  const today = todayIST();
  const upcomingTickets = tickets.data.filter((t) => t.journeyDate >= today).slice(0, 8);
  const upcomingVehicles = transport.data.filter((v) => !v.pickupDate || v.pickupDate >= today).slice(0, 8);
  const [who, setWho] = useState('all');
  const [title, setTitle] = useState(`Head count – ${formatDate(today)}`);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pick = (value: string) => {
    setWho(value);
    const [kind, id] = value.split(':');
    const t = kind === 't' ? tickets.data.find((x) => x.id === id) : undefined;
    const v = kind === 'v' ? transport.data.find((x) => x.id === id) : undefined;
    if (t) setTitle(`Boarding ${t.trainName || t.title} – ${formatDate(t.journeyDate)}`);
    else if (v) setTitle(`${v.vehicleType} pickup – ${formatTime(v.pickupTime) || formatDate(v.pickupDate)}`);
    else if (kind === 'f') setTitle(`${id} – head count`);
    else setTitle(`Head count – ${formatDate(today)}`);
  };
  const idsFor = (value: string): string[] => {
    const [kind, id] = value.split(':');
    if (kind === 't') return tickets.data.find((x) => x.id === id)?.passengerUids ?? [];
    if (kind === 'v') return transport.data.find((x) => x.id === id)?.memberUids ?? [];
    if (kind === 'f') return people.filter((p) => familyOf(p) === id).map((p) => p.uid);
    return [];
  };
  const start = async () => {
    if (!title.trim()) return setError('Give it a name.');
    const ids = idsFor(who);
    if (who !== 'all' && ids.length === 0) return setError('Nobody is assigned there yet. Pick “Everyone”.');
    setBusy(true);
    try {
      const id = await startRollCall(title, ids, me);
      setParams({ roll: id });
      toast.success('Roll call started – everyone has been notified');
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={onClose} title="Start a roll call" footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={busy} icon={<UserCheck className="size-5" />} onClick={start}>Start</Button></>}>
      <div className="space-y-4">
        <SelectField label="Who should be here?" value={who} onChange={(e) => pick(e.target.value)}>
          <option value="all">Everyone on the trip ({people.length})</option>
          {upcomingTickets.length > 0 && (
            <optgroup label="Train passengers">
              {upcomingTickets.map((t) => <option key={t.id} value={`t:${t.id}`}>{t.trainName || t.title} · {formatDate(t.journeyDate)} ({t.passengerUids.length})</option>)}
            </optgroup>
          )}
          {upcomingVehicles.length > 0 && (
            <optgroup label="Vehicle">
              {upcomingVehicles.map((v) => <option key={v.id} value={`v:${v.id}`}>{v.vehicleType} {v.registrationNumber} · {formatTime(v.pickupTime)} ({v.memberUids.length})</option>)}
            </optgroup>
          )}
          {families.length > 0 && (
            <optgroup label="Family">
              {families.map((f) => <option key={f} value={`f:${f}`}>{f}</option>)}
            </optgroup>
          )}
        </SelectField>
        <TextField label="Name" maxLength={150} value={title} onChange={(e) => setTitle(e.target.value)} />
        <p className="text-sm text-slate-500">Everyone gets a notification. They tap “I’m here”, or you tap their names as you count.</p>
        <FormError message={error} />
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------- checklist

function ChecklistCard({ items }: { items: ChecklistItem[] }) {
  const me = useSession((s) => s.member)!;
  const members = useSession((s) => s.members);
  const admin = useIsAdmin();
  const people = useMemo(() => peopleOf(members), [members]);
  const myId = personIdOf(me);
  const myPerson = people.find((p) => p.uid === myId) ?? me;
  const myFamily = familyOf(myPerson);
  const familyPeople = myFamily ? people.filter((p) => familyOf(p) === myFamily) : [myPerson];
  const familyCount = new Set(people.map((p) => familyOf(p) || `solo:${p.uid}`)).size;
  const [title, setTitle] = useState('');
  const [scope, setScope] = useState<ChecklistScope>('person');
  const [adding, setAdding] = useState(false);

  const add = async () => {
    if (!title.trim()) return;
    setAdding(true);
    try {
      const r = await addChecklistItem(title, scope, me);
      setTitle('');
      if (r === 'queued') toast.success('Added – will sync when online');
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setAdding(false);
    }
  };
  const addDefaults = async () => {
    setAdding(true);
    try {
      for (const d of DEFAULT_CHECKLIST) await addChecklistItem(d.title, d.scope, me);
      toast.success('Added suggested items');
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setAdding(false);
    }
  };
  const tick = async (item: ChecklistItem, key: string) => {
    try {
      await setTick(item, key, !item.done[key]);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };
  const remove = async (item: ChecklistItem) => {
    if (!(await confirm({ title: 'Delete item?', message: item.title, danger: true, confirmLabel: 'Delete' }))) return;
    try {
      await deleteChecklistItem(item);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const overall = (item: ChecklistItem): string => {
    const n = Object.values(item.done).filter(Boolean).length;
    if (item.scope === 'person') return `${n} of ${people.length} people`;
    if (item.scope === 'family') return `${n} of ${familyCount} families`;
    return n ? 'Done' : 'Not done';
  };

  return (
    <Card>
      <CardHeader icon={<ListChecks className="size-5" />} title="Travel checklist" subtitle={myFamily ? `Ticks for you and ${myFamily}.` : 'Tick things off as you go.'} />
      <CardBody className="space-y-4">
        {items.length === 0 ? (
          <EmptyState icon={<ClipboardCheck className="size-7" />} title="No checklist yet" message="Add your own items, or start with the usual ones." action={<Button loading={adding} onClick={addDefaults}>Add suggested items</Button>} />
        ) : (
          <ul className="divide-y divide-slate-100">
            {items.map((item) => {
              const canDelete = admin || item.createdBy === me.uid;
              return (
                <li key={item.id} className="py-3">
                  <div className="flex items-start gap-3">
                    {item.scope !== 'person' && (
                      <CheckButton
                        on={Boolean(item.done[item.scope === 'group' ? GROUP_KEY : familyKey(myFamily || myId)])}
                        label={item.title}
                        onClick={() => tick(item, item.scope === 'group' ? GROUP_KEY : familyKey(myFamily || myId))}
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-ink">{item.title}</p>
                      <p className="text-sm text-slate-500">
                        <Badge tone={item.scope === 'person' ? 'brand' : item.scope === 'family' ? 'violet' : 'sky'}>{item.scope === 'person' ? <Users className="mr-1 inline size-3" /> : null}{SCOPE_LABEL[item.scope]}</Badge>
                        <span className="ml-2">{overall(item)}</span>
                      </p>
                    </div>
                    {canDelete && <Button size="sm" variant="ghost" className="text-red-700" aria-label={`Delete ${item.title}`} icon={<Trash2 className="size-4" />} onClick={() => remove(item)} />}
                  </div>
                  {item.scope === 'person' && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {familyPeople.map((p) => {
                        const on = Boolean(item.done[p.uid]);
                        return (
                          <button key={p.uid} type="button" onClick={() => tick(item, p.uid)} aria-pressed={on}
                            className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-semibold ${on ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : 'border-slate-200 bg-white text-slate-700'}`}>
                            {on ? <Check className="size-4" /> : <span className="size-4 rounded-full border-2 border-slate-300" />}
                            {p.uid === myId ? 'Me' : p.displayName.split(' ')[0]}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        <div className="flex flex-col gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:items-end">
          <TextField className="flex-1" label="New item" maxLength={150} value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} placeholder="e.g. Sunscreen" />
          <SelectField label="Who ticks it" value={scope} onChange={(e) => setScope(e.target.value as ChecklistScope)}>
            <option value="person">Each person</option>
            <option value="family">Each family</option>
            <option value="group">Whole group (once)</option>
          </SelectField>
          <Button icon={<Plus className="size-5" />} loading={adding} onClick={add} disabled={!title.trim()}>Add</Button>
        </div>
      </CardBody>
    </Card>
  );
}

function CheckButton({ on, label, onClick }: { on: boolean; label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on} aria-label={`${label}: ${on ? 'done' : 'not done'}`}
      className={`mt-0.5 grid size-8 shrink-0 place-items-center rounded-xl border-2 ${on ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-slate-300 bg-white'}`}>
      {on && <Check className="size-5" />}
    </button>
  );
}
