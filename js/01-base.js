
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
  activeBasemapId: 'positron',
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

const BASEMAPS = [
  { id:'positron', nombre:'Calles Chile (Esri)', color:'#EDEAE2',
    url:'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',
    options:{ attribution:'Tiles &copy; Esri', maxZoom:19 } },
  { id:'calles_ref', nombre:'Calles + rutas destacadas', color:'#F4F1EA',
    url:'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}',
    options:{ attribution:'Tiles &copy; Esri', maxZoom:16 },
    overlayUrl:'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}',
    overlayOptions:{ maxZoom:19 } },
  { id:'calles', nombre:'Calles (Esri)', color:'#E8E4D8',
    url:'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
    options:{ attribution:'Tiles &copy; Esri', maxZoom:19 } },
  { id:'satellite', nombre:'Satélite + calles', color:'#3A4A2E',
    url:'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    options:{ attribution:'Tiles &copy; Esri', maxZoom:19 },
    overlayUrl:'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}',
    overlayOptions:{ maxZoom:19 } },
  { id:'gris', nombre:'Gris oscuro (Esri)', color:'#4B5563',
    url:'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',
    options:{ attribution:'Tiles &copy; Esri', maxZoom:16 } },
];

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
  state.activeBasemapId = basemapId;
  renderBasemapPanel();
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
  setBasemap('positron');
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

async function entrarAlSistema() {
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
  document.getElementById('loading-overlay').style.display = 'none';
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

