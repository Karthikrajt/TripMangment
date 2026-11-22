import { useMemo, useState } from 'react';
import type { Member } from '../domain/types';
import { Avatar } from './ui/Avatar';
import { ageGroupOf, ageLabel, familyOf, groupByFamily } from '../domain/people';
import { useShareDefaults } from '../store/session';

export function MemberPicker({
  members,
  selected,
  onChange,
  label = 'Members',
  error,
}: {
  members: Member[];
  selected: string[];
  onChange: (uids: string[]) => void;
  label?: string;
  error?: string;
}) {
  const [q, setQ] = useState('');
  const shareDefaults = useShareDefaults();
  const shown = useMemo(() => members.filter((m) => `${m.displayName} ${m.relationship}`.toLowerCase().includes(q.toLowerCase())), [members, q]);
  const families = useMemo(() => groupByFamily(members).filter((g) => g.name), [members]);
  const toggle = (uid: string) => onChange(selected.includes(uid) ? selected.filter((u) => u !== uid) : [...selected, uid]);
  const allSelected = members.length > 0 && members.every((m) => selected.includes(m.uid));
  const toggleFamily = (ids: string[]) => {
    const all = ids.every((id) => selected.includes(id));
    onChange(all ? selected.filter((u) => !ids.includes(u)) : [...new Set([...selected, ...ids])]);
  };

  return (
    <fieldset>
      <legend className="mb-1 flex w-full items-center justify-between text-sm font-medium text-slate-700">
        <span>
          {label} <span className="text-slate-500">({selected.length} selected)</span>
        </span>
        <button type="button" className="text-sm font-semibold text-brand-700" onClick={() => onChange(allSelected ? [] : members.map((m) => m.uid))}>
          {allSelected ? 'Clear all' : 'Select all'}
        </button>
      </legend>
      {families.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2" aria-label="Select a whole family">
          {families.map((f) => {
            const ids = f.members.map((m) => m.uid);
            const n = ids.filter((id) => selected.includes(id)).length;
            const on = n === ids.length;
            return (
              <button
                key={f.name}
                type="button"
                aria-pressed={on}
                onClick={() => toggleFamily(ids)}
                className={`rounded-full border px-3 py-1.5 text-sm font-semibold ${on ? 'border-brand-700 bg-brand-700 text-white' : n ? 'border-brand-300 bg-brand-50 text-brand-800' : 'border-slate-300 bg-white text-slate-700'}`}
              >
                {on ? '✓ ' : ''}{f.name} ({n ? `${n}/` : ''}{ids.length})
              </button>
            );
          })}
        </div>
      )}
      {members.length > 6 && (
        <input
          type="search"
          placeholder="Search people…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="mb-2 w-full rounded-xl border border-slate-300 px-3 py-2"
          aria-label="Search people"
        />
      )}
      <div className="max-h-60 divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-200">
        {shown.map((m) => (
          <label key={m.uid} className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-slate-50">
            <input type="checkbox" className="size-5 accent-brand-700" checked={selected.includes(m.uid)} onChange={() => toggle(m.uid)} />
            <Avatar name={m.displayName} photo={m.photoURL} size={28} />
            <span className="flex-1">
              {m.displayName}
              {familyOf(m) && <span className="ml-1 text-sm text-slate-500">· {familyOf(m)}</span>}
              {ageGroupOf(m) !== 'adult' && <span className="ml-1 rounded-full bg-amber-100 px-2 text-xs font-semibold text-amber-800">{ageLabel(m, shareDefaults)}</span>}
            </span>
          </label>
        ))}
        {shown.length === 0 && <p className="px-3 py-3 text-sm text-slate-500">No one found.</p>}
      </div>
      {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
    </fieldset>
  );
}

export function MemberChips({ uids, members }: { uids: string[]; members: Member[] }) {
  if (!uids.length) return <span className="text-sm text-slate-500">No one assigned</span>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {uids.map((uid) => {
        const m = members.find((x) => x.uid === uid);
        return (
          <span key={uid} className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 py-0.5 pl-0.5 pr-2.5 text-sm">
            <Avatar name={m?.displayName ?? '?'} photo={m?.photoURL} size={22} />
            {m?.displayName ?? 'Former member'}
          </span>
        );
      })}
    </div>
  );
}
