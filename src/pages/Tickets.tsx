import { ShareWhatsApp } from '../components/ShareWhatsApp';
import { RollCallButton } from '../components/RollCallButton';
import { ticketText } from '../domain/share';
import { personIdOf } from '../domain/people';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ChevronDown, ChevronsUpDown, Copy, Lock, LockOpen, Pencil, Plus, Search, Ticket as TicketIcon, Trash2, Train, HardDrive, X } from 'lucide-react';
import { useTickets } from '../hooks/data';
import { useApprovedMembers, useIsAdmin, useSession } from '../store/session';
import { PageHeader } from '../components/ui/PageHeader';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Badge, EmptyState, ErrorState, Notice, Spinner } from '../components/ui/Feedback';
import { Modal } from '../components/ui/Modal';
import { FormError, SelectField, TextArea, TextField } from '../components/ui/Field';
import { MemberPicker } from '../components/MemberPicker';
import { FileActions, FileInput } from '../components/Files';
import { confirm } from '../components/ui/Confirm';
import { toast } from '../components/ui/Toast';
import { useForm } from '../hooks/useForm';
import { canEditTicket } from '../domain/permissions';
import { createTicket, deleteTicket, setTicketLock, updateTicket, type TicketInput } from '../services/tickets';
import { uploadFile, filesConfigured } from '../lib/files';
import { listOffline, openBlob, removeOffline, saveOffline, getOffline } from '../lib/offlineFiles';
import { formatDateLong, formatDateTime, formatTime, todayIST, formatDate } from '../lib/format';
import {
  applyFilters, dateOptions, EMPTY_FILTERS, hasActiveFilters, isTicketCompleted, matchesTab, pruneSelection, splitByCompletion, trainOptions,
  type FilterContext, type TicketFilterState,
} from '../domain/ticketFilters';
import { errorMessage } from '../lib/retry';
import { isClockTime, isISODate } from '../domain/validation';
import { useOnline } from '../hooks/useOnline';
import { BERTH_TYPES, type BerthType, type Ticket, type TicketPassenger } from '../domain/types';
import { berthLabel, derivedTicketFields, emptyPassenger, passengersOf, statusKind, ticketStatusSummary, validatePassengers } from '../domain/ticketPassengers';


