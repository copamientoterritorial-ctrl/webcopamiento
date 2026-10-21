/* ============ PANEL: administrar (tabla) todos los recursos planificados de un plan ============ */
async function abrirAdminRecursosPlan_() {
  if (!planContingenciaEditandoId) return;
  document.getElementById('admin-recursos-plan-titulo').textContent = 'Recursos planificados — ' + (planContingenciaEditandoEntidad ? planContingenciaEditandoEntidad.nombre : '');
  const tbody = document.getElementById('admin-recursos-plan-body');
  const vacio = document.getElementById('admin-recursos-plan-vacio');
  tbody.innerHTML = '';
  vacio.style.display = 'none';
  document.getElementById('admin-recursos-plan-overlay').classList.add('show');

  const { data, error } = await supabaseClient
    .from('planificacion_recursos')
    .select('*, instituciones(nombre, color_hex, logo_url)')
    .eq('plan_id', planContingenciaEditandoId)
    .order('created_at', { ascending: false });

  if (error) { vacio.style.display = 'block'; vacio.textContent = 'Error: ' + error.message; return; }
  if (!data || data.length === 0) { vacio.style.display = 'block'; vacio.textContent = 'Sin recursos planificados en este plan.'; return; }

  data.forEach(r => {
    const inst = r.instituciones || { nombre: '—', color_hex: '#64748B' };
    const tr = document.createElement('tr');
    tr.innerHTML =
      '<td><span class="ra-swatch" style="background:' + inst.color_hex + '"></span>' + inst.nombre + '</td>' +
      '<td>' + r.tipo_recurso + '</td>' +
      '<td>' + iconoTipoGeometria_(r.tipo_geometria) + '</td>' +
      '<td>' + escapeHtml_(r.descripcion || '—') + '</td>' +
      (grdBloqueaInst_(inst) ? '<td style="white-space:nowrap;color:#B45309;font-size:11px;" title="El perfil GRD no edita ni elimina recursos de CMPC">🔒 Solo consulta</td>' :
      '<td style="white-space:nowrap;"><button class="popup-btn" data-accion="editar">Editar</button> ' +
      '<button class="popup-btn" data-accion="eliminar" style="color:#DC2626;">Eliminar</button></td>');
    if (grdBloqueaInst_(inst)) { tbody.appendChild(tr); return; }
    tr.querySelector('[data-accion="editar"]').addEventListener('click', () => abrirEditarRecursoPlanificado_(r.id));
    tr.querySelector('[data-accion="eliminar"]').addEventListener('click', async () => {
      if (!confirm('¿Eliminar este recurso planificado?\n\n(Se puede recuperar después con «↶ Deshacer» o con «🗑️ Recuperar».)')) return;
      if (!(await eliminarEntidadPlanificada_(r.id))) return;   // guarda copia para ↶ Deshacer (SQL 135)
      loadPlanificacionRecursos_(state.activeComunaId);
      abrirAdminRecursosPlan_();
    });
    tbody.appendChild(tr);
  });
}

/* Dibuja en el mapa (con simbología distinta a Periodos Críticos: borde
 * punteado grueso amarillo/rojo) los planes de contingencia ACTIVOS de la
 * comuna que se está viendo actualmente. */
async function actualizarOverlayPlanContingencia_() {
  planContingenciaOverlay.clearLayers();
  if (!state.activeComunaId) return;

  const { data: planesActivos } = await supabaseClient
    .from('planes_contingencia')
    .select('*')
    .eq('ambito', 'comuna')
    .eq('comuna_id', state.activeComunaId)
    .eq('activo', true);

  if (!planesActivos || planesActivos.length === 0) return;
  const limiteGeoJSON = limiteLayer.toGeoJSON();
  if (!limiteGeoJSON || !limiteGeoJSON.features || limiteGeoJSON.features.length === 0) return;

  for (const plan of planesActivos) {
    const color = plan.escenario === 'Amarilla' ? '#F59E0B' : '#EF4444';
    const capa = L.geoJSON(limiteGeoJSON, { style: { color, weight: 4, dashArray: '10,6', fillOpacity: 0 } });

    const { data: comparativo } = await supabaseClient.from('planes_contingencia_comparativo').select('*').eq('plan_id', plan.id);
    let filas = (comparativo || []).map(c =>
      '<div class="popup-row">' + c.institucion_nombre + ': propuesta <b>' + c.cantidad_propuesta + '</b>, tenemos <b>' + c.cantidad_actual + '</b></div>'
    ).join('');
    capa.bindPopup(
      '<div class="popup-title">' + (plan.escenario === 'Amarilla' ? '🟡 Plan Alerta Amarilla' : '🔴 Plan Alerta Roja') + '</div>' +
      (filas || '<div class="popup-row">Sin propuesta de recursos cargada.</div>')
    );
    capa.addTo(planContingenciaOverlay);
  }
}

