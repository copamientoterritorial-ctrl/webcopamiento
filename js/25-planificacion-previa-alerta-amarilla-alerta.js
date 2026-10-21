/* ============ PLANIFICACIÓN PREVIA (Alerta Amarilla / Alerta Roja) ============ */
state.escenarioActivo = 'Amarilla';
state.planificacionEntidades = [];
let planContingenciaOverlay = L.layerGroup().addTo(map);

async function abrirPanelPlanificacionPrevia_() {
  document.getElementById('planificacion-previa-overlay').classList.add('show');
  actualizarBotonesEscenario_();
  await cargarPlanificacionPrevia_();
}

function actualizarBotonesEscenario_() {
  [['btn-escenario-verde','Verde','#16A34A'],
   ['btn-escenario-amarilla','Amarilla','#F59E0B'],
   ['btn-escenario-roja','Roja','#EF4444']].forEach(([id, esc, col]) => {
    const btn = document.getElementById(id);
    if (!btn) return;
    const activo = state.escenarioActivo === esc;
    btn.style.background = activo ? col : '';
    btn.style.color = activo ? '#fff' : '';
    btn.style.fontWeight = activo ? '800' : '';
  });
}

async function cargarPlanificacionPrevia_() {
  // Alerta Amarilla/Roja siempre es POR COMUNA para cualquier perfil —
  // reutiliza el mismo listado de comunas del selector de "Nuevo Periodo".
  const entidades = comunasSeleccionablesUsuario_().map(c => ({ ambito: 'comuna', id: c.id, nombre: c.comuna }));

  const cont = document.getElementById('planificacion-previa-list');
  if (entidades.length === 0) {
    cont.innerHTML = '<div class="layer-empty-msg">No tienes comunas asignadas.</div>';
    state.planificacionEntidades = [];
    return;
  }

  const { data: planesExistentes } = await supabaseClient
    .from('planes_contingencia')
    .select('*')
    .eq('escenario', state.escenarioActivo)
    .eq('ambito', 'comuna')
    .in('comuna_id', entidades.map(e => e.id));

  // Solo se muestran comunas que YA tienen un plan creado para este
  // escenario — para crear uno nuevo se usa el ícono de alerta ⚠️ en la
  // barra superior; este panel es de revisión/comparativo, no de alta.
  state.planificacionEntidades = entidades
    .map(e => {
      const existente = (planesExistentes || []).find(p => p.comuna_id === e.id);
      return { ...e, plan: existente || null };
    })
    .filter(e => e.plan !== null);

  renderPlanificacionPreviaList_();
}

function renderPlanificacionPreviaList_() {
  const cont = document.getElementById('planificacion-previa-list');
  cont.innerHTML = '';
  const colorEscenario = state.escenarioActivo === 'Verde' ? '#16A34A' : state.escenarioActivo === 'Amarilla' ? '#F59E0B' : '#EF4444';
  const icoEsc = state.escenarioActivo === 'Verde' ? '🟢' : state.escenarioActivo === 'Amarilla' ? '🟡' : '🔴';
  const claseEsc = state.escenarioActivo === 'Verde' ? 'activo-verde' : state.escenarioActivo === 'Amarilla' ? 'activo-amarilla' : 'activo-roja';

  if (state.planificacionEntidades.length === 0) {
    cont.innerHTML = '<div class="layer-empty-msg">Todavía no hay ninguna planificación ' + icoEsc + ' ' + etiquetaEscenario_(state.escenarioActivo) + ' creada. Usa el ícono de alerta ⚠️ en la barra superior, sobre la comuna que quieras planificar.</div>';
    return;
  }

  state.planificacionEntidades.forEach(e => {
    const activo = e.plan ? e.plan.activo : false;
    const card = document.createElement('div');
    card.className = 'plan-contingencia-card' + (activo ? (' ' + claseEsc) : '');
    card.innerHTML =
      '<div class="pcc-top"><div class="pcc-nombre">' + e.nombre + '</div>' +
      '<div class="toggle ' + (activo ? 'on' : '') + '" data-entidad="' + e.id + '"></div></div>' +
      '<button class="btn-resumen-periodo" data-entidad-propuesta="' + e.id + '" style="background:' + colorEscenario + ';">📊 Ver comparativo</button>';
    card.querySelector('.toggle').addEventListener('click', async (ev) => {
      ev.stopPropagation();
      await toggleActivoPlanContingencia_(e);
    });
    card.querySelector('[data-entidad-propuesta]').addEventListener('click', () => abrirPropuestaPlan_(e));
    cont.appendChild(card);
  });
}

async function toggleActivoPlanContingencia_(e) {
  if (!e.plan) {
    const { data: nuevoPlan, error } = await supabaseClient.rpc('obtener_o_crear_plan_contingencia', {
      p_ambito: e.ambito, p_comuna_id: e.ambito === 'comuna' ? e.id : null, p_area: e.ambito === 'area' ? e.id : null, p_escenario: state.escenarioActivo,
    });
    if (error) { mostrarToast_('Error: ' + error.message); return; }
    e.plan = nuevoPlan;
  }
  const nuevoEstado = !e.plan.activo;
  const { data: actualizado, error } = await supabaseClient.rpc('set_plan_contingencia_activo', { p_plan_id: e.plan.id, p_activo: nuevoEstado });
  if (error) { mostrarToast_('Error: ' + error.message); return; }
  e.plan = actualizado;
  renderPlanificacionPreviaList_();
  actualizarOverlayPlanContingencia_();
  cargarCapasAlertaGlobales_();
}

let planContingenciaEditandoId = null;
let planContingenciaEditandoEntidad = null;

let chartPlanComparativoActivo = null;

