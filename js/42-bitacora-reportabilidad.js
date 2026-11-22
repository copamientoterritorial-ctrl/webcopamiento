/* ============ 📋 BITÁCORA (REPORTABILIDAD) — menú propio (22-11-2026, SQL 183 / 187 / 188 / 192 / 193) ============
 * Reportabilidad de la App Bitácora (/app-bitacora/app.html) en 4 vistas, con filtros comunes (fechas, área, tipo de recurso, búsqueda):
 *   bitacora      📋 Aperturas    — tabla de aperturas con la brigada; ⬇️ Excel 2 hojas (Aperturas / Personal)
 *   bitacoraact   🧩 Actividades  — tabla de actividades (clasificación › grupo › actividad, horas, fundo, GMS, fotos); ⬇️ Excel
 *   bitacoramapa  🗺️ Mapa         — pinchos por clasificación, ubicación de las aperturas y ruta asignada del recurso elegido (SQL 192)
 *   bitacoraind   📊 Indicadores  — % del turno registrado, horas por clasificación, aperturas faltantes (de turno sin apertura), por área y por recurso; ⬇️ Excel
 * Ven: Administrador (todas las áreas) y Jefe de Área / Subgerente / GRT (sus áreas; lo decide el RLS de bit_jornada / bit_registro_actividad).
 * Lee v_bit_jornadas, v_bit_actividades (clasificación del SQL 193; sin él se agrupa por grupo), bit_mis_recursos() (días de turno ±7/14)
 * y bit_ruta_recurso(). Panel único #bitacora-panel (`abrirBitacoraWeb_(vista)`, `cargarBitacoraWeb_`). */
state.bt = state.bt || { vista: 'bitacora', desde: '', hasta: '', area: '', tipo: '', estado: '', clasif: '', grupo: '', recurso: '', q: '',
  filas: [], acts: [], recursos: [], kls: [], grupos: [], abierta: '', cargado: false, sinClasif: false };
function puedeBitacoraWeb_() { return esAdminOJefe_(); }
const BT_VISTAS = [['bitacora', '📋', 'Aperturas'], ['bitacoraact', '🧩', 'Actividades'], ['bitacoramapa', '🗺️', 'Mapa'], ['bitacoraind', '📊', 'Indicadores']];

const BT_TIPOS = { BMP: '🚒 Brigada Multipropósito', BD: '🚓 Brigada Disuasiva', VC: '🛻 Vigía Camioneta', VM: '🏍️ Vigía Motorizado', VI: '🚶 Vigía Infantería', VMON: '🐎 Vigía Montado' };
const btTipoTxt_ = c => BT_TIPOS[c] ? BT_TIPOS[c].replace(/^\S+\s/, '') : (c || '');
function btDiaISO_(n) { const d = new Date(); d.setDate(d.getDate() + n); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function btFecha_(iso) { if (!iso) return ''; const p = String(iso).slice(0, 10).split('-'); return p[2] + '-' + p[1] + '-' + p[0]; }
function btHora_(ts) { return ts ? new Date(ts).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }) : ''; }
function btDur_(min) { min = Math.max(0, Math.round(Number(min) || 0)); const h = Math.floor(min / 60), m = min % 60; return h ? h + ' h' + (m ? ' ' + m + ' min' : '') : m + ' min'; }
const btHoras_ = min => Math.round((Number(min) || 0) / 6) / 10;
/** Estado de la apertura para filtrar y pintar: abierta · cerrada · otro (día libre, licencia…). */
function btEstado_(j) { return !j.en_servicio ? 'otro' : (j.cerrada ? 'cerrada' : 'abierta'); }
const BT_ESTADOS = { abierta: { t: '🟢 Abierta', c: '#16A34A' }, cerrada: { t: '✅ Cerrada', c: '#2563EB' }, otro: { t: 'Sin servicio', c: '#7C3AED' } };
function btReemplazantes_(j) { return (j.dotacion || []).filter(p => p.es_reemplazo); }
function btJefe_(j) { return (j.dotacion || []).find(p => p.es_jefe) || null; }
/** Clasificación de una actividad (SQL 193); sin el 193, el grupo hace de clasificación. */
function btClasif_(a) {
  if (a.clasificacion_codigo) return { codigo: a.clasificacion_codigo, nombre: a.clasificacion || a.clasificacion_codigo, emoji: a.clasificacion_emoji || '', color: a.clasificacion_color || '#475569' };
  const i = state.bt.grupos.findIndex(g => g.codigo === a.grupo_codigo);
  const col = ['#2563EB', '#16A34A', '#D97706', '#7C3AED', '#DC2626', '#0891B2', '#65A30D', '#DB2777', '#B91C1C', '#475569'];
  return { codigo: a.grupo_codigo || 'OTRA', nombre: a.grupo || 'Otra', emoji: a.grupo_emoji || '', color: col[(i < 0 ? 9 : i) % col.length] };
}

