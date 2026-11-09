// The production build injects the exact asset list and a content-based cache version.
const CACHE = 'voltos-shell-development';
const ASSETS = ['/', '/index.html', '/icon.svg', '/manifest.webmanifest'];
self.addEventListener('install', event => {
 event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)));
});
self.addEventListener('activate', event => {
 event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('voltos-shell-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
 const request = event.request, url = new URL(request.url);
 if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
 if (request.mode === 'navigate') {
  event.respondWith(fetch(request).catch(() => caches.match('/index.html').then(cached => cached || Response.error())));
 } else if (ASSETS.includes(url.pathname)) {
  // Only same-origin, explicitly precached build assets enter this branch.
  // Vite serves them with Vary: Origin; module requests and install-time fetches
  // can carry different Origin headers despite referring to the identical asset.
  event.respondWith(caches.match(request, { ignoreVary: true }).then(cached => cached || fetch(request)));
 }
});
