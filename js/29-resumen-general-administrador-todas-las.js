/* ============ RESUMEN GENERAL (Administrador) — todas las comunas con periodos ============ */
state.resumenGeneral = [];

async function abrirPanelResumenGeneral_() {
  document.getElementById('resumen-general-overlay').classList.add('show');
  document.getElementById('resumen-general-search').value = '';
  document.getElementById('resumen-general-list').innerHTML = '<div class="layer-empty-msg">Cargando…</div>';

  const [{ data: periodos, error: perErr }, { data: recursos, error: recErr }] = await Promise.all([
    supabaseClient.from('config_periodos').select('id, comuna_id, estado_periodo'),
    supabaseClient.from('copamiento_recursos').select('id, comuna_id, id_periodo'),
  ]);

  if (perErr || recErr) {
    document.getElementById('resumen-general-list').innerHTML = '<div class="layer-empty-msg">Error al cargar: ' + ((perErr || recErr).message) + '</div>';
    return;
  }

  const porComuna = {};
  (periodos || []).forEach(p => {
    if (!porComuna[p.comuna_id]) porComuna[p.comuna_id] = { activos: 0, cerrados: 0, recursos: 0 };
    if (p.estado_periodo === 'activo') porComuna[p.comuna_id].activos++; else porComuna[p.comuna_id].cerrados++;
  });
  (recursos || []).forEach(r => {
    if (porComuna[r.comuna_id]) porComuna[r.comuna_id].recursos++;
  });

  state.resumenGeneral = Object.keys(porComuna).map(comunaId => {
    const cfg = state.comunas.find(c => c.id === comunaId);
    return {
      comunaId,
      comuna: cfg ? cfg.comuna : comunaId,
      region: cfg ? cfg.region : '—',
      ...porComuna[comunaId],
    };
  }).sort((a, b) => a.comuna.localeCompare(b.comuna));

  renderResumenGeneralList_();
}

function renderResumenGeneralList_() {
  const cont = document.getElementById('resumen-general-list');
  const filtro = normalizarBusqueda_(document.getElementById('resumen-general-search').value);
  cont.innerHTML = '';

  const filtrados = state.resumenGeneral.filter(c => !filtro || normalizarBusqueda_(c.comuna).includes(filtro) || normalizarBusqueda_(c.region).includes(filtro));

  if (filtrados.length === 0) {
    const msg = document.createElement('div'); msg.className = 'layer-empty-msg';
    msg.textContent = state.resumenGeneral.length === 0 ? 'Todavía no hay periodos críticos registrados en ninguna comuna.' : 'Ninguna comuna coincide con la búsqueda.';
    cont.appendChild(msg);
    return;
  }

  filtrados.forEach(c => {
    const card = document.createElement('div'); card.className = 'comuna-resumen-card';
    card.innerHTML =
      '<div class="crc-top"><div><div class="crc-nombre">' + c.comuna + '</div><div class="crc-region">' + c.region + '</div></div></div>' +
      '<div class="crc-stats">' +
      '<span><b>' + c.activos + '</b> activo(s)</span>' +
      '<span><b>' + c.cerrados + '</b> histórico(s)</span>' +
      '<span><b>' + c.recursos + '</b> recurso(s)</span>' +
      '</div>';
    card.addEventListener('click', () => abrirPlanComuna_(c.comunaId));
    cont.appendChild(card);
  });
}

