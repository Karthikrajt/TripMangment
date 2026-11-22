import { personIdOf } from '../domain/people';
import { useState } from 'react';
import { Bus, Pencil, Plus, Trash2, MapPin, Clock, User } from 'lucide-react';
import { useTransport } from '../hooks/data';
import { useApprovedMembers, useIsAdmin, useSession } from '../store/session';
import { PageHeader } from '../components/ui/PageHeader';
import { Button } from '../components/ui/Button';
import { Card, CardBody, CardHeader } from '../components/ui/Card';
import { Badge, EmptyState, ErrorState, Spinner } from '../components/ui/Feedback';
import { Modal } from '../components/ui/Modal';
import { FormError, TextArea, TextField } from '../components/ui/Field';
import { MemberChips, MemberPicker } from '../components/MemberPicker';
import { CallButton, MapButton } from '../components/Links';
import { confirm } from '../components/ui/Confirm';
import { toast } from '../components/ui/Toast';
import { useForm } from '../hooks/useForm';
import { transportService } from '../services/content';
import { formatDate, formatTime } from '../lib/format';
import { errorMessage } from '../lib/retry';
import { isClockTime, isISODate, isMapsUrl, isPhone } from '../domain/validation';
import type { Vehicle } from '../domain/types';

export default function Transport() {
  const { data, loading, error } = useTransport();
  const members = useSession((s) => s.members);
  const me = useSession((s) => s.member);
  const admin = useIsAdmin();
  const [editing, setEditing] = useState<Vehicle | 'new' | null>(null);

  const remove = async (v: Vehicle) => {
    if (!(await confirm({ title: 'Delete vehicle?', message: `${v.vehicleType} ${v.registrationNumber} will be removed.`, danger: true, confirmLabel: 'Delete' }))) return;
    try {
      await transportService.remove(v);
      toast.success('Vehicle deleted');
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <div>
      <PageHeader title={admin ? 'Transport Management' : 'Transport'} subtitle="Vehicles, drivers and pickup schedule." syncKey="transport" actions={admin && <Button icon={<Plus className="size-5" />} onClick={() => setEditing('new')}>Add vehicle</Button>} />
      {loading ? <Spinner /> : error ? <ErrorState message={error} /> : data.length === 0 ? (
        <EmptyState icon={<Bus className="size-7" />} title="No vehicles yet" message={admin ? 'Add the bus/van/car and driver details.' : 'Transport details will appear here.'} />
      ) : (
        <div className="grid gap-5 md:grid-cols-2">
          {data.map((v) => (
            <Card key={v.id} className={me && v.memberUids.includes(personIdOf(me)) ? 'ring-2 ring-brand-500' : ''}>
              <CardHeader icon={<Bus className="size-5" />} title={`${v.vehicleType}${v.registrationNumber ? ' · ' + v.registrationNumber : ''}`} subtitle={`Capacity ${v.capacity}`}
                action={me && v.memberUids.includes(personIdOf(me)) ? <Badge tone="brand">Your vehicle</Badge> : undefined} />
              <CardBody className="space-y-3">
                <div className="rounded-xl bg-amber-50 p-3">
                  <p className="flex items-center gap-2 font-semibold text-amber-900"><Clock className="size-4" /> Pickup {formatDate(v.pickupDate)} {formatTime(v.pickupTime)}</p>
                  <p className="flex items-center gap-2 text-amber-900"><MapPin className="size-4" /> {v.pickupLocation || '—'} {v.destination && `→ ${v.destination}`}</p>
                </div>
                {v.driverName && <p className="flex items-center gap-2"><User className="size-4 text-slate-400" /> Driver: <b>{v.driverName}</b></p>}
                {v.routeDetails && <p className="whitespace-pre-line text-slate-700">{v.routeDetails}</p>}
                {v.instructions && <p className="rounded-xl bg-slate-50 p-3 text-slate-700">📌 {v.instructions}</p>}
                {v.memberUids.length > 0 && <div><p className="mb-1 text-sm text-slate-500">Assigned</p><MemberChips uids={v.memberUids} members={members} /></div>}
                <div className="flex flex-wrap gap-2">
                  <CallButton phone={v.driverPhone} label="Call driver" />
                  <MapButton url={v.mapsUrl} address={v.mapsUrl ? undefined : v.pickupLocation} label="Navigate to pickup" />
                </div>
                {admin && (
                  <div className="flex gap-1 border-t border-slate-100 pt-2">
                    <Button size="sm" variant="ghost" icon={<Pencil className="size-4" />} onClick={() => setEditing(v)}>Edit</Button>
                    <Button size="sm" variant="ghost" className="text-red-700" icon={<Trash2 className="size-4" />} onClick={() => remove(v)}>Delete</Button>
                  </div>
                )}
              </CardBody>
            </Card>
          ))}
        </div>
      )}
      {admin && editing && <VehicleForm item={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function VehicleForm({ item, onClose }: { item: Vehicle | null; onClose: () => void }) {
  const approved = useApprovedMembers();
  const f = useForm({
    vehicleType: item?.vehicleType ?? 'Private bus',
    registrationNumber: item?.registrationNumber ?? '',
    capacity: String(item?.capacity ?? 20),
    driverName: item?.driverName ?? '',
    driverPhone: item?.driverPhone ?? '',
    pickupLocation: item?.pickupLocation ?? '',
    pickupDate: item?.pickupDate ?? '',
    pickupTime: item?.pickupTime ?? '',
    destination: item?.destination ?? '',
    routeDetails: item?.routeDetails ?? '',
    mapsUrl: item?.mapsUrl ?? '',
    instructions: item?.instructions ?? '',
  });
  const [assigned, setAssigned] = useState<string[]>(item?.memberUids ?? []);
  const [busy, setBusy] = useState(false);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const v = f.values;
    const errs: typeof f.errors = {};
    if (!v.vehicleType.trim()) errs.vehicleType = 'Vehicle type is required.';
    const cap = Number(v.capacity);
    if (!Number.isInteger(cap) || cap < 0 || cap > 200) errs.capacity = 'Enter 0–200.';
    if (v.driverPhone && !isPhone(v.driverPhone)) errs.driverPhone = 'Invalid phone number.';
    if (v.pickupDate && !isISODate(v.pickupDate)) errs.pickupDate = 'Invalid date.';
    if (v.pickupTime && !isClockTime(v.pickupTime)) errs.pickupTime = 'Invalid time.';
    if (v.mapsUrl && !isMapsUrl(v.mapsUrl)) errs.mapsUrl = 'Paste a Google Maps link.';
    f.setErrors(errs);
    if (Object.values(errs).some(Boolean)) return;
    setBusy(true);
    try {
      await transportService.save({
        vehicleType: v.vehicleType.trim(), registrationNumber: v.registrationNumber.trim().toUpperCase(), capacity: cap,
        driverName: v.driverName.trim(), driverPhone: v.driverPhone.trim(), pickupLocation: v.pickupLocation.trim(), pickupDate: v.pickupDate,
        pickupTime: v.pickupTime, destination: v.destination.trim(), routeDetails: v.routeDetails.trim(), mapsUrl: v.mapsUrl.trim(),
        instructions: v.instructions.trim(), memberUids: assigned,
      }, item);
      toast.success('Vehicle saved');
      onClose();
    } catch (err) {
      f.setErrors({ _form: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={item ? 'Edit vehicle' : 'Add vehicle'} wide
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" form="veh-form" loading={busy}>Save</Button></>}>
      <form id="veh-form" onSubmit={save} className="grid gap-4 sm:grid-cols-2">
        <TextField label="Vehicle type" required maxLength={60} {...f.bind('vehicleType')} placeholder="Tempo Traveller" />
        <TextField label="Registration number" maxLength={20} {...f.bind('registrationNumber')} placeholder="TN 37 AB 1234" />
        <TextField label="Capacity" type="number" min={0} {...f.bind('capacity')} />
        <TextField label="Driver name" maxLength={100} {...f.bind('driverName')} />
        <TextField label="Driver mobile" inputMode="tel" {...f.bind('driverPhone')} />
        <TextField label="Pickup location" maxLength={300} {...f.bind('pickupLocation')} />
        <TextField label="Pickup date" type="date" {...f.bind('pickupDate')} />
        <TextField label="Pickup time" type="time" {...f.bind('pickupTime')} />
        <TextField label="Destination" maxLength={300} {...f.bind('destination')} />
        <TextField label="Google Maps link" {...f.bind('mapsUrl')} />
        <TextArea className="sm:col-span-2" label="Route details" maxLength={2000} {...f.bind('routeDetails')} />
        <TextArea className="sm:col-span-2" label="Additional instructions" maxLength={1000} {...f.bind('instructions')} />
        <div className="sm:col-span-2"><MemberPicker label="Assigned members (optional)" members={approved} selected={assigned} onChange={setAssigned} /></div>
        <div className="sm:col-span-2"><FormError message={f.errors._form} /></div>
      </form>
    </Modal>
  );
}
