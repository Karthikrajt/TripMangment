import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Bell } from 'lucide-react';
import { useSession } from '../store/session';
import { PageHeader } from '../components/ui/PageHeader';
import { Card } from '../components/ui/Card';
import { EmptyState } from '../components/ui/Feedback';
import { markRead } from '../services/users';
import { timeAgo } from '../lib/format';

export default function Notifications() {
  const { notifications, member, profile } = useSession();
  const lastRead = profile?.notifLastReadAt?.toMillis?.() ?? 0;

  useEffect(() => {
    if (!member || !notifications.length) return;
    const latest = notifications[0]?.createdAt?.toMillis?.() ?? 0;
    if (latest > lastRead) {
      const t = setTimeout(() => markRead(member.uid, 'notifLastReadAt'), 1500);
      return () => clearTimeout(t);
    }
  }, [member, notifications, lastRead]);

  return (
    <div>
      <PageHeader title="Notifications" subtitle="Latest updates about the trip." />
      {notifications.length === 0 ? (
        <EmptyState icon={<Bell className="size-7" />} title="No notifications yet" />
      ) : (
        <Card>
          <ul className="divide-y divide-slate-100">
            {notifications.map((n) => {
              const unread = (n.createdAt?.toMillis?.() ?? 0) > lastRead && n.createdBy !== member?.uid;
              return (
                <li key={n.id}>
                  <Link to={n.link || '/'} className={`flex gap-3 px-4 py-3 hover:bg-slate-50 ${unread ? 'bg-brand-50/60' : ''}`}>
                    <span className={`mt-2 size-2.5 shrink-0 rounded-full ${unread ? 'bg-brand-600' : 'bg-transparent'}`} aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold text-slate-900">{n.title}</span>
                      <span className="block text-slate-600">{n.body}</span>
                      <span className="text-xs text-slate-400">{timeAgo(n.createdAt)}</span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </div>
  );
}
