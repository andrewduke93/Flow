// sw.js

const CACHE_NAME = 'flow-v2';

// App Shell: The minimal set of files needed to run the app offline.
// Using root-relative paths to be unambiguous.
const APP_SHELL_URLS = [
  '/Flow/', // The root index.html
  '/Flow/manifest.json',
  '/Flow/favicon.png',
  '/Flow/icons/icon-192x192.png',
  '/Flow/icons/icon-512x512.png'
];

// Install event: Pre-cache the app shell.
self.addEventListener('install', event => {
  console.log('[Service Worker] Install');
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('[Service Worker] Caching App Shell');
      // Use addAll to fetch and cache all shell assets.
      return cache.addAll(APP_SHELL_URLS);
    }).then(() => {
      // Force the waiting service worker to become the active service worker.
      return self.skipWaiting();
    })
  );
});

// Activate event: Clean up old caches.
self.addEventListener('activate', event => {
  console.log('[Service Worker] Activate');
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          // If a cache's name is not our current cache, delete it.
          if (cacheName !== CACHE_NAME) {
            console.log('[Service Worker] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      // Tell the active service worker to take control of the page immediately.
      return self.clients.claim();
    })
  );
});

// Fetch event: Handle requests with different strategies.
self.addEventListener('fetch', event => {
  const { request } = event;

  // Strategy 1: Network-Only for Google APIs.
  // These are dynamic and must always be fetched from the network.
  if (request.url.includes('googleapis.com') || request.url.includes('google.com/gsi')) {
    event.respondWith(fetch(request));
    return;
  }

  // Strategy 2: Cache-First, falling back to Network for all other GET requests.
  if (request.method === 'GET') {
    event.respondWith(
      caches.open(CACHE_NAME).then(cache => {
        return cache.match(request).then(cachedResponse => {
          // Cache hit: Return the cached response immediately.
          if (cachedResponse) {
            return cachedResponse;
          }

          // Cache miss: Go to the network.
          return fetch(request).then(networkResponse => {
            // If the fetch is successful, cache the new response for next time.
            // Check for valid responses to cache (don't cache errors or opaque responses)
            if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
              cache.put(request, networkResponse.clone());
            }
            return networkResponse;
          }).catch(() => {
            // Network failed.
            // Strategy 3: Offline Fallback for navigation requests.
            // If the user is trying to navigate to a new page, serve the SPA shell.
            if (request.mode === 'navigate') {
              console.log('[Service Worker] Serving offline fallback for navigation.');
              return cache.match('/'); // Serve the root page
            }
          });
        });
      })
    );
  }
});