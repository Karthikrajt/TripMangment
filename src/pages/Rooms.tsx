import { useMemo, useState } from 'react';
import { BedDouble, Pencil, Plus, Trash2, AlertTriangle } from 'lucide-react';
import { useAccommodations, useRooms } from '../hooks/data';
import { useApprovedMembers, useIsAdmin, useSession } from '../store/session';
import { PageHeader } from '../components/ui/PageHeader';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Badge, EmptyState, ErrorState, Notice, Spinner } from '../components/ui/Feedback';
import { Modal } from '../components/ui/Modal';
import { FormError, SelectField, TextArea, TextField } from '../components/ui/Field';
import { MemberChips, MemberPicker } from '../components/MemberPicker';
import { confirm } from '../components/ui/Confirm';
import { toast } from '../components/ui/Toast';
import { useForm } from '../hooks/useForm';
import { roomService } from '../services/content';
import { formatDate } from '../lib/format';
import { errorMessage } from '../lib/retry';
import { isISODate } from '../domain/validation';
import type { Room } from '../domain/types';

export default function Rooms() {
  const { data, loading, error } = useRooms();
  const hotels = useAccommodations();
  const members = useSession((s) => s.members);
  const approved = useApprovedMembers();
  const me = useSession((s) => s.member);
  const admin = useIsAdmin();
  const [editing, setEditing] = useState<Room | 'new' | null>(null);

  const mine = data.filter((r) => me && r.memberUids.includes(me.uid));
  const unassigned = useMemo(() => approved.filter((m) => !data.some((r) => r.memberUids.includes(m.uid))), [approved, data]);
  const hotelName = (id: string) => hotels.data.find((h) => h.id === id)?.name ?? 'Unassigned hotel';

  const remove = async (r: Room) => {
    if (!(await confirm({ title: 'Delete room?', message: `Room “${r.name}” and its allocation will be removed.`, danger: true, confirmLabel: 'Delete' }))) return;
    try {
      await roomService.remove(r);
      toast.success('Room deleted');
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <div>
      <PageHeader title="Room Allocation" subtitle="Who is staying in which room." syncKey="rooms" actions={admin && <Button icon={<Plus className="size-5" />} onClick={() => setEditing('new')}>Add room</Button>} />
      {mine.length > 0 && (
        <div className="mb-5 rounded-2xl border border-brand-200 bg-brand-50 p-4">
          <p className="text-sm text-brand-800">Your room</p>
          {mine.map((r) => (
            <p key={r.id} className="text-xl font-bold text-brand-900">{r.name} <span className="text-base font-normal text-brand-800">· {hotelName(r.accommodationId)} {r.roomType && `· ${r.roomType}`}</span></p>
          ))}
        </div>
      )}
      {admin && unassigned.length > 0 && data.length > 0 && (
        <div className="mb-5"><Notice tone="warn"><AlertTriangle className="mr-1 inline size-4" /> Not yet assigned to a room: {unassigned.map((m) => m.displayName).join(', ')}</Notice></div>
      )}
      {loading ? <Spinner /> : error ? <ErrorState message={error} /> : data.length === 0 ? (
        <EmptyState icon={<BedDouble className="size-7" />} title="No rooms allocated yet" message={admin ? 'Add rooms and assign members.' : 'Room allocation will appear here.'} />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.map((r) => {
            const over = r.bedCapacity > 0 && r.memberUids.length > r.bedCapacity;
            return (
              <Card as="li" key={r.id} className={`p-4 ${me && r.memberUids.includes(me.uid) ? 'ring-2 ring-brand-500' : ''}`}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="text-lg font-bold">{r.name}</h3>
                    <p className="text-sm text-slate-600">{hotelName(r.accommodationId)}</p>
                  </div>
                  <Badge tone={over ? 'red' : 'slate'}>{r.memberUids.length}/{r.bedCapacity || '–'} beds</Badge>
                </div>
                {r.roomType && <p className="mt-1 text-slate-700">{r.roomType}</p>}
                <p className="text-sm text-slate-500">{formatDate(r.checkInDate)} → {formatDate(r.checkOutDate)}</p>
                <div className="mt-3"><MemberChips uids={r.memberUids} members={members} /></div>
                {r.notes && <p className="mt-2 text-sm text-slate-600">{r.notes}</p>}
                {admin && (
                  <div className="mt-3 flex gap-1 border-t border-slate-100 pt-2">
                    <Button size="sm" variant="ghost" icon={<Pencil className="size-4" />} onClick={() => setEditing(r)}>Edit</Button>
                    <Button size="sm" variant="ghost" className="text-red-700" icon={<Trash2 className="size-4" />} onClick={() => remove(r)}>Delete</Button>
                  </div>
                )}
              </Card>
            );
          })}
        </ul>
      )}
      {admin && editing && <RoomForm room={editing === 'new' ? null : editing} rooms={data} onClose={() => setEditing(null)} />}
    </div>
  );
}

