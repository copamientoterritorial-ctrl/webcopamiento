// Service worker de la App de terreno «Agricultores Malleco»: permite abrir la app sin señal.
// Solo atiende la app y sus librerías; no toca el sistema web ni las llamadas a Supabase.
const VERSION = 'agricultores-v1.3.0';   // = APP_VERSION de app.html y version.json
const CDN = [
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js'
];
const PROPIOS = /\/(app\.html|instalar\.html|manifest\.json|icon-192\.png|icon-512\.png|icon-maskable-512\.png|apple-touch-icon\.png)$/;

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => Promise.all(
    CDN.concat(['app.html', 'instalar.html', 'manifest.json', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'apple-touch-icon.png']).map(u => c.add(u).catch(() => null))
  )).then(() => self.skipWaiting()));
});

// El actualizador de la app (botón «Actualizar ahora») pide activar de inmediato la versión nueva
self.addEventListener('message', e => { if (e.data === 'SKIP_WAITING') self.skipWaiting(); });

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k.startsWith('agricultores-') && k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Mosaicos del mapa base (Esri): primero la copia guardada → el mapa funciona sin señal.
// Misma caché que la App de Patrullaje (mosaicos-v1): lo descargado en una sirve para la otra.
const CACHE_MOSAICOS = 'mosaicos-v1';
const MAX_MOSAICOS = 8000;
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
  if ((url.hostname === 'server.arcgisonline.com' && url.pathname.includes('/tile/')) ||
      (url.hostname.endsWith('basemaps.cartocdn.com') && url.pathname.includes('/rastertiles/'))) { e.respondWith(mosaico(req)); return; }
  // Librerías: primero la copia guardada
  if (CDN.includes(req.url)) {
    e.respondWith(caches.match(req).then(r => r || fetch(req).then(res => {
      const copia = res.clone(); caches.open(VERSION).then(c => c.put(req, copia)); return res;
    })));
    return;
  }
  // La app: primero la red SIN caché del navegador (siempre la última versión publicada), la copia si no hay señal.
  // version.json no se intercepta: siempre va directo al servidor.
  if (url.origin === self.location.origin && PROPIOS.test(url.pathname)) {
    // (por URL: una petición de navegación no se puede reconstruir con opciones)
    e.respondWith(fetch(req.url, { cache: 'no-store', credentials: 'same-origin' }).then(res => {
      if (res.ok) { const copia = res.clone(); caches.open(VERSION).then(c => c.put(req, copia)); }
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: true })));
  }
});
