// Duty Tracker Pro - Service Worker
// Version: 4.3.0
// Cache Name with versioning
const CACHE_NAME = 'duty-tracker-pro-v4.3.0';
const RUNTIME_CACHE = 'duty-tracker-pro-runtime-v1';

// Assets to cache on install (Core App Shell)
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  'https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
  'https://checkout.razorpay.com/v1/checkout.js',
  'https://www.gstatic.com/firebasejs/9.22.0/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/9.22.0/firebase-database-compat.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.28/jspdf.plugin.autotable.min.js',
  'https://cdn.jsdelivr.net/npm/chart.js',
  'https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js'
];

// Install Event - Cache core assets
self.addEventListener('install', (event) => {
  console.log('[Service Worker] Installing...');
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[Service Worker] Caching app shell');
        return cache.addAll(PRECACHE_ASSETS);
      })
      .then(() => {
        console.log('[Service Worker] Skip waiting to activate immediately');
        return self.skipWaiting();
      })
      .catch((error) => {
        console.error('[Service Worker] Installation failed:', error);
      })
  );
});

// Activate Event - Clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[Service Worker] Activating...');
  
  const currentCaches = [CACHE_NAME, RUNTIME_CACHE];
  
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return cacheNames.filter((cacheName) => !currentCaches.includes(cacheName));
      })
      .then((cachesToDelete) => {
        return Promise.all(cachesToDelete.map((cacheToDelete) => {
          console.log('[Service Worker] Deleting old cache:', cacheToDelete);
          return caches.delete(cacheToDelete);
        }));
      })
      .then(() => {
        console.log('[Service Worker] Claiming clients');
        return self.clients.claim();
      })
  );
});

// Fetch Event - Network first with cache fallback strategy
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  
  // Skip cross-origin requests for caching (except CDNs we trust)
  const isSameOrigin = url.origin === self.location.origin;
  
  // For HTML pages - Network First, then cache
  if (request.mode === 'navigate' || (request.method === 'GET' && request.headers.get('accept')?.includes('text/html'))) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Cache the fetched page for offline use
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseClone);
          });
          return response;
        })
        .catch(() => {
          // If network fails, return cached page
          return caches.match(request)
            .then((cachedResponse) => {
              if (cachedResponse) {
                return cachedResponse;
              }
              // Return offline page if no cache
              return caches.match('/offline.html');
            });
        })
    );
    return;
  }
  
  // For static assets (CSS, JS, Fonts) - Cache First, then network
  if (
    request.destination === 'style' ||
    request.destination === 'script' ||
    request.destination === 'font' ||
    request.destination === 'image'
  ) {
    event.respondWith(
      caches.match(request)
        .then((cachedResponse) => {
          if (cachedResponse) {
            // Return cached version
            return cachedResponse;
          }
          
          // Fetch from network and cache for future
          return fetch(request)
            .then((networkResponse) => {
              if (networkResponse && networkResponse.status === 200) {
                const responseClone = networkResponse.clone();
                caches.open(RUNTIME_CACHE).then((cache) => {
                  cache.put(request, responseClone);
                });
              }
              return networkResponse;
            })
            .catch(() => {
              // Return fallback for images if offline
              if (request.destination === 'image') {
                return caches.match('https://cdn-icons-png.flaticon.com/512/3135/3135715.png');
              }
              return new Response('Offline content not available', {
                status: 503,
                statusText: 'Service Unavailable',
                headers: new Headers({
                  'Content-Type': 'text/plain',
                }),
              });
            });
        })
    );
    return;
  }
  
  // For Firebase, API calls, and dynamic content - Network Only (no caching)
  if (
    url.href.includes('firebaseio.com') ||
    url.href.includes('imgbb.com') ||
    url.href.includes('razorpay.com') ||
    url.href.includes('paypal.com') ||
    url.href.includes('onesignal.com')
  ) {
    event.respondWith(
      fetch(request)
        .catch((error) => {
          console.error('[Service Worker] Network request failed:', error);
          return new Response(JSON.stringify({ error: 'Network connection required' }), {
            status: 503,
            headers: new Headers({ 'Content-Type': 'application/json' }),
          });
        })
    );
    return;
  }
  
  // Default: Network First with cache fallback
  event.respondWith(
    fetch(request)
      .then((response) => {
        // Cache successful GET requests for offline use
        if (request.method === 'GET' && response.status === 200) {
          const responseClone = response.clone();
          caches.open(RUNTIME_CACHE).then((cache) => {
            cache.put(request, responseClone);
          });
        }
        return response;
      })
      .catch(() => {
        return caches.match(request);
      })
  );
});

// Background Sync for Offline Actions
self.addEventListener('sync', (event) => {
  console.log('[Service Worker] Background sync event:', event.tag);
  
  if (event.tag === 'sync-attendance') {
    event.waitUntil(syncAttendanceData());
  } else if (event.tag === 'sync-advance') {
    event.waitUntil(syncAdvanceData());
  }
});

// Function to sync pending attendance data
async function syncAttendanceData() {
  const cache = await caches.open('pending-actions');
  const requests = await cache.keys();
  
  for (const request of requests) {
    try {
      const response = await fetch(request);
      if (response.ok) {
        await cache.delete(request);
        console.log('[Service Worker] Synced attendance data successfully');
        
        // Show notification after successful sync
        self.registration.showNotification('Duty Tracker Pro', {
          body: 'Your offline attendance has been synced!',
          icon: 'https://cdn-icons-png.flaticon.com/512/3135/3135715.png',
          badge: 'https://cdn-icons-png.flaticon.com/512/3135/3135715.png',
          vibrate: [200, 100, 200],
          tag: 'sync-success'
        });
      }
    } catch (error) {
      console.error('[Service Worker] Sync failed:', error);
    }
  }
}

