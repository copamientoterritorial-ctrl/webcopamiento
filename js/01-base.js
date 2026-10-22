
// (diagnóstico removido)
/* ============================================================
 * SIG COPAMIENTO TERRITORIAL — CLIENTE (Supabase)
 * PASO 2: login (paso 1) + mapa real, capas geográficas y visualización
 * de recursos. Crear/editar recursos, admin de usuarios, meteorología y
 * Windy quedan para los siguientes pasos.
 * ============================================================ */

// Flag de depuración: OFF en producción. Actívalo temporalmente desde la
// consola del navegador con: window.__DEBUG__ = true
window.__DEBUG__ = false;

// BUILD: etiquetas-v3-20260915
  const SUPABASE_URL = 'https://dgcnshdmmnjvucdkzpqb.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRnY25zaGRtbW5qdnVjZGt6cHFiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY3MTE2MjMsImV4cCI6MjEwMjI4NzYyM30.NmleQocIOF6XLsBySnh8sMEKpFhx5MSHZJNDacLZvkY';

// Adaptador de almacenamiento: respeta el checkbox "Recordar sesión".
// Marcado -> localStorage (persiste aunque cierres el navegador).
// Desmarcado -> sessionStorage (se borra al cerrar la pestaña/navegador).
const storageAdapter = {
  getItem: (key) => localStorage.getItem(key) || sessionStorage.getItem(key),
  setItem: (key, value) => {
    const chk = document.getElementById('login-remember');
    const recordar = chk ? chk.checked : true;
    if (recordar) {
      localStorage.setItem(key, value);
      sessionStorage.removeItem(key);
    } else {
      sessionStorage.setItem(key, value);
      localStorage.removeItem(key);
    }
  },
  removeItem: (key) => {
    localStorage.removeItem(key);
    sessionStorage.removeItem(key);
  },
};

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { storage: storageAdapter, persistSession: true, autoRefreshToken: true },
});

const VISTA_INICIAL_CHILE = { lat: -38.0, lng: -72.5, zoom: 6 };
const TEMPORADA_PALETTE = ['#EF4444','#F59E0B','#94A3B8','#3B82F6','#7C3AED','#059669'];

let state = {
  user: null,
  perfil: null,
  instituciones: [],
  comunas: [],
  misComunaIds: [],
  activeComunaId: null,
  recursos: [],
  periodos: [],
  periodoLayersOn: {},
  layersOn: { __areasPobladas: false },
  editorMode: false,
  modoPlanificacion: null,
  modoRecursosArea: null,
  dibujoModo: 'punto',
  pendingLatLng: null,
  pendingLineaPuntos: null,
  pendingAreaPuntos: null,
  editingIdPlan: null,
  activeBasemapId: 'sobrio',
  activeTab: 'capas',
  areasPobladasInfo: { ok: false, matched: false, count: 0 },
  areasLayersOn: { fundosCmpc: false, areaRelacionamiento: false, recursosDisponibles: false },
  patrullajeLayerOn: false,
  limiteComunalOn: true,
  patrullajeInfo: { ok: false, count: 0, cargado: false },
  patrullajeRutas: [],
  alertaLayersOn: { verde: false, amarilla: false, roja: false },
  mostrarEtiquetasFundos: false,
  mostrarEtiquetasRecursosArea: false,
  fundosCmpcInfo: { ok: false, count: 0 },
  areaRelacionamientoInfo: { ok: false, count: 0 },
  temporadasDetectadas: [],
  focosPorTemporada: {},      // { '2025-2026': [[lng,lat], ...] }
  incendiosMatched: true,
};

/* Mapas base (21-10-2026): solo los 2 sobrios del visor de Agricultores, más livianos y sin tanto detalle. Se alternan con el
 * círculo de abajo a la izquierda (crearCirculoMapaBase_). Los usa también el Planificador gráfico (PL_BASES_SOBRIAS, js/04). */
const BASEMAPS = [
  { id:'sobrio', nombre:'Mapa sobrio (gris claro)', color:'#E5E7EB',
    url:'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}',
    options:{ attribution:'Tiles &copy; Esri', maxZoom:19, maxNativeZoom:16 },
    overlayUrl:'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}',
    overlayOptions:{ maxZoom:19, maxNativeZoom:16, opacity:1 } },
  { id:'sat_sobrio', nombre:'Satélite con nombres', color:'#3A4A2E',
    url:'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    options:{ attribution:'Imágenes &copy; Esri', maxZoom:19, maxNativeZoom:18 },
    overlayUrl:'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
    overlayOptions:{ maxZoom:19, maxNativeZoom:18, opacity:1 } },
];
/** Vista previa (mosaico de La Araucanía) de un mapa base, para los círculos de cambio de mapa. */
function fondoVistaPreviaBase_(b) {
  const tile = u => u.replace('{z}/{y}/{x}', '10/629/305');
  return (b.overlayUrl ? 'url("' + tile(b.overlayUrl) + '"), ' : '') + 'url("' + tile(b.url) + '")';
}
/** Círculo del mapa principal: muestra el OTRO mapa base y cambia con un clic. Desde 21-10-2026 va arriba a la derecha, en la
 *  columna de controles bajo el zoom (antes abajo a la izquierda, junto al panel lateral y la barra de dibujo). */
function crearCirculoMapaBase_() {
  const Ctrl = L.Control.extend({
    options: { position: 'topright' },
    onAdd() {
      const b = L.DomUtil.create('button', 'pl-base-circ base-circ-principal');
      b.id = 'base-circ'; b.type = 'button';
      L.DomEvent.disableClickPropagation(b);
      b.addEventListener('click', () => setBasemap(state.activeBasemapId === 'sat_sobrio' ? 'sobrio' : 'sat_sobrio'));
      return b;
    },
  });
  new Ctrl().addTo(map);
}
function renderCirculoMapaBase_() {
  const c = document.getElementById('base-circ'); if (!c) return;
  const otro = BASEMAPS.find(x => x.id !== state.activeBasemapId) || BASEMAPS[0];
  c.style.backgroundImage = fondoVistaPreviaBase_(otro);
  c.title = 'Cambiar a ' + (otro.id === 'sat_sobrio' ? 'satélite' : 'mapa');
  c.innerHTML = '<span>' + (otro.id === 'sat_sobrio' ? 'Satélite' : 'Mapa') + '</span>';
}