function RoomForm({ room, rooms, onClose }: { room: Room | null; rooms: Room[]; onClose: () => void }) {
  const hotels = useAccommodations();
  const approved = useApprovedMembers();
  const first = hotels.data[0];
  const f = useForm({
    accommodationId: room?.accommodationId ?? first?.id ?? '',
    name: room?.name ?? '',
    roomType: room?.roomType ?? '',
    bedCapacity: String(room?.bedCapacity ?? 2),
    checkInDate: room?.checkInDate ?? first?.checkInDate ?? '',
    checkOutDate: room?.checkOutDate ?? first?.checkOutDate ?? '',
    notes: room?.notes ?? '',
  });
  const [assigned, setAssigned] = useState<string[]>(room?.memberUids ?? []);
  const [busy, setBusy] = useState(false);
  const elsewhere = assigned.filter((uid) => rooms.some((r) => r.id !== room?.id && r.accommodationId === f.values.accommodationId && r.memberUids.includes(uid)));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const v = f.values;
    const errs: typeof f.errors = {};
    if (!v.name.trim()) errs.name = 'Room number/name is required.';
    const beds = Number(v.bedCapacity);
    if (!Number.isInteger(beds) || beds < 0 || beds > 30) errs.bedCapacity = 'Enter 0–30.';
    if (v.checkInDate && !isISODate(v.checkInDate)) errs.checkInDate = 'Invalid date.';
    if (v.checkOutDate && !isISODate(v.checkOutDate)) errs.checkOutDate = 'Invalid date.';
    if (assigned.length > 30) errs._form = 'Too many members for one room.';
    f.setErrors(errs);
    if (Object.values(errs).some(Boolean)) return;
    setBusy(true);
    try {
      await roomService.save({ accommodationId: v.accommodationId, name: v.name.trim(), roomType: v.roomType.trim(), bedCapacity: beds, memberUids: assigned, checkInDate: v.checkInDate, checkOutDate: v.checkOutDate, notes: v.notes.trim() }, room);
      toast.success('Room saved');
      onClose();
    } catch (err) {
      f.setErrors({ _form: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={room ? 'Edit room' : 'Add room'} wide
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" form="room-form" loading={busy}>Save</Button></>}>
      <form id="room-form" onSubmit={save} className="grid gap-4 sm:grid-cols-2">
        <SelectField className="sm:col-span-2" label="Accommodation" {...f.bind('accommodationId')}>
          <option value="">— Not linked —</option>
          {hotels.data.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
        </SelectField>
        <TextField label="Room number / name" required maxLength={100} {...f.bind('name')} placeholder="204" />
        <TextField label="Room type" maxLength={60} {...f.bind('roomType')} placeholder="Deluxe double" />
        <TextField label="Bed capacity" type="number" min={0} max={30} {...f.bind('bedCapacity')} />
        <div />
        <TextField label="Check-in date" type="date" {...f.bind('checkInDate')} />
        <TextField label="Check-out date" type="date" {...f.bind('checkOutDate')} />
        <div className="sm:col-span-2">
          <MemberPicker label="Assigned members" members={approved} selected={assigned} onChange={setAssigned} />
          {Number(f.values.bedCapacity) > 0 && assigned.length > Number(f.values.bedCapacity) && <p className="mt-1 text-sm text-amber-700">More members than beds.</p>}
          {elsewhere.length > 0 && <p className="mt-1 text-sm text-amber-700">Already in another room at this hotel: {elsewhere.map((u) => approved.find((m) => m.uid === u)?.displayName).join(', ')}</p>}
        </div>
        <TextArea className="sm:col-span-2" label="Notes" maxLength={500} {...f.bind('notes')} />
        <div className="sm:col-span-2"><FormError message={f.errors._form} /></div>
      </form>
    </Modal>
  );
}
