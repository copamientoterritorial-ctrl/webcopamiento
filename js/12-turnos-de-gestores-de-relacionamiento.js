/* ==================== 👥 TURNOS DE GESTORES DE RELACIONAMIENTO (Planificador CMPC ▾, 20-10-2026, SQL 134) ====================
 * Cada área de relacionamiento programa día a día a sus gestores (gestores_relacionamiento.area, puede traer varias « / »).
 * Pincel (Turno / Libre / Vacaciones / Licencia / Capacitación / Borrar): clic o arrastre sobre las celdas; doble clic = horario y
 * observación. Se guarda solo (upsert por lotes). Editan Admin y Jefes / Subgerentes del área (puede_gestionar_turnos_gestor_);
 * los GRT ven sus turnos. */
const TG_ESTADOS = {
  turno: { t: 'Turno', l: 'T', bg: '#16A34A', fg: '#fff' },
  libre: { t: 'Libre', l: 'L', bg: '#E2E8F0', fg: '#475569' },
  vacaciones: { t: 'Vacaciones', l: 'V', bg: '#2563EB', fg: '#fff' },
  licencia: { t: 'Licencia', l: 'LM', bg: '#DC2626', fg: '#fff' },
  capacitacion: { t: 'Capacitación', l: 'C', bg: '#7C3AED', fg: '#fff' },
};
state.tg = { mes: null, area: '', pincel: 'turno', turnos: {}, listeners: false, sinSql: false, pendientes: new Map(), timer: null, pintando: false };
function puedeTurnosGestores_() { return esAdminOJefe_(); }
function tgAreasDe_(g) { return String((g && g.area) || '').split(/\s*\/\s*/).map(s => s.trim()).filter(Boolean); }
function tgPuedeEditar_(g) {
  if (state.perfil && state.perfil.perfil === 'Administrador') return true;
  if (!esAdminOJefe_() || state.esGRT) return false;
  const mias = new Set((state.misAreasIds || []).map(SG_KEY));
  return tgAreasDe_(g).some(a => mias.has(SG_KEY(a)));
}
function tgMesISO_(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); }

async function abrirTurnosGestores_() {
  const S = state.tg;
  if (!S.mes) { const h = new Date(); S.mes = new Date(h.getFullYear(), h.getMonth(), 1); }
  if (!S.listeners) {
    S.listeners = true;
    document.getElementById('tg-prev').addEventListener('click', () => { S.mes = new Date(S.mes.getFullYear(), S.mes.getMonth() - 1, 1); cargarTurnosGestores_(); });
    document.getElementById('tg-next').addEventListener('click', () => { S.mes = new Date(S.mes.getFullYear(), S.mes.getMonth() + 1, 1); cargarTurnosGestores_(); });
    document.getElementById('tg-hoy').addEventListener('click', () => { const h = new Date(); S.mes = new Date(h.getFullYear(), h.getMonth(), 1); cargarTurnosGestores_(); });
    document.getElementById('tg-area').addEventListener('change', e => { S.area = e.target.value; renderTurnosGestores_(); });
    document.getElementById('tg-excel').addEventListener('click', descargarTurnosGestores_);
    document.getElementById('tg-pinceles').addEventListener('click', e => {
      const b = e.target.closest('[data-tg-pincel]'); if (!b) return;
      S.pincel = b.dataset.tgPincel; pintarPincelesTg_();
    });
    const cuerpo = document.getElementById('tg-cuerpo');
    cuerpo.addEventListener('mousedown', e => {
      const c = e.target.closest('[data-tg]'); if (!c || c.classList.contains('ro') || e.button !== 0) return;
      e.preventDefault(); S.pintando = true; aplicarPincelTg_(c);
    });
    cuerpo.addEventListener('mouseover', e => { if (!S.pintando) return; const c = e.target.closest('[data-tg]'); if (c && !c.classList.contains('ro')) aplicarPincelTg_(c); });
    document.addEventListener('mouseup', () => { if (S.pintando) { S.pintando = false; renderTotalesTg_(); } });
    cuerpo.addEventListener('dblclick', e => { const c = e.target.closest('[data-tg]'); if (c && !c.classList.contains('ro')) editarDetalleTg_(c.dataset.tg); });
  }
  pintarPincelesTg_();
  await cargarTurnosGestores_();
}
function pintarPincelesTg_() {
  const S = state.tg, cont = document.getElementById('tg-pinceles');
  cont.innerHTML = Object.keys(TG_ESTADOS).map(k => '<button data-tg-pincel="' + k + '"' + (S.pincel === k ? ' class="on"' : '') + ' title="Pintar «' + TG_ESTADOS[k].t + '»"><i style="background:' + TG_ESTADOS[k].bg + '"></i>' + TG_ESTADOS[k].t + '</button>').join('') +
    '<button data-tg-pincel="borrar"' + (S.pincel === 'borrar' ? ' class="on"' : '') + ' title="Borrar el día"><i style="background:#fff;border:1px dashed #94A3B8;"></i>Borrar</button>';
}

async function cargarTurnosGestores_() {
  const S = state.tg, est = document.getElementById('tg-estado'), cuerpo = document.getElementById('tg-cuerpo');
  est.textContent = 'Cargando…';
  document.getElementById('tg-mes').textContent = S.mes.toLocaleDateString('es-CL', { month: 'long', year: 'numeric' }).replace(/^./, c => c.toUpperCase());
  await cargarGestoresRutas_(true);
  if (state.gest.sinSql) { cuerpo.innerHTML = '<div class="gr-aviso">⚠️ Falta ejecutar en Supabase el SQL 128 (catálogo de gestores).</div>'; est.textContent = 'Error'; return; }
  const ini = tgMesISO_(S.mes) + '-01', finD = new Date(S.mes.getFullYear(), S.mes.getMonth() + 1, 0), fin = tgMesISO_(S.mes) + '-' + String(finD.getDate()).padStart(2, '0');
  const { data, error } = await supabaseClient.from('gestor_turnos').select('*').gte('fecha', ini).lte('fecha', fin);
  if (error) {
    S.sinSql = /gestor_turnos/.test(error.message);
    cuerpo.innerHTML = '<div class="gr-aviso">⚠️ ' + (S.sinSql ? 'Falta ejecutar en Supabase el SQL 134 (sql/pendientes/134_turnos_gestores.sql).' : escapeHtml_(error.message)) + '</div>';
    est.textContent = 'Error'; return;
  }
  S.turnos = {}; (data || []).forEach(t => { S.turnos[t.gestor_id + '|' + t.fecha] = t; });
  // Áreas: el Administrador ve todas las de los gestores; los demás, las suyas
  const areas = new Map();
  if (state.perfil && state.perfil.perfil === 'Administrador') (state.gest.lista || []).forEach(g => tgAreasDe_(g).forEach(a => { if (!areas.has(SG_KEY(a))) areas.set(SG_KEY(a), a); }));
  else (state.misAreasIds || []).forEach(a => areas.set(SG_KEY(a), a));
  const sel = document.getElementById('tg-area');
  const opciones = [...areas.entries()].sort((a, b) => a[1].localeCompare(b[1], 'es'));
  sel.innerHTML = (opciones.length > 1 ? '<option value="">Todas mis áreas</option>' : '') + opciones.map(([k, n]) => '<option value="' + escapeHtml_(k) + '">' + escapeHtml_(aTitulo_(n)) + '</option>').join('');
  if (S.area && opciones.some(([k]) => k === S.area)) sel.value = S.area; else { S.area = opciones.length === 1 ? opciones[0][0] : ''; sel.value = S.area; }
  est.textContent = 'Actualizado ' + new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
  renderTurnosGestores_();
}