async function abrirPropuestaPlan_(e) {
  document.getElementById('propuesta-plan-titulo').textContent = 'Comparativo — ' + e.nombre;
  document.getElementById('propuesta-plan-sub').textContent = (state.escenarioActivo === 'Amarilla' ? '🟡 Alerta Amarilla' : '🔴 Alerta Roja') + (e.ambito === 'area' ? ' · comparación "real" no disponible aún para zonas' : '');
  document.getElementById('propuesta-plan-list').innerHTML = '<div class="layer-empty-msg">Cargando…</div>';
  document.getElementById('propuesta-plan-error').classList.remove('show');
  document.getElementById('propuesta-plan-overlay').classList.add('show');

  if (!e.plan) {
    const { data: nuevoPlan, error } = await supabaseClient.rpc('obtener_o_crear_plan_contingencia', {
      p_ambito: e.ambito, p_comuna_id: e.ambito === 'comuna' ? e.id : null, p_area: e.ambito === 'area' ? e.id : null, p_escenario: state.escenarioActivo,
    });
    if (error) { document.getElementById('propuesta-plan-list').innerHTML = '<div class="layer-empty-msg">Error: ' + error.message + '</div>'; return; }
    e.plan = nuevoPlan;
  }
  planContingenciaEditandoId = e.plan.id;
  planContingenciaEditandoEntidad = e;

  const { data: comparativoCompleto } = await supabaseClient.from('planes_contingencia_comparativo').select('*').eq('plan_id', e.plan.id);
  // Solo instituciones con algo que mostrar (propuesta o real > 0) — evita ruido con todas las instituciones en 0.
  const comparativo = (comparativoCompleto || []).filter(c => c.cantidad_propuesta > 0 || c.cantidad_actual > 0);

  const cont = document.getElementById('propuesta-plan-list');
  cont.innerHTML = '';

  const canvas = document.getElementById('chart-plan-comparativo');
  if (chartPlanComparativoActivo) { chartPlanComparativoActivo.destroy(); chartPlanComparativoActivo = null; }

  if (comparativo.length === 0) {
    cont.innerHTML = '<div class="layer-empty-msg">Todavía no hay recursos planificados para este plan. Usa el ícono de alerta en la barra superior para empezar a dibujar en el mapa.</div>';
    canvas.style.display = 'none';
    return;
  }
  canvas.style.display = 'block';

  chartPlanComparativoActivo = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: comparativo.map(c => c.institucion_nombre),
      datasets: e.ambito === 'comuna'
        ? [
            { label: 'Propuesta', data: comparativo.map(c => c.cantidad_propuesta), backgroundColor: '#2563EB' },
            { label: 'Real', data: comparativo.map(c => c.cantidad_actual), backgroundColor: '#94A3B8' },
          ]
        : [
            { label: 'Propuesta', data: comparativo.map(c => c.cantidad_propuesta), backgroundColor: '#2563EB' },
          ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: true, position: 'bottom', labels: { boxWidth: 10, font: { size: 10 } } } },
      scales: { y: { beginAtZero: true, ticks: { precision: 0 } }, x: { ticks: { font: { size: 10 } } } },
    },
  });

  comparativo.forEach(c => {
    const row = document.createElement('div'); row.className = 'propuesta-row';
    const comparativoHtml = e.ambito === 'comuna'
      ? ('<span class="propuesta-comparativo' + (c.cantidad_actual < c.cantidad_propuesta ? ' deficit' : '') + '">propuesto <b>' + c.cantidad_propuesta + '</b> · tenemos <b>' + c.cantidad_actual + '</b></span>')
      : ('<span class="propuesta-comparativo">propuesto <b>' + c.cantidad_propuesta + '</b></span>');
    row.innerHTML =
      '<div class="pr-left"><span class="pr-sw" style="background:' + c.institucion_color + '"></span>' + c.institucion_nombre + '</div>' +
      comparativoHtml;
    cont.appendChild(row);
  });

  const totalPropuesto = comparativo.reduce((acc, c) => acc + Number(c.cantidad_propuesta), 0);
  const totalActual = comparativo.reduce((acc, c) => acc + Number(c.cantidad_actual), 0);
  const filaTotal = document.createElement('div');
  filaTotal.className = 'propuesta-row';
  filaTotal.style.cssText = 'border-top:2px solid var(--border);border-bottom:none;margin-top:4px;padding-top:11px;font-weight:700;';
  filaTotal.innerHTML = e.ambito === 'comuna'
    ? ('<div>Total</div><span class="propuesta-comparativo' + (totalActual < totalPropuesto ? ' deficit' : '') + '" style="font-weight:700;">propuesto <b>' + totalPropuesto + '</b> · tenemos <b>' + totalActual + '</b></span>')
    : ('<div>Total</div><span class="propuesta-comparativo" style="font-weight:700;">propuesto <b>' + totalPropuesto + '</b></span>');
  cont.appendChild(filaTotal);
}

function iniciarModoPlanificacion_(e) {
  if (!puedePlanificarEscenario_(state.escenarioActivo)) { mostrarToast_('Tu perfil no puede planificar el escenario ' + nombreEscenario_(state.escenarioActivo) + '.'); return; }
  const claveEsc = state.escenarioActivo === 'Verde' ? 'verde' : state.escenarioActivo === 'Amarilla' ? 'amarilla' : 'roja';
  // Activar la capa automáticamente si no está encendida
  if (!state.alertaLayersOn[claveEsc]) {
    state.alertaLayersOn[claveEsc] = true;
    const _capasEsc = {
      verde:    [capaAlertaVerdeLayer,    planificacionRecursosVerdeLayer],
      amarilla: [capaAlertaAmarillaLayer, planificacionRecursosAmarillaLayer],
      roja:     [capaAlertaRojaLayer,     planificacionRecursosRojaLayer],
    };
    _capasEsc[claveEsc].forEach(l => l.addTo(map));
  }
  document.getElementById('propuesta-plan-overlay').classList.remove('show');
  document.getElementById('planificacion-previa-overlay').classList.remove('show');

  state.modoPlanificacion = {
    planId: e.plan.id, escenario: state.escenarioActivo, ambito: e.ambito,
    comunaId: e.ambito === 'comuna' ? e.id : state.activeComunaId, nombre: e.nombre,
  };

  if (e.ambito === 'comuna' && e.id !== state.activeComunaId) {
    setActiveComuna(e.id, true);
    const sel = document.getElementById('comuna-select');
    if (sel && sel.style.display !== 'none') sel.value = e.id;
  }

  const color = state.escenarioActivo === 'Verde' ? '#16A34A' : state.escenarioActivo === 'Amarilla' ? '#F59E0B' : '#EF4444';
  const colorTexto = state.escenarioActivo === 'Amarilla' ? '#92400E' : '#fff';
  state.editorMode = true;
  state.dibujoModo = 'punto';
  const _betAdd=document.getElementById('btn-editor-toggle'); if(_betAdd) _betAdd.classList.add('active');
  document.getElementById('editor-banner').classList.add('show');
  document.getElementById('editor-banner').style.background = color;
  document.getElementById('map').classList.add('editing-mode');
  document.getElementById('btn-salir-planificacion').style.display = 'inline-block';
  document.getElementById('btn-salir-edicion').style.display = 'none';
  const icoEsc = state.escenarioActivo === 'Verde' ? '🟢' : state.escenarioActivo === 'Amarilla' ? '🟡' : '🔴';
  document.getElementById('editor-banner-texto').textContent = 'Planificando ' + icoEsc + ' ' + nombreEscenario_(state.escenarioActivo) + ' — ' + e.nombre;
  // Ocultar switcher al entrar en modo planificación
  ocultarSwitcherEscenarios_();
  // Indicador en la barra superior (mismo que modo edición periodo crítico)
  const indEdit = document.getElementById('indicador-edicion');
  if (indEdit) {
    indEdit.style.background = color;
    indEdit.style.color = colorTexto;
    const pulsCol = state.escenarioActivo === 'Verde' ? '#86EFAC' : state.escenarioActivo === 'Amarilla' ? '#FCD34D' : '#FCA5A5';
    const textoInd = state.escenarioActivo === 'Verde' ? '🟢 Planif. Normal · Salir' : state.escenarioActivo === 'Amarilla' ? '🟡 Planif. Amarilla · Salir' : '🔴 Planif. Roja · Salir';
    indEdit.innerHTML = '<span class="edit-pulse" style="background:' + pulsCol + '"></span>' + textoInd;
    indEdit.classList.add('show');
  }
  actualizarBotonesModoDibujo_();
  loadPlanificacionRecursos_(state.activeComunaId);
  setTimeout(() => { try { activarDraggableEdicion_(true); desactivarInteractivaLimite_(true); } catch(e) {} }, 600);
  mostrarToast_('Modo planificación activo. Dibuja en el mapa; sal con "🚪 Salir de planificación" cuando termines.');
  actualizarBotonModoActivo_();
}

