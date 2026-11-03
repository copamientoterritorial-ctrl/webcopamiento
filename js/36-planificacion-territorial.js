/* ==================== 🗺️ PLANIFICACIÓN TERRITORIAL COMUNA (Gestión SIG ▾, 03-11-2026, SQL 151) ====================
 * Mismo mapa y mismas herramientas que el Planificador de Alertas (punto / línea / área, ✍️ trazo libre, 🧲 imán a la red vial,
 * regla, ↶ deshacer, 📐 editar forma, mover puntos), pero SIN escenarios, alertas, amebas ni incendios SIDCO.
 * Es un modo del mapa: state.modoMapa === 'territorial' (aplicarModoMapa_ / aplicarAmbienteMapa_ en js/13).
 *   · Entidades (terr_elementos): cada punto / línea / área se identifica con una entidad del catálogo terr_tipos_entidad
 *     (Junta de Vecinos, Fuente de agua, Escuela, Puente de madera, Bomberos…), administrable con 🏷️ Entidades.
 *   · Incendios registrados (terr_incendios): capa SEPARADA (interfaz / rural, fecha, ubicación, familias afectadas,
 *     viviendas de emergencia asignadas…).
 *   · 📥 Importar / 📤 Exportar puntos, líneas y áreas (GeoJSON y KML / KMZ) y 📊 Tablero con los totales.
 * Ganchos en otros módulos: finalizarDibujo_ y el clic del mapa (js/22) → terrAbrirFormulario_; abrirImportacionKml_ (js/22) →
 * terrAbrirImportar_; edición de forma (js/20, tabla 'territorial') → terrGuardarForma_; onGeoData (js/19) → terrAlCambiarComuna_;
 * Capas (js/32) → terrSeccionCapas_; salir del dibujo (js/21, js/33) → terrSalirDibujo_. */
state.terr = { tipos: [], elementos: [], incendios: [], comuna: null, cargando: false, catOcultas: new Set(), elemOn: true, incOn: true,
  sinSql: false, enModo: false, guardadas: null, listeners: false };
state.modoTerritorial = null;   // { capa: 'elementos' | 'incendios', comunaId } mientras se dibuja
const terrCapaElem = L.featureGroup();
const terrCapaInc = L.featureGroup();
const terrById = {};   // id → capa Leaflet (para editar forma / mover)
const TERR_COLOR = { elementos: '#0F766E', incendios: '#DC2626' };
const TERR_INC_COLOR = { Interfaz: '#DC2626', Rural: '#EA580C' };
const TERR_GEOM_TXT = { punto: 'Punto', linea: 'Línea', area: 'Área' };

/* ── Permisos ── */
function puedeTerritorial_() {
  if (!state.perfil || (typeof esAsociacion_ === 'function' && esAsociacion_())) return false;
  return puedeVerModulo_('mapa') || puedeVerModulo_('planificador_mapa');
}
/** Edita (crea, mueve, elimina): Administrador, Jefe de Área (Subgerente, GRT) y GRD — en la BD, según la comuna (SQL 151). */
function terrPuedeEditarPerfil_() {
  const p = state.perfil && state.perfil.perfil;
  return !!p && (p === 'Administrador' || esJefeAreaPerfil_(p) || p === 'GRD') && puedeEditarModulo_('planificador_mapa');
}
function terrPuedeCatalogo_() { const p = state.perfil && state.perfil.perfil; return !!p && (p === 'Administrador' || esJefeAreaPerfil_(p)); }
function terrNombreComuna_(id) { const c = (state.comunas || []).find(x => x.id === id); return c ? c.comuna : (id || '—'); }

/* ── Entrada / salida del modo del mapa (las llama aplicarAmbienteMapa_, js/13) ── */
function terrAlEntrarModo_() {
  if (!state.terr.enModo) {
    state.terr.enModo = true;
    // Fuera: incendios SIDCO, amebas e influencia (se restauran al salir)
    const otras = [incendiosContainerLayer, influenciaVerdeLayer, influenciaAmarillaLayer, influenciaRojaLayer].concat(Object.values(amebaLayers));
    state.terr.guardadas = otras.filter(l => map.hasLayer(l));
    state.terr.guardadas.forEach(l => map.removeLayer(l));
  }
  terrIniciarListeners_();
  terrAplicarVisibilidad_();
  if (state.activeComunaId && state.terr.comuna !== state.activeComunaId) terrCargar_();
  else if (!state.terr.tipos.length) terrCargarTipos_();
}
function terrAlSalirModo_() {
  if (!state.terr.enModo) return;
  state.terr.enModo = false;
  if (state.modoTerritorial) terrSalirDibujo_();
  [terrCapaElem, terrCapaInc].forEach(l => { if (map.hasLayer(l)) map.removeLayer(l); });
  (state.terr.guardadas || []).forEach(l => { if (!map.hasLayer(l)) l.addTo(map); });
  state.terr.guardadas = null;
  document.getElementById('terr-menu').classList.remove('show');
}
function terrAlCambiarComuna_() {
  if (map.hasLayer(incendiosContainerLayer)) map.removeLayer(incendiosContainerLayer);   // SIDCO no va en este mapa
  if (state.modoTerritorial) terrSalirDibujo_();
  terrCargar_();
}

/* ── Datos ── */
async function terrCargarTipos_() {
  const { data, error } = await supabaseClient.from('terr_tipos_entidad').select('*').order('orden').order('nombre');
  if (error) { state.terr.sinSql = true; console.warn('Planificación Territorial: falta el SQL 151?', error.message); return; }
  state.terr.sinSql = false;
  state.terr.tipos = data || [];
}
async function terrLeerTodo_(tabla, comuna) {
  const out = [];
  for (let d = 0; ; d += 1000) {
    const { data, error } = await supabaseClient.from(tabla).select('*').eq('comuna_id', comuna).range(d, d + 999);
    if (error) throw error;
    out.push(...(data || [])); if (!data || data.length < 1000) break;
  }
  return out;
}
async function terrCargar_() {
  const comuna = state.activeComunaId;
  if (!comuna || state.terr.cargando) return;
  state.terr.cargando = true;
  try {
    await terrCargarTipos_();
    if (state.terr.sinSql) { mostrarToast_('⚠️ Falta ejecutar en Supabase el SQL 151 (Planificación Territorial).'); return; }
    const [el, inc] = await Promise.all([terrLeerTodo_('v_terr_elementos', comuna), terrLeerTodo_('v_terr_incendios', comuna)]);
    const conGeo = r => Object.assign(r, { geojson: dgGeom_(r.geojson), geom_geojson: JSON.stringify(dgGeom_(r.geojson)) });
    state.terr.elementos = el.map(conGeo);
    state.terr.incendios = inc.map(conGeo).sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));
    state.terr.comuna = comuna;
    terrDibujar_();
  } catch (e) {
    mostrarToast_('No se pudo cargar la Planificación Territorial: ' + (e.message || e));
  } finally {
    state.terr.cargando = false;
    terrActualizarMenu_();
    if (state.vistaActual === 'mapa' && state.panelMapaAbierto && state.panelMapaTab === 'capas') renderTab('capas');
  }
}
function terrBuscar_(id) { return state.terr.elementos.find(x => x.id === id) || state.terr.incendios.find(x => x.id === id) || null; }
function terrCapaDe_(id) { return terrById[id] || null; }
function terrTipo_(id) { return state.terr.tipos.find(t => t.id === id) || null; }