export default function Tickets() {
  const { data, loading, error } = useTickets();
  const me = useSession((s) => s.member);
  const trip = useSession((s) => s.trip);
  const members = useSession((s) => s.members);
  const admin = useIsAdmin();
  const online = useOnline();
  const [params, setParams] = useSearchParams();
  const [filters, setFilters] = useState<TicketFilterState>(EMPTY_FILTERS);
  const setF = (patch: Partial<TicketFilterState>) => setFilters((f) => ({ ...f, ...patch }));
  const clearFilters = () => setFilters(EMPTY_FILTERS);
  const [editing, setEditing] = useState<Ticket | 'new' | null>(null);
  const [offlineIds, setOfflineIds] = useState<Set<string>>(new Set());
  const [savingId, setSavingId] = useState<string | null>(null);
  const [showCompleted, setShowCompleted] = useState(false);
  // Tickets start collapsed (summary only); tap to see passengers and buttons.
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(params.get('open') ? [params.get('open')!] : []));
  const toggle = (id: string) =>
    setExpanded((cur) => {
      const n = new Set(cur);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const highlight = params.get('open');
  const today = todayIST();

  const ctx = useMemo<FilterContext>(() => {
    const names = new Map(members.map((m) => [m.uid, m.displayName]));
    return { myPersonId: personIdOf(me), myUid: me?.uid ?? '', nameOf: (id) => names.get(id) ?? '' };
  }, [members, me]);

  // Options reflect the current tab, so counts match what the user can pick from.
  const inTab = useMemo(() => data.filter((t) => matchesTab(t, filters.tab, ctx)), [data, filters.tab, ctx]);
  const dates = useMemo(() => dateOptions(inTab), [inTab]);
  const trains = useMemo(() => trainOptions(inTab), [inTab]);
  useEffect(() => {
    if (loading) return;
    setFilters((f) => pruneSelection(f, dates, trains));
  }, [dates, trains, loading]);

  const { active, completed } = useMemo(() => splitByCompletion(applyFilters(data, filters, ctx), today), [data, filters, ctx, today]);
  const filtering = hasActiveFilters(filters);

  useEffect(() => {
    const load = () => listOffline().then((l) => setOfflineIds(new Set(l.map((x) => x.id)))).catch(() => undefined);
    load();
    window.addEventListener('tm:offline-files', load);
    return () => window.removeEventListener('tm:offline-files', load);
  }, []);
  // ?open=<id>: expand Completed if needed, then scroll to the ticket.
  useEffect(() => {
    if (!highlight || !data.length) return;
    const t = data.find((x) => x.id === highlight);
    if (!t) return;
    if (isTicketCompleted(t, today)) setShowCompleted(true);
    setExpanded((cur) => new Set(cur).add(t.id));
    const timer = setTimeout(() => document.getElementById(`ticket-${highlight}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
    return () => clearTimeout(timer);
  }, [highlight, data, today]);
  // Make sure the highlighted ticket isn't hidden by a filter.
  useEffect(() => {
    if (highlight) setFilters(EMPTY_FILTERS);
  }, [highlight]);

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

  const copyPnr = async (pnr: string) => {
    try {
      await navigator.clipboard.writeText(pnr);
      toast.success('PNR copied');
    } catch {
      toast.info(`PNR ${pnr}`);
    }
  };

  const renderCard = (t: Ticket, completed: boolean) => {
    const editable = canEditTicket(me, t) && (admin || !trip?.ticketsLocked);
    const savedOffline = offlineIds.has(t.id);
    const pax = passengersOf(t, ctx.nameOf);
    const summary = ticketStatusSummary(pax);
    const myPax = ctx.myPersonId ? pax.find((p) => p.personId === ctx.myPersonId) : undefined;
    const mine = Boolean(myPax);
    const open = expanded.has(t.id);
    return (
      <Card as="li" key={t.id} className={`overflow-hidden ${highlight === t.id ? 'ring-2 ring-brand-500' : mine ? 'ring-2 ring-brand-300' : ''}`}>
        <button
          type="button"
          id={`ticket-${t.id}`}
          onClick={() => toggle(t.id)}
          aria-expanded={open}
          aria-controls={`ticket-body-${t.id}`}
          className="block w-full px-4 pt-4 text-left sm:px-5"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 font-bold text-ink">
                <Train className="size-4 shrink-0 text-brand-700" aria-hidden />
                <span className="truncate">{[t.trainNumber, t.trainName].filter(Boolean).join(' ') || 'Train not set'}</span>
              </p>
              <p className="truncate text-sm text-slate-500">{t.title}</p>
            </div>
            <div className="flex shrink-0 items-start gap-2">
              <div className="flex flex-wrap justify-end gap-1">
                {summary && <StatusChip status={summary} />}
                {mine && <Badge tone="brand">Your ticket</Badge>}
                {t.locked && <Badge tone="amber"><Lock className="size-3" /> Locked</Badge>}
                {completed && <Badge>Completed</Badge>}
                {savedOffline && <Badge tone="green"><HardDrive className="size-3" /> Offline</Badge>}
              </div>
              <ChevronDown className={`mt-0.5 size-5 shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
            </div>
          </div>
          <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
            <div className="min-w-0">
              <p className={`${open ? 'text-3xl' : 'text-2xl'} font-extrabold tracking-tight text-ink`}>{t.boardingStation || '—'}</p>
              {open && <p className="text-sm text-slate-500">{formatTime(t.departureTime) || ' '}</p>}
            </div>
            <div className="text-center text-xs font-semibold text-slate-500">
              <p>{formatDateLong(t.journeyDate) || 'Date not set'}</p>
              <p className="my-0.5 text-slate-300" aria-hidden>———→</p>
              <p>{t.travelClass || ' '}</p>
            </div>
            <div className="min-w-0 text-right">
              <p className={`${open ? 'text-3xl' : 'text-2xl'} font-extrabold tracking-tight text-ink`}>{t.destinationStation || '—'}</p>
              {open && <p className="text-sm text-slate-500">{formatTime(t.arrivalTime) || ' '}</p>}
            </div>
          </div>
          {!open && (
            <div className="mt-3 flex items-center justify-between gap-2 border-t border-dashed border-slate-200 py-3 text-sm">
              <span className="font-mono font-bold tracking-wider text-brand-800">{t.pnr ? `PNR ${t.pnr}` : 'No PNR'}</span>
              <span className="text-slate-500">
                {pax.length} {pax.length === 1 ? 'passenger' : 'passengers'}
                {myPax && berthLabel(myPax) && <> · you <b className="text-ink">{berthLabel(myPax)}</b></>}
              </span>
            </div>
          )}
        </button>

        {open && (
        <div id={`ticket-body-${t.id}`}>
        {/* tear line */}
        <div className="relative my-3 h-4" aria-hidden>
          <div className="absolute inset-x-5 top-1/2 border-t-2 border-dashed border-slate-200" />
          <div className="absolute -left-2 top-0 size-4 rounded-full bg-ground" />
          <div className="absolute -right-2 top-0 size-4 rounded-full bg-ground" />
        </div>

        <div className="space-y-3 px-4 pb-4 sm:px-5">
          <div className="flex items-center justify-between gap-2">
            {t.pnr ? (
              <button type="button" onClick={() => copyPnr(t.pnr)} className="group flex items-baseline gap-2 rounded-xl text-left" aria-label={`PNR ${t.pnr}, tap to copy`}>
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">PNR</span>
                <span className="font-mono text-lg font-bold tracking-wider text-brand-800">{t.pnr}</span>
                <Copy className="size-3.5 text-slate-400 group-hover:text-brand-700" aria-hidden />
              </button>
            ) : (
              <span className="text-sm text-slate-500">No PNR</span>
            )}
            <span className="text-sm text-slate-500">{pax.length} {pax.length === 1 ? 'passenger' : 'passengers'}</span>
          </div>

          <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl bg-slate-50" aria-label="Passengers">
            {pax.map((p, i) => {
              const isMe = Boolean(p.personId) && p.personId === ctx.myPersonId;
              const seat = berthLabel(p);
              return (
                <li key={`${p.personId || p.name}-${i}`} className={`flex items-center gap-3 px-3 py-2.5 ${isMe ? 'bg-brand-50' : ''}`}>
                  <span className="w-5 shrink-0 text-center text-xs font-semibold text-slate-400">{i + 1}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold text-ink">
                      {p.name || 'Passenger'}
                      {isMe && <span className="ml-1.5 rounded-full bg-brand-700 px-1.5 py-0.5 align-middle text-[10px] font-bold text-white">YOU</span>}
                    </span>
                    {(p.age > 0 || p.gender) && <span className="text-xs text-slate-500">{[p.gender && GENDER_LABEL[p.gender], p.age > 0 && `${p.age} yrs`].filter(Boolean).join(' · ')}</span>}
                  </span>
                  <span className="text-right">
                    {seat && <span className="block whitespace-nowrap text-sm font-bold tabular-nums text-ink">{seat}</span>}
                    {p.status && <StatusChip status={p.status} small />}
                  </span>
                </li>
              );
            })}
          </ul>

          {t.notes && <p className="text-sm text-slate-600">📝 {t.notes}</p>}

          <div className="flex flex-wrap gap-2">
            <ShareWhatsApp size="sm" label="Share details" text={() => ticketText(t, pax)} />
            {!completed && t.passengerUids.length > 0 && <RollCallButton size="sm" title={`Boarding ${t.trainName || t.title} – ${formatDate(t.journeyDate)}`} personIds={t.passengerUids} />}
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
            {online ? (
              <FileActions path={t.filePath} fileName={t.fileName} fileType={t.fileType} compact offline={{ saved: savedOffline, busy: savingId === t.id, onSave: () => saveOfflineCopy(t), onRemove: () => removeOfflineCopy(t) }} />
            ) : savedOffline ? (
              <Button size="sm" variant="secondary" onClick={() => openOffline(t)}>Open offline copy</Button>
            ) : (
              <span className="text-sm text-slate-500">Connect to the internet to open this ticket.</span>
            )}
            <span className="flex-1" />
            {editable && (
              <>
                <Button size="sm" variant="ghost" icon={<Pencil className="size-4" />} onClick={() => setEditing(t)} disabled={!online}>Edit</Button>
                <Button size="sm" variant="ghost" className="text-red-700" aria-label="Delete ticket" icon={<Trash2 className="size-4" />} onClick={() => remove(t)} disabled={!online} />
              </>
            )}
            {admin && (
              <Button size="sm" variant="ghost" aria-label={t.locked ? 'Unlock ticket' : 'Lock ticket'} icon={t.locked ? <LockOpen className="size-4" /> : <Lock className="size-4" />} onClick={() => toggleLock(t)} />
            )}
          </div>
          <p className="text-xs text-slate-400">Uploaded by {t.uploadedByName} · {formatDateTime(t.createdAt) || 'syncing…'}</p>
        </div>
        </div>
        )}
      </Card>
    );
  };

  return (
    <div>
      <PageHeader
        title={admin ? 'Ticket Management' : 'Train Tickets'}
        subtitle="Everyone on the trip can view and download every ticket."
        syncKey="tickets"
        actions={<Button icon={<Plus className="size-5" />} onClick={() => setEditing('new')} disabled={!online || !filesConfigured}>Upload ticket</Button>}
      />
      {!filesConfigured && <div className="mb-4"><Notice tone="warn">File storage is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.</Notice></div>}
      {trip?.ticketsLocked && !admin && <div className="mb-4"><Notice tone="info"><Lock className="mr-1 inline size-4" /> The admin has locked tickets. You can still view, download and upload, but not edit or delete.</Notice></div>}

      <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex rounded-xl bg-slate-100 p-1" role="tablist" aria-label="Whose tickets">
          {([['all', 'All'], ['mine', 'My tickets'], ['uploaded', 'I uploaded']] as const).map(([k, label]) => (
            <button key={k} role="tab" aria-selected={filters.tab === k} onClick={() => setF({ tab: k })} className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold sm:flex-none ${filters.tab === k ? 'bg-white text-brand-800 shadow-sm' : 'text-slate-600'}`}>
              {label}
            </button>
          ))}
        </div>
        <label className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-slate-400" />
          <input type="search" value={filters.q} onChange={(e) => setF({ q: e.target.value })} placeholder="Search PNR, train, passenger, date…" className="w-full rounded-xl border border-slate-300 bg-white py-2.5 pl-10 pr-3" aria-label="Search tickets" />
        </label>
      </div>
      <div className="mb-4 grid grid-cols-2 items-end gap-3">
        <SelectField label="Journey date" value={filters.date} onChange={(e) => setF({ date: e.target.value })}>
          <option value="">All dates</option>
          {dates.map((o) => <option key={o.value} value={o.value}>{o.label} ({o.count})</option>)}
        </SelectField>
        <SelectField label="Train" value={filters.train} onChange={(e) => setF({ train: e.target.value })}>
          <option value="">All trains</option>
          {trains.map((o) => <option key={o.value} value={o.value}>{o.label} ({o.count})</option>)}
        </SelectField>
      </div>

      {loading ? (
        <Spinner />
      ) : error ? (
        <ErrorState message={error} />
      ) : data.length === 0 ? (
        <EmptyState icon={<TicketIcon className="size-7" />} title="No tickets uploaded yet" message="Upload the first train ticket (PDF or photo) for the group." action={<Button onClick={() => setEditing('new')} icon={<Plus className="size-5" />}>Upload ticket</Button>} />
      ) : (
        <div className="space-y-6">
          {(filtering || active.length > 1 || (showCompleted && completed.length > 0)) && (
            <div className="-mb-2 flex items-center justify-end gap-1">
              {filtering && (
                <Button size="sm" variant="ghost" icon={<X className="size-4" />} onClick={clearFilters}>Clear filters</Button>
              )}
              <span className="flex-1" />
              {(() => {
                const visible = [...active, ...(showCompleted ? completed : [])].map((t) => t.id);
                const allOpen = visible.length > 0 && visible.every((id) => expanded.has(id));
                return (
                  <Button size="sm" variant="ghost" icon={<ChevronsUpDown className="size-4" />} onClick={() => setExpanded(allOpen ? new Set() : new Set(visible))}>
                    {allOpen ? 'Collapse all' : 'Expand all'}
                  </Button>
                );
              })()}
            </div>
          )}
          {active.length > 0 ? (
            <ul className="grid items-start gap-4 md:grid-cols-2">{active.map((t) => renderCard(t, false))}</ul>
          ) : filtering ? (
            <EmptyState icon={<TicketIcon className="size-7" />} title="No matching upcoming tickets" message={completed.length ? 'Some completed tickets match – see below.' : 'Try a different filter or search.'} action={<Button variant="secondary" onClick={clearFilters}>Clear filters</Button>} />
          ) : (
            <EmptyState icon={<TicketIcon className="size-7" />} title="No upcoming journeys" message="All tickets are completed. You can still open them below." />
          )}

          {completed.length > 0 && (
            <section>
              <button
                type="button"
                aria-expanded={showCompleted}
                aria-controls="completed-tickets"
                onClick={() => setShowCompleted((v) => !v)}
                className="flex w-full items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 text-left font-semibold text-slate-800 hover:bg-slate-50"
              >
                <span>Completed ({completed.length})</span>
                <ChevronDown className={`size-5 transition-transform ${showCompleted ? 'rotate-180' : ''}`} aria-hidden />
              </button>
              {showCompleted && (
                <ul id="completed-tickets" className="mt-4 grid items-start gap-4 md:grid-cols-2">{completed.map((t) => renderCard(t, true))}</ul>
              )}
            </section>
          )}
        </div>
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
const GENDER_LABEL: Record<string, string> = { M: 'Male', F: 'Female', O: 'Other' };
const STATUS_SUGGESTIONS = ['CNF', 'RAC', 'WL', 'RLWL', 'GNWL', 'PQWL', 'CAN'];

function StatusChip({ status, small }: { status: string; small?: boolean }) {
  const kind = statusKind(status.split(' + ')[0]);
  const tone = status.includes('+') ? 'bg-amber-100 text-amber-800' : kind === 'confirmed' ? 'bg-emerald-100 text-emerald-800' : kind === 'cancelled' ? 'bg-red-100 text-red-800' : kind === 'unknown' ? 'bg-slate-100 text-slate-700' : 'bg-amber-100 text-amber-800';
  return <span className={`inline-block rounded-full font-bold ${tone} ${small ? 'mt-0.5 px-2 py-0.5 text-[11px]' : 'px-2.5 py-0.5 text-xs'}`}>{status}</span>;
}

function TicketForm({ ticket, onClose }: { ticket: Ticket | null; onClose: () => void }) {
  const me = useSession((s) => s.member)!;
  const members = useApprovedMembers();
  const nameOf = (id: string) => members.find((m) => m.uid === id)?.displayName ?? '';
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
    travelClass: ticket?.travelClass ?? '',
    notes: ticket?.notes ?? '',
  });
  const [rows, setRows] = useState<TicketPassenger[]>(() => (ticket ? passengersOf(ticket, nameOf).map((p) => ({ ...p, status: p.status || 'CNF' })) : []));
  const [file, setFile] = useState<File | null>(null);
  const [stage, setStage] = useState<string | null>(null);

  const linked = rows.filter((r) => r.personId).map((r) => r.personId);
  const pickTravellers = (uids: string[]) => {
    setRows((cur) => {
      const kept = cur.filter((r) => !r.personId || uids.includes(r.personId));
      const added = uids.filter((u) => !cur.some((r) => r.personId === u)).map((u) => emptyPassenger({ personId: u, name: nameOf(u), coach: cur[0]?.coach ?? '' }));
      return [...kept, ...added];
    });
  };
  const update = (i: number, patch: Partial<TicketPassenger>) => setRows((cur) => cur.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const removeRow = (i: number) => setRows((cur) => cur.filter((_, j) => j !== i));
  const coachForAll = () => setRows((cur) => cur.map((r) => ({ ...r, coach: cur[0]?.coach ?? '' })));

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
    const paxError = validatePassengers(rows);
    if (paxError) errs._form = paxError;
    if (!ticket && !file) errs._form = 'Please attach the ticket PDF or photo.';
    f.setErrors(errs);
    if (Object.values(errs).some(Boolean)) return;

    const derived = derivedTicketFields(rows);
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
      travelClass: v.travelClass,
      notes: v.notes.trim(),
      ...derived,
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

  const small = 'w-full rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-sm';
  return (
    <Modal open onClose={onClose} title={ticket ? 'Edit ticket' : 'Upload ticket'} wide
      footer={<><Button variant="secondary" onClick={onClose} disabled={!!stage}>Cancel</Button><Button type="submit" form="ticket-form" loading={!!stage}>{stage ?? (ticket ? 'Save changes' : 'Upload & share')}</Button></>}>
      <form id="ticket-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <FileInput kind="ticket" file={file} onChange={setFile} label="Ticket document" required={!ticket} existingName={ticket?.fileName} />
        </div>
        <TextField className="sm:col-span-2" label="Ticket title" required maxLength={150} {...f.bind('title')} placeholder="Coimbatore → Chennai (Family 1)" />
        <TextField label="PNR number" inputMode="numeric" maxLength={10} {...f.bind('pnr')} />
        <TextField label="Journey date" type="date" {...f.bind('journeyDate')} />
        <TextField label="Train number" maxLength={10} {...f.bind('trainNumber')} placeholder="12672" />
        <TextField label="Train name" maxLength={100} {...f.bind('trainName')} placeholder="NILAGIRI SF EXP" />
        <TextField label="From (station code)" maxLength={100} {...f.bind('boardingStation')} placeholder="CBE" />
        <TextField label="To (station code)" maxLength={100} {...f.bind('destinationStation')} placeholder="MAS" />
        <TextField label="Departure time" type="time" {...f.bind('departureTime')} />
        <TextField label="Arrival time" type="time" {...f.bind('arrivalTime')} />
        <SelectField label="Class" {...f.bind('travelClass')}>
          {CLASSES.map((c) => <option key={c} value={c}>{c || 'Select class'}</option>)}
        </SelectField>

        <div className="space-y-3 sm:col-span-2">
          <MemberPicker label="Who is on this ticket?" members={members} selected={linked} onChange={pickTravellers} />
          {rows.length > 0 && <p className="text-sm font-medium text-slate-700">Passenger details (as printed on the ticket)</p>}
          <datalist id="pax-status">{STATUS_SUGGESTIONS.map((x) => <option key={x} value={x} />)}</datalist>
          {rows.map((r, i) => (
            <fieldset key={i} className="rounded-2xl border border-slate-200 p-3">
              <legend className="sr-only">Passenger {i + 1}</legend>
              <div className="mb-2 flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-400">{i + 1}</span>
                {r.personId ? (
                  <span className="flex-1 font-semibold text-ink">{r.name}</span>
                ) : (
                  <input className={`${small} flex-1`} placeholder="Passenger name" aria-label={`Passenger ${i + 1} name`} maxLength={100} value={r.name} onChange={(e) => update(i, { name: e.target.value })} />
                )}
                <button type="button" onClick={() => removeRow(i)} className="rounded-full p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600" aria-label={`Remove ${r.name || `passenger ${i + 1}`}`}><X className="size-4" /></button>
              </div>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                <label className="text-xs text-slate-500">Age<input className={small} inputMode="numeric" aria-label={`Age of ${r.name || `passenger ${i + 1}`}`} value={r.age || ''} onChange={(e) => update(i, { age: Number(e.target.value.replace(/\D/g, '')) || 0 })} /></label>
                <label className="text-xs text-slate-500">Gender
                  <select className={small} value={r.gender} onChange={(e) => update(i, { gender: e.target.value as TicketPassenger['gender'] })} aria-label={`Gender of ${r.name || `passenger ${i + 1}`}`}>
                    <option value="">–</option><option value="M">Male</option><option value="F">Female</option><option value="O">Other</option>
                  </select>
                </label>
                <label className="text-xs text-slate-500">Coach<input className={small} maxLength={10} placeholder="M2" aria-label={`Coach of ${r.name || `passenger ${i + 1}`}`} value={r.coach} onChange={(e) => update(i, { coach: e.target.value.toUpperCase() })} /></label>
                <label className="text-xs text-slate-500">Berth no.<input className={small} maxLength={10} placeholder="58" aria-label={`Berth of ${r.name || `passenger ${i + 1}`}`} value={r.berth} onChange={(e) => update(i, { berth: e.target.value })} /></label>
                <label className="text-xs text-slate-500">Berth
                  <select className={small} value={r.berthType} onChange={(e) => update(i, { berthType: e.target.value as BerthType })} aria-label={`Berth type of ${r.name || `passenger ${i + 1}`}`}>
                    {BERTH_TYPES.map((b) => <option key={b} value={b}>{b || '–'}</option>)}
                  </select>
                </label>
                <label className="text-xs text-slate-500">Status<input className={small} list="pax-status" maxLength={20} placeholder="CNF" aria-label={`Status of ${r.name || `passenger ${i + 1}`}`} value={r.status} onChange={(e) => update(i, { status: e.target.value.toUpperCase() })} /></label>
              </div>
            </fieldset>
          ))}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" icon={<Plus className="size-4" />} onClick={() => setRows((cur) => [...cur, emptyPassenger({ coach: cur[0]?.coach ?? '' })])}>Add a passenger not in the list</Button>
            {rows.length > 1 && rows[0].coach && <Button size="sm" variant="ghost" onClick={coachForAll}>Use coach {rows[0].coach} for everyone</Button>}
          </div>
        </div>

        <TextArea className="sm:col-span-2" label="Notes" maxLength={1000} {...f.bind('notes')} />
        <div className="sm:col-span-2"><FormError message={f.errors._form} /></div>
      </form>
    </Modal>
  );
}