/* ============ MAPA ============ */
/* Zoom fino.
 *   zoomSnap 0.25  -> el mapa puede quedar en niveles intermedios (12.25, 12.5)
 *                     en vez de saltar de entero en entero.
 *   zoomDelta 0.25 -> cada clic en + o − avanza un cuarto de nivel.
 *   wheelPxPerZoomLevel 200 -> hay que girar bastante más la rueda para
 *                     completar un nivel, así el acercamiento es gradual.
 * Con esto el salto visual al acercar o alejar deja de ser brusco, que es
 * lo que descolocaba en las reuniones al pasar de la comuna al detalle.
 */
const map = L.map('map', {
  zoomControl: false,
  attributionControl: true,
  zoomSnap: 0.25,
  zoomDelta: 0.25,
  wheelPxPerZoomLevel: 200,
  wheelDebounceTime: 45,
}).setView([VISTA_INICIAL_CHILE.lat, VISTA_INICIAL_CHILE.lng], VISTA_INICIAL_CHILE.zoom);
const controlZoomMapa = L.control.zoom({ position:'topright' }).addTo(map);   // zona A3, sobre la regla
// Botón ⌂ en la misma barra del + / −: restablece el encuadre de la comuna o área activa (11-10-2026)
(function agregarBotonRestablecerZoom_() {
  const barra = controlZoomMapa.getContainer();
  const btn = L.DomUtil.create('a', 'leaflet-control-zoom-reset', barra);
  btn.href = '#'; btn.title = 'Restablecer zoom (ver la comuna / área completa)';
  btn.setAttribute('role', 'button'); btn.setAttribute('aria-label', 'Restablecer zoom');
  btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;"><path d="M3 9.5 12 3l9 6.5"/><path d="M5 10v10h14V10"/></svg>';
  L.DomEvent.disableClickPropagation(btn);
  L.DomEvent.on(btn, 'click', (ev) => { L.DomEvent.preventDefault(ev); restablecerZoomMapa_(); });
})();
/* 🔍 Lupas y vista anterior (21-10-2026), en la barra + / − de un mapa:
 *   · Lupa + : clic = acercar en ese punto; arrastrar = acercar al rectángulo dibujado.
 *   · Lupa − : clic = alejar en ese punto; arrastrar = la vista actual cabe dentro del rectángulo (cuanto más chico, más se aleja).
 *   · ↶ Vista anterior: vuelve a los encuadres previos (hasta 30).
 * La lupa queda activa hasta otro clic en ella o Esc; mientras está activa, el mapa no se arrastra y los clics no llegan a las
 * herramientas del mapa (dibujo, fichas). */
function agregarLupasZoom_(m, barra) {
  const L_ = { modo: null, hist: [], navegando: false, ini: null, caja: null };
  m._lupas = L_;
  const svgLupa = signo => '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" style="vertical-align:middle;">' +
    '<circle cx="10.5" cy="10.5" r="6.5"/><line x1="15.5" y1="15.5" x2="21" y2="21"/><line x1="7.5" y1="10.5" x2="13.5" y2="10.5"/>' +
    (signo === '+' ? '<line x1="10.5" y1="7.5" x2="10.5" y2="13.5"/>' : '') + '</svg>';
  const boton = (clase, titulo, html, fn) => {
    const b = L.DomUtil.create('a', 'leaflet-control-zoom-lupa ' + clase, barra);
    b.href = '#'; b.title = titulo; b.setAttribute('role', 'button'); b.setAttribute('aria-label', titulo); b.innerHTML = html;
    L.DomEvent.disableClickPropagation(b);
    L.DomEvent.on(b, 'click', ev => { L.DomEvent.preventDefault(ev); fn(); });
    return b;
  };
  const bIn = boton('lupa-mas', 'Lupa para acercar: clic en un punto o arrastra un rectángulo (Esc para salir)', svgLupa('+'), () => activar('in'));
  const bOut = boton('lupa-menos', 'Lupa para alejar: clic en un punto o arrastra un rectángulo (Esc para salir)', svgLupa('-'), () => activar('out'));
  const bAtras = boton('lupa-atras', 'Vista anterior', '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;"><path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/></svg>', vistaAnterior);
  const cont = m.getContainer();
  function activar(modo) {
    const antes = L_.modo;
    L_.modo = L_.modo === modo ? null : modo;
    if (!antes && L_.modo) L_.arrastreAntes = m.dragging.enabled();   // se devuelve tal cual al salir de la lupa
    cont.classList.toggle('modo-lupa-in', L_.modo === 'in');
    cont.classList.toggle('modo-lupa-out', L_.modo === 'out');
    bIn.classList.toggle('activa', L_.modo === 'in'); bOut.classList.toggle('activa', L_.modo === 'out');
    if (L_.modo) m.dragging.disable(); else if (L_.arrastreAntes !== false) m.dragging.enable();
  }
  function actualizarAtras() { bAtras.classList.toggle('deshab', L_.hist.length < 2); }
  function vistaAnterior() {
    if (L_.hist.length < 2) return;
    L_.hist.pop();
    const v = L_.hist[L_.hist.length - 1];
    L_.navegando = true;
    m.flyTo(v.c, v.z, { duration: 0.45 });
    actualizarAtras();
  }
  m.on('moveend', () => {
    if (L_.navegando) { L_.navegando = false; return; }
    const v = { c: m.getCenter(), z: m.getZoom() }, u = L_.hist[L_.hist.length - 1];
    if (u && u.z === v.z && u.c.distanceTo(v.c) < 1) return;
    L_.hist.push(v); if (L_.hist.length > 30) L_.hist.shift();
    actualizarAtras();
  });
  actualizarAtras();
  const enControl = e => !!(e.target.closest && e.target.closest('.leaflet-control, .leaflet-popup'));
  // Fase de captura: la lupa toma el clic antes que Leaflet y las herramientas del mapa
  cont.addEventListener('mousedown', e => {
    if (!L_.modo || e.button !== 0 || enControl(e)) return;
    e.stopPropagation(); e.preventDefault();
    L_.ini = m.mouseEventToContainerPoint(e);
    L_.caja = L.DomUtil.create('div', 'lupa-caja ' + (L_.modo === 'out' ? 'alejar' : ''), cont);
    Object.assign(L_.caja.style, { left: L_.ini.x + 'px', top: L_.ini.y + 'px', width: '0px', height: '0px' });
  }, true);
  cont.addEventListener('mousemove', e => {
    if (!L_.ini) return;
    e.stopPropagation();
    const p = m.mouseEventToContainerPoint(e);
    Object.assign(L_.caja.style, { left: Math.min(p.x, L_.ini.x) + 'px', top: Math.min(p.y, L_.ini.y) + 'px',
      width: Math.abs(p.x - L_.ini.x) + 'px', height: Math.abs(p.y - L_.ini.y) + 'px' });
  }, true);
  const terminar = e => {
    if (!L_.ini) return;
    e.stopPropagation();
    const p = m.mouseEventToContainerPoint(e), a = L_.ini;
    L_.ini = null; if (L_.caja) { L_.caja.remove(); L_.caja = null; }
    const w = Math.abs(p.x - a.x), h = Math.abs(p.y - a.y);
    if (w < 8 && h < 8) {   // clic: un nivel en ese punto
      m.setZoomAround(m.containerPointToLatLng(p), m.getZoom() + (L_.modo === 'out' ? -1 : 1));
      return;
    }
    const caja = L.latLngBounds(m.containerPointToLatLng(L.point(Math.min(a.x, p.x), Math.max(a.y, p.y))),
                                m.containerPointToLatLng(L.point(Math.max(a.x, p.x), Math.min(a.y, p.y))));
    if (L_.modo === 'in') { m.fitBounds(caja); return; }
    const t = m.getSize(), escala = Math.min(t.x / w, t.y / h);
    m.setView(caja.getCenter(), Math.max(m.getMinZoom(), m.getZoom() - Math.log2(escala)));
  };
  cont.addEventListener('mouseup', terminar, true);
  cont.addEventListener('mouseleave', e => { if (L_.ini) terminar(e); });
  // El clic que sigue al mouseup no debe llegar a las herramientas del mapa
  cont.addEventListener('click', e => { if (L_.modo && !enControl(e)) { e.stopPropagation(); e.preventDefault(); } }, true);
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && L_.modo) activar(L_.modo); });
}
agregarLupasZoom_(map, controlZoomMapa.getContainer());

