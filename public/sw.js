/* Service worker de Lotería Tracatá.
   Cachea el armazón de la aplicación para que abra al instante y avise cuando
   no hay conexión. Las peticiones a Supabase NUNCA se cachean: los importes
   deben ser siempre los reales. */

const CACHE = 'tracata-v1'
const PRECACHE = ['/offline', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  // Navegación: red primero para que las cifras estén siempre al día.
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match('/offline')))
    return
  }

  // Recursos estáticos: caché primero.
  if (url.pathname.startsWith('/_next/static') || url.pathname.startsWith('/icons/')) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ??
          fetch(request).then((response) => {
            const copy = response.clone()
            caches.open(CACHE).then((cache) => cache.put(request, copy))
            return response
          }),
      ),
    )
  }
})
