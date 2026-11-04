/* ════════════════════════════════════════════════════════════════
 * 🧹 LIMPIEZA DE DATOS (Administración › Control, solo Administrador · SQL 154, 04-11-2026)
 * Busca datos por fuente (registros y planificación de Agricultores, fichas de agricultores, predios, entidades e incendios de la
 * Planificación Territorial), con filtro «Solo posible basura» (sin ubicación, sin nombre, canceladas, vencidas…), y elimina lo
 * seleccionado. Nada se pierde al eliminar: cada fila pasa a la 🗑️ PAPELERA (papelera_datos), desde donde se RESTAURA o se
 * vacía definitivamente. RPC: admin_limpieza_listar / admin_limpieza_eliminar / admin_papelera_restaurar / admin_papelera_vaciar.
 * ════════════════════════════════════════════════════════════════ */
const LIMP_FUENTES = [
  ['agr_registros', '🌾 Agricultores · registros de actividades'],
  ['agr_planificacion', '🌾 Agricultores · planificación'],
  ['agr_agricultores', '🌾 Agricultores · fichas de agricultores'],
  ['agr_predios', '🌾 Agricultores · predios'],
  ['terr_elementos', '🗺️ Planificación Territorial · entidades (puntos, líneas, áreas)'],
  ['terr_incendios', '🗺️ Planificación Territorial · incendios registrados'],
];
state.limp = { vista: 'datos', fuente: 'agr_registros', desde: '', hasta: '', texto: '', sospechosos: true, filas: null, total: 0, sel: new Set(), papelera: null, selP: new Set(), cargando: false };

