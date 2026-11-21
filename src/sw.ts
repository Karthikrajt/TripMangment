/// <reference lib="webworker" />
/**
 * Service worker:
 *  - precaches the app shell (offline start),
 *  - SPA navigation fallback,
 *  - Firebase Cloud Messaging background notifications.
 * Trip documents (tickets, receipts) are NEVER cached here – only the
 * user-initiated "Save for offline" copies in IndexedDB.
 */
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { CacheFirst } from 'workbox-strategies';
import { initializeApp } from 'firebase/app';
import { getMessaging, onBackgroundMessage } from 'firebase/messaging/sw';

declare const self: ServiceWorkerGlobalScope;

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();
registerRoute(new NavigationRoute(createHandlerBoundToURL('/index.html'), { denylist: [/^\/__/] }));

// Google profile photos: small, safe to cache.
registerRoute(({ url }) => url.hostname.endsWith('googleusercontent.com'), new CacheFirst({ cacheName: 'avatars' }));

self.addEventListener('message', (e) => {
  if (e.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

const cfg = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

if (cfg.apiKey && cfg.messagingSenderId) {
  try {
    const messaging = getMessaging(initializeApp(cfg));
    // Messages with a `notification` payload are shown automatically by FCM.
    onBackgroundMessage(messaging, (payload) => {
      if (payload.notification) return;
      const title = payload.data?.title ?? 'Trip update';
      self.registration.showNotification(title, {
        body: payload.data?.body ?? '',
        icon: '/icons/icon-192.png',
        badge: '/icons/badge-72.png',
        data: { link: payload.data?.link ?? '/notifications' },
      });
    });
  } catch {
    /* messaging unsupported in this browser */
  }
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const link = (event.notification.data?.FCM_MSG?.data?.link ?? event.notification.data?.link ?? '/notifications') as string;
  const target = new URL(link, self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const c of clients) {
        if ('focus' in c) {
          c.navigate(target).catch(() => undefined);
          return c.focus();
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});
