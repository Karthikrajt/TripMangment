import { initials } from '../../lib/format';

const colors = ['bg-brand-600', 'bg-amber-500', 'bg-sky-600', 'bg-rose-500', 'bg-violet-600', 'bg-emerald-600'];

export function Avatar({ name, photo, size = 40 }: { name: string; photo?: string; size?: number }) {
  const color = colors[[...name].reduce((a, c) => a + c.charCodeAt(0), 0) % colors.length];
  if (photo) {
    return <img src={photo} alt="" width={size} height={size} referrerPolicy="no-referrer" className="rounded-full object-cover shrink-0 bg-slate-200" style={{ width: size, height: size }} />;
  }
  return (
    <span aria-hidden className={`${color} grid place-items-center rounded-full font-semibold text-white shrink-0`} style={{ width: size, height: size, fontSize: size * 0.4 }}>
      {initials(name) || '?'}
    </span>
  );
}
