/* ============ EVENTOS ============ */
function abrirMiPerfil_() {
  const p = state.perfil || {};
  document.getElementById('mp-meta').textContent = (state.user ? state.user.email : '') + ' · ' + (p.perfil || '');
  document.getElementById('mp-nombre').value = p.nombre_completo || '';
  document.getElementById('mp-cargo').value = p.cargo || '';
  document.getElementById('mp-telefono').value = p.telefono || '';
  document.getElementById('mp-error').classList.remove('show');
  document.getElementById('user-panel').classList.remove('show');
  document.getElementById('mi-perfil-overlay').classList.add('show');
}
async function guardarMiPerfil_() {
  const nombre = document.getElementById('mp-nombre').value.trim();
  const cargo = document.getElementById('mp-cargo').value.trim();
  const telefono = document.getElementById('mp-telefono').value.trim();
  const err = document.getElementById('mp-error');
  if (!nombre) { err.textContent = 'El nombre es obligatorio.'; err.classList.add('show'); return; }
  const btn = document.getElementById('btn-save-mp'); btn.textContent = 'Guardando…'; btn.disabled = true;
  const { error } = await supabaseClient.rpc('actualizar_mi_perfil', { p_nombre: nombre, p_cargo: cargo, p_telefono: telefono });
  btn.textContent = 'Guardar cambios'; btn.disabled = false;
  if (error) { err.textContent = 'Error: ' + error.message; err.classList.add('show'); return; }
  state.perfil.nombre_completo = nombre; state.perfil.cargo = cargo || null; state.perfil.telefono = telefono || null;
  document.getElementById('up-nombre').textContent = nombre;
  document.getElementById('user-avatar').textContent = initials(nombre);
  document.getElementById('mi-perfil-overlay').classList.remove('show');
  mostrarToast_('Perfil actualizado.');
}