// ── Panel y barra de filtros ────────────────────────────────────────────────────────────────────────────
async function abrirBitacoraWeb_(vista) {
  const s = state.bt;
  if (vista) s.vista = vista;
  if (!s.desde) { s.desde = btDiaISO_(-6); s.hasta = btDiaISO_(0); }
  const p = document.getElementById('bitacora-panel'); if (!p) return;
  if (!p.dataset.montado) {
    p.dataset.montado = '1';
    p.innerHTML = '<div class="pat-toolbar"><div class="pat-toolbar-left"><strong>📋 Bitácora</strong>' +
        '<div class="sg-vistas" id="bt-vistas">' + BT_VISTAS.map(v => '<button data-bt-vista="' + v[0] + '">' + v[1] + ' ' + v[2] + '</button>').join('') + '</div>' +
        '<label class="bt-f">Desde <input type="date" id="bt-desde" class="admin-search"></label>' +
        '<label class="bt-f">Hasta <input type="date" id="bt-hasta" class="admin-search"></label>' +
        '<select id="bt-area" class="admin-search" title="Área"></select>' +
        '<select id="bt-tipo" class="admin-search" title="Tipo de recurso"></select>' +
        '<select id="bt-estado" class="admin-search" title="Estado de la apertura"><option value="">Todos los estados</option>' + Object.keys(BT_ESTADOS).map(k => '<option value="' + k + '">' + BT_ESTADOS[k].t + '</option>').join('') + '</select>' +
        '<select id="bt-clasif" class="admin-search" title="Clasificación"></select>' +
        '<select id="bt-grupo" class="admin-search" title="Grupo de actividad"></select>' +
        '<select id="bt-recurso" class="admin-search" title="Recurso (muestra su ruta asignada)"></select>' +
        '<input type="search" id="bt-q" class="admin-search" placeholder="🔎 Recurso, empresa, jefe, fundo, actividad…" style="min-width:200px;"></div>' +
      '<div class="pat-toolbar-right" style="display:flex;gap:8px;align-items:center;"><span class="turnos-estado" id="bt-estado-txt">—</span>' +
        '<button class="turnos-btn" id="bt-recargar" title="Volver a leer">🔄</button><button class="turnos-btn" id="bt-excel" title="Descargar a Excel lo filtrado">⬇️ Excel</button></div></div>' +
      '<div id="bt-kpis" class="bt-kpis"></div><div class="gr-cuerpo" id="bt-cuerpo" style="overflow:auto;"><div class="tb-vacio">Cargando…</div></div>';
    const $b = id => document.getElementById(id);
    $b('bt-desde').value = s.desde; $b('bt-hasta').value = s.hasta;
    $b('bt-desde').onchange = e => { s.desde = e.target.value || btDiaISO_(-6); if (s.hasta < s.desde) { s.hasta = s.desde; $b('bt-hasta').value = s.hasta; } cargarBitacoraWeb_(); };
    $b('bt-hasta').onchange = e => { s.hasta = e.target.value || btDiaISO_(0); if (s.hasta < s.desde) { s.desde = s.hasta; $b('bt-desde').value = s.desde; } cargarBitacoraWeb_(); };
    [['bt-area', 'area'], ['bt-tipo', 'tipo'], ['bt-estado', 'estado'], ['bt-clasif', 'clasif'], ['bt-grupo', 'grupo'], ['bt-recurso', 'recurso']].forEach(([id, k]) => {
      $b(id).onchange = e => { s[k] = e.target.value; if (k === 'clasif') s.grupo = ''; renderBitacoraWeb_(); };
    });
    let esp = null;
    $b('bt-q').oninput = e => { clearTimeout(esp); esp = setTimeout(() => { s.q = e.target.value; renderBitacoraWeb_(); }, 250); };
    $b('bt-recargar').onclick = () => cargarBitacoraWeb_();
    $b('bt-excel').onclick = () => descargarBitacoraExcel_();
    $b('bt-vistas').onclick = e => { const b = e.target.closest('[data-bt-vista]'); if (b) mostrarVista_(b.dataset.btVista); };
    $b('bt-cuerpo').addEventListener('click', e => {
      const f = e.target.closest('[data-bt-fila]'); if (!f || e.target.closest('a')) return;
      s.abierta = s.abierta === f.dataset.btFila ? '' : f.dataset.btFila; renderBitacoraWeb_();
    });
  }
  document.querySelectorAll('#bt-vistas [data-bt-vista]').forEach(b => b.classList.toggle('on', b.dataset.btVista === s.vista));
  if (!s.cargado) await cargarBitacoraWeb_(); else renderBitacoraWeb_();
}

