const CACHE = 'itg-picker-v7';
const REQUIRED = [
  './',
  './index.html',
  './app.js',
  './style.css',
  './manifest.json',
  './songs.json',
  './tick.wav',
  './select.wav',
  './icon-192.png',
  './icon-512.png',
];
const OPTIONAL = ['./energizer.wav'];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(REQUIRED);
    await Promise.all(OPTIONAL.map(url => cache.add(url).catch(() => {})));
  })());
});

// Page asks us to take over once the user opts into the update.
self.addEventListener('message', e => {
  if (e.data === 'skipWaiting') self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});
