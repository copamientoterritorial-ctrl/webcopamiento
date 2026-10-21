/* ============ INCENDIOS SIDCO: comuna/área + 10 km (06-10-2026) ============
 * La Edge Function entrega solo los focos de la comuna. Para el margen se usa el
 * archivo nacional capas-nacionales/incendios_sidco.geojson (se descarga UNA vez
 * por sesión) filtrado con la zona de zona_incendios_geojson (SQL 82). Si algo
 * falla, el mapa se queda con los focos de la comuna. */
const INCENDIOS_MARGEN_M = 10000;
let incendiosNacional_ = null;          // Promise<{ grupos por temporada en bruto: [{c:[lng,lat], t}] }>
let incendiosZonaClave_ = null;         // clave comuna/área de la última ampliación pedida

function agruparFocosPorTemporada_(feats) {
  const grupos = {};
  (feats || []).forEach(f => {
    const c = coordenadasPunto_(f && f.geometry);
    if (!c) return;
    const t = buscarProp_(f.properties, ['temporada','periodo','ano','year']) || 'Sin clasificar';
    (grupos[t] = grupos[t] || []).push(c);
  });
  return grupos;   // { '2025-2026': [[lng, lat], ...] }
}

function pintarIncendios_(grupos) {
  incendiosContainerLayer.clearLayers();
  Object.keys(fireHeatLayers).forEach(k => delete fireHeatLayers[k]);
  const nombres = Object.keys(grupos).sort().reverse();
  nombres.forEach((nombre, idx) => {
    const color = TEMPORADA_PALETTE[idx % TEMPORADA_PALETTE.length];
    const puntos = grupos[nombre];
    const heatPts = puntos.map(([lng, lat]) => [lat, lng, 0.6]);
    const heat = L.heatLayer(heatPts, { radius: 26, blur: 20, maxZoom: 13, gradient: { 0.3: color + '55', 0.6: color, 1.0: '#FFFFFF' } });
    const marcadores = L.layerGroup();
    puntos.forEach(([lng, lat]) => {
      L.marker([lat, lng], { icon: flameDivIcon_(color) }).addTo(marcadores);
    });
    const combinado = L.layerGroup([heat, marcadores]);
    fireHeatLayers[nombre] = { layer: combinado, color, count: puntos.length };
    if (state.layersOn[nombre] === undefined) state.layersOn[nombre] = false;
    if (state.layersOn[nombre]) incendiosContainerLayer.addLayer(combinado);
  });
  state.temporadasDetectadas = nombres;
}

function cargarIncendiosNacional_() {
  if (incendiosNacional_) return incendiosNacional_;
  incendiosNacional_ = (async () => {
    const { data, error } = await supabaseClient.storage.from('capas-nacionales').download('incendios_sidco.geojson');
    if (error || !data) throw new Error(error ? error.message : 'archivo vacío');
    const gj = JSON.parse(await data.text());
    const focos = [];
    (gj.features || []).forEach(f => {
      const c = coordenadasPunto_(f && f.geometry);
      // Solo grados (EPSG:4326); si el archivo viniera proyectado no sirve para filtrar.
      if (!c || Math.abs(c[0]) > 180 || Math.abs(c[1]) > 90) return;
      focos.push({ c, t: buscarProp_(f.properties, ['temporada','periodo','ano','year']) || 'Sin clasificar' });
    });
    return focos;
  })();
  // Si falló, permitir reintentar en la próxima comuna/área.
  incendiosNacional_.catch(() => { incendiosNacional_ = null; });
  return incendiosNacional_;
}

/** Polígonos [[anillo exterior, huecos...], ...] de un GeoJSON Polygon/MultiPolygon. */
function poligonosDeGeojson_(g) {
  if (!g) return [];
  if (g.type === 'Polygon') return [g.coordinates];
  if (g.type === 'MultiPolygon') return g.coordinates;
  if (g.type === 'GeometryCollection') return (g.geometries || []).flatMap(poligonosDeGeojson_);
  return [];
}

function puntoEnPoligonos_(lng, lat, polys) {
  for (const p of polys) {
    const bb = p.__bb;
    if (bb && (lng < bb[0] || lng > bb[2] || lat < bb[1] || lat > bb[3])) continue;
    if (!puntoEnAnillo_(lat, lng, p[0])) continue;
    let enHueco = false;
    for (let k = 1; k < p.length; k++) if (puntoEnAnillo_(lat, lng, p[k])) { enHueco = true; break; }
    if (!enHueco) return true;
  }
  return false;
}

/** Repinta los incendios con los focos de la comuna/área activa + 10 km. */
async function ampliarIncendiosZona_() {
  const k = claveRedVial_();   // misma clave comuna/área que la Red Vial
  const clave = k ? k.ambito + ':' + k.clave : null;
  incendiosZonaClave_ = clave;
  if (!k) return;
  try {
    const [focos, zona] = await Promise.all([
      cargarIncendiosNacional_(),
      supabaseClient.rpc('zona_incendios_geojson', { p_ambito: k.ambito, p_clave: k.clave, p_metros: INCENDIOS_MARGEN_M }),
    ]);
    if (incendiosZonaClave_ !== clave) return;   // cambió la comuna/área mientras cargaba
    if (zona.error) throw new Error(zona.error.message);
    if (!zona.data) return;                       // sin zona: se quedan los de la comuna
    const polys = poligonosDeGeojson_(JSON.parse(zona.data));
    if (!polys.length) return;
    polys.forEach(p => {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      p[0].forEach(([x, y]) => { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; });
      p.__bb = [x0, y0, x1, y1];
    });
    const grupos = {};
    focos.forEach(f => {
      if (puntoEnPoligonos_(f.c[0], f.c[1], polys)) (grupos[f.t] = grupos[f.t] || []).push(f.c);
    });
    if (!Object.keys(grupos).length) return;
    state.incendiosAmpliado = true;
    state.incendiosMatched = true;
    pintarIncendios_(grupos);
    const tab = document.querySelector('.rail-btn.active');
    if (tab && tab.dataset.tab === 'capas') renderTab('capas');
  } catch (e) {
    // Sin el SQL 82 o sin acceso al archivo: se mantienen los focos de la comuna.
    console.warn('Incendios + 10 km no disponibles (se muestran los de la comuna):', e.message || e);
  }
}

