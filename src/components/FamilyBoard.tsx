/**
 * Drag-and-drop board: one column per family. Drag a person's card to
 * another family (press and hold on touch screens), or use the card's
 * "Move to" menu. Dropping on "New family" asks for the family's name.
 */
import { useMemo, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { GripVertical, Plus, Users } from 'lucide-react';
import type { Member } from '../domain/types';
import { ageGroupOf, ageLabel, familyOf, groupByFamily, headCount, sharesLabel, type ShareDefaults } from '../domain/people';
import { Avatar } from './ui/Avatar';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { FormError, TextField } from './ui/Field';
import { toast } from './ui/Toast';
import { setFamily } from '../services/members';
import { errorMessage } from '../lib/retry';

const NONE_COL = 'col:none';
const NEW_COL = 'col:new';
const colId = (family: string) => (family ? `col:f:${family.toLowerCase()}` : NONE_COL);

export function FamilyBoard({ people, shareDefaults }: { people: Member[]; shareDefaults: ShareDefaults }) {
  const groups = useMemo(() => {
    const g = groupByFamily(people);
    // Always show a "No family" column as a drop target.
    return g.some((x) => !x.name) ? g : [...g, { name: '', members: [] }];
  }, [people]);
  const families = groups.filter((g) => g.name).map((g) => g.name);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [pendingNew, setPendingNew] = useState<Member | null>(null);
  const active = people.find((p) => p.uid === activeId) ?? null;

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    // Press and hold on phones so normal scrolling still works.
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
    useSensor(KeyboardSensor),
  );

  const move = async (m: Member, family: string) => {
    if (familyOf(m).toLowerCase() === family.toLowerCase()) return;
    try {
      await setFamily(m, family);
      toast.success(family ? `${m.displayName} moved to ${family}` : `${m.displayName} has no family now`);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const onDragStart = (e: DragStartEvent) => setActiveId(String(e.active.id));
  const onDragEnd = (e: DragEndEvent) => {
    setActiveId(null);
    const m = people.find((p) => p.uid === e.active.id);
    const over = e.over?.id ? String(e.over.id) : '';
    if (!m || !over) return;
    if (over === NEW_COL) return setPendingNew(m);
    if (over === NONE_COL) return void move(m, '');
    const target = groups.find((g) => g.name && colId(g.name) === over);
    if (target) void move(m, target.name);
  };

  return (
    <>
      <p className="mb-3 text-sm text-slate-600">
        Drag a person to another family. On a phone, press and hold a card, then drag. You can also use the <b>Move to</b> menu on each card.
      </p>
      <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setActiveId(null)}>
        <div className="-mx-4 flex snap-x gap-4 overflow-x-auto px-4 pb-4 sm:mx-0 sm:grid sm:grid-cols-[repeat(auto-fill,minmax(240px,1fr))] sm:items-start sm:overflow-visible sm:px-0" role="list" aria-label="Families">
          {groups.map((g) => (
            <Column key={colId(g.name)} id={colId(g.name)} title={g.name || 'No family'} subtitle={g.members.length ? `${g.members.length} · ${sharesLabel(headCount(g.members, shareDefaults))}` : 'Empty'}>
              {g.members.map((m) => (
                <PersonCard key={m.uid} m={m} families={families} shareDefaults={shareDefaults} onMove={(f) => (f === '__new' ? setPendingNew(m) : move(m, f))} dragging={activeId === m.uid} />
              ))}
              {!g.members.length && <p className="rounded-xl border-2 border-dashed border-slate-200 p-4 text-center text-sm text-slate-400">Drop people here</p>}
            </Column>
          ))}
          <Column id={NEW_COL} title="New family" subtitle="Drop a person here to start a family" dashed>
            <div className="grid place-items-center gap-2 rounded-xl border-2 border-dashed border-brand-200 p-6 text-center text-sm text-brand-800">
              <Plus className="size-6" />
              Drop here
            </div>
          </Column>
        </div>
        <DragOverlay dropAnimation={null}>{active ? <CardBody m={active} shareDefaults={shareDefaults} lifted /> : null}</DragOverlay>
      </DndContext>
      {pendingNew && <NewFamilyDialog person={pendingNew} existing={families} onClose={() => setPendingNew(null)} onSave={(name) => move(pendingNew, name)} />}
    </>
  );
}

function Column({ id, title, subtitle, children, dashed }: { id: string; title: string; subtitle: string; children: React.ReactNode; dashed?: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <section
      ref={setNodeRef}
      role="listitem"
      aria-label={title}
      className={`flex w-[78vw] max-w-[300px] shrink-0 snap-start flex-col gap-2 rounded-2xl border p-3 transition-colors sm:w-auto sm:max-w-none ${
        isOver ? 'border-brand-500 bg-brand-50' : dashed ? 'border-dashed border-slate-300 bg-white/60' : 'border-slate-200 bg-slate-100/70'
      }`}
    >
      <header className="px-1">
        <h3 className="flex items-center gap-2 font-semibold text-slate-900">
          {!dashed && <Users className="size-4 text-brand-700" />}
          {title}
        </h3>
        <p className="text-xs text-slate-500">{subtitle}</p>
      </header>
      <div className="flex min-h-16 flex-col gap-2">{children}</div>
    </section>
  );
}

function CardBody({ m, shareDefaults, lifted }: { m: Member; shareDefaults: ShareDefaults; lifted?: boolean }) {
  return (
    <div className={`flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-2.5 ${lifted ? 'rotate-1 shadow-xl ring-2 ring-brand-500' : 'shadow-sm'}`}>
      <GripVertical className="size-4 shrink-0 text-slate-400" aria-hidden />
      <Avatar name={m.displayName} photo={m.photoURL} size={32} />
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-slate-900">{m.displayName}</p>
        <p className="text-xs text-slate-500">{ageGroupOf(m) === 'adult' ? 'Adult' : ageLabel(m, shareDefaults)}</p>
      </div>
    </div>
  );
}

function PersonCard({ m, families, shareDefaults, onMove, dragging }: { m: Member; families: string[]; shareDefaults: ShareDefaults; onMove: (family: string) => void; dragging: boolean }) {
  const { attributes, listeners, setNodeRef } = useDraggable({ id: m.uid });
  const current = familyOf(m);
  return (
    <div className={dragging ? 'opacity-40' : ''}>
      <div ref={setNodeRef} {...listeners} {...attributes} aria-roledescription="Draggable person" aria-label={`${m.displayName}. Press space to pick up, arrow keys to move, space to drop.`} className="cursor-grab touch-manipulation select-none active:cursor-grabbing">
        <CardBody m={m} shareDefaults={shareDefaults} />
      </div>
      <label className="mt-1 flex items-center gap-2 px-1 text-xs text-slate-500">
        Move to
        <select
          className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700"
          value={current}
          onChange={(e) => onMove(e.target.value)}
          aria-label={`Move ${m.displayName} to family`}
        >
          {families.map((f) => <option key={f} value={f}>{f}</option>)}
          <option value="">No family</option>
          <option value="__new">+ New family…</option>
        </select>
      </label>
    </div>
  );
}

function NewFamilyDialog({ person, existing, onClose, onSave }: { person: Member; existing: string[]; onClose: () => void; onSave: (name: string) => Promise<void> }) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = async () => {
    const n = name.trim();
    if (!n) return setError('Type a family name.');
    const match = existing.find((f) => f.toLowerCase() === n.toLowerCase());
    setBusy(true);
    await onSave(match ?? n);
    setBusy(false);
    onClose();
  };
  return (
    <Modal open onClose={onClose} title={`New family for ${person.displayName}`} footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={busy} onClick={save}>Create &amp; move</Button></>}>
      <div className="space-y-3">
        <TextField label="Family name" maxLength={100} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Thangavel Family" autoFocus />
        <FormError message={error} />
      </div>
    </Modal>
  );
}
