/* ============ ACTUALIZAR DATOS: botón manual + sincronización diaria ============
 * Vuelve a leer desde la BD todo lo que pudo cambiar (recursos, planificación,
 * rutas, alertas, catálogo de tipos) y la vista abierta, SIN recargar la página
 * ni las capas geográficas de la comuna (el mapa no se mueve).
 * Sincronización diaria: una vez al día a SYNC_DIARIA_HORA (hora local). Si el
 * equipo estuvo suspendido o la pestaña oculta, se hace al volver a ella. Si hay
 * un modo de trabajo activo o turnos sin guardar, se reintenta más tarde. */
const SYNC_DIARIA_HORA = 6;
const SYNC_REINTENTO_MS = 10 * 60 * 1000;
let actualizandoDatos_ = false;
let ultimaSyncMs_ = 0;
let timerSyncDiaria_ = null;

/** Momento de la sincronización diaria más reciente que ya debió ocurrir. */
function ultimoCorteSync_() {
  const d = new Date();
  d.setHours(SYNC_DIARIA_HORA, 0, 0, 0);
  if (d.getTime() > Date.now()) d.setDate(d.getDate() - 1);
  return d.getTime();
}

function programarSyncDiaria_(ms) {
  clearTimeout(timerSyncDiaria_);
  if (ms == null) {
    const prox = new Date();
    prox.setHours(SYNC_DIARIA_HORA, 0, 0, 0);
    if (prox.getTime() <= Date.now()) prox.setDate(prox.getDate() + 1);
    ms = Math.max(1000, prox.getTime() - Date.now());
  }
  timerSyncDiaria_ = setTimeout(syncDiariaPendiente_, ms);
}

async function syncDiariaPendiente_() {
  if (!state.perfil) return;
  if (ultimaSyncMs_ >= ultimoCorteSync_()) { programarSyncDiaria_(); return; }
  const ok = await actualizarDatos_('auto');
  programarSyncDiaria_(ok ? null : SYNC_REINTENTO_MS);
}

function iniciarSincronizacionDiaria_() {
  ultimaSyncMs_ = Date.now(); // recién entró: los datos están al día
  actualizarTituloBotonSync_();
  programarSyncDiaria_();
  if (!state._syncVisibilidad) {
    state._syncVisibilidad = true;
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') syncDiariaPendiente_();
    });
  }
}

