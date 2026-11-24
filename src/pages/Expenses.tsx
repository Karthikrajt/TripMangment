import { personIdOf } from '../domain/people';
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Plus, Receipt, Check, X, Pencil, Trash2, CloudUpload, AlertTriangle, RotateCcw } from 'lucide-react';
import { useExpenses } from '../hooks/data';
import { useIsAdmin, useSession, memberName } from '../store/session';
import { PageHeader } from '../components/ui/PageHeader';
import { ButtonLink, Button } from '../components/ui/Button';
import { Card, Stat } from '../components/ui/Card';
import { Badge, EmptyState, ErrorState, Spinner } from '../components/ui/Feedback';
import { Modal } from '../components/ui/Modal';
import { SelectField, TextArea } from '../components/ui/Field';
import { FileActions } from '../components/Files';
import { confirm } from '../components/ui/Confirm';
import { toast } from '../components/ui/Toast';
import { formatINR, sumPaise } from '../domain/money';
import { isSplitConsistent, SPLIT_METHOD_LABELS } from '../domain/split';
import { canEditExpense } from '../domain/permissions';
import { deleteExpense, reviewExpense } from '../services/expenses';
import { formatDate, formatDateTime } from '../lib/format';
import { errorMessage } from '../lib/retry';
import { EXPENSE_CATEGORIES, type Expense, type ExpenseStatus } from '../domain/types';
import { useSync } from '../lib/sync';

type Tab = 'all' | 'mine' | 'review';
const statusTone: Record<ExpenseStatus, 'amber' | 'green' | 'red'> = { pending: 'amber', approved: 'green', rejected: 'red' };