async function abrirPlanComuna_(comunaId) {
  const cfg = state.comunas.find(c => c.id === comunaId);
  document.getElementById('plan-comuna-titulo').textContent = cfg ? cfg.comuna : comunaId;
  document.getElementById('plan-comuna-sub').textContent = cfg ? cfg.region : '—';
  document.getElementById('plan-comuna-body').innerHTML = '<div class="layer-empty-msg">Cargando…</div>';
  document.getElementById('plan-comuna-overlay').classList.add('show');
  document.getElementById('btn-ir-al-mapa-comuna').dataset.comunaId = comunaId;

  const { data: periodos, error } = await supabaseClient
    .from('config_periodos').select('*').eq('comuna_id', comunaId).order('fecha_inicio', { ascending: false });
  const { data: recursos } = await supabaseClient
    .from('copamiento_recursos').select('id, id_periodo').eq('comuna_id', comunaId);

  if (error) {
    document.getElementById('plan-comuna-body').innerHTML = '<div class="layer-empty-msg">Error: ' + error.message + '</div>';
    return;
  }

  const autorIds = [...new Set((periodos || []).map(p => p.creado_por).filter(Boolean))];
  let nombresPorAutor = {};
  if (autorIds.length > 0) {
    const { data: autores } = await supabaseClient.from('perfiles').select('id, nombre_completo, perfil').in('id', autorIds);
    (autores || []).forEach(a => { nombresPorAutor[a.id] = a.nombre_completo + (a.perfil ? ' (' + a.perfil + ')' : ''); });
  }

  const body = document.getElementById('plan-comuna-body');
  body.innerHTML = '';

  if (!periodos || periodos.length === 0) {
    body.innerHTML = '<div class="layer-empty-msg">Sin periodos registrados en esta comuna.</div>';
    return;
  }

  function renderGrupo(p) {
    const cantidad = (recursos || []).filter(r => r.id_periodo === p.id).length;
    const autor = p.creado_por ? (nombresPorAutor[p.creado_por] || 'Usuario eliminado') : '—';
    const grupo = document.createElement('div'); grupo.className = 'periodo-group';
    grupo.innerHTML =
      '<div class="periodo-head"><div class="ph-left"><div>' +
      '<div class="ph-name">' + escapeHtml_(p.nombre_plan) + ' <span class="periodo-badge ' + p.estado_periodo + '">' + p.estado_periodo + '</span></div>' +
      '<div class="ph-fechas">' + (p.fecha_inicio || '—') + ' → ' + (p.fecha_fin || 'indefinido') + ' · Creado por ' + autor + '</div>' +
      '</div></div></div>' +
      (p.conclusion ? '<div class="periodo-body" style="border-top:1px solid #F1F5F9;"><span class="periodo-count" style="display:block;margin-bottom:2px;font-weight:700;">Conclusión:</span><span class="periodo-count">' + escapeHtml_(p.conclusion) + '</span></div>' : '') +
      '<div class="periodo-body"><span class="periodo-count">' + cantidad + ' recurso(s)</span>' +
      '<div class="periodo-actions-row"><button class="btn-resumen-periodo" data-id="' + p.id + '">📊 Ver resumen</button></div></div>';
    grupo.querySelector('.btn-resumen-periodo').addEventListener('click', () => abrirResumenPeriodo_(p.id));
    return grupo;
  }

  const activos = periodos.filter(p => p.estado_periodo === 'activo');
  const cerrados = periodos.filter(p => p.estado_periodo === 'cerrado');

  if (activos.length > 0) {
    const label = document.createElement('p'); label.className = 'section-label'; label.textContent = 'Periodos Activos';
    body.appendChild(label);
    activos.forEach(p => body.appendChild(renderGrupo(p)));
  }
  if (cerrados.length > 0) {
    const label = document.createElement('p'); label.className = 'section-label'; label.style.marginTop = '14px'; label.textContent = 'Historial de Periodos';
    body.appendChild(label);
    cerrados.forEach(p => body.appendChild(renderGrupo(p)));
  }
}

/* ============ ADMINISTRACIÓN DE USUARIOS (solo Administrador) — modal con buscador ============ */
state.usuarios = [];
let editingUsuarioId = null;

async function abrirPanelUsuarios_() {
  document.getElementById('usuarios-panel-overlay').classList.add('show');
  document.getElementById('usuarios-search').value = '';
  await cargarUsuariosAdmin();
}

async function cargarUsuariosAdmin() {
  refrescarAdminSiVisible_();
  document.getElementById('usuarios-panel-list').innerHTML = '<div class="layer-empty-msg">Cargando usuarios…</div>';
  const { data, error } = await supabaseClient.functions.invoke('admin-usuarios', { body: { action: 'listar' } });
  if (error || !data || !data.ok) {
    document.getElementById('usuarios-panel-list').innerHTML = '<div class="layer-empty-msg">No se pudo cargar la lista: ' + await mensajeErrorEdgeFunction_(data, error) + '</div>';
    return;
  }
  state.usuarios = data.usuarios;
  renderUsuariosPanelList_();
}

