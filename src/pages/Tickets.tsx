import { personIdOf } from '../domain/people';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Lock, LockOpen, Pencil, Plus, Search, Ticket as TicketIcon, Trash2, Train, HardDrive } from 'lucide-react';
import { useTickets } from '../hooks/data';
import { useApprovedMembers, useIsAdmin, useSession } from '../store/session';
import { PageHeader } from '../components/ui/PageHeader';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Badge, EmptyState, ErrorState, Notice, Spinner } from '../components/ui/Feedback';
import { Modal } from '../components/ui/Modal';
import { FormError, SelectField, TextArea, TextField } from '../components/ui/Field';
import { MemberChips, MemberPicker } from '../components/MemberPicker';
import { FileActions, FileInput } from '../components/Files';
import { confirm } from '../components/ui/Confirm';
import { toast } from '../components/ui/Toast';
import { useForm } from '../hooks/useForm';
import { canEditTicket } from '../domain/permissions';
import { createTicket, deleteTicket, setTicketLock, updateTicket, type TicketInput } from '../services/tickets';
import { uploadFile, filesConfigured } from '../lib/files';
import { listOffline, openBlob, removeOffline, saveOffline, getOffline } from '../lib/offlineFiles';
import { formatDate, formatDateTime, formatTime } from '../lib/format';
import { errorMessage } from '../lib/retry';
import { isClockTime, isISODate } from '../domain/validation';
import { useOnline } from '../hooks/useOnline';
import type { Ticket } from '../domain/types';

type Filter = 'all' | 'mine' | 'uploaded';