/* ── Dibujo en el mapa ── */
function terrIcono_(emoji, color, borde) {
  return L.divIcon({ className: 'terr-pin', iconSize: [28, 28], iconAnchor: [14, 14],
    html: '<div style="background:' + color + ';border-color:' + (borde || '#fff') + '">' + escapeHtml_(emoji || '📍') + '</div>' });
}
function terrDibujar_() {
  terrCapaElem.clearLayers(); terrCapaInc.clearLayers();
  Object.keys(terrById).forEach(k => delete terrById[k]);
  const editable = terrPuedeEditarPerfil_();
  state.terr.elementos.forEach(e => {
    if (!e.geojson) return;
    const color = e.color || TERR_COLOR.elementos;
    let ly;
    if (e.tipo_geometria === 'punto' && e.geojson.type === 'Point') {
      ly = L.marker([e.geojson.coordinates[1], e.geojson.coordinates[0]], { icon: terrIcono_(e.icono, color), draggable: true });
      ly.dragging.disable();
      ly._terrMovible = editable;
      ly.on('dragend', ev => terrMoverPunto_(e.id, ev.target.getLatLng()));
    } else {
      ly = L.geoJSON(e.geojson, { style: { color, weight: e.tipo_geometria === 'linea' ? 4 : 2.5, fillOpacity: 0.2 },
        pointToLayer: (f, ll) => L.marker(ll, { icon: terrIcono_(e.icono, color) }) });
      if (ly.getLayers().length === 1) ly = ly.getLayers()[0];
    }
    ly._terr = { id: e.id, capa: 'elementos', categoria: e.categoria };
    ly.bindTooltip(escapeHtml_((e.icono || '') + ' ' + (e.nombre || e.tipo_nombre)), { sticky: true });
    ly.bindPopup(() => terrPopup_(e, 'elementos'), { maxWidth: 320 });
    terrById[e.id] = ly;
    terrCapaElem.addLayer(ly);
  });
  state.terr.incendios.forEach(i => {
    if (!i.geojson) return;
    const color = TERR_INC_COLOR[i.tipo] || '#DC2626';
    let ly;
    if (i.geojson.type === 'Point') {
      ly = L.marker([i.geojson.coordinates[1], i.geojson.coordinates[0]], { icon: terrIcono_('🔥', '#fff', color), draggable: true });
      ly.dragging.disable();
      ly._terrMovible = editable;
      ly.on('dragend', ev => terrMoverPunto_(i.id, ev.target.getLatLng()));
    } else {
      ly = L.geoJSON(i.geojson, { style: { color, weight: 2.5, fillOpacity: 0.3, dashArray: '6,4' } });
      if (ly.getLayers().length === 1) ly = ly.getLayers()[0];
    }
    ly._terr = { id: i.id, capa: 'incendios' };
    ly.bindTooltip(escapeHtml_('🔥 ' + i.tipo + ' · ' + terrFecha_(i.fecha) + (i.nombre ? ' · ' + i.nombre : '')), { sticky: true });
    ly.bindPopup(() => terrPopup_(i, 'incendios'), { maxWidth: 320 });
    terrById[i.id] = ly;
    terrCapaInc.addLayer(ly);
  });
  terrAplicarVisibilidad_();
  terrPuntosArrastrables_(!!state.modoTerritorial);
}
function terrAplicarVisibilidad_() {
  if (!state.terr.enModo) return;
  if (state.terr.elemOn) { if (!map.hasLayer(terrCapaElem)) terrCapaElem.addTo(map); } else if (map.hasLayer(terrCapaElem)) map.removeLayer(terrCapaElem);
  if (state.terr.incOn) { if (!map.hasLayer(terrCapaInc)) terrCapaInc.addTo(map); } else if (map.hasLayer(terrCapaInc)) map.removeLayer(terrCapaInc);
  // Categorías ocultas: se sacan del grupo y se vuelven a poner al mostrarlas
  state.terr.elementos.forEach(e => {
    const ly = terrById[e.id]; if (!ly) return;
    const ver = !state.terr.catOcultas.has(e.categoria);
    if (ver && !terrCapaElem.hasLayer(ly)) terrCapaElem.addLayer(ly);
    if (!ver && terrCapaElem.hasLayer(ly)) terrCapaElem.removeLayer(ly);
  });
}
function terrPuntosArrastrables_(on) {
  Object.values(terrById).forEach(ly => { if (ly.dragging && ly._terrMovible) { if (on) ly.dragging.enable(); else ly.dragging.disable(); } });
}
function terrFecha_(f) { if (!f) return '—'; const [y, m, d] = String(f).slice(0, 10).split('-'); return d + '-' + m + '-' + y; }
function terrPopup_(r, capa) {
  const fila = (t, v) => v == null || v === '' ? '' : '<tr><td>' + t + '</td><td>' + v + '</td></tr>';
  const edit = terrPuedeEditarPerfil_();
  const btns = edit ? '<div class="terr-pop-btns">' +
      '<button class="popup-btn" onclick="terrEditarDatos_(\'' + r.id + '\')">✏️ Datos</button>' +
      (r.tipo_geometria !== 'punto' && r.geojson && /^(LineString|Polygon)$/.test(r.geojson.type) ? '<button class="popup-btn" onclick="terrEditarForma_(\'' + r.id + '\')">📐 Forma</button>' : '') +
      '<button class="popup-btn" style="color:#B91C1C;" onclick="terrEliminar_(\'' + r.id + '\')">🗑️</button></div>' : '';
  if (capa === 'incendios') {
    return '<div class="terr-pop"><b>🔥 Incendio ' + escapeHtml_(r.tipo === 'Interfaz' ? 'de interfaz' : 'rural') + '</b><table>' +
      fila('Nombre / sector', escapeHtml_(r.nombre || '')) + fila('Fecha', terrFecha_(r.fecha) + (r.hora ? ' ' + String(r.hora).slice(0, 5) : '')) +
      fila('Superficie', r.superficie_ha != null ? Number(r.superficie_ha).toLocaleString('es-CL') + ' ha' : '') +
      fila('Familias afectadas', r.familias_afectadas) + fila('Personas afectadas', r.personas_afectadas) + fila('Viviendas afectadas', r.viviendas_afectadas) +
      fila('Viviendas de emergencia', r.viviendas_emergencia) + fila('Observación', escapeHtml_(r.observacion || '')) +
      fila('Ubicación', r.lat != null ? Number(r.lat).toFixed(5) + ', ' + Number(r.lng).toFixed(5) : '') + '</table>' + btns + '</div>';
  }
  return '<div class="terr-pop"><b>' + escapeHtml_((r.icono || '📍') + ' ' + (r.nombre || r.tipo_nombre)) + '</b>' +
    '<span class="terr-pop-tipo" style="background:' + (r.color || '#0F766E') + '1F;color:' + (r.color || '#0F766E') + '">' + escapeHtml_(r.tipo_nombre) + ' · ' + escapeHtml_(r.categoria) + '</span><table>' +
    fila('Geometría', TERR_GEOM_TXT[r.tipo_geometria] + (r.km != null ? ' · ' + Number(r.km).toLocaleString('es-CL') + ' km' : '') + (r.ha != null ? ' · ' + Number(r.ha).toLocaleString('es-CL') + ' ha' : '')) +
    fila('Descripción', escapeHtml_(r.descripcion || '')) + fila('Contacto', escapeHtml_(r.contacto || '')) +
    fila('Teléfono', r.telefono ? '<a href="tel:' + escapeHtml_(String(r.telefono).replace(/[^\d+]/g, '')) + '">' + escapeHtml_(r.telefono) + '</a>' : '') +
    Object.keys(r.atributos || {}).slice(0, 12).map(k => fila(escapeHtml_(k), escapeHtml_(String(r.atributos[k])))).join('') + '</table>' + btns + '</div>';
}

/* ── Menú 🗺️ del mapa (dropdown) ── */
function terrIniciarListeners_() {
  if (state.terr.listeners) return;
  state.terr.listeners = true;
  const menu = document.getElementById('terr-menu');
  document.getElementById('btn-territorial').addEventListener('click', ev => { ev.stopPropagation(); terrActualizarMenu_(); menu.classList.toggle('show'); });
  document.addEventListener('click', ev => { if (!ev.target.closest('#wrap-territorial')) menu.classList.remove('show'); });
  menu.addEventListener('click', ev => {
    const b = ev.target.closest('[data-terr]'); if (!b) return;
    menu.classList.remove('show');
    const a = b.dataset.terr;
    if (a === 'elementos' || a === 'incendios') terrIniciarDibujo_(a);
    else if (a === 'catalogo') terrAbrirCatalogo_();
    else if (a === 'importar') terrAbrirImportar_();
    else if (a === 'exportar') terrAbrirExportar_();
    else if (a === 'tablero') terrAbrirTablero_();
  });
}
function terrActualizarMenu_() {
  const edit = terrPuedeEditarPerfil_();
  const ver = (id, v) => { const el = document.querySelector('#terr-menu [data-terr="' + id + '"]'); if (el) el.style.display = v ? 'flex' : 'none'; };
  ver('elementos', edit); ver('incendios', edit); ver('importar', edit);
  const n = document.getElementById('terr-menu-n');
  if (n) n.textContent = state.activeComunaId ? terrNombreComuna_(state.activeComunaId) + ' · ' + state.terr.elementos.length + ' elementos · ' + state.terr.incendios.length + ' incendios'
    : 'Elige una comuna para comenzar';
}

