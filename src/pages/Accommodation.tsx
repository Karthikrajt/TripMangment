import { personIdOf } from '../domain/people';
import { useState } from 'react';
import { Hotel, Pencil, Plus, Trash2, BedDouble } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAccommodations, useRooms } from '../hooks/data';
import { useIsAdmin, useSession } from '../store/session';
import { PageHeader } from '../components/ui/PageHeader';
import { Button } from '../components/ui/Button';
import { Card, CardBody, CardHeader } from '../components/ui/Card';
import { EmptyState, ErrorState, Spinner } from '../components/ui/Feedback';
import { Modal } from '../components/ui/Modal';
import { FormError, TextArea, TextField } from '../components/ui/Field';
import { AddressLine, CallButton, MapButton } from '../components/Links';
import { FileActions, FileInput } from '../components/Files';
import { confirm } from '../components/ui/Confirm';
import { toast } from '../components/ui/Toast';
import { useForm } from '../hooks/useForm';
import { accommodationService } from '../services/content';
import { uploadFile, deleteFile } from '../lib/files';
import { formatDate, formatTime } from '../lib/format';
import { errorMessage } from '../lib/retry';
import { isISODate, isMapsUrl, isPhone } from '../domain/validation';
import type { Accommodation as Acc } from '../domain/types';