function salirModoPlanificacion_() {
  salirCortarRuta_();
  state.modoPlanificacion = null;
  state.editorMode = false;
  cancelarDibujo_();
  try { const _bet2=document.getElementById('btn-editor-toggle'); if(_bet2) _bet2.classList.remove('active'); } catch(e) {}
  document.getElementById('editor-banner').classList.remove('show');
  document.getElementById('editor-banner').style.background = '';
  document.getElementById('map').classList.remove('editing-mode');
  const indEdit = document.getElementById('indicador-edicion');
  if (indEdit) {
    indEdit.classList.remove('show');
    // Restaurar estilo original del indicador (rojo del periodo crítico)
    indEdit.style.background = '';
    indEdit.style.color = '';
    indEdit.innerHTML = '<span class="edit-pulse"></span>✏️ Editando · Salir';
  }
  document.getElementById('btn-salir-planificacion').style.display = 'none';
  document.getElementById('btn-salir-edicion').style.display = '';
  // Restaurar draggable y cursor al salir del modo edición
  try { activarDraggableEdicion_(false); desactivarInteractivaLimite_(false); } catch(e) {}
  cargarCapasAlertaGlobales_();
  if (state.vistaActual === 'mapa') { setTimeout(mostrarSwitcherEscenarios_, 200); actualizarSwitcherEscenarios_(); }
  actualizarBotonModoActivo_();
}

/* ============ COPAMIENTO ESCALONADO ENTRE ESCENARIOS (solo Administrador) ============
 * Copia las entidades del escenario Normal (valor interno 'Verde') a Amarilla y luego de Amarilla a Roja.
 * Toda la lógica vive en la función SQL propagar_copamiento_comuna, que copia
 * la geometría directamente y registra el origen de cada copia para que la
 * operación se pueda repetir sin duplicar nada.
 */
async function propagarCopamientoComuna_() {
  if (!puedePropagar_()) {
    mostrarToast_('🔒 No tienes permiso para propagar el copamiento.');
    return;
  }
  if (!state.activeComunaId) {
    mostrarToast_('⚠️ Selecciona primero una comuna.');
    return;
  }

  const nombre = nombreComuna_(state.activeComunaId);
  const aviso =
    'Copamiento escalonado en ' + nombre + '\n\n' +
    '1) Lo NUEVO de Normal pasa a Alerta Amarilla.\n' +
    '2) Lo NUEVO de Alerta Amarilla (incluido lo recién heredado) pasa a Alerta Roja.\n' +
    '\n' +
    'Si el plan de Alerta Amarilla o Roja aún no existe, se crea.\n' +
    'Lo que ya está en el escenario destino (misma ruta o misma geometría) no se duplica. ¿Continuar?';
  if (!confirm(aviso)) return;

  mostrarToast_('⏫ Propagando copamiento…');

  const { data, error } = await supabaseClient.rpc('propagar_copamiento_comuna', {
    p_comuna_id: String(state.activeComunaId),
  });

  if (error) {
    mostrarToast_('No se pudo propagar: ' + error.message);
    console.error('propagar_copamiento_comuna:', error);
    return;
  }

  const filas = data || [];
  const total = filas.reduce((s, f) => s + (Number(f.copiados) || 0), 0);
  const detalle = textoEscenariosServidor_(filas.map(f => f.paso + ': ' + f.copiados).join('  ·  '));

  if (total > 0) {
    mostrarToast_('✅ ' + total + ' entidad(es) copiada(s).  ' + detalle);
  } else {
    // Sin copias puede significar que ya estaba todo propagado, o que falta
    // crear alguno de los planes. El mensaje del servidor lo aclara.
    const msg = filas.map(f => f.mensaje).filter(Boolean).join('\n');
    mostrarToast_('ℹ️ Nada nuevo que copiar: todo ya estaba en los escenarios destino.');
    if (msg) console.info('Detalle de la propagación:\n' + msg);
  }

  // Refrescar lo que está dibujado en el mapa.
  try {
    if (typeof cargarCapasAlertaGlobales_ === 'function') await cargarCapasAlertaGlobales_();
    if (typeof loadPlanificacionRecursos_ === 'function') await loadPlanificacionRecursos_(state.activeComunaId);
  } catch (e) {
    console.error('No se pudieron refrescar las capas tras propagar:', e);
  }
}

/* ============ MODO RECURSOS DEL ÁREA (dibujar ubicaciones en el mapa) — solo Administrador ============ */

/** Abre el selector de zona cuando el usuario tiene más de un área disponible. */
function abrirSelectorZonaRecursos_(zonas) {
  const panel = document.getElementById('zonas-recursos-panel');
  const lista = document.getElementById('zonas-recursos-lista');
  if (!panel || !lista) { iniciarModoRecursosArea_(zonas[0]); return; }

  lista.innerHTML = '';
  zonas.forEach(z => {
    const b = document.createElement('button');
    b.className = 'planificar-item';
    b.innerHTML = '<span class="plan-icon" style="background:#E2E8F0;">📍</span>' +
      '<div><div class="plan-label">' + escapeHtml_(z) + '</div>' +
      '<div class="plan-sub">Editar los recursos de esta zona</div></div>';
    b.addEventListener('click', (ev) => {
      ev.stopPropagation();
      panel.classList.remove('show');
      iniciarModoRecursosArea_(z);
    });
    lista.appendChild(b);
  });

  panel.classList.add('show');
}

function iniciarModoRecursosArea_(area) {
  // Blindaje de permisos: aunque el botón esté oculto para otros perfiles,
  // la función se protege por si se invocara desde otro punto del código.
  if (!state.perfil || !esAdminOJefe_()) {
    mostrarToast_('🔒 Solo el Administrador o el Jefe de Área pueden editar los recursos del área.');
    return;
  }
  if (!area) { mostrarToast_('⚠️ No se indicó la zona a editar.'); return; }

  const _rarp = document.getElementById('recursos-area-rapido-panel'); if(_rarp) _rarp.classList.remove('show');
  state.modoRecursosArea = { area };
  state.editorMode = true;
  state.dibujoModo = 'punto';
  const color = '#0F172A';
  const _betAdd=document.getElementById('btn-editor-toggle'); if(_betAdd) _betAdd.classList.add('active');
  document.getElementById('editor-banner').classList.add('show');
  document.getElementById('editor-banner').style.background = color;
  document.getElementById('map').classList.add('editing-mode');
  document.getElementById('btn-salir-planificacion').style.display = 'inline-block';
  document.getElementById('editor-banner-texto').textContent = '⚠️ Modo edición activo — ' + area + ' · haz clic para agregar recursos o arrastra los existentes para reubicarlos';
  const indEdit = document.getElementById('indicador-edicion');
  if (indEdit) indEdit.classList.add('show');
  actualizarBotonesModoDibujo_();
  loadRecursosDisponiblesAreaLayer_();
  actualizarBotonModoActivo_();
  mostrarToast_('📍 Modo edición de recursos activo en ' + area + '. Clic en el mapa para agregar; arrastra para reubicar.');
}