function bindEvents() {
  document.getElementById('btn-login').addEventListener('click', doLogin);
  document.getElementById('login-password').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
  document.getElementById('btn-force-password').addEventListener('click', doForcePasswordChange);
  document.getElementById('btn-logout').addEventListener('click', () => {
    // Al cerrar sesión se olvida cualquier perfil simulado
    try { sessionStorage.removeItem(SIM_CLAVE); } catch (e) {}
    doLogout();
  });
  document.getElementById('btn-sim-jefe').addEventListener('click', () => abrirModalSimulacion_('jefe'));
  document.getElementById('btn-sim-subgerente').addEventListener('click', () => abrirModalSimulacion_('subgerente'));
  document.getElementById('btn-sim-comuna').addEventListener('click', () => abrirModalSimulacion_('comuna'));
  // Modo Centralista: la Gestión Central en otra pestaña, con la misma sesión, vista como centralista
  document.getElementById('btn-sim-central').addEventListener('click', () => window.open('/gestioncentral/?modo=centralista', '_blank', 'noopener'));
  // Modo Agricultor: el sistema como lo ve la Asociación de Agricultores (Visor + solo 🌾 Agricultores)
  document.getElementById('btn-sim-agricultor').addEventListener('click', () => {
    const vic = (state.comunas || []).find(c => Number(c.id_comuna) === 9211);
    entrarSimulacion_({ perfil: 'Visor', asociacion: 'MALLECO', comunaId: vic ? vic.id : (state.activeComunaId || null) });
  });
  document.getElementById('btn-sim-salir').addEventListener('click', salirSimulacion_);

  document.getElementById('btn-open-change-password').addEventListener('click', () => {
    document.getElementById('user-panel').classList.remove('show');
    document.getElementById('change-password-overlay').classList.add('show');
  });
  document.getElementById('btn-cancel-cp').addEventListener('click', () => document.getElementById('change-password-overlay').classList.remove('show'));
  document.getElementById('btn-save-cp').addEventListener('click', doChangePasswordSelfService);

  // ❓ Centro de ayuda y recorridos guiados
  document.getElementById('btn-ayuda').addEventListener('click', (e) => { e.stopPropagation(); abrirAyuda_(); });
  // Botón planificar unificado
  document.getElementById('btn-planificar').addEventListener('click', (e) => {
    e.stopPropagation();
    document.getElementById('planificar-panel').classList.toggle('show');
  });
  document.addEventListener('click', () => {
    const p = document.getElementById('planificar-panel');
    if (p) p.classList.remove('show');
    const z = document.getElementById('zonas-recursos-panel');
    if (z) z.classList.remove('show');
  });
  // ---- Modo edición gráfica de recursos del área (solo Administrador) ----
  const itemRecursosArea = document.getElementById('plan-recursos-area');
  if (itemRecursosArea) itemRecursosArea.addEventListener('click', (e) => {
    e.stopPropagation();
    document.getElementById('planificar-panel').classList.remove('show');
    if (!state.perfil || !esAdminOJefe_()) {
      mostrarToast_('🔒 Solo el Administrador o el Jefe de Área pueden editar los recursos del área.');
      return;
    }
    const zonas = areasDisponibles_();
    if (!zonas || zonas.length === 0) {
      mostrarToast_('⚠️ No hay zonas de relacionamiento disponibles para editar.');
      return;
    }
    if (zonas.length === 1) { iniciarModoRecursosArea_(zonas[0]); return; }
    abrirSelectorZonaRecursos_(zonas);
  });
  // ---- Propagación escalonada del copamiento (solo Administrador) ----
  const itemPropagar = document.getElementById('plan-propagar-copamiento');
  if (itemPropagar) itemPropagar.addEventListener('click', (e) => {
    e.stopPropagation();
    document.getElementById('planificar-panel').classList.remove('show');
    propagarCopamientoComuna_();
  });
  document.getElementById('plan-periodo').addEventListener('click', () => {
    document.getElementById('planificar-panel').classList.remove('show');
    // Activa la pestaña Copamiento y el modo edición
    abrirPanelMapa_('copamiento');
    setTimeout(() => toggleEditorMode(), 150);
  });
  document.getElementById('plan-verde').addEventListener('click', () => {
    document.getElementById('planificar-panel').classList.remove('show');
    if (state.alertaLayersOn) state.alertaLayersOn.verde = true;
    renderTab(state.activeTab);
    setTimeout(() => iniciarPlanificacionRapida_('Verde'), 150);
  });
  document.getElementById('plan-amarilla').addEventListener('click', () => {
    document.getElementById('planificar-panel').classList.remove('show');
    // Activa la capa de Alerta Amarilla antes de planificar
    if (state.alertaLayersOn) state.alertaLayersOn.amarilla = true;
    renderTab(state.activeTab);
    setTimeout(() => iniciarPlanificacionRapida_('Amarilla'), 150);
  });
  document.getElementById('plan-roja').addEventListener('click', () => {
    document.getElementById('planificar-panel').classList.remove('show');
    // Activa la capa de Alerta Roja antes de planificar
    if (state.alertaLayersOn) state.alertaLayersOn.roja = true;
    renderTab(state.activeTab);
    setTimeout(() => iniciarPlanificacionRapida_('Roja'), 150);
  });
  const _betEv=document.getElementById('btn-editor-toggle'); if(_betEv) _betEv.addEventListener('click', toggleEditorMode);
  // ---- Herramienta regla (medición libre con el cursor) ----
  const btnRegla = document.getElementById('btn-regla');
  if (btnRegla) btnRegla.addEventListener('click', (e) => { e.stopPropagation(); toggleRegla_(); });
  const btnResumen = document.getElementById('btn-resumen-alertas-toggle');
  if (btnResumen) btnResumen.addEventListener('click', (e) => { e.stopPropagation(); toggleResumenAlertas_(); });
  const btnInfl = document.getElementById('btn-influencia');
  if (btnInfl) btnInfl.addEventListener('click', (e) => { e.stopPropagation(); toggleInfluencia_(); });
  // 🚦 Semáforos de propagación: encender / apagar (se recuerda en este navegador)
  const btnSem = document.getElementById('btn-semaforos');
  const aplicarSem = on => { document.body.classList.toggle('sin-semaforos', !on); if (btnSem) btnSem.classList.toggle('active', on); };
  let semOn = true; try { semOn = localStorage.getItem('ver_semaforos') !== '0'; } catch (e) {}
  aplicarSem(semOn);
  if (btnSem) btnSem.addEventListener('click', (e) => {
    e.stopPropagation(); semOn = !semOn; aplicarSem(semOn);
    try { localStorage.setItem('ver_semaforos', semOn ? '1' : '0'); } catch (x) {}
    mostrarToast_(semOn ? '🚦 Semáforos de propagación visibles' : '🚦 Semáforos ocultos');
  });
  const btnKpiInc = document.getElementById('btn-kpi-incendios');
  if (btnKpiInc) btnKpiInc.addEventListener('click', (e) => { e.stopPropagation(); toggleKpiIncendios_(); });  enlazarModalInforme_();
  // ---- Exportación de planes ----
  const pe = document.getElementById('plan-exportar');
  if (pe) pe.addEventListener('click', (e) => { e.stopPropagation(); abrirExportarPlan_(); });
  const ec = document.getElementById('exportar-cancelar');
  if (ec) ec.addEventListener('click', () => document.getElementById('exportar-overlay').classList.remove('show'));
  const eg = document.getElementById('exportar-geojson');
  if (eg) eg.addEventListener('click', exportarPlanGeoJSON_);
  const ek = document.getElementById('exportar-kml');
  if (ek) ek.addEventListener('click', exportarPlanKML_);

  // ---- Traspaso de rutas de patrullaje a las alertas ----
  const rtc = document.getElementById('ruta-traspaso-cancelar');
  if (rtc) rtc.addEventListener('click', () => {
    document.getElementById('ruta-traspaso-overlay').classList.remove('show');
    state.rutaTraspaso = null;
  });
  const rtg = document.getElementById('ruta-traspaso-guardar');
  if (rtg) rtg.addEventListener('click', confirmarTraspasoRuta_);
  const p1 = document.getElementById('ruta-preset-1');
  if (p1) p1.addEventListener('click', () => preajusteTraspaso_(['Amarilla']));
  const p2 = document.getElementById('ruta-preset-2');
  if (p2) p2.addEventListener('click', () => preajusteTraspaso_(['Amarilla', 'Roja']));
  const p3 = document.getElementById('ruta-preset-3');
  if (p3) p3.addEventListener('click', () => preajusteTraspaso_(['Verde', 'Amarilla', 'Roja']));
  window.addEventListener('resize', () => setTimeout(alinearResumenConSimbologia_, 60));
  // Los botones de tamaño y colapso de la simbología cambian su alto y ancho.
  ['sf-todas', 'sf-mas', 'sf-menos', 'sf-colapsar'].forEach(id => {
    const b = document.getElementById(id);
    if (b) b.addEventListener('click', () => setTimeout(alinearResumenConSimbologia_, 60));
  });
  const btnReglaArea = document.getElementById('btn-regla-cerrar-area');
  if (btnReglaArea) btnReglaArea.addEventListener('click', (e) => { e.stopPropagation(); reglaCerrarArea_(); });
  const btnReglaLimpiar = document.getElementById('btn-regla-limpiar');
  if (btnReglaLimpiar) btnReglaLimpiar.addEventListener('click', (e) => { e.stopPropagation(); reglaLimpiar_(); });
  const btnReglaSalir = document.getElementById('btn-regla-salir');
  if (btnReglaSalir) btnReglaSalir.addEventListener('click', (e) => { e.stopPropagation(); salirRegla_(); });
  document.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Escape') return;
    if (state.modoRegla) salirRegla_();
    if (state.cortarRuta) { salirCortarRuta_(); mostrarToast_('Corte cancelado.'); }
    if (state.unionLinea || (unionVerticesLayer && map.hasLayer(unionVerticesLayer))) {
      salirModoUnionLinea_();
      mostrarToast_('Unión cancelada.');
    }
  });
  document.getElementById('btn-fav-comuna').addEventListener('click', toggleFavoritoComuna_);
  document.getElementById('btn-actualizar-datos').addEventListener('click', () => actualizarDatos_('manual'));
  // Pestañas de vista Dashboard | Mapa | Administración
  document.querySelectorAll('.vista-tab[data-vista]').forEach(b => b.addEventListener('click', () => { cerrarSubmenus_(); mostrarVista_(b.dataset.vista); document.body.classList.remove('menu-movil-abierto'); }));
  iniciarMenuSuperior_();
  { const bcv = document.getElementById('btn-capas-visor'); if (bcv) bcv.addEventListener('click', () => alternarPanelMapa_('capas')); }
  { const bcm = document.getElementById('btn-copamiento-mapa'); if (bcm) bcm.addEventListener('click', () => alternarPanelMapa_('copamiento')); }
  { const bcp = document.getElementById('btn-crear-periodo-mapa'); if (bcp) bcp.addEventListener('click', () => abrirAsistentePeriodo_()); }
  { const pc = document.getElementById('pe-colapsar'); if (pc) pc.addEventListener('click', () => document.getElementById('panel-emergencia').classList.toggle('plegado')); }
  // Menú hamburguesa (móvil): abre/cierra la barra
  const btnHam = document.getElementById('btn-hamburguesa');
  if (btnHam) btnHam.addEventListener('click', () => document.body.classList.toggle('menu-movil-abierto'));
  // Botón modo oscuro / claro
  const btnTema = document.getElementById('btn-tema');
  if (btnTema) btnTema.addEventListener('click', () => {
    const oscuro = document.body.classList.toggle('tema-oscuro');
    btnTema.querySelector('.di-ico').textContent = oscuro ? '☀️' : '🌙';
    btnTema.querySelector('.di-txt').textContent = oscuro ? 'Modo claro' : 'Modo oscuro';
    // Refrescar mapa para que el basemap se vea bien tras el cambio
    setTimeout(() => { try { map.invalidateSize(); } catch (e) {} }, 60);
  });
  // ✨ Animaciones del mapa (rendimiento, 20-10-2026): se recuerda por navegador
  const btnAnim = document.getElementById('btn-animaciones');
  const pintarAnim = () => {
    const off = document.body.classList.contains('sin-animaciones');
    if (btnAnim) btnAnim.querySelector('.di-txt').textContent = 'Animaciones del mapa: ' + (off ? 'No' : 'Sí');
  };
  try { if (localStorage.getItem('sin_animaciones') === '1') document.body.classList.add('sin-animaciones'); } catch (e) {}
  pintarAnim();
  if (btnAnim) btnAnim.addEventListener('click', () => {
    const off = document.body.classList.toggle('sin-animaciones');
    try { localStorage.setItem('sin_animaciones', off ? '1' : '0'); } catch (e) {}
    pintarAnim();
    mostrarToast_(off ? '✨ Animaciones apagadas: el mapa queda más fluido.' : '✨ Animaciones encendidas (se pausan solas al editar).');
  });
  // Pantalla completa
  const btnFS = document.getElementById('btn-pantalla-completa');
  if (btnFS) btnFS.addEventListener('click', () => {
    if (!document.fullscreenElement) {
      (document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen || function(){}).call(document.documentElement);
    } else {
      (document.exitFullscreen || document.webkitExitFullscreen || function(){}).call(document);
    }
    setTimeout(() => { try { map.invalidateSize(); } catch (e) {} }, 200);
  });
  document.addEventListener('fullscreenchange', () => {
    if (btnFS) {
      btnFS.querySelector('.di-ico').textContent = document.fullscreenElement ? '🗗' : '⛶';
      btnFS.querySelector('.di-txt').textContent = document.fullscreenElement ? 'Salir de pantalla completa' : 'Pantalla completa';
    }
    setTimeout(() => { try { map.invalidateSize(); } catch (e) {} }, 200);
  });
  // Mi perfil (modal)
  document.getElementById('btn-mi-perfil').addEventListener('click', abrirMiPerfil_);
  document.getElementById('btn-cancel-mp').addEventListener('click', () => document.getElementById('mi-perfil-overlay').classList.remove('show'));
  document.getElementById('btn-save-mp').addEventListener('click', guardarMiPerfil_);
  // Cerrar menú móvil al elegir comuna/área
  ['comuna-select','area-select'].forEach(id => { const el = document.getElementById(id); if (el) el.addEventListener('change', () => document.body.classList.remove('menu-movil-abierto')); });
  // Menú lateral del panel de administración
  document.querySelectorAll('.admin-menu-item').forEach(b => b.addEventListener('click', () => cargarSeccionAdmin_(b.dataset.seccion)));
  // Módulo Gestión de Patrullajes
  document.getElementById('pat-side-close').addEventListener('click', cerrarAsigPat_);
  document.getElementById('pat-buscador').addEventListener('input', renderListaPat_);
  document.getElementById('pat-guardar').addEventListener('click', guardarAsigPat_);
  document.getElementById('pat-cancelar').addEventListener('click', cancelarAsigPat_);
  document.getElementById('btn-logo-municipal').addEventListener('click', () => document.getElementById('input-logo-municipal').click());
  document.getElementById('input-logo-municipal').addEventListener('change', (e) => { if (e.target.files[0]) { subirLogoMunicipal_(e.target.files[0]); e.target.value = ''; } });
  const _baEv=document.getElementById('btn-alerta-rapida'); if(_baEv) _baEv.addEventListener('click', (e) => {
    e.stopPropagation();
    document.getElementById('alerta-rapida-panel').classList.toggle('show');
    document.getElementById('basemap-panel').classList.remove('show');
    document.getElementById('user-panel').classList.remove('show');
  });
  document.getElementById('btn-alerta-rapida-amarilla').addEventListener('click', () => iniciarPlanificacionRapida_('Amarilla'));
  document.getElementById('btn-alerta-rapida-roja').addEventListener('click', () => iniciarPlanificacionRapida_('Roja'));

  // btn-recursos-area-rapido eliminado del DOM — funcionalidad en btn-planificar
  document.getElementById('btn-modo-punto').addEventListener('click', () => setModoDibujo_('punto'));
  document.getElementById('btn-modo-linea').addEventListener('click', () => setModoDibujo_('linea'));
  document.getElementById('btn-modo-area').addEventListener('click', () => setModoDibujo_('area'));
  document.getElementById('btn-dibujo-libre').addEventListener('click', toggleDibujoLibre_);
  document.getElementById('btn-cortar-ruta').addEventListener('click', () => { if (state.cortarRuta) salirCortarRuta_(); else iniciarCortarRuta_(); });
  document.getElementById('btn-iman-red-vial').addEventListener('click', toggleImanRedVial_);
  // ---- Importación de rutas desde KML / KMZ ----
  document.getElementById('btn-importar-kml').addEventListener('click', abrirImportacionKml_);
  document.getElementById('input-kml').addEventListener('change', (ev) => {
    const f = ev.target.files && ev.target.files[0];
    if (f) procesarArchivoKml_(f);
  });
  document.getElementById('kml-modal-cancelar').addEventListener('click', () => {
    document.getElementById('kml-modal-overlay').classList.remove('show');
    state.kmlImportacion = null;
  });
  // Cerrar el formulario a media cola detiene la importación.
  document.getElementById('btn-cancel-modal').addEventListener('click', () => {
    if (state.kmlCola) {
      const hechas = state.kmlCola.hechas, total = state.kmlCola.total;
      state.kmlCola = null;
      mostrarToast_('📥 Importación detenida: ' + hechas + ' de ' + total + ' rutas guardadas.');
      if (state.activeComunaId) loadPlanificacionRecursos_(state.activeComunaId);
    }
  });
  document.getElementById('kml-modal-guardar').addEventListener('click', confirmarImportacionKml_);
  // Barra de edición compacta: clic en la ayuda la muestra completa / la vuelve a una línea.
  document.getElementById('eb-fila').addEventListener('click', () => document.getElementById('eb-fila').classList.toggle('expandida'));
  // 19-10-2026: la barra de edición va SOBRE el selector de alertas (Normal / Amarilla / Roja), sin taparlo
  (function posicionBannerEdicion_() {
    const banner = document.getElementById('editor-banner'), sw = document.getElementById('escenario-switcher');
    if (!banner) return;
    const ajustar = () => {
      const visible = sw && getComputedStyle(sw).display !== 'none' && sw.offsetHeight > 0;
      const nuevo = visible ? (sw.getBoundingClientRect().height + 16 + 10) + 'px' : '';
      if (banner.style.bottom !== nuevo) banner.style.bottom = nuevo;
    };
    // Se recalcula de nuevo un instante después: al aparecer, el selector puede no tener alto todavía
    const ajustarDoble = () => { ajustar(); setTimeout(ajustar, 150); };
    new MutationObserver(ajustarDoble).observe(banner, { attributes: true, attributeFilter: ['class'] });
    if (sw) new MutationObserver(ajustarDoble).observe(sw, { attributes: true, attributeFilter: ['style', 'class'] });
    window.addEventListener('resize', ajustarDoble);
    ajustarDoble();
  })();
  // Trazo libre: clic empieza / clic termina; el movimiento del mouse traza (19-10-2026).
  map.on('click', clicTrazoLibre_);
  map.on('mousemove', continuarTrazoLibre_);
  document.getElementById('btn-finalizar-dibujo').addEventListener('click', finalizarDibujo_);
  document.getElementById('btn-deshacer-dibujo').addEventListener('click', () => deshacerDibujo_(false));
  document.getElementById('btn-papelera').addEventListener('click', abrirPapelera_);   // 🗑️ Recuperar eliminados (SQL 135)
  document.getElementById('btn-deshacer-forma').addEventListener('click', () => deshacerDibujo_(false));
  document.getElementById('btn-cancelar-dibujo').addEventListener('click', cancelarDibujo_);

  // ---- Simbología flotante ----
  const TAMANOS = ['sf-size-s', 'sf-size-m', 'sf-size-l'];
  document.getElementById('sf-mas').addEventListener('click', () => {
    const panel = document.getElementById('simbologia-flotante');
    const actual = TAMANOS.findIndex(t => panel.classList.contains(t));
    if (actual < TAMANOS.length - 1) { panel.classList.remove(TAMANOS[actual]); panel.classList.add(TAMANOS[actual + 1]); }
  });
  document.getElementById('sf-menos').addEventListener('click', () => {
    const panel = document.getElementById('simbologia-flotante');
    const actual = TAMANOS.findIndex(t => panel.classList.contains(t));
    if (actual > 0) { panel.classList.remove(TAMANOS[actual]); panel.classList.add(TAMANOS[actual - 1]); }
  });
  document.getElementById('sf-colapsar').addEventListener('click', () => {
    const panel = document.getElementById('simbologia-flotante');
    panel.classList.toggle('sf-collapsed');
    // Colapso independiente: el resumen conserva su propio estado. Solo se
    // reajusta su posición, porque la simbología cambió de alto.
    setTimeout(alinearResumenConSimbologia_, 60);
  });
  document.getElementById('sf-todas').addEventListener('click', () => {
    const insts = state.institucionesPeriodoActivo || {};
    const ids = Object.keys(insts);
    if (!ids.length) return;
    // Si hay al menos una visible, ocultar todas; si todas ocultas, mostrar todas.
    const algunaVisible = ids.some(id => !state.institucionesOcultas[id]);
    ids.forEach(id => { state.institucionesOcultas[id] = algunaVisible; });
    aplicarVisibilidadInstituciones_();
    renderSimbologiaFlotante_();
  });
  document.getElementById('btn-guardar-forma').addEventListener('click', guardarEdicionForma_);
  document.getElementById('btn-cancelar-forma').addEventListener('click', cancelarEdicionForma_);
  document.getElementById('btn-cancel-modal').addEventListener('click', () => {
    document.getElementById('modal-overlay').classList.remove('show');
    state.editingIdPlan = null;
    state.pendingLatLng = null;
  });
  document.getElementById('btn-save-modal').addEventListener('click', guardarRecursoDesdeModal_);

  document.getElementById('u-perfil').addEventListener('change', actualizarVisibilidadComunasSegunPerfil_);
  document.getElementById('u-comunas-search').addEventListener('input', filtrarComunasChecklist_);
  document.getElementById('u-perfil').addEventListener('change', actualizarConteoUsuario_);
  document.getElementById('u-comunas-solo').addEventListener('change', filtrarComunasChecklist_);
  document.getElementById('u-comunas-list').addEventListener('change', actualizarConteoUsuario_);
  document.getElementById('u-areas-list').addEventListener('change', actualizarConteoUsuario_);
  document.getElementById('u-comunas-list').addEventListener('click', (e) => {
    const b = e.target.closest('.um-reg-btn');
    if (!b) return;
    // Marcar / quitar todas las comunas VISIBLES de la región (respeta la búsqueda)
    const vis = [...b.closest('.comuna-region-grupo').querySelectorAll('label[data-nombre]')].filter(l => l.style.display !== 'none').map(l => l.querySelector('input'));
    const marcar = !vis.every(i => i.checked);
    vis.forEach(i => { i.checked = marcar; });
    actualizarConteoUsuario_();
  });
  document.getElementById('btn-cancel-user-modal').addEventListener('click', () => document.getElementById('user-modal-overlay').classList.remove('show'));
  document.getElementById('btn-save-user-modal').addEventListener('click', guardarUsuarioDesdeModal_);

  document.getElementById('btn-close-usuarios-panel').addEventListener('click', () => document.getElementById('usuarios-panel-overlay').classList.remove('show'));
  document.getElementById('btn-nuevo-usuario').addEventListener('click', () => abrirModalUsuario_(null));
  document.getElementById('usuarios-search').addEventListener('input', renderUsuariosPanelList_);

  document.getElementById('btn-cerrar-credencial').addEventListener('click', () => document.getElementById('credencial-modal-overlay').classList.remove('show'));
  document.getElementById('btn-copiar-credencial').addEventListener('click', () => {
    const input = document.getElementById('credencial-valor');
    input.select();
    navigator.clipboard.writeText(input.value).then(() => {
      const btn = document.getElementById('btn-copiar-credencial');
      btn.textContent = '✓ Copiado';
      btn.classList.add('copied');
      setTimeout(() => { btn.textContent = 'Copiar'; btn.classList.remove('copied'); }, 2000);
    }).catch(() => {
      document.execCommand('copy');
    });
  });

  document.getElementById('btn-close-instituciones-panel').addEventListener('click', () => document.getElementById('instituciones-panel-overlay').classList.remove('show'));

  // ---- Panel Patrulleros ----
  const _bpEv=document.getElementById('btn-patrulleros'); if(_bpEv) _bpEv.addEventListener('click', abrirPanelPatrulleros_);
  document.getElementById('btn-close-patrulleros-panel').addEventListener('click', () => document.getElementById('patrulleros-panel-overlay').classList.remove('show'));
  document.getElementById('patrulleros-search').addEventListener('input', renderPatrulleros_);
  document.getElementById('btn-nuevo-patrullero').addEventListener('click', () => abrirFormPatrullero_(null));
  document.getElementById('btn-close-patrullero-form').addEventListener('click', () => document.getElementById('patrullero-form-overlay').classList.remove('show'));
  document.getElementById('btn-cancelar-patrullero').addEventListener('click', () => document.getElementById('patrullero-form-overlay').classList.remove('show'));
  document.getElementById('btn-guardar-patrullero').addEventListener('click', guardarPatrullero_);
  document.getElementById('btn-exportar-patrulleros').addEventListener('click', exportarPatrulleros_);
  document.getElementById('btn-importar-patrulleros').addEventListener('click', () => document.getElementById('input-import-patrulleros').click());
  document.getElementById('input-import-patrulleros').addEventListener('change', (e) => { if (e.target.files[0]) { importarPatrulleros_(e.target.files[0]); e.target.value = ''; } });

  // ---- Modo Asignación (Etapa 4) ----
  document.getElementById('asignacion-fecha').addEventListener('change', cargarAsignacionRutas_);
  document.getElementById('btn-cerrar-asignacion').addEventListener('click', () => { const tg = document.getElementById('toggle-asignacion'); if (tg) tg.classList.remove('on'); toggleModoAsignacion_(false); });
  document.getElementById('btn-close-asig-panel').addEventListener('click', cerrarPanelAsig_);
  document.getElementById('asig-fecha').addEventListener('change', cargarSeleccionActual_);
  document.getElementById('asig-buscador').addEventListener('input', renderListaAsig_);
  document.getElementById('btn-guardar-asig-ruta').addEventListener('click', guardarAsigRuta_);
  document.getElementById('btn-cancelar-asig-ruta').addEventListener('click', cancelarAsigRuta_);
  document.getElementById('btn-nueva-institucion').addEventListener('click', () => abrirModalInstitucion_(null));
  document.getElementById('btn-cancel-institucion').addEventListener('click', () => document.getElementById('institucion-modal-overlay').classList.remove('show'));
  document.getElementById('btn-save-institucion').addEventListener('click', guardarInstitucionDesdeModal_);
  // Preview del logo al elegir archivo + quitar logo
  document.getElementById('i-logo-file').addEventListener('change', (e) => {
    const f = e.target.files[0]; if (!f) return;
    const prev = document.getElementById('i-logo-preview');
    prev.src = URL.createObjectURL(f); prev.style.display = 'block';
    document.getElementById('btn-quitar-logo').style.display = 'inline-block';
  });
  document.getElementById('btn-quitar-logo').addEventListener('click', () => {
    document.getElementById('i-logo-url').value = '';
    document.getElementById('i-logo-file').value = '';
    const prev = document.getElementById('i-logo-preview'); prev.src = ''; prev.style.display = 'none';
    document.getElementById('btn-quitar-logo').style.display = 'none';
  });

  document.getElementById('btn-close-recursos-maestro').addEventListener('click', () => document.getElementById('recursos-maestro-overlay').classList.remove('show'));
  document.getElementById('btn-nuevo-recurso-maestro').addEventListener('click', () => abrirModalRecursoMaestro_(null));
  document.getElementById('btn-cancel-recurso-maestro').addEventListener('click', () => document.getElementById('recurso-maestro-modal-overlay').classList.remove('show'));
  document.getElementById('btn-save-recurso-maestro').addEventListener('click', guardarRecursoMaestro_);
  // Ícono personalizado del recurso
  document.getElementById('rm-icono-btn').addEventListener('click', () => document.getElementById('rm-icono-input').click());
  document.getElementById('rm-icono-input').addEventListener('change', (ev) => {
    const file = ev.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
      rmIconoBase64 = e.target.result;
      const img = document.getElementById('rm-icono-img');
      const ph = document.getElementById('rm-icono-placeholder');
      img.src = rmIconoBase64; img.style.display = 'block'; ph.style.display = 'none';
      document.getElementById('rm-icono-quitar').style.display = 'inline-block';
    };
    reader.readAsDataURL(file);
  });
  document.getElementById('rm-icono-quitar').addEventListener('click', () => {
    rmIconoBase64 = null; rmIconoUrlActual = null;
    document.getElementById('rm-icono-input').value = '';
    const img = document.getElementById('rm-icono-img');
    img.src = ''; img.style.display = 'none';
    document.getElementById('rm-icono-placeholder').style.display = 'block';
    document.getElementById('rm-icono-quitar').style.display = 'none';
  });

  document.getElementById('btn-close-recursos-area').addEventListener('click', () => document.getElementById('recursos-area-overlay').classList.remove('show'));
  document.getElementById('btn-ra-zonas-dropdown').addEventListener('click', (e) => {
    e.stopPropagation();
    document.getElementById('ra-zonas-dropdown-panel').style.display = document.getElementById('ra-zonas-dropdown-panel').style.display === 'block' ? 'none' : 'block';
  });
  document.getElementById('ra-zonas-dropdown-panel').addEventListener('click', (e) => e.stopPropagation());
  document.getElementById('ra-zonas-search').addEventListener('input', (e) => {
    const filtro = normalizarBusqueda_(e.target.value);
    document.querySelectorAll('#ra-zonas-checklist label').forEach(lab => {
      lab.style.display = (!filtro || lab.dataset.nombre.includes(filtro)) ? 'flex' : 'none';
    });
  });
  document.getElementById('btn-ra-zonas-todas').addEventListener('click', () => {
    document.querySelectorAll('#ra-zonas-checklist input').forEach(inp => { inp.checked = true; raZonasSeleccionadas.add(inp.value); });
    actualizarContadorZonasDropdown_();
    seleccionarTabRecursosArea_('zonas');
  });
  document.getElementById('btn-ra-zonas-ninguna').addEventListener('click', () => {
    document.querySelectorAll('#ra-zonas-checklist input').forEach(inp => { inp.checked = false; raZonasSeleccionadas.delete(inp.value); });
    actualizarContadorZonasDropdown_();
    seleccionarTabRecursosArea_('zonas');
  });
  document.getElementById('btn-nuevo-recurso-area').addEventListener('click', () => abrirModalRecursoArea_(null));
  document.getElementById('btn-cancel-recurso-area').addEventListener('click', () => document.getElementById('recurso-area-modal-overlay').classList.remove('show'));
  document.getElementById('btn-save-recurso-area').addEventListener('click', () => {
    if (editingRecursoAreaId) { guardarRecursoArea_(); return; }
    if (state.modoRecursosArea && recursoAreaGeomPendiente) { guardarRecursoAreaDesdeDibujo_(); return; }
    guardarRecursoArea_();
  });
  document.getElementById('btn-ubicar-recurso-area').addEventListener('click', ubicarRecursoAreaEnMapa_);

  document.getElementById('btn-close-planificacion-previa').addEventListener('click', () => document.getElementById('planificacion-previa-overlay').classList.remove('show'));
  document.getElementById('btn-escenario-verde').addEventListener('click', async () => {
    state.escenarioActivo = 'Verde';
    actualizarBotonesEscenario_();
    await cargarPlanificacionPrevia_();
  });
  document.getElementById('btn-escenario-amarilla').addEventListener('click', async () => {
    state.escenarioActivo = 'Amarilla';
    actualizarBotonesEscenario_();
    await cargarPlanificacionPrevia_();
  });
  document.getElementById('btn-escenario-roja').addEventListener('click', async () => {
    state.escenarioActivo = 'Roja';
    actualizarBotonesEscenario_();
    await cargarPlanificacionPrevia_();
  });
  document.getElementById('btn-cancel-propuesta-plan').addEventListener('click', () => document.getElementById('propuesta-plan-overlay').classList.remove('show'));
  document.getElementById('btn-admin-recursos-plan').addEventListener('click', abrirAdminRecursosPlan_);
  document.getElementById('btn-close-admin-recursos-plan').addEventListener('click', () => document.getElementById('admin-recursos-plan-overlay').classList.remove('show'));
  document.getElementById('btn-cancel-editar-recurso-plan').addEventListener('click', () => document.getElementById('editar-recurso-plan-overlay').classList.remove('show'));
  document.getElementById('btn-save-editar-recurso-plan').addEventListener('click', guardarEdicionRecursoPlanificado_);
  document.getElementById('btn-salir-planificacion').addEventListener('click', () => {
    if (state.modoRecursosArea) salirModoRecursosArea_(); else salirModoPlanificacion_();
  });

  document.getElementById('btn-close-resumen-general').addEventListener('click', () => document.getElementById('resumen-general-overlay').classList.remove('show'));
  document.getElementById('resumen-general-search').addEventListener('input', renderResumenGeneralList_);
  document.getElementById('btn-close-plan-comuna').addEventListener('click', () => document.getElementById('plan-comuna-overlay').classList.remove('show'));
  document.getElementById('btn-ir-al-mapa-comuna').addEventListener('click', (e) => {
    const comunaId = e.currentTarget.dataset.comunaId;
    document.getElementById('plan-comuna-overlay').classList.remove('show');
    document.getElementById('resumen-general-overlay').classList.remove('show');
    setActiveComuna(comunaId, true);
    const sel = document.getElementById('comuna-select');
    if (sel && sel.style.display !== 'none') sel.value = comunaId;
  });

  document.getElementById('btn-cancel-periodo').addEventListener('click', () => document.getElementById('periodo-modal-overlay').classList.remove('show'));
  document.getElementById('btn-no-copiar-planificacion').addEventListener('click', () => document.getElementById('copiar-planificacion-overlay').classList.remove('show'));
  document.getElementById('btn-save-periodo').addEventListener('click', guardarPeriodoDesdeModal_);
  // Asistente de Periodo Crítico y permisos por usuario (11-10-2026)
  document.getElementById('pca-siguiente').addEventListener('click', avanzarAsistentePeriodo_);
  document.getElementById('pca-atras').addEventListener('click', retrocederAsistentePeriodo_);
  document.getElementById('ci-cancelar').addEventListener('click', () => document.getElementById('confirmar-informe-overlay').classList.remove('show'));
  document.getElementById('ci-generar').addEventListener('click', confirmarInformeCopamiento_);
  document.getElementById('perm-cancelar').addEventListener('click', () => document.getElementById('permisos-overlay').classList.remove('show'));
  document.getElementById('perm-guardar').addEventListener('click', () => guardarPermisosUsuario_(false));
  document.getElementById('perm-restablecer').addEventListener('click', () => guardarPermisosUsuario_(true));
  document.getElementById('btn-close-resumen').addEventListener('click', () => document.getElementById('resumen-modal-overlay').classList.remove('show'));
  document.getElementById('btn-pdf-periodo').addEventListener('click', () => { if (state.resumenPeriodoActivoId) generarPDFPeriodo_(state.resumenPeriodoActivoId); });
  document.getElementById('btn-cancel-cerrar-periodo').addEventListener('click', () => document.getElementById('cerrar-periodo-modal-overlay').classList.remove('show'));
  document.getElementById('btn-confirmar-cerrar-periodo').addEventListener('click', confirmarCerrarPeriodo_);

  // Indicador modo edición: clic para salir
  const indEdit = document.getElementById('indicador-edicion');
  if (indEdit) indEdit.addEventListener('click', () => {
    if (state.editorMode) toggleEditorMode();
    else if (state.modoPlanificacion) salirModoPlanificacion_();
  });
  // Botón salir del banner inferior (modo copamiento)
  const btnSalirEd = document.getElementById('btn-salir-edicion');
  if (btnSalirEd) btnSalirEd.addEventListener('click', () => {
    if (state.editorMode) toggleEditorMode();
  });
  // Botones flotantes de escenario
  document.getElementById('esc-btn-verde').addEventListener('click', () => activarEscenarioDesdeBoton_('Verde'));
  document.getElementById('esc-btn-amarilla').addEventListener('click', () => activarEscenarioDesdeBoton_('Amarilla'));
  document.getElementById('esc-btn-roja').addEventListener('click', () => activarEscenarioDesdeBoton_('Roja'));
  document.getElementById('btn-meteo-horaria-cerrar').addEventListener('click', cerrarMeteoHoraria_);
  document.getElementById('btn-meteo-ampliar').addEventListener('click', toggleMeteoAmpliar_);
  document.getElementById('meteo-horaria-overlay').addEventListener('click', e => { if (e.target === e.currentTarget) cerrarMeteoHoraria_(); });
  document.getElementById('btn-meteo-horaria').addEventListener('click', abrirMeteoHoraria_);
  document.getElementById('btn-windy-toolbar').addEventListener('click', abrirWindyDesdeToolbar_);
  document.getElementById('windy-close').addEventListener('click', () => {
    document.getElementById('windy-overlay').classList.remove('show');
    document.getElementById('windy-iframe').src = 'about:blank';
  });

  document.querySelectorAll('.rail-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tabId = btn.dataset.tab;
      if (tabId === 'usuarios') { abrirPanelUsuarios_(); return; }
      if (tabId === 'instituciones') { abrirPanelInstituciones_(); return; }
      if (tabId === 'resumen-general') { abrirPanelResumenGeneral_(); return; }
      if (tabId === 'planificacion-previa') { abrirPanelPlanificacionPrevia_(); return; }
      if (tabId === 'recursos-area') { abrirPanelRecursosArea_(); return; }
      if (tabId === 'recursos-maestro') { abrirPanelRecursosMaestro_(); return; }
      document.querySelectorAll('.rail-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderTab(tabId);
    });
  });

  document.getElementById('collapse-toggle').addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('collapsed');
    document.getElementById('collapse-toggle').classList.toggle('panel-collapsed');
  });
  // Estado inicial del panel de capas: colapsado SOLO en móvil real; abierto en desktop
  // GARANTÍA ESTRUCTURAL: si el sidebar quedó anidado dentro de la topbar (bug de
  // HTML), lo movemos a #app para que tome la altura completa de la pantalla.
  (function reubicarSidebar_(){
    const app = document.getElementById('app');
    const tb = document.getElementById('topbar');
    const sb = document.getElementById('sidebar');
    const ct = document.getElementById('collapse-toggle');
    if (app && sb && sb.parentElement === tb) app.appendChild(sb);
    if (app && ct && ct.parentElement === tb) app.appendChild(ct);
  })();
  const esPantallaMovil = window.innerWidth <= 600;
  if (esPantallaMovil) {
    document.getElementById('sidebar').classList.add('collapsed');
    document.getElementById('collapse-toggle').classList.add('panel-collapsed');
  } else {
    // Desktop: el panel arranca cerrado y se despliega con los íconos 🗂️ / 📍 del mapa.
    document.getElementById('sidebar').classList.toggle('collapsed', !state.panelMapaAbierto);
    document.getElementById('collapse-toggle').classList.remove('panel-collapsed');
    document.getElementById('sidebar').style.display = '';
  }
  // Móvil: botón flotante abre el bottom sheet de capas; el handle lo cierra
  const btnCapasMovil = document.getElementById('btn-capas-movil');
  if (btnCapasMovil) btnCapasMovil.addEventListener('click', () => {
    document.getElementById('sidebar').classList.remove('collapsed');
    document.body.classList.add('sheet-abierto');
  });
  // Tocar el handle superior del sheet lo cierra (en móvil)
  document.getElementById('sidebar').addEventListener('click', (e) => {
    if (window.innerWidth <= 600 && e.offsetY < 16 && e.target.id === 'sidebar') {
      document.getElementById('sidebar').classList.add('collapsed');
      document.body.classList.remove('sheet-abierto');
    }
  });

  document.getElementById('btn-basemap').addEventListener('click', (e) => {
    e.stopPropagation();
    document.getElementById('basemap-panel').classList.toggle('show');
    document.getElementById('user-panel').classList.remove('show');
  });
  document.getElementById('user-chip').addEventListener('click', (e) => {
    e.stopPropagation();
    document.getElementById('user-panel').classList.toggle('show');
    document.getElementById('basemap-panel').classList.remove('show');
  });
  document.addEventListener('click', () => {
    document.getElementById('basemap-panel').classList.remove('show');
    document.getElementById('user-panel').classList.remove('show');
    document.getElementById('alerta-rapida-panel').classList.remove('show');
    const panelZonas = document.getElementById('ra-zonas-dropdown-panel');
    if (panelZonas) panelZonas.style.display = 'none';
  });
}
