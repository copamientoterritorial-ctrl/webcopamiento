/* ============ ZONAS DE ALERTA CMPC (19-10-2026, SQL 126) ============
 * 17 polígonos (1-5 × Costa / Valle / Precordillera + 6-Norte / 6-Sur). Se piden una sola vez (RPC zonas_alerta_geojson,
 * ya simplificadas) al encender la capa. Cada recurso tiene su zona calculada por su punto (trigger del SQL 126c). */
const ZONA_ALERTA_COLOR = { COSTA: '#0284C7', VALLE: '#CA8A04', PRECORDILLERA: '#7C2D12', NORTE: '#64748B', SUR: '#475569' };
state.zonasAlertaOn = false;
state.zonasAlertaInfo = { cargado: false, ok: true, count: 0 };
let zonasAlertaLayer = null;
async function toggleZonasAlerta_() {
  state.zonasAlertaOn = !state.zonasAlertaOn;
  if (state.zonasAlertaOn) {
    if (!map.getPane('zonasAlertaPane')) { map.createPane('zonasAlertaPane'); map.getPane('zonasAlertaPane').style.zIndex = 330; }
    if (!zonasAlertaLayer) {
      const { data, error } = await supabaseClient.rpc('zonas_alerta_geojson', { p_tolerancia: 0.0008 });
      if (error) {
        state.zonasAlertaInfo = { cargado: true, ok: false, error: /zonas_alerta_geojson/.test(error.message) ? 'Falta ejecutar el SQL 126 (zonas de alerta).' : error.message };
        state.zonasAlertaOn = false;
      } else {
        zonasAlertaLayer = L.geoJSON(data, {
          pane: 'zonasAlertaPane',
          style: f => { const c = ZONA_ALERTA_COLOR[f.properties.subzona] || '#64748B'; return { color: c, weight: 2, dashArray: '6 4', fillColor: c, fillOpacity: 0.07 }; },
          onEachFeature: (f, l) => {
            const p = f.properties;
            l.bindTooltip('<b>Zona de alerta ' + escapeHtml_(p.nombre) + '</b><br>' + (p.recursos || 0) + ' recurso(s) en la zona', { sticky: true });
          },
        });
        state.zonasAlertaInfo = { cargado: true, ok: true, count: ((data && data.features) || []).length };
      }
    }
    if (zonasAlertaLayer && state.zonasAlertaOn) zonasAlertaLayer.addTo(map);
  } else if (zonasAlertaLayer) {
    map.removeLayer(zonasAlertaLayer);
  }
  if (document.querySelector('.rail-btn.active') && document.querySelector('.rail-btn.active').dataset.tab === 'capas') renderTab('capas');
}

function toggleEtiquetasRedVial_() {
  state.mostrarEtiquetasRedVial = !state.mostrarEtiquetasRedVial;
  declutterEtiquetasRedVial_();
  actualizarEscalaZoom_();
  if (document.querySelector('.rail-btn.active') && document.querySelector('.rail-btn.active').dataset.tab === 'capas') renderTab('capas');
}

/* ============ RED VIAL CMPC (solo Administrador y Jefe de Área) ============
 * Fuente: RPC red_vial_cmpc_en_vista (SQL 73 + 74). La red CMPC es ~10 veces más
 * densa que la del MOP (150 mil tramos), así que NO se baja la comuna entera:
 * se piden solo los tramos de lo que se ve en pantalla (+30 % de margen) que
 * están DENTRO de la comuna/área activa (sin margen, recortados en el límite;
 * SQL 77), y se vuelve a pedir al salir de esa caja. Bajo zoom 11 no se dibuja.
 * Se dibuja DEBAJO de la Red Vial Chile y el imán prioriza la chilena.
 * Categorías por N_ID_TIPO_CARPETA: Pavimento (2 y 5) rojo, Ripio (3) rojo
 * suave, Tierra (1 y sin dato) rojo segmentado. Sin etiquetas. */
const redVialCmpcLayer = L.layerGroup();
state.redVialCmpcOn = false;
state.redVialCmpcCatOculta = { pavimento: false, ripio: false, tierra: false };
state.redVialCmpcInfo = { ok: true, count: 0, cargado: false };
let redVialCmpcTramos_ = [];      // [{cat, linea, partes, bounds}]
let redVialCmpcCaja_ = null;      // { clave, bounds, truncado } de lo último cargado
let redVialCmpcRenderer_ = null;
let redVialCmpcPedido_ = 0;
const RED_VIAL_CMPC_MIN_Z = 11;       // antes 10: a ese zoom la pantalla pedía >20 mil tramos
const RED_VIAL_CMPC_LIMITE = 15000;
/** Simplificación (m) que se pide a la BD según el zoom: de lejos no se ve el detalle (SQL 75). */
function simplificacionCmpc_(z) { return z < 12 ? 15 : z < 13 ? 6 : z < 14 ? 2 : 0; }
const RED_VIAL_CMPC_CATEGORIAS = {
  // Más delgadas que la Red Vial Chile (pedido 06-10-2026): es una capa de apoyo.
  pavimento: { color: '#D32F2F', w: 2.0, nombre: 'Pavimento', codigos: '2 y 5' },
  ripio:     { color: '#F28B82', w: 1.6, nombre: 'Ripio', codigos: '3' },
  tierra:    { color: '#C62828', w: 1.2, nombre: 'Tierra', codigos: '1', dash: '4,4' },
};

function puedeVerRedVialCmpc_() {
  const p = state.perfil && state.perfil.perfil;
  return p === 'Administrador' || esJefeAreaPerfil_(p);
}