function salirModoRecursosArea_() {
  state.modoRecursosArea = null;
  state.editorMode = false;
  cancelarDibujo_();
  const _betRem=document.getElementById('btn-editor-toggle'); if(_betRem) _betRem.classList.remove('active');
  document.getElementById('editor-banner').classList.remove('show');
  document.getElementById('editor-banner').style.background = '';
  document.getElementById('map').classList.remove('editing-mode');
  document.getElementById('btn-salir-planificacion').style.display = 'none';
  const indEdit = document.getElementById('indicador-edicion');
  if (indEdit) indEdit.classList.remove('show');
  loadRecursosDisponiblesAreaLayer_();
  actualizarBotonModoActivo_();
}

let recursoAreaGeomPendiente = null;

async function abrirModalRecursoAreaDesdeDibujo_() {
  document.getElementById('recurso-area-modal-title').textContent = 'Ubicar recurso — ' + state.modoRecursosArea.area;
  document.getElementById('ra-ubicacion-texto').style.display = 'none';
  document.getElementById('btn-ubicar-recurso-area').style.display = 'none';
  document.getElementById('ra-fecha-inicio').value = '';
  document.getElementById('recurso-area-modal-error').classList.remove('show');
  editingRecursoAreaId = null;
  recursoAreaGeomPendiente = state.pendingLineaPuntos ? { tipo: 'linea', puntos: state.pendingLineaPuntos }
    : state.pendingAreaPuntos ? { tipo: 'area', puntos: state.pendingAreaPuntos }
    : { tipo: 'punto', lat: state.pendingLatLng.lat, lng: state.pendingLatLng.lng };

  const { data: catalogo } = await supabaseClient.from('recursos_maestro').select('*, instituciones(nombre)').eq('activo', true).order('created_at', { ascending: false });
  const select = document.getElementById('ra-recurso-maestro');
  select.innerHTML = '';
  (catalogo || []).forEach(rm => {
    const inst = rm.instituciones ? rm.instituciones.nombre : '—';
    const opt = document.createElement('option');
    opt.value = rm.id;
    opt.textContent = (rm.nombre_recurso || 'Sin nombre') + ' — ' + inst + ' · ' + rm.tipo_recurso + ' — ' + rm.cantidad_personas + ' pers.';
    select.appendChild(opt);
  });

  document.getElementById('recurso-area-modal-overlay').classList.add('show');
}

async function guardarRecursoAreaDesdeDibujo_() {
  const btn = document.getElementById('btn-save-recurso-area');
  const errEl = document.getElementById('recurso-area-modal-error');
  errEl.classList.remove('show');

  if (!recursoAreaGeomPendiente) {
    errEl.textContent = 'No hay una ubicación pendiente. Cierra este formulario y vuelve a intentarlo.';
    errEl.classList.add('show');
    return;
  }

  const recursoMaestroId = document.getElementById('ra-recurso-maestro').value;
  const fechaInicio = document.getElementById('ra-fecha-inicio').value || null;
  const area = state.modoRecursosArea.area;

  if (!recursoMaestroId) { errEl.textContent = 'Elige un recurso del catálogo.'; errEl.classList.add('show'); return; }

  btn.textContent = 'Guardando…'; btn.disabled = true;

  let error;
  if (recursoAreaGeomPendiente.tipo === 'linea') {
    ({ error } = await supabaseClient.rpc('crear_recurso_area_linea', {
      p_area: area, p_recurso_maestro_id: recursoMaestroId, p_fecha_inicio_operacion: fechaInicio,
      p_puntos: recursoAreaGeomPendiente.puntos.map(p => [p.lng, p.lat]),
    }));
  } else if (recursoAreaGeomPendiente.tipo === 'area') {
    ({ error } = await supabaseClient.rpc('crear_recurso_area_area', {
      p_area: area, p_recurso_maestro_id: recursoMaestroId, p_fecha_inicio_operacion: fechaInicio,
      p_puntos: recursoAreaGeomPendiente.puntos.map(p => [p.lng, p.lat]),
    }));
  } else {
    ({ error } = await supabaseClient.rpc('crear_recurso_area_punto', {
      p_area: area, p_recurso_maestro_id: recursoMaestroId, p_fecha_inicio_operacion: fechaInicio,
      p_lat: recursoAreaGeomPendiente.lat, p_lng: recursoAreaGeomPendiente.lng,
    }));
  }

  btn.textContent = 'Guardar'; btn.disabled = false;

  if (error) { errEl.textContent = 'No se pudo guardar: ' + error.message; errEl.classList.add('show'); return; }

  document.getElementById('recurso-area-modal-overlay').classList.remove('show');
  mostrarToast_('Recurso ubicado en ' + area + '.');
  recursoAreaGeomPendiente = null;
  state.pendingLatLng = null; state.pendingLineaPuntos = null; state.pendingAreaPuntos = null;
  cancelarDibujo_();
  loadRecursosDisponiblesAreaLayer_();
}

/* Acceso rápido: 2 clics para empezar a planificar (topbar) — sin pasar
 * por el panel de Planificación Previa completo. Usa la comuna que ya
 * está activa en el mapa (GRD/Admin) o la primera zona del usuario
 * (Jefe de Área). */


// Toggle etiquetas en capas de alerta (activar/desactivar desde panel de capas)
if (!state.mostrarEtiquetasAlerta) state.mostrarEtiquetasAlerta = { verde: false, amarilla: false, roja: false };

/* ============ OPACIDAD POR CAPA DE ALERTA (0 a 100 %) ============
 * Valor en porcentaje. 22 es el que traía el sistema por defecto.
 * Se aplica tanto a las zonas comunales como a los recursos planificados
 * de ese escenario, y sobrevive a las recargas de capa porque
 * cargarCapasAlertaGlobales_ lee este mismo estado al construir el estilo.
 */
if (!state.opacidadAlerta) state.opacidadAlerta = { verde: 50, amarilla: 50, roja: 50 };

/** Opacidad de relleno (0 a 1) configurada para un escenario. */
function opacidadRellenoAlerta_(clave) {
  const pct = (state.opacidadAlerta && state.opacidadAlerta[clave] != null) ? state.opacidadAlerta[clave] : 50;
  return Math.max(0, Math.min(100, pct)) / 100;
}

/** Opacidad del borde. Se mantiene más alta que el relleno para que la
 *  silueta siga siendo legible en proyector incluso con relleno bajo. */
function opacidadBordeAlerta_(clave) {
  const relleno = opacidadRellenoAlerta_(clave);
  if (relleno === 0) return 0;
  return Math.max(0.35, Math.min(1, relleno * 2.2));
}