function limpNombreFuente_(k) { return (LIMP_FUENTES.find(f => f[0] === k) || [k, k])[1]; }
function limpFecha_(ts) { return ts ? new Date(ts).toLocaleString('es-CL', { day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'; }

async function adminSeccionLimpieza_(c) {
  if (!esAdminPerfil_()) { c.innerHTML = adminHead_('🧹 Limpieza de datos', '') + '<div class="layer-empty-msg">Solo el Administrador.</div>'; return; }
  const S = state.limp;
  c.innerHTML = adminHead_('🧹 Limpieza de datos', 'Elimina datos basura o de prueba. Todo lo eliminado queda en la papelera y se puede restaurar.',
    '<button class="btn-' + (S.vista === 'datos' ? 'primary' : 'secondary') + '" data-limp-vista="datos">🔎 Buscar datos</button>' +
    '<button class="btn-' + (S.vista === 'papelera' ? 'primary' : 'secondary') + '" data-limp-vista="papelera">🗑️ Papelera</button>') +
    '<div id="limp-cuerpo"></div>';
  c.onclick = limpClic_; c.onchange = limpCambio_;
  if (S.vista === 'papelera') await limpCargarPapelera_(); else if (S.filas) limpRenderDatos_(); else await limpBuscar_();
}

function limpRenderDatos_() {
  const S = state.limp, cont = document.getElementById('limp-cuerpo'); if (!cont) return;
  const filas = S.filas || [];
  const todos = filas.length && filas.every(f => S.sel.has(f.id));
  cont.innerHTML =
    '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:end;margin-bottom:12px;">' +
      '<label style="display:flex;flex-direction:column;font-size:12px;gap:3px;">Fuente<select id="limp-fuente" class="admin-search" style="min-width:300px;">' +
        LIMP_FUENTES.map(([k, t]) => '<option value="' + k + '"' + (k === S.fuente ? ' selected' : '') + '>' + escapeHtml_(t) + '</option>').join('') + '</select></label>' +
      '<label style="display:flex;flex-direction:column;font-size:12px;gap:3px;">Desde<input type="date" id="limp-desde" class="admin-search" value="' + escapeHtml_(S.desde) + '"></label>' +
      '<label style="display:flex;flex-direction:column;font-size:12px;gap:3px;">Hasta<input type="date" id="limp-hasta" class="admin-search" value="' + escapeHtml_(S.hasta) + '"></label>' +
      '<label style="display:flex;flex-direction:column;font-size:12px;gap:3px;flex:1;min-width:180px;">Texto (resumen, comuna o usuario)<input id="limp-texto" class="admin-search" value="' + escapeHtml_(S.texto) + '" placeholder="Ej. prueba, Victoria, Juan…"></label>' +
      '<label style="display:flex;align-items:center;gap:6px;font-size:13px;padding-bottom:8px;"><input type="checkbox" id="limp-sosp"' + (S.sospechosos ? ' checked' : '') + '> Solo posible basura</label>' +
      '<button class="btn-primary" data-limp="buscar">🔎 Buscar</button></div>' +
    '<p style="font-size:12px;color:var(--text-tertiary);margin:0 0 8px;">«Posible basura»: sin ubicación, sin datos o sin nombre, canceladas o vencidas hace más de 30 días, geometría inválida, agricultores sin registros… ' +
      'Revisa antes de eliminar: no todo lo marcado es basura.</p>' +
    (S.cargando ? '<div class="layer-empty-msg">Buscando…</div>' : S.error ? '<div class="layer-empty-msg">⚠️ ' + escapeHtml_(S.error) + '</div>' :
    '<div style="display:flex;align-items:center;gap:10px;margin-bottom:6px;flex-wrap:wrap;"><b>' + S.total.toLocaleString('es-CL') + '</b> encontrado(s)' +
      (S.total > filas.length ? ' <small style="color:var(--text-tertiary);">(se muestran ' + filas.length + '; afina los filtros)</small>' : '') +
      '<span style="margin-left:auto;">' + S.sel.size + ' seleccionado(s)</span>' +
      '<button class="btn-secondary" data-limp="eliminar" style="color:#B91C1C;"' + (S.sel.size ? '' : ' disabled') + '>🗑️ Eliminar seleccionados</button></div>' +
    '<div class="admin-table-wrap"><table class="admin-table"><thead><tr><th style="width:30px;"><input type="checkbox" id="limp-todos"' + (todos ? ' checked' : '') + ' title="Seleccionar todo lo listado"></th>' +
      '<th>Fecha</th><th>Usuario</th><th>Comuna</th><th>Resumen</th><th>Posible basura</th></tr></thead><tbody>' +
      (filas.length ? filas.map(f => '<tr><td><input type="checkbox" data-limp-sel="' + escapeHtml_(f.id) + '"' + (S.sel.has(f.id) ? ' checked' : '') + '></td>' +
        '<td style="white-space:nowrap;">' + limpFecha_(f.fecha) + '</td><td>' + escapeHtml_(f.usuario_nombre || (f.usuario ? 'Usuario' : '—')) + '</td><td>' + escapeHtml_(f.comuna || '—') + '</td>' +
        '<td>' + escapeHtml_(f.resumen || '') + '</td><td>' + (f.sospecha ? '<span style="background:#FEF3C7;color:#92400E;border-radius:8px;padding:1px 7px;font-size:11.5px;">' + escapeHtml_(f.sospecha) + '</span>' : '') + '</td></tr>').join('')
        : '<tr><td colspan="6" class="tb-vacio">Sin resultados con estos filtros.</td></tr>') +
      '</tbody></table></div>');
}

async function limpBuscar_() {
  const S = state.limp;
  S.cargando = true; S.error = null; S.sel = new Set(); limpRenderDatos_();
  const { data, error } = await supabaseClient.rpc('admin_limpieza_listar', { p_fuente: S.fuente, p_desde: S.desde || null, p_hasta: S.hasta || null,
    p_texto: S.texto || null, p_sospechosos: !!S.sospechosos, p_limite: 1000 });
  S.cargando = false;
  if (error) { S.error = /admin_limpieza_listar|schema cache|does not exist/i.test(error.message) ? 'Falta ejecutar en Supabase el SQL 154 (sql/pendientes/154_creador_edita_y_limpieza.sql).' : error.message; S.filas = []; S.total = 0; }
  else { S.filas = (data && data.filas) || []; S.total = (data && data.total) || 0; }
  limpRenderDatos_();
}

async function limpEliminar_() {
  const S = state.limp, ids = [...S.sel]; if (!ids.length) return;
  const motivo = prompt('Vas a eliminar ' + ids.length + ' fila(s) de «' + limpNombreFuente_(S.fuente) + '».\nQuedarán en la 🗑️ Papelera (se pueden restaurar).\n\nMotivo (opcional):', 'Datos de prueba / basura');
  if (motivo === null) return;
  const { data, error } = await supabaseClient.rpc('admin_limpieza_eliminar', { p_fuente: S.fuente, p_ids: ids, p_motivo: motivo });
  if (error) { mostrarToast_('No se pudo eliminar: ' + error.message); return; }
  mostrarToast_('🗑️ ' + (data || 0) + ' fila(s) movida(s) a la papelera.');
  S.papelera = null;
  await limpBuscar_();
}

async function limpCargarPapelera_() {
  const S = state.limp, cont = document.getElementById('limp-cuerpo'); if (!cont) return;
  cont.innerHTML = '<div class="layer-empty-msg">Cargando la papelera…</div>';
  const { data, error } = await supabaseClient.from('papelera_datos').select('id, fuente, registro_id, resumen, motivo, eliminado_por, eliminado_en, restaurado_en')
    .order('eliminado_en', { ascending: false }).limit(1000);
  if (error) { cont.innerHTML = '<div class="layer-empty-msg">⚠️ ' + escapeHtml_(/papelera_datos|does not exist|schema cache/i.test(error.message) ? 'Falta ejecutar en Supabase el SQL 154.' : error.message) + '</div>'; return; }
  S.papelera = data || []; S.selP = new Set();
  const ids = [...new Set(S.papelera.map(p => p.eliminado_por).filter(Boolean))];
  S.nombres = {};
  if (ids.length) { const { data: pf } = await supabaseClient.from('perfiles').select('id, nombre_completo').in('id', ids); (pf || []).forEach(p => { S.nombres[p.id] = p.nombre_completo; }); }
  limpRenderPapelera_();
}

function limpRenderPapelera_() {
  const S = state.limp, cont = document.getElementById('limp-cuerpo'); if (!cont) return;
  const P = S.papelera || [], vivos = P.filter(p => !p.restaurado_en);
  cont.innerHTML =
    '<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;flex-wrap:wrap;"><b>' + vivos.length + '</b> en la papelera' +
      (P.length > vivos.length ? ' · <small style="color:var(--text-tertiary);">' + (P.length - vivos.length) + ' ya restaurado(s)</small>' : '') +
      '<span style="margin-left:auto;">' + S.selP.size + ' seleccionado(s)</span>' +
      '<button class="btn-primary" data-limp="restaurar"' + (S.selP.size ? '' : ' disabled') + '>↩️ Restaurar</button>' +
      '<button class="btn-secondary" data-limp="vaciar" style="color:#B91C1C;"' + (S.selP.size ? '' : ' disabled') + '>🔥 Eliminar definitivamente</button></div>' +
    '<p style="font-size:12px;color:var(--text-tertiary);margin:0 0 8px;">Aquí llega todo lo eliminado con 🧹 Limpieza y los registros de Agricultores que borran sus autores. «Eliminar definitivamente» no se puede deshacer.</p>' +
    '<div class="admin-table-wrap"><table class="admin-table"><thead><tr><th style="width:30px;"><input type="checkbox" id="limp-todos-p"' + (vivos.length && vivos.every(p => S.selP.has(p.id)) ? ' checked' : '') + '></th>' +
      '<th>Eliminado</th><th>Por</th><th>Fuente</th><th>Resumen</th><th>Motivo</th><th>Estado</th></tr></thead><tbody>' +
      (P.length ? P.map(p => '<tr' + (p.restaurado_en ? ' style="opacity:.55;"' : '') + '><td>' + (p.restaurado_en ? '' : '<input type="checkbox" data-limp-selp="' + p.id + '"' + (S.selP.has(p.id) ? ' checked' : '') + '>') + '</td>' +
        '<td style="white-space:nowrap;">' + limpFecha_(p.eliminado_en) + '</td><td>' + escapeHtml_(S.nombres[p.eliminado_por] || '—') + '</td>' +
        '<td>' + escapeHtml_(limpNombreFuente_(p.fuente)) + '</td><td>' + escapeHtml_(p.resumen || p.registro_id) + '</td><td>' + escapeHtml_(p.motivo || '') + '</td>' +
        '<td>' + (p.restaurado_en ? '↩️ Restaurado ' + limpFecha_(p.restaurado_en) : 'En papelera') + '</td></tr>').join('')
        : '<tr><td colspan="7" class="tb-vacio">La papelera está vacía.</td></tr>') +
      '</tbody></table></div>';
}

async function limpRestaurar_() {
  const S = state.limp, ids = [...S.selP]; if (!ids.length) return;
  if (!confirm('¿Restaurar ' + ids.length + ' fila(s) a su lugar original?')) return;
  const { data, error } = await supabaseClient.rpc('admin_papelera_restaurar', { p_ids: ids });
  if (error) { mostrarToast_('No se pudo restaurar: ' + error.message); return; }
  const errores = (data && data.errores) || [];
  mostrarToast_('↩️ ' + ((data && data.restaurados) || 0) + ' restaurado(s)' + (errores.length ? ' · ' + errores.length + ' con error' : '') + '.');
  if (errores.length) alert('No se pudieron restaurar:\n\n' + errores.map(e => '• ' + (e.resumen || e.id) + ': ' + e.error).join('\n'));
  S.filas = null;
  await limpCargarPapelera_();
}

async function limpVaciar_() {
  const S = state.limp, ids = [...S.selP]; if (!ids.length) return;
  const txt = prompt('Eliminar DEFINITIVAMENTE ' + ids.length + ' fila(s) de la papelera. No se puede deshacer.\n\nEscribe ELIMINAR para confirmar:');
  if (txt === null) return;
  if (txt.trim().toUpperCase() !== 'ELIMINAR') { mostrarToast_('No se eliminó: no escribiste ELIMINAR.'); return; }
  const { data, error } = await supabaseClient.rpc('admin_papelera_vaciar', { p_ids: ids });
  if (error) { mostrarToast_('No se pudo: ' + error.message); return; }
  mostrarToast_('🔥 ' + (data || 0) + ' fila(s) eliminada(s) definitivamente.');
  await limpCargarPapelera_();
}

function limpClic_(e) {
  const S = state.limp, t = e.target;
  const v = t.closest('[data-limp-vista]');
  if (v) { S.vista = v.dataset.limpVista; adminSeccionLimpieza_(document.getElementById('admin-content')); return; }
  const a = t.closest('[data-limp]'); if (!a || a.disabled) return;
  const x = a.dataset.limp;
  if (x === 'buscar') { limpLeerFiltros_(); limpBuscar_(); }
  else if (x === 'eliminar') limpEliminar_();
  else if (x === 'restaurar') limpRestaurar_();
  else if (x === 'vaciar') limpVaciar_();
}
function limpLeerFiltros_() {
  const S = state.limp, val = id => (document.getElementById(id) || {}).value || '';
  S.fuente = val('limp-fuente') || S.fuente; S.desde = val('limp-desde'); S.hasta = val('limp-hasta'); S.texto = val('limp-texto').trim();
  const sp = document.getElementById('limp-sosp'); if (sp) S.sospechosos = sp.checked;
}
function limpCambio_(e) {
  const S = state.limp, t = e.target;
  if (t.id === 'limp-fuente' || t.id === 'limp-sosp') { limpLeerFiltros_(); limpBuscar_(); return; }
  if (t.dataset.limpSel) { if (t.checked) S.sel.add(t.dataset.limpSel); else S.sel.delete(t.dataset.limpSel); limpRenderDatos_(); return; }
  if (t.id === 'limp-todos') { (S.filas || []).forEach(f => { if (t.checked) S.sel.add(f.id); else S.sel.delete(f.id); }); limpRenderDatos_(); return; }
  if (t.dataset.limpSelp) { const id = Number(t.dataset.limpSelp); if (t.checked) S.selP.add(id); else S.selP.delete(id); limpRenderPapelera_(); return; }
  if (t.id === 'limp-todos-p') { (S.papelera || []).filter(p => !p.restaurado_en).forEach(p => { if (t.checked) S.selP.add(p.id); else S.selP.delete(p.id); }); limpRenderPapelera_(); }
}
