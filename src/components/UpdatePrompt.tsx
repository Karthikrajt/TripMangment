import { useRegisterSW } from 'virtual:pwa-register/react';
import { RefreshCw } from 'lucide-react';
import { Button } from './ui/Button';

/** Registers the service worker and offers a one-tap update when a new version is deployed. */
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, reg) {
      // check for updates hourly while the app is open
      if (reg) setInterval(() => reg.update().catch(() => undefined), 60 * 60 * 1000);
    },
  });
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