function coordenadasPunto_(geom) {
  if (!geom || !geom.coordinates) return null;
  let c = geom.coordinates;
  while (Array.isArray(c[0])) c = c[0];
  return (typeof c[0] === 'number' && typeof c[1] === 'number') ? c : null;
}

function buscarProp_(props, candidatos) {
  if (!props) return null;
  const keys = Object.keys(props);
  for (const c of candidatos) {
    const k = keys.find(k => k.toLowerCase() === c.toLowerCase());
    if (k && props[k]) return props[k];
  }
  for (const c of candidatos) {
    const k = keys.find(k => k.toLowerCase().includes(c.toLowerCase()));
    if (k && props[k]) return props[k];
  }
  return null;
}

/* ============ RECURSOS DE COPAMIENTO ============ */
/* Punto 2: detectar si una geometría cae fuera del límite comunal (limiteLayer)
 * para advertir antes de guardar. Ray-casting sin librerías externas. */
function puntoEnAnillo_(lat, lng, anillo) {
  let dentro = false;
  for (let i = 0, j = anillo.length - 1; i < anillo.length; j = i++) {
    const xi = anillo[i][0], yi = anillo[i][1];
    const xj = anillo[j][0], yj = anillo[j][1];
    const intersecta = ((yi > lat) !== (yj > lat)) && (lng < (xj - xi) * (lat - yi) / (yj - yi) + xi);
    if (intersecta) dentro = !dentro;
  }
  return dentro;
}
function puntoDentroDeComuna_(lat, lng) {
  const gj = limiteLayer.toGeoJSON();
  if (!gj || !gj.features || !gj.features.length) return true; // sin límite: no advertir
  for (const f of gj.features) {
    const g = f.geometry; if (!g) continue;
    const polys = g.type === 'MultiPolygon' ? g.coordinates : (g.type === 'Polygon' ? [g.coordinates] : []);
    for (const poly of polys) {
      if (puntoEnAnillo_(lat, lng, poly[0])) {
        let enHueco = false;
        for (let k = 1; k < poly.length; k++) if (puntoEnAnillo_(lat, lng, poly[k])) { enHueco = true; break; }
        if (!enHueco) return true;
      }
    }
  }
  return false;
}
function geometriaDentroDeComuna_(latlngs) {
  return latlngs.every(p => puntoDentroDeComuna_(p.lat != null ? p.lat : p[1], p.lng != null ? p.lng : p[0]));
}
function confirmarSiFueraDeComuna_(latlngs) {
  if (geometriaDentroDeComuna_(latlngs)) return true;
  return confirm('⚠️ Parte de lo que dibujaste queda FUERA del límite de la comuna. ¿Deseas guardarlo de todos modos?');
}

/* ============ EDICIÓN DE FORMA DE GEOMETRÍAS GUARDADAS (punto 1b) ============
 * Reabre una línea/área ya guardada (copamiento o planificación) con vértices
 * arrastrables y guarda la nueva forma vía RPC. Reutiliza tempVerticeMarkers. */
state.editandoForma = null; // { tabla:'copamiento'|'planificacion', id, tipo, capaOriginal }

function iniciarEdicionForma_(tabla, id) {
  // Buscar el recurso y su geometría según la tabla
  let r, capa;
  if (tabla === 'copamiento') { r = state.recursos.find(x => x.id === id); capa = recursosMarkersById[id]; }
  else { r = (state.planificacionRecursos || []).find(x => x.id === id); capa = (window.planRecursosMarkersById || {})[id]; }
  if (!r) { mostrarToast_('No se encontró el recurso.'); return; }
  if (r.tipo_geometria !== 'linea' && r.tipo_geometria !== 'area') { mostrarToast_('Solo se puede editar la forma de líneas o áreas.'); return; }

  // Parsear la geometría a un array de latlng
  let gj;
  try { gj = JSON.parse(r.geom_geojson); } catch (e) { mostrarToast_('Geometría inválida.'); return; }
  // Una ruta unida por un vértice intermedio se guarda como MultiLineString.
  // En planificación se edita por tramos sin separarla (ver
  // iniciarEdicionFormaMulti_). Las demás geometrías múltiples no tienen RPC
  // de guardado multiparte, así que aplanarlas destruiría su estructura.
  if (gj.type === 'MultiLineString' && tabla === 'planificacion') {
    iniciarEdicionFormaMulti_(tabla, id, gj, capa);
    return;
  }
  if (gj.type === 'MultiLineString' || gj.type === 'MultiPolygon') {
    mostrarToast_('⚠️ Esta figura tiene varias partes y aquí no se puede editar sin separarla.');
    return;
  }
  let coords = r.tipo_geometria === 'area' ? gj.coordinates[0].slice(0, -1) : gj.coordinates; // área: quitar el punto de cierre
  reiniciarPasosDibujo_();   // ↶ Deshacer parte de cero en cada edición de forma
  tempDibujoVertices = coords.map(c => L.latLng(c[1], c[0]));
  state.dibujoModo = r.tipo_geometria;

  // Ocultar la capa original mientras se edita
  if (capa) map.removeLayer(capa);

  // Dibujar la figura editable + vértices
  if (tempDibujoLayer) { map.removeLayer(tempDibujoLayer); tempDibujoLayer = null; }
  tempDibujoLayer = r.tipo_geometria === 'area'
    ? L.polygon(tempDibujoVertices, { color: '#7C3AED', weight: 3, dashArray: '8,6', fillOpacity: 0.12 }).addTo(map)
    : L.polyline(tempDibujoVertices, { color: '#7C3AED', weight: 4, dashArray: '8,6' }).addTo(map);
  redibujarVerticesEdicion_();

  state.editandoForma = { tabla, id, tipo: r.tipo_geometria, capaOriginal: capa };
  map.closePopup();
  document.getElementById('editar-forma-banner').style.display = 'flex';
}

/* Edición de una ruta unida (MultiLineString) SIN separarla.
 * Todos los tramos se editan a la vez: cada tramo muestra sus vértices y sus
 * puntos intermedios. Los vértices que coinciden en varios tramos (empalmes) se
 * dibujan como UN solo marcador (naranjo) que mueve todos los coincidentes, para
 * que la ruta no se desconecte. tempDibujoVertices guarda la lista aplanada
 * (la usan la regla de medición y el bloqueo de la herramienta regla). */
