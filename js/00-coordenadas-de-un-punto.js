/* ==================== 📍 COORDENADAS DE UN PUNTO (03-11-2026) — en TODOS los mapas del sistema ====================
 * Se carga ANTES que js/01: registra un L.Map.addInitHook, así cada mapa Leaflet que se cree (mapa principal, Planificador gráfico,
 * Comunas Prioritarias, Patrullajes, Bosques, Agricultores, Descargas…) recibe el botón 📍 en su barra de zoom (+ / −).
 *   · Con el botón activo: el cursor es una cruz, abajo a la izquierda se ven las coordenadas bajo el mouse y un clic fija el punto.
 *   · La ventana del punto muestra: geográficas decimales (lat, lng), grados-minutos-segundos y UTM WGS84 (zona natural y, si
 *     difiere, la zona 18S extendida que usa CMPC), cada una con 📋 Copiar, más 🔗 enlace de Google Maps y «Copiar todo».
 *   · Mientras está activo, los clics no llegan a las herramientas del mapa (dibujo, fichas). Esc o el mismo botón lo apaga.
 * Funciones globales: coordUtm_(lat, lng, zonaForzada), coordGms_(lat, lng), coordTextos_(lat, lng), copiarTexto_(texto). */

/** WGS84 → UTM (hemisferio por la latitud). zonaForzada: número de zona para expresar el punto en una zona vecina (extendida). */
function coordUtm_(lat, lng, zonaForzada) {
  const a = 6378137, f = 1 / 298.257223563, k0 = 0.9996;
  const e2 = f * (2 - f), ep2 = e2 / (1 - e2);
  const zona = zonaForzada || Math.floor((lng + 180) / 6) + 1;
  const lon0 = ((zona - 1) * 6 - 180 + 3) * Math.PI / 180;
  const fi = lat * Math.PI / 180, la = lng * Math.PI / 180;
  const N = a / Math.sqrt(1 - e2 * Math.sin(fi) ** 2);
  const T = Math.tan(fi) ** 2, C = ep2 * Math.cos(fi) ** 2, A = Math.cos(fi) * (la - lon0);
  const M = a * ((1 - e2 / 4 - 3 * e2 ** 2 / 64 - 5 * e2 ** 3 / 256) * fi - (3 * e2 / 8 + 3 * e2 ** 2 / 32 + 45 * e2 ** 3 / 1024) * Math.sin(2 * fi)
    + (15 * e2 ** 2 / 256 + 45 * e2 ** 3 / 1024) * Math.sin(4 * fi) - (35 * e2 ** 3 / 3072) * Math.sin(6 * fi));
  const este = k0 * N * (A + (1 - T + C) * A ** 3 / 6 + (5 - 18 * T + T ** 2 + 72 * C - 58 * ep2) * A ** 5 / 120) + 500000;
  let norte = k0 * (M + N * Math.tan(fi) * (A ** 2 / 2 + (5 - T + 9 * C + 4 * C ** 2) * A ** 4 / 24 + (61 - 58 * T + T ** 2 + 600 * C - 330 * ep2) * A ** 6 / 720));
  if (lat < 0) norte += 10000000;
  return { zona, hemisferio: lat < 0 ? 'S' : 'N', este, norte };
}
function coordGms_(lat, lng) {
  const gms = (v, pos, neg) => {
    const s = v < 0 ? neg : pos; v = Math.abs(v);
    let g = Math.floor(v), m = Math.floor((v - g) * 60), seg = ((v - g) * 60 - m) * 60;
    if (seg >= 59.95) { seg = 0; m++; } if (m >= 60) { m = 0; g++; }
    return g + '°' + String(m).padStart(2, '0') + '′' + seg.toFixed(1).padStart(4, '0') + '″ ' + s;
  };
  return gms(lat, 'N', 'S') + ' ' + gms(lng, 'E', 'O');
}
const coordMiles_ = n => Math.round(n).toLocaleString('es-CL');
/** Todos los formatos de un punto, listos para mostrar y copiar. */
function coordTextos_(lat, lng) {
  const u = coordUtm_(lat, lng);
  const out = [
    { k: 'dec', t: 'Geográficas (grados decimales)', v: lat.toFixed(6) + ', ' + lng.toFixed(6) },
    { k: 'gms', t: 'Geográficas (grados, minutos, segundos)', v: coordGms_(lat, lng) },
    { k: 'utm', t: 'UTM WGS84 · zona ' + u.zona + u.hemisferio, v: 'E ' + coordMiles_(u.este) + ' · N ' + coordMiles_(u.norte),
      copia: 'Zona ' + u.zona + u.hemisferio + ' E ' + Math.round(u.este) + ' N ' + Math.round(u.norte) },
  ];
  if (u.zona !== 18 && lat < 0 && lng > -78 && lng < -66) {   // Chile: CMPC trabaja en 18S aunque el punto caiga en la 19
    const u18 = coordUtm_(lat, lng, 18);
    out.push({ k: 'utm18', t: 'UTM WGS84 · zona 18S (extendida)', v: 'E ' + coordMiles_(u18.este) + ' · N ' + coordMiles_(u18.norte),
      copia: 'Zona 18S E ' + Math.round(u18.este) + ' N ' + Math.round(u18.norte) });
  }
  out.push({ k: 'gmaps', t: '🔗 Compartir (Google Maps)', v: 'https://www.google.com/maps?q=' + lat.toFixed(6) + ',' + lng.toFixed(6) });
  return out;
}
/** Copia al portapapeles (con alternativa para navegadores / contextos sin Clipboard API). */
async function copiarTexto_(texto) {
  try { await navigator.clipboard.writeText(texto); return true; } catch (e) { /* alternativa */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = texto; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;left:-9999px;top:0;';
    document.body.appendChild(ta); ta.select(); const ok = document.execCommand('copy'); ta.remove(); return ok;
  } catch (e) { return false; }
}
function coordPopupHtml_(lat, lng) {
  const filas = coordTextos_(lat, lng);
  const todo = filas.map(f => f.t.replace(/^🔗 /, '') + ': ' + (f.copia || f.v)).join('\n');
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  return '<div class="coord-pop"><b>📍 Coordenadas del punto</b>' +
    filas.map(f => '<div class="coord-fila"><span>' + esc(f.t) + '</span><div><code>' + esc(f.v) + '</code>' +
      '<button type="button" class="coord-copiar" data-coord-txt="' + esc(f.copia || f.v) + '" title="Copiar">📋</button></div></div>').join('') +
    '<button type="button" class="coord-copiar coord-todo" data-coord-txt="' + esc(todo) + '">📋 Copiar todo</button></div>';
}
// Botones 📋 de cualquier ventana de coordenadas (delegado: sirve para todos los mapas)
document.addEventListener('click', async ev => {
  const b = ev.target.closest && ev.target.closest('.coord-copiar'); if (!b) return;
  ev.preventDefault(); ev.stopPropagation();
  const ok = await copiarTexto_(b.dataset.coordTxt);
  const antes = b.textContent;
  b.textContent = ok ? '✅' + (b.classList.contains('coord-todo') ? ' Copiado' : '') : '⚠️';
  setTimeout(() => { b.textContent = antes; }, 1300);
});

