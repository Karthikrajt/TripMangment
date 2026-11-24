/**
 * Global session state: Firebase user, my membership, the trip, and the
 * approved member list (shared by every page to avoid duplicate listeners).
 */
import { useMemo } from 'react';
import { create } from 'zustand';
import { onAuthStateChanged, signInWithPopup, signInWithRedirect, signOut, type User } from 'firebase/auth';
import { collection, doc, limit, onSnapshot, orderBy, query, where, type Unsubscribe } from 'firebase/firestore';
import { auth, db, googleProvider, tripPath } from '../lib/firebase';
import { upsertUserProfile } from '../services/users';
import { getPublicSummary, type PublicSummary } from '../services/trip';
import type { AppNotification, ChatMessage, Member, Trip, UserProfile } from '../domain/types';
import { isAdmin as isAdminFn } from '../domain/permissions';
import { peopleOf, personIdOf, sharesFromTrip } from '../domain/people';
import { CHAT_PAGE_SIZE, NOTIFICATION_PAGE_SIZE } from '../config/constants';
import { errorMessage } from '../lib/retry';
import { useSync } from '../lib/sync';

interface SessionState {
  authReady: boolean;
  user: User | null;
  profile: UserProfile | null;
  memberLoaded: boolean;
  member: Member | null;
  summary: PublicSummary | null | undefined; // undefined = loading
  trip: Trip | null;
  members: Member[];
  notifications: AppNotification[];
  messages: ChatMessage[];
  error: string | null;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  refreshSummary: () => Promise<void>;
}

let unsubs: Unsubscribe[] = [];
let approvedUnsubs: Unsubscribe[] = [];
const stopAll = (list: Unsubscribe[]) => list.splice(0).forEach((u) => u());

export const useSession = create<SessionState>((set) => ({
  authReady: false,
  user: null,
  profile: null,
  memberLoaded: false,
  member: null,
  summary: undefined,
  trip: null,
  members: [],
  notifications: [],
  messages: [],
  error: null,

  async signIn() {
    set({ error: null });
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (e) {
      const code = (e as { code?: string }).code;
      // Popups are unreliable in installed iOS PWAs – fall back to redirect.
      if (code === 'auth/popup-blocked' || code === 'auth/operation-not-supported-in-this-environment') {
        await signInWithRedirect(auth, googleProvider);
        return;
      }
      set({ error: errorMessage(e) });
    }
  },

  async signOut() {
    stopAll(approvedUnsubs);
    stopAll(unsubs);
    await signOut(auth);
  },

  async refreshSummary() {
    try {
      set({ summary: await getPublicSummary() });
    } catch {
      set({ summary: null });
    }
  },
}));

function startApprovedListeners(me: Member) {
  stopAll(approvedUnsubs);
  const s = useSession.setState;
  const markSynced = useSync.getState().markSynced;
  approvedUnsubs.push(
    onSnapshot(doc(db, tripPath()), { includeMetadataChanges: true }, (snap) => {
      s({ trip: snap.exists() ? ({ id: snap.id, ...snap.data() } as Trip) : null });
      if (!snap.metadata.fromCache) markSynced('trip');
    }),
    onSnapshot(collection(db, tripPath('members')), (snap) => {
      s({ members: snap.docs.map((d) => d.data() as Member).sort((a, b) => a.displayName.localeCompare(b.displayName)) });
    }),
    onSnapshot(
      query(
        collection(db, tripPath('notifications')),
        where('target', 'in', isAdminFn(me) ? ['all', 'admins', me.uid] : ['all', me.uid]),
        orderBy('createdAt', 'desc'),
        limit(NOTIFICATION_PAGE_SIZE),
      ),
      (snap) => s({ notifications: snap.docs.map((d) => ({ id: d.id, ...d.data() }) as AppNotification) }),
      (e) => console.warn('notifications', e),
    ),
    onSnapshot(
      query(collection(db, tripPath('messages')), orderBy('createdAt', 'desc'), limit(CHAT_PAGE_SIZE)),
      (snap) => s({ messages: snap.docs.map((d) => ({ id: d.id, ...d.data() }) as ChatMessage).reverse() }),
      (e) => console.warn('messages', e),
    ),
  );
}

let lastApprovalKey = '';

onAuthStateChanged(auth, (user) => {
  stopAll(unsubs);
  stopAll(approvedUnsubs);
  lastApprovalKey = '';
  const s = useSession.setState;
  s({ user, authReady: true, member: null, memberLoaded: !user, trip: null, members: [], notifications: [], messages: [], profile: null });
  if (!user) return;

  upsertUserProfile(user).catch((e) => console.warn('profile upsert', e));
  useSession.getState().refreshSummary();

  unsubs.push(
    onSnapshot(doc(db, 'users', user.uid), (snap) => s({ profile: snap.exists() ? (snap.data() as UserProfile) : null }), () => undefined),
    onSnapshot(
      doc(db, tripPath('members', user.uid)),
      { includeMetadataChanges: true },
      (snap) => {
        // Wait for the server to confirm membership changes (e.g. right after
        // first-run setup) so listeners are not opened before the rules allow them.
        if (snap.metadata.hasPendingWrites) return;
        const member = snap.exists() ? (snap.data() as Member) : null;
        s({ member, memberLoaded: true });
        const key = member ? `${member.status}:${member.role}` : '';
        if (key === lastApprovalKey) return;
        lastApprovalKey = key;
        if (member?.status === 'approved') {
          startApprovedListeners(member);
          // Save all trip details (and ticket files) on the phone for offline use.
          void import('../lib/offlineSync').then(({ warmOfflineCache }) => warmOfflineCache());
        }
        else {
          stopAll(approvedUnsubs);
          s({ trip: null, members: [], notifications: [], messages: [] });
        }
      },
      (e) => s({ memberLoaded: true, error: errorMessage(e) }),
    ),
  );
});

// ---------- selectors ----------
export const useMe = () => useSession((s) => s.member);
export const useIsAdmin = () => useSession((s) => isAdminFn(s.member));
/** Travellers to plan and split for (see domain/people.ts). */
export const useApprovedMembers = () => {
  const members = useSession((s) => s.members);
  return useMemo(() => peopleOf(members), [members]);
};
export const usePeople = useApprovedMembers;
/** The person id the signed-in user acts as (their linked traveller, or themselves). */
export const useMyPersonId = () => useSession((s) => personIdOf(s.member));
/** Default child / infant share % from Trip Settings. */
export const useShareDefaults = () => {
  const child = useSession((s) => s.trip?.childSharePercent);
  const infant = useSession((s) => s.trip?.infantSharePercent);
  return sharesFromTrip({ childSharePercent: child, infantSharePercent: infant });
};

export function memberName(members: Member[], uid: string): string {
  return members.find((m) => m.uid === uid)?.displayName ?? 'Former member';
}

export function unreadCount<T extends { createdAt: { toMillis?: () => number } | null }>(items: T[], lastRead: { toMillis?: () => number } | null | undefined, excludeUid?: string, uidKey?: keyof T): number {
  const t = lastRead?.toMillis?.() ?? 0;
  return items.filter((i) => (i.createdAt?.toMillis?.() ?? Date.now()) > t && (!excludeUid || !uidKey || i[uidKey] !== excludeUid)).length;
}

