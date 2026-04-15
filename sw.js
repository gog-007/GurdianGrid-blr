const CACHE_NAME = 'sentinel-v3';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './styles.css',
  './utils.js',
  './app.js',
  './tests.js',
  './manifest.json',
  './data/grid.json',
  './app.yaml',
  './logo.svg',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keyList) => {
      return Promise.all(
        keyList.map((key) => {
          if (key !== CACHE_NAME) return caches.delete(key);
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      return cachedResponse || fetch(event.request).then(response => {
        return caches.open(CACHE_NAME).then(cache => {
          if (event.request.method !== 'POST' && event.request.url.startsWith('http')) {
             cache.put(event.request, response.clone());
          }
          return response;
        });
      });
    }).catch(() => {
      return new Response('Offline and not cached', { status: 503, statusText: 'Service Unavailable' });
    })
  );
});