/* ============ CATÁLOGO MAESTRO DE RECURSOS (solo Administrador) ============ */
state.recursosMaestroLista = [];
let editingRecursoMaestroId = null;

async function abrirPanelRecursosMaestro_() {
  document.getElementById('recursos-maestro-overlay').classList.add('show');
  await cargarCatalogoMaestro_();
}

async function cargarCatalogoMaestro_() {
  refrescarAdminSiVisible_();
  const tbody = document.getElementById('rm-tabla-body');
  const vacio = document.getElementById('rm-tabla-vacio');
  tbody.innerHTML = '';
  vacio.style.display = 'none';

  const { data, error } = await supabaseClient
    .from('recursos_maestro')
    .select('*, instituciones(nombre, color_hex, logo_url)')
    .order('created_at', { ascending: false });

  if (error) { vacio.style.display = 'block'; vacio.textContent = 'Error: ' + error.message; return; }

  state.recursosMaestroLista = data || [];
  if (state.recursosMaestroLista.length === 0) {
    vacio.style.display = 'block';
    vacio.textContent = 'Sin recursos en el catálogo aún.';
    return;
  }

  state.recursosMaestroLista.forEach(r => {
    const inst = r.instituciones || { nombre: '—', color_hex: '#64748B' };
    const tr = document.createElement('tr');
    tr.innerHTML =
      '<td>' + (r.icono_url ? '<img src="' + escapeHtml_(r.icono_url) + '" alt="" style="width:28px;height:28px;object-fit:contain;vertical-align:middle;" onerror="this.style.display=\'none\'">' : '<span style="color:#CBD5E1;">—</span>') + '</td>' +
      '<td><span class="ra-swatch" style="background:' + inst.color_hex + '"></span>' + inst.nombre + '</td>' +
      '<td>' + escapeHtml_(r.nombre_recurso || '—') + '</td>' +
      '<td>' + r.tipo_recurso + '</td>' +
      '<td>' + (r.pertenencia === 'Protección' ? '<span class="uc-badge" style="background:#FEE2E2;color:#991B1B;">🛡️ Protección</span>' : '<span class="uc-badge" style="background:#DBEAFE;color:#1E40AF;">🤝 Relacionamiento</span>') + '</td>' +
      '<td>' + (r.tipo_movil || '—') + '</td>' +
      '<td>' + (r.cantidad_personas || 0) + '</td>' +
      '<td>' + escapeHtml_(r.descripcion_funcion || '—') + '</td>' +
      '<td>' + (r.activo ? '<span class="uc-badge perfil-GRD">Activo</span>' : '<span class="uc-badge estado-inactivo">Inactivo</span>') + '</td>' +
      '<td style="white-space:nowrap;"><button class="popup-btn" data-accion="editar">Editar</button> ' +
      '<button class="popup-btn" data-accion="estado">' + (r.activo ? 'Desactivar' : 'Activar') + '</button> ' +
      '<button class="popup-btn" data-accion="eliminar" style="color:#DC2626;">Eliminar</button></td>';
    tr.querySelector('[data-accion="editar"]').addEventListener('click', () => abrirModalRecursoMaestro_(r));
    tr.querySelector('[data-accion="estado"]').addEventListener('click', () => toggleActivoRecursoMaestro_(r.id, r.activo));
    tr.querySelector('[data-accion="eliminar"]').addEventListener('click', () => eliminarRecursoMaestro_(r.id));
    tbody.appendChild(tr);
  });
}

