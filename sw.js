/* Service worker for The Item Ledger.
   Strategy tuned so new versions install and take effect promptly:
   - HTML and the app's own JS/CSS are fetched network-first (fresh when online),
     falling back to cache only when offline.
   - The service worker file and index are always revalidated, so a new build is
     noticed on the next launch while online.
   - skipWaiting + clients.claim + a controllerchange reload (in the page) mean
     the update applies without the user manually clearing caches.
   Bump CACHE_VERSION whenever the app files change. */
const CACHE_VERSION = 'item-ledger-v34';
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png'
];

self.addEventListener('install', event => {
  // Activate the new worker immediately rather than waiting for old tabs to close.
  event.waitUntil(
    caches.open(CACHE_VERSION).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Allow the page to tell a waiting worker to activate at once.
self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const isHTML = req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html');
  // Treat the app's own code (index + any .js/.css/.webmanifest) as network-first
  // so a new deploy is picked up immediately while online.
  const isAppCode = isHTML || /\.(js|css|webmanifest)$/.test(url.pathname) || url.pathname.endsWith('/');

  if (isAppCode) {
    event.respondWith(
      fetch(req, { cache: 'no-store' }).then(res => {
        const copy = res.clone();
        caches.open(CACHE_VERSION).then(c => c.put(isHTML ? './index.html' : req, copy));
        return res;
      }).catch(() => caches.match(req).then(r => r || caches.match('./index.html')).then(r => r || caches.match('./')))
    );
  } else {
    // Static assets (icons, images): cache-first for speed, still updating in the background.
    event.respondWith(
      caches.match(req).then(cached => cached || fetch(req).then(res => {
        const copy = res.clone();
        caches.open(CACHE_VERSION).then(c => c.put(req, copy));
        return res;
      }).catch(() => cached))
    );
  }
});
