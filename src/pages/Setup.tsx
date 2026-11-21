import { useState } from 'react';
import { Plane } from 'lucide-react';
import { useSession } from '../store/session';
import { createTrip } from '../services/trip';
import { Button } from '../components/ui/Button';
import { Card, CardBody } from '../components/ui/Card';
import { FormError, TextArea, TextField } from '../components/ui/Field';
import { errorMessage } from '../lib/retry';
import { isISODate } from '../domain/validation';

/** First-run trip creation. Only the bootstrap admin (enforced in firestore.rules) can complete this. */
export default function Setup() {
  const { user, refreshSummary, signOut } = useSession();
  const [f, setF] = useState({ name: '', destination: '', description: '', startDate: '', endDate: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!f.name.trim() || !f.destination.trim()) return setError('Trip name and destination are required.');
    if (!isISODate(f.startDate) || !isISODate(f.endDate) || f.endDate < f.startDate) return setError('Please enter valid start and end dates.');
    setBusy(true);
    setError(null);
    try {
      await createTrip(user, {
        name: f.name.trim(),
        destination: f.destination.trim(),
        description: f.description.trim(),
        startDate: f.startDate,
        endDate: f.endDate,
        emergencyInfo: '',
        importantContacts: [],
        ticketsLocked: false,
      });
      await refreshSummary();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-dvh bg-slate-50 px-4 py-10">
      <div className="mx-auto max-w-lg">
        <div className="mb-6 flex flex-col items-center text-center">
          <span className="rounded-2xl bg-brand-700 p-3 text-white">
            <Plane className="size-7" />
          </span>
          <h1 className="mt-3 text-2xl font-bold">Set up your trip</h1>
          <p className="text-slate-600">You are the trip admin. You can change these details later.</p>
        </div>
        <Card>
          <CardBody>
            <form onSubmit={submit} className="space-y-4">
              <TextField label="Trip name" required value={f.name} onChange={set('name')} placeholder="Kumar Family Ooty Trip 2026" />
              <TextField label="Destination" required value={f.destination} onChange={set('destination')} placeholder="Coimbatore & Ooty" />
              <div className="grid grid-cols-2 gap-3">
                <TextField label="Start date" type="date" required value={f.startDate} onChange={set('startDate')} />
                <TextField label="End date" type="date" required value={f.endDate} onChange={set('endDate')} />
              </div>
              <TextArea label="Description" value={f.description} onChange={set('description')} />
              <FormError message={error} />
              <Button type="submit" size="lg" className="w-full" loading={busy}>
                Create trip
              </Button>
            </form>
          </CardBody>
        </Card>
        <div className="mt-4 text-center">
          <Button variant="ghost" onClick={signOut}>
            Sign out
          </Button>
        </div>
      </div>
    </div>
  );
}
