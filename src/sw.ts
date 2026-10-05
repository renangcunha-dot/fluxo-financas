/// <reference lib="webworker" />
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { CacheFirst } from 'workbox-strategies';

declare const self: ServiceWorkerGlobalScope;

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();
if (import.meta.env.PROD) {
  registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html')));
}

// Worker do pdf.js (grande): baixa só no primeiro PDF importado e depois funciona offline.
registerRoute(({ url }) => url.pathname.startsWith('/assets/pdf.worker') && url.pathname.endsWith('.mjs'), new CacheFirst({ cacheName: 'pdf-worker' }));

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

// Ações do push ("Bloquear" / "Continuar") voltam para o app aberto.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const action = event.action || 'open';
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      let client: WindowClient | null = windows[0] ?? null;
      if (client) client = await client.focus();
      else client = await self.clients.openWindow('/');
      client?.postMessage({ type: 'notification-action', action, data: event.notification.data });
    })(),
  );
});
