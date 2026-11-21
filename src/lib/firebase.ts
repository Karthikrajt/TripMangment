import { initializeApp, type FirebaseApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, GoogleAuthProvider, signInWithCredential } from 'firebase/auth';
import {
  connectFirestoreEmulator,
  initializeFirestore,
  memoryLocalCache,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from 'firebase/firestore';
import { env } from '../config/env';

/**
 * "Shared device" mode keeps Firestore data in memory only, so nothing about
 * the trip remains on a borrowed/shared computer after the tab closes.
 */
const SHARED_KEY = 'tm.sharedDevice';
export const isSharedDevice = () => {
  try {
    return localStorage.getItem(SHARED_KEY) === '1';
  } catch {
    return true;
  }
};
export const setSharedDevice = (shared: boolean) => {
  try {
    if (shared) localStorage.setItem(SHARED_KEY, '1');
    else localStorage.removeItem(SHARED_KEY);
  } catch {
    /* ignore */
  }
};

export const app: FirebaseApp = initializeApp(env.firebase);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export const db: Firestore = initializeFirestore(app, {
  localCache: isSharedDevice()
    ? memoryLocalCache()
    : persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});

if (env.useEmulators) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  // Emulator-only helper for automated UI tests: the Auth emulator accepts
  // unsigned Google ID tokens. Never present in a non-emulator build.
  const w = window as unknown as { __e2eSignIn: (email: string, name: string) => Promise<unknown>; __e2eToken: () => Promise<string | undefined> };
  w.__e2eSignIn = (email, name) =>
    signInWithCredential(auth, GoogleAuthProvider.credential(JSON.stringify({ sub: email, email, email_verified: true, name })));
  w.__e2eToken = async () => auth.currentUser?.getIdToken();
}

export const tripId = env.tripId;
export const tripPath = (...segments: string[]) => ['trips', tripId, ...segments].join('/');
