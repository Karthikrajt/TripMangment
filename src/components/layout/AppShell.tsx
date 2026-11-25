import { refreshPush } from '../../lib/push';
import { useEffect, useState, type ReactNode } from 'react';
import { flushQueuedWrites, hasQueuedWrites, onQueueChange } from '../../lib/offlineQueue';
import { warmOfflineCache } from '../../lib/offlineSync';
import { toast } from '../ui/Toast';
import { NavLink, Link, useLocation } from 'react-router-dom';
import { Menu, WifiOff, LogOut, Bell, Plane } from 'lucide-react';
import { adminNav, bottomNav, memberNav, type NavItem } from './nav';
import { useSession, useIsAdmin } from '../../store/session';
import { useBadges } from '../../hooks/useBadges';
import { useOnline } from '../../hooks/useOnline';
import { Avatar } from '../ui/Avatar';
import { Modal } from '../ui/Modal';

function BadgeDot({ n }: { n: number }) {
  if (!n) return null;
  return <span className="ml-auto min-w-5 rounded-full bg-rose-600 px-1.5 text-center text-xs font-bold leading-5 text-white">{n > 99 ? '99+' : n}</span>;
}

function useIsActive() {
  const loc = useLocation();
  return (to: string) => {
    const [path, qs] = to.split('?');
    if (qs) return loc.pathname === path && loc.search.includes(qs);
    if (path === '/') return loc.pathname === '/';
    return loc.pathname.startsWith(path) && !(path === '/expenses' && loc.search.includes('tab=review'));
  };
}

