/**
 * After someone signs in and joins, ask which traveller they are:
 * 1. best match from their Google name / email → "Are you X?" Yes / No
 * 2. otherwise pick from the list of travellers nobody has claimed yet
 * 3. or "I'm not on the list" → stay as a new person and pick a family
 * Shown once per account (linkDecided); "Later" hides it for this visit.
 */
import { useMemo, useState } from 'react';
import { create } from 'zustand';
import { Check, Search, UserPlus, Users } from 'lucide-react';
import { useSession, useShareDefaults } from '../store/session';
import { matchTravellers, unclaimedTravellers } from '../domain/matchPeople';
import { ageGroupOf, ageLabel, familyNames, familyOf, peopleOf } from '../domain/people';
import { claimTraveller, confirmNewPerson } from '../services/members';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { Avatar } from './ui/Avatar';
import { FormError, SelectField, TextField } from './ui/Field';
import { toast } from './ui/Toast';
import { errorMessage } from '../lib/retry';
import type { Member } from '../domain/types';

type Step = 'suggest' | 'list' | 'confirm' | 'new';

/** Open the prompt on purpose (e.g. from Profile), even for admins or after "Later". */
export const useWhoAreYou = create<{ forced: boolean; open: () => void; close: () => void }>((set) => ({
  forced: false,
  open: () => set({ forced: true }),
  close: () => set({ forced: false }),
}));

