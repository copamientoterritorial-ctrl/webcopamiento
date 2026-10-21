/* ============ ⏳ CIERRE DE SESIÓN POR INACTIVIDAD (17-10-2026) ============
 * 30 minutos sin actividad (mouse, teclado, toque, scroll) → se cierra la sesión. A los 28 min aparece un
 * aviso con cuenta regresiva y el botón «Seguir conectado». La última actividad se comparte entre pestañas
 * (localStorage): trabajar en una pestaña mantiene viva la sesión en las demás. El latido automático del
 * sistema NO cuenta como actividad. Tras el cierre, la pantalla de ingreso explica el motivo. */
const INACTIVIDAD_MIN = 30, INACTIVIDAD_AVISO_MIN = 2;
const INACT_CLAVE = 'sig_ultima_actividad', INACT_MOTIVO = 'sig_cierre_inactividad';
let inactUltima = Date.now(), inactTimer = null, inactAviso = null;
function inactLeer_() { try { return Math.max(inactUltima, Number(localStorage.getItem(INACT_CLAVE)) || 0); } catch (e) { return inactUltima; } }
function inactMarcar_() {
  const ahora = Date.now();
  if (ahora - inactUltima < 5000) return;   // como mucho una escritura cada 5 s
  inactUltima = ahora;
  try { localStorage.setItem(INACT_CLAVE, String(ahora)); } catch (e) {}
  if (inactAviso) cerrarAvisoInactividad_();
}
function cerrarAvisoInactividad_() { if (inactAviso) { inactAviso.remove(); inactAviso = null; } }
function iniciarCierreInactividad_() {
  if (inactTimer) return;
  inactUltima = Date.now();
  try { localStorage.setItem(INACT_CLAVE, String(inactUltima)); } catch (e) {}
  ['mousemove', 'mousedown', 'keydown', 'touchstart', 'wheel', 'scroll'].forEach(ev =>
    window.addEventListener(ev, inactMarcar_, { passive: true, capture: true }));
  const revisar = () => {
    if (!state.user) return;
    const inactivo = Date.now() - inactLeer_();
    const limite = INACTIVIDAD_MIN * 60000, aviso = (INACTIVIDAD_MIN - INACTIVIDAD_AVISO_MIN) * 60000;
    if (inactivo >= limite) {
      clearInterval(inactTimer); inactTimer = null;
      try { sessionStorage.setItem(INACT_MOTIVO, '1'); } catch (e) {}
      doLogout();
      return;
    }
    if (inactivo >= aviso) {
      const resta = Math.max(0, Math.ceil((limite - inactivo) / 1000));
      const txt = Math.floor(resta / 60) + ':' + String(resta % 60).padStart(2, '0');
      if (!inactAviso) {
        inactAviso = document.createElement('div');
        inactAviso.className = 'br-modal-overlay';
        inactAviso.style.zIndex = '3000';
        inactAviso.innerHTML = '<div class="br-modal" style="width:min(420px,92vw);padding:20px 22px;text-align:center;">' +
          '<div style="font-size:34px;">⏳</div><h3 style="margin:6px 0;">¿Sigues ahí?</h3>' +
          '<p style="font-size:13px;margin:0 0 6px;">Por seguridad, la sesión se cerrará por inactividad en</p>' +
          '<div id="inact-cuenta" style="font-size:30px;font-weight:900;color:#DC2626;font-variant-numeric:tabular-nums;margin-bottom:14px;"></div>' +
          '<div style="display:flex;gap:8px;justify-content:center;"><button class="btn-secondary" id="inact-salir" style="flex:none;padding:9px 16px;">Cerrar sesión</button>' +
          '<button class="btn-primary" id="inact-seguir" style="flex:none;padding:9px 16px;">Seguir conectado</button></div></div>';
        document.body.appendChild(inactAviso);
        inactAviso.querySelector('#inact-seguir').addEventListener('click', () => { inactUltima = 0; inactMarcar_(); cerrarAvisoInactividad_(); });
        inactAviso.querySelector('#inact-salir').addEventListener('click', () => doLogout());
      }
      inactAviso.querySelector('#inact-cuenta').textContent = txt;
    } else if (inactAviso) cerrarAvisoInactividad_();   // hubo actividad en otra pestaña
  };
  inactTimer = setInterval(revisar, 1000);
  // Al volver de una suspensión del equipo se revisa de inmediato
  document.addEventListener('visibilitychange', () => { if (!document.hidden) revisar(); });
}
/** En la pantalla de ingreso: avisar si la sesión anterior se cerró por inactividad. */
function avisoCierreInactividad_() {
  let fue = false;
  try { fue = sessionStorage.getItem(INACT_MOTIVO) === '1'; sessionStorage.removeItem(INACT_MOTIVO); } catch (e) {}
  if (!fue) return;
  // Modal propio sobre la pantalla de ingreso (antes era un aviso dentro de la tarjeta, que la deformaba)
  const o = document.createElement('div');
  o.className = 'inact-modal-overlay';
  o.innerHTML =
    '<div class="inact-modal" role="alertdialog" aria-labelledby="inact-mod-tit" aria-describedby="inact-mod-txt">' +
      '<div class="inact-modal-ico"><svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
        '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg></div>' +
      '<h3 id="inact-mod-tit">Sesión cerrada por inactividad</h3>' +
      '<p id="inact-mod-txt">Por seguridad, cerramos tu sesión después de <b>' + INACTIVIDAD_MIN + ' minutos sin actividad</b>. ' +
        'Los cambios que ya guardaste se mantienen.</p>' +
      '<p class="inact-modal-sub">Ingresa nuevamente con tu correo y contraseña para continuar.</p>' +
      '<button type="button" class="inact-modal-btn">Volver a ingresar</button>' +
    '</div>';
  const tecla = e => { if (e.key === 'Escape' || e.key === 'Enter') { e.preventDefault(); cerrar(); } };
  const cerrar = () => {
    document.removeEventListener('keydown', tecla);
    if (!o.isConnected || o.classList.contains('saliendo')) return;
    o.classList.add('saliendo');
    setTimeout(() => o.remove(), 180);
    const email = document.querySelector('#login-overlay input[type="email"], #login-overlay input[name="email"], #login-overlay input');
    if (email) setTimeout(() => email.focus(), 200);
  };
  o.querySelector('.inact-modal-btn').addEventListener('click', cerrar);
  o.addEventListener('click', e => { if (e.target === o) cerrar(); });
  document.addEventListener('keydown', tecla);
  document.body.appendChild(o);
  setTimeout(() => { const b = o.querySelector('.inact-modal-btn'); if (b) b.focus(); }, 50);
}

