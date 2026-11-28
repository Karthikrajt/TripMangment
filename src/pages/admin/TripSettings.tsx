import { useEffect, useState } from 'react';
import { Plus, Trash2, Lock, Users, UserPlus, Video, RefreshCw } from 'lucide-react';
import { isMeetUrl, isWhatsappGroupUrl, normaliseMeetUrl, normaliseWhatsappGroupUrl } from '../../domain/call';
import { sharesFromTrip } from '../../domain/people';
import { useSession } from '../../store/session';
import { PageHeader } from '../../components/ui/PageHeader';
import { Button } from '../../components/ui/Button';
import { Card, CardBody, CardHeader } from '../../components/ui/Card';
import { Checkbox, FormError, TextArea, TextField } from '../../components/ui/Field';
import { Spinner } from '../../components/ui/Feedback';
import { toast } from '../../components/ui/Toast';
import { newCallRoom, updateCallSettings, updateTrip } from '../../services/trip';
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

  // Errors show at the bottom of a long page – also pop them up so they are seen.
  const fail = (msg: string) => {
    setError(msg);
    toast.error(msg);
  };
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!v.name.trim() || !v.destination.trim()) return fail('Trip name and destination are required.');
    if (!isISODate(v.startDate) || !isISODate(v.endDate) || v.endDate < v.startDate) return fail('Please enter valid start and end dates.');
    const contacts = v.importantContacts.filter((c) => c.name.trim() || c.phone.trim());
    if (contacts.some((c) => !c.name.trim() || !isPhone(c.phone))) return fail('Each contact needs a name and a valid phone number.');
    const child = Number(shares.child);
    const infant = Number(shares.infant);
    if (![child, infant].every((x) => Number.isInteger(x) && x >= 0 && x <= 100)) return fail('Child and infant shares must be whole numbers from 0 to 100.');
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
      fail(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={save} className="mx-auto max-w-3xl space-y-6">
      <PageHeader title="Trip Settings" actions={<Button type="submit" loading={busy}>Save changes</Button>} />
      <VideoCallSettings />
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

/** Saves on its own (not with "Save changes"), so other fields can never block it. */
function VideoCallSettings() {
  const trip = useSession((s) => s.trip);
  const [busy, setBusy] = useState(false);
  if (!trip) return null;
  const room = trip.callRoom;

  const makeRoom = async () => {
    setBusy(true);
    try {
      await updateCallSettings(trip, { callRoom: newCallRoom() });
      toast.success(room ? 'New video call link ready – the old one no longer works' : 'Video call link ready');
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader icon={<Video className="size-5" />} title="Video calls" subtitle="Free. Each one you set up shows as a button in Chat, Trip Live and the menu. Saved straight away." />
      <CardBody className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-slate-50 p-3">
          <div className="min-w-0">
            <p className="font-semibold text-ink">Trip video room (Jitsi Meet)</p>
            <p className="text-sm text-slate-600">{room ? '✅ Ready. Only trip members can see the link.' : 'Not set up yet – tap the button.'} No time limit. The first person to open the room signs in once with Google; others just join.</p>
          </div>
          <Button size="sm" variant={room ? 'secondary' : 'primary'} loading={busy} icon={room ? <RefreshCw className="size-4" /> : <Video className="size-4" />} onClick={makeRoom}>
            {room ? 'Make a new link' : 'Create call link'}
          </Button>
        </div>
        <CallLinkField
          trip={trip}
          field="googleMeetUrl"
          label="Google Meet link (optional)"
          placeholder="https://meet.google.com/abc-defg-hij"
          hint="Open meet.google.com → New meeting → Create a meeting for later → copy the link. Free Gmail: calls with 3+ people end after 60 minutes – just tap the button again."
          isValid={isMeetUrl}
          normalise={normaliseMeetUrl}
          invalid="That doesn’t look like a Google Meet link. It looks like https://meet.google.com/abc-defg-hij."
          saved="Google Meet link saved"
        />
        <CallLinkField
          trip={trip}
          field="whatsappGroupUrl"
          label="WhatsApp group invite link (optional)"
          placeholder="https://chat.whatsapp.com/…"
          hint="WhatsApp → your trip group → Invite via link → Copy link (the whole message is fine)."
          isValid={isWhatsappGroupUrl}
          normalise={normaliseWhatsappGroupUrl}
          invalid="That doesn’t look like a WhatsApp group link. In WhatsApp: open the group → Invite via link → Copy link, then paste here."
          saved="WhatsApp group link saved"
        />
      </CardBody>
    </Card>
  );
}

function CallLinkField(props: {
  trip: NonNullable<ReturnType<typeof useSession.getState>['trip']>;
  field: 'googleMeetUrl' | 'whatsappGroupUrl';
  label: string;
  placeholder: string;
  hint: string;
  isValid: (v: string) => boolean;
  normalise: (v: string) => string;
  invalid: string;
  saved: string;
}) {
  const current = props.trip[props.field] ?? '';
  const [value, setValue] = useState(current);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setValue(current), [current]);

  const save = async () => {
    const raw = value.trim();
    if (raw && !props.isValid(raw)) {
      setError(props.invalid);
      toast.error(props.invalid);
      return;
    }
    const url = raw ? props.normalise(raw) : '';
    setValue(url);
    setBusy(true);
    setError(null);
    try {
      await updateCallSettings(props.trip, { [props.field]: url });
      toast.success(url ? props.saved : 'Link removed');
    } catch (e) {
      const msg = errorMessage(e);
      setError(msg);
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-1">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
        <TextField className="flex-1" label={props.label} inputMode="url" maxLength={500} value={value} onChange={(e) => setValue(e.target.value)} placeholder={props.placeholder} hint={props.hint} />
        <Button className="sm:mt-7" variant="secondary" loading={busy} disabled={value.trim() === current} onClick={save} aria-label={`Save ${props.label.replace(' (optional)', '')}`}>Save link</Button>
      </div>
      <FormError message={error} />
    </div>
  );
}
