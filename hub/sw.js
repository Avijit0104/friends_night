/* Friend's Night service worker: the page works offline-ish and installs as an app.
 * Page, script and games.json: network first (always fresh), cached copy when offline.
 * Images and fonts: cache first. Bump VERSION when you want every phone to drop the old cache. */
const VERSION = 'fn-v1';
const CORE = ['./', 'index.html', 'style.css', 'app.js', 'games.json', 'icon.svg', 'manifest.webmanifest'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.pathname.startsWith('/status/')) return; // live checks never come from cache
  const sameOrigin = url.origin === location.origin;
  const isAsset = /\.(png|svg|jpg|jpeg|webp|woff2?)$/.test(url.pathname) || url.host.includes('fonts.g');
  if (!sameOrigin && !isAsset) return;
  if (isAsset) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok || res.type === 'opaque') { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
      return res;
    })));
  } else {
    e.respondWith(fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req)));
  }
});
