import { useEffect, useState } from 'react';
import { collection, getCountFromServer, query, where } from 'firebase/firestore';
import { useSession, unreadCount } from '../store/session';
import { db, tripPath } from '../lib/firebase';
import { isAdmin } from '../domain/permissions';

/** Badge counts derived from already-open listeners (no extra reads) plus cheap admin counts. */
export function useBadges() {
  const { notifications, messages, profile, member, members } = useSession();
  const [review, setReview] = useState(0);
  const admin = isAdmin(member);

  useEffect(() => {
    if (!admin) return;
    let alive = true;
    const load = () =>
      getCountFromServer(query(collection(db, tripPath('expenses')), where('status', '==', 'pending')))
        .then((r) => alive && setReview(r.data().count))
        .catch(() => undefined);
    load();
    const t = setInterval(load, 5 * 60_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [admin, notifications.length]);

  return {
    chat: unreadCount(messages, profile?.chatLastReadAt, member?.uid, 'senderUid'),
    notifications: unreadCount(notifications, profile?.notifLastReadAt, member?.uid, 'createdBy'),
    approvals: admin ? members.filter((m) => m.status === 'pending').length : 0,
    review: admin ? review : 0,
  };
}