/** ¿Se está dibujando o editando? Entonces el clic en un camino es un vértice, no una ficha. */
function dibujandoEnMapa_() {
  return !!(state.editandoForma || state.modoRegla ||
    ((state.editorMode || state.modoPlanificacion) && (state.dibujoModo === 'linea' || state.dibujoModo === 'area')));
}

function estiloRedVialCmpc_(cat, z) {
  const c = RED_VIAL_CMPC_CATEGORIAS[cat];
  const f = Math.max(0.7, Math.min(1.7, Math.pow(2, (z - 13) * 0.3)));
  return { color: c.color, weight: c.w * f, opacity: 0.95, dashArray: c.dash || null,
           lineCap: c.dash ? 'butt' : 'round', lineJoin: 'round' };
}

function refrescarPanelCapasSiVisible_() {
  const activo = document.querySelector('.rail-btn.active');
  if (activo && activo.dataset.tab === 'capas') renderTab('capas');
}

function textoDetalleRedVialCmpc_() {
  const inf = state.redVialCmpcInfo || { ok: true, count: 0 };
  if (!state.redVialCmpcOn) return state.areaActiva ? 'Solo el área' : 'Solo la comuna';
  if (!inf.cargado) return 'Cargando…';
  if (!inf.ok) return 'Error';
  if (inf.lejos) return 'Acércate (zoom ≥ ' + RED_VIAL_CMPC_MIN_Z + ')';
  return inf.count.toLocaleString('es-CL') + ' en pantalla' + (inf.truncado ? ' (máx.)' : '');
}

/** Al moverse el mapa solo cambian los contadores: se actualizan en sitio, sin
 *  redibujar el panel (que perdería su posición de scroll). */
function actualizarFilaRedVialCmpc_() {
  const det = document.getElementById('rv-cmpc-detalle');
  if (!det) return;
  if (state.redVialCmpcInfo && state.redVialCmpcInfo.ok === false) { refrescarPanelCapasSiVisible_(); return; }
  det.textContent = textoDetalleRedVialCmpc_();
  document.querySelectorAll('[data-cmpc-n]').forEach(el => {
    el.textContent = redVialCmpcTramos_.filter(t => t.cat === el.dataset.cmpcN).length.toLocaleString('es-CL');
  });
}

function limpiarRedVialCmpc_() {
  redVialCmpcLayer.clearLayers();
  redVialCmpcTramos_ = [];
  redVialCmpcCaja_ = null;
}

/** Pide los tramos CMPC de la vista actual. forzar = ignorar lo ya cargado. */
async function loadRedVialCmpc_(forzar) {
  if (!state.redVialCmpcOn || !puedeVerRedVialCmpc_()) return;
  const k = claveRedVial_();
  if (!k) { limpiarRedVialCmpc_(); state.redVialCmpcInfo = { ok: true, count: 0, cargado: true }; actualizarFilaRedVialCmpc_(); return; }
  if (map.getZoom() < RED_VIAL_CMPC_MIN_Z) {
    limpiarRedVialCmpc_();
    state.redVialCmpcInfo = { ok: true, count: 0, cargado: true, lejos: true };
    actualizarFilaRedVialCmpc_();
    return;
  }
  const clave = k.ambito + ':' + k.clave;
  const vista = map.getBounds();
  const simplificar = simplificacionCmpc_(map.getZoom());
  // Con la Red Vial Chile encendida se piden los tramos CMPC SIN las partes que
  // van sobre una ruta MOP (SQL 78): no se dibuja dos veces el mismo camino.
  const sinTraslape = !!state.redVialOn;
  if (!forzar && redVialCmpcCaja_ && redVialCmpcCaja_.clave === clave && redVialCmpcCaja_.simplificar === simplificar &&
      redVialCmpcCaja_.sinTraslape === sinTraslape &&
      !redVialCmpcCaja_.truncado && redVialCmpcCaja_.bounds.contains(vista)) return;

  const caja = vista.pad(0.3);
  const pedido = ++redVialCmpcPedido_;
  state.redVialCmpcInfo = Object.assign({}, state.redVialCmpcInfo, { cargado: false, lejos: false });
  actualizarFilaRedVialCmpc_();
  // Versión JSON (SQL 76): una sola respuesta con todos los tramos. La versión
  // en tabla quedaba cortada en 1.000 filas por el máximo de la API de Supabase.
  const { data, error } = await supabaseClient.rpc('red_vial_cmpc_en_vista_json', {
    p_ambito: k.ambito, p_clave: k.clave,
    p_oeste: caja.getWest(), p_sur: caja.getSouth(), p_este: caja.getEast(), p_norte: caja.getNorth(),
    p_limite: RED_VIAL_CMPC_LIMITE, p_simplificar_m: simplificar, p_sin_traslape: sinTraslape,
  });
  if (pedido !== redVialCmpcPedido_ || !state.redVialCmpcOn) return; // llegó una respuesta más nueva o se apagó
  if (error) {
    console.error('red_vial_cmpc_en_vista:', error);
    state.redVialCmpcInfo = { ok: false, count: 0, cargado: true,
      error: 'Red Vial CMPC: ' + (error.message || error.code || 'error desconocido') + (error.hint ? ' · ' + error.hint : '') };
    actualizarFilaRedVialCmpc_();
    return;
  }

  if (!redVialCmpcRenderer_) {
    // 378: DEBAJO de la Red Vial Chile (borde 380 / relleno 381) y sobre los límites (350).
    if (!map.getPane('redVialCmpc')) map.createPane('redVialCmpc').style.zIndex = 378;
    redVialCmpcRenderer_ = L.canvas({ pane: 'redVialCmpc', padding: 0.3 });
  }
  redVialCmpcLayer.clearLayers();
  redVialCmpcTramos_ = [];
  const z = map.getZoom();
  (data || []).forEach(r => {
    const g = typeof r.geometry === 'string' ? JSON.parse(r.geometry) : r.geometry;
    if (!g || !g.coordinates) return;
    const partes = (g.type === 'LineString' ? [g.coordinates] : g.type === 'MultiLineString' ? g.coordinates : [])
      .map(p => p.map(c => L.latLng(c[1], c[0]))).filter(p => p.length >= 2);
    if (!partes.length) return;
    const cat = RED_VIAL_CMPC_CATEGORIAS[r.categoria] ? r.categoria : 'tierra';
    const linea = L.polyline(partes, Object.assign({ renderer: redVialCmpcRenderer_ }, estiloRedVialCmpc_(cat, z)));
    const ficha =
      '<div class="popup-title">🌲 Camino CMPC' + (r.c_codigo ? ' · ' + escapeHtml_(r.c_codigo) : '') + '</div>' +
      (r.c_nombre ? '<div class="popup-row">' + escapeHtml_(r.c_nombre) + '</div>' : '') +
      (r.c_nom_tramo ? '<div class="popup-row">Tramo: ' + escapeHtml_(r.c_nom_tramo) + '</div>' : '') +
      '<div class="popup-row">🧱 ' + RED_VIAL_CMPC_CATEGORIAS[cat].nombre + ' (carpeta ' + (r.n_id_tipo_carpeta != null ? r.n_id_tipo_carpeta : '—') + ')</div>' +
      (r.largo_km != null ? '<div class="popup-row">📏 ' + Number(r.largo_km).toLocaleString('es-CL', { maximumFractionDigits: 2 }) + ' km</div>' : '') +
      (r.n_cod_fundo ? '<div class="popup-row">🌳 Fundo ' + r.n_cod_fundo + '</div>' : '') +
      '<div class="popup-row" style="opacity:.6;font-size:10.5px;">Red Vial CMPC</div>';
    linea.on('click', (ev) => {
      if (dibujandoEnMapa_()) return;
      L.popup().setLatLng(ev.latlng).setContent(ficha).openOn(map);
    });
    redVialCmpcTramos_.push({ cat, linea, partes, bounds: linea.getBounds() });
    if (!state.redVialCmpcCatOculta[cat]) redVialCmpcLayer.addLayer(linea);
  });
  const truncado = (data || []).length >= RED_VIAL_CMPC_LIMITE;
  redVialCmpcCaja_ = { clave, bounds: caja, truncado, simplificar, sinTraslape };
  state.redVialCmpcInfo = { ok: true, count: redVialCmpcTramos_.length, cargado: true, truncado };
  if (!map.hasLayer(redVialCmpcLayer)) redVialCmpcLayer.addTo(map);
  actualizarFilaRedVialCmpc_();
}