function restablecerZoomMapa_() {
  let b = null;
  const sumar = (capa) => {
    try { const bb = capa.getBounds(); if (bb && bb.isValid()) b = b ? b.extend(bb) : L.latLngBounds(bb.getSouthWest(), bb.getNorthEast()); } catch (e) {}
  };
  if (state.areaActiva && window.limitesPorComuna && Object.keys(window.limitesPorComuna).length) {
    Object.values(window.limitesPorComuna).forEach(sumar);          // modo área: todas sus comunas
  }
  if (!b && limiteLayer && limiteLayer.getLayers().length) sumar(limiteLayer);   // comuna activa
  if (!b && window.limitesPorComuna && state.activeComunaId && window.limitesPorComuna[state.activeComunaId]) sumar(window.limitesPorComuna[state.activeComunaId]);
  map.closePopup();
  if (b) map.flyToBounds(b, { padding: [40, 40], duration: 0.6 });
  else map.flyTo([VISTA_INICIAL_CHILE.lat, VISTA_INICIAL_CHILE.lng], VISTA_INICIAL_CHILE.zoom, { duration: 0.6 });
}

let currentBaseLayer = null;
function setBasemap(basemapId) {
  const cfg = BASEMAPS.find(b => b.id === basemapId) || BASEMAPS[0];
  if (currentBaseLayer) map.removeLayer(currentBaseLayer);
  if (window.currentBaseOverlay) { map.removeLayer(window.currentBaseOverlay); window.currentBaseOverlay = null; }
  currentBaseLayer = L.tileLayer(cfg.url, cfg.options).addTo(map);
  // Overlay opcional (ej. capa de rutas/transporte encima del fondo)
  if (cfg.overlayUrl) {
    window.currentBaseOverlay = L.tileLayer(cfg.overlayUrl, cfg.overlayOptions || cfg.options).addTo(map);
    window.currentBaseOverlay.bringToFront();
  }
  state.activeBasemapId = cfg.id;
  renderBasemapPanel();
  renderCirculoMapaBase_();
}

// Pane propio para los límites comunales: SIEMPRE al fondo de todas las capas
// del sistema (overlayPane = 400, Red Vial = 380/381) y sobre el mapa base (200).
map.createPane('limitesPane').style.zIndex = 350;
const limiteLayer = L.geoJSON(null, { pane: 'limitesPane', style:{ color:'#0F172A', weight:2, fillOpacity:0.02 } }).addTo(map);
// Límites de TODAS las comunas del usuario (cuando tiene varias). El activo va resaltado.
const limitesMultiLayer = L.layerGroup();
window.limitesPorComuna = {}; // comuna_id -> capa
const areasPobladasLayer = L.layerGroup();
const fundosCmpcLayer = L.layerGroup();
const fundosAraucoLayer = L.layerGroup();
const comitePuntosLayer = L.layerGroup();
const comiteAreasLayer = L.layerGroup();
// Ícono manito (Red de Prevención Comunitaria)
const iconoManito = L.icon({ iconUrl: 'iconos/manito_red_prevencion.png', iconSize: [20, 20], iconAnchor: [10, 10], popupAnchor: [0, -10] });
const areaRelacionamientoLayer = L.layerGroup();
const recursosDisponiblesAreaLayer = L.layerGroup();
const patrullajeLayer = L.layerGroup();
// Capas SOLO para Administrador: recursos y rutas filtrados por comuna activa
const recursosComunaAdminLayer = L.layerGroup();
const rutasComunaAdminLayer = L.layerGroup();
let recursosComunaAdminFeatureLayers = [];
const rutasEnAlertaLayer = L.layerGroup().addTo(map);
const asignacionLayer = L.layerGroup();
const fireHeatLayers = {};
const incendiosContainerLayer = L.layerGroup().addTo(map);
const recursosMarkersById = {};
const planificacionRecursosVerdeLayer    = L.layerGroup();
const planificacionRecursosAmarillaLayer = L.layerGroup();
const planificacionRecursosRojaLayer     = L.layerGroup();
/* Áreas de influencia: una capa por escenario. Se dibujan por debajo de
   las figuras para que no tapen los recursos ni sus etiquetas. */
