import { Clock, User } from 'lucide-react';
import type { ItineraryItem } from '../domain/types';
import { formatTime } from '../lib/format';
import { isNow } from '../domain/tripTime';
import { MapButton } from './Links';
import { Badge } from './ui/Feedback';

export function ItineraryRow({ item, actions }: { item: ItineraryItem; actions?: React.ReactNode }) {
  const live = isNow(item);
  return (
    <li className={`relative flex gap-4 rounded-xl p-3 ${live ? 'bg-brand-50 ring-2 ring-brand-500' : ''}`}>
      <div className="w-20 shrink-0 text-right">
        <p className="font-semibold text-slate-900 tabular-nums">{formatTime(item.startTime) || '—'}</p>
        {item.endTime && <p className="text-sm text-slate-500 tabular-nums">{formatTime(item.endTime)}</p>}
      </div>
      <div className="min-w-0 flex-1 border-l-2 border-brand-200 pl-4">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-semibold text-slate-900">{item.title}</h3>
          {live && <Badge tone="brand"><Clock className="size-3" /> Now</Badge>}
          {!item.published && <Badge tone="amber">Draft</Badge>}
        </div>
        {item.location && <p className="text-slate-600">{item.location}</p>}
        {item.description && <p className="mt-1 whitespace-pre-line text-slate-700">{item.description}</p>}
        {item.instructions && <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">📌 {item.instructions}</p>}
        {item.notes && <p className="mt-1 text-sm text-slate-500">{item.notes}</p>}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {item.coordinator && (
            <span className="inline-flex items-center gap-1 text-sm text-slate-600">
              <User className="size-4" /> {item.coordinator}
            </span>
          )}
          <MapButton url={item.mapsUrl} address={item.mapsUrl ? undefined : item.location} label="Directions" />
          {actions}
        </div>
      </div>
    </li>
  );
}
