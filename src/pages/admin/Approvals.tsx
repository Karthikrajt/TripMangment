import { useMemo, useState } from 'react';
import { Check, X, UserCheck } from 'lucide-react';
import { useSession } from '../../store/session';
import { PageHeader } from '../../components/ui/PageHeader';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Avatar } from '../../components/ui/Avatar';
import { Badge, EmptyState } from '../../components/ui/Feedback';
import { SelectField } from '../../components/ui/Field';
import { toast } from '../../components/ui/Toast';
import { decideMember } from '../../services/members';
import { ageLabel } from '../../domain/people';
import { formatDateTime } from '../../lib/format';
import { errorMessage } from '../../lib/retry';
import type { Member, MemberStatus } from '../../domain/types';

export default function Approvals() {
  const { members, member: me } = useSession();
  const [busy, setBusy] = useState<string | null>(null);
  const [linkChoice, setLinkChoice] = useState<Record<string, string>>({});
  const pending = members.filter((m) => m.status === 'pending').sort((a, b) => (a.requestedAt?.toMillis() ?? 0) - (b.requestedAt?.toMillis() ?? 0));
  const decided = members.filter((m) => m.status === 'rejected' || m.status === 'disabled');
  // Travellers added by the admin who are not yet linked to a sign-in account.
  const unlinked = useMemo(() => members.filter((m) => m.hasLogin === false && m.status === 'approved' && !m.linkedUid), [members]);

  const suggested = (m: Member) => {
    const email = m.email.toLowerCase();
    const byEmail = unlinked.find((p) => p.email && p.email === email);
    if (byEmail) return byEmail.uid;
    const byName = unlinked.find((p) => p.displayName.trim().toLowerCase() === m.displayName.trim().toLowerCase());
    return byName?.uid ?? '';
  };
  const choice = (m: Member) => linkChoice[m.uid] ?? suggested(m);

  const decide = async (m: Member, status: MemberStatus) => {
    setBusy(m.uid + status);
    try {
      const link = m.status !== 'pending' ? undefined : status === 'approved' ? unlinked.find((p) => p.uid === choice(m)) ?? null : null;
      await decideMember(me!.uid, m, status, link);
      toast.success(`${m.displayName} ${status}${link ? ` as ${link.displayName}` : ''}`);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Member Approvals" subtitle="People who signed in and asked to join. Only approved accounts can see trip information." />
      {pending.length === 0 ? (
        <EmptyState icon={<UserCheck className="size-7" />} title="No pending requests" message="When someone signs in and asks to join, they will appear here." />
      ) : (
        <ul className="space-y-3">
          {pending.map((m) => (
            <Card as="li" key={m.uid} className="space-y-4 p-4">
              <div className="flex items-center gap-3">
                <Avatar name={m.displayName} photo={m.photoURL} size={52} />
                <div className="min-w-0">
                  <p className="font-semibold">{m.displayName}</p>
                  <p className="truncate text-sm text-slate-600">{m.email}{m.phone && ` · ${m.phone}`}</p>
                  {m.relationship && <p className="text-sm text-slate-600">{m.relationship}</p>}
                  {m.requestNote && <p className="mt-1 rounded-lg bg-slate-50 px-2 py-1 text-sm text-slate-700">“{m.requestNote}”</p>}
                  <p className="text-xs text-slate-400">Requested {formatDateTime(m.requestedAt)}</p>
                </div>
              </div>
              <SelectField label="Who is this?" value={choice(m)} onChange={(e) => setLinkChoice({ ...linkChoice, [m.uid]: e.target.value })}
                hint={unlinked.length ? 'Pick their name if you already added them as a traveller, so their expenses and tickets stay together.' : undefined}>
                <option value="">A new traveller (adult)</option>
                {unlinked.map((p) => <option key={p.uid} value={p.uid}>{p.displayName} · {ageLabel(p)}{p.relationship ? ` · ${p.relationship}` : ''}</option>)}
              </SelectField>
              <div className="flex justify-end gap-2">
                <Button variant="danger" icon={<X className="size-5" />} loading={busy === m.uid + 'rejected'} onClick={() => decide(m, 'rejected')}>Reject</Button>
                <Button variant="success" icon={<Check className="size-5" />} loading={busy === m.uid + 'approved'} onClick={() => decide(m, 'approved')}>Approve</Button>
              </div>
            </Card>
          ))}
        </ul>
      )}
      {decided.length > 0 && (
        <section>
          <h2 className="mb-2 text-lg font-semibold">Rejected / disabled</h2>
          <Card>
            <ul className="divide-y divide-slate-100">
              {decided.map((m) => (
                <li key={m.uid} className="flex items-center gap-3 px-4 py-3">
                  <Avatar name={m.displayName} photo={m.photoURL} size={36} />
                  <span className="flex-1"><span className="font-medium">{m.displayName}</span> <span className="text-sm text-slate-500">{m.email}</span></span>
                  <Badge tone={m.status === 'rejected' ? 'red' : 'slate'}>{m.status}</Badge>
                  <Button size="sm" variant="secondary" loading={busy === m.uid + 'approved'} onClick={() => decide(m, 'approved')}>Approve</Button>
                </li>
              ))}
            </ul>
          </Card>
        </section>
      )}
    </div>
  );
}