export default function Accommodation() {
  const { data, loading, error } = useAccommodations();
  const rooms = useRooms();
  const me = useSession((s) => s.member);
  const admin = useIsAdmin();
  const [editing, setEditing] = useState<Acc | 'new' | null>(null);

  const remove = async (h: Acc) => {
    if (!(await confirm({ title: 'Delete accommodation?', message: `“${h.name}” will be removed.`, danger: true, confirmLabel: 'Delete' }))) return;
    try {
      await accommodationService.remove(h, { filePath: h.filePath });
      toast.success('Accommodation deleted');
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <div>
      <PageHeader title="Accommodation" subtitle="Where we are staying." syncKey="accommodations" actions={admin && <Button icon={<Plus className="size-5" />} onClick={() => setEditing('new')}>Add hotel</Button>} />
      {loading ? <Spinner /> : error ? <ErrorState message={error} /> : data.length === 0 ? (
        <EmptyState icon={<Hotel className="size-7" />} title="No accommodation yet" message={admin ? 'Add the hotel or resort details.' : 'Hotel details will appear here.'} />
      ) : (
        <div className="space-y-5">
          {data.map((h) => {
            const myRoom = rooms.data.find((r) => r.accommodationId === h.id && me && r.memberUids.includes(personIdOf(me)));
            return (
              <Card key={h.id}>
                <CardHeader icon={<Hotel className="size-5" />} title={h.name} subtitle={h.bookingReference && `Booking ref: ${h.bookingReference}`}
                  action={admin && (
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" icon={<Pencil className="size-4" />} onClick={() => setEditing(h)}>Edit</Button>
                      <Button size="sm" variant="ghost" className="text-red-700" icon={<Trash2 className="size-4" />} onClick={() => remove(h)}>Delete</Button>
                    </div>
                  )} />
                <CardBody className="space-y-4">
                  <AddressLine address={h.address} />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-xl bg-emerald-50 p-3"><p className="text-sm text-emerald-800">Check-in</p><p className="font-semibold">{formatDate(h.checkInDate)} {formatTime(h.checkInTime)}</p></div>
                    <div className="rounded-xl bg-rose-50 p-3"><p className="text-sm text-rose-800">Check-out</p><p className="font-semibold">{formatDate(h.checkOutDate)} {formatTime(h.checkOutTime)}</p></div>
                  </div>
                  <p className="text-slate-600">{h.numberOfRooms} room(s) · capacity {h.totalCapacity}</p>
                  {myRoom && (
                    <Link to="/rooms" className="flex items-center gap-3 rounded-xl border border-brand-200 bg-brand-50 p-3">
                      <BedDouble className="size-5 text-brand-700" /> <span>Your room: <b>{myRoom.name}</b> {myRoom.roomType && `(${myRoom.roomType})`}</span>
                    </Link>
                  )}
                  {h.instructions && <p className="whitespace-pre-line rounded-xl bg-amber-50 p-3 text-amber-900">📌 {h.instructions}</p>}
                  <div className="flex flex-wrap gap-2">
                    <MapButton url={h.mapsUrl} address={h.address} />
                    <CallButton phone={h.contactNumber} label="Call hotel" />
                  </div>
                  {h.filePath && (
                    <div>
                      <p className="mb-1 text-sm font-medium text-slate-600">Booking confirmation</p>
                      <FileActions path={h.filePath} fileName={h.fileName} />
                    </div>
                  )}
                </CardBody>
              </Card>
            );
          })}
        </div>
      )}
      {admin && editing && <AccommodationForm item={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function AccommodationForm({ item, onClose }: { item: Acc | null; onClose: () => void }) {
  const f = useForm({
    name: item?.name ?? '',
    address: item?.address ?? '',
    contactNumber: item?.contactNumber ?? '',
    bookingReference: item?.bookingReference ?? '',
    checkInDate: item?.checkInDate ?? '',
    checkInTime: item?.checkInTime ?? '12:00',
    checkOutDate: item?.checkOutDate ?? '',
    checkOutTime: item?.checkOutTime ?? '11:00',
    numberOfRooms: String(item?.numberOfRooms ?? 1),
    totalCapacity: String(item?.totalCapacity ?? 2),
    mapsUrl: item?.mapsUrl ?? '',
    instructions: item?.instructions ?? '',
  });
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const v = f.values;
    const errs: typeof f.errors = {};
    if (!v.name.trim()) errs.name = 'Name is required.';
    if (!isISODate(v.checkInDate)) errs.checkInDate = 'Choose a date.';
    if (!isISODate(v.checkOutDate)) errs.checkOutDate = 'Choose a date.';
    if (isISODate(v.checkInDate) && isISODate(v.checkOutDate) && v.checkOutDate < v.checkInDate) errs.checkOutDate = 'Check-out is before check-in.';
    if (v.contactNumber && !isPhone(v.contactNumber)) errs.contactNumber = 'Invalid phone number.';
    if (v.mapsUrl && !isMapsUrl(v.mapsUrl)) errs.mapsUrl = 'Paste a Google Maps link.';
    const rooms = Number(v.numberOfRooms), cap = Number(v.totalCapacity);
    if (!Number.isInteger(rooms) || rooms < 0) errs.numberOfRooms = 'Invalid number.';
    if (!Number.isInteger(cap) || cap < 0) errs.totalCapacity = 'Invalid number.';
    f.setErrors(errs);
    if (Object.values(errs).some(Boolean)) return;
    let uploaded = null;
    try {
      if (file) uploaded = await uploadFile('accommodation', file, setBusy);
      setBusy('Saving…');
      await accommodationService.save(
        {
          name: v.name.trim(), address: v.address.trim(), contactNumber: v.contactNumber.trim(), bookingReference: v.bookingReference.trim(),
          checkInDate: v.checkInDate, checkInTime: v.checkInTime, checkOutDate: v.checkOutDate, checkOutTime: v.checkOutTime,
          numberOfRooms: rooms, totalCapacity: cap, mapsUrl: v.mapsUrl.trim(), instructions: v.instructions.trim(),
          filePath: uploaded?.path ?? item?.filePath ?? '', fileName: uploaded?.fileName ?? item?.fileName ?? '',
        },
        item,
      );
      if (uploaded && item?.filePath) await deleteFile(item.filePath).catch(() => undefined);
      toast.success('Accommodation saved');
      onClose();
    } catch (err) {
      if (uploaded) await deleteFile(uploaded.path).catch(() => undefined);
      f.setErrors({ _form: errorMessage(err) });
    } finally {
      setBusy(null);
    }
  };

  return (
    <Modal open onClose={onClose} title={item ? 'Edit accommodation' : 'Add accommodation'} wide
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" form="acc-form" loading={!!busy}>{busy ?? 'Save'}</Button></>}>
      <form id="acc-form" onSubmit={save} className="grid gap-4 sm:grid-cols-2">
        <TextField className="sm:col-span-2" label="Hotel / resort name" required maxLength={150} {...f.bind('name')} />
        <TextArea className="sm:col-span-2" label="Address" maxLength={500} {...f.bind('address')} />
        <TextField label="Contact number" inputMode="tel" {...f.bind('contactNumber')} />
        <TextField label="Booking reference" maxLength={100} {...f.bind('bookingReference')} />
        <TextField label="Check-in date" type="date" required {...f.bind('checkInDate')} />
        <TextField label="Check-in time" type="time" {...f.bind('checkInTime')} />
        <TextField label="Check-out date" type="date" required {...f.bind('checkOutDate')} />
        <TextField label="Check-out time" type="time" {...f.bind('checkOutTime')} />
        <TextField label="Number of rooms" type="number" min={0} {...f.bind('numberOfRooms')} />
        <TextField label="Total capacity" type="number" min={0} {...f.bind('totalCapacity')} />
        <TextField className="sm:col-span-2" label="Google Maps link" {...f.bind('mapsUrl')} />
        <TextArea className="sm:col-span-2" label="Additional instructions" maxLength={2000} {...f.bind('instructions')} />
        <div className="sm:col-span-2"><FileInput kind="accommodation" file={file} onChange={setFile} label="Booking confirmation (optional)" existingName={item?.fileName || undefined} /></div>
        <div className="sm:col-span-2"><FormError message={f.errors._form} /></div>
      </form>
    </Modal>
  );
}