/* ── Modo dibujo (mismas herramientas del Planificador de Alertas) ── */
function terrIniciarDibujo_(capa) {
  if (!state.activeComunaId) { mostrarToast_('Elige primero una comuna.'); return; }
  if (!terrPuedeEditarPerfil_()) { mostrarToast_('Tu perfil solo puede consultar la Planificación Territorial.'); return; }
  if (state.terr.sinSql) { mostrarToast_('⚠️ Falta ejecutar en Supabase el SQL 151.'); return; }
  if (state.modoTerritorial) terrSalirDibujo_();
  state.modoTerritorial = { capa, comunaId: state.activeComunaId };
  state.editorMode = true;
  state.dibujoModo = 'punto';
  const color = TERR_COLOR[capa];
  const banner = document.getElementById('editor-banner');
  banner.classList.add('show'); banner.style.background = color;
  document.getElementById('map').classList.add('editing-mode');
  document.getElementById('btn-salir-planificacion').style.display = 'inline-block';
  document.getElementById('btn-salir-edicion').style.display = 'none';
  const ind = document.getElementById('indicador-edicion');
  if (ind) { ind.style.background = color; ind.style.color = '#fff'; ind.innerHTML = '<span class="edit-pulse" style="background:#fff"></span>' + (capa === 'incendios' ? '🔥 Registrando incendios · Salir' : '🗺️ Registrando entidades · Salir'); ind.classList.add('show'); }
  actualizarBotonesModoDibujo_();
  document.getElementById('editor-banner-texto').textContent = (capa === 'incendios' ? '🔥 Incendios' : '🗺️ Entidades') + ' · ' + terrNombreComuna_(state.activeComunaId) +
    ' — elige Punto, Línea o Área y dibuja en el mapa; los puntos se pueden arrastrar';
  terrPuntosArrastrables_(true);
  if (capa === 'incendios') state.terr.incOn = true; else state.terr.elemOn = true;
  terrAplicarVisibilidad_();
  try { desactivarInteractivaLimite_(true); } catch (e) {}
  mostrarToast_(capa === 'incendios' ? '🔥 Registra el incendio: un punto (ubicación) o un área (zona afectada).' : '🗺️ Dibuja el punto, línea o área y elige su entidad.');
}
function terrSalirDibujo_() {
  if (!state.modoTerritorial) return;
  state.modoTerritorial = null;
  state.editorMode = false;
  if (state.editandoForma && state.editandoForma.tabla === 'territorial') cancelarEdicionForma_();
  cancelarDibujo_();
  const banner = document.getElementById('editor-banner');
  banner.classList.remove('show'); banner.style.background = '';
  document.getElementById('map').classList.remove('editing-mode');
  document.getElementById('btn-salir-planificacion').style.display = 'none';
  document.getElementById('btn-salir-edicion').style.display = '';
  const ind = document.getElementById('indicador-edicion');
  if (ind) { ind.classList.remove('show'); ind.style.background = ''; ind.style.color = ''; ind.innerHTML = '<span class="edit-pulse"></span>✏️ Editando · Salir'; }
  terrPuntosArrastrables_(false);
  try { desactivarInteractivaLimite_(false); } catch (e) {}
}

/* ── Geometría pendiente (la deja el dibujo en state.pending*) → GeoJSON ── */
function terrGeomPendiente_() {
  if (state.pendingLatLng) return { tipo: 'punto', geojson: { type: 'Point', coordinates: [state.pendingLatLng.lng, state.pendingLatLng.lat] } };
  if (state.pendingLineaPuntos) return { tipo: 'linea', geojson: { type: 'LineString', coordinates: state.pendingLineaPuntos.map(p => [p.lng, p.lat]) } };
  if (state.pendingAreaPuntos) {
    const c = state.pendingAreaPuntos.map(p => [p.lng, p.lat]); c.push(c[0]);
    return { tipo: 'area', geojson: { type: 'Polygon', coordinates: [c] } };
  }
  return null;
}
/** Hectáreas aproximadas de un polígono (fórmula esférica, igual que la regla). */
function terrHa_(coords) {
  const R = 6378137, rad = Math.PI / 180;
  let s = 0;
  for (let i = 0; i < coords.length - 1; i++) {
    const [x1, y1] = coords[i], [x2, y2] = coords[i + 1];
    s += (x2 - x1) * rad * (2 + Math.sin(y1 * rad) + Math.sin(y2 * rad));
  }
  return Math.abs(s * R * R / 2) / 10000;
}

/* ── Modal genérico ── */
function terrModal_(id, titulo, ancho) {
  let m = document.getElementById(id);
  if (!m) {
    m = document.createElement('div'); m.id = id; m.className = 'gr-modal';
    m.innerHTML = '<div class="gr-modal-caja" style="width:min(' + (ancho || 640) + 'px,96vw);"><div class="gr-modal-cab"><b class="terr-modal-tit"></b><button class="turnos-btn" data-terr-cerrar="1">✕</button></div>' +
      '<div class="gr-modal-cuerpo terr-modal-cuerpo"></div><div class="gr-modal-pie terr-modal-pie"></div></div>';
    document.body.appendChild(m);
    m.addEventListener('click', e => { if (e.target === m || e.target.closest('[data-terr-cerrar]')) { m.style.display = 'none'; if (m._alCerrar) m._alCerrar(); } });
  }
  m._alCerrar = null;
  m.querySelector('.terr-modal-tit').textContent = titulo;
  m.style.display = 'flex';
  return { m, cuerpo: m.querySelector('.terr-modal-cuerpo'), pie: m.querySelector('.terr-modal-pie') };
}
function terrOpcionesTipos_(geom, sel) {
  const tipos = state.terr.tipos.filter(t => (t.activo || t.id === sel) && (!geom || t.geometria === 'cualquiera' || t.geometria === geom));
  const cats = [...new Set(tipos.map(t => t.categoria))];
  return '<option value="">— Selecciona la entidad —</option>' + cats.map(c => '<optgroup label="' + escapeHtml_(c) + '">' +
    tipos.filter(t => t.categoria === c).map(t => '<option value="' + t.id + '"' + (t.id === sel ? ' selected' : '') + '>' + escapeHtml_(t.icono + ' ' + t.nombre) + '</option>').join('') + '</optgroup>').join('');
}