function abrirModalRecursoMaestro_(item) {
  editingRecursoMaestroId = item ? item.id : null;
  document.getElementById('recurso-maestro-modal-title').textContent = item ? 'Editar recurso del catálogo' : 'Nuevo recurso en el catálogo';
  const fInst = document.getElementById('rm-institucion');
  fInst.innerHTML = '';
  state.instituciones.forEach(i => {
    const opt = document.createElement('option'); opt.value = i.id; opt.textContent = i.nombre;
    fInst.appendChild(opt);
  });
  if (item) fInst.value = item.institucion_id;
  document.getElementById('rm-nombre').value = item ? (item.nombre_recurso || '') : '';
  // El tipo se llena desde el catálogo tipos_recurso. Si el catálogo aún no
  // cargó, se conservan las opciones fijas del HTML como respaldo.
  const fTipo = document.getElementById('rm-tipo');
  const tipoActual = item
    ? item.tipo_recurso
    : ((state.tiposRecursoCatalogo && state.tiposRecursoCatalogo.length > 0) ? state.tiposRecursoCatalogo[0].nombre : fTipo.value);
  poblarSelectTiposRecurso_(fTipo, tipoActual);
  cargarTiposRecurso_().then(() => poblarSelectTiposRecurso_(fTipo, tipoActual)).catch(() => {});
  document.getElementById('rm-movil').value = item ? (item.tipo_movil || 'No Aplica') : 'No Aplica';
  document.getElementById('rm-pertenencia').value = item ? (item.pertenencia || 'Relacionamiento') : 'Relacionamiento';
  document.getElementById('rm-cantidad-personas').value = item ? (item.cantidad_personas || 0) : 0;
  document.getElementById('rm-descripcion').value = item ? (item.descripcion_funcion || '') : '';

  // Ícono personalizado
  rmIconoBase64 = null;         // nueva imagen seleccionada (base64)
  rmIconoUrlActual = item ? (item.icono_url || null) : null;  // url existente
  const img = document.getElementById('rm-icono-img');
  const ph  = document.getElementById('rm-icono-placeholder');
  const btnQuitar = document.getElementById('rm-icono-quitar');
  if (rmIconoUrlActual) {
    img.src = rmIconoUrlActual; img.style.display = 'block'; ph.style.display = 'none'; btnQuitar.style.display = 'inline-block';
  } else {
    img.src = ''; img.style.display = 'none'; ph.style.display = 'block'; btnQuitar.style.display = 'none';
  }

  document.getElementById('recurso-maestro-modal-error').classList.remove('show');
  document.getElementById('recurso-maestro-modal-overlay').classList.add('show');
}

// Estado del ícono en edición
let rmIconoBase64 = null;
let rmIconoUrlActual = null;

async function guardarRecursoMaestro_() {
  const btn = document.getElementById('btn-save-recurso-maestro');
  const errEl = document.getElementById('recurso-maestro-modal-error');
  errEl.classList.remove('show');

  const institucionId = document.getElementById('rm-institucion').value;
  const nombreRecurso = document.getElementById('rm-nombre').value.trim();
  const tipo = document.getElementById('rm-tipo').value;
  const movil = document.getElementById('rm-movil').value;
  const pertenencia = document.getElementById('rm-pertenencia').value;
  const cantidadPersonas = parseInt(document.getElementById('rm-cantidad-personas').value, 10) || 0;
  const descripcion = document.getElementById('rm-descripcion').value.trim();

  if (!institucionId) { errEl.textContent = 'Selecciona una institución.'; errEl.classList.add('show'); return; }
  if (!nombreRecurso) { errEl.textContent = 'Ponle un nombre al recurso.'; errEl.classList.add('show'); return; }

  btn.textContent = 'Guardando…'; btn.disabled = true;

  // Subir ícono si hay uno nuevo seleccionado
  let iconoUrl = rmIconoUrlActual;  // mantener la url actual por defecto
  if (rmIconoBase64) {
    try {
      // Se sube ya recortado (sin márgenes transparentes) para que se vea grande en el mapa
      if (!/^data:image\/svg/i.test(rmIconoBase64)) {
        try { rmIconoBase64 = (await recortarImagenTransparente_(rmIconoBase64, 512)).url; } catch (e) { /* se sube tal cual */ }
      }
      const res = await fetch(rmIconoBase64);
      const blob = await res.blob();
      const ext = blob.type.includes('svg') ? 'svg' : blob.type.includes('webp') ? 'webp' : 'png';
      const path = 'recurso-' + (editingRecursoMaestroId || Date.now()) + '-' + Date.now() + '.' + ext;
      const { error: upErr } = await supabaseClient.storage.from('iconos-recursos').upload(path, blob, { contentType: blob.type, upsert: true });
      if (upErr) { errEl.textContent = 'Error al subir el ícono: ' + upErr.message; errEl.classList.add('show'); btn.textContent = 'Guardar'; btn.disabled = false; return; }
      const { data: urlData } = supabaseClient.storage.from('iconos-recursos').getPublicUrl(path);
      iconoUrl = urlData.publicUrl;
    } catch (e) {
      errEl.textContent = 'Error al procesar el ícono.'; errEl.classList.add('show'); btn.textContent = 'Guardar'; btn.disabled = false; return;
    }
  }

  const payload = {
    institucion_id: institucionId, nombre_recurso: nombreRecurso, tipo_recurso: tipo, tipo_movil: movil,
    pertenencia: pertenencia, cantidad_personas: cantidadPersonas, descripcion_funcion: descripcion,
    icono_url: iconoUrl,
  };

  const { error } = editingRecursoMaestroId
    ? await supabaseClient.from('recursos_maestro').update(payload).eq('id', editingRecursoMaestroId)
    : await supabaseClient.from('recursos_maestro').insert({ ...payload, activo: true });

  btn.textContent = 'Guardar'; btn.disabled = false;

  if (error) { errEl.textContent = 'No se pudo guardar: ' + error.message; errEl.classList.add('show'); return; }

  document.getElementById('recurso-maestro-modal-overlay').classList.remove('show');
  mostrarToast_(editingRecursoMaestroId ? 'Recurso actualizado.' : 'Recurso agregado al catálogo.');
  editingRecursoMaestroId = null;
  rmIconoBase64 = null; rmIconoUrlActual = null;
  await cargarIconosRecursos_();  // refrescar mapa de íconos por tipo
  await cargarPertenenciaRecursos_();  // refrescar mapa de pertenencias
  cargarCatalogoMaestro_();
  // Refrescar las capas de recursos en el mapa para que tomen el nuevo ícono
  if (typeof loadRecursosDisponiblesAreaLayer_ === 'function') loadRecursosDisponiblesAreaLayer_();
}