/* ============ BASEMAP ============ */
function renderBasemapPanel() {
  const panel = document.getElementById('basemap-panel');
  panel.innerHTML = '';
  BASEMAPS.forEach(b => {
    const btn = document.createElement('button');
    btn.className = 'basemap-option' + (state.activeBasemapId === b.id ? ' active' : '');
    btn.innerHTML = '<span class="basemap-swatch" style="background:' + b.color + '"></span>' + b.nombre;
    btn.addEventListener('click', () => { setBasemap(b.id); document.getElementById('basemap-panel').classList.remove('show'); });
    panel.appendChild(btn);
  });
}

/* ============ CAMBIO DE COMUNA ============ */
let comunaRequestToken = 0;

function mostrarEstadoSinComuna_() {
  document.getElementById('sin-comuna-overlay').style.display = 'flex';
}
function ocultarEstadoSinComuna_() {
  document.getElementById('sin-comuna-overlay').style.display = 'none';
}

/* ============ LOGO MUNICIPAL POR COMUNA ============
 * Cada comuna puede tener su propio escudo municipal. Si no, se usa el logo de
 * la institución "Municipalidad" como respaldo. */
state.logoMunicipalComuna = null; // logo_url de la comuna activa (o null)

function esInstitucionMunicipalidad_(inst) {
  const n = (inst && inst.nombre ? inst.nombre : '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return n.includes('municipal');
}

// Devuelve el logo efectivo de una institución para la comuna activa:
// si es Municipalidad y la comuna tiene logo propio, ese; si no, el de la institución.
/* Ampliación del logo dentro de los marcadores pequeños.
 *
 * Muchos logos institucionales vienen en un lienzo con bastante margen
 * transparente alrededor de la marca. A tamaño completo no se nota, pero
 * reducidos al tamaño de un globo la marca visible queda en dos o tres
 * píxeles y desaparece. Se amplía la imagen y se recorta el sobrante con
 * overflow:hidden del contenedor circular.
 *
 * Si algún logo aparece cortado por los bordes, baja este valor a 1.
 * Si sigue viéndose pequeño, súbelo a 1.6 o 1.8.
 */
const ZOOM_LOGO_MARCADOR = 1.45;

function logoEfectivoInstitucion_(inst) {
  if (!inst) return null;
  if (esInstitucionMunicipalidad_(inst) && state.logoMunicipalComuna) return state.logoMunicipalComuna;
  return inst.logo_url || null;
}

async function cargarLogoMunicipalComuna_(comunaId) {
  state.logoMunicipalComuna = null;
  if (!comunaId) { actualizarBotonLogoMunicipal_(); return; }
  const { data } = await supabaseClient.from('comuna_logo_municipal').select('logo_url').eq('comuna_id', comunaId).maybeSingle();
  state.logoMunicipalComuna = data ? data.logo_url : null;
  actualizarBotonLogoMunicipal_();
}

function actualizarBotonLogoMunicipal_() {
  const grande = document.getElementById('logo-municipal-grande');

  // 17-10-2026: se quitó el panel izquierdo de logos del Dashboard; los logos van en el carrusel
  // «Municipalidades que forman parte del sistema» (cargarCarruselMunicipios_).
  if (!grande) return;
  grande.style.display = 'none';
  const btn = document.getElementById('btn-logo-municipal');
  const img = document.getElementById('img-logo-municipal');
  const txt = document.getElementById('txt-logo-municipal');
  if (!btn) return;
  const puede = ['Administrador', 'GRD', 'Jefe de Área Relacionamiento'].includes(state.perfil.perfil) && !!state.activeComunaId && state.vistaActual === 'mapa';
  btn.style.display = puede ? 'flex' : 'none';
  if (!puede) return;
  // Mostrar el logo efectivo (propio de la comuna, o el de la institución Municipalidad)
  const instMuni = (state.instituciones || []).find(esInstitucionMunicipalidad_);
  const logo = state.logoMunicipalComuna || (instMuni ? instMuni.logo_url : null);
  if (logo) { img.src = logo; img.style.display = 'block'; txt.style.display = 'none'; }
  else { img.style.display = 'none'; txt.style.display = 'inline'; }
  btn.title = state.logoMunicipalComuna
    ? 'Logo municipal propio de esta comuna (clic para cambiar)'
    : 'Usando logo genérico de Municipalidad (clic para subir el de esta comuna)';
}

async function subirLogoMunicipal_(file) {
  if (!state.activeComunaId || !file) return;
  mostrarToast_('Subiendo logo municipal…');
  try {
    const ext = (file.name.split('.').pop() || 'png').toLowerCase();
    const ruta = 'muni_' + state.activeComunaId + '_' + Date.now() + '.' + ext;
    const { error: upErr } = await supabaseClient.storage.from('logos-instituciones')
      .upload(ruta, file, { upsert: false, contentType: file.type || 'image/png' });
    if (upErr) { mostrarToast_('Error al subir: ' + upErr.message); return; }
    const { data: pub } = supabaseClient.storage.from('logos-instituciones').getPublicUrl(ruta);
    const url = pub ? pub.publicUrl : null;
    const { error } = await supabaseClient.rpc('set_logo_municipal', { p_comuna_id: state.activeComunaId, p_logo_url: url });
    if (error) { mostrarToast_('Error: ' + error.message); return; }
    state.logoMunicipalComuna = url;
    actualizarBotonLogoMunicipal_();
    mostrarToast_('Logo municipal actualizado para ' + nombreComuna_(state.activeComunaId) + '.');
    // Redibujar recursos para que los pines de Municipalidad tomen el nuevo logo
    renderRecursosEnMapa();
  } catch (e) { mostrarToast_('Error: ' + e.message); }
}

/* ============ MÚLTIPLES COMUNAS: límites de todas + lista de logos ============
 * Para usuarios con más de una comuna (Jefe de Área, GRD, Admin): se dibujan los
 * límites de todas sus comunas (el activo resaltado), con árbol de activación, y
 * una lista de logos municipales (el activo resaltado). La edición siempre opera
 * sobre la comuna del desplegable (state.activeComunaId). */
state.limitesOcultos = {}; // comuna_id -> true si el usuario lo apagó

function tieneVariasComunas_() { return comunasSeleccionablesUsuario_().length > 1; }

function idsComunasMulti_() {
  // Admin ve TODAS: no cargar 158 límites; solo sus favoritas + la activa
  if (state.perfil.perfil === 'Administrador') {
    return Array.from(new Set([...Array.from(state.comunasFavoritas || []), state.activeComunaId].filter(Boolean)));
  }
  return comunasSeleccionablesUsuario_().map(c => c.id);
}

function estiloLimite_(comunaId) {
  const activo = comunaId === state.activeComunaId;
  return activo
    ? { color: '#0F172A', weight: 3.5, fillOpacity: 0.05, dashArray: '' }
    : { color: '#94A3B8', weight: 1.5, fillOpacity: 0, dashArray: '6,6' };
}

async function cargarLimitesMultiComuna_() {
  limitesMultiLayer.clearLayers();
  window.limitesPorComuna = {};
  const idsCargar = tieneVariasComunas_() ? idsComunasMulti_() : [];
  if (idsCargar.length < 2) { if (map.hasLayer(limitesMultiLayer)) map.removeLayer(limitesMultiLayer); return; }
  const { data, error } = await supabaseClient.from('v_comunas_limite').select('id, comuna, geometry').in('id', idsCargar);
  if (error || !data) return;
  data.forEach(c => {
    if (!c.geometry) return;
    const capa = L.geoJSON(c.geometry, { pane: 'limitesPane', style: estiloLimite_(c.id) });
    capa.on('click', (ev) => {
      if (hayModoTrabajoActivo_()) {
        // En modo de trabajo, el clic debe llegar al mapa (agregar vértice, etc.),
        // no intentar cambiar de comuna. Se re-emite al mapa.
        map.fire('click', ev);
        return;
      }
      if (c.id !== state.activeComunaId) seleccionarComuna_(c.id);
    });
    window.limitesPorComuna[c.id] = capa;
    if (!state.limitesOcultos[c.id]) limitesMultiLayer.addLayer(capa);
  });
  if (!map.hasLayer(limitesMultiLayer)) limitesMultiLayer.addTo(map);
  refrescarEstiloLimites_();
}

function refrescarEstiloLimites_() {
  const ids = Object.keys(window.limitesPorComuna || {});
  // Primero, todas las NO activas al fondo con estilo segmentado
  ids.forEach(id => {
    if (id === state.activeComunaId) return;
    const capa = window.limitesPorComuna[id];
    capa.setStyle(estiloLimite_(id));
    capa.eachLayer(s => { if (s.bringToBack) s.bringToBack(); });
  });
  // Luego, la activa: estilo sólido y al frente (queda encima de las demás)
  const activa = window.limitesPorComuna[state.activeComunaId];
  if (activa) {
    activa.setStyle(estiloLimite_(state.activeComunaId));
    activa.eachLayer(s => { if (s.bringToFront) s.bringToFront(); });
  }
}

// Cambia la comuna activa desde cualquier control (logo, límite, desplegable)
// ¿Hay un modo de trabajo activo? (edición, planificación, forma, recursos de área, asignación)
function hayModoTrabajoActivo_() {
  return !!(state.editorMode || state.modoPlanificacion || state.editandoForma || state.modoRecursosArea || state.asignacionModo);
}
function nombreModoTrabajo_() {
  if (state.editandoForma) return 'la edición de forma';
  if (state.modoPlanificacion) return 'la planificación de alerta';
  if (state.modoRecursosArea) return 'la ubicación de recursos del área';
  if (state.asignacionModo) return 'la asignación de patrullaje';
  if (state.editorMode) return 'el modo edición';
  return 'el trabajo actual';
}

// Cambia la comuna activa desde límite o logo. BLOQUEADO si hay un modo de
// trabajo activo, para no cambiar de comuna a mitad de una edición/planificación.
function seleccionarComuna_(comunaId) {
  if (hayModoTrabajoActivo_()) {
    mostrarToast_('🔒 Termina o cancela ' + nombreModoTrabajo_() + ' antes de cambiar de comuna.');
    return;
  }
  const sel = document.getElementById('comuna-select');
  if (sel && sel.style.display !== 'none') sel.value = comunaId;
  setActiveComuna(comunaId, true);
}

// Logo(s) municipales en el Dashboard: desde el 17-10-2026 ya no hay panel izquierdo (lista de logos
// o logo de la comuna); todos los logos se muestran en el carrusel al final (cargarCarruselMunicipios_).
async function actualizarLogoDashboard_(comunaId) {
  const cont = document.getElementById('logo-municipal-grande');
  if (cont) cont.style.display = 'none';
  void comunaId;
}
/* ============ COMUNAS FAVORITAS ============ */
function actualizarEstrellaFavorito_() {
  const btn = document.getElementById('btn-fav-comuna');
  if (!btn) return;
  // GRD no puede marcar favoritas (solo Admin y Jefe de Área)
  const perfil = state.perfil && state.perfil.perfil;
  if (perfil === 'GRD' || perfil === 'Visor') { btn.style.display = 'none'; return; }
  // Solo para perfiles con más de una comuna disponible
  const listaComunas = comunasSeleccionablesUsuario_();
  const habilitado = (listaComunas.length > 1) && !!state.activeComunaId;
  btn.style.display = habilitado ? 'flex' : 'none';
  if (!habilitado) return;
  const esFav = (state.comunasFavoritas || new Set()).has(state.activeComunaId);
  btn.textContent = esFav ? '⭐' : '☆';
  btn.title = esFav ? 'Quitar de favoritas' : 'Marcar como favorita';
  btn.classList.toggle('active', esFav);
}

async function toggleFavoritoComuna_() {
  if (!state.activeComunaId) return;
  if (!state.comunasFavoritas) state.comunasFavoritas = new Set();
  const esFav = state.comunasFavoritas.has(state.activeComunaId);
  if (esFav) {
    state.comunasFavoritas.delete(state.activeComunaId);
    const { error } = await supabaseClient.from('perfil_favoritos').delete()
      .eq('perfil_id', state.user.id).eq('comuna_id', state.activeComunaId);
    if (error) { state.comunasFavoritas.add(state.activeComunaId); mostrarToast_('Error: ' + error.message); return; }
    mostrarToast_('Comuna quitada de favoritas.');
  } else {
    state.comunasFavoritas.add(state.activeComunaId);
    const { error } = await supabaseClient.from('perfil_favoritos')
      .insert({ perfil_id: state.user.id, comuna_id: state.activeComunaId });
    if (error) { state.comunasFavoritas.delete(state.activeComunaId); mostrarToast_('Error: ' + error.message); return; }
    mostrarToast_('Comuna marcada como favorita.');
  }
  actualizarEstrellaFavorito_();
  refrescarSelectorComunas_();
  // Admin: sus "varias comunas" son las favoritas -> recargar límites y logos
  if (state.perfil.perfil === 'Administrador') { cargarLimitesMultiComuna_(); actualizarBotonLogoMunicipal_(); }
}

// Re-puebla el selector para reflejar el grupo de favoritas actualizado
function refrescarSelectorComunas_() {
  const comunaSelect = document.getElementById('comuna-select');
  if (!comunaSelect || comunaSelect.style.display === 'none') return;
  const valorActual = comunaSelect.value;
  // Con un área elegida (filtro 🧭), solo las comunas de esa área
  const fArea = state.areaFiltro;
  const listaComunas = comunasSeleccionablesUsuario_().filter(c => !fArea || fArea.ids.has(c.id));
  comunaSelect.innerHTML = '';
  if (fArea) {
    const grupoA = document.createElement('optgroup'); grupoA.label = '🧭 Comunas del área ' + aTitulo_(fArea.area) + ' (' + listaComunas.length + ')';
    listaComunas.slice().sort((a, b) => a.comuna.localeCompare(b.comuna)).forEach(c => {
      const opt = document.createElement('option'); opt.value = c.id; opt.textContent = c.comuna + ' (' + c.provincia + ')';
      grupoA.appendChild(opt);
    });
    comunaSelect.appendChild(grupoA);
    comunaSelect.value = valorActual;
    return;
  }
  if (state.perfil.perfil === 'Administrador') {
    const optVacia = document.createElement('option');
    optVacia.value = ''; optVacia.textContent = '— Selecciona una comuna —';
    comunaSelect.appendChild(optVacia);
  }
  // Reusar la misma lógica de poblado (favoritas + por región)
  const favSet = state.comunasFavoritas || new Set();
  const favoritas = listaComunas.filter(c => favSet.has(c.id));
  if (favoritas.length > 0) {
    const grupoFav = document.createElement('optgroup'); grupoFav.label = '⭐ Favoritas';
    favoritas.sort((a, b) => a.comuna.localeCompare(b.comuna)).forEach(c => {
      const opt = document.createElement('option'); opt.value = c.id; opt.textContent = '⭐ ' + c.comuna + ' (' + c.provincia + ')';
      grupoFav.appendChild(opt);
    });
    comunaSelect.appendChild(grupoFav);
  }
  const porRegion = {};
  listaComunas.forEach(c => { (porRegion[c.region] = porRegion[c.region] || []).push(c); });
  Object.keys(porRegion).sort().forEach(region => {
    const grupo = document.createElement('optgroup'); grupo.label = region;
    porRegion[region].sort((a, b) => a.comuna.localeCompare(b.comuna)).forEach(c => {
      const opt = document.createElement('option'); opt.value = c.id; opt.textContent = c.comuna + ' (' + c.provincia + ')';
      grupo.appendChild(opt);
    });
    comunaSelect.appendChild(grupo);
  });
  comunaSelect.value = valorActual;
}

function setActiveComuna(comunaId, esCargaInicial) {
  if (!comunaId) return;
  ocultarEstadoSinComuna_();
  // Al activar una comuna en vista Mapa el panel queda visible pero como esté:
  // en escritorio se abre con los íconos 🗂️ Capas / 📍 Copamiento (11-10-2026).
  if (state.vistaActual === 'mapa' || !state.vistaActual) {
    const sb = document.getElementById('sidebar');
    if (sb) {
      sb.style.display = '';
    }
  }
  // Todo indicador calculado pertenece a UNA comuna: al cambiar hay que
  // descartarlo. Sin esto, el copamiento y las amebas de la comuna anterior
  // seguían mostrándose sobre la nueva.
  limpiarIndicadoresComuna_();

  state.activeComunaId = comunaId;
  const cfg = state.comunas.find(c => c.id === comunaId);
  if (!cfg) { console.error('Comuna no encontrada en catálogo:', comunaId); return; }

  comunaRequestToken++;
  const miToken = comunaRequestToken;

  document.getElementById('comuna-label').textContent = cfg.comuna;
  document.getElementById('region-label').textContent = cfg.region;
  actualizarEstrellaFavorito_();
  cargarLogoMunicipalComuna_(comunaId).then(() => { if (state.recursos && state.recursos.length) renderRecursosEnMapa(); });
  // Varias comunas: recargar límites (recrea capas -> estilos siempre correctos)
  if (tieneVariasComunas_()) cargarLimitesMultiComuna_();
  document.body.classList.toggle('con-comuna', !!state.activeComunaId);   // muestra botón de capas e interruptor

  if (esCargaInicial) {
    const overlay = document.getElementById('loading-overlay');
    const texto = document.getElementById('loading-overlay-text');
    overlay.style.display = 'flex';
    texto.textContent = 'Cargando capas geográficas de ' + cfg.comuna + '…';

    let pendientes = 2;
    const marcarListo = (siguienteTexto) => {
      pendientes--;
      if (pendientes > 0 && siguienteTexto) texto.textContent = siguienteTexto;
      if (pendientes <= 0) overlay.style.display = 'none';
    };
    loadGeoData(comunaId, miToken, () => marcarListo('Cargando recursos de copamiento…'));
    loadRecursos(comunaId, miToken, () => marcarListo(), true);
    setTimeout(() => { overlay.style.display = 'none'; }, 20000);
  } else {
    loadGeoData(comunaId, miToken);
    loadRecursos(comunaId, miToken);
  }
}

/* ============ CAPAS GEOGRÁFICAS (Edge Function get-comuna-geodata) ============ */
async function loadGeoData(comunaId, miToken, onDone) {
  limiteLayer.clearLayers();
  areasPobladasLayer.clearLayers();
  incendiosContainerLayer.clearLayers();
  Object.keys(fireHeatLayers).forEach(k => delete fireHeatLayers[k]);
  incendiosZonaClave_ = null;   // descarta una ampliación +10 km de la comuna anterior

  const activo = () => document.querySelector('.rail-btn.active').dataset.tab === 'capas';
  if (activo()) document.getElementById('sidebar-content').innerHTML = '<div class="layer-empty-msg">Cargando capas…</div>';

  const { data: geo, error } = await supabaseClient.functions.invoke('get-comuna-geodata', { body: { comunaId } });

  if (miToken !== comunaRequestToken) {
    // Llegó tarde: el usuario ya cambió de comuna de nuevo mientras esta
    // petición estaba en curso. Se descarta para no pintar datos de la
    // comuna equivocada (esto es lo que causaba el bug de "comuna aleatoria").
    if (onDone) onDone();
    return;
  }

  if (error) {
    console.error('Error cargando capas geográficas:', error);
    if (activo()) document.getElementById('sidebar-content').innerHTML = '<div class="layer-empty-msg">No se pudieron cargar las capas: ' + error.message + '</div>';
    if (onDone) onDone();
    return;
  }

  onGeoData(comunaId, geo);
  if (onDone) onDone();
}

/* ============ CAPAS POR ZONA (Fundos CMPC / Áreas de Relacionamiento) ============ */
/* Independientes de la comuna activa — se cargan una sola vez al entrar,
 * filtradas por las zonas asignadas al usuario (Jefe de Área), o completas
 * para Administrador. */
let fundosCmpcFeatureLayers = []; // [{layer, nombre}] — para poder togglear solo las etiquetas

/* ============ CAPAS NUEVAS por id_comuna: Fundos Arauco + Comité ============ */
function idComunaActiva_() {
  const cm = (state.comunas || []).find(c => c.id === state.activeComunaId);
  return cm ? cm.id_comuna : null;
}

// Fundos Arauco: misma lógica visual que CMPC (árbol Área->Sector->fundo), pero
// datos directos de PostGIS por comuna. Solo Admin y Jefe de Área.
async function loadFundosAraucoLayer_() {
  fundosAraucoLayer.clearLayers();
  window.arbolFundosArauco = {};
  const rol = state.perfil.perfil;
  if (!(rol === 'Administrador' || rol === 'Jefe de Área Relacionamiento')) {
    state.fundosAraucoInfo = { ok: true, count: 0 }; return;
  }
  let query = supabaseClient.from('v_fundos_arauco').select('id, propietario, nombre_fundo, sup_ha, area, sector, geometry');
  if (state.areaActiva) { query = query.eq('area', state.areaActiva); }
  else { const idc = idComunaActiva_(); if (!idc) { state.fundosAraucoInfo = { ok: true, count: 0 }; return; } query = query.eq('id_comuna', idc); }
  const { data, error } = await query;
  if (window.__DEBUG_CAPAS__) console.log('[Fundos Arauco] area:', state.areaActiva, '| filas:', (data||[]).length, '| error:', error);
  if (error) { state.fundosAraucoInfo = { ok: false, count: 0, error: error.message }; return; }
  (data || []).forEach(r => {
    if (!r.geometry) return;
    const area = r.area || 'Sin área'; const sector = r.sector || 'Sin sector';
    const capa = L.geoJSON(r.geometry, {
      style: { color: '#6D28D9', weight: 1.5, fillColor: '#A78BFA', fillOpacity: 0.2 },
      onEachFeature: (f, ly) => {
        ly.bindPopup(
          '<div class="popup-title">' + escapeHtml_(r.nombre_fundo || 'Fundo') + '</div>' +
          '<div class="popup-row">🗺️ ' + escapeHtml_(r.area || '—') + ' · ' + escapeHtml_(r.sector || '—') + '</div>' +
          '<div class="popup-row">📐 ' + (r.sup_ha ? Number(r.sup_ha).toFixed(1) + ' ha' : '—') + '</div>' +
          '<div class="popup-row">🏢 ' + escapeHtml_(r.propietario || '—') + '</div>'
        );
        if (r.nombre_fundo && state.mostrarEtiquetasFundosArauco) {
          ly.bindTooltip(escapeHtml_(String(r.nombre_fundo)), { permanent: true, direction: 'center', className: 'map-label label-fundo' });
        }
      },
    });
    fundosAraucoLayer.addLayer(capa);
    if (!window.arbolFundosArauco[area]) window.arbolFundosArauco[area] = {};
    if (!window.arbolFundosArauco[area][sector]) window.arbolFundosArauco[area][sector] = [];
    window.arbolFundosArauco[area][sector].push(capa);
  });
  state.fundosAraucoInfo = { ok: true, count: (data || []).length };
  if (!state.fundosAraucoSectoresOcultos) state.fundosAraucoSectoresOcultos = {};
}

