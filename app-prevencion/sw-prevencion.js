// Service worker de «Prevención Territorial»: abre la app sin señal (la última versión publicada cuando hay red).
// Los datos y evidencias NUNCA se guardan en caché: van siempre al servidor (Supabase).
const VERSION = 'prevencion-v1.0.3';   // = version de app.html (cuando se publique)
const CDN = ['https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js'];
const PROPIOS = /\/(app\.html|manifest\.json|icon-192\.png|icon-512\.png|icon-maskable-512\.png|apple-touch-icon\.png)$/;

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => Promise.all(
    CDN.concat(['app.html', 'manifest.json', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'apple-touch-icon.png'])
      .map(u => c.add(u).catch(() => null)))).then(() => self.skipWaiting()));
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
    e.respondWith(fetch(req.url, { cache: 'no-store', credentials: 'same-origin' })
      .then(res => { if (res.ok) { const c = res.clone(); caches.open(VERSION).then(k => k.put(req, c)); } return res; })
      .catch(() => caches.match(req, { ignoreSearch: true })));
  }
});