function renderUsuariosPanelList_() {
  const cont = document.getElementById('usuarios-panel-list');
  const filtro = normalizarBusqueda_(document.getElementById('usuarios-search').value);
  cont.innerHTML = '';

  const filtrados = state.usuarios.filter(u => {
    if (!filtro) return true;
    const comunasTexto = u.comuna_ids.map(nombreComuna_).join(' ') + ' ' + (u.area_ids || []).join(' ');
    return normalizarBusqueda_(u.nombre_completo).includes(filtro)
      || normalizarBusqueda_(u.email).includes(filtro)
      || normalizarBusqueda_(comunasTexto).includes(filtro)
      || normalizarBusqueda_(u.perfil).includes(filtro);
  });

  if (filtrados.length === 0) {
    const msg = document.createElement('div'); msg.className = 'layer-empty-msg';
    msg.textContent = state.usuarios.length === 0 ? 'Sin usuarios registrados aún.' : 'Ningún usuario coincide con la búsqueda.';
    cont.appendChild(msg);
    return;
  }

  filtrados.forEach(u => {
    const card = document.createElement('div'); card.className = 'user-card';
    const esJefeArea = u.perfil === 'Jefe de Área Relacionamiento';
    const comunasTexto = u.perfil === 'Administrador'
      ? 'Todas las comunas'
      : esJefeArea
        ? ('🗺️ ' + ((u.area_ids || []).join(', ') || 'Sin zonas asignadas'))
        : (u.comuna_ids.map(nombreComuna_).join(', ') || 'Sin comunas asignadas');
    card.innerHTML =
      '<div class="uc-top"><div class="uc-name">' + u.nombre_completo + '</div>' +
      '<span class="uc-badge perfil-' + (u.perfil === 'Administrador' || u.perfil === 'GRD' || u.perfil === 'Visor' ? u.perfil : 'Visor') + '">' + u.perfil + '</span></div>' +
      '<div class="uc-email">' + u.email + (u.estado === 'inactivo' ? ' <span class="uc-badge estado-inactivo">Inactivo</span>' : '') + '</div>' +
      '<div class="uc-comunas">📍 ' + comunasTexto + '</div>' +
      '<div class="uc-actions">' +
      '<button class="popup-btn" data-accion="editar">Editar</button>' +
      '<button class="popup-btn" data-accion="clave">Resetear clave</button>' +
      '<button class="popup-btn" data-accion="estado">' + (u.estado === 'activo' ? 'Desactivar' : 'Activar') + '</button>' +
      '</div>';
    card.querySelector('[data-accion="editar"]').addEventListener('click', () => abrirModalUsuario_(u));
    card.querySelector('[data-accion="clave"]').addEventListener('click', () => resetearClaveUsuario_(u.id, u.email));
    card.querySelector('[data-accion="estado"]').addEventListener('click', () => toggleEstadoUsuario_(u.id, u.estado));
    cont.appendChild(card);
  });
}