async function toggleActivoRecursoMaestro_(id, activoActual) {
  const { error } = await supabaseClient.from('recursos_maestro').update({ activo: !activoActual }).eq('id', id);
  if (error) { mostrarToast_('Error: ' + error.message); return; }
  mostrarToast_('Recurso ' + (!activoActual ? 'activado' : 'desactivado') + '.');
  cargarCatalogoMaestro_();
}

async function eliminarRecursoMaestro_(id) {
  if (!confirm('¿Eliminar este recurso del catálogo? No se podrá si ya está asignado a alguna zona.')) return;
  const { error } = await supabaseClient.from('recursos_maestro').delete().eq('id', id);
  if (error) { mostrarToast_('No se pudo eliminar (probablemente ya está asignado a una zona): ' + error.message); return; }
  mostrarToast_('Recurso eliminado del catálogo.');
  cargarCatalogoMaestro_();
}

/* ============ RECURSOS DISPONIBLES DEL ÁREA (asignación por zona, invocando el catálogo) ============ */
state.recursosAreaLista = [];
let editingRecursoAreaId = null;
let recursoAreaPendingLatLng = null;

function zonasDisponiblesUsuario_() {
  if (state.perfil.perfil === 'Administrador') return state.areasCatalogo;
  return state.misAreasIds || [];
}

state.raZonaActiva = 'resumen';
let chartResumenRecursosAreaActivo = null;

let raZonasSeleccionadas = new Set();

async function abrirPanelRecursosArea_() {
  const zonas = zonasDisponiblesUsuario_();
  const esAdmin = state.perfil.perfil === 'Administrador';
  const tabs = document.getElementById('ra-tabs');
  const dropdownWrap = document.getElementById('ra-zonas-dropdown-wrap');
  tabs.innerHTML = '';

  if (zonas.length === 0) {
    dropdownWrap.style.display = 'none';
    document.getElementById('ra-panel-resumen').style.display = 'none';
    document.getElementById('ra-panel-tabla').style.display = 'block';
    document.getElementById('ra-tabla-body').innerHTML = '';
    document.getElementById('ra-tabla-vacio').style.display = 'block';
    document.getElementById('ra-tabla-vacio').textContent = 'No tienes zonas asignadas.';
    document.getElementById('btn-nuevo-recurso-area').style.display = 'none';
    document.getElementById('recursos-area-overlay').classList.add('show');
    return;
  }

  const btnResumen = document.createElement('button');
  btnResumen.className = 'popup-btn';
  btnResumen.textContent = '📊 Resumen';
  btnResumen.dataset.zonaTab = 'resumen';
  tabs.appendChild(btnResumen);

  if (esAdmin) {
    // Administrador: checklist compacto en vez de un botón por zona.
    dropdownWrap.style.display = 'block';
    raZonasSeleccionadas = new Set(zonas); // por defecto, todas seleccionadas
    poblarChecklistZonasRecursosArea_(zonas);
    actualizarContadorZonasDropdown_();
  } else {
    dropdownWrap.style.display = 'none';
    zonas.forEach(a => {
      const btn = document.createElement('button');
      btn.className = 'popup-btn';
      btn.textContent = a;
      btn.dataset.zonaTab = a;
      btn.addEventListener('click', () => seleccionarTabRecursosArea_(a));
      tabs.appendChild(btn);
    });
  }

  document.querySelector('#ra-tabs [data-zona-tab="resumen"]').addEventListener('click', () => seleccionarTabRecursosArea_('resumen'));

  document.getElementById('recursos-area-overlay').classList.add('show');
  await seleccionarTabRecursosArea_(esAdmin ? 'zonas' : 'resumen');
}

