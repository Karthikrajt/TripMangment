import { useMemo, useState } from 'react';
import { CalendarDays, Pencil, Plus, Trash2 } from 'lucide-react';
import { useItinerary } from '../hooks/data';
import { useIsAdmin, useSession } from '../store/session';
import { PageHeader } from '../components/ui/PageHeader';
import { Button } from '../components/ui/Button';
import { Card, CardBody } from '../components/ui/Card';
import { EmptyState, ErrorState, Spinner } from '../components/ui/Feedback';
import { Modal } from '../components/ui/Modal';
import { Checkbox, FormError, TextArea, TextField } from '../components/ui/Field';
import { ItineraryRow } from '../components/ItineraryList';
import { confirm } from '../components/ui/Confirm';
import { toast } from '../components/ui/Toast';
import { itineraryService } from '../services/content';
import { useForm } from '../hooks/useForm';
import { formatDate, formatDateLong } from '../lib/format';
import { errorMessage } from '../lib/retry';
import { isClockTime, isISODate, isMapsUrl } from '../domain/validation';
import type { ItineraryItem } from '../domain/types';

export default function Itinerary() {
  const { data, loading, error } = useItinerary();
  const admin = useIsAdmin();
  const [editing, setEditing] = useState<ItineraryItem | 'new' | null>(null);

  const days = useMemo(() => {
    const map = new Map<string, { day: number; date: string; items: ItineraryItem[] }>();
    for (const i of data) {
      const k = `${i.dayNumber}|${i.date}`;
      if (!map.has(k)) map.set(k, { day: i.dayNumber, date: i.date, items: [] });
      map.get(k)!.items.push(i);
    }
    return [...map.values()];
  }, [data]);

  const remove = async (i: ItineraryItem) => {
    if (!(await confirm({ title: 'Delete activity?', message: `“${i.title}” will be removed from the itinerary.`, danger: true, confirmLabel: 'Delete' }))) return;
    try {
      await itineraryService.remove(i, { silent: !i.published });
      toast.success('Activity deleted');
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <div>
      <PageHeader
        title={admin ? 'Itinerary Management' : 'Itinerary'}
        subtitle="Day-wise plan for the trip. Tap Directions to navigate."
        syncKey="itinerary"
        actions={admin && <Button icon={<Plus className="size-5" />} onClick={() => setEditing('new')}>Add activity</Button>}
      />
      {loading ? (
        <Spinner />
      ) : error ? (
        <ErrorState message={error} />
      ) : days.length === 0 ? (
        <EmptyState icon={<CalendarDays className="size-7" />} title="No itinerary yet" message={admin ? 'Add the first activity to start planning.' : 'The admin will publish the plan soon.'} />
      ) : (
        <div className="space-y-5">
          {days.map((d) => (
            <Card key={`${d.day}${d.date}`}>
              <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-3">
                <span className="rounded-xl bg-brand-700 px-3 py-1 font-bold text-white">Day {d.day}</span>
                <span className="font-semibold text-slate-700">{formatDateLong(d.date)}</span>
                <span className="text-sm text-slate-400">{formatDate(d.date)}</span>
              </div>
              <CardBody>
                <ul className="space-y-1">
                  {d.items.map((i) => (
                    <ItineraryRow
                      key={i.id}
                      item={i}
                      actions={
                        admin && (
                          <>
                            <Button size="sm" variant="ghost" icon={<Pencil className="size-4" />} onClick={() => setEditing(i)}>Edit</Button>
                            <Button size="sm" variant="ghost" className="text-red-700" icon={<Trash2 className="size-4" />} onClick={() => remove(i)}>Delete</Button>
                          </>
                        )
                      }
                    />
                  ))}
                </ul>
              </CardBody>
            </Card>
          ))}
        </div>
      )}
      {admin && editing && <ItineraryForm item={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function ItineraryForm({ item, onClose }: { item: ItineraryItem | null; onClose: () => void }) {
  const trip = useSession((s) => s.trip);
  const f = useForm({
    dayNumber: String(item?.dayNumber ?? 1),
    date: item?.date ?? trip?.startDate ?? '',
    startTime: item?.startTime ?? '',
    endTime: item?.endTime ?? '',
    title: item?.title ?? '',
    description: item?.description ?? '',
    location: item?.location ?? '',
    mapsUrl: item?.mapsUrl ?? '',
    coordinator: item?.coordinator ?? '',
    instructions: item?.instructions ?? '',
    notes: item?.notes ?? '',
  });
  const [published, setPublished] = useState(item?.published ?? true);
  const [notifyMembers, setNotifyMembers] = useState(true);
  const [busy, setBusy] = useState(false);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const v = f.values;
    const errs: typeof f.errors = {};
    const day = Number(v.dayNumber);
    if (!Number.isInteger(day) || day < 0 || day > 60) errs.dayNumber = 'Enter a day number between 0 and 60.';
    if (!isISODate(v.date)) errs.date = 'Choose a date.';
    if (!v.title.trim()) errs.title = 'Activity title is required.';
    if (v.startTime && !isClockTime(v.startTime)) errs.startTime = 'Invalid time.';
    if (v.endTime && !isClockTime(v.endTime)) errs.endTime = 'Invalid time.';
    if (v.startTime && v.endTime && v.endTime < v.startTime) errs.endTime = 'End time is before start time.';
    if (v.mapsUrl && !isMapsUrl(v.mapsUrl)) errs.mapsUrl = 'Paste a Google Maps link (maps.google.com or maps.app.goo.gl).';
    f.setErrors(errs);
    if (Object.values(errs).some(Boolean)) return;
    setBusy(true);
    try {
      await itineraryService.save(
        {
          dayNumber: day,
          date: v.date,
          startTime: v.startTime,
          endTime: v.endTime,
          title: v.title.trim(),
          description: v.description.trim(),
          location: v.location.trim(),
          mapsUrl: v.mapsUrl.trim(),
          coordinator: v.coordinator.trim(),
          instructions: v.instructions.trim(),
          notes: v.notes.trim(),
          published,
        },
        item,
        { silent: !published || !notifyMembers },
      );
      toast.success(item ? 'Activity updated' : 'Activity added');
      onClose();
    } catch (err) {
      f.setErrors({ _form: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={item ? 'Edit activity' : 'Add activity'} wide
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" form="it-form" loading={busy}>Save</Button></>}>
      <form id="it-form" onSubmit={save} className="grid gap-4 sm:grid-cols-2">
        <TextField label="Day number" type="number" min={0} max={60} required {...f.bind('dayNumber')} />
        <TextField label="Date" type="date" required {...f.bind('date')} />
        <TextField label="Start time" type="time" {...f.bind('startTime')} />
        <TextField label="End time" type="time" {...f.bind('endTime')} />
        <TextField className="sm:col-span-2" label="Activity title" required maxLength={150} {...f.bind('title')} placeholder="Private bus pickup" />
        <TextArea className="sm:col-span-2" label="Description" maxLength={3000} {...f.bind('description')} />
        <TextField label="Location" maxLength={300} {...f.bind('location')} placeholder="Coimbatore Junction" />
        <TextField label="Google Maps link" {...f.bind('mapsUrl')} placeholder="https://maps.app.goo.gl/…" hint="Optional – otherwise we search the location." />
        <TextField label="Coordinator" maxLength={100} {...f.bind('coordinator')} placeholder="Ravi – 98765 43210" />
        <TextField label="Notes" maxLength={500} {...f.bind('notes')} />
        <TextArea className="sm:col-span-2" label="Instructions for members" maxLength={1000} {...f.bind('instructions')} placeholder="Carry water bottles and caps." />
        <div className="sm:col-span-2 space-y-1">
          <Checkbox label="Published" description="Members only see published activities." checked={published} onChange={setPublished} />
          {published && <Checkbox label="Notify all members about this change" checked={notifyMembers} onChange={setNotifyMembers} />}
        </div>
        <div className="sm:col-span-2"><FormError message={f.errors._form} /></div>
      </form>
    </Modal>
  );
}