const TEXTO_EDITAR_FORMA_SIMPLE = 'Editando forma — arrastra vértices para mover · arrastra un punto intermedio para AGREGAR · clic derecho para borrar';

function iniciarEdicionFormaMulti_(tabla, id, gj, capa) {
  const partes = (gj.coordinates || [])
    .map(parte => (parte || []).map(c => L.latLng(c[1], c[0])))
    .filter(parte => parte.length >= 2);
  if (partes.length === 0) { mostrarToast_('Geometría inválida.'); return; }

  if (capa) map.removeLayer(capa);
  if (tempDibujoLayer) { map.removeLayer(tempDibujoLayer); tempDibujoLayer = null; }
  state.dibujoModo = 'linea';
  tempDibujoLayer = L.polyline(partes, { color: '#7C3AED', weight: 4, dashArray: '8,6' }).addTo(map);

  state.editandoForma = { tabla, id, tipo: 'linea', capaOriginal: capa, partes };
  tempDibujoVertices = partes.reduce((acc, parte) => acc.concat(parte), []);
  map.closePopup();
  document.getElementById('editar-forma-banner').style.display = 'flex';
  document.getElementById('editar-forma-texto').textContent =
    'Editando ruta unida (' + partes.length + ' tramos) — arrastra vértices · los empalmes (naranjo) mueven todos los tramos unidos · arrastra un punto intermedio para AGREGAR · clic derecho para borrar';
  redibujarVerticesEdicion_();
  actualizarReglaMedicion_();
}

/** Vértices y puntos intermedios de TODOS los tramos de la ruta unida en edición. */
function redibujarVerticesMulti_() {
  const ef = state.editandoForma;
  tempVerticeMarkers.clearLayers();
  if (!map.hasLayer(tempVerticeMarkers)) tempVerticeMarkers.addTo(map);
  const refrescar = () => {
    tempDibujoVertices = ef.partes.reduce((acc, parte) => acc.concat(parte), []);
    if (tempDibujoLayer) tempDibujoLayer.setLatLngs(ef.partes);
    actualizarReglaMedicion_();
  };
  const alSoltar = () => { refrescar(); redibujarVerticesMulti_(); actualizarBotonesModoDibujo_(); };

  // 1) Puntos intermedios de cada tramo: al arrastrarlos se inserta un vértice nuevo.
  ef.partes.forEach((parte) => {
    for (let i = 0; i < parte.length - 1; i++) {
      const a = parte[i], b = parte[i + 1];
      const medio = L.latLng((a.lat + b.lat) / 2, (a.lng + b.lng) / 2);
      const mid = L.marker(medio, {
        draggable: true,
        icon: L.divIcon({ className: '', iconSize: [10, 10], iconAnchor: [5, 5],
          html: '<div title="Arrastra para agregar un vértice" style="width:10px;height:10px;border-radius:50%;background:rgba(37,99,235,0.35);border:1.5px solid #2563EB;cursor:copy;"></div>' }),
      });
      const insertarEn = i + 1;
      let insertado = false;
      mid.on('dragstart', () => { parte.splice(insertarEn, 0, medio); insertado = true; });
      mid.on('drag', (ev) => {
        if (!insertado) return;
        parte[insertarEn] = ev.target.getLatLng();
        refrescar();
      });
      mid.on('dragend', alSoltar);
      tempVerticeMarkers.addLayer(mid);
    }
  });

  // 2) Vértices reales, agrupados por posición: un empalme es un solo marcador.
  const grupos = new Map();
  ef.partes.forEach((parte, k) => parte.forEach((v, j) => {
    const clave = v.lat.toFixed(9) + ',' + v.lng.toFixed(9);
    if (!grupos.has(clave)) grupos.set(clave, { ll: v, refs: [] });
    grupos.get(clave).refs.push({ k, j });
  }));

  grupos.forEach((g) => {
    const empalme = new Set(g.refs.map(r => r.k)).size > 1;
    const m = L.marker(g.ll, {
      draggable: true,
      zIndexOffset: empalme ? 1000 : 0,
      icon: empalme
        ? L.divIcon({ className: '', iconSize: [18, 18], iconAnchor: [9, 9],
            html: '<div title="Empalme: mueve todos los tramos unidos" style="width:13px;height:13px;border-radius:50%;background:#fff;border:3px solid #EA580C;box-shadow:0 1px 3px rgba(0,0,0,0.4);cursor:move;"></div>' })
        : L.divIcon({ className: '', iconSize: [14, 14], iconAnchor: [7, 7],
            html: '<div style="width:10px;height:10px;border-radius:50%;background:#fff;border:2.5px solid #2563EB;box-shadow:0 1px 3px rgba(0,0,0,0.4);cursor:move;"></div>' }),
    });
    m.on('drag', (ev) => {
      const ll = ev.target.getLatLng();
      g.refs.forEach(r => { ef.partes[r.k][r.j] = L.latLng(ll.lat, ll.lng); });
      refrescar();
    });
    m.on('dragend', alSoltar);
    m.on('contextmenu', () => {
      if (empalme) { mostrarToast_('No se puede borrar un empalme: separaría la ruta.'); return; }
      const parte = ef.partes[g.refs[0].k];
      if (parte.length - g.refs.length < 2) { mostrarToast_('No puedes eliminar más vértices (mínimo 2 por tramo).'); return; }
      g.refs.map(r => r.j).sort((a, b) => b - a).forEach(j => parte.splice(j, 1));
      alSoltar();
    });
    tempVerticeMarkers.addLayer(m);
  });
}

async function guardarEdicionFormaMulti_() {
  const ef = state.editandoForma;
  if (ef.partes.some(parte => parte.length < 2)) { mostrarToast_('Cada tramo necesita al menos 2 vértices.'); return; }

  const todos = ef.partes.reduce((acc, parte) => acc.concat(parte), []);
  if (!confirmarSiFueraDeComuna_(todos)) return;

  const partesGeo = ef.partes.map(parte => parte.map(ll => [ll.lng, ll.lat]));
  const nuevasPartes = ef.partes.map(parte => parte.slice()); // copia antes de limpiar
  const { error } = await supabaseClient.rpc('actualizar_geometria_multilinea_planificacion', {
    p_id: ef.id,
    p_partes: partesGeo,
  });
  if (error) { mostrarToast_('Error: ' + error.message); return; }

  if (ef.capaOriginal && ef.capaOriginal.setLatLngs) {
    try { ef.capaOriginal.setLatLngs(nuevasPartes); } catch (e) {}
    ef.capaOriginal.addTo(map);
  }
  mostrarToast_('Forma actualizada (' + nuevasPartes.length + ' tramos).');
  avisarRutaEnOtrosEscenarios_(ef.id, 'Forma actualizada (' + nuevasPartes.length + ' tramos).');
  finalizarEdicionForma_();
  if (state.activeComunaId) loadPlanificacionRecursos_(state.activeComunaId);
}

