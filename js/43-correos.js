/* ============ ✉️ CORREOS AUTOMÁTICOS (Administración, solo Admin, 22-11-2026, SQL 189 / 190) ============
 * Cola de correos en Supabase (correo_salida) que pg_cron entrega a la Edge Function «enviar-correos», que envía con Resend.
 *   · PESTAÑAS por TEMÁTICA (correo_avisos.tematica, SQL 190) + 🗂️ Historial. Cada aviso: activo, día, hora (Chile), a quiénes, vista
 *     previa, prueba, «Enviar ahora» y sus destinatarios (de los usuarios + extras / excluidos de correo_destinatarios).
 *   · Avisos de hoy (temática 📋 PPA):
 *       ppa_semanal    (destino 'area')        → a cada Jefe de Área el PPA de su área (opcional Subgerentes, GRT y delegados).
 *       ppa_subgerente (destino 'subgerencia') → a cada Subgerente el PPA consolidado de las áreas de su subgerencia.
 *   · Nacen INACTIVOS: se activan aquí después de la vista previa y una prueba.
 * Aviso nuevo = fila en correo_avisos (tematica, destino) + función de encolado y rama en correo_programador_ (SQL) + PLANTILLAS y AVISOS
 * en la Edge Function. Esta pantalla lo muestra sola (en su pestaña); solo los avisos por área muestran «Lo reciben» con 4 casillas. */
