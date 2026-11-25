import { familyOf, personIdOf, peopleOf } from '../domain/people';
import { useMemo, useState } from 'react';
import { ArrowRight, CheckCircle2, Scale, Trash2, AlertTriangle, Users, Copy, Hourglass, IndianRupee, Send } from 'lucide-react';
import { Link } from 'react-router-dom';
import { upiPayUrl } from '../domain/upi';
import type { Member } from '../domain/types';
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
import { computeSettlement, familyBalances, type Transfer } from '../domain/settlement';
import { formatINR, paiseToInput, rupeesToPaise } from '../domain/money';
import { confirmPayment, deleteSettlement, recordSettlement, reportPayment, updateSettlement } from '../services/expenses';
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
  const [paying, setPaying] = useState<Transfer | null>(null);

  const memberUids = useMemo(() => peopleOf(members).map((m) => m.uid), [members]);
  const myId = personIdOf(me);
  const summary = useMemo(() => computeSettlement(expenses.data, settlements.data, memberUids), [expenses.data, settlements.data, memberUids]);
  const mine = summary.balances.find((b) => b.uid === myId);
  const families = useMemo(() => {
    const byId = new Map(members.map((m) => [m.uid, familyOf(m)]));
    return familyBalances(summary.balances, (uid) => byId.get(uid) ?? '');
  }, [summary.balances, members]);

  if (expenses.loading || settlements.loading) return <Spinner />;

  const myFamily = me ? familyOf(members.find((m) => m.uid === myId) ?? me) : '';
  const canPayFor = (uid: string) => uid === myId || (!!myFamily && familyOf(members.find((m) => m.uid === uid) ?? ({ relationship: '' } as Member)) === myFamily);
  const reportedFor = (t: Transfer) => settlements.data.find((s) => s.status === 'reported' && s.fromUid === t.fromUid && s.toUid === t.toUid);
  const myUpi = upiOf(myId, members);
  const owedToMe = (mine?.outstanding ?? 0) > 0;

  const confirmReceived = async (s: Settlement) => {
    try {
      await confirmPayment(s, todayIST());
      toast.success('Payment confirmed');
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

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

      {owedToMe && !myUpi && (
        <Notice tone="info">
          <IndianRupee className="mr-1 inline size-4" /> Add your UPI ID so people can pay you in one tap. <Link to="/profile" className="font-semibold text-brand-700 underline">Add it in Profile → Edit</Link>
        </Notice>
      )}

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
                    {(() => {
                      const reported = reportedFor(t);
                      if (reported) return <Badge tone="amber"><Hourglass className="mr-1 inline size-3.5" />Paid – waiting for confirmation</Badge>;
                      return (
                        <span className="flex flex-wrap gap-2">
                          {canPayFor(t.fromUid) && <Button size="sm" icon={<Send className="size-4" />} onClick={() => setPaying(t)}>Pay</Button>}
                          {admin && <Button size="sm" variant="success" onClick={() => setRecording(t)}>Mark as paid</Button>}
                        </span>
                      );
                    })()}
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

      {families.length > 1 && (
        <Card>
          <CardHeader icon={<Users className="size-5" />} title="By family" subtitle="Each family's members added together." />
          <ul className="divide-y divide-slate-100 tabular-nums">
            {families.map((f) => (
              <li key={f.family || '__none'} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3 sm:px-5">
                <div className="min-w-0">
                  <p className="font-semibold">{f.family || 'No family'} <span className="text-sm font-normal text-slate-500">({f.uids.length})</span></p>
                  <p className="text-sm text-slate-600">Paid {formatINR(f.paid)} · Share {formatINR(f.share)}</p>
                </div>
                <div className="font-semibold">
                  {f.outstanding === 0 ? <Badge tone="green">Settled</Badge> : f.outstanding > 0 ? <span className="text-emerald-700">Receive {formatINR(f.outstanding)}</span> : <span className="text-red-700">Pay {formatINR(-f.outstanding)}</span>}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

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
                      {s.status === 'paid' ? `Paid ${formatDate(s.paidDate)}` : s.status === 'reported' ? `Sent ${formatDate(s.paidDate)}, not confirmed yet` : 'Not yet paid'}
                      {s.reference && ` · Ref: ${s.reference}`}
                      {s.notes && ` · ${s.notes}`}
                    </span>
                  </span>
                  <span className="font-bold tabular-nums">{formatINR(s.amountPaise)}</span>
                  <Badge tone={s.status === 'paid' ? 'green' : 'amber'}>{s.status === 'reported' ? 'waiting for confirmation' : s.status}</Badge>
                  {admin && s.status === 'open' && <Button size="sm" variant="secondary" onClick={() => markOpenPaid(s)}>Mark paid</Button>}
                  {s.status === 'reported' && (admin || s.toUid === myId) && <Button size="sm" variant="success" icon={<CheckCircle2 className="size-4" />} onClick={() => confirmReceived(s)}>Confirm received</Button>}
                  {!admin && s.status === 'reported' && s.createdBy === me?.uid && <Button size="sm" variant="ghost" className="text-red-700" onClick={() => remove(s)}>Cancel</Button>}
                  {admin && <Button size="sm" variant="ghost" className="text-red-700" aria-label="Delete settlement" icon={<Trash2 className="size-4" />} onClick={() => remove(s)} />}
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      {recording && <RecordSettlement transfer={recording} onClose={() => setRecording(null)} />}
      {paying && <PayModal transfer={paying} onClose={() => setPaying(null)} />}
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

/** UPI ID of a traveller: their own, or the one on the sign-in account linked to them. */
function upiOf(personId: string, members: Member[]): string {
  const p = members.find((m) => m.uid === personId);
  return p?.upiId || members.find((m) => m.personId === personId)?.upiId || '';
}

/** Sign-in accounts that act as this traveller (to notify them). */
function accountsOf(personId: string, members: Member[]): string[] {
  return members.filter((m) => m.status === 'approved' && m.hasLogin !== false && (m.uid === personId || m.personId === personId)).map((m) => m.uid);
}

function PayModal({ transfer, onClose }: { transfer: Transfer; onClose: () => void }) {
  const me = useSession((s) => s.member)!;
  const trip = useSession((s) => s.trip);
  const members = useSession((s) => s.members);
  const to = memberName(members, transfer.toUid);
  const upi = upiOf(transfer.toUid, members);
  const [amount, setAmount] = useState(paiseToInput(transfer.amountPaise));
  const [reference, setReference] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const paise = rupeesToPaise(amount) ?? 0;
  const payUrl = upi && paise > 0 ? upiPayUrl({ upiId: upi, name: to, amountPaise: paise, note: `${trip?.name ?? 'Trip'} settlement` }) : '';

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(upi);
      toast.success('UPI ID copied');
    } catch {
      toast.error('Could not copy');
    }
  };
  const report = async () => {
    if (!paise || paise <= 0) return setError('Enter a valid amount.');
    setBusy(true);
    setError(null);
    try {
      await reportPayment({ fromUid: transfer.fromUid, toUid: transfer.toUid, amountPaise: paise, reference: reference.trim(), notes: `Reported by ${me.displayName}`.slice(0, 500), paidDate: todayIST() }, me.uid, accountsOf(transfer.toUid, members));
      toast.success(`Thanks! ${to} will confirm it.`);
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={`Pay ${to}`} footer={<><Button variant="secondary" onClick={onClose}>Close</Button><Button variant="success" loading={busy} icon={<CheckCircle2 className="size-5" />} onClick={report}>I’ve paid</Button></>}>
      <div className="space-y-4">
        <p className="text-lg">
          {transfer.fromUid !== personIdOf(me) ? <><b>{memberName(members, transfer.fromUid)}</b> pays</> : 'You pay'} <b>{to}</b>
        </p>
        <TextField label="Amount (₹)" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
        {upi ? (
          <div className="space-y-2 rounded-2xl bg-brand-50 p-4">
            <p className="text-sm text-slate-600">UPI ID</p>
            <p className="flex items-center gap-2 font-mono text-lg font-semibold break-all">{upi}
              <button type="button" onClick={copy} className="rounded-lg p-1.5 text-brand-700 hover:bg-white" aria-label="Copy UPI ID"><Copy className="size-4" /></button>
            </p>
            <a href={payUrl} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-brand-700 px-4 py-3 text-lg font-bold text-white hover:bg-brand-800">
              <IndianRupee className="size-5" /> Pay {paise > 0 ? formatINR(paise) : ''} with UPI
            </a>
            <p className="text-xs text-slate-500">Opens GPay, PhonePe, Paytm or BHIM on your phone with the amount filled in. Come back and tap “I’ve paid”.</p>
          </div>
        ) : (
          <Notice tone="warn">{to} hasn’t added a UPI ID yet. Pay by cash or ask for their UPI ID, then tap “I’ve paid”.</Notice>
        )}
        <TextField label="UPI reference (optional)" maxLength={200} value={reference} onChange={(e) => setReference(e.target.value)} placeholder="12-digit UTR from your UPI app" />
        <p className="text-sm text-slate-500">It counts in the balances once {to} or the trip admin confirms it.</p>
        <FormError message={error} />
      </div>
    </Modal>
  );
}
