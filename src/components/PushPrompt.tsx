/**
 * Dashboard card asking to turn on notifications, so train / pickup
 * reminders and roll calls reach the phone even when the app is closed.
 * Hidden once enabled, blocked, or dismissed ("Not now" hides it for a week).
 */
import { useEffect, useState } from 'react';
import { BellRing, X } from 'lucide-react';
import { useSession } from '../store/session';
import { enablePush, needsHomeScreenForPush, pushEnabledLocally, pushSupported } from '../lib/push';
import { Button } from './ui/Button';
import { toast } from './ui/Toast';
import { errorMessage } from '../lib/retry';

const KEY = 'tm.pushPromptHiddenUntil';

function hiddenNow(): boolean {
  try {
    return Number(localStorage.getItem(KEY) ?? 0) > Date.now();
  } catch {
    return false;
  }
}

export function PushPrompt() {
  const uid = useSession((s) => s.member?.uid);
  const [state, setState] = useState<'hidden' | 'ask' | 'ios'>('hidden');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (hiddenNow() || pushEnabledLocally()) return;
    if (typeof Notification !== 'undefined' && Notification.permission === 'denied') return;
    if (needsHomeScreenForPush()) {
      setState('ios');
      return;
    }
    pushSupported().then((ok) => ok && setState('ask'));
  }, []);

  if (state === 'hidden' || !uid) return null;

  const later = () => {
    try {
      localStorage.setItem(KEY, String(Date.now() + 7 * 864e5));
    } catch {
      /* ignore */
    }
    setState('hidden');
  };
  const enable = async () => {
    setBusy(true);
    try {
      const r = await enablePush(uid);
      if (r === 'enabled') {
        toast.success('Notifications on. You’ll get train and pickup reminders.');
        setState('hidden');
      } else if (r === 'denied') {
        toast.error('Notifications are blocked. Allow them in your browser’s site settings.');
        setState('hidden');
      } else toast.error('This browser can’t show notifications.');
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative flex flex-col gap-3 rounded-3xl border border-brand-200 bg-brand-50 p-4 sm:flex-row sm:items-center">
      <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-brand-700 text-white"><BellRing className="size-6" /></span>
      <div className="min-w-0 flex-1 pr-6">
        <p className="font-bold text-ink">Get reminders on this phone</p>
        <p className="text-sm text-slate-600">
          {state === 'ios'
            ? 'On iPhone: tap Share → “Add to Home Screen”, open the app from there, then turn on notifications in Profile.'
            : 'The evening before and 3 hours before each train, 1 hour before pickups, and each morning’s plan.'}
        </p>
      </div>
      {state === 'ask' && <Button loading={busy} onClick={enable}>Turn on</Button>}
      <button type="button" onClick={later} className="absolute right-3 top-3 rounded-full p-1 text-slate-500 hover:bg-white" aria-label="Not now"><X className="size-5" /></button>
    </div>
  );
}