/* ── Formulario: crear (desde el dibujo) o editar datos ── */
function terrAbrirFormulario_(registro) {
  const editar = !!registro;
  const capa = editar ? (state.terr.incendios.includes(registro) ? 'incendios' : 'elementos') : state.modoTerritorial.capa;
  const g = editar ? { tipo: registro.tipo_geometria, geojson: null } : terrGeomPendiente_();
  if (!g) return;
  const x = registro || {};
  const campo = (t, html, full) => '<label class="grn-campo' + (full ? ' full' : '') + '"><span>' + t + '</span>' + html + '</label>';
  const v = s => ' value="' + escapeHtml_(s == null ? '' : String(s)) + '"';
  const { m, cuerpo, pie } = terrModal_('terr-form', (editar ? '✏️ Editar ' : '➕ Nuevo ') + (capa === 'incendios' ? 'incendio' : 'elemento') + ' · ' + TERR_GEOM_TXT[g.tipo] +
    ' · ' + terrNombreComuna_(editar ? x.comuna_id : state.activeComunaId), 680);
  if (!editar) m._alCerrar = () => cancelarDibujo_();
  if (capa === 'incendios') {
    const ha = !editar && g.tipo === 'area' ? Math.round(terrHa_(g.geojson.coordinates[0]) * 100) / 100 : x.superficie_ha;
    cuerpo.innerHTML = '<div class="grn-grid">' +
      campo('Tipo de incendio *', '<select id="tf-tipo"><option value="Interfaz"' + (x.tipo === 'Interfaz' ? ' selected' : '') + '>🏘️ Incendio de interfaz</option><option value="Rural"' + (x.tipo === 'Rural' ? ' selected' : '') + '>🌲 Incendio rural</option></select>') +
      campo('Fecha *', '<input id="tf-fecha" type="date"' + v(x.fecha || fechaISO_(new Date())) + '>') +
      campo('Hora', '<input id="tf-hora" type="time"' + v(x.hora ? String(x.hora).slice(0, 5) : '') + '>') +
      campo('Nombre / sector', '<input id="tf-nombre"' + v(x.nombre) + '>', true) +
      campo('Superficie (ha)', '<input id="tf-superficie_ha" type="number" min="0" step="0.01"' + v(ha) + '>') +
      campo('Familias afectadas', '<input id="tf-familias_afectadas" type="number" min="0" step="1"' + v(x.familias_afectadas || 0) + '>') +
      campo('Personas afectadas', '<input id="tf-personas_afectadas" type="number" min="0" step="1"' + v(x.personas_afectadas || 0) + '>') +
      campo('Viviendas afectadas', '<input id="tf-viviendas_afectadas" type="number" min="0" step="1"' + v(x.viviendas_afectadas || 0) + '>') +
      campo('Viviendas de emergencia asignadas', '<input id="tf-viviendas_emergencia" type="number" min="0" step="1"' + v(x.viviendas_emergencia || 0) + '>') +
      campo('Observación', '<textarea id="tf-observacion" rows="2">' + escapeHtml_(x.observacion || '') + '</textarea>', true) + '</div>';
  } else {
    cuerpo.innerHTML = '<div class="grn-grid">' +
      campo('Entidad *', '<select id="tf-tipo">' + terrOpcionesTipos_(g.tipo, x.tipo_id) + '</select>', true) +
      (terrPuedeCatalogo_() ? '<div class="grn-campo full"><button class="popup-btn" type="button" id="tf-nueva-ent">🏷️ ¿No está? Crear una entidad nueva</button></div>' : '') +
      campo('Nombre', '<input id="tf-nombre" placeholder="Ej.: JJVV Villa Los Aromos"' + v(x.nombre) + '>', true) +
      campo('Contacto', '<input id="tf-contacto"' + v(x.contacto) + '>') +
      campo('Teléfono', '<input id="tf-telefono" type="tel"' + v(x.telefono) + '>') +
      campo('Descripción', '<textarea id="tf-descripcion" rows="2">' + escapeHtml_(x.descripcion || '') + '</textarea>', true) + '</div>';
    const bn = document.getElementById('tf-nueva-ent');
    if (bn) bn.addEventListener('click', () => terrNuevaEntidadRapida_(g.tipo));
  }
  pie.innerHTML = '<span id="tf-error" style="flex:1;color:#DC2626;font-size:12px;"></span><button class="turnos-btn" data-terr-cerrar="1">Cancelar</button>' +
    '<button class="turnos-btn gr-btn-guardar" id="tf-guardar">💾 Guardar</button>';
  document.getElementById('tf-guardar').onclick = () => terrGuardarFormulario_(capa, g, registro);
}
async function terrNuevaEntidadRapida_(geom) {
  const nombre = (prompt('Nombre de la nueva entidad (p. ej. «Junta de Vecinos», «Puente de madera»):') || '').trim();
  if (!nombre) return;
  const cat = (prompt('Categoría (p. ej. Organización comunitaria, Agua, Riesgos, Infraestructura…):', 'Otros') || 'Otros').trim();
  const { data, error } = await supabaseClient.from('terr_tipos_entidad').insert({ nombre, categoria: cat, geometria: 'cualquiera', creado_por: state.user && state.user.id }).select('*').single();
  if (error) { mostrarToast_('No se pudo crear: ' + error.message); return; }
  state.terr.tipos.push(data);
  const sel = document.getElementById('tf-tipo'); sel.innerHTML = terrOpcionesTipos_(geom, data.id);
  mostrarToast_('✅ Entidad «' + nombre + '» creada.');
}
async function terrGuardarFormulario_(capa, g, registro) {
  const err = document.getElementById('tf-error'), val = id => { const el = document.getElementById('tf-' + id); return el ? el.value.trim() : ''; };
  err.textContent = '';
  const btn = document.getElementById('tf-guardar');
  let res;
  btn.disabled = true;
  try {
    if (capa === 'incendios') {
      if (!val('fecha')) { err.textContent = 'La fecha es obligatoria.'; return; }
      const datos = { tipo: val('tipo'), fecha: val('fecha'), hora: val('hora'), nombre: val('nombre'), superficie_ha: val('superficie_ha'), observacion: val('observacion') };
      ['familias_afectadas', 'personas_afectadas', 'viviendas_afectadas', 'viviendas_emergencia'].forEach(k => { datos[k] = String(Math.max(0, parseInt(val(k), 10) || 0)); });
      res = await supabaseClient.rpc('guardar_terr_incendio', { p_id: registro ? registro.id : null, p_comuna_id: registro ? registro.comuna_id : state.activeComunaId,
        p_tipo_geometria: g.tipo, p_geojson: g.geojson, p_datos: datos });
    } else {
      if (!val('tipo')) { err.textContent = 'Elige la entidad.'; return; }
      res = await supabaseClient.rpc('guardar_terr_elemento', { p_id: registro ? registro.id : null, p_comuna_id: registro ? registro.comuna_id : state.activeComunaId,
        p_tipo_id: val('tipo'), p_tipo_geometria: g.tipo, p_geojson: g.geojson,
        p_datos: { nombre: val('nombre'), descripcion: val('descripcion'), contacto: val('contacto'), telefono: val('telefono') } });
    }
  } finally { btn.disabled = false; }
  if (res.error) { err.textContent = /guardar_terr/.test(res.error.message) ? 'Falta ejecutar el SQL 151.' : res.error.message; return; }
  const m = document.getElementById('terr-form'); m._alCerrar = null; m.style.display = 'none';
  if (!registro) cancelarDibujo_();
  mostrarToast_('✅ ' + (capa === 'incendios' ? 'Incendio' : 'Elemento') + (registro ? ' actualizado.' : ' guardado.'));
  await terrCargar_();
}
function terrEditarDatos_(id) { map.closePopup(); const r = terrBuscar_(id); if (r) terrAbrirFormulario_(r); }
function terrEditarForma_(id) {
  map.closePopup();
  if (!state.modoTerritorial) terrIniciarDibujo_(state.terr.incendios.some(x => x.id === id) ? 'incendios' : 'elementos');
  iniciarEdicionForma_('territorial', id);
}
/** Lo llama guardarEdicionForma_ (js/20) al guardar la nueva forma de una línea / área. */
async function terrGuardarForma_(id, tipo, puntos) {
  const coords = puntos.slice();
  if (tipo === 'area') coords.push(coords[0]);
  const geojson = tipo === 'area' ? { type: 'Polygon', coordinates: [coords] } : { type: 'LineString', coordinates: coords };
  const esInc = state.terr.incendios.some(x => x.id === id);
  const { error } = esInc
    ? await supabaseClient.rpc('guardar_terr_incendio', { p_id: id, p_comuna_id: null, p_tipo_geometria: tipo, p_geojson: geojson, p_datos: {} })
    : await supabaseClient.rpc('guardar_terr_elemento', { p_id: id, p_comuna_id: null, p_tipo_id: null, p_tipo_geometria: tipo, p_geojson: geojson, p_datos: {} });
  if (error) { mostrarToast_('Error: ' + error.message); return false; }
  return true;
}
async function terrMoverPunto_(id, ll) {
  const esInc = state.terr.incendios.some(x => x.id === id);
  const geojson = { type: 'Point', coordinates: [ll.lng, ll.lat] };
  const { error } = esInc
    ? await supabaseClient.rpc('guardar_terr_incendio', { p_id: id, p_comuna_id: null, p_tipo_geometria: 'punto', p_geojson: geojson, p_datos: {} })
    : await supabaseClient.rpc('guardar_terr_elemento', { p_id: id, p_comuna_id: null, p_tipo_id: null, p_tipo_geometria: 'punto', p_geojson: geojson, p_datos: {} });
  if (error) { mostrarToast_('No se pudo mover: ' + error.message); terrDibujar_(); return; }
  const r = terrBuscar_(id); if (r) { r.geojson = geojson; r.geom_geojson = JSON.stringify(geojson); r.lat = ll.lat; r.lng = ll.lng; }
  mostrarToast_('📍 Ubicación actualizada.');
}
async function terrEliminar_(id) {
  const r = terrBuscar_(id); if (!r) return;
  const esInc = state.terr.incendios.includes(r);
  if (!confirm('🗑️ ¿Eliminar ' + (esInc ? 'el incendio del ' + terrFecha_(r.fecha) : '«' + (r.nombre || r.tipo_nombre) + '»') + '?\n\nNo se puede deshacer.')) return;
  map.closePopup();
  const { error } = await supabaseClient.from(esInc ? 'terr_incendios' : 'terr_elementos').delete().eq('id', id);
  if (error) { mostrarToast_('No se pudo eliminar: ' + error.message); return; }
  mostrarToast_('🗑️ Eliminado.');
  await terrCargar_();
}

