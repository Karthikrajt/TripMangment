import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Contact, ExternalLink, Hotel, Mail, MessageCircle, Pencil, Phone, Plus, Search, Star, Trash2 } from 'lucide-react';
import { useVendors } from '../hooks/data';
import { useIsAdmin, useSession } from '../store/session';
import { PageHeader } from '../components/ui/PageHeader';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Badge, EmptyState, ErrorState, Spinner } from '../components/ui/Feedback';
import { Modal } from '../components/ui/Modal';
import { FormError, SelectField, TextArea, TextField } from '../components/ui/Field';
import { MapButton } from '../components/Links';
import { confirm } from '../components/ui/Confirm';
import { toast } from '../components/ui/Toast';
import { useForm } from '../hooks/useForm';
import { CATEGORY_LABELS, countByStatus, filterVendors, STATUS_LABELS, STAY_CATEGORIES, validateVendor, whatsappLink, type VendorFilter } from '../domain/vendors';
import { formatINR, paiseToInput, rupeesToPaise } from '../domain/money';
import { VENDOR_CATEGORIES, VENDOR_STATUSES, type Vendor, type VendorStatus } from '../domain/types';
import { deleteVendor, saveVendor, setVendorStatus } from '../services/vendors';
import { telHref, timeAgo } from '../lib/format';
import { errorMessage } from '../lib/retry';

const statusTone: Record<VendorStatus, 'green' | 'amber' | 'sky' | 'slate' | 'red' | 'brand'> = {
  booked: 'green',
  quoted: 'amber',
  enquired: 'sky',
  shortlisted: 'brand',
  rejected: 'slate',
};

