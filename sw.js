/* Souvenir service worker — app shell offline + opportunistic map-tile cache */
var CORE = 'souvenir-core-v1';
var TILES = 'souvenir-tiles-v1';
var CORE_URLS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
];
var TILE_LIMIT = 600;

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CORE).then(function (c) {
      return Promise.all(CORE_URLS.map(function (u) {
        return c.add(u).catch(function () { /* tolerate one miss */ });
      }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) {
        return k !== CORE && k !== TILES;
      }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

function trimTiles() {
  caches.open(TILES).then(function (c) {
    c.keys().then(function (keys) {
      if (keys.length <= TILE_LIMIT) return;
      keys.slice(0, keys.length - TILE_LIMIT).forEach(function (k) { c.delete(k); });
    });
  });
}

self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return;
  var url = new URL(e.request.url);

  // Live APIs: always network (search must be fresh; fails gracefully in-app)
  if (url.hostname.indexOf('nominatim') !== -1 || url.hostname.indexOf('googleapis') !== -1) return;

  // Map tiles: stale-while-revalidate
  if (url.hostname.indexOf('basemaps.cartocdn.com') !== -1) {
    e.respondWith(
      caches.open(TILES).then(function (c) {
        return c.match(e.request).then(function (hit) {
          var refresh = fetch(e.request).then(function (resp) {
            if (resp && resp.ok) { c.put(e.request, resp.clone()); trimTiles(); }
            return resp;
          }).catch(function () { return hit; });
          return hit || refresh;
        });
      })
    );
    return;
  }

  // App shell + CDN: cache-first
  if (url.origin === location.origin || url.hostname === 'unpkg.com') {
    e.respondWith(
      caches.match(e.request).then(function (hit) {
        return hit || fetch(e.request).then(function (resp) {
          if (resp && resp.ok) {
            var clone = resp.clone();
            caches.open(CORE).then(function (c) { c.put(e.request, clone); });
          }
          return resp;
        });
      })
    );
  }
});