// Function to sync pending advance data
async function syncAdvanceData() {
  const cache = await caches.open('pending-advance');
  const requests = await cache.keys();
  
  for (const request of requests) {
    try {
      const response = await fetch(request);
      if (response.ok) {
        await cache.delete(request);
        console.log('[Service Worker] Synced advance data successfully');
      }
    } catch (error) {
      console.error('[Service Worker] Advance sync failed:', error);
    }
  }
}

// Push Notification Handler
self.addEventListener('push', (event) => {
  console.log('[Service Worker] Push notification received');
  
  let data = {
    title: 'Duty Tracker Pro',
    body: 'Time to mark your attendance!',
    icon: 'https://cdn-icons-png.flaticon.com/512/3135/3135715.png',
    badge: 'https://cdn-icons-png.flaticon.com/512/3135/3135715.png',
    tag: 'attendance-reminder',
    vibrate: [200, 100, 200],
    requireInteraction: true
  };
  
  if (event.data) {
    try {
      data = Object.assign(data, event.data.json());
    } catch (e) {
      data.body = event.data.text();
    }
  }
  
  const options = {
    body: data.body,
    icon: data.icon,
    badge: data.badge,
    vibrate: data.vibrate,
    data: {
      url: data.url || '/',
      dateOfArrival: Date.now()
    },
    actions: [
      {
        action: 'mark-attendance',
        title: 'Mark Duty'
      },
      {
        action: 'check-report',
        title: 'View Report'
      },
      {
        action: 'close',
        title: 'Dismiss'
      }
    ],
    tag: data.tag,
    requireInteraction: data.requireInteraction,
    renotify: true
  };
  
  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// Notification Click Handler
self.addEventListener('notificationclick', (event) => {
  console.log('[Service Worker] Notification click received');
  
  event.notification.close();
  
  const action = event.action;
  const notificationData = event.notification.data;
  
  let urlToOpen = '/';
  
  if (action === 'mark-attendance') {
    urlToOpen = '/?action=attendance';
  } else if (action === 'check-report') {
    urlToOpen = '/?action=reports';
  } else if (notificationData && notificationData.url) {
    urlToOpen = notificationData.url;
  }
  
  event.waitUntil(
    clients.matchAll({
      type: 'window',
      includeUncontrolled: true
    })
    .then((windowClients) => {
      // Check if there is already a window/tab open with the target URL
      for (let i = 0; i < windowClients.length; i++) {
        const client = windowClients[i];
        if (client.url === urlToOpen && 'focus' in client) {
          return client.focus();
        }
      }
      // If not, open a new window/tab
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});

// Message from main thread
self.addEventListener('message', (event) => {
  console.log('[Service Worker] Message received:', event.data);
  
  if (event.data.type === 'CACHE_NEW_ASSETS') {
    event.waitUntil(
      caches.open(CACHE_NAME).then((cache) => {
        return cache.addAll(event.data.assets);
      })
    );
  } else if (event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Periodic Background Sync (if supported)
self.addEventListener('periodicsync', (event) => {
  console.log('[Service Worker] Periodic sync event:', event.tag);
  
  if (event.tag === 'daily-attendance-check') {
    event.waitUntil(
      (async () => {
        const now = new Date();
        const hour = now.getHours();
        
        // Send reminder between 7 PM and 9 PM
        if (hour >= 19 && hour <= 21) {
          const clients = await self.clients.matchAll();
          for (const client of clients) {
            client.postMessage({
              type: 'REMINDER_CHECK',
              timestamp: now.getTime()
            });
          }
        }
      })()
    );
  }
});

// Handle offline analytics
self.addEventListener('fetch', (event) => {
  // Track offline requests for analytics
  if (!navigator.onLine && event.request.method === 'GET') {
    const url = new URL(event.request.url);
    if (url.pathname.includes('/api/')) {
      event.waitUntil(
        (async () => {
          const cache = await caches.open('offline-analytics');
          const analyticsData = {
            url: event.request.url,
            timestamp: Date.now(),
            userAgent: event.request.headers.get('User-Agent')
          };
          await cache.put(
            `/offline-requests/${Date.now()}`,
            new Response(JSON.stringify(analyticsData))
          );
        })()
      );
    }
  }
});

// Version check and auto-update
self.addEventListener('fetch', (event) => {
  // Check for new version every hour
  if (event.request.url.includes('/index.html') && navigator.onLine) {
    event.waitUntil(
      (async () => {
        const cache = await caches.open(CACHE_NAME);
        const cachedResponse = await cache.match(event.request);
        const networkResponse = await fetch(event.request);
        
        if (networkResponse && networkResponse.status === 200) {
          const networkETag = networkResponse.headers.get('ETag');
          const cachedETag = cachedResponse?.headers.get('ETag');
          
          if (networkETag !== cachedETag) {
            // New version available, show update notification
            const clients = await self.clients.matchAll();
            for (const client of clients) {
              client.postMessage({
                type: 'UPDATE_AVAILABLE',
                version: networkResponse.headers.get('X-App-Version') || 'latest'
              });
            }
          }
        }
      })()
    );
  }
});

console.log('[Service Worker] Successfully registered!');
