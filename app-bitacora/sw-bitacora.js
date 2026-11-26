// Service worker de «Bitácora · Aperturas»: abre la app sin señal (la última versión publicada cuando hay red).
// Los datos NUNCA se guardan aquí: van a Supabase, y sin señal la app los guarda en IndexedDB (cola) hasta poder enviarlos.
// version.json NO se intercepta: la app lo pide a la red para saber si hay versión nueva (sin señal queda pendiente).
// Teselas Esri: se guardan las que se van viendo (máx. ~1.500) para tener mapa base sin señal en las zonas ya recorridas.
const VERSION = 'bitacora-v1.6.0';   // = APP_VERSION de app.html = version.json (subir los 3 juntos)
const TESELAS = 'bitacora-teselas';
const MAX_TESELAS = 1500;
const CDN = ['https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js',
  'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js', 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css'];
const PROPIOS = /\/(app\.html|manifest\.json|icon-192\.png|icon-512\.png|icon-maskable-512\.png|apple-touch-icon\.png)$/;

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => Promise.all(
    CDN.concat(['app.html', 'manifest.json', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'apple-touch-icon.png'])
      .map(u => c.add(new Request(u, { cache: 'reload' })).catch(() => null)))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k.startsWith('bitacora-v') && k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
// Aviso «2 h sin registrar» (v1.2.0): al tocar la notificación se abre o enfoca la app
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cs => {
    const c = cs.find(x => /\/app-bitacora\//.test(x.url));
    return c ? c.focus() : self.clients.openWindow('app.html');
  }));
});
async function guardarTesela(req, res) {
  const c = await caches.open(TESELAS);
  await c.put(req, res);
  const ks = await c.keys();
  if (ks.length > MAX_TESELAS) await Promise.all(ks.slice(0, ks.length - MAX_TESELAS).map(k => c.delete(k)));
}
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (CDN.includes(req.url)) {
    e.respondWith(caches.match(req).then(r => r || fetch(req).then(res => { const c = res.clone(); caches.open(VERSION).then(k => k.put(req, c)); return res; })));
    return;
  }
  if (url.hostname === 'server.arcgisonline.com' && url.pathname.includes('/tile/')) {
    // Solo respuestas CORS (la app pide las teselas con crossOrigin): las opacas inflan la cuota del navegador
    e.respondWith(fetch(req).then(res => { if (res.ok && res.type !== 'opaque') { const c = res.clone(); guardarTesela(req, c).catch(() => {}); } return res; })
      .catch(() => caches.open(TESELAS).then(c => c.match(req)).then(r => r || Response.error())));
    return;
  }
  if (url.origin === self.location.origin && PROPIOS.test(url.pathname)) {
    e.respondWith(fetch(req.url, { cache: 'no-store', credentials: 'same-origin' })
      .then(res => { if (res.ok) { const c = res.clone(); caches.open(VERSION).then(k => k.put(req, c)); } return res; })
      .catch(() => caches.match(req, { ignoreSearch: true })));
  }
});
