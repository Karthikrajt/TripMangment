import { useEffect, useState } from 'react';
import { Plus, Trash2, Lock, Users, UserPlus } from 'lucide-react';
import { sharesFromTrip } from '../../domain/people';
import { useSession } from '../../store/session';
import { PageHeader } from '../../components/ui/PageHeader';
import { Button } from '../../components/ui/Button';
import { Card, CardBody, CardHeader } from '../../components/ui/Card';
import { Checkbox, FormError, TextArea, TextField } from '../../components/ui/Field';
import { Spinner } from '../../components/ui/Feedback';
import { toast } from '../../components/ui/Toast';
import { updateTrip } from '../../services/trip';
import { errorMessage } from '../../lib/retry';
import { isISODate, isPhone } from '../../domain/validation';

export default function TripSettings() {
  const trip = useSession((s) => s.trip);
  const [v, setV] = useState(() => (trip ? { ...trip } : null));
  const [shares, setShares] = useState(() => { const d = sharesFromTrip(trip); return { child: String(d.child), infant: String(d.infant) }; });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (trip && !v) setV({ ...trip });
  }, [trip, v]);
  if (!trip || !v) return <Spinner />;

  const setContact = (i: number, k: 'name' | 'phone' | 'note', val: string) =>
    setV({ ...v, importantContacts: v.importantContacts.map((c, j) => (j === i ? { ...c, [k]: val } : c)) });

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!v.name.trim() || !v.destination.trim()) return setError('Trip name and destination are required.');
    if (!isISODate(v.startDate) || !isISODate(v.endDate) || v.endDate < v.startDate) return setError('Please enter valid start and end dates.');
    const contacts = v.importantContacts.filter((c) => c.name.trim() || c.phone.trim());
    if (contacts.some((c) => !c.name.trim() || !isPhone(c.phone))) return setError('Each contact needs a name and a valid phone number.');
    const child = Number(shares.child);
    const infant = Number(shares.infant);
    if (![child, infant].every((x) => Number.isInteger(x) && x >= 0 && x <= 100)) return setError('Child and infant shares must be whole numbers from 0 to 100.');
    setBusy(true);
    setError(null);
    try {
      await updateTrip(trip, {
        childSharePercent: child,
        infantSharePercent: infant,
        name: v.name.trim(),
        destination: v.destination.trim(),
        description: v.description.trim(),
        startDate: v.startDate,
        endDate: v.endDate,
        emergencyInfo: v.emergencyInfo.trim(),
        importantContacts: contacts.map((c) => ({ name: c.name.trim(), phone: c.phone.trim(), note: (c.note ?? '').trim() })),
        ticketsLocked: v.ticketsLocked,
        openJoin: v.openJoin !== false,
      });
      toast.success('Trip settings saved');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={save} className="mx-auto max-w-3xl space-y-6">
      <PageHeader title="Trip Settings" actions={<Button type="submit" loading={busy}>Save changes</Button>} />
      <Card>
        <CardHeader title="Trip details" />
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <TextField className="sm:col-span-2" label="Trip name" required maxLength={120} value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />
          <TextField className="sm:col-span-2" label="Destination" required maxLength={120} value={v.destination} onChange={(e) => setV({ ...v, destination: e.target.value })} />
          <TextField label="Start date" type="date" required value={v.startDate} onChange={(e) => setV({ ...v, startDate: e.target.value })} />
          <TextField label="End date" type="date" required value={v.endDate} onChange={(e) => setV({ ...v, endDate: e.target.value })} />
          <TextArea className="sm:col-span-2" label="Description" maxLength={2000} value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} />
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Emergency information" subtitle="Shown prominently in Trip Live." />
        <CardBody className="space-y-4">
          <TextArea label="Emergency instructions" rows={4} maxLength={2000} value={v.emergencyInfo} onChange={(e) => setV({ ...v, emergencyInfo: e.target.value })} placeholder="Nearest hospital: … / Meeting point if separated: …" />
          <div className="space-y-3">
            <p className="text-sm font-medium text-slate-700">Important contacts</p>
            {v.importantContacts.map((c, i) => (
              <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]">
                <input aria-label="Contact name" className="rounded-xl border border-slate-300 px-3 py-2" placeholder="Name" value={c.name} onChange={(e) => setContact(i, 'name', e.target.value)} />
                <input aria-label="Contact phone" className="rounded-xl border border-slate-300 px-3 py-2" placeholder="Phone" inputMode="tel" value={c.phone} onChange={(e) => setContact(i, 'phone', e.target.value)} />
                <input aria-label="Contact note" className="hidden rounded-xl border border-slate-300 px-3 py-2 sm:block" placeholder="Note (e.g. Tour guide)" value={c.note ?? ''} onChange={(e) => setContact(i, 'note', e.target.value)} />
                <Button variant="ghost" aria-label="Remove contact" icon={<Trash2 className="size-4" />} onClick={() => setV({ ...v, importantContacts: v.importantContacts.filter((_, j) => j !== i) })} />
              </div>
            ))}
            {v.importantContacts.length < 30 && (
              <Button variant="secondary" size="sm" icon={<Plus className="size-4" />} onClick={() => setV({ ...v, importantContacts: [...v.importantContacts, { name: '', phone: '', note: '' }] })}>Add contact</Button>
            )}
          </div>
        </CardBody>
      </Card>
      <Card>
        <CardHeader icon={<UserPlus className="size-5" />} title="Joining the trip" />
        <CardBody>
          <Checkbox
            label="Anyone with the app link can join (no approval)"
            description="New people sign in with Google and join straight away, then confirm which traveller they are. Anyone who gets the link can see trip tickets and details. Turn this off to approve each new person under Member Approvals."
            checked={v.openJoin !== false}
            onChange={(x) => setV({ ...v, openJoin: x })}
          />
        </CardBody>
      </Card>
      <Card>
        <CardHeader icon={<Users className="size-5" />} title="Expense split per head" subtitle="Share of one adult. You can still give any child or infant their own % under Member Management." />
        <CardBody className="grid gap-4 sm:grid-cols-3">
          <TextField label="Adult" value="100%" disabled hint="Always a full share" />
          <TextField label="Child (default %)" type="number" min={0} max={100} inputMode="numeric" value={shares.child} onChange={(e) => setShares({ ...shares, child: e.target.value })} hint="e.g. 50 = half of an adult" />
          <TextField label="Infant (default %)" type="number" min={0} max={100} inputMode="numeric" value={shares.infant} onChange={(e) => setShares({ ...shares, infant: e.target.value })} hint="0 = not counted" />
          <p className="text-sm text-slate-600 sm:col-span-3">Changes apply to new expenses. Expenses already saved keep the split they were saved with.</p>
        </CardBody>
      </Card>
      <Card>
        <CardHeader icon={<Lock className="size-5" />} title="Ticket lock" />
        <CardBody>
          <Checkbox label="Lock all tickets" description="Members can still view, download and upload tickets, but cannot edit or delete existing ones. Admins are not affected." checked={v.ticketsLocked} onChange={(x) => setV({ ...v, ticketsLocked: x })} />
        </CardBody>
      </Card>
      <FormError message={error} />
    </form>
  );
}