function poblarChecklistZonasRecursosArea_(zonas) {
  const cont = document.getElementById('ra-zonas-checklist');
  cont.innerHTML = '';
  zonas.forEach(z => {
    const lab = document.createElement('label');
    lab.dataset.nombre = z.toLowerCase();
    lab.innerHTML = '<input type="checkbox" value="' + z + '" checked> ' + z;
    lab.querySelector('input').addEventListener('change', (e) => {
      if (e.target.checked) raZonasSeleccionadas.add(z); else raZonasSeleccionadas.delete(z);
      actualizarContadorZonasDropdown_();
      seleccionarTabRecursosArea_('zonas');
    });
    cont.appendChild(lab);
  });
}

function actualizarContadorZonasDropdown_() {
  document.getElementById('ra-zonas-dropdown-count').textContent = '(' + raZonasSeleccionadas.size + ')';
}

function actualizarBotonesTabsRecursosArea_() {
  document.querySelectorAll('#ra-tabs [data-zona-tab]').forEach(btn => {
    const activo = btn.dataset.zonaTab === state.raZonaActiva;
    btn.style.background = activo ? 'var(--cobalt)' : '';
    btn.style.color = activo ? '#fff' : '';
  });
}

async function seleccionarTabRecursosArea_(zonaTab) {
  state.raZonaActiva = zonaTab;
  actualizarBotonesTabsRecursosArea_();

  if (zonaTab === 'resumen') {
    document.getElementById('ra-panel-resumen').style.display = 'block';
    document.getElementById('ra-panel-tabla').style.display = 'none';
    document.getElementById('btn-nuevo-recurso-area').style.display = 'none';
    await cargarResumenRecursosArea_();
  } else if (zonaTab === 'zonas') {
    // Administrador: tabla combinada de todas las zonas marcadas en el checklist.
    document.getElementById('ra-panel-resumen').style.display = 'none';
    document.getElementById('ra-panel-tabla').style.display = 'block';
    document.getElementById('btn-nuevo-recurso-area').style.display = 'inline-block';
    await cargarTablaRecursosArea_(Array.from(raZonasSeleccionadas));
  } else {
    document.getElementById('ra-panel-resumen').style.display = 'none';
    document.getElementById('ra-panel-tabla').style.display = 'block';
    document.getElementById('btn-nuevo-recurso-area').style.display = 'inline-block';
    await cargarTablaRecursosArea_(zonaTab);
  }
}

async function cargarResumenRecursosArea_() {
  const zonas = zonasDisponiblesUsuario_();
  const totalEl = document.getElementById('ra-resumen-total');
  totalEl.textContent = 'Cargando…';

  const { data, error } = await recursosDeAreas_(zonas);

  if (error) { totalEl.textContent = 'Error: ' + error.message; return; }

  const lista = data || [];
  totalEl.textContent = lista.length + ' recurso(s) disponible(s) en total';

  const personasPorNombre = {};
  const cantidadPorNombre = {};
  lista.forEach(r => {
    const nombre = r.nombre_recurso || 'Sin nombre';
    personasPorNombre[nombre] = (personasPorNombre[nombre] || 0) + (Number(r.cantidad_personas) || 0);
    cantidadPorNombre[nombre] = (cantidadPorNombre[nombre] || 0) + 1;
  });

  const canvas = document.getElementById('chart-recursos-area-resumen');
  if (chartResumenRecursosAreaActivo) { chartResumenRecursosAreaActivo.destroy(); chartResumenRecursosAreaActivo = null; }
  if (Object.keys(personasPorNombre).length > 0) {
    canvas.style.display = 'block';
    chartResumenRecursosAreaActivo = new Chart(canvas, {
      type: 'bar',
      data: { labels: Object.keys(personasPorNombre), datasets: [{ label: 'Personas', data: Object.values(personasPorNombre), backgroundColor: '#0F172A' }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } }, x: { ticks: { font: { size: 10 } } } } },
    });
  } else {
    canvas.style.display = 'none';
  }

  const tbodyResumen = document.getElementById('ra-resumen-tabla-body');
  tbodyResumen.innerHTML = '';
  Object.keys(personasPorNombre).sort().forEach(nombre => {
    const tr = document.createElement('tr');
    tr.innerHTML =
      '<td style="padding:7px 6px;border-bottom:1px solid #F1F5F9;">' + nombre + '</td>' +
      '<td style="padding:7px 6px;border-bottom:1px solid #F1F5F9;">' + cantidadPorNombre[nombre] + '</td>' +
      '<td style="padding:7px 6px;border-bottom:1px solid #F1F5F9;font-weight:700;">' + personasPorNombre[nombre] + '</td>';
    tbodyResumen.appendChild(tr);
  });

  const totalRecursosGeneral = Object.values(cantidadPorNombre).reduce((a, b) => a + b, 0);
  const totalPersonasGeneral = Object.values(personasPorNombre).reduce((a, b) => a + b, 0);
  const trTotal = document.createElement('tr');
  trTotal.innerHTML =
    '<td style="padding:9px 6px;border-top:2px solid var(--border);font-weight:700;">Total</td>' +
    '<td style="padding:9px 6px;border-top:2px solid var(--border);font-weight:700;">' + totalRecursosGeneral + '</td>' +
    '<td style="padding:9px 6px;border-top:2px solid var(--border);font-weight:700;">' + totalPersonasGeneral + '</td>';
  tbodyResumen.appendChild(trTotal);

  const porZona = {};
  zonas.forEach(z => { porZona[z] = 0; });
  lista.forEach(r => { porZona[r.area] = (porZona[r.area] || 0) + 1; });

  const cont = document.getElementById('ra-resumen-por-zona');
  cont.innerHTML = '';
  zonas.forEach(z => {
    const row = document.createElement('div'); row.className = 'propuesta-row';
    row.innerHTML = '<div class="pr-left">' + z + '</div><span class="propuesta-comparativo"><b>' + (porZona[z] || 0) + '</b> recurso(s)</span>';
    cont.appendChild(row);
  });
}

