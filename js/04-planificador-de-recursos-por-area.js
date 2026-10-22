/* ==================== PLANIFICADOR DE RECURSOS POR ÁREA (mapa exclusivo) ====================
 * Une en una sola ficha por recurso: punto de referencia (referencia_recursos =
 * "Recursos disponibles"), tipo (catálogo tipos_recurso), 1 o 2 rutas
 * (recurso_rutas → rutas_patrullaje) y el Calendario de Turnos (recurso_turnos).
 * Lee la vista v_planificador_recursos (SQL 65). Escribe solo por RPC:
 * guardar_ficha_recurso, guardar_rutas_recurso, mover_recurso_referencia y
 * actualizar_inicio_recurso (51).
 * Edita: Administrador (todo) y Jefe de Área (sus áreas). Resto: solo lectura.
 * Ojo: perfil_areas guarda las áreas SIN tilde ('MULCHEN') y los recursos CON
 * tilde ('MULCHÉN'): toda comparación de área pasa por plNorm_. */
let plMap = null, plRutasLayer = null, plRecursosLayer = null, plSelLayer = null;
// Capas de contexto del Planificador (06-10-2026), cada una en su pane para un orden fijo:
// comunas del área (fondo, tenue) < áreas de relacionamiento < fundos CMPC < rutas < recursos.
let plComunasLayer = null, plAreaRelLayer = null, plFundosLayer = null, plAsignadasLayer = null;
state.pl = { recursos: [], rutas: [], idArea: null, sector: '', tipo: '', q: '', selId: null, subg: '', grafica: '',
             moviendo: false, cargado: false, preview: null, encuadrar: false,
             capas: { comunas: true, areaRel: true, fundos: false, rutas: false, asignadas: true,
                      // Capas del Planificador de Alertas (12-10-2026): se cargan al encenderlas, por área
                      fundosArauco: false, redVial: false, redVialCmpc: false, comites: false,
                      alertaVerde: false, alertaAmarilla: false, alertaRoja: false, incendios: false },
             capasData: { idArea: null, comunas: [], areaRel: [], fundos: [] },
             extra: { idArea: null, info: {}, temporadas: [], incOn: {} },   // datos y estado de esas capas
             // Clave nueva (20-10-2026): todos parten con el mapa sobrio; luego se recuerda lo que elija cada uno
             base: (function () { try { return localStorage.getItem('pl_base2') || 'sobrio'; } catch (e) { return 'sobrio'; } })(),
             // Etiquetas por capa (🏷️ en el panel de capas) y clave radial de los recursos (21-10-2026); se recuerdan por equipo
             etq: (function () { try { return JSON.parse(localStorage.getItem('pl_etq') || 'null') || { comunas: true }; } catch (e) { return { comunas: true }; } })(),
             claveRadial: (function () { try { return localStorage.getItem('pl_clave_radial') !== '0'; } catch (e) { return true; } })(),
             // Opacidad del fondo de la clave radial (0,2–1; 60 % por defecto)
             claveOp: (function () { try { const v = Number(localStorage.getItem('pl_clave_op')); return v >= 0.2 && v <= 1 ? v : 0.6; } catch (e) { return 0.6; } })(),
             listaOculta: window.innerWidth < 900, ocultarFicha: false,
             nuevo: null };   // { latlng } mientras se crea un recurso
// Grupos de las capas del Planificador de Alertas dentro del mapa del Planificador
const plExtraLayers = {};

// Ficha mínima (formato del GeoJSON de recursos): lo que falta se marca en la lista.
const PL_REQUERIDOS = [
  ['codigo_ref', 'Código'], ['tipo_recurso', 'Tipo de recurso'], ['actividad', 'Actividad'],
  ['tipo_movil', 'Tipo de móvil'], ['sector', 'Sector'], ['zona_alerta', 'Zona de alerta'],
  ['fecha_inicio_operacion', 'Fecha de inicio'], ['lat', 'Ubicación en el mapa'], ['_ruta_normal', 'Ruta (escenario Normal)'],
];
/** Ruta del escenario Normal enlazada al recurso (SQL 79), o null. */
function plRutaNormal_(r) { return (r && state.pl.rutaNormal && state.pl.rutaNormal[r.id]) || null; }

function plNorm_(s) { return normalizarBusqueda_(s).toUpperCase(); }
function plFaltantes_(r) {
  return PL_REQUERIDOS.filter(([k]) => k === '_ruta_normal' ? !plRutaNormal_(r) : (r[k] == null || String(r[k]).trim() === ''))
    .map(([, etiqueta]) => etiqueta);
}
function plPuedeEditar_(r) {
  if (!state.perfil || !r) return false;
  if (!puedeEditarModulo_('planificador_grafico')) return false;   // permiso por usuario (SQL 83)
  if (state.perfil.perfil === 'Administrador') return true;
  if (!esJefeAreaPerfil_(state.perfil.perfil)) return false;
  return (state.misAreasIds || []).map(plNorm_).includes(plNorm_(r.area));
}
function plColorTipo_(tipo) {
  const t = (state.tiposRecursoCatalogo || []).find(x => plNorm_(x.nombre) === plNorm_(tipo));
  return (t && t.color_hex) || '#64748B';
}
function plEstado_(texto, clase) {
  const el = document.getElementById('pl-estado');
  if (!el) return;
  el.textContent = texto;
  el.className = 'turnos-estado' + (clase ? ' ' + clase : '');
}
function plSeleccionado_() {
  return state.pl.recursos.find(r => r.id === state.pl.selId) || null;
}
function plFechaCorta_(iso) {
  if (!iso) return '—';
  const p = String(iso).slice(0, 10).split('-');
  return p.length === 3 ? p[2] + '-' + p[1] + '-' + p[0] : iso;
}