function actualizarTituloBotonSync_() {
  const btn = document.getElementById('btn-actualizar-datos');
  if (!btn) return;
  const hh = String(SYNC_DIARIA_HORA).padStart(2, '0') + ':00';
  btn.title = 'Actualizar datos desde la base de datos' +
    (ultimaSyncMs_ ? '\nÚltima actualización: ' + new Date(ultimaSyncMs_).toLocaleString('es-CL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '') +
    '\nSincronización automática diaria a las ' + hh;
}

/** origen: 'manual' (botón) | 'auto' (diaria). Devuelve true si actualizó. */
async function actualizarDatos_(origen) {
  const auto = origen === 'auto';
  if (actualizandoDatos_ || !state.perfil) return false;
  if (hayModoTrabajoActivo_()) {
    if (!auto) mostrarToast_('🔒 Termina o cancela ' + nombreModoTrabajo_() + ' antes de actualizar.');
    return false;
  }
  if (turnosPendientes_.length || turnosGuardando_) {
    if (!auto) mostrarToast_('📅 Hay turnos sin guardar: guárdalos antes de actualizar.');
    return false;
  }

  actualizandoDatos_ = true;
  const btn = document.getElementById('btn-actualizar-datos');
  if (btn) { btn.classList.add('girando'); btn.disabled = true; }
  const esAdmin = state.perfil.perfil === 'Administrador';
  const comunaId = state.activeComunaId;
  const vista = state.vistaActual;
  let fallos = 0;
  const correr = (fn) => Promise.resolve().then(fn).catch((e) => { fallos++; console.error('actualizarDatos_:', e); });

  try {
    await correr(() => cargarTiposRecurso_(true));
    state.pl.cargado = false; // el Planificador relee al abrirse

    const tareas = [
      correr(() => loadRecursosDisponiblesAreaLayer_()),
      correr(() => loadPatrullajeLayer_()),
      correr(() => cargarCapasAlertaGlobales_()),
    ];
    if (comunaId) {
      tareas.push(correr(() => loadRecursos(comunaId, comunaRequestToken, null, true)));
      tareas.push(correr(() => loadPlanificacionRecursos_(comunaId)));
    }
    if (state.soloTurnoHoy) tareas.push(correr(() => cargarRecursosActivosHoy_()));
    if (esAdminOJefe_() && state.recursosComunaAdminOn) tareas.push(correr(() => loadRecursosComunaAdmin_()));
    if (esAdminOJefe_() && state.rutasComunaAdminOn) tareas.push(correr(() => loadRutasComunaAdmin_()));

    // La vista abierta
    if (vista === 'dashboard') tareas.push(correr(() => cargarDashboard_()));
    else if (vista === 'admin') tareas.push(correr(() => cargarSeccionAdmin_(state.adminSeccion || 'resumen')));
    else if (vista === 'patrullajes') tareas.push(correr(() => abrirGestionPatrullajes_()));
    else if (vista === 'prioridad') tareas.push(correr(() => recargarPrioridad_()));
    else if (vista === 'turnos' && state.turnosArea) tareas.push(correr(() => cargarRecursosTurnos_()));
    else if (vista === 'tablero') tareas.push(correr(() => abrirTablero_(true)));
    else if (vista === 'gestion') tareas.push(correr(() => abrirGestionRecursos_(true)));
    else if (vista === 'riesgo') tareas.push(correr(() => cargarAccionesRiesgo_()));
    else if (vista === 'appreportes') tareas.push(correr(() => cargarReportesApp_()));
    else if (vista === 'implementacion') tareas.push(correr(() => cargarImplementacion_()));
    else if (vista === 'bosques') tareas.push(correr(() => cargarBosques_(true)));
    else if (vista === 'seguimiento') tareas.push(correr(() => cargarSeguimiento_(true)));
    else if (vista === 'agricultores') tareas.push(correr(() => cargarAgricultores_()));
    else if (vista === 'turnosgestor') tareas.push(correr(() => cargarTurnosGestores_()));
    else if (vista === 'planificador') {
      tareas.push(correr(async () => {
        await cargarRecursosPlanificador_();
        poblarAreasPlanificador_();
        state.pl.rutas = [];
        await cargarRutasPlanificador_();
        renderPlanificador_();
      }));
    }
    await Promise.all(tareas);
    if (vista === 'mapa' && comunaId) renderTab(state.activeTab || 'capas');
  } finally {
    actualizandoDatos_ = false;
    if (btn) { btn.classList.remove('girando'); btn.disabled = false; }
  }

  ultimaSyncMs_ = Date.now();
  actualizarTituloBotonSync_();
  const hora = new Date(ultimaSyncMs_).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
  if (fallos) mostrarToast_('⚠️ Actualización con ' + fallos + ' error(es) (ver consola). ' + hora);
  else mostrarToast_((auto ? '🔄 Sincronización diaria: datos al día · ' : '✅ Datos actualizados · ') + hora);
  return true;
}

function mostrarVista_(vista, modoMapa) {
  if (esAsociacion_()) vista = 'agricultores';   // la Asociación de Agricultores solo tiene su tablero
  if (vista === 'agricultores' && !puedeAgricultores_()) vista = 'dashboard';
  if (vista === 'turnosgestor' && !puedeTurnosGestores_()) vista = 'dashboard';
  if (vista === 'admin' && state.perfil.perfil !== 'Administrador') vista = 'dashboard';
  if (vista === 'patrullajes' && !esAdminOJefe_()) vista = 'dashboard';   // 17-10-2026: también Jefe de Área
  // Turnos y Planificador gráfico: según perfil + permisos por usuario (SQL 83).
  if (vista === 'turnos' && !(puedeGestionarTurnos_() && puedeVerModulo_('turnos'))) vista = 'dashboard';
  if ((vista === 'planificador' || vista === 'tablero') && !puedeVerModulo_('planificador_grafico')) vista = 'dashboard';
  if (vista === 'gestion' && !puedeGestionRecursos_()) vista = 'dashboard';
  if (vista === 'prioridad' && !puedeVerModulo_('prioridad')) vista = 'dashboard';
  if (vista === 'riesgo' && !puedeAccionesRiesgo_()) vista = 'dashboard';
  if (vista === 'appreportes' && !puedeReportesApp_()) vista = 'dashboard';
  if (vista === 'implementacion' && !puedeImplementacion_()) vista = 'dashboard';
  if (vista === 'bosques' && !puedeBosques_()) vista = 'dashboard';
  if (vista === 'seguimiento' && !puedeSeguimiento_()) vista = 'dashboard';
  if (vista === 'patrullajes' && !puedeVerModulo_('patrullajes')) vista = 'dashboard';
  if (vista === 'dashboard' && !puedeVerModulo_('dashboard')) vista = 'mapa';
  // Mapa: 'planificador' (Planificador de Alertas), 'emergencia' (Modo Emergencia:
  // Periodo Crítico y copamiento) o 'visor' (solo capas, para quien no planifica).
  if (vista === 'mapa') {
    const puede = {
      planificador: puedeVerModulo_('planificador_mapa'),
      emergencia: puedeVerModulo_('periodo_critico'),
      visor: puedeVerModulo_('mapa'),
    };
    let modo = modoMapa || state.modoMapa || 'planificador';
    if (!puede[modo]) modo = ['planificador', 'emergencia', 'visor'].find(m => puede[m]) || null;
    if (!modo) vista = 'dashboard';
    else aplicarModoMapa_(modo);
  }
  state.vistaActual = vista;
  const dash = document.getElementById('dashboard');
  const adminP = document.getElementById('admin-panel');
  const patP = document.getElementById('patrullajes-panel');
  const turnosP = document.getElementById('turnos-panel');
  const planP = document.getElementById('planificador-panel');
  const sidebar = document.getElementById('sidebar');
  const collapse = document.getElementById('collapse-toggle');
  const sinComuna = document.getElementById('sin-comuna-overlay');
  const esDash = vista === 'dashboard';
  const esAdmin = vista === 'admin';
  const esPat = vista === 'patrullajes';
  const esTurnos = vista === 'turnos';
  const esPlan = vista === 'planificador';
  const esMapa = vista === 'mapa';
  dash.classList.toggle('show', esDash);
  adminP.classList.toggle('show', esAdmin);
  patP.classList.toggle('show', esPat);
  if (turnosP) turnosP.style.display = esTurnos ? 'block' : 'none';
  if (planP) planP.classList.toggle('show', esPlan);
  const prioP = document.getElementById('prioridad-panel');
  if (prioP) prioP.classList.toggle('show', vista === 'prioridad');
  const tabP = document.getElementById('tablero-panel');
  if (tabP) tabP.classList.toggle('show', vista === 'tablero');
  const gesP = document.getElementById('gestion-panel');
  if (gesP) gesP.classList.toggle('show', vista === 'gestion');
  const rgP = document.getElementById('riesgo-panel');
  if (rgP) rgP.classList.toggle('show', vista === 'riesgo');
  const arP = document.getElementById('appreportes-panel');
  if (arP) arP.classList.toggle('show', vista === 'appreportes');
  const imP = document.getElementById('implementacion-panel');
  if (imP) imP.classList.toggle('show', vista === 'implementacion');
  const brP = document.getElementById('bosques-panel');
  if (brP) brP.classList.toggle('show', vista === 'bosques');
  const sgP = document.getElementById('seguimiento-panel');
  if (sgP) sgP.classList.toggle('show', vista === 'seguimiento');
  const agP = document.getElementById('agricultores-panel');
  if (agP) agP.classList.toggle('show', vista === 'agricultores');
  const tgP = document.getElementById('turnosgestor-panel');
  if (tgP) tgP.classList.toggle('show', vista === 'turnosgestor');
  document.body.classList.toggle('modo-dashboard', !esMapa);
  actualizarBotonLogoMunicipal_();
  const esVisor = esMapa && state.modoMapa === 'visor';
  document.body.classList.toggle('con-comuna', !!state.activeComunaId);   // íconos del panel: solo con comuna
  sidebar.style.display = esMapa ? 'flex' : 'none';
  collapse.style.display = 'none';
  if (esMapa && window.innerWidth > 600) {
    // Desktop: el panel se despliega bajo los íconos 🗂️ Capas / 📍 Copamiento y
    // arranca cerrado. La pestaña Copamiento existe solo en el Modo Emergencia.
    if (state.modoMapa !== 'emergencia' && state.panelMapaTab === 'copamiento') { state.panelMapaAbierto = false; state.panelMapaTab = 'capas'; }
    sidebar.classList.toggle('collapsed', !state.panelMapaAbierto);
    state.activeTab = state.panelMapaTab;
    actualizarBotonesPanelMapa_();
    if (state.activeComunaId && state.panelMapaAbierto) renderTab(state.panelMapaTab);
  }
  if (sinComuna) sinComuna.style.display = (esMapa && !state.activeComunaId) ? 'flex' : 'none';
  marcarMenuActivo_(vista);
  setTimeout(ajustarMenuCompacto_, 0);   // los controles del mapa cambian el espacio disponible del menú
  if (esDash) cargarDashboard_();
  else if (esAdmin) cargarSeccionAdmin_(state.adminSeccion || 'resumen');
  else if (esPat) abrirGestionPatrullajes_();
  else if (esTurnos) abrirCalendarioTurnos_();
  else if (esPlan) abrirPlanificador_();
  else if (vista === 'prioridad') abrirPrioridad_();
  else if (vista === 'tablero') abrirTablero_();
  else if (vista === 'gestion') abrirGestionRecursos_();
  else if (vista === 'riesgo') abrirAccionesRiesgo_();
  else if (vista === 'appreportes') abrirReportesApp_();
  else if (vista === 'implementacion') abrirImplementacion_();
  else if (vista === 'bosques') abrirBosques_();
  else if (vista === 'seguimiento') abrirSeguimiento_();
  else if (vista === 'agricultores') abrirAgricultores_();
  else if (vista === 'turnosgestor') abrirTurnosGestores_();
  else setTimeout(() => { try { map.invalidateSize(); } catch (e) {} }, 60);

  // Mostrar/ocultar controles del mapa según la vista activa
  document.querySelectorAll('.controles-mapa').forEach(el => {
    if (!esMapa) {
      el.style.display = 'none';
    } else {
      // Al volver al mapa, restaurar display base pero dejar que cada
      // función de lógica propia decida si se muestra o no
      el.style.display = '';
    }
  });
  // Siempre re-evaluar visibilidad por rol al entrar al mapa
  // Switcher de escenarios: visible solo en Mapa y fuera de modo edición
  if (esMapa && !state.editorMode && !state.modoPlanificacion) mostrarSwitcherEscenarios_();
  else ocultarSwitcherEscenarios_();

  if (esMapa) {
    actualizarBotonLogoMunicipal_();
    actualizarEstrellaFavorito_();
    poblarSelectorArea_();
    const perfil = state.perfil && state.perfil.perfil;
    // Administrador: sin badge de comuna ni favorito. El filtro 🧭 Área SÍ se muestra (13-10-2026).
    if (perfil === 'Administrador') {
      ['comuna-badge','btn-fav-comuna'].forEach(id => {
        const el = document.getElementById(id); if (el) el.style.display = 'none';
      });
    }
    // GRD y Visor: sin área ni favorito
    if (perfil === 'GRD' || perfil === 'Visor') {
      ['area-select','btn-fav-comuna','comuna-select'].forEach(id => {
        const el = document.getElementById(id); if (el) el.style.display = 'none';
      });
    }
  }
}

/* ============ MENÚ SUPERIOR CON SUBMENÚS (11-10-2026) ============
 * Mapa ▾ (visor, Modo Planificador, informe, Periodo Crítico) y
 * Planificador CMPC ▾ (Turnos de Recursos, Planificador gráfico de Recursos). */
function marcarMenuActivo_(vista) {
  document.querySelectorAll('.vista-tab[data-vista]').forEach(b => b.classList.toggle('active', b.dataset.vista === vista));
  document.querySelectorAll('.vista-subitem[data-vista]').forEach(b => b.classList.toggle('active',
    b.dataset.vista === vista && (!b.dataset.modo || b.dataset.modo === state.modoMapa)));
  document.querySelectorAll('.vista-grupo').forEach(g => {
    const btn = g.querySelector('.vista-tab-grupo');
    if (btn) btn.classList.toggle('active', !!g.querySelector('.vista-subitem.active'));
  });
}
function cerrarSubmenus_() {
  document.querySelectorAll('.vista-grupo.abierto').forEach(g => g.classList.remove('abierto'));
}
function alternarSubmenu_(grupo) {
  const abierto = grupo.classList.contains('abierto');
  cerrarSubmenus_();
  if (abierto) return;
  grupo.classList.add('abierto');
  // La barra de pestañas tiene overflow (recorta lo absoluto): el submenú va fijo bajo su botón.
  const sub = grupo.querySelector('.vista-submenu'), btn = grupo.querySelector('.vista-tab-grupo');
  if (sub && btn && window.innerWidth > 600) {
    const r = btn.getBoundingClientRect();
    sub.style.top = (r.bottom + 6) + 'px';
    sub.style.left = Math.max(8, Math.min(r.left, window.innerWidth - 300)) + 'px';
  }
}
function iniciarMenuSuperior_() {
  document.querySelectorAll('.vista-tab-grupo').forEach(b => b.addEventListener('click', (ev) => {
    ev.stopPropagation(); alternarSubmenu_(b.closest('.vista-grupo'));
  }));
  document.querySelectorAll('.vista-subitem[data-vista]').forEach(b => b.addEventListener('click', () => {
    cerrarSubmenus_(); document.body.classList.remove('menu-movil-abierto');
    mostrarVista_(b.dataset.vista, b.dataset.modo || undefined);
    // Planificador de Alertas: entra con el menú Planificar desplegado. Modo Emergencia:
    // entra con el panel 📍 Copamiento abierto (periodos críticos y sus recursos).
    // Va después del clic actual, que si no lo cerraría el listener del documento.
    if (b.dataset.vista === 'mapa' && state.activeComunaId) {
      if (state.modoMapa === 'planificador' && puedeUsarPlanificar_()) {
        setTimeout(() => { const p = document.getElementById('planificar-panel'); if (p) p.classList.add('show'); }, 0);
      } else if (state.modoMapa === 'emergencia' && window.innerWidth > 600) {
        abrirPanelMapa_('copamiento');
      }
    }
  }));
  const subInf = document.getElementById('sub-informe');
  if (subInf) subInf.addEventListener('click', () => {
    cerrarSubmenus_(); document.body.classList.remove('menu-movil-abierto');
    abrirInformeCopamiento_();
  });
  const subPer = document.getElementById('sub-periodo');
  if (subPer) subPer.addEventListener('click', () => {
    cerrarSubmenus_(); document.body.classList.remove('menu-movil-abierto');
    abrirAsistentePeriodo_();
  });
  document.addEventListener('click', (ev) => { if (!ev.target.closest('.vista-grupo')) cerrarSubmenus_(); });
  window.addEventListener('resize', cerrarSubmenus_);
}

/* ============ MAPA: VISOR vs MODO PLANIFICADOR (11-10-2026) ============
 * Visor: mapa limpio con un solo botón 🗂️ Capas; al abrirlo aparecen las mismas
 * capas del Modo Planificador (cada una se ve recién al encenderla).
 * Modo Planificador: el mapa completo de siempre (Capas, Copamiento, Planificar,
 * informe y edición). */
// Por defecto el Mapa abre en planificación (Planificador de Alertas). El visor
// queda solo para usuarios sin acceso a la planificación (permisos SQL 83).
state.modoMapa = state.modoMapa || 'planificador';
state.panelMapaAbierto = false;   // panel desplegable bajo los íconos del mapa
state.panelMapaTab = 'capas';      // 'capas' | 'copamiento'
function aplicarModoMapa_(modo) {
  modo = ['planificador', 'emergencia', 'visor'].includes(modo) ? modo : 'planificador';
  // Al cambiar de modo se sale de cualquier edición del modo anterior
  if (state.modoMapa && state.modoMapa !== modo) {
    try {
      if (state.modoPlanificacion) salirModoPlanificacion_();
      else if (state.modoRecursosArea) salirModoRecursosArea_();
      else if (state.editorMode) toggleEditorMode();
    } catch (e) {}
  }
  state.modoMapa = modo;
  document.body.classList.toggle('mapa-visor', modo === 'visor');
  document.body.classList.toggle('mapa-emergencia', modo === 'emergencia');
  actualizarBotonPlanificar_();
  aplicarAmbienteMapa_();
}

/* ============ AMBIENTE DE CADA MAPA (11-10-2026) ============
 * Planificador de Alertas y Modo Emergencia son mapas distintos:
 *   · Alertas    → escenarios Normal / Amarilla / Roja, su simbología y su
 *                  sección de capas. Los periodos críticos NO se dibujan.
 *   · Emergencia → periodos críticos (copamiento en terreno) y su simbología.
 *                  Los escenarios NO se dibujan ni aparecen en Capas.
 * Lo que el usuario tenía encendido en cada mapa se guarda al salir y se
 * restaura al volver. */
function aplicarAmbienteMapa_() {
  if (typeof map === 'undefined' || !map) return;
  const ALERTAS = {
    verde:    [capaAlertaVerdeLayer,    planificacionRecursosVerdeLayer],
    amarilla: [capaAlertaAmarillaLayer, planificacionRecursosAmarillaLayer],
    roja:     [capaAlertaRojaLayer,     planificacionRecursosRojaLayer],
  };
  const panelSimb = document.getElementById('simbologia-flotante');
  state.alertaLayersOn = state.alertaLayersOn || { verde: false, amarilla: false, roja: false };
  state.periodoLayersOn = state.periodoLayersOn || {};

  if (state.modoMapa === 'emergencia') {
    // Fuera: escenarios (se guardan para volver a mostrarlos en Alertas)
    if (!state._alertasGuardadas) state._alertasGuardadas = Object.assign({}, state.alertaLayersOn);
    Object.keys(ALERTAS).forEach(k => {
      state.alertaLayersOn[k] = false;
      ALERTAS[k].forEach(l => { if (map.hasLayer(l)) map.removeLayer(l); });
    });
    // Dentro: periodos críticos (lo que tenía + el periodo activo la primera vez)
    if (state._periodosGuardados) { Object.assign(state.periodoLayersOn, state._periodosGuardados); state._periodosGuardados = null; }
    if (!state._emergenciaIniciada) {
      state._emergenciaIniciada = true;
      const act = periodoActivoActual_();
      if (act) state.periodoLayersOn[act.id] = true;
    }
    Object.keys(periodoLayers).forEach(k => {
      if (state.periodoLayersOn[k] && !map.hasLayer(periodoLayers[k])) periodoLayers[k].addTo(map);
    });
    renderSimbologiaFlotante_();
  } else {
    // Fuera: periodos críticos (se guardan para el Modo Emergencia)
    if (!state._periodosGuardados) state._periodosGuardados = Object.assign({}, state.periodoLayersOn);
    Object.keys(periodoLayers).forEach(k => {
      if (map.hasLayer(periodoLayers[k])) map.removeLayer(periodoLayers[k]);
      state.periodoLayersOn[k] = false;
    });
    // Dentro: escenarios que estaban encendidos
    if (state._alertasGuardadas) {
      Object.assign(state.alertaLayersOn, state._alertasGuardadas);
      state._alertasGuardadas = null;
      Object.keys(ALERTAS).forEach(k => {
        if (state.alertaLayersOn[k]) ALERTAS[k].forEach(l => { if (!map.hasLayer(l)) l.addTo(map); });
      });
      reaplicarFiltrosAlerta_();
    }
    // Simbología de los escenarios (si hay alguno encendido)
    const hayAlerta = Object.keys(ALERTAS).some(k => state.alertaLayersOn[k]);
    if (hayAlerta) mostrarSimbologiaEscenario_(); else if (panelSimb) panelSimb.style.display = 'none';
  }
  if (state.vistaActual === 'mapa' && state.panelMapaAbierto && state.panelMapaTab === 'capas') renderTab('capas');
}
/** Marca el ícono del panel abierto (🗂️ Capas o 📍 Copamiento). */
function actualizarBotonesPanelMapa_() {
  const capas = document.getElementById('btn-capas-visor'), cop = document.getElementById('btn-copamiento-mapa');
  if (capas) capas.classList.toggle('activo', state.panelMapaAbierto && state.panelMapaTab === 'capas');
  if (cop) cop.classList.toggle('activo', state.panelMapaAbierto && state.panelMapaTab === 'copamiento');
}
/** Abre el panel desplegable en la pestaña indicada (sin alternar). */
function abrirPanelMapa_(tab) {
  state.panelMapaTab = tab || 'capas';
  state.panelMapaAbierto = true;
  document.getElementById('sidebar').classList.remove('collapsed');
  document.querySelectorAll('.rail-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === state.panelMapaTab));
  actualizarBotonesPanelMapa_();
  if (state.activeComunaId) renderTab(state.panelMapaTab);
}
/** Ícono del mapa: si su panel ya está abierto lo cierra; si no, lo abre en esa pestaña. */
function alternarPanelMapa_(tab) {
  if (state.panelMapaAbierto && state.panelMapaTab === tab) {
    state.panelMapaAbierto = false;
    document.getElementById('sidebar').classList.add('collapsed');
    actualizarBotonesPanelMapa_();
    return;
  }
  abrirPanelMapa_(tab);
}
function alternarCapasVisor_() { alternarPanelMapa_('capas'); }
/** Gestión SIG ▸ Generar informe de copamiento: confirmación directa en un modal
 *  (sin abrir el panel izquierdo) y luego el informe en pantalla completa. */
function abrirInformeCopamiento_() {
  if (!state.activeComunaId) { mostrarToast_('⚠️ Selecciona una comuna para generar el informe.'); return; }
  document.getElementById('ci-comuna').textContent = nombreComuna_(state.activeComunaId);
  document.getElementById('confirmar-informe-overlay').classList.add('show');
}
function confirmarInformeCopamiento_() {
  document.getElementById('confirmar-informe-overlay').classList.remove('show');
  generarInforme_();
}

/* ============ PREVENCIÓN ▸ COMUNAS PRIORITARIAS (11-10-2026, SQL 86) ============
 * Matriz MATRIZ_PRIORIDAD_COMUNA_vfinal.xlsx llevada al sistema (tabla
 * comunas_prioridad, enlazada por id_comuna). Cada variable suma 0–3 puntos según
 * en qué rango cae su valor; el NIVEL (0–18) define la prioridad. Las barras
 * mueven los rangos y el mapa se recolorea al instante. Misma regla que el
 * Excel (verificado: 0 diferencias en 345 comunas):
 *   puntos = 0 si el valor es 0; si no, cuántos umbrales [1, 2, 3] alcanza. */
// 13-10-2026 (matriz v2): se quita «Ocurrencia trienio» y se agrega V6 · Comuna relevante.
// V5 y V6 no tienen rangos de valor (se asignan por clasificación), por eso no van en PRIO_VARS.
const PRIO_VARS = [
  { k: 'v1',  campo: 'v1_pct',        nombre: 'V1 · Presencia CMPC',        desc: '% de la superficie comunal con patrimonio CMPC',            max: 45,    step: 0.1,    fmt: v => fmtNumPrio_(v, 1) + '%' },
  { k: 'v2q', campo: 'v2_quinquenio', nombre: 'V2 · Ocurrencia quinquenio', desc: 'Incendios por temporada, promedio 2021-22 a 2025-26',     max: 260,   step: 0.5,    fmt: v => fmtNumPrio_(v, 1) + ' inc.' },
  { k: 'v3',  campo: 'v3_pct',        nombre: 'V3 · Intencionalidad',       desc: '% de incendios de causa intencional',                      max: 80,    step: 0.5,    fmt: v => fmtNumPrio_(v, 1) + '%' },
  { k: 'v4',  campo: 'v4_usd',        nombre: 'V4 · Valor económico CMPC',  desc: 'Valor del patrimonio CMPC en la comuna',                   max: 100e6, step: 250000, fmt: v => 'US$ ' + fmtNumPrio_(v / 1e6, 1) + ' M' },
];
// Tres niveles (más intenso = más prioridad), con relleno tenue en el mapa
const PRIO_NIVELES = [
  { k: 1, nombre: 'Alta',  color: '#166534', texto: '#FFFFFF' },
  { k: 2, nombre: 'Media', color: '#4ADE80', texto: '#14532D' },
  { k: 3, nombre: 'Baja',  color: '#DCFCE7', texto: '#166534' },
];
// Color e ícono propios de cada variable en el panel de rangos (para destacarlas)
const PRIO_ESTILO_VAR = {
  b:   { color: '#166534', ico: '🎯' },
  v1:  { color: '#15803D', ico: '🌲' },
  v2q: { color: '#EA580C', ico: '🔥' },
  v3:  { color: '#7C3AED', ico: '⚠️' },
  v4:  { color: '#0369A1', ico: '💲' },
  v5:  { color: '#CA8A04', ico: '⭐' },
  v6:  { color: '#DB2777', ico: '📌' },
};
const PRIO_OPACIDAD_MAPA = 0.62;   // relleno tenue para que se lean las referencias del mapa
// Niveles por puntaje (V1–V5 hasta 3 c/u + V6 hasta 6 → máximo 21). Con la matriz del 15-10-2026:
// Alta ≥ 17 · Media ≥ 10 reproducen el Excel tal cual (Alta 19–20, Media 11–16; Curanilahue 8 y Negrete 9 = Baja).
const PRIO_BANDAS_PROPUESTA = { alta: 17, media: 10 };
const PRIO_BANDAS_VERSION = 3;   // bandas guardadas antes (escala 0–18 o Media ≥ 9) se reemplazan
const PRIO_PARAM_EXCEL = {
  v1: { u: [1, 14.3, 28.66] }, v2q: { u: [0, 84.4, 168.8] },
  v3: { u: [1, 26.2, 52.3] }, v4: { u: [1, 32952696, 65905392] }, v5: { estrategico: 3, relevancia: 2 },
};
// V6 · Comuna relevante (matriz actualizada 15-10-2026): valor POR COMUNA. 6 = Mulchén, Collipulli,
// Lumaco y Angol; 5 = las otras 20. Las demás comunas valen 0. (Antes: 24 comunas con el mismo valor 3.)
const PRIO_V6_VERSION = 2;
const PRIO_V6_DEFECTO = {
  8305: 6, 9202: 6, 9207: 6, 9201: 6,
  9204: 5, 8310: 5, 9102: 5, 8304: 5, 8204: 5, 8303: 5, 8207: 5, 8203: 5, 8309: 5, 8306: 5,
  9211: 5, 8301: 5, 8109: 5, 9209: 5, 8105: 5, 8108: 5, 9206: 5, 9121: 5, 8313: 5, 8311: 5,
};
const PRIO_RELEVANTES_DEFECTO = Object.keys(PRIO_V6_DEFECTO).map(Number);
// Jefe de Área y Responsable por comuna (matriz). Se editan en el modal 📈 KPI de avance (Administrador).
const PRIO_RESPONSABLES_DEFECTO = {
  8305: ['Claudio León', 'Giovanni G.'], 9202: ['Rodrigo Alarcón', 'Giovanni G.'], 9201: ['Roberto Martenez', 'Felipe Cid'],
  9207: ['Fidel Curilem', 'Giovanni G.'], 8310: ['Beatriz Cárdenas', 'Felipe Cid'], 8304: ['Christian S.', 'Felipe Cid'],
  9204: ['Claudio Cid', 'Felipe Cid'], 9102: ['Claudio Colipan', 'Giovanni G.'], 8204: ['Hector Cruz', 'Giovanni G.'],
  8303: ['Christian S.', 'Felipe Cid'], 8309: ['José Luis Bouniot', 'Felipe Cid'], 8306: ['Mario Boques', 'Felipe Cid'],
  8207: ['Hector Cruz', 'Giovanni G.'], 8203: ['Hector Cruz', 'Giovanni G.'], 8301: ['Christian S.', 'Felipe Cid'],
  9211: ['Claudio Cid', 'Giovanni G.'], 8307: ['Mario Boques', 'Guido Yevenes'], 9209: ['Roberto Martenez', 'Felipe Cid'],
  9101: ['Claudio Cid', 'Giovanni G.'], 8109: ['Beatriz Cárdenas', 'Guido Yevenes'], 8205: ['Mario Boques', 'Guido Yevenes'],
  8105: ['Beatriz Cárdenas', 'Giovanni G.'], 8313: ['Christian S.', 'Felipe Cid'], 8311: ['José Luis Bouniot', 'Felipe Cid'],
};
state.prio = { cargado: false, datos: [], capas: {}, params: null, filtroNivel: null };

function fmtNumPrio_(v, dec) { return Number(v || 0).toLocaleString('es-CL', { minimumFractionDigits: 0, maximumFractionDigits: dec }); }
function clonPrio_(o) { return JSON.parse(JSON.stringify(o)); }
// Ponderación de cada variable en % (por defecto, la de la matriz: V1 20 · V2 40 · V3 10 · V4 20 · V5 5 · V6 15)
const PRIO_PESO_KEYS = ['v1', 'v2q', 'v3', 'v4', 'v5', 'v6'];
const PRIO_PESOS_DEFECTO = { v1: 20, v2q: 40, v3: 10, v4: 20, v5: 5, v6: 15 };
const PRIO_PESOS_IGUALES = { v1: 16.67, v2q: 16.67, v3: 16.67, v4: 16.67, v5: 16.66, v6: 16.66 };
const PRIO_VERSION = 2;   // parámetros guardados antes de la matriz v2: sus niveles y pesos no aplican
function paramsCompletosPrio_(p) {
  const base = clonPrio_(PRIO_PARAM_EXCEL);
  const r = Object.assign(base, clonPrio_(p || {}));
  const v2 = !!(p && p.version === PRIO_VERSION);
  r.version = PRIO_VERSION;
  r.bandas = Object.assign({}, PRIO_BANDAS_PROPUESTA, (v2 && p.bandas && p.bandas.version === PRIO_BANDAS_VERSION && p.bandas) || {}, { version: PRIO_BANDAS_VERSION });
  r.pesos = Object.assign({}, PRIO_PESOS_DEFECTO, (v2 && p.pesos) || {});
  // Método de cálculo de la prioridad: 'suma' (como la matriz Excel: Nivel = V1+…+V6) o 'ponderado' (pesos %)
  r.metodo = (v2 && p.metodo === 'ponderado') ? 'ponderado' : 'suma';
  // V6 por comuna: si lo guardado es anterior a la matriz del 15-10-2026, se usa la nueva tabla
  const v6g = v2 && p.v6 && p.v6.version === PRIO_V6_VERSION && p.v6.valores ? p.v6.valores : PRIO_V6_DEFECTO;
  r.v6 = { version: PRIO_V6_VERSION, valores: Object.assign({}, v6g) };
  r.v6.ids = Object.keys(r.v6.valores).filter(k => Number(r.v6.valores[k]) > 0).map(Number);
  r.responsables = Object.assign({}, PRIO_RESPONSABLES_DEFECTO, (v2 && p.responsables) || {});
  r.listas = Object.assign({}, (v2 && p.listas) || {});   // ✅ comunas marcadas como listas (KPI de avance)
  delete r.v2t;
  return r;
}
function sumaPesosPrio_(P) { return PRIO_PESO_KEYS.reduce((s, k) => s + (Number(P.pesos && P.pesos[k]) || 0), 0); }
/** Puntaje con 1 decimal si no es entero (la ponderación puede dar decimales). */
function fmtNivelPrio_(n) { return n == null ? '—' : (Number.isInteger(n) ? String(n) : fmtNumPrio_(n, 1)); }
function puntosPrio_(valor, u) { return (valor > 0) ? u.filter(t => valor >= t).length : 0; }
/** Puntos V6 de la comuna (0 si no es relevante). */
function v6ValorPrio_(c, P) { const V = (P && P.v6 && P.v6.valores) || {}; return Number(V[c.id_comuna] != null ? V[c.id_comuna] : V[String(c.id_comuna)]) || 0; }
function esRelevantePrio_(c, P) { return v6ValorPrio_(c, P) > 0; }
/** Solo el Administrador modifica variables, rangos, pesos y asignaciones; el Jefe de Área solo mira. */
function prioPuedeEditar_() { return puedeEditarModulo_('prioridad'); }
function calcularPrio_(c, P) {
  const r = {};
  PRIO_VARS.forEach(v => { r[v.k] = puntosPrio_(Number(c[v.campo]) || 0, P[v.k].u); });
  r.v5 = c.v5_tipo === 'Estratégicos' ? P.v5.estrategico : c.v5_tipo === 'Relevancia política' ? P.v5.relevancia : 0;
  r.v6 = v6ValorPrio_(c, P);                                         // valor de la matriz por comuna (5 / 6)
  r.nivelBruto = r.v1 + r.v2q + r.v3 + r.v4 + r.v5 + r.v6;          // suma simple (como el Excel)
  // Ponderado: Σ puntos × peso / Σ pesos × 6 (con partes iguales = suma simple)
  const suma = sumaPesosPrio_(P);
  r.nivelPond = suma > 0
    ? Math.round(PRIO_PESO_KEYS.reduce((s, k) => s + r[k] * (Number(P.pesos[k]) || 0), 0) / suma * 6 * 10) / 10
    : r.nivelBruto;
  // Por defecto (15-10-2026) la prioridad es la de la MATRIZ: Nivel = suma simple; Promedio = Nivel / 6
  r.nivel = P.metodo === 'ponderado' ? r.nivelPond : r.nivelBruto;
  r.promedio = Math.round(r.nivel / 6 * 10) / 10;
  r.prio = nivelAPrioridad_(r.nivel, P.bandas);
  r.prioSinPeso = nivelAPrioridad_(r.nivelBruto, P.bandas);          // referencia: el Excel (sin ponderar)
  r.prioPond = nivelAPrioridad_(r.nivelPond, P.bandas);
  return r;
}
/** Presencia CMPC (V1): hectáreas CMPC en la comuna ≥ mínimo del filtro. */
function presenciaCmpcPrio_(c) {
  const min = Number((document.getElementById('prio-cmpc-min') || {}).value);
  const ha = Number(c.v1_ha_cmpc) || 0;
  return isFinite(min) && min > 0 ? ha >= min : ha > 0;
}
function nivelAPrioridad_(nivel, b) {
  if (nivel >= b.alta) return 1;
  if (nivel >= b.media) return 2;
  return 3;
}
const prioInfo_ = k => PRIO_NIVELES.find(n => n.k === k) || PRIO_NIVELES[PRIO_NIVELES.length - 1];

async function abrirPrioridad_() {
  const est = document.getElementById('prio-estado');
  document.getElementById('prio-guardar').style.display = puedeEditarModulo_('prioridad') ? '' : 'none';
  // Presets de rangos: cambian variables → solo Administrador
  ['prio-preset-excel', 'prio-preset-percentil'].forEach(id => { document.getElementById(id).style.display = puedeEditarModulo_('prioridad') ? '' : 'none'; });
  if (!state.prio.mapa) {
    // El panel ya está visible (mostrarVista_ lo muestra antes de llamar aquí)
    state.prio.mapa = L.map('prio-map', { zoomControl: true, attributionControl: false, zoomSnap: 0.25 }).setView([-37.8, -72.6], 7);
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}', { maxZoom: 16 }).addTo(state.prio.mapa);
    // Referencias (nombres de comunas, ciudades y caminos) SOBRE los polígonos, sin capturar clics
    state.prio.mapa.createPane('prioReferencias');
    state.prio.mapa.getPane('prioReferencias').style.zIndex = 450;
    state.prio.mapa.getPane('prioReferencias').style.pointerEvents = 'none';
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}', { maxZoom: 16, pane: 'prioReferencias' }).addTo(state.prio.mapa);
    // El contenedor cambia de tamaño al mostrarse el panel y al llenarse el listado:
    // reajustar el mapa cada vez (y encuadrar la primera vez que tenga tamaño real).
    if (window.ResizeObserver) new ResizeObserver(() => {
      const m = state.prio.mapa; if (!m) return;
      m.invalidateSize();
      if (!state.prio.encuadrado && state.prio.grupo && state.prio.grupo.getLayers().length && document.getElementById('prio-map').clientWidth > 100) {
        state.prio.encuadrado = true;
        m.fitBounds(state.prio.grupo.getBounds(), { padding: [20, 20] });
      }
    }).observe(document.getElementById('prio-map-wrap'));
    iniciarListenersPrio_();
  }
  setTimeout(() => { try { state.prio.mapa.invalidateSize(); } catch (e) {} }, 80);
  if (state.prio.cargado) {
    // Hubo cambios mientras la vista estaba cerrada (aviso en tiempo real) o los datos
    // tienen más de 2 minutos: se refresca al volver a abrirla. Si los límites fallaron, se reintenta.
    if (state.prio.pendiente === 'todo' || state.prio.errorGeo) return recargarPrioridad_();
    if (state.prio.pendiente || Date.now() - (state.prio.resumenEn || 0) > 120000) { state.prio.pendiente = null; cargarResumenPrevencion_(); }
    return;
  }
  // Una sola carga a la vez (al abrir, al recibir un aviso en tiempo real o con 🔄): si no, quedaban
  // capas duplicadas en el mapa.
  if (state.prio.cargandoProm) return state.prio.cargandoProm;
  state.prio.cargandoProm = cargarMatrizPrio_(est).finally(() => { state.prio.cargandoProm = null; });
  return state.prio.cargandoProm;
}
async function cargarMatrizPrio_(est) {
  est.textContent = 'Cargando matriz…';
  const [datos, params, geo0] = await Promise.all([
    supabaseClient.from('comunas_prioridad').select('*').order('id_comuna'),
    supabaseClient.from('prioridad_parametros').select('id, parametros'),
    supabaseClient.rpc('comunas_prioridad_geojson'),
  ]);
  // Límites comunales: si la consulta falla o llega vacía, se reintenta (antes la vista quedaba
  // en blanco sin aviso: KPI con 103 comunas, pero mapa y listado vacíos).
  let geo = geo0;
  for (let i = 0; i < 2 && (geo.error || !(geo.data || []).length); i++) {
    est.textContent = 'Reintentando límites comunales…';
    await new Promise(r => setTimeout(r, 1500 * (i + 1)));
    geo = await supabaseClient.rpc('comunas_prioridad_geojson');
  }
  state.prio.errorGeo = geo.error ? geo.error.message : (!(geo.data || []).length ? 'la consulta no devolvió límites comunales' : null);
  if (state.prio.errorGeo) console.error('Comunas Prioritarias · comunas_prioridad_geojson:', geo.error || 'sin filas');
  if (datos.error) {
    est.textContent = 'Sin datos';
    document.getElementById('prio-rangos').innerHTML = '<div class="pe-vacio">No se pudo leer la matriz: ' + escapeHtml_(datos.error.message) +
      '<br>¿Ya se ejecutó <b>86_comunas_prioridad.sql</b> en Supabase?</div>';
    return;
  }
  state.prio.datos = datos.data || [];
  const filas = (params.data || []);
  const vigente = filas.find(f => f.id === 'vigente') || filas.find(f => f.id === 'excel');
  state.prio.params = paramsCompletosPrio_(vigente ? vigente.parametros : null);
  state.prio.cargado = true;
  // Polígonos de las comunas con geometría, enlazados por id_comuna
  const porId = {}; state.prio.datos.forEach(c => { porId[c.id_comuna] = c; });
  const grupo = L.featureGroup().addTo(state.prio.mapa);
  (geo.data || []).forEach(g => {
    let gj; try { gj = JSON.parse(g.geojson); } catch (e) { return; }
    const capa = L.geoJSON(gj, { style: { weight: 1, color: '#475569', fillOpacity: 0.85, fillColor: '#E2E8F0' } });
    capa._idComuna = g.id_comuna;
    capa.bindTooltip(() => tooltipPrio_(porId[g.id_comuna], g), { sticky: true, className: 'prio-tooltip', direction: 'top', offset: [0, -8] });
    capa.on('click', () => abrirDetallePrio_(g.id_comuna, capa));
    capa.addTo(grupo);
    state.prio.capas[g.id_comuna] = capa;
  });
  state.prio.grupo = grupo;
  // El panel recién se mostró: recalcular el tamaño del mapa antes de encuadrar
  state.prio.mapa.invalidateSize();
  if (!state.prio.yaEncuadradoUnaVez) {   // en las recargas automáticas no se mueve la vista del usuario
    state.prio.yaEncuadradoUnaVez = true;
    if (grupo.getLayers().length && document.getElementById('prio-map').clientWidth > 100) {
      state.prio.mapa.fitBounds(grupo.getBounds(), { padding: [20, 20] });
      state.prio.encuadrado = true;
    }
    setTimeout(() => { state.prio.mapa.invalidateSize(); if (grupo.getLayers().length) state.prio.mapa.fitBounds(grupo.getBounds(), { padding: [20, 20] }); }, 250);
  }
  // Regiones
  const regiones = [...new Set(state.prio.datos.map(c => c.region).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
  document.getElementById('prio-region').innerHTML = '<option value="">Todas las regiones (' + state.prio.datos.length + ' comunas)</option>' +
    regiones.map(r => '<option>' + escapeHtml_(r) + '</option>').join('');
  renderLeyendaPrio_();
  renderRangosPrio_();
  recalcularPrio_();
  cargarResumenPrevencion_();   // copamiento N/A/R, GRD y rutas (en segundo plano: calcula geometría)
  cargarAreasPrio_();           // área y subgerencia de cada comuna (filtros), en segundo plano
  iniciarTiempoRealPrio_();
}
/* ── Área y subgerencia de cada comuna (15-10-2026) ──
 * La matriz no trae subgerencia: la comuna toma el ÁREA administrativa (Comunas por área, SQL 94)
 * y el área, la SUBGERENCIA de sus recursos (referencia_recursos). Una comuna puede tener 2 áreas. */
async function cargarAreasPrio_() {
  try {
    const [ac, rr] = await Promise.all([
      supabaseClient.from('v_area_comunas_admin').select('id_comuna, area'),
      supabaseClient.from('referencia_recursos').select('area_nombre, subgerencia').not('subgerencia', 'is', null),
    ]);
    if (ac.error) throw ac.error;
    const subgDeArea = {};
    (rr.data || []).forEach(r => { const k = plNorm_(r.area_nombre).replace(/[^A-Z0-9]/g, ''); if (k && r.subgerencia && !subgDeArea[k]) subgDeArea[k] = r.subgerencia; });
    const porComuna = {};
    (ac.data || []).forEach(x => {
      if (!x.area || x.id_comuna == null) return;
      const e = porComuna[x.id_comuna] = porComuna[x.id_comuna] || { areas: [], subgs: [] };
      if (!e.areas.some(a => plNorm_(a) === plNorm_(x.area))) e.areas.push(x.area);
      const s = subgDeArea[plNorm_(x.area).replace(/[^A-Z0-9]/g, '')];
      if (s && !e.subgs.includes(s)) e.subgs.push(s);
    });
    state.prio.areasComuna = porComuna;
  } catch (e) {
    console.warn('Comunas Prioritarias: no se pudo leer el área de las comunas:', e.message || e);
    state.prio.areasComuna = {};
  }
  poblarFiltrosAreaPrio_();
  recalcularPrio_();
}
function areasComunaPrio_(c) { return ((state.prio.areasComuna || {})[c.id_comuna] || { areas: [], subgs: [] }); }
/** Subgerencia → Área en cascada (con cantidad de comunas). */
function poblarFiltrosAreaPrio_() {
  const AC = state.prio.areasComuna || {};
  const selS = document.getElementById('prio-subg'), selA = document.getElementById('prio-area');
  const vS = selS.value, vA = selA.value;
  const cuentaS = {}, cuentaA = {};
  let sinArea = 0;
  state.prio.datos.forEach(c => {
    const e = AC[c.id_comuna];
    if (!e || !e.areas.length) { sinArea++; return; }
    e.subgs.forEach(s => { cuentaS[s] = (cuentaS[s] || 0) + 1; });
    if (vS && !e.subgs.includes(vS)) return;
    e.areas.forEach(a => { cuentaA[a] = (cuentaA[a] || 0) + 1; });
  });
  const subgs = Object.keys(cuentaS).sort((a, b) => a.localeCompare(b, 'es'));
  selS.innerHTML = '<option value="">Todas las subgerencias</option>' + subgs.map(s => '<option value="' + escapeHtml_(s) + '">' + escapeHtml_(aTitulo_(s)) + ' (' + cuentaS[s] + ')</option>').join('') +
    (sinArea ? '<option value="__sin__">— Sin área asignada (' + sinArea + ')</option>' : '');
  selS.value = (subgs.includes(vS) || vS === '__sin__') ? vS : '';
  const areas = Object.keys(cuentaA).sort((a, b) => a.localeCompare(b, 'es'));
  selA.innerHTML = '<option value="">Todas las áreas</option>' + areas.map(a => '<option value="' + escapeHtml_(a) + '">' + escapeHtml_(aTitulo_(a)) + ' (' + cuentaA[a] + ')</option>').join('');
  selA.value = areas.includes(vA) ? vA : '';
  selA.disabled = selS.value === '__sin__';
  selS.classList.toggle('activo', !!selS.value); selA.classList.toggle('activo', !!selA.value);
}
/** Recarga completa (datos, rangos y límites): al agregarse una comuna o cambiar la matriz. */
async function recargarPrioridad_() {
  const region = document.getElementById('prio-region').value;   // se conserva la región elegida
  if (state.prio.cargandoProm) { try { await state.prio.cargandoProm; } catch (e) { /* se recarga igual */ } }
  if (state.prio.grupo && state.prio.mapa) state.prio.mapa.removeLayer(state.prio.grupo);
  state.prio.capas = {}; state.prio.grupo = null; state.prio.cargado = false; state.prio.pendiente = null;
  state.prio.encuadrado = true;   // no volver a encuadrar: el usuario puede estar mirando una zona
  await abrirPrioridad_();
  const sel = document.getElementById('prio-region');
  if (region && Array.from(sel.options).some(o => o.value === region)) { sel.value = region; recalcularPrio_(); }
}
/* ── Actualización automática (Supabase Realtime, SQL 88) ──
 * Si una comuna se suma al copamiento (plan, entidades o rutas), se le asigna un
 * GRD o se agrega una comuna al sistema, la vista se refresca sola. Los avisos se
 * agrupan unos segundos (copiar un plan genera muchas filas). Con la vista cerrada
 * solo se marca como pendiente y se refresca al abrirla. */
const TABLAS_RESUMEN_PRIO = ['planificacion_recursos', 'planes_contingencia', 'perfil_comunas', 'perfiles'];
const TABLAS_RECARGA_PRIO = ['comunas', 'comunas_prioridad', 'prioridad_parametros'];
function iniciarTiempoRealPrio_() {
  if (state.prio.canal || !supabaseClient.channel) return;
  let canal = supabaseClient.channel('prevencion-comunas-prioritarias');
  [...TABLAS_RESUMEN_PRIO, ...TABLAS_RECARGA_PRIO].forEach(tabla => {
    canal = canal.on('postgres_changes', { event: '*', schema: 'public', table: tabla }, () => programarRefrescoPrio_(tabla));
  });
  canal.subscribe(estado => {
    state.prio.enVivo = estado === 'SUBSCRIBED';
    actualizarIndicadorVivoPrio_();
  });
  state.prio.canal = canal;
}
function programarRefrescoPrio_(tabla) {
  const todo = TABLAS_RECARGA_PRIO.includes(tabla);
  if (state.vistaActual !== 'prioridad') { state.prio.pendiente = todo ? 'todo' : (state.prio.pendiente || 'resumen'); return; }
  if (todo) state.prio.recargaTotal = true;
  clearTimeout(state.prio.timerVivo);
  state.prio.timerVivo = setTimeout(() => {
    const total = state.prio.recargaTotal; state.prio.recargaTotal = false;
    if (total) recargarPrioridad_(); else cargarResumenPrevencion_();
    mostrarToast_('🔄 Comunas Prioritarias actualizadas con los últimos cambios.');
  }, 4000);
}
function actualizarIndicadorVivoPrio_() {
  const est = document.getElementById('prio-estado');
  if (!est) return;
  est.title = state.prio.enVivo ? 'Actualización automática activa: los cambios de planes, rutas y GRD se reflejan solos' : 'Sin conexión en tiempo real: se refresca al abrir la vista';
  let dot = document.getElementById('prio-vivo');
  if (!dot) { dot = document.createElement('span'); dot.id = 'prio-vivo'; est.parentNode.insertBefore(dot, est); }
  dot.textContent = state.prio.enVivo ? '🟢 En vivo' : '⚪ Sin tiempo real';
  dot.style.cssText = 'font-size:11px;font-weight:700;color:' + (state.prio.enVivo ? '#15803D' : '#94A3B8') + ';white-space:nowrap;';
  dot.title = est.title;
}
/** Copamiento por escenario, usuarios GRD y rutas de cada comuna (SQL 87). */
async function cargarResumenPrevencion_() {
  state.prio.resumenEstado = 'cargando';
  renderListaPrio_();
  const { data, error } = await supabaseClient.rpc('resumen_comunas_prevencion');
  if (error) { state.prio.resumenEstado = 'error: ' + error.message; renderListaPrio_(); return; }
  state.prio.resumen = {};
  (data || []).forEach(r => { state.prio.resumen[r.id_comuna] = r; });
  state.prio.resumenEstado = 'ok';
  state.prio.resumenEn = Date.now();
  recalcularPrio_();
}
/** Desde la ficha de la comuna: abre el Planificador de Alertas con esa comuna activa. */
function irAPlanificadorComunaPrio_(idComuna) {
  const cm = (state.comunas || []).find(c => Number(c.id_comuna) === Number(idComuna));
  if (!cm) { mostrarToast_('Esta comuna no está habilitada en el sistema.'); return; }
  if (!comunasSeleccionablesUsuario_().some(c => c.id === cm.id)) { mostrarToast_('No tienes asignada la comuna ' + cm.comuna + '.'); return; }
  if (hayModoTrabajoActivo_()) { mostrarToast_('🔒 Termina o cancela ' + nombreModoTrabajo_() + ' antes de cambiar de comuna.'); return; }
  if (state.prio.mapa) state.prio.mapa.closePopup();
  mostrarVista_('mapa', 'planificador');
  if (state.activeComunaId !== cm.id) seleccionarComuna_(cm.id);
  // Menú ✏️ Planificar desplegado para elegir el escenario
  if (puedeUsarPlanificar_()) setTimeout(() => { const p = document.getElementById('planificar-panel'); if (p) p.classList.add('show'); }, 300);
  mostrarToast_('🧭 Planificador de Alertas · ' + cm.comuna);
}
/** Onda en el centro de cada comuna trabajada (con planes) que esté visible con el filtro. */
/** ¿La comuna interactúa con los incendios en los 3 niveles? (copamiento Normal, Amarilla y Roja > 0, SQL 87/89) */
function interaccion3NivelesPrio_(r) {
  return !!(r && Number(r.pct_verde) > 0 && Number(r.pct_amarilla) > 0 && Number(r.pct_roja) > 0);
}
function aplicarEfectosMapaPrio_() {
  const m = state.prio.mapa; if (!m) return;
  if (!state.prio.ondas) state.prio.ondas = L.layerGroup().addTo(m);
  state.prio.ondas.clearLayers();
  const res = state.prio.resumen || {};
  const icono = L.divIcon({ className: '', html: '<div class="prio-onda"><i></i></div>', iconSize: [18, 18], iconAnchor: [9, 9] });
  const iconoPend = L.divIcon({ className: '', html: '<div class="prio-onda pendiente"><i></i></div>', iconSize: [18, 18], iconAnchor: [9, 9] });
  Object.entries(state.prio.capas).forEach(([id, capa]) => {
    if (!state.prio.grupo || !state.prio.grupo.hasLayer(capa)) return;   // oculta por el filtro
    // Verde: SOLO las comunas marcadas ✅ Lista en el KPI de avance.
    // Amarilla: interactúa con los incendios en los 3 niveles (Normal, Amarilla y Roja) y aún no está Lista.
    const lista = !!comunaListaPrio_(id);
    const pendiente = !lista && interaccion3NivelesPrio_(res[id]);
    if (!lista && !pendiente) return;
    L.marker(centroComunaPrio_(capa), { icon: lista ? icono : iconoPend, interactive: false, keyboard: false }).addTo(state.prio.ondas);
  });
  aplicarEtiquetasPrio_();
}
/** Etiqueta con el nombre de cada comuna visible (en su punto interior). Se ocultan con
 *  poco zoom para no saturar; no capturan el mouse (el tooltip sigue en el polígono). */
function aplicarEtiquetasPrio_() {
  const m = state.prio.mapa; if (!m) return;
  if (!state.prio.etiquetas) {
    m.createPane('prioEtiquetas');
    m.getPane('prioEtiquetas').style.zIndex = 460;
    m.getPane('prioEtiquetas').style.pointerEvents = 'none';
    state.prio.etiquetas = L.layerGroup().addTo(m);
    const porZoom = () => {
      const z = m.getZoom(), c = m.getContainer();
      c.classList.toggle('prio-etq-ocultas', z < 7.5);
      c.classList.toggle('prio-etq-chicas', z >= 7.5 && z < 8.75);
    };
    m.on('zoomend', porZoom); porZoom();
  }
  state.prio.etiquetas.clearLayers();
  const porId = {}; (state.prio.datos || []).forEach(c => { porId[c.id_comuna] = c; });
  Object.entries(state.prio.capas).forEach(([id, capa]) => {
    if (!state.prio.grupo || !state.prio.grupo.hasLayer(capa)) return;   // oculta por el filtro
    const c = porId[id]; if (!c) return;
    const icono = L.divIcon({ className: 'prio-etq-wrap', html: '<span class="prio-etq">' + escapeHtml_(aTitulo_(c.comuna || '')) + '</span>', iconSize: [0, 0] });
    L.marker(centroComunaPrio_(capa), { icon: icono, interactive: false, keyboard: false, pane: 'prioEtiquetas' }).addTo(state.prio.etiquetas);
  });
}
/** Punto "corazón" de la comuna: el punto interior MÁS ALEJADO de sus bordes (polo de
 *  inaccesibilidad), como se ubican las etiquetas en los mapas. El centro del recuadro
 *  envolvente quedaba pegado al límite en comunas alargadas o irregulares (11-10-2026).
 *  Búsqueda en grilla sobre el polígono más grande + 3 refinamientos; se guarda en caché. */
function centroComunaPrio_(capa) {
  if (capa._centroPrio) return capa._centroPrio;
  let polys = [];
  capa.eachLayer(l => { try { const g = l.toGeoJSON().geometry; polys = polys.concat(g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : []); } catch (e) {} });
  if (!polys.length) return (capa._centroPrio = capa.getBounds().getCenter());
  // Polígono principal (el de mayor extensión) con sus huecos
  const ext = r => { let a = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] + r[i][0]) * (r[j][1] - r[i][1]); return Math.abs(a); };
  const poly = polys.slice().sort((a, b) => ext(b[0]) - ext(a[0]))[0];
  const k = Math.cos((poly[0].reduce((s, v) => s + v[1], 0) / poly[0].length) * Math.PI / 180);   // corrige la longitud
  const dentro = (x, y) => puntoEnAnillo_(y, x, poly[0]) && !poly.slice(1).some(h => puntoEnAnillo_(y, x, h));
  const distBorde = (x, y) => {   // distancia mínima a cualquier borde (unidades aprox. proporcionales a metros)
    let d = Infinity;
    poly.forEach(r => {
      for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
        const ax = r[j][0] * k, ay = r[j][1], bx = r[i][0] * k, by = r[i][1], px = x * k, py = y;
        const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
        const t = l2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2)) : 0;
        const ex = ax + t * dx - px, ey = ay + t * dy - py, dd = ex * ex + ey * ey;
        if (dd < d) d = dd;
      }
    });
    return d;
  };
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  poly[0].forEach(([x, y]) => { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; });
  let mejor = null, mejorD = -1;
  const buscar = (cx0, cy0, cx1, cy1, n) => {
    for (let i = 0; i <= n; i++) for (let j = 0; j <= n; j++) {
      const x = cx0 + (cx1 - cx0) * i / n, y = cy0 + (cy1 - cy0) * j / n;
      if (!dentro(x, y)) continue;
      const d = distBorde(x, y);
      if (d > mejorD) { mejorD = d; mejor = [x, y]; }
    }
  };
  buscar(x0, y0, x1, y1, 24);
  for (let paso = 0; mejor && paso < 3; paso++) {   // refinar alrededor del mejor punto
    const wx = (x1 - x0) / (24 * Math.pow(4, paso)), wy = (y1 - y0) / (24 * Math.pow(4, paso));
    buscar(mejor[0] - wx, mejor[1] - wy, mejor[0] + wx, mejor[1] + wy, 8);
  }
  return (capa._centroPrio = mejor ? L.latLng(mejor[1], mejor[0]) : capa.getBounds().getCenter());
}
/** Listado de las comunas del sistema (lado izquierdo). */
function renderListaPrio_() {
  const cont = document.getElementById('prio-lista');
  if (!cont || !state.prio.cargado) return;
  const reg = document.getElementById('prio-region').value;
  const q = normalizarBusqueda_(document.getElementById('prio-busqueda').value || '');
  const res = state.prio.resumen || {};
  const lista = state.prio.datos
    .filter(c => state.prio.capas[c.id_comuna] && c._r && pasaFiltrosPrio_(c) &&
      (state.prio.filtroNivel == null || c._r.prio === state.prio.filtroNivel) &&
      (!q || normalizarBusqueda_(c.comuna + ' ' + c.id_comuna).includes(q)))
    .sort((a, b) => b._r.nivel - a._r.nivel || a.comuna.localeCompare(b.comuna, 'es'));
  document.getElementById('prio-lista-total').textContent = lista.length + ' comuna(s)';
  const avisoGeo = state.prio.errorGeo
    ? '<div class="pl-aviso warn" style="margin:6px;">⚠️ No se pudieron cargar los límites de las comunas (' + escapeHtml_(state.prio.errorGeo) + '), por eso el mapa y el listado están vacíos. ' +
      '<button class="turnos-btn" onclick="recargarPrioridad_()" style="margin-top:6px;">🔄 Reintentar</button></div>' : '';
  const aviso = avisoGeo + (state.prio.resumenEstado === 'cargando' ? '<div class="pe-vacio" style="padding:6px;">⏳ Calculando copamiento por escenario…</div>'
    : (String(state.prio.resumenEstado || '').startsWith('error') ? '<div class="pe-vacio" style="padding:6px;color:#B45309;">Sin datos de copamiento/GRD (' +
      escapeHtml_(state.prio.resumenEstado.slice(7)) + '). ¿Se ejecutó <b>87_resumen_comunas_prevencion.sql</b>?</div>' : ''));
  const barra = (etq, pct, color) => '<div>' + etq + '<span>' + (pct == null ? '—' : fmtNumPrio_(pct, 1) + '%') + '</span><i><em style="width:' + Math.min(100, Number(pct) || 0) + '%;background:' + color + ';"></em></i></div>';
  cont.innerHTML = aviso + lista.map(c => {
    const n = prioInfo_(c._r.prio), r = res[c.id_comuna] || {};
    const ent = (r.ent_verde || 0) + (r.ent_amarilla || 0) + (r.ent_roja || 0);
    const grd = r.n_grd > 0
      ? '<span class="prio-chip si" title="GRD: ' + escapeHtml_(r.grd_nombres || '') + '">👤 GRD' + (r.n_grd > 1 ? ' ×' + r.n_grd : '') + '</span>'
      : '<span class="prio-chip no" title="La comuna no tiene usuario GRD">👤 Sin GRD</span>';
    const plan = ent > 0 ? '<span class="prio-chip si">📋 Plan · ' + ent + '</span>' : '<span class="prio-chip no">📋 Sin plan</span>';
    const rutas = r.rutas > 0 ? '<span class="prio-chip si">🛣️ ' + r.rutas + ' rutas</span>' : '';
    return '<div class="prio-item' + (ent > 0 ? ' trabajada' : '') + '" data-prio-item="' + c.id_comuna + '">' +
      '<div class="prio-item-top"><b>' + escapeHtml_(c.comuna) + '</b><span class="prio-badge" style="background:' + n.color + ';color:' + n.texto + ';">' + n.nombre + ' · ' + fmtNivelPrio_(c._r.nivel) + '</span></div>' +
      '<div class="prio-item-sub">' + grd + plan + rutas + '</div>' +
      '<div class="prio-esc">' + barra('N', r.pct_verde, '#16A34A') + barra('A', r.pct_amarilla, '#F59E0B') + barra('R', r.pct_roja, '#EF4444') + '</div>' +
      (ent > 0 && r.tiene_ameba === false
        ? '<div style="font-size:9.5px;color:#B45309;margin-top:4px;" title="Se calcula al encender las amebas de incendios de esta comuna en el mapa">⚠️ Falta calcular su zona de incendios del trienio</div>' : '') +
      '</div>';
  }).join('');
  cont.querySelectorAll('[data-prio-item]').forEach(it => it.addEventListener('click', () => {
    const id = Number(it.dataset.prioItem), capa = state.prio.capas[id];
    if (capa) { state.prio.mapa.fitBounds(capa.getBounds(), { padding: [60, 60], maxZoom: 10 }); abrirDetallePrio_(id, capa); }
  }));
}
function iniciarListenersPrio_() {
  document.querySelectorAll('[data-prio-tab]').forEach(b => b.addEventListener('click', () => {
    document.querySelectorAll('[data-prio-tab]').forEach(x => x.classList.toggle('activo', x === b));
    document.getElementById('prio-rangos').style.display = b.dataset.prioTab === 'rangos' ? '' : 'none';
    document.getElementById('prio-ranking').style.display = b.dataset.prioTab === 'ranking' ? '' : 'none';
    if (b.dataset.prioTab === 'ranking') renderRankingPrio_();
  }));
  // Región y tipo de comuna: recalculan y encuadran el mapa en lo que queda visible
  ['prio-region', 'prio-tipo', 'prio-trabajo'].forEach(id => document.getElementById(id).addEventListener('change', () => {
    recalcularPrio_();
    encuadrarFiltroPrio_();
  }));
  // Búsqueda: filtra mapa, listado y ranking; encuadra al dejar de escribir
  let timerBusqueda = null;
  document.getElementById('prio-busqueda').addEventListener('input', () => {
    recalcularPrio_();
    clearTimeout(timerBusqueda);
    timerBusqueda = setTimeout(encuadrarFiltroPrio_, 400);
  });
  document.getElementById('prio-limpiar').addEventListener('click', limpiarFiltrosPrio_);
  // Subgerencia → Área (en cascada)
  document.getElementById('prio-subg').addEventListener('change', () => { document.getElementById('prio-area').value = ''; poblarFiltrosAreaPrio_(); recalcularPrio_(); encuadrarFiltroPrio_(); });
  document.getElementById('prio-area').addEventListener('change', e => { e.target.classList.toggle('activo', !!e.target.value); recalcularPrio_(); encuadrarFiltroPrio_(); });
  document.getElementById('prio-asignar').addEventListener('click', abrirAsignarResponsablesPrio_);
  // Presencia CMPC: el mínimo de hectáreas se muestra solo si se filtra por CMPC
  document.getElementById('prio-cmpc').addEventListener('change', e => {
    document.getElementById('prio-cmpc-min-wrap').style.display = e.target.value ? '' : 'none';
    recalcularPrio_(); encuadrarFiltroPrio_();
  });
  let timerMinCmpc = null;
  document.getElementById('prio-cmpc-min').addEventListener('input', () => {
    clearTimeout(timerMinCmpc);
    timerMinCmpc = setTimeout(() => { recalcularPrio_(); encuadrarFiltroPrio_(); }, 300);
  });
  document.getElementById('prio-preset-excel').addEventListener('click', () => {
    // Solo los rangos vuelven a los del Excel: se conservan responsables, comunas listas, V6 y pesos
    const ant = state.prio.params;
    state.prio.params = Object.assign(paramsCompletosPrio_(PRIO_PARAM_EXCEL),
      { responsables: ant.responsables, listas: ant.listas, v6: ant.v6, pesos: ant.pesos, bandas: ant.bandas });
    renderRangosPrio_(); recalcularPrio_();
    mostrarToast_('📊 Rangos originales del Excel.');
  });
  document.getElementById('prio-preset-percentil').addEventListener('click', () => {
    state.prio.params = propuestaPercentilesPrio_();
    renderRangosPrio_(); recalcularPrio_();
    mostrarToast_('🧪 Propuesta por percentiles: 2 puntos desde el P75 y 3 puntos desde el P95 de las comunas con valor.');
  });
  document.getElementById('prio-guardar').addEventListener('click', async () => {
    const error = await guardarParamsPrio_();
    mostrarToast_(error ? 'No se pudieron guardar los rangos: ' + error.message : '💾 Rangos, ponderación, comunas relevantes y responsables guardados como vigentes.');
  });
  document.getElementById('prio-kpi-avance').addEventListener('click', abrirKpiAvancePrio_);
}
/** Guarda los parámetros vigentes (rangos, pesos, V6 y responsables) para todos. Devuelve el error o null. */
async function guardarParamsPrio_() {
  const { error } = await supabaseClient.from('prioridad_parametros').upsert({
    id: 'vigente', parametros: state.prio.params, actualizado_en: new Date().toISOString(), actualizado_por: state.user.id,
  }, { onConflict: 'id' });
  return error || null;
}
/** V6: cambia el valor de la comuna (0 = no relevante). Solo Administrador; se guarda con «💾 Guardar rangos». */
function alternarRelevantePrio_(id) {
  const P = state.prio.params; if (!P || !prioPuedeEditar_()) return;
  const c = state.prio.datos.find(x => Number(x.id_comuna) === Number(id));
  const actual = c ? v6ValorPrio_(c, P) : 0;
  const r = prompt('V6 · Comuna relevante — ' + (c ? c.comuna : id) + '\n\nValor de la matriz (6, 5, …). Escribe 0 para que no sea relevante:', String(actual || 5));
  if (r === null) return;
  const v = Math.max(0, Math.min(10, Math.round(Number(String(r).replace(',', '.')) || 0)));
  if (v > 0) P.v6.valores[id] = v; else delete P.v6.valores[id];
  P.v6.ids = Object.keys(P.v6.valores).filter(k => Number(P.v6.valores[k]) > 0).map(Number);
  if (state.prio.mapa) state.prio.mapa.closePopup();
  recalcularPrio_();
  renderRangosPrio_();
  mostrarToast_('📌 ' + (c ? c.comuna : 'Comuna') + (v ? ': V6 = ' + v : ' ya no es relevante') + ' (' + P.v6.ids.length + ' relevantes). Guarda con «💾 Guardar rangos».');
}

