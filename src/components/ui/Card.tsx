import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

export function Card({ children, className = '', as: Tag = 'section' }: { children: ReactNode; className?: string; as?: 'section' | 'div' | 'article' | 'li' }) {
  return <Tag className={`rounded-2xl bg-white border border-slate-200/80 shadow-sm ${className}`}>{children}</Tag>;
}

export function CardHeader({ title, icon, action, subtitle }: { title: ReactNode; icon?: ReactNode; action?: ReactNode; subtitle?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 px-4 pt-4 sm:px-5">
      <div className="flex items-center gap-2 min-w-0">
        {icon && <span className="text-brand-700 shrink-0">{icon}</span>}
        <div className="min-w-0">
          <h2 className="font-semibold text-slate-900 text-lg leading-tight">{title}</h2>
          {subtitle && <p className="text-sm text-slate-500">{subtitle}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}

export function CardBody({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`px-4 py-4 sm:px-5 ${className}`}>{children}</div>;
}

export function QuickCard({ to, icon, label, tone = 'brand' }: { to: string; icon: ReactNode; label: string; tone?: 'brand' | 'sun' | 'sky' | 'rose' | 'violet' | 'emerald' }) {
  const tones = {
    brand: 'bg-brand-50 text-brand-700',
    sun: 'bg-amber-50 text-amber-700',
    sky: 'bg-sky-50 text-sky-700',
    rose: 'bg-rose-50 text-rose-700',
    violet: 'bg-violet-50 text-violet-700',
    emerald: 'bg-emerald-50 text-emerald-700',
  };
  return (
    <Link to={to} className="flex flex-col items-center gap-2 rounded-2xl bg-white border border-slate-200/80 p-4 shadow-sm hover:border-brand-500 hover:shadow transition text-center">
      <span className={`rounded-xl p-3 ${tones[tone]}`}>{icon}</span>
      <span className="text-sm font-semibold text-slate-800">{label}</span>
    </Link>
  );
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="rounded-2xl bg-white border border-slate-200/80 p-4 shadow-sm">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-slate-900 tabular-nums">{value}</p>
      {hint && <p className="text-xs text-slate-500 mt-1">{hint}</p>}
    </div>
  );
}