async function cargarTablaRecursosArea_(zonaOZonas) {
  const tbody = document.getElementById('ra-tabla-body');
  const vacio = document.getElementById('ra-tabla-vacio');
  const thZona = document.getElementById('ra-th-zona');
  tbody.innerHTML = '';
  vacio.style.display = 'none';

  const esVarias = Array.isArray(zonaOZonas);
  thZona.style.display = esVarias ? '' : 'none';

  const { data, error } = await recursosDeAreas_(zonaOZonas, 'nombre_recurso');

  if (error) {
    vacio.style.display = 'block';
    vacio.textContent = 'Error al cargar: ' + error.message;
    return;
  }

  state.recursosAreaLista = data || [];
  if (state.recursosAreaLista.length === 0) {
    vacio.style.display = 'block';
    vacio.textContent = esVarias ? 'Sin recursos en las zonas marcadas.' : 'Sin recursos asignados en esta zona.';
    return;
  }

  state.recursosAreaLista.forEach(r => {
    const inst = r.instituciones || { nombre: '—', color_hex: '#64748B' };
    const tr = document.createElement('tr');
    tr.innerHTML =
      (esVarias ? '<td>' + r.area + '</td>' : '') +
      '<td><span class="ra-swatch" style="background:' + inst.color_hex + '"></span>' + inst.nombre + '</td>' +
      '<td>' + escapeHtml_(r.nombre_recurso || '—') + '</td>' +
      '<td>' + r.tipo_recurso + (r.tipo_movil && r.tipo_movil !== 'No Aplica' ? ' (' + r.tipo_movil + ')' : '') + '</td>' +
      '<td>' + (r.cantidad_personas || 0) + '</td>' +
      '<td>' + escapeHtml_(r.descripcion_funcion || '—') + '</td>' +
      '<td>' + (r.fecha_inicio_operacion || '—') + '</td>' +
      '<td>' + ((r.lat != null && r.lng != null) ? (r.lat.toFixed(3) + ', ' + r.lng.toFixed(3)) : '—') + '</td>' +
      '<td style="white-space:nowrap;"><button class="popup-btn" data-accion="editar">Editar</button> ' +
      '<button class="popup-btn" data-accion="eliminar" style="color:#DC2626;">Eliminar</button></td>';
    tr.querySelector('[data-accion="editar"]').addEventListener('click', () => abrirModalRecursoArea_(r));
    tr.querySelector('[data-accion="eliminar"]').addEventListener('click', () => eliminarRecursoArea_(r.id));
    tbody.appendChild(tr);
  });
}

let editingRecursoAreaTipoGeom = 'punto';