/* ── Capas (sección propia en 🗂️ Capas, js/32) ── */
function terrSeccionCapas_(c) {
  const sec = document.createElement('div');
  const cats = {};
  state.terr.elementos.forEach(e => { cats[e.categoria] = (cats[e.categoria] || 0) + 1; });
  const colorCat = k => { const e = state.terr.elementos.find(x => x.categoria === k); return (e && e.color) || TERR_COLOR.elementos; };
  const tg = (id, on, nombre, n, color, extra, sangria) => '<div class="layer-row"' + (sangria ? ' style="padding-left:18px;"' : '') + '>' +
    '<div class="toggle' + (on ? ' on' : '') + '" data-terr-capa="' + id + '"' + (extra || '') + '></div>' +
    '<div class="layer-left"><span class="flame-dot" style="background:' + color + '"></span><div><div class="layer-name">' + nombre + '</div>' +
    '<div class="layer-count">' + n + '</div></div></div></div>';
  sec.innerHTML = '<p class="section-label">🗺️ Planificación Territorial · ' + escapeHtml_(terrNombreComuna_(state.activeComunaId)) + '</p>' +
    tg('elementos', state.terr.elemOn, '🏷️ Entidades', state.terr.elementos.length + ' elemento(s)', TERR_COLOR.elementos) +
    Object.keys(cats).sort((a, b) => a.localeCompare(b, 'es')).map(k => tg('cat', !state.terr.catOcultas.has(k), escapeHtml_(k), cats[k], colorCat(k),
      ' data-cat="' + escapeHtml_(k) + '"', true)).join('') +
    tg('incendios', state.terr.incOn, '🔥 Incendios registrados', state.terr.incendios.length + ' incendio(s)', TERR_INC_COLOR.Interfaz) +
    (state.terr.sinSql ? '<p class="layer-empty-msg">Falta ejecutar el SQL 151.</p>' : '');
  sec.addEventListener('click', ev => {
    const t = ev.target.closest('[data-terr-capa]'); if (!t) return;
    const k = t.dataset.terrCapa;
    if (k === 'elementos') state.terr.elemOn = !state.terr.elemOn;
    else if (k === 'incendios') state.terr.incOn = !state.terr.incOn;
    else { const cat = t.dataset.cat; if (state.terr.catOcultas.has(cat)) state.terr.catOcultas.delete(cat); else state.terr.catOcultas.add(cat); }
    t.classList.toggle('on');
    terrAplicarVisibilidad_();
  });
  c.insertBefore(sec, c.firstChild);
}

/* ── 🏷️ Catálogo de entidades ── */
function terrAbrirCatalogo_() {
  if (state.terr.sinSql) { mostrarToast_('⚠️ Falta ejecutar en Supabase el SQL 151.'); return; }
  const { cuerpo, pie } = terrModal_('terr-catalogo', '🏷️ Entidades de la planificación territorial', 1000);
  const puede = terrPuedeCatalogo_();
  const usos = {}; state.terr.elementos.forEach(e => { usos[e.tipo_id] = (usos[e.tipo_id] || 0) + 1; });
  const cats = [...new Set(state.terr.tipos.map(t => t.categoria))].sort((a, b) => a.localeCompare(b, 'es'));
  const dis = puede ? '' : ' disabled';
  const filas = state.terr.tipos.slice().sort((a, b) => a.categoria.localeCompare(b.categoria, 'es') || a.orden - b.orden || a.nombre.localeCompare(b.nombre, 'es')).map(t =>
    '<tr class="' + (t.activo ? '' : 'emp-inactiva') + '" data-tid="' + t.id + '">' +
      '<td><input class="terr-cat-ico" data-k="icono" value="' + escapeHtml_(t.icono) + '"' + dis + '></td>' +
      '<td><input class="emp-nombre" data-k="nombre" value="' + escapeHtml_(t.nombre) + '"' + dis + '></td>' +
      '<td><input class="emp-nombre" data-k="categoria" list="terr-cats" value="' + escapeHtml_(t.categoria) + '"' + dis + '></td>' +
      '<td><select data-k="geometria"' + dis + '>' + [['cualquiera', 'Cualquiera'], ['punto', 'Punto'], ['linea', 'Línea'], ['area', 'Área']].map(([k, n]) =>
        '<option value="' + k + '"' + (t.geometria === k ? ' selected' : '') + '>' + n + '</option>').join('') + '</select></td>' +
      '<td><input type="color" data-k="color" value="' + escapeHtml_(t.color) + '"' + dis + '></td>' +
      '<td style="text-align:center;"><input type="checkbox" data-k="activo"' + (t.activo ? ' checked' : '') + dis + '></td>' +
      '<td style="text-align:center;">' + (usos[t.id] || 0) + '</td></tr>').join('');
  cuerpo.innerHTML = (puede ? '<div class="emp-nueva"><input id="terr-cat-nueva" class="emp-nombre" style="max-width:280px;" placeholder="Nombre de la nueva entidad">' +
      '<input id="terr-cat-nueva-cat" class="emp-nombre" style="max-width:220px;" list="terr-cats" placeholder="Categoría">' +
      '<button class="turnos-btn gr-btn-guardar" id="terr-cat-crear">➕ Agregar entidad</button></div>' : '<div class="pl-aviso info" style="margin:0;">Solo el Administrador y los Jefes de Área modifican el catálogo.</div>') +
    '<datalist id="terr-cats">' + cats.map(c => '<option value="' + escapeHtml_(c) + '">').join('') + '</datalist>' +
    '<table class="emp-tabla"><thead><tr><th>Ícono</th><th>Entidad</th><th>Categoría</th><th>Geometría</th><th>Color</th><th>Activa</th><th>En esta comuna</th></tr></thead><tbody>' + filas + '</tbody></table>';
  pie.innerHTML = '<span style="flex:1;font-size:11.5px;color:var(--text-secondary);">' + state.terr.tipos.length + ' entidades · los cambios se guardan al instante. Una entidad inactiva no se ofrece al dibujar, pero sus elementos se mantienen.</span><button class="turnos-btn" data-terr-cerrar="1">Cerrar</button>';
  if (!puede) return;
  cuerpo.onchange = async e => {
    const tr = e.target.closest('[data-tid]'); if (!tr || !e.target.dataset.k) return;
    const k = e.target.dataset.k, valor = e.target.type === 'checkbox' ? e.target.checked : e.target.value.trim();
    if ((k === 'nombre' || k === 'categoria') && !valor) { mostrarToast_('No puede quedar vacío.'); terrAbrirCatalogo_(); return; }
    const { error } = await supabaseClient.from('terr_tipos_entidad').update({ [k]: valor }).eq('id', tr.dataset.tid);
    if (error) { mostrarToast_('No se pudo guardar: ' + error.message); terrAbrirCatalogo_(); return; }
    const t = terrTipo_(tr.dataset.tid); if (t) t[k] = valor;
    if (k === 'activo') tr.classList.toggle('emp-inactiva', !valor);
    state.terr.comuna = null;   // vuelve a leer los elementos (ícono / color / nombre)
  };
  document.getElementById('terr-cat-crear').onclick = async () => {
    const nombre = document.getElementById('terr-cat-nueva').value.trim(), cat = document.getElementById('terr-cat-nueva-cat').value.trim() || 'Otros';
    if (!nombre) { mostrarToast_('Escribe el nombre de la entidad.'); return; }
    const { data, error } = await supabaseClient.from('terr_tipos_entidad').insert({ nombre, categoria: cat, creado_por: state.user && state.user.id }).select('*').single();
    if (error) { mostrarToast_(/duplicate|unique/i.test(error.message) ? 'Ya existe una entidad con ese nombre.' : 'No se pudo crear: ' + error.message); return; }
    state.terr.tipos.push(data);
    terrAbrirCatalogo_();
    mostrarToast_('✅ Entidad «' + nombre + '» creada.');
  };
  document.getElementById('terr-catalogo')._alCerrar = () => { if (state.terr.comuna === null) terrCargar_(); };
}

