var CACHE_NAME = 'mmap-tiles-v1';
var APP_CACHE = 'mmap-app-v1';

var APP_FILES = [
    '/',
    '/index.html',
    '/app.js',
    '/style.css',
    '/lib/leaflet/leaflet.js',
    '/lib/leaflet/leaflet.css',
    '/lib/leaflet/images/marker-icon.png',
    '/lib/leaflet/images/marker-icon-2x.png',
    '/lib/leaflet/images/marker-shadow.png',
    '/lib/leaflet/images/layers.png',
    '/lib/leaflet/images/layers-2x.png',
];

self.addEventListener('install', function (e) {
    e.waitUntil(
        caches.open(APP_CACHE).then(function (cache) {
            return cache.addAll(APP_FILES);
        })
    );
    self.skipWaiting();
});

self.addEventListener('activate', function (e) {
    e.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', function (e) {
    var url = e.request.url;

    // Cache map tiles (OpenStreetMap)
    if (url.indexOf('tile.openstreetmap.org') !== -1) {
        e.respondWith(
            caches.open(CACHE_NAME).then(function (cache) {
                return cache.match(e.request).then(function (cached) {
                    if (cached) return cached;
                    return fetch(e.request).then(function (response) {
                        if (response.ok) {
                            cache.put(e.request, response.clone());
                        }
                        return response;
                    }).catch(function () {
                        // Offline and no cache - return transparent tile
                        return new Response('', { status: 404 });
                    });
                });
            })
        );
        return;
    }

    // App files: cache-first
    e.respondWith(
        caches.match(e.request).then(function (cached) {
            return cached || fetch(e.request);
        })
    );
});
