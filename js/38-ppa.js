/* ==================== 📋 PPA · PLAN DE PREVENCIÓN POR ÁREA (06-11-2026, SQL 160 / 161) ====================
 * Menú «📋 PPA ▾» (1ª etapa: solo Administrador, para revisar y validar):
 *   ppadetalle  📄 Detalle del PPA      — acciones con filtros, ficha por acción (metas y avances), registrar avance
 *   ppaavance   📊 Tablero de Avance    — meta vs avance por quincena o por mes (Chart.js) y cumplimiento por área
 *   pparesumen  🧾 Resumen del PPA      — totales por subgerencia, área, grupo, acción general y causa
 *   ppametas    🎯 Metas por fecha      — grilla editable de metas Q1 / Q2 / Mensual por mes (solo Admin)
 *   ppagestion  🧭 Tablero de Gestión   — KPI, semáforo por área, evolución acumulada, atrasadas y plazos próximos
 * Datos: v_ppa, ppa_metas, ppa_avances (cada avance con su FECHA: la base calcula mes y quincena, Q1 = 1-15, Q2 = 16-fin).
 * Descarga / subida del Excel con el MISMO formato del «Consolidado PPA» (3 filas de encabezado; RPC ppa_cargar, SQL 160).
 * Regla de metas para los totales:
 *   - por quincena: la meta Q1 / Q2 del mes; si la acción no tiene metas quincenales ese mes, su meta Mensual vence en la Q2;
 *   - por mes: la meta Mensual; si no tiene, Q1 + Q2;
 *   - «exigible a la fecha» = metas de las quincenas YA TERMINADAS (la quincena en curso aún no vence). */
const PPA_SUBS = {
  ppadetalle: { t: '📄 Detalle del PPA' }, ppaavance: { t: '📊 Tablero de Avance' }, pparesumen: { t: '🧾 Resumen del PPA' },
  ppametas: { t: '🎯 Metas por fecha' }, ppagestion: { t: '🧭 Tablero de Gestión' },
};
const PPA_MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const PPA_MESES_CORTOS = { ene: 1, feb: 2, mar: 3, abr: 4, may: 5, jun: 6, jul: 7, ago: 8, sep: 9, sept: 9, set: 9, oct: 10, nov: 11, dic: 12 };
state.ppa = { sub: 'ppadetalle', cargado: false, periodo: null, acciones: [], metas: [], avances: [], areas: [], sectores: [],
              cat: { ag: [], gp: [] }, f: { subg: '', area: '', sector: '', grupo: '', ag: '', causa: '', frec: '', estado: '', q: '' },
              vistaAvance: 'quincena', cambios: new Map(), charts: [], listeners: false, sinSql: false,
              editar: false, edits: new Map() };   // ✏️ edición directa de las acciones (solo Admin)