/* ── 📤 Exportar ── */
function terrAbrirExportar_() {
  if (!state.activeComunaId) { mostrarToast_('Elige primero una comuna.'); return; }
  const { cuerpo, pie } = terrModal_('terr-exportar', '📤 Exportar · ' + terrNombreComuna_(state.activeComunaId), 520);
  const n = (lista, g) => lista.filter(x => x.tipo_geometria === g).length;
  const E = state.terr.elementos, I = state.terr.incendios;
  const chk = (id, txt, on) => '<label class="grp-chk"><input type="checkbox" id="' + id + '"' + (on ? ' checked' : '') + '> ' + txt + '</label>';
  cuerpo.innerHTML = '<div class="terr-exp">' +
    '<b>Capas</b>' + chk('te-elem', '🏷️ Entidades (' + E.length + ')', true) + chk('te-inc', '🔥 Incendios registrados (' + I.length + ')', true) +
    '<b>Geometrías</b>' + chk('te-punto', '📍 Puntos (' + (n(E, 'punto') + n(I, 'punto')) + ')', true) + chk('te-linea', '〰️ Líneas (' + (n(E, 'linea') + n(I, 'linea')) + ')', true) +
      chk('te-area', '⬛ Áreas (' + (n(E, 'area') + n(I, 'area')) + ')', true) +
    '<label class="grp-chk"><input type="checkbox" id="te-visibles"> Solo las categorías visibles en el mapa</label>' +
    '<b>Formato</b><div style="display:flex;gap:14px;"><label class="grp-chk"><input type="radio" name="te-fmt" value="kml" checked> 🌍 KML (Google Earth)</label>' +
      '<label class="grp-chk"><input type="radio" name="te-fmt" value="geojson"> 🧩 GeoJSON (QGIS / ArcGIS)</label></div>' +
    '<p style="font-size:11.5px;color:var(--text-secondary);margin:4px 0 0;">El GeoJSON exportado se puede volver a importar (trae la columna «entidad»).</p></div>';
  pie.innerHTML = '<button class="turnos-btn" data-terr-cerrar="1">Cancelar</button><button class="turnos-btn gr-btn-guardar" id="te-bajar">⬇️ Descargar</button>';
  document.getElementById('te-bajar').onclick = terrExportar_;
}
function terrPropsElemento_(e) {
  return Object.assign({ capa: 'entidades', entidad: e.tipo_nombre, categoria: e.categoria, nombre: e.nombre || null, descripcion: e.descripcion || null,
    contacto: e.contacto || null, telefono: e.telefono || null, geometria: e.tipo_geometria, km: e.km != null ? Number(e.km) : null, ha: e.ha != null ? Number(e.ha) : null,
    comuna: terrNombreComuna_(e.comuna_id) }, e.atributos || {});
}
function terrPropsIncendio_(i) {
  return { capa: 'incendios', tipo: i.tipo, nombre: i.nombre || null, fecha: i.fecha, hora: i.hora ? String(i.hora).slice(0, 5) : null,
    superficie_ha: i.superficie_ha != null ? Number(i.superficie_ha) : null, familias_afectadas: i.familias_afectadas, personas_afectadas: i.personas_afectadas,
    viviendas_afectadas: i.viviendas_afectadas, viviendas_emergencia: i.viviendas_emergencia, observacion: i.observacion || null, comuna: terrNombreComuna_(i.comuna_id) };
}
function terrExportar_() {
  const c = id => document.getElementById(id).checked;
  const geoms = ['punto', 'linea', 'area'].filter(g => c('te-' + g));
  const fmt = document.querySelector('input[name="te-fmt"]:checked').value;
  const grupos = [];
  if (c('te-elem')) grupos.push({ nombre: 'Entidades', features: state.terr.elementos.filter(e => geoms.includes(e.tipo_geometria) && e.geojson &&
      (!c('te-visibles') || !state.terr.catOcultas.has(e.categoria)))
    .map(e => ({ geometry: e.geojson, _nombre: (e.nombre || e.tipo_nombre), _color: e.color || TERR_COLOR.elementos, _carpeta: e.categoria + ' · ' + e.tipo_nombre, properties: terrPropsElemento_(e) })) });
  if (c('te-inc')) grupos.push({ nombre: 'Incendios registrados', features: state.terr.incendios.filter(i => geoms.includes(i.tipo_geometria) && i.geojson)
    .map(i => ({ geometry: i.geojson, _nombre: 'Incendio ' + i.tipo + ' ' + terrFecha_(i.fecha), _color: TERR_INC_COLOR[i.tipo] || '#DC2626', _carpeta: 'Incendio ' + i.tipo, properties: terrPropsIncendio_(i) })) });
  const total = grupos.reduce((s, g) => s + g.features.length, 0);
  if (!total) { mostrarToast_('No hay elementos con esa selección.'); return; }
  const nombre = ('territorial_' + plNorm_(terrNombreComuna_(state.activeComunaId)).replace(/[^A-Z0-9]+/g, '_') + '_' + fechaISO_(new Date())).toLowerCase();
  if (fmt === 'geojson') {
    descargarArchivo_(JSON.stringify({ type: 'FeatureCollection', name: nombre, features: grupos.reduce((a, g) => a.concat(g.features.map(f => ({ type: 'Feature', geometry: f.geometry, properties: f.properties }))), []) }),
      nombre + '.geojson', 'application/geo+json;charset=utf-8');
  } else {
    descargarArchivo_(dgKml_(nombre, grupos.filter(g => g.features.length)), nombre + '.kml', 'application/vnd.google-earth.kml+xml;charset=utf-8');
  }
  document.getElementById('terr-exportar').style.display = 'none';
  mostrarToast_('⬇️ ' + total + ' elemento(s) exportados en ' + (fmt === 'kml' ? 'KML' : 'GeoJSON') + '.');
}