function SideLink({ item, badge, onClick }: { item: NavItem; badge: number; onClick?: () => void }) {
  const isActive = useIsActive();
  const active = isActive(item.to);
  const Icon = item.icon;
  return (
    <Link
      to={item.to}
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={`flex items-center gap-3 rounded-2xl px-3 py-2.5 text-[15px] font-medium transition-colors ${active ? 'bg-brand-700 text-white shadow-[0_6px_16px_rgb(36_83_255/0.25)]' : 'text-slate-600 hover:bg-brand-50 hover:text-brand-800'}`}
    >
      <Icon className="size-5 shrink-0" aria-hidden />
      <span className="truncate">{item.label}</span>
      <BadgeDot n={badge} />
    </Link>
  );
}

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const admin = useIsAdmin();
  const badges = useBadges();
  const groups = admin ? adminNav : memberNav;
  return (
    <nav aria-label="Main" className="space-y-5">
      {groups.map((g) => (
        <div key={g.label}>
          <p className="px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">{g.label}</p>
          <div className="space-y-0.5">
            {g.items.map((it) => (
              <SideLink key={it.to} item={it} badge={it.badge ? badges[it.badge] : 0} onClick={onNavigate} />
            ))}
          </div>
        </div>
      ))}
    </nav>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { member, trip, signOut } = useSession();
  const online = useOnline();
  const badges = useBadges();
  const [moreOpen, setMoreOpen] = useState(false);
  const [queued, setQueued] = useState(hasQueuedWrites());
  useEffect(() => {
    const off = onQueueChange(() => setQueued(hasQueuedWrites()));
    return () => {
      off();
    };
  }, []);
  // Back online (or reopened with unsent changes): send queued writes, then refresh offline data.
  useEffect(() => {
    const sync = () => {
      if (!navigator.onLine) return;
      flushQueuedWrites()
        .then((had) => had && toast.success('All offline changes synced'))
        .catch(() => undefined);
      void warmOfflineCache();
    };
    sync();
    window.addEventListener('online', sync);
    return () => window.removeEventListener('online', sync);
  }, []);
  // Keep this phone's push token fresh so reminders keep arriving.
  const myUid = member?.uid;
  useEffect(() => {
    if (myUid && navigator.onLine) void refreshPush(myUid);
  }, [myUid]);
  const isActive = useIsActive();

  return (
    <div className="min-h-dvh lg:pl-72">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 hidden w-72 flex-col border-r border-slate-100 bg-white lg:flex">
        <Link to="/" className="flex items-center gap-3 px-5 py-5 border-b border-slate-100">
          <span className="rounded-2xl bg-gradient-to-br from-brand-700 to-brand-500 p-2 text-white shadow-[0_6px_16px_rgb(36_83_255/0.3)]">
            <Plane className="size-5" />
          </span>
          <span className="min-w-0">
            <span className="block truncate font-bold text-slate-900">{trip?.name ?? 'Trip Manager'}</span>
            <span className="block truncate text-sm text-slate-500">{trip?.destination}</span>
          </span>
        </Link>
        <div className="flex-1 overflow-y-auto p-3">
          <NavList />
        </div>
        <div className="flex items-center gap-3 border-t border-slate-100 p-4">
          <Avatar name={member?.displayName ?? ''} photo={member?.photoURL} size={36} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{member?.displayName}</p>
            <p className="text-xs text-slate-500 capitalize">{member?.role}</p>
          </div>
          <button onClick={signOut} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Sign out" title="Sign out">
            <LogOut className="size-5" />
          </button>
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 flex items-center gap-3 bg-brand-700 px-4 py-3 text-white lg:hidden safe-top">
        <Link to="/" className="flex min-w-0 flex-1 items-center gap-2">
          <span className="rounded-xl bg-white/15 p-1.5">
            <Plane className="size-4" />
          </span>
          <span className="truncate font-bold">{trip?.name ?? 'Trip Manager'}</span>
        </Link>
        <Link to="/notifications" className="relative rounded-full p-2 text-white/90 hover:bg-white/10" aria-label={`Notifications${badges.notifications ? `, ${badges.notifications} unread` : ''}`}>
          <Bell className="size-6" />
          {badges.notifications > 0 && <span className="absolute right-1.5 top-1.5 size-2.5 rounded-full bg-amber-400 ring-2 ring-brand-700" />}
        </Link>
        <Link to="/profile" aria-label="Profile" className="rounded-full ring-2 ring-white/60">
          <Avatar name={member?.displayName ?? ''} photo={member?.photoURL} size={32} />
        </Link>
      </header>

      {!online && (
        <div className="sticky top-[58px] lg:top-0 z-20 flex items-center justify-center gap-2 bg-amber-100 px-4 py-2 text-sm font-medium text-amber-900" role="status">
          <WifiOff className="size-4" /> Offline – showing saved data.{queued ? ' Your changes are saved on this phone and will sync automatically.' : ' Expenses and messages you add will sync automatically.'}
        </div>
      )}

      <main className="mx-auto max-w-6xl px-4 pb-28 pt-5 sm:px-6 lg:pb-10 lg:pt-8">{children}</main>

      {/* Mobile bottom navigation */}
      <nav aria-label="Quick" className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 rounded-t-3xl bg-white shadow-[0_-4px_20px_rgb(17_26_46/0.08)] safe-bottom lg:hidden">
        {bottomNav.map((it) => {
          const Icon = it.icon;
          const n = it.badge ? badges[it.badge] : 0;
          return (
            <NavLink key={it.to} to={it.to} end={it.to === '/'} className={() => `relative flex flex-col items-center gap-0.5 py-2 text-xs font-semibold ${isActive(it.to) ? 'text-brand-700' : 'text-slate-500'}`}>
              <span className={`rounded-full px-4 py-1 transition-colors ${isActive(it.to) ? 'bg-brand-50' : ''}`}>
                <Icon className="size-6" aria-hidden />
              </span>
              {it.label}
              {n > 0 && <span className="absolute right-[22%] top-1.5 min-w-4 rounded-full bg-rose-600 px-1 text-[10px] leading-4 text-white">{n > 9 ? '9+' : n}</span>}
            </NavLink>
          );
        })}
        <button onClick={() => setMoreOpen(true)} className="relative flex flex-col items-center gap-0.5 py-2 text-xs font-semibold text-slate-500">
          <span className="rounded-full px-4 py-1">
            <Menu className="size-6" aria-hidden />
          </span>
          More
          {badges.approvals + badges.review > 0 && <span className="absolute right-[22%] top-1.5 size-2.5 rounded-full bg-rose-600" />}
        </button>
      </nav>

      <Modal open={moreOpen} onClose={() => setMoreOpen(false)} title="Menu">
        <NavList onNavigate={() => setMoreOpen(false)} />
        <button onClick={signOut} className="mt-5 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-red-700 hover:bg-red-50">
          <LogOut className="size-5" /> Sign out
        </button>
      </Modal>
    </div>
  );
}