const influenciaVerdeLayer    = L.layerGroup();
const influenciaAmarillaLayer = L.layerGroup();
const influenciaRojaLayer     = L.layerGroup();
const periodoLayers = {}; // { [periodoId|'sin_periodo']: L.layerGroup }
const periodoFeatureLayers = {}; // { [periodoId]: [{layer, nombre}] } — para toggle etiquetas

/* ============ ARRANQUE ============ */
window.addEventListener('load', async () => {
  crearCirculoMapaBase_();
  setBasemap('sobrio');
  bindEvents();

  const { data: { session } } = await supabaseClient.auth.getSession();
  if (session) {
    await bootstrap(session.user);
  } else {
    showLogin();
  }
});

function showLogin() {
  document.getElementById('loading-overlay').style.display = 'none';
  document.getElementById('login-overlay').style.display = 'flex';
  avisoCierreInactividad_();   // ⏳ si la sesión anterior se cerró por inactividad
}

function showLoading(texto) {
  document.getElementById('loading-overlay-text').textContent = texto || 'Cargando…';
  document.getElementById('loading-overlay').style.display = 'flex';
}

/* ============ LOGIN ============ */
async function doLogin() {
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const errEl = document.getElementById('login-error');
  errEl.classList.remove('show');

  if (!email || !password) {
    errEl.textContent = 'Ingresa tu correo y contraseña.';
    errEl.classList.add('show');
    return;
  }

  const btn = document.getElementById('btn-login');
  btn.textContent = 'Ingresando…';
  btn.disabled = true;

  const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });

  btn.textContent = 'Ingresar';
  btn.disabled = false;

  if (error) {
    errEl.textContent = error.message === 'Invalid login credentials'
      ? 'Correo o contraseña incorrectos.'
      : error.message;
    errEl.classList.add('show');
    return;
  }

  await bootstrap(data.user);
}

/* ============ BOOTSTRAP ============ */
async function bootstrap(authUser) {
  showLoading('Cargando tu perfil…');
  document.getElementById('login-overlay').style.display = 'none';

  const { data: perfil, error: perfilErr } = await supabaseClient
    .from('perfiles')
    .select('*')
    .eq('id', authUser.id)
    .single();

  if (perfilErr || !perfil) {
    await supabaseClient.auth.signOut();
    showLogin();
    mostrarErrorLogin_('No se encontró tu perfil en el sistema. Contacta a un Administrador.');
    return;
  }
  if (perfil.estado === 'inactivo') {
    await supabaseClient.auth.signOut();
    showLogin();
    mostrarErrorLogin_('Tu cuenta está inactiva. Contacta a un Administrador.');
    return;
  }

  state.user = authUser;
  state.perfil = perfil;
  // "Ver como…" (solo Administrador): reemplaza el perfil por el simulado antes de armar la interfaz.
  aplicarSimulacionPerfil_(perfil);

  if (perfil.debe_cambiar_clave) {
    document.getElementById('loading-overlay').style.display = 'none';
    document.getElementById('force-password-overlay').style.display = 'flex';
    return;
  }

  await cargarCatalogosYEntrar();
}

function mostrarErrorLogin_(msg) {
  const errEl = document.getElementById('login-error');
  errEl.textContent = msg;
  errEl.classList.add('show');
}

/* ============ CAMBIO DE CONTRASEÑA OBLIGATORIO ============ */
async function doForcePasswordChange() {
  const nueva = document.getElementById('fp-nueva').value;
  const confirmar = document.getElementById('fp-confirmar').value;
  const errEl = document.getElementById('fp-error');
  errEl.classList.remove('show');

  if (nueva.length < 8) { errEl.textContent = 'La nueva contraseña debe tener al menos 8 caracteres.'; errEl.classList.add('show'); return; }
  if (nueva !== confirmar) { errEl.textContent = 'Las contraseñas no coinciden.'; errEl.classList.add('show'); return; }

  const btn = document.getElementById('btn-force-password');
  btn.textContent = 'Guardando…'; btn.disabled = true;

  const { error: updateErr } = await supabaseClient.auth.updateUser({ password: nueva });
  if (updateErr) {
    btn.textContent = 'Guardar y continuar'; btn.disabled = false;
    errEl.textContent = updateErr.message; errEl.classList.add('show');
    return;
  }
  await supabaseClient.rpc('marcar_clave_cambiada');
  state.perfil.debe_cambiar_clave = false;
  btn.textContent = 'Guardar y continuar'; btn.disabled = false;
  await cargarCatalogosYEntrar();
}

/* ============ CAMBIO DE CONTRASEÑA (self-service) ============ */
async function doChangePasswordSelfService() {
  const nueva = document.getElementById('cp-nueva').value;
  const confirmar = document.getElementById('cp-confirmar').value;
  const errEl = document.getElementById('cp-error');
  errEl.classList.remove('show');

  if (nueva.length < 8) { errEl.textContent = 'La nueva contraseña debe tener al menos 8 caracteres.'; errEl.classList.add('show'); return; }
  if (nueva !== confirmar) { errEl.textContent = 'Las contraseñas no coinciden.'; errEl.classList.add('show'); return; }

  const btn = document.getElementById('btn-save-cp');
  btn.textContent = 'Guardando…'; btn.disabled = true;

  const { error } = await supabaseClient.auth.updateUser({ password: nueva });

  btn.textContent = 'Guardar'; btn.disabled = false;
  if (error) { errEl.textContent = error.message; errEl.classList.add('show'); return; }

  document.getElementById('change-password-overlay').classList.remove('show');
  document.getElementById('cp-nueva').value = '';
  document.getElementById('cp-confirmar').value = '';
  mostrarToast_('Contraseña actualizada correctamente.');
}