function initPlMap_() {
  if (plMap) { setTimeout(() => plMap.invalidateSize(), 60); return; }
  plMap = L.map('pl-map', { zoomControl: true, attributionControl: false, zoomSnap: 0.25 }).setView([-38.0, -72.4], 8);
  plSetBasemap_(state.pl.base || 'sobrio');
  if (plMap.zoomControl) agregarLupasZoom_(plMap, plMap.zoomControl.getContainer());   // 🔍 lupas + vista anterior (js/01)
  // Si cambia el espacio del mapa (lista plegada, barra en 2 líneas, ventana), Leaflet se reajusta
  if (window.ResizeObserver) new ResizeObserver(() => plMap.invalidateSize()).observe(document.getElementById('pl-map'));
  [['plComunas', 360], ['plAreaRel', 370], ['plFundos', 380], ['plAsignadas', 405],
   // Capas del Planificador de Alertas (12-10-2026), mismo orden relativo que el mapa principal
   ['plAlertas', 355], ['plRvCmpc', 386], ['plRvBorde', 388], ['plRvRelleno', 389], ['plComites', 392], ['plIncendios', 590],
   ['plEtq', 595],   // etiquetas de las capas (bajo los íconos de recursos, sin capturar clics)
  ].forEach(([n, z]) => { plMap.createPane(n).style.zIndex = z; });
  plMap.getPane('plEtq').style.pointerEvents = 'none';
  document.getElementById('pl-map').style.setProperty('--pl-clave-op', state.pl.claveOp);
  plMap.getPane('plIncendios').style.pointerEvents = 'auto';
  plMap.on('zoomend', () => plRestilarRedVial_());
  let esperaCmpc = null;
  plMap.on('moveend', () => {
    if (!state.pl.capas.redVialCmpc) return;
    clearTimeout(esperaCmpc); esperaCmpc = setTimeout(() => plCargarCapaExtra_('redVialCmpc', true), 250);
  });
  plComunasLayer = L.layerGroup().addTo(plMap);
  plAreaRelLayer = L.layerGroup().addTo(plMap);
  plFundosLayer = L.layerGroup().addTo(plMap);
  plRutasLayer = L.layerGroup().addTo(plMap);
  plAsignadasLayer = L.layerGroup().addTo(plMap);
  plSelLayer = L.layerGroup().addTo(plMap);
  plRecursosLayer = L.layerGroup().addTo(plMap);
  crearControlCapasPlanificador_();
}

/** Mapa base del Planificador: los mismos 2 sobrios del mapa principal (BASEMAPS, js/01: gris claro Esri con nombres / satélite
 *  con límites; 21-10-2026), alternados con el círculo de abajo a la derecha (`.pl-base-circ`). */
const PL_BASES_SOBRIAS = BASEMAPS;
function plBasemaps_() { return PL_BASES_SOBRIAS; }
let plBaseLayer_ = null, plBaseOverlay_ = null;
function plSetBasemap_(id) {
  const lista = plBasemaps_();
  const b = lista.find(x => x.id === id) || lista[0];
  if (plBaseLayer_) plMap.removeLayer(plBaseLayer_);
  if (plBaseOverlay_) { plMap.removeLayer(plBaseOverlay_); plBaseOverlay_ = null; }
  plBaseLayer_ = L.tileLayer(b.url, b.options).addTo(plMap);
  plBaseLayer_.bringToBack();
  if (b.overlayUrl) plBaseOverlay_ = L.tileLayer(b.overlayUrl, Object.assign({ pane: 'overlayPane', opacity: 0.85 }, b.overlayOptions || {})).addTo(plMap);
  state.pl.base = b.id;
  try { localStorage.setItem('pl_base2', b.id); } catch (e) {}
}

async function abrirPlanificador_() {
  initPlMap_();
  if (!state.pl.listeners) { state.pl.listeners = true; iniciarListenersPlanificador_(); }
  // Íconos por tipo (los mismos de "Recursos disponibles" y "Recursos de la comuna")
  if (!Object.keys(state.iconosPorTipoRecurso || {}).length) await cargarIconosRecursos_();
  await cargarTiposRecurso_();
  if (!state.pl.cargado) await cargarRecursosPlanificador_();
  if (!state.pl.abiertoAntes) { state.pl.abiertoAntes = true; state.pl.encuadrar = true; }   // 1ª vez: encuadra todos
  poblarAreasPlanificador_();
  renderPlanificador_();
}

async function cargarRecursosPlanificador_() {
  plEstado_('Cargando…', 'guardando');
  const [{ data, error }, rn] = await Promise.all([
    supabaseClient.from('v_planificador_recursos').select('*'),
    // Ruta del recurso = su ruta del escenario Normal (SQL 79), no las rutas SIGEI
    supabaseClient.from('v_recurso_ruta_normal').select('recurso_id, ruta_id, descripcion, tipo_recurso, km, geom_geojson'),
  ]);
  if (error) { plEstado_('Error: ' + error.message, 'error'); return; }
  state.pl.recursos = data || [];
  state.pl.rutaNormal = {};
  (rn.data || []).forEach(x => { state.pl.rutaNormal[x.recurso_id] = x; });
  if (rn.error) console.warn('v_recurso_ruta_normal (¿falta el SQL 79?):', rn.error.message);
  state.pl.cargado = true;
  plEstado_('Datos al día', 'ok');
}

async function refrescarRecursoPlanificador_(id) {
  const { data, error } = await supabaseClient.from('v_planificador_recursos').select('*').eq('id', id).maybeSingle();
  if (error || !data) return;
  const i = state.pl.recursos.findIndex(r => r.id === id);
  if (i >= 0) state.pl.recursos[i] = data; else state.pl.recursos.push(data);
}

/** Áreas que ve el usuario: Admin y perfiles de consulta, todas; Jefe de Área, las suyas. */
function plAreasVisibles_() {
  const nombres = {};
  state.pl.recursos.forEach(r => { if (r.id_area != null && !nombres[r.id_area]) nombres[r.id_area] = r.area; });
  let lista = Object.keys(nombres).map(id => ({ id: Number(id), nombre: nombres[id] }));
  const p = state.perfil && state.perfil.perfil;
  if (p !== 'Administrador' && esJefeAreaPerfil_(p)) {
    const mias = (state.misAreasIds || []).map(plNorm_);
    lista = lista.filter(a => mias.includes(plNorm_(a.nombre)));
  }
  return lista.sort((a, b) => String(a.nombre).localeCompare(String(b.nombre), 'es'));
}