/** Aplica la opacidad a todas las figuras ya dibujadas de un escenario. */
function aplicarOpacidadAlerta_(clave) {
  const relleno = opacidadRellenoAlerta_(clave);
  const borde = opacidadBordeAlerta_(clave);

  const grupos = [
    clave === 'verde' ? capaAlertaVerdeLayer : clave === 'amarilla' ? capaAlertaAmarillaLayer : capaAlertaRojaLayer,
    clave === 'verde' ? planificacionRecursosVerdeLayer : clave === 'amarilla' ? planificacionRecursosAmarillaLayer : planificacionRecursosRojaLayer,
  ];

  const aplicar = (capa) => {
    try {
      if (!capa) return;
      if (typeof capa.setStyle === 'function') {
        capa.setStyle({ fillOpacity: relleno, opacity: borde });
        if (typeof capa.eachLayer === 'function') capa.eachLayer(aplicar);
      } else if (typeof capa.eachLayer === 'function') {
        capa.eachLayer(aplicar);
      } else if (typeof capa.setOpacity === 'function') {
        // Marcadores (recursos puntuales): solo tienen opacidad global.
        capa.setOpacity(borde);
      }
    } catch (e) { /* una figura problemática no debe cortar el resto */ }
  };

  grupos.forEach(g => { if (g && typeof g.eachLayer === 'function') g.eachLayer(aplicar); });
}

/** Cambia la opacidad de un escenario y la aplica de inmediato. */
function setOpacidadAlerta_(clave, pct) {
  const valor = Math.max(0, Math.min(100, Math.round(Number(pct) || 0)));
  if (!state.opacidadAlerta) state.opacidadAlerta = { verde: 50, amarilla: 50, roja: 50 };
  state.opacidadAlerta[clave] = valor;
  aplicarOpacidadAlerta_(clave);
  const et = document.getElementById('opac-val-' + clave);
  if (et) et.textContent = valor + '%';
}

function toggleEtiquetasAlerta_(clave) {
  if (!state.mostrarEtiquetasAlerta) state.mostrarEtiquetasAlerta = { verde: false, amarilla: false, roja: false };
  state.mostrarEtiquetasAlerta[clave] = !state.mostrarEtiquetasAlerta[clave];
  const activo = state.mostrarEtiquetasAlerta[clave];

  const arr = clave === 'verde' ? alertaVerdeFeatureLayers
            : clave === 'amarilla' ? alertaAmarillaFeatureLayers
            : alertaRojaFeatureLayers;

  // Mismo patrón exacto que toggleEtiquetasRecursosArea_ (que funciona bien)
  arr.forEach(({ layer, texto }) => {
    if (activo && texto) {
      layer.bindTooltip(texto, { permanent: true, direction: 'center', className: 'map-label' });
    } else {
      layer.unbindTooltip();
    }
  });

  const btn = document.getElementById('btn-etiq-' + clave);
  if (btn) btn.classList.toggle('active', activo);
  renderTab(state.activeTab || 'capas');
}// ══ Simbología adecuada al escenario de alerta ══════════════════════════════
function mostrarSimbologiaEscenario_(escenario) {
  const panel = document.getElementById('simbologia-flotante');
  const body  = document.getElementById('sf-body');
  if (!panel || !body) return;
  if (state.modoMapa === 'emergencia') return;   // en Emergencia manda la simbología del periodo

  const titulo = document.querySelector('#simbologia-flotante .sf-title');
  if (titulo) titulo.textContent = 'Simbología';

  renderSimbologiaInstituciones_();
  panel.style.display = '';
}

/* Contenido del panel flotante: el mismo copamiento por institución del
 * panel de Capas, con idéntica lógica de encendido y apagado en los tres
 * niveles de alerta. Se mantiene sincronizado con el otro control porque
 * ambos leen y escriben state.institucionesAlertaOcultas.
 */
function renderSimbologiaInstituciones_() {
  const body = document.getElementById('sf-body');
  if (!body) return;
  if (state.modoMapa === 'emergencia') return;   // simbología de escenarios: solo en el Planificador de Alertas

  const instituciones = resumenInstitucionesAlerta_();

  const tipos = [
    { k: 'punto', icono: '📍', etiqueta: 'Puntos' },
    { k: 'linea', icono: '📏', etiqueta: 'Líneas' },
    { k: 'area',  icono: '📐', etiqueta: 'Polígonos' },
  ];

  // Barra de tipos de figura: visible siempre, aunque no haya instituciones.
  let html =
    '<div style="display:flex;gap:5px;padding:4px 2px 8px;border-bottom:1px solid var(--border);margin-bottom:6px;">' +
    tipos.map(t => {
      const activo = !tipoGeomOculto_(t.k);
      return '<button data-sf-geom="' + t.k + '" title="Mostrar u ocultar ' + t.etiqueta.toLowerCase() + '" ' +
        'style="flex:1;font-size:10px;padding:5px 3px;border-radius:6px;cursor:pointer;white-space:nowrap;' +
        'border:1px solid ' + (activo ? '#2563EB' : 'var(--border)') + ';' +
        'background:' + (activo ? 'rgba(37,99,235,0.10)' : 'transparent') + ';' +
        'color:inherit;opacity:' + (activo ? '1' : '.45') + ';">' +
        t.icono + ' ' + t.etiqueta + '</button>';
    }).join('') +
    '</div>';

  if (instituciones.length === 0) {
    html += '<div style="padding:8px 4px;font-size:11px;opacity:.7;">' +
      'Sin entidades planificadas en las capas de alerta encendidas.</div>';
    body.innerHTML = html;
    enlazarBotonesGeomSimbologia_(body);
    return;
  }

  const colorDe = (nombre) => {
    const i = (state.instituciones || []).find(x => x.nombre === nombre);
    return (i && i.color_hex) ? i.color_hex : '#64748B';
  };

  html +=
    '<div style="display:flex;gap:6px;padding:0 2px 8px;">' +
      '<button data-sf-inst-todas="1" style="flex:1;font-size:10px;padding:4px 6px;border-radius:6px;border:1px solid var(--border);background:transparent;color:inherit;cursor:pointer;">Ver todas</button>' +
      '<button data-sf-inst-ninguna="1" style="flex:1;font-size:10px;padding:4px 6px;border-radius:6px;border:1px solid var(--border);background:transparent;color:inherit;cursor:pointer;">Ocultar todas</button>' +
    '</div>';

  html += instituciones.map(ins => {
    const visible = !institucionAlertaOculta_(ins.id);
    const conJerarquia = institucionConJerarquia_(ins.nombre);
    const abierta = !state.colapsoJerarquiaInst[ins.id];

    let fila = '<div class="sf-row" data-sf-inst="' + escapeHtml_(String(ins.id)) + '" ' +
      'style="display:flex;align-items:center;gap:6px;padding:4px 2px;cursor:pointer;' +
      (visible ? '' : 'opacity:.42;') + '">' +
      (conJerarquia
        ? '<span data-sf-caret="' + escapeHtml_(String(ins.id)) + '" style="width:11px;flex-shrink:0;font-size:9px;opacity:.6;' +
          'transform:rotate(' + (abierta ? '0' : '-90') + 'deg);transition:transform .12s;">▼</span>'
        : '<span style="width:11px;flex-shrink:0;"></span>') +
      '<span style="width:13px;height:13px;border-radius:4px;flex-shrink:0;border:2px solid ' + colorDe(ins.nombre) + ';' +
        'background:' + (visible ? colorDe(ins.nombre) : 'transparent') + ';"></span>' +
      '<span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11px;font-weight:600;">' +
        escapeHtml_(aTitulo_(ins.nombre)) + '</span>' +
      '<span title="Normal · Amarilla · Roja" style="font-size:10px;font-variant-numeric:tabular-nums;flex-shrink:0;">' +
        '<span style="color:#16A34A;">' + ins.verde + '</span>' +
        '<span style="opacity:.4;">·</span>' +
        '<span style="color:#F59E0B;">' + ins.amarilla + '</span>' +
        '<span style="opacity:.4;">·</span>' +
        '<span style="color:#EF4444;">' + ins.roja + '</span>' +
      '</span>' +
    '</div>';

    if (conJerarquia && abierta) fila += subarbolInstitucion_(ins);
    return fila;
  }).join('');

  body.innerHTML = html;
  enlazarBotonesGeomSimbologia_(body);
  setTimeout(alinearResumenConSimbologia_, 0);

  body.querySelectorAll('[data-sf-inst]').forEach(fila => {
    fila.addEventListener('click', (ev) => {
      // El clic en la flecha solo pliega o despliega, no apaga la capa.
      if (ev.target && ev.target.dataset && ev.target.dataset.sfCaret) {
        ev.stopPropagation();
        const idc = ev.target.dataset.sfCaret;
        state.colapsoJerarquiaInst[idc] = !state.colapsoJerarquiaInst[idc];
        renderSimbologiaInstituciones_();
        return;
      }
      const id = fila.dataset.sfInst;
      setInstitucionAlertaOculta_(id, !institucionAlertaOculta_(id));
      aplicarVisibilidadInstitucionesAlerta_();
      renderSimbologiaInstituciones_();
      renderTab(state.activeTab || 'capas');
    });
  });

  body.querySelectorAll('[data-sf-pert]').forEach(el => {
    el.addEventListener('click', (ev) => {
      ev.stopPropagation();
      // La flecha solo pliega; el resto de la fila enciende o apaga.
      if (ev.target && ev.target.dataset && ev.target.dataset.sfPertCaret) {
        const k = ev.target.dataset.sfPertCaret;
        state.colapsoPertenencia[k] = !state.colapsoPertenencia[k];
        renderSimbologiaInstituciones_();
        return;
      }
      const pert = el.dataset.sfPert;
      setPertenenciaAlertaOculta_(pert, !pertenenciaAlertaOculta_(pert));
      aplicarVisibilidadInstitucionesAlerta_();
      renderSimbologiaInstituciones_();
    });
  });

  body.querySelectorAll('[data-sf-tipo]').forEach(el => {
    el.addEventListener('click', (ev) => {
      ev.stopPropagation();
      const tipo = el.dataset.sfTipo;
      setTipoRecursoAlertaOculto_(tipo, !tipoRecursoAlertaOculto_(tipo));
      aplicarVisibilidadInstitucionesAlerta_();
      renderSimbologiaInstituciones_();
    });
  });

  const btnTodas = body.querySelector('[data-sf-inst-todas]');
  if (btnTodas) btnTodas.addEventListener('click', () => {
    setTodasInstitucionesAlerta_(false);
    renderSimbologiaInstituciones_();
    renderTab(state.activeTab || 'capas');
  });

  const btnNinguna = body.querySelector('[data-sf-inst-ninguna]');
  if (btnNinguna) btnNinguna.addEventListener('click', () => {
    setTodasInstitucionesAlerta_(true);
    renderSimbologiaInstituciones_();
    renderTab(state.activeTab || 'capas');
  });
}