/* ============ CATÁLOGOS + ENTRADA AL SISTEMA ============ */
async function cargarCatalogosYEntrar() {
  showLoading('Cargando catálogos…');

  const [{ data: comunas }, { data: instituciones }, { data: areasCatalogo }, { data: favoritos }] = await Promise.all([
    supabaseClient.from('comunas').select('id, id_comuna, region, provincia, comuna').order('comuna'),
    supabaseClient.from('instituciones').select('id, nombre, color_hex, icono_key, logo_url').eq('estado', 'activo').order('nombre'),
    supabaseClient.from('areas_relacionamiento_catalogo').select('area').order('area'),
    supabaseClient.from('perfil_favoritos').select('comuna_id').eq('perfil_id', state.user.id),
  ]);

  state.comunas = comunas || [];
  state.instituciones = instituciones || [];
  state.areasCatalogo = (areasCatalogo || []).map(a => a.area);
  state.comunasFavoritas = new Set((favoritos || []).map(f => f.comuna_id));

  // Cargar íconos personalizados en segundo plano (NO bloquea el arranque)
  // Al terminar (íconos ya recortados), se redibuja Recursos disponibles si alcanzó a pintarse con los originales.
  cargarIconosRecursos_().then(() => {
    if (typeof recursosDisponiblesAreaLayer !== 'undefined' && recursosDisponiblesAreaLayer.getLayers().length) loadRecursosDisponiblesAreaLayer_().catch(() => {});
  }).catch(() => {});

  // Cargar el catálogo de tipos de recurso (tabla tipos_recurso) en segundo plano.
  // Se hace aquí y no en onAuthStateChange: hacer llamadas a Supabase dentro de
  // ese callback bloquea el candado de autenticación y desconecta al usuario.
  cargarTiposRecurso_().catch(() => {});

  // Mapa tipo_recurso -> pertenencia (Protección / Relacionamiento), usado por
  // el nivel intermedio del árbol de filtros de recursos.
  cargarPertenenciaRecursos_().catch(() => {});

  await entrarAlSistema();
}

/** Subgerente de Relacionamiento: usuario Jefe de Área con subgerencia asignada (SQL 107). */
function esSubgerente_() { return !!state.subgerencia; }   // también en «Ver como… › Modo Subgerente»
function nombrePerfilVisible_(perfil, subgerencia) {
  if (subgerencia) return 'Subgerente de Relacionamiento · ' + aTitulo_(subgerencia);
  if (state.esGRT) return PERFIL_GRT;
  if (state.asociacion) return PERFIL_ASOC + ' (' + aTitulo_(state.asociacion) + ')';
  return perfil === 'Jefe de Área Relacionamiento' ? 'Jefe de Área Relacionamiento' : perfil;
}
/* 17-10-2026 (SQL 119): Gestor de Relacionamiento Territorial (GRT). En la BD es un Jefe de Área + fila en
 * perfil_gestor_territorial (mismo patrón que el Subgerente): hereda sus permisos; lo distinto se ajusta en
 * Administración › 🛡️ Permisos por perfil. */
const PERFIL_GRT = 'Gestor de Relacionamiento Territorial';
/* 20-10-2026 (SQL 129): «Asociación de Agricultores». En la BD es un Visor + fila en perfil_asociacion: solo ve el menú
 * 🌾 Agricultores (registra actividades, planificación y la meta de escuelas). No es configurable en Permisos por perfil. */
const PERFIL_ASOC = 'Asociación de Agricultores';
const AGR_AREA_VISIBLE = 'VICTORIA';   // = agr_asociaciones.area_visible: los Jefes de esta área ven el tablero
const PERFILES_CONFIGURABLES = ['Administrador', 'Subgerente de Relacionamiento', 'Jefe de Área Relacionamiento', PERFIL_GRT, 'GRD', 'Visor'];
/** Perfil que se muestra y que usan los permisos por perfil. */
function perfilEfectivo_() {
  const p = state.perfil && state.perfil.perfil;
  if (state.subgerencia) return 'Subgerente de Relacionamiento';
  if (state.esGRT) return PERFIL_GRT;
  return p;
}
/** Perfil técnico (el guardado en perfiles.perfil) de un perfil visible: Subgerente y GRT son Jefe de Área; la Asociación es Visor. */
function perfilBase_(p) { return (p === 'Subgerente de Relacionamiento' || p === PERFIL_GRT) ? 'Jefe de Área Relacionamiento' : p === PERFIL_ASOC ? 'Visor' : p; }
// Perfiles que arrancan con capas mínimas (solo Límite Comunal): GRD y Jefe de Área.
function perfilArranqueMinimo_() {
  return state.perfil && (state.perfil.perfil === 'GRD' || state.perfil.perfil === 'Jefe de Área Relacionamiento');
}

/* Arranque sin parpadeo (21-10-2026): el aviso «Cargando…» queda puesto hasta que la vista inicial (Dashboard, Seguimiento o
 * Agricultores) ya está armada. Antes se quitaba al principio y, mientras se leían perfil, permisos y comunas, se veía el mapa. */