function aplicarZoomRedVialCmpc_() {
  const z = map.getZoom();
  redVialCmpcTramos_.forEach(t => t.linea.setStyle(estiloRedVialCmpc_(t.cat, z)));
}

let redVialCmpcEspera_ = null;
map.on('moveend', () => {
  if (!state.redVialCmpcOn) return;
  aplicarZoomRedVialCmpc_();
  clearTimeout(redVialCmpcEspera_);
  redVialCmpcEspera_ = setTimeout(() => loadRedVialCmpc_(), 250);
});

async function toggleRedVialCmpc_() {
  if (!puedeVerRedVialCmpc_()) return;
  state.redVialCmpcOn = !state.redVialCmpcOn;
  if (state.redVialCmpcOn) {
    redVialCmpcLayer.addTo(map);
    state.redVialCmpcInfo = { ok: true, count: 0, cargado: false };
    refrescarPanelCapasSiVisible_();
    await loadRedVialCmpc_(true);
  } else {
    redVialCmpcPedido_++;           // descarta una respuesta en curso
    map.removeLayer(redVialCmpcLayer);
    limpiarRedVialCmpc_();
    refrescarPanelCapasSiVisible_();
  }
  actualizarBotonesModoDibujo_();
}

function toggleCategoriaRedVialCmpc_(cat) {
  state.redVialCmpcCatOculta[cat] = !state.redVialCmpcCatOculta[cat];
  redVialCmpcTramos_.forEach(t => {
    if (t.cat !== cat) return;
    if (state.redVialCmpcCatOculta[cat]) redVialCmpcLayer.removeLayer(t.linea);
    else redVialCmpcLayer.addLayer(t.linea);
  });
  refrescarPanelCapasSiVisible_();
}

/* ============ IMÁN A LA RED VIAL (al crear líneas) ============
 * Con la Red Vial encendida y el imán activo (🧲 en la barra de dibujo):
 *   · un clic a menos de IMAN_PX píxeles de un camino visible pone el vértice
 *     EXACTAMENTE sobre el camino;
 *   · si el clic anterior también quedó pegado al MISMO tramo, se agregan los
 *     vértices del camino entre ambos: la línea sigue la curva de la ruta;
 *   · en trazo libre, cada muestra se pega al camino más cercano;
 *   · Shift apretado = sin imán (para cortar camino a propósito).
 * Solo se imantan los caminos que se ven al zoom actual. */
const IMAN_PX = 12;   // radio de atracción en píxeles de pantalla (20-10-2026: 30 → 12; con 30 se pegaba a caminos vecinos y descuadraba la ruta)
state.imanRedVial = true;
let ultimoSnapIman_ = null;   // { tramo, pi, si, u, punto } del último vértice puesto por clic
let marcadorIman_ = null;