/* ── 📥 Importar (GeoJSON, KML o KMZ: puntos, líneas y áreas) ── */
function terrAbrirImportar_() {
  if (!state.activeComunaId) { mostrarToast_('Elige primero una comuna.'); return; }
  if (!terrPuedeEditarPerfil_()) { mostrarToast_('Tu perfil solo puede consultar.'); return; }
  let inp = document.getElementById('terr-input-archivo');
  if (!inp) {
    inp = document.createElement('input'); inp.type = 'file'; inp.id = 'terr-input-archivo'; inp.accept = '.geojson,.json,.kml,.kmz'; inp.style.display = 'none';
    document.body.appendChild(inp);
    inp.addEventListener('change', e => { const f = e.target.files && e.target.files[0]; e.target.value = ''; if (f) terrLeerArchivo_(f); });
  }
  inp.click();
}
/** Placemarks de un KML → Features GeoJSON (Point / LineString / Polygon, también dentro de MultiGeometry). */
function terrKmlAFeatures_(texto) {
  const doc = new DOMParser().parseFromString(texto, 'application/xml');
  const coords = el => (el && el.textContent || '').trim().split(/\s+/).map(s => s.split(',').map(Number)).filter(p => p.length >= 2 && !isNaN(p[0]) && !isNaN(p[1])).map(p => [p[0], p[1]]);
  const hijos = (el, tag) => Array.from(el.getElementsByTagName(tag));
  const out = [];
  hijos(doc, 'Placemark').forEach(pm => {
    const props = { nombre: (pm.getElementsByTagName('name')[0] || {}).textContent || '' };
    const desc = pm.getElementsByTagName('description')[0]; if (desc) props.descripcion = desc.textContent.replace(/<[^>]+>/g, ' ').trim();
    hijos(pm, 'Data').forEach(d => { const v = d.getElementsByTagName('value')[0]; if (d.getAttribute('name')) props[d.getAttribute('name')] = v ? v.textContent : ''; });
    hijos(pm, 'SimpleData').forEach(d => { if (d.getAttribute('name')) props[d.getAttribute('name')] = d.textContent; });
    hijos(pm, 'Point').forEach(p => { const c = coords(p.getElementsByTagName('coordinates')[0]); if (c.length) out.push({ type: 'Feature', properties: props, geometry: { type: 'Point', coordinates: c[0] } }); });
    hijos(pm, 'LineString').forEach(l => { const c = coords(l.getElementsByTagName('coordinates')[0]); if (c.length >= 2) out.push({ type: 'Feature', properties: props, geometry: { type: 'LineString', coordinates: c } }); });
    hijos(pm, 'Polygon').forEach(p => {
      const ext = p.getElementsByTagName('outerBoundaryIs')[0]; const c = coords(ext ? ext.getElementsByTagName('coordinates')[0] : p.getElementsByTagName('coordinates')[0]);
      if (c.length >= 3) out.push({ type: 'Feature', properties: props, geometry: { type: 'Polygon', coordinates: [c] } });
    });
  });
  return out;
}
/** Una Feature (también Multi*) → lista de { tipo, geojson, props } simples. */
function terrPartesFeature_(f) {
  const g = f && f.geometry; if (!g) return [];
  const p = f.properties || {};
  const t = { Point: 'punto', MultiPoint: 'punto', LineString: 'linea', MultiLineString: 'linea', Polygon: 'area', MultiPolygon: 'area' }[g.type];
  if (!t) return g.type === 'GeometryCollection' ? (g.geometries || []).reduce((a, x) => a.concat(terrPartesFeature_({ geometry: x, properties: p })), []) : [];
  if (/^Multi/.test(g.type)) return g.coordinates.map(c => ({ tipo: t, geojson: { type: g.type.replace('Multi', ''), coordinates: c }, props: p }));
  return [{ tipo: t, geojson: g, props: p }];
}
async function terrLeerArchivo_(file) {
  let feats = [];
  try {
    if (/\.(kml|kmz)$/i.test(file.name)) feats = terrKmlAFeatures_(await leerArchivoKml_(file));
    else { const gj = JSON.parse(await file.text()); feats = gj.type === 'FeatureCollection' ? gj.features : gj.type === 'Feature' ? [gj] : [{ type: 'Feature', geometry: gj, properties: {} }]; }
  } catch (e) { mostrarToast_('No se pudo leer el archivo: ' + (e.message || e)); return; }
  const partes = feats.reduce((a, f) => a.concat(terrPartesFeature_(f)), []);
  if (!partes.length) { mostrarToast_('El archivo no trae puntos, líneas ni áreas.'); return; }
  const primera = (function c(a) { return Array.isArray(a[0]) ? c(a[0]) : a; })(partes[0].geojson.coordinates);
  if (Math.abs(primera[0]) > 180 || Math.abs(primera[1]) > 90) { mostrarToast_('⚠️ Las coordenadas no están en grados (WGS84 / EPSG:4326). Exporta el archivo en ese sistema.'); return; }
  terrPrevisualizarImportacion_(file.name, partes);
}
function terrTipoPorNombre_(s) {
  const k = normalizarBusqueda_(String(s || '')); if (!k) return null;
  return state.terr.tipos.find(t => normalizarBusqueda_(t.nombre) === k) || null;
}
function terrPrevisualizarImportacion_(nombreArchivo, partes) {
  const cuenta = g => partes.filter(p => p.tipo === g).length;
  const conEntidad = partes.filter(p => terrTipoPorNombre_(p.props.entidad || p.props.tipo_entidad)).length;
  const pareceInc = partes.some(p => String(p.props.capa || '').toLowerCase() === 'incendios');
  const { cuerpo, pie } = terrModal_('terr-importar', '📥 Importar · ' + nombreArchivo, 620);
  const selG = g => cuenta(g) ? '<label class="grn-campo full"><span>Entidad para los ' + { punto: 'puntos', linea: 'líneas', area: 'áreas' }[g] + ' (' + cuenta(g) + ')</span>' +
    '<select id="ti-ent-' + g + '">' + terrOpcionesTipos_(g) + '</select></label>' : '';
  cuerpo.innerHTML = '<div class="pl-aviso info" style="margin:0 0 10px;">' + partes.length + ' elemento(s): ' + cuenta('punto') + ' puntos · ' + cuenta('linea') + ' líneas · ' + cuenta('area') +
      ' áreas. Se cargan en <b>' + escapeHtml_(terrNombreComuna_(state.activeComunaId)) + '</b>.</div>' +
    '<div style="display:flex;gap:16px;margin-bottom:10px;"><label class="grp-chk"><input type="radio" name="ti-capa" value="elementos"' + (pareceInc ? '' : ' checked') + '> 🏷️ Entidades</label>' +
      '<label class="grp-chk"><input type="radio" name="ti-capa" value="incendios"' + (pareceInc ? ' checked' : '') + '> 🔥 Incendios registrados</label></div>' +
    '<div id="ti-elem" class="grn-grid">' + (conEntidad ? '<div class="grn-campo full" style="font-weight:600;color:#166534;">✔ ' + conEntidad + ' elemento(s) traen la columna «entidad» del catálogo y la usan; los demás toman la entidad elegida abajo.</div>' : '') +
      selG('punto') + selG('linea') + selG('area') + '</div>' +
    '<div id="ti-inc" class="grn-grid" style="display:none;">' +
      '<label class="grn-campo"><span>Tipo (si el archivo no lo trae)</span><select id="ti-inc-tipo"><option value="Interfaz">Interfaz</option><option value="Rural">Rural</option></select></label>' +
      '<label class="grn-campo"><span>Fecha (si el archivo no la trae)</span><input id="ti-inc-fecha" type="date" value="' + fechaISO_(new Date()) + '"></label>' +
      '<div class="grn-campo full" style="font-weight:500;">Se leen del archivo, si existen: tipo, fecha, hora, nombre, superficie_ha, familias_afectadas, personas_afectadas, viviendas_afectadas, viviendas_emergencia, observacion.</div></div>' +
    '<div id="ti-prog" style="font-size:12px;color:var(--text-secondary);margin-top:8px;"></div>';
  const alternar = () => { const inc = document.querySelector('input[name="ti-capa"]:checked').value === 'incendios';
    document.getElementById('ti-elem').style.display = inc ? 'none' : ''; document.getElementById('ti-inc').style.display = inc ? '' : 'none'; };
  cuerpo.querySelectorAll('input[name="ti-capa"]').forEach(r => r.addEventListener('change', alternar)); alternar();
  pie.innerHTML = '<button class="turnos-btn" data-terr-cerrar="1">Cancelar</button><button class="turnos-btn gr-btn-guardar" id="ti-aplicar">📥 Importar ' + partes.length + '</button>';
  document.getElementById('ti-aplicar').onclick = () => terrImportar_(partes);
}
async function terrImportar_(partes) {
  const capa = document.querySelector('input[name="ti-capa"]:checked').value, prog = document.getElementById('ti-prog'), btn = document.getElementById('ti-aplicar');
  const num = v => { const n = Number(String(v == null ? '' : v).replace(',', '.')); return isNaN(n) ? '' : String(n); };
  const fechaDe = v => { const s = String(v || '').trim(); let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/); if (m) return m[1] + '-' + m[2].padStart(2, '0') + '-' + m[3].padStart(2, '0');
    m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/); return m ? m[3] + '-' + m[2].padStart(2, '0') + '-' + m[1].padStart(2, '0') : ''; };
  const tareas = [];
  for (const p of partes) {
    const P = {}; Object.keys(p.props || {}).forEach(k => { P[normalizarBusqueda_(k).replace(/[^a-z0-9]+/g, '_')] = p.props[k]; });
    const nombre = P.nombre || P.name || P.nom || '';
    if (capa === 'incendios') {
      const tipo = /rural/i.test(P.tipo || '') ? 'Rural' : /interfaz/i.test(P.tipo || '') ? 'Interfaz' : document.getElementById('ti-inc-tipo').value;
      const datos = { tipo, fecha: fechaDe(P.fecha) || document.getElementById('ti-inc-fecha').value, hora: P.hora || '', nombre, superficie_ha: num(P.superficie_ha || P.ha),
        observacion: P.observacion || P.descripcion || '' };
      ['familias_afectadas', 'personas_afectadas', 'viviendas_afectadas', 'viviendas_emergencia'].forEach(k => { datos[k] = String(parseInt(P[k], 10) || 0); });
      tareas.push(() => supabaseClient.rpc('guardar_terr_incendio', { p_id: null, p_comuna_id: state.activeComunaId, p_tipo_geometria: p.tipo, p_geojson: p.geojson, p_datos: datos }));
    } else {
      const porArchivo = terrTipoPorNombre_(P.entidad || P.tipo_entidad);
      const tipoId = porArchivo ? porArchivo.id : (document.getElementById('ti-ent-' + p.tipo) || {}).value;
      if (!tipoId) { prog.textContent = '⚠️ Elige la entidad para ' + { punto: 'los puntos', linea: 'las líneas', area: 'las áreas' }[p.tipo] + '.'; return; }
      const conocidas = ['nombre', 'name', 'nom', 'descripcion', 'description', 'contacto', 'telefono', 'entidad', 'tipo_entidad', 'categoria', 'capa', 'geometria', 'km', 'ha', 'comuna'];
      const atributos = {}; Object.keys(p.props || {}).forEach(k => { const kn = normalizarBusqueda_(k).replace(/[^a-z0-9]+/g, '_'); if (!conocidas.includes(kn) && p.props[k] != null && p.props[k] !== '') atributos[k] = p.props[k]; });
      tareas.push(() => supabaseClient.rpc('guardar_terr_elemento', { p_id: null, p_comuna_id: state.activeComunaId, p_tipo_id: tipoId, p_tipo_geometria: p.tipo, p_geojson: p.geojson,
        p_datos: { nombre, descripcion: P.descripcion || P.description || '', contacto: P.contacto || '', telefono: P.telefono ? String(P.telefono) : '', atributos } }));
    }
  }
  btn.disabled = true;
  let ok = 0; const errores = [];
  for (let i = 0; i < tareas.length; i += 5) {
    const res = await Promise.all(tareas.slice(i, i + 5).map(t => t()));
    res.forEach((r, j) => { if (r.error) errores.push('Elemento ' + (i + j + 1) + ': ' + r.error.message); else ok++; });
    prog.textContent = 'Importando… ' + Math.min(i + 5, tareas.length) + ' de ' + tareas.length;
  }
  btn.disabled = false;
  document.getElementById('terr-importar').style.display = 'none';
  if (errores.length) console.warn('Importación territorial, errores:', errores);
  mostrarToast_((errores.length ? '⚠️ ' : '✅ ') + 'Importados ' + ok + ' de ' + tareas.length + (errores.length ? ' · ' + errores.length + ' con error (' + errores[0] + ')' : '') + '.');
  await terrCargar_();
}