function poblarAreasPlanificador_() {
  const sel = document.getElementById('pl-area');
  const todas = plAreasVisibles_();
  // Subgerencias de las áreas visibles (filtro superior)
  const subgDe = id => { const r = state.pl.recursos.find(x => x.id_area === id && x.subgerencia); return r ? r.subgerencia : ''; };
  const subgs = [...new Set(todas.map(a => subgDe(a.id)).filter(Boolean))].sort();
  const sSel = document.getElementById('pl-subg');
  if (state.pl.subg && !subgs.includes(state.pl.subg)) state.pl.subg = '';
  sSel.innerHTML = '<option value="">Todas las subgerencias</option>' + subgs.map(s => '<option value="' + escapeHtml_(s) + '">Subgerencia ' + escapeHtml_(s) + '</option>').join('');
  sSel.value = state.pl.subg;
  sSel.style.display = subgs.length > 1 ? '' : 'none';
  const areas = todas.filter(a => !state.pl.subg || subgDe(a.id) === state.pl.subg);
  if (state.pl.idArea != null && !areas.some(a => a.id === state.pl.idArea)) state.pl.idArea = null;
  if (state.pl.idArea == null && todas.length === 1) { state.pl.idArea = todas[0].id; state.pl.encuadrar = true; }
  // Sin área = TODOS los recursos visibles (13-10-2026)
  sel.innerHTML = '<option value="">Todas las áreas</option>' +
    areas.map(a => '<option value="' + a.id + '">' + escapeHtml_(a.nombre) + '</option>').join('');
  sel.value = state.pl.idArea != null ? String(state.pl.idArea) : '';
  if (state.pl.idArea != null && state.pl.rutas.length === 0) cargarRutasPlanificador_();
}

async function cargarRutasPlanificador_() {
  const idArea = state.pl.idArea;
  state.pl.rutas = [];
  if (idArea == null) return;
  const { data, error } = await supabaseClient.from('v_rutas_patrullaje')
    .select('id, nombre_ruta, alias, km, sector, area, id_area, id_ruta, geometry')
    .eq('id_area', idArea);
  if (state.pl.idArea !== idArea) return; // cambió el área mientras cargaba
  if (error) { plEstado_('No se pudieron cargar las rutas: ' + error.message, 'error'); return; }
  state.pl.rutas = (data || []).sort((a, b) => String(a.nombre_ruta || '').localeCompare(String(b.nombre_ruta || ''), 'es'));
  renderPlanificador_();
}

/** Recursos del área elegida o, sin área, TODOS los de las áreas visibles (filtrados por subgerencia). */
function plRecursosDelArea_() {
  if (state.pl.idArea != null) return state.pl.recursos.filter(r => r.id_area === state.pl.idArea);
  const ids = new Set(plAreasVisibles_().map(a => a.id));
  return state.pl.recursos.filter(r => ids.has(r.id_area) && (!state.pl.subg || r.subgerencia === state.pl.subg));
}

/** Gráfica del recurso en el mapa: punto de referencia y ruta del escenario Normal. */
function plCumpleGrafica_(r) {
  const g = state.pl.grafica;
  if (!g) return true;
  const punto = r.lat != null, ruta = !!plRutaNormal_(r);
  if (g === 'sinpunto') return !punto;
  if (g === 'sinruta') return !ruta;
  if (g === 'singrafica') return !punto || !ruta;
  if (g === 'completa') return punto && ruta;
  return true;
}

function plRecursosFiltrados_() {
  const q = normalizarBusqueda_(state.pl.q);
  return plRecursosDelArea_().filter(r =>
      (!state.pl.sector || r.sector === state.pl.sector)
      && (!(state.pl.tipos || []).length || state.pl.tipos.includes(r.tipo_recurso))   // ☑️ varios tipos (22-10-2026)
      && plCumpleGrafica_(r)
      && (!q || normalizarBusqueda_([r.alias, r.codigo_ref, r.tipo_recurso, r.sector, r.empresa, r.area, r.ruta1_nombre, r.ruta2_nombre].join(' ')).includes(q)))
    .sort((a, b) => compararTipoRecurso_(a.tipo_recurso, b.tipo_recurso)   // orden de tipos del sistema
                 || String(claveRecurso_(a) || '~').localeCompare(String(claveRecurso_(b) || '~'), 'es', { numeric: true }));
}

/** Referencia del recurso en todo el sistema: su CLAVE RADIAL (CLAVE del Excel, ej. "FRA6.1").
 *  Si no tiene, el ID (codigo_ref). */
function claveRecurso_(r) {
  if (!r) return '';
  return String(r.clave_radial || r.alias || r.recurso_ref_clave || r.codigo_ref || r.recurso_ref_codigo || '').trim();
}
/** «Clave radial · ID» (15-10-2026): referencia visible del recurso en mapas, listas y etiquetas.
 *  Sin clave → solo el ID; sin ID → solo la clave; ambos vacíos → ''. */
function claveIdTexto_(clave, id) {
  const c = String(clave || '').trim(), i = String(id || '').trim();
  return c && i && c.toUpperCase() !== i.toUpperCase() ? c + ' · ' + i : (c || i);
}
function claveIdRecurso_(r) {
  if (!r) return '';
  return claveIdTexto_(r.clave_radial || r.alias || r.recurso_ref_clave, r.codigo_ref || r.recurso_ref_codigo);
}

/** Llena un select de filtro y devuelve el valor vigente (vacío si ya no existe). */
function plOpcionesFiltro_(id, textoTodos, valores, actual) {
  const sel = document.getElementById(id);
  // Tipos de recurso: orden del sistema (Brigada Multipropósito, Disuasiva, Vigía Camioneta…)
  const lista = valores.slice().sort(id === 'pl-tipo' ? compararTipoRecurso_ : (a, b) => String(a).localeCompare(String(b), 'es'));
  sel.innerHTML = '<option value="">' + textoTodos + '</option>' +
    lista.map(v => '<option value="' + escapeHtml_(v) + '">' + escapeHtml_(v) + '</option>').join('');
  if (sel._msel) actualizarSel_(sel);   // selector múltiple: conserva lo elegido que siga existiendo
  else sel.value = lista.includes(actual) ? actual : '';
  return sel.value;
}

