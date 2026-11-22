import { useState } from 'react';
import { Clock, LogOut, Ban, Send, XCircle } from 'lucide-react';
import { useSession } from '../store/session';
import { Button } from '../components/ui/Button';
import { Card, CardBody } from '../components/ui/Card';
import { FormError, TextArea, TextField } from '../components/ui/Field';
import { requestAccess } from '../services/members';
import { errorMessage } from '../lib/retry';
import { formatDate } from '../lib/format';
import { isPhone } from '../domain/validation';

/** Shown to signed-in users who are not (yet) approved. No trip data is readable here. */
export default function Pending() {
  const { user, member, summary, signOut } = useSession();
  const [note, setNote] = useState('');
  const [phone, setPhone] = useState(member?.phone ?? '');
  const [relationship, setRelationship] = useState(member?.relationship ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (phone && !isPhone(phone)) return setError('Please enter a valid mobile number.');
    setBusy(true);
    setError(null);
    try {
      await requestAccess(user, note, { phone, relationship }, member);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const status = member?.status;
  return (
    <div className="min-h-dvh bg-ground px-4 py-10">
      <div className="mx-auto max-w-lg space-y-4">
        <div className="text-center">
          <p className="text-slate-500">Signed in as {user?.email}</p>
          {summary ? (
            <>
              <h1 className="mt-2 text-2xl font-bold text-slate-900">{summary.name}</h1>
              <p className="text-slate-600">
                {summary.destination}
                {summary.startDate && ` · ${formatDate(summary.startDate)} – ${formatDate(summary.endDate)}`}
              </p>
            </>
          ) : (
            <h1 className="mt-2 text-2xl font-bold text-slate-900">Trip Manager</h1>
          )}
        </div>

        <Card>
          <CardBody className="space-y-4">
            {status === 'pending' && (
              <div className="flex flex-col items-center gap-3 text-center">
                <span className="rounded-full bg-amber-100 p-4 text-amber-700">
                  <Clock className="size-8" />
                </span>
                <h2 className="text-xl font-semibold">Waiting for approval</h2>
                <p className="text-slate-600">Your request has been sent to the trip admin. This page will update automatically once you are approved.</p>
              </div>
            )}
            {status === 'disabled' && (
              <div className="flex flex-col items-center gap-3 text-center">
                <span className="rounded-full bg-slate-200 p-4 text-slate-600">
                  <Ban className="size-8" />
                </span>
                <h2 className="text-xl font-semibold">Access disabled</h2>
                <p className="text-slate-600">Your access to this trip has been turned off by the admin. Please contact them if this is a mistake.</p>
              </div>
            )}
            {(!member || status === 'rejected') && (
              <form onSubmit={submit} className="space-y-4">
                {status === 'rejected' ? (
                  <div className="flex items-start gap-3 rounded-xl bg-red-50 p-3 text-red-800">
                    <XCircle className="mt-0.5 size-5 shrink-0" />
                    <p>Your previous request was declined. You can send a new request with a note for the admin.</p>
                  </div>
                ) : (
                  <div>
                    <h2 className="text-xl font-semibold">Request to join</h2>
                    <p className="text-slate-600">The trip admin will review your request.</p>
                  </div>
                )}
                <TextField label="Mobile number" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="98765 43210" />
                <TextField label="Family / group (optional)" value={relationship} onChange={(e) => setRelationship(e.target.value)} placeholder="e.g. Kumar family" />
                <TextArea label="Note for the admin (optional)" value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} placeholder="Hi, this is Priya – Ravi's sister." />
                <FormError message={error} />
                <Button type="submit" size="lg" className="w-full" loading={busy} icon={<Send className="size-5" />}>
                  Send request
                </Button>
              </form>
            )}
          </CardBody>
        </Card>

        <div className="text-center">
          <Button variant="ghost" onClick={signOut} icon={<LogOut className="size-5" />}>
            Sign out
          </Button>
        </div>
      </div>
    </div>
  );
}