export default function Tickets() {
  const { data, loading, error } = useTickets();
  const me = useSession((s) => s.member);
  const trip = useSession((s) => s.trip);
  const members = useSession((s) => s.members);
  const admin = useIsAdmin();
  const online = useOnline();
  const [params, setParams] = useSearchParams();
  const [filter, setFilter] = useState<Filter>('all');
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<Ticket | 'new' | null>(null);
  const [offlineIds, setOfflineIds] = useState<Set<string>>(new Set());
  const [savingId, setSavingId] = useState<string | null>(null);
  const highlight = params.get('open');

  useEffect(() => {
    listOffline().then((l) => setOfflineIds(new Set(l.map((x) => x.id)))).catch(() => undefined);
  }, []);
  useEffect(() => {
    if (highlight && data.length) document.getElementById(`ticket-${highlight}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [highlight, data.length]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return data.filter((t) => {
      if (filter === 'mine' && !(me && t.passengerUids.includes(personIdOf(me)))) return false;
      if (filter === 'uploaded' && t.uploadedBy !== me?.uid) return false;
      if (!needle) return true;
      const passengerText = [...t.passengerNames, ...t.passengerUids.map((u) => members.find((m) => m.uid === u)?.displayName ?? '')].join(' ');
      return `${t.title} ${t.pnr} ${t.trainName} ${t.trainNumber} ${t.boardingStation} ${t.destinationStation} ${passengerText}`.toLowerCase().includes(needle);
    });
  }, [data, filter, q, me, members]);

  const remove = async (t: Ticket) => {
    if (!(await confirm({ title: 'Delete ticket?', message: `“${t.title}” (PNR ${t.pnr || '—'}) and its document will be permanently deleted for everyone.`, danger: true, confirmLabel: 'Delete' }))) return;
    try {
      await deleteTicket(t);
      await removeOffline(t.id).catch(() => undefined);
      toast.success('Ticket deleted');
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const toggleLock = async (t: Ticket) => {
    try {
      await setTicketLock(t, !t.locked);
      toast.success(t.locked ? 'Ticket unlocked' : 'Ticket locked – only admins can change it now');
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const saveOfflineCopy = async (t: Ticket) => {
    setSavingId(t.id);
    try {
      await saveOffline(t.id, t.filePath, t.fileName);
      setOfflineIds((s) => new Set(s).add(t.id));
      toast.success('Saved on this device for offline use');
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSavingId(null);
    }
  };
  const removeOfflineCopy = async (t: Ticket) => {
    await removeOffline(t.id);
    setOfflineIds((s) => {
      const n = new Set(s);
      n.delete(t.id);
      return n;
    });
    toast.info('Offline copy removed');
  };
  const openOffline = async (t: Ticket) => {
    const f = await getOffline(t.id);
    if (f) openBlob(f);
  };

  return (
    <div>
      <PageHeader
        title={admin ? 'Ticket Management' : 'Train Tickets'}
        subtitle="All tickets for the trip. Everyone can view and download; upload tickets for anyone."
        syncKey="tickets"
        actions={<Button icon={<Plus className="size-5" />} onClick={() => setEditing('new')} disabled={!online || !filesConfigured}>Upload ticket</Button>}
      />
      {!filesConfigured && <div className="mb-4"><Notice tone="warn">File storage is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.</Notice></div>}
      {trip?.ticketsLocked && !admin && <div className="mb-4"><Notice tone="info"><Lock className="mr-1 inline size-4" /> The admin has locked tickets. You can still view, download and upload, but not edit or delete.</Notice></div>}

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex rounded-xl bg-slate-100 p-1" role="tablist">
          {([['all', 'All tickets'], ['mine', 'My tickets'], ['uploaded', 'Uploaded by me']] as const).map(([k, label]) => (
            <button key={k} role="tab" aria-selected={filter === k} onClick={() => setFilter(k)} className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold sm:flex-none ${filter === k ? 'bg-white text-brand-800 shadow-sm' : 'text-slate-600'}`}>
              {label}
            </button>
          ))}
        </div>
        <label className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-slate-400" />
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search PNR, train, passenger…" className="w-full rounded-xl border border-slate-300 bg-white py-2.5 pl-10 pr-3" aria-label="Search tickets" />
        </label>
      </div>

      {loading ? (
        <Spinner />
      ) : error ? (
        <ErrorState message={error} />
      ) : shown.length === 0 ? (
        <EmptyState icon={<TicketIcon className="size-7" />} title={data.length ? 'No matching tickets' : 'No tickets uploaded yet'} message={data.length ? 'Try a different filter or search.' : 'Upload the first train ticket (PDF or photo) for the group.'} action={!data.length && <Button onClick={() => setEditing('new')} icon={<Plus className="size-5" />}>Upload ticket</Button>} />
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {shown.map((t) => {
            const editable = canEditTicket(me, t) && (admin || !trip?.ticketsLocked);
            const savedOffline = offlineIds.has(t.id);
            return (
              <Card as="li" key={t.id} className={`overflow-hidden ${highlight === t.id ? 'ring-2 ring-brand-500' : ''}`}>
                <div id={`ticket-${t.id}`} className="flex items-start justify-between gap-3 bg-brand-50 px-4 py-3">
                  <div className="min-w-0">
                    <h3 className="font-semibold text-slate-900">{t.title}</h3>
                    <p className="flex items-center gap-1.5 text-slate-700"><Train className="size-4" /> {t.trainName} {t.trainNumber && <span className="text-slate-500">#{t.trainNumber}</span>}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    {t.pnr && <span className="rounded-lg bg-white px-2 py-1 font-mono text-sm font-bold tracking-wider text-brand-800">PNR {t.pnr}</span>}
                    {t.locked && <Badge tone="amber"><Lock className="size-3" /> Locked</Badge>}
                    {savedOffline && <Badge tone="green"><HardDrive className="size-3" /> Offline</Badge>}
                  </div>
                </div>
                <div className="space-y-3 px-4 py-3">
                  <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-center">
                    <div>
                      <p className="text-lg font-bold">{t.boardingStation || '—'}</p>
                      <p className="text-sm text-slate-600">{formatTime(t.departureTime)}</p>
                    </div>
                    <span className="text-slate-400">→</span>
                    <div>
                      <p className="text-lg font-bold">{t.destinationStation || '—'}</p>
                      <p className="text-sm text-slate-600">{formatTime(t.arrivalTime)}</p>
                    </div>
                  </div>
                  <dl className="grid grid-cols-3 gap-2 rounded-xl bg-slate-50 p-3 text-sm">
                    <div><dt className="text-slate-500">Date</dt><dd className="font-semibold">{formatDate(t.journeyDate) || '—'}</dd></div>
                    <div><dt className="text-slate-500">Coach / Seat</dt><dd className="font-semibold">{[t.coach, t.seats].filter(Boolean).join(' · ') || '—'}</dd></div>
                    <div><dt className="text-slate-500">Class</dt><dd className="font-semibold">{t.travelClass || '—'}</dd></div>
                  </dl>
                  <div>
                    <p className="mb-1 text-sm font-medium text-slate-600">Passengers ({t.passengerUids.length + t.passengerNames.length})</p>
                    <MemberChips uids={t.passengerUids} members={members} />
                    {t.passengerNames.length > 0 && <p className="mt-1 text-sm text-slate-700">Also: {t.passengerNames.join(', ')}</p>}
                  </div>
                  {t.notes && <p className="text-sm text-slate-600">📝 {t.notes}</p>}
                  <p className="text-xs text-slate-500">Uploaded by {t.uploadedByName} · {formatDateTime(t.createdAt) || 'syncing…'}</p>
                  <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
                    {online ? (
                      <FileActions path={t.filePath} fileName={t.fileName} compact offline={{ saved: savedOffline, busy: savingId === t.id, onSave: () => saveOfflineCopy(t), onRemove: () => removeOfflineCopy(t) }} />
                    ) : savedOffline ? (
                      <Button size="sm" variant="secondary" onClick={() => openOffline(t)}>Open offline copy</Button>
                    ) : (
                      <span className="text-sm text-slate-500">Connect to the internet to open this ticket.</span>
                    )}
                    <span className="flex-1" />
                    {editable && (
                      <>
                        <Button size="sm" variant="ghost" icon={<Pencil className="size-4" />} onClick={() => setEditing(t)} disabled={!online}>Edit</Button>
                        <Button size="sm" variant="ghost" className="text-red-700" icon={<Trash2 className="size-4" />} onClick={() => remove(t)} disabled={!online}>Delete</Button>
                      </>
                    )}
                    {admin && (
                      <Button size="sm" variant="ghost" icon={t.locked ? <LockOpen className="size-4" /> : <Lock className="size-4" />} onClick={() => toggleLock(t)}>
                        {t.locked ? 'Unlock' : 'Lock'}
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </ul>
      )}
      {editing && (
        <TicketForm
          ticket={editing === 'new' ? null : editing}
          onClose={() => {
            setEditing(null);
            if (highlight) setParams({});
          }}
        />
      )}
    </div>
  );
}

const CLASSES = ['', 'SL', '3A', '3E', '2A', '1A', 'CC', 'EC', '2S', 'FC', 'Other'];

function TicketForm({ ticket, onClose }: { ticket: Ticket | null; onClose: () => void }) {
  const me = useSession((s) => s.member)!;
  const members = useApprovedMembers();
  const f = useForm({
    title: ticket?.title ?? '',
    pnr: ticket?.pnr ?? '',
    trainName: ticket?.trainName ?? '',
    trainNumber: ticket?.trainNumber ?? '',
    journeyDate: ticket?.journeyDate ?? '',
    boardingStation: ticket?.boardingStation ?? '',
    destinationStation: ticket?.destinationStation ?? '',
    departureTime: ticket?.departureTime ?? '',
    arrivalTime: ticket?.arrivalTime ?? '',
    coach: ticket?.coach ?? '',
    seats: ticket?.seats ?? '',
    travelClass: ticket?.travelClass ?? '',
    notes: ticket?.notes ?? '',
    extraNames: ticket?.passengerNames.join(', ') ?? '',
  });
  const [passengers, setPassengers] = useState<string[]>(ticket?.passengerUids ?? []);
  const [file, setFile] = useState<File | null>(null);
  const [stage, setStage] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const v = f.values;
    const errs: typeof f.errors = {};
    if (!v.title.trim()) errs.title = 'Give the ticket a title, e.g. “Chennai → Coimbatore”.';
    if (v.pnr && !/^\d{10}$/.test(v.pnr.trim())) errs.pnr = 'PNR should be 10 digits.';
    if (v.journeyDate && !isISODate(v.journeyDate)) errs.journeyDate = 'Invalid date.';
    if (v.departureTime && !isClockTime(v.departureTime)) errs.departureTime = 'Invalid time.';
    if (v.arrivalTime && !isClockTime(v.arrivalTime)) errs.arrivalTime = 'Invalid time.';
    if (v.trainNumber && !/^[0-9A-Za-z]{1,10}$/.test(v.trainNumber.trim())) errs.trainNumber = 'Up to 10 letters/digits.';
    const extraNames = v.extraNames.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 50);
    if (passengers.length + extraNames.length === 0) errs._form = 'Select at least one passenger (or type passenger names).';
    if (!ticket && !file) errs._form = 'Please attach the ticket PDF or photo.';
    f.setErrors(errs);
    if (Object.values(errs).some(Boolean)) return;

    const input: TicketInput = {
      title: v.title.trim(),
      pnr: v.pnr.trim(),
      trainName: v.trainName.trim(),
      trainNumber: v.trainNumber.trim(),
      journeyDate: v.journeyDate,
      boardingStation: v.boardingStation.trim().toUpperCase(),
      destinationStation: v.destinationStation.trim().toUpperCase(),
      departureTime: v.departureTime,
      arrivalTime: v.arrivalTime,
      passengerNames: extraNames,
      passengerUids: passengers,
      coach: v.coach.trim().toUpperCase(),
      seats: v.seats.trim(),
      travelClass: v.travelClass,
      notes: v.notes.trim(),
    };
    try {
      const uploaded = file ? await uploadFile('ticket', file, setStage) : null;
      setStage('Saving…');
      if (ticket) await updateTicket(ticket, input, uploaded);
      else await createTicket(input, uploaded!, { uid: me.uid, name: me.displayName });
      toast.success(ticket ? 'Ticket updated' : 'Ticket uploaded and shared with the group');
      onClose();
    } catch (err) {
      f.setErrors({ _form: errorMessage(err) });
    } finally {
      setStage(null);
    }
  };

  return (
    <Modal open onClose={onClose} title={ticket ? 'Edit ticket' : 'Upload ticket'} wide
      footer={<><Button variant="secondary" onClick={onClose} disabled={!!stage}>Cancel</Button><Button type="submit" form="ticket-form" loading={!!stage}>{stage ?? (ticket ? 'Save changes' : 'Upload & share')}</Button></>}>
      <form id="ticket-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <FileInput kind="ticket" file={file} onChange={setFile} label="Ticket document" required={!ticket} existingName={ticket?.fileName} />
        </div>
        <TextField className="sm:col-span-2" label="Ticket title" required maxLength={150} {...f.bind('title')} placeholder="Chennai → Coimbatore (Family 1)" />
        <TextField label="PNR number" inputMode="numeric" maxLength={10} {...f.bind('pnr')} />
        <TextField label="Journey date" type="date" {...f.bind('journeyDate')} />
        <TextField label="Train name" maxLength={100} {...f.bind('trainName')} placeholder="Cheran Express" />
        <TextField label="Train number" maxLength={10} {...f.bind('trainNumber')} placeholder="12673" />
        <TextField label="Boarding station" maxLength={100} {...f.bind('boardingStation')} placeholder="MAS" />
        <TextField label="Destination station" maxLength={100} {...f.bind('destinationStation')} placeholder="CBE" />
        <TextField label="Departure time" type="time" {...f.bind('departureTime')} />
        <TextField label="Arrival time" type="time" {...f.bind('arrivalTime')} />
        <TextField label="Coach" maxLength={20} {...f.bind('coach')} placeholder="S4" />
        <TextField label="Seat / berth" maxLength={200} {...f.bind('seats')} placeholder="21 LB, 22 MB, 23 UB" />
        <SelectField label="Class" {...f.bind('travelClass')}>
          {CLASSES.map((c) => <option key={c} value={c}>{c || 'Select class'}</option>)}
        </SelectField>
        <div className="sm:col-span-2">
          <MemberPicker label="Passengers (trip members)" members={members} selected={passengers} onChange={setPassengers} />
        </div>
        <TextField className="sm:col-span-2" label="Other passenger names (comma separated)" {...f.bind('extraNames')} hint="For passengers without an account, e.g. children or elders." />
        <TextArea className="sm:col-span-2" label="Notes" maxLength={1000} {...f.bind('notes')} />
        <div className="sm:col-span-2"><FormError message={f.errors._form} /></div>
      </form>
    </Modal>
  );
}