/** Caminos imantables: Red Vial MOP y/o CMPC, solo lo encendido y visible al zoom actual. */
/** Caminos imantables por prioridad: [Red Vial Chile (MOP), Red Vial CMPC]. */
// RENDIMIENTO (20-10-2026): la lista se arma una vez para la zona visible (con margen) y se reutiliza en cada movimiento del
// mouse; se rehace al cambiar zoom, capas, cantidad de tramos o al salir de esa zona.
let imanCache_ = null;
function tramosImantables_() {
  const z = map.getZoom();
  const clave = z + '|' + !!state.redVialOn + '|' + !!state.redVialCmpcOn + '|' + redVialTramos_.length + '|' + redVialCmpcTramos_.length + '|' +
    JSON.stringify(state.redVialCmpcCatOculta || {});
  const vistaActual = map.getBounds();
  if (imanCache_ && imanCache_.clave === clave && imanCache_.mopRef === redVialTramos_ && imanCache_.cmpcRef === redVialCmpcTramos_ &&
      imanCache_.zona.contains(vistaActual)) return imanCache_.listas;
  const zona = vistaActual.pad(0.5), mop = [], cmpc = [];
  if (state.redVialOn) redVialTramos_.forEach(t => { if (z >= RED_VIAL_CATEGORIAS[t.cat].minZ && t.bounds.intersects(zona)) mop.push(t); });
  if (state.redVialCmpcOn) redVialCmpcTramos_.forEach(t => { if (!state.redVialCmpcCatOculta[t.cat] && t.bounds.intersects(zona)) cmpc.push(t); });
  imanCache_ = { clave, zona, listas: [mop, cmpc], mopRef: redVialTramos_, cmpcRef: redVialCmpcTramos_ };
  return imanCache_.listas;
}

function imanActivo_() {
  return !!state.imanRedVial &&
    ((state.redVialOn && redVialTramos_.length > 0) || (state.redVialCmpcOn && redVialCmpcTramos_.length > 0)) &&
    state.dibujoModo === 'linea' && !!(state.editorMode || state.modoPlanificacion) && !state.editandoForma;
}

/** Punto del camino visible más cercano a latlng (dentro de IMAN_PX), o null.
 *  Prioridad: si hay un camino de la Red Vial Chile al alcance, gana aunque un
 *  camino CMPC esté más cerca; la CMPC solo imanta donde no hay ruta chilena. */
function snapRedVial_(latlng, radioPx) {
  const radio = radioPx || IMAN_PX;
  const p = map.latLngToLayerPoint(latlng);
  const esq = map.layerPointToLatLng(p.add([radio, radio]));
  const dLat = Math.abs(esq.lat - latlng.lat), dLng = Math.abs(esq.lng - latlng.lng);
  const zona = L.latLngBounds([latlng.lat - dLat, latlng.lng - dLng], [latlng.lat + dLat, latlng.lng + dLng]);
  for (const lista of tramosImantables_()) {
    const s = snapEnTramos_(lista, p, zona, radio);
    if (s) return s;
  }
  return null;
}

function snapEnTramos_(lista, p, zona, radio) {
  let mejor = null, mejorD = radio || IMAN_PX;
  lista.forEach((t) => {
    if (!t.bounds.intersects(zona)) return;
    t.partes.forEach((parte, pi) => {
      let a = map.latLngToLayerPoint(parte[0]);
      for (let si = 0; si < parte.length - 1; si++) {
        const b = map.latLngToLayerPoint(parte[si + 1]);
        const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy;
        let u = l2 ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2 : 0;
        u = Math.max(0, Math.min(1, u));
        const d = Math.hypot(p.x - (a.x + u * dx), p.y - (a.y + u * dy));
        if (d < mejorD) {
          mejorD = d;
          const A = parte[si], B = parte[si + 1];
          mejor = { tramo: t, pi, si, u, punto: L.latLng(A.lat + (B.lat - A.lat) * u, A.lng + (B.lng - A.lng) * u) };
        }
        a = b;
      }
    });
  });
  return mejor;
}

/** Vértices del camino entre dos puntos imantados al MISMO tramo (sin los extremos). */
function caminoEntreSnaps_(s1, s2) {
  if (!s1 || !s2 || s1.tramo !== s2.tramo || s1.pi !== s2.pi) return [];
  const parte = s1.tramo.partes[s1.pi], out = [];
  if (s1.si + s1.u <= s2.si + s2.u) { for (let k = s1.si + 1; k <= s2.si; k++) out.push(parte[k]); }
  else { for (let k = s1.si; k > s2.si; k--) out.push(parte[k]); }
  // Sin duplicados con los extremos (cuando el clic cae justo sobre un vértice del camino)
  return out.filter(v => v.distanceTo(s1.punto) > 0.5 && v.distanceTo(s2.punto) > 0.5)
            .map(v => L.latLng(v.lat, v.lng));
}

/* ── SEGUIR LA RED VIAL (20-10-2026): entre dos puntos pegados al camino, la línea recorre el camino aunque cruce varios
 * tramos o intersecciones (ruta más corta por la red visible, Dijkstra). Grafo: un nodo por vértice de los tramos imantables
 * (coordenada redondeada a ~1 m, así los tramos que se tocan quedan conectados), aristas = segmentos con su largo en metros.
 * Se arma una vez por zona visible (se guarda junto a la caché del imán). */
