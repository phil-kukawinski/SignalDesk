// SignalDesk service worker: lets the app be installed, keeps a copy of the app shell for
// spotty connections, and shows push notifications.
const CACHE = 'signaldesk-shell-v1';

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(['/', '/index.html', '/manifest.webmanifest', '/icons/icon-192.png'])).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});

// App files: network first so updates show up right away, falling back to the cached copy offline.
// API calls and other sites always go straight to the network.
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  event.respondWith(fetch(event.request).then((response) => {
    if (response.ok) {
      const copy = response.clone();
      caches.open(CACHE).then((cache) => cache.put(event.request, copy)).catch(() => {});
    }
    return response;
  }).catch(() => caches.match(event.request).then((cached) => cached || caches.match('/index.html'))));
});

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { title: event.data?.text() || 'SignalDesk' }; }
  event.waitUntil(self.registration.showNotification(data.title || 'SignalDesk', {
    body: data.body || '', icon: '/icons/icon-192.png', badge: '/icons/icon-192.png', data: { view: data.view || '' }
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = `/${event.notification.data?.view ? `#view=${encodeURIComponent(event.notification.data.view)}` : ''}`;
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
    const open = windows.find((client) => new URL(client.url).origin === self.location.origin);
    if (open) { open.postMessage({ type: 'signaldesk-open-view', view: event.notification.data?.view || '' }); return open.focus(); }
    return self.clients.openWindow(target);
  }));
});
