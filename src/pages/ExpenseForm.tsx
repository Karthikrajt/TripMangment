import { useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { WifiOff } from 'lucide-react';
import { useExpenses } from '../hooks/data';
import { useApprovedMembers, useSession } from '../store/session';
import { PageHeader } from '../components/ui/PageHeader';
import { Button } from '../components/ui/Button';
import { Card, CardBody } from '../components/ui/Card';
import { ErrorState, Notice, Spinner } from '../components/ui/Feedback';
import { FormError, SelectField, TextArea, TextField } from '../components/ui/Field';
import { MemberPicker } from '../components/MemberPicker';
import { FileInput } from '../components/Files';
import { toast } from '../components/ui/Toast';
import { useForm } from '../hooks/useForm';
import { useOnline } from '../hooks/useOnline';
import { newId } from '../lib/ids';
import { todayIST } from '../lib/format';
import { errorMessage } from '../lib/retry';
import { uploadFile, deleteFile } from '../lib/files';
import { computeSplits, SPLIT_METHOD_LABELS } from '../domain/split';
import { formatINR, paiseToInput, rupeesToPaise, sumPaise } from '../domain/money';
import { canEditExpense } from '../domain/permissions';
import { isISODate } from '../domain/validation';
import { submitExpense, updateExpense } from '../services/expenses';
import { EXPENSE_CATEGORIES, type Expense, type ExpenseCategory, type SplitMethod } from '../domain/types';

export default function ExpenseFormPage() {
  const { id } = useParams();
  const { data, loading } = useExpenses();
  const me = useSession((s) => s.member);
  if (!id) return <ExpenseForm existing={null} />;
  if (loading) return <Spinner />;
  const e = data.find((x) => x.id === id);
  if (!e) return <ErrorState message="Expense not found." />;
  if (!canEditExpense(me, e)) return <ErrorState message="You can only edit your own pending expenses." />;
  return <ExpenseForm existing={e} />;
}

function ExpenseForm({ existing }: { existing: Expense | null }) {
  const nav = useNavigate();
  const online = useOnline();
  const me = useSession((s) => s.member)!;
  const members = useApprovedMembers();
  const allUids = useMemo(() => members.map((m) => m.uid), [members]);
  // Generated once per form so double-taps and offline retries map to the same document.
  const idempotencyKey = useRef(existing?.id ?? newId());

  const f = useForm({
    title: existing?.title ?? '',
    category: (existing?.category ?? 'Food') as ExpenseCategory,
    amount: existing ? paiseToInput(existing.amountPaise) : '',
    expenseDate: existing?.expenseDate ?? todayIST(),
    paidBy: existing?.paidBy ?? me.uid,
    description: existing?.description ?? '',
    splitMethod: (existing?.splitMethod ?? 'equal_all') as SplitMethod,
  });
  const [selected, setSelected] = useState<string[]>(existing ? Object.keys(existing.splits) : allUids);
  const [custom, setCustom] = useState<Record<string, string>>(
    existing?.splitMethod === 'custom' ? Object.fromEntries(Object.entries(existing.splits).map(([k, v]) => [k, paiseToInput(v)])) : {},
  );
  const [receipt, setReceipt] = useState<File | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const amount = rupeesToPaise(f.values.amount);
  const customPaise = Object.fromEntries(Object.entries(custom).map(([k, v]) => [k, rupeesToPaise(v || '0') ?? -1]));
  const preview = amount
    ? computeSplits({ method: f.values.splitMethod, amount, allMemberUids: allUids, selectedUids: selected, custom: customPaise })
    : null;
  const customTotal = sumPaise(selected.map((u) => Math.max(0, customPaise[u] ?? 0)));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const v = f.values;
    const errs: typeof f.errors = {};
    if (!v.title.trim()) errs.title = 'What was this for?';
    if (!amount || amount <= 0) errs.amount = 'Enter a valid amount (up to 2 decimals).';
    else if (amount > 1_000_000_000) errs.amount = 'Amount is too large.';
    if (!isISODate(v.expenseDate)) errs.expenseDate = 'Choose a date.';
    if (!v.paidBy) errs.paidBy = 'Who paid?';
    if (receipt && !online) errs._form = 'Receipts can only be attached when online. Remove the receipt to save offline, and attach it later.';
    if (!errs.amount && preview && !preview.ok) errs._form = preview.error;
    f.setErrors(errs);
    if (Object.values(errs).some(Boolean) || !preview?.ok || !amount) return;

    let uploaded = null;
    try {
      if (receipt) uploaded = await uploadFile('receipt', receipt, setBusy);
      setBusy('Saving…');
      const input = {
        title: v.title.trim(),
        category: v.category,
        amountPaise: amount,
        expenseDate: v.expenseDate,
        paidBy: v.paidBy,
        description: v.description.trim(),
        receiptPath: uploaded?.path ?? existing?.receiptPath ?? '',
        receiptName: uploaded?.fileName ?? existing?.receiptName ?? '',
        splitMethod: v.splitMethod,
        splits: preview.splits,
      };
      if (existing) {
        await updateExpense(existing, input);
        toast.success('Expense updated');
      } else {
        const committed = submitExpense(idempotencyKey.current, input, { uid: me.uid, name: me.displayName });
        if (navigator.onLine) {
          await committed;
          toast.success('Expense submitted for admin approval');
        } else {
          committed.catch((err) => toast.error(`An offline expense failed to sync: ${errorMessage(err)}`));
          toast.info('Saved on this device. It will be submitted automatically when you are back online.');
        }
      }
      nav('/expenses');
    } catch (err) {
      if (uploaded) await deleteFile(uploaded.path).catch(() => undefined);
      f.setErrors({ _form: errorMessage(err) });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title={existing ? 'Edit expense' : 'Add expense'} subtitle="The admin will verify it before it counts in the totals." />
      {!online && <div className="mb-4"><Notice tone="warn"><WifiOff className="mr-1 inline size-4" /> You are offline. The expense will be saved on this device and submitted when you reconnect.</Notice></div>}
      <Card>
        <CardBody>
          <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
            <TextField className="sm:col-span-2" label="Expense title" required maxLength={150} {...f.bind('title')} placeholder="Lunch at Annapoorna" />
            <TextField label="Amount (₹)" required inputMode="decimal" {...f.bind('amount')} placeholder="0.00" />
            <SelectField label="Category" {...f.bind('category')}>
              {EXPENSE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </SelectField>
            <TextField label="Expense date" type="date" required {...f.bind('expenseDate')} />
            <SelectField label="Paid by" required {...f.bind('paidBy')}>
              {members.map((m) => <option key={m.uid} value={m.uid}>{m.displayName}{m.uid === me.uid ? ' (me)' : ''}</option>)}
            </SelectField>
            <TextArea className="sm:col-span-2" label="Description" maxLength={1000} {...f.bind('description')} />

            <SelectField className="sm:col-span-2" label="How should this be split?" {...f.bind('splitMethod')}>
              {(Object.keys(SPLIT_METHOD_LABELS) as SplitMethod[]).map((k) => <option key={k} value={k}>{SPLIT_METHOD_LABELS[k]}</option>)}
            </SelectField>

            {(f.values.splitMethod === 'equal_selected' || f.values.splitMethod === 'custom') && (
              <div className="sm:col-span-2">
                <MemberPicker label="Members included" members={members} selected={selected} onChange={setSelected} />
              </div>
            )}

            {f.values.splitMethod === 'custom' && selected.length > 0 && (
              <div className="sm:col-span-2 space-y-2">
                <p className="text-sm font-medium text-slate-700">Amount per member</p>
                {selected.map((uid) => {
                  const m = members.find((x) => x.uid === uid);
                  return (
                    <div key={uid} className="flex items-center gap-3">
                      <span className="flex-1">{m?.displayName}</span>
                      <input inputMode="decimal" aria-label={`Amount for ${m?.displayName}`} className="w-36 rounded-xl border border-slate-300 px-3 py-2 text-right" value={custom[uid] ?? ''} onChange={(e) => setCustom({ ...custom, [uid]: e.target.value })} placeholder="0.00" />
                    </div>
                  );
                })}
                <p className={`text-right text-sm font-semibold ${amount && customTotal === amount ? 'text-emerald-700' : 'text-amber-700'}`}>
                  Allocated {formatINR(customTotal)} of {formatINR(amount ?? 0)}
                  {amount && customTotal !== amount ? ` · ${customTotal < amount ? 'remaining' : 'over by'} ${formatINR(Math.abs(amount - customTotal))}` : ''}
                </p>
              </div>
            )}

            {preview?.ok && f.values.splitMethod !== 'custom' && (
              <div className="sm:col-span-2 rounded-xl bg-slate-50 p-3 text-sm text-slate-700">
                Split among {Object.keys(preview.splits).length} member(s): about {formatINR(Math.round(amount! / Object.keys(preview.splits).length))} each.
              </div>
            )}

            <div className="sm:col-span-2">
              <FileInput kind="receipt" file={receipt} onChange={setReceipt} label="Receipt (optional)" existingName={existing?.receiptName || undefined} />
            </div>
            <div className="sm:col-span-2"><FormError message={f.errors._form} /></div>
            <div className="sm:col-span-2 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => nav(-1)} disabled={!!busy}>Cancel</Button>
              <Button type="submit" loading={!!busy}>{busy ?? (existing ? 'Save changes' : 'Submit expense')}</Button>
            </div>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}
