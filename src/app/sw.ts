/// <reference lib="esnext" />
/// <reference lib="webworker" />
import { defaultCache } from '@serwist/turbopack/worker';
import type { PrecacheEntry, SerwistGlobalConfig } from 'serwist';
import { Serwist } from 'serwist';

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: defaultCache,
  // Navigasi dokumen yang gagal (offline & belum ada di cache) -> halaman offline.
  fallbacks: {
    entries: [
      {
        url: '/~offline',
        matcher({ request }) {
          return request.destination === 'document';
        },
      },
    ],
  },
});

serwist.addEventListeners();

// ───────────── Web Push ─────────────
interface PushPayload {
  title?: string;
  body?: string;
  url?: string;
  tag?: string;
}

/** Hanya path internal; cegah notifikasi mengarahkan ke situs lain. */
function safePath(url: unknown): string {
  return typeof url === 'string' && url.startsWith('/') && !url.startsWith('//') ? url : '/';
}

self.addEventListener('push', (event) => {
  let data: PushPayload = {};
  try {
    data = (event.data?.json() as PushPayload) ?? {};
  } catch {
    data = { body: event.data?.text() };
  }
  event.waitUntil(
    self.registration.showNotification(data.title ?? 'VallsHangout', {
      body: data.body,
      icon: '/android-chrome-192x192.png',
      badge: '/favicon-32x32.png',
      tag: data.tag,
      data: { url: safePath(data.url) },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL(safePath(event.notification.data?.url), self.location.origin).href;

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of windows) {
        try {
          const focused = await client.focus();
          if (focused.url !== target) await focused.navigate(target);
          return;
        } catch {
          /* coba klien berikutnya / buka jendela baru */
        }
      }
      await self.clients.openWindow(target);
    })(),
  );
});
