import { useRegisterSW } from 'virtual:pwa-register/react';
import { useEffect } from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from './ui/Button';

/** Registers the service worker and offers a one-tap update when a new version is deployed. */
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, reg) {
      if (!reg) return;
      // Check for a new version hourly, and whenever the app comes back to the screen.
      setInterval(() => reg.update().catch(() => undefined), 60 * 60 * 1000);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && navigator.onLine) reg.update().catch(() => undefined);
      });
    },
  });
  // Nobody has to tap "Update": a waiting version is applied by itself when it
  // is safe – nothing being typed and no dialog open (e.g. not while paying by
  // UPI or filling an expense) – right away, or when the app goes to the background.
  useEffect(() => {
    if (!needRefresh) return;
    const apply = () => safeToReload() && void updateServiceWorker(true);
    const onHide = () => document.visibilityState === 'hidden' && apply();
    const t = window.setTimeout(apply, 4000);
    document.addEventListener('visibilitychange', onHide);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener('visibilitychange', onHide);
    };
  }, [needRefresh, updateServiceWorker]);
  if (!needRefresh) return null;
  return (
    <div className="fixed inset-x-3 bottom-24 z-50 mx-auto flex max-w-md items-center gap-3 rounded-2xl bg-slate-900 p-4 text-white shadow-xl lg:bottom-6" role="status">
      <RefreshCw className="size-5 shrink-0" />
      <p className="flex-1 text-sm">A new version of the app is available.</p>
      <Button size="sm" variant="secondary" onClick={() => setNeedRefresh(false)}>Later</Button>
      <Button size="sm" onClick={() => updateServiceWorker(true)}>Update</Button>
    </div>
  );
}

/** No open dialog, no form page, nothing typed in a field. */
function safeToReload(): boolean {
  if (document.querySelector('[role="dialog"]')) return false;
  if (/^\/expenses\/(new|.+\/edit)/.test(location.pathname)) return false;
  const a = document.activeElement;
  if (a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.tagName === 'SELECT')) return false;
  return true;
}
