// Basic Service Worker for PWA compliance
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  // Never intercept non-GET requests, API calls, or cross-origin requests
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) {
    return;
  }

  event.respondWith(
    fetch(req).catch(() => new Response('', { status: 503, statusText: 'Offline' }))
  );
});
