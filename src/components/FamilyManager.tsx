/**
 * Tap-only family management (no dragging), the same on phone and desktop:
 * - each family is a card listing its people
 * - "Add people" opens a checklist to add several people at once
 * - tapping a person opens "Move to…" with one big button per family
 * - "New family" asks for a name and its members in one step
 */
import { useMemo, useState } from 'react';
import { Check, ChevronRight, Pencil, Plus, Search, UserMinus, Users } from 'lucide-react';
import type { Member } from '../domain/types';
import { ageGroupOf, ageLabel, ageSummary, familyNames, familyOf, groupByFamily, headCount, sharesLabel, type ShareDefaults } from '../domain/people';
import { Avatar } from './ui/Avatar';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { FormError, TextField } from './ui/Field';
import { toast } from './ui/Toast';
import { moveToFamily } from '../services/members';
import { errorMessage } from '../lib/retry';

type Sheet =
  | { kind: 'add'; family: string }
  | { kind: 'move'; person: Member }
  | { kind: 'new'; preselect: string[] }
  | null;

export function FamilyManager({ people, shareDefaults, onRename }: { people: Member[]; shareDefaults: ShareDefaults; onRename: (family: string) => void }) {
  const [sheet, setSheet] = useState<Sheet>(null);
  const groups = useMemo(() => groupByFamily(people), [people]);
  const families = groups.filter((g) => g.name);
  const unassigned = groups.find((g) => !g.name)?.members ?? [];

  const move = async (list: Member[], family: string) => {
    try {
      const n = await moveToFamily(list, family);
      if (n) toast.success(family ? `${n === 1 ? list[0].displayName : `${n} people`} added to ${family}` : `${list[0].displayName} removed from the family`);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-600">Tap a person to move them, or use <b>Add people</b> on a family to add several at once.</p>
        <Button icon={<Plus className="size-5" />} onClick={() => setSheet({ kind: 'new', preselect: [] })}>New family</Button>
      </div>

      {unassigned.length > 0 && (
        <section className="rounded-3xl border-2 border-dashed border-amber-300 bg-amber-50/60 p-4" aria-label="People without a family">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="font-bold text-ink">Not in a family yet ({unassigned.length})</h3>
              <p className="text-sm text-slate-600">Tap a name to choose their family.</p>
            </div>
            <Button size="sm" variant="secondary" icon={<Plus className="size-4" />} onClick={() => setSheet({ kind: 'new', preselect: [] })}>Start a family</Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {unassigned.map((m) => (
              <button key={m.uid} type="button" onClick={() => setSheet({ kind: 'move', person: m })} className="flex items-center gap-2 rounded-full bg-white py-1 pl-1 pr-3 text-left shadow-soft hover:ring-2 hover:ring-brand-300">
                <Avatar name={m.displayName} photo={m.photoURL} size={30} />
                <span className="text-sm font-semibold text-ink">{m.displayName}</span>
                {ageGroupOf(m) !== 'adult' && <span className="text-xs text-amber-800">{ageLabel(m, shareDefaults)}</span>}
              </button>
            ))}
          </div>
        </section>
      )}

      {families.length === 0 ? (
        <div className="rounded-3xl bg-white p-6 text-center shadow-soft">
          <Users className="mx-auto size-8 text-brand-700" />
          <p className="mt-2 font-semibold text-ink">No families yet</p>
          <p className="text-sm text-slate-600">Create a family, for example “Thangavel Family”, and tick its members.</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {families.map((g) => (
            <section key={g.name} className="flex flex-col rounded-3xl bg-white shadow-soft" aria-label={g.name}>
              <header className="flex items-start justify-between gap-2 px-4 pt-4">
                <div className="min-w-0">
                  <h3 className="truncate text-lg font-bold text-ink">{g.name}</h3>
                  <p className="text-xs text-slate-500">{ageSummary(g.members)} · {sharesLabel(headCount(g.members, shareDefaults))}</p>
                </div>
                <button type="button" onClick={() => onRename(g.name)} className="rounded-full p-2 text-slate-500 hover:bg-brand-50 hover:text-brand-700" aria-label={`Rename ${g.name}`}>
                  <Pencil className="size-4" />
                </button>
              </header>
              <ul className="flex-1 divide-y divide-slate-100 px-2 py-2">
                {g.members.map((m) => (
                  <li key={m.uid}>
                    <button type="button" onClick={() => setSheet({ kind: 'move', person: m })} className="flex w-full items-center gap-3 rounded-2xl px-2 py-2 text-left hover:bg-brand-50" aria-label={`${m.displayName} – move to another family`}>
                      <Avatar name={m.displayName} photo={m.photoURL} size={36} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold text-ink">{m.displayName}</span>
                        <span className="block text-xs text-slate-500">{ageGroupOf(m) === 'adult' ? 'Adult' : ageLabel(m, shareDefaults)}</span>
                      </span>
                      <span className="text-xs font-semibold text-brand-700">Move</span>
                      <ChevronRight className="size-4 text-slate-400" aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
              <div className="border-t border-slate-100 p-3">
                <Button variant="secondary" className="w-full" icon={<Plus className="size-4" />} aria-label={`Add people to ${g.name}`} onClick={() => setSheet({ kind: 'add', family: g.name })}>
                  Add people
                </Button>
              </div>
            </section>
          ))}
        </div>
      )}

      {sheet?.kind === 'move' && (
        <MoveSheet
          person={sheet.person}
          families={families.map((f) => f.name)}
          onClose={() => setSheet(null)}
          onPick={(f) => {
            setSheet(null);
            void move([sheet.person], f);
          }}
          onNew={() => setSheet({ kind: 'new', preselect: [sheet.person.uid] })}
        />
      )}
      {sheet?.kind === 'add' && (
        <PickPeopleSheet
          title={`Add people to ${sheet.family}`}
          people={people.filter((p) => familyOf(p).toLowerCase() !== sheet.family.toLowerCase())}
          shareDefaults={shareDefaults}
          confirmLabel={(n) => `Add ${n} to ${sheet.family}`}
          onClose={() => setSheet(null)}
          onConfirm={async (list) => {
            await move(list, sheet.family);
            setSheet(null);
          }}
        />
      )}
      {sheet?.kind === 'new' && (
        <NewFamilySheet
          people={people}
          existing={familyNames(people)}
          preselect={sheet.preselect}
          shareDefaults={shareDefaults}
          onClose={() => setSheet(null)}
          onCreate={async (name, list) => {
            await move(list, name);
            setSheet(null);
          }}
        />
      )}
    </div>
  );
}

function MoveSheet({ person, families, onClose, onPick, onNew }: { person: Member; families: string[]; onClose: () => void; onPick: (family: string) => void; onNew: () => void }) {
  const current = familyOf(person).toLowerCase();
  const option = (label: string, value: string, icon?: React.ReactNode) => {
    const on = value.toLowerCase() === current;
    return (
      <button
        key={value || '__none'}
        type="button"
        disabled={on}
        onClick={() => onPick(value)}
        className={`flex w-full items-center gap-3 rounded-2xl border px-4 py-3.5 text-left text-base font-semibold ${on ? 'border-brand-700 bg-brand-50 text-brand-800' : 'border-slate-200 bg-white text-ink hover:border-brand-300 hover:bg-brand-50/50'}`}
      >
        {icon ?? <Users className="size-5 text-brand-700" />}
        <span className="flex-1">{label}</span>
        {on && <span className="flex items-center gap-1 text-sm"><Check className="size-4" /> Current</span>}
      </button>
    );
  };
  return (
    <Modal open onClose={onClose} title={`Move ${person.displayName} to…`}>
      <div className="space-y-2">
        {families.map((f) => option(f, f))}
        <button type="button" onClick={onNew} className="flex w-full items-center gap-3 rounded-2xl border border-dashed border-brand-300 px-4 py-3.5 text-left text-base font-semibold text-brand-800 hover:bg-brand-50">
          <Plus className="size-5" /> New family…
        </button>
        {current && option('No family', '', <UserMinus className="size-5 text-slate-500" />)}
      </div>
    </Modal>
  );
}

/** Checklist of people grouped by their current family (no family first), with search. */
function PeopleChecklist({ people, selected, onToggle, shareDefaults }: { people: Member[]; selected: Set<string>; onToggle: (uid: string) => void; shareDefaults: ShareDefaults }) {
  const [q, setQ] = useState('');
  const shown = people.filter((p) => p.displayName.toLowerCase().includes(q.trim().toLowerCase()));
  const groups = groupByFamily(shown).sort((a, b) => (!a.name ? -1 : !b.name ? 1 : a.name.localeCompare(b.name)));
  return (
    <div className="space-y-3">
      {people.length > 6 && (
        <label className="relative block">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-slate-400" />
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search people…" aria-label="Search people" className="w-full rounded-2xl border border-slate-200 py-2.5 pl-10 pr-3" />
        </label>
      )}
      {groups.length === 0 && <p className="py-4 text-center text-sm text-slate-500">No one to add.</p>}
      {groups.map((g) => (
        <div key={g.name || '__none'}>
          <p className="mb-1 px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{g.name ? `Now in ${g.name}` : 'Not in a family'}</p>
          <div className="space-y-1.5">
            {g.members.map((m) => {
              const on = selected.has(m.uid);
              return (
                <label key={m.uid} className={`flex cursor-pointer items-center gap-3 rounded-2xl border px-3 py-2.5 ${on ? 'border-brand-700 bg-brand-50' : 'border-slate-200 bg-white hover:border-brand-300'}`}>
                  <input type="checkbox" className="size-5 accent-brand-700" checked={on} onChange={() => onToggle(m.uid)} />
                  <Avatar name={m.displayName} photo={m.photoURL} size={32} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold text-ink">{m.displayName}</span>
                    <span className="block text-xs text-slate-500">{ageGroupOf(m) === 'adult' ? 'Adult' : ageLabel(m, shareDefaults)}</span>
                  </span>
                </label>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function useSelection(initial: string[] = []) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set(initial));
  const toggle = (uid: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(uid)) n.delete(uid);
      else n.add(uid);
      return n;
    });
  return { selected, toggle };
}

function PickPeopleSheet({ title, people, shareDefaults, confirmLabel, onClose, onConfirm }: { title: string; people: Member[]; shareDefaults: ShareDefaults; confirmLabel: (n: number) => string; onClose: () => void; onConfirm: (list: Member[]) => Promise<void> }) {
  const { selected, toggle } = useSelection();
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    await onConfirm(people.filter((p) => selected.has(p.uid)));
    setBusy(false);
  };
  return (
    <Modal open onClose={onClose} title={title} footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={busy} disabled={!selected.size} onClick={save}>{selected.size ? confirmLabel(selected.size) : 'Tick people to add'}</Button></>}>
      <PeopleChecklist people={people} selected={selected} onToggle={toggle} shareDefaults={shareDefaults} />
    </Modal>
  );
}

function NewFamilySheet({ people, existing, preselect, shareDefaults, onClose, onCreate }: { people: Member[]; existing: string[]; preselect: string[]; shareDefaults: ShareDefaults; onClose: () => void; onCreate: (name: string, list: Member[]) => Promise<void> }) {
  const { selected, toggle } = useSelection(preselect);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = async () => {
    const n = name.trim().replace(/\s+/g, ' ');
    if (!n) return setError('Type a family name, for example “Thangavel Family”.');
    if (!selected.size) return setError('Tick at least one person for this family.');
    const match = existing.find((f) => f.toLowerCase() === n.toLowerCase());
    setBusy(true);
    await onCreate(match ?? n, people.filter((p) => selected.has(p.uid)));
    setBusy(false);
  };
  return (
    <Modal open onClose={onClose} title="New family" footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={busy} onClick={save}>{selected.size ? `Create with ${selected.size} ${selected.size === 1 ? 'person' : 'people'}` : 'Create family'}</Button></>}>
      <div className="space-y-4">
        <TextField label="Family name" maxLength={100} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Thangavel Family" autoFocus />
        <div>
          <p className="mb-2 text-sm font-medium text-slate-700">Who is in this family?</p>
          <PeopleChecklist people={people} selected={selected} onToggle={toggle} shareDefaults={shareDefaults} />
        </div>
        <FormError message={error} />
      </div>
    </Modal>
  );
}