/* ── 📊 Tablero: totales de capas e incendios registrados ── */
async function terrAbrirTablero_() {
  const { cuerpo, pie } = terrModal_('terr-tablero', '📊 Tablero · Planificación Territorial', 1100);
  cuerpo.innerHTML = '<div class="tb-vacio">Cargando…</div>';
  const { data, error } = await supabaseClient.rpc('resumen_territorial');
  if (error) { cuerpo.innerHTML = '<div class="tb-vacio">' + (/resumen_territorial/.test(error.message) ? 'Falta ejecutar el SQL 151.' : escapeHtml_(error.message)) + '</div>'; return; }
  const filas = (data || []).map(r => Object.assign({ nombre: terrNombreComuna_(r.comuna_id) }, r)).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  const tot = k => filas.reduce((s, r) => s + Number(r[k] || 0), 0);
  const kpi = (n, t, c) => '<div class="gr-kpi" style="--c:' + c + '"><b>' + Number(n).toLocaleString('es-CL') + '</b>' + t + '</div>';
  // Detalle de la comuna activa por categoría / entidad e incendios por mes
  const E = state.terr.comuna === state.activeComunaId ? state.terr.elementos : [], I = state.terr.comuna === state.activeComunaId ? state.terr.incendios : [];
  const porCat = {}; E.forEach(e => { porCat[e.categoria] = porCat[e.categoria] || {}; porCat[e.categoria][e.tipo_nombre] = (porCat[e.categoria][e.tipo_nombre] || 0) + 1; });
  const maxCat = Math.max(1, ...Object.values(porCat).map(o => Object.values(o).reduce((s, n) => s + n, 0)));
  const porMes = {}; I.forEach(i => { const k = String(i.fecha).slice(0, 7); porMes[k] = porMes[k] || { Interfaz: 0, Rural: 0 }; porMes[k][i.tipo]++; });
  cuerpo.innerHTML =
    '<div class="gr-kpis">' + kpi(filas.length, 'comunas con registros', '#0F766E') + kpi(tot('elementos'), 'elementos', '#2563EB') + kpi(tot('puntos'), 'puntos', '#0284C7') +
      kpi(tot('lineas'), 'líneas', '#7C3AED') + kpi(tot('areas'), 'áreas', '#16A34A') + kpi(tot('incendios'), 'incendios', '#DC2626') + kpi(tot('interfaz'), 'de interfaz', '#B91C1C') +
      kpi(tot('rurales'), 'rurales', '#EA580C') + kpi(tot('familias'), 'familias afectadas', '#9333EA') + kpi(tot('viviendas_emergencia'), 'viviendas de emergencia', '#A16207') +
      kpi(Math.round(tot('superficie_ha')), 'ha afectadas', '#78350F') + '</div>' +
    (state.activeComunaId ? '<div class="terr-tab-det"><div><b>🏷️ ' + escapeHtml_(terrNombreComuna_(state.activeComunaId)) + ' · entidades por categoría</b>' +
      (Object.keys(porCat).length ? Object.keys(porCat).sort((a, b) => a.localeCompare(b, 'es')).map(c => { const n = Object.values(porCat[c]).reduce((s, x) => s + x, 0);
        return '<div class="terr-bar"><span>' + escapeHtml_(c) + '</span><i style="width:' + Math.round(n / maxCat * 100) + '%"></i><em>' + n + '</em></div><small class="terr-bar-det">' +
          Object.keys(porCat[c]).sort().map(t => escapeHtml_(t) + ' ' + porCat[c][t]).join(' · ') + '</small>'; }).join('') : '<div class="tb-vacio">Sin entidades registradas.</div>') + '</div>' +
      '<div><b>🔥 ' + escapeHtml_(terrNombreComuna_(state.activeComunaId)) + ' · incendios por mes</b>' +
      (Object.keys(porMes).length ? '<table class="emp-tabla"><thead><tr><th>Mes</th><th>Interfaz</th><th>Rural</th></tr></thead><tbody>' + Object.keys(porMes).sort().reverse().map(k =>
        '<tr><td>' + k.slice(5) + '-' + k.slice(0, 4) + '</td><td>' + porMes[k].Interfaz + '</td><td>' + porMes[k].Rural + '</td></tr>').join('') + '</tbody></table>'
        : '<div class="tb-vacio">Sin incendios registrados.</div>') + '</div></div>' : '') +
    '<b>Por comuna</b><table class="emp-tabla"><thead><tr><th>Comuna</th><th>Elementos</th><th>Puntos</th><th>Líneas</th><th>Áreas</th><th>Entidades</th><th>Incendios</th><th>Interfaz</th><th>Rurales</th>' +
      '<th>Familias</th><th>Viv. emergencia</th><th>Ha</th></tr></thead><tbody>' +
      (filas.map(r => '<tr><td><b>' + escapeHtml_(r.nombre) + '</b></td>' + ['elementos', 'puntos', 'lineas', 'areas', 'entidades_distintas', 'incendios', 'interfaz', 'rurales', 'familias', 'viviendas_emergencia', 'superficie_ha']
        .map(k => '<td style="text-align:center;">' + Number(r[k] || 0).toLocaleString('es-CL') + '</td>').join('') + '</tr>').join('') || '<tr><td colspan="12" class="tb-vacio">Aún no hay registros.</td></tr>') + '</tbody></table>';
  pie.innerHTML = '<span style="flex:1;font-size:11.5px;color:var(--text-secondary);">Totales de la base gráfica (todas las comunas con registros).</span>' +
    '<button class="turnos-btn" id="terr-tab-excel">⬇️ Excel</button><button class="turnos-btn" data-terr-cerrar="1">Cerrar</button>';
  document.getElementById('terr-tab-excel').onclick = async () => {
    try {
      const XLSX = await tbCargarSheetJs_();
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(filas.map(r => ({ Comuna: r.nombre, Elementos: Number(r.elementos), Puntos: Number(r.puntos), Líneas: Number(r.lineas),
        Áreas: Number(r.areas), 'Entidades distintas': Number(r.entidades_distintas), Incendios: Number(r.incendios), Interfaz: Number(r.interfaz), Rurales: Number(r.rurales),
        'Familias afectadas': Number(r.familias), 'Viviendas de emergencia': Number(r.viviendas_emergencia), 'Hectáreas afectadas': Number(r.superficie_ha) }))), 'Por comuna');
      if (E.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(E.map(terrPropsElemento_)), 'Entidades comuna');
      if (I.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(I.map(terrPropsIncendio_)), 'Incendios comuna');
      XLSX.writeFile(wb, 'tablero_territorial_' + fechaISO_(new Date()) + '.xlsx');
    } catch (e) { mostrarToast_('No se pudo generar el Excel: ' + (e.message || e)); }
  };
}
