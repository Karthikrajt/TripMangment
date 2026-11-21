import { create } from 'zustand';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

type Tone = 'success' | 'error' | 'info';
interface ToastItem {
  id: number;
  tone: Tone;
  message: string;
}
interface ToastState {
  items: ToastItem[];
  push: (tone: Tone, message: string) => void;
  dismiss: (id: number) => void;
}

let seq = 0;
export const useToast = create<ToastState>((set, get) => ({
  items: [],
  push: (tone, message) => {
    const id = ++seq;
    set({ items: [...get().items.slice(-2), { id, tone, message }] });
    setTimeout(() => get().dismiss(id), tone === 'error' ? 7000 : 4000);
  },
  dismiss: (id) => set({ items: get().items.filter((t) => t.id !== id) }),
}));

export const toast = {
  success: (m: string) => useToast.getState().push('success', m),
  error: (m: string) => useToast.getState().push('error', m),
  info: (m: string) => useToast.getState().push('info', m),
};

export function Toaster() {
  const { items, dismiss } = useToast();
  const icons = { success: CheckCircle2, error: AlertCircle, info: Info };
  const tones = { success: 'border-emerald-200 bg-emerald-50 text-emerald-900', error: 'border-red-200 bg-red-50 text-red-900', info: 'border-sky-200 bg-sky-50 text-sky-900' };
  return (
    <div className="fixed inset-x-0 top-3 z-[60] flex flex-col items-center gap-2 px-3 pointer-events-none safe-top" aria-live="polite">
      {items.map((t) => {
        const Icon = icons[t.tone];
        return (
          <div key={t.id} className={`pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-xl border px-4 py-3 shadow-lg ${tones[t.tone]}`}>
            <Icon className="mt-0.5 size-5 shrink-0" />
            <p className="flex-1 text-sm font-medium">{t.message}</p>
            <button onClick={() => dismiss(t.id)} aria-label="Dismiss" className="opacity-60 hover:opacity-100">
              <X className="size-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
