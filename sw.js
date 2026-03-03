// InvestIQ Service Worker
// Caches the app shell for instant offline loading

const CACHE_NAME = 'investiq-v1';

// Core assets to cache on install
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  // External fonts and scripts cached on first load
];

// External CDN resources to cache
const CDN_URLS = [
  'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;0,600;0,700;1,300;1,400;1,600&family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;1,9..40,300&family=IBM+Plex+Mono:wght@300;400;500&family=Inter:wght@300;400;500;600&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js',
  'https://cdn.jsdelivr.net/npm/firebase@10.12.2/firebase-app-compat.min.js',
  'https://cdn.jsdelivr.net/npm/firebase@10.12.2/firebase-auth-compat.min.js',
  'https://cdn.jsdelivr.net/npm/firebase@10.12.2/firebase-firestore-compat.min.js',
];

// ── Install: cache all core assets ──
self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      console.log('[SW] Pre-caching app shell');
      return cache.addAll(PRECACHE_URLS);
    }).then(function() {
      return self.skipWaiting(); // Activate immediately
    })
  );
});

// ── Activate: clean up old caches ──
self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(cacheNames) {
      return Promise.all(
        cacheNames
          .filter(function(name) { return name !== CACHE_NAME; })
          .map(function(name) {
            console.log('[SW] Deleting old cache:', name);
            return caches.delete(name);
          })
      );
    }).then(function() {
      return self.clients.claim(); // Take control immediately
    })
  );
});

// ── Fetch: serve from cache, fall back to network ──
self.addEventListener('fetch', function(event) {
  const url = new URL(event.request.url);

  // Skip non-GET requests and Firebase API calls
  if (event.request.method !== 'GET') return;
  if (url.hostname.includes('firestore.googleapis.com')) return;
  if (url.hostname.includes('firebase.googleapis.com')) return;
  if (url.hostname.includes('identitytoolkit.googleapis.com')) return;
  if (url.hostname.includes('securetoken.googleapis.com')) return;

  // Strategy: Cache First for app shell and CDN assets
  // Network First for everything else
  const isCDN = url.hostname.includes('googleapis.com') ||
                url.hostname.includes('gstatic.com') ||
                url.hostname.includes('jsdelivr.net') ||
                url.hostname.includes('cloudflare.com') ||
                url.hostname.includes('fonts.gstatic.com');

  const isAppShell = url.pathname === '/' ||
                     url.pathname === '/index.html' ||
                     url.pathname === '/manifest.json';

  if (isAppShell || isCDN) {
    // Cache First strategy
    event.respondWith(
      caches.match(event.request).then(function(cachedResponse) {
        if (cachedResponse) {
          // Return cached, update in background
          fetch(event.request).then(function(networkResponse) {
            if (networkResponse && networkResponse.status === 200) {
              caches.open(CACHE_NAME).then(function(cache) {
                cache.put(event.request, networkResponse.clone());
              });
            }
          }).catch(function() {});
          return cachedResponse;
        }
        // Not in cache — fetch and store
        return fetch(event.request).then(function(networkResponse) {
          if (!networkResponse || networkResponse.status !== 200) {
            return networkResponse;
          }
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then(function(cache) {
            cache.put(event.request, responseToCache);
          });
          return networkResponse;
        }).catch(function() {
          // Offline fallback for app shell
          if (isAppShell) {
            return caches.match('/index.html');
          }
        });
      })
    );
  } else {
    // Network First for other requests
    event.respondWith(
      fetch(event.request).catch(function() {
        return caches.match(event.request);
      })
    );
  }
});