state.co = state.co || { tab: '', sel: {}, vistas: {}, histEstado: '' };
const CO_DIAS = ['', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const CO_ESTADOS = {
  pendiente: { t: 'Pendiente', c: '#64748B' }, enviando: { t: 'Enviando', c: '#2563EB' }, enviado: { t: 'Enviado', c: '#16A34A' },
  error: { t: 'Error', c: '#DC2626' }, cancelado: { t: 'Cancelado', c: '#94A3B8' },
};
const CO_HIST = '__historial__';
const CO_RE_CORREO = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

async function coInvocar_(body) {
  const { data, error } = await supabaseClient.functions.invoke('enviar-correos', { body });
  if (error || !data || !data.ok) {
    let msg = await mensajeErrorEdgeFunction_(data, error);
    if (/Failed to send|not found|404|FunctionsFetchError|FunctionsRelayError/i.test(msg)) msg = 'Falta crear la Edge Function «enviar-correos» en Supabase (' + msg + ').';
    throw new Error(msg);
  }
  return data;
}
function coFecha_(f) {
  if (!f) return '';
  const d = new Date(f);
  return isNaN(d) ? '' : d.toLocaleDateString('es-CL', { day: '2-digit', month: 'short' }) + ' ' + d.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
}
function coChip_(e) { const x = CO_ESTADOS[e] || { t: e, c: '#64748B' }; return '<span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:700;color:#fff;background:' + x.c + ';">' + x.t + '</span>'; }
function coAvisoDestino_(a) { return a.destino || (a.tipo === 'ppa_subgerente' ? 'subgerencia' : 'area'); }
const CO_DIAS_CORTOS = ['', 'L', 'M', 'X', 'J', 'V', 'S', 'D'];
const CO_CONSOLIDADO = '__consolidado__';
/** Días ISO del aviso (SQL 194: dias_semana; antes solo dia_semana). */
function coDiasAviso_(a) { return Array.isArray(a.dias_semana) && a.dias_semana.length ? a.dias_semana.map(Number) : [Number(a.dia_semana) || 1]; }
function coDiasTxt_(dias) {
  const s = [...dias].sort((x, y) => x - y).join(',');
  if (s === '1,2,3,4,5,6,7') return 'Todos los días';
  if (s === '1,2,3,4,5') return 'Lunes a viernes';
  return dias.length === 1 ? CO_DIAS[dias[0]] : dias.map(d => CO_DIAS[d].slice(0, 3)).join(', ');
}
function coNombreComuna_(id) { const c = (state.comunas || []).find(x => String(x.id) === String(id)); return c ? c.comuna : String(id || ''); }

async function adminSeccionCorreos_(c) {
  c.innerHTML = adminHead_('✉️ Correos automáticos', 'Cargando…');
  const leer = async (fn) => { try { const r = await fn(); return r.error ? { error: r.error } : { data: r.data || [] }; } catch (e) { return { error: e }; } };
  const [av, ex, hist, areas, ppa] = await Promise.all([
    leer(() => supabaseClient.from('correo_avisos').select('*')),
    leer(() => supabaseClient.from('correo_destinatarios').select('*').order('correo')),
    leer(() => supabaseClient.from('correo_salida').select('id, tipo, para, nombre, asunto, id_area, estado, intentos, error, es_prueba, creado_en, enviado_en').order('id', { ascending: false }).limit(200)),
    leer(() => supabaseClient.from('area_homologacion').select('id_area, area, nombre, subgerencia').order('id_area')),
    leer(() => supabaseClient.from('ppa').select('id_area').eq('activo', true).range(0, 4999)),
  ]);
  if (av.error) {
    c.innerHTML = adminHead_('✉️ Correos automáticos', '') + '<div class="gr-aviso">⚠️ ' +
      escapeHtml_(/correo_avisos|does not exist|schema cache|relation/i.test(av.error.message || '') ? 'Falta ejecutar en Supabase el SQL 189 (correos automáticos).' : (av.error.message || String(av.error))) + '</div>';
    return;
  }
  const avisos = av.data.map(a => Object.assign({ tematica: '📋 PPA', orden: 100 }, a))
    .sort((p, q) => (p.orden - q.orden) || p.nombre.localeCompare(q.nombre, 'es'));
  // Destinatarios de cada aviso (SQL 190: correo_destinatarios_aviso; antes solo el PPA por área)
  const dest = {};
  await Promise.all(avisos.map(async a => {
    let r = await supabaseClient.rpc('correo_destinatarios_aviso', { p_tipo: a.tipo });
    if (r.error && /correo_destinatarios_aviso|schema cache|function/i.test(r.error.message || '') && coAvisoDestino_(a) === 'area') {
      r = await supabaseClient.rpc('correo_destinatarios_listar', { p_tipo: a.tipo, p_id_area: null });
      if (!r.error) r.data = (r.data || []).map(x => Object.assign({ grupo: x.area }, x));
    }
    dest[a.tipo] = r.error ? { error: r.error, filas: [] } : { filas: r.data || [] };
  }));
  const conPpa = new Set((ppa.data || []).map(x => x.id_area));
  const areasPpa = (areas.data || []).filter(a => conPpa.has(a.id_area));
  state.co.datos = {
    avisos, dest, extras: ex.data || [], hist: hist.data || [],
    sin190: !avisos.some(a => a.destino),
    areas: areasPpa.map(a => ({ id: a.id_area, nombre: aTitulo_(a.nombre || a.area) })).sort((p, q) => p.nombre.localeCompare(q.nombre, 'es')),
    subgs: [...new Set(areasPpa.map(a => String(a.subgerencia || '').toUpperCase()).filter(Boolean))].sort(),
  };
  const tematicas = [...new Set(avisos.map(a => a.tematica))];
  if (!state.co.tab || (state.co.tab !== CO_HIST && !tematicas.includes(state.co.tab))) state.co.tab = tematicas[0] || CO_HIST;
  coRender_(c);
}

function coRender_(c) {
  const S = state.co, D = S.datos, n = k => D.hist.filter(h => h.estado === k).length;
  const hoy = new Date(), enviados7 = D.hist.filter(h => h.estado === 'enviado' && h.enviado_en && (hoy - new Date(h.enviado_en)) < 7 * 864e5).length;
  const tematicas = [...new Set(D.avisos.map(a => a.tematica))];
  const tab = (v, t, cuenta) => '<button class="sg-chip' + (S.tab === v ? ' on' : '') + '" data-co-tab="' + escapeHtml_(v) + '">' + t + '<small>' + cuenta + '</small></button>';
  const activos = D.avisos.filter(a => a.activo).length;

  c.innerHTML = adminHead_('✉️ Correos automáticos',
    'Avisos por correo que la plataforma envía sola (Resend, remitente no-responder@copamientoterritorial.cl), ordenados por temática. Revisa la vista previa y envía una prueba antes de activar un aviso.',
    '<button class="btn-secondary" id="co-recargar">🔄 Actualizar</button>') +
    (D.sin190 ? '<div class="gr-aviso" style="margin-bottom:10px;">⚠️ Falta ejecutar el SQL 190 para las temáticas y el aviso 📊 PPA de la subgerencia.</div>' : '') +
    '<div class="dash-kpis" style="margin-bottom:14px;">' +
      kpi_('Avisos activos', activos + ' / ' + D.avisos.length, tematicas.length + ' temática(s)') +
      kpi_('Enviados (7 días)', enviados7, n('pendiente') + ' pendientes') +
      kpi_('Con error', n('error'), 'de los últimos ' + D.hist.length) +
      kpi_('Pruebas enviadas', D.hist.filter(h => h.es_prueba && h.estado === 'enviado').length, 'últimos ' + D.hist.length + ' correos') + '</div>' +
    '<div class="sg-chips" style="margin-bottom:12px;">' +
      tematicas.map(t => tab(t, escapeHtml_(t), D.avisos.filter(a => a.tematica === t).length)).join('') +
      tab(CO_HIST, '🗂️ Historial', D.hist.length) + '</div>' +
    '<div id="co-cuerpo">' + (S.tab === CO_HIST ? coHtmlHistorial_() : D.avisos.filter(a => a.tematica === S.tab).map(coHtmlAviso_).join('')) + '</div>';

  if (S.tab !== CO_HIST) D.avisos.filter(a => a.tematica === S.tab).forEach(a => {
    const f = c.querySelector('[data-co-iframe="' + a.tipo + '"]'); if (f && S.vistas[a.tipo]) f.srcdoc = S.vistas[a.tipo];
  });
  coEnlazar_(c);
}

/** Tarjeta de un aviso: configuración, vista previa / prueba / enviar ahora y destinatarios. */
function coHtmlAviso_(a) {
  const S = state.co, D = S.datos, t = a.tipo, porSubg = coAvisoDestino_(a) === 'subgerencia', porComuna = coAvisoDestino_(a) === 'comuna';
  const op = a.opciones || {};
  const sel = S.sel[t] = S.sel[t] || { id_area: D.areas[0] ? String(D.areas[0].id) : '', subgerencia: D.subgs[0] || '', comuna: CO_CONSOLIDADO };
  const opt = (v, txt, s) => '<option value="' + escapeHtml_(String(v)) + '"' + (s ? ' selected' : '') + '>' + escapeHtml_(txt) + '</option>';
  const chk = (k, txt, v, tip) => '<label style="display:inline-flex;gap:6px;align-items:center;margin-right:14px;font-size:13px;" title="' + escapeHtml_(tip || '') + '"><input type="checkbox" data-co-f="' + k + '"' + (v ? ' checked' : '') + '> ' + txt + '</label>';
  const ds = D.dest[t] || { filas: [] }, filas = ds.filas;
  const grupos = porComuna ? [] : porSubg ? D.subgs : D.areas.map(x => x.nombre);
  const sinDest = grupos.filter(g => !filas.some(f => areaClave_(f.grupo || '') === areaClave_(g)));
  const extras = D.extras.filter(x => x.tipo === t);
  const nomArea = id => (D.areas.find(x => x.id === id) || {}).nombre || 'Área ' + id;
  const alcance = x => x.comuna_id ? 'Comuna ' + coNombreComuna_(x.comuna_id) : x.id_area != null ? nomArea(x.id_area) : x.subgerencia ? 'Subgerencia ' + aTitulo_(x.subgerencia)
    : (porComuna ? 'Consolidado' : porSubg ? 'Todas las subgerencias' : 'Todas las áreas');
  const dias = coDiasAviso_(a);
  const proximo = a.activo ? coDiasTxt_(dias) + ' ' + String(a.hora).padStart(2, '0') + ':00' : 'Inactivo';
  // Comunas con destinatario (GRD o extra) para la vista previa / prueba del correo por comuna
  const comunasDest = [...new Map(filas.filter(f => f.clave).map(f => [String(f.clave), f.grupo])).entries()].sort((x, y) => String(x[1]).localeCompare(String(y[1]), 'es'));
  const todasComunas = [...(state.comunas || [])].sort((x, y) => String(x.comuna).localeCompare(String(y.comuna), 'es'));
  const selector = porComuna
    ? '<select data-co-sel="comuna" class="admin-search" style="max-width:260px;">' + opt(CO_CONSOLIDADO, '🧾 Consolidado (Administradores)', sel.comuna === CO_CONSOLIDADO) +
        (comunasDest.length ? '<optgroup label="Comunas con GRD">' + comunasDest.map(([id, n]) => opt(id, n, sel.comuna === id)).join('') + '</optgroup>' : '') +
        '<optgroup label="Otra comuna">' + todasComunas.filter(c => !comunasDest.some(([id]) => id === String(c.id))).map(c => opt(c.id, c.comuna, sel.comuna === String(c.id))).join('') + '</optgroup></select>'
    : porSubg
    ? '<select data-co-sel="subgerencia" class="admin-search" style="max-width:200px;">' + D.subgs.map(s => opt(s, 'Subgerencia ' + aTitulo_(s), s === sel.subgerencia)).join('') + '</select>'
    : '<select data-co-sel="id_area" class="admin-search" style="max-width:240px;">' + D.areas.map(x => opt(x.id, x.nombre, String(x.id) === sel.id_area)).join('') + '</select>';

  const destTabla = ds.error ? '<div class="gr-aviso">⚠️ ' + escapeHtml_(ds.error.message || String(ds.error)) + '</div>' :
    '<div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>' + (porComuna ? 'Comuna' : porSubg ? 'Subgerencia' : 'Área') + '</th><th>Nombre</th><th>Correo</th><th>Por qué</th><th></th></tr></thead><tbody>' +
    (filas.map(f => '<tr><td>' + escapeHtml_(porComuna ? (f.grupo || '') : aTitulo_(f.grupo || '')) + '</td><td>' + escapeHtml_(f.nombre || '—') + '</td><td>' + escapeHtml_(f.correo) + '</td>' +
      '<td><small>' + escapeHtml_(f.origen) + '</small></td>' +
      '<td><button class="popup-btn" data-co-excluir="' + escapeHtml_(f.correo) + '"' +
        (porComuna ? ' data-comuna="' + escapeHtml_(f.clave || '') + '"' : porSubg ? ' data-subg="' + escapeHtml_(f.grupo || '') + '"' : ' data-area="' + f.id_area + '"') +
        ' title="No enviarle este aviso">🚫 Excluir</button></td></tr>').join('') ||
      '<tr><td colspan="5">Nadie recibe este aviso todavía.</td></tr>') + '</tbody></table></div>' +
    (sinDest.length ? '<div style="font-size:12px;color:#DC2626;margin-top:6px;">⚠️ Sin destinatarios: ' + sinDest.map(g => escapeHtml_(aTitulo_(g))).join(', ') + '</div>' : '');

  return '<div class="co-aviso" data-co-aviso="' + escapeHtml_(t) + '" style="border:1px solid var(--border);border-radius:12px;padding:14px;margin-bottom:14px;">' +
    '<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;"><h3 style="margin:0;font-size:15px;">' + escapeHtml_(a.nombre) + '</h3>' +
      '<span style="display:inline-block;padding:2px 9px;border-radius:10px;font-size:11px;font-weight:700;color:#fff;background:' + (a.activo ? '#16A34A' : '#94A3B8') + ';">' + escapeHtml_(proximo) + '</span>' +
      '<small style="color:var(--text-tertiary);margin-left:auto;">Último envío: ' + (a.ultimo_envio ? escapeHtml_(String(a.ultimo_envio).split('-').reverse().join('-')) : 'nunca') + '</small></div>' +
    '<p style="font-size:12.5px;color:var(--text-tertiary);margin:6px 0 10px;">' + escapeHtml_(a.descripcion || '') + '</p>' +
    '<div style="display:flex;gap:12px;flex-wrap:wrap;align-items:center;margin-bottom:10px;">' + chk('activo', '<b>Activo</b> (envío automático)', a.activo) +
      '<span style="font-size:13px;display:inline-flex;gap:4px;align-items:center;">Días ' + [1, 2, 3, 4, 5, 6, 7].map(d =>
        '<label title="' + CO_DIAS[d] + '" style="display:inline-flex;flex-direction:column;align-items:center;font-size:11px;padding:2px 4px;border:1px solid var(--border);border-radius:6px;cursor:pointer;">' +
        CO_DIAS_CORTOS[d] + '<input type="checkbox" data-co-dia="' + d + '"' + (dias.includes(d) ? ' checked' : '') + '></label>').join('') + '</span>' +
      '<label style="font-size:13px;">Hora <select data-co-f="hora" class="admin-search" style="max-width:100px;">' + Array.from({ length: 24 }, (_, h) => opt(h, String(h).padStart(2, '0') + ':00', a.hora === h)).join('') + '</select></label></div>' +
    (porComuna
      ? '<div style="margin-bottom:10px;">Lo reciben: ' + chk('grd', 'GRD (el de su comuna)', op.grd !== false) + chk('admin', 'Administradores (consolidado)', op.admin !== false) + '</div>' +
        '<div style="margin-bottom:10px;font-size:13px;">Comuna de referencia del consolidado: <select data-co-f="comuna_ref" class="admin-search" style="max-width:240px;">' +
          opt('', '(la primera comuna con GRD)', !op.comuna_ref) + todasComunas.map(c => opt(c.id, c.comuna, String(op.comuna_ref || '') === String(c.id))).join('') + '</select>' +
          ' <small style="color:var(--text-tertiary);">El Administrador recibe la tabla de todas las comunas con GRD y el resumen completo de esta comuna.</small></div>'
      : porSubg
      ? '<div style="margin-bottom:10px;">Lo reciben: ' + chk('subgerentes', 'Subgerentes (de su subgerencia)', a.incluir_subgerentes) + ' <small style="color:var(--text-tertiary);">+ los correos extra de abajo</small></div>'
      : '<div style="margin-bottom:10px;">Lo reciben: ' +
          chk('jefes', 'Jefes de Área', a.incluir_jefes, 'Jefe de Área Relacionamiento con el área en su perfil (no Subgerentes ni GRT)') +
          chk('subgerentes', 'Subgerentes', a.incluir_subgerentes, 'Reciben el correo de cada área de su subgerencia') +
          chk('grt', 'GRT', a.incluir_grt, 'Gestores de Relacionamiento Territorial del área') +
          chk('delegados', 'Delegado de prevención', a.incluir_delegados, 'Delegado de prevención del área') + '</div>') +
    '<button class="btn-primary" data-co-guardar>💾 Guardar</button>' +

    '<div style="border-top:1px solid var(--border);margin-top:12px;padding-top:12px;display:flex;gap:8px;flex-wrap:wrap;align-items:center;">' +
      selector + '<button class="btn-secondary" data-co-ver>👁️ Vista previa</button>' +
      '<input data-co-para class="admin-search" type="email" placeholder="correo para la prueba" value="' + escapeHtml_((state.user && state.user.email) || '') + '" style="max-width:250px;">' +
      '<button class="btn-secondary" data-co-prueba>📨 Enviar prueba</button>' +
      '<button class="btn-primary" data-co-ahora style="margin-left:auto;" title="Envía ya este aviso a todos sus destinatarios, aunque ya lo hayan recibido esta semana">🚀 Enviar ahora a todos (' + filas.length + ')</button></div>' +
    (S.vistas[t] ? '<iframe data-co-iframe="' + escapeHtml_(t) + '" style="width:100%;height:640px;border:1px solid var(--border);border-radius:10px;background:#fff;margin-top:12px;"></iframe>' : '') +

    '<details style="margin-top:12px;"' + (S.abiertos && S.abiertos[t] ? ' open' : '') + ' data-co-det><summary style="cursor:pointer;font-weight:600;font-size:13.5px;">👥 Destinatarios (' + filas.length + ')' +
      (sinDest.length ? ' <span style="color:#DC2626;">· ' + sinDest.length + ' sin destinatario</span>' : '') + '</summary><div style="margin-top:8px;">' + destTabla +
      '<div style="margin-top:12px;font-size:13px;font-weight:600;">Agregar un correo extra o excluir uno</div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:6px;">' +
        '<input data-co-x="correo" class="admin-search" type="email" placeholder="correo@empresa.cl" style="max-width:230px;">' +
        '<input data-co-x="nombre" class="admin-search" placeholder="Nombre (opcional)" style="max-width:190px;">' +
        (porComuna
          ? '<select data-co-x="grupo" class="admin-search" style="max-width:240px;">' + opt('', '🧾 Consolidado (como un Administrador)', true) +
              todasComunas.map(c => opt(c.id, 'Comuna ' + c.comuna, false)).join('') + '</select>'
          : porSubg
          ? '<select data-co-x="grupo" class="admin-search" style="max-width:220px;">' + opt('', 'Todas las subgerencias (una por cada una)', true) + D.subgs.map(s => opt(s, 'Subgerencia ' + aTitulo_(s), false)).join('') + '</select>'
          : '<select data-co-x="grupo" class="admin-search" style="max-width:220px;">' + opt('', 'Todas las áreas', true) + D.areas.map(x => opt(x.id, x.nombre, false)).join('') + '</select>') +
        '<select data-co-x="tipo" class="admin-search" style="max-width:150px;">' + opt('0', '➕ Recibe', true) + opt('1', '🚫 Excluir', false) + '</select>' +
        '<button class="btn-primary" data-co-x-agregar>Guardar</button></div>' +
      (extras.length ? '<div class="admin-table-wrap" style="margin-top:8px;"><table class="admin-table"><thead><tr><th>Correo</th><th>Nombre</th><th>Alcance</th><th>Tipo</th><th></th></tr></thead><tbody>' +
        extras.map(x => '<tr><td>' + escapeHtml_(x.correo) + '</td><td>' + escapeHtml_(x.nombre || '') + '</td><td>' + escapeHtml_(alcance(x)) + '</td>' +
          '<td>' + (x.excluir ? '<span style="color:#DC2626;">🚫 Excluido</span>' : '➕ Extra') + '</td>' +
          '<td><button class="popup-btn" data-co-borrar="' + x.id + '" title="Quitar">🗑️</button></td></tr>').join('') + '</tbody></table></div>' : '') +
    '</div></details></div>';
}

function coHtmlHistorial_() {
  const S = state.co, D = S.datos, n = k => D.hist.filter(h => h.estado === k).length;
  const nombres = Object.fromEntries(D.avisos.map(a => [a.tipo, a.nombre]));
  const opt = (v, t, s) => '<option value="' + escapeHtml_(v) + '"' + (s ? ' selected' : '') + '>' + escapeHtml_(t) + '</option>';
  const vis = D.hist.filter(h => !S.histEstado || h.estado === S.histEstado);
  return '<div style="margin-bottom:8px;"><select id="co-h-estado" class="admin-search" style="max-width:200px;">' + opt('', 'Todos los estados', !S.histEstado) +
      Object.keys(CO_ESTADOS).map(k => opt(k, CO_ESTADOS[k].t + ' (' + n(k) + ')', S.histEstado === k)).join('') + '</select></div>' +
    '<div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Creado</th><th>Aviso</th><th>Para</th><th>Asunto</th><th>Estado</th><th>Enviado</th><th></th></tr></thead><tbody>' +
    (vis.map(h => '<tr><td style="white-space:nowrap;">' + escapeHtml_(coFecha_(h.creado_en)) + '</td>' +
      '<td><small>' + escapeHtml_(nombres[h.tipo] || h.tipo) + '</small></td>' +
      '<td>' + escapeHtml_(h.nombre || '') + '<small style="display:block;color:var(--text-tertiary);">' + escapeHtml_(h.para) + '</small></td>' +
      '<td>' + (h.es_prueba ? '🧪 ' : '') + escapeHtml_(h.asunto) + (h.error ? '<small style="display:block;color:#DC2626;">' + escapeHtml_(h.error) + '</small>' : '') + '</td>' +
      '<td>' + coChip_(h.estado) + (h.intentos > 1 ? '<small style="display:block;color:var(--text-tertiary);">' + h.intentos + ' intentos</small>' : '') + '</td>' +
      '<td style="white-space:nowrap;">' + escapeHtml_(coFecha_(h.enviado_en)) + '</td>' +
      '<td style="white-space:nowrap;">' +
        (['error', 'cancelado'].includes(h.estado) ? '<button class="popup-btn" data-co-reintentar="' + h.id + '">🔁 Reintentar</button>' : '') +
        (h.estado === 'pendiente' ? '<button class="popup-btn" data-co-cancelar="' + h.id + '">✖ Cancelar</button>' : '') + '</td></tr>').join('') ||
      '<tr><td colspan="7">Aún no hay correos' + (S.histEstado ? ' con ese estado' : '') + '.</td></tr>') + '</tbody></table></div>';
}

function coEnlazar_(c) {
  const S = state.co, D = S.datos;
  const recargar = () => adminSeccionCorreos_(c);
  const ocupado = async (btn, txt, fn) => {
    const t0 = btn.textContent; btn.disabled = true; btn.textContent = txt;
    try { await fn(); } catch (e) { mostrarToast_('⚠️ ' + (e.message || e)); } finally { if (btn.isConnected) { btn.disabled = false; btn.textContent = t0; } }
  };
  c.querySelector('#co-recargar').addEventListener('click', recargar);
  c.querySelectorAll('[data-co-tab]').forEach(b => b.addEventListener('click', () => { S.tab = b.dataset.coTab; coRender_(c); }));
  const hEst = c.querySelector('#co-h-estado');
  if (hEst) hEst.addEventListener('change', e => { S.histEstado = e.target.value; coRender_(c); });

  c.querySelectorAll('[data-co-aviso]').forEach(card => {
    const t = card.dataset.coAviso, a = D.avisos.find(x => x.tipo === t), porSubg = coAvisoDestino_(a) === 'subgerencia', porComuna = coAvisoDestino_(a) === 'comuna';
    const filas = (D.dest[t] || { filas: [] }).filas;
    const f = k => card.querySelector('[data-co-f="' + k + '"]');
    const selActual = () => Object.assign({ tipo: t },
      porComuna ? (S.sel[t].comuna === CO_CONSOLIDADO ? { consolidado: true } : { comuna_id: S.sel[t].comuna })
        : porSubg ? { subgerencia: S.sel[t].subgerencia } : { id_area: Number(S.sel[t].id_area) });
    card.querySelector('[data-co-det]').addEventListener('toggle', e => { S.abiertos = S.abiertos || {}; S.abiertos[t] = e.target.open; });
    card.querySelectorAll('[data-co-sel]').forEach(s => s.addEventListener('change', () => {
      S.sel[t][s.dataset.coSel] = s.value; delete S.vistas[t];
      const fr = card.querySelector('[data-co-iframe]'); if (fr) fr.remove();
    }));

    card.querySelector('[data-co-guardar]').addEventListener('click', e => ocupado(e.target, 'Guardando…', async () => {
      if (f('activo').checked && !a.activo && !D.hist.some(h => h.tipo === t && h.es_prueba && h.estado === 'enviado') &&
          !confirm('Aún no se ha enviado una prueba de «' + a.nombre + '» con éxito. ¿Activar igual el envío automático?')) return;
      const val = k => (f(k) ? f(k).checked : null);
      const diasElegidos = [...card.querySelectorAll('[data-co-dia]')].filter(x => x.checked).map(x => Number(x.dataset.coDia));
      if (!diasElegidos.length) throw new Error('Elige al menos un día de la semana.');
      const { error } = await supabaseClient.rpc('correo_guardar_aviso', {
        p_tipo: t, p_activo: f('activo').checked, p_dia: null, p_hora: Number(f('hora').value),
        p_jefes: val('jefes'), p_subgerentes: val('subgerentes'), p_grt: val('grt'), p_delegados: val('delegados'),
        p_dias: diasElegidos,
        p_opciones: porComuna ? { grd: val('grd'), admin: val('admin'), comuna_ref: f('comuna_ref').value || null } : null,
      });
      if (error) throw error;
      mostrarToast_('✅ Aviso guardado');
      recargar();
    }));

    card.querySelector('[data-co-ver]').addEventListener('click', e => ocupado(e.target, 'Armando…', async () => {
      const d = await coInvocar_(Object.assign({ action: 'vista_previa' }, selActual()));
      S.vistas[t] = d.html;
      let fr = card.querySelector('[data-co-iframe]');
      if (!fr) {
        fr = document.createElement('iframe'); fr.dataset.coIframe = t;
        fr.style.cssText = 'width:100%;height:640px;border:1px solid var(--border);border-radius:10px;background:#fff;margin-top:12px;';
        card.querySelector('[data-co-ahora]').parentElement.after(fr);
      }
      fr.srcdoc = d.html;
    }));

    card.querySelector('[data-co-prueba]').addEventListener('click', e => ocupado(e.target, 'Enviando…', async () => {
      const para = card.querySelector('[data-co-para]').value.trim();
      if (!CO_RE_CORREO.test(para)) throw new Error('Escribe un correo válido para la prueba.');
      const d = await coInvocar_(Object.assign({ action: 'prueba', para }, selActual()));
      mostrarToast_(d.enviados ? '📨 Prueba enviada a ' + para : '⚠️ No se pudo enviar: revisa el 🗂️ Historial');
      recargar();
    }));

    card.querySelector('[data-co-ahora]').addEventListener('click', e => {
      if (!filas.length) { mostrarToast_('⚠️ Este aviso no tiene destinatarios.'); return; }
      if (!confirm('¿Enviar AHORA «' + a.nombre + '» a sus ' + filas.length + ' destinatarios?\nSe envía aunque ya lo hayan recibido esta semana.')) return;
      ocupado(e.target, 'Enviando…', async () => {
        const d = await coInvocar_({ action: 'enviar_ahora', tipo: t });
        const enc = (d.encolados && d.encolados.correos) || 0;
        mostrarToast_('🚀 ' + d.enviados + ' enviados' + (d.errores ? ', ' + d.errores + ' con error' : '') + (enc > d.enviados + d.errores ? ' · el resto sale en los próximos minutos' : ''));
        recargar();
      });
    });

    card.querySelector('[data-co-x-agregar]').addEventListener('click', e => ocupado(e.target, 'Guardando…', async () => {
      const x = k => card.querySelector('[data-co-x="' + k + '"]').value.trim();
      if (!CO_RE_CORREO.test(x('correo'))) throw new Error('Correo no válido.');
      const g = x('grupo');
      const { error } = await supabaseClient.rpc('correo_guardar_destinatario', Object.assign({
        p_tipo: t, p_correo: x('correo'), p_nombre: x('nombre') || null,
        p_id_area: !porSubg && !porComuna && g ? Number(g) : null, p_excluir: x('tipo') === '1',
      }, porComuna ? { p_comuna_id: g || null } : porSubg ? { p_subgerencia: g || null } : {}));
      if (error) throw error;
      S.abiertos = Object.assign(S.abiertos || {}, { [t]: true });
      mostrarToast_('✅ Guardado');
      recargar();
    }));
    card.querySelectorAll('[data-co-excluir]').forEach(b => b.addEventListener('click', () => ocupado(b, '…', async () => {
      if (!confirm('¿Dejar de enviar «' + a.nombre + '» a ' + b.dataset.coExcluir + '?')) return;
      const { error } = await supabaseClient.rpc('correo_guardar_destinatario', Object.assign({
        p_tipo: t, p_correo: b.dataset.coExcluir, p_nombre: null, p_id_area: porSubg || porComuna ? null : Number(b.dataset.area), p_excluir: true,
      }, porComuna ? { p_comuna_id: b.dataset.comuna || null } : porSubg ? { p_subgerencia: b.dataset.subg || null } : {}));
      if (error) throw error;
      S.abiertos = Object.assign(S.abiertos || {}, { [t]: true });
      recargar();
    })));
    card.querySelectorAll('[data-co-borrar]').forEach(b => b.addEventListener('click', () => ocupado(b, '…', async () => {
      const { error } = await supabaseClient.rpc('correo_eliminar_destinatario', { p_id: Number(b.dataset.coBorrar) });
      if (error) throw error;
      recargar();
    })));
  });

  const reint = (sel, cancelar) => c.querySelectorAll(sel).forEach(b => b.addEventListener('click', () => ocupado(b, '…', async () => {
    const id = Number(cancelar ? b.dataset.coCancelar : b.dataset.coReintentar);
    const { error } = await supabaseClient.rpc('correo_reintentar', { p_id: id, p_cancelar: cancelar });
    if (error) throw error;
    if (!cancelar) { try { await coInvocar_({ action: 'procesar' }); } catch (e) { /* lo envía el cron */ } }
    recargar();
  })));
  reint('[data-co-reintentar]', false);
  reint('[data-co-cancelar]', true);
}