/** El trigger de la BD (68) ya copió la nueva forma a la misma ruta en los otros
 *  escenarios; aquí solo se informa dónde. Sin el 68 ejecutado, no avisa nada. */
async function avisarRutaEnOtrosEscenarios_(id, mensajeBase) {
  try {
    const { data, error } = await supabaseClient.rpc('escenarios_misma_ruta', { p_id: id });
    if (error || !data || !data.length) return;
    const orden = { Verde: 1, Amarilla: 2, Roja: 3 };
    const escs = [...new Set(data.map(d => d.escenario))].sort((a, b) => (orden[a] || 9) - (orden[b] || 9));
    mostrarToast_(mensajeBase + ' También se actualizó en: ' + escs.map(nombreEscenario_).join(', ') + '.');
  } catch (e) { /* solo informativo */ }
}

async function guardarEdicionForma_() {
  const ef = state.editandoForma;
  if (!ef) return;
  if (ef.partes) { await guardarEdicionFormaMulti_(); return; }
  const minimo = ef.tipo === 'area' ? 3 : 2;
  if (tempDibujoVertices.length < minimo) { mostrarToast_('Faltan vértices (mínimo ' + minimo + ').'); return; }

  // Advertencia punto 2: si la forma queda fuera de la comuna
  if (!confirmarSiFueraDeComuna_(tempDibujoVertices)) return;

  const puntos = tempDibujoVertices.map(ll => [ll.lng, ll.lat]);
  const nuevosLatLngs = tempDibujoVertices.slice(); // copia antes de limpiar
  const rpc = ef.tabla === 'copamiento' ? 'actualizar_geometria_recurso' : 'actualizar_geometria_planificacion';
  const { error } = await supabaseClient.rpc(rpc, { p_id: ef.id, p_puntos: puntos });
  if (error) { mostrarToast_('Error: ' + error.message); return; }

  // Actualización INMEDIATA en el mapa: la figura original toma la nueva forma
  // sin esperar la recarga desde la BD (evita el parpadeo y la demora).
  if (ef.capaOriginal && ef.capaOriginal.setLatLngs) {
    try { ef.capaOriginal.setLatLngs(nuevosLatLngs); } catch (e) {}
    ef.capaOriginal.addTo(map);
  }
  mostrarToast_('Forma actualizada.');
  if (ef.tabla === 'planificacion' && ef.tipo === 'linea') avisarRutaEnOtrosEscenarios_(ef.id, 'Forma actualizada.');
  finalizarEdicionForma_();

  // Recarga en segundo plano para sincronizar (la figura ya se ve actualizada)
  if (ef.tabla === 'copamiento' && state.activeComunaId) {
    loadRecursos(state.activeComunaId, comunaRequestToken, null, true);
  } else if (ef.tabla === 'planificacion' && state.activeComunaId) {
    // Recargar los RECURSOS planificados (polígonos/líneas), que es lo que se editó.
    loadPlanificacionRecursos_(state.activeComunaId);
  }
}

function cancelarEdicionForma_() {
  const ef = state.editandoForma;
  if (ef && ef.capaOriginal) ef.capaOriginal.addTo(map); // restaurar capa original
  finalizarEdicionForma_();
}

function finalizarEdicionForma_() {
  reiniciarPasosDibujo_();
  tempDibujoVertices = [];
  if (tempDibujoLayer) { map.removeLayer(tempDibujoLayer); tempDibujoLayer = null; }
  tempVerticeMarkers.clearLayers();
  state.editandoForma = null;
  state.dibujoModo = null;
  document.getElementById('editar-forma-texto').textContent = TEXTO_EDITAR_FORMA_SIMPLE;
  document.getElementById('editar-forma-banner').style.display = 'none';
}

/* Tipos de recurso del catálogo CMPC en el formulario de creación.
 *
 * El selector trae tres opciones genéricas (Vehículo, Punto Stand-By,
 * Punto de Control). Para CMPC se amplía con el catálogo real de
 * tipos_recurso —Vigía Camioneta, Br. Disuasiva, Br. Tipo I, etc.— pero
 * solo para los perfiles que planifican recursos propios: Administrador
 * y Jefe de Área. El resto conserva las opciones genéricas.
 */
// 17-10-2026: «Efecto disuasivo» (rutas y áreas de influencia; cuenta en el copamiento como cualquier
// entidad planificada; válido en la BD desde el SQL 117).
const TIPO_EFECTO_DISUASIVO = 'Efecto disuasivo';
const TIPOS_GENERICOS_FORMULARIO = ['Vehículo', 'Punto Stand-By', 'Punto de Control', TIPO_EFECTO_DISUASIVO];
const TIPOS_GENERICOS_EDICION = ['Personal', 'Vehículo', 'Punto de Control', TIPO_EFECTO_DISUASIVO];

function perfilPuedeUsarCatalogoCmpc_() {
  const p = state.perfil && state.perfil.perfil;
  // El perfil real es «Jefe de Área Relacionamiento»: comparar tolerante (esJefeAreaPerfil_)
  return p === 'Administrador' || esJefeAreaPerfil_(p);
}

function esInstitucionCmpc_(inst) {
  if (!inst || !inst.nombre) return false;
  return String(inst.nombre).trim().toUpperCase().indexOf('CMPC') !== -1;
}
/** 16-10-2026: el GRD planifica solo las OTRAS instituciones. No crea, edita, mueve, corta ni elimina
 *  entidades planificadas de CMPC (en la BD lo bloquea trg_permiso_planificacion_, SQL 108). */