const IMAN_PX_SEGUIR = 40;      // en trazo libre, ya pegado a un camino, lo sigue aunque el mouse se aleje hasta esto
function clavePuntoIman_(ll) { return ll.lat.toFixed(5) + ',' + ll.lng.toFixed(5); }
function metrosIman_(a, b) {
  const dy = (b.lat - a.lat) * 110540, dx = (b.lng - a.lng) * 111320 * Math.cos((a.lat + b.lat) * Math.PI / 360);
  return Math.sqrt(dx * dx + dy * dy);
}
function grafoIman_() {
  const listas = tramosImantables_();
  if (imanCache_ && imanCache_.grafo) return imanCache_.grafo;
  const nodos = new Map();   // clave → { ll, ady: [[clave, metros]] }
  const nodo = ll => { const k = clavePuntoIman_(ll); let n = nodos.get(k); if (!n) { n = { ll, ady: [] }; nodos.set(k, n); } return k; };
  listas.forEach(lista => lista.forEach(t => t.partes.forEach(parte => {
    for (let i = 0; i < parte.length - 1; i++) {
      const a = nodo(parte[i]), b = nodo(parte[i + 1]); if (a === b) continue;
      const w = metrosIman_(parte[i], parte[i + 1]);
      nodos.get(a).ady.push([b, w]); nodos.get(b).ady.push([a, w]);
    }
  })));
  const g = { nodos };
  if (imanCache_) imanCache_.grafo = g;
  return g;
}
/** Vértices del camino entre dos puntos imantados (sin los extremos) recorriendo la red; null si no hay camino razonable. */
function rutaPorRedVial_(s1, s2) {
  if (!s1 || !s2) return null;
  // Mismo tramo: el camino es único y no hace falta buscar
  if (s1.tramo === s2.tramo && s1.pi === s2.pi) return caminoEntreSnaps_(s1, s2);
  const { nodos } = grafoIman_();
  const recto = metrosIman_(s1.punto, s2.punto);
  const tope = recto * 4 + 500;                       // desvíos mayores = no es «seguir el camino»
  // Nodos virtuales para los dos puntos (conectados a los extremos de su segmento)
  const ady = new Map();
  const conectar = (k, s) => {
    const parte = s.tramo.partes[s.pi], A = parte[s.si], B = parte[s.si + 1];
    ady.set(k, [[clavePuntoIman_(A), metrosIman_(s.punto, A)], [clavePuntoIman_(B), metrosIman_(s.punto, B)]]);
  };
  conectar('S1', s1); conectar('S2', s2);
  const vecinos = k => {
    if (ady.has(k)) return ady.get(k);
    const n = nodos.get(k); if (!n) return [];
    // Llegada al destino virtual desde los extremos de su segmento
    const extra = ady.get('S2').filter(([kk]) => kk === k).map(([, w]) => ['S2', w]);
    return extra.length ? n.ady.concat(extra) : n.ady;
  };
  // Dijkstra con montículo binario
  const dist = new Map([['S1', 0]]), prev = new Map(), heap = [[0, 'S1']];
  const push = it => { heap.push(it); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i;
    if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
  let visitados = 0, encontrado = false;
  while (heap.length) {
    const [d, k] = pop();
    if (d > (dist.get(k) ?? Infinity)) continue;
    if (k === 'S2') { encontrado = true; break; }
    if (d > tope || ++visitados > 80000) break;
    for (const [kk, w] of vecinos(k)) {
      const nd = d + w;
      if (nd < (dist.get(kk) ?? Infinity)) { dist.set(kk, nd); prev.set(kk, k); push([nd, kk]); }
    }
  }
  if (!encontrado) return null;
  const camino = []; let k = prev.get('S2');
  while (k && k !== 'S1') { const n = nodos.get(k); if (n) camino.push(L.latLng(n.ll.lat, n.ll.lng)); k = prev.get(k); }
  camino.reverse();
  return camino.filter(v => metrosIman_(v, s1.punto) > 0.5 && metrosIman_(v, s2.punto) > 0.5);
}

/** Para el clic en modo línea: devuelve los vértices a agregar (camino + punto) o null si no imanta. */
function verticesConIman_(latlng, ev) {
  if (!imanActivo_() || (ev && ev.shiftKey)) { ultimoSnapIman_ = null; return null; }
  const s = snapRedVial_(latlng);
  if (!s) { ultimoSnapIman_ = null; return null; }
  const previo = tempDibujoVertices[tempDibujoVertices.length - 1];
  const sigue = ultimoSnapIman_ && previo && previo.distanceTo(ultimoSnapIman_.punto) < 0.01;
  let camino = [];
  if (sigue) {
    const r = rutaPorRedVial_(ultimoSnapIman_, s);
    if (r) camino = r;
    else mostrarToast_('🧲 No hay un camino continuo visible entre los dos puntos: se unieron en línea recta (acerca el zoom o enciende la Red Vial CMPC).');
  }
  ultimoSnapIman_ = s;
  return camino.concat([s.punto]);
}

/** Trazo libre con imán «pegajoso»: devuelve los puntos a agregar para esta muestra (camino recorrido + punto), o el punto
 *  tal cual si no hay camino cerca. Una vez pegado, sigue el camino con un radio mayor (IMAN_PX_SEGUIR). */
let snapTrazoPrevio_ = null;
function muestrasTrazoConIman_(latlng, ev) {
  if (!imanActivo_() || (ev && ev.shiftKey)) { snapTrazoPrevio_ = null; return [latlng]; }
  const s = snapRedVial_(latlng, snapTrazoPrevio_ ? IMAN_PX_SEGUIR : IMAN_PX);
  if (!s) { snapTrazoPrevio_ = null; return [latlng]; }
  let camino = [];
  if (snapTrazoPrevio_) camino = rutaPorRedVial_(snapTrazoPrevio_, s) || [];
  snapTrazoPrevio_ = s;
  return camino.concat([s.punto]);
}

/** Marcador que anticipa dónde quedará el vértice (anillo naranjo sobre el camino). */
function mostrarIndicadorIman_(e) {
  const s = (imanActivo_() && !(e.originalEvent && e.originalEvent.shiftKey)) ? snapRedVial_(e.latlng) : null;
  if (!s) { if (marcadorIman_) { map.removeLayer(marcadorIman_); marcadorIman_ = null; } return; }
  if (!marcadorIman_) {
    marcadorIman_ = L.circleMarker(s.punto, {
      radius: 7, color: '#EA580C', weight: 2.5, fillColor: '#fff', fillOpacity: 0.9,
      interactive: false, pane: 'markerPane',
    }).addTo(map);
  } else marcadorIman_.setLatLng(s.punto);
}
let imanRaf_ = null;
map.on('mousemove', (e) => {
  if (imanRaf_) return;
  imanRaf_ = requestAnimationFrame(() => { imanRaf_ = null; mostrarIndicadorIman_(e); });
});
map.on('mouseout', () => { if (marcadorIman_) { map.removeLayer(marcadorIman_); marcadorIman_ = null; } });

/* RENDIMIENTO (20-10-2026): animaciones pausadas mientras se mueve / hace zoom el mapa (.map-moviendo) y apagadas mientras se
 * edita o dibuja (body.editando-mapa). La marca de edición se revisa cada 0,4 s: cubre todos los modos (planificar, editar
 * forma, Periodo Crítico, recursos del área) sin tocar cada uno de sus puntos de entrada y salida. */
map.on('movestart zoomstart', () => map.getContainer().classList.add('map-moviendo'));
map.on('moveend zoomend', () => map.getContainer().classList.remove('map-moviendo'));
setInterval(() => {
  const editando = !!(state.editorMode || state.modoPlanificacion || state.editandoForma || state.modoRecursosArea || state.cortarRuta || state.modoRegla);
  if (document.body.classList.contains('editando-mapa') !== editando) document.body.classList.toggle('editando-mapa', editando);
}, 400);
// Rutas largas en edición: los vértices se dibujan solo en pantalla → al mover el mapa se vuelven a dibujar
map.on('moveend', () => {
  try {   // (try: este archivo declara tempDibujoVertices más abajo; un moveend durante la carga no debe cortar el setView)
    if (tempDibujoVertices.length > VERTICES_SIN_RECORTE && !(state.editandoForma && state.editandoForma.partes) &&
        (state.editorMode || state.modoPlanificacion || state.editandoForma)) redibujarVerticesEdicion_();
  } catch (e) { /* aún cargando */ }
});

async function toggleImanRedVial_() {
  if (!state.redVialOn && !state.redVialCmpcOn) {
    state.imanRedVial = true;
    await toggleRedVial_();   // el imán necesita la Red Vial cargada
    mostrarToast_('🧲 Imán activo: se encendió la Red Vial. Los clics cerca de un camino se pegan a él (Shift = sin imán).');
  } else {
    state.imanRedVial = !state.imanRedVial;
    mostrarToast_(state.imanRedVial
      ? '🧲 Imán activo: los vértices se pegan a la Red Vial y siguen su curva (Shift = sin imán).'
      : 'Imán desactivado.');
  }
  if (!state.imanRedVial && marcadorIman_) { map.removeLayer(marcadorIman_); marcadorIman_ = null; }
  actualizarBotonesModoDibujo_();
}

/* ============ ESCALA DINÁMICA + ZOOM DEL VISOR ============
 * Abajo al centro del mapa: barra de escala (Leaflet), nivel de zoom y escala
 * numérica aproximada (1:N a 96 dpi). Con la Red Vial encendida suma el control
 * "Rol desde zoom": Auto (por jerarquía, como Google) o un zoom fijo desde el que
 * se muestran TODAS las etiquetas rol_label. La preferencia se recuerda en este
 * navegador. */
state.redVialEtiquetaZoom = (() => {
  try { const v = localStorage.getItem('sig_rv_etiqueta_zoom_v2'); return v ? Number(v) : null; } catch (e) { return null; }
})();

function escalaNumerica_() {
  const c = map.getCenter();
  const mPorPx = 40075016.686 * Math.cos(c.lat * Math.PI / 180) / Math.pow(2, map.getZoom() + 8);
  const n = mPorPx / 0.0002645833; // 1 px = 0,2646 mm a 96 dpi
  const r = n > 10000 ? Math.round(n / 1000) * 1000 : n > 1000 ? Math.round(n / 100) * 100 : Math.round(n);
  return '1:' + r.toLocaleString('es-CL');
}

function actualizarEscalaZoom_() {
  const caja = document.getElementById('escala-zoom');
  if (!caja) return;
  const z = map.getZoom();
  caja.querySelector('.ez-zoom').textContent = 'Zoom ' + (Math.round(z * 100) / 100).toLocaleString('es-CL');
  caja.querySelector('.ez-ratio').textContent = escalaNumerica_();

  const rv = caja.querySelector('.ez-rv');
  const mostrar = state.redVialOn ? '' : 'none';
  if (rv.style.display !== mostrar) {
    rv.style.display = mostrar;
    setTimeout(alinearResumenConSimbologia_, 0); // cambió el alto: reapilar la columna derecha
  }
  if (!state.redVialOn) return;
  const fijo = state.redVialEtiquetaZoom;
  const sel = rv.querySelector('select');
  if (sel.value !== (fijo == null ? 'auto' : String(fijo))) sel.value = fijo == null ? 'auto' : String(fijo);
  // Estado: ¿se ven etiquetas a este zoom?
  const estado = rv.querySelector('.ez-estado');
  let visible;
  if (!state.mostrarEtiquetasRedVial) visible = 'apagadas';
  else if (fijo != null) visible = z >= fijo ? 'visibles' : 'desde ' + fijo;
  else {
    const minimo = Math.min(...Object.values(RED_VIAL_CATEGORIAS).map(c => c.labelZ));
    visible = z >= RED_VIAL_CATEGORIAS.tierra.labelZ ? 'todas' : z >= minimo ? 'principales' : 'desde ' + minimo;
  }
  estado.textContent = visible;
  estado.className = 'ez-estado' + (/^(visibles|todas|principales)$/.test(visible) ? ' on' : '');
}

(function crearEscalaZoom_() {
  const caja = document.createElement('div');
  caja.id = 'escala-zoom';
  const opciones = ['<option value="auto">Auto</option>']
    .concat([8, 9, 10, 11, 12, 13, 14, 15, 16, 17].map(z => '<option value="' + z + '">' + z + '</option>')).join('');
  caja.innerHTML =
    '<div class="ez-fila"><div class="ez-barra"></div><span class="ez-zoom">Zoom</span></div>' +
    '<span class="ez-ratio"></span>' +
    '<span class="ez-rv" style="display:none;">' +
      '<label title="Zoom desde el que se muestra el rol de los caminos (rol_label). Auto: por jerarquía, como Google.">🏷️ Rol desde ' +
      '<select>' + opciones + '</select></label><span class="ez-estado"></span></span>';
  map.getContainer().appendChild(caja);
  L.DomEvent.disableClickPropagation(caja);
  L.DomEvent.disableScrollPropagation(caja);
  // La barra de escala es el control nativo de Leaflet, movido dentro del indicador.
  const escala = L.control.scale({ metric: true, imperial: false, maxWidth: 80, position: 'bottomleft' }).addTo(map);
  caja.querySelector('.ez-barra').appendChild(escala.getContainer());
  caja.querySelector('select').addEventListener('change', (e) => {
    state.redVialEtiquetaZoom = e.target.value === 'auto' ? null : Number(e.target.value);
    try {
      if (state.redVialEtiquetaZoom == null) localStorage.removeItem('sig_rv_etiqueta_zoom_v2');
      else localStorage.setItem('sig_rv_etiqueta_zoom_v2', String(state.redVialEtiquetaZoom));
    } catch (err) {}
    declutterEtiquetasRedVial_();
    actualizarEscalaZoom_();
  });
  map.on('zoomend moveend', actualizarEscalaZoom_);
  // La simbología cambia de alto/ancho (instituciones, S/M/L, colapso, mostrar/ocultar):
  // la columna derecha se reapila sola.
  const simb = document.getElementById('simbologia-flotante');
  if (simb && window.ResizeObserver) new ResizeObserver(() => alinearResumenConSimbologia_()).observe(simb);
  actualizarEscalaZoom_();
  // alinearResumenConSimbologia_ vive en un módulo posterior: se llama cuando ya cargaron todos los módulos
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => alinearResumenConSimbologia_());
  else setTimeout(() => alinearResumenConSimbologia_(), 0);
})();