export function WhoAreYou() {
  const me = useSession((s) => s.member);
  const user = useSession((s) => s.user);
  const members = useSession((s) => s.members);
  const [dismissedState, setDismissedState] = useState(false);
  const { forced, close: closeForced } = useWhoAreYou();
  const dismissed = dismissedState && !forced;
  const setDismissed = (v: boolean) => {
    setDismissedState(v);
    if (v) closeForced();
  };
  const shareDefaults = useShareDefaults();

  const unclaimed = useMemo(() => unclaimedTravellers(members), [members]);
  const matches = useMemo(() => (me ? matchTravellers(me.displayName, user?.email ?? me.email, unclaimed) : []), [me, user, unclaimed]);
  const [step, setStep] = useState<Step | null>(null);
  const [picked, setPicked] = useState<Member | null>(null);
  const [q, setQ] = useState('');
  const families = useMemo(() => familyNames(peopleOf(members)), [members]);
  const [family, setFamily] = useState('');
  const [newFamily, setNewFamily] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Ask new members automatically; admins (busy adding travellers) open it from Profile.
  const auto = Boolean(me && me.role !== 'admin' && !me.linkDecided && unclaimed.length > 0);
  const show = Boolean(me && me.status === 'approved' && me.hasLogin !== false && !me.personId && !dismissed && (forced || auto));
  if (!show || !me) return null;

  const current: Step = step ?? (matches.length ? 'suggest' : unclaimed.length ? 'list' : 'new');
  const best = matches[0]?.person;

  const claim = async (t: Member) => {
    setBusy(true);
    setError(null);
    try {
      await claimTraveller(me, t);
      toast.success(`Welcome, ${t.displayName}! Your tickets and details are connected.`);
      closeForced();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  const saveNew = async () => {
    const f = family === '__new' ? newFamily.trim() : family;
    if (family === '__new' && !f) return setError('Type your family name, or pick one from the list.');
    setBusy(true);
    setError(null);
    try {
      await confirmNewPerson(me, f);
      toast.success(f ? `Added you to ${f}` : 'You are on the trip');
      closeForced();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const personRow = (p: Member, onClick: () => void, highlight = false) => (
    <button
      key={p.uid}
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-2xl border px-3 py-3 text-left ${highlight ? 'border-brand-700 bg-brand-50' : 'border-slate-200 bg-white hover:border-brand-300'}`}
    >
      <Avatar name={p.displayName} size={40} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-base font-semibold text-ink">{p.displayName}</span>
        <span className="block text-sm text-slate-500">{[familyOf(p), ageGroupOf(p) === 'adult' ? 'Adult' : ageLabel(p, shareDefaults)].filter(Boolean).join(' · ')}</span>
      </span>
    </button>
  );

  const later = <Button variant="ghost" onClick={() => setDismissed(true)}>Later</Button>;

  return (
    <Modal open onClose={() => setDismissed(true)} title={current === 'new' ? 'Welcome to the trip' : 'Which traveller are you?'}>
      <div className="space-y-4">
        {current === 'suggest' && best && (
          <>
            <p className="text-slate-600">The trip admin has already added people. Is this you?</p>
            <div className="rounded-3xl bg-brand-50 p-5 text-center">
              <div className="flex justify-center"><Avatar name={best.displayName} size={64} /></div>
              <p className="mt-3 text-2xl font-extrabold text-ink">Are you {best.displayName}?</p>
              <p className="text-slate-600">{[familyOf(best), ageGroupOf(best) === 'adult' ? 'Adult' : ageLabel(best, shareDefaults)].filter(Boolean).join(' · ')}</p>
              {matches[0].reason === 'email' && <p className="mt-1 text-sm text-brand-800">Matched by your email address</p>}
            </div>
            <FormError message={error} />
            <div className="grid gap-2 sm:grid-cols-2">
              <Button size="lg" variant="secondary" onClick={() => setStep('list')}>No, someone else</Button>
              <Button size="lg" icon={<Check className="size-5" />} loading={busy} onClick={() => claim(best)}>Yes, that’s me</Button>
            </div>
            <div className="text-center">{later}</div>
          </>
        )}

        {current === 'list' && (
          <>
            <p className="text-slate-600">Find your name. Tap it, then confirm.</p>
            {unclaimed.length > 6 && (
              <label className="relative block">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-slate-400" />
                <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search names…" aria-label="Search names" className="w-full rounded-2xl border border-slate-200 py-2.5 pl-10 pr-3" />
              </label>
            )}
            <div className="max-h-[45dvh] space-y-2 overflow-y-auto">
              {unclaimed
                .filter((p) => p.displayName.toLowerCase().includes(q.trim().toLowerCase()))
                .map((p) =>
                  personRow(p, () => {
                    setPicked(p);
                    setStep('confirm');
                  }),
                )}
            </div>
            <Button className="w-full" variant="secondary" icon={<UserPlus className="size-5" />} onClick={() => setStep('new')}>I’m not on the list – add me as new</Button>
            <div className="text-center">{later}</div>
          </>
        )}

        {current === 'confirm' && picked && (
          <>
            <div className="rounded-3xl bg-brand-50 p-5 text-center">
              <div className="flex justify-center"><Avatar name={picked.displayName} size={64} /></div>
              <p className="mt-3 text-2xl font-extrabold text-ink">You are {picked.displayName}?</p>
              <p className="text-sm text-slate-600">Your tickets, berth, room and share of expenses will show as yours. Only an admin can undo this.</p>
            </div>
            <FormError message={error} />
            <div className="grid gap-2 sm:grid-cols-2">
              <Button size="lg" variant="secondary" onClick={() => setStep('list')}>Back</Button>
              <Button size="lg" icon={<Check className="size-5" />} loading={busy} onClick={() => claim(picked)}>Yes, confirm</Button>
            </div>
          </>
        )}

        {current === 'new' && (
          <>
            <p className="text-slate-600">
              {unclaimed.length ? 'You’ll be added to the trip as a new member.' : `You’re on the trip, ${me.displayName.split(' ')[0]}!`} Which family are you travelling with?
            </p>
            <SelectField label="Family" value={family} onChange={(e) => setFamily(e.target.value)}>
              <option value="">Not with a family / skip</option>
              {families.map((f) => <option key={f} value={f}>{f}</option>)}
              <option value="__new">+ New family…</option>
            </SelectField>
            {family === '__new' && <TextField label="New family name" maxLength={100} value={newFamily} onChange={(e) => setNewFamily(e.target.value)} placeholder="e.g. Thangavel Family" />}
            <FormError message={error} />
            <div className="grid gap-2 sm:grid-cols-2">
              {unclaimed.length > 0 ? <Button size="lg" variant="secondary" onClick={() => setStep('list')}>Back to the list</Button> : later}
              <Button size="lg" icon={<Users className="size-5" />} loading={busy} onClick={saveNew}>Done</Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