/* ── 📈 KPI de avance por comuna y responsable (modal, 13-10-2026) ──
 * Avance de cada comuna = hitos cumplidos de 4: 👤 GRD asignado · 🟢 plan Normal · 🟡 plan Amarilla ·
 * 🔴 plan Roja (con entidades, SQL 87). Se muestra además el copamiento sobre incendios del
 * trienio por escenario. Por responsable: promedio del avance de sus comunas.
 * Jefe de Área y Responsable vienen de la matriz (editables por el Administrador). */
state.prio.kpi = { resp: '', jefe: '', alcance: 'resp', estado: '' };
/** ✅ Comuna lista (check manual del Administrador): { [id_comuna]: { en, por } } en los parámetros vigentes. */
function comunaListaPrio_(id) { const L = (state.prio.params && state.prio.params.listas) || {}; return L[id] || L[String(id)] || null; }
function avanceComunaPrio_(c) {
  const r = (state.prio.resumen || {})[c.id_comuna] || {};
  const hitos = { grd: (r.n_grd || 0) > 0, n: (r.ent_verde || 0) > 0, a: (r.ent_amarilla || 0) > 0, ro: (r.ent_roja || 0) > 0 };
  const n = Object.values(hitos).filter(Boolean).length;
  return { hitos, n, pct: Math.round(n / 4 * 100), r };
}
function filasKpiPrio_() {
  const P = state.prio.params, K = state.prio.kpi, R = P.responsables || {};
  return state.prio.datos.filter(c => {
    const asig = R[c.id_comuna];
    if (K.alcance === 'resp' && !asig) return false;
    if (K.alcance === 'relevantes' && !esRelevantePrio_(c, P)) return false;
    if (K.alcance === 'filtro' && !cumpleFiltrosPrio_(c)) return false;
    if (K.resp && (!asig || asig[1] !== K.resp)) return false;
    if (K.jefe && (!asig || asig[0] !== K.jefe)) return false;
    if (K.estado === 'listas' && !comunaListaPrio_(c.id_comuna)) return false;
    if (K.estado === 'pendientes' && comunaListaPrio_(c.id_comuna)) return false;
    return true;
  }).map(c => Object.assign({ c, asig: R[c.id_comuna] || ['', ''] }, avanceComunaPrio_(c)))
    .sort((a, b) => a.c._r.prio - b.c._r.prio || b.c._r.nivel - a.c._r.nivel || a.c.comuna.localeCompare(b.c.comuna, 'es'));
}
function abrirKpiAvancePrio_() {
  if (!state.prio.cargado) { mostrarToast_('Espera a que cargue la matriz.'); return; }
  let m = document.getElementById('prio-kpi-modal');
  if (!m) {
    m = document.createElement('div'); m.id = 'prio-kpi-modal'; m.className = 'gr-modal pk-modal';
    m.innerHTML = '<div class="gr-modal-caja"><div class="gr-modal-cab"><b>📈 KPI de avance por comuna y responsable</b>' +
      '<span style="display:flex;gap:6px;"><button class="turnos-btn" data-pk="excel">⬇️ Excel</button><button class="turnos-btn" data-pk="cerrar">✕</button></span></div>' +
      '<div class="gr-modal-cuerpo" id="pk-cuerpo"></div>' +
      '<div class="gr-modal-pie" id="pk-pie"></div></div>';
    document.body.appendChild(m);
    m.addEventListener('click', e => {
      if (e.target === m || (e.target.closest('[data-pk]') || {}).dataset?.pk === 'cerrar') { m.style.display = 'none'; return; }
      // Filtro por responsable: tarjetas y botones (data-pk-resp; '' = todos)
      const card = e.target.closest('[data-pk-resp]');
      if (card) {
        const v = card.dataset.pkResp;
        state.prio.kpi.resp = v && state.prio.kpi.resp === v ? '' : v;
        renderKpiAvancePrio_(); return;
      }
      const b = e.target.closest('[data-pk]'); if (!b) return;
      if (b.dataset.pk === 'excel') descargarKpiAvancePrio_();
      if (b.dataset.pk === 'guardar') guardarResponsablesPrio_();
    });
    m.addEventListener('change', e => {
      const t = e.target;
      if (t.id === 'pk-resp') state.prio.kpi.resp = t.value;
      else if (t.id === 'pk-jefe') state.prio.kpi.jefe = t.value;
      else if (t.id === 'pk-alcance') state.prio.kpi.alcance = t.value;
      else if (t.id === 'pk-estado') state.prio.kpi.estado = t.value;
      else if (t.dataset.pkLista) { marcarComunaListaPrio_(Number(t.dataset.pkLista), t.checked); return; }
      else if (t.dataset.pkEdit) {   // edición de Jefe de Área / Responsable (Administrador)
        const [id, i] = t.dataset.pkEdit.split('|'), R = state.prio.params.responsables;
        const v = (R[id] || ['', '']).slice(); v[Number(i)] = t.value.trim();
        if (v[0] || v[1]) R[id] = v; else delete R[id];
        state.prio.kpi.editado = true;
        const pie = document.getElementById('pk-pie'); if (pie) pie.querySelector('[data-pk="guardar"]')?.classList.add('gr-btn-guardar');
        return;
      } else return;
      renderKpiAvancePrio_();
    });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && m.style.display !== 'none') m.style.display = 'none'; });
  }
  m.style.display = 'flex';
  renderKpiAvancePrio_();
}
function renderKpiAvancePrio_() {
  const cont = document.getElementById('pk-cuerpo'); if (!cont) return;
  const K = state.prio.kpi, R = state.prio.params.responsables || {};
  const esAdmin = puedeEditarModulo_('prioridad');
  const filas = filasKpiPrio_();
  const resps = [...new Set(Object.values(R).map(x => x[1]).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
  const jefes = [...new Set(Object.values(R).map(x => x[0]).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
  const prom = a => a.length ? Math.round(a.reduce((s, x) => s + x, 0) / a.length) : 0;
  const color = p => p >= 75 ? '#16A34A' : p >= 50 ? '#F59E0B' : p > 0 ? '#F97316' : '#DC2626';
  const barra = p => '<div class="pk-barra"><i style="width:' + p + '%;background:' + color(p) + ';"></i></div>';
  const pct = v => v == null ? '—' : fmtNumPrio_(v, 1) + '%';
  const sinResumen = state.prio.resumenEstado !== 'ok';
  // KPIs generales
  const completas = filas.filter(f => f.n === 4).length, conGrd = filas.filter(f => f.hitos.grd).length;
  const kpi = (v, t, c) => '<div class="pk-kpi" style="--c:' + c + '"><b>' + v + '</b><span>' + t + '</span></div>';
  // Por responsable (todas las comunas con responsable, sin el filtro de responsable)
  const porResp = resps.map(nombre => {
    const fs = state.prio.datos.filter(c => R[c.id_comuna] && R[c.id_comuna][1] === nombre).map(c => avanceComunaPrio_(c));
    const ids = state.prio.datos.filter(c => R[c.id_comuna] && R[c.id_comuna][1] === nombre).map(c => c.id_comuna);
    return { nombre, n: fs.length, avance: prom(fs.map(f => f.pct)), completas: fs.filter(f => f.n === 4).length, sinGrd: fs.filter(f => !f.hitos.grd).length,
      listas: ids.filter(id => comunaListaPrio_(id)).length };
  });
  const listas = filas.filter(f => comunaListaPrio_(f.c.id_comuna)).length;
  const opt = (lista, sel, todos) => '<option value="">' + todos + '</option>' + lista.map(x => '<option' + (x === sel ? ' selected' : '') + '>' + escapeHtml_(x) + '</option>').join('');
  cont.innerHTML =
    (sinResumen ? '<div class="pl-aviso warn">⚠️ Aún no se carga el estado del copamiento por comuna (planes, GRD); el avance puede verse en 0.</div>' : '') +
    // Filtro rápido por Responsable (botones)
    '<div class="pk-seg"><span class="pk-seg-tit">👥 Responsable:</span>' +
      '<button class="pk-seg-btn' + (!K.resp ? ' sel' : '') + '" data-pk-resp="">Todos</button>' +
      resps.map(x => { const p = porResp.find(y => y.nombre === x) || {};
        return '<button class="pk-seg-btn' + (K.resp === x ? ' sel' : '') + '" data-pk-resp="' + escapeHtml_(x) + '">' + escapeHtml_(x) +
          ' <small>' + (p.listas || 0) + '/' + (p.n || 0) + '</small></button>'; }).join('') +
    '</div>' +
    '<div class="pk-filtros">' +
      '<select id="pk-alcance" class="admin-search">' +
        [['resp', '👥 Comunas con responsable'], ['relevantes', '📌 Comunas relevantes (V6)'], ['filtro', '🔎 Comunas del filtro del mapa'], ['todas', '🗺️ Todas las comunas']]
          .map(([v, t]) => '<option value="' + v + '"' + (K.alcance === v ? ' selected' : '') + '>' + t + '</option>').join('') + '</select>' +
      '<select id="pk-jefe" class="admin-search">' + opt(jefes, K.jefe, 'Todos los Jefes de Área') + '</select>' +
      '<select id="pk-estado" class="admin-search">' +
        [['', 'Listas y pendientes'], ['listas', '✅ Solo listas'], ['pendientes', '⏳ Solo pendientes']]
          .map(([v, t]) => '<option value="' + v + '"' + (K.estado === v ? ' selected' : '') + '>' + t + '</option>').join('') + '</select>' +
      '<span style="font-size:11.5px;color:var(--text-tertiary);">Avance = hitos cumplidos de 4: 👤 GRD · 🟢 plan Normal · 🟡 Amarilla · 🔴 Roja</span>' +
    '</div>' +
    '<div class="pk-kpis">' +
      kpi(filas.length, 'Comunas', '#2563EB') +
      kpi(prom(filas.map(f => f.pct)) + '%', 'Avance promedio', color(prom(filas.map(f => f.pct)))) +
      kpi(listas + ' / ' + filas.length, '✅ Comunas listas', '#16A34A') +
      kpi(completas + ' / ' + filas.length, 'Con los 4 hitos', '#0EA5E9') +
      kpi(conGrd + ' / ' + filas.length, 'Con usuario GRD', '#7C3AED') +
      kpi(pct(prom(filas.map(f => Number(f.r.pct_verde) || 0))), 'Copamiento Normal promedio', '#0F766E') +
    '</div>' +
    '<div><b style="font-size:12.5px;">👥 Avance por responsable</b> <small style="color:var(--text-tertiary);">(clic para filtrar)</small></div>' +
    '<div class="pk-resp">' + (porResp.map(p => '<div class="pk-resp-card' + (K.resp === p.nombre ? ' sel' : '') + '" data-pk-resp="' + escapeHtml_(p.nombre) + '">' +
      '<div class="nom">' + escapeHtml_(p.nombre) + '</div><div class="sub">' + p.n + ' comuna(s) · <b style="color:#16A34A;">✅ ' + p.listas + ' lista(s)</b> · ' + p.completas + ' con 4 hitos · ' + p.sinGrd + ' sin GRD</div>' +
      '<div style="display:flex;align-items:center;gap:8px;"><div style="flex:1;">' + barra(p.avance) + '</div><b style="color:' + color(p.avance) + ';">' + p.avance + '%</b></div></div>').join('') ||
      '<div class="pe-vacio">Sin responsables asignados.</div>') + '</div>' +
    '<div><b style="font-size:12.5px;">🏘️ Avance por comuna</b></div>' +
    '<div class="admin-table-wrap"><table class="admin-table pk-tabla"><thead><tr><th title="Marcar la comuna como lista">✅ Lista</th><th>Comuna</th><th>Prioridad</th><th>Jefe de Área</th><th>Responsable</th>' +
      '<th>Hitos</th><th>Copamiento N · A · R</th><th style="min-width:130px;">Avance</th></tr></thead><tbody>' +
    (filas.map(f => {
      const n = prioInfo_(f.c._r.prio), h = f.hitos, id = f.c.id_comuna;
      const hito = (ok, t, tit) => '<span class="pk-hito ' + (ok ? 'si' : 'no') + '" title="' + tit + (ok ? ': sí' : ': no') + '">' + t + '</span>';
      const celda = (i, v) => esAdmin ? '<input data-pk-edit="' + id + '|' + i + '" value="' + escapeHtml_(v || '') + '" placeholder="—">' : escapeHtml_(v || '—');
      const li = comunaListaPrio_(id);
      const tituloLista = li ? 'Lista desde el ' + new Date(li.en).toLocaleDateString('es-CL') + (li.por ? ' · ' + li.por : '') : 'Pendiente';
      return '<tr class="' + (li ? 'pk-lista' : '') + '"><td style="text-align:center;" title="' + escapeHtml_(tituloLista) + '">' +
        (esAdmin ? '<input type="checkbox" class="pk-check" data-pk-lista="' + id + '"' + (li ? ' checked' : '') + '>' : (li ? '✅' : '⏳')) + '</td>' +
        '<td>' + (li ? '<span class="punto-neon con" title="Lista"></span>' : interaccion3NivelesPrio_(f.r) ? '<span class="punto-neon pendiente" title="Interactúa con los incendios en Normal, Amarilla y Roja; aún no está lista"></span>' : '') +
        '<b>' + escapeHtml_(f.c.comuna) + '</b>' + (esRelevantePrio_(f.c, state.prio.params) ? ' <span title="Comuna relevante (V6)">📌</span>' : '') +
        (li ? '<div style="font-size:10px;color:#16A34A;font-weight:700;">✅ Lista · ' + new Date(li.en).toLocaleDateString('es-CL') + '</div>' : '') + '</td>' +
        '<td><span class="prio-badge" style="background:' + n.color + ';color:' + n.texto + ';">' + n.nombre + ' · ' + fmtNumPrio_(f.c._r.promedio, 1) + '</span></td>' +
        '<td>' + celda(0, f.asig[0]) + '</td><td>' + celda(1, f.asig[1]) + '</td>' +
        '<td>' + hito(h.grd, '👤', 'GRD') + hito(h.n, 'N', 'Plan Normal') + hito(h.a, 'A', 'Plan Alerta Amarilla') + hito(h.ro, 'R', 'Plan Alerta Roja') + '</td>' +
        '<td>' + pct(f.r.pct_verde) + ' · ' + pct(f.r.pct_amarilla) + ' · ' + pct(f.r.pct_roja) + '</td>' +
        '<td><div style="display:flex;align-items:center;gap:6px;"><div style="flex:1;">' + barra(f.pct) + '</div><b style="color:' + color(f.pct) + ';">' + f.pct + '%</b></div></td></tr>';
    }).join('') || '<tr><td colspan="8" style="padding:14px;color:var(--text-tertiary);">Sin comunas con este filtro.</td></tr>') +
    '</tbody></table></div>';
  document.getElementById('pk-pie').innerHTML = esAdmin
    ? '<span style="flex:1;font-size:11.5px;color:var(--text-tertiary);">Puedes editar Jefe de Área y Responsable en la tabla.</span><button class="turnos-btn" data-pk="guardar">💾 Guardar responsables</button>'
    : '<span style="flex:1;font-size:11.5px;color:var(--text-tertiary);">Jefe de Área y Responsable según la matriz de prioridad.</span>';
}
/** ✅ Marca / desmarca una comuna como lista y la guarda de inmediato (Administrador). */
async function marcarComunaListaPrio_(id, lista) {
  const P = state.prio.params;
  P.listas = P.listas || {};
  const antes = P.listas[id];
  if (lista) P.listas[id] = { en: new Date().toISOString(), por: (state.perfil && (state.perfil.nombre_completo || state.perfil.email)) || '' };
  else delete P.listas[id];
  renderKpiAvancePrio_();
  aplicarEfectosMapaPrio_();   // la onda de la comuna pasa de amarilla a verde (o al revés)
  const error = await guardarParamsPrio_();
  const c = state.prio.datos.find(x => Number(x.id_comuna) === Number(id));
  if (error) {   // se revierte si no se pudo guardar
    if (antes) P.listas[id] = antes; else delete P.listas[id];
    renderKpiAvancePrio_(); aplicarEfectosMapaPrio_();
    mostrarToast_('No se pudo guardar: ' + error.message);
    return;
  }
  mostrarToast_((lista ? '✅ ' : '⏳ ') + (c ? c.comuna : 'Comuna') + (lista ? ' marcada como lista.' : ' vuelve a pendiente.'));
}
/* ── 👥 Asignar comunas a responsables (15-10-2026) ──
 * Tabla de todas las comunas (o las del filtro del mapa) para asignar Jefe de Área y Responsable,
 * fila por fila o a varias a la vez. Se trabaja sobre un borrador y se guarda en
 * prioridad_parametros.responsables ({ id_comuna: [jefe, responsable] }), lo mismo que usa el KPI. */
state.prio.asig = { alcance: 'filtro', estado: '', resp: '', q: '', sel: new Set(), borrador: null, jefesPerfil: [] };
function asigCambiosPrio_() {
  const A = state.prio.asig, R = state.prio.params.responsables || {}, B = A.borrador || {};
  const ids = new Set([...Object.keys(R), ...Object.keys(B)]);
  let n = 0; ids.forEach(id => { const a = R[id] || ['', ''], b = B[id] || ['', '']; if (a[0] !== b[0] || a[1] !== b[1]) n++; });
  return n;
}
function filasAsignarPrio_() {
  const A = state.prio.asig, B = A.borrador, q = normalizarBusqueda_(A.q || '');
  return state.prio.datos.filter(c => {
    if (!state.prio.capas[c.id_comuna] && A.alcance !== 'todas') return false;   // solo comunas con mapa (las del sistema)
    if (A.alcance === 'filtro' && !cumpleFiltrosPrio_(c)) return false;
    if (A.alcance === 'cmpc' && !presenciaCmpcPrio_(c)) return false;
    const b = B[c.id_comuna];
    if (A.estado === 'sin' && b && (b[0] || b[1])) return false;
    if (A.estado === 'con' && !(b && (b[0] || b[1]))) return false;
    if (A.resp && (!b || (b[1] !== A.resp && b[0] !== A.resp))) return false;
    if (q) { const e = areasComunaPrio_(c); if (!normalizarBusqueda_([c.comuna, c.id_comuna, c.region, e.areas.join(' '), e.subgs.join(' ')].join(' ')).includes(q)) return false; }
    return true;
  }).sort((a, b) => a.comuna.localeCompare(b.comuna, 'es'));
}
async function abrirAsignarResponsablesPrio_() {
  if (!state.prio.cargado) { mostrarToast_('Espera a que cargue la matriz.'); return; }
  const A = state.prio.asig;
  A.borrador = clonPrio_(state.prio.params.responsables || {});
  A.sel = new Set();
  let m = document.getElementById('prio-asig-modal');
  if (!m) {
    m = document.createElement('div'); m.id = 'prio-asig-modal'; m.className = 'gr-modal pk-modal';
    m.innerHTML = '<div class="gr-modal-caja"><div class="gr-modal-cab"><b>👥 Asignar comunas a responsables</b><button class="turnos-btn" data-pa="cerrar">✕</button></div>' +
      '<div class="gr-modal-cuerpo" id="pa-cuerpo"></div><div class="gr-modal-pie" id="pa-pie"></div></div>';
    document.body.appendChild(m);
    m.addEventListener('click', e => {
      const b = e.target.closest('[data-pa]');
      if (e.target === m || (b && b.dataset.pa === 'cerrar')) {
        if (asigCambiosPrio_() && !confirm('Hay asignaciones sin guardar. ¿Cerrar y descartarlas?')) return;
        m.style.display = 'none'; return;
      }
      const chip = e.target.closest('[data-pa-resp]');
      if (chip) { A.resp = A.resp === chip.dataset.paResp ? '' : chip.dataset.paResp; renderAsignarPrio_(); return; }
      if (!b) return;
      if (b.dataset.pa === 'asignar') asignarSeleccionPrio_(false);
      if (b.dataset.pa === 'quitar') asignarSeleccionPrio_(true);
      if (b.dataset.pa === 'guardar') guardarAsignacionesPrio_();
      if (b.dataset.pa === 'descartar') { A.borrador = clonPrio_(state.prio.params.responsables || {}); A.sel.clear(); renderAsignarPrio_(); }
    });
    m.addEventListener('change', e => {
      const t = e.target;
      if (t.id === 'pa-alcance') { A.alcance = t.value; A.sel.clear(); }
      else if (t.id === 'pa-estado') A.estado = t.value;
      else if (t.id === 'pa-todas') { filasAsignarPrio_().forEach(c => { if (t.checked) A.sel.add(c.id_comuna); else A.sel.delete(c.id_comuna); }); }
      else if (t.dataset.paSel) { const id = Number(t.dataset.paSel); if (t.checked) A.sel.add(id); else A.sel.delete(id); actualizarPieAsignarPrio_(); return; }
      else if (t.dataset.paEdit) {   // edición en la fila
        const [id, i] = t.dataset.paEdit.split('|');
        const v = (A.borrador[id] || ['', '']).slice(); v[Number(i)] = t.value.trim().replace(/\s+/g, ' ');
        if (v[0] || v[1]) A.borrador[id] = v; else delete A.borrador[id];
        const R = state.prio.params.responsables || {}, o = R[id] || ['', ''];
        t.classList.toggle('pa-mod', (o[Number(i)] || '') !== v[Number(i)]);
        actualizarPieAsignarPrio_(); renderChipsAsignarPrio_();
        return;
      } else return;
      renderAsignarPrio_();
    });
    let tq = null;
    m.addEventListener('input', e => { if (e.target.id === 'pa-q') { clearTimeout(tq); tq = setTimeout(() => { A.q = e.target.value; renderAsignarPrio_(true); }, 200); } });
  }
  m.style.display = 'flex';
  renderAsignarPrio_();
  // Nombres de los Jefes de Área del sistema (sugerencias del desplegable)
  try {
    const { data } = await supabaseClient.from('perfiles').select('nombre_completo, perfil');
    A.jefesPerfil = (data || []).filter(p => esJefeAreaPerfil_(p.perfil) && p.nombre_completo).map(p => p.nombre_completo);
    renderAsignarPrio_(true);
  } catch (e) { /* solo sugerencias */ }
}
function nombresAsignarPrio_() {
  const B = state.prio.asig.borrador || {};
  const jefes = new Set(state.prio.asig.jefesPerfil), resps = new Set();
  Object.values(B).concat(Object.values(state.prio.params.responsables || {})).forEach(v => { if (v[0]) jefes.add(v[0]); if (v[1]) resps.add(v[1]); });
  const orden = s => [...s].sort((a, b) => a.localeCompare(b, 'es'));
  return { jefes: orden(jefes), resps: orden(resps) };
}
function renderChipsAsignarPrio_() {
  const el = document.getElementById('pa-chips'); if (!el) return;
  const A = state.prio.asig, B = A.borrador || {}, cuenta = {};
  Object.values(B).forEach(v => { if (v[1]) cuenta[v[1]] = (cuenta[v[1]] || 0) + 1; });
  const nombres = Object.keys(cuenta).sort((a, b) => cuenta[b] - cuenta[a] || a.localeCompare(b, 'es'));
  const sinResp = state.prio.datos.filter(c => state.prio.capas[c.id_comuna] && !(B[c.id_comuna] && B[c.id_comuna][1])).length;
  el.innerHTML = '<span class="pk-seg-tit">👥 Responsable:</span>' +
    nombres.map(n => '<button class="pk-seg-btn' + (A.resp === n ? ' sel' : '') + '" data-pa-resp="' + escapeHtml_(n) + '">' + escapeHtml_(n) + ' <small>' + cuenta[n] + '</small></button>').join('') +
    '<span style="font-size:11px;color:var(--text-tertiary);margin-left:6px;">' + sinResp + ' comuna(s) del sistema sin responsable</span>';
}
function actualizarPieAsignarPrio_() {
  const A = state.prio.asig, esAdmin = puedeEditarModulo_('prioridad'), n = asigCambiosPrio_();
  const s = document.getElementById('pa-nsel'); if (s) s.textContent = A.sel.size;
  document.getElementById('pa-pie').innerHTML = esAdmin
    ? '<span style="flex:1;font-size:11.5px;color:var(--text-tertiary);">' + (n ? '✏️ ' + n + ' comuna(s) con cambios sin guardar.' : 'Sin cambios.') + ' Lo asignado se usa en el 📈 KPI de avance.</span>' +
      (n ? '<button class="turnos-btn" data-pa="descartar">↩️ Descartar</button>' : '') +
      '<button class="turnos-btn' + (n ? ' gr-btn-guardar' : '') + '" data-pa="guardar"' + (n ? '' : ' disabled') + '>💾 Guardar asignaciones' + (n ? ' (' + n + ')' : '') + '</button>'
    : '<span style="flex:1;font-size:11.5px;color:var(--text-tertiary);">Solo el Administrador o el Jefe de Área asignan responsables.</span>';
}
function renderAsignarPrio_(soloTabla) {
  const cont = document.getElementById('pa-cuerpo'); if (!cont) return;
  const A = state.prio.asig, B = A.borrador, R = state.prio.params.responsables || {};
  const esAdmin = puedeEditarModulo_('prioridad');
  const filas = filasAsignarPrio_();
  const { jefes, resps } = nombresAsignarPrio_();
  const dl = '<datalist id="pa-dl-jefes">' + jefes.map(x => '<option value="' + escapeHtml_(x) + '">').join('') + '</datalist>' +
    '<datalist id="pa-dl-resps">' + resps.map(x => '<option value="' + escapeHtml_(x) + '">').join('') + '</datalist>';
  const tabla = '<div class="admin-table-wrap"><table class="admin-table pk-tabla"><thead><tr>' +
      (esAdmin ? '<th style="width:30px;"><input type="checkbox" id="pa-todas" title="Seleccionar todas las de la lista"' + (filas.length && filas.every(c => A.sel.has(c.id_comuna)) ? ' checked' : '') + '></th>' : '') +
      '<th>Comuna</th><th>Región</th><th>Subgerencia · Área</th><th>Prioridad</th><th>Jefe de Área</th><th>Responsable</th></tr></thead><tbody>' +
    (filas.map(c => {
      const id = c.id_comuna, b = B[id] || ['', ''], o = R[id] || ['', ''], n = c._r ? prioInfo_(c._r.prio) : null, e = areasComunaPrio_(c);
      const celda = i => esAdmin
        ? '<input class="pa-in' + ((o[i] || '') !== (b[i] || '') ? ' pa-mod' : '') + '" data-pa-edit="' + id + '|' + i + '" list="' + (i ? 'pa-dl-resps' : 'pa-dl-jefes') + '" value="' + escapeHtml_(b[i] || '') + '" placeholder="— sin asignar —">'
        : escapeHtml_(b[i] || '—');
      return '<tr>' + (esAdmin ? '<td style="text-align:center;"><input type="checkbox" data-pa-sel="' + id + '"' + (A.sel.has(id) ? ' checked' : '') + '></td>' : '') +
        '<td><b>' + escapeHtml_(c.comuna) + '</b>' + (esRelevantePrio_(c, state.prio.params) ? ' <span title="Comuna relevante (V6)">📌</span>' : '') + '</td>' +
        '<td style="font-size:11px;">' + escapeHtml_(String(c.region || '').replace(/^Región (de |del )?/, '')) + '</td>' +
        '<td style="font-size:11px;">' + (e.areas.length ? escapeHtml_(e.subgs.map(aTitulo_).join(' / ') || '—') + ' · ' + escapeHtml_(e.areas.map(aTitulo_).join(' / ')) : '<span style="color:var(--text-tertiary);">Sin área</span>') + '</td>' +
        '<td>' + (n ? '<span class="prio-badge" style="background:' + n.color + ';color:' + n.texto + ';">' + n.nombre + ' · ' + fmtNivelPrio_(c._r.nivel) + '</span>' : '—') + '</td>' +
        '<td>' + celda(0) + '</td><td>' + celda(1) + '</td></tr>';
    }).join('') || '<tr><td colspan="7" style="padding:14px;color:var(--text-tertiary);">Sin comunas con este filtro.</td></tr>') +
    '</tbody></table></div>';
  if (soloTabla && document.getElementById('pa-tabla')) {
    document.getElementById('pa-tabla').innerHTML = tabla;
    document.getElementById('pa-total').textContent = filas.length + ' comuna(s)';
    const d = document.getElementById('pa-dls'); if (d) d.innerHTML = dl;
    actualizarPieAsignarPrio_();
    return;
  }
  cont.innerHTML =
    '<div class="pk-filtros">' +
      '<select id="pa-alcance" class="admin-search">' +
        [['filtro', '🔎 Comunas del filtro del mapa'], ['cmpc', '🌲 Comunas con presencia CMPC'], ['sistema', '🗺️ Todas las comunas del mapa'], ['todas', '🇨🇱 Todas las de la matriz']]
          .map(([v, t]) => '<option value="' + v + '"' + (A.alcance === v ? ' selected' : '') + '>' + t + '</option>').join('') + '</select>' +
      '<select id="pa-estado" class="admin-search">' +
        [['', 'Con y sin responsable'], ['sin', '○ Sin responsable'], ['con', '👥 Con responsable']]
          .map(([v, t]) => '<option value="' + v + '"' + (A.estado === v ? ' selected' : '') + '>' + t + '</option>').join('') + '</select>' +
      '<input id="pa-q" class="admin-search" placeholder="Buscar comuna, área, subgerencia…" value="' + escapeHtml_(A.q || '') + '" style="min-width:200px;">' +
      '<span id="pa-total" style="font-size:12px;font-weight:700;">' + filas.length + ' comuna(s)</span>' +
    '</div>' +
    '<div class="pk-seg" id="pa-chips"></div>' +
    (esAdmin
      ? '<div class="pa-masivo"><b>Asignar a las <span id="pa-nsel">' + A.sel.size + '</span> seleccionadas:</b>' +
          '<input id="pa-m-jefe" class="pa-in" list="pa-dl-jefes" placeholder="Jefe de Área (vacío = no cambia)">' +
          '<input id="pa-m-resp" class="pa-in" list="pa-dl-resps" placeholder="Responsable (vacío = no cambia)">' +
          '<button class="turnos-btn gr-btn-guardar" data-pa="asignar">✅ Asignar</button>' +
          '<button class="turnos-btn" data-pa="quitar" title="Deja las comunas seleccionadas sin Jefe ni Responsable">🧹 Quitar asignación</button></div>'
      : '') +
    '<div id="pa-dls">' + dl + '</div>' +
    '<div id="pa-tabla">' + tabla + '</div>';
  renderChipsAsignarPrio_();
  actualizarPieAsignarPrio_();
}
function asignarSeleccionPrio_(quitar) {
  const A = state.prio.asig;
  if (!A.sel.size) { mostrarToast_('Marca primero las comunas en la tabla (☑️).'); return; }
  const jefe = (document.getElementById('pa-m-jefe').value || '').trim().replace(/\s+/g, ' ');
  const resp = (document.getElementById('pa-m-resp').value || '').trim().replace(/\s+/g, ' ');
  if (!quitar && !jefe && !resp) { mostrarToast_('Escribe el Jefe de Área y/o el Responsable a asignar.'); return; }
  if (quitar && !confirm('¿Quitar Jefe de Área y Responsable de ' + A.sel.size + ' comuna(s)?')) return;
  A.sel.forEach(id => {
    if (quitar) { delete A.borrador[id]; return; }
    const v = (A.borrador[id] || ['', '']).slice();
    if (jefe) v[0] = jefe;
    if (resp) v[1] = resp;
    A.borrador[id] = v;
  });
  mostrarToast_((quitar ? '🧹 Asignación quitada de ' : '✅ Asignado a ') + A.sel.size + ' comuna(s). Recuerda «💾 Guardar asignaciones».');
  A.sel.clear();
  renderAsignarPrio_();
}
async function guardarAsignacionesPrio_() {
  const A = state.prio.asig, P = state.prio.params, antes = P.responsables;
  P.responsables = clonPrio_(A.borrador);
  const error = await guardarParamsPrio_();
  if (error) { P.responsables = antes; mostrarToast_('No se pudo guardar: ' + error.message); return; }
  mostrarToast_('💾 Asignaciones guardadas.');
  renderAsignarPrio_();
  if (document.getElementById('prio-kpi-modal') && document.getElementById('prio-kpi-modal').style.display !== 'none') renderKpiAvancePrio_();
}
async function guardarResponsablesPrio_() {
  const error = await guardarParamsPrio_();
  mostrarToast_(error ? 'No se pudo guardar: ' + error.message : '💾 Responsables guardados.');
  if (!error) { state.prio.kpi.editado = false; renderKpiAvancePrio_(); }
}
async function descargarKpiAvancePrio_() {
  const filas = filasKpiPrio_();
  if (!filas.length) { mostrarToast_('No hay comunas para descargar.'); return; }
  const si = b => b ? 'Sí' : 'No';
  const datos = filas.map(f => ({
    'ID comuna': f.c.id_comuna, 'Comuna': f.c.comuna, 'Prioridad': prioInfo_(f.c._r.prio).nombre, 'Promedio (Nivel / 6)': f.c._r.promedio,
    'Nivel (suma V1…V6)': f.c._r.nivelBruto, 'Nivel ponderado (%)': f.c._r.nivelPond, 'Relevante (V6)': si(esRelevantePrio_(f.c, state.prio.params)),
    'Jefe de Área': f.asig[0] || '', 'Responsable': f.asig[1] || '',
    'Lista': comunaListaPrio_(f.c.id_comuna) ? 'Sí' : 'No', 'Lista desde': comunaListaPrio_(f.c.id_comuna) ? new Date(comunaListaPrio_(f.c.id_comuna).en).toLocaleDateString('es-CL') : '', 'GRD': si(f.hitos.grd), 'Plan Normal': si(f.hitos.n), 'Plan Amarilla': si(f.hitos.a), 'Plan Roja': si(f.hitos.ro),
    'Copamiento Normal %': f.r.pct_verde ?? '', 'Copamiento Amarilla %': f.r.pct_amarilla ?? '', 'Copamiento Roja %': f.r.pct_roja ?? '', 'Avance %': f.pct,
  }));
  try {
    const XLSX = await tbCargarSheetJs_();
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(datos), 'Avance por comuna');
    XLSX.writeFile(wb, 'kpi_avance_comunas_' + tbHoyISO_() + '.xlsx');
  } catch (e) { mostrarToast_('No se pudo generar el Excel: ' + (e.message || e)); }
}
/** Propuesta alternativa: los datos están muy concentrados (casi todas las comunas
 *  quedan con 1 punto con los tercios del máximo del Excel). Umbral 1 = el del
 *  Excel; 2 puntos desde el percentil 75 y 3 puntos desde el percentil 95 de las
 *  comunas que tienen valor. */
function propuestaPercentilesPrio_() {
  const P = paramsCompletosPrio_(state.prio.params);
  const perc = (arr, p) => { const s = arr.slice().sort((a, b) => a - b); if (!s.length) return 0; const i = (s.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i); return s[lo] + (s[hi] - s[lo]) * (i - lo); };
  PRIO_VARS.forEach(v => {
    const pos = state.prio.datos.map(c => Number(c[v.campo]) || 0).filter(x => x > 0);
    const r = x => Math.round(x / v.step) * v.step;
    P[v.k].u = [PRIO_PARAM_EXCEL[v.k].u[0], r(perc(pos, 0.75)), r(perc(pos, 0.95))];
  });
  return P;
}
function renderLeyendaPrio_() {
  document.getElementById('prio-leyenda').innerHTML = '<b style="font-size:11px;">Prioridad</b>' +
    PRIO_NIVELES.map(n => '<div><i style="background:' + n.color + ';"></i>' + n.nombre + '</div>').join('') +
    '<div style="margin-top:4px;"><span class="prio-onda" style="display:inline-block;transform:scale(.7);margin:-2px 1px;"><i></i></span>✅ Lista (KPI de avance)</div>' +
    '<div><span class="prio-onda pendiente" style="display:inline-block;transform:scale(.7);margin:-2px 1px;"><i></i></span>Interacción N · A · R, pendiente</div>';
}
/** Resumen visible de los rangos de una variable (chips), sin desplegar las barras. */
function resumenUmbralesPrio_(grupo) {
  const P = state.prio.params; if (!P) return '';
  const chip = t => '<span class="prio-chip">' + t + '</span>';
  if (grupo === 'b') return [['alta', 'Alta'], ['media', 'Media']].map(([k, n]) => chip(n + ' ≥ ' + P.bandas[k])).join('') + chip('Baja < ' + P.bandas.media);
  const peso = P.pesos && P.pesos[grupo] != null
    ? '<span class="prio-chip" style="background:#CCFBF1;color:#0F766E;font-weight:800;" title="Peso de la variable en el puntaje">⚖️ ' + fmtPesoPrio_(P.pesos[grupo]) + ' %</span>' : '';
  if (grupo === 'v5') return peso + chip('Estratégica ' + P.v5.estrategico + ' pts') + chip('Relev. política ' + P.v5.relevancia + ' pts');
  if (grupo === 'v6') {
    const cuenta = {}; Object.values(P.v6.valores || {}).forEach(v => { if (Number(v) > 0) cuenta[v] = (cuenta[v] || 0) + 1; });
    return peso + chip((P.v6.ids || []).length + ' comunas relevantes') +
      Object.keys(cuenta).sort((a, b) => b - a).map(v => chip(v + ' pts · ' + cuenta[v] + ' comuna' + (cuenta[v] > 1 ? 's' : ''))).join('');
  }
  const v = PRIO_VARS.find(x => x.k === grupo); if (!v || !P[grupo]) return '';
  return peso + P[grupo].u.map((u, i) => chip((i + 1) + ' pt' + (i ? 's' : '') + ' ≥ ' + v.fmt(u))).join('');
}
function fmtPesoPrio_(w) { const n = Number(w) || 0; return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100); }
function renderRangosPrio_() {
  const P = state.prio.params, cont = document.getElementById('prio-rangos');
  const slider = (id, etiqueta, min, max, step, valor, fmt) =>
    '<div class="prio-slider"><label>' + etiqueta + '</label><input type="range" data-prio="' + id + '" min="' + min + '" max="' + max + '" step="' + step + '" value="' + valor + '">' +
    '<output data-prio-out="' + id + '">' + fmt(valor) + '</output></div>';
  const b = P.bandas;
  // Tarjeta de variable: destacada (ícono, color, resumen de umbrales y distribución);
  // las barras de puntos quedan plegadas en "Ajustar rangos" hasta que se quiera entrar en detalle.
  const tarjeta = (grupo, nombre, sub, cuerpo, extra) => {
    const e = PRIO_ESTILO_VAR[grupo] || {};
    return '<div class="prio-var" style="--c:' + (e.color || '#16A34A') + ';"><h4><span class="prio-var-tit"><span class="prio-var-ico">' + (e.ico || '•') + '</span>' +
      '<span class="prio-var-nom">' + nombre + '<em>' + sub + '</em></span></span>' + (extra || '') + '</h4>' +
      '<div class="prio-chips" id="prio-chips-' + grupo + '">' + resumenUmbralesPrio_(grupo) + '</div>' +
      (grupo === 'b' || grupo === 'v5' || grupo === 'v6' ? '' : '<div class="prio-dist" id="prio-dist-' + grupo + '"></div><div class="prio-dist-txt"><span>0 pts</span><span>1</span><span>2</span><span>3 pts</span></div>') +
      '<details' + (state.prio.abiertos && state.prio.abiertos[grupo] ? ' open' : '') + ' data-prio-det="' + grupo + '"><summary>Ajustar rangos</summary>' + cuerpo + '</details></div>';
  };
  let html = tarjeta('b', 'Niveles de prioridad', 'Puntaje 0–21 (V1–V5 hasta 3 pts c/u + V6 hasta 6)',
    '<p>Puntaje mínimo para cada nivel; bajo «Media» queda Baja. Por defecto: Alta ≥ 17 · Media ≥ 10 (reproducen la matriz: Alta 19–20, Media 11–16).</p>' +
    [['alta', 'Alta'], ['media', 'Media']].map(([k, n]) => slider('b.' + k, n, 0, 21, 0.5, b[k], v => '≥ ' + v + ' pts')).join(''));
  // Ponderación manual de cada variable (%): siempre visible para ingresarla a mano
  const nombresPeso = { v1: 'V1 · Presencia CMPC', v2q: 'V2 · Ocurrencia quinquenio', v3: 'V3 · Intencionalidad', v4: 'V4 · Valor económico CMPC', v5: 'V5 · Comuna estratégica', v6: 'V6 · Comuna relevante' };
  html += '<div class="prio-var" style="--c:#0F766E;"><h4><span class="prio-var-tit"><span class="prio-var-ico">⚖️</span>' +
    '<span class="prio-var-nom">Cálculo de la prioridad<em>' + (P.metodo === 'ponderado'
      ? 'Ponderado: peso de cada variable en %'
      : 'Suma simple, como la matriz (Nivel = V1+…+V6). Los % se usan solo con «Ponderado»') + '</em></span></span>' +
    '<span style="display:flex;gap:4px;"><button class="turnos-btn" data-prio-pesos-defecto style="padding:3px 8px;font-size:11px;" title="V1 20 · V2 40 · V3 10 · V4 20 · V5 5 · V6 15">↺ Matriz</button>' +
    '<button class="turnos-btn" data-prio-pesos-iguales style="padding:3px 8px;font-size:11px;" title="Todas las variables con el mismo peso (= suma simple)">⚖️ Iguales</button></span></h4>' +
    '<div class="prio-metodo">' +
      '<label><input type="radio" name="prio-metodo" value="suma"' + (P.metodo !== 'ponderado' ? ' checked' : '') + '> 📊 Suma simple (matriz)</label>' +
      '<label><input type="radio" name="prio-metodo" value="ponderado"' + (P.metodo === 'ponderado' ? ' checked' : '') + '> ⚖️ Ponderado (%)</label></div>' +
    '<div class="prio-pesos' + (P.metodo === 'ponderado' ? '' : ' prio-pesos-off') + '">' + PRIO_PESO_KEYS.map(k => {
      const e = PRIO_ESTILO_VAR[k] || {}, w = Number(P.pesos[k]) || 0;
      return '<div class="prio-peso"><span>' + (e.ico || '•') + '</span><span class="nom" title="' + escapeHtml_(nombresPeso[k]) + '">' + escapeHtml_(nombresPeso[k]) + '</span>' +
        '<label class="in"><input type="number" min="0" max="100" step="0.01" inputmode="decimal" data-prio-peso="' + k + '" value="' + fmtPesoPrio_(w) + '"><span>%</span></label>' +
        '<span></span><span class="bar"><i data-prio-peso-bar="' + k + '" style="width:' + Math.min(100, w) + '%;background:' + (e.color || '#16A34A') + ';"></i></span></div>';
    }).join('') +
    '<div class="prio-peso-total" id="prio-peso-total"></div></div></div>';
  PRIO_VARS.forEach(v => {
    const [cod, ...resto] = v.nombre.split(' · ');
    html += tarjeta(v.k, resto.join(' · ') || v.nombre, cod + ' · ' + v.desc,
      '<p>Valor mínimo para cada puntaje.</p>' +
      [0, 1, 2].map(i => slider(v.k + '.' + i, (i + 1) + (i ? ' puntos' : ' punto'), 0, v.max, v.step, P[v.k].u[i], v.fmt)).join(''),
      '<small id="prio-dist-txt-' + v.k + '"></small>');
  });
  html += tarjeta('v5', 'Comuna estratégica', 'V5 · Puntos según la clasificación de la comuna en la matriz',
    slider('v5.estrategico', 'Estratég.', 0, 3, 1, P.v5.estrategico, v => v + ' pts') +
    slider('v5.relevancia', 'Relev. pol.', 0, 3, 1, P.v5.relevancia, v => v + ' pts'));
  // V6: valor de la matriz por comuna (6 / 5). Lista de solo lectura; el Administrador lo cambia desde el mapa.
  const nomComuna = id => { const c = state.prio.datos.find(x => Number(x.id_comuna) === Number(id)); return c ? c.comuna : String(id); };
  const v6Lista = Object.entries(P.v6.valores || {}).filter(([, v]) => Number(v) > 0)
    .sort((a, b) => b[1] - a[1] || nomComuna(a[0]).localeCompare(nomComuna(b[0]), 'es'));
  html += tarjeta('v6', 'Comuna relevante', 'V6 · Valor de la matriz por comuna (' + v6Lista.length + ' comunas)',
    '<div class="prio-v6-lista">' + v6Lista.map(([id, v]) => '<span class="prio-chip" title="ID ' + id + '">' + escapeHtml_(nomComuna(id)) + ' <b>' + v + '</b></span>').join('') + '</div>' +
    (prioPuedeEditar_() ? '<p style="margin-top:6px;">Para cambiar el valor de una comuna, ábrela en el mapa (clic) y usa «📌 V6».</p>' : ''));
  // Jefe de Área y demás perfiles: solo consulta (15-10-2026). Rangos, pesos y V6 los cambia el Administrador.
  if (!prioPuedeEditar_()) html = '<div class="pl-aviso info" style="margin:0 0 8px;">👁️ Solo consulta: los rangos, pesos y variables los modifica el Administrador.</div>' + html;
  cont.innerHTML = html;
  if (!prioPuedeEditar_()) {
    cont.querySelectorAll('input').forEach(i => { i.disabled = true; });
    cont.querySelectorAll('[data-prio-pesos-defecto], [data-prio-pesos-iguales]').forEach(b => { b.style.display = 'none'; });
  }
  // Ponderación: al escribir un % se recalcula todo (mapa, listado, ranking)
  const totalPesos = () => {
    const s = sumaPesosPrio_(state.prio.params), el = document.getElementById('prio-peso-total');
    if (el) el.innerHTML = '<span>Total</span>' + (Math.abs(s - 100) < 0.05
      ? '<span class="ok">✓ ' + fmtNumPrio_(s, 1) + ' %</span>'
      : '<span class="mal" title="Se usan en proporción (se normalizan a 100 %)">' + fmtNumPrio_(s, 1) + ' % · debería sumar 100 %</span>');
  };
  totalPesos();
  let pendPeso = null;
  cont.querySelectorAll('input[data-prio-peso]').forEach(inp => inp.addEventListener('input', () => {
    const k = inp.dataset.prioPeso;
    const val = Math.max(0, Math.min(100, Number(String(inp.value).replace(',', '.')) || 0));
    state.prio.params.pesos[k] = val;
    const bar = cont.querySelector('[data-prio-peso-bar="' + k + '"]'); if (bar) bar.style.width = val + '%';
    const chips = document.getElementById('prio-chips-' + k); if (chips) chips.innerHTML = resumenUmbralesPrio_(k);
    totalPesos();
    if (!pendPeso) pendPeso = requestAnimationFrame(() => { pendPeso = null; recalcularPrio_(); });
  }));
  cont.querySelectorAll('input[name="prio-metodo"]').forEach(rb => rb.addEventListener('change', () => {
    state.prio.params.metodo = rb.value;
    renderRangosPrio_(); recalcularPrio_();
    mostrarToast_(rb.value === 'ponderado' ? '⚖️ Prioridad ponderada por los %. Guarda con «💾 Guardar rangos».' : '📊 Prioridad = suma simple de la matriz. Guarda con «💾 Guardar rangos».');
  }));
  const btnDefecto = cont.querySelector('[data-prio-pesos-defecto]');
  if (btnDefecto) btnDefecto.addEventListener('click', () => {
    state.prio.params.pesos = Object.assign({}, PRIO_PESOS_DEFECTO);
    renderRangosPrio_(); recalcularPrio_();
    mostrarToast_('↺ Ponderación de la matriz: V1 20 · V2 40 · V3 10 · V4 20 · V5 5 · V6 15.');
  });
  const btnIguales = cont.querySelector('[data-prio-pesos-iguales]');
  if (btnIguales) btnIguales.addEventListener('click', () => {
    state.prio.params.pesos = Object.assign({}, PRIO_PESOS_IGUALES);
    renderRangosPrio_(); recalcularPrio_();
    mostrarToast_('⚖️ Todas las variables con el mismo peso.');
  });
  // Recordar qué variables quedaron desplegadas (al recargar datos se redibuja el panel)
  cont.querySelectorAll('details[data-prio-det]').forEach(d => d.addEventListener('toggle', () => {
    state.prio.abiertos = state.prio.abiertos || {};
    state.prio.abiertos[d.dataset.prioDet] = d.open;
  }));
  let pendiente = null;
  cont.querySelectorAll('input[data-prio]').forEach(inp => inp.addEventListener('input', () => {
    const [grupo, clave] = inp.dataset.prio.split('.');
    let val = Number(inp.value);
    if (grupo === 'b') {
      state.prio.params.bandas[clave] = val;
    } else if (grupo === 'v5') {
      state.prio.params.v5[clave] = val;
    } else if (grupo === 'v6') {
      state.prio.params.v6[clave] = val;
    } else {
      // Mantener el orden: umbral 1 ≤ umbral 2 ≤ umbral 3
      const u = state.prio.params[grupo].u, i = Number(clave);
      if (i > 0 && val < u[i - 1]) val = u[i - 1];
      if (i < 2 && val > u[i + 1]) val = u[i + 1];
      inp.value = val; u[i] = val;
    }
    const out = cont.querySelector('[data-prio-out="' + inp.dataset.prio + '"]');
    const v = PRIO_VARS.find(x => x.k === grupo);
    if (out) out.textContent = grupo === 'b' ? '≥ ' + val + ' pts' : (grupo === 'v5' || grupo === 'v6') ? val + ' pts' : v.fmt(val);
    const chips = document.getElementById('prio-chips-' + grupo);
    if (chips) chips.innerHTML = resumenUmbralesPrio_(grupo);
    if (!pendiente) pendiente = requestAnimationFrame(() => { pendiente = null; recalcularPrio_(); });
  }));
}
/** ¿Hay algún filtro activo? (región, tipo, búsqueda o nivel de prioridad) */
function hayFiltroPrio_() {
  return !!(document.getElementById('prio-region').value || document.getElementById('prio-tipo').value || document.getElementById('prio-trabajo').value ||
    document.getElementById('prio-cmpc').value || document.getElementById('prio-subg').value || document.getElementById('prio-area').value ||
    (document.getElementById('prio-busqueda').value || '').trim() || state.prio.filtroNivel != null);
}
/** Todos los filtros juntos: región, tipo, nivel de prioridad (KPI) y búsqueda. */
function cumpleFiltrosPrio_(c) {
  if (!pasaFiltrosPrio_(c)) return false;
  if (state.prio.filtroNivel != null && (!c._r || c._r.prio !== state.prio.filtroNivel)) return false;
  const q = normalizarBusqueda_(document.getElementById('prio-busqueda').value || '');
  return !q || normalizarBusqueda_(c.comuna + ' ' + c.id_comuna + ' ' + (c.provincia || '')).includes(q);
}
/** Encuadra el mapa en las comunas que dejó el filtro (o en todas si no hay filtro). */
function encuadrarFiltroPrio_() {
  const capas = state.prio.datos.filter(cumpleFiltrosPrio_).map(c => state.prio.capas[c.id_comuna]).filter(Boolean);
  if (capas.length) state.prio.mapa.flyToBounds(L.featureGroup(capas).getBounds(), { padding: [30, 30], maxZoom: 10, duration: 0.6 });
  else if (hayFiltroPrio_()) mostrarToast_('Ninguna comuna del mapa cumple este filtro.');
}
function limpiarFiltrosPrio_() {
  document.getElementById('prio-region').value = '';
  document.getElementById('prio-tipo').value = '';
  document.getElementById('prio-trabajo').value = '';
  document.getElementById('prio-subg').value = '';
  document.getElementById('prio-area').value = '';
  poblarFiltrosAreaPrio_();
  // Por defecto: solo comunas con presencia CMPC ≥ 100 ha (las ~103 de la matriz)
  document.getElementById('prio-cmpc').value = 'si';
  document.getElementById('prio-cmpc-min').value = '100';
  document.getElementById('prio-cmpc-min-wrap').style.display = '';
  document.getElementById('prio-busqueda').value = '';
  state.prio.filtroNivel = null;
  recalcularPrio_();
  encuadrarFiltroPrio_();
}
/** Filtros de la barra: región + tipo de comuna (V5: estratégica / relevancia política). */
function pasaFiltrosPrio_(c) {
  const reg = document.getElementById('prio-region').value;
  const tipo = document.getElementById('prio-tipo').value;
  const trabajo = document.getElementById('prio-trabajo').value;
  const cmpc = document.getElementById('prio-cmpc').value;
  if (reg && c.region !== reg) return false;
  // Subgerencia / Área: por el área administrativa de la comuna (cargarAreasPrio_)
  const subg = document.getElementById('prio-subg').value, area = document.getElementById('prio-area').value;
  if (subg || area) {
    const e = areasComunaPrio_(c);
    if (subg === '__sin__') { if (e.areas.length) return false; }
    else if (subg && !e.subgs.includes(subg)) return false;
    if (area && !e.areas.includes(area)) return false;
  }
  if (cmpc === 'si' && !presenciaCmpcPrio_(c)) return false;   // presencia CMPC (V1, hectáreas)
  if (cmpc === 'no' && presenciaCmpcPrio_(c)) return false;
  if (trabajo) {   // trabajo de copamiento en la comuna (SQL 87)
    const r = (state.prio.resumen || {})[c.id_comuna];
    const conPlan = !!(r && (r.ent_verde + r.ent_amarilla + r.ent_roja) > 0), conGrd = !!(r && r.n_grd > 0);
    if (trabajo === 'trabajadas' && !conPlan) return false;
    if (trabajo === 'sin' && conPlan) return false;
    if (trabajo === 'grd' && !conGrd) return false;
    if (trabajo === 'singrd' && conGrd) return false;
  }
  if (tipo === 'relevantes') return esRelevantePrio_(c, state.prio.params);
  if (tipo === 'ambas') return c.v5_tipo === 'Estratégicos' || c.v5_tipo === 'Relevancia política';
  if (tipo) return c.v5_tipo === tipo;
  return true;
}
function recalcularPrio_() {
  const P = state.prio.params; if (!P) return;
  const conteo = {}; PRIO_NIVELES.forEach(n => { conteo[n.k] = 0; });
  let totalFiltro = 0;
  const dist = {}; PRIO_VARS.forEach(v => { dist[v.k] = [0, 0, 0, 0]; });
  state.prio.datos.forEach(c => {
    c._r = calcularPrio_(c, P);
    // Referencia: la prioridad SIN ponderar (suma simple de la matriz) con los mismos niveles
    c._prioExcel = c._r.prioSinPeso;
    if (!pasaFiltrosPrio_(c)) return;
    totalFiltro++;
    conteo[c._r.prio]++;
    PRIO_VARS.forEach(v => { dist[v.k][c._r[v.k]]++; });
  });
  // Mapa
  const porId = {}; state.prio.datos.forEach(c => { porId[c.id_comuna] = c; });
  // Con un filtro activo, en el mapa quedan SOLO las comunas filtradas
  const hayFiltro = hayFiltroPrio_();
  Object.entries(state.prio.capas).forEach(([id, capa]) => {
    const c = porId[id];
    const visible = c ? cumpleFiltrosPrio_(c) : !hayFiltro;
    if (state.prio.grupo) {
      if (visible && !state.prio.grupo.hasLayer(capa)) state.prio.grupo.addLayer(capa);
      if (!visible && state.prio.grupo.hasLayer(capa)) state.prio.grupo.removeLayer(capa);
    }
    if (!visible) return;
    if (!c) { capa.setStyle({ fillColor: '#F8FAFC', fillOpacity: 0.4, color: '#94A3B8', weight: 0.8, dashArray: '3,3' }); return; }
    const n = prioInfo_(c._r.prio);
    const res = (state.prio.resumen || {})[id];
    const conPlan = !!(res && (res.ent_verde + res.ent_amarilla + res.ent_roja) > 0);
    // Borde gris suave para todas; las comunas trabajadas se marcan con la onda del centro
    capa.setStyle({ fillColor: n.color, fillOpacity: PRIO_OPACIDAD_MAPA, color: '#7C8B83', weight: c._r.prio === 1 ? 1.4 : 0.7, dashArray: null });
  });
  const btnLimpiar = document.getElementById('prio-limpiar');
  // «Limpiar» solo aparece si hay algo distinto de lo por defecto (presencia CMPC ≥ 100 ha)
  const cmpcDefecto = document.getElementById('prio-cmpc').value === 'si' && Number(document.getElementById('prio-cmpc-min').value) === 100;
  const otrosFiltros = !!(document.getElementById('prio-region').value || document.getElementById('prio-tipo').value || document.getElementById('prio-trabajo').value ||
    document.getElementById('prio-subg').value || document.getElementById('prio-area').value ||
    (document.getElementById('prio-busqueda').value || '').trim() || state.prio.filtroNivel != null);
  if (btnLimpiar) btnLimpiar.style.display = (otrosFiltros || !cmpcDefecto) ? '' : 'none';
  // Cantidad de comunas con / sin presencia CMPC (según el mínimo de hectáreas), en el propio filtro
  const selCmpc = document.getElementById('prio-cmpc');
  if (selCmpc) {
    const conCmpc = state.prio.datos.filter(presenciaCmpcPrio_).length;
    const min = Number(document.getElementById('prio-cmpc-min').value) || 0;
    selCmpc.options[1].textContent = '🌲 Solo con presencia CMPC (' + conCmpc + ')';
    selCmpc.options[2].textContent = '○ Sin presencia CMPC (' + (state.prio.datos.length - conCmpc) + ')';
    selCmpc.title = 'Presencia CMPC = ' + (min > 0 ? 'al menos ' + fmtNumPrio_(min, 0) + ' ha' : 'cualquier superficie') + ' de patrimonio CMPC en la comuna (V1)';
    selCmpc.classList.toggle('activo', !!selCmpc.value);
  }
  aplicarEfectosMapaPrio_();
  renderListaPrio_();
  // Resumen
  document.getElementById('prio-resumen').innerHTML = PRIO_NIVELES.map(n =>
    '<div class="prio-kpi' + (state.prio.filtroNivel === n.k ? ' sel' : '') + '" data-prio-kpi="' + n.k + '" style="background:' + n.color + ';color:' + n.texto + ';" title="Filtrar por ' + n.nombre + '">' +
    '<b>' + conteo[n.k] + '</b><span>' + n.nombre + (totalFiltro ? ' · ' + Math.round(conteo[n.k] / totalFiltro * 100) + '%' : '') + '</span></div>').join('') +
    '<div class="prio-kpi prio-kpi-total' + (state.prio.filtroNivel == null ? ' sel' : '') + '" data-prio-kpi="" title="Ver todos los niveles"><b>' + totalFiltro + '</b><span>Total</span></div>';
  document.querySelectorAll('[data-prio-kpi]').forEach(k => k.addEventListener('click', () => {
    if (k.dataset.prioKpi === '') { state.prio.filtroNivel = null; recalcularPrio_(); encuadrarFiltroPrio_(); return; }
    const v = Number(k.dataset.prioKpi);
    state.prio.filtroNivel = state.prio.filtroNivel === v ? null : v;
    recalcularPrio_();
    encuadrarFiltroPrio_();
  }));
  // Distribución de puntos por variable
  PRIO_VARS.forEach(v => {
    const el = document.getElementById('prio-dist-' + v.k); if (!el) return;
    const tot = dist[v.k].reduce((a, b) => a + b, 0) || 1;
    const col = ['#EEF2F0', '#C7EED3', '#6FCF8E', '#166534'];
    el.innerHTML = dist[v.k].map((n, i) => '<span style="width:' + (100 * n / tot) + '%;background:' + col[i] + ';" title="' + i + ' pts: ' + n + ' comunas"></span>').join('');
    const t = document.getElementById('prio-dist-txt-' + v.k); if (t) t.textContent = dist[v.k].join(' · ') + ' comunas';
  });
  const cambian = state.prio.datos.filter(c => c._r.prioPond !== c._r.prioSinPeso).length;
  document.getElementById('prio-estado').textContent = P.metodo === 'ponderado'
    ? (cambian ? '⚖️ Ponderado: ' + cambian + ' comuna(s) cambian de nivel vs. la matriz' : '⚖️ Ponderado: sin cambios de nivel vs. la matriz')
    : '📊 Prioridad = Nivel de la matriz (suma V1…V6)' + (cambian ? ' · con ponderación cambiarían ' + cambian : '');
  if (document.getElementById('prio-ranking').style.display !== 'none') renderRankingPrio_();
}
function renderRankingPrio_() {
  const reg = document.getElementById('prio-region').value;
  const q = normalizarBusqueda_(document.getElementById('prio-busqueda').value || '');
  const lista = state.prio.datos
    .filter(c => pasaFiltrosPrio_(c) && (state.prio.filtroNivel == null || c._r.prio === state.prio.filtroNivel) &&
      (!q || normalizarBusqueda_(c.comuna + ' ' + c.id_comuna + ' ' + (c.provincia || '')).includes(q)))
    .sort((a, b) => b._r.nivel - a._r.nivel || a.comuna.localeCompare(b.comuna, 'es'));
  const cont = document.getElementById('prio-ranking');
  cont.innerHTML = (lista.length ? '' : '<div class="pe-vacio">Sin comunas con este filtro.</div>') + lista.slice(0, 400).map((c, i) => {
    const n = prioInfo_(c._r.prio);
    // Orden de importancia: 1 Muy alta … 4 Baja, 0 Sin prioridad al final
    const rango = p => p === 0 ? 5 : p;
    const cambio = c._r.prio === c._prioExcel ? '<span class="prio-cambio" style="color:#94A3B8;">=</span>'
      : rango(c._r.prio) < rango(c._prioExcel) ? '<span class="prio-cambio" style="color:#B91C1C;" title="Sube respecto del Excel">▲</span>'
      : '<span class="prio-cambio" style="color:#15803D;" title="Baja respecto del Excel">▼</span>';
    return '<div class="prio-fila" data-prio-id="' + c.id_comuna + '"><span class="pos">' + (i + 1) + '</span>' +
      '<span><b>' + escapeHtml_(c.comuna) + (state.prio.capas[c.id_comuna] ? '' : ' <span title="Sin límite en el mapa del sistema" style="opacity:.5;">⊘</span>') + '</b>' +
      '<small>' + c.id_comuna + ' · ' + escapeHtml_(c.provincia || '') + ' · ' + fmtNivelPrio_(c._r.nivel) + ' pts (Excel ' + c.excel_nivel + ')</small></span>' +
      '<span class="prio-badge" style="background:' + n.color + ';color:' + n.texto + ';">' + n.nombre + '</span>' + cambio + '</div>';
  }).join('');
  cont.querySelectorAll('[data-prio-id]').forEach(f => f.addEventListener('click', () => {
    const id = Number(f.dataset.prioId), capa = state.prio.capas[id];
    if (capa) { state.prio.mapa.fitBounds(capa.getBounds(), { padding: [60, 60], maxZoom: 10 }); abrirDetallePrio_(id, capa); }
    else mostrarToast_('Esta comuna no tiene límite cargado en el mapa del sistema.');
  }));
}
function tooltipPrio_(c, g) {
  if (!c) return '<b>' + escapeHtml_(g.comuna || '') + '</b><br>Sin datos en la matriz';
  const n = prioInfo_(c._r ? c._r.prio : 0);
  // Puntaje + interacción con el plan de copamiento sobre los incendios del trienio (SQL 87/89)
  const r = (state.prio.resumen || {})[c.id_comuna];
  const pct = v => v == null ? '—' : fmtNumPrio_(v, 1) + '%';
  let plan;
  if (state.prio.resumenEstado !== 'ok') plan = '<span class="gris">Copamiento: cargando…</span>';
  else if (!r || (r.ent_verde + r.ent_amarilla + r.ent_roja) <= 0) plan = '<span class="no">⚪ Sin plan de copamiento</span><br><span class="gris">No interactúa con los incendios de la comuna</span>';
  else if (r.tiene_ameba === false) plan = '<span class="ok">✅ Con plan de copamiento</span> <span class="gris">(' + (r.ent_verde + r.ent_amarilla + r.ent_roja) + ' entidades)</span><br><span class="no">⚠️ Falta calcular su zona de incendios del trienio</span>';
  else {
    const algo = [r.pct_verde, r.pct_amarilla, r.pct_roja].some(v => Number(v) > 0);
    plan = (algo ? '<span class="ok">🔥 Interactúa con los incendios (trienio)</span>' : '<span class="no">⚠️ Con plan, pero sin cobertura sobre los incendios</span>') +
      '<br>🟢 Normal <b>' + pct(r.pct_verde) + '</b> · 🟡 <b>' + pct(r.pct_amarilla) + '</b> · 🔴 <b>' + pct(r.pct_roja) + '</b>' +
      (r.ameba_km2 != null ? '<br><span class="gris">Zona de incendios: ' + fmtNumPrio_(r.ameba_km2, 1) + ' km²</span>' : '');
  }
  return '<div class="prio-tt"><div class="t">' + escapeHtml_(aTitulo_(c.comuna)) + '</div>' +
    '<span class="pts" style="background:' + n.color + ';color:' + n.texto + ';">' + (c._r ? fmtNivelPrio_(c._r.nivel) : '—') + ' / 18 pts</span>Prioridad <b>' + n.nombre + '</b>' +
    (Number(c.v1_ha_cmpc) > 0 ? '<br><span class="gris">🌲 CMPC: ' + fmtNumPrio_(c.v1_ha_cmpc, 0) + ' ha (' + fmtNumPrio_(c.v1_pct, 1) + '% de la comuna)</span>' : '<br><span class="gris">Sin presencia CMPC</span>') +
    '<div class="sep"></div>' + plan + '</div>';
}
function abrirDetallePrio_(id, capa) {
  const c = state.prio.datos.find(x => x.id_comuna === id);
  if (!c || !c._r) return;
  const n = prioInfo_(c._r.prio);
  const Pp = state.prio.params || {}, pesoDe = k => fmtPesoPrio_((Pp.pesos || {})[k]) + '%';
  // 14-10-2026: ventana compacta y semitransparente (mini tarjetas por variable; la tabla completa queda plegada)
  const puntosTxt = p => '●'.repeat(p) + '○'.repeat(Math.max(0, 3 - p));
  const mini = (cod, nom, pts, val, k) => '<div class="pd-var" style="--c:' + ((PRIO_ESTILO_VAR[k] || {}).color || '#64748B') + ';" title="' + escapeHtml_(nom + ': ' + val + ' · ' + pts + ' pts · peso ' + pesoDe(k)) + '">' +
    '<div class="pd-var-top"><b>' + cod + '</b><span>' + pesoDe(k) + '</span></div><div class="pd-pts">' + puntosTxt(pts) + '</div><div class="pd-val">' + escapeHtml_(val) + '</div></div>';
  const minis = PRIO_VARS.map(v => { const [cod, nom] = v.nombre.split(' · '); return mini(cod, nom, c._r[v.k], v.fmt(Number(c[v.campo]) || 0), v.k); }).join('') +
    mini('V5', 'Comuna estratégica', c._r.v5, c.v5_tipo === 'Estratégicos' ? 'Estratégica' : c.v5_tipo === 'Relevancia política' ? 'Relev. política' : '—', 'v5') +
    mini('V6', 'Comuna relevante', c._r.v6, esRelevantePrio_(c, Pp) ? '📌 Relevante' : '—', 'v6');
  const filas = PRIO_VARS.map(v => '<tr><td>' + v.nombre + '</td><td class="n">' + v.fmt(Number(c[v.campo]) || 0) + '</td><td class="n"><b>' + c._r[v.k] + '</b></td><td class="n" style="color:#0F766E;">' + pesoDe(v.k) + '</td><td class="n" style="color:#94A3B8;">' + c['excel_' + v.k] + '</td></tr>').join('') +
    '<tr><td>V5 · Comuna estratégica</td><td class="n">' + escapeHtml_(c.v5_tipo || '—') + '</td><td class="n"><b>' + c._r.v5 + '</b></td><td class="n" style="color:#0F766E;">' + pesoDe('v5') + '</td><td class="n" style="color:#94A3B8;">' + c.excel_v5 + '</td></tr>' +
    '<tr><td>V6 · Comuna relevante</td><td class="n">' + (c._r.v6 > 0 || esRelevantePrio_(c, Pp) ? '📌 Sí' : 'No') + '</td><td class="n"><b>' + c._r.v6 + '</b></td><td class="n" style="color:#0F766E;">' + pesoDe('v6') + '</td><td class="n" style="color:#94A3B8;">—</td></tr>';
  const r = (state.prio.resumen || {})[id];
  const p = v => v == null ? '—' : fmtNumPrio_(v, 0) + '%';
  const chip = (t, cls, tit) => '<span class="pd-chip ' + (cls || '') + '"' + (tit ? ' title="' + escapeHtml_(tit) + '"' : '') + '>' + t + '</span>';
  const situacion = r
    ? '<div class="pd-chips">' +
        chip('🟢 ' + p(r.pct_verde), '', 'Copamiento Normal sobre incendios (trienio)') + chip('🟡 ' + p(r.pct_amarilla), '', 'Copamiento Alerta Amarilla') + chip('🔴 ' + p(r.pct_roja), '', 'Copamiento Alerta Roja') +
        chip(r.n_grd > 0 ? '👤 GRD' : '👤 Sin GRD', r.n_grd > 0 ? 'si' : 'no', r.n_grd > 0 ? 'GRD: ' + (r.grd_nombres || '') : 'La comuna no tiene usuario GRD') +
        chip('📋 ' + (r.ent_verde + r.ent_amarilla + r.ent_roja), '', 'Entidades planificadas (N + A + R)') + chip('🛣️ ' + (r.rutas || 0), '', 'Rutas') +
        (comunaListaPrio_(id) ? chip('✅ Lista', 'si', 'Marcada como lista en el KPI de avance') : '') +
      '</div>' +
      (r.tiene_ameba === false && (r.ent_verde + r.ent_amarilla + r.ent_roja) > 0 ? '<div class="pd-aviso">⚠️ Falta calcular su zona de incendios del trienio</div>' : '')
    : '';
  const html = '<div class="prio-det pd">' +
    '<div class="pd-cab"><div style="min-width:0;"><div class="pd-nom">' + escapeHtml_(c.comuna) + '</div>' +
      '<div class="pd-sub">' + escapeHtml_(c.provincia || '') + ' · id ' + c.id_comuna + '</div></div>' +
      '<div class="pd-nivel" style="background:' + n.color + ';color:' + n.texto + ';" title="Nivel ' + fmtNivelPrio_(c._r.nivel) + ' de 21' + (c._r.nivel !== c._r.nivelBruto ? ' (ponderado; suma de la matriz ' + c._r.nivelBruto + ')' : ' (suma V1…V6 de la matriz)') + '">' +
        '<b>' + n.nombre + '</b><span>' + fmtNumPrio_(c._r.promedio, 1) + ' · ' + fmtNivelPrio_(c._r.nivel) + ' pts</span></div></div>' +
    '<div class="pd-vars">' + minis + '</div>' +
    situacion +
    '<details class="pd-det"><summary>Ver detalle</summary>' +
      '<table><tr style="color:#94A3B8;font-size:10px;"><td>Variable</td><td class="n">Valor</td><td class="n">Pts</td><td class="n">Peso</td><td class="n">Excel</td></tr>' + filas + '</table>' +
      (r && r.ameba_km2 != null ? '<div class="pd-sub" style="margin-top:4px;">Zona de incendios del trienio: ' + fmtNumPrio_(r.ameba_km2, 1) + ' km²</div>' : '') +
      (r && r.n_grd > 0 ? '<div class="pd-sub">GRD: ' + escapeHtml_(r.grd_nombres || '') + '</div>' : '') +
    '</details>' +
    '<div class="pd-acc">' +
      (puedeVerModulo_('planificador_mapa')
        ? '<button class="popup-btn pd-btn-pri" onclick="irAPlanificadorComunaPrio_(' + Number(c.id_comuna) + ')" title="Abrir la comuna en el Planificador de Alertas">🧭 Planificador</button>' : '') +
      (puedeEditarModulo_('prioridad')
        ? '<button class="popup-btn" onclick="alternarRelevantePrio_(' + Number(c.id_comuna) + ')" title="Cambiar el valor V6 · Comuna relevante de esta comuna">' +
          '📌 V6 = ' + v6ValorPrio_(c, Pp) + ' · cambiar</button>' : '') +
    '</div></div>';
  capa.bindPopup(html, { maxWidth: 300, minWidth: 270, className: 'prio-popup', autoPanPadding: [24, 24] }).openPopup();
}

function initials(name) { return (name || '?').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase(); }

async function doLogout() {
  // Sesiones de uso (SQL 116): se cierra la sesión antes de salir
  try { if (state.sesionUsoId) await supabaseClient.rpc('cerrar_sesion_uso', { p_id: state.sesionUsoId }); } catch (e) {}
  state.sesionUsoId = null;
  await supabaseClient.auth.signOut();
  location.reload();
}

