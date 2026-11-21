import { useState } from 'react';
import { FileClock } from 'lucide-react';
import { useAuditLogs } from '../../hooks/data';
import { PageHeader } from '../../components/ui/PageHeader';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Badge, EmptyState, ErrorState, Spinner } from '../../components/ui/Feedback';
import { Modal } from '../../components/ui/Modal';
import { formatDateTime } from '../../lib/format';
import type { AuditLog } from '../../domain/types';

const tone = (a: string) => (a === 'delete' || a === 'reject' || a === 'disabled' || a === 'rejected' ? 'red' : a === 'create' || a === 'approve' || a === 'approved' ? 'green' : 'sky');

export default function Audit() {
  const [max, setMax] = useState(50);
  const [entity, setEntity] = useState('');
  const [detail, setDetail] = useState<AuditLog | null>(null);
  const { data, loading, error } = useAuditLogs(max);
  const entities = [...new Set(data.map((d) => d.entity))].sort();
  const shown = entity ? data.filter((d) => d.entity === entity) : data;

  return (
    <div>
      <PageHeader title="Audit History" subtitle="Append-only log of changes. Entries cannot be edited or deleted." />
      <div className="mb-4 flex flex-wrap gap-2">
        <button onClick={() => setEntity('')} className={`rounded-full px-3 py-1 text-sm font-semibold ${!entity ? 'bg-brand-700 text-white' : 'bg-slate-100'}`}>All</button>
        {entities.map((e) => <button key={e} onClick={() => setEntity(e)} className={`rounded-full px-3 py-1 text-sm font-semibold capitalize ${entity === e ? 'bg-brand-700 text-white' : 'bg-slate-100'}`}>{e}</button>)}
      </div>
      {loading && !data.length ? <Spinner /> : error ? <ErrorState message={error} /> : shown.length === 0 ? <EmptyState icon={<FileClock className="size-7" />} title="No audit entries" /> : (
        <Card>
          <ul className="divide-y divide-slate-100">
            {shown.map((l) => (
              <li key={l.id}>
                <button className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-slate-50" onClick={() => setDetail(l)}>
                  <Badge tone={tone(l.action)}>{l.action}</Badge>
                  <span className="min-w-0 flex-1">
                    <span className="block">{l.summary}</span>
                    <span className="text-xs text-slate-500">{l.actorName} · {formatDateTime(l.createdAt)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {data.length >= max && <div className="p-3 text-center"><Button variant="secondary" onClick={() => setMax(max + 50)}>Load more</Button></div>}
        </Card>
      )}
      {detail && (
        <Modal open onClose={() => setDetail(null)} title="Audit entry" wide>
          <p className="font-semibold">{detail.summary}</p>
          <p className="text-sm text-slate-500">{detail.actorName} · {formatDateTime(detail.createdAt)} · {detail.entity} {detail.entityId}</p>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <div><p className="mb-1 text-sm font-medium">Before</p><pre className="max-h-80 overflow-auto rounded-xl bg-slate-50 p-3 text-xs">{JSON.stringify(detail.before, null, 2) ?? '—'}</pre></div>
            <div><p className="mb-1 text-sm font-medium">After</p><pre className="max-h-80 overflow-auto rounded-xl bg-slate-50 p-3 text-xs">{JSON.stringify(detail.after, null, 2) ?? '—'}</pre></div>
          </div>
        </Modal>
      )}
    </div>
  );
}