function renderPlanificador_() {
  const enArea = plRecursosDelArea_();
  state.pl.sector = plOpcionesFiltro_('pl-sector', 'Todos los sectores', [...new Set(enArea.map(r => r.sector).filter(Boolean))], state.pl.sector);
  state.pl.tipo = plOpcionesFiltro_('pl-tipo', 'Todos los tipos', [...new Set(enArea.map(r => r.tipo_recurso).filter(Boolean))].sort(compararTipoRecurso_), state.pl.tipo);
  state.pl.tipos = valoresSel_('pl-tipo');
  const lista = plRecursosFiltrados_();
  document.getElementById('pl-grafica').value = state.pl.grafica || '';
  renderKpisPlanificador_(enArea);
  renderListaPlanificador_(lista);
  renderMapaPlanificador_(lista);
  renderFichaPlanificador_();
  plActualizarCancelar_();
  // Capas de contexto: se cargan una vez por área (cargarCapasAreaPlanificador_ fija capasData.idArea al empezar)
  if (state.pl.capasData.idArea !== state.pl.idArea) cargarCapasAreaPlanificador_();
  else renderControlCapasPlanificador_();
  const btnNuevo = document.getElementById('pl-nuevo');
  // 13-10-2026: el Planificador gráfico ya no crea ni edita fichas (solo ruta y ubicación)
  if (btnNuevo) btnNuevo.style.display = 'none';
  plMarcarFiltros_();
}

