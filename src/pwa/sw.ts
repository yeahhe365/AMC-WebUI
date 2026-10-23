/// <reference lib="WebWorker" />

import { clientsClaim } from 'workbox-core';
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { ExpirationPlugin } from 'workbox-expiration';
import { NetworkOnly, StaleWhileRevalidate } from 'workbox-strategies';

declare let self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<string | { url: string; revision: string | null }>;
};

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    void self.skipWaiting();
  }
});

clientsClaim();
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

const baseUrl = import.meta.env.BASE_URL || '/';
const runtimeConfigPath = `${baseUrl}runtime-config.js`.replace(/\/{2,}/g, '/');
const indexPath = `${baseUrl}index.html`.replace(/\/{2,}/g, '/');

const navigationRoute = new NavigationRoute(createHandlerBoundToURL(indexPath), {
  denylist: [/^\/api\//],
});

registerRoute(navigationRoute);

// Network-only routes must be registered before the destination-based cache route
// so requests to /api/ (such as /api/image-proxy with destination='image') are
// never intercepted by StaleWhileRevalidate.
registerRoute(
  ({ url }) =>
    url.origin === self.location.origin &&
    (url.pathname === runtimeConfigPath ||
      url.pathname === '/runtime-config.js' ||
      url.pathname === '/api' ||
      url.pathname.startsWith('/api/')),
  new NetworkOnly(),
);

registerRoute(
  ({ request, url }) =>
    url.origin === self.location.origin &&
    ['style', 'script', 'worker', 'font', 'image'].includes(request.destination) &&
    url.pathname !== runtimeConfigPath &&
    url.pathname !== '/runtime-config.js' &&
    url.pathname !== '/api' &&
    !url.pathname.startsWith('/api/'),
  new StaleWhileRevalidate({
    cacheName: 'static-assets',
    plugins: [new ExpirationPlugin({ maxEntries: 128, maxAgeSeconds: 30 * 24 * 60 * 60, purgeOnQuotaError: true })],
  }),
);