/** 1ª etapa: solo el Administrador (luego Jefes de Área y Gestores, por área). */
function puedePpa_() { return !!(state.perfil && state.perfil.perfil === 'Administrador'); }
function ppaEsAdmin_() { return !!(state.perfil && state.perfil.perfil === 'Administrador'); }
function ppaHoy_() { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function ppaNum_(v) { return Math.round((Number(v) || 0) * 100) / 100; }
function ppaPct_(a, m) { return m > 0 ? Math.round(a / m * 100) : null; }
function ppaFechaTxt_(iso) { if (!iso) return '—'; const p = String(iso).slice(0, 10).split('-'); return p[2] + '-' + p[1] + '-' + p[0]; }
function ppaMesTxt_(mes, corto) { const [a, m] = mes.split('-').map(Number); const n = PPA_MESES[m - 1]; return (corto ? n.slice(0, 3) : n) + ' ' + (corto ? String(a).slice(2) : a); }

/* ── Período y quincenas ───────────────────────────────────────────────── */
function ppaMesesPeriodo_() {
  const p = state.ppa.periodo; if (!p) return [];
  const out = []; let [a, m] = p.fecha_inicio.split('-').map(Number); const [af, mf] = p.fecha_fin.split('-').map(Number);
  while (a < af || (a === af && m <= mf)) { out.push(a + '-' + String(m).padStart(2, '0') + '-01'); m++; if (m > 12) { m = 1; a++; } }
  return out;
}
function ppaUltimoDia_(mes) { const [a, m] = mes.split('-').map(Number); return new Date(a, m, 0).getDate(); }
function ppaQuincenas_() {
  return ppaMesesPeriodo_().flatMap(mes => ['Q1', 'Q2'].map(per => ({
    mes, per, ini: per === 'Q1' ? mes : mes.slice(0, 8) + '16',
    fin: per === 'Q1' ? mes.slice(0, 8) + '15' : mes.slice(0, 8) + String(ppaUltimoDia_(mes)).padStart(2, '0'),
    etq: ppaMesTxt_(mes, true) + ' ' + per,
  })));
}
function ppaQuincenaActual_() { const h = ppaHoy_(); return ppaQuincenas_().find(q => q.ini <= h && h <= q.fin) || null; }

/* ── Carga ─────────────────────────────────────────────────────────────── */
async function ppaLeerTodo_(tabla, select, filtro) {
  const filas = [];
  for (let d = 0; ; d += 1000) {
    let q = supabaseClient.from(tabla).select(select).range(d, d + 999);
    if (filtro) q = filtro(q);
    const { data, error } = await q;
    if (error) throw error;
    filas.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return filas;
}
async function cargarPpa_() {
  const S = state.ppa, est = document.getElementById('ppa-estado');
  if (est) est.textContent = 'Cargando…';
  try {
    const { data: per, error: ep } = await supabaseClient.from('ppa_periodos').select('*').eq('activo', true).order('fecha_inicio', { ascending: false }).limit(1);
    if (ep) throw ep;
    S.periodo = (per || [])[0] || null;
    if (!S.periodo) throw new Error('No hay un período del PPA activo (SQL 160).');
    const [acc, metas, av, areas, sect, ag, gp, causas] = await Promise.all([
      ppaLeerTodo_('v_ppa', '*', q => q.eq('id_periodo', S.periodo.id_periodo).order('id_ppa')),
      ppaLeerTodo_('ppa_metas', 'id_ppa, mes, periodo, meta'),
      ppaLeerTodo_('ppa_avances', 'id, id_ppa, fecha, cantidad, detalle, origen, periodo_excel, mes, quincena, creado_en'),
      ppaLeerTodo_('area_homologacion', 'id_area, area, nombre, id_subg, subgerencia'),
      ppaLeerTodo_('sector_homologacion', 'id_area, id_sector, sector'),
      ppaLeerTodo_('ppa_acciones_generales', 'id_accion_general, nombre'),
      ppaLeerTodo_('ppa_grupos', 'id_grupo, nombre'),
      ppaLeerTodo_('ppa_causas', 'id_causa, nombre'),
    ]);
    S.acciones = acc; S.metas = metas; S.avances = av; S.areas = areas; S.sectores = sect; S.cat = { ag, gp, causas };
    ppaIndexar_();
    S.cargado = true; S.sinSql = false;
    if (est) est.textContent = S.acciones.length + ' acciones · ' + new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
  } catch (e) {
    S.sinSql = /ppa|does not exist|relation/i.test(e.message || '');
    if (est) est.textContent = 'Error';
    document.getElementById('ppa-cuerpo').innerHTML = '<div class="gr-aviso" style="margin:14px;">⚠️ ' +
      (S.sinSql ? 'Falta ejecutar en Supabase el SQL 160 (estructura del PPA) y el 161 (carga inicial).' : escapeHtml_(e.message || String(e))) + '</div>';
    throw e;
  }
}
function ppaIndexar_() {
  const S = state.ppa;
  S.metaMap = new Map(); S.metas.forEach(m => S.metaMap.set(m.id_ppa + '|' + String(m.mes).slice(0, 10) + '|' + m.periodo, Number(m.meta)));
  S.avMap = new Map(); S.avPorId = new Map();
  const suma = (k, c) => S.avMap.set(k, (S.avMap.get(k) || 0) + c);
  S.avances.forEach(a => {
    const mes = String(a.mes).slice(0, 10), c = Number(a.cantidad) || 0;
    suma(a.id_ppa + '|' + mes + '|Q' + a.quincena, c); suma(a.id_ppa + '|' + mes + '|M', c);
    if (!S.avPorId.has(a.id_ppa)) S.avPorId.set(a.id_ppa, []);
    S.avPorId.get(a.id_ppa).push(a);
  });
  S.porId = new Map(S.acciones.map(a => [a.id_ppa, a]));
}

/* ── Metas efectivas y cumplimiento ────────────────────────────────────── */
function ppaMetaRaw_(id, mes, per) { const v = state.ppa.metaMap.get(id + '|' + mes + '|' + per); return v == null ? null : v; }
function ppaAvanceSlot_(id, mes, per) { return state.ppa.avMap.get(id + '|' + mes + '|' + per) || 0; }
/** Celdas de meta que valen según la FRECUENCIA de la acción (07-11-2026):
 *  Quincenal / Semanal → Q1 y Q2 · Mensual → Mes (vence en la Q2) · sin frecuencia → ninguna (bloqueada hasta definirla). */
function ppaSlotsPermitidos_(a) {
  const f = a && a.frecuencia;
  return f === 'Mensual' ? ['M'] : (f === 'Quincenal' || f === 'Semanal') ? ['Q1', 'Q2'] : [];
}
function ppaMetaQ_(id, mes, per) {
  const a = state.ppa.porId.get(id), f = a && a.frecuencia;
  if (f === 'Mensual') return per === 'Q2' ? (ppaMetaRaw_(id, mes, 'M') || 0) : 0;
  if (f === 'Quincenal' || f === 'Semanal') return ppaMetaRaw_(id, mes, per) || 0;
  // Sin frecuencia (aún no definida): lo que tenga, Q1/Q2 y si no la mensual en la Q2
  const q1 = ppaMetaRaw_(id, mes, 'Q1'), q2 = ppaMetaRaw_(id, mes, 'Q2');
  if (q1 != null || q2 != null) return (per === 'Q1' ? q1 : q2) || 0;
  return per === 'Q2' ? (ppaMetaRaw_(id, mes, 'M') || 0) : 0;
}
function ppaMetaMes_(id, mes) { return ppaMetaQ_(id, mes, 'Q1') + ppaMetaQ_(id, mes, 'Q2'); }
/** Meta distribuida en el plan = suma de las celdas permitidas por la frecuencia (con los cambios pendientes de la grilla). */
function ppaDistribuido_(a) {
  const S = state.ppa, perm = ppaSlotsPermitidos_(a);
  return ppaMesesPeriodo_().reduce((s, mes) => s + perm.reduce((t, per) => {
    const k = a.id_ppa + '|' + mes + '|' + per, v = S.cambios.has(k) ? S.cambios.get(k) : ppaMetaRaw_(a.id_ppa, mes, per);
    return t + (Number(v) || 0);
  }, 0), 0);
}
/** Estado de la distribución frente a la Meta gral. del Excel: sinfrec · sinmeta (sin meta gral.) · ok · difiere */
function ppaEstadoDistrib_(a) {
  if (!ppaSlotsPermitidos_(a).length) return 'sinfrec';
  if (a.meta_general == null || a.meta_general === '') return 'sinmeta';
  return ppaNum_(ppaDistribuido_(a)) === ppaNum_(a.meta_general) ? 'ok' : 'difiere';
}
function ppaMetaPeriodo_(id) { return ppaQuincenas_().reduce((s, q) => s + ppaMetaQ_(id, q.mes, q.per), 0); }
function ppaExigible_(id) { const h = ppaHoy_(); return ppaQuincenas_().filter(q => q.fin < h).reduce((s, q) => s + ppaMetaQ_(id, q.mes, q.per), 0); }
function ppaAvanceTotal_(id) { return (state.ppa.avPorId.get(id) || []).reduce((s, a) => s + (Number(a.cantidad) || 0), 0); }
/** Estado de la acción a la fecha: sinmeta (sin metas), pendiente (aún no vence ninguna), aldia, atrasada (≥ 50 %), critica. */
function ppaEstado_(id) {
  const total = ppaMetaPeriodo_(id), exig = ppaExigible_(id), av = ppaAvanceTotal_(id);
  if (!total) return 'sinmeta';
  if (!exig) return 'pendiente';
  if (av >= exig) return 'aldia';
  return av >= exig * 0.5 ? 'atrasada' : 'critica';
}
const PPA_ESTADOS = {
  aldia: { t: 'Al día', c: '#16A34A' }, atrasada: { t: 'Atrasada', c: '#D97706' }, critica: { t: 'Crítica', c: '#DC2626' },
  pendiente: { t: 'Sin metas vencidas', c: '#64748B' }, sinmeta: { t: 'Sin metas', c: '#94A3B8' },
};
function ppaChipEstado_(e) { const x = PPA_ESTADOS[e]; return '<span class="ppa-chip" style="--c:' + x.c + '">' + x.t + '</span>'; }
function ppaColorPct_(p) { return p == null ? '#94A3B8' : p >= 100 ? '#16A34A' : p >= 50 ? '#D97706' : '#DC2626'; }

/* ── Filtros ───────────────────────────────────────────────────────────── */
function ppaFiltradas_() {
  const f = state.ppa.f, q = normalizarBusqueda_(f.q);
  return state.ppa.acciones.filter(a =>
    (!f.subg || String(a.id_subg) === f.subg) && (!f.area || String(a.id_area) === f.area) &&
    (!f.sector || String(a.id_sector ?? '0') === f.sector) && (!f.grupo || a.id_grupo === f.grupo) &&
    (!f.ag || a.id_accion_general === f.ag) && (!f.causa || String(a.id_causa) === f.causa) &&
    (!f.frec || (a.frecuencia || '—') === f.frec) && (!f.estado || ppaEstado_(a.id_ppa) === f.estado) &&
    (!q || normalizarBusqueda_([a.id_ppa, a.accion, a.area, a.sector, a.accion_general, a.grupo, a.causa].join(' ')).includes(q)));
}
function ppaRenderFiltros_() {
  const S = state.ppa, f = S.f, A = S.acciones, cont = document.getElementById('ppa-filtros');
  const uniq = (arr, k, n) => [...new Map(arr.filter(x => x[k] != null).map(x => [String(x[k]), x[n]])).entries()].sort((a, b) => String(a[1]).localeCompare(String(b[1]), 'es'));
  const sel = (id, todos, ops, val) => '<select id="' + id + '" class="admin-search">' + '<option value="">' + todos + '</option>' +
    ops.map(([v, t]) => '<option value="' + escapeHtml_(v) + '"' + (v === val ? ' selected' : '') + '>' + escapeHtml_(t) + '</option>').join('') + '</select>';
  const deSubg = A.filter(a => !f.subg || String(a.id_subg) === f.subg);
  const deArea = deSubg.filter(a => !f.area || String(a.id_area) === f.area);
  const sectores = [...new Map(deArea.filter(a => f.area).map(a => [String(a.id_sector ?? '0'), a.sector || 'Toda el área'])).entries()];
  cont.innerHTML =
    sel('ppa-f-subg', 'Todas las subgerencias', uniq(A, 'id_subg', 'subgerencia'), f.subg) +
    sel('ppa-f-area', 'Todas las áreas', uniq(deSubg, 'id_area', 'area_nombre'), f.area) +
    (f.area ? sel('ppa-f-sector', 'Todos los sectores', sectores.sort((a, b) => a[1].localeCompare(b[1], 'es')), f.sector) : '') +
    sel('ppa-f-grupo', 'Todos los grupos', uniq(A, 'id_grupo', 'grupo'), f.grupo) +
    sel('ppa-f-ag', 'Todas las acciones generales', uniq(A, 'id_accion_general', 'accion_general'), f.ag) +
    sel('ppa-f-causa', 'Todas las causas', uniq(A, 'id_causa', 'causa'), f.causa) +
    sel('ppa-f-frec', 'Toda frecuencia', [['Mensual', 'Mensual'], ['Quincenal', 'Quincenal'], ['Semanal', 'Semanal'], ['—', 'Sin frecuencia']], f.frec) +
    sel('ppa-f-estado', 'Todo estado', Object.keys(PPA_ESTADOS).map(k => [k, PPA_ESTADOS[k].t]), f.estado) +
    '<input id="ppa-f-q" class="admin-search" placeholder="🔍 Buscar acción, id, sector…" value="' + escapeHtml_(f.q) + '" style="min-width:190px;">' +
    '<span class="ppa-nfil" id="ppa-nfil"></span>';
}
function ppaIniciarListeners_() {
  const S = state.ppa;
  if (S.listeners) return;
  S.listeners = true;
  const panel = document.getElementById('ppa-panel');
  panel.addEventListener('change', e => {
    if (e.target.dataset && e.target.dataset.ppaEd) { ppaCambioEdicion_(e.target); return; }   // ✏️ edición directa
    const m = /^ppa-f-(\w+)$/.exec(e.target.id || '');
    if (!m || m[1] === 'q') return;
    S.f[m[1]] = e.target.value;
    if (m[1] === 'subg') { S.f.area = ''; S.f.sector = ''; }
    if (m[1] === 'area') S.f.sector = '';
    ppaRender_();
  });
  let espera = null;
  panel.addEventListener('input', e => {
    if (e.target.id !== 'ppa-f-q') return;
    clearTimeout(espera); espera = setTimeout(() => { S.f.q = e.target.value; ppaRenderCuerpo_(); }, 250);
  });
  panel.addEventListener('click', e => {
    const t = e.target.closest('[data-ppa-sub]'); if (t) { mostrarVista_(t.dataset.ppaSub); return; }
    const bid = (e.target.closest('button') || {}).id;
    if (bid === 'ppa-ed-on') { S.editar = true; ppaRenderCuerpo_(); return; }
    if (bid === 'ppa-ed-guardar') { ppaGuardarEdicion_(); return; }
    if (bid === 'ppa-ed-descartar') { if (confirm('¿Descartar los ' + S.edits.size + ' cambio(s) sin guardar?')) { S.edits.clear(); ppaRenderCuerpo_(); } return; }
    if (bid === 'ppa-ed-salir') {
      if (S.edits.size && !confirm('Hay ' + S.edits.size + ' acción(es) con cambios sin guardar. ¿Salir y descartarlos?')) return;
      S.edits.clear(); S.editar = false; ppaRenderCuerpo_(); return;
    }
    const fila = e.target.closest('[data-ppa-id]'); if (fila && !e.target.closest('input,button,select,textarea')) { ppaAbrirFicha_(fila.dataset.ppaId); return; }
    const av = e.target.closest('[data-ppa-vav]'); if (av) { S.vistaAvance = av.dataset.ppaVav; ppaRenderCuerpo_(); return; }
    const ea = e.target.closest('[data-ppa-area]'); if (ea) { e.preventDefault(); S.f.area = ea.dataset.ppaArea; S.f.sector = ''; mostrarVista_('ppadetalle'); return; }
  });
  document.getElementById('ppa-recargar').addEventListener('click', () => abrirPpa_(state.ppa.sub, true));
  document.getElementById('ppa-excel').addEventListener('click', ppaDescargarExcel_);
  document.getElementById('ppa-subir').addEventListener('click', () => document.getElementById('ppa-archivo').click());
  document.getElementById('ppa-archivo').addEventListener('change', e => { const f = e.target.files[0]; e.target.value = ''; if (f) ppaLeerExcel_(f); });
}

/* ── Entrada / render ──────────────────────────────────────────────────── */
async function abrirPpa_(sub, forzar) {
  const S = state.ppa;
  if (sub && PPA_SUBS[sub]) S.sub = sub;
  ppaIniciarListeners_();
  document.getElementById('ppa-titulo').textContent = '📋 PPA · ' + PPA_SUBS[S.sub].t.replace(/^\S+\s/, '');
  document.getElementById('ppa-subir').style.display = ppaEsAdmin_() ? '' : 'none';
  if (!S.cargado || forzar) {
    document.getElementById('ppa-cuerpo').innerHTML = '<div class="tb-vacio">Cargando el PPA…</div>';
    try { await cargarPpa_(); } catch (e) { console.warn('PPA:', e); return; }
  }
  ppaRender_();
}
function ppaRender_() { if (!state.ppa.cargado) return; ppaRenderFiltros_(); ppaRenderCuerpo_(); }
function ppaRenderCuerpo_() {
  const S = state.ppa, cuerpo = document.getElementById('ppa-cuerpo');
  S.charts.forEach(c => { try { c.destroy(); } catch (e) {} }); S.charts = [];
  const lista = ppaFiltradas_();
  const nf = document.getElementById('ppa-nfil'); if (nf) nf.textContent = lista.length + ' de ' + S.acciones.length + ' acciones';
  const pestanas = '<div class="ppa-pestanas">' + Object.keys(PPA_SUBS).map(k => '<button data-ppa-sub="' + k + '" class="' + (k === S.sub ? 'on' : '') + '">' + PPA_SUBS[k].t + '</button>').join('') +
    '<span class="ppa-per">' + escapeHtml_(S.periodo.nombre) + ' · ' + ppaFechaTxt_(S.periodo.fecha_inicio) + ' al ' + ppaFechaTxt_(S.periodo.fecha_fin) +
    (ppaQuincenaActual_() ? ' · hoy: <b>' + ppaQuincenaActual_().etq + '</b>' : '') + '</span></div>';
  const html = { ppadetalle: ppaHtmlDetalle_, ppaavance: ppaHtmlAvance_, pparesumen: ppaHtmlResumen_, ppametas: ppaHtmlMetas_, ppagestion: ppaHtmlGestion_ }[S.sub](lista);
  // Conserva el scroll al re-dibujar (edición de metas y de acciones)
  const wrapAnt = cuerpo.querySelector('.ppa-tabla-wrap'), scroll = [cuerpo.scrollTop, wrapAnt ? wrapAnt.scrollTop : 0, wrapAnt ? wrapAnt.scrollLeft : 0];
  cuerpo.innerHTML = pestanas + '<div class="ppa-vista">' + html + '</div>';
  cuerpo.scrollTop = scroll[0];
  const wrap = cuerpo.querySelector('.ppa-tabla-wrap'); if (wrap) { wrap.scrollTop = scroll[1]; wrap.scrollLeft = scroll[2]; }
  if (S.sub === 'ppaavance') ppaGraficoAvance_(lista);
  if (S.sub === 'ppagestion') ppaGraficosGestion_(lista);
  if (S.sub === 'ppametas') ppaIniciarMetas_(lista);
}

/* ── 📄 Detalle ───────────────────────────────────────────────────────── */
function ppaHtmlDetalle_(lista) {
  const S = state.ppa;
  const barra = ppaEsAdmin_() ? '<div class="ppa-masivo">' + (S.editar
      ? '<b>✏️ Editando las acciones</b> · cambia los datos en la tabla y guarda. ' +
        '<button class="turnos-btn gr-btn-guardar" id="ppa-ed-guardar"' + (S.edits.size ? '' : ' disabled') + '>💾 Guardar cambios (' + S.edits.size + ')</button>' +
        '<button class="turnos-btn" id="ppa-ed-descartar"' + (S.edits.size ? '' : ' disabled') + '>Descartar</button>' +
        '<button class="turnos-btn" id="ppa-ed-salir">👁️ Terminar edición</button>'
      : '<button class="turnos-btn" id="ppa-ed-on" title="Solo Administrador: editar área, sector, acción, acción general, grupo, causa, frecuencia, plazo, meta general y si está activa">✏️ Editar datos</button>' +
        '<span style="color:var(--text-tertiary);">Clic en una acción: su ficha con metas y avances. Los avances llegan solo desde la App (PWA).</span>') + '</div>' : '';
  if (!lista.length) return barra + '<div class="tb-vacio">No hay acciones con estos filtros.</div>';
  if (S.editar && ppaEsAdmin_()) return barra + ppaHtmlDetalleEdicion_(lista);
  const MAX = 400, ver = lista.slice(0, MAX);
  return barra + (lista.length > MAX ? '<div class="gr-aviso" style="margin-bottom:8px;">Se muestran las primeras ' + MAX + ' de ' + lista.length + ': usa los filtros para acotar.</div>' : '') +
    '<div class="ppa-tabla-wrap"><table class="tb-tabla ppa-tabla"><thead><tr><th>ID</th><th>Área / Sector</th><th>Acción</th><th>Acción general</th><th>Grupo</th><th>Causa</th>' +
    '<th>Frec.</th><th>Plazo</th><th>Meta gral.</th><th>Meta período</th><th>Exigible hoy</th><th>Avance</th><th>% a la fecha</th><th>Estado</th></tr></thead><tbody>' +
    ver.map(a => {
      const exig = ppaExigible_(a.id_ppa), av = ppaAvanceTotal_(a.id_ppa), p = ppaPct_(av, exig), est = ppaEstado_(a.id_ppa);
      const fueraPlazo = a.plazo && (a.plazo < state.ppa.periodo.fecha_inicio || a.plazo > state.ppa.periodo.fecha_fin);
      return '<tr data-ppa-id="' + a.id_ppa + '" class="ppa-fila"><td><b>' + a.id_ppa + '</b></td>' +
        '<td>' + escapeHtml_(a.area_nombre) + '<small>' + escapeHtml_(a.sector || 'Toda el área') + '</small></td>' +
        '<td class="ppa-acc">' + escapeHtml_(a.accion) + '</td><td>' + escapeHtml_(a.accion_general || '—') + '</td><td>' + escapeHtml_(a.grupo || '—') + '</td>' +
        '<td>' + escapeHtml_(a.causa || '—') + '</td><td>' + escapeHtml_(a.frecuencia || '—') + '</td>' +
        '<td' + (fueraPlazo ? ' title="Plazo fuera del período del PPA" style="color:#DC2626;font-weight:700;"' : '') + '>' + ppaFechaTxt_(a.plazo) + '</td>' +
        '<td class="cel">' + (a.meta_general ?? '—') + '</td><td class="cel">' + ppaNum_(ppaMetaPeriodo_(a.id_ppa)) + '</td>' +
        '<td class="cel">' + ppaNum_(exig) + '</td><td class="cel">' + ppaNum_(av) + '</td>' +
        '<td class="cel" style="color:' + ppaColorPct_(p) + '">' + (p == null ? '—' : p + ' %') + '</td><td>' + ppaChipEstado_(est) + '</td></tr>';
    }).join('') + '</tbody></table></div>';
}

/* ── ✏️ Edición directa de las acciones (solo Administrador) ──────────────
 * Campos editables: área, sector (del área), acción, acción general, grupo, causa, frecuencia, plazo, meta general y activa.
 * Los cambios quedan pendientes (celda en ámbar) hasta «💾 Guardar cambios» (UPDATE directo de public.ppa; RLS: solo Admin). */
const PPA_EDITABLES = ['id_area', 'id_sector', 'accion', 'id_accion_general', 'id_grupo', 'id_causa', 'frecuencia', 'plazo', 'meta_general', 'activo'];
function ppaValEd_(a, campo) { const e = state.ppa.edits.get(a.id_ppa); return e && campo in e ? e[campo] : a[campo]; }
function ppaNormEd_(campo, v) {
  if (campo === 'activo') return v === true || v === 'true';
  if (v === '' || v == null) return null;
  if (['id_area', 'id_sector', 'id_causa'].includes(campo)) return Number(v);
  if (campo === 'meta_general') return Number(v);
  if (campo === 'plazo') return String(v).slice(0, 10);
  return String(v);
}
function ppaHtmlDetalleEdicion_(lista) {
  const S = state.ppa, MAX = 200, ver = lista.slice(0, MAX);
  const opts = (pares, val, vacio) => (vacio != null ? '<option value="">' + vacio + '</option>' : '') +
    pares.map(([v, t]) => '<option value="' + escapeHtml_(String(v)) + '"' + (String(v) === String(val ?? '') ? ' selected' : '') + '>' + escapeHtml_(t) + '</option>').join('');
  const areas = S.areas.slice().sort((a, b) => String(a.nombre || a.area).localeCompare(String(b.nombre || b.area), 'es')).map(a => [a.id_area, a.nombre || a.area]);
  const ags = S.cat.ag.map(x => [x.id_accion_general, x.id_accion_general + ' · ' + x.nombre]);
  const gps = S.cat.gp.map(x => [x.id_grupo, x.id_grupo + ' · ' + x.nombre]);
  const causas = (S.cat.causas || []).slice().sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')).map(x => [x.id_causa, x.nombre]);
  const cel = (a, campo, html) => { const e = S.edits.get(a.id_ppa); return '<td class="' + (e && campo in e ? 'ppa-cambio' : '') + '">' + html + '</td>'; };
  const d = (a, campo) => 'data-ppa-ed="' + a.id_ppa + '|' + campo + '"';
  return (lista.length > MAX ? '<div class="gr-aviso" style="margin-bottom:8px;">En edición se muestran ' + MAX + ' de ' + lista.length + ' acciones: filtra por área o sector para editar el resto.</div>' : '') +
    '<div class="ppa-tabla-wrap"><table class="tb-tabla ppa-tabla ppa-edicion"><thead><tr><th>ID</th><th>Área</th><th>Sector</th><th>Acción</th><th>Acción general</th><th>Grupo</th>' +
    '<th>Causa</th><th>Frecuencia</th><th>Plazo</th><th>Meta gral.</th><th>Activa</th></tr></thead><tbody>' +
    ver.map(a => {
      const idA = ppaValEd_(a, 'id_area');
      const sectores = S.sectores.filter(s => s.id_area === Number(idA)).sort((x, y) => x.id_sector - y.id_sector).map(s => [s.id_sector, s.id_sector + ' · ' + s.sector]);
      return '<tr><td><b>' + a.id_ppa + '</b></td>' +
        cel(a, 'id_area', '<select ' + d(a, 'id_area') + '>' + opts(areas, idA) + '</select>') +
        cel(a, 'id_sector', '<select ' + d(a, 'id_sector') + '>' + opts(sectores, ppaValEd_(a, 'id_sector'), 'Toda el área') + '</select>') +
        cel(a, 'accion', '<textarea rows="2" ' + d(a, 'accion') + '>' + escapeHtml_(ppaValEd_(a, 'accion') || '') + '</textarea>') +
        cel(a, 'id_accion_general', '<select ' + d(a, 'id_accion_general') + '>' + opts(ags, ppaValEd_(a, 'id_accion_general'), '—') + '</select>') +
        cel(a, 'id_grupo', '<select ' + d(a, 'id_grupo') + '>' + opts(gps, ppaValEd_(a, 'id_grupo'), '—') + '</select>') +
        cel(a, 'id_causa', '<select ' + d(a, 'id_causa') + '>' + opts(causas, ppaValEd_(a, 'id_causa'), '—') + '<option value="__nueva">➕ Nueva causa…</option></select>') +
        cel(a, 'frecuencia', '<select ' + d(a, 'frecuencia') + '>' + opts([['Quincenal', 'Quincenal'], ['Mensual', 'Mensual'], ['Semanal', 'Semanal']], ppaValEd_(a, 'frecuencia'), '—') + '</select>') +
        cel(a, 'plazo', '<input type="date" ' + d(a, 'plazo') + ' value="' + (ppaValEd_(a, 'plazo') || '') + '">') +
        cel(a, 'meta_general', '<input type="number" min="0" step="1" style="width:64px;" ' + d(a, 'meta_general') + ' value="' + (ppaValEd_(a, 'meta_general') ?? '') + '">') +
        cel(a, 'activo', '<input type="checkbox" ' + d(a, 'activo') + (ppaValEd_(a, 'activo') !== false ? ' checked' : '') + '>') + '</tr>';
    }).join('') + '</tbody></table></div>';
}
async function ppaCambioEdicion_(el) {
  const S = state.ppa, [id, campo] = el.dataset.ppaEd.split('|'), a = S.porId.get(id); if (!a) return;
  let v = el.type === 'checkbox' ? el.checked : el.value;
  if (campo === 'id_causa' && v === '__nueva') {
    const nombre = (prompt('Nombre de la nueva causa a gestionar:') || '').trim().replace(/\s+/g, ' ');
    if (!nombre) { el.value = ppaValEd_(a, 'id_causa') ?? ''; return; }
    const { data, error } = await supabaseClient.from('ppa_causas').upsert({ nombre }, { onConflict: 'nombre' }).select('id_causa, nombre').single();
    if (error) { mostrarToast_('No se pudo crear la causa: ' + error.message); el.value = ppaValEd_(a, 'id_causa') ?? ''; return; }
    if (!S.cat.causas.some(c => c.id_causa === data.id_causa)) S.cat.causas.push(data);
    v = data.id_causa;
  }
  if (campo === 'meta_general' && v !== '' && !(Number(v) >= 0)) { mostrarToast_('La meta general debe ser un número ≥ 0.'); el.value = ppaValEd_(a, campo) ?? ''; return; }
  if (campo === 'accion' && !String(v).trim()) { mostrarToast_('La acción no puede quedar vacía.'); el.value = ppaValEd_(a, campo) || ''; return; }
  const e = Object.assign({}, S.edits.get(id) || {});
  const fijar = (c, val) => { const n = ppaNormEd_(c, val), o = ppaNormEd_(c, a[c]); if (n === o) delete e[c]; else e[c] = n; };
  fijar(campo, v);
  // Al cambiar el área, el sector anterior ya no vale: queda «Toda el área» hasta elegir uno del área nueva
  if (campo === 'id_area') fijar('id_sector', ppaNormEd_('id_area', v) === a.id_area ? a.id_sector : null);
  if (Object.keys(e).length) S.edits.set(id, e); else S.edits.delete(id);
  ppaRenderCuerpo_();
}
async function ppaGuardarEdicion_() {
  const S = state.ppa, btn = document.getElementById('ppa-ed-guardar');
  if (!S.edits.size) return;
  btn.disabled = true; btn.textContent = 'Guardando…';
  const errores = []; let ok = 0;
  for (const [id, e] of S.edits) {
    const payload = {}; PPA_EDITABLES.forEach(c => { if (c in e) payload[c] = e[c]; });
    payload.actualizado_en = new Date().toISOString();
    const { error } = await supabaseClient.from('ppa').update(payload).eq('id_ppa', id);
    if (error) errores.push(id + ': ' + error.message); else { ok++; S.edits.delete(id); }
  }
  mostrarToast_(errores.length ? '⚠️ ' + ok + ' guardada(s); ' + errores.length + ' con error: ' + errores.slice(0, 3).join(' · ') : '✅ ' + ok + ' acción(es) actualizada(s).');
  try { await cargarPpa_(); } catch (e) { return; }
  ppaRender_();
}

/** Ficha de una acción: datos, metas y avances por quincena / mes y lista de avances (estos llegan solo desde la PWA). */
function ppaAbrirFicha_(id) {
  const S = state.ppa, a = S.porId.get(id); if (!a) return;
  let ov = document.getElementById('ppa-modal');
  if (!ov) { ov = document.createElement('div'); ov.id = 'ppa-modal'; ov.className = 'modal-overlay'; ov.style.position = 'fixed'; document.body.appendChild(ov);
    ov.addEventListener('click', e => { if (e.target === ov || e.target.closest('[data-ppa-cerrar]')) ov.classList.remove('show'); }); }
  const meses = ppaMesesPeriodo_(), h = ppaHoy_();
  const celda = (mes, per) => {
    const m = ppaMetaRaw_(id, mes, per), av = ppaAvanceSlot_(id, mes, per);
    const fin = per === 'Q1' ? mes.slice(0, 8) + '15' : mes.slice(0, 8) + String(ppaUltimoDia_(mes)).padStart(2, '0');
    const vencida = fin < h, falta = vencida && m != null && av < m;
    return '<td class="' + (falta ? 'ppa-falta' : '') + '"><b>' + (m == null ? '·' : ppaNum_(m)) + '</b><small>' + ppaNum_(av) + '</small></td>';
  };
  const avs = (S.avPorId.get(id) || []).slice().sort((x, y) => String(y.fecha).localeCompare(String(x.fecha)));
  ov.innerHTML = '<div class="modal-card" style="width:min(1060px,96vw);">' +
    '<div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start;"><div><h3>' + a.id_ppa + ' · ' + escapeHtml_(a.accion) + '</h3>' +
      '<p class="coords">' + escapeHtml_(a.subgerencia + ' · ' + a.area_nombre + ' · ' + (a.sector || 'Toda el área')) + ' · ' + escapeHtml_(a.accion_general || '') + ' · ' + escapeHtml_(a.grupo || '') + '</p></div>' +
      '<button class="turnos-btn" data-ppa-cerrar>✕</button></div>' +
    '<div class="ppa-ficha-datos">' +
      [['Causa', a.causa], ['Frecuencia', a.frecuencia], ['Plazo', ppaFechaTxt_(a.plazo) + (a.plazo_texto && a.plazo_texto !== a.plazo ? ' (' + a.plazo_texto + ')' : '')],
       ['Meta general', a.meta_general], ['Meta del período', ppaNum_(ppaMetaPeriodo_(id))], ['Exigible a hoy', ppaNum_(ppaExigible_(id))],
       ['Avance', ppaNum_(ppaAvanceTotal_(id))], ['Estado', ppaChipEstado_(ppaEstado_(id))]]
        .map(([k, v]) => '<div><span>' + k + '</span><b>' + (k === 'Estado' ? v : escapeHtml_(v == null || v === '' ? '—' : String(v))) + '</b></div>').join('') + '</div>' +
    '<div class="ppa-tabla-wrap" style="margin:10px 0;"><table class="tb-tabla ppa-grilla"><thead><tr><th>Mes</th>' +
      meses.map(m => '<th colspan="3">' + ppaMesTxt_(m, true) + '</th>').join('') + '</tr><tr><th>Periodo</th>' +
      meses.map(() => '<th>Q1</th><th>Q2</th><th>Mes</th>').join('') + '</tr></thead><tbody><tr><td><b>Meta</b><small>avance</small></td>' +
      meses.map(m => celda(m, 'Q1') + celda(m, 'Q2') + celda(m, 'M')).join('') + '</tr></tbody></table>' +
      '<small style="color:var(--text-tertiary);">En rojo: quincena o mes ya terminado con avance menor que la meta.</small></div>' +
    '<h4 style="margin:12px 0 6px;">Avances registrados (' + avs.length + ')</h4>' +
    (avs.length ? '<div class="ppa-tabla-wrap" style="max-height:220px;"><table class="tb-tabla"><thead><tr><th>Fecha</th><th>Quincena</th><th>Cantidad</th><th>Origen</th><th>Detalle</th>' + (ppaEsAdmin_() ? '<th></th>' : '') + '</tr></thead><tbody>' +
      avs.map(v => '<tr><td>' + ppaFechaTxt_(v.fecha) + '</td><td>' + ppaMesTxt_(String(v.mes).slice(0, 10), true) + ' Q' + v.quincena + '</td><td class="cel">' + ppaNum_(v.cantidad) + '</td>' +
        '<td>' + escapeHtml_(v.origen) + (v.periodo_excel ? ' (' + v.periodo_excel + ')' : '') + '</td><td>' + escapeHtml_(v.detalle || '') + '</td>' +
        (ppaEsAdmin_() ? '<td><button class="gr-del" data-ppa-delav="' + v.id + '" title="Eliminar este avance">🗑️</button></td>' : '') + '</tr>').join('') + '</tbody></table></div>'
      : '<div class="tb-vacio" style="padding:12px;">Sin avances registrados.</div>') +
    '<div class="gr-aviso" style="margin-top:12px;background:#EFF6FF;border-color:#93C5FD;color:#1E3A8A;">📱 Los avances se registran <b>solo desde la App (PWA)</b>, ' +
      'cada uno con su fecha: el sistema lo ubica solo en su quincena (Q1 = días 1 al 15, Q2 = 16 al fin de mes).' + (ppaEsAdmin_() ? ' El Administrador puede eliminar un avance mal ingresado (🗑️).' : '') + '</div></div>';
  ov.classList.add('show');
  ov.querySelectorAll('[data-ppa-delav]').forEach(b => b.onclick = async () => {
    if (!confirm('¿Eliminar este avance? (se registran solo desde la PWA; elimínalo solo si está mal ingresado)')) return;
    const { error } = await supabaseClient.from('ppa_avances').delete().eq('id', b.dataset.ppaDelav);
    if (error) { mostrarToast_('No se pudo eliminar: ' + error.message); return; }
    S.avances = S.avances.filter(v => String(v.id) !== b.dataset.ppaDelav); ppaIndexar_();
    ppaAbrirFicha_(id); ppaRenderCuerpo_();
  });
}

/* ── 📊 Tablero de Avance ─────────────────────────────────────────────── */
function ppaSerie_(lista, modo) {
  const ids = lista.map(a => a.id_ppa);
  if (modo === 'mes') return ppaMesesPeriodo_().map(mes => ({ etq: ppaMesTxt_(mes, true), fin: mes.slice(0, 8) + String(ppaUltimoDia_(mes)).padStart(2, '0'),
    meta: ids.reduce((s, id) => s + ppaMetaMes_(id, mes), 0), av: ids.reduce((s, id) => s + ppaAvanceSlot_(id, mes, 'M'), 0) }));
  return ppaQuincenas_().map(q => ({ etq: q.etq, fin: q.fin, meta: ids.reduce((s, id) => s + ppaMetaQ_(id, q.mes, q.per), 0),
    av: ids.reduce((s, id) => s + ppaAvanceSlot_(id, q.mes, q.per), 0) }));
}
function ppaKpis_(lista) {
  const ids = lista.map(a => a.id_ppa);
  const total = ids.reduce((s, id) => s + ppaMetaPeriodo_(id), 0), exig = ids.reduce((s, id) => s + ppaExigible_(id), 0);
  const av = ids.reduce((s, id) => s + ppaAvanceTotal_(id), 0), p = ppaPct_(av, exig);
  const est = {}; ids.forEach(id => { const e = ppaEstado_(id); est[e] = (est[e] || 0) + 1; });
  return { total, exig, av, p, est, n: ids.length };
}
function ppaHtmlKpis_(k) {
  const kpi = (c, v, t, s) => '<div class="tb-kpi" style="--c:' + c + '"><b>' + v + '</b><span>' + t + '</span>' + (s ? '<small>' + s + '</small>' : '') + '</div>';
  return '<div class="tb-kpis ppa-kpis">' +
    kpi('#2563EB', k.n, 'Acciones', 'con los filtros') + kpi('#7C3AED', ppaNum_(k.total), 'Meta del período', 'oct a mar') +
    kpi('#0891B2', ppaNum_(k.exig), 'Exigible a la fecha', 'quincenas terminadas') + kpi('#16A34A', ppaNum_(k.av), 'Avance registrado', '') +
    kpi(ppaColorPct_(k.p), k.p == null ? '—' : k.p + ' %', 'Cumplimiento a la fecha', 'avance / exigible') +
    kpi('#16A34A', k.est.aldia || 0, 'Al día', '') + kpi('#D97706', k.est.atrasada || 0, 'Atrasadas', '≥ 50 % de lo exigible') +
    kpi('#DC2626', k.est.critica || 0, 'Críticas', '< 50 % de lo exigible') + '</div>';
}
function ppaHtmlAvance_(lista) {
  const S = state.ppa, modo = S.vistaAvance, serie = ppaSerie_(lista, modo), h = ppaHoy_();
  const areas = [...new Map(lista.map(a => [a.id_area, a.area_nombre])).entries()].sort((a, b) => a[1].localeCompare(b[1], 'es'));
  const cols = modo === 'mes' ? ppaMesesPeriodo_().map(m => ({ etq: ppaMesTxt_(m, true), mes: m, per: 'M' })) : ppaQuincenas_();
  const metaCol = (id, c) => c.per === 'M' ? ppaMetaMes_(id, c.mes) : ppaMetaQ_(id, c.mes, c.per);
  return ppaHtmlKpis_(ppaKpis_(lista)) +
    '<div class="tb-card" style="margin-top:12px;"><h3>Meta vs avance ' + (modo === 'mes' ? 'por mes' : 'por quincena') +
      '<span class="ppa-toggle"><button data-ppa-vav="quincena" class="' + (modo === 'quincena' ? 'on' : '') + '">Quincenal</button><button data-ppa-vav="mes" class="' + (modo === 'mes' ? 'on' : '') + '">Mensual</button></span></h3>' +
      '<p class="tb-sub">Barras: meta y avance de cada ' + (modo === 'mes' ? 'mes' : 'quincena') + '. Línea: % de cumplimiento. ' +
      (modo === 'mes' ? 'Meta mensual = columna «Mensual» (si no hay, Q1 + Q2).' : 'Si la acción solo tiene meta mensual, vence en la Q2 del mes.') + '</p>' +
      '<div style="height:300px;"><canvas id="ppa-chart-avance"></canvas></div></div>' +
    '<div class="tb-card" style="margin-top:12px;"><h3>Cumplimiento por área</h3><p class="tb-sub">% avance / meta en cada ' + (modo === 'mes' ? 'mes' : 'quincena') + ' (en gris: aún no termina). Clic en el área: ver su detalle.</p>' +
      '<div class="ppa-tabla-wrap"><table class="tb-tabla"><thead><tr><th>Área</th>' + cols.map(c => '<th>' + c.etq + '</th>').join('') + '<th>A la fecha</th></tr></thead><tbody>' +
      areas.map(([idA, nom]) => {
        const ids = lista.filter(a => a.id_area === idA).map(a => a.id_ppa);
        const tot = ppaPct_(ids.reduce((s, id) => s + ppaAvanceTotal_(id), 0), ids.reduce((s, id) => s + ppaExigible_(id), 0));
        return '<tr><td><a href="#" data-ppa-area="' + idA + '">' + escapeHtml_(nom) + '</a></td>' + cols.map(c => {
          const fin = c.per === 'M' ? c.mes.slice(0, 8) + String(ppaUltimoDia_(c.mes)).padStart(2, '0') : c.fin;
          const m = ids.reduce((s, id) => s + metaCol(id, c), 0), av = ids.reduce((s, id) => s + ppaAvanceSlot_(id, c.mes, c.per), 0), p = ppaPct_(av, m);
          return '<td class="cel" title="Meta ' + ppaNum_(m) + ' · avance ' + ppaNum_(av) + '" style="' + (fin >= h ? 'color:#94A3B8;' : 'color:' + ppaColorPct_(p) + ';') + '">' + (m ? (p + ' %') : '·') + '</td>';
        }).join('') + '<td class="cel" style="color:' + ppaColorPct_(tot) + '">' + (tot == null ? '—' : tot + ' %') + '</td></tr>';
      }).join('') + '</tbody></table></div></div>';
}
function ppaGraficoAvance_(lista) {
  const cv = document.getElementById('ppa-chart-avance'); if (!cv || !window.Chart) return;
  const serie = ppaSerie_(lista, state.ppa.vistaAvance);
  state.ppa.charts.push(new Chart(cv, {
    data: { labels: serie.map(s => s.etq), datasets: [
      { type: 'bar', label: 'Meta', data: serie.map(s => ppaNum_(s.meta)), backgroundColor: 'rgba(124,58,237,0.35)', borderColor: '#7C3AED', borderWidth: 1, yAxisID: 'y' },
      { type: 'bar', label: 'Avance', data: serie.map(s => ppaNum_(s.av)), backgroundColor: 'rgba(22,163,74,0.75)', yAxisID: 'y' },
      { type: 'line', label: '% cumplimiento', data: serie.map(s => s.meta ? Math.round(s.av / s.meta * 100) : null), borderColor: '#0891B2', backgroundColor: '#0891B2', yAxisID: 'y2', tension: 0.25, spanGaps: true },
    ] },
    options: { responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
      scales: { y: { beginAtZero: true, title: { display: true, text: 'Acciones' } }, y2: { position: 'right', beginAtZero: true, suggestedMax: 100, grid: { drawOnChartArea: false }, ticks: { callback: v => v + ' %' } } } },
  }));
}

/* ── 🧾 Resumen ───────────────────────────────────────────────────────── */
function ppaHtmlResumen_(lista) {
  const tabla = (titulo, clave, nombre) => {
    const g = new Map();
    lista.forEach(a => { const k = a[clave] ?? '—'; if (!g.has(k)) g.set(k, { n: a[nombre] || 'Sin dato', ids: [] }); g.get(k).ids.push(a.id_ppa); });
    const filas = [...g.values()].map(x => ({ n: x.n, c: x.ids.length, t: x.ids.reduce((s, id) => s + ppaMetaPeriodo_(id), 0),
      e: x.ids.reduce((s, id) => s + ppaExigible_(id), 0), a: x.ids.reduce((s, id) => s + ppaAvanceTotal_(id), 0),
      crit: x.ids.filter(id => ppaEstado_(id) === 'critica').length })).sort((x, y) => y.c - x.c);
    return '<div class="tb-card"><h3>' + titulo + '</h3><div class="ppa-tabla-wrap" style="max-height:360px;"><table class="tb-tabla"><thead><tr><th>' + titulo.replace(/^\S+\s/, '') + '</th>' +
      '<th>Acciones</th><th>Meta período</th><th>Exigible</th><th>Avance</th><th>% a la fecha</th><th>Críticas</th></tr></thead><tbody>' +
      filas.map(f => { const p = ppaPct_(f.a, f.e); return '<tr><td>' + escapeHtml_(f.n) + '</td><td class="cel">' + f.c + '</td><td class="cel">' + ppaNum_(f.t) + '</td><td class="cel">' + ppaNum_(f.e) +
        '</td><td class="cel">' + ppaNum_(f.a) + '</td><td class="cel" style="color:' + ppaColorPct_(p) + '">' + (p == null ? '—' : p + ' %') + '</td><td class="cel" style="color:#DC2626;">' + (f.crit || '') + '</td></tr>'; }).join('') +
      '</tbody></table></div></div>';
  };
  const k = ppaKpis_(lista);
  const sinMetas = lista.filter(a => !ppaMetaPeriodo_(a.id_ppa)).length;
  const fueraPlazo = lista.filter(a => a.plazo && (a.plazo < state.ppa.periodo.fecha_inicio || a.plazo > state.ppa.periodo.fecha_fin)).length;
  const sinFrec = lista.filter(a => !a.frecuencia).length;
  return ppaHtmlKpis_(k) +
    '<div class="tb-card" style="margin-top:12px;"><h3>🔎 Calidad de los datos</h3><p class="tb-sub">Para revisar y validar antes de abrir el módulo a las áreas.</p>' +
      '<div class="ppa-calidad"><span><b>' + sinMetas + '</b> acciones sin metas</span><span><b>' + fueraPlazo + '</b> con plazo fuera del período</span>' +
      '<span><b>' + sinFrec + '</b> sin frecuencia</span><span><b>' + lista.filter(a => a.id_sector == null).length + '</b> de toda el área (sin sector)</span></div></div>' +
    '<div class="ppa-grid2" style="margin-top:12px;">' + tabla('🏢 Subgerencia', 'id_subg', 'subgerencia') + tabla('🧭 Área', 'id_area', 'area_nombre') +
      tabla('🗂️ Grupo del plan', 'id_grupo', 'grupo') + tabla('🧩 Acción general', 'id_accion_general', 'accion_general') +
      tabla('⚠️ Causa a gestionar', 'id_causa', 'causa') + tabla('🔁 Frecuencia', 'frecuencia', 'frecuencia') + '</div>';
}

/* ── 🎯 Metas por fecha (solo Administrador) ──────────────────────────── */
/* Reglas (07-11-2026):
 *  - La FRECUENCIA decide qué celdas se editan: Quincenal / Semanal → Q1 y Q2; Mensual → Mes. El resto queda bloqueado (gris).
 *  - Acción sin frecuencia → fila bloqueada con advertencia (se define en 📄 Detalle › ✏️ Editar datos).
 *  - El TOTAL es la «Meta gral.» del Excel; la distribución por fecha es independiente y la arma el usuario.
 *    «Distribuido» = suma de las celdas permitidas; en ROJO si difiere de la Meta gral.
 *  - Plantilla Excel para cargar metas en forma masiva (⬇️ Plantilla de metas / ⬆️ Subir metas). */
const PPA_DISTRIB = {
  difiere: { t: 'Distribución ≠ Meta gral.', c: '#DC2626' }, sinfrec: { t: 'Sin frecuencia (bloqueada)', c: '#D97706' },
  sinmeta: { t: 'Sin Meta gral.', c: '#7C3AED' }, ok: { t: 'Cuadra con la Meta gral.', c: '#16A34A' },
};
function ppaHtmlMetas_(lista) {
  const S = state.ppa, meses = ppaMesesPeriodo_(), ed = ppaEsAdmin_(), MAX = 150;
  const slots = meses.flatMap(m => ['Q1', 'Q2', 'M'].map(p => ({ mes: m, per: p })));
  const cuenta = {}; lista.forEach(a => { const e = ppaEstadoDistrib_(a); cuenta[e] = (cuenta[e] || 0) + 1; });
  const filtradas = S.mFiltro ? lista.filter(a => ppaEstadoDistrib_(a) === S.mFiltro) : lista, ver = filtradas.slice(0, MAX);
  // Metas guardadas en celdas que la frecuencia no usa (vienen del Excel): se pueden limpiar
  let bloqueadasConValor = 0;
  lista.forEach(a => { const perm = ppaSlotsPermitidos_(a); if (!perm.length) return;
    meses.forEach(m => ['Q1', 'Q2', 'M'].forEach(p => { if (!perm.includes(p) && ppaMetaRaw_(a.id_ppa, m, p) != null && !S.cambios.has(a.id_ppa + '|' + m + '|' + p)) bloqueadasConValor++; })); });
  const chip = k => '<button class="ppa-mchip' + (S.mFiltro === k ? ' on' : '') + '" data-ppa-mfiltro="' + k + '" style="--c:' + PPA_DISTRIB[k].c + '"><b>' + (cuenta[k] || 0) + '</b> ' + PPA_DISTRIB[k].t + '</button>';
  return '<div class="tb-card"><h3>🎯 Metas por fecha</h3><p class="tb-sub">Total = <b>Meta gral.</b> del Excel. La distribución por fecha es independiente: ' +
      'arma el plan en las celdas que permite la <b>frecuencia</b> (Quincenal / Semanal → Q1 y Q2 · Mensual → Mes; el resto queda bloqueado). ' +
      '«Distribuido» se pone en <b style="color:#DC2626;">rojo</b> si no cuadra con la Meta gral.</p>' +
    '<div class="ppa-mchips">' + ['difiere', 'sinfrec', 'sinmeta', 'ok'].map(chip).join('') +
      (S.mFiltro ? '<button class="ppa-mchip" data-ppa-mfiltro="">✕ Ver todas</button>' : '') + '</div>' +
    (cuenta.sinfrec ? '<div class="gr-aviso" style="margin:8px 0;">⚠️ <b>' + cuenta.sinfrec + ' acción(es) sin frecuencia</b>: sus metas quedan bloqueadas hasta definir la frecuencia en <b>📄 Detalle › ✏️ Editar datos</b>.</div>' : '') +
    (ed ? '<div class="ppa-masivo">' +
      '<button class="turnos-btn" id="ppa-m-plantilla" title="Excel con las acciones filtradas y sus metas, para completarlo y volver a subirlo">⬇️ Plantilla de metas</button>' +
      '<button class="turnos-btn" id="ppa-m-subir" title="Sube la plantilla completada: las metas quedan pendientes para revisar y guardar">⬆️ Subir metas</button>' +
      '<input type="file" id="ppa-m-archivo" accept=".xlsx,.xls" style="display:none;">' +
      '<span class="ppa-sep"></span>Aplicar a las filtradas: <select id="ppa-m-slot" class="admin-search">' +
      slots.map(s => '<option value="' + s.mes + '|' + s.per + '">' + ppaMesTxt_(s.mes, true) + ' · ' + (s.per === 'M' ? 'Mensual' : s.per) + '</option>').join('') + '</select>' +
      '<input id="ppa-m-valor" type="number" min="0" step="1" class="admin-search" placeholder="meta (vacío = quitar)" style="width:140px;">' +
      '<button class="turnos-btn" id="ppa-m-aplicar">Aplicar</button>' +
      (bloqueadasConValor ? '<button class="turnos-btn" id="ppa-m-limpiar" title="Quita las metas guardadas en celdas que la frecuencia no usa (no cuentan en el plan)">🧹 Quitar ' + bloqueadasConValor + ' meta(s) en celdas bloqueadas</button>' : '') +
      '<span class="ppa-sep"></span><button class="turnos-btn gr-btn-guardar" id="ppa-m-guardar"' + (S.cambios.size ? '' : ' disabled') + '>💾 Guardar cambios (' + S.cambios.size + ')</button>' +
      '<button class="turnos-btn" id="ppa-m-descartar"' + (S.cambios.size ? '' : ' disabled') + '>Descartar</button></div>' : '') +
    (filtradas.length > MAX ? '<div class="gr-aviso" style="margin:8px 0;">La grilla muestra ' + MAX + ' de ' + filtradas.length + ' acciones: filtra por área o sector para ver el resto (el «Aplicar» y la plantilla sí alcanzan a todas las filtradas).</div>' : '') +
    (!filtradas.length ? '<div class="tb-vacio">No hay acciones en este grupo.</div>' :
    '<div class="ppa-tabla-wrap" style="max-height:calc(100vh - 380px);"><table class="tb-tabla ppa-metas"><thead><tr><th rowspan="2">Acción</th><th rowspan="2">Frec.</th>' +
      meses.map(m => '<th colspan="3">' + ppaMesTxt_(m, true) + '</th>').join('') + '<th rowspan="2">Meta gral.<small>total</small></th><th rowspan="2">Distribuido</th><th rowspan="2">Dif.</th></tr><tr>' +
      meses.map(() => '<th>Q1</th><th>Q2</th><th>Mes</th>').join('') + '</tr></thead><tbody>' +
      ver.map(a => {
        const perm = ppaSlotsPermitidos_(a), est = ppaEstadoDistrib_(a), dist = ppaDistribuido_(a), mg = a.meta_general;
        const dif = mg == null ? null : ppaNum_(dist - Number(mg));
        return '<tr class="' + (est === 'sinfrec' ? 'ppa-sinfrec' : '') + '"><td class="ppa-acc"><b>' + a.id_ppa + '</b> ' + escapeHtml_(a.accion) +
          '<small>' + escapeHtml_(a.area_nombre + ' · ' + (a.sector || 'Toda el área')) + '</small>' +
          (est === 'sinfrec' ? '<small class="ppa-adv">⚠️ Sin frecuencia: defínela en Detalle › ✏️ Editar datos</small>' : '') + '</td>' +
          '<td>' + escapeHtml_(a.frecuencia || '—') + '</td>' +
          slots.map(s => {
            const k = a.id_ppa + '|' + s.mes + '|' + s.per, cam = S.cambios.has(k), v = cam ? S.cambios.get(k) : ppaMetaRaw_(a.id_ppa, s.mes, s.per);
            const libre = ed && perm.includes(s.per);
            const tit = !perm.length ? 'Bloqueada: la acción no tiene frecuencia' : !perm.includes(s.per) ? 'Bloqueada: frecuencia ' + a.frecuencia + (v != null ? ' (este valor no cuenta en el plan)' : '') : '';
            return '<td class="' + (s.per === 'M' ? 'ppa-colm ' : '') + (cam ? 'ppa-cambio ' : '') + (perm.includes(s.per) ? '' : 'ppa-bloq') + '"' + (tit ? ' title="' + tit + '"' : '') + '>' +
              (libre ? '<input type="number" min="0" step="1" data-ppa-meta="' + k + '" value="' + (v == null ? '' : v) + '">' : (v == null ? '' : '<span>' + v + '</span>')) + '</td>';
          }).join('') +
          '<td class="cel">' + (mg == null ? '<span style="color:#7C3AED;" title="Sin Meta gral.: defínela en ✏️ Editar datos">—</span>' : ppaNum_(mg)) + '</td>' +
          '<td class="cel" style="color:' + (est === 'difiere' ? '#DC2626' : est === 'ok' ? '#16A34A' : 'var(--text-tertiary)') + ';' + (est === 'difiere' ? 'background:#FEE2E2;' : '') + '">' + (perm.length ? ppaNum_(dist) : '—') + '</td>' +
          '<td class="cel" style="color:' + (dif ? '#DC2626' : 'var(--text-tertiary)') + ';">' + (dif == null || !perm.length ? '' : (dif > 0 ? '+' : '') + dif) + '</td></tr>';
      }).join('') +
    '</tbody></table></div>') + '</div>';
}
function ppaIniciarMetas_(lista) {
  const S = state.ppa, cuerpo = document.getElementById('ppa-cuerpo');
  cuerpo.querySelectorAll('[data-ppa-mfiltro]').forEach(b => b.onclick = () => { S.mFiltro = b.dataset.ppaMfiltro || ''; ppaRenderCuerpo_(); });
  if (!ppaEsAdmin_()) return;
  const marcar = (a, mes, per, v) => {
    const k = a.id_ppa + '|' + mes + '|' + per;
    if (v === ppaMetaRaw_(a.id_ppa, mes, per)) S.cambios.delete(k); else S.cambios.set(k, v);
  };
  cuerpo.querySelectorAll('[data-ppa-meta]').forEach(inp => inp.addEventListener('change', () => {
    const [id, mes, per] = inp.dataset.ppaMeta.split('|'), a = S.porId.get(id), v = inp.value === '' ? null : Number(inp.value);
    if (!a || !ppaSlotsPermitidos_(a).includes(per)) return;   // celda bloqueada por la frecuencia
    if (v != null && !(v >= 0)) { inp.value = ''; return; }
    marcar(a, mes, per, v);
    // Recalcula «Distribuido» y la diferencia; después de que el foco pasa a la celda siguiente (Tab / clic) se re-dibuja y se le
    // devuelve el foco, así se puede cargar la grilla seguido con el teclado (el scroll también se conserva)
    setTimeout(() => {
      const act = document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.ppaMeta : null;
      ppaRenderCuerpo_();
      if (act) { const el = document.querySelector('#ppa-cuerpo [data-ppa-meta="' + act + '"]'); if (el) { el.focus(); if (el.select) el.select(); } }
    }, 0);
  }));
  document.getElementById('ppa-m-aplicar').onclick = () => {
    const [mes, per] = document.getElementById('ppa-m-slot').value.split('|'), t = document.getElementById('ppa-m-valor').value;
    const v = t === '' ? null : Number(t);
    if (v != null && !(v >= 0)) { mostrarToast_('Meta inválida.'); return; }
    const aplica = lista.filter(a => ppaSlotsPermitidos_(a).includes(per));
    if (!aplica.length) { mostrarToast_('Ninguna acción filtrada usa la celda ' + (per === 'M' ? 'Mensual' : per) + ' (depende de su frecuencia).'); return; }
    if (!confirm('¿Dejar la meta ' + ppaMesTxt_(mes, true) + ' ' + (per === 'M' ? 'Mensual' : per) + ' en ' + (v == null ? '«sin meta»' : v) + ' para ' + aplica.length + ' acción(es)?' +
      (aplica.length < lista.length ? '\n(' + (lista.length - aplica.length) + ' se omiten: su frecuencia no usa esa celda o no tienen frecuencia)' : '') + '\nSe guarda al presionar «Guardar cambios».')) return;
    aplica.forEach(a => marcar(a, mes, per, v));
    ppaRenderCuerpo_();
  };
  const lim = document.getElementById('ppa-m-limpiar');
  if (lim) lim.onclick = () => {
    let n = 0;
    lista.forEach(a => { const perm = ppaSlotsPermitidos_(a); if (!perm.length) return;
      ppaMesesPeriodo_().forEach(m => ['Q1', 'Q2', 'M'].forEach(p => { if (!perm.includes(p) && ppaMetaRaw_(a.id_ppa, m, p) != null) { S.cambios.set(a.id_ppa + '|' + m + '|' + p, null); n++; } })); });
    mostrarToast_('🧹 ' + n + ' meta(s) de celdas bloqueadas marcadas para quitar. Revisa y presiona «Guardar cambios».');
    ppaRenderCuerpo_();
  };
  document.getElementById('ppa-m-plantilla').onclick = () => ppaPlantillaMetas_(lista);
  document.getElementById('ppa-m-subir').onclick = () => document.getElementById('ppa-m-archivo').click();
  document.getElementById('ppa-m-archivo').onchange = e => { const f = e.target.files[0]; e.target.value = ''; if (f) ppaSubirMetas_(f); };
  document.getElementById('ppa-m-descartar').onclick = () => { S.cambios.clear(); ppaRenderCuerpo_(); };
  document.getElementById('ppa-m-guardar').onclick = ppaGuardarMetas_;
}

/* ── Plantilla Excel de metas (carga masiva) ──────────────────────────────
 * Hoja «metas»: id_ppa, datos de referencia, Frecuencia, Meta gral. y una columna por celda «AAAA-MM Q1 / Q2 / Mes».
 * Al subirla: solo se toman las celdas permitidas por la frecuencia de cada acción (celda vacía = sin meta);
 * lo demás se ignora con aviso. Las metas quedan PENDIENTES en la grilla hasta «💾 Guardar cambios». */
function ppaColSlot_(mes, per) { return mes.slice(0, 7) + ' ' + (per === 'M' ? 'Mes' : per); }
async function ppaPlantillaMetas_(lista) {
  let X; try { X = await tbCargarSheetJs_(); } catch (e) { mostrarToast_(e.message); return; }
  const meses = ppaMesesPeriodo_(), S = state.ppa;
  const enc = ['id_ppa', 'Área', 'Sector', 'Acción', 'Frecuencia', 'Meta gral.', 'Distribuido (fórmula)']
    .concat(meses.flatMap(m => ['Q1', 'Q2', 'M'].map(p => ppaColSlot_(m, p))));
  const filas = lista.map(a => {
    const perm = ppaSlotsPermitidos_(a);
    return [a.id_ppa, a.area_nombre, a.sector || 'Toda el área', a.accion, a.frecuencia || 'SIN FRECUENCIA', a.meta_general ?? '', '']
      .concat(meses.flatMap(m => ['Q1', 'Q2', 'M'].map(p => {
        if (!perm.includes(p)) return perm.length ? '—' : '';
        const k = a.id_ppa + '|' + m + '|' + p, v = S.cambios.has(k) ? S.cambios.get(k) : ppaMetaRaw_(a.id_ppa, m, p);
        return v == null ? '' : v;
      })));
  });
  const ws = X.utils.aoa_to_sheet([enc].concat(filas));
  // «Distribuido» como fórmula de Excel: suma de las columnas de metas de la fila (las «—» no suman)
  const ultima = X.utils.encode_col(enc.length - 1);
  filas.forEach((f, i) => { const r = i + 2; ws['G' + r] = { t: 'n', f: 'SUM(H' + r + ':' + ultima + r + ')' }; });
  ws['!cols'] = [{ wch: 8 }, { wch: 16 }, { wch: 16 }, { wch: 46 }, { wch: 14 }, { wch: 10 }, { wch: 12 }].concat(enc.slice(7).map(() => ({ wch: 10 })));
  ws['!freeze'] = { xSplit: 7, ySplit: 1 };
  const wb = X.utils.book_new();
  X.utils.book_append_sheet(wb, ws, 'metas');
  X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet([
    ['Cómo cargar las metas del PPA'],
    ['1. Completa SOLO las celdas de la frecuencia de cada acción: Quincenal / Semanal → columnas Q1 y Q2 · Mensual → columnas «Mes».'],
    ['2. Las celdas con «—» no corresponden a la frecuencia y se ignoran. Las acciones SIN FRECUENCIA no se cargan (defínela antes en el sistema).'],
    ['3. La suma de la fila («Distribuido») debe ser igual a la «Meta gral.»; si no, el sistema la marca en rojo.'],
    ['4. Celda vacía = sin meta en esa fecha. No cambies las columnas id_ppa ni los encabezados de fecha (AAAA-MM Q1 / Q2 / Mes).'],
    ['5. En el sistema: 📋 PPA › 🎯 Metas por fecha › ⬆️ Subir metas → revisa lo cargado (en ámbar) y presiona «💾 Guardar cambios».'],
  ]), 'Instrucciones');
  X.writeFile(wb, 'PPA_metas_' + S.periodo.id_periodo + '_' + ppaHoy_() + '.xlsx');
  mostrarToast_('⬇️ Plantilla con ' + lista.length + ' acciones.');
}
async function ppaSubirMetas_(archivo) {
  const S = state.ppa;
  let X; try { X = await tbCargarSheetJs_(); } catch (e) { mostrarToast_(e.message); return; }
  let wb; try { wb = X.read(await archivo.arrayBuffer(), { type: 'array' }); } catch (e) { mostrarToast_('No se pudo leer el archivo: ' + e.message); return; }
  const hoja = wb.Sheets['metas'] || wb.Sheets[wb.SheetNames[0]];
  const filas = X.utils.sheet_to_json(hoja, { header: 1, raw: true, defval: '' });
  const enc = (filas[0] || []).map(c => String(c).trim()), iId = enc.findIndex(c => c.toLowerCase() === 'id_ppa');
  if (iId < 0) { mostrarToast_('La hoja no tiene la columna «id_ppa» (usa ⬇️ Plantilla de metas).'); return; }
  const meses = new Set(ppaMesesPeriodo_().map(m => m.slice(0, 7)));
  const cols = enc.map((c, i) => { const m = /^(\d{4}-\d{2})\s+(Q1|Q2|Mes)$/i.exec(c); return m && meses.has(m[1]) ? { i, mes: m[1] + '-01', per: m[2].toUpperCase() === 'MES' ? 'M' : m[2].toUpperCase() } : null; }).filter(Boolean);
  if (!cols.length) { mostrarToast_('No se reconocieron las columnas de fecha (AAAA-MM Q1 / Q2 / Mes).'); return; }
  const avisos = []; let nAcc = 0, nCambios = 0, nIgnoradas = 0, sinFrec = 0;
  for (let r = 1; r < filas.length; r++) {
    const id = String(filas[r][iId] || '').trim().toUpperCase(); if (!id) continue;
    const a = S.porId.get(id);
    if (!a) { avisos.push(id + ': no existe en el PPA'); continue; }
    const perm = ppaSlotsPermitidos_(a);
    if (!perm.length) { sinFrec++; continue; }
    nAcc++;
    cols.forEach(c => {
      const t = filas[r][c.i], vacio = t === '' || t == null || String(t).trim() === '—';
      if (!perm.includes(c.per)) { if (!vacio) nIgnoradas++; return; }
      const v = vacio ? null : Number(t);
      if (v != null && !(v >= 0)) { avisos.push(id + ': «' + t + '» en ' + c.mes.slice(0, 7) + ' ' + c.per + ' no es un número válido'); return; }
      const k = id + '|' + c.mes + '|' + c.per, antes = S.cambios.has(k) ? S.cambios.get(k) : ppaMetaRaw_(id, c.mes, c.per);
      if (v !== antes) nCambios++;
      if (v === ppaMetaRaw_(id, c.mes, c.per)) S.cambios.delete(k); else S.cambios.set(k, v);
    });
  }
  S.mFiltro = '';
  ppaRenderCuerpo_();
  alert('⬆️ Metas leídas de «' + archivo.name + '»\n\n' + nAcc + ' acción(es) · ' + nCambios + ' celda(s) cambiadas (en ámbar en la grilla).' +
    (sinFrec ? '\n' + sinFrec + ' acción(es) sin frecuencia: no se cargaron.' : '') +
    (nIgnoradas ? '\n' + nIgnoradas + ' valor(es) en celdas que la frecuencia no usa: ignorados.' : '') +
    (avisos.length ? '\n\nAvisos:\n' + avisos.slice(0, 15).join('\n') + (avisos.length > 15 ? '\n… y ' + (avisos.length - 15) + ' más' : '') : '') +
    '\n\nRevisa la grilla y presiona «💾 Guardar cambios» para grabarlas.');
}
async function ppaGuardarMetas_() {
  const S = state.ppa, btn = document.getElementById('ppa-m-guardar');
  if (!S.cambios.size) return;
  btn.disabled = true; btn.textContent = 'Guardando…';
  const upserts = [], borrar = [];
  S.cambios.forEach((v, k) => { const [id_ppa, mes, periodo] = k.split('|'); if (v == null) borrar.push({ id_ppa, mes, periodo }); else upserts.push({ id_ppa, mes, periodo, meta: v, actualizado_en: new Date().toISOString() }); });
  try {
    for (let i = 0; i < upserts.length; i += 500) {
      const { error } = await supabaseClient.from('ppa_metas').upsert(upserts.slice(i, i + 500), { onConflict: 'id_ppa,mes,periodo' });
      if (error) throw error;
    }
    for (const b of borrar) {
      const { error } = await supabaseClient.from('ppa_metas').delete().eq('id_ppa', b.id_ppa).eq('mes', b.mes).eq('periodo', b.periodo);
      if (error) throw error;
    }
    S.metas = S.metas.filter(m => !S.cambios.has(m.id_ppa + '|' + String(m.mes).slice(0, 10) + '|' + m.periodo)).concat(upserts.map(u => ({ id_ppa: u.id_ppa, mes: u.mes, periodo: u.periodo, meta: u.meta })));
    const n = S.cambios.size; S.cambios.clear(); ppaIndexar_();
    mostrarToast_('✅ ' + n + ' meta(s) guardada(s).');
    ppaRenderCuerpo_();
  } catch (e) {
    mostrarToast_('No se pudieron guardar las metas: ' + (e.message || e));
    btn.disabled = false; btn.textContent = '💾 Guardar cambios (' + S.cambios.size + ')';
  }
}

/* ── 🧭 Tablero de Gestión ────────────────────────────────────────────── */
function ppaHtmlGestion_(lista) {
  const k = ppaKpis_(lista), h = ppaHoy_();
  const en15 = new Date(); en15.setDate(en15.getDate() + 15);
  const lim = en15.getFullYear() + '-' + String(en15.getMonth() + 1).padStart(2, '0') + '-' + String(en15.getDate()).padStart(2, '0');
  const criticas = lista.filter(a => ['critica', 'atrasada'].includes(ppaEstado_(a.id_ppa)))
    .map(a => ({ a, falta: ppaExigible_(a.id_ppa) - ppaAvanceTotal_(a.id_ppa) })).sort((x, y) => y.falta - x.falta).slice(0, 15);
  const proximas = lista.filter(a => a.plazo && a.plazo >= h && a.plazo <= lim).sort((x, y) => x.plazo.localeCompare(y.plazo)).slice(0, 15);
  const hace15 = new Date(); hace15.setDate(hace15.getDate() - 15);
  const desde = hace15.toISOString().slice(0, 10), ids = new Set(lista.map(a => a.id_ppa));
  const recientes = state.ppa.avances.filter(v => ids.has(v.id_ppa) && v.fecha >= desde);
  const areas = [...new Map(lista.map(a => [a.id_area, a.area_nombre])).entries()].map(([idA, nom]) => {
    const l = lista.filter(a => a.id_area === idA), kk = ppaKpis_(l); return { idA, nom, kk };
  }).sort((x, y) => (x.kk.p ?? 999) - (y.kk.p ?? 999));
  const fila = (a, extra) => '<tr data-ppa-id="' + a.id_ppa + '" class="ppa-fila"><td><b>' + a.id_ppa + '</b></td><td>' + escapeHtml_(a.area_nombre) + '<small>' + escapeHtml_(a.sector || 'Toda el área') + '</small></td><td class="ppa-acc">' + escapeHtml_(a.accion) + '</td>' + extra + '</tr>';
  return ppaHtmlKpis_(k) +
    '<div class="tb-kpis ppa-kpis" style="margin-top:10px;">' +
      '<div class="tb-kpi" style="--c:#0891B2"><b>' + recientes.length + '</b><span>Avances en los últimos 15 días</span><small>' + ppaNum_(recientes.reduce((s, v) => s + Number(v.cantidad), 0)) + ' acciones realizadas</small></div>' +
      '<div class="tb-kpi" style="--c:#7C3AED"><b>' + proximas.length + '</b><span>Plazos en los próximos 15 días</span></div>' +
      '<div class="tb-kpi" style="--c:#64748B"><b>' + (k.est.pendiente || 0) + '</b><span>Sin metas vencidas aún</span></div>' +
      '<div class="tb-kpi" style="--c:#94A3B8"><b>' + (k.est.sinmeta || 0) + '</b><span>Sin metas</span><small>revisar en 🎯 Metas</small></div></div>' +
    '<div class="ppa-grid2" style="margin-top:12px;">' +
      '<div class="tb-card"><h3>Avance acumulado vs meta acumulada</h3><p class="tb-sub">Por quincena, desde el inicio del PPA.</p><div style="height:260px;"><canvas id="ppa-chart-acum"></canvas></div></div>' +
      '<div class="tb-card"><h3>Estado de las acciones</h3><p class="tb-sub">Según lo exigible a la fecha.</p><div style="height:260px;"><canvas id="ppa-chart-estado"></canvas></div></div>' +
    '</div>' +
    '<div class="tb-card" style="margin-top:12px;"><h3>🚦 Semáforo por área</h3><p class="tb-sub">Cumplimiento a la fecha (avance / exigible). Clic en el área: ver su detalle.</p>' +
      '<div class="ppa-semaforo">' + areas.map(x => '<div class="ppa-sem" data-ppa-area="' + x.idA + '" style="--c:' + ppaColorPct_(x.kk.p) + '"><b>' + escapeHtml_(x.nom) + '</b>' +
        '<div class="ppa-barra"><i style="width:' + Math.min(100, x.kk.p || 0) + '%"></i></div><span>' + (x.kk.p == null ? 'sin metas vencidas' : x.kk.p + ' %') + ' · ' + x.kk.n + ' acciones · ' +
        (x.kk.est.critica || 0) + ' críticas</span></div>').join('') + '</div></div>' +
    '<div class="ppa-grid2" style="margin-top:12px;">' +
      '<div class="tb-card"><h3>⚠️ Acciones más atrasadas</h3><p class="tb-sub">Mayor diferencia entre lo exigible y el avance.</p>' +
        (criticas.length ? '<div class="ppa-tabla-wrap" style="max-height:340px;"><table class="tb-tabla"><thead><tr><th>ID</th><th>Área</th><th>Acción</th><th>Falta</th><th>Estado</th></tr></thead><tbody>' +
          criticas.map(x => fila(x.a, '<td class="cel" style="color:#DC2626;">' + ppaNum_(x.falta) + '</td><td>' + ppaChipEstado_(ppaEstado_(x.a.id_ppa)) + '</td>')).join('') + '</tbody></table></div>' : '<div class="tb-vacio">Ninguna acción atrasada. 🎉</div>') + '</div>' +
      '<div class="tb-card"><h3>📆 Plazos próximos (15 días)</h3><p class="tb-sub">Acciones cuyo plazo de ejecución vence pronto.</p>' +
        (proximas.length ? '<div class="ppa-tabla-wrap" style="max-height:340px;"><table class="tb-tabla"><thead><tr><th>ID</th><th>Área</th><th>Acción</th><th>Plazo</th><th>Estado</th></tr></thead><tbody>' +
          proximas.map(a => fila(a, '<td>' + ppaFechaTxt_(a.plazo) + '</td><td>' + ppaChipEstado_(ppaEstado_(a.id_ppa)) + '</td>')).join('') + '</tbody></table></div>' : '<div class="tb-vacio">Sin plazos en los próximos 15 días.</div>') + '</div>' +
    '</div>';
}
function ppaGraficosGestion_(lista) {
  if (!window.Chart) return;
  const qs = ppaQuincenas_(), ids = lista.map(a => a.id_ppa), h = ppaHoy_();
  let mA = 0, aA = 0;
  const meta = [], av = [];
  qs.forEach(q => {
    mA += ids.reduce((s, id) => s + ppaMetaQ_(id, q.mes, q.per), 0); meta.push(ppaNum_(mA));
    aA += ids.reduce((s, id) => s + ppaAvanceSlot_(id, q.mes, q.per), 0); av.push(q.ini <= h ? ppaNum_(aA) : null);
  });
  const c1 = document.getElementById('ppa-chart-acum');
  if (c1) state.ppa.charts.push(new Chart(c1, { type: 'line', data: { labels: qs.map(q => q.etq), datasets: [
    { label: 'Meta acumulada', data: meta, borderColor: '#7C3AED', backgroundColor: 'rgba(124,58,237,0.1)', fill: true, tension: 0.2 },
    { label: 'Avance acumulado', data: av, borderColor: '#16A34A', backgroundColor: 'rgba(22,163,74,0.15)', fill: true, tension: 0.2, spanGaps: false },
  ] }, options: { responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, scales: { y: { beginAtZero: true } } } }));
  const k = ppaKpis_(lista), orden = ['aldia', 'atrasada', 'critica', 'pendiente', 'sinmeta'];
  const c2 = document.getElementById('ppa-chart-estado');
  if (c2) state.ppa.charts.push(new Chart(c2, { type: 'doughnut', data: { labels: orden.map(e => PPA_ESTADOS[e].t),
    datasets: [{ data: orden.map(e => k.est[e] || 0), backgroundColor: orden.map(e => PPA_ESTADOS[e].c) }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right' } } } }));
}

/* ── ⬇️ Excel (mismo formato del Consolidado PPA) ─────────────────────── */
async function ppaDescargarExcel_() {
  const S = state.ppa; if (!S.cargado) return;
  let X; try { X = await tbCargarSheetJs_(); } catch (e) { mostrarToast_(e.message); return; }
  const meses = ppaMesesPeriodo_(), lista = ppaFiltradas_();
  const fila1 = Array(16).fill(''), fila2 = Array(16).fill(''), fila3 = ['id_ppa', 'id_subg', 'subgerencia', 'id_area', 'AREA', 'id_sector', 'SECTOR', 'CAUSA A GESTIONAR',
    'ACCION', 'id_accion_general', 'Acción general', 'id_grupo', 'GRUPO PLAN', 'META GENERAL', 'PLAZO EJECUCIÓN', 'FRECUENCIA'];
  meses.forEach(m => { const [a, mm] = m.split('-').map(Number);
    fila1.push(PPA_MESES[mm - 1].toUpperCase() + ' ' + a, '', '', '', '', ''); fila2.push('Q1', '', 'Q2', '', 'Mensual', '');
    fila3.push('META', 'AVANCE', 'META', 'AVANCE', 'META', 'AVANCE'); });
  const datos = lista.map(a => {
    const f = [a.id_ppa, a.id_subg, a.subgerencia, a.id_area, a.area_nombre, a.id_sector ?? 0, a.sector || 0, a.causa || '', a.accion,
      a.id_accion_general || '', a.accion_general || '', a.id_grupo || '', a.grupo || '', a.meta_general ?? '', a.plazo ? ppaFechaTxt_(a.plazo) : (a.plazo_texto || ''), a.frecuencia || ''];
    meses.forEach(m => ['Q1', 'Q2', 'M'].forEach(p => { const me = ppaMetaRaw_(a.id_ppa, m, p), av = ppaAvanceSlot_(a.id_ppa, m, p); f.push(me == null ? '' : me, av || ''); }));
    return f;
  });
  const wb = X.utils.book_new();
  const ws = X.utils.aoa_to_sheet([fila1, fila2, fila3].concat(datos));
  ws['!merges'] = meses.flatMap((m, i) => { const c = 16 + i * 6; return [{ s: { r: 0, c }, e: { r: 0, c: c + 5 } }, { s: { r: 1, c }, e: { r: 1, c: c + 1 } }, { s: { r: 1, c: c + 2 }, e: { r: 1, c: c + 3 } }, { s: { r: 1, c: c + 4 }, e: { r: 1, c: c + 5 } }]; });
  X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet([['id_accion_general', 'Acción general']].concat(S.cat.ag.map(x => [x.id_accion_general, x.nombre]))), 'tb_accion_general_ppa');
  X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet([['id_grupo', 'GRUPO PLAN']].concat(S.cat.gp.map(x => [x.id_grupo, x.nombre]))), 'tb_grupo_ppa');
  X.utils.book_append_sheet(wb, ws, 'tb_ppa');
  // Avances uno por uno (con su fecha y quincena)
  const ids = new Set(lista.map(a => a.id_ppa));
  X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet([['id_ppa', 'fecha', 'mes', 'quincena', 'cantidad', 'origen', 'detalle']].concat(
    S.avances.filter(v => ids.has(v.id_ppa)).sort((x, y) => String(x.fecha).localeCompare(String(y.fecha)))
      .map(v => [v.id_ppa, ppaFechaTxt_(v.fecha), ppaMesTxt_(String(v.mes).slice(0, 10)), 'Q' + v.quincena, Number(v.cantidad), v.origen, v.detalle || '']))), 'avances_detalle');
  wb.Workbook = { Views: [{ activeTab: 2 }] };
  X.writeFile(wb, 'PPA_' + S.periodo.id_periodo + '_' + ppaHoy_() + '.xlsx');
  mostrarToast_('⬇️ Excel con ' + lista.length + ' acciones (mismo formato para volver a subirlo).');
}

/* ── ⬆️ Subir Excel (solo Administrador) ──────────────────────────────── */
function ppaFechaExcel_(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') { const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(v) * 864e5); return d.toISOString().slice(0, 10); }
  const t = String(v).trim();
  let m = /^(\d{1,2})[-/ ]([A-Za-záéíóú]+)\.?[-/ ](\d{2,4})$/.exec(t);
  if (m) { const mes = PPA_MESES_CORTOS[m[2].toLowerCase()]; if (!mes) return null; let a = Number(m[3]); if (a < 100) a += 2000;
    return a + '-' + String(mes).padStart(2, '0') + '-' + String(Number(m[1])).padStart(2, '0'); }
  m = /^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})$/.exec(t);
  if (m) { let a = Number(m[3]); if (a < 100) a += 2000; return a + '-' + String(Number(m[2])).padStart(2, '0') + '-' + String(Number(m[1])).padStart(2, '0'); }
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10);
  return null;
}
async function ppaLeerExcel_(archivo) {
  const S = state.ppa;
  if (!ppaEsAdmin_()) return;
  let X; try { X = await tbCargarSheetJs_(); } catch (e) { mostrarToast_(e.message); return; }
  let wb;
  try { wb = X.read(await archivo.arrayBuffer(), { type: 'array' }); } catch (e) { mostrarToast_('No se pudo leer el archivo: ' + e.message); return; }
  const hoja = wb.Sheets['tb_ppa']; if (!hoja) { mostrarToast_('El archivo no tiene la hoja «tb_ppa».'); return; }
  const filas = X.utils.sheet_to_json(hoja, { header: 1, raw: true, defval: '' });
  const iEnc = filas.findIndex(r => r.some(c => String(c).trim().toLowerCase() === 'id_ppa'));
  if (iEnc < 2) { mostrarToast_('No se encontró la fila de encabezados (con «id_ppa») en tb_ppa.'); return; }
  const enc = filas[iEnc].map(c => String(c).trim().toUpperCase()), col = n => enc.indexOf(n.toUpperCase());
  const r1 = filas[iEnc - 2], r2 = filas[iEnc - 1], anioIni = Number(S.periodo.fecha_inicio.slice(0, 4)), mesIni = Number(S.periodo.fecha_inicio.slice(5, 7));
  const NOMBRES = PPA_MESES.map(n => n.toUpperCase());
  const slots = [];
  r1.forEach((c, i) => {
    const n = NOMBRES.indexOf(String(c).trim().toUpperCase().replace(/\s+\d{4}$/, '')); if (n < 0) return;
    const mes = (n + 1 >= mesIni ? anioIni : anioIni + 1) + '-' + String(n + 1).padStart(2, '0') + '-01';
    for (let k = i; k < i + 6; k++) { const p = String(r2[k] || '').trim().toUpperCase(); const per = p === 'Q1' ? 'Q1' : p === 'Q2' ? 'Q2' : p.startsWith('MENSUAL') ? 'M' : null;
      if (per) slots.push({ mes, per, cM: k, cA: k + 1 }); }
  });
  if (!slots.length) { mostrarToast_('No se reconocieron los meses (fila sobre los Q1 / Q2 / Mensual).'); return; }
  const num = v => (v === '' || v == null || isNaN(Number(v))) ? null : Number(v);
  const avisos = [], data = [], areasOk = new Set(S.areas.map(a => String(a.id_area))), sectOk = new Set(S.sectores.map(s => s.id_area + '|' + s.id_sector));
  for (let i = iEnc + 1; i < filas.length; i++) {
    const r = filas[i], id = String(r[col('id_ppa')] || '').trim(); if (!id) continue;
    const idArea = String(r[col('id_area')]).trim(), idSec = String(r[col('id_sector')]).trim();
    if (!areasOk.has(idArea)) avisos.push(id + ': el área ' + idArea + ' no existe (la fila se rechazará)');
    else if (idSec && idSec !== '0' && !sectOk.has(idArea + '|' + idSec)) avisos.push(id + ': el sector ' + idArea + '·' + idSec + ' no existe (la fila se rechazará)');
    const plazoRaw = r[col('PLAZO EJECUCIÓN')], plazo = ppaFechaExcel_(plazoRaw);
    // Solo metas: las columnas AVANCE del Excel se ignoran (los avances llegan solo desde la PWA, SQL 163)
    const metas = [];
    [...new Set(slots.map(s => s.mes))].forEach(mes => {
      slots.filter(s => s.mes === mes).forEach(s => { const v = num(r[s.cM]); if (v != null && v > 0) metas.push({ mes, periodo: s.per, meta: v }); else if (r[s.cM] !== '' && v == null) avisos.push(id + ': meta «' + r[s.cM] + '» no es número (' + mes.slice(0, 7) + ' ' + s.per + ')'); });
    });
    data.push({ id_ppa: id, id_subg: String(r[col('id_subg')]), id_area: idArea, area: String(r[col('AREA')]), id_sector: idSec === '0' ? '' : idSec,
      sector: String(r[col('SECTOR')]), causa: String(r[col('CAUSA A GESTIONAR')]), accion: String(r[col('ACCION')]),
      id_accion_general: String(r[col('id_accion_general')]).trim(), accion_general: String(r[col('Acción general')]),
      id_grupo: String(r[col('id_grupo')]).trim(), grupo: String(r[col('GRUPO PLAN')]), meta_general: String(r[col('META GENERAL')]),
      plazo, plazo_texto: typeof plazoRaw === 'number' ? plazo : String(plazoRaw || ''), frecuencia: String(r[col('FRECUENCIA')] || ''), metas });
  }
  const cat = { acciones: [], grupos: [] };
  const hojaCat = (n, k) => { const h = wb.Sheets[n]; if (!h) return; X.utils.sheet_to_json(h, { header: 1, defval: '' }).slice(1).forEach(r => { if (String(r[0]).trim()) cat[k].push({ id: String(r[0]).trim(), nombre: String(r[1]).trim() }); }); };
  hojaCat('tb_accion_general_ppa', 'acciones'); hojaCat('tb_grupo_ppa', 'grupos');
  const nuevas = data.filter(d => !S.porId.has(d.id_ppa)).length;
  // Vista previa
  let ov = document.getElementById('ppa-modal');
  if (!ov) { ov = document.createElement('div'); ov.id = 'ppa-modal'; ov.className = 'modal-overlay'; ov.style.position = 'fixed'; document.body.appendChild(ov);
    ov.addEventListener('click', e => { if (e.target === ov || e.target.closest('[data-ppa-cerrar]')) ov.classList.remove('show'); }); }
  ov.innerHTML = '<div class="modal-card" style="width:min(720px,96vw);"><h3>⬆️ Subir PPA desde Excel</h3><p class="coords">' + escapeHtml_(archivo.name) + ' · período ' + escapeHtml_(S.periodo.nombre) + '</p>' +
    '<div class="ppa-calidad"><span><b>' + data.length + '</b> acciones</span><span><b>' + nuevas + '</b> nuevas</span><span><b>' + (data.length - nuevas) + '</b> se actualizan</span>' +
    '<span><b>' + data.reduce((s, d) => s + d.metas.length, 0) + '</b> metas</span>' +
    '<span><b>' + cat.acciones.length + ' / ' + cat.grupos.length + '</b> acciones generales / grupos</span></div>' +
    '<ul class="ppa-reglas"><li>Las metas del archivo <b>reemplazan</b> las de cada acción que viene en él.</li>' +
    '<li>Las columnas <b>AVANCE</b> se ignoran: los avances se registran solo desde la App (PWA) y los ya registrados no se tocan.</li>' +
    '<li>Las acciones que no vienen en el archivo no se tocan.</li></ul>' +
    (avisos.length ? '<div class="gr-aviso" style="max-height:160px;overflow:auto;"><b>' + avisos.length + ' aviso(s):</b><br>' + avisos.slice(0, 80).map(escapeHtml_).join('<br>') + '</div>' : '') +
    '<div class="modal-actions" style="margin-top:14px;"><button class="btn-secondary" data-ppa-cerrar>Cancelar</button><button class="btn-primary" id="ppa-sub-ok">Subir ' + data.length + ' acciones</button></div>' +
    '<div id="ppa-sub-res"></div></div>';
  ov.classList.add('show');
  ov.querySelector('#ppa-sub-ok').onclick = async () => {
    const btn = ov.querySelector('#ppa-sub-ok'); btn.disabled = true;
    const tot = { insertadas: 0, actualizadas: 0, metas: 0, avances: 0, errores: [], avisos: [] };
    try {
      for (let i = 0; i < data.length; i += 150) {
        btn.textContent = 'Subiendo ' + Math.min(i + 150, data.length) + ' / ' + data.length + '…';
        const { data: r, error } = await supabaseClient.rpc('ppa_cargar', { p_periodo: S.periodo.id_periodo, p_catalogos: i === 0 ? cat : {}, p_filas: data.slice(i, i + 150) });
        if (error) throw error;
        ['insertadas', 'actualizadas', 'metas', 'avances'].forEach(k => tot[k] += r[k] || 0);
        tot.errores.push(...(r.errores || [])); tot.avisos.push(...(r.avisos || []));
      }
      ov.querySelector('#ppa-sub-res').innerHTML = '<div class="gr-aviso" style="margin-top:12px;background:#DCFCE7;border-color:#16A34A;color:#14532D;">✅ ' + tot.insertadas + ' nuevas · ' + tot.actualizadas + ' actualizadas · ' +
        tot.metas + ' metas' + (tot.errores.length ? '<br><b>' + tot.errores.length + ' fila(s) rechazada(s):</b><br>' + tot.errores.slice(0, 60).map(e => escapeHtml_(e.id_ppa + ': ' + e.error)).join('<br>') : '') +
        (tot.avisos.length ? '<br><b>' + tot.avisos.length + ' aviso(s)</b> (plazos fuera del período, frecuencias no reconocidas…)' : '') + '</div>';
      btn.textContent = 'Listo';
      await abrirPpa_(S.sub, true);
    } catch (e) {
      btn.disabled = false; btn.textContent = 'Reintentar';
      ov.querySelector('#ppa-sub-res').innerHTML = '<div class="gr-aviso" style="margin-top:12px;">No se pudo subir: ' + escapeHtml_(e.message || String(e)) + '</div>';
    }
  };
}