/** Resalta los filtros en uso y muestra «✕ Limpiar filtros (n)». */
function plMarcarFiltros_() {
  // Jefe con una sola área: el área no cuenta como filtro (no se puede quitar)
  const areaFija = plAreasVisibles_().length === 1;
  const activos = [['pl-subg', !!state.pl.subg], ['pl-area', state.pl.idArea != null && !areaFija], ['pl-sector', !!state.pl.sector],
    ['pl-tipo', !!state.pl.tipo], ['pl-grafica', !!state.pl.grafica], ['pl-busqueda', !!(state.pl.q || '').trim()]];
  activos.forEach(([id, on]) => { const el = document.getElementById(id); if (el) el.classList.toggle('activo', on); });
  const n = activos.filter(([, on]) => on).length;
  const b = document.getElementById('pl-limpiar');
  if (b) { b.style.display = n ? '' : 'none'; document.getElementById('pl-limpiar-n').textContent = n; }
}
/** Quita todos los filtros del Planificador por Área (área vuelve a «Todas», salvo Jefe con una sola). */
function plLimpiarFiltros_() {
  if (state.pl.nuevo) cancelarNuevoRecursoPlanificador_();
  const antes = state.pl.idArea;
  state.pl.subg = ''; state.pl.sector = ''; state.pl.tipo = ''; state.pl.tipos = []; state.pl.grafica = ''; state.pl.q = '';
  state.pl.idArea = null; state.pl.selId = null; state.pl.preview = null; state.pl.encuadrar = true;
  document.getElementById('pl-busqueda').value = '';
  ['pl-sector', 'pl-tipo', 'pl-grafica'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  poblarAreasPlanificador_();   // repuebla subgerencia/área (Jefe con una sola área: queda esa)
  if (state.pl.idArea !== antes) { state.pl.rutas = []; plResetExtra_(); if (state.pl.idArea != null) cargarRutasPlanificador_(); }
  renderPlanificador_();
  mostrarToast_('Filtros quitados.');
}

function renderKpisPlanificador_(enArea) {
  const cont = document.getElementById('pl-kpis');
  // Resumen compacto en la barra (12-10-2026): chips en vez de tarjetas, para dar espacio al mapa.
  // Los de gráfica faltante son clicables: filtran los recursos sin punto / sin ruta.
  const completas = enArea.filter(r => plFaltantes_(r).length === 0).length;
  const conRuta = enArea.filter(r => plRutaNormal_(r)).length;
  const enTurno = enArea.filter(r => r.en_turno_hoy).length;
  const sinInicio = enArea.filter(r => !r.fecha_inicio_operacion).length;
  const sinUbic = enArea.filter(r => r.lat == null).length;
  const k = (ico, v, l, cls, filtro) => '<span class="pl-chip ' + (cls || '') + (filtro ? ' clic" data-plgraf="' + filtro : '') + '" title="' + l + (filtro ? ' · clic para verlos' : '') + '">' + ico + ' <b>' + v + '</b></span>';
  cont.innerHTML =
    k('📦', enArea.length, state.pl.idArea != null ? 'Recursos del área' : 'Recursos (todas las áreas visibles)') +
    k('✅', completas + '/' + enArea.length, 'Fichas completas', completas === enArea.length ? 'ok' : 'warn') +
    k('🛣️', conRuta + '/' + enArea.length, 'Con ruta (escenario Normal)', conRuta === enArea.length ? 'ok' : 'warn', conRuta < enArea.length ? 'sinruta' : '') +
    k('🟢', enTurno, 'En turno hoy', 'ok') +
    (sinInicio ? k('📅', sinInicio, 'Sin fecha de inicio', 'warn') : '') +
    (sinUbic ? k('📍', sinUbic, 'Sin gráfica: pendientes de ubicar en el mapa', 'mal', 'sinpunto') : '');
}

function renderListaPlanificador_(lista) {
  const cont = document.getElementById('pl-lista');
  if (!lista.length) { cont.innerHTML = '<div class="turnos-vacio">Ningún recurso coincide con los filtros.</div>'; return; }
  const todas = state.pl.idArea == null;
  cont.innerHTML = lista.map(r => {
    const falt = plFaltantes_(r);
    const rn = plRutaNormal_(r);
    const rutas = rn ? [(rn.descripcion || 'Ruta Normal') + (rn.km ? ' · ' + rn.km + ' km' : '')] : [];
    return '<button class="pl-item' + (r.id === state.pl.selId ? ' sel' : '') + '" data-id="' + r.id + '">' +
      '<span class="pl-dot" style="background:' + plColorTipo_(r.tipo_recurso) + '"></span>' +
      '<span class="pl-item-body">' +
        // Referencia = clave radial; el ID va pequeño al lado
        '<span class="pl-item-top"><span class="pl-clave">📻 ' + escapeHtml_(claveRecurso_(r) || 'Sin clave') + '</span>' +
          (r.codigo_ref && r.codigo_ref !== claveRecurso_(r) ? '<span class="pl-id">' + escapeHtml_(r.codigo_ref) + '</span>' : '') +
          (r.lat == null ? '<span class="pl-tag mal" title="No tiene punto en el mapa">📍 Sin gráfica</span>' : '') +
          (r.en_turno_hoy ? '<span class="pl-tag ok">En turno</span>' : '') +
          (falt.length
            ? '<span class="pl-tag warn" title="Falta: ' + escapeHtml_(falt.join(', ')) + '">Faltan ' + falt.length + '</span>'
            : '<span class="pl-tag ok">✓ Completa</span>') +
        '</span>' +
        '<span class="pl-item-sub">' + escapeHtml_(aTitulo_(r.tipo_recurso || 'Sin tipo')) + ' · ' + (todas ? escapeHtml_(r.area || '') + ' · ' : '') + escapeHtml_(r.sector || 'Sin sector') + '</span>' +
        '<span class="pl-item-sub">🛣️ ' + (rutas.length ? escapeHtml_(rutas.join(' / ')) : 'Sin ruta asociada') + '</span>' +
      '</span></button>';
  }).join('');
}


/** Clave radial del recurso sobre su ruta asociada (21-10-2026): misma etiqueta que el punto del recurso, en AZUL, en el vértice
 *  central de la ruta. Sigue el interruptor «Clave radial de los recursos» y la barra de opacidad del panel de capas. */
function plClaveEnRuta_(capa, r, esSel, grupo) {
  const clave = state.pl.claveRadial ? claveRecurso_(r) : '';
  if (!clave) return;
  const p = plPosEtiqueta_(capa); if (!p) return;
  L.marker(p, { interactive: false, keyboard: false, zIndexOffset: esSel ? 1050 : 50, pane: 'plEtq',
    icon: L.divIcon({ className: 'pl-clave-mapa ruta' + (esSel ? ' sel' : ''), iconSize: [0, 0], iconAnchor: [0, 9],
      html: '<span>' + escapeHtml_(clave) + '</span>' }) }).addTo(grupo);
}
function renderMapaPlanificador_(lista) {
  if (!plMap) return;
  plRutasLayer.clearLayers(); plSelLayer.clearLayers(); plRecursosLayer.clearLayers();
  const sel = plSeleccionado_();
  const editable = plPuedeEditar_(sel);
  const limites = [];
  const limitesSel = [];
  const geo = (txt) => { try { return typeof txt === 'string' ? JSON.parse(txt) : txt; } catch (e) { return null; } };

  // 1) Rutas SIGEI del área (contexto, gris punteado), 2) rutas Normal de los recursos,
  // 3) la ruta Normal del recurso elegido (azul gruesa), 4) puntos encima.
  const etiquetaRuta = ru => escapeHtml_(ru.nombre_ruta || ru.alias || 'Ruta') + (ru.km ? ' · ' + Number(ru.km).toFixed(1) + ' km' : '');
  const etiquetaNormal = rn => escapeHtml_(rn.descripcion || 'Ruta Normal') + (rn.km != null ? ' · ' + rn.km + ' km' : '');
  plAsignadasLayer.clearLayers();
  // Ruta del escenario Normal de CADA recurso de la lista (SQL 79). Clic = elegir el recurso.
  if (state.pl.capas.asignadas) {
    lista.forEach(r => {
      if (sel && r.id === sel.id) return;
      const rn = plRutaNormal_(r);
      const g = rn && geo(rn.geom_geojson);
      if (!g) return;
      const capa = L.geoJSON(g, { pane: 'plAsignadas', style: { color: '#2563EB', weight: 3.5, opacity: 0.7 } });
      capa.bindTooltip('<b>📻 ' + escapeHtml_(claveIdRecurso_(r) || aTitulo_(r.tipo_recurso || 'Recurso')) + '</b><br>' + etiquetaNormal(rn), { sticky: true });
      capa.on('click', () => seleccionarRecursoPlanificador_(r.id));
      capa._plEtq = rn.descripcion || claveRecurso_(r) || '';
      plAsignadasLayer.addLayer(capa);
      plClaveEnRuta_(capa, r, false, plAsignadasLayer);
    });
  }
  // Rutas SIGEI: solo contexto (ya no se asocian desde aquí)
  state.pl.rutas.forEach(ru => {
    if (!state.pl.capas.rutas || !ru.geometry) return;
    const capa = L.geoJSON(ru.geometry, { style: { color: '#475569', weight: 3, opacity: 0.55, dashArray: '6,5' } });
    capa.bindTooltip('SIGEI · ' + etiquetaRuta(ru), { sticky: true });
    capa._plEtq = ru.nombre_ruta || ru.alias || '';
    plRutasLayer.addLayer(capa);
    try { limites.push(capa.getBounds()); } catch (e) {}
  });
  // Ruta Normal del recurso elegido
  const rnSel = sel && plRutaNormal_(sel);
  const gSel = rnSel && geo(rnSel.geom_geojson);
  if (gSel) {
    const capa = L.geoJSON(gSel, { style: { color: '#2563EB', weight: 6, opacity: 0.95 } });
    capa.bindTooltip('Ruta (Normal): ' + etiquetaNormal(rnSel), { sticky: true });
    plSelLayer.addLayer(capa);
    plClaveEnRuta_(capa, sel, true, plSelLayer);
    try { limites.push(capa.getBounds()); limitesSel.push(capa.getBounds()); } catch (e) {}
  }

  // Recursos con la MISMA simbología que "Recursos disponibles" / "Recursos de la comuna"
  // del mapa principal (ícono del catálogo por tipo; si no hay, emoji con borde del color del tipo).
  // El elegido lleva un anillo y, si se puede editar, se arrastra para moverlo.
  lista.forEach(r => {
    if (r.lat == null || r.lng == null) return;
    const esSel = sel && r.id === sel.id;
    const arrastrable = !!(esSel && editable);
    if (esSel) {
      L.circleMarker([r.lat, r.lng], { radius: 27, color: '#2563EB', weight: 3, fill: true, fillColor: '#2563EB',
        fillOpacity: 0.12, interactive: false, className: 'pl-sel-anillo' }).addTo(plRecursosLayer);
    }
    const m = L.marker([r.lat, r.lng], {
      icon: construirIconoRecursoMaestro_(r, plColorTipo_(r.tipo_recurso)),
      draggable: arrastrable, zIndexOffset: esSel ? 1000 : 0,
    });
    m.bindTooltip('<b>📻 ' + escapeHtml_(claveRecurso_(r) || 'Sin clave') + '</b>' + (r.codigo_ref ? ' <small>' + escapeHtml_(r.codigo_ref) + '</small>' : '') + '<br>' + escapeHtml_(aTitulo_(r.tipo_recurso || '')) +
      (arrastrable ? '<br><i>Arrastra para moverlo · clic para la ficha</i>' : '<br><i>Clic para ver la ficha</i>'), { direction: 'top', offset: [0, -20] });
    // Clic en el ícono = abrir su ficha (modal). Si ya era el elegido (ficha oculta para moverlo), la reabre.
    m.on('click', () => {
      if (!esSel) { seleccionarRecursoPlanificador_(r.id); return; }
      state.pl.ocultarFicha = false; renderFichaPlanificador_();
    });
    if (arrastrable) m.on('dragend', () => { const ll = m.getLatLng(); moverPuntoPlanificador_(r.id, ll.lat, ll.lng); });
    plRecursosLayer.addLayer(m);
    // Clave radial bajo el ícono (fondo negro, letras verdes; se apaga en el panel de capas); sigue al ícono si se arrastra
    const clave = state.pl.claveRadial ? claveRecurso_(r) : '';
    if (clave) {
      const et = L.marker([r.lat, r.lng], { interactive: false, keyboard: false, zIndexOffset: esSel ? 1100 : 100,
        icon: L.divIcon({ className: 'pl-clave-mapa' + (esSel ? ' sel' : ''), iconSize: [0, 0], iconAnchor: [0, -16],
          html: '<span>' + escapeHtml_(clave) + '</span>' }) });
      plRecursosLayer.addLayer(et);
      if (arrastrable) m.on('drag', () => et.setLatLng(m.getLatLng()));
    }
    const b = L.latLngBounds([r.lat, r.lng], [r.lat, r.lng]);
    limites.push(b);
    if (esSel) limitesSel.push(b);
  });

  // Recurso nuevo en preparación: marcador provisional donde se hizo clic
  if (state.pl.nuevo && state.pl.nuevo.latlng) {
    L.marker(state.pl.nuevo.latlng, { zIndexOffset: 1200,
      icon: L.divIcon({ className: '', iconSize: [30, 30], iconAnchor: [15, 28], html: '<div class="pl-pin">📍</div>' }) })
      .bindTooltip('Nuevo recurso', { permanent: true, direction: 'top', offset: [0, -28] })
      .addTo(plRecursosLayer);
  }

  const unir = arr => arr.reduce((acc, b) => (acc ? acc.extend(b) : L.latLngBounds(b.getSouthWest(), b.getNorthEast())), null);
  if ((state.pl.encuadrar || state.pl.encuadrarSel) && (limites.length || limitesSel.length)) plMap.invalidateSize();   // tamaño real antes de encuadrar
  if (state.pl.encuadrar && limites.length) {
    plMap.fitBounds(unir(limites).pad(0.08));
    state.pl.encuadrar = false;
  } else if (state.pl.encuadrarSel && limitesSel.length) {
    plMap.fitBounds(unir(limitesSel).pad(0.25), { maxZoom: 14 });
    state.pl.encuadrarSel = false;
  }
  plRefrescarEtiquetas_();   // rutas redibujadas: rehacer sus etiquetas (js/05)
}

function renderFichaPlanificador_() {
  plActualizarCancelar_();
  const cont = document.getElementById('pl-ficha');
  // Ficha en ventana modal (12-10-2026). Se oculta mientras se ubica o se arrastra el punto en el mapa.
  const modal = document.getElementById('pl-ficha-modal');
  const mostrarModal = v => modal.classList.toggle('show', !!v);

  // Nuevo recurso: primero se ubica en el mapa; luego tipo + código y se crea.
  if (state.pl.nuevo) {
    mostrarModal(!!state.pl.nuevo.latlng);
    cont.style.display = 'flex';
    const ll = state.pl.nuevo.latlng;
    const tiposN = (state.tiposRecursoCatalogo || []).map(t => t.nombre);
    cont.innerHTML =
      '<div class="pl-ficha-head"><div style="min-width:0;"><div class="pl-ficha-titulo">➕ Nuevo recurso</div>' +
        '<div class="pl-ficha-meta">' + escapeHtml_(plNombreArea_() || '') + '</div></div>' +
        '<button class="wx-close" data-pl="cancelar-nuevo" title="Cancelar">✕</button></div>' +
      '<div class="pl-ficha-cuerpo">' +
        (ll
          ? '<div class="pl-aviso ok">📍 Ubicación: ' + ll.lat.toFixed(5) + ', ' + ll.lng.toFixed(5) + '</div>' +
            '<div class="pl-grid">' +
              '<div class="pl-campo full"><label>Tipo de recurso</label><select id="pl-n-tipo"><option value="">— Selecciona —</option>' +
                tiposN.map(t => '<option value="' + escapeHtml_(t) + '">' + escapeHtml_(aTitulo_(t)) + '</option>').join('') + '</select></div>' +
              '<div class="pl-campo full"><label>Código (ID, opcional)</label><input id="pl-n-codigo" placeholder="Ej.: BMP-0601"></div>' +
            '</div>' +
            '<div class="pl-aviso info">La comuna, subgerencia y región se completan solas según el área y el punto. El resto de la ficha se completa después de crearlo.</div>'
          : '<div class="pl-aviso info">📍 Haz clic en el mapa donde quedará el nuevo recurso.</div>') +
      '</div>' +
      (ll ? '<div class="pl-ficha-pie"><button class="turnos-btn" data-pl="cancelar-nuevo">Cancelar</button>' +
              '<button class="btn-primary" data-pl="crear" style="flex:1;padding:9px;">Crear recurso</button></div>' : '');
    return;
  }

  const r = plSeleccionado_();
  if (!r) { mostrarModal(false); cont.style.display = 'none'; cont.innerHTML = ''; return; }
  mostrarModal(!state.pl.ocultarFicha && !state.pl.ubicandoId);
  cont.style.display = 'flex';

  // Ficha SOLO DE CONSULTA (13-10-2026): en el Planificador gráfico solo se verifica la ruta
  // asociada y se corrige la ubicación del punto. Los datos se editan en Gestión de Recursos.
  const editable = plPuedeEditar_(r);   // aquí solo habilita mover / ubicar el punto
  const esc = v => escapeHtml_(v == null ? '' : String(v));
  const dato = (etq, v, cls) => '<div class="pl-campo' + (cls ? ' ' + cls : '') + '"><label>' + etq + '</label><div class="pl-dato">' +
    (v == null || String(v).trim() === '' ? '<span style="color:var(--text-tertiary);">—</span>' : esc(v)) + '</div></div>';
  const rutaN = plRutaNormal_(r);
  const inicio = r.fecha_inicio_operacion ? plFechaCorta_(String(r.fecha_inicio_operacion).slice(0, 10)) : '';

  cont.innerHTML =
    '<div class="pl-ficha-head"><div style="min-width:0;">' +
      '<div class="pl-ficha-titulo"><span class="pl-dot" style="display:inline-block;margin-right:7px;background:' + plColorTipo_(r.tipo_recurso) + '"></span>' +
        '📻 ' + esc(claveRecurso_(r) || 'Sin clave') + ' · ' + esc(aTitulo_(r.tipo_recurso || 'Sin tipo')) + '</div>' +
      '<div class="pl-ficha-meta">ID ' + esc(r.codigo_ref || '—') + ' · ' + esc(r.area) + ' · ' + esc(r.comuna || '—') + ' · Subgerencia ' + esc(r.subgerencia || '—') + '</div>' +
    '</div><button class="wx-close" data-pl="cerrar" title="Cerrar">✕</button></div>' +
    '<div class="pl-ficha-cuerpo">' +

      // 1) Ruta asociada (escenario Normal, SQL 79)
      '<div class="pl-seccion">🛣️ Ruta asociada (escenario Normal)</div><div class="pl-grid">' +
        (rutaN
          ? '<div class="pl-campo full"><div class="pl-aviso ok" style="margin:0;">✓ <b>' + esc(rutaN.descripcion || 'Ruta sin descripción') + '</b></div></div>' +
            dato('Longitud', rutaN.km != null ? rutaN.km + ' km' : '') +
            dato('Tipo en la ruta', aTitulo_(rutaN.tipo_recurso || '')) +
            (rutaN.geom_geojson ? '<div class="pl-campo full"><button class="turnos-btn" data-pl="ver-ruta" title="Cierra la ficha y encuadra la ruta (azul) y el punto del recurso">🔍 Ver ruta en el mapa</button></div>' : '')
          : '<div class="pl-campo full falta"><div class="pl-aviso warn" style="margin:0;">⚠️ <b>Sin ruta asociada.</b> Se asigna en <b>Mapa → Planificar → Escenario Normal</b>: al crear o editar la ruta, elige este recurso en «Recurso asociado».</div></div>') +
      '</div>' +

      // 2) Ubicación del punto (lo único que se modifica aquí)
      '<div class="pl-seccion">📍 Ubicación del recurso</div><div class="pl-grid">' +
        dato('Latitud / Longitud', r.lat != null ? Number(r.lat).toFixed(5) + ', ' + Number(r.lng).toFixed(5) : '') +
        dato('UTM 18S (X / Y)', r.coord_x != null ? Math.round(r.coord_x) + ' / ' + Math.round(r.coord_y) : '') +
        (r.lat == null
          ? '<div class="pl-campo full falta"><div class="pl-aviso warn" style="margin:0;">📍 <b>Pendiente de ubicar</b>: este recurso no tiene punto en el mapa.' +
              (editable ? '<button class="turnos-btn" data-pl="ubicar" style="display:block;margin-top:6px;">' +
                (state.pl.ubicandoId === r.id ? '✕ Cancelar' : '📍 Ubicar en el mapa') + '</button>' : '') + '</div></div>'
          : (editable ? '<div class="pl-campo full"><button class="turnos-btn" data-pl="mover-mapa" title="Cierra la ficha para arrastrar el ícono en el mapa">✋ Mover el punto en el mapa</button></div>' : '')) +
        (editable ? '' : '<div class="pl-campo full"><div class="pl-aviso info" style="margin:0;">🔒 Solo lectura: no puedes mover recursos de esta área.</div></div>') +
      '</div>' +

      // 3) Datos de referencia (solo lectura)
      '<div class="pl-seccion">Datos del recurso <small style="font-weight:600;text-transform:none;letter-spacing:0;color:var(--text-tertiary);">· solo consulta</small></div><div class="pl-grid">' +
        dato('Sector', r.sector) + dato('Empresa', r.empresa) +
        dato('Turno', aTitulo_(r.actividad || '')) + dato('Tipo de móvil', aTitulo_(r.tipo_movil || '')) +
        dato('Inicio de operación', inicio) + dato('Hoy', r.en_turno_hoy ? '🟢 En turno' : '⚪ Sin turno') +
        dato('Zona de alerta', r.zona_alerta, 'full') +
      '</div>' +
      (puedeGestionRecursos_()
        ? '<div class="pl-aviso info">✏️ Los datos del recurso se editan en <b>Planificador CMPC › Gestión de Recursos</b>.</div>'
        : '') +
    '</div>' +
    '<div class="pl-ficha-pie">' +
      (puedeGestionarTurnos_() ? '<button class="turnos-btn" data-pl="calendario">📅 Calendario</button>' : '') +
      (puedeGestionRecursos_() ? '<button class="turnos-btn" data-pl="gestion" title="Abrir este recurso en Gestión de Recursos">✏️ Editar datos</button>' : '') +
      '<button class="btn-primary" data-pl="cerrar" style="flex:1;padding:9px;">Cerrar</button></div>';
}

function seleccionarRecursoPlanificador_(id) {
  if (state.pl.clicUbicarRec && plMap) plMap.off('click', state.pl.clicUbicarRec);   // cancela un "Ubicar" pendiente
  state.pl.clicUbicarRec = null; state.pl.ubicandoId = null; state.pl.ocultarFicha = false;
  const mapaPl = document.getElementById('pl-map'); if (mapaPl) mapaPl.classList.remove('pl-ubicando');
  state.pl.selId = id;
  state.pl.moviendo = false;
  state.pl.preview = null;
  state.pl.encuadrarSel = true;
  // Carga optimizada (13-10-2026): primero la ficha (aparece al instante); la lista y el
  // mapa (que redibujan todos los íconos) se actualizan en el cuadro siguiente.
  renderFichaPlanificador_();
  plActualizarCancelar_();
  document.querySelectorAll('#pl-lista .pl-item').forEach(b => b.classList.toggle('sel', b.dataset.id === id));
  clearTimeout(state.pl.tRender);
  state.pl.tRender = setTimeout(() => {
    requestAnimationFrame(() => {
      const lista = plRecursosFiltrados_();
      renderMapaPlanificador_(lista);
      renderControlCapasPlanificador_();
    });
  }, 0);
}

async function guardarFichaPlanificador_() {
  const r = plSeleccionado_();
  if (!r || !plPuedeEditar_(r)) return;
  const val = id => { const el = document.getElementById(id); return el ? el.value.trim() : ''; };

  const tipo = val('pl-f-tipo');
  if (!tipo) { mostrarToast_('⚠️ Elige el tipo de recurso.'); return; }
  const cod = val('pl-f-cod');
  if (cod && !/^-?\d+$/.test(cod)) { mostrarToast_('⚠️ COD recurso debe ser un número entero.'); return; }

  const selSector = document.getElementById('pl-f-sector');
  const optSector = selSector ? selSector.selectedOptions[0] : null;
  const datos = {
    codigo_ref: val('pl-f-codigo'), cod_recurso: cod, tipo_recurso: tipo,
    temporada: val('pl-f-temporada'), actualizado: val('pl-f-actualizado'), empresa: val('pl-f-empresa'),
    // zona_alerta NO se envía: la calcula la base según el punto del recurso (SQL 126, 19-10-2026)
    actividad: val('pl-f-actividad').toUpperCase(), tipo_movil: val('pl-f-movil').toUpperCase(),
    sector: selSector ? selSector.value : '',
  };
  if (optSector && optSector.dataset.id) datos.id_sector = optSector.dataset.id;
  const fecha = val('pl-f-inicio') || null;
  const fechaActual = r.fecha_inicio_operacion ? String(r.fecha_inicio_operacion).slice(0, 10) : null;

  const btn = document.querySelector('#pl-ficha [data-pl="guardar"]');
  if (btn) btn.disabled = true;
  plEstado_('Guardando…', 'guardando');
  try {
    let res = await supabaseClient.rpc('guardar_ficha_recurso', { p_recurso_id: r.id, p_datos: datos });
    if (res.error) throw res.error;
    // (La ruta ya no se guarda aquí: es la ruta del escenario Normal, enlazada en Planificar.)

    if (fecha !== fechaActual) {
      // Primero sin borrar: si hay turnos antes de la nueva fecha, se pregunta.
      res = await supabaseClient.rpc('actualizar_inicio_recurso', { p_recurso_id: r.id, p_fecha: fecha, p_borrar_previos: false });
      if (res.error && /turno\(s\) antes/i.test(res.error.message || '')) {
        if (!confirm(res.error.message.replace('Marca la opción de eliminarlos para continuar.', '') + '\n\n¿Eliminar esos turnos y guardar la nueva fecha de inicio?')) {
          throw new Error('Fecha de inicio no guardada (el resto de la ficha sí).');
        }
        res = await supabaseClient.rpc('actualizar_inicio_recurso', { p_recurso_id: r.id, p_fecha: fecha, p_borrar_previos: true });
      }
      if (res.error) throw res.error;
    }

    state.pl.preview = null;
    await refrescarRecursoPlanificador_(r.id);
    plEstado_('Ficha guardada', 'ok');
    mostrarToast_('✅ Ficha de ' + (claveRecurso_(r) || 'recurso') + ' guardada.');
  } catch (e) {
    plEstado_('Error al guardar', 'error');
    mostrarToast_('No se pudo guardar: ' + (e.message || e));
    await refrescarRecursoPlanificador_(r.id);
  }
  renderPlanificador_();
}

async function moverPuntoPlanificador_(id, lat, lng) {
  if (!confirm('¿Guardar el nuevo punto de referencia de este recurso?\n\nTambién cambia su ubicación en la capa "Recursos disponibles" del mapa.')) {
    state.pl.moviendo = false; state.pl.ocultarFicha = false; renderPlanificador_(); return;
  }
  state.pl.ocultarFicha = false;   // al terminar se vuelve a mostrar la ficha con el punto nuevo
  plEstado_('Guardando punto…', 'guardando');
  const { error } = await supabaseClient.rpc('mover_recurso_referencia', { p_recurso_id: id, p_lat: lat, p_lng: lng });
  state.pl.moviendo = false;
  if (error) { plEstado_('Error al mover', 'error'); mostrarToast_('No se pudo mover: ' + error.message); renderPlanificador_(); return; }
  await refrescarRecursoPlanificador_(id);
  plEstado_('Punto actualizado', 'ok');
  renderPlanificador_();
}

/** Recurso sin punto (pendiente de ubicar): un clic en el mapa le asigna su punto de referencia. */
function ubicarRecursoPlanificador_() {
  const r = plSeleccionado_();
  if (!r || !plPuedeEditar_(r) || !plMap) return;
  const mapa = document.getElementById('pl-map');
  if (state.pl.clicUbicarRec) plMap.off('click', state.pl.clicUbicarRec);
  if (state.pl.ubicandoId === r.id) {          // segundo clic en el botón = cancelar
    state.pl.ubicandoId = null; state.pl.clicUbicarRec = null;
    mapa.classList.remove('pl-ubicando'); renderFichaPlanificador_(); return;
  }
  state.pl.ubicandoId = r.id;
  mapa.classList.add('pl-ubicando');
  mostrarToast_('📍 Haz clic en el mapa donde queda ' + (claveRecurso_(r) || 'el recurso') + ' (Esc para cancelar).');
  state.pl.clicUbicarRec = (e) => {
    state.pl.clicUbicarRec = null; state.pl.ubicandoId = null;
    mapa.classList.remove('pl-ubicando');
    moverPuntoPlanificador_(r.id, e.latlng.lat, e.latlng.lng);
  };
  plMap.once('click', state.pl.clicUbicarRec);
  renderFichaPlanificador_();
}

function abrirCalendarioDesdePlanificador_() {
  const r = plSeleccionado_();
  if (!r) return;
  // El selector del calendario usa los nombres de su catálogo / perfil_areas (pueden venir sin tilde).
  const areas = state.perfil.perfil === 'Administrador' ? (state.areasCatalogo || []) : (state.misAreasIds || []);
  const igual = areas.find(a => plNorm_(a) === plNorm_(r.area));
  if (igual) state.turnosArea = igual;
  mostrarVista_('turnos');
}