export default function Vendors() {
  const { data, loading, error } = useVendors();
  const me = useSession((s) => s.member);
  const admin = useIsAdmin();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<VendorFilter>({ q: '', category: '', status: '' });
  const [editing, setEditing] = useState<Vendor | 'new' | null>(null);
  const shown = useMemo(() => filterVendors(data, filter), [data, filter]);
  const counts = useMemo(() => countByStatus(data), [data]);
  const canEdit = (v: Vendor) => admin || v.createdBy === me?.uid;

  const changeStatus = async (v: Vendor, status: VendorStatus) => {
    try {
      await setVendorStatus(v, status);
      toast.success(`${v.name}: ${STATUS_LABELS[status]}`);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };
  const remove = async (v: Vendor) => {
    if (!(await confirm({ title: 'Delete this record?', message: `“${v.name}” and its notes will be deleted for everyone.`, danger: true, confirmLabel: 'Delete' }))) return;
    try {
      await deleteVendor(v);
      toast.success('Deleted');
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };
  const toAccommodation = (v: Vendor) =>
    navigate('/accommodation', {
      state: { prefill: { name: v.name, address: v.location, contactNumber: v.phone, mapsUrl: v.mapsUrl, instructions: [v.quoteNote, v.notes].filter(Boolean).join('\n') } },
    });

  return (
    <div>
      <PageHeader
        title="Hotels & Travel"
        subtitle="Every hotel, resort, travel agent and operator we looked at – contacts, quotes and status in one place."
        syncKey="vendors"
        actions={<Button icon={<Plus className="size-5" />} onClick={() => setEditing('new')}>Add record</Button>}
      />

      <div className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0" role="tablist" aria-label="Filter by status">
        {([['', `All (${data.length})`], ...VENDOR_STATUSES.map((s) => [s, `${STATUS_LABELS[s]} (${counts[s]})`])] as [string, string][]).map(([k, label]) => (
          <button
            key={k || 'all'}
            role="tab"
            aria-selected={filter.status === k}
            onClick={() => setFilter({ ...filter, status: k as VendorFilter['status'] })}
            className={`shrink-0 whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-semibold ${filter.status === k ? 'bg-brand-700 text-white' : 'bg-white text-slate-700 shadow-soft hover:text-brand-700'}`}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="mb-5 grid gap-3 sm:grid-cols-[1fr_220px]">
        <label className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-slate-400" />
          <input type="search" value={filter.q} onChange={(e) => setFilter({ ...filter, q: e.target.value })} placeholder="Search name, place, phone, notes…" aria-label="Search records" className="w-full rounded-2xl border border-slate-200 bg-white py-2.5 pl-10 pr-3" />
        </label>
        <select value={filter.category} onChange={(e) => setFilter({ ...filter, category: e.target.value as VendorFilter['category'] })} aria-label="Filter by type" className="rounded-2xl border border-slate-200 bg-white px-3.5 py-2.5">
          <option value="">All types</option>
          {VENDOR_CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
        </select>
      </div>

      {loading ? (
        <Spinner />
      ) : error ? (
        <ErrorState message={error} />
      ) : data.length === 0 ? (
        <EmptyState icon={<Contact className="size-7" />} title="No records yet" message="Add each hotel, resort or travel agent you contact, so everyone can see the quotes and who to call." action={<Button icon={<Plus className="size-5" />} onClick={() => setEditing('new')}>Add the first one</Button>} />
      ) : shown.length === 0 ? (
        <EmptyState title="Nothing matches" message="Try another search, type or status." action={<Button variant="secondary" onClick={() => setFilter({ q: '', category: '', status: '' })}>Clear filters</Button>} />
      ) : (
        <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {shown.map((v) => {
            const wa = whatsappLink(v.phone);
            return (
              <Card as="li" key={v.id} className={`flex flex-col p-4 ${v.status === 'rejected' ? 'opacity-70' : ''}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="truncate text-lg font-bold text-ink">{v.name}</h3>
                    <p className="text-sm text-slate-500">{CATEGORY_LABELS[v.category]}{v.location && ` · ${v.location}`}</p>
                  </div>
                  <Badge tone={statusTone[v.status]}>{STATUS_LABELS[v.status]}</Badge>
                </div>

                {(v.quotePaise > 0 || v.quoteNote) && (
                  <p className="mt-3 rounded-2xl bg-brand-50 px-3 py-2 text-sm">
                    {v.quotePaise > 0 && <b className="text-base text-brand-800 tabular-nums">{formatINR(v.quotePaise)}</b>}
                    {v.quoteNote && <span className="text-slate-700">{v.quotePaise > 0 ? ' · ' : ''}{v.quoteNote}</span>}
                  </p>
                )}
                {v.rating > 0 && (
                  <p className="mt-2 flex items-center gap-0.5" aria-label={`Rated ${v.rating} out of 5`}>
                    {[1, 2, 3, 4, 5].map((i) => <Star key={i} className={`size-4 ${i <= v.rating ? 'fill-amber-400 text-amber-400' : 'text-slate-300'}`} aria-hidden />)}
                  </p>
                )}
                <div className="mt-2 space-y-1 text-sm text-slate-700">
                  {v.contactPerson && <p>Contact: <b>{v.contactPerson}</b></p>}
                  {v.phone && <p className="flex items-center gap-1.5"><Phone className="size-3.5 text-slate-400" /> <span className="select-all">{v.phone}</span>{v.altPhone && <span className="text-slate-500"> · {v.altPhone}</span>}</p>}
                  {v.email && <p className="flex items-center gap-1.5 truncate"><Mail className="size-3.5 text-slate-400" /> <span className="select-all">{v.email}</span></p>}
                  {v.notes && <p className="whitespace-pre-line text-slate-600">📝 {v.notes}</p>}
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  {v.phone && (
                    <a href={telHref(v.phone)} className="inline-flex items-center gap-1.5 rounded-2xl bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700">
                      <Phone className="size-4" /> Call
                    </a>
                  )}
                  {wa && (
                    <a href={wa} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-2xl bg-[#25d366] px-3 py-2 text-sm font-semibold text-[#073b1c] hover:brightness-95">
                      <MessageCircle className="size-4" /> WhatsApp
                    </a>
                  )}
                  <MapButton url={v.mapsUrl} address={v.mapsUrl ? undefined : v.location} label="Map" />
                  {v.website && (
                    <a href={v.website} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:border-brand-300">
                      <ExternalLink className="size-4" /> Website
                    </a>
                  )}
                </div>

                <div className="flex-1" />
                <div className="mt-3.5 space-y-2 border-t border-slate-100 pt-3">
                  {canEdit(v) ? (
                    <div className="flex items-center gap-1">
                      <select
                        value={v.status}
                        onChange={(e) => changeStatus(v, e.target.value as VendorStatus)}
                        aria-label={`Status of ${v.name}`}
                        className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-sm font-semibold text-slate-700"
                      >
                        {VENDOR_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
                      </select>
                      <Button size="sm" variant="ghost" icon={<Pencil className="size-4" />} onClick={() => setEditing(v)}>Edit</Button>
                      <Button size="sm" variant="ghost" className="text-red-700" aria-label={`Delete ${v.name}`} icon={<Trash2 className="size-4" />} onClick={() => remove(v)} />
                    </div>
                  ) : null}
                  {admin && v.status === 'booked' && STAY_CATEGORIES.includes(v.category) && (
                    <Button size="sm" variant="secondary" className="w-full" icon={<Hotel className="size-4" />} onClick={() => toAccommodation(v)}>Add to Accommodation</Button>
                  )}
                  <p className="text-xs text-slate-400">Added by {v.createdByName} · {timeAgo(v.createdAt)}</p>
                </div>
              </Card>
            );
          })}
        </ul>
      )}
      {editing && <VendorForm vendor={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function VendorForm({ vendor, onClose }: { vendor: Vendor | null; onClose: () => void }) {
  const me = useSession((s) => s.member)!;
  const f = useForm({
    name: vendor?.name ?? '',
    category: vendor?.category ?? 'hotel',
    status: vendor?.status ?? 'enquired',
    contactPerson: vendor?.contactPerson ?? '',
    phone: vendor?.phone ?? '',
    altPhone: vendor?.altPhone ?? '',
    email: vendor?.email ?? '',
    website: vendor?.website ?? '',
    location: vendor?.location ?? '',
    mapsUrl: vendor?.mapsUrl ?? '',
    quote: vendor?.quotePaise ? paiseToInput(vendor.quotePaise) : '',
    quoteNote: vendor?.quoteNote ?? '',
    rating: String(vendor?.rating ?? 0),
    notes: vendor?.notes ?? '',
  });
  const [busy, setBusy] = useState(false);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const v = f.values;
    const quotePaise = v.quote.trim() ? rupeesToPaise(v.quote) : 0;
    if (quotePaise === null) return f.setErrors({ quote: 'Enter the amount in rupees, e.g. 4500 or 4500.50' });
    const input = {
      name: v.name, category: v.category, status: v.status, contactPerson: v.contactPerson, phone: v.phone, altPhone: v.altPhone,
      email: v.email, website: v.website, location: v.location, mapsUrl: v.mapsUrl, quotePaise, quoteNote: v.quoteNote, rating: Number(v.rating), notes: v.notes,
    };
    const errs = validateVendor(input);
    f.setErrors({ ...errs, quote: errs.quotePaise } as typeof f.errors);
    if (Object.values(errs).some(Boolean)) return;
    setBusy(true);
    try {
      await saveVendor(input, vendor, { uid: me.uid, name: me.displayName });
      toast.success(vendor ? 'Saved' : `${input.name} added`);
      onClose();
    } catch (err) {
      f.setErrors({ _form: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={vendor ? `Edit ${vendor.name}` : 'Add hotel / travel record'} wide
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" form="vendor-form" loading={busy}>Save</Button></>}>
      <form id="vendor-form" onSubmit={save} className="grid gap-4 sm:grid-cols-2">
        <TextField className="sm:col-span-2" label="Name" required maxLength={150} {...f.bind('name')} placeholder="e.g. Lakeview Resort" />
        <SelectField label="Type" {...f.bind('category')}>
          {VENDOR_CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
        </SelectField>
        <SelectField label="Status" {...f.bind('status')}>
          {VENDOR_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
        </SelectField>
        <TextField label="Quote (₹)" inputMode="decimal" {...f.bind('quote')} placeholder="0.00" hint="Leave empty if no quote yet" />
        <TextField label="What the quote covers" maxLength={300} {...f.bind('quoteNote')} placeholder="per night, 4 rooms, breakfast" />
        <TextField label="Contact person" maxLength={100} {...f.bind('contactPerson')} />
        <TextField label="Phone / WhatsApp" inputMode="tel" maxLength={30} {...f.bind('phone')} hint="Used for the Call and WhatsApp buttons" />
        <TextField label="Other phone" inputMode="tel" maxLength={30} {...f.bind('altPhone')} />
        <TextField label="Email" type="email" maxLength={200} {...f.bind('email')} />
        <TextField label="Place / address" maxLength={300} {...f.bind('location')} />
        <TextField label="Google Maps link" {...f.bind('mapsUrl')} />
        <TextField label="Website" {...f.bind('website')} placeholder="https://" />
        <SelectField label="Rating" {...f.bind('rating')}>
          <option value="0">Not rated</option>
          {[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{'★'.repeat(n)}{'☆'.repeat(5 - n)} ({n})</option>)}
        </SelectField>
        <TextArea className="sm:col-span-2" label="Notes" rows={4} maxLength={3000} {...f.bind('notes')} placeholder="Check-in time, advance paid, what they said on the phone…" />
        <div className="sm:col-span-2"><FormError message={f.errors._form} /></div>
      </form>
    </Modal>
  );
}