function grdSinCmpc_() { return !!(state.perfil && state.perfil.perfil === 'GRD'); }
function grdBloqueaInst_(inst) { return grdSinCmpc_() && esInstitucionCmpc_(inst); }
/** Oculta CMPC en un selector de institución para el GRD (y elige otra si estaba CMPC). Devuelve true si cambió. */
function quitarCmpcSelectGrd_(sel) {
  if (!sel || !grdSinCmpc_()) return false;
  let cambio = false;
  Array.prototype.forEach.call(sel.options, o => {
    const cm = esInstitucionCmpc_((state.instituciones || []).find(i => String(i.id) === String(o.value)));
    o.hidden = cm; o.disabled = cm;
  });
  const actual = sel.options[sel.selectedIndex];
  if (!actual || actual.disabled) {
    const otra = Array.prototype.find.call(sel.options, o => !o.disabled);
    if (otra) { sel.value = otra.value; cambio = true; }
  }
  return cambio;
}

/** Repuebla un selector de tipo según la institución elegida.
 *  Sirve tanto para el formulario de creación (f-institucion / f-tipo-recurso)
 *  como para el de edición de recursos ya aplicados (erp-institucion / erp-tipo). */
function actualizarCatalogoTiposFormulario_(idInst, idTipo, genericos) {
  const fInst = document.getElementById(idInst || 'f-institucion');
  const fTipo = document.getElementById(idTipo || 'f-tipo-recurso');
  if (!fInst || !fTipo) return;
  const listaGenericos = genericos || TIPOS_GENERICOS_FORMULARIO;

  const inst = (state.instituciones || []).find(i => String(i.id) === String(fInst.value));
  const usarCatalogo = esInstitucionCmpc_(inst) && perfilPuedeUsarCatalogoCmpc_();
  const seleccionPrevia = fTipo.value;

  fTipo.innerHTML = '';

  // Las genéricas se mantienen siempre disponibles.
  listaGenericos.forEach(t => {
    const opt = document.createElement('option');
    opt.value = t; opt.textContent = t;
    fTipo.appendChild(opt);
  });

  if (usarCatalogo) {
    const catalogo = (state.tiposRecursoCatalogo || []);
    if (catalogo.length > 0) {
      const grupo = document.createElement('optgroup');
      grupo.label = 'Catálogo CMPC';
      catalogo.forEach(t => {
        const opt = document.createElement('option');
        opt.value = t.nombre;
        opt.textContent = (t.emoji ? t.emoji + '  ' : '') + (t.etiqueta || aTitulo_(t.nombre));
        grupo.appendChild(opt);
      });
      fTipo.appendChild(grupo);
    } else {
      // El catálogo aún no llegó: se pide y se vuelve a poblar al tenerlo.
      cargarTiposRecurso_()
        .then(() => actualizarCatalogoTiposFormulario_(idInst, idTipo, listaGenericos))
        .catch(() => {});
    }
  }

  // Conservar la selección si sigue existiendo.
  const existe = Array.prototype.some.call(fTipo.options, o => o.value === seleccionPrevia);
  if (seleccionPrevia && existe) fTipo.value = seleccionPrevia;
}

