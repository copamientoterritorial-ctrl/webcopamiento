// Service worker de «Prevención Territorial»: abre la app sin señal (la última versión publicada cuando hay red).
// Los datos y evidencias NUNCA se guardan en caché: van siempre al servidor (Supabase).
// version.json NO se intercepta: la app lo pide a la red para saber si hay versión nueva (sin señal falla y queda pendiente).
const VERSION = 'prevencion-v1.9.3';   // = APP_VERSION de app.html = version.json (subir los 3 juntos)
const CDN = ['https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js',
  'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js', 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css'];
const PROPIOS = /\/(app\.html|manifest\.json|icon-192\.png|icon-512\.png|icon-maskable-512\.png|apple-touch-icon\.png)$/;

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => Promise.all(
    CDN.concat(['app.html', 'manifest.json', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'apple-touch-icon.png'])
      .map(u => c.add(new Request(u, { cache: 'reload' })).catch(() => null)))).then(() => self.skipWaiting()));   // cache:'reload' = siempre la versión publicada
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k.startsWith('prevencion-') && k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (CDN.includes(req.url)) {
    e.respondWith(caches.match(req).then(r => r || fetch(req).then(res => { const c = res.clone(); caches.open(VERSION).then(k => k.put(req, c)); return res; })));
    return;
  }
  if (url.origin === self.location.origin && PROPIOS.test(url.pathname)) {
    // v1.8.1: red primero, pero con señal débil no se espera más de 5 s: se abre la copia guardada (y la red, si llega, la actualiza)
    const red = fetch(req.url, { cache: 'no-store', credentials: 'same-origin' })
      .then(res => { if (res.ok) { const c = res.clone(); caches.open(VERSION).then(k => k.put(req, c)); } return res; });
    e.respondWith(new Promise(resolve => {
      let listo = false;
      const usarCache = () => caches.match(req, { ignoreSearch: true }).then(c => { if (c && !listo) { listo = true; resolve(c); } return c; });
      const t = setTimeout(usarCache, 5000);
      red.then(res => { clearTimeout(t); if (!listo) { listo = true; resolve(res); } })
        .catch(() => { clearTimeout(t); usarCache().then(c => { if (!c && !listo) { listo = true; resolve(Response.error()); } }); });
    }));
  }
});
