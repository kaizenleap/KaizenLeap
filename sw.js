/* ============================================================
   KAIZEN LIVEOPS PRO · Service Worker
   - Cachea los assets estáticos para funcionar offline
   - NO cachea las llamadas a Firebase (siempre en tiempo real)
   - Estrategia: Cache First para assets, Network First para datos
============================================================ */

const CACHE_NAME = 'kaizen-pwa-v1';

// Assets que se cachean al instalar
const STATIC_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  'https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;600&family=Plus+Jakarta+Sans:ital,wght@0,300;0,400;0,500;0,600;0,700;0,800;1,400&display=swap'
];

// URLs que NUNCA se cachean (siempre van a la red)
const NEVER_CACHE = [
  'firestore.googleapis.com',
  'firebase.googleapis.com',
  'googleapis.com',
  'gstatic.com/firebasejs'
];

// ── INSTALL ──────────────────────────────────────────────────
self.addEventListener('install', event => {
  console.log('[SW] Instalando...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[SW] Cacheando assets estáticos');
        // Cachear uno por uno para que un fallo no rompa todo
        return Promise.allSettled(
          STATIC_ASSETS.map(url =>
            cache.add(url).catch(e => console.warn('[SW] No se pudo cachear:', url, e))
          )
        );
      })
      .then(() => self.skipWaiting())
  );
});

// ── ACTIVATE ─────────────────────────────────────────────────
self.addEventListener('activate', event => {
  console.log('[SW] Activado');
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => {
            console.log('[SW] Eliminando caché viejo:', key);
            return caches.delete(key);
          })
      )
    ).then(() => self.clients.claim())
  );
});

// ── FETCH ─────────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const url = event.request.url;

  // Nunca interceptar llamadas a Firebase / Google APIs
  if(NEVER_CACHE.some(domain => url.includes(domain))){
    return; // deja que el navegador lo maneje normalmente
  }

  // Solo manejar GET
  if(event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request)
      .then(cached => {
        if(cached){
          // Tenemos caché: devolver inmediato y actualizar en background
          fetch(event.request)
            .then(fresh => {
              if(fresh && fresh.status === 200){
                caches.open(CACHE_NAME)
                  .then(cache => cache.put(event.request, fresh.clone()));
              }
            })
            .catch(() => {}); // sin internet: no pasa nada
          return cached;
        }

        // Sin caché: ir a la red
        return fetch(event.request)
          .then(response => {
            if(!response || response.status !== 200) return response;
            // Guardar en caché para la próxima vez
            const toCache = response.clone();
            caches.open(CACHE_NAME)
              .then(cache => cache.put(event.request, toCache));
            return response;
          })
          .catch(() => {
            // Sin internet y sin caché: mostrar página offline si es navegación
            if(event.request.mode === 'navigate'){
              return caches.match('./index.html');
            }
          });
      })
  );
});
