// Aqua City Service Worker — basic offline cache
const CACHE = 'aquacity-v2';
const PRECACHE = [
  '/app/',
  '/app/index.html',
  '/app/app.css',
  '/app/app.js',
  '/app/manifest.json',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  // Only cache GET requests
  if (e.request.method !== 'GET') return;
  // Don't cache API calls — always fresh
  if (e.request.url.includes('/api/')) return;

  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});
