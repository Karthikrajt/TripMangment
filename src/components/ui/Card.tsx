import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

export function Card({ children, className = '', as: Tag = 'section' }: { children: ReactNode; className?: string; as?: 'section' | 'div' | 'article' | 'li' }) {
  return <Tag className={`rounded-3xl bg-white shadow-soft ${className}`}>{children}</Tag>;
}

export function CardHeader({ title, icon, action, subtitle }: { title: ReactNode; icon?: ReactNode; action?: ReactNode; subtitle?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 px-4 pt-4 sm:px-5">
      <div className="flex items-center gap-2 min-w-0">
        {icon && <span className="text-brand-700 shrink-0">{icon}</span>}
        <div className="min-w-0">
          <h2 className="text-lg font-bold leading-tight text-ink">{title}</h2>
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
  // Fresh Blue keeps shortcuts in one calm blue; tone is kept for API compatibility.
  void tone;
  const tones = { brand: 'bg-brand-50 text-brand-700' };
  return (
    <Link to={to} className="flex flex-col items-center gap-1.5 rounded-3xl bg-white px-2 py-3 text-center shadow-soft transition hover:-translate-y-0.5 hover:shadow-float sm:gap-2 sm:p-4">
      <span className={`rounded-2xl p-2.5 sm:p-3 ${tones.brand}`}>{icon}</span>
      <span className="text-[13px] font-semibold leading-tight text-slate-800 sm:text-sm">{label}</span>
    </Link>
  );
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="rounded-3xl bg-white p-3.5 shadow-soft sm:p-4">
      <p className="text-[13px] font-medium text-slate-500 sm:text-sm">{label}</p>
      <p className="mt-0.5 text-xl font-extrabold tracking-tight text-ink tabular-nums sm:mt-1 sm:text-2xl">{value}</p>
      {hint && <p className="text-xs text-slate-500 mt-1">{hint}</p>}
    </div>
  );
}