/** Agrega el botón 📍 a la barra de zoom del mapa (o crea una barra propia si el mapa no tiene). */
function agregarCoordenadasMapa_(m) {
  if (m._coordenadas) return;
  const zoomBar = m.getContainer().querySelector('.leaflet-control-zoom');
  let barra = zoomBar;
  if (!barra) {
    const Ctl = L.Control.extend({ options: { position: 'topleft' }, onAdd: () => L.DomUtil.create('div', 'leaflet-bar leaflet-control leaflet-control-zoom') });
    barra = new Ctl().addTo(m).getContainer();
  }
  const S = m._coordenadas = { activo: false, capa: L.layerGroup().addTo(m), lectura: null };
  const btn = L.DomUtil.create('a', 'leaflet-control-zoom-coord', barra);
  btn.href = '#'; btn.title = 'Coordenadas de un punto (UTM y geográficas) para copiar o compartir · Esc para salir';
  btn.setAttribute('role', 'button'); btn.setAttribute('aria-label', 'Coordenadas de un punto');
  btn.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" style="vertical-align:middle;">' +
    '<circle cx="12" cy="12" r="7"/><line x1="12" y1="1.5" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22.5"/><line x1="1.5" y1="12" x2="6" y2="12"/>' +
    '<line x1="18" y1="12" x2="22.5" y2="12"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/></svg>';
  L.DomEvent.disableClickPropagation(btn);
  const cont = m.getContainer();
  const enControl = e => !!(e.target.closest && e.target.closest('.leaflet-control, .leaflet-popup'));
  const lupaActiva = () => !!(m._lupas && m._lupas.modo);
  function activar(on) {
    S.activo = on;
    btn.classList.toggle('activa', on);
    cont.classList.toggle('modo-coordenadas', on);
    if (on && !S.lectura) {
      S.lectura = L.DomUtil.create('div', 'coord-lectura', cont);
      S.lectura.textContent = 'Mueve el mouse sobre el mapa · clic para fijar el punto';
    }
    if (!on && S.lectura) { S.lectura.remove(); S.lectura = null; }
    if (!on) S.capa.clearLayers();
  }
  L.DomEvent.on(btn, 'click', ev => { L.DomEvent.preventDefault(ev); activar(!S.activo); });
  cont.addEventListener('mousemove', e => {
    if (!S.activo || !S.lectura || enControl(e)) return;
    const ll = m.mouseEventToLatLng(e), u = coordUtm_(ll.lat, ll.lng);
    S.lectura.textContent = ll.lat.toFixed(6) + ', ' + ll.lng.toFixed(6) + '  ·  UTM ' + u.zona + u.hemisferio + ' E ' + coordMiles_(u.este) + ' N ' + coordMiles_(u.norte);
  });
  // Fase de captura: el clic fija el punto y no llega a las herramientas del mapa (dibujo, fichas)
  cont.addEventListener('click', e => {
    if (!S.activo || lupaActiva() || enControl(e)) return;
    e.stopPropagation(); e.preventDefault();
    const ll = m.mouseEventToLatLng(e);
    S.capa.clearLayers();
    const mk = L.circleMarker(ll, { radius: 7, color: '#fff', weight: 2.5, fillColor: '#DC2626', fillOpacity: 1 }).addTo(S.capa);
    mk.bindPopup(coordPopupHtml_(ll.lat, ll.lng), { maxWidth: 360, className: 'coord-popup' }).openPopup();
  }, true);
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && S.activo) activar(false); });
}
// Cada mapa Leaflet nuevo recibe el botón (después de que se arme su barra de zoom y sus lupas)
L.Map.addInitHook(function () {
  const m = this;
  setTimeout(() => { try { agregarCoordenadasMapa_(m); } catch (e) { console.warn('Coordenadas: no se pudo agregar al mapa', e); } }, 0);
});