async function loadAreaLayers_() {
  const rolCalifica = state.perfil.perfil === 'Administrador' || state.perfil.perfil === 'Jefe de Área Relacionamiento';
  if (!rolCalifica) return;

  const { data: res, error } = await supabaseClient.functions.invoke('get-area-layers', { body: {} });
  if (error || !res || !res.ok) {
    console.error('No se pudieron cargar las capas por zona:', error || res);
    return;
  }

  areaRelacionamientoLayer.clearLayers();
  // fundosCmpcLayer y fundosCmpcFeatureLayers los gestiona loadFundosCmpcPostgis_

  if (false && res.fundosCmpc && res.fundosCmpc.ok) {  // DESACTIVADO: fundos CMPC ahora se cargan por comuna desde PostGIS (loadFundosCmpcPostgis_)
    let feats = res.fundosCmpc.data.features || [];
    if (window.__DEBUG_FUNDOS__ && feats[0]) console.log('[Fundos CMPC] propiedades de ejemplo:', feats[0].properties);
    // Filtro por comuna activa (punto 3). Primero intenta por campo comuna; si los
    // datos no lo traen, filtra por GEOMETRÍA: el centroide del fundo dentro del
    // límite comunal activo (que ya está cargado en limiteLayer).
    const idcActiva = idComunaActiva_();
    const nombreComunaActiva = (state.comunas.find(c => c.id === state.activeComunaId) || {}).comuna;
    const p0 = feats.length ? (feats[0].properties || {}) : {};
    const tieneCampoComuna = (p0.id_comuna != null || p0.comuna != null || p0.COMUNA != null);
    const limiteCargado = (() => { try { return limiteLayer.getBounds && limiteLayer.getBounds().isValid(); } catch (e) { return false; } })();

    if (tieneCampoComuna && (idcActiva || nombreComunaActiva)) {
      feats = feats.filter(f => {
        const p = f.properties || {};
        if (p.id_comuna != null && idcActiva != null) return String(p.id_comuna) === String(idcActiva);
        const cn = (p.comuna || p.COMUNA || '').toString().toLowerCase();
        return cn === (nombreComunaActiva || '').toLowerCase();
      });
    } else if (limiteCargado) {
      // Filtro geométrico: centroide del fundo dentro de la comuna activa
      feats = feats.filter(f => {
        try {
          const g = f.geometry; if (!g) return false;
          const coords = g.type === 'MultiPolygon' ? g.coordinates[0][0] : (g.type === 'Polygon' ? g.coordinates[0] : null);
          if (!coords || !coords.length) return false;
          // Centroide simple del anillo exterior
          let sx = 0, sy = 0; coords.forEach(c => { sx += c[0]; sy += c[1]; });
          const cx = sx / coords.length, cy = sy / coords.length;
          return puntoDentroDeComuna_(cy, cx);
        } catch (e) { return true; }
      });
    }
    state.fundosCmpcInfo = { ok: true, count: feats.length };
    // Índice para árbol Área -> Sector -> [capas]. Cada feature es capa independiente.
    window.arbolFundos = {};
    feats.forEach(feature => {
      const p = feature.properties || {};
      const area = p.AREA || 'Sin área';
      const sector = p.SECTOR || 'Sin sector';
      const capa = L.geoJSON(feature, {
        style: { color: '#059669', weight: 1.5, fillColor: '#34D399', fillOpacity: 0.18 },
        onEachFeature: (f, ly) => {
          ly.bindPopup(
            '<div class="popup-title">' + (p.FUNDO || 'Fundo') + '</div>' +
            '<div class="popup-row">🗺️ ' + (p.AREA || '—') + ' · ' + (p.SECTOR || '—') + '</div>' +
            '<div class="popup-row">📐 ' + (p.SUP_HA ? p.SUP_HA + ' ha' : '—') + '</div>' +
            '<div class="popup-row">🏢 ' + (p.PROPIETARIO || '—') + '</div>'
          );
          if (p.FUNDO) {
            fundosCmpcFeatureLayers.push({ layer: ly, nombre: escapeHtml_(String(p.FUNDO)) });
            if (state.mostrarEtiquetasFundos) {
              ly.bindTooltip(escapeHtml_(String(p.FUNDO)), { permanent: true, direction: 'center', className: 'map-label label-fundo' });
            }
          }
        },
      });
      fundosCmpcLayer.addLayer(capa);
      if (!window.arbolFundos[area]) window.arbolFundos[area] = {};
      if (!window.arbolFundos[area][sector]) window.arbolFundos[area][sector] = [];
      window.arbolFundos[area][sector].push(capa);
    });
    if (!state.fundosSectoresOcultos) state.fundosSectoresOcultos = {};
  } else {
    state.fundosCmpcInfo = { ok: false, count: 0, error: res.fundosCmpc && (res.fundosCmpc.error || res.fundosCmpc.mensaje) };
  }

  if (res.areaRelacionamiento && res.areaRelacionamiento.ok) {
    const feats = res.areaRelacionamiento.data.features || [];
    state.areaRelGeojson = res.areaRelacionamiento.data; // lo reutiliza el Planificador
    state.areaRelacionamientoInfo = { ok: true, count: feats.length };
    // Índice para el árbol: { area: { sector: [capas] } }
    window.arbolAreaRel = {};
    // IMPORTANTE: creamos cada feature como capa independiente y la agregamos
    // DIRECTAMENTE al layerGroup (no como un geoJSON contenedor), para que
    // addLayer/removeLayer sobre cada feature funcione de verdad.
    (feats).forEach(feature => {
      const p = feature.properties || {};
      const area = p.AREA || 'Sin área';
      const sector = p.SECTOR || 'Sin sector';
      const capa = L.geoJSON(feature, {
        style: { color: '#7C3AED', weight: 1.5, fillColor: '#C4B5FD', fillOpacity: 0.18 },
        onEachFeature: (f, ly) => {
          ly.bindPopup(
            '<div class="popup-title">Área de Relacionamiento</div>' +
            '<div class="popup-row">🗺️ ' + (p.AREA || '—') + ' · ' + (p.SECTOR || '—') + '</div>'
          );
          if (p.SECTOR) {
            ly.bindTooltip(escapeHtml_(String(p.SECTOR)), { permanent: true, direction: 'center', className: 'map-label label-arearel' });
          }
        },
      });
      areaRelacionamientoLayer.addLayer(capa);
      if (!window.arbolAreaRel[area]) window.arbolAreaRel[area] = {};
      if (!window.arbolAreaRel[area][sector]) window.arbolAreaRel[area][sector] = [];
      window.arbolAreaRel[area][sector].push(capa);
    });
    // Estado del árbol: por defecto todos los sectores visibles
    if (!state.areaRelSectoresOcultos) state.areaRelSectoresOcultos = {}; // "area||sector" -> true si oculto
  } else {
    state.areaRelacionamientoInfo = { ok: false, count: 0, error: res.areaRelacionamiento && (res.areaRelacionamiento.error || res.areaRelacionamiento.mensaje) };
  }

  if (state.areasLayersOn.fundosCmpc) fundosCmpcLayer.addTo(map);
  if (state.areasLayersOn.areaRelacionamiento) areaRelacionamientoLayer.addTo(map);

  await loadRecursosDisponiblesAreaLayer_();
  if (state.areasLayersOn.recursosDisponibles) recursosDisponiblesAreaLayer.addTo(map);

  // Capas admin por comuna: recargar si están activas
  if (esAdminOJefe_()) {   // 17-10-2026: también Jefe de Área
    if (state.recursosComunaAdminOn) { await loadRecursosComunaAdmin_(); recursosComunaAdminLayer.addTo(map); }
    if (state.rutasComunaAdminOn)    { await loadRutasComunaAdmin_();    rutasComunaAdminLayer.addTo(map); }
  }

  if (document.querySelector('.rail-btn.active').dataset.tab === 'capas') renderTab('capas');
}