async function btLeerTodo_(tabla, armar) {
  const out = [];
  for (let d = 0; ; d += 1000) {
    const { data, error } = await armar(supabaseClient.from(tabla).select('*')).range(d, d + 999);
    if (error) throw error;
    out.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return out;
}
async function cargarBitacoraWeb_() {
  const s = state.bt, est = document.getElementById('bt-estado-txt'), cu = document.getElementById('bt-cuerpo');
  if (est) est.textContent = 'Cargando…';
  try {
    const [filas, acts, gr, kl, rec] = await Promise.all([
      btLeerTodo_('v_bit_jornadas', q => q.gte('fecha_operativa', s.desde).lte('fecha_operativa', s.hasta).order('fecha_operativa', { ascending: false }).order('area').order('clave_radial')),
      btLeerTodo_('v_bit_actividades', q => q.gte('fecha_operativa', s.desde).lte('fecha_operativa', s.hasta).order('inicio', { ascending: false })).catch(() => []),
      supabaseClient.from('bit_grupo_actividad').select('*').order('orden'),
      supabaseClient.from('bit_clasificacion').select('*').eq('activo', true).order('orden'),
      s.recursos.length ? Promise.resolve({ data: s.recursos }) : supabaseClient.rpc('bit_mis_recursos')]);
    s.filas = filas; s.acts = acts; s.grupos = gr.error ? [] : (gr.data || []);
    s.kls = kl.error ? [] : (kl.data || []); s.sinClasif = !!kl.error;
    s.recursos = rec.error ? [] : (rec.data || []);
    s.cargado = true;
  } catch (e) {
    s.filas = []; s.acts = []; s.cargado = false;
    const m = (e && e.message) || String(e);
    if (cu) cu.innerHTML = '<div class="tb-vacio">' + escapeHtml_(/v_bit_jornadas|does not exist|schema cache/i.test(m) ? 'La base aún no tiene la Bitácora (SQL 183).' : 'No se pudieron leer los datos: ' + m) + '</div>';
    if (est) est.textContent = '⚠️ Error';
    return;
  }
  renderBitacoraWeb_();
}

function btOpciones_(sel, valores, todos, actual) {
  const el = document.getElementById(sel); if (!el) return;
  el.innerHTML = '<option value="">' + todos + '</option>' + valores.map(v => '<option value="' + escapeHtml_(v[0]) + '"' + (v[0] === actual ? ' selected' : '') + '>' + escapeHtml_(v[1]) + '</option>').join('');
}
const btEnArea_ = (s, area) => !s.area || areaClave_(area) === areaClave_(s.area);
// op.todo: ignora los filtros que la vista no muestra (Indicadores: sin recurso, estado, clasificación ni grupo)
function btFiltradas_(op) {
  const s = state.bt, q = normalizarBusqueda_(s.q || ''), todo = !!(op && op.todo);
  return s.filas.filter(j => btEnArea_(s, j.area) && (!s.tipo || j.tipo_codigo === s.tipo) && (todo || !s.recurso || j.recurso_id === s.recurso) &&
    (todo || !s.estado || btEstado_(j) === s.estado) &&
    (!q || normalizarBusqueda_([j.clave_radial, j.codigo_ref, j.empresa, j.area, j.jefe_nombre, j.fundo_nombre, j.cod_fundo, j.patente, j.observacion,
      (j.dotacion || []).map(p => p.nombre + ' ' + (p.rut || '')).join(' ')].join(' ')).includes(q)));
}
// Actividades filtradas (con los datos del recurso tomados de su apertura)
function btActsFiltradas_(op) {
  const s = state.bt, q = normalizarBusqueda_(s.q || ''), jor = new Map(s.filas.map(j => [j.id, j])), todo = !!(op && op.todo);
  return s.acts.map(a => Object.assign({}, a, { _j: jor.get(a.jornada_id) || {} })).filter(a => {
    const j = a._j;
    return btEnArea_(s, j.area) && (!s.tipo || j.tipo_codigo === s.tipo) && (todo || !s.recurso || a.recurso_id === s.recurso) &&
      (todo || !s.clasif || btClasif_(a).codigo === s.clasif) && (todo || !s.grupo || a.grupo_codigo === s.grupo) &&
      (!q || normalizarBusqueda_([j.clave_radial, j.codigo_ref, j.empresa, j.area, a.actividad, a.grupo, a.clasificacion, a.fundo_nombre, a.cod_fundo, a.observacion].join(' ')).includes(q));
  });
}
const btKpi_ = (n, t, c) => '<div class="bt-kpi" style="--c:' + c + '"><b>' + n + '</b><span>' + t + '</span></div>';

function renderBitacoraWeb_() {
  const s = state.bt, cu = document.getElementById('bt-cuerpo'); if (!cu) return;
  const v = s.vista;
  // Filtros visibles por vista
  const ver = (id, on) => { const el = document.getElementById(id); if (el) el.style.display = on ? '' : 'none'; };
  ver('bt-estado', v === 'bitacora'); ver('bt-clasif', v === 'bitacoraact' || v === 'bitacoramapa'); ver('bt-grupo', v === 'bitacoraact' || v === 'bitacoramapa');
  ver('bt-recurso', v !== 'bitacoraind'); ver('bt-excel', v !== 'bitacoramapa');
  const areas = [...new Set(s.filas.map(j => j.area).concat(s.recursos.map(r => r.area)).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
  if (s.area && !areas.some(a => areaClave_(a) === areaClave_(s.area))) s.area = '';
  btOpciones_('bt-area', areas.map(a => [a, a]), 'Todas las áreas', s.area);
  const tipos = [...new Set(s.filas.map(j => j.tipo_codigo).concat(s.recursos.map(r => r.tipo_codigo)).filter(Boolean))];
  btOpciones_('bt-tipo', tipos.map(t => [t, BT_TIPOS[t] || t]), 'Todos los tipos', s.tipo);
  // Clasificación (SQL 193) y grupo; sin el 193 el primer filtro es el grupo y el segundo se oculta
  const clasifs = s.kls.length ? s.kls.map(k => [k.codigo, (k.emoji || '') + ' ' + k.nombre]) : s.grupos.map(g => [g.codigo, (g.emoji || '') + ' ' + g.nombre]);
  if (s.clasif && !clasifs.some(x => x[0] === s.clasif)) s.clasif = '';
  btOpciones_('bt-clasif', clasifs, s.kls.length ? 'Todas las clasificaciones' : 'Todos los grupos', s.clasif);
  const grupos = s.kls.length ? s.grupos.filter(g => !s.clasif || g.clasificacion_codigo === s.clasif) : [];
  if (s.grupo && !grupos.some(g => g.codigo === s.grupo)) s.grupo = '';
  btOpciones_('bt-grupo', grupos.map(g => [g.codigo, (g.emoji || '') + ' ' + g.nombre]), 'Todos los grupos', s.grupo);
  ver('bt-grupo', (v === 'bitacoraact' || v === 'bitacoramapa') && s.kls.length > 0);
  const recs = s.recursos.filter(r => btEnArea_(s, r.area) && (!s.tipo || r.tipo_codigo === s.tipo))
    .sort((a, b) => String(a.area).localeCompare(String(b.area), 'es') || String(a.clave_radial).localeCompare(String(b.clave_radial), 'es', { numeric: true }));
  if (s.recurso && !recs.some(r => r.id === s.recurso)) s.recurso = '';
  btOpciones_('bt-recurso', recs.map(r => [r.id, (r.clave_radial || r.codigo_ref) + ' · ' + (r.area || '')]), 'Todos los recursos', s.recurso);
  document.querySelectorAll('#bt-vistas [data-bt-vista]').forEach(b => b.classList.toggle('on', b.dataset.btVista === v));
  if (v === 'bitacoraact') return renderBtActividades_(cu);
  if (v === 'bitacoramapa') return renderBtMapa_(cu);
  if (v === 'bitacoraind') return renderBtIndicadores_(cu);
  return renderBtAperturas_(cu);
}

// ── 📋 Aperturas ────────────────────────────────────────────────────────────────────────────────────────
function renderBtAperturas_(cu) {
  const s = state.bt, l = btFiltradas_();
  const serv = l.filter(j => j.en_servicio), conAv = serv.filter(j => j.avance_pct != null);
  document.getElementById('bt-kpis').innerHTML =
    btKpi_(l.length, 'Aperturas', '#0F766E') + btKpi_(serv.length, 'En servicio', '#15803D') +
    btKpi_(serv.filter(j => !j.cerrada).length, 'Abiertas', '#16A34A') + btKpi_(serv.filter(j => j.cerrada).length, 'Cerradas', '#2563EB') +
    btKpi_(conAv.length ? Math.round(conAv.reduce((a, j) => a + j.avance_pct, 0) / conAv.length) + ' %' : '—', 'Avance promedio del turno', '#D97706') +
    btKpi_(serv.filter(j => j.avance_pct >= 100).length, 'Turnos al 100 %', '#16A34A') +
    btKpi_(serv.reduce((a, j) => a + (j.dotacion_n || 0), 0), 'Personas (fuerza)', '#7C3AED') +
    btKpi_(serv.reduce((a, j) => a + btReemplazantes_(j).length, 0), 'Reemplazantes', '#B45309');
  const est = document.getElementById('bt-estado-txt');
  if (est) est.textContent = l.length + ' de ' + s.filas.length + ' aperturas · ' + btFecha_(s.desde) + ' → ' + btFecha_(s.hasta);
  if (!l.length) { cu.innerHTML = '<div class="tb-vacio">' + (s.filas.length ? 'Ninguna apertura coincide con los filtros.' : 'No hay aperturas registradas en estas fechas.') + '</div>'; return; }
  const th = ['Fecha', 'Área', 'Recurso', 'Tipo', 'Empresa', 'Estado', 'Turno', 'Actividad general', 'Avance', 'Actividades', 'Fuerza', 'Jefe', 'Reempl.', 'Patente', 'Km', 'Fundo', 'Coordenadas', 'Abrió', 'Cierre'];
  const filas = l.map(j => {
    const e = BT_ESTADOS[btEstado_(j)], jefe = btJefe_(j), ree = btReemplazantes_(j), av = j.avance_pct;
    const avHtml = j.en_servicio && av != null ? '<div class="bt-av"><i style="width:' + av + '%;background:' + (av >= 100 ? '#16A34A' : av >= 50 ? '#D97706' : '#DC2626') + '"></i></div><small>' + av + ' %</small>' : '';
    let h = '<tr data-bt-fila="' + escapeHtml_(j.id) + '" class="bt-fila' + (s.abierta === j.id ? ' on' : '') + '">' +
      '<td class="gr-fijo gr-ro"><b>' + btFecha_(j.fecha_operativa) + '</b></td><td class="gr-ro">' + escapeHtml_(j.area || '') + '</td>' +
      '<td class="gr-ro"><b>' + escapeHtml_(j.clave_radial || '') + '</b><br><small>' + escapeHtml_(j.codigo_ref || '') + '</small></td>' +
      '<td class="gr-ro">' + escapeHtml_(BT_TIPOS[j.tipo_codigo] || j.tipo_recurso || '') + '</td><td class="gr-ro">' + escapeHtml_(j.empresa || '') + '</td>' +
      '<td class="gr-ro"><span class="bt-chip" style="--c:' + e.c + '">' + escapeHtml_(j.en_servicio ? e.t : (j.estado_emoji || '') + ' ' + (j.estado || '')) + '</span></td>' +
      '<td class="gr-ro">' + escapeHtml_(j.turno || '') + (j.tipo_jornada ? '<br><small>' + escapeHtml_(j.tipo_jornada) + '</small>' : '') + '</td>' +
      '<td class="gr-ro">' + escapeHtml_(j.foco || '') + '</td><td class="gr-ro" style="min-width:110px;">' + avHtml + '</td>' +
      '<td class="gr-ro">' + (j.en_servicio ? (j.actividades_n || 0) + ' · ' + btDur_(j.actividades_min) : '') + '</td>' +
      '<td class="gr-ro" style="text-align:center;">' + (j.en_servicio ? '👥 ' + (j.dotacion_n || 0) : '') + '</td>' +
      '<td class="gr-ro">' + escapeHtml_(jefe ? jefe.nombre : (j.jefe_nombre || '')) + (j.jefe_telefono ? '<br><small>' + escapeHtml_(j.jefe_telefono) + '</small>' : '') + '</td>' +
      '<td class="gr-ro" style="text-align:center;">' + (ree.length ? '<span class="bt-chip" style="--c:#B45309">' + ree.length + '</span>' : '') + '</td>' +
      '<td class="gr-ro">' + escapeHtml_(j.patente || '') + (j.cambio_movil ? '<br><small>cambio de móvil</small>' : '') + '</td>' +
      '<td class="gr-ro">' + (j.km_inicio != null ? j.km_inicio + (j.km_fin != null ? ' → ' + j.km_fin : '') : '') + '</td>' +
      '<td class="gr-ro">' + escapeHtml_(j.fundo_nombre || '') + (j.cod_fundo ? ' <small>(' + escapeHtml_(j.cod_fundo) + ')</small>' : '') + '</td>' +
      '<td class="gr-ro"><small>' + (j.lat != null ? escapeHtml_(coordGms_(j.lat, j.lng)) : '') + '</small></td>' +
      '<td class="gr-ro">' + escapeHtml_(j.creado_por_nombre || '') + '<br><small>' + btHora_(j.creado_dispositivo_en || j.creado_en) + '</small></td>' +
      '<td class="gr-ro">' + (j.cierre_en ? '🔒 ' + btHora_(j.cierre_en) + '<br><small>manual</small>' : j.cerrada ? '<small>automático</small>' : (j.en_servicio ? '<small>abierta</small>' : '')) + '</td></tr>';
    if (s.abierta === j.id) {
      const acts = s.acts.filter(a => a.jornada_id === j.id).sort((x, y) => String(x.inicio).localeCompare(String(y.inicio)));
      h += '<tr class="bt-det"><td colspan="' + th.length + '"><div class="bt-det-in"><b>👥 Dotación (' + (j.dotacion || []).length + ')</b>' +
        ((j.dotacion || []).length ? '<table class="bt-dot"><tr><th>Nombre</th><th>RUT</th><th>Teléfono</th><th>Cargo</th><th></th></tr>' +
          j.dotacion.map(p => '<tr><td>' + (p.es_jefe ? '⭐ ' : '') + escapeHtml_(p.nombre) + '</td><td>' + escapeHtml_(p.rut || '') + '</td><td>' + escapeHtml_(p.telefono || '') + '</td><td>' + escapeHtml_(p.cargo || '') + '</td><td>' +
            (p.es_reemplazo ? '<span class="bt-chip" style="--c:#B45309">Reemplazante</span>' : '') + '</td></tr>').join('') + '</table>' : '<div>Sin personas (no estaba en servicio).</div>') +
        (acts.length ? '<div style="margin-top:8px;"><b>🧩 Actividades (' + acts.length + ')</b><table class="bt-dot"><tr><th>Horario</th><th>Actividad</th><th>Fundo</th><th>Fotos</th></tr>' +
          acts.map(a => { const k = btClasif_(a); return '<tr><td>' + btHora_(a.inicio) + '–' + btHora_(a.fin) + '</td><td><span class="bt-chip" style="--c:' + k.color + '">' + escapeHtml_(k.nombre) + '</span> ' +
            escapeHtml_((a.grupo || '') + ' › ' + (a.actividad || '')) + '</td><td>' + escapeHtml_(a.fundo_nombre || '') + '</td><td>' + ((a.fotos || []).length || '') + '</td></tr>'; }).join('') + '</table></div>' : '') +
        (j.observacion ? '<div style="margin-top:6px;"><b>Observación:</b> ' + escapeHtml_(j.observacion) + '</div>' : '') +
        (j.cierre_observacion ? '<div><b>Observación de cierre:</b> ' + escapeHtml_(j.cierre_observacion) + '</div>' : '') + '</div></td></tr>';
    }
    return h;
  }).join('');
  cu.innerHTML = '<div class="gr-tabla-wrap"><table class="gr-tabla bt-tabla"><thead><tr>' + th.map((t, i) => '<th' + (i === 0 ? ' class="gr-fijo"' : '') + '>' + t + '</th>').join('') + '</tr></thead><tbody>' + filas + '</tbody></table></div>' +
    '<div class="muted" style="font-size:11.5px;margin:6px 2px;">Toca una fila para ver la dotación y las actividades. Avance = actividades registradas ÷ duración del turno.</div>';
}

// ── 🧩 Actividades ──────────────────────────────────────────────────────────────────────────────────────
function renderBtActividades_(cu) {
  const s = state.bt, l = btActsFiltradas_();
  const min = l.reduce((a, x) => a + (x.minutos || 0), 0);
  const porK = new Map(); l.forEach(a => { const k = btClasif_(a); const x = porK.get(k.codigo) || { k, min: 0, n: 0 }; x.min += a.minutos || 0; x.n++; porK.set(k.codigo, x); });
  document.getElementById('bt-kpis').innerHTML = btKpi_(l.length, 'Actividades', '#0F766E') + btKpi_(btDur_(min), 'Tiempo registrado', '#15803D') +
    btKpi_(new Set(l.map(a => a.recurso_id)).size, 'Recursos', '#2563EB') + btKpi_(l.filter(a => (a.fotos || []).length).length, 'Con fotos', '#7C3AED') +
    [...porK.values()].sort((a, b) => b.min - a.min).map(x => btKpi_(btDur_(x.min), (x.k.emoji || '') + ' ' + x.k.nombre + ' · ' + x.n, x.k.color)).join('');
  const est = document.getElementById('bt-estado-txt');
  if (est) est.textContent = l.length + ' de ' + s.acts.length + ' actividades · ' + btFecha_(s.desde) + ' → ' + btFecha_(s.hasta);
  if (!l.length) { cu.innerHTML = '<div class="tb-vacio">' + (s.acts.length ? 'Ninguna actividad coincide con los filtros.' : 'No hay actividades registradas en estas fechas.') + '</div>'; return; }
  const th = ['Fecha', 'Horario', 'Duración', 'Área', 'Recurso', 'Clasificación', 'Grupo', 'Actividad', 'Cant.', 'Fundo', 'Coordenadas', 'Fotos', 'Registró', 'Observación'];
  const filas = l.map(a => {
    const j = a._j, k = btClasif_(a), nf = (a.fotos || []).length;
    let h = '<tr data-bt-fila="' + escapeHtml_(a.id) + '" class="bt-fila' + (s.abierta === a.id ? ' on' : '') + '">' +
      '<td class="gr-fijo gr-ro"><b>' + btFecha_(a.fecha_operativa) + '</b></td><td class="gr-ro">' + btHora_(a.inicio) + '–' + btHora_(a.fin) + '</td><td class="gr-ro">' + btDur_(a.minutos) + '</td>' +
      '<td class="gr-ro">' + escapeHtml_(j.area || '') + '</td><td class="gr-ro"><b>' + escapeHtml_(j.clave_radial || '') + '</b><br><small>' + escapeHtml_(j.codigo_ref || '') + '</small></td>' +
      '<td class="gr-ro"><span class="bt-chip" style="--c:' + k.color + '">' + escapeHtml_((k.emoji || '') + ' ' + k.nombre) + '</span></td>' +
      '<td class="gr-ro">' + escapeHtml_((a.grupo_emoji || '') + ' ' + (a.grupo || '')) + '</td><td class="gr-ro"><b>' + escapeHtml_(a.actividad || '') + '</b></td>' +
      '<td class="gr-ro" style="text-align:center;">' + (a.cantidad > 1 ? a.cantidad : '') + '</td>' +
      '<td class="gr-ro">' + escapeHtml_(a.fundo_nombre || '') + (a.cod_fundo ? ' <small>(' + escapeHtml_(a.cod_fundo) + ')</small>' : '') + '</td>' +
      '<td class="gr-ro"><small>' + (a.lat != null ? escapeHtml_(coordGms_(a.lat, a.lng)) : '') + '</small></td>' +
      '<td class="gr-ro" style="text-align:center;">' + (nf ? '📷 ' + nf : '') + '</td>' +
      '<td class="gr-ro">' + escapeHtml_(a.creado_por_nombre || '') + '</td><td class="gr-ro" style="white-space:normal;min-width:160px;">' + escapeHtml_(a.observacion || '') + '</td></tr>';
    if (s.abierta === a.id && nf) h += '<tr class="bt-det"><td colspan="' + th.length + '"><div class="bt-det-in"><div class="bt-fotos" id="bt-fotos-' + escapeHtml_(a.id) + '">Cargando fotos…</div></div></td></tr>';
    return h;
  }).join('');
  cu.innerHTML = '<div class="gr-tabla-wrap"><table class="gr-tabla bt-tabla"><thead><tr>' + th.map((t, i) => '<th' + (i === 0 ? ' class="gr-fijo"' : '') + '>' + t + '</th>').join('') + '</tr></thead><tbody>' + filas + '</tbody></table></div>' +
    '<div class="muted" style="font-size:11.5px;margin:6px 2px;">Toca una actividad con 📷 para ver sus fotos.</div>';
  const ab = l.find(a => a.id === s.abierta && (a.fotos || []).length);
  if (ab) btCargarFotos_(ab);
}
// Fotos del bucket privado bit-fotos con URL firmada (1 h)
async function btCargarFotos_(a) {
  const c = document.getElementById('bt-fotos-' + a.id); if (!c) return;
  try {
    const { data, error } = await supabaseClient.storage.from('bit-fotos').createSignedUrls(a.fotos.map(f => f.storage_path), 3600);
    if (error) throw error;
    c.innerHTML = (data || []).filter(d => d.signedUrl).map(d => '<a href="' + escapeHtml_(d.signedUrl) + '" target="_blank" rel="noopener"><img src="' + escapeHtml_(d.signedUrl) + '" alt="Foto de la actividad"></a>').join('') || 'Sin fotos disponibles.';
  } catch (e) { c.textContent = 'No se pudieron cargar las fotos: ' + ((e && e.message) || e); }
}

// ── 🗺️ Mapa ────────────────────────────────────────────────────────────────────────────────────────────
function renderBtMapa_(cu) {
  const s = state.bt, l = btActsFiltradas_().filter(a => a.lat != null && a.lng != null);
  const ap = btFiltradas_().filter(j => j.lat != null && j.lng != null);
  const porK = new Map(); l.forEach(a => { const k = btClasif_(a); porK.set(k.codigo, Object.assign({ n: (porK.get(k.codigo) || { n: 0 }).n + 1 }, k)); });
  document.getElementById('bt-kpis').innerHTML = btKpi_(l.length, 'Actividades con ubicación', '#0F766E') + btKpi_(ap.length, 'Aperturas con ubicación', '#2563EB') +
    [...porK.values()].map(k => btKpi_(k.n, (k.emoji || '') + ' ' + k.nombre, k.color)).join('');
  const est = document.getElementById('bt-estado-txt');
  if (est) est.textContent = btFecha_(s.desde) + ' → ' + btFecha_(s.hasta) + (s.recurso ? ' · ruta asignada del recurso' : ' · elige un recurso para ver su ruta');
  cu.innerHTML = '<div id="bt-mapa" style="flex:1;min-height:420px;border-radius:12px;border:1px solid var(--border);"></div>' +
    '<div class="muted" style="font-size:11.5px;margin:6px 2px;">● Actividad (color por clasificación) · ◆ Apertura · ━ Ruta asignada del recurso elegido (escenario Normal del copamiento).</div>';
  if (typeof L === 'undefined') { document.getElementById('bt-mapa').innerHTML = '<div class="tb-vacio">El mapa no está disponible.</div>'; return; }
  if (s.mapa) { try { s.mapa.remove(); } catch (e) {} }
  const map = s.mapa = L.map('bt-mapa', { attributionControl: false }).setView([-37.8, -72.7], 8);
  L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, maxNativeZoom: 18 }).addTo(map);
  map.invalidateSize();
  const lim = [];
  ap.forEach(j => {
    L.marker([j.lat, j.lng], { icon: L.divIcon({ className: '', html: '<div class="bt-rombo"></div>', iconSize: [14, 14], iconAnchor: [7, 7] }) }).addTo(map)
      .bindPopup('<b>◆ Apertura ' + escapeHtml_(j.clave_radial || '') + '</b><br>' + btFecha_(j.fecha_operativa) + ' · ' + escapeHtml_(j.turno || '') + '<br>' + escapeHtml_(j.area || '') +
        (j.fundo_nombre ? '<br>🌲 ' + escapeHtml_(j.fundo_nombre) : '') + '<br>' + escapeHtml_(coordGms_(j.lat, j.lng)));
    lim.push([j.lat, j.lng]);
  });
  l.forEach(a => {
    const k = btClasif_(a), j = a._j;
    L.circleMarker([a.lat, a.lng], { radius: 7, color: '#fff', weight: 2, fillColor: k.color, fillOpacity: .95 }).addTo(map)
      .bindPopup('<b>' + escapeHtml_((k.emoji || '') + ' ' + k.nombre + ' › ' + (a.grupo || '')) + '</b><br>' + escapeHtml_(a.actividad || '') + '<br>' +
        escapeHtml_((j.clave_radial || '') + ' · ' + btFecha_(a.fecha_operativa) + ' ' + btHora_(a.inicio) + '–' + btHora_(a.fin)) +
        (a.fundo_nombre ? '<br>🌲 ' + escapeHtml_(a.fundo_nombre) : '') + '<br>' + escapeHtml_(coordGms_(a.lat, a.lng)));
    lim.push([a.lat, a.lng]);
  });
  const ajustar = () => { if (lim.length) map.fitBounds(lim, { padding: [30, 30], maxZoom: 15, animate: false }); };
  ajustar();
  if (s.recurso) {
    supabaseClient.rpc('bit_ruta_recurso', { p_recurso: s.recurso }).then(({ data, error }) => {
      if (error || !data || s.mapa !== map) return;
      const rf = (data.rutas && data.rutas.features) || [];
      if (!rf.length) { if (est) est.textContent += ' · sin ruta asignada'; return; }
      const capa = L.geoJSON(data.rutas, { style: { color: '#1D4ED8', weight: 5, opacity: .85 } }).addTo(map)
        .bindTooltip('Ruta asignada' + ((data.fundos || []).length ? ' · fundos: ' + data.fundos.map(f => (f.nombre || '') + ' (' + (f.cod_fundo || '') + ')').join(', ') : ''), { sticky: true });
      try { const b = capa.getBounds(); lim.push(b.getSouthWest(), b.getNorthEast()); ajustar(); } catch (e) {}
    });
  }
}

// ── 📊 Indicadores ──────────────────────────────────────────────────────────────────────────────────────
// Días de turno sin apertura: según el calendario del copamiento que entrega bit_mis_recursos (ventana hoy −7 … hoy + 14)
function btFaltantes_() {
  const s = state.bt, hoy = btDiaISO_(0), conAp = new Set(s.filas.map(j => j.recurso_id + '|' + j.fecha_operativa)), out = [];
  s.recursos.filter(r => btEnArea_(s, r.area) && (!s.tipo || r.tipo_codigo === s.tipo)).forEach(r => (r.dias_de_turno || []).forEach(d => {
    const f = String(d).slice(0, 10);
    if (f >= s.desde && f <= s.hasta && f <= hoy && !conAp.has(r.id + '|' + f)) out.push({ r, f });
  }));
  return out;
}
function btIndicadores_() {
  const s = state.bt, ap = btFiltradas_({ todo: true }), acts = btActsFiltradas_({ todo: true }), falt = btFaltantes_();
  const kls = s.kls.length ? s.kls.map(k => ({ codigo: k.codigo, nombre: k.nombre, emoji: k.emoji, color: k.color })) : [];
  const fila = () => ({ ap: 0, serv: 0, av: [], al100: 0, min: 0, n: 0, falt: 0, porK: {}, dias: new Set(), ult: '' });
  const porArea = new Map(), porRec = new Map();
  const de = (m, k, extra) => { if (!m.has(k)) m.set(k, Object.assign(fila(), extra)); return m.get(k); };
  ap.forEach(j => {
    [de(porArea, j.area || 'Sin área', { nombre: j.area || 'Sin área' }), de(porRec, j.recurso_id, { nombre: j.clave_radial || j.codigo_ref, area: j.area, tipo: j.tipo_codigo })].forEach(x => {
      x.ap++; if (j.en_servicio) { x.serv++; if (j.avance_pct != null) x.av.push(j.avance_pct); if (j.avance_pct >= 100) x.al100++; }
      x.dias.add(j.fecha_operativa); if (j.fecha_operativa > x.ult) x.ult = j.fecha_operativa;
    });
  });
  acts.forEach(a => {
    const j = a._j, k = btClasif_(a);
    [de(porArea, j.area || 'Sin área', { nombre: j.area || 'Sin área' }), de(porRec, a.recurso_id, { nombre: j.clave_radial || j.codigo_ref, area: j.area, tipo: j.tipo_codigo })].forEach(x => {
      x.min += a.minutos || 0; x.n++; x.porK[k.codigo] = (x.porK[k.codigo] || 0) + (a.minutos || 0);
      if (!kls.some(z => z.codigo === k.codigo)) kls.push(k);
    });
  });
  falt.forEach(({ r }) => {
    de(porArea, r.area || 'Sin área', { nombre: r.area || 'Sin área' }).falt++;
    de(porRec, r.id, { nombre: r.clave_radial || r.codigo_ref, area: r.area, tipo: r.tipo_codigo }).falt++;
  });
  return { ap, acts, falt, kls, porArea, porRec };
}
const btProm_ = a => a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length) : null;
function btBarraK_(x, kls) {
  if (!x.min) return '<small class="muted">—</small>';
  return '<div class="bt-barra" title="' + escapeHtml_(kls.filter(k => x.porK[k.codigo]).map(k => k.nombre + ': ' + btDur_(x.porK[k.codigo])).join(' · ')) + '">' +
    kls.filter(k => x.porK[k.codigo]).map(k => '<i style="width:' + (100 * x.porK[k.codigo] / x.min) + '%;background:' + k.color + '"></i>').join('') + '</div>';
}
function renderBtIndicadores_(cu) {
  const s = state.bt, I = btIndicadores_();
  const serv = I.ap.filter(j => j.en_servicio), av = btProm_(serv.filter(j => j.avance_pct != null).map(j => j.avance_pct));
  const minTot = I.acts.reduce((a, x) => a + (x.minutos || 0), 0);
  document.getElementById('bt-kpis').innerHTML = btKpi_(I.ap.length, 'Aperturas', '#0F766E') + btKpi_(I.falt.length, 'De turno sin apertura', '#DC2626') +
    btKpi_(av != null ? av + ' %' : '—', 'Avance promedio del turno', '#D97706') + btKpi_(serv.filter(j => j.avance_pct >= 100).length + ' de ' + serv.length, 'Turnos al 100 %', '#16A34A') +
    btKpi_(btDur_(minTot), 'Horas registradas', '#2563EB') + btKpi_(I.acts.length, 'Actividades', '#7C3AED');
  const est = document.getElementById('bt-estado-txt');
  if (est) est.textContent = btFecha_(s.desde) + ' → ' + btFecha_(s.hasta) + ' · «sin apertura» según el calendario de turnos (hasta 7 días atrás)';
  const minK = {}; I.acts.forEach(a => { const k = btClasif_(a); minK[k.codigo] = (minK[k.codigo] || 0) + (a.minutos || 0); });
  const maxK = Math.max(1, ...Object.values(minK));
  let h = '<div class="bt-ind"><div class="bt-ind-caja"><h4>⏱️ Horas por clasificación</h4>' + (I.kls.filter(k => minK[k.codigo]).map(k =>
      '<div class="bt-hbar"><span>' + escapeHtml_((k.emoji || '') + ' ' + k.nombre) + '</span><div><i style="width:' + (100 * minK[k.codigo] / maxK) + '%;background:' + k.color + '"></i></div><b>' + btDur_(minK[k.codigo]) +
      '</b><small>' + Math.round(100 * minK[k.codigo] / (minTot || 1)) + ' %</small></div>').join('') || '<div class="muted">Sin actividades en el período.</div>') + '</div>';
  // Por área
  const areas = [...I.porArea.values()].sort((a, b) => String(a.nombre).localeCompare(String(b.nombre), 'es'));
  h += '<div class="bt-ind-caja"><h4>🧭 Por área</h4><table class="bt-dot bt-ind-t"><tr><th>Área</th><th>Aperturas</th><th>En servicio</th><th>Sin apertura</th><th>Avance prom.</th><th>Al 100 %</th><th>Horas</th><th>Actividades</th><th>Horas por clasificación</th></tr>' +
    areas.map(x => { const p = btProm_(x.av); return '<tr><td><b>' + escapeHtml_(x.nombre) + '</b></td><td>' + x.ap + '</td><td>' + x.serv + '</td><td>' + (x.falt ? '<span class="bt-chip" style="--c:#DC2626">' + x.falt + '</span>' : '0') + '</td>' +
      '<td>' + (p != null ? btBarraAv_(p) : '—') + '</td><td>' + x.al100 + '</td><td>' + btHoras_(x.min) + '</td><td>' + x.n + '</td><td style="min-width:160px;">' + btBarraK_(x, I.kls) + '</td></tr>'; }).join('') + '</table></div>';
  // Por recurso (los de menor avance primero)
  const recs = [...I.porRec.values()].sort((a, b) => (btProm_(a.av) ?? -1) - (btProm_(b.av) ?? -1) || b.falt - a.falt || String(a.nombre).localeCompare(String(b.nombre), 'es', { numeric: true }));
  h += '<div class="bt-ind-caja"><h4>🚒 Por recurso <small class="muted">(menor avance primero)</small></h4><table class="bt-dot bt-ind-t"><tr><th>Recurso</th><th>Área</th><th>Tipo</th><th>Días con apertura</th><th>Días sin apertura</th><th>Avance prom.</th><th>Al 100 %</th><th>Horas</th><th>Actividades</th><th>Última apertura</th><th>Horas por clasificación</th></tr>' +
    recs.map(x => { const p = btProm_(x.av); return '<tr><td><b>' + escapeHtml_(x.nombre || '') + '</b></td><td>' + escapeHtml_(x.area || '') + '</td><td>' + escapeHtml_(btTipoTxt_(x.tipo)) + '</td><td>' + x.dias.size + '</td>' +
      '<td>' + (x.falt ? '<span class="bt-chip" style="--c:#DC2626">' + x.falt + '</span>' : '0') + '</td><td>' + (p != null ? btBarraAv_(p) : '—') + '</td><td>' + x.al100 + '</td><td>' + btHoras_(x.min) + '</td><td>' + x.n + '</td>' +
      '<td>' + btFecha_(x.ult) + '</td><td style="min-width:160px;">' + btBarraK_(x, I.kls) + '</td></tr>'; }).join('') + '</table></div>';
  // Faltantes
  if (I.falt.length) h += '<div class="bt-ind-caja"><h4>⚠️ De turno sin apertura (' + I.falt.length + ')</h4><table class="bt-dot bt-ind-t"><tr><th>Fecha</th><th>Recurso</th><th>Área</th><th>Tipo</th><th>Horario</th></tr>' +
    I.falt.sort((a, b) => b.f.localeCompare(a.f) || String(a.r.area).localeCompare(String(b.r.area), 'es')).map(({ r, f }) => '<tr><td>' + btFecha_(f) + '</td><td><b>' + escapeHtml_(r.clave_radial || r.codigo_ref || '') + '</b></td><td>' +
      escapeHtml_(r.area || '') + '</td><td>' + escapeHtml_(btTipoTxt_(r.tipo_codigo)) + '</td><td>' + escapeHtml_(r.horario || '') + '</td></tr>').join('') + '</table></div>';
  h += '<div class="bt-ind-caja"><small class="muted">Leyenda: ' + I.kls.map(k => '<span style="color:' + k.color + '">■</span> ' + escapeHtml_(k.nombre)).join(' · ') + '</small></div></div>';
  cu.innerHTML = h;
}
function btBarraAv_(p) { return '<div class="bt-av" style="width:90px;display:inline-block;vertical-align:middle;"><i style="width:' + p + '%;background:' + (p >= 100 ? '#16A34A' : p >= 50 ? '#D97706' : '#DC2626') + '"></i></div> <small>' + p + ' %</small>'; }

