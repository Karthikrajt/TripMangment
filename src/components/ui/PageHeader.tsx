import type { ReactNode } from 'react';
import { RefreshCw } from 'lucide-react';
import { useSync } from '../../lib/sync';
import { timeAgo } from '../../lib/format';
import { Timestamp } from 'firebase/firestore';

export function PageHeader({ title, subtitle, actions, syncKey }: { title: string; subtitle?: ReactNode; actions?: ReactNode; syncKey?: string }) {
  return (
    <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 text-slate-600">{subtitle}</p>}
        {syncKey && <LastSynced syncKey={syncKey} />}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  );
}

export function LastSynced({ syncKey }: { syncKey: string }) {
  const at = useSync((s) => s.lastSynced[syncKey]);
  const pending = useSync((s) => s.pendingWrites[syncKey]);
  return (
    <p className="mt-1 flex items-center gap-1 text-xs text-slate-500">
      <RefreshCw className="size-3" aria-hidden />
      {pending ? 'Changes waiting to sync…' : at ? `Last synced ${timeAgo(Timestamp.fromMillis(at))}` : 'Not synced yet'}
    </p>
  );
}
