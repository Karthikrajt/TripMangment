import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';

const control =
  'w-full rounded-2xl border border-slate-200 bg-white px-3.5 py-2.5 text-base text-slate-900 placeholder:text-slate-400 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-200 disabled:bg-slate-100';

interface FieldShell {
  label: string;
  error?: string;
  hint?: ReactNode;
  required?: boolean;
  className?: string;
}

function Shell({ id, label, error, hint, required, className = '', children }: FieldShell & { id: string; children: ReactNode }) {
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-slate-700">
        {label}
        {required && <span className="text-red-600"> *</span>}
      </label>
      {children}
      {hint && !error && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
      {error && (
        <p id={`${id}-err`} className="mt-1 text-sm text-red-600" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export function TextField({ label, error, hint, required, className, ...rest }: FieldShell & InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  return (
    <Shell id={id} label={label} error={error} hint={hint} required={required} className={className}>
      <input id={id} className={control} aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-err` : undefined} required={required} {...rest} />
    </Shell>
  );
}

export function TextArea({ label, error, hint, required, className, ...rest }: FieldShell & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const id = useId();
  return (
    <Shell id={id} label={label} error={error} hint={hint} required={required} className={className}>
      <textarea id={id} rows={3} className={control} aria-invalid={Boolean(error)} required={required} {...rest} />
    </Shell>
  );
}

export function SelectField({ label, error, hint, required, className, children, ...rest }: FieldShell & SelectHTMLAttributes<HTMLSelectElement>) {
  const id = useId();
  return (
    <Shell id={id} label={label} error={error} hint={hint} required={required} className={className}>
      <select id={id} className={control} aria-invalid={Boolean(error)} required={required} {...rest}>
        {children}
      </select>
    </Shell>
  );
}

export function Checkbox({ label, checked, onChange, description }: { label: ReactNode; checked: boolean; onChange: (v: boolean) => void; description?: ReactNode }) {
  const id = useId();
  return (
    <label htmlFor={id} className="flex items-start gap-3 cursor-pointer select-none py-1">
      <input id={id} type="checkbox" className="mt-1 size-5 accent-brand-700" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>
        <span className="text-base text-slate-800">{label}</span>
        {description && <span className="block text-sm text-slate-500">{description}</span>}
      </span>
    </label>
  );
}

export function FormError({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
      {message}
    </div>
  );
}