export default function Expenses() {
  const { data, loading, error } = useExpenses();
  const me = useSession((s) => s.member);
  const members = useSession((s) => s.members);
  const admin = useIsAdmin();
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as Tab) || 'all';
  const [category, setCategory] = useState('');
  const [status, setStatus] = useState<'' | ExpenseStatus>('');
  const [detail, setDetail] = useState<Expense | null>(null);
  const syncing = useSync((s) => s.pendingWrites.expenses);

  const approved = data.filter((e) => e.status === 'approved');
  const total = sumPaise(approved.map((e) => e.amountPaise));
  const myPaid = sumPaise(approved.filter((e) => e.paidBy === personIdOf(me)).map((e) => e.amountPaise));
  const myShare = sumPaise(approved.map((e) => e.splits[personIdOf(me)] ?? 0));
  const pendingCount = data.filter((e) => e.status === 'pending').length;

  const shown = useMemo(
    () =>
      data.filter((e) => {
        if (tab === 'mine' && e.createdBy !== me?.uid && e.paidBy !== personIdOf(me) && !(personIdOf(me) in e.splits)) return false;
        if (tab === 'review' && e.status !== 'pending') return false;
        if (category && e.category !== category) return false;
        if (status && tab !== 'review' && e.status !== status) return false;
        return true;
      }),
    [data, tab, me, category, status],
  );

  const tabs: [Tab, string][] = [['all', 'All expenses'], ['mine', 'Mine']];
  if (admin) tabs.push(['review', `Verify (${pendingCount})`]);

  return (
    <div>
      <PageHeader
        title={tab === 'review' ? 'Expense Verification' : admin ? 'Expense Management' : 'Expenses'}
        subtitle="Only approved expenses count towards totals and settlement."
        syncKey="expenses"
        actions={<ButtonLink to="/expenses/new" icon={<Plus className="size-5" />}>Add expense</ButtonLink>}
      />
      {syncing && <div className="mb-4 flex items-center gap-2 rounded-xl bg-sky-50 px-4 py-2 text-sm text-sky-900"><CloudUpload className="size-4" /> Some expenses are saved on this phone and will sync automatically when you are online.</div>}

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Total approved" value={formatINR(total)} />
        <Stat label="You paid" value={formatINR(myPaid)} />
        <Stat label="Your share" value={formatINR(myShare)} />
        <Stat label="Your balance" value={<span className={myPaid - myShare >= 0 ? 'text-emerald-700' : 'text-red-700'}>{myPaid - myShare >= 0 ? '+' : '−'}{formatINR(Math.abs(myPaid - myShare))}</span>} hint={<Link to="/settlements" className="font-semibold text-brand-700">See settlement</Link>} />
      </div>

      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-end">
        <div className="flex rounded-xl bg-slate-100 p-1" role="tablist">
          {tabs.map(([k, label]) => (
            <button key={k} role="tab" aria-selected={tab === k} onClick={() => setParams(k === 'all' ? {} : { tab: k })} className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold md:flex-none ${tab === k ? 'bg-white text-brand-800 shadow-sm' : 'text-slate-600'}`}>
              {label}
            </button>
          ))}
        </div>
        <div className="grid flex-1 grid-cols-2 gap-3 md:max-w-md">
          <SelectField label="Category" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">All categories</option>
            {EXPENSE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
          </SelectField>
          {tab !== 'review' && (
            <SelectField label="Status" value={status} onChange={(e) => setStatus(e.target.value as ExpenseStatus | '')}>
              <option value="">Any status</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
            </SelectField>
          )}
        </div>
      </div>

      {loading ? <Spinner /> : error ? <ErrorState message={error} /> : shown.length === 0 ? (
        <EmptyState icon={<Receipt className="size-7" />} title={tab === 'review' ? 'Nothing to verify' : 'No expenses yet'} message={tab === 'review' ? 'All submitted expenses have been reviewed.' : 'Add an expense whenever you pay for something for the group.'} />
      ) : (
        <Card>
          <ul className="divide-y divide-slate-100">
            {shown.map((e) => {
              const consistent = isSplitConsistent(e.amountPaise, e.splits);
              return (
                <li key={e.id}>
                  <button onClick={() => setDetail(e)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50">
                    <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-700"><Receipt className="size-5" /></span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-slate-900">{e.title}</span>
                        <Badge tone={statusTone[e.status]}>{e.status}</Badge>
                        {!consistent && <Badge tone="red"><AlertTriangle className="size-3" /> split mismatch</Badge>}
                        {!e.createdAt && <Badge tone="sky">syncing</Badge>}
                      </span>
                      <span className="block truncate text-sm text-slate-600">{e.category} · {formatDate(e.expenseDate)} · paid by {memberName(members, e.paidBy)} · {Object.keys(e.splits).length} sharing</span>
                    </span>
                    <span className="text-right font-bold tabular-nums text-slate-900">{formatINR(e.amountPaise)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
      {detail && <ExpenseDetail expense={data.find((x) => x.id === detail.id) ?? detail} onClose={() => setDetail(null)} />}
    </div>
  );
}

function ExpenseDetail({ expense: e, onClose }: { expense: Expense; onClose: () => void }) {
  const me = useSession((s) => s.member);
  const members = useSession((s) => s.members);
  const admin = useIsAdmin();
  const [note, setNote] = useState(e.reviewNote);
  const [busy, setBusy] = useState<string | null>(null);
  const consistent = isSplitConsistent(e.amountPaise, e.splits);
  const editable = canEditExpense(me, e);

  const review = async (status: ExpenseStatus) => {
    setBusy(status);
    try {
      await reviewExpense(e, status, me!.uid, note);
      toast.success(`Expense ${status === 'pending' ? 'moved back to pending' : status}`);
      onClose();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };
  const remove = async () => {
    if (!(await confirm({ title: 'Delete expense?', message: `“${e.title}” (${formatINR(e.amountPaise)}) will be deleted.`, danger: true, confirmLabel: 'Delete' }))) return;
    try {
      await deleteExpense(e);
      toast.success('Expense deleted');
      onClose();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <Modal open onClose={onClose} title={e.title}
      footer={
        <>
          {editable && <Button variant="ghost" className="text-red-700" icon={<Trash2 className="size-4" />} onClick={remove}>Delete</Button>}
          {editable && <ButtonLink variant="secondary" to={`/expenses/${e.id}/edit`} icon={<Pencil className="size-4" />}>Edit</ButtonLink>}
          {admin && e.status !== 'pending' && <Button variant="secondary" icon={<RotateCcw className="size-4" />} loading={busy === 'pending'} onClick={() => review('pending')}>Reopen</Button>}
          {admin && e.status !== 'rejected' && <Button variant="danger" icon={<X className="size-4" />} loading={busy === 'rejected'} onClick={() => review('rejected')}>Reject</Button>}
          {admin && e.status !== 'approved' && <Button variant="success" icon={<Check className="size-4" />} loading={busy === 'approved'} disabled={!consistent} onClick={() => review('approved')}>Approve</Button>}
        </>
      }>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-3xl font-bold tabular-nums">{formatINR(e.amountPaise)}</p>
          <Badge tone={statusTone[e.status]}>{e.status}</Badge>
        </div>
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div><dt className="text-slate-500">Category</dt><dd className="font-semibold">{e.category}</dd></div>
          <div><dt className="text-slate-500">Date</dt><dd className="font-semibold">{formatDate(e.expenseDate)}</dd></div>
          <div><dt className="text-slate-500">Paid by</dt><dd className="font-semibold">{memberName(members, e.paidBy)}</dd></div>
          <div><dt className="text-slate-500">Submitted by</dt><dd className="font-semibold">{memberName(members, e.createdBy)}</dd></div>
          <div className="col-span-2"><dt className="text-slate-500">Split</dt><dd className="font-semibold">{SPLIT_METHOD_LABELS[e.splitMethod]}</dd></div>
        </dl>
        {e.description && <p className="whitespace-pre-line text-slate-700">{e.description}</p>}
        {!consistent && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-800">The split amounts don't add up to the total, so this expense can't be approved until it is corrected.</p>}
        <div>
          <p className="mb-1 text-sm font-medium text-slate-600">Shares</p>
          <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
            {Object.entries(e.splits).sort((a, b) => b[1] - a[1]).map(([uid, amt]) => (
              <li key={uid} className="flex justify-between px-3 py-2"><span>{memberName(members, uid)}</span><span className="tabular-nums font-semibold">{formatINR(amt)}</span></li>
            ))}
          </ul>
        </div>
        {e.receiptPath && <div><p className="mb-1 text-sm font-medium text-slate-600">Receipt</p><FileActions path={e.receiptPath} fileName={e.receiptName} /></div>}
        {e.reviewedBy && <p className="text-sm text-slate-500">Reviewed by {memberName(members, e.reviewedBy)} · {formatDateTime(e.reviewedAt)}{e.reviewNote && ` – “${e.reviewNote}”`}</p>}
        {admin && <TextArea label="Review note (optional, shared with submitter)" value={note} maxLength={500} onChange={(ev) => setNote(ev.target.value)} />}
      </div>
    </Modal>
  );
}
