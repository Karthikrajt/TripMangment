import { personIdOf, peopleOf } from '../domain/people';
import { useMemo, useState } from 'react';
import { ArrowRight, CheckCircle2, Scale, Trash2, AlertTriangle } from 'lucide-react';
import { useExpenses, useSettlements } from '../hooks/data';
import { useIsAdmin, useSession, memberName } from '../store/session';
import { PageHeader } from '../components/ui/PageHeader';
import { Button } from '../components/ui/Button';
import { Card, CardBody, CardHeader, Stat } from '../components/ui/Card';
import { Badge, EmptyState, Notice, Spinner } from '../components/ui/Feedback';
import { Modal } from '../components/ui/Modal';
import { FormError, TextField } from '../components/ui/Field';
import { Avatar } from '../components/ui/Avatar';
import { confirm } from '../components/ui/Confirm';
import { toast } from '../components/ui/Toast';
import { computeSettlement, type Transfer } from '../domain/settlement';
import { formatINR, paiseToInput, rupeesToPaise } from '../domain/money';
import { deleteSettlement, recordSettlement, updateSettlement } from '../services/expenses';
import { formatDate, todayIST } from '../lib/format';
import { errorMessage } from '../lib/retry';
import type { Settlement } from '../domain/types';

export default function Settlements() {
  const expenses = useExpenses();
  const settlements = useSettlements();
  const members = useSession((s) => s.members);
  const me = useSession((s) => s.member);
  const admin = useIsAdmin();
  const [recording, setRecording] = useState<Transfer | null>(null);

  const memberUids = useMemo(() => peopleOf(members).map((m) => m.uid), [members]);
  const myId = personIdOf(me);
  const summary = useMemo(() => computeSettlement(expenses.data, settlements.data, memberUids), [expenses.data, settlements.data, memberUids]);
  const mine = summary.balances.find((b) => b.uid === myId);

  if (expenses.loading || settlements.loading) return <Spinner />;

  const markOpenPaid = async (s: Settlement) => {
    try {
      await updateSettlement(s, { status: 'paid', paidDate: todayIST() });
      toast.success('Marked as paid');
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };
  const remove = async (s: Settlement) => {
    if (!(await confirm({ title: 'Delete settlement record?', message: 'Balances will be recalculated without it.', danger: true, confirmLabel: 'Delete' }))) return;
    try {
      await deleteSettlement(s);
      toast.success('Settlement record deleted');
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader title={admin ? 'Settlement Management' : 'Settlement'} subtitle="Calculated from approved expenses. Net = amount paid − your share." syncKey="expenses" />

      {summary.inconsistent.length > 0 && (
        <Notice tone="warn"><AlertTriangle className="mr-1 inline size-4" /> {summary.inconsistent.length} approved expense(s) have split amounts that don't add up and were excluded. Reopen and correct them.</Notice>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Total approved expenses" value={formatINR(summary.totalApproved)} />
        <Stat label="People" value={memberUids.length} hint="Per head; children by %, infants free" />
        <Stat label="You paid" value={formatINR(mine?.paid ?? 0)} />
        <Stat
          label={mine && mine.outstanding < 0 ? 'You need to pay' : 'You will receive'}
          value={<span className={mine && mine.outstanding < 0 ? 'text-red-700' : 'text-emerald-700'}>{formatINR(Math.abs(mine?.outstanding ?? 0))}</span>}
          hint={`Your share ${formatINR(mine?.share ?? 0)}`}
        />
      </div>

      <Card>
        <CardHeader icon={<ArrowRight className="size-5" />} title="Suggested settlements" subtitle="The fewest payments needed to settle everyone up." />
        <CardBody>
          {summary.suggestions.length === 0 ? (
            <EmptyState icon={<CheckCircle2 className="size-7" />} title="Everyone is settled up" />
          ) : (
            <ul className="space-y-2">
              {summary.suggestions.map((t, i) => {
                const involvesMe = t.fromUid === myId || t.toUid === myId;
                return (
                  <li key={i} className={`flex flex-wrap items-center gap-3 rounded-xl border p-3 ${involvesMe ? 'border-brand-300 bg-brand-50' : 'border-slate-200'}`}>
                    <span className="flex min-w-0 flex-1 items-center gap-2">
                      <b className="truncate">{memberName(members, t.fromUid)}</b>
                      <ArrowRight className="size-4 shrink-0 text-slate-400" />
                      <b className="truncate">{memberName(members, t.toUid)}</b>
                    </span>
                    <span className="text-lg font-bold tabular-nums">{formatINR(t.amountPaise)}</span>
                    {admin && <Button size="sm" variant="success" onClick={() => setRecording(t)}>Mark as paid</Button>}
                  </li>
                );
              })}
            </ul>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader icon={<Scale className="size-5" />} title="Member balances" />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left">
            <thead className="border-b border-slate-200 text-sm text-slate-500">
              <tr><th className="px-4 py-2">Member</th><th className="px-4 py-2 text-right">Paid</th><th className="px-4 py-2 text-right">Share</th><th className="px-4 py-2 text-right">Net</th><th className="px-4 py-2 text-right">Settled</th><th className="px-4 py-2 text-right">To receive / pay</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100 tabular-nums">
              {summary.balances.map((b) => {
                const m = members.find((x) => x.uid === b.uid);
                return (
                  <tr key={b.uid} className={b.uid === myId ? 'bg-brand-50/50' : ''}>
                    <td className="px-4 py-2.5"><span className="flex items-center gap-2"><Avatar name={m?.displayName ?? '?'} photo={m?.photoURL} size={28} />{m?.displayName ?? 'Former member'}</span></td>
                    <td className="px-4 py-2.5 text-right">{formatINR(b.paid)}</td>
                    <td className="px-4 py-2.5 text-right">{formatINR(b.share)}</td>
                    <td className={`px-4 py-2.5 text-right ${b.net >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>{b.net >= 0 ? '+' : '−'}{formatINR(Math.abs(b.net))}</td>
                    <td className="px-4 py-2.5 text-right text-slate-500">{b.settledIn || b.settledOut ? `${formatINR(b.settledOut)} out / ${formatINR(b.settledIn)} in` : '—'}</td>
                    <td className="px-4 py-2.5 text-right font-semibold">
                      {b.outstanding === 0 ? <Badge tone="green">Settled</Badge> : b.outstanding > 0 ? <span className="text-emerald-700">Receive {formatINR(b.outstanding)}</span> : <span className="text-red-700">Pay {formatINR(-b.outstanding)}</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <CardHeader icon={<CheckCircle2 className="size-5" />} title="Settlement records" subtitle="Kept separately from expenses." />
        <CardBody>
          {settlements.data.length === 0 ? (
            <p className="text-slate-500">No settlements recorded yet.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {settlements.data.map((s) => (
                <li key={s.id} className="flex flex-wrap items-center gap-3 py-3">
                  <span className="min-w-0 flex-1">
                    <span className="font-semibold">{memberName(members, s.fromUid)} → {memberName(members, s.toUid)}</span>
                    <span className="block text-sm text-slate-500">
                      {s.status === 'paid' ? `Paid ${formatDate(s.paidDate)}` : 'Not yet paid'}
                      {s.reference && ` · Ref: ${s.reference}`}
                      {s.notes && ` · ${s.notes}`}
                    </span>
                  </span>
                  <span className="font-bold tabular-nums">{formatINR(s.amountPaise)}</span>
                  <Badge tone={s.status === 'paid' ? 'green' : 'amber'}>{s.status}</Badge>
                  {admin && s.status === 'open' && <Button size="sm" variant="secondary" onClick={() => markOpenPaid(s)}>Mark paid</Button>}
                  {admin && <Button size="sm" variant="ghost" className="text-red-700" aria-label="Delete settlement" icon={<Trash2 className="size-4" />} onClick={() => remove(s)} />}
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      {recording && <RecordSettlement transfer={recording} onClose={() => setRecording(null)} />}
    </div>
  );
}

function RecordSettlement({ transfer, onClose }: { transfer: Transfer; onClose: () => void }) {
  const me = useSession((s) => s.member)!;
  const members = useSession((s) => s.members);
  const [amount, setAmount] = useState(paiseToInput(transfer.amountPaise));
  const [paidDate, setPaidDate] = useState(todayIST());
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    const paise = rupeesToPaise(amount);
    if (!paise || paise <= 0) return setError('Enter a valid amount.');
    setBusy(true);
    try {
      await recordSettlement({ fromUid: transfer.fromUid, toUid: transfer.toUid, amountPaise: paise, status: 'paid', paidDate, reference: reference.trim(), notes: notes.trim() }, me.uid);
      toast.success('Settlement recorded');
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={onClose} title="Record settlement" footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button variant="success" loading={busy} onClick={save}>Save as paid</Button></>}>
      <div className="space-y-4">
        <p className="text-lg"><b>{memberName(members, transfer.fromUid)}</b> paid <b>{memberName(members, transfer.toUid)}</b></p>
        <TextField label="Amount (₹)" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
        <TextField label="Settlement date" type="date" value={paidDate} onChange={(e) => setPaidDate(e.target.value)} />
        <TextField label="Reference (UPI ref / cash)" maxLength={200} value={reference} onChange={(e) => setReference(e.target.value)} />
        <TextField label="Notes" maxLength={500} value={notes} onChange={(e) => setNotes(e.target.value)} />
        <FormError message={error} />
      </div>
    </Modal>
  );
}
