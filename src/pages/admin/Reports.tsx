import { peopleOf, headCount } from '../../domain/people';
import { useMemo, useState } from 'react';
import { BarChart3, Download, Printer, Gauge, RefreshCw } from 'lucide-react';
import { collection, getCountFromServer } from 'firebase/firestore';
import { useExpenses, useSettlements } from '../../hooks/data';
import { useSession, memberName, useShareDefaults } from '../../store/session';
import { PageHeader } from '../../components/ui/PageHeader';
import { Button } from '../../components/ui/Button';
import { Card, CardBody, CardHeader, Stat } from '../../components/ui/Card';
import { Notice, Spinner } from '../../components/ui/Feedback';
import { computeSettlement } from '../../domain/settlement';
import { formatINR, sumPaise } from '../../domain/money';
import { EXPENSE_CATEGORIES } from '../../domain/types';
import { SPLIT_METHOD_LABELS } from '../../domain/split';
import { downloadCsv } from '../../lib/csv';
import { formatBytes, formatDate, todayIST } from '../../lib/format';
import { db, tripPath } from '../../lib/firebase';
import { getStorageUsage, filesConfigured } from '../../lib/files';
import { errorMessage } from '../../lib/retry';
import { FREE_TIER } from '../../config/constants';

export default function Reports() {
  const expenses = useExpenses();
  const settlements = useSettlements();
  const { members, trip } = useSession();
  const approvedUids = useMemo(() => peopleOf(members).map((m) => m.uid), [members]);
  const heads = headCount(peopleOf(members), useShareDefaults());
  const approved = expenses.data.filter((e) => e.status === 'approved');
  const total = sumPaise(approved.map((e) => e.amountPaise));
  const summary = useMemo(() => computeSettlement(expenses.data, settlements.data, approvedUids), [expenses.data, settlements.data, approvedUids]);

  const byCategory = EXPENSE_CATEGORIES.map((c) => ({ c, amt: sumPaise(approved.filter((e) => e.category === c).map((e) => e.amountPaise)) })).filter((x) => x.amt > 0).sort((a, b) => b.amt - a.amt);
  const byDate = Object.entries(approved.reduce<Record<string, number>>((m, e) => ({ ...m, [e.expenseDate]: (m[e.expenseDate] ?? 0) + e.amountPaise }), {})).sort();
  const max = Math.max(1, ...byCategory.map((x) => x.amt));

  if (expenses.loading) return <Spinner />;

  const exportExpenses = () =>
    downloadCsv(`trip-expenses-${todayIST()}.csv`, [
      ['Date', 'Title', 'Category', 'Amount (INR)', 'Paid by', 'Split method', 'Shared by', 'Status', 'Submitted by', 'Description'],
      ...expenses.data.map((e) => [formatDate(e.expenseDate), e.title, e.category, (e.amountPaise / 100).toFixed(2), memberName(members, e.paidBy), SPLIT_METHOD_LABELS[e.splitMethod], Object.entries(e.splits).map(([u, a]) => `${memberName(members, u)}: ${(a / 100).toFixed(2)}`).join('; '), e.status, memberName(members, e.createdBy), e.description]),
    ]);
  const exportSettlement = () =>
    downloadCsv(`trip-settlement-${todayIST()}.csv`, [
      ['Member', 'Paid (INR)', 'Share (INR)', 'Net (INR)', 'Settled out', 'Settled in', 'Outstanding (INR)'],
      ...summary.balances.map((b) => [memberName(members, b.uid), (b.paid / 100).toFixed(2), (b.share / 100).toFixed(2), (b.net / 100).toFixed(2), (b.settledOut / 100).toFixed(2), (b.settledIn / 100).toFixed(2), (b.outstanding / 100).toFixed(2)]),
      [],
      ['Suggested transfers'],
      ['From', 'To', 'Amount (INR)'],
      ...summary.suggestions.map((t) => [memberName(members, t.fromUid), memberName(members, t.toUid), (t.amountPaise / 100).toFixed(2)]),
    ]);

  return (
    <div className="space-y-6">
      <PageHeader title="Trip Reports" subtitle={`${trip?.name ?? ''} · expense summary (approved only)`}
        actions={<div className="flex flex-wrap gap-2 print:hidden">
          <Button variant="secondary" icon={<Download className="size-4" />} onClick={exportExpenses}>Expenses CSV</Button>
          <Button variant="secondary" icon={<Download className="size-4" />} onClick={exportSettlement}>Settlement CSV</Button>
          <Button variant="secondary" icon={<Printer className="size-4" />} onClick={() => window.print()}>Print</Button>
        </div>} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Total approved" value={formatINR(total)} />
        <Stat label="Per head (adult)" value={formatINR(heads ? Math.round(total / heads) : 0)} hint={`${heads} full shares`} />
        <Stat label="Approved / pending / rejected" value={`${approved.length} / ${expenses.data.filter((e) => e.status === 'pending').length} / ${expenses.data.filter((e) => e.status === 'rejected').length}`} />
        <Stat label="Transfers to settle" value={summary.suggestions.length} />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader icon={<BarChart3 className="size-5" />} title="By category" />
          <CardBody>
            {byCategory.length === 0 ? <p className="text-slate-500">No approved expenses yet.</p> : (
              <ul className="space-y-3">
                {byCategory.map(({ c, amt }) => (
                  <li key={c}>
                    <div className="flex justify-between text-sm"><span className="font-medium">{c}</span><span className="tabular-nums">{formatINR(amt)} · {Math.round((amt / total) * 100)}%</span></div>
                    <div className="mt-1 h-3 rounded-full bg-slate-100"><div className="h-3 rounded-full bg-brand-600" style={{ width: `${(amt / max) * 100}%` }} /></div>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="By day" />
          <CardBody>
            {byDate.length === 0 ? <p className="text-slate-500">No data.</p> : (
              <table className="w-full text-left tabular-nums">
                <tbody className="divide-y divide-slate-100">
                  {byDate.map(([d, amt]) => <tr key={d}><td className="py-2">{formatDate(d)}</td><td className="py-2 text-right font-semibold">{formatINR(amt)}</td></tr>)}
                </tbody>
              </table>
            )}
          </CardBody>
        </Card>
      </div>
      <Card>
        <CardHeader title="Member contributions" />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-left tabular-nums">
            <thead className="border-b border-slate-200 text-sm text-slate-500"><tr><th className="px-4 py-2">Member</th><th className="px-4 py-2 text-right">Paid</th><th className="px-4 py-2 text-right">Share</th><th className="px-4 py-2 text-right">Outstanding</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {summary.balances.map((b) => (
                <tr key={b.uid}><td className="px-4 py-2">{memberName(members, b.uid)}</td><td className="px-4 py-2 text-right">{formatINR(b.paid)}</td><td className="px-4 py-2 text-right">{formatINR(b.share)}</td>
                  <td className={`px-4 py-2 text-right font-semibold ${b.outstanding >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>{b.outstanding >= 0 ? '+' : '−'}{formatINR(Math.abs(b.outstanding))}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <QuotaPanel />
    </div>
  );
}

const COLLECTIONS = ['members', 'itinerary', 'tickets', 'accommodations', 'rooms', 'transport', 'expenses', 'settlements', 'messages', 'announcements', 'notifications', 'auditLogs'];

function Meter({ label, used, limit, unit }: { label: string; used: number; limit: number; unit: 'bytes' | 'count' }) {
  const pct = Math.min(100, (used / limit) * 100);
  const tone = pct >= 80 ? 'bg-red-600' : pct >= 50 ? 'bg-amber-500' : 'bg-emerald-600';
  const fmt = (n: number) => (unit === 'bytes' ? formatBytes(n) : n.toLocaleString('en-IN'));
  return (
    <div>
      <div className="flex justify-between text-sm"><span className="font-medium">{label}</span><span>{fmt(used)} / {fmt(limit)} ({pct.toFixed(1)}%)</span></div>
      <div className="mt-1 h-2.5 rounded-full bg-slate-100"><div className={`h-2.5 rounded-full ${tone}`} style={{ width: `${Math.max(pct, 1)}%` }} /></div>
      {pct >= 80 && <p className="mt-1 text-sm text-red-700">Approaching the free-tier limit. Clean up old files/messages or review your plan before enabling billing.</p>}
    </div>
  );
}

function QuotaPanel() {
  const [counts, setCounts] = useState<Record<string, number> | null>(null);
  const [storage, setStorage] = useState<{ totalBytes: number; files: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setBusy(true);
    setError(null);
    try {
      const entries = await Promise.all(COLLECTIONS.map(async (c) => [c, (await getCountFromServer(collection(db, tripPath(c)))).data().count] as const));
      setCounts(Object.fromEntries(entries));
      if (filesConfigured) setStorage(await getStorageUsage());
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const docs = counts ? Object.values(counts).reduce((a, b) => a + b, 0) : 0;
  return (
    <Card className="print:hidden">
      <CardHeader icon={<Gauge className="size-5" />} title="Free-tier usage & quota" subtitle="Approximate. Check the Firebase and Supabase consoles for authoritative numbers."
        action={<Button size="sm" variant="secondary" icon={<RefreshCw className="size-4" />} loading={busy} onClick={load}>{counts ? 'Refresh' : 'Check usage'}</Button>} />
      <CardBody className="space-y-4">
        {error && <Notice tone="warn">{error}</Notice>}
        {!counts ? <p className="text-slate-500">Checking usage costs about one read per collection. Tap “Check usage”.</p> : (
          <>
            {storage && <Meter label={`Supabase storage (${storage.files} files)`} used={storage.totalBytes} limit={FREE_TIER.supabaseStorageBytes} unit="bytes" />}
            <Meter label="Firestore storage (estimated at ~2 KB/doc)" used={docs * 2048} limit={FREE_TIER.firestoreStorageBytes} unit="bytes" />
            <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
              {Object.entries(counts).map(([c, n]) => <div key={c} className="rounded-lg bg-slate-50 px-3 py-2"><p className="text-slate-500">{c}</p><p className="font-semibold">{n.toLocaleString('en-IN')}</p></div>)}
            </div>
            <Notice>
              Daily Firestore limits on the free plan are about {FREE_TIER.firestoreReadsPerDay.toLocaleString('en-IN')} reads and {FREE_TIER.firestoreWritesPerDay.toLocaleString('en-IN')} writes. Each open screen listens only to the data it shows; the chat keeps the latest 50 messages. Set a budget alert in Google Cloud and keep Firebase on the Spark plan to guarantee ₹0.
            </Notice>
          </>
        )}
      </CardBody>
    </Card>
  );
}
