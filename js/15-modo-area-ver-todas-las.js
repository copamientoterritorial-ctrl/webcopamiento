/* ============ MODO ÁREA: ver todas las capas del área completa ============
 * state.areaActiva: nombre del área. Si tiene valor, las capas filtran por 'area'
 * (todo el área, varias comunas); si es null, filtran por comuna. */
state.areaActiva = null;

// Perfiles que pueden usar el Calendario de Turnos y la Propagación de copamiento:
// Administrador (todo) y Jefe de Área Relacionamiento (sus áreas).
// Se normaliza el texto del perfil (tildes/mayúsculas/sufijo) para tolerar
// pequeñas variaciones del valor guardado en la BD.
function esJefeAreaPerfil_(p) {
  const t = String(p || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  return t.startsWith('jefe de area');
}
function puedeGestionarTurnos_() {
  return !!state.perfil && (state.perfil.perfil === 'Administrador' || esJefeAreaPerfil_(state.perfil.perfil));
}

/* ============ PERMISOS POR USUARIO (11-10-2026, SQL 83) ============
 * El Administrador puede RESTRINGIR por usuario lo que su perfil ya le da:
 * módulos ('no' | 'ver' | 'editar') y capas visibles. Sin fila en
 * permisos_usuario = todo lo de su perfil. La base de datos bloquea además las
 * ediciones (trigger trg_permiso_modulo en las tablas de cada módulo). */
const MODULOS_PERMISO = [
  { k: 'dashboard',            nombre: '📊 Dashboard',                          niveles: ['no', 'ver'] },
  { k: 'mapa',                 nombre: '🗺️ Mapa (visor de capas)',               niveles: ['no', 'ver'] },
  { k: 'planificador_mapa',    nombre: '🧭 Mapa en Modo Planificador (escenarios)', niveles: ['no', 'ver', 'editar'] },
  { k: 'periodo_critico',      nombre: '🔥 Periodo Crítico',                    niveles: ['no', 'ver', 'editar'] },
  { k: 'informe',              nombre: '📄 Informe de copamiento',              niveles: ['no', 'ver'] },
  { k: 'turnos',               nombre: '📅 Turnos de Recursos',                 niveles: ['no', 'ver', 'editar'] },
  { k: 'planificador_grafico', nombre: '🌲 Planificador gráfico de Recursos',   niveles: ['no', 'ver', 'editar'] },
  { k: 'patrullajes',          nombre: '🚓 Gestión Patrullajes SIGEI (Prevención)', niveles: ['no', 'ver', 'editar'] },
  { k: 'prioridad',            nombre: '🎯 Comunas Prioritarias (Prevención)',  niveles: ['no', 'ver', 'editar'] },
];
const CAPAS_PERMISO = [
  { k: 'limites',       nombre: 'Límites comunales' },
  { k: 'areasPobladas', nombre: 'Áreas Pobladas' },
  { k: 'redVial',       nombre: 'Red Vial (MOP)' },
  { k: 'zonasAlerta',   nombre: 'Zonas de alerta CMPC' },
  { k: 'capasZona',     nombre: 'Capas por zona (Fundos, Red Vial CMPC, Áreas de Relacionamiento, Recursos)' },
  { k: 'patrullaje',    nombre: 'Patrullaje' },
  { k: 'appMovil',      nombre: 'App Móvil — Patrulleros' },
  { k: 'redPrevencion', nombre: 'Red de Prevención Comunitaria' },
  { k: 'alertas',       nombre: 'Escenarios (Normal / Amarilla / Roja)' },
  { k: 'incendios',     nombre: 'Incendios SIDCO y amebas' },
];
const ORDEN_NIVEL_PERMISO = { no: 0, ver: 1, editar: 2 };
state.permisosUsuario = null;   // { modulos: {...}, capas_ocultas: [...] } o null

/** Lo máximo que permite el PERFIL en cada módulo (las restricciones nunca suben de aquí). */
function nivelMaximoPerfil_(perfil, k) {
  perfil = perfilBase_(perfil);   // Subgerente y GRT = Jefe de Área (perfil técnico)
  const esAdmin = perfil === 'Administrador', esJefe = esJefeAreaPerfil_(perfil), esGRD = perfil === 'GRD';
  // Perfil GRD (definido 11-10-2026): Dashboard, Mapa, escenarios e informe solo VER;
  // Periodo Crítico EDITAR; sin Turnos, sin Planificador gráfico y sin Patrullajes.
  // Mantener igual que nivel_maximo_perfil_() en SQL 85.
  switch (k) {
    case 'dashboard': case 'mapa': case 'informe': return 'ver';
    // GRD (14-10-2026): edita escenarios, pero SOLO la Alerta Amarilla (puedePlanificarEscenario_; SQL 98 en la BD)
    case 'planificador_mapa': return (esAdmin || esJefe || esGRD) ? 'editar' : 'ver';
    case 'periodo_critico': return (esAdmin || esJefe || esGRD) ? 'editar' : 'ver';
    case 'turnos': return (esAdmin || esJefe) ? 'editar' : 'no';
    case 'planificador_grafico': return (esAdmin || esJefe) ? 'editar' : (esGRD ? 'no' : 'ver');
    // 17-10-2026: el Jefe de Área edita todo (igual que el Administrador) — SQL 118
    // Comunas Prioritarias: el Administrador ajusta y guarda los rangos; el Jefe de Área consulta.
    case 'patrullajes': return (esAdmin || esJefe) ? 'editar' : 'no';
    case 'prioridad': return (esAdmin || esJefe) ? 'editar' : 'no';
  }
  return 'no';
}
/** Capas que un PERFIL no ve nunca (además de las que el Administrador oculte por usuario). */
const CAPAS_OCULTAS_PERFIL = { 'GRD': ['capasZona', 'patrullaje'] };
function capasOcultasPerfil_(perfil) { return CAPAS_OCULTAS_PERFIL[perfil] || []; }
/** Nivel efectivo = mínimo(máximo técnico del perfil, permiso del PERFIL (SQL 119), restricción del USUARIO (SQL 83)). */
function nivelPermiso_(k) {
  let nivel = nivelMaximoPerfil_(state.perfil && state.perfil.perfil, k);
  [state.permisosPerfilRol, state.permisosUsuario].forEach(p => {
    const v = p && p.modulos && p.modulos[k];
    if (v && ORDEN_NIVEL_PERMISO[v] != null && ORDEN_NIVEL_PERMISO[v] < ORDEN_NIVEL_PERMISO[nivel]) nivel = v;
  });
  return nivel;
}
function puedeVerModulo_(k) { return nivelPermiso_(k) !== 'no'; }
function puedeEditarModulo_(k) { return nivelPermiso_(k) === 'editar'; }
function capaOcultaUsuario_(k) {
  const p = state.permisosUsuario, r = state.permisosPerfilRol;
  if (capasOcultasPerfil_(state.perfil && state.perfil.perfil).includes(k)) return true;
  if (r && Array.isArray(r.capas_ocultas) && r.capas_ocultas.includes(k)) return true;   // permisos del PERFIL (SQL 119)
  return !!(p && Array.isArray(p.capas_ocultas) && p.capas_ocultas.includes(k));
}
async function cargarMisPermisos_() {
  state.permisosUsuario = null;
  // Permisos del PERFIL (masivos, SQL 119): también al simular otro perfil
  state.permisosPerfilRol = null;
  try {
    const { data: pr, error: ePr } = await supabaseClient.from('permisos_perfil').select('modulos, capas_ocultas').eq('perfil', perfilEfectivo_()).maybeSingle();
    if (!ePr && pr) state.permisosPerfilRol = pr;
  } catch (e) { /* sin el SQL 119: permisos del perfil fijos */ }
  try {
    // Simulando otro perfil ("Ver como…"): se prueban los límites del PERFIL, sin restricciones propias.
    if (!state.user || state.simulacion) return;
    const { data, error } = await supabaseClient.from('permisos_usuario')
      .select('modulos, capas_ocultas').eq('perfil_id', state.user.id).maybeSingle();
    if (!error && data) state.permisosUsuario = data;
  } catch (e) { /* sin el SQL 83: permisos solo por perfil */ }
}

/* 🧩 Menús del sistema y QUIÉN los ve (19-10-2026). FUENTE ÚNICA: la usan los menús (aplicarPermisosMenu_) y
 * Administración › 🧩 Módulos por perfil, que la evalúa simulando cada perfil. Al agregar un menú, agregarlo AQUÍ.
 *   ver()   → si el menú aparece · nivel() → 'editar' | 'ver' (solo si ver()) · nota() → aclaración opcional */
const MENU_MODULOS = [
  { id: 'tab-dashboard', grupo: '📊 Dashboard', nombre: 'Dashboard', ver: () => puedeVerModulo_('dashboard'), nivel: () => 'ver' },
  { id: 'tab-seguimiento', grupo: '📈 Seguimiento', nombre: 'Seguimiento de subgerencias', ver: () => puedeSeguimiento_(), nivel: () => 'ver',
    nota: () => sgModoAdmin_() ? 'Ambas subgerencias' : 'Su subgerencia' },
  { id: 'sub-mapa-visor', grupo: '🗺️ Gestión SIG', nombre: 'Planificador de Alertas (mapa)', ver: () => puedeVerModulo_('planificador_mapa') || puedeVerModulo_('mapa'),
    nivel: () => puedeEditarModulo_('planificador_mapa') && ['GRD', 'Administrador', 'Jefe de Área Relacionamiento'].includes(state.perfil && state.perfil.perfil) ? 'editar' : 'ver',
    nota: () => state.perfil && state.perfil.perfil === 'GRD' ? 'Edita Amarilla y Roja, sin CMPC' : (esAdminOJefe_() && state.perfil.perfil !== 'Administrador' ? 'Sus comunas/áreas' : '') },
  { id: 'sub-emergencia', grupo: '🗺️ Gestión SIG', nombre: 'Modo Emergencia (Periodo Crítico)', ver: () => puedeVerModulo_('periodo_critico'), nivel: () => nivelPermiso_('periodo_critico') },
  { id: 'sub-informe', grupo: '🗺️ Gestión SIG', nombre: 'Informe', ver: () => puedeVerModulo_('informe'), nivel: () => 'ver' },
  { id: 'tab-patrullajes', grupo: '🛡️ Prevención', nombre: 'Gestión Patrullajes SIGEI', ver: () => esAdminOJefe_() && puedeVerModulo_('patrullajes'), nivel: () => nivelPermiso_('patrullajes') },
  { id: 'tab-prioridad', grupo: '🛡️ Prevención', nombre: 'Comunas Prioritarias', ver: () => puedeVerModulo_('prioridad'), nivel: () => nivelPermiso_('prioridad') },
  { id: 'tab-riesgo', grupo: '🛡️ Prevención', nombre: 'Acciones de Riesgo', ver: () => puedeAccionesRiesgo_(), nivel: () => 'editar',
    nota: () => state.perfil.perfil === 'Administrador' ? '' : 'Sus áreas' },
  { id: 'tab-implementacion', grupo: '🛡️ Prevención', nombre: 'Implementación por comuna', ver: () => puedeImplementacion_(), nivel: () => imPuedeEditar_() ? 'editar' : 'ver' },
  { id: 'tab-appreportes', grupo: '🛡️ Prevención', nombre: 'App de Patrullaje (en vivo y reportes)', ver: () => puedeReportesApp_(), nivel: () => 'editar' },
  { id: 'tab-bosques', grupo: '🛡️ Prevención', nombre: 'Gestión Bosque Recreativo', ver: () => puedeBosques_(), nivel: () => 'editar',
    nota: () => state.perfil.perfil === 'Administrador' ? '' : 'Su alcance' },
  { id: 'tab-turnos', grupo: '🌲 Planificador CMPC', nombre: 'Calendario de Turnos', ver: () => puedeVerModulo_('turnos'),
    nivel: () => puedeGestionarTurnos_() && puedeEditarModulo_('turnos') ? 'editar' : 'ver' },
  { id: 'tab-turnosgestor', grupo: '🌲 Planificador CMPC', nombre: 'Turnos de Gestores de relacionamiento', ver: () => puedeTurnosGestores_(),
    nivel: () => state.esGRT ? 'ver' : 'editar', nota: () => state.perfil && state.perfil.perfil === 'Administrador' ? '' : (state.esGRT ? 'Solo ve' : 'Sus áreas') },
  { id: 'tab-planificador', grupo: '🌲 Planificador CMPC', nombre: 'Planificador gráfico', ver: () => puedeVerModulo_('planificador_grafico'), nivel: () => nivelPermiso_('planificador_grafico') },
  { id: 'tab-tablero', grupo: '🌲 Planificador CMPC', nombre: 'Tablero de Recursos', ver: () => puedeVerModulo_('planificador_grafico'), nivel: () => 'ver' },
  { id: 'tab-gestion', grupo: '🌲 Planificador CMPC', nombre: 'Gestión de Recursos', ver: () => puedeGestionRecursos_(), nivel: () => 'editar' },
  { id: 'tab-agricultores', grupo: '🌾 Agricultores', nombre: 'Gestión Asociación Malleco (Tablero de seguimiento)', ver: () => puedeAgricultores_(),
    nivel: () => agrPuedeRegistrar_() ? 'editar' : 'ver', nota: () => esAsociacion_() ? 'Registra; meta solo escuelas' : (esAdminPerfil_() ? '' : 'Área Victoria') },
  { id: 'tab-admin', grupo: '⚙️ Administración', nombre: 'Administración del sistema', ver: () => !!(state.perfil && state.perfil.perfil === 'Administrador'), nivel: () => 'editar' },
];
/** ¿Se ve el menú? La Asociación de Agricultores ve SOLO 🌾 Agricultores. */
function menuVisible_(m) {
  if (esAsociacion_() && m.grupo !== '🌾 Agricultores') return false;
  return !!m.ver();
}

/** Muestra u oculta menús y opciones según los permisos efectivos. */
function aplicarPermisosMenu_() {
  const ver = (id, visible) => { const el = document.getElementById(id); if (el) el.style.display = visible ? '' : 'none'; };
  MENU_MODULOS.forEach(m => ver(m.id, menuVisible_(m)));
  // Grupos: se ven si tienen al menos un menú visible
  ver('grupo-prevencion', MENU_MODULOS.some(m => m.grupo === '🛡️ Prevención' && menuVisible_(m)));
  ver('grupo-agricultores', MENU_MODULOS.some(m => m.grupo === '🌾 Agricultores' && menuVisible_(m)));
  // Botón 🔥 Crear Periodo Crítico dentro del mapa del Modo Emergencia
  document.body.classList.toggle('puede-crear-periodo', puedeEditarModulo_('periodo_critico') &&
    ['GRD', 'Administrador', 'Jefe de Área Relacionamiento'].includes(state.perfil && state.perfil.perfil));
  ver('grupo-mapa', ['sub-mapa-visor', 'sub-emergencia', 'sub-informe']
    .some(id => { const el = document.getElementById(id); return el && el.style.display !== 'none'; }));
  ver('grupo-cmpc', MENU_MODULOS.some(m => m.grupo === '🌲 Planificador CMPC' && menuVisible_(m)));
  actualizarBotonPlanificar_();
  ajustarMenuCompacto_();
}

/** Compacta el menú superior por etapas (nav-c1…c4) solo lo necesario para que las pestañas quepan sin desbordar.
 *  Se recalcula al cambiar el tamaño de la ventana, la vista o los menús visibles. En móvil (≤ 600 px) manda la hamburguesa. */
let menuCompactoPend_ = false;
function ajustarMenuCompacto_() {
  if (menuCompactoPend_) return;
  menuCompactoPend_ = true;
  requestAnimationFrame(() => {
    menuCompactoPend_ = false;
    const tabs = document.getElementById('vista-tabs'), b = document.body, ETAPAS = ['nav-c1', 'nav-c2', 'nav-c3', 'nav-c4'];
    ETAPAS.forEach(c => b.classList.remove(c));
    if (!tabs || window.innerWidth <= 600) return;
    const desborda = () => tabs.scrollWidth > tabs.clientWidth + 1;
    for (const c of ETAPAS) { if (!desborda()) break; b.classList.add(c); }
  });
}
window.addEventListener('resize', ajustarMenuCompacto_);

/** Botón ✏️ Planificar según el modo del mapa:
 *   Planificador de Alertas → escenarios Normal / Amarilla / Roja (+ propagar, exportar)
 *   Modo Emergencia         → editar el copamiento del Periodo Crítico activo */
function puedeUsarPlanificar_() {
  if (!state.perfil || !['GRD', 'Administrador', 'Jefe de Área Relacionamiento'].includes(state.perfil.perfil)) return false;
  if (state.modoMapa === 'planificador') return puedeEditarModulo_('planificador_mapa');
  if (state.modoMapa === 'emergencia') return puedeEditarModulo_('periodo_critico');
  return false;
}
/** ¿Puede el usuario planificar (crear/editar/eliminar) en este escenario?
 *  Administrador y Jefe de Área: los tres. GRD: Alerta Amarilla y Roja (17-10-2026; antes solo Amarilla). */
function puedePlanificarEscenario_(escenario) {
  const p = state.perfil && state.perfil.perfil;
  if (!puedeEditarModulo_('planificador_mapa')) return false;
  if (p === 'Administrador' || esJefeAreaPerfil_(p)) return true;
  if (p === 'GRD') return escenario === 'Amarilla' || escenario === 'Roja';   // 17-10-2026: también Roja (SQL 120)
  return false;
}
function actualizarBotonPlanificar_() {
  const btn = document.getElementById('btn-planificar');
  if (!btn) return;
  const ver = (id, v) => { const el = document.getElementById(id); if (el) el.style.display = v ? 'flex' : 'none'; };
  const alertas = state.modoMapa === 'planificador', emergencia = state.modoMapa === 'emergencia';
  [['plan-verde', 'Verde'], ['plan-amarilla', 'Amarilla'], ['plan-roja', 'Roja']].forEach(([id, esc]) => ver(id, alertas && puedePlanificarEscenario_(esc)));
  ver('plan-exportar', alertas);
  ver('plan-propagar-copamiento', alertas && puedePropagar_() && puedeEditarModulo_('planificador_mapa'));
  ver('plan-periodo', emergencia);
  btn.title = emergencia ? 'Editar el copamiento del Periodo Crítico' : 'Planificar escenarios';
  btn.style.display = puedeUsarPlanificar_() ? 'flex' : 'none';
  if (!puedeUsarPlanificar_()) { const p = document.getElementById('planificar-panel'); if (p) p.classList.remove('show'); }
}

/** Oculta del panel de capas las secciones que el usuario no puede ver. */
function aplicarPermisosCapas_(c) {
  const p = state.permisosUsuario;
  // Capas ocultas = las que el Administrador restringió + las que no son del ambiente
  // del mapa actual (en Modo Emergencia no van los escenarios Normal / Amarilla / Roja).
  const ocultas = new Set((p && Array.isArray(p.capas_ocultas)) ? p.capas_ocultas : []);
  capasOcultasPerfil_(state.perfil && state.perfil.perfil).forEach(k => ocultas.add(k));   // las del perfil (p. ej. GRD)
  if (state.modoMapa === 'emergencia') ocultas.add('alertas');
  if (!ocultas.size || !c) return;
  const SECCIONES = [['Capas por zona', 'capasZona'], ['Patrullaje', 'patrullaje'], ['App Móvil', 'appMovil'],
    ['Red de Prevención', 'redPrevencion'], ['Alertas Territoriales', 'alertas'], ['Incendios', 'incendios']];
  let seccion = null, previa = null;
  Array.from(c.children).forEach(el => {
    let k = null;
    if (el.classList.contains('section-label')) {
      const s = SECCIONES.find(([txt]) => el.textContent.startsWith(txt));
      seccion = s ? s[1] : null; k = seccion;
    } else if (seccion) k = seccion;
    else if (el.querySelector('#toggle-limite-comunal, #chk-limites-raiz')) k = 'limites';
    else if (el.querySelector('[data-layer="__areasPobladas"]')) k = 'areasPobladas';
    else if (el.querySelector('#toggle-zonas-alerta') || el.classList.contains('za-leyenda')) k = 'zonasAlerta';
    else if (el.querySelector('#toggle-red-vial') || el.classList.contains('rv-leyenda')) k = 'redVial';
    else if (el.classList.contains('layer-empty-msg')) k = previa;
    previa = k;
    if (k && ocultas.has(k)) el.style.display = 'none';
  });
}

// Perfiles que pueden PROPAGAR copamiento (escalonado y por entidad):
// Administrador, Jefe de Área Relacionamiento y GRD.
/** 17-10-2026: el Jefe de Área tiene los mismos permisos de edición que el Administrador en todos los módulos
 *  operativos (no en el panel de Administración: usuarios, instituciones, permisos). */
function esAdminOJefe_() { const p = state.perfil && state.perfil.perfil; return p === 'Administrador' || esJefeAreaPerfil_(p); }
function puedePropagar_() {
  return !!state.perfil && ['Administrador', 'Jefe de Área Relacionamiento', 'GRD'].includes(state.perfil.perfil);
}

// Áreas disponibles para el usuario (Admin: las 14; Jefe de Área: las suyas)
function areasDisponibles_() {
  if (state.perfil.perfil === 'Administrador') return (state.areasCatalogo || []).slice().sort();
  return (state.misAreasIds || []).slice().sort();
}

function poblarSelectorArea_() {
  const sel = document.getElementById('area-select');
  if (!sel) return;
  const areas = areasDisponibles_();
  // Visible solo para Admin y Jefe de Área con al menos un área
  if (!(state.perfil.perfil === 'Administrador' || state.perfil.perfil === 'Jefe de Área Relacionamiento') || !areas.length) {
    sel.style.display = 'none'; return;
  }
  sel.style.display = 'inline-block';
  if (sel.options.length === 0) {
    sel.innerHTML = '<option value="">🧭 Área: todas mis comunas</option>' + areas.map(a => '<option value="' + escapeHtml_(a) + '">🧭 Área: ' + escapeHtml_(aTitulo_(a)) + '</option>').join('');
    sel.onchange = () => {
      if (hayModoTrabajoActivo_()) {   // no cambiar de área a mitad de una planificación
        mostrarToast_('🔒 Termina o cancela ' + nombreModoTrabajo_() + ' antes de cambiar de área.');
        sel.value = state.areaActiva || ''; return;
      }
      activarModoArea_(sel.value || null);
    };
  }
}

/* ── Filtro por ÁREA de relacionamiento (13-10-2026) ──
 * Primer filtro del mapa: al elegir un área,
 *   · el selector de comunas muestra solo las comunas del área (v_area_comunas, SQL 71/93);
 *   · las comunas fuera del área se pintan con un gris muy transparente (máscara) y las
 *     del área quedan delineadas con su nombre;
 *   · en el Planificador de Alertas se ven también las entidades/rutas planificadas de las
 *     OTRAS comunas del área (atenuadas, solo consulta, con «Ir a la comuna»), para manejar
 *     recursos y rutas que cruzan a una comuna colindante.
 * La planificación se sigue haciendo sobre la comuna activa. */
state.areaFiltro = null;   // { area, ids: Set(comunas.id) }
let mascaraAreaLayer = null;

async function activarModoArea_(area) {
  state.areaActiva = area;
  const sel = document.getElementById('area-select');
  if (sel) { sel.classList.toggle('modo-area-on', !!area); sel.value = area || ''; }
  state.areaFiltro = null;
  if (area) {
    const clave = plNorm_(area).replace(/[^A-Z0-9]/g, '');   // = clave_area_red_vial_
    // Comunas que ADMINISTRA el área (SQL 94, reasignables en Comunas por área). Sin el 94: la territorial.
    let { data, error } = await supabaseClient.from('v_area_comunas_admin').select('id_comuna').eq('area_norm', clave);
    if (error) ({ data, error } = await supabaseClient.from('v_area_comunas').select('id_comuna').eq('area_norm', clave));
    if (error) mostrarToast_('No se pudieron leer las comunas del área: ' + error.message);
    const nums = new Set((data || []).map(x => Number(x.id_comuna)));
    state.areaFiltro = { area, ids: new Set((state.comunas || []).filter(c => nums.has(Number(c.id_comuna))).map(c => c.id)) };
  }
  refrescarSelectorComunas_();
  await dibujarMascaraArea_();
  // La comuna activa debe ser del área: si no lo es, se pasa a la primera comuna del área que el usuario pueda usar
  if (state.areaFiltro && !state.areaFiltro.ids.has(state.activeComunaId)) {
    const primera = comunasSeleccionablesUsuario_().filter(c => state.areaFiltro.ids.has(c.id))
      .sort((a, b) => a.comuna.localeCompare(b.comuna, 'es'))[0];
    if (primera) seleccionarComuna_(primera.id);
  } else if (state.activeComunaId) {
    loadPlanificacionRecursos_(state.activeComunaId);   // suma / quita las entidades de las otras comunas del área
  }
  // Recargar todas las capas con el nuevo criterio
  recargarCapasPorFiltro_();
  mostrarToast_(area ? ('🧭 Área ' + aTitulo_(area) + ': ' + (state.areaFiltro ? state.areaFiltro.ids.size : 0) + ' comuna(s). El resto se ve en gris.') : 'Sin filtro de área: todas tus comunas.');
}

/** Máscara gris (todo lo que está FUERA del área) + contorno y nombre de cada comuna del área. */
async function dibujarMascaraArea_() {
  if (!map) return;
  if (!map.getPane('mascaraAreaPane')) {
    map.createPane('mascaraAreaPane');
    map.getPane('mascaraAreaPane').style.zIndex = 350;          // bajo rutas y recursos (overlayPane = 400)
    map.getPane('mascaraAreaPane').style.pointerEvents = 'none';
  }
  if (mascaraAreaLayer) { map.removeLayer(mascaraAreaLayer); mascaraAreaLayer = null; }
  const f = state.areaFiltro;
  if (!f || !f.ids.size) return;
  const { data, error } = await supabaseClient.from('v_comunas_limite').select('id, comuna, geometry').in('id', [...f.ids]);
  if (error || !data || state.areaFiltro !== f) return;
  const huecos = [];
  const grupo = L.layerGroup();
  const aLL = anillo => anillo.map(p => [p[1], p[0]]);
  data.forEach(c => {
    let g = c.geometry; if (typeof g === 'string') { try { g = JSON.parse(g); } catch (e) { return; } }
    if (!g) return;
    if (g.type === 'Feature') g = g.geometry;
    const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
    polys.forEach(p => { if (p && p[0]) huecos.push(aLL(p[0])); });
    const contorno = L.geoJSON(g, { pane: 'mascaraAreaPane', interactive: false, style: { color: '#7C3AED', weight: 2, opacity: 0.85, dashArray: '7,5', fill: false } });
    contorno.addTo(grupo);
    try {
      const centro = contorno.getBounds().getCenter();
      L.marker(centro, { pane: 'mascaraAreaPane', interactive: false, keyboard: false,
        icon: L.divIcon({ className: 'mascara-area-etq', html: '<span>' + escapeHtml_(aTitulo_(c.comuna)) + '</span>', iconSize: [0, 0] }) }).addTo(grupo);
    } catch (e) {}
  });
  if (!huecos.length) return;
  // Polígono del mundo con un hueco por cada comuna del área: solo se agrisa lo de afuera
  const mundo = [[-89, -179.9], [-89, 179.9], [89, 179.9], [89, -179.9]];
  L.polygon([mundo, ...huecos], { pane: 'mascaraAreaPane', interactive: false, stroke: false, fillColor: '#475569', fillOpacity: 0.22 }).addTo(grupo);
  mascaraAreaLayer = grupo.addTo(map);
  try {
    const lim = L.featureGroup(grupo.getLayers().filter(l => l instanceof L.GeoJSON)).getBounds();
    if (lim.isValid()) map.fitBounds(lim, { padding: [30, 30] });
  } catch (e) {}
}

/** Desde la ventana de una entidad de otra comuna del área: cambia a esa comuna. */
function irAComunaArea_(comunaId) {
  map.closePopup();
  if (!comunasSeleccionablesUsuario_().some(c => c.id === comunaId)) { mostrarToast_('No tienes asignada esa comuna.'); return; }
  seleccionarComuna_(comunaId);
}

// Recarga las 5 capas según el filtro vigente (comuna o área)
function recargarCapasPorFiltro_() {
  Promise.all([loadFundosAraucoLayer_(), loadComiteLayer_(), loadFundosCmpcPostgis_(), loadRedVialLayer_(), loadRedVialCmpc_(true)]).then(() => {
    if (document.querySelector('.rail-btn.active') && document.querySelector('.rail-btn.active').dataset.tab === 'capas') renderTab('capas');
  });
  ampliarIncendiosZona_();   // incendios de la comuna/área + 10 km
  // Patrullaje y recursos por área
  if (typeof loadPatrullajeLayer_ === 'function') loadPatrullajeLayer_();
  if (typeof loadRecursosDisponiblesAreaLayer_ === 'function') loadRecursosDisponiblesAreaLayer_();
}

// Fundos CMPC desde PostGIS por comuna (reemplaza el flujo frágil por edge function)
async function loadFundosCmpcPostgis_() {
  fundosCmpcLayer.clearLayers();
  window.arbolFundos = {};
  fundosCmpcFeatureLayers = [];
  const rol = state.perfil.perfil;
  if (!(rol === 'Administrador' || rol === 'Jefe de Área Relacionamiento')) {
    state.fundosCmpcInfo = { ok: true, count: 0 }; return;
  }
  let query = supabaseClient.from('v_fundos_cmpc').select('id, propietario, nombre_fundo, sup_ha, area, sector, geometry');
  if (state.areaActiva) { query = query.eq('area', state.areaActiva); }
  else { const idc = idComunaActiva_(); if (!idc) { state.fundosCmpcInfo = { ok: true, count: 0 }; return; } query = query.eq('id_comuna', idc); }
  const { data, error } = await query;
  if (error) { state.fundosCmpcInfo = { ok: false, count: 0, error: error.message }; return; }
  (data || []).forEach(r => {
    if (!r.geometry) return;
    const area = r.area || 'Sin área'; const sector = r.sector || 'Sin sector';
    const capa = L.geoJSON(r.geometry, {
      style: { color: '#059669', weight: 1.5, fillColor: '#34D399', fillOpacity: 0.18 },
      onEachFeature: (f, ly) => {
        ly.bindPopup(
          '<div class="popup-title">' + escapeHtml_(r.nombre_fundo || 'Fundo') + '</div>' +
          '<div class="popup-row">🗺️ ' + escapeHtml_(r.area || '—') + ' · ' + escapeHtml_(r.sector || '—') + '</div>' +
          '<div class="popup-row">📐 ' + (r.sup_ha ? Number(r.sup_ha).toFixed(1) + ' ha' : '—') + '</div>' +
          '<div class="popup-row">🏢 ' + escapeHtml_(r.propietario || '—') + '</div>'
        );
        if (r.nombre_fundo) {
          fundosCmpcFeatureLayers.push({ layer: ly, nombre: escapeHtml_(String(r.nombre_fundo)) });
          if (state.mostrarEtiquetasFundos) ly.bindTooltip(escapeHtml_(String(r.nombre_fundo)), { permanent: true, direction: 'center', className: 'map-label label-fundo' });
        }
      },
    });
    fundosCmpcLayer.addLayer(capa);
    if (!window.arbolFundos[area]) window.arbolFundos[area] = {};
    if (!window.arbolFundos[area][sector]) window.arbolFundos[area][sector] = [];
    window.arbolFundos[area][sector].push(capa);
  });
  state.fundosCmpcInfo = { ok: true, count: (data || []).length };
  if (!state.fundosSectoresOcultos) state.fundosSectoresOcultos = {};
}

// Comité: punto (manito) + área de influencia AMARRADOS por comite_id, por comuna.
// Jerarquía por comuna (como Áreas de Relacionamiento pero por comuna).
async function loadComiteLayer_() {
  comitePuntosLayer.clearLayers();
  comiteAreasLayer.clearLayers();
  window.comitesPorId = {}; // comite_id -> { punto, area }
  let query = supabaseClient.from('v_comite_por_comuna').select('comite_id, nombre_comite, area, sector, num_comite, punto_geom, area_geom, lat, lng');
  if (state.areaActiva) { query = query.eq('area', state.areaActiva); }
  else { const idc = idComunaActiva_(); if (!idc) { state.comiteInfo = { ok: true, count: 0 }; return; } query = query.eq('id_comuna', idc); }
  const { data, error } = await query;
  if (error) { state.comiteInfo = { ok: false, count: 0, error: error.message }; return; }
  // 19-10-2026: el área de influencia del comité se puede SUMAR AL COPAMIENTO (como las rutas SIGEI)
  const btnSumar = r => (r.area_geom && puedeTraspasarRutas_())
    ? '<div class="popup-actions"><button class="popup-btn" data-action="comite-a-alertas" data-id="' + escapeHtml_(String(r.comite_id)) + '" style="color:#7C3AED;">⏫ Sumar a alertas</button></div>' : '';
  const enlazarBtn = () => document.querySelectorAll('.popup-btn[data-action="comite-a-alertas"]').forEach(b => { b.onclick = () => abrirTraspasoComite_(b.dataset.id); });
  (data || []).forEach(r => {
    const reg = { punto: null, area: null, nombre: r.nombre_comite, datos: r };
    // Área de influencia
    if (r.area_geom) {
      const capaA = L.geoJSON(r.area_geom, { style: { color: '#EA580C', weight: 1.5, fillColor: '#FDBA74', fillOpacity: 0.2 } });
      capaA.bindPopup('<div class="popup-title">🖐️ ' + escapeHtml_(r.nombre_comite || 'Comité') + '</div><div class="popup-row">Área de influencia · Comité N° ' + (r.num_comite || r.comite_id) + '</div>' + btnSumar(r));
      capaA.on('popupopen', enlazarBtn);
      comiteAreasLayer.addLayer(capaA); reg.area = capaA;
    }
    // Punto con la manito
    if (r.lat != null && r.lng != null) {
      const m = L.marker([r.lat, r.lng], { icon: iconoManito });
      m.bindPopup('<div class="popup-title">🖐️ ' + escapeHtml_(r.nombre_comite || 'Comité') + '</div>' +
        '<div class="popup-row">Red de Prevención Comunitaria</div>' +
        '<div class="popup-row">Comité N° ' + (r.num_comite || r.comite_id) + (r.sector ? ' · ' + escapeHtml_(r.sector) : '') + '</div>' + btnSumar(r));
      m.on('popupopen', enlazarBtn);
      comitePuntosLayer.addLayer(m); reg.punto = m;
    }
    window.comitesPorId[r.comite_id] = reg;
  });
  state.comiteInfo = { ok: true, count: (data || []).length };
}

/* ============ RED VIAL DE CHILE (MOP) — estilo Google ============
 * Fuente: v_red_vial_recorte (SQL 69 + 70): tramos YA recortados en la BD a la
 * comuna + 10 km (SQL 72; ambito 'comuna', clave = id_comuna) o al área de
 * relacionamiento (ambito 'area', clave = área normalizada sin tildes).
 * Se pide solo al encender la capa y solo lo de la comuna/área activa.
 *
 * Simbología tipo Google Maps / Earth:
 *   · línea con borde (casing) + relleno, en 2 panes canvas (rápido con miles de tramos)
 *   · color por jerarquía: autopista (naranjo) > nacional (amarillo) >
 *     regional principal/provincial (amarillo claro) > comunal/acceso (blanco);
 *     ripio y tierra más delgados y con trazo discontinuo
 *   · grosor según zoom; las vías menores aparecen al acercarse
 *   · etiquetas con rol_label: escudo para rutas nacionales ("5", "181-CH"),
 *     placa para roles regionales ("R-86", "Q-45"); sin repetirse ni encimarse */
const redVialLayer = L.layerGroup();        // contenedor que se enciende/apaga
const redVialEtiquetasLayer = L.layerGroup();
state.redVialOn = false;
state.mostrarEtiquetasRedVial = true;
state.redVialInfo = { ok: true, count: 0, cargado: false };
let redVialClaveCargada_ = null;             // 'comuna:123' | 'area:MULCHEN'
let redVialTramos_ = [];                     // [{cat, casing, fill}]
let redVialCandidatosEtiqueta_ = [];         // [{latlng, texto, cat, escudo}]
let redVialRenderers_ = null;

const RED_VIAL_CATEGORIAS = {
  //            relleno     borde       ancho z13  zoom mín  etiqueta desde  orden
  // labelZ = minZ: el rol_label aparece junto con su camino (pedido 06-10-2026).
  // El declutter evita que se amontonen cuando hay muchas.
  autopista: { fill: '#F29E4C', casing: '#C26A1E', w: 6.5, minZ: 0,  labelZ: 0,  rank: 1, nombre: 'Autopista / doble calzada' },
  nacional:  { fill: '#FCD34D', casing: '#C9A227', w: 5.5, minZ: 0,  labelZ: 0,  rank: 2, nombre: 'Ruta nacional' },
  principal: { fill: '#FEF3B5', casing: '#C9B458', w: 4.5, minZ: 9,  labelZ: 9,  rank: 3, nombre: 'Regional principal / provincial' },
  comunal:   { fill: '#FFFFFF', casing: '#9AA3AD', w: 3.5, minZ: 11, labelZ: 11, rank: 4, nombre: 'Regional comunal / acceso' },
  ripio:     { fill: '#FFFFFF', casing: '#B8A88A', w: 2.8, minZ: 11, labelZ: 11, rank: 5, nombre: 'Ripio / grava', dash: '6,4' },
  tierra:    { fill: '#F5EFE3', casing: '#B8A88A', w: 2.2, minZ: 12, labelZ: 12, rank: 6, nombre: 'Tierra (suelo natural)', dash: '3,4' },
};

function categoriaRedVial_(r) {
  const cl = normalizarBusqueda_(r.clasificacion || '');
  const ca = normalizarBusqueda_(r.carpeta || '');
  if (ca.indexOf('doble calzada') >= 0 || normalizarBusqueda_(r.concesionado || '') === 'si') return 'autopista';
  if (cl.indexOf('camino nacional') === 0) return 'nacional';
  if (cl.indexOf('regional principal') >= 0 || cl.indexOf('regional provincial') >= 0) return 'principal';
  if (ca.indexOf('suelo natural') >= 0) return 'tierra';
  if (ca.indexOf('ripio') >= 0 || ca.indexOf('grava') >= 0) return 'ripio';
  return 'comunal';
}

/** Factor de grosor según zoom (z13 = 1), como Google: delgadas de lejos, anchas de cerca. */
function factorZoomRedVial_(z) { return Math.max(0.35, Math.min(2.4, Math.pow(2, (z - 13) * 0.4))); }

function estiloRedVial_(cat, z) {
  const c = RED_VIAL_CATEGORIAS[cat];
  const w = c.w * factorZoomRedVial_(z);
  // De lejos (z < 10) Google dibuja solo el color de la vía, sin borde.
  const conBorde = z >= 10;
  return {
    casing: { color: c.casing, weight: w + 2, opacity: conBorde ? 1 : 0, lineCap: 'round', lineJoin: 'round' },
    fill:   { color: conBorde ? c.fill : c.casing, weight: w, opacity: 1, lineCap: c.dash ? 'butt' : 'round', lineJoin: 'round',
              dashArray: conBorde ? (c.dash || null) : null },
  };
}

function asegurarPanesRedVial_() {
  if (redVialRenderers_) return redVialRenderers_;
  // Bajo las capas del sistema (overlayPane = 400) y sobre el mapa base.
  if (!map.getPane('redVialBorde')) { map.createPane('redVialBorde').style.zIndex = 380; }
  if (!map.getPane('redVialRelleno')) { map.createPane('redVialRelleno').style.zIndex = 381; }
  if (!map.getPane('redVialEtiquetas')) { const p = map.createPane('redVialEtiquetas'); p.style.zIndex = 590; p.style.pointerEvents = 'none'; }
  redVialRenderers_ = {
    borde: L.canvas({ pane: 'redVialBorde', padding: 0.3 }),
    relleno: L.canvas({ pane: 'redVialRelleno', padding: 0.3 }),
  };
  map.on('zoomend', () => { if (state.redVialOn) { aplicarZoomRedVial_(); declutterEtiquetasRedVial_(); } });
  return redVialRenderers_;
}

function claveRedVial_() {
  // Misma regla que clave_area_red_vial_ (SQL 71): sin tildes, mayúsculas y sin
  // espacios ni guiones ('Los Ríos - Los Lagos' → 'LOSRIOSLOSLAGOS').
  if (state.areaActiva) return { ambito: 'area', clave: plNorm_(state.areaActiva).replace(/[^A-Z0-9]/g, '') };
  const idc = idComunaActiva_();
  return idc != null ? { ambito: 'comuna', clave: String(idc) } : null;
}

/** Punto medio A LO LARGO de la línea (no el centro del rectángulo): ahí va la etiqueta. */
function puntoMedioLinea_(latlngs) {
  let total = 0; const tramos = [];
  for (let i = 1; i < latlngs.length; i++) { const d = latlngs[i - 1].distanceTo(latlngs[i]); tramos.push(d); total += d; }
  let mitad = total / 2;
  for (let i = 0; i < tramos.length; i++) {
    if (mitad <= tramos[i]) {
      const t = tramos[i] ? mitad / tramos[i] : 0, a = latlngs[i], b = latlngs[i + 1];
      return L.latLng(a.lat + (b.lat - a.lat) * t, a.lng + (b.lng - a.lng) * t);
    }
    mitad -= tramos[i];
  }
  return latlngs[Math.floor(latlngs.length / 2)];
}

/** Carga (o recarga) la red vial de la comuna/área activa. forzar = ignorar caché. */
async function loadRedVialLayer_(forzar) {
  const k = claveRedVial_();
  const clave = k ? k.ambito + ':' + k.clave : null;
  if (!state.redVialOn) { if (clave !== redVialClaveCargada_) { redVialClaveCargada_ = null; } return; }
  if (!forzar && clave && clave === redVialClaveCargada_) return;

  const rnd = asegurarPanesRedVial_();
  redVialLayer.clearLayers(); redVialEtiquetasLayer.clearLayers();
  redVialTramos_ = []; redVialCandidatosEtiqueta_ = [];
  ultimoSnapIman_ = null; // los índices del imán apuntan a los tramos anteriores
  redVialClaveCargada_ = clave;
  if (!k) { state.redVialInfo = { ok: true, count: 0, cargado: true }; return; }
  state.redVialInfo = { ok: true, count: 0, cargado: false };

  // Paginado: un área completa puede superar el límite de 1.000 filas por consulta.
  const filas = [];
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await supabaseClient.from('v_red_vial_recorte')
      .select('objectid, rol, rol_label, nombre_camino, clasificacion, carpeta, calzada, concesionado, km_i, km_f, geometry')
      .eq('ambito', k.ambito).eq('clave', k.clave)
      .order('objectid').range(desde, desde + 999);
    if (error) { state.redVialInfo = { ok: false, count: 0, cargado: true, error: 'Red vial: ' + error.message }; return; }
    filas.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  if (redVialClaveCargada_ !== clave) return; // cambió la comuna mientras cargaba

  const z = map.getZoom();
  filas.forEach(r => {
    const g = typeof r.geometry === 'string' ? JSON.parse(r.geometry) : r.geometry;
    if (!g || !g.coordinates) return;
    const partes = (g.type === 'LineString' ? [g.coordinates] : g.type === 'MultiLineString' ? g.coordinates : [])
      .map(p => p.map(c => L.latLng(c[1], c[0]))).filter(p => p.length >= 2);
    if (!partes.length) return;
    const cat = categoriaRedVial_(r);
    const est = estiloRedVial_(cat, z);
    const casing = L.polyline(partes, Object.assign({ renderer: rnd.borde, interactive: false }, est.casing));
    const fill = L.polyline(partes, Object.assign({ renderer: rnd.relleno }, est.fill));
    // Popup manual: mientras se dibuja, el clic sobre un camino es un vértice
    // (con imán), no una ficha.
    const fichaCamino =
      '<div class="popup-title">🛣️ ' + escapeHtml_(r.rol || r.rol_label || 'Camino') + '</div>' +
      (r.nombre_camino ? '<div class="popup-row">' + escapeHtml_(r.nombre_camino) + '</div>' : '') +
      '<div class="popup-row">🏷️ ' + escapeHtml_(r.clasificacion || '—') + '</div>' +
      '<div class="popup-row">🧱 ' + escapeHtml_(r.carpeta || '—') +
        (r.concesionado === 'Sí' ? ' · Concesionado' : '') + '</div>' +
      (r.km_i != null && r.km_f != null
        ? '<div class="popup-row">📏 km ' + (Number(r.km_i) / 1000).toFixed(1) + ' – ' + (Number(r.km_f) / 1000).toFixed(1) + '</div>' : '') +
      '<div class="popup-row" style="opacity:.6;font-size:10.5px;">Red Vial MOP</div>';
    fill.on('click', (ev) => {
      const dibujando = state.editandoForma || state.modoRegla ||
        ((state.editorMode || state.modoPlanificacion) && (state.dibujoModo === 'linea' || state.dibujoModo === 'area'));
      if (dibujando) return;
      L.popup().setLatLng(ev.latlng).setContent(fichaCamino).openOn(map);
    });
    redVialTramos_.push({ cat, casing, fill, partes, bounds: fill.getBounds() });

    if (r.rol_label) {
      const mas = partes.reduce((a, b) => (b.length > a.length ? b : a));
      redVialCandidatosEtiqueta_.push({
        latlng: puntoMedioLinea_(mas), texto: String(r.rol_label).trim(), cat,
        escudo: /^ruta\s/i.test(r.rol || '') || cat === 'nacional' || cat === 'autopista',
      });
    }
  });
  state.redVialInfo = { ok: true, count: redVialTramos_.length, cargado: true };
  aplicarZoomRedVial_();
  declutterEtiquetasRedVial_();
  if (state.redVialOn && !map.hasLayer(redVialLayer)) redVialLayer.addTo(map);
}

/** Grosor y visibilidad por jerarquía según el zoom actual. */
function aplicarZoomRedVial_() {
  const z = map.getZoom();
  redVialTramos_.forEach(t => {
    const visible = z >= RED_VIAL_CATEGORIAS[t.cat].minZ;
    if (!visible) { redVialLayer.removeLayer(t.casing); redVialLayer.removeLayer(t.fill); return; }
    const est = estiloRedVial_(t.cat, z);
    t.casing.setStyle(est.casing); t.fill.setStyle(est.fill);
    if (!redVialLayer.hasLayer(t.casing)) redVialLayer.addLayer(t.casing);
    if (!redVialLayer.hasLayer(t.fill)) redVialLayer.addLayer(t.fill);
  });
}

/** Escudo de ruta nacional (como la señalética chilena): blanco, borde oscuro,
 *  número al centro. "181-CH" → "181" con "CH" pequeño debajo. El ancho crece
 *  con el texto para que "5" y "160" se vean proporcionados. */
function svgEscudoRuta_(texto, cat) {
  const t = String(texto || '').trim();
  const m = t.match(/^(.+?)[-\s]?CH$/i);
  const numero = m ? m[1] : t;
  const sufijo = m ? 'CH' : '';
  // Medidas y trazo como el escudo de Google Maps: pequeño, blanco, borde y número negros.
  const largo = numero.length;
  const W = Math.max(18, Math.round(7 + largo * 6.6));
  const H = sufijo ? 25 : 21;
  const borde = '#202124';
  const fs = largo <= 2 ? 10.5 : largo <= 3 ? 9.5 : 8.5;
  // Contorno de escudo: arriba recto con hombros, costados que bajan a una punta.
  const escudo = (i) =>
    'M' + i + ' ' + (i + 2) + ' Q' + i + ' ' + i + ' ' + (i + 2) + ' ' + i +
    ' H' + (W - i - 2) + ' Q' + (W - i) + ' ' + i + ' ' + (W - i) + ' ' + (i + 2) +
    ' V' + (H * 0.46) +
    ' C' + (W - i) + ' ' + (H * 0.72) + ' ' + (W * 0.74) + ' ' + (H * 0.86) + ' ' + (W / 2) + ' ' + (H - i) +
    ' C' + (W * 0.26) + ' ' + (H * 0.86) + ' ' + i + ' ' + (H * 0.72) + ' ' + i + ' ' + (H * 0.46) + ' Z';
  return '<svg width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" aria-label="Ruta ' + escapeHtml_(t) + '">' +
    '<path d="' + escudo(0.75) + '" fill="#FFFFFF" stroke="' + borde + '" stroke-width="1.5"/>' +
    '<text x="' + (W / 2) + '" y="' + (sufijo ? H * 0.40 : H * 0.45) + '" text-anchor="middle" dominant-baseline="middle" ' +
      'font-family="Roboto,Arial,sans-serif" font-weight="700" font-size="' + fs + '" fill="' + borde + '">' + escapeHtml_(numero) + '</text>' +
    (sufijo ? '<text x="' + (W / 2) + '" y="' + (H * 0.68) + '" text-anchor="middle" dominant-baseline="middle" ' +
      'font-family="Roboto,Arial,sans-serif" font-weight="700" font-size="5.5" fill="' + borde + '">CH</text>' : '') +
    '</svg>';
}

/** Etiquetas como Google: primero las de mayor jerarquía; una misma ruta no se
 *  repite a menos de ~260 px y ninguna se encima con otra (~46 px). */
function declutterEtiquetasRedVial_() {
  redVialEtiquetasLayer.clearLayers();
  if (!state.redVialOn || !state.mostrarEtiquetasRedVial) { map.removeLayer(redVialEtiquetasLayer); return; }
  const z = map.getZoom();
  const puestas = [];
  // Zoom mínimo de las etiquetas: el elegido en el indicador de escala, o por jerarquía (Auto).
  const fijo = state.redVialEtiquetaZoom;
  redVialCandidatosEtiqueta_
    .filter(c => z >= (fijo != null ? fijo : RED_VIAL_CATEGORIAS[c.cat].labelZ))
    .sort((a, b) => RED_VIAL_CATEGORIAS[a.cat].rank - RED_VIAL_CATEGORIAS[b.cat].rank)
    .forEach(c => {
      const p = map.project(c.latlng, z);
      const choca = puestas.some(o => {
        const d = o.p.distanceTo(p);
        return d < 46 || (o.texto === c.texto && d < 260);
      });
      if (choca) return;
      puestas.push({ p, texto: c.texto });
      const html = c.escudo
        ? '<span class="rv-escudo rv-' + c.cat + '">' + svgEscudoRuta_(c.texto, c.cat) + '</span>'
        : '<span class="rv-placa rv-' + c.cat + '">' + escapeHtml_(c.texto) + '</span>';
      L.marker(c.latlng, {
        pane: 'redVialEtiquetas', interactive: false, keyboard: false,
        icon: L.divIcon({ className: 'rv-etiqueta', iconSize: null, html }),
      }).addTo(redVialEtiquetasLayer);
    });
  if (!map.hasLayer(redVialEtiquetasLayer)) redVialEtiquetasLayer.addTo(map);
}

async function toggleRedVial_() {
  state.redVialOn = !state.redVialOn;
  if (state.redVialOn) {
    redVialLayer.addTo(map);
    await loadRedVialLayer_();
    declutterEtiquetasRedVial_();
  } else {
    map.removeLayer(redVialLayer); map.removeLayer(redVialEtiquetasLayer);
  }
  // La CMPC cambia: con la Red Vial Chile oculta sus tramos traslapados; sin ella, los muestra.
  if (state.redVialCmpcOn) loadRedVialCmpc_(true);
  actualizarEscalaZoom_();
  if (document.querySelector('.rail-btn.active') && document.querySelector('.rail-btn.active').dataset.tab === 'capas') renderTab('capas');
}