function actualizarTipoRecursoPorInstitucion_() {
  // Primero se repuebla el selector según la institución (catálogo CMPC),
  // y después se aplica la regla de "Punto de Control" sobre el resultado.
  actualizarCatalogoTiposFormulario_();
  // "Punto de Control" solo disponible para: Carabineros, JEDENA, Fuerza Militar,
  // Municipalidad (coincidencia flexible por nombre). Para el resto se deshabilita
  // y, si estaba seleccionado, se cambia a Vehículo.
  const fInst = document.getElementById('f-institucion');
  const fTipo = document.getElementById('f-tipo-recurso');
  if (!fInst || !fTipo) return;
  const inst = state.instituciones.find(i => String(i.id) === String(fInst.value));
  const nombre = (inst && inst.nombre ? inst.nombre : '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const habilitaPuntoControl = ['carabinero', 'jedena', 'militar', 'municipalidad', 'municipal'].some(k => nombre.includes(k));
  const optPC = Array.from(fTipo.options).find(o => o.value === 'Punto de Control');
  if (optPC) {
    optPC.disabled = !habilitaPuntoControl;
    optPC.style.color = habilitaPuntoControl ? '' : '#CBD5E1';
    if (!habilitaPuntoControl && fTipo.value === 'Punto de Control') fTipo.value = 'Vehículo';
  }
  // «Efecto disuasivo»: solo para rutas (líneas) y áreas de influencia, no para puntos
  const optED = Array.from(fTipo.options).find(o => o.value === TIPO_EFECTO_DISUASIVO);
  if (optED) {
    const esPunto = !!state.pendingLatLng && !state.pendingLineaPuntos && !state.pendingAreaPuntos;
    optED.disabled = esPunto; optED.hidden = esPunto;
    optED.textContent = '🛡️ ' + TIPO_EFECTO_DISUASIVO;
    if (esPunto && fTipo.value === TIPO_EFECTO_DISUASIVO) fTipo.value = 'Vehículo';
  }
}

async function loadRecursos(comunaId, miToken, onDone, silencioso) {
  if (window.__DEBUG__) console.log('[DEBUG] loadRecursos llamado con comunaId:', comunaId, '| miToken:', miToken, '| tokenActual:', comunaRequestToken);

  // Resolver el id_comuna numérico de la comuna activa (slug -> id_comuna).
  // copamiento_recursos ya migró a id_comuna; config_periodos sigue por slug
  // (se migrará en su propia etapa). Fallback a slug si no se resuelve el número.
  const comunaObj = (state.comunas || []).find(c => c.id === comunaId);
  const idComunaNum = comunaObj ? comunaObj.id_comuna : null;

  const queryCopamiento = (idComunaNum != null)
    ? supabaseClient.from('copamiento_recursos_geojson').select('*, instituciones(nombre, color_hex, logo_url)').eq('id_comuna', idComunaNum)
    : supabaseClient.from('copamiento_recursos_geojson').select('*, instituciones(nombre, color_hex, logo_url)').eq('comuna_id', comunaId);

  const [{ data: rows, error }, { data: periodos, error: perErr }] = await Promise.all([
    queryCopamiento,
    supabaseClient.from('config_periodos').select('*').eq('comuna_id', comunaId).order('fecha_inicio', { ascending: false }),
  ]);

  if (window.__DEBUG__) console.log('[DEBUG] loadRecursos respuesta para', comunaId, '-> recursos:', (rows || []).length, ', periodos:', (periodos || []).length, periodos);

  if (miToken !== comunaRequestToken) {
    if (window.__DEBUG__) console.warn('[DEBUG] loadRecursos DESCARTADO por token desactualizado (miToken:', miToken, 'vs actual:', comunaRequestToken, ')');
    if (onDone) onDone();
    return;
  }

  if (error || perErr) {
    console.error('No se pudieron cargar los recursos/periodos:', error || perErr);
    if (!silencioso) mostrarToast_('ERROR al cargar datos: ' + ((error || perErr).message));
    if (onDone) onDone();
    return;
  }

  const autorIds = [...new Set((periodos || []).map(p => p.creado_por).filter(Boolean))];
  let nombresPorAutor = {};
  if (autorIds.length > 0) {
    const { data: autores } = await supabaseClient.from('perfiles').select('id, nombre_completo, perfil').in('id', autorIds);
    (autores || []).forEach(a => { nombresPorAutor[a.id] = a.nombre_completo + (a.perfil ? ' (' + a.perfil + ')' : ''); });
  }
  if (miToken !== comunaRequestToken) { if (onDone) onDone(); return; } // por si cambiaron de comuna durante la consulta de autores

  // Periodo con «💾 selección guardada» (SQL 96): en TODO el sistema (mapa, panel, indicadores, PDF)
  // quedan solo los recursos que «Van» (SQL 84); los no activados se guardan aparte para reactivarlos.
  let filas = rows || [];
  state.recursosNoActivos = [];
  const conSeleccion = new Set((periodos || []).filter(p => p.seleccion_guardada).map(p => String(p.id)));
  if (conSeleccion.size) {
    const idsSel = filas.filter(r => conSeleccion.has(String(r.id_periodo))).map(r => String(r.id));
    if (idsSel.length) {
      const { data: est, error: errEst } = await supabaseClient.rpc('estado_recursos_emergencia', { p_ids: idsSel });
      if (miToken !== comunaRequestToken) { if (onDone) onDone(); return; }
      if (!errEst) {
        const va = {};
        (est || []).forEach(x => { va[x.id] = !!x.va; state.vaEmergencia[x.id] = { va: !!x.va, por: x.por_nombre, en: x.en }; });
        const noActivo = r => conSeleccion.has(String(r.id_periodo)) && !va[String(r.id)];
        state.recursosNoActivos = filas.filter(noActivo);
        filas = filas.filter(r => !noActivo(r));
      }
    }
  }
  state.recursos = filas;
  // Trazabilidad (quién creó / modificó) para mostrar en el popup
  state.trazaRecursos = {};
  if (state.recursos.length) {
    try {
      const ids = state.recursos.map(r => r.id);
      const { data: tz } = await supabaseClient.from('v_trazabilidad_copamiento').select('*').in('id', ids);
      (tz || []).forEach(t => { state.trazaRecursos[t.id] = t; });
    } catch (e) { /* si la vista no existe aún, se omite la trazabilidad */ }
  }
  state.periodos = (periodos || []).map(p => ({ ...p, creador_nombre: p.creado_por ? (nombresPorAutor[p.creado_por] || 'Usuario eliminado') : '—' }));
  state.periodos.forEach(p => {
    const esGRD = perfilArranqueMinimo_(); // GRD y Jefe de Área: misma lógica
    if (p.estado_periodo === 'activo') {
      // TODOS los perfiles: el periodo arranca APAGADO en la primera carga.
      // Después conserva lo que el usuario elija (no se re-fuerza).
      if (state.periodoLayersOn[p.id] === undefined) state.periodoLayersOn[p.id] = false;
    } else if (state.periodoLayersOn[p.id] === undefined) {
      state.periodoLayersOn[p.id] = false;
    }
  });
  if (state.periodoLayersOn.sin_periodo === undefined) state.periodoLayersOn.sin_periodo = false;

  if (!silencioso) mostrarToast_('Recarga completada: ' + state.recursos.length + ' recurso(s), ' + state.periodos.length + ' periodo(s).');
  renderRecursosEnMapa();
  if (document.querySelector('.rail-btn.active').dataset.tab === 'copamiento') renderTab('copamiento');
  if (onDone) onDone();
}

function mostrarToast_(mensaje) {
  const el = document.getElementById('debug-toast');
  el.textContent = mensaje;
  el.classList.add('show');
  clearTimeout(window.__toastTimer);
  window.__toastTimer = setTimeout(() => el.classList.remove('show'), 5000);
}

function flameDivIcon_(color) {
  return L.divIcon({
    // 06-10-2026: llama más pequeña (antes 22×28 px) para no tapar el mapa con muchos focos
    className: '', iconSize: [15, 19], iconAnchor: [7.5, 18], popupAnchor: [0, -16],
    html: '<div class="flama-wrap" style="--fire-c:' + color + ';">' +
      '<div class="flama-pulso"></div>' +
      '<svg class="flame-marker flama-svg" width="15" height="19" viewBox="0 0 24 30"><path fill="' + color + '" stroke="white" stroke-width="1.3" d="M12 1C9 6 5 9 5 15a7 7 0 0 0 14 0c0-2.5-1.2-4.3-2.3-5.7.2 2-1 3.2-2.2 3.2-1.8 0-2.5-1.7-1.8-3.3C13.8 6.6 14.5 3.8 12 1Z"/><ellipse cx="12" cy="24" rx="3.2" ry="2" fill="' + color + '" opacity="0.35"/></svg>' +
      '</div>'
  });
}

function pinDivIcon(color, conGlow, logoUrl) {
  // Pin tipo GLOBO (gota), igual al de las capas de alerta: la punta inferior
  // marca la coordenada exacta y el logo de la institución va al centro.
  const estiloGlow = conGlow ? '--glow-c:' + color + ';' : '';
  const claseGlow = conGlow ? ' recurso-activo-glow' : '';
  const trazado = 'M13 33 C13 33 2.5 20.5 2.5 12.5 A10.5 10.5 0 1 1 23.5 12.5 C23.5 20.5 13 33 13 33 Z';

  if (logoUrl) {
    return L.divIcon({
      className: '', iconSize: [26, 34], iconAnchor: [13, 33], popupAnchor: [0, -30],
      html: '<div class="custom-pin' + claseGlow + '" style="' + estiloGlow + 'position:relative;width:26px;height:34px;filter:drop-shadow(0 1px 3px rgba(0,0,0,0.45));">' +
        '<svg width="26" height="34" viewBox="0 0 26 34" style="position:absolute;inset:0;z-index:1;">' +
          '<path d="' + trazado + '" fill="#fff" stroke="' + color + '" stroke-width="2.2"/>' +
        '</svg>' +
        '<div style="position:absolute;top:5.5px;left:6px;width:14px;height:14px;background:#F1F5F9;border-radius:50%;display:flex;align-items:center;justify-content:center;overflow:hidden;z-index:2;">' +
        '<img src="' + escapeHtml_(logoUrl) + '" alt="" style="width:13px;height:13px;object-fit:contain;transform:scale(' + ZOOM_LOGO_MARCADOR + ');" onerror="this.parentElement.innerHTML=\'<div style=&quot;width:10px;height:10px;border-radius:50%;background:' + color + '&quot;></div>\'"></div>' +
        '</div>',
    });
  }

  return L.divIcon({
    className: '', iconSize: [26, 34], iconAnchor: [13, 33], popupAnchor: [0, -30],
    html: '<svg style="' + estiloGlow + 'filter:drop-shadow(0 1px 3px rgba(0,0,0,0.4));" class="custom-pin' + claseGlow + '" width="26" height="34" viewBox="0 0 26 34">' +
      '<path d="' + trazado + '" fill="' + color + '" stroke="#fff" stroke-width="2"/>' +
      '<circle cx="13" cy="12.5" r="4.5" fill="#fff"/>' +
      '</svg>',
  });
}

function centroideLatLngs_(latlngs) {
  const flat = [];
  (function walk(arr) {
    if (Array.isArray(arr[0])) arr.forEach(walk); else flat.push(arr);
  })(latlngs);
  const suma = flat.reduce((acc, p) => [acc[0] + p[0], acc[1] + p[1]], [0, 0]);
  return [suma[0] / flat.length, suma[1] / flat.length];
}

function renderRecursosEnMapa() {
  Object.values(periodoLayers).forEach(layer => { map.removeLayer(layer); layer.clearLayers(); });
  Object.keys(recursosMarkersById).forEach(id => delete recursosMarkersById[id]);

  // Registro de figuras por institución (para el toggle por institución del periodo)
  window.figurasPorInstitucion = {};        // institucion_id -> [capas]
  state.institucionesPeriodoActivo = {};     // institucion_id -> {nombre, color}
  if (state.institucionesOcultas === undefined) state.institucionesOcultas = {};
  const periodoActAhora = periodoActivoActual_();

  const puedeEditar = ['GRD','Administrador','Jefe de Área Relacionamiento'].includes(state.perfil.perfil);

  state.recursos.forEach(r => {
    const claveGrupo = r.id_periodo || 'sin_periodo';
    if (!periodoLayers[claveGrupo]) periodoLayers[claveGrupo] = L.layerGroup();

    const inst = r.instituciones || { nombre: 'Institución', color_hex: '#64748B' };
    const esActivo = !!periodoActAhora && r.id_periodo === periodoActAhora.id;
    // Registrar institución del periodo activo (para leyenda + toggle)
    if (esActivo && r.institucion_id) {
      state.institucionesPeriodoActivo[r.institucion_id] = { nombre: inst.nombre, color: inst.color_hex, logo: logoEfectivoInstitucion_(inst) };
    }
    const registrarFigura = (capa) => {
      if (!esActivo || !r.institucion_id) return;
      (window.figurasPorInstitucion[r.institucion_id] = window.figurasPorInstitucion[r.institucion_id] || []).push(capa);
    };

    if (r.tipo_geometria === 'linea' || r.tipo_geometria === 'area') {
      let geojson;
      try { geojson = JSON.parse(r.geom_geojson); } catch (e) { console.error('Geometría inválida:', r); return; }
      const latlngs = (geojson.coordinates || []).map(c =>
        r.tipo_geometria === 'area' ? c.map(p => [p[1], p[0]]) : [c[1], c[0]]
      );
      const centro = centroideLatLngs_(latlngs);
      const popupHtml = construirPopupRecurso_(r, inst, centro[0], centro[1]);

      const claseGlow = esActivo ? 'recurso-activo-glow' : '';
      const claseEditable = (puedeEditar && !periodoCerrado_(r.id_periodo)) ? ' recurso-editable' : '';
      const figura = r.tipo_geometria === 'area'
        ? L.polygon(latlngs, { color: inst.color_hex, weight: 3, fillColor: inst.color_hex, fillOpacity: 0.22, className: claseGlow + claseEditable })
        : L.polyline(latlngs, { color: inst.color_hex, weight: 5, opacity: 0.85, className: claseGlow + claseEditable });
      if (esActivo) figura.on('add', () => { const el = figura.getElement && figura.getElement(); if (el) el.style.setProperty('--glow-c', inst.color_hex); });
      figura._etiquetaNombre = inst.nombre;
      if (!periodoFeatureLayers[claveGrupo]) periodoFeatureLayers[claveGrupo] = [];
      periodoFeatureLayers[claveGrupo].push({ layer: figura, nombre: inst.nombre });
      if (state.mostrarEtiquetasPeriodo && state.mostrarEtiquetasPeriodo[claveGrupo]) {
        figura.bindTooltip(inst.nombre, { permanent: true, interactive: true, direction: 'center', className: 'map-label label-recurso' });
      }
      habilitarHoverEtiqueta_(figura, { institucion: inst.nombre, tipo: r.tipo_recurso, descripcion: r.descripcion }, { direction: 'center', offset: [0, 0] });
      activarNeonHover_(figura, inst.color_hex);
      figura.bindPopup(popupHtml);
      figura.on('popupopen', () => {
        if (!state.editorMode) { figura.closePopup(); mostrarToast_('✏️ Activa el modo edición para modificar.'); return; }
        bindPopupActions_();
      });
      // Resaltado al pasar el mouse (color institucional)
      // (_sinNeon: en Modo Emergencia los recursos no activados no se resaltan ni recuperan su relleno al salir)
      figura.on('mouseover', () => { if (figura._sinNeon) return; const el = figura.getElement && figura.getElement(); if (el) { el.style.setProperty('--glow-c', inst.color_hex); el.classList.add('periodo-hover-resalte'); figura.setStyle({ weight: (r.tipo_geometria === 'area' ? 5 : 7), fillOpacity: 0.38 }); } });
      figura.on('mouseout',  () => { if (figura._sinNeon) return; const el = figura.getElement && figura.getElement(); if (el) { el.classList.remove('periodo-hover-resalte'); figura.setStyle({ weight: (r.tipo_geometria === 'area' ? 3 : 5), fillOpacity: 0.22 }); } });
      periodoLayers[claveGrupo].addLayer(figura);
      recursosMarkersById[r.id] = figura;
      registrarFigura(figura);
      return;
    }

    const lat = Number(r.lat), lng = Number(r.lng);
    if (isNaN(lat) || isNaN(lng)) { console.error('Recurso con coordenadas inválidas:', r); return; }
    const popupHtml = construirPopupRecurso_(r, inst, lat, lng);

    const puedeArrastrar = puedeEditar && !periodoCerrado_(r.id_periodo);
    // draggable solo si YA estamos en modo edición (Leaflet crea m.dragging al añadir al mapa)
    const m = L.marker([lat, lng], { icon: pinDivIcon(inst.color_hex, esActivo, logoEfectivoInstitucion_(inst)), draggable: puedeArrastrar && !!state.editorMode });
    m._puedeArrastrar = puedeArrastrar;
    m.bindPopup(popupHtml);
    m._etiquetaNombre = inst.nombre;
    if (!periodoFeatureLayers[claveGrupo]) periodoFeatureLayers[claveGrupo] = [];
    periodoFeatureLayers[claveGrupo].push({ layer: m, nombre: inst.nombre });
    if (state.mostrarEtiquetasPeriodo && state.mostrarEtiquetasPeriodo[claveGrupo]) {
      m.bindTooltip(inst.nombre, { permanent: true, interactive: true, direction: 'top', offset: [0, -38], className: 'map-label label-recurso' });
    }
    habilitarHoverEtiqueta_(m, { institucion: inst.nombre, tipo: r.tipo_recurso, descripcion: r.descripcion }, { direction: 'top', offset: [0, -40] });
    activarNeonHover_(m, inst.color_hex);
    m.on('popupopen', () => {
      if (!state.editorMode) {
        m.closePopup();
        mostrarToast_('✏️ Activa el modo edición para modificar.');
        return;
      }
      bindPopupActions_();
    });
    if (puedeArrastrar) {
      m.on('dragend', () => {
        if (!state.editorMode) {
          mostrarToast_('✏️ Activa el modo edición para mover recursos.');
          loadRecursos(state.activeComunaId, ++comunaRequestToken);
          return;
        }
        reubicarRecurso_(r.id, m);
      });
    }
    periodoLayers[claveGrupo].addLayer(m);
    recursosMarkersById[r.id] = m;
    registrarFigura(m);
  });

  Object.keys(periodoLayers).forEach(clave => {
    if (state.periodoLayersOn[clave]) {
      periodoLayers[clave].addTo(map);
      // Aplicar clase CSS para controlar visibilidad de etiquetas
      const _el = periodoLayers[clave].getPane ? null : null;
      aplicarClaseEtiqPeriodo_(clave, state.mostrarEtiquetasPeriodo && state.mostrarEtiquetasPeriodo[clave]);
    }
  });

  // Aplicar ocultación por institución (punto 3)
  aplicarVisibilidadInstituciones_();
  renderSimbologiaFlotante_();
  // En modo edición, las figuras del periodo activo van al frente
  if (state.editorMode && !state.modoPlanificacion) priorizarCapasEditables_('copamiento');
  // El límite comunal es referencia: siempre al fondo, bajo cualquier otra capa
  enviarLimiteAlFondo_();
}

// Envía el límite comunal al fondo (bajo recursos, rutas, áreas, etc.).
// Es una capa de referencia y nunca debe tapar figuras de trabajo.
function enviarLimiteAlFondo_() {
  try {
    if (!map.hasLayer(limiteLayer)) return;
    limiteLayer.eachLayer(c => { if (c.bringToBack) c.bringToBack(); });
  } catch (e) { /* no crítico */ }
}

// Renderiza el panel flotante de simbología con las instituciones del periodo activo.
function renderSimbologiaFlotante_() {
  const cont = document.getElementById('sf-body');
  const panel = document.getElementById('simbologia-flotante');
  if (!cont || !panel) return;
  // Simbología de los periodos críticos: solo en el mapa del Modo Emergencia, donde
  // la reemplaza el panel de validación de recursos por institución (11-10-2026).
  if (state.modoMapa !== 'emergencia') return;
  panel.style.display = 'none';
  renderPanelEmergencia_();
  return;
  const insts = state.institucionesPeriodoActivo || {};
  const ids = Object.keys(insts);
  if (ids.length === 0) {
    panel.style.display = 'none';
    if (typeof renderResumenAlertas_ === 'function') renderResumenAlertas_();
    return;
  }
  cont.innerHTML = '';
  ids.sort((a, b) => compararInstitucionesCapa_(insts[a], insts[b])).forEach(instId => {
    const it = insts[instId];
    const oculta = !!state.institucionesOcultas[instId];
    const row = document.createElement('div'); row.className = 'sf-row';
    const iconoInst = it.logo
      ? '<img src="' + escapeHtml_(it.logo) + '" alt="" class="sf-logo" style="border-color:' + it.color + '" onerror="this.outerHTML=\'<span class=&quot;sf-dot&quot; style=&quot;background:' + it.color + '&quot;></span>\'">'
      : '<span class="sf-dot" style="background:' + it.color + '"></span>';
    row.innerHTML =
      '<div class="sf-row-left">' + iconoInst +
      '<span class="sf-name">' + escapeHtml_(it.nombre) + '</span></div>' +
      '<div class="toggle ' + (oculta ? '' : 'on') + '" data-inst-toggle="' + instId + '"></div>';
    const tg = row.querySelector('[data-inst-toggle]');
    tg.addEventListener('click', () => {
      state.institucionesOcultas[instId] = !state.institucionesOcultas[instId];
      tg.classList.toggle('on', !state.institucionesOcultas[instId]);
      aplicarVisibilidadInstituciones_();
    });
    cont.appendChild(row);
  });
  // Mostrar el panel (el colapsar solo esconde el cuerpo, deja la barra)
  panel.style.display = 'flex';
}