function tgGestoresVisibles_() {
  const S = state.tg, misClaves = new Set((state.misAreasIds || []).map(SG_KEY)), esAdmin = state.perfil && state.perfil.perfil === 'Administrador';
  return (state.gest.lista || []).filter(g => g.activo !== false && tgAreasDe_(g).some(a => S.area ? SG_KEY(a) === S.area : (esAdmin || misClaves.has(SG_KEY(a)))))
    .sort((a, b) => String(a.codigo).localeCompare(String(b.codigo)));
}
function tgCeldaHtml_(g, f, editable) {
  const t = state.tg.turnos[g.id + '|' + f], e = t && TG_ESTADOS[t.estado];
  const tit = (e ? e.t : 'Sin programar') + (t && t.horario ? ' · ' + t.horario : '') + (t && t.observacion ? ' · ' + t.observacion : '') + (editable ? ' · doble clic: horario / nota' : '');
  return '<div class="tg-c' + (editable ? '' : ' ro') + '" data-tg="' + g.id + '|' + f + '" title="' + escapeHtml_(tit) + '"' +
    (e ? ' style="background:' + e.bg + ';color:' + e.fg + ';"' : '') + '>' + (e ? e.l + (t.horario || t.observacion ? '•' : '') : '') + '</div>';
}
function renderTurnosGestores_() {
  const S = state.tg, cuerpo = document.getElementById('tg-cuerpo');
  const gestores = tgGestoresVisibles_();
  const nDias = new Date(S.mes.getFullYear(), S.mes.getMonth() + 1, 0).getDate(), hoy = tbHoyISO_();
  const dias = []; for (let d = 1; d <= nDias; d++) { const f = tgMesISO_(S.mes) + '-' + String(d).padStart(2, '0'); dias.push({ d, f, dow: new Date(S.mes.getFullYear(), S.mes.getMonth(), d).getDay() }); }
  if (!gestores.length) {
    cuerpo.innerHTML = '<div class="tb-vacio">No hay gestores de relacionamiento ' + (S.area ? 'en esta área' : 'en tus áreas') + '. Se agregan en Gestión Patrullajes SIGEI › 👥 Gestores (columna «Área»).</div>';
    return;
  }
  const algunoEditable = gestores.some(tgPuedeEditar_);
  cuerpo.innerHTML =
    '<div style="overflow:auto;"><table class="tg-tabla"><thead><tr><th class="tg-nom">Gestor</th>' +
      dias.map(x => '<th class="' + (x.dow === 0 || x.dow === 6 ? 'finde ' : '') + (x.f === hoy ? 'hoy' : '') + '">' + ['D', 'L', 'M', 'M', 'J', 'V', 'S'][x.dow] + '<br>' + x.d + '</th>').join('') +
      '<th>Turnos</th></tr></thead><tbody>' +
      gestores.map(g => {
        const ed = tgPuedeEditar_(g);
        return '<tr><td class="tg-nom"><b>' + escapeHtml_(g.codigo + ' · ' + g.nombre) + '</b><small>' + escapeHtml_(tgAreasDe_(g).map(aTitulo_).join(' / ') || 'Sin área') + (g.telefono ? ' · ' + escapeHtml_(g.telefono) : '') + (ed ? '' : ' · 👁️ solo lectura') + '</small></td>' +
          dias.map(x => '<td class="' + (x.dow === 0 || x.dow === 6 ? 'finde' : '') + '">' + tgCeldaHtml_(g, x.f, ed) + '</td>').join('') +
          '<td class="tg-tot" data-tg-tot="' + g.id + '"></td></tr>';
      }).join('') +
      '</tbody><tfoot><tr><td class="tg-nom">Gestores de turno</td>' + dias.map(x => '<td data-tg-cob="' + x.f + '"></td>').join('') + '<td></td></tr></tfoot></table></div>' +
    '<div class="tg-ley">' + Object.keys(TG_ESTADOS).map(k => '<span><i style="background:' + TG_ESTADOS[k].bg + '"></i>' + TG_ESTADOS[k].l + ' = ' + TG_ESTADOS[k].t + '</span>').join('') +
      '<span>• = con horario o nota</span>' + (algunoEditable ? '<span>✏️ Elige el pincel arriba y haz clic o arrastra sobre los días · doble clic = horario / nota · se guarda solo</span>' : '<span>👁️ Solo lectura</span>') + '</div>';
  renderTotalesTg_();
}
function renderTotalesTg_() {
  const S = state.tg, gestores = tgGestoresVisibles_();
  gestores.forEach(g => {
    const el = document.querySelector('[data-tg-tot="' + g.id + '"]'); if (!el) return;
    el.textContent = Object.keys(S.turnos).filter(k => k.startsWith(g.id + '|') && S.turnos[k].estado === 'turno').length;
  });
  document.querySelectorAll('[data-tg-cob]').forEach(el => {
    const f = el.dataset.tgCob, n = gestores.filter(g => S.turnos[g.id + '|' + f] && S.turnos[g.id + '|' + f].estado === 'turno').length;
    el.textContent = n; el.classList.toggle('tg-cob0', n === 0);
    el.title = n === 0 ? 'Sin gestores de turno este día' : n + ' gestor(es) de turno';
  });
}
function aplicarPincelTg_(celda) {
  const S = state.tg, clave = celda.dataset.tg, [gid, f] = clave.split('|');
  const g = (state.gest.lista || []).find(x => String(x.id) === gid);
  if (!g || !tgPuedeEditar_(g)) return;
  const actual = S.turnos[clave];
  if (S.pincel === 'borrar') { if (!actual) return; delete S.turnos[clave]; S.pendientes.set(clave, null); }
  else {
    if (actual && actual.estado === S.pincel) return;
    S.turnos[clave] = Object.assign({}, actual || {}, { gestor_id: Number(gid), fecha: f, estado: S.pincel });
    S.pendientes.set(clave, S.turnos[clave]);
  }
  celda.outerHTML = tgCeldaHtml_(g, f, true);
  clearTimeout(S.timer); S.timer = setTimeout(guardarTurnosGestores_, 700);
}
async function editarDetalleTg_(clave) {
  const S = state.tg, [gid, f] = clave.split('|'), g = (state.gest.lista || []).find(x => String(x.id) === gid);
  if (!g || !tgPuedeEditar_(g)) return;
  const t = S.turnos[clave] || { gestor_id: Number(gid), fecha: f, estado: 'turno' };
  const horario = prompt(g.nombre + ' · ' + new Date(f + 'T12:00:00').toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' }) +
    '\n\nHorario (ej. 08:00-17:00; vacío = sin horario):', t.horario || '');
  if (horario === null) return;
  const obs = prompt('Observación (opcional):', t.observacion || '');
  if (obs === null) return;
  S.turnos[clave] = Object.assign({}, t, { horario: horario.trim() || null, observacion: obs.trim() || null });
  S.pendientes.set(clave, S.turnos[clave]);
  const c = document.querySelector('[data-tg="' + clave + '"]'); if (c) c.outerHTML = tgCeldaHtml_(g, f, true);
  await guardarTurnosGestores_();
}
async function guardarTurnosGestores_() {
  const S = state.tg; if (!S.pendientes.size) return;
  const lote = [...S.pendientes.entries()]; S.pendientes.clear();
  const est = document.getElementById('tg-estado'); est.textContent = 'Guardando…';
  const upserts = lote.filter(([, v]) => v).map(([, v]) => ({ gestor_id: v.gestor_id, fecha: v.fecha, estado: v.estado, horario: v.horario || null, observacion: v.observacion || null }));
  const borrar = lote.filter(([, v]) => !v).map(([k]) => k.split('|'));
  const errores = [];
  if (upserts.length) { const { error } = await supabaseClient.from('gestor_turnos').upsert(upserts, { onConflict: 'gestor_id,fecha' }); if (error) errores.push(error.message); }
  for (const [gid, f] of borrar) { const { error } = await supabaseClient.from('gestor_turnos').delete().eq('gestor_id', Number(gid)).eq('fecha', f); if (error) errores.push(error.message); }
  if (errores.length) {
    est.textContent = 'Error al guardar';
    mostrarToast_('⚠️ No se pudieron guardar algunos turnos: ' + errores[0] + (/row-level|policy/i.test(errores[0]) ? ' (solo el Jefe del área del gestor puede programarlo)' : ''));
    await cargarTurnosGestores_();   // vuelve a lo que realmente quedó guardado
    return;
  }
  est.textContent = '✅ Guardado ' + new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
}
async function descargarTurnosGestores_() {
  const S = state.tg, gestores = tgGestoresVisibles_();
  if (!gestores.length) { mostrarToast_('No hay gestores para descargar.'); return; }
  try {
    const XLSX = await tbCargarSheetJs_();
    const nDias = new Date(S.mes.getFullYear(), S.mes.getMonth() + 1, 0).getDate();
    const filas = gestores.map(g => {
      const fila = { 'Código': g.codigo, 'Gestor': g.nombre, 'Área': tgAreasDe_(g).join(' / '), 'Teléfono': g.telefono || '' };
      let n = 0;
      for (let d = 1; d <= nDias; d++) {
        const f = tgMesISO_(S.mes) + '-' + String(d).padStart(2, '0'), t = S.turnos[g.id + '|' + f];
        if (t && t.estado === 'turno') n++;
        fila[String(d)] = t ? (TG_ESTADOS[t.estado] || { l: t.estado }).l + (t.horario ? ' ' + t.horario : '') : '';
      }
      fila['Días de turno'] = n;
      return fila;
    });
    const detalle = [];
    gestores.forEach(g => Object.keys(S.turnos).filter(k => k.startsWith(g.id + '|')).sort().forEach(k => { const t = S.turnos[k];
      detalle.push({ 'Fecha': t.fecha, 'Código': g.codigo, 'Gestor': g.nombre, 'Estado': (TG_ESTADOS[t.estado] || { t: t.estado }).t, 'Horario': t.horario || '', 'Observación': t.observacion || '' }); }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(filas), 'Calendario');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(detalle.length ? detalle : [{ 'Sin turnos': '' }]), 'Detalle');
    XLSX.writeFile(wb, 'turnos_gestores_' + tgMesISO_(S.mes) + '.xlsx');
  } catch (e) { mostrarToast_('No se pudo generar el Excel: ' + (e.message || e)); }
}

/* ============ NAVEGACIÓN DE VISTAS: Dashboard | Mapa ============ */
state.vistaActual = 'dashboard';
// ════════════════════════════════════════════════════════════════
// CALENDARIO DE TURNOS POR RECURSO — v2
// Fuente de recursos: recursos_disponibles_area_geojson (la MISMA que usa
// la capa "Recursos Disponibles" del mapa), así los IDs de recurso_turnos
// coinciden con los markers y el filtro "Solo recursos en turno hoy" funciona.
// Regla de negocio: no se puede asignar turno antes de fecha_inicio_operacion
// (validado en UI y en BD con trigger trg_validar_turno_inicio).
// ════════════════════════════════════════════════════════════════
state.turnosVista = state.turnosVista || 'mes';   // por defecto el mes completo (14-10-2026)
state.turnosFechaBase = state.turnosFechaBase || new Date();
state.turnosArea = state.turnosArea || null;
state.turnosRecursos = state.turnosRecursos || [];
state.turnosData = state.turnosData || {};   // { 'recursoId|YYYY-MM-DD': true }
state.turnosFiltroTipo = state.turnosFiltroTipo || '';
state.turnosBusqueda = state.turnosBusqueda || '';

const TURNOS_MESES_CORTOS = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
const TURNOS_MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const TURNOS_DIAS = ['D','L','M','M','J','V','S'];
const turnosPendientes_ = [];
let turnosGuardando_ = null;
let turnosArrastre_ = null;          // { valor, vistos:Set } mientras se arrastra
let turnosInicioEditando_ = null;    // recurso que se edita en el modal de fecha de inicio

function fechaISO_(d) {
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}
function parseISOLocal_(iso) {
  if (!iso) return null;
  const partes = String(iso).slice(0, 10).split('-').map(Number);
  if (partes.length !== 3 || !partes[0]) return null;
  return new Date(partes[0], partes[1] - 1, partes[2]);
}
function formatoFechaCorta_(iso) {
  const d = parseISOLocal_(iso);
  if (!d) return '—';
  return String(d.getDate()).padStart(2,'0') + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + d.getFullYear();
}
function inicioRecursoISO_(r) {
  return (r && r.fecha_inicio_operacion) ? String(r.fecha_inicio_operacion).slice(0, 10) : null;
}
/** true si el recurso puede tener turno ese día (no hay fecha de inicio, o el día es >= inicio). */
function turnoPermitido_(r, iso) {
  const ini = inicioRecursoISO_(r);
  return !ini || iso >= ini;
}
function recursoTurnoPorId_(id) {
  return state.turnosRecursos.find(r => String(r.id) === String(id)) || null;
}

function fechasDelPeriodo_() {
  const base = new Date(state.turnosFechaBase);
  const fechas = [];
  if (state.turnosVista === 'semana') {
    const dia = base.getDay(); const offset = dia === 0 ? -6 : 1 - dia;
    const lunes = new Date(base); lunes.setDate(base.getDate() + offset);
    for (let i = 0; i < 7; i++) { const d = new Date(lunes); d.setDate(lunes.getDate() + i); fechas.push(d); }
  } else {
    const y = base.getFullYear(), m = base.getMonth();
    const dias = new Date(y, m + 1, 0).getDate();
    for (let i = 1; i <= dias; i++) fechas.push(new Date(y, m, i));
  }
  return fechas;
}
function etiquetaPeriodo_() {
  const fechas = fechasDelPeriodo_();
  if (state.turnosVista === 'semana') {
    const a = fechas[0], b = fechas[6];
    return a.getDate() + ' ' + TURNOS_MESES_CORTOS[a.getMonth()] + ' – ' + b.getDate() + ' ' + TURNOS_MESES_CORTOS[b.getMonth()] + ' ' + b.getFullYear();
  }
  return TURNOS_MESES[fechas[0].getMonth()] + ' ' + fechas[0].getFullYear();
}

function setEstadoTurnos_(tipo, texto) {
  const el = document.getElementById('turnos-estado');
  if (!el) return;
  el.className = 'turnos-estado' + (tipo ? ' ' + tipo : '');
  el.textContent = texto;
}