async function entrarAlSistema() {
  showLoading('Preparando tu tablero…');
  try {
    await entrarAlSistemaInterno_();
  } finally {
    document.getElementById('loading-overlay').style.display = 'none';
    document.getElementById('force-password-overlay').style.display = 'none';
    document.getElementById('login-overlay').style.display = 'none';
  }
}
async function entrarAlSistemaInterno_() {
  // Registro de actividad: marcar el acceso (login) y arrancar el heartbeat.
  try { supabaseClient.rpc('registrar_acceso', { p_tipo: 'login' }); } catch (e) {}
  iniciarCierreInactividad_();   // ⏳ 30 min sin actividad → cierre de sesión
  // Sesiones de uso (SQL 116): inicio, latido cada 2 min (renueva la sesión tras una suspensión) y cierre
  if (!state.sesionUsoId) {
    supabaseClient.rpc('iniciar_sesion_uso', { p_agente: navigator.userAgent, p_pantalla: screen.width + '×' + screen.height })
      .then(({ data }) => { if (data) state.sesionUsoId = data; }, () => {});
  }
  if (!window.__heartbeat__) {
    window.__heartbeat__ = setInterval(() => {
      try { supabaseClient.rpc('marcar_actividad', { p_vista: state.vistaActual || null }); } catch (e) {}
      if (state.sesionUsoId) supabaseClient.rpc('latido_sesion_uso', { p_id: state.sesionUsoId, p_vista: state.vistaActual || null })
        .then(({ data }) => { if (data) state.sesionUsoId = data; }, () => {});
    }, 120000); // cada 2 minutos
    // Al cerrar la pestaña: último latido (la sesión termina ahí aunque no se pulse «Salir»)
    window.addEventListener('pagehide', () => {
      if (state.sesionUsoId) try { supabaseClient.rpc('latido_sesion_uso', { p_id: state.sesionUsoId, p_vista: state.vistaActual || null }); } catch (e) {}
    });
  }
  document.getElementById('force-password-overlay').style.display = 'none';
  document.getElementById('login-overlay').style.display = 'none';

  document.getElementById('user-avatar').textContent = initials(state.perfil.nombre_completo);
  document.getElementById('up-nombre').textContent = state.perfil.nombre_completo;
  document.getElementById('up-correo').textContent = (state.user && state.user.email) || '';
  // Subgerente de Relacionamiento (SQL 107): en la BD es Jefe de Área + su subgerencia (perfil_subgerencias)
  state.subgerencia = null;
  try {
    const { data: sg } = await supabaseClient.from('perfil_subgerencias').select('subgerencia').eq('perfil_id', state.user.id).maybeSingle();
    if (sg && sg.subgerencia && esJefeAreaPerfil_(state.perfil.perfil)) state.subgerencia = sg.subgerencia;
  } catch (e) { /* sin el SQL 107: perfiles de siempre */ }
  // «Ver como… › Modo Subgerente» (Administrador)
  if (state.simulacion && state.simulacion.subgerencia) state.subgerencia = state.simulacion.subgerencia;
  // Gestor de Relacionamiento Territorial (SQL 119): Jefe de Área + perfil_gestor_territorial
  state.esGRT = false;
  if (!state.subgerencia && esJefeAreaPerfil_(state.perfil.perfil)) {
    try {
      const { data: g } = await supabaseClient.from('perfil_gestor_territorial').select('perfil_id').eq('perfil_id', state.user.id).maybeSingle();
      state.esGRT = !!g && !state.simulacion;
    } catch (e) { /* sin el SQL 119 */ }
  }
  if (state.simulacion && state.simulacion.grt) state.esGRT = true;
  // Asociación de Agricultores (SQL 129): Visor + perfil_asociacion → solo el menú 🌾 Agricultores
  state.asociacion = null;
  if (state.perfil.perfil === 'Visor' && !state.simulacion) {
    try {
      const { data: a } = await supabaseClient.from('perfil_asociacion').select('asociacion').eq('perfil_id', state.user.id).maybeSingle();
      if (a && a.asociacion) state.asociacion = a.asociacion;
    } catch (e) { /* sin el SQL 129 */ }
  }
  if (state.simulacion && state.simulacion.asociacion) state.asociacion = state.simulacion.asociacion;
  document.body.classList.toggle('es-asociacion', !!state.asociacion);
  document.body.classList.toggle('es-subgerente', !!state.subgerencia);
  document.getElementById('up-rol').textContent = nombrePerfilVisible_(state.perfil.perfil, state.subgerencia);


  // Capas iniciales por perfil. GRD: SOLO Límite Comunal activo; todo lo demás apagado.
  // Otros perfiles: Áreas Pobladas encendida como referencia (comportamiento previo).
  if (perfilArranqueMinimo_()) {
    state.limiteComunalOn = true;
    state.layersOn.__areasPobladas = false;
    state.areasLayersOn = { fundosCmpc: false, areaRelacionamiento: false, recursosDisponibles: false };
    state.alertaLayersOn = { verde: false, amarilla: false, roja: false };
    state.patrullajeLayerOn = false;
  } else {
    state.layersOn.__areasPobladas = false;
  }

  const puedeEditar = ['GRD','Administrador','Jefe de Área Relacionamiento'].includes(state.perfil.perfil);
  // btn-editor-toggle eliminado del DOM — función asumida por btn-planificar
  // btn-alerta-rapida eliminado del DOM
  // El botón Planificar lo controla actualizarBotonPlanificar_() (solo en Modo Planificación).
  // Modo edición gráfica de recursos del área: EXCLUSIVO del perfil Administrador.
  // "Recursos del Área" se quitó del menú Planificar (06-10-2026): crear, editar,
  // mover y eliminar recursos se hace ahora en la pestaña 🧭 Planificador.
  const itemRecArea = document.getElementById('plan-recursos-area');
  if (itemRecArea) itemRecArea.style.display = 'none';
  // Propagación escalonada del copamiento: Administrador, Jefe de Área y GRD.
  const itemProp = document.getElementById('plan-propagar-copamiento');
  if (itemProp) itemProp.style.display = puedePropagar_() ? 'flex' : 'none';
  // btn-recursos-area-rapido eliminado del DOM
  document.getElementById('tab-admin').style.display = state.perfil.perfil === 'Administrador' ? '' : 'none';
  document.getElementById('tab-patrullajes').style.display = esAdminOJefe_() ? '' : 'none';
  { const tt = document.getElementById('tab-turnos'); if (tt) tt.style.display = puedeGestionarTurnos_() ? '' : 'none'; }
  // Permisos por usuario (SQL 83): restringen menús, opciones y capas.
  await cargarMisPermisos_();
  aplicarPermisosMenu_();
  // Los botones de Usuarios, Instituciones, Resumen General, Planificación
  // Previa, Recursos del Área y Catálogo salieron de la barra lateral: se
  // administran desde el panel de Administración.

  const fInst = document.getElementById('f-institucion');
  fInst.innerHTML = '';
  state.instituciones.forEach(i => {
    const opt = document.createElement('option');
    opt.value = i.id; opt.textContent = i.nombre;
    fInst.appendChild(opt);
  });
  // Punto de Control solo se habilita para instituciones de control (coincidencia flexible)
  fInst.addEventListener('change', actualizarTipoRecursoPorInstitucion_);
  actualizarTipoRecursoPorInstitucion_();

  const comunaSelect = document.getElementById('comuna-select');
  const comunaBadge = document.getElementById('comuna-badge');
  comunaSelect.innerHTML = '';

  function poblarSelectPorComunas(listaComunas) {
    // Grupo de FAVORITAS al inicio (si el usuario tiene alguna dentro de su lista)
    const favSet = state.comunasFavoritas || new Set();
    const favoritas = listaComunas.filter(c => favSet.has(c.id));
    if (favoritas.length > 0) {
      const grupoFav = document.createElement('optgroup');
      grupoFav.label = '⭐ Favoritas';
      favoritas.sort((a, b) => a.comuna.localeCompare(b.comuna)).forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.id; opt.textContent = '⭐ ' + c.comuna + ' (' + c.provincia + ')';
        grupoFav.appendChild(opt);
      });
      comunaSelect.appendChild(grupoFav);
    }
    const porRegion = {};
    listaComunas.forEach(c => { (porRegion[c.region] = porRegion[c.region] || []).push(c); });
    Object.keys(porRegion).sort().forEach(region => {
      const grupo = document.createElement('optgroup');
      grupo.label = region;
      porRegion[region].sort((a, b) => a.comuna.localeCompare(b.comuna)).forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.id; opt.textContent = c.comuna + ' (' + c.provincia + ')';
        grupo.appendChild(opt);
      });
      comunaSelect.appendChild(grupo);
    });
  }

  if (state.perfil.perfil === 'Administrador') {
    comunaSelect.style.display = 'block';
    comunaBadge.style.display = 'none';
    const optVacia = document.createElement('option');
    optVacia.value = ''; optVacia.textContent = '— Selecciona una comuna —';
    comunaSelect.appendChild(optVacia);
    poblarSelectPorComunas(state.comunas);
    comunaSelect.value = '';
    comunaSelect.onchange = () => {
      if (!comunaSelect.value) return;
      if (hayModoTrabajoActivo_()) { comunaSelect.value = state.activeComunaId || ''; mostrarToast_('🔒 Termina o cancela ' + nombreModoTrabajo_() + ' antes de cambiar de comuna.'); return; }
      ocultarEstadoSinComuna_();
      setActiveComuna(comunaSelect.value, true);
    };
    mostrarEstadoSinComuna_();
  } else {
    if (state.simulacion) {
      // Modo "Ver como…": comunas/áreas elegidas por el Administrador en vez de perfil_comunas/perfil_areas
      await cargarAsignacionSimulada_();
    } else {
      const { data: misComunas } = await supabaseClient.from('perfil_comunas').select('comuna_id').eq('perfil_id', state.user.id);
      state.misComunaIds = (misComunas || []).map(r => r.comuna_id);
      const { data: misAreas } = await supabaseClient.from('perfil_areas').select('area').eq('perfil_id', state.user.id);
      state.misAreasIds = (misAreas || []).map(r => r.area);
      // Subgerente: sus comunas = las de todas las áreas de su subgerencia (Comunas por área, SQL 94)
      if (state.subgerencia && state.misAreasIds.length) {
        try {
          const claves = new Set(state.misAreasIds.map(a => plNorm_(a).replace(/[^A-Z0-9]/g, '')));
          const { data: ac } = await supabaseClient.from('v_area_comunas_admin').select('area_norm, id_comuna');
          const idsCom = new Set((ac || []).filter(x => claves.has(String(x.area_norm || '').toUpperCase())).map(x => Number(x.id_comuna)));
          const slugs = state.comunas.filter(c => idsCom.has(Number(c.id_comuna))).map(c => c.id);
          state.misComunaIds = [...new Set(state.misComunaIds.concat(slugs))];
        } catch (e) { /* solo sus comunas asignadas */ }
      }
    }
    // Los menús que dependen de las ÁREAS del usuario (🌾 Agricultores: Jefes y GRT del área Victoria) se recalculan
    // ahora que perfil_areas ya está cargado: la primera pasada de aplicarPermisosMenu_ corre antes y los dejaba ocultos.
    aplicarPermisosMenu_();
    poblarSelectorArea_();
    const listaComunas = state.comunas.filter(c => state.misComunaIds.includes(c.id));
    const perfil = state.perfil.perfil;
    const puedeElegirComuna = (perfil === 'Jefe de Área Relacionamiento') && listaComunas.length > 1;

    if (puedeElegirComuna) {
      comunaSelect.style.display = 'block';
      comunaBadge.style.display = 'none';
      poblarSelectPorComunas(listaComunas);
      comunaSelect.value = listaComunas[0].id;
      comunaSelect.onchange = () => {
        if (hayModoTrabajoActivo_()) { comunaSelect.value = state.activeComunaId; mostrarToast_('🔒 Termina o cancela ' + nombreModoTrabajo_() + ' antes de cambiar de comuna.'); return; }
        setActiveComuna(comunaSelect.value);
      };
      setActiveComuna(listaComunas[0].id, true);
    } else {
      // GRD, Visor y cualquier otro: solo badge, nunca selector
      comunaSelect.style.display = 'none';
      comunaBadge.style.display = 'flex';
      setActiveComuna(listaComunas[0] ? listaComunas[0].id : state.perfil.comuna_id, true);
    }
  }

  renderBasemapPanel();
  renderTab(state.activeTab);
  loadAreaLayers_();
  loadPatrullajeLayer_();
  cargarCapasAlertaGlobales_();
  cargarLimitesMultiComuna_(); // varias comunas: límites de todas, activa resaltada
  // Vista inicial: Dashboard (el mapa queda listo pero oculto hasta ir a su pestaña).
  // El Subgerente de Relacionamiento entra directo a su tablero de 📈 Seguimiento.
  mostrarVista_(esAsociacion_() ? 'agricultores' : esSubgerente_() ? 'seguimiento' : 'dashboard');
  iniciarSincronizacionDiaria_();
  renderSimulacionPerfil_();
}