async function abrirModalRecursoArea_(item) {
  editingRecursoAreaId = item ? item.id : null;
  editingRecursoAreaTipoGeom = item ? (item.tipo_geometria || 'punto') : 'punto';
  recursoAreaPendingLatLng = item && item.lat != null ? { lat: item.lat, lng: item.lng } : null;
  recursoAreaGeomPendiente = null;

  document.getElementById('recurso-area-modal-title').textContent = item ? 'Editar asignación' : 'Asignar recurso a la zona';
  const esPuntoEditable = editingRecursoAreaTipoGeom === 'punto';
  document.getElementById('ra-ubicacion-texto').style.display = esPuntoEditable ? '' : 'none';
  document.getElementById('btn-ubicar-recurso-area').style.display = esPuntoEditable ? '' : 'none';

  // Selector de zona: solo aparece al CREAR (no editar) y cuando hay más de
  // una zona disponible para elegir (vista "zonas" combinada de Admin).
  const wrapZona = document.getElementById('ra-nuevo-zona-wrap');
  if (!item && state.raZonaActiva === 'zonas') {
    wrapZona.style.display = 'block';
    const selectZona = document.getElementById('ra-nuevo-zona');
    selectZona.innerHTML = '';
    Array.from(raZonasSeleccionadas).forEach(z => {
      const opt = document.createElement('option'); opt.value = z; opt.textContent = z;
      selectZona.appendChild(opt);
    });
  } else {
    wrapZona.style.display = 'none';
  }

  const { data: catalogo } = await supabaseClient.from('recursos_maestro').select('*, instituciones(nombre)').eq('activo', true).order('created_at', { ascending: false });
  const select = document.getElementById('ra-recurso-maestro');
  select.innerHTML = '';
  (catalogo || []).forEach(rm => {
    const inst = rm.instituciones ? rm.instituciones.nombre : '—';
    const opt = document.createElement('option');
    opt.value = rm.id;
    opt.textContent = (rm.nombre_recurso || 'Sin nombre') + ' — ' + inst + ' · ' + rm.tipo_recurso + (rm.tipo_movil && rm.tipo_movil !== 'No Aplica' ? ' (' + rm.tipo_movil + ')' : '') + ' — ' + rm.cantidad_personas + ' pers.';
    select.appendChild(opt);
  });
  if (catalogo && catalogo.length === 0) {
    const opt = document.createElement('option'); opt.value = ''; opt.textContent = 'Sin recursos en el catálogo — créalos primero en "Catálogo de Recursos"';
    select.appendChild(opt);
  }
  if (item) select.value = item.recurso_maestro_id;

  document.getElementById('ra-fecha-inicio').value = item ? (item.fecha_inicio_operacion || '') : '';
  document.getElementById('ra-ubicacion-texto').textContent = recursoAreaPendingLatLng
    ? ('Ubicación: ' + recursoAreaPendingLatLng.lat.toFixed(4) + ', ' + recursoAreaPendingLatLng.lng.toFixed(4))
    : 'Sin ubicación definida aún.';
  document.getElementById('recurso-area-modal-error').classList.remove('show');
  document.getElementById('recurso-area-modal-overlay').classList.add('show');
}

function ubicarRecursoAreaEnMapa_() {
  const recursoMaestroId = document.getElementById('ra-recurso-maestro').value;
  const fechaInicio = document.getElementById('ra-fecha-inicio').value;
  const zonaElegida = state.raZonaActiva === 'zonas' ? document.getElementById('ra-nuevo-zona').value : null;

  document.getElementById('recurso-area-modal-overlay').classList.remove('show');
  document.getElementById('recursos-area-overlay').classList.remove('show');
  mostrarToast_('Haz clic en el mapa para ubicar el recurso.');

  map.once('click', (e) => {
    recursoAreaPendingLatLng = { lat: e.latlng.lat, lng: e.latlng.lng };
    document.getElementById('recursos-area-overlay').classList.add('show');
    document.getElementById('recurso-area-modal-overlay').classList.add('show');
    document.getElementById('ra-recurso-maestro').value = recursoMaestroId;
    document.getElementById('ra-fecha-inicio').value = fechaInicio;
    if (zonaElegida) document.getElementById('ra-nuevo-zona').value = zonaElegida;
    document.getElementById('ra-ubicacion-texto').textContent = 'Ubicación: ' + e.latlng.lat.toFixed(4) + ', ' + e.latlng.lng.toFixed(4);
  });
}

function zonaObjetivoParaRecarga_() {
  return state.raZonaActiva === 'zonas' ? Array.from(raZonasSeleccionadas) : state.raZonaActiva;
}

/* Guarda un recurso disponible en la base única referencia_recursos (SQL 67).
 * Crear: crear_recurso_referencia(id_area, lat, lng, datos) — hereda subgerencia,
 *   región y comuna del área; el tipo sale del catálogo (recursos_maestro).
 * Editar: guardar_ficha_recurso (catálogo + tipo) + mover_recurso_referencia (si se
 *   reubicó) + actualizar_inicio_recurso (si cambió la fecha de inicio; borra los
 *   turnos anteriores a la nueva fecha, igual que el Calendario).
 * Devuelve el mensaje de error o null. */