/** Subárbol de una institución: pertenencia -> tipo de recurso. */
function subarbolInstitucion_(ins) {
  const arbol = desgloseInstitucionAlerta_(ins.id);
  const pertenencias = Object.keys(arbol).sort((a, b) => {
    const orden = ['Relacionamiento', 'Protección', 'Sin clasificar'];
    return orden.indexOf(a) - orden.indexOf(b);
  });
  if (pertenencias.length === 0) return '';

  const instApagada = institucionAlertaOculta_(ins.id);

  return pertenencias.map(pert => {
    const tipos = Object.keys(arbol[pert]).sort(compararTipoRecurso_);   // orden de tipos del sistema
    const total = tipos.reduce((acc, t) => ({
      Verde: acc.Verde + arbol[pert][t].Verde,
      Amarilla: acc.Amarilla + arbol[pert][t].Amarilla,
      Roja: acc.Roja + arbol[pert][t].Roja,
    }), { Verde: 0, Amarilla: 0, Roja: 0 });
    const pertVisible = !instApagada && !pertenenciaAlertaOculta_(pert);

    const clavePert = ins.id + '||' + pert;
    if (state.colapsoPertenencia[clavePert] === undefined) state.colapsoPertenencia[clavePert] = true;
    const pertAbierta = !state.colapsoPertenencia[clavePert];

    let bloque =
      '<div data-sf-pert="' + escapeHtml_(pert) + '" ' +
        'style="display:flex;align-items:center;gap:5px;padding:3px 2px 3px 18px;cursor:pointer;' +
        (pertVisible ? '' : 'opacity:.4;') + '">' +
        '<span data-sf-pert-caret="' + escapeHtml_(clavePert) + '" ' +
          'style="width:10px;flex-shrink:0;font-size:8px;opacity:.55;text-align:center;' +
          'transform:rotate(' + (pertAbierta ? '0' : '-90') + 'deg);transition:transform .12s;">▼</span>' +
        '<span style="width:9px;height:9px;border-radius:3px;flex-shrink:0;border:1.5px solid #64748B;' +
          'background:' + (pertVisible ? '#64748B' : 'transparent') + ';"></span>' +
        '<span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:10.5px;">' +
          escapeHtml_(PERTENENCIA_CORTA[pert] || pert) + '</span>' +
        '<span style="font-size:9px;opacity:.45;flex-shrink:0;">' + tipos.length + '</span>' +
        cifrasPorEscenario_(total, 10) +
      '</div>';

    if (!pertAbierta) return bloque;

    bloque += tipos.map(tipo => {
      const tipoVisible = pertVisible && !tipoRecursoAlertaOculto_(tipo);
      return '<div data-sf-tipo="' + escapeHtml_(tipo) + '" ' +
        'style="display:flex;align-items:center;gap:6px;padding:2px 2px 2px 40px;cursor:pointer;' +
        (tipoVisible ? '' : 'opacity:.4;') + '">' +
        '<span style="width:8px;height:8px;border-radius:50%;flex-shrink:0;border:1.5px solid #94A3B8;' +
          'background:' + (tipoVisible ? '#94A3B8' : 'transparent') + ';"></span>' +
        '<span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:10px;">' +
          escapeHtml_(aTitulo_(tipo)) + '</span>' +
        cifrasPorEscenario_(arbol[pert][tipo], 9.5) +
      '</div>';
    }).join('');

    return bloque;
  }).join('');
}

