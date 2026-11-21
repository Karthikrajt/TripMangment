import { useMemo, useState } from 'react';
import type { Member } from '../domain/types';
import { Avatar } from './ui/Avatar';

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
  const shown = useMemo(() => members.filter((m) => `${m.displayName} ${m.relationship}`.toLowerCase().includes(q.toLowerCase())), [members, q]);
  const toggle = (uid: string) => onChange(selected.includes(uid) ? selected.filter((u) => u !== uid) : [...selected, uid]);
  const allSelected = members.length > 0 && members.every((m) => selected.includes(m.uid));

  return (
    <fieldset>
      <legend className="mb-1 flex w-full items-center justify-between text-sm font-medium text-slate-700">
        <span>
          {label} <span className="text-slate-500">({selected.length} selected)</span>
        </span>
        <button type="button" className="text-brand-700 font-semibold text-sm" onClick={() => onChange(allSelected ? [] : members.map((m) => m.uid))}>
          {allSelected ? 'Clear all' : 'Select all'}
        </button>
      </legend>
      {members.length > 6 && (
        <input
          type="search"
          placeholder="Search members…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="mb-2 w-full rounded-xl border border-slate-300 px-3 py-2"
          aria-label="Search members"
        />
      )}
      <div className="max-h-60 overflow-y-auto rounded-xl border border-slate-200 divide-y divide-slate-100">
        {shown.map((m) => (
          <label key={m.uid} className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-slate-50">
            <input type="checkbox" className="size-5 accent-brand-700" checked={selected.includes(m.uid)} onChange={() => toggle(m.uid)} />
            <Avatar name={m.displayName} photo={m.photoURL} size={28} />
            <span className="flex-1">
              {m.displayName}
              {m.relationship && <span className="ml-1 text-sm text-slate-500">· {m.relationship}</span>}
            </span>
          </label>
        ))}
        {shown.length === 0 && <p className="px-3 py-3 text-sm text-slate-500">No members found.</p>}
      </div>
      {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
    </fieldset>
  );
}

export function MemberChips({ uids, members }: { uids: string[]; members: Member[] }) {
  if (!uids.length) return <span className="text-slate-500 text-sm">No one assigned</span>;
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
