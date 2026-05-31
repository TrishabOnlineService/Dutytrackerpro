// ===== DUTY TRACKER PRO - SERVICE WORKER =====
// Version: 2.0.0 | Flutter-style PWA

const CACHE_NAME = 'duty-tracker-pro-v2';
const STATIC_CACHE = 'dtp-static-v2';
const DYNAMIC_CACHE = 'dtp-dynamic-v2';

// Core files to cache immediately
const STATIC_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  'https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
  'https://cdn.jsdelivr.net/npm/chart.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.28/jspdf.plugin.autotable.min.js',
];

// ===== INSTALL EVENT =====
self.addEventListener('install', (event) => {
  console.log('[SW] Installing Duty Tracker Pro v2...');
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      console.log('[SW] Caching static assets');
      return cache.addAll(STATIC_ASSETS.map(url => {
        return new Request(url, { mode: 'cors' });
      })).catch(err => console.log('[SW] Cache addAll error (non-fatal):', err));
    }).then(() => self.skipWaiting())
  );
});

// ===== ACTIVATE EVENT =====
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating v2...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter(name => name !== STATIC_CACHE && name !== DYNAMIC_CACHE)
          .map(name => {
            console.log('[SW] Deleting old cache:', name);
            return caches.delete(name);
          })
      );
    }).then(() => self.clients.claim())
  );
});

// ===== FETCH EVENT - Flutter-style network strategy =====
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET and Chrome extension requests
  if (request.method !== 'GET') return;
  if (url.protocol === 'chrome-extension:') return;

  // Firebase / OneSignal - always network first (real-time data)
  if (
    url.hostname.includes('firebaseio.com') ||
    url.hostname.includes('firebase.google.com') ||
    url.hostname.includes('onesignal.com') ||
    url.hostname.includes('razorpay.com') ||
    url.hostname.includes('imgbb.com')
  ) {
    event.respondWith(networkOnly(request));
    return;
  }

  // Google Fonts / CDN assets - cache first
  if (
    url.hostname.includes('fonts.googleapis.com') ||
    url.hostname.includes('fonts.gstatic.com') ||
    url.hostname.includes('cdnjs.cloudflare.com') ||
    url.hostname.includes('cdn.jsdelivr.net') ||
    url.hostname.includes('flaticon.com')
  ) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // HTML pages - network first with cache fallback (Flutter-style)
  if (request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(networkFirstWithCache(request));
    return;
  }

  // Everything else - stale while revalidate
  event.respondWith(staleWhileRevalidate(request));
});

// ===== CACHING STRATEGIES =====

// Network Only (for real-time Firebase data)
async function networkOnly(request) {
  try {
    return await fetch(request);
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Network unavailable' }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// Cache First (for static CDN assets)
async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(STATIC_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    return new Response('Offline - asset not cached', { status: 503 });
  }
}

// Network First with Cache Fallback (for HTML)
async function networkFirstWithCache(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(DYNAMIC_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    const cached = await caches.match(request);
    if (cached) return cached;
    // Return offline page
    return new Response(getOfflinePage(), {
      headers: { 'Content-Type': 'text/html' }
    });
  }
}

// Stale While Revalidate
async function staleWhileRevalidate(request) {
  const cache = await caches.open(DYNAMIC_CACHE);
  const cached = await cache.match(request);
  const fetchPromise = fetch(request).then(response => {
    if (response.ok) cache.put(request, response.clone());
    return response;
  }).catch(() => null);
  return cached || await fetchPromise || new Response('Offline', { status: 503 });
}

// ===== OFFLINE PAGE =====
function getOfflinePage() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Duty Tracker Pro - Offline</title>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; font-family:'Segoe UI',sans-serif; }
    body { background:#050505; color:white; display:flex; align-items:center; justify-content:center; min-height:100vh; text-align:center; padding:20px; }
    .container { max-width:300px; }
    .icon { font-size:80px; margin-bottom:20px; animation:bounce 2s infinite; }
    @keyframes bounce { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-15px)} }
    h1 { font-size:24px; margin-bottom:10px; color:#4361ee; }
    p { color:#a0a0a0; font-size:14px; line-height:1.6; margin-bottom:20px; }
    button { background:linear-gradient(135deg,#4361ee,#4cc9f0); color:white; border:none; padding:14px 28px; border-radius:50px; font-size:16px; font-weight:600; cursor:pointer; }
    button:active { transform:scale(0.96); }
  </style>
</head>
<body>
  <div class="container">
    <div class="icon">📵</div>
    <h1>You're Offline</h1>
    <p>Duty Tracker Pro needs internet to sync your data. Please check your connection and try again.</p>
    <button onclick="window.location.reload()">↻ Retry</button>
  </div>
</body>
</html>`;
}

// ===== PUSH NOTIFICATIONS =====
self.addEventListener('push', (event) => {
  const data = event.data?.json() || {};
  const options = {
    body: data.body || 'You have a new update from Duty Tracker Pro',
    icon: 'https://cdn-icons-png.flaticon.com/512/3135/3135715.png',
    badge: 'https://cdn-icons-png.flaticon.com/512/3135/3135715.png',
    vibrate: [100, 50, 100, 50, 100],
    data: { url: data.url || './' },
    actions: [
      { action: 'open', title: 'Open App' },
      { action: 'dismiss', title: 'Dismiss' }
    ],
    requireInteraction: false,
    silent: false
  };
  event.waitUntil(
    self.registration.showNotification(data.title || 'Duty Tracker Pro', options)
  );
});

// ===== NOTIFICATION CLICK =====
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  if (event.action === 'dismiss') return;
  const urlToOpen = event.notification.data?.url || './';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes('index.html') && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(urlToOpen);
    })
  );
});

// ===== BACKGROUND SYNC =====
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-duty-data') {
    console.log('[SW] Background sync: duty data');
  }
});

console.log('[SW] Duty Tracker Pro Service Worker v2.0 loaded ✅');