// ── ⬇️ Excel ────────────────────────────────────────────────────────────────────────────────────────────
async function descargarBitacoraExcel_() {
  const s = state.bt, v = s.vista;
  let XLSX; try { XLSX = await tbCargarSheetJs_(); } catch (e) { return mostrarToast_(e.message); }
  const wb = XLSX.utils.book_new();
  const hoja = (filas, nombre, vacio) => {
    const h = XLSX.utils.json_to_sheet(filas.length ? filas : [{ '': vacio }]);
    if (filas.length) h['!cols'] = Object.keys(filas[0]).map(k => ({ wch: Math.min(40, Math.max(10, k.length + 2)) }));
    XLSX.utils.book_append_sheet(wb, h, nombre);
  };
  const sufijo = s.desde + '_a_' + s.hasta + '.xlsx';
  if (v === 'bitacoraact') {
    const l = btActsFiltradas_();
    if (!l.length) return mostrarToast_('No hay actividades para descargar con estos filtros.');
    hoja(l.map(a => { const j = a._j, k = btClasif_(a); return {
      'Fecha': btFecha_(a.fecha_operativa), 'Inicio': btHora_(a.inicio), 'Término': btHora_(a.fin), 'Minutos': a.minutos || 0,
      'Subgerencia': j.subgerencia || '', 'Área': j.area || '', 'Clave radial': j.clave_radial || '', 'Código': j.codigo_ref || '', 'Tipo': btTipoTxt_(j.tipo_codigo), 'Empresa': j.empresa || '',
      'Clasificación': k.nombre, 'Grupo': a.grupo || '', 'Código actividad': a.actividad_codigo || '', 'Actividad': a.actividad || '', 'Cantidad': a.cantidad || 1,
      'Fundo': a.fundo_nombre || '', 'Código fundo': a.cod_fundo || '', 'Latitud': a.lat != null ? Number(a.lat.toFixed(6)) : '', 'Longitud': a.lng != null ? Number(a.lng.toFixed(6)) : '',
      'Coordenadas (GMS)': a.lat != null ? coordGms_(a.lat, a.lng) : '', 'Fotos': (a.fotos || []).length, 'Registró': a.creado_por_nombre || '', 'Observación': a.observacion || '' }; }), 'Actividades', '');
    const porRec = new Map();
    l.forEach(a => { const j = a._j, x = porRec.get(a.recurso_id) || { 'Clave radial': j.clave_radial || '', 'Área': j.area || '', 'Tipo': btTipoTxt_(j.tipo_codigo), 'Actividades': 0, 'Horas': 0 }; x['Actividades']++; x['Horas'] = Math.round((x['Horas'] + (a.minutos || 0) / 60) * 10) / 10; const k = btClasif_(a); x['Horas ' + k.nombre] = Math.round(((x['Horas ' + k.nombre] || 0) + (a.minutos || 0) / 60) * 10) / 10; porRec.set(a.recurso_id, x); });
    hoja([...porRec.values()], 'Resumen por recurso', '');
    XLSX.writeFile(wb, 'bitacora_actividades_' + sufijo);
    return;
  }
  if (v === 'bitacoraind') {
    const I = btIndicadores_();
    const filaInd = x => { const p = btProm_(x.av), o = { 'Aperturas': x.ap, 'En servicio': x.serv, 'De turno sin apertura': x.falt, 'Avance promedio (%)': p != null ? p : '', 'Turnos al 100 %': x.al100, 'Horas registradas': btHoras_(x.min), 'Actividades': x.n };
      I.kls.forEach(k => { o['Horas ' + k.nombre] = btHoras_(x.porK[k.codigo] || 0); }); return o; };
    hoja([...I.porArea.values()].map(x => Object.assign({ 'Área': x.nombre }, filaInd(x))), 'Por área', '');
    hoja([...I.porRec.values()].map(x => Object.assign({ 'Recurso': x.nombre, 'Área': x.area || '', 'Tipo': btTipoTxt_(x.tipo), 'Días con apertura': x.dias.size, 'Última apertura': btFecha_(x.ult) }, filaInd(x))), 'Por recurso', '');
    hoja(I.falt.map(({ r, f }) => ({ 'Fecha': btFecha_(f), 'Recurso': r.clave_radial || r.codigo_ref || '', 'Código': r.codigo_ref || '', 'Área': r.area || '', 'Tipo': btTipoTxt_(r.tipo_codigo), 'Horario': r.horario || '' })), 'Sin apertura', 'Todos los recursos de turno abrieron su jornada');
    XLSX.writeFile(wb, 'bitacora_indicadores_' + sufijo);
    return;
  }
  const l = btFiltradas_();
  if (!l.length) return mostrarToast_('No hay aperturas para descargar con estos filtros.');
  hoja(l.map(j => {
    const jefe = btJefe_(j);
    return {
      'Fecha': btFecha_(j.fecha_operativa), 'Subgerencia': j.subgerencia || '', 'Área': j.area || '',
      'Clave radial': j.clave_radial || '', 'Código': j.codigo_ref || '', 'Tipo': btTipoTxt_(j.tipo_codigo) || j.tipo_recurso || '',
      'Empresa': j.empresa || '', 'Estado del día': j.estado || '', 'Situación': j.en_servicio ? (j.cerrada ? 'Cerrada' : 'Abierta') : '',
      'Turno': j.turno_codigo ? j.turno_codigo + ' · ' + (j.turno || '') : '', 'Jornada': j.tipo_jornada || '', 'Actividad general': j.foco || '',
      'Avance del turno (%)': j.en_servicio && j.avance_pct != null ? j.avance_pct : '', 'N° actividades': j.en_servicio ? (j.actividades_n || 0) : '',
      'Horas registradas': j.en_servicio ? btHoras_(j.actividades_min) : '', 'Registrado hasta': j.actividades_hasta ? btHora_(j.actividades_hasta) : '',
      'Fuerza (personas)': j.dotacion_n || 0, 'Jefe': jefe ? jefe.nombre : (j.jefe_nombre || ''), 'Teléfono jefe': j.jefe_telefono || (jefe && jefe.telefono) || '',
      'Reemplazantes': btReemplazantes_(j).map(p => p.nombre).join(', '),
      'Patente': j.patente || '', 'Cambio de móvil': j.cambio_movil ? 'Sí' : '', 'Km inicial': j.km_inicio != null ? j.km_inicio : '', 'Km final': j.km_fin != null ? j.km_fin : '',
      'Fundo': j.fundo_nombre || '', 'Código fundo': j.cod_fundo || '',
      'Latitud': j.lat != null ? Number(j.lat.toFixed(6)) : '', 'Longitud': j.lng != null ? Number(j.lng.toFixed(6)) : '',
      'Coordenadas (GMS)': j.lat != null ? coordGms_(j.lat, j.lng) : '',
      'Inicio turno': j.inicio_programado ? btHora_(j.inicio_programado) : '', 'Fin turno': j.fin_programado ? btHora_(j.fin_programado) : '',
      'Abrió': j.creado_por_nombre || '', 'Hora apertura': btHora_(j.creado_dispositivo_en || j.creado_en),
      'Cierre': j.cierre_en ? 'Manual ' + btHora_(j.cierre_en) : (j.cerrada ? 'Automático' : ''), 'Cerró': j.cierre_por_nombre || '',
      'Observación': j.observacion || '', 'Observación de cierre': j.cierre_observacion || '', 'Origen': j.origen || ''
    };
  }), 'Aperturas', '');
  const personal = [];
  l.forEach(j => (j.dotacion || []).forEach(p => personal.push({
    'Fecha': btFecha_(j.fecha_operativa), 'Área': j.area || '', 'Clave radial': j.clave_radial || '', 'Código': j.codigo_ref || '',
    'Tipo': btTipoTxt_(j.tipo_codigo) || j.tipo_recurso || '', 'Empresa': j.empresa || '',
    'Nombre': p.nombre || '', 'RUT': p.rut || '', 'Teléfono': p.telefono || '', 'Cargo': p.cargo || '',
    'Jefe': p.es_jefe ? 'Sí' : '', 'Reemplazante': p.es_reemplazo ? 'Sí' : '', 'Turno': j.turno || '', 'Fundo': j.fundo_nombre || ''
  })));
  hoja(personal, 'Personal', 'Sin personal en las aperturas filtradas');
  XLSX.writeFile(wb, 'bitacora_aperturas_' + sufijo);
}