/** Conecta los tres botones de tipo de figura del panel de simbología. */
function enlazarBotonesGeomSimbologia_(body) {
  body.querySelectorAll('[data-sf-geom]').forEach(btn => {
    btn.addEventListener('click', () => {
      const t = btn.dataset.sfGeom;
      setTipoGeomOculto_(t, !tipoGeomOculto_(t));
      aplicarVisibilidadInstitucionesAlerta_();
      renderSimbologiaInstituciones_();
    });
  });
}

// ══ Toggle etiquetas de periodo crítico ═════════════════════════════════════
if (!state.mostrarEtiquetasPeriodo) state.mostrarEtiquetasPeriodo = {};

function toggleEtiquetasPeriodo_(periodoId, btn) {
  if (!state.mostrarEtiquetasPeriodo) state.mostrarEtiquetasPeriodo = {};
  const activo = !state.mostrarEtiquetasPeriodo[periodoId];
  state.mostrarEtiquetasPeriodo[periodoId] = activo;
  if (btn) btn.classList.toggle('active', activo);
  aplicarClaseEtiqPeriodo_(periodoId, activo);
}

/* aplicarClaseEtiqPeriodo_: definida abajo */

function aplicarClaseEtiqPeriodo_(periodoId, activo) {
  const arr = periodoFeatureLayers[periodoId] || [];
  arr.forEach(({ layer, nombre }) => {
    if (activo) {
      const esFigura = layer instanceof L.Polygon || layer instanceof L.Polyline;
      layer.bindTooltip(nombre, {
        permanent: true,
        direction: esFigura ? 'center' : 'top',
        offset: esFigura ? [0, 0] : [0, -12],
        className: 'map-label label-recurso'
      });
    } else {
      layer.unbindTooltip();
    }
  });
}

// ════════════════════════════════════════════════════════
// APP MÓVIL — posiciones en tiempo real en el mapa principal
// ════════════════════════════════════════════════════════
state.appGpsActivo = false;
let appGpsLayer_ = L.layerGroup();
let appGpsTimer_ = null;

async function cargarPosicionesApp_() {
  if (!map) return;
  appGpsLayer_.addTo(map);
  actualizarPosicionesApp_();
  // Refrescar cada 30 segundos
  appGpsTimer_ = setInterval(actualizarPosicionesApp_, 30000);
}

function limpiarPosicionesApp_() {
  appGpsLayer_.clearLayers();
  map.removeLayer(appGpsLayer_);
  if (appGpsTimer_) { clearInterval(appGpsTimer_); appGpsTimer_ = null; }
  const cnt = document.getElementById('app-gps-count');
  if (cnt) cnt.textContent = 'Desactivado';
}

async function actualizarPosicionesApp_() {
  try {
    const { data } = await supabaseClient
      .from('v_app_posicion_actual')
      .select('*')
      .eq('comuna_id', state.activeComunaId);

    appGpsLayer_.clearLayers();
    if (!data || !data.length) {
      const cnt = document.getElementById('app-gps-count');
      if (cnt) cnt.textContent = 'Sin patrulleros activos';
      return;
    }

    data.forEach(p => {
      // Ícono de patrullero con app
      const ico = L.divIcon({
        className: '',
        html: `<div style="position:relative;">
          <div style="width:20px;height:20px;background:#2563EB;border:3px solid #fff;border-radius:50%;
            box-shadow:0 0 0 4px rgba(37,99,235,0.3);"></div>
          <div style="position:absolute;top:-22px;left:50%;transform:translateX(-50%);
            background:#1E293B;color:#fff;padding:2px 6px;border-radius:6px;
            font-size:9px;font-weight:700;white-space:nowrap;">📱 ${p.usuario_nombre||'App'}</div>
        </div>`,
        iconSize: [20,20], iconAnchor: [10,10]
      });
      const min = Math.round((Date.now() - new Date(p.registrado_en).getTime()) / 60000);
      L.marker([p.lat, p.lng], { icon: ico })
        .addTo(appGpsLayer_)
        .bindPopup(
          `<b>📱 ${p.usuario_nombre || 'Patrullero'}</b><br>` +
          `${p.institucion || ''}<br>` +
          `${p.velocidad ? p.velocidad + ' km/h' : 'Detenido'}<br>` +
          `<small>Hace ${min} min · ${p.en_patrullaje ? '🟢 En patrullaje' : '⏸️ Pausado'}</small>`
        );
    });

    const cnt = document.getElementById('app-gps-count');
    if (cnt) cnt.textContent = data.length + ' patrullero(s) activo(s)';

  } catch(e) { console.warn('app gps:', e); }
}

// ════════════════════════════════════════════════════════════════
// SWITCHER DE ESCENARIOS (botones flotantes Verde/Amarillo/Rojo)
// ════════════════════════════════════════════════════════════════
function mostrarSwitcherEscenarios_() {
  const sw = document.getElementById('escenario-switcher');
  // Sin permiso para ver la capa de escenarios (SQL 83): tampoco el selector rápido.
  if (sw) sw.classList.toggle('show', !capaOcultaUsuario_('alertas'));
}
function ocultarSwitcherEscenarios_() {
  const sw = document.getElementById('escenario-switcher');
  if (sw) sw.classList.remove('show');
}
function actualizarSwitcherEscenarios_() {
  const verde   = state.alertaLayersOn.verde;
  const amarilla = state.alertaLayersOn.amarilla;
  const roja    = state.alertaLayersOn.roja;
  document.getElementById('esc-btn-verde').classList.toggle('active', !!verde);
  document.getElementById('esc-btn-amarilla').classList.toggle('active', !!amarilla);
  document.getElementById('esc-btn-roja').classList.toggle('active', !!roja);
}

async function activarEscenarioDesdeBoton_(escenario) {
  // Si el escenario ya está activo → desactivar (toggle)
  const claves = { Verde:'verde', Amarilla:'amarilla', Roja:'roja' };
  const clave = claves[escenario];
  const estaActivo = state.alertaLayersOn[clave];

  // Apagar todos primero
  ['verde','amarilla','roja'].forEach(k => {
    if (state.alertaLayersOn[k]) {
      const capas = { verde: [capaAlertaVerdeLayer, planificacionRecursosVerdeLayer],
                      amarilla: [capaAlertaAmarillaLayer, planificacionRecursosAmarillaLayer],
                      roja: [capaAlertaRojaLayer, planificacionRecursosRojaLayer] };
      capas[k].forEach(l => map.removeLayer(l));
      state.alertaLayersOn[k] = false;
    }
  });

  if (!estaActivo) {
    // Activar el escenario elegido
    state.alertaLayersOn[clave] = true;
    const capasActivas = { verde: [capaAlertaVerdeLayer, planificacionRecursosVerdeLayer],
                            amarilla: [capaAlertaAmarillaLayer, planificacionRecursosAmarillaLayer],
                            roja: [capaAlertaRojaLayer, planificacionRecursosRojaLayer] };
    capasActivas[clave].forEach(l => l.addTo(map));
    // Cargar datos si no están
    await cargarCapasAlertaGlobales_();
    // Conservar el filtro por institución al cambiar de nivel de alerta.
    reaplicarFiltrosAlerta_();
    // Actualizar simbología
    mostrarSimbologiaEscenario_(escenario);
    mostrarToast_('🗺️ Escenario ' + etiquetaEscenario_(escenario) + ' activo');
  } else {
    // Se apagó — ocultar simbología y, con ella, la estadística
    const panel = document.getElementById('simbologia-flotante');
    if (panel) panel.style.display = 'none';
    if (typeof renderResumenAlertas_ === 'function') renderResumenAlertas_();
  }

  actualizarSwitcherEscenarios_();
  // Refrescar panel de capas
  renderTab(state.activeTab || 'capas');
}
function mostrarLandingPeriodoCritico_(nombre) {
  document.getElementById('landing-ico').textContent    = '🗓️';
  document.getElementById('landing-titulo').textContent = 'Creando Periodo Crítico';
  document.getElementById('landing-sub').textContent    = '"' + nombre + '"';
  const pasos = [
    { id:'lstep-1', ico:'⏳', texto:'Registrando periodo en la base de datos', estado:'loading' },
    { id:'lstep-2', ico:'…',  texto:'Cargando capas y recursos del periodo',   estado:'pending' },
    { id:'lstep-3', ico:'…',  texto:'Activando modo de edición',               estado:'pending' },
  ];
  pasos.forEach(p => {
    const el = document.getElementById(p.id); if (!el) return;
    el.className = 'landing-step ' + p.estado;
    el.querySelector('.landing-step-ico').textContent = p.ico;
    el.querySelector('span:last-child') && (el.querySelector('span:last-child').textContent = p.texto);
  });
  document.getElementById('landing-barra-fill').style.width = '15%';
  document.getElementById('landing-planificacion').classList.add('show');
}