function recursosTurnosVisibles_() {
  const tipo = state.turnosFiltroTipo;
  const recSel = state.turnosFiltroRecurso;
  const q = normalizarTextoTurnos_(state.turnosBusqueda);
  return state.turnosRecursos.filter(r => {
    if (recSel && String(r.id) !== String(recSel)) return false;   // un recurso por su clave radial
    if (tipo && (r.tipo_recurso || 'Sin tipo') !== tipo) return false;
    if (!q) return true;
    const inst = (r.instituciones && r.instituciones.nombre) || '';
    const texto = normalizarTextoTurnos_([claveRecurso_(r), r.codigo_ref, r.tipo_recurso, r.nombre_recurso, r.sector, inst, r.descripcion_funcion].join(' '));
    return texto.includes(q);
  });
}
function normalizarTextoTurnos_(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

async function abrirCalendarioTurnos_() {
  const sel = document.getElementById('turnos-area-select');
  // Administrador: todas las áreas. Jefe de Área Relacionamiento: solo las suyas
  // (misAreasIds), viendo todos los recursos de cada una.
  const esAdmin = state.perfil && state.perfil.perfil === 'Administrador';
  const areas = (esAdmin ? (state.areasCatalogo || []) : (state.misAreasIds || []))
    .slice().sort((a, b) => String(a).localeCompare(String(b), 'es'));
  // Si el área guardada ya no está permitida para este usuario, se descarta
  if (state.turnosArea && !areas.includes(state.turnosArea)) state.turnosArea = null;
  // Jefe de Área con una sola área: se selecciona sola (no se oculta el selector por si tuviera más)
  if (!state.turnosArea && !esAdmin && areas.length === 1) state.turnosArea = areas[0];
  sel.innerHTML = '<option value="">— Selecciona un área —</option>' +
    areas.map(a => '<option value="' + escapeHtml_(a) + '">' + escapeHtml_(a) + '</option>').join('');
  if (state.turnosArea) sel.value = state.turnosArea;
  document.getElementById('turnos-busqueda').value = state.turnosBusqueda || '';

  if (!state._turnosInit) {
    state._turnosInit = true;
    iniciarListenersTurnos_();
  }
  actualizarControlesTurnos_();
  if (state.turnosArea) await cargarRecursosTurnos_();
  else {
    document.getElementById('turnos-grid').innerHTML = '<div class="turnos-vacio">Selecciona un área para ver y planificar sus recursos.</div>';
    renderKpisTurnos_();
  }
}

function iniciarListenersTurnos_() {
  const sel = document.getElementById('turnos-area-select');
  sel.addEventListener('change', () => {
    state.turnosArea = sel.value || null;
    state.turnosFiltroTipo = ''; state.turnosFiltroRecurso = '';
    if (state.turnosArea) cargarRecursosTurnos_();
    else {
      state.turnosRecursos = []; state.turnosData = {};
      document.getElementById('turnos-grid').innerHTML = '<div class="turnos-vacio">Selecciona un área para ver y planificar sus recursos.</div>';
      renderKpisTurnos_();
    }
  });
  document.getElementById('turnos-tipo-select').addEventListener('change', (e) => {
    state.turnosFiltroTipo = e.target.value;
    poblarClavesTurnos_();   // el filtro de claves deja solo las del tipo elegido
    renderGridTurnos_();
  });
  document.getElementById('turnos-recurso-select').addEventListener('change', (e) => {
    state.turnosFiltroRecurso = e.target.value; renderGridTurnos_();
  });
  document.getElementById('turnos-pdf').addEventListener('click', generarPdfTurnosMensual_);
  const menuPano = document.getElementById('turnos-pano-menu');
  document.getElementById('turnos-pdf-pano').addEventListener('click', (e) => { e.stopPropagation(); menuPano.classList.toggle('show'); });
  menuPano.addEventListener('click', (e) => {
    const b = e.target.closest('[data-pano]');
    if (b) { menuPano.classList.remove('show'); generarPdfPanoramaTurnos_(b.dataset.pano === 'todas'); }
  });
  document.addEventListener('click', (e) => { if (!e.target.closest('.turnos-pano-wrap')) menuPano.classList.remove('show'); });
  // Calendario / Seguimiento
  document.getElementById('turnos-modo-cal').addEventListener('click', () => cambiarModoTurnos_('cal'));
  document.getElementById('turnos-modo-seg').addEventListener('click', () => cambiarModoTurnos_('seg'));
  iniciarListenersSeguimiento_();
  let tBusq = null;
  document.getElementById('turnos-busqueda').addEventListener('input', (e) => {
    clearTimeout(tBusq);
    tBusq = setTimeout(() => { state.turnosBusqueda = e.target.value; renderGridTurnos_(); }, 180);
  });
  document.getElementById('turnos-vista-semana').addEventListener('click', () => cambiarVistaTurnos_('semana'));
  document.getElementById('turnos-vista-mes').addEventListener('click', () => cambiarVistaTurnos_('mes'));
  document.getElementById('turnos-prev').addEventListener('click', () => navegarTurnos_(-1));
  document.getElementById('turnos-next').addEventListener('click', () => navegarTurnos_(1));
  document.getElementById('turnos-hoy').addEventListener('click', () => {
    state.turnosFechaBase = new Date(); actualizarControlesTurnos_(); cargarRecursosTurnos_();
  });
  document.getElementById('turnos-repetir-semana').addEventListener('click', repetirSemanaAnteriorTurnos_);

  // Grilla: delegación de eventos (se registra UNA sola vez; soporta mouse, lápiz y touch)
  const grid = document.getElementById('turnos-grid');
  grid.addEventListener('pointerdown', (e) => {
    const celda = e.target.closest('.turno-celda');
    if (!celda || e.button > 0) return;
    e.preventDefault();
    if (celda.classList.contains('bloqueado')) {
      const r = recursoTurnoPorId_(celda.dataset.rec);
      mostrarToast_('🔒 ' + ((r && r.tipo_recurso) || 'El recurso') + ' inicia operación el ' + formatoFechaCorta_(inicioRecursoISO_(r)) + '. No se puede asignar turno antes.');
      return;
    }
    const clave = celda.dataset.rec + '|' + celda.dataset.fecha;
    turnosArrastre_ = { valor: !state.turnosData[clave], vistos: new Set([clave]) };
    aplicarTurnoCelda_(celda, turnosArrastre_.valor);
  });
  window.addEventListener('pointermove', (e) => {
    if (!turnosArrastre_) return;
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const celda = el && el.closest ? el.closest('.turno-celda') : null;
    if (!celda || celda.classList.contains('bloqueado')) return;
    const clave = celda.dataset.rec + '|' + celda.dataset.fecha;
    if (turnosArrastre_.vistos.has(clave)) return;
    turnosArrastre_.vistos.add(clave);
    aplicarTurnoCelda_(celda, turnosArrastre_.valor);
  });
  const terminarArrastre = () => {
    if (!turnosArrastre_) return;
    turnosArrastre_ = null;
    actualizarTotalesTurnos_();
    guardarTurnosPendientes_();
  };
  window.addEventListener('pointerup', terminarArrastre);
  window.addEventListener('pointercancel', terminarArrastre);

  grid.addEventListener('click', (e) => {
    const th = e.target.closest('.turnos-dia-th');
    if (th) { alternarDiaCompletoTurnos_(th.dataset.fecha); return; }
    const btn = e.target.closest('[data-turno-accion]');
    if (!btn) return;
    const rec = btn.dataset.rec;
    const accion = btn.dataset.turnoAccion;
    if (accion === 'inicio') abrirModalInicioTurnos_(rec);
    else if (accion === 'fila-todo') aplicarFilaTurnos_(rec, 'todo');
    else if (accion === 'fila-habiles') aplicarFilaTurnos_(rec, 'habiles');
    else if (accion === 'fila-limpiar') aplicarFilaTurnos_(rec, 'limpiar');
  });

  // Modal fecha de inicio
  document.getElementById('turnos-inicio-cancelar').addEventListener('click', cerrarModalInicioTurnos_);
  document.getElementById('turnos-inicio-guardar').addEventListener('click', () => guardarInicioTurnos_(false));
  document.getElementById('turnos-inicio-quitar').addEventListener('click', () => guardarInicioTurnos_(true));
  document.getElementById('turnos-inicio-fecha').addEventListener('change', actualizarAvisoInicioTurnos_);
  document.getElementById('turnos-inicio-overlay').addEventListener('click', (e) => {
    if (e.target.id === 'turnos-inicio-overlay') cerrarModalInicioTurnos_();
  });

  // Aviso si hay cambios sin guardar al cerrar la pestaña
  window.addEventListener('beforeunload', (e) => {
    if (turnosPendientes_.length || turnosGuardando_) { e.preventDefault(); e.returnValue = ''; }
  });
}

function actualizarControlesTurnos_() {
  const vista = state.turnosVista;
  document.getElementById('turnos-vista-semana').classList.toggle('active', vista === 'semana');
  document.getElementById('turnos-vista-mes').classList.toggle('active', vista === 'mes');
  document.getElementById('turnos-periodo-label').textContent = etiquetaPeriodo_();
  const rep = document.getElementById('turnos-repetir-semana');
  rep.style.display = vista === 'semana' ? '' : 'none';
  rep.disabled = !state.turnosRecursos.length;
}

function cambiarVistaTurnos_(vista) {
  state.turnosVista = vista;
  actualizarControlesTurnos_();
  cargarRecursosTurnos_();
}
function navegarTurnos_(dir) {
  const base = new Date(state.turnosFechaBase);
  if (state.turnosVista === 'semana') base.setDate(base.getDate() + dir * 7);
  else { base.setDate(1); base.setMonth(base.getMonth() + dir); }
  state.turnosFechaBase = base;
  actualizarControlesTurnos_();
  cargarRecursosTurnos_();
}

/** Desplegable de claves radiales: solo las del tipo elegido (si la clave elegida no es de ese tipo, se limpia). */
function poblarClavesTurnos_() {
  const tipo = state.turnosFiltroTipo;
  const lista = state.turnosRecursos.filter(r => !tipo || (r.tipo_recurso || 'Sin tipo') === tipo);
  if (state.turnosFiltroRecurso && !lista.some(r => String(r.id) === String(state.turnosFiltroRecurso))) state.turnosFiltroRecurso = '';
  document.getElementById('turnos-recurso-select').innerHTML =
    '<option value="">📻 ' + (tipo ? 'Todas las claves de ' + escapeHtml_(aTitulo_(tipo)) : 'Todas las claves') + ' (' + lista.length + ')</option>' +
    lista.map(r => '<option value="' + escapeHtml_(String(r.id)) + '"' + (String(r.id) === String(state.turnosFiltroRecurso) ? ' selected' : '') + '>' +
      escapeHtml_((claveIdRecurso_(r) || 'Sin clave') + (tipo ? '' : ' · ' + aTitulo_(r.tipo_recurso || ''))) + '</option>').join('');
}

async function cargarRecursosTurnos_() {
  if (!state.turnosArea) return;
  const grid = document.getElementById('turnos-grid');
  // Guardar cualquier cambio pendiente antes de recargar
  await guardarTurnosPendientes_();
  grid.innerHTML = '<div class="turnos-vacio">Cargando recursos…</div>';

  // El área elegida viene sin tilde (perfil_areas / catálogo) y los recursos con tilde.
  const { data: recursos, error } = await recursosDeAreas_(state.turnosArea, 'tipo_recurso');
  if (error) {
    grid.innerHTML = '<div class="turnos-vacio">No se pudieron cargar los recursos: ' + escapeHtml_(error.message) + '</div>';
    return;
  }
  // Orden: tipo de recurso (orden del sistema) y, dentro, clave radial (FRA6.1, FRA6.2 … orden natural)
  state.turnosRecursos = (recursos || []).slice().sort((a, b) =>
    compararTipoRecurso_(a.tipo_recurso, b.tipo_recurso) ||
    String(claveRecurso_(a) || '~').localeCompare(String(claveRecurso_(b) || '~'), 'es', { numeric: true }));
  // Ruta del escenario Normal de cada recurso (mismo enlace por id que en Planificar; SQL 79)
  state.turnosRutaNormal = {};
  const idsT = state.turnosRecursos.map(r => r.id);
  if (idsT.length) {
    const { data: rn } = await supabaseClient.from('v_recurso_ruta_normal').select('recurso_id, descripcion, km').in('recurso_id', idsT);
    (rn || []).forEach(x => { state.turnosRutaNormal[x.recurso_id] = x; });
  }

  // Tipos para el filtro
  const tipos = [...new Set(state.turnosRecursos.map(r => r.tipo_recurso || 'Sin tipo'))].sort(compararTipoRecurso_);
  if (state.turnosFiltroTipo && !tipos.includes(state.turnosFiltroTipo)) state.turnosFiltroTipo = '';
  document.getElementById('turnos-tipo-select').innerHTML = '<option value="">Todos los tipos (' + state.turnosRecursos.length + ')</option>' +
    tipos.map(t => '<option value="' + escapeHtml_(t) + '"' + (t === state.turnosFiltroTipo ? ' selected' : '') + '>' + escapeHtml_(t) + '</option>').join('');
  // Filtro rápido por clave radial (un recurso), limitado al tipo elegido
  poblarClavesTurnos_();

  // Turnos del periodo visible + hoy (para el KPI "en turno hoy" aunque hoy no esté en la vista)
  const fechas = fechasDelPeriodo_();
  const desde = fechaISO_(fechas[0]), hasta = fechaISO_(fechas[fechas.length - 1]);
  const ids = state.turnosRecursos.map(r => r.id);
  state.turnosData = {};
  state.turnosHoy = new Set();
  if (ids.length) {
    const hoyISO = fechaISO_(new Date());
    const [{ data: turnos, error: e1 }, { data: turnosHoy }] = await Promise.all([
      supabaseClient.from('recurso_turnos').select('recurso_id, fecha, activo').in('recurso_id', ids).gte('fecha', desde).lte('fecha', hasta),
      supabaseClient.from('recurso_turnos').select('recurso_id').in('recurso_id', ids).eq('fecha', hoyISO).eq('activo', true),
    ]);
    if (e1) {
      grid.innerHTML = '<div class="turnos-vacio">No se pudieron cargar los turnos: ' + escapeHtml_(e1.message) + '<br><small>¿Ejecutaste 51_calendario_turnos_v2.sql en Supabase?</small></div>';
      return;
    }
    (turnos || []).forEach(t => { if (t.activo) state.turnosData[t.recurso_id + '|' + String(t.fecha).slice(0, 10)] = true; });
    (turnosHoy || []).forEach(t => state.turnosHoy.add(String(t.recurso_id)));
  }
  actualizarControlesTurnos_();
  renderGridTurnos_();
}

function renderKpisTurnos_() {
  const cont = document.getElementById('turnos-kpis');
  if (!cont) return;
  const recs = recursosTurnosVisibles_();
  const fechas = fechasDelPeriodo_();
  const desde = fechaISO_(fechas[0]), hasta = fechaISO_(fechas[fechas.length - 1]);
  const hoy = state.turnosHoy || new Set();
  const enTurnoHoy = recs.filter(r => hoy.has(String(r.id))).length;
  const sinInicio = recs.filter(r => !inicioRecursoISO_(r)).length;
  const inicianPeriodo = recs.filter(r => { const i = inicioRecursoISO_(r); return i && i >= desde && i <= hasta; }).length;
  const porIniciar = recs.filter(r => { const i = inicioRecursoISO_(r); return i && i > hasta; }).length;
  let diasTurno = 0;
  recs.forEach(r => fechas.forEach(d => { if (state.turnosData[r.id + '|' + fechaISO_(d)]) diasTurno++; }));
  const kpi = (v, l, cls) => '<div class="turnos-kpi ' + (cls || '') + '"><div class="v">' + v + '</div><div class="l">' + l + '</div></div>';
  cont.innerHTML =
    kpi(recs.length, 'Recursos visibles') +
    kpi(enTurnoHoy, 'En turno hoy', 'verde') +
    kpi(diasTurno, 'Días-turno en el periodo', 'azul') +
    kpi(inicianPeriodo, 'Inician operación en el periodo', 'azul') +
    kpi(porIniciar, 'Aún no inician (después del periodo)') +
    kpi(sinInicio, 'Sin fecha de inicio', sinInicio ? 'ambar' : '');
}

function renderGridTurnos_() {
  const grid = document.getElementById('turnos-grid');
  const fechas = fechasDelPeriodo_();
  const isos = fechas.map(fechaISO_);
  const hoyISO = fechaISO_(new Date());
  const recs = recursosTurnosVisibles_();
  renderKpisTurnos_();

  if (!state.turnosRecursos.length) {
    grid.innerHTML = '<div class="turnos-vacio">Esta área no tiene recursos asignados. Asígnalos desde Administración → Recursos por Área.</div>';
    return;
  }
  if (!recs.length) {
    grid.innerHTML = '<div class="turnos-vacio">Ningún recurso coincide con el filtro.</div>';
    return;
  }

  let html = '<table class="turnos-tabla"><thead><tr><th class="col-rec">Recurso</th>';
  fechas.forEach((d, i) => {
    const iso = isos[i];
    const cls = ['turnos-dia-th'];
    if (iso === hoyISO) cls.push('hoy');
    if (d.getDay() === 0 || d.getDay() === 6) cls.push('finde');
    html += '<th class="' + cls.join(' ') + '" data-fecha="' + iso + '" title="' + formatoFechaCorta_(iso) + ' — clic para marcar/desmarcar en todos los recursos visibles">' +
      '<div class="ds">' + TURNOS_DIAS[d.getDay()] + '</div><div class="dn">' + d.getDate() + '</div></th>';
  });
  html += '<th class="col-total" title="Días trabajados (en turno) / días que opera el recurso en el periodo, y % completado">Avance</th></tr></thead><tbody>';

  recs.forEach(r => {
    const rid = escapeHtml_(String(r.id));
    const inst = r.instituciones || { nombre: '', color_hex: '#64748B' };
    const ini = inicioRecursoISO_(r);
    let chipCls = '', chipTxt;
    if (!ini) { chipCls = 'sin'; chipTxt = '⚠ Sin fecha de inicio'; }
    else if (ini > hoyISO) { chipCls = 'futura'; chipTxt = '▶ Inicia ' + formatoFechaCorta_(ini); }
    else chipTxt = '✓ Desde ' + formatoFechaCorta_(ini);
    // Fila compacta (14-10-2026): CLAVE RADIAL + tipo · sector; acciones a la derecha.
    // La ruta y la fecha de inicio salen de la vista (la fecha queda en el botón 📅 y en el título).
    const claveR = claveRecurso_(r);
    html += '<tr><td class="col-rec"><div class="turnos-rec-compacta"><div class="turnos-rec-txt">' +
      '<div class="turnos-rec-clave" title="' + escapeHtml_((claveR || '') + (r.codigo_ref ? ' · ID ' + r.codigo_ref : '') + (inst.nombre ? ' · ' + inst.nombre : '') + ' · ' + chipTxt.replace(/^\S+\s/, '')) + '">' +
        '<span class="turnos-swatch" style="background:' + escapeHtml_(inst.color_hex || plColorTipo_(r.tipo_recurso)) + ';"></span>📻 ' + escapeHtml_(claveR || 'Sin clave') +
        (r.codigo_ref && r.codigo_ref !== claveR ? ' <small>' + escapeHtml_(r.codigo_ref) + '</small>' : '') + '</div>' +
      '<div class="turnos-rec-sub" title="' + escapeHtml_(r.tipo_recurso || '') + '">' + escapeHtml_(aTitulo_(r.tipo_recurso || '—')) + (r.sector ? ' · ' + escapeHtml_(r.sector) : '') + '</div></div>' +
      '<span class="turnos-fila-acc">' +
        '<button class="' + (chipCls === 'sin' ? 'aviso' : '') + '" data-turno-accion="inicio" data-rec="' + rid + '" title="Fecha de inicio: ' + escapeHtml_(chipTxt.replace(/^\S+\s/, '')) + ' — clic para editar">' + (chipCls === 'sin' ? '⚠' : '📅') + '</button>' +
        '<button data-turno-accion="fila-todo" data-rec="' + rid + '" title="Activar todos los días permitidos del periodo">✓</button>' +
        '<button data-turno-accion="fila-habiles" data-rec="' + rid + '" title="Activar solo lunes a viernes (permitidos)">L–V</button>' +
        '<button data-turno-accion="fila-limpiar" data-rec="' + rid + '" title="Quitar todos los turnos del periodo">✕</button>' +
      '</span></div></td>';
    let total = 0;
    fechas.forEach((d, i) => {
      const iso = isos[i];
      const activo = !!state.turnosData[r.id + '|' + iso];
      if (activo) total++;
      const cls = ['turno-celda'];
      const permitido = turnoPermitido_(r, iso);
      if (activo) cls.push('activo');
      else if (permitido) cls.push('libre');   // por defecto: día libre (amarillo, "L")
      if (!permitido) cls.push('bloqueado');
      if (ini && iso === ini) cls.push('inicio');
      if (iso === hoyISO) cls.push('hoy');
      if (iso < hoyISO) cls.push('pasado');
      if (d.getDay() === 0 || d.getDay() === 6) cls.push('finde');
      const titulo = !turnoPermitido_(r, iso) ? 'Bloqueado: inicia operación el ' + formatoFechaCorta_(ini)
        : (ini && iso === ini ? 'Día de inicio de operación · ' : '') + formatoFechaCorta_(iso) + (activo ? ' · en turno' : ' · libre');
      html += '<td class="' + cls.join(' ') + '" data-rec="' + rid + '" data-fecha="' + iso + '" title="' + titulo + '"><div class="tc">' + (activo ? '✓' : permitido ? 'L' : '') + '</div></td>';
    });
    html += '<td class="col-total" data-total-rec="' + rid + '">' + celdaAvanceTurnos_(r, isos) + '</td></tr>';
  });
  html += '</tbody><tfoot><tr><td class="col-rec">En turno</td>';
  isos.forEach(iso => {
    const n = recs.filter(r => state.turnosData[r.id + '|' + iso]).length;
    html += '<td data-total-fecha="' + iso + '">' + n + '</td>';
  });
  const suma = recs.reduce((acc, r) => acc + isos.filter(iso => state.turnosData[r.id + '|' + iso]).length, 0);
  html += '<td class="col-total" id="turnos-total-general">' + suma + '</td></tr></tfoot></table>';
  grid.innerHTML = html;
}

/** Turnos activos de varios recursos en un rango (en tandas de 100 ids y paginado por 1.000 filas). */
async function turnosDeRecursosRango_(ids, desde, hasta, columnas) {
  const filas = [];
  for (let i = 0; i < ids.length; i += 100) {
    const tanda = ids.slice(i, i + 100);
    for (let d = 0; ; d += 1000) {
      const { data, error } = await supabaseClient.from('recurso_turnos').select(columnas || 'recurso_id, fecha, activo')
        .in('recurso_id', tanda).gte('fecha', desde).lte('fecha', hasta).order('fecha').range(d, d + 999);
      if (error) throw error;
      filas.push(...(data || []));
      if (!data || data.length < 1000) break;
    }
  }
  return filas;
}

/* ── PDF mensual: una hoja por recurso visible con su calendario del mes (turno / libre) ── */
/* ── PDF panorama (13-10-2026): todos los recursos del mes en una grilla compacta
 *    (T turno · L libre · gris = aún no opera) + hoja final con los recursos disponibles
 *    por día (n.º y % sobre los que ya operan) y por tipo. Área actual (con filtros) o todas. */
async function generarPdfPanoramaTurnos_(todas) {
  const { jsPDF } = window.jspdf || {};
  if (!jsPDF) { mostrarToast_('No se pudo cargar la librería de PDF.'); return; }
  const base = new Date(state.turnosFechaBase);
  const y = base.getFullYear(), m = base.getMonth();
  const nDias = new Date(y, m + 1, 0).getDate();
  const desde = fechaISO_(new Date(y, m, 1)), hasta = fechaISO_(new Date(y, m, nDias));
  setEstadoTurnos_('guardando', 'Generando PDF…');
  await guardarTurnosPendientes_();
  let recs, alcance;
  try {
    if (todas) {
      const esAdmin = state.perfil && state.perfil.perfil === 'Administrador';
      const areas = esAdmin ? (state.areasCatalogo || []) : (state.misAreasIds || []);
      const { data, error } = await recursosDeAreas_(areas, 'id');
      if (error) throw error;
      recs = data || [];
      alcance = esAdmin ? 'Todas las áreas' : 'Mis áreas (' + areas.length + ')';
    } else {
      recs = recursosTurnosVisibles_();
      alcance = 'Área ' + (state.turnosArea || '—');
    }
  } catch (e) { setEstadoTurnos_('error', 'Error'); mostrarToast_('No se pudieron leer los recursos: ' + (e.message || e)); return; }
  if (!recs.length) { setEstadoTurnos_('', ''); mostrarToast_('No hay recursos para el PDF.'); return; }
  let turnos;
  try { turnos = await turnosDeRecursosRango_(recs.map(r => r.id), desde, hasta); }
  catch (e) { setEstadoTurnos_('error', 'Error'); mostrarToast_('No se pudieron leer los turnos: ' + e.message); return; }
  const activos = new Set(turnos.filter(t => t.activo).map(t => t.recurso_id + '|' + String(t.fecha).slice(0, 10)));
  const multiArea = new Set(recs.map(r => r.area || '')).size > 1;
  recs = recs.slice().sort((a, b) => String(a.area || '').localeCompare(String(b.area || ''), 'es') ||
    compararTipoRecurso_(a.tipo_recurso, b.tipo_recurso) ||
    String(claveRecurso_(a) || '').localeCompare(String(claveRecurso_(b) || ''), 'es', { numeric: true }));

  // Estado de cada recurso por día: 'T' turno, 'L' libre, '' no opera
  const dias = Array.from({ length: nDias }, (_, i) => { const d = new Date(y, m, i + 1); return { n: i + 1, iso: fechaISO_(d), dow: d.getDay() }; });
  const est = (r, dd) => !turnoPermitido_(r, dd.iso) ? '' : activos.has(r.id + '|' + dd.iso) ? 'T' : 'L';
  const mesTxt = TURNOS_MESES[m] + ' ' + y;
  const hoyIso = fechaISO_(new Date());

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const W = 297, H = 210, M = 8;
  const cClave = 22, cTipo = 30, cArea = multiArea ? 24 : 0, cTot = 9;
  const x0 = M + cClave + cTipo + cArea;
  const cDia = (W - M - cTot - x0) / nDias;
  const filaH = 4.1;
  const VERDE = [34, 197, 94], AMAR = [253, 230, 138], GRIS = [226, 232, 240];
  const corta = (t, ancho) => { t = String(t == null ? '' : t); if (doc.getTextWidth(t) <= ancho) return t;
    while (t.length > 1 && doc.getTextWidth(t + '…') > ancho) t = t.slice(0, -1); return t + '…'; };
  const cabecera = (sub) => {
    doc.setFillColor(15, 23, 42); doc.rect(0, 0, W, 15, 'F');
    doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(12.5);
    doc.text('Panorama de turnos · ' + mesTxt, M, 7.5);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
    doc.text(alcance + ' · ' + recs.length + ' recursos' + (sub ? ' · ' + sub : ''), M, 12);
    doc.text('Emitido ' + formatoFechaCorta_(hoyIso), W - M, 7.5, { align: 'right' });
    // Leyenda
    let lx = W - M - 92;
    [[VERDE, 'T', 'Turno'], [AMAR, 'L', 'Libre'], [GRIS, '', 'Aún no opera']].forEach(([c, l, t]) => {
      doc.setFillColor(...c); doc.rect(lx, 9.3, 4, 3.4, 'F');
      doc.setTextColor(255, 255, 255); doc.setFontSize(7.5); doc.text(t, lx + 5.2, 12); lx += 30;
    });
    doc.setTextColor(30, 41, 59);
  };
  const cabColumnas = (yy, resumen) => {
    doc.setFillColor(241, 245, 249); doc.rect(M, yy, W - 2 * M, 7, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(6.5); doc.setTextColor(71, 85, 105);
    if (resumen) doc.text('Día del mes', M + 1, yy + 4.6);
    else {
      doc.text('Clave radial', M + 1, yy + 4.6); doc.text('Tipo', M + cClave + 1, yy + 4.6);
      if (multiArea) doc.text('Área', M + cClave + cTipo + 1, yy + 4.6);
    }
    dias.forEach((dd, i) => {
      const x = x0 + i * cDia;
      if (dd.dow === 0 || dd.dow === 6) { doc.setFillColor(226, 232, 240); doc.rect(x, yy, cDia, 7, 'F'); }
      doc.setFontSize(6.3); doc.text(String(dd.n), x + cDia / 2, yy + 3.2, { align: 'center' });
      doc.setFont('helvetica', 'normal'); doc.setFontSize(5.2); doc.text(TURNOS_DIAS[dd.dow], x + cDia / 2, yy + 6.1, { align: 'center' });
      doc.setFont('helvetica', 'bold');
    });
    doc.setFontSize(6.3); doc.text(resumen ? 'Total' : 'Días T', W - M - cTot / 2, yy + 4.6, { align: 'center' });
    doc.setTextColor(30, 41, 59);
    return yy + 7;
  };

  // 1) Grilla de recursos
  cabecera('');
  let yy = cabColumnas(18);
  let areaPrev = null;
  recs.forEach((r, i) => {
    const nuevaArea = multiArea && r.area !== areaPrev;
    if (yy + filaH * (nuevaArea ? 2 : 1) > H - 9) { doc.addPage(); cabecera('(continuación)'); yy = cabColumnas(18); areaPrev = null; }
    if (multiArea && r.area !== areaPrev) {
      const n = recs.filter(x => x.area === r.area).length;
      doc.setFillColor(219, 234, 254); doc.rect(M, yy, W - 2 * M, filaH, 'F');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(6.8); doc.setTextColor(30, 64, 175);
      doc.text((r.area || 'Sin área') + '  ·  ' + n + ' recursos', M + 1, yy + 2.95);
      doc.setTextColor(30, 41, 59);
      yy += filaH; areaPrev = r.area;
    }
    if (i % 2) { doc.setFillColor(248, 250, 252); doc.rect(M, yy, x0 - M, filaH, 'F'); }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(6.6);
    doc.text(corta(claveRecurso_(r) || r.codigo_ref || '—', cClave - 2), M + 1, yy + 2.95);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(6);
    doc.text(corta(aTitulo_(r.tipo_recurso || ''), cTipo - 2), M + cClave + 1, yy + 2.95);
    if (multiArea) doc.text(corta(r.area || '', cArea - 2), M + cClave + cTipo + 1, yy + 2.95);
    let nT = 0;
    dias.forEach((dd, k) => {
      const e = est(r, dd), x = x0 + k * cDia;
      doc.setFillColor(...(e === 'T' ? VERDE : e === 'L' ? AMAR : GRIS));
      doc.rect(x + 0.25, yy + 0.25, cDia - 0.5, filaH - 0.5, 'F');
      if (e) {
        doc.setFontSize(5.4); doc.setFont('helvetica', 'bold');
        doc.setTextColor(...(e === 'T' ? [255, 255, 255] : [146, 64, 14]));
        doc.text(e, x + cDia / 2, yy + 2.9, { align: 'center' });
        doc.setTextColor(30, 41, 59);
      }
      if (e === 'T') nT++;
    });
    doc.setFont('helvetica', 'bold'); doc.setFontSize(6.6);
    doc.text(String(nT), W - M - cTot / 2, yy + 2.95, { align: 'center' });
    yy += filaH;
  });

  // 2) Resumen: recursos disponibles (en turno) por día
  const porDia = dias.map(dd => {
    let operan = 0, turno = 0;
    recs.forEach(r => { const e = est(r, dd); if (e) { operan++; if (e === 'T') turno++; } });
    return { operan, turno, libre: operan - turno, pct: operan ? Math.round(turno / operan * 100) : 0 };
  });
  doc.addPage();
  cabecera('Resumen por día');
  // KPIs del mes
  const conOp = porDia.filter(d => d.operan);
  const prom = conOp.length ? conOp.reduce((s, d) => s + d.turno, 0) / conOp.length : 0;
  const promPct = conOp.length ? Math.round(conOp.reduce((s, d) => s + d.pct, 0) / conOp.length) : 0;
  const minD = conOp.length ? conOp.reduce((a, d) => (d.turno < a.turno ? d : a), conOp[0]) : null;
  const maxD = conOp.length ? conOp.reduce((a, d) => (d.turno > a.turno ? d : a), conOp[0]) : null;
  // Tarjetas explicadas (14-10-2026): valor + qué es + cómo se lee
  const promOp = conOp.length ? conOp.reduce((s, d) => s + d.operan, 0) / conOp.length : 0;
  const DSEM = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  const fechaDe = d => { const k = porDia.indexOf(d); return DSEM[dias[k].dow] + ' ' + dias[k].n + ' ' + TURNOS_MESES[m].slice(0, 3).toLowerCase(); };
  const num1 = v => (Math.round(v * 10) / 10).toLocaleString('es-CL');
  const kpis = [
    ['Recursos en el calendario', String(recs.length), 'Total de recursos incluidos en este PDF.', [37, 99, 235]],
    ['Disponibles por día (promedio)', num1(prom) + ' de ' + num1(promOp), 'En turno cada día, en promedio, de los recursos que operan ese día.', [22, 163, 74]],
    ['Disponibilidad promedio', promPct + ' %', 'En turno ÷ que operan, promediado entre los días del mes.', [22, 163, 74]],
    ['Día con MENOS disponibles', minD ? fechaDe(minD) : '—', minD ? minD.turno + ' de ' + minD.operan + ' recursos en turno ese día (' + minD.pct + ' %).' : 'Sin días con recursos operando.', [220, 38, 38]],
    ['Día con MÁS disponibles', maxD ? fechaDe(maxD) : '—', maxD ? maxD.turno + ' de ' + maxD.operan + ' recursos en turno ese día (' + maxD.pct + ' %).' : 'Sin días con recursos operando.', [124, 58, 237]],
  ];
  const kw = (W - 2 * M - 4 * 3) / 5, kh = 21;
  kpis.forEach(([t, v, nota, c], i) => {
    const x = M + i * (kw + 3);
    doc.setDrawColor(226, 232, 240); doc.setFillColor(255, 255, 255); doc.roundedRect(x, 18, kw, kh, 1.5, 1.5, 'FD');
    doc.setFillColor(...c); doc.rect(x, 18, 1.2, kh, 'F');
    doc.setTextColor(...c); doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.text(v, x + 4, 24.5);
    doc.setTextColor(30, 41, 59); doc.setFont('helvetica', 'bold'); doc.setFontSize(7.2); doc.text(t, x + 4, 29);
    doc.setTextColor(100, 116, 139); doc.setFont('helvetica', 'normal'); doc.setFontSize(6.3);
    doc.text(doc.splitTextToSize(nota, kw - 6).slice(0, 2), x + 4, 32.4);
  });
  // Cómo se leen los términos
  doc.setFontSize(6.6); doc.setTextColor(71, 85, 105);
  doc.text('Cómo leer:  OPERAN = recursos vigentes ese día (dentro de su fecha de inicio y término de operación)  ·  ' +
    'EN TURNO (T, verde) = disponibles ese día  ·  LIBRE (L, amarillo) = operan pero ese día no tienen turno  ·  % = en turno ÷ operan.', M, 43.5);
  // Gráfico de barras: disponibles (verde) sobre los que operan (amarillo = libres), con % arriba
  const gx = x0, gy = 47, gh = 66;
  const maxOp = Math.max(1, ...porDia.map(d => d.operan));
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(30, 41, 59);
  doc.text('Recursos disponibles por día', M, gy + 3);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(6.8); doc.setTextColor(100, 116, 139);
  doc.text('Barra = recursos que operan', M, gy + 8); doc.text('Verde = en turno (disponibles)', M, gy + 12); doc.text('Amarillo = libres', M, gy + 16);
  doc.text('% = disponibles / operan', M, gy + 20);
  doc.setDrawColor(203, 213, 225); doc.line(gx, gy + gh, W - M - cTot, gy + gh);
  porDia.forEach((d, i) => {
    const x = gx + i * cDia + cDia * 0.15, w = cDia * 0.7;
    const hOp = d.operan / maxOp * (gh - 10), hT = d.turno / maxOp * (gh - 10);
    if (d.operan) {
      doc.setFillColor(...AMAR); doc.rect(x, gy + gh - hOp, w, hOp, 'F');
      doc.setFillColor(...VERDE); doc.rect(x, gy + gh - hT, w, hT, 'F');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(5.6);
      doc.setTextColor(...(d.pct >= 50 ? [21, 128, 61] : [185, 28, 28]));
      doc.text(d.pct + '%', x + w / 2, gy + gh - hOp - 1.2, { align: 'center' });
    }
    doc.setTextColor(71, 85, 105); doc.setFont('helvetica', 'normal'); doc.setFontSize(5.8);
    doc.text(String(i + 1), x + w / 2, gy + gh + 3, { align: 'center' });
  });
  // Tabla por día (mismas columnas que la grilla)
  let ty = gy + gh + 7;
  ty = cabColumnas(ty, true);
  const filaRes = (etq, vals, opts) => {
    opts = opts || {};
    if (opts.fondo) { doc.setFillColor(...opts.fondo); doc.rect(M, ty, W - 2 * M, 4.6, 'F'); }
    doc.setFont('helvetica', opts.neg ? 'bold' : 'normal'); doc.setFontSize(6.6); doc.setTextColor(...(opts.color || [30, 41, 59]));
    doc.text(corta(etq, x0 - M - 2), M + 1, ty + 3.2);
    vals.forEach((v, i) => doc.text(String(v), x0 + i * cDia + cDia / 2, ty + 3.2, { align: 'center' }));
    if (opts.total != null) doc.text(String(opts.total), W - M - cTot / 2, ty + 3.2, { align: 'center' });
    doc.setDrawColor(226, 232, 240); doc.line(M, ty + 4.6, W - M, ty + 4.6);
    ty += 4.6;
  };
  filaRes('Recursos que operan', porDia.map(d => d.operan));
  filaRes('Disponibles (en turno)', porDia.map(d => d.turno), { neg: true, color: [21, 128, 61], fondo: [220, 252, 231], total: porDia.reduce((s, d) => s + d.turno, 0) });
  filaRes('Libres', porDia.map(d => d.libre), { color: [146, 64, 14] });
  filaRes('% disponible', porDia.map(d => d.operan ? d.pct : '—'), { neg: true, fondo: [241, 245, 249] });
  // Disponibles por tipo y día
  const tipos = [...new Set(recs.map(r => aTitulo_(r.tipo_recurso || 'Sin tipo')))].sort(compararTipoRecurso_);
  ty += 2;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(71, 85, 105);
  doc.text('DISPONIBLES POR TIPO', M + 1, ty + 3); ty += 4.5;
  tipos.forEach(t => {
    if (ty + 4.6 > H - 9) { doc.addPage(); cabecera('Resumen por día (continuación)'); ty = cabColumnas(18, true); }
    const rs = recs.filter(r => aTitulo_(r.tipo_recurso || 'Sin tipo') === t);
    const vals = dias.map(dd => rs.filter(r => est(r, dd) === 'T').length);
    filaRes(t + ' (' + rs.length + ')', vals, { total: vals.reduce((s, v) => s + v, 0) });
  });

  // Pie
  const nPag = doc.getNumberOfPages();
  for (let i = 1; i <= nPag; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(6.8); doc.setTextColor(148, 163, 184);
    doc.text('SIG Copamiento Territorial · Calendario de Turnos · «Días T» = días de turno del recurso en el mes', M, H - 4);
    doc.text('Hoja ' + i + ' de ' + nPag, W - M, H - 4, { align: 'right' });
  }
  const etq = todas ? 'todas' : normalizarTextoTurnos_(state.turnosArea || 'area').toUpperCase().replace(/[^\w.-]+/g, '_');
  doc.save('panorama_turnos_' + etq + '_' + y + '-' + String(m + 1).padStart(2, '0') + '.pdf');
  setEstadoTurnos_('ok', 'PDF listo');
  mostrarToast_('✅ Panorama descargado: ' + recs.length + ' recursos, ' + nPag + ' hoja(s).');
}

async function generarPdfTurnosMensual_() {
  const { jsPDF } = window.jspdf || {};
  if (!jsPDF) { mostrarToast_('No se pudo cargar la librería de PDF.'); return; }
  const recs = recursosTurnosVisibles_();
  if (!recs.length) { mostrarToast_('No hay recursos visibles para el PDF.'); return; }
  const base = new Date(state.turnosFechaBase);
  const y = base.getFullYear(), m = base.getMonth();
  const nDias = new Date(y, m + 1, 0).getDate();
  const desde = fechaISO_(new Date(y, m, 1)), hasta = fechaISO_(new Date(y, m, nDias));
  setEstadoTurnos_('guardando', 'Generando PDF…');
  await guardarTurnosPendientes_();
  let turnos;
  try { turnos = await turnosDeRecursosRango_(recs.map(r => r.id), desde, hasta); }
  catch (e) { setEstadoTurnos_('error', 'Error'); mostrarToast_('No se pudieron leer los turnos: ' + e.message); return; }
  const activos = new Set(turnos.filter(t => t.activo).map(t => t.recurso_id + '|' + String(t.fecha).slice(0, 10)));
  const mesTxt = TURNOS_MESES[m] + ' ' + y;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const W = 210, M = 14, colW = (W - 2 * M) / 7, filaH = 24;
  const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
  recs.forEach((r, idx) => {
    if (idx) doc.addPage();
    const clave = claveRecurso_(r) || 'Sin clave', ini = inicioRecursoISO_(r);
    // Encabezado
    doc.setFillColor(15, 23, 42); doc.rect(0, 0, W, 30, 'F');
    doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
    doc.text('CALENDARIO DE TURNOS · ' + mesTxt.toUpperCase(), M, 10);
    doc.setFontSize(22); doc.text(clave, M, 22);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5);
    doc.text(aTitulo_(r.tipo_recurso || '') + (r.codigo_ref ? '  ·  ID ' + r.codigo_ref : ''), W - M, 15, { align: 'right' });
    doc.text((r.area || '') + (r.sector ? '  ·  ' + r.sector : '') + (r.empresa ? '  ·  ' + r.empresa : ''), W - M, 21, { align: 'right' });
    doc.setTextColor(15, 23, 42);
    // Resumen
    let nT = 0, nL = 0, nB = 0;
    for (let d = 1; d <= nDias; d++) {
      const iso = fechaISO_(new Date(y, m, d));
      if (!turnoPermitido_(r, iso)) nB++; else if (activos.has(r.id + '|' + iso)) nT++; else nL++;
    }
    doc.setFontSize(10);
    doc.text('Inicio de operación: ' + (ini ? formatoFechaCorta_(ini) : 'sin fecha'), M, 39);
    const chip = (x, rgb, txt) => { doc.setFillColor(...rgb); doc.roundedRect(x, 34.5, 42, 7, 2, 2, 'F'); doc.setFont('helvetica', 'bold'); doc.text(txt, x + 21, 39.3, { align: 'center' }); doc.setFont('helvetica', 'normal'); };
    chip(W - M - 3 * 44, [134, 239, 172], 'T  Turno: ' + nT + ' días');
    chip(W - M - 2 * 44, [253, 230, 138], 'L  Libre: ' + nL + ' días');
    if (nB) chip(W - M - 44, [226, 232, 240], 'No opera: ' + nB + ' días');
    // Grilla del mes (lunes a domingo)
    const top = 48;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
    DIAS.forEach((dd, i) => { doc.setFillColor(241, 245, 249); doc.rect(M + i * colW, top, colW, 7, 'F'); doc.text(dd, M + i * colW + colW / 2, top + 4.8, { align: 'center' }); });
    const offset = (new Date(y, m, 1).getDay() + 6) % 7;
    for (let d = 1; d <= nDias; d++) {
      const pos = offset + d - 1, fila = Math.floor(pos / 7), col = pos % 7;
      const x = M + col * colW, yy = top + 7 + fila * filaH;
      const iso = fechaISO_(new Date(y, m, d));
      const permitido = turnoPermitido_(r, iso), turno = activos.has(r.id + '|' + iso);
      const rgb = !permitido ? [241, 245, 249] : turno ? [134, 239, 172] : [253, 230, 138];
      doc.setFillColor(...rgb); doc.setDrawColor(203, 213, 225); doc.rect(x, yy, colW, filaH, 'FD');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(51, 65, 85);
      doc.text(String(d), x + 2.5, yy + 5.5);
      doc.setFontSize(17); doc.setTextColor(...(!permitido ? [148, 163, 184] : turno ? [21, 128, 61] : [146, 64, 14]));
      doc.text(!permitido ? '—' : turno ? 'T' : 'L', x + colW / 2, yy + 16, { align: 'center' });
      doc.setFontSize(7); doc.setFont('helvetica', 'normal');
      doc.text(!permitido ? 'No opera' : turno ? 'TURNO' : 'LIBRE', x + colW / 2, yy + 21, { align: 'center' });
      if (iso === ini) { doc.setDrawColor(37, 99, 235); doc.setLineWidth(0.8); doc.line(x + 0.4, yy, x + 0.4, yy + filaH); doc.setLineWidth(0.2); }
      doc.setTextColor(15, 23, 42);
    }
    // Pie
    doc.setFontSize(8); doc.setTextColor(100, 116, 139);
    doc.text('T = en turno · L = libre · — = antes de la fecha de inicio de operación. Generado el ' + formatoFechaCorta_(fechaISO_(new Date())) + ' · SIG Copamiento Territorial.', M, 287);
    doc.text('Hoja ' + (idx + 1) + ' de ' + recs.length, W - M, 287, { align: 'right' });
    doc.setTextColor(15, 23, 42);
  });
  const nombre = 'turnos_' + normalizarTextoTurnos_(recs.length === 1 ? (claveRecurso_(recs[0]) || 'recurso') : (state.turnosArea || 'area')).toUpperCase().replace(/[^\w.-]+/g, '_') +
    '_' + y + '-' + String(m + 1).padStart(2, '0') + '.pdf';
  doc.save(nombre);
  setEstadoTurnos_('ok', 'PDF generado');
  mostrarToast_('📄 PDF de ' + mesTxt + ': ' + recs.length + ' recurso(s), una hoja por recurso.');
}

/* ── Calendario / Seguimiento ── */
function cambiarModoTurnos_(modo) {
  state.turnosModo = modo;
  document.getElementById('turnos-modo-cal').classList.toggle('active', modo === 'cal');
  document.getElementById('turnos-modo-seg').classList.toggle('active', modo === 'seg');
  document.getElementById('turnos-vista-cal').style.display = modo === 'cal' ? '' : 'none';
  document.getElementById('turnos-vista-seg').style.display = modo === 'seg' ? '' : 'none';
  if (modo === 'seg') cargarSeguimientoTurnos_();
  else if (state.turnosArea) cargarRecursosTurnos_();
}

/* ── Seguimiento: qué recursos falta actualizar en el calendario de turnos (13-10-2026) ──
 * Para el mes elegido, cada recurso queda:
 *   🟢 Al día          : opera en el mes y tiene al menos un día de turno cargado
 *   🔴 Falta actualizar : opera en el mes (inicio ≤ fin de mes) y NO tiene turnos cargados
 *   ⏳ Aún no inicia    : su fecha de inicio es posterior al mes
 *   ⚪ Sin fecha de inicio
 * Responsables: Jefes de Área asignados al área (perfil_areas). */
state.seg = { mes: null, recursos: [], turnos: {}, ultima: {}, responsables: {}, areaSel: '' };
function iniciarListenersSeguimiento_() {
  const re = () => renderSeguimientoTurnos_();
  document.getElementById('seg-subg').addEventListener('change', () => { state.seg.areaSel = ''; poblarFiltrosSeguimiento_(); re(); });
  document.getElementById('seg-area').addEventListener('change', re);
  document.getElementById('seg-estado').addEventListener('change', re);
  const mover = (n) => { const b = state.seg.mes; state.seg.mes = new Date(b.getFullYear(), b.getMonth() + n, 1); cargarSeguimientoTurnos_(); };
  document.getElementById('seg-prev').addEventListener('click', () => mover(-1));
  document.getElementById('seg-next').addEventListener('click', () => mover(1));
  document.getElementById('seg-hoy').addEventListener('click', () => { state.seg.mes = null; cargarSeguimientoTurnos_(); });
  document.getElementById('seg-recargar').addEventListener('click', () => { state.seg.recursos = []; cargarSeguimientoTurnos_(); });
  document.getElementById('turnos-seguimiento').addEventListener('click', (e) => {
    const ir = e.target.closest('[data-seg-ir]');
    if (ir) { irAlCalendarioDesdeSeguimiento_(ir.dataset.segArea, ir.dataset.segIr); return; }
    const fila = e.target.closest('[data-seg-area-fila]');
    if (fila) { const a = fila.dataset.segAreaFila; document.getElementById('seg-area').value = document.getElementById('seg-area').value === a ? '' : a; re(); }
  });
}
function irAlCalendarioDesdeSeguimiento_(area, idRec) {
  // Abre el calendario en el área, el mes evaluado y el recurso (filtro por clave radial)
  const areas = (state.perfil.perfil === 'Administrador' ? (state.areasCatalogo || []) : (state.misAreasIds || []));
  state.turnosArea = areas.find(a => plNorm_(a) === plNorm_(area)) || area;
  state.turnosFiltroTipo = ''; state.turnosFiltroRecurso = idRec || '';
  state.turnosVista = 'mes'; state.turnosFechaBase = new Date(state.seg.mes);
  document.getElementById('turnos-area-select').value = state.turnosArea;
  cambiarModoTurnos_('cal');
}
async function cargarSeguimientoTurnos_() {
  const cont = document.getElementById('turnos-seguimiento');
  if (!state.seg.mes) { const h = new Date(); state.seg.mes = new Date(h.getFullYear(), h.getMonth(), 1); }
  const mes = state.seg.mes;
  document.getElementById('seg-mes-label').textContent = TURNOS_MESES[mes.getMonth()] + ' ' + mes.getFullYear();
  cont.innerHTML = '<div class="turnos-vacio">Cargando recursos y turnos…</div>';
  try {
    const esAdmin = state.perfil && state.perfil.perfil === 'Administrador';
    const areas = esAdmin ? (state.areasCatalogo || []) : (state.misAreasIds || []);
    if (!state.seg.recursos.length) {
      const { data, error } = await recursosDeAreas_(areas, 'id');
      if (error) throw error;
      state.seg.recursos = data || [];
      // Responsables (Jefes de Área) por área; si la BD no lo permite, se omite
      try {
        const { data: pa } = await supabaseClient.from('perfil_areas').select('perfil_id, area');
        const ids = [...new Set((pa || []).map(x => x.perfil_id))];
        const { data: pf } = ids.length ? await supabaseClient.from('perfiles').select('id, nombre_completo, perfil').in('id', ids) : { data: [] };
        const nom = {}; (pf || []).forEach(p => { if (esJefeAreaPerfil_(p.perfil)) nom[p.id] = p.nombre_completo || 'Jefe de Área'; });
        state.seg.responsables = {};
        (pa || []).forEach(x => { if (!nom[x.perfil_id]) return; const k = plNorm_(x.area); (state.seg.responsables[k] = state.seg.responsables[k] || new Set()).add(nom[x.perfil_id]); });
      } catch (e) { state.seg.responsables = {}; }
    }
    const desde = fechaISO_(mes), hasta = fechaISO_(new Date(mes.getFullYear(), mes.getMonth() + 1, 0));
    const filas = await turnosDeRecursosRango_(state.seg.recursos.map(r => r.id), desde, hasta, 'recurso_id, fecha, activo, creado_en, actualizado_en');
    state.seg.turnos = {}; state.seg.ultima = {};
    const vistos = new Set();
    filas.forEach(t => {
      const k = String(t.recurso_id);
      if (t.activo && !vistos.has(k + '|' + t.fecha)) { vistos.add(k + '|' + t.fecha); state.seg.turnos[k] = (state.seg.turnos[k] || 0) + 1; }
      const f = t.actualizado_en || t.creado_en;
      if (f && (!state.seg.ultima[k] || f > state.seg.ultima[k])) state.seg.ultima[k] = f;
    });
    state.seg.desde = desde; state.seg.hasta = hasta;
  } catch (e) {
    cont.innerHTML = '<div class="turnos-vacio">No se pudo cargar el seguimiento: ' + escapeHtml_(e.message || String(e)) + '</div>';
    return;
  }
  poblarFiltrosSeguimiento_();
  renderSeguimientoTurnos_();
}
function poblarFiltrosSeguimiento_() {
  const rs = state.seg.recursos;
  const sS = document.getElementById('seg-subg'), sA = document.getElementById('seg-area');
  const subgs = [...new Set(rs.map(r => r.subgerencia).filter(Boolean))].sort();
  const vS = sS.value;
  sS.innerHTML = '<option value="">Todas las subgerencias</option>' + subgs.map(s => '<option value="' + escapeHtml_(s) + '">Subgerencia ' + escapeHtml_(s) + '</option>').join('');
  sS.value = subgs.includes(vS) ? vS : '';
  const areas = [...new Set(rs.filter(r => !sS.value || r.subgerencia === sS.value).map(r => r.area).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
  const vA = sA.value;
  sA.innerHTML = '<option value="">Todas las áreas</option>' + areas.map(a => '<option value="' + escapeHtml_(a) + '">' + escapeHtml_(a) + '</option>').join('');
  sA.value = areas.includes(vA) ? vA : '';
}
function estadoSeguimiento_(r) {
  const ini = inicioRecursoISO_(r);
  if (!ini) return 'sin_inicio';
  if (ini > state.seg.hasta) return 'no_inicia';
  return (state.seg.turnos[String(r.id)] || 0) > 0 ? 'al_dia' : 'pendiente';
}
function renderSeguimientoTurnos_() {
  const cont = document.getElementById('turnos-seguimiento');
  const fS = document.getElementById('seg-subg').value, fA = document.getElementById('seg-area').value, fE = document.getElementById('seg-estado').value;
  const base = state.seg.recursos.filter(r => (!fS || r.subgerencia === fS));
  const enArea = base.filter(r => !fA || r.area === fA);
  const lista = enArea.filter(r => !fE || estadoSeguimiento_(r) === fE);
  const ETQ = { pendiente: '🔴 Falta actualizar', al_dia: '🟢 Al día', no_inicia: '⏳ Aún no inicia', sin_inicio: '⚪ Sin fecha de inicio' };
  const cuenta = rs => { const c = { pendiente: 0, al_dia: 0, no_inicia: 0, sin_inicio: 0 }; rs.forEach(r => c[estadoSeguimiento_(r)]++); return c; };
  const c = cuenta(enArea), operan = c.pendiente + c.al_dia;
  const pct = n => operan ? Math.round(100 * n / operan) : 0;
  const k = (v, l, cls) => '<div class="turnos-kpi ' + (cls || '') + '"><div class="v">' + v + '</div><div class="l">' + l + '</div></div>';
  const fecha = f => f ? formatoFechaCorta_(String(f).slice(0, 10)) : '—';
  let html = '<div class="seg-kpis">' +
    k(operan, 'Recursos que operan en ' + TURNOS_MESES[state.seg.mes.getMonth()].toLowerCase(), 'azul') +
    k(c.al_dia + ' <small style="font-size:12px;">(' + pct(c.al_dia) + '%)</small>', 'Al día (con turnos cargados)', 'verde') +
    k(c.pendiente, 'Falta actualizar', c.pendiente ? 'ambar' : 'verde') +
    k(c.no_inicia, 'Aún no inician este mes') +
    k(c.sin_inicio, 'Sin fecha de inicio', c.sin_inicio ? 'ambar' : '') + '</div>';
  // Por área (con responsables): clic = filtrar
  const areas = [...new Set(base.map(r => r.area).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
  html += '<div class="seg-card"><h3>📋 Avance por área · ' + TURNOS_MESES[state.seg.mes.getMonth()] + ' ' + state.seg.mes.getFullYear() + '</h3><div class="seg-scroll"><table class="seg-tabla"><thead><tr>' +
    '<th>Área</th><th>Responsable (Jefe de Área)</th><th>Operan</th><th>Al día</th><th>Falta actualizar</th><th>Avance</th><th>Última actualización</th></tr></thead><tbody>' +
    areas.map(a => {
      const rs = base.filter(r => r.area === a), ca = cuenta(rs), op = ca.pendiente + ca.al_dia;
      const ult = rs.map(r => state.seg.ultima[String(r.id)]).filter(Boolean).sort().pop();
      const p = op ? Math.round(100 * ca.al_dia / op) : 0;
      const resp = [...(state.seg.responsables[plNorm_(a)] || [])].join(', ');
      return '<tr class="clic' + (fA === a ? ' sel' : '') + '" data-seg-area-fila="' + escapeHtml_(a) + '"><td><b>' + escapeHtml_(a) + '</b></td><td>' + escapeHtml_(resp || '—') + '</td>' +
        '<td class="num">' + op + '</td><td class="num" style="color:#16A34A;">' + ca.al_dia + '</td><td class="num" style="color:' + (ca.pendiente ? '#DC2626' : 'inherit') + ';">' + ca.pendiente + '</td>' +
        '<td><span class="seg-barra"><i style="width:' + p + '%"></i></span>' + (op ? p + '%' : '—') + '</td><td>' + fecha(ult) + '</td></tr>';
    }).join('') + '</tbody></table></div></div>';
  // Detalle de recursos (por defecto, primero los que falta actualizar)
  const orden = { pendiente: 0, sin_inicio: 1, al_dia: 2, no_inicia: 3 };
  const det = lista.slice().sort((a, b) => orden[estadoSeguimiento_(a)] - orden[estadoSeguimiento_(b)] || String(a.area).localeCompare(String(b.area), 'es') ||
    String(claveRecurso_(a)).localeCompare(String(claveRecurso_(b)), 'es', { numeric: true }));
  html += '<div class="seg-card"><h3>📻 Recursos' + (fA ? ' de ' + escapeHtml_(fA) : '') + ' <small style="font-weight:600;color:var(--text-tertiary);">' + det.length + '</small></h3><div class="seg-scroll"><table class="seg-tabla"><thead><tr>' +
    '<th>Clave radial</th><th>Tipo</th><th>Área</th><th>Sector</th><th>Inicio</th><th>Días de turno en el mes</th><th>Última actualización</th><th>Estado</th><th></th></tr></thead><tbody>' +
    det.map(r => { const e = estadoSeguimiento_(r);
      return '<tr><td><b>📻 ' + escapeHtml_(claveRecurso_(r) || 'Sin clave') + '</b> <small style="color:var(--text-tertiary);">' + escapeHtml_(r.codigo_ref || '') + '</small></td>' +
        '<td>' + escapeHtml_(aTitulo_(r.tipo_recurso || '—')) + '</td><td>' + escapeHtml_(r.area || '—') + '</td><td>' + escapeHtml_(r.sector || '—') + '</td>' +
        '<td>' + fecha(inicioRecursoISO_(r)) + '</td><td class="num">' + (state.seg.turnos[String(r.id)] || 0) + '</td><td>' + fecha(state.seg.ultima[String(r.id)]) + '</td>' +
        '<td><span class="seg-est ' + e + '">' + ETQ[e] + '</span></td>' +
        '<td><button class="turnos-btn" data-seg-ir="' + escapeHtml_(String(r.id)) + '" data-seg-area="' + escapeHtml_(r.area || '') + '" title="Abrir su calendario del mes">📅 Abrir</button></td></tr>'; }).join('') +
    '</tbody></table></div></div>';
  cont.innerHTML = html;
}

/** Avance del recurso en el periodo visible: días trabajados (en turno) vs. días libres.
 *  % completado = trabajados / días que opera (desde su inicio). 100 % = sin días libres. */
function celdaAvanceTurnos_(r, isos) {
  const opera = isos.filter(iso => turnoPermitido_(r, iso));
  const t = opera.filter(iso => state.turnosData[r.id + '|' + iso]).length;
  const libres = opera.length - t;
  if (!opera.length) return '<span class="tt-na" title="Aún no opera en este periodo">—</span>';
  const pct = Math.round(t / opera.length * 100);
  const col = pct >= 100 ? '#16A34A' : pct >= 50 ? '#2563EB' : pct > 0 ? '#F59E0B' : '#94A3B8';
  return '<div class="tt-avance" title="' + t + ' día(s) trabajado(s) · ' + libres + ' libre(s) de ' + opera.length + ' que opera · ' + pct + '% completado">' +
    '<div class="tt-num"><b>' + t + '</b><small>/' + opera.length + '</small><span style="color:' + col + ';">' + pct + '%</span></div>' +
    '<div class="tt-bar"><i style="width:' + pct + '%;background:' + col + ';"></i></div></div>';
}

/** Recalcula totales por fila, por día y KPIs sin re-dibujar la grilla (usado durante el arrastre). */
function actualizarTotalesTurnos_() {
  const grid = document.getElementById('turnos-grid');
  if (!grid) return;
  const recs = recursosTurnosVisibles_();
  const isos = fechasDelPeriodo_().map(fechaISO_);
  let suma = 0;
  recs.forEach(r => {
    const n = isos.filter(iso => state.turnosData[r.id + '|' + iso]).length;
    suma += n;
    const celda = grid.querySelector('[data-total-rec="' + CSS.escape(String(r.id)) + '"]');
    if (celda) celda.innerHTML = celdaAvanceTurnos_(r, isos);
  });
  isos.forEach(iso => {
    const celda = grid.querySelector('[data-total-fecha="' + iso + '"]');
    if (celda) celda.textContent = recs.filter(r => state.turnosData[r.id + '|' + iso]).length;
  });
  const tg = document.getElementById('turnos-total-general');
  if (tg) tg.textContent = suma;
  renderKpisTurnos_();
}

/** Cambia el estado local de un turno y lo encola para guardar. No toca el DOM. */
function cambiarTurnoLocal_(rec, fecha, activo) {
  if (!puedeEditarModulo_('turnos')) {
    mostrarToast_('👁️ Tu usuario puede ver los turnos, pero no modificarlos.');
    return false;
  }
  const r = recursoTurnoPorId_(rec);
  if (activo && r && !turnoPermitido_(r, fecha)) return false;
  const clave = rec + '|' + fecha;
  const actual = !!state.turnosData[clave];
  if (actual === activo) return false;
  if (activo) state.turnosData[clave] = true; else delete state.turnosData[clave];
  if (fecha === fechaISO_(new Date())) {
    state.turnosHoy = state.turnosHoy || new Set();
    if (activo) state.turnosHoy.add(String(rec)); else state.turnosHoy.delete(String(rec));
  }
  const idx = turnosPendientes_.findIndex(p => p.recurso_id === String(rec) && p.fecha === fecha);
  if (idx >= 0) turnosPendientes_[idx].activo = activo;
  else turnosPendientes_.push({ recurso_id: String(rec), fecha, activo });
  setEstadoTurnos_('guardando', 'Cambios sin guardar…');
  return true;
}

function aplicarTurnoCelda_(celda, activo) {
  if (!cambiarTurnoLocal_(celda.dataset.rec, celda.dataset.fecha, activo)) return;
  celda.classList.toggle('activo', activo);
  celda.classList.toggle('libre', !activo);
  const div = celda.querySelector('.tc');
  if (div) div.textContent = activo ? '✓' : 'L';
}

function alternarDiaCompletoTurnos_(iso) {
  const recs = recursosTurnosVisibles_().filter(r => turnoPermitido_(r, iso));
  if (!recs.length) { mostrarToast_('Ningún recurso visible opera el ' + formatoFechaCorta_(iso) + '.'); return; }
  const todosActivos = recs.every(r => state.turnosData[r.id + '|' + iso]);
  let n = 0;
  recs.forEach(r => { if (cambiarTurnoLocal_(String(r.id), iso, !todosActivos)) n++; });
  renderGridTurnos_();
  if (n) guardarTurnosPendientes_();
  const bloqueados = recursosTurnosVisibles_().length - recs.length;
  if (bloqueados > 0 && !todosActivos) mostrarToast_(bloqueados + ' recurso(s) no se marcaron porque aún no inician operación ese día.');
}

function aplicarFilaTurnos_(rec, modo) {
  const r = recursoTurnoPorId_(rec);
  if (!r) return;
  const fechas = fechasDelPeriodo_();
  let n = 0;
  fechas.forEach(d => {
    const iso = fechaISO_(d);
    let valor;
    if (modo === 'limpiar') valor = false;
    else if (modo === 'habiles') valor = d.getDay() >= 1 && d.getDay() <= 5;
    else valor = true;
    if (valor && !turnoPermitido_(r, iso)) return;
    if (cambiarTurnoLocal_(String(r.id), iso, valor)) n++;
  });
  renderGridTurnos_();
  if (n) guardarTurnosPendientes_();
  else mostrarToast_('Sin cambios para este recurso en el periodo visible.');
}

async function repetirSemanaAnteriorTurnos_() {
  if (state.turnosVista !== 'semana') return;
  const recs = recursosTurnosVisibles_();
  if (!recs.length) return;
  const fechas = fechasDelPeriodo_();
  const prev = fechas.map(d => { const x = new Date(d); x.setDate(x.getDate() - 7); return fechaISO_(x); });
  if (!confirm('Se reemplazarán los turnos de esta semana (' + etiquetaPeriodo_() + ') para ' + recs.length +
    ' recurso(s) visibles con el patrón de la semana anterior. Los días antes de la fecha de inicio de cada recurso se respetan. ¿Continuar?')) return;
  await guardarTurnosPendientes_();
  const { data, error } = await supabaseClient.from('recurso_turnos')
    .select('recurso_id, fecha, activo')
    .in('recurso_id', recs.map(r => r.id))
    .gte('fecha', prev[0]).lte('fecha', prev[6]);
  if (error) { mostrarToast_('No se pudo leer la semana anterior: ' + error.message); return; }
  const previo = new Set((data || []).filter(t => t.activo).map(t => t.recurso_id + '|' + String(t.fecha).slice(0, 10)));
  if (!previo.size) { mostrarToast_('La semana anterior no tiene turnos para estos recursos.'); return; }
  let n = 0, omitidos = 0;
  recs.forEach(r => {
    fechas.forEach((d, i) => {
      const iso = fechaISO_(d);
      const valor = previo.has(r.id + '|' + prev[i]);
      if (valor && !turnoPermitido_(r, iso)) { omitidos++; return; }
      if (cambiarTurnoLocal_(String(r.id), iso, valor)) n++;
    });
  });
  renderGridTurnos_();
  if (n) await guardarTurnosPendientes_();
  mostrarToast_('Semana replicada: ' + n + ' cambio(s)' + (omitidos ? ', ' + omitidos + ' día(s) omitidos por fecha de inicio.' : '.'));
}

async function guardarTurnosPendientes_() {
  if (turnosGuardando_) { await turnosGuardando_; }
  if (!turnosPendientes_.length) return;
  const pend = turnosPendientes_.splice(0);
  turnosGuardando_ = (async () => {
    setEstadoTurnos_('guardando', 'Guardando ' + pend.length + ' cambio(s)…');
    const altas = pend.filter(p => p.activo).map(p => ({ recurso_id: p.recurso_id, fecha: p.fecha, activo: true }));
    const bajasPorRec = {};
    pend.filter(p => !p.activo).forEach(p => { (bajasPorRec[p.recurso_id] = bajasPorRec[p.recurso_id] || []).push(p.fecha); });
    const fallidos = [];
    let ultimoError = '';
    if (altas.length) {
      const { error } = await supabaseClient.from('recurso_turnos').upsert(altas, { onConflict: 'recurso_id,fecha' });
      if (error) { ultimoError = error.message; fallidos.push(...altas); }
    }
    for (const rec of Object.keys(bajasPorRec)) {
      const { error } = await supabaseClient.from('recurso_turnos').delete().eq('recurso_id', rec).in('fecha', bajasPorRec[rec]);
      if (error) { ultimoError = error.message; bajasPorRec[rec].forEach(f => fallidos.push({ recurso_id: rec, fecha: f, activo: false })); }
    }
    if (fallidos.length) {
      // Revertir en pantalla lo que no se pudo guardar
      fallidos.forEach(p => {
        const clave = p.recurso_id + '|' + p.fecha;
        if (p.activo) delete state.turnosData[clave]; else state.turnosData[clave] = true;
      });
      renderGridTurnos_();
      setEstadoTurnos_('error', 'Error al guardar (' + fallidos.length + ')');
      mostrarToast_('⚠️ No se guardaron ' + fallidos.length + ' cambio(s): ' + ultimoError);
    } else {
      const ahora = new Date();
      setEstadoTurnos_('ok', '✓ Guardado ' + String(ahora.getHours()).padStart(2, '0') + ':' + String(ahora.getMinutes()).padStart(2, '0'));
    }
    // Reflejar en el mapa si está activo el filtro "Solo recursos en turno hoy"
    if (state.soloTurnoHoy && typeof cargarRecursosActivosHoy_ === 'function') {
      try {
        await cargarRecursosActivosHoy_();
        if (typeof recursosDisponiblesAreaLayer !== 'undefined') aplicarVisibilidadTiposRecurso_(recursosDisponiblesAreaLayer);
      } catch (e) { /* no bloquear el calendario */ }
    }
  })();
  try { await turnosGuardando_; } finally { turnosGuardando_ = null; }
  if (turnosPendientes_.length) await guardarTurnosPendientes_();
}

/* ── Modal: fecha de inicio de operación ── */
async function abrirModalInicioTurnos_(rec) {
  const r = recursoTurnoPorId_(rec);
  if (!r) return;
  turnosInicioEditando_ = r;
  const inst = r.instituciones || {};
  document.getElementById('turnos-inicio-sub').textContent =
    (r.tipo_recurso || 'Recurso') + (r.nombre_recurso ? ' · ' + r.nombre_recurso : '') + (inst.nombre ? ' · ' + inst.nombre : '');
  document.getElementById('turnos-inicio-fecha').value = inicioRecursoISO_(r) || '';
  document.getElementById('turnos-inicio-limpiar').checked = true;
  document.getElementById('turnos-inicio-error').classList.remove('show');
  document.getElementById('turnos-inicio-quitar').style.display = inicioRecursoISO_(r) ? '' : 'none';
  document.getElementById('turnos-inicio-overlay').classList.add('show');
  actualizarAvisoInicioTurnos_();
}
function cerrarModalInicioTurnos_() {
  document.getElementById('turnos-inicio-overlay').classList.remove('show');
  turnosInicioEditando_ = null;
}
async function actualizarAvisoInicioTurnos_() {
  const r = turnosInicioEditando_;
  const lbl = document.getElementById('turnos-inicio-limpiar-lbl');
  const nueva = document.getElementById('turnos-inicio-fecha').value;
  if (!r || !nueva) { lbl.textContent = 'Eliminar los turnos registrados antes de la nueva fecha'; return; }
  const { count, error } = await supabaseClient.from('recurso_turnos')
    .select('id', { count: 'exact', head: true })
    .eq('recurso_id', r.id).lt('fecha', nueva);
  if (turnosInicioEditando_ !== r) return;
  if (error || !count) lbl.textContent = 'Eliminar los turnos registrados antes de la nueva fecha (no hay ninguno)';
  else lbl.textContent = 'Eliminar los ' + count + ' turno(s) registrados antes del ' + formatoFechaCorta_(nueva) + ' (obligatorio para guardar)';
}
async function guardarInicioTurnos_(quitar) {
  const r = turnosInicioEditando_;
  if (!r) return;
  const errEl = document.getElementById('turnos-inicio-error');
  errEl.classList.remove('show');
  const nueva = quitar ? null : (document.getElementById('turnos-inicio-fecha').value || null);
  if (!quitar && !nueva) { errEl.textContent = 'Elige una fecha, o usa "Quitar fecha".'; errEl.classList.add('show'); return; }
  const limpiar = document.getElementById('turnos-inicio-limpiar').checked;
  await guardarTurnosPendientes_();
  const btn = document.getElementById('turnos-inicio-guardar');
  btn.disabled = true; btn.textContent = 'Guardando…';
  const { data: borrados, error } = await supabaseClient.rpc('actualizar_inicio_recurso', {
    p_recurso_id: String(r.id), p_fecha: nueva, p_borrar_previos: limpiar,
  });
  btn.disabled = false; btn.textContent = 'Guardar';
  if (error) {
    errEl.textContent = 'No se pudo guardar: ' + error.message;
    errEl.classList.add('show');
    return;
  }
  // Actualizar estado local
  r.fecha_inicio_operacion = nueva;
  if (nueva) {
    Object.keys(state.turnosData).forEach(k => {
      const [rid, f] = k.split('|');
      if (rid === String(r.id) && f < nueva) delete state.turnosData[k];
    });
    if (fechaISO_(new Date()) < nueva && state.turnosHoy) state.turnosHoy.delete(String(r.id));
  }
  cerrarModalInicioTurnos_();
  renderGridTurnos_();
  mostrarToast_(nueva
    ? '✅ Inicio de operación: ' + formatoFechaCorta_(nueva) + (borrados ? ' · ' + borrados + ' turno(s) anteriores eliminados' : '')
    : '✅ Fecha de inicio quitada.');
  // Refrescar la capa del mapa en segundo plano (el popup muestra la fecha de inicio)
  if (typeof loadRecursosDisponiblesAreaLayer_ === 'function') {
    loadRecursosDisponiblesAreaLayer_().catch(() => {});
  }
}