function escapeHtml_(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalizarBusqueda_(s) {
  return (s || '').toString().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

async function mensajeErrorEdgeFunction_(data, error) {
  if (data && data.error) return data.error;
  if (error) {
    try {
      if (error.context && typeof error.context.json === 'function') {
        const body = await error.context.clone().json();
        if (body && body.error) return body.error;
      }
    } catch (e) { /* el cuerpo no era JSON legible, seguimos al mensaje genérico */ }
    return error.message || 'Error desconocido.';
  }
  return 'Error desconocido.';
}

function mostrarCredencialModal_(titulo, subtitulo, valor) {
  document.getElementById('credencial-modal-title').textContent = titulo;
  document.getElementById('credencial-modal-sub').textContent = subtitulo;
  document.getElementById('credencial-valor').value = valor;
  const btnCopiar = document.getElementById('btn-copiar-credencial');
  btnCopiar.textContent = 'Copiar';
  btnCopiar.classList.remove('copied');
  document.getElementById('credencial-modal-overlay').classList.add('show');
}

function nombreComuna_(id) {
  const c = state.comunas.find(x => x.id === id);
  return c ? c.comuna : id;
}

/* ============ PATRULLEROS (solo Administrador) — CRUD + buscador + import/export Excel ============ */
state.patrulleros = [];
const CAMPOS_PATRULLERO = [
  { k: 'nombre_colaborador', label: 'Nombre', req: true },
  { k: 'correo_colaborador', label: 'Correo' },
  { k: 'cargo', label: 'Cargo' },
  { k: 'telefono', label: 'Teléfono' },
  { k: 'empresa', label: 'Empresa' },
  { k: 'vigente', label: 'Vigente (s/n)' },
  { k: 'sigei', label: 'SIGEI' },
  { k: 'tiene_camioneta', label: 'Tiene camioneta' },
  { k: 'patente_movil', label: 'Patente móvil' },
  { k: 'gerencia', label: 'Gerencia' },
  { k: 'subgerencia', label: 'Subgerencia' },
  { k: 'id_area_trabajo', label: 'ID Área (1-14)', tipo: 'number' },
  { k: 'area_relacionamiento', label: 'Área relacionamiento' },
  { k: 'sector', label: 'Sector' },
  { k: 'jefe_directo', label: 'Jefe directo' },
  { k: 'correo_jefe_directo', label: 'Correo jefe' },
  { k: 'zona_preferencia', label: 'Zona preferencia' },
  { k: 'fecha_inicio_vacaciones', label: 'Inicio vacaciones', tipo: 'date' },
  { k: 'fecha_termino_vacaciones', label: 'Término vacaciones', tipo: 'date' },
];
let editingPatrulleroId = null;

async function abrirPanelPatrulleros_() {
  document.getElementById('patrulleros-panel-overlay').classList.add('show');
  await cargarPatrulleros_();
}

async function cargarPatrulleros_() {
  refrescarAdminSiVisible_();
  const tbody = document.getElementById('patrulleros-tbody');
  tbody.innerHTML = '<tr><td colspan="7" style="padding:14px;color:var(--text-tertiary);">Cargando…</td></tr>';
  const { data, error } = await supabaseClient.from('tb_patrulleros').select('*').order('id_patrullero');
  if (error) { tbody.innerHTML = '<tr><td colspan="7" style="padding:14px;color:#B91C1C;">Error: ' + error.message + '</td></tr>'; return; }
  state.patrulleros = data || [];
  renderPatrulleros_();
}

function renderPatrulleros_() {
  const q = (document.getElementById('patrulleros-search').value || '').trim().toLowerCase();
  const norm = s => (s || '').toString().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const filtrados = !q ? state.patrulleros : state.patrulleros.filter(p =>
    [p.nombre_colaborador, p.correo_colaborador, p.cargo, p.area_relacionamiento, p.gerencia]
      .some(v => norm(v).includes(norm(q))));
  const tbody = document.getElementById('patrulleros-tbody');
  document.getElementById('patrulleros-count').textContent = filtrados.length + ' de ' + state.patrulleros.length;
  if (!filtrados.length) { tbody.innerHTML = '<tr><td colspan="7" style="padding:14px;color:var(--text-tertiary);">Sin resultados.</td></tr>'; return; }
  tbody.innerHTML = '';
  filtrados.forEach(p => {
    const tr = document.createElement('tr');
    tr.style.borderBottom = '1px solid var(--border)';
    tr.innerHTML =
      '<td style="padding:7px 10px;font-weight:600;">' + escapeHtml_(p.id_patrullero) + '</td>' +
      '<td style="padding:7px 10px;">' + escapeHtml_(p.nombre_colaborador || '') + '</td>' +
      '<td style="padding:7px 10px;">' + escapeHtml_(p.cargo || '—') + '</td>' +
      '<td style="padding:7px 10px;">' + escapeHtml_(p.area_relacionamiento || '—') + '</td>' +
      '<td style="padding:7px 10px;">' + escapeHtml_(p.gerencia || '—') + '</td>' +
      '<td style="padding:7px 10px;">' + escapeHtml_(p.tiene_camioneta || '—') + '</td>' +
      '<td style="padding:7px 10px;text-align:right;white-space:nowrap;">' +
        '<button class="popup-btn" data-edit="' + escapeHtml_(p.id_patrullero) + '" style="padding:4px 9px;font-size:11px;">Editar</button> ' +
        '<button class="popup-btn" data-del="' + escapeHtml_(p.id_patrullero) + '" style="padding:4px 9px;font-size:11px;color:#B91C1C;">Eliminar</button>' +
      '</td>';
    tbody.appendChild(tr);
  });
  tbody.querySelectorAll('[data-edit]').forEach(b => b.addEventListener('click', () => abrirFormPatrullero_(b.dataset.edit)));
  tbody.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', () => eliminarPatrullero_(b.dataset.del)));
}

function abrirFormPatrullero_(id) {
  editingPatrulleroId = id || null;
  const p = id ? state.patrulleros.find(x => x.id_patrullero === id) : {};
  document.getElementById('patrullero-form-title').textContent = id ? ('Editar ' + id) : 'Nuevo patrullero';
  const body = document.getElementById('patrullero-form-body');
  body.innerHTML = CAMPOS_PATRULLERO.map(c => {
    const val = p && p[c.k] != null ? String(p[c.k]) : '';
    const tipo = c.tipo || 'text';
    return '<div' + (c.k === 'nombre_colaborador' ? ' style="grid-column:1/-1;"' : '') + '>' +
      '<label style="font-size:10.5px;color:var(--text-tertiary);display:block;margin-bottom:3px;">' + c.label + (c.req ? ' *' : '') + '</label>' +
      '<input data-campo="' + c.k + '" type="' + tipo + '" value="' + escapeHtml_(val) + '" style="width:100%;padding:7px 9px;border:1px solid var(--border);border-radius:7px;font-size:12px;">' +
      '</div>';
  }).join('');
  document.getElementById('patrullero-form-overlay').classList.add('show');
}

async function guardarPatrullero_() {
  const inputs = document.querySelectorAll('#patrullero-form-body [data-campo]');
  const datos = {};
  inputs.forEach(i => {
    let v = i.value.trim();
    if (v === '') { datos[i.dataset.campo] = null; return; }
    datos[i.dataset.campo] = (i.dataset.campo === 'id_area_trabajo') ? (parseInt(v, 10) || null) : v;
  });
  if (!datos.nombre_colaborador) { mostrarToast_('El nombre es obligatorio.'); return; }
  try {
    if (editingPatrulleroId) {
      const { error } = await supabaseClient.rpc('actualizar_patrullero', { p_id: editingPatrulleroId, p_datos: datos });
      if (error) throw error;
      mostrarToast_('Patrullero actualizado.');
    } else {
      const { error } = await supabaseClient.rpc('crear_patrullero', { p_datos: datos });
      if (error) throw error;
      mostrarToast_('Patrullero creado.');
    }
    document.getElementById('patrullero-form-overlay').classList.remove('show');
    await cargarPatrulleros_();
  } catch (e) { mostrarToast_('Error: ' + e.message); }
}

async function eliminarPatrullero_(id) {
  if (!confirm('¿Eliminar al patrullero ' + id + '? Esto también quita sus asignaciones.')) return;
  const { error } = await supabaseClient.rpc('eliminar_patrullero', { p_id: id });
  if (error) { mostrarToast_('Error: ' + error.message); return; }
  mostrarToast_('Patrullero eliminado.');
  await cargarPatrulleros_();
}

async function exportarPatrulleros_() {
  mostrarToast_('Generando Excel…');
  const filtro = (document.getElementById('patrulleros-search').value || '').trim();
  const { data, error } = await supabaseClient.functions.invoke('patrulleros-excel', { body: { action: 'export', filtro } });
  if (error || !data || !data.ok) { mostrarToast_('Error al exportar: ' + ((error && error.message) || (data && data.error) || 'desconocido')); return; }
  const bin = atob(data.fileBase64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'patrulleros_' + new Date().toISOString().slice(0, 10) + '.xlsx';
  a.click(); URL.revokeObjectURL(url);
  mostrarToast_('Exportadas ' + data.count + ' filas.');
}

async function importarPatrulleros_(file) {
  if (!confirm('La importación REEMPLAZA todos los patrulleros (se hace un respaldo automático antes). ¿Continuar?')) return;
  mostrarToast_('Subiendo archivo…');
  try {
    // 1) Subir el .xlsx al bucket privado (evita el límite de payload del invoke)
    const ruta = 'temp/' + Date.now() + '_' + file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const { error: upErr } = await supabaseClient.storage
      .from('imports-patrulleros').upload(ruta, file, { upsert: false, contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    if (upErr) { mostrarToast_('Error al subir: ' + upErr.message); return; }

    // 2) Pedir a la edge function que lo procese (solo pasa la ruta)
    mostrarToast_('Procesando…');
    const { data, error } = await supabaseClient.functions.invoke('patrulleros-excel', { body: { action: 'import', filePath: ruta } });
    if (error || !data || !data.ok) { mostrarToast_('Error al importar: ' + ((error && error.message) || (data && data.error) || 'desconocido')); return; }
    mostrarToast_('Importadas ' + data.insertadas + ' filas (respaldo hecho).');
    await cargarPatrulleros_();
  } catch (e) { mostrarToast_('Error: ' + e.message); }
}

/* ============ MODO ASIGNACIÓN DE RUTAS (Etapa 4, solo Administrador) ============
 * Asigna patrulleros a rutas por fecha (1 a muchos). Rutas asignadas = destello
 * verde; no asignadas = gris atenuado. Datos en tb_carga_patrullaje_por_dia. */
state.asignacionModo = false;
state.asignacionRutas = [];
state.asigRutaActual = null;
state.asigSeleccion = {};

function hoyISO_() { return new Date().toISOString().slice(0, 10); }

async function toggleModoAsignacion_(on) {
  state.asignacionModo = on;
  const barra = document.getElementById('asignacion-barra');
  if (on) {
    if (!document.getElementById('asignacion-fecha').value) document.getElementById('asignacion-fecha').value = hoyISO_();
    barra.style.display = 'flex';
    asignacionLayer.addTo(map);
    if (!(state.patrulleros && state.patrulleros.length)) {
      const { data } = await supabaseClient.from('tb_patrulleros').select('*').order('id_patrullero');
      state.patrulleros = data || [];
    }
    await cargarAsignacionRutas_();
  } else {
    barra.style.display = 'none';
    map.removeLayer(asignacionLayer);
    cerrarPanelAsig_();
  }
}

async function cargarAsignacionRutas_() {
  const fecha = document.getElementById('asignacion-fecha').value || hoyISO_();
  const { data, error } = await supabaseClient
    .from('v_rutas_asignacion')
    .select('id_ruta, nombre_ruta, subgerencia, area, id_area, comuna, zona_alerta, km, geometry, fecha_patrullaje, n_patrulleros')
    .or('fecha_patrullaje.eq.' + fecha + ',fecha_patrullaje.is.null');
  if (error) { mostrarToast_('Error al cargar rutas: ' + error.message); return; }

  const porRuta = {};
  (data || []).forEach(r => {
    if (!porRuta[r.id_ruta]) porRuta[r.id_ruta] = { ...r, n: 0 };
    if (r.fecha_patrullaje === fecha && r.n_patrulleros > 0) porRuta[r.id_ruta].n = r.n_patrulleros;
  });
  state.asignacionRutas = Object.values(porRuta);
  dibujarAsignacionRutas_();

  const asignadas = state.asignacionRutas.filter(r => r.n > 0).length;
  document.getElementById('asignacion-resumen').textContent = asignadas + ' de ' + state.asignacionRutas.length + ' rutas asignadas';
}

function dibujarAsignacionRutas_() {
  asignacionLayer.clearLayers();
  window.asigRutaCapas = {}; // id_ruta -> capa (para resaltar la seleccionada)
  state.asignacionRutas.forEach(r => {
    if (!r.geometry) return;
    const asignada = r.n > 0;
    const capa = L.geoJSON(r.geometry, {
      style: {
        color: asignada ? '#16A34A' : '#94A3B8',
        weight: asignada ? 4 : 2.5,
        opacity: asignada ? 0.95 : 0.5,
        className: asignada ? 'ruta-asignada-glow' : '',
      },
      onEachFeature: (f, layer) => {
        layer.on('click', () => abrirPanelAsigRuta_(r));
      },
    });
    window.asigRutaCapas[r.id_ruta] = capa;
    capa.addTo(asignacionLayer);
  });
  // Reaplicar el neón si hay una ruta abierta en el panel
  if (state.asigRutaActual) resaltarRutaSeleccionada_(state.asigRutaActual.id_ruta);
}

// Aplica el neón a la ruta seleccionada y lo quita de las demás.
function resaltarRutaSeleccionada_(idRuta) {
  Object.keys(window.asigRutaCapas || {}).forEach(id => {
    const capa = window.asigRutaCapas[id];
    capa.eachLayer(s => {
      const el = s.getElement && s.getElement();
      if (!el) return;
      if (id === idRuta) el.classList.add('ruta-seleccionada-neon');
      else el.classList.remove('ruta-seleccionada-neon');
    });
    if (id === idRuta) capa.eachLayer(s => s.bringToFront && s.bringToFront());
  });
}
function quitarResaltadoRutas_() {
  Object.keys(window.asigRutaCapas || {}).forEach(id => {
    window.asigRutaCapas[id].eachLayer(s => { const el = s.getElement && s.getElement(); if (el) el.classList.remove('ruta-seleccionada-neon'); });
  });
}

async function abrirPanelAsigRuta_(ruta) {
  state.asigRutaActual = ruta;
  resaltarRutaSeleccionada_(ruta.id_ruta); // neón en la ruta seleccionada
  document.getElementById('asig-ruta-nombre').textContent = ruta.nombre_ruta || ruta.id_ruta;
  document.getElementById('asig-ruta-meta').textContent =
    [ruta.subgerencia, ruta.area, ruta.comuna].filter(Boolean).join(' · ') + (ruta.km ? ' · ' + Number(ruta.km).toFixed(1) + ' km' : '');
  document.getElementById('asig-fecha').value = document.getElementById('asignacion-fecha').value || hoyISO_();
  document.getElementById('asig-buscador').value = '';
  document.getElementById('asignacion-panel').style.display = 'flex';
  await cargarFechasPreviasRuta_(ruta.id_ruta);
  await cargarSeleccionActual_();
}

async function cargarFechasPreviasRuta_(idRuta) {
  const cont = document.getElementById('asig-fechas-previas');
  cont.innerHTML = '';
  const { data } = await supabaseClient.rpc('fechas_asignacion_ruta', { p_id_ruta: idRuta });
  (data || []).forEach(f => {
    const b = document.createElement('button');
    b.className = 'popup-btn'; b.style.cssText = 'padding:3px 8px;font-size:10.5px;';
    b.textContent = f.fecha_patrullaje + ' (' + f.n_patrulleros + ')';
    b.addEventListener('click', () => { document.getElementById('asig-fecha').value = f.fecha_patrullaje; cargarSeleccionActual_(); });
    cont.appendChild(b);
  });
}

async function cargarSeleccionActual_() {
  const idRuta = state.asigRutaActual.id_ruta;
  const fecha = document.getElementById('asig-fecha').value;
  state.asigSeleccion = {};
  const { data } = await supabaseClient.rpc('asignados_ruta', { p_id_ruta: idRuta, p_fecha: fecha });
  (data || []).forEach(a => { state.asigSeleccion[a.id_patrullero] = { asignar_camioneta: a.asignar_camioneta || '' }; });
  renderListaAsig_();
}

function renderListaAsig_() {
  const q = (document.getElementById('asig-buscador').value || '').trim().toLowerCase();
  const norm = s => (s || '').toString().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const idAreaRuta = state.asigRutaActual.id_area;
  const lista = state.patrulleros || [];
  let sugeridos;
  if (q) sugeridos = lista.filter(p => [p.nombre_colaborador, p.correo_colaborador, p.cargo].some(v => norm(v).includes(norm(q))));
  else sugeridos = lista.filter(p => p.id_area_trabajo === idAreaRuta);

  const seleccionadosIds = Object.keys(state.asigSeleccion);
  const yaEnLista = new Set(sugeridos.map(p => p.id_patrullero));
  const selExtra = lista.filter(p => seleccionadosIds.includes(p.id_patrullero) && !yaEnLista.has(p.id_patrullero));

  const cont = document.getElementById('asig-lista');
  const filas = [...selExtra, ...sugeridos];
  if (!filas.length) { cont.innerHTML = '<div style="padding:14px;color:var(--text-tertiary);font-size:12px;">' + (q ? 'Sin resultados.' : 'No hay patrulleros sugeridos para esta área. Usa el buscador.') + '</div>'; return; }
  cont.innerHTML = '';
  filas.forEach(p => {
    const sel = !!state.asigSeleccion[p.id_patrullero];
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:8px;padding:7px 0;border-bottom:1px solid var(--border);';
    row.innerHTML =
      '<input type="checkbox" data-pat="' + escapeHtml_(p.id_patrullero) + '"' + (sel ? ' checked' : '') + ' style="width:16px;height:16px;">' +
      '<div style="flex:1;min-width:0;"><div style="font-size:12px;font-weight:600;">' + escapeHtml_(p.nombre_colaborador || p.id_patrullero) + '</div>' +
      '<div style="font-size:10.5px;color:var(--text-tertiary);">' + escapeHtml_(p.cargo || '') + (p.area_relacionamiento ? ' · ' + escapeHtml_(p.area_relacionamiento) : '') + '</div></div>' +
      '<label style="font-size:10px;color:var(--text-secondary);display:flex;align-items:center;gap:3px;"><input type="checkbox" data-cam="' + escapeHtml_(p.id_patrullero) + '"' + (sel && state.asigSeleccion[p.id_patrullero].asignar_camioneta === 'SI' ? ' checked' : '') + '>🚐</label>';
    cont.appendChild(row);
  });
  cont.querySelectorAll('[data-pat]').forEach(chk => chk.addEventListener('change', () => {
    const id = chk.dataset.pat;
    if (chk.checked) state.asigSeleccion[id] = state.asigSeleccion[id] || { asignar_camioneta: '' };
    else delete state.asigSeleccion[id];
  }));
  cont.querySelectorAll('[data-cam]').forEach(chk => chk.addEventListener('change', () => {
    const id = chk.dataset.cam;
    if (!state.asigSeleccion[id]) state.asigSeleccion[id] = { asignar_camioneta: '' };
    state.asigSeleccion[id].asignar_camioneta = chk.checked ? 'SI' : '';
  }));
}

async function guardarAsigRuta_() {
  const idRuta = state.asigRutaActual.id_ruta;
  const fecha = document.getElementById('asig-fecha').value;
  if (!fecha) { mostrarToast_('Elige una fecha.'); return; }
  const patrulleros = Object.keys(state.asigSeleccion).map(id => ({ id_patrullero: id, asignar_camioneta: state.asigSeleccion[id].asignar_camioneta || null }));
  const { data, error } = await supabaseClient.rpc('asignar_patrulleros_ruta', { p_id_ruta: idRuta, p_fecha: fecha, p_patrulleros: patrulleros });
  if (error) { mostrarToast_('Error: ' + error.message); return; }
  mostrarToast_(data + ' patrullero(s) asignado(s).');
  cerrarPanelAsig_();
  await cargarAsignacionRutas_();
}

async function cancelarAsigRuta_() {
  const idRuta = state.asigRutaActual.id_ruta;
  const fecha = document.getElementById('asig-fecha').value;
  if (!confirm('¿Cancelar toda la asignación de esta ruta para el ' + fecha + '?')) return;
  const { error } = await supabaseClient.rpc('cancelar_asignacion_ruta', { p_id_ruta: idRuta, p_fecha: fecha });
  if (error) { mostrarToast_('Error: ' + error.message); return; }
  mostrarToast_('Asignación cancelada.');
  cerrarPanelAsig_();
  await cargarAsignacionRutas_();
}

function cerrarPanelAsig_() {
  document.getElementById('asignacion-panel').style.display = 'none';
  state.asigRutaActual = null;
  quitarResaltadoRutas_();
}

