// Service worker de la App de Patrullaje v2: permite abrir la app sin señal.
// Solo atiende la app y sus librerías; no toca el sistema web ni las llamadas a Supabase.
const VERSION = 'patrullero-v2.2.0';
const CDN = [
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js'
];
const PROPIOS = /\/(app\.html|manifest\.json|icon-192\.png|icon-512\.png|icon-maskable-512\.png|apple-touch-icon\.png)$/;

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => Promise.all(
    CDN.concat(['app.html', 'manifest.json', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'apple-touch-icon.png']).map(u => c.add(u).catch(() => null))
  )).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k.startsWith('patrullero-') && k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Mosaicos del mapa base (Esri): primero la copia guardada → el mapa funciona sin señal.
// Se piden en modo CORS para no guardar respuestas opacas (ocupan mucho más espacio).
const CACHE_MOSAICOS = 'mosaicos-v1';
const MAX_MOSAICOS = 6000;
let guardados = 0;
async function recortarMosaicos(c) {
  const ks = await c.keys();
  if (ks.length > MAX_MOSAICOS) await Promise.all(ks.slice(0, ks.length - MAX_MOSAICOS + 500).map(k => c.delete(k)));
}
async function mosaico(req) {
  const c = await caches.open(CACHE_MOSAICOS);
  const guardado = await c.match(req.url);
  if (guardado) return guardado;
  try {
    let res;
    try { res = await fetch(req.url, { mode: 'cors', credentials: 'omit' }); }
    catch (e) { res = await fetch(req); }
    if (res && res.ok) {
      c.put(req.url, res.clone());
      if (++guardados % 300 === 0) recortarMosaicos(c);
    }
    return res;
  } catch (e) {
    return new Response('', { status: 504, statusText: 'Sin conexión' });
  }
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.hostname === 'server.arcgisonline.com' && url.pathname.includes('/tile/')) { e.respondWith(mosaico(req)); return; }
  // Librerías: primero la copia guardada
  if (CDN.includes(req.url)) {
    e.respondWith(caches.match(req).then(r => r || fetch(req).then(res => {
      const copia = res.clone(); caches.open(VERSION).then(c => c.put(req, copia)); return res;
    })));
    return;
  }
  // La app: primero la red (para recibir actualizaciones), la copia si no hay señal
  if (url.origin === self.location.origin && PROPIOS.test(url.pathname)) {
    e.respondWith(fetch(req).then(res => {
      if (res.ok) { const copia = res.clone(); caches.open(VERSION).then(c => c.put(req, copia)); }
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: true })));
  }
});
