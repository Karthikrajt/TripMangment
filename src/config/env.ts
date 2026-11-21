const e = import.meta.env;

export const env = {
  firebase: {
    apiKey: e.VITE_FIREBASE_API_KEY,
    authDomain: e.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: e.VITE_FIREBASE_PROJECT_ID,
    storageBucket: e.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: e.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: e.VITE_FIREBASE_APP_ID,
  },
  vapidKey: e.VITE_FIREBASE_VAPID_KEY ?? '',
  tripId: e.VITE_TRIP_ID || 'main',
  bootstrapAdminEmail: (e.VITE_BOOTSTRAP_ADMIN_EMAIL ?? '').toLowerCase(),
  supabaseUrl: (e.VITE_SUPABASE_URL ?? '').replace(/\/$/, ''),
  supabaseAnonKey: e.VITE_SUPABASE_ANON_KEY ?? '',
  useEmulators: e.VITE_USE_EMULATORS === 'true',
};

export const missingConfig = (['apiKey', 'authDomain', 'projectId', 'appId'] as const).filter((k) => !env.firebase[k]);
