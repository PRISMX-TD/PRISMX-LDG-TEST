const CACHE_NAME = 'prismx-ledger-v5';
const OFFLINE_URL = '/offline.html';

const STATIC_ASSETS = [
  '/',
  '/offline.html',
  '/manifest.json'
];

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('PRISMX Ledger: Caching static assets');
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.filter(key => key !== CACHE_NAME)
          .map(key => {
            console.log('PRISMX Ledger: Removing old cache:', key);
            return caches.delete(key);
          })
      );
    }).then(async () => {
      if (self.registration && 'navigationPreload' in self.registration) {
        try { await self.registration.navigationPreload.enable(); } catch (e) {}
      }
      return self.clients.claim();
    })
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') {
    return;
  }

  const url = new URL(event.request.url);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return;
  }

  if (url.origin !== self.location.origin) {
    return;
  }

  const preload = event.preloadResponse;
  if (preload && typeof preload.then === 'function') {
    event.waitUntil(preload.catch(() => {}));
  }

  const usePreload = async () => {
    try {
      const preloaded = event.preloadResponse ? await event.preloadResponse : null;
      if (preloaded) return preloaded;
    } catch {}
    return null;
  };

  if (url.pathname.startsWith('/api/')) {
    event.respondWith((async () => (await usePreload()) || await networkFirst(event.request))());
  } else if (event.request.destination === 'image') {
    event.respondWith((async () => (await usePreload()) || await cacheFirst(event.request))());
  } else {
    event.respondWith((async () => (await usePreload()) || await networkFirst(event.request))());
  }
});

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    
    if (response.ok) {
      const isHttp = request.url.startsWith('http://') || request.url.startsWith('https://');
      const isApi = new URL(request.url).pathname.startsWith('/api/');
      const isDocument = request.destination === 'document' || request.headers.get('accept')?.includes('text/html');
      if (isHttp && !isApi && !isDocument) {
        const cache = await caches.open(CACHE_NAME);
        cache.put(request, response.clone());
      }
    }
    
    return response;
  } catch (error) {
    const isHttp = request.url.startsWith('http://') || request.url.startsWith('https://');
    const isApi = new URL(request.url).pathname.startsWith('/api/');
    const isDocument = request.destination === 'document' || request.headers.get('accept')?.includes('text/html');
    const cachedResponse = isHttp && !isApi && !isDocument ? await caches.match(request) : undefined;
    
    if (cachedResponse) {
      return cachedResponse;
    }
    
    if (request.headers.get('accept').includes('text/html')) {
      return caches.match(OFFLINE_URL);
    }
    
    throw error;
  }
}

async function cacheFirst(request) {
  const cachedResponse = await caches.match(request);
  
  if (cachedResponse) {
    return cachedResponse;
  }
  
  try {
    const response = await fetch(request);
    
    if (response.ok) {
      const isHttp = request.url.startsWith('http://') || request.url.startsWith('https://');
      if (isHttp) {
        const cache = await caches.open(CACHE_NAME);
        cache.put(request, response.clone());
      }
    }
    
    return response;
  } catch (error) {
    console.log('PRISMX Ledger: Failed to fetch:', request.url);
    throw error;
  }
}
