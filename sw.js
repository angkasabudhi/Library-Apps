/**
 * Library Management System - Service Worker
 * File: sw.js
 */

const CACHE_NAME = 'pustaka-kita-v3';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './config.js',
  './app.js',
  './manifest.json',
  'https://cdn.tailwindcss.com',
  'https://unpkg.com/lucide@latest',
  'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap',
  'https://fonts.gstatic.com/s/inter/v18/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuLyfMZhrib2Bg-4.woff2'
];

// Install Event - Pre-cache Assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[Service Worker] Caching App Shell');
        // Use addAll with map and catch to prevent the entire installation from failing if one resource is offline
        return Promise.allSettled(
          ASSETS_TO_CACHE.map(url => {
            return cache.add(url).catch(err => {
              console.warn(`[Service Worker] Failed to cache: ${url}`, err);
            });
          })
        );
      })
      .then(() => self.skipWaiting())
  );
});

// Activate Event - Clean up old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keyList => {
      return Promise.all(keyList.map(key => {
        if (key !== CACHE_NAME) {
          console.log('[Service Worker] Removing old cache', key);
          return caches.delete(key);
        }
      }));
    }).then(() => self.clients.claim())
  );
});

// Fetch Event - Serve Cached Assets when offline, otherwise hit network
self.addEventListener('fetch', event => {
  // Only handle GET requests and local/safe URLs
  if (event.request.method !== 'GET') return;
  
  // Skip browser extensions, chrome-extension URLs
  if (!event.request.url.startsWith(self.location.origin) && !event.request.url.startsWith('https://')) return;

  event.respondWith(
    caches.match(event.request)
      .then(cachedResponse => {
        if (cachedResponse) {
          // Fetch update in the background for next time (Stale-While-Revalidate pattern)
          fetch(event.request)
            .then(networkResponse => {
              if (networkResponse.status === 200) {
                caches.open(CACHE_NAME).then(cache => cache.put(event.request, networkResponse));
              }
            })
            .catch(() => {/* Ignore network update errors when offline */});
            
          return cachedResponse;
        }

        // Fallback to Network
        return fetch(event.request).then(networkResponse => {
          // Cache newly requested resources if valid
          if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then(cache => {
              cache.put(event.request, responseToCache);
            });
          }
          return networkResponse;
        });
      })
  );
});