/* ☑️ SELECTOR MÚLTIPLE (22-10-2026) ──────────────────────────────────────────────────────────────────────────────────────
 * Convierte un <select> de filtro en un desplegable con casillas para elegir VARIOS valores (p. ej. dos tipos de recurso).
 * El <select> original queda oculto y sigue siendo la fuente de las opciones (los módulos lo repueblan como siempre):
 *   · valoresSel_(id)  → arreglo con lo elegido ([] = todos);   · pasaSel_(id, v) → true si v pasa el filtro;
 *   · actualizarSel_(id) → rehace la lista tras cambiar las opciones (también lo hace solo, con un MutationObserver).
 * Compatibilidad: sel.value devuelve el PRIMER valor elegido; asignar '' limpia la selección; asignar un valor que no está
 * elegido deja solo ese (p. ej. clic en la tarjeta de un tipo). Al cambiar, se dispara 'change' en el <select>. */
const SEL_VALUE_ = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
function selMultiple_(id, nombrePlural) {
  const sel = typeof id === 'string' ? document.getElementById(id) : id;
  if (!sel || sel._msel) return sel;
  const w = document.createElement('div'); w.className = 'msel';
  const btn = document.createElement('button'); btn.type = 'button'; btn.className = (sel.className || '') + ' msel-btn'; btn.title = sel.title || '';
  btn.style.cssText = sel.style.cssText;
  const pop = document.createElement('div'); pop.className = 'msel-pop'; pop.hidden = true;
  w.appendChild(btn); w.appendChild(pop);
  sel.parentNode.insertBefore(w, sel); w.appendChild(sel); sel.style.display = 'none';
  const m = sel._msel = { valores: [], btn, pop, nombre: nombrePlural || 'elegidos', q: '' };
  Object.defineProperty(sel, 'value', {
    configurable: true,
    get() { return SEL_VALUE_.get.call(this); },
    set(v) {
      v = v == null ? '' : String(v);
      if (!v) m.valores = []; else if (!m.valores.includes(v)) m.valores = [v];
      SEL_VALUE_.set.call(this, m.valores[0] || '');
      pintarSel_(sel);
    },
  });
  btn.addEventListener('click', e => {
    e.stopPropagation();
    const abrir = pop.hidden;
    document.querySelectorAll('.msel-pop').forEach(p => { p.hidden = true; });
    pop.hidden = !abrir;
    if (abrir) { const q = pop.querySelector('.msel-q'); if (q) q.focus(); }
  });
  pop.addEventListener('click', e => e.stopPropagation());
  pop.addEventListener('input', e => {
    if (!e.target.classList.contains('msel-q')) return;
    m.q = normalizarBusqueda_(e.target.value || '');
    pop.querySelectorAll('.msel-lista label').forEach(l => { l.style.display = !m.q || normalizarBusqueda_(l.textContent).includes(m.q) ? '' : 'none'; });
  });
  pop.addEventListener('change', e => {
    const c = e.target; if (c.type !== 'checkbox') return;
    if (c.hasAttribute('data-msel-todos')) m.valores = [];
    else m.valores = [...pop.querySelectorAll('.msel-lista input:checked')].map(x => x.value);
    SEL_VALUE_.set.call(sel, m.valores[0] || '');
    pintarSel_(sel, true);
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  });
  if (window.MutationObserver) new MutationObserver(() => pintarSel_(sel)).observe(sel, { childList: true });
  if (!window.__mselCierre__) {
    window.__mselCierre__ = true;
    document.addEventListener('click', () => document.querySelectorAll('.msel-pop').forEach(p => { p.hidden = true; }));
    document.addEventListener('keydown', e => { if (e.key === 'Escape') document.querySelectorAll('.msel-pop').forEach(p => { p.hidden = true; }); });
  }
  pintarSel_(sel);
  return sel;
}
/** Dibuja el botón y la lista de casillas (descarta lo elegido que ya no existe entre las opciones). */
function pintarSel_(sel, conservarPop) {
  const m = sel && sel._msel; if (!m) return;
  const ops = [...sel.options].filter(o => o.value !== '');
  m.valores = m.valores.filter(v => ops.some(o => o.value === v));
  if (SEL_VALUE_.get.call(sel) !== (m.valores[0] || '')) SEL_VALUE_.set.call(sel, m.valores[0] || '');
  const todos = ([...sel.options].find(o => o.value === '') || {}).text || 'Todos';
  const txt = !m.valores.length ? todos : m.valores.length === 1 ? (ops.find(o => o.value === m.valores[0]) || {}).text : m.valores.length + ' ' + m.nombre;
  m.btn.innerHTML = '<span>' + escapeHtml_(txt || todos) + '</span><i>▾</i>';
  m.btn.classList.toggle('activo', !!m.valores.length);
  sel.classList.toggle('activo', !!m.valores.length);
  if (conservarPop) {   // tras un clic: solo se actualiza la casilla «Todos»
    const t = m.pop.querySelector('[data-msel-todos]'); if (t) t.checked = !m.valores.length;
    return;
  }
  m.pop.innerHTML = (ops.length > 8 ? '<input class="msel-q" placeholder="Buscar…" value="">' : '') +
    '<label class="msel-todos"><input type="checkbox" data-msel-todos' + (m.valores.length ? '' : ' checked') + '> ' + escapeHtml_(todos) + '</label>' +
    '<div class="msel-lista">' + ops.map(o => '<label><input type="checkbox" value="' + escapeHtml_(o.value) + '"' + (m.valores.includes(o.value) ? ' checked' : '') + '> ' + escapeHtml_(o.text) + '</label>').join('') + '</div>';
  m.q = '';
}
function actualizarSel_(id) { pintarSel_(typeof id === 'string' ? document.getElementById(id) : id); }
function valoresSel_(id) {
  const sel = typeof id === 'string' ? document.getElementById(id) : id;
  if (!sel) return [];
  if (sel._msel) return sel._msel.valores.slice();
  return sel.value ? [sel.value] : [];
}
function pasaSel_(id, v) { const vs = valoresSel_(id); return !vs.length || vs.includes(v); }
/** Fija lo elegido desde el código (p. ej. clic en una tarjeta) y avisa con 'change'. */
function fijarValoresSel_(id, valores) {
  const sel = typeof id === 'string' ? document.getElementById(id) : id; if (!sel) return;
  if (!sel._msel) { sel.value = (valores && valores[0]) || ''; sel.dispatchEvent(new Event('change', { bubbles: true })); return; }
  sel._msel.valores = (valores || []).map(String);
  SEL_VALUE_.set.call(sel, sel._msel.valores[0] || '');
  pintarSel_(sel);
  sel.dispatchEvent(new Event('change', { bubbles: true }));
}