function landingAvanzarPaso_(paso, subtexto) {
  // Marcar el paso anterior como done y el actual como loading
  const ids = ['lstep-1','lstep-2','lstep-3'];
  ids.forEach((id, i) => {
    const el = document.getElementById(id); if (!el) return;
    if (i < paso - 1) { el.className='landing-step done'; el.querySelector('.landing-step-ico').textContent='✓'; }
    else if (i === paso - 1) { el.className='landing-step loading'; el.querySelector('.landing-step-ico').textContent='⏳'; }
    else { el.className='landing-step pending'; el.querySelector('.landing-step-ico').textContent='…'; }
  });
  const pct = paso === 1 ? 15 : paso === 2 ? 55 : 85;
  document.getElementById('landing-barra-fill').style.width = pct + '%';
  if (subtexto) document.getElementById('landing-sub').textContent = subtexto;
}
function mostrarLandingPlanificacion_(escenario) {
  const ico = escenario === 'Verde' ? '🟢' : escenario === 'Amarilla' ? '🟡' : '🔴';
  document.getElementById('landing-ico').textContent    = ico;
  document.getElementById('landing-titulo').textContent = 'Preparando ' + nombreEscenario_(escenario);
  document.getElementById('landing-sub').textContent    = 'Activando la capa y cargando datos del escenario…';
  ['lstep-1','lstep-2','lstep-3'].forEach((id,i) => {
    const el = document.getElementById(id);
    el.className = 'landing-step ' + (i===0?'done':i===1?'loading':'pending');
    el.querySelector('.landing-step-ico').textContent = i===0?'✓':i===1?'⏳':'…';
  });
  document.getElementById('landing-barra-fill').style.width = '15%';
  document.getElementById('landing-planificacion').classList.add('show');
  // Animar la barra
  setTimeout(() => { document.getElementById('landing-barra-fill').style.width='55%'; document.getElementById('lstep-2').className='landing-step done'; document.getElementById('lstep-2').querySelector('.landing-step-ico').textContent='✓'; document.getElementById('lstep-3').className='landing-step loading'; document.getElementById('lstep-3').querySelector('.landing-step-ico').textContent='⏳'; }, 700);
  setTimeout(() => { document.getElementById('landing-barra-fill').style.width='90%'; }, 1200);
}

function ocultarLandingPlanificacion_() {
  document.getElementById('landing-barra-fill').style.width = '100%';
  ['lstep-1','lstep-2','lstep-3'].forEach(id => { const el=document.getElementById(id); el.className='landing-step done'; el.querySelector('.landing-step-ico').textContent='✓'; });
  setTimeout(() => document.getElementById('landing-planificacion').classList.remove('show'), 350);
}
async function iniciarPlanificacionRapida_(escenario) {
  document.getElementById('alerta-rapida-panel').classList.remove('show');
  document.getElementById('planificar-panel').classList.remove('show');

  if (!state.activeComunaId) { mostrarToast_('Selecciona primero una comuna en el mapa.'); return; }
  if (!puedePlanificarEscenario_(escenario)) { mostrarToast_('Tu perfil no puede planificar el escenario ' + nombreEscenario_(escenario) + '.'); return; }

  // ── LANDING ──────────────────────────────────────────────────────────────
  mostrarLandingPlanificacion_(escenario);

  // 1a. Apagar Periodo Crítico
  Object.keys(state.periodoLayersOn).forEach(k => {
    if (state.periodoLayersOn[k] && periodoLayers[k]) {
      map.removeLayer(periodoLayers[k]); state.periodoLayersOn[k] = false;
    }
  });
  if (state.editorMode) { state.editorMode = false; cancelarDibujo_(); }

  // 1b. Apagar todas las alertas y activar solo la elegida
  const mapaCapas = {
    verde:    [capaAlertaVerdeLayer,    planificacionRecursosVerdeLayer],
    amarilla: [capaAlertaAmarillaLayer, planificacionRecursosAmarillaLayer],
    roja:     [capaAlertaRojaLayer,     planificacionRecursosRojaLayer],
  };
  const claveActiva = escenario === 'Verde' ? 'verde' : escenario === 'Amarilla' ? 'amarilla' : 'roja';
  Object.keys(mapaCapas).forEach(k => {
    state.alertaLayersOn[k] = false;
    mapaCapas[k].forEach(l => map.removeLayer(l));
  });
  state.alertaLayersOn[claveActiva] = true;
  mapaCapas[claveActiva].forEach(l => l.addTo(map));

  // 1c. Cambiar a la pestaña correcta en el panel lateral
  const railBtn = document.querySelector('.rail-btn[data-tab="planificacion-previa"]');
  if (railBtn) { railBtn.click(); } else { renderTab('capas'); }

  const ambito = 'comuna';
  const id = state.activeComunaId;
  const cfg = state.comunas.find(c => c.id === id);
  const nombre = cfg ? cfg.comuna : id;

  // Cargar datos de la capa de alerta si aún no están
  await cargarCapasAlertaGlobales_();

  state.escenarioActivo = escenario;
  const { data: plan, error } = await supabaseClient.rpc('obtener_o_crear_plan_contingencia', {
    p_ambito: ambito, p_comuna_id: id, p_area: null, p_escenario: escenario,
  });

  // ── OCULTAR LANDING ───────────────────────────────────────────────────────
  ocultarLandingPlanificacion_();

  if (error) { mostrarToast_('Error: ' + error.message); return; }

  // 3. Simbología adecuada al escenario (mostrar panel con color del escenario)
  mostrarSimbologiaEscenario_(escenario);

  iniciarModoPlanificacion_({ plan, ambito, id, nombre });
}