async function guardarRecursoReferencia_(id, zona, recursoMaestroId, fechaInicio, latlng) {
  const { data: rm, error: errRm } = await supabaseClient.from('recursos_maestro')
    .select('tipo_recurso').eq('id', recursoMaestroId).maybeSingle();
  if (errRm || !rm) return 'No se encontró el recurso en el catálogo.';
  const datos = { recurso_maestro_id: recursoMaestroId, tipo_recurso: rm.tipo_recurso };

  if (!id) {
    const { data: cat } = await supabaseClient.from('areas_relacionamiento_catalogo')
      .select('id_area, area').order('area');
    const fila = (cat || []).find(a => plNorm_(a.area) === plNorm_(zona));
    if (!fila || fila.id_area == null) return 'El área "' + zona + '" no tiene código (id_area) en el catálogo.';
    if (fechaInicio) datos.fecha_inicio_operacion = fechaInicio;
    const { error } = await supabaseClient.rpc('crear_recurso_referencia', {
      p_id_area: fila.id_area, p_lat: Number(latlng.lat), p_lng: Number(latlng.lng), p_datos: datos,
    });
    return error ? error.message : null;
  }

  const { data: actual } = await supabaseClient.from('recursos_disponibles_area_geojson')
    .select('fecha_inicio_operacion').eq('id', id).maybeSingle();
  const r1 = await supabaseClient.rpc('guardar_ficha_recurso', { p_recurso_id: id, p_datos: datos });
  if (r1.error) return r1.error.message;
  if (latlng) {
    const r2 = await supabaseClient.rpc('mover_recurso_referencia', { p_recurso_id: id, p_lat: Number(latlng.lat), p_lng: Number(latlng.lng) });
    if (r2.error) return r2.error.message;
  }
  if ((actual && actual.fecha_inicio_operacion || null) !== (fechaInicio || null)) {
    const r3 = await supabaseClient.rpc('actualizar_inicio_recurso', { p_recurso_id: String(id), p_fecha: fechaInicio || null, p_borrar_previos: true });
    if (r3.error) return r3.error.message;
  }
  return null;
}

async function guardarRecursoArea_() {
  const btn = document.getElementById('btn-save-recurso-area');
  const errEl = document.getElementById('recurso-area-modal-error');
  errEl.classList.remove('show');

  const recursoMaestroId = document.getElementById('ra-recurso-maestro').value;
  const fechaInicio = document.getElementById('ra-fecha-inicio').value || null;
  const zona = state.raZonaActiva === 'zonas' ? document.getElementById('ra-nuevo-zona').value : state.raZonaActiva;
  const editandoNoPunto = editingRecursoAreaId && editingRecursoAreaTipoGeom !== 'punto';

  if (!recursoMaestroId) { errEl.textContent = 'Elige un recurso del catálogo.'; errEl.classList.add('show'); return; }
  if (!zona) { errEl.textContent = 'Elige una zona.'; errEl.classList.add('show'); return; }
  if (!editandoNoPunto && !recursoAreaPendingLatLng) { errEl.textContent = 'Ubica el recurso en el mapa antes de guardar.'; errEl.classList.add('show'); return; }

  btn.textContent = 'Guardando…'; btn.disabled = true;
  const error = await guardarRecursoReferencia_(editingRecursoAreaId, zona, recursoMaestroId, fechaInicio,
    editandoNoPunto ? null : recursoAreaPendingLatLng);
  btn.textContent = 'Guardar'; btn.disabled = false;

  if (error) { errEl.textContent = 'No se pudo guardar: ' + error; errEl.classList.add('show'); return; }

  document.getElementById('recurso-area-modal-overlay').classList.remove('show');
  mostrarToast_(editingRecursoAreaId ? 'Asignación actualizada.' : 'Recurso asignado a la zona.');
  editingRecursoAreaId = null;
  recursoAreaPendingLatLng = null;
  cargarTablaRecursosArea_(zonaObjetivoParaRecarga_());
  loadRecursosDisponiblesAreaLayer_();
}

async function eliminarRecursoArea_(id) {
  if (!confirm('¿Quitar este recurso de la zona? También se borran sus turnos y rutas asociadas.')) return;
  const { error } = await supabaseClient.rpc('eliminar_recurso_referencia', { p_recurso_id: id });
  if (error) { mostrarToast_('Error: ' + error.message); return; }
  mostrarToast_('Asignación eliminada.');
  cargarTablaRecursosArea_(zonaObjetivoParaRecarga_());
  loadRecursosDisponiblesAreaLayer_();
}

