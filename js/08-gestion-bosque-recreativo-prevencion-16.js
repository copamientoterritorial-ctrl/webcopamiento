/* ==================== 🌳 GESTIÓN BOSQUE RECREATIVO (Prevención ▾, 16-10-2026, SQL 109 + 110) ====================
 * Modelo: bosques_recreativos (maestro + administración + acceso), br_visitas (diarias → temporada dic–mar),
 * br_revisiones (checklist de terreno: mesas, fogones, letreros), br_proyectos + br_cotizaciones + br_gastos
 * (inversión) y br_bitacora (trazabilidad automática por triggers). Vista resumen: v_bosques_resumen.
 * Pestañas: 📊 Resumen · 🗺️ Mapa · 🪑 Implementación · 💰 Inversión. Ficha por bosque (administración y acceso).
 * Ver: Administrador + Jefe de Área + Subgerente (cada uno con su alcance). Editar: Admin o Jefe del área. */
const BR_ADMIN = {
  'COMUNIDAD':                { txt: 'Comunidad',          ico: '🏘️', c: '#15803D', comunitario: true },
  'JJVV':                     { txt: 'Junta de vecinos',   ico: '🤝', c: '#0D9488', comunitario: true },
  'VECINO LOCAL':             { txt: 'Vecino local',       ico: '🏡', c: '#2563EB' },
  'EN CONVERSACIONES':        { txt: 'En conversaciones',  ico: '💬', c: '#D97706' },
  'SIN ADMINISTRACIÓN LOCAL': { txt: 'Sin administración', ico: '○',  c: '#94A3B8' },
};
const BR_ACCESO = {
  'LIBRE ACCESO':           { txt: 'Libre acceso',  ico: '🟢', c: '#16A34A' },
  'AUTORIZACIÓN DE ACCESO': { txt: 'Con autorización', ico: '🔑', c: '#D97706' },
  'SIN ACCESO':             { txt: 'Sin acceso',    ico: '⛔', c: '#DC2626' },
};
const BR_ESTADOS_PROY = ['Idea', 'Cotizando', 'Presupuesto aprobado', 'En ejecución', 'Ejecutado', 'Cancelado'];
const BR_ESTADO_COLOR = { 'Idea': '#64748B', 'Cotizando': '#7C3AED', 'Presupuesto aprobado': '#2563EB', 'En ejecución': '#D97706', 'Ejecutado': '#16A34A', 'Cancelado': '#94A3B8' };
const BR_CATEGORIAS = ['Mesas', 'Fogones', 'Letreros', 'Basureros', 'Baños', 'Acceso / camino', 'Mantención', 'Cierre perimetral', 'Otro'];
const BR_REVISION_VIGENTE_DIAS = 180;   // una revisión más antigua se marca «por revisar»
state.br = { datos: [], visitas: [], proyectos: [], cotiz: [], gastos: [], tab: 'resumen', temp: '', f: { subg: '', area: '', admin: '', acceso: '', estado: '', q: '' },
  cargado: false, listeners: false, mapa: null, capa: null, charts: {}, sinSql: false };

function puedeBosques_() {
  const p = state.perfil && state.perfil.perfil;
  return p === 'Administrador' || esJefeAreaPerfil_(p);
}
function brEsAdmin_() { return !!(state.perfil && state.perfil.perfil === 'Administrador'); }
/** Alcance: Administrador todo; Subgerente su subgerencia; Jefe de Área sus áreas. */
function brEnAlcance_(b) {
  if (brEsAdmin_()) return true;
  if (state.subgerencia) return SG_KEY(b.subgerencia) === SG_KEY(state.subgerencia);
  const mias = new Set((state.misAreasIds || []).map(SG_KEY));
  return mias.has(SG_KEY(b.area));
}
function brPuedeEditar_(b) {
  if (brEsAdmin_()) return true;
  if (!esJefeAreaPerfil_(state.perfil && state.perfil.perfil)) return false;
  return new Set((state.misAreasIds || []).map(SG_KEY)).has(SG_KEY(b && b.area));
}
function brAdmin_(b) { return BR_ADMIN[String((b && b.administracion) || '').toUpperCase()] || { txt: 'Sin dato', ico: '?', c: '#CBD5E1' }; }
function brAcceso_(b) { return BR_ACCESO[String((b && b.condicion_acceso) || '').toUpperCase()] || { txt: 'Sin dato', ico: '?', c: '#94A3B8' }; }
function brComunitario_(b) { return !!brAdmin_(b).comunitario; }
function brPesos_(n) { return n == null || n === '' ? '—' : '$' + Math.round(Number(n)).toLocaleString('es-CL'); }
function brNum_(n) { return Number(n || 0).toLocaleString('es-CL'); }
function brFechaTxt_(iso) { if (!iso) return '—'; const d = parseISOLocal_(String(iso).slice(0, 10)); return d ? d.toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'; }
function brDiasDesde_(iso) { if (!iso) return null; const d = parseISOLocal_(String(iso).slice(0, 10)); return d ? Math.floor((Date.now() - d.getTime()) / 864e5) : null; }
function brBadgeAdmin_(b) { const a = brAdmin_(b); return '<span class="br-badge" style="--c:' + a.c + '" title="Administración: ' + escapeHtml_(a.txt) + '">' + a.ico + ' ' + escapeHtml_(a.txt) + '</span>'; }
function brBadgeAcceso_(b) { const a = brAcceso_(b); return '<span class="br-badge suave" style="--c:' + a.c + '" title="Condición de acceso">' + a.ico + ' ' + escapeHtml_(a.txt) + '</span>'; }
function brById_(id) { return state.br.datos.find(b => b.id_br === id) || null; }
function brTemporadas_() { return [...new Set(state.br.visitas.map(v => v.temporada))].filter(Boolean).sort(); }
function brVisitasTemp_(b, t) { return Number(((b && b.visitas_temporada) || {})[t] || 0); }

async function abrirBosques_() {
  if (!state.br.listeners) {
    state.br.listeners = true;
    const P = document.getElementById('bosques-panel');
    P.addEventListener('click', e => {
      const t = e.target.closest('[data-br-tab]'); if (t) { state.br.tab = t.dataset.brTab; renderBosques_(); return; }
      // (el ＋💰 va dentro de una fila clicable: primero los botones, después la fila)
      const n = e.target.closest('[data-br-nuevo]'); if (n) { abrirProyectoBosque_(null, n.dataset.brNuevo || '', n.dataset.brCat || '', n.dataset.brCant || ''); return; }
      const p = e.target.closest('[data-br-proy]'); if (p) { abrirProyectoBosque_(p.dataset.brProy); return; }
      const f = e.target.closest('[data-br-ficha]'); if (f) { abrirFichaBosque_(f.dataset.brFicha); return; }
      const k = e.target.closest('[data-br-fadmin]'); if (k) { state.br.f.admin = state.br.f.admin === k.dataset.brFadmin ? '' : k.dataset.brFadmin; sincronizarFiltrosBosques_(); renderBosques_(); return; }
    });
    ['br-subg', 'br-area', 'br-admin', 'br-acceso', 'br-estado', 'br-temp'].forEach(id => document.getElementById(id).addEventListener('change', e => {
      const k = id.slice(3); if (k === 'temp') state.br.temp = e.target.value; else state.br.f[k] = e.target.value;
      if (k === 'subg') { state.br.f.area = ''; }
      poblarFiltrosBosques_(); renderBosques_();
    }));
    let tq = null;
    document.getElementById('br-buscar').addEventListener('input', e => { clearTimeout(tq); tq = setTimeout(() => { state.br.f.q = e.target.value; renderBosques_(); }, 200); });
    document.getElementById('br-recargar').addEventListener('click', () => cargarBosques_(true));
    document.getElementById('br-excel').addEventListener('click', descargarBosques_);
  }
  if (!state.br.cargado) await cargarBosques_();
  else renderBosques_();
}

async function cargarBosques_(forzar) {
  const est = document.getElementById('br-estado-txt');
  est.textContent = 'Cargando…';
  const leerTodo = async (tabla, cols, orden) => {
    const filas = [];
    for (let d = 0; ; d += 1000) {
      let q = supabaseClient.from(tabla).select(cols).range(d, d + 999);
      if (orden) q = q.order(orden);
      const { data, error } = await q;
      if (error) throw error;
      filas.push(...(data || [])); if (!data || data.length < 1000) break;
    }
    return filas;
  };
  try {
    const [datos, visitas, proyectos, cotiz, gastos] = await Promise.all([
      leerTodo('v_bosques_resumen', '*', 'id_br'),
      leerTodo('br_visitas', 'id_br, fecha, personas, temporada', 'fecha'),
      leerTodo('br_proyectos', '*', 'creado_en'),
      leerTodo('br_cotizaciones', '*', 'creado_en'),
      leerTodo('br_gastos', '*', 'fecha'),
    ]);
    Object.assign(state.br, { datos, visitas, proyectos, cotiz, gastos, cargado: true, sinSql: false });
    const temps = brTemporadas_();
    if (!state.br.temp || !temps.includes(state.br.temp)) state.br.temp = temps[temps.length - 1] || '';
    est.textContent = 'Actualizado ' + new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
  } catch (e) {
    state.br.sinSql = true;
    est.textContent = 'Sin datos';
    document.getElementById('br-cuerpo').innerHTML = '<div class="tb-vacio">No se pudieron leer los bosques recreativos: ' + escapeHtml_(e.message || String(e)) +
      '<br><small>¿Ya se ejecutaron <b>109_bosque_recreativo_estructura.sql</b> y <b>110_bosque_recreativo_carga.sql</b> en Supabase?</small></div>';
    return;
  }
  poblarFiltrosBosques_();
  renderBosques_();
}

/** Filtros en cascada (Subgerencia → Área) con lo que está dentro del alcance del usuario. */
function poblarFiltrosBosques_() {
  const F = state.br.f, base = state.br.datos.filter(brEnAlcance_);
  const opc = (id, valores, todos, actual, fmt) => {
    const sel = document.getElementById(id);
    sel.innerHTML = '<option value="">' + todos + '</option>' + valores.map(([v, n]) => '<option value="' + escapeHtml_(v) + '">' + escapeHtml_(fmt ? fmt(v) : v) + ' (' + n + ')</option>').join('');
    sel.value = valores.some(([v]) => v === actual) ? actual : '';
    sel.classList.toggle('activo', !!sel.value);
    return sel.value;
  };
  const cuenta = (lista, fn) => { const m = {}; lista.forEach(b => { const v = fn(b); if (v) m[v] = (m[v] || 0) + 1; }); return Object.entries(m).sort((a, b) => a[0].localeCompare(b[0], 'es')); };
  F.subg = opc('br-subg', cuenta(base, b => b.subgerencia), 'Todas las subgerencias', F.subg, aTitulo_);
  const enSubg = base.filter(b => !F.subg || b.subgerencia === F.subg);
  F.area = opc('br-area', cuenta(enSubg, b => b.area), 'Todas las áreas', F.area, aTitulo_);
  F.admin = opc('br-admin', cuenta(base, b => (b.administracion || '').toUpperCase()), 'Toda administración', F.admin, v => (BR_ADMIN[v] || {}).txt || v);
  F.acceso = opc('br-acceso', cuenta(base, b => (b.condicion_acceso || '').toUpperCase()), 'Todo acceso', F.acceso, v => (BR_ACCESO[v] || {}).txt || v);
  F.estado = opc('br-estado', cuenta(base, b => b.estado), 'Todos los estados', F.estado, aTitulo_);
  const temps = brTemporadas_();
  const selT = document.getElementById('br-temp');
  selT.innerHTML = temps.map(t => '<option value="' + t + '">Temporada ' + t + '</option>').join('') || '<option value="">Sin visitas</option>';
  selT.value = state.br.temp;
  document.getElementById('br-subg').style.display = brEsAdmin_() ? '' : 'none';   // el Subgerente y el Jefe ya ven su alcance
}
function sincronizarFiltrosBosques_() { const s = document.getElementById('br-admin'); if (s) { s.value = state.br.f.admin; s.classList.toggle('activo', !!s.value); } }
function bosquesFiltrados_() {
  const F = state.br.f, q = normalizarBusqueda_(F.q || '');
  return state.br.datos.filter(b => brEnAlcance_(b) &&
    (!F.subg || b.subgerencia === F.subg) && (!F.area || b.area === F.area) &&
    (!F.admin || (b.administracion || '').toUpperCase() === F.admin) &&
    (!F.acceso || (b.condicion_acceso || '').toUpperCase() === F.acceso) &&
    (!F.estado || b.estado === F.estado) &&
    (!q || normalizarBusqueda_([b.id_br, b.nombre, b.area, b.comuna, b.sector, b.fundo].join(' ')).includes(q)));
}

function renderBosques_() {
  if (!state.br.cargado) return;
  document.querySelectorAll('#br-tabs [data-br-tab]').forEach(b => b.classList.toggle('on', b.dataset.brTab === state.br.tab));
  Object.values(state.br.charts).forEach(c => { try { c.destroy(); } catch (e) {} });
  state.br.charts = {};
  if (state.br.mapa && state.br.tab !== 'mapa') { try { state.br.mapa.remove(); } catch (e) {} state.br.mapa = null; }
  const lista = bosquesFiltrados_();
  const cuerpo = document.getElementById('br-cuerpo');
  if (!state.br.datos.length) { cuerpo.innerHTML = '<div class="tb-vacio">Aún no hay bosques cargados. Ejecuta <b>110_bosque_recreativo_carga.sql</b>.</div>'; return; }
  if (state.br.tab === 'mapa') renderBrMapa_(lista, cuerpo);
  else if (state.br.tab === 'implementacion') renderBrImplementacion_(lista, cuerpo);
  else if (state.br.tab === 'inversion') renderBrInversion_(lista, cuerpo);
  else renderBrResumen_(lista, cuerpo);
}

/* ── 📊 Resumen: visitas por bosque y temporada ── */
function renderBrResumen_(lista, cuerpo) {
  const temps = brTemporadas_(), T = state.br.temp, iT = temps.indexOf(T), Tant = iT > 0 ? temps[iT - 1] : null;
  const ids = new Set(lista.map(b => b.id_br));
  const vis = state.br.visitas.filter(v => ids.has(v.id_br));
  const totT = vis.filter(v => v.temporada === T).reduce((s, v) => s + v.personas, 0);
  const diasT = new Set(vis.filter(v => v.temporada === T).map(v => v.fecha)).size;
  // Comparación justa: si la temporada está en curso (o su registro termina antes), la anterior se
  // cuenta solo hasta el mismo día de la temporada (días desde el 1 de diciembre).
  const diaTemp = (iso, t) => Math.round((parseISOLocal_(iso) - new Date(Number(t.slice(0, 4)), 11, 1)) / 864e5);
  const ultT = vis.filter(v => v.temporada === T).reduce((m, v) => (v.fecha > m ? v.fecha : m), '');
  const corte = ultT ? diaTemp(ultT, T) : 999;
  const parcial = !!(Tant && ultT && corte < 120);   // 120 días ≈ fin de marzo
  const enCorteA = v => v.temporada === Tant && (!parcial || diaTemp(v.fecha, Tant) <= corte);
  const totA = Tant ? vis.filter(enCorteA).reduce((s, v) => s + v.personas, 0) : null;
  const delta = totA ? Math.round(100 * (totT - totA) / totA) : null;
  const corteTxt = parcial ? ' a la misma fecha (hasta el ' + brFechaTxt_(ultT).replace(/ \d{4}$/, '') + ')' : '';
  const visACorte = {}; if (Tant) vis.filter(enCorteA).forEach(v => { visACorte[v.id_br] = (visACorte[v.id_br] || 0) + v.personas; });
  const comunit = lista.filter(brComunitario_).length;
  const conVis = new Set(vis.filter(v => v.temporada === T).map(v => v.id_br)).size;
  const kpi = (v, l, c, sub) => '<div class="br-kpi" style="--c:' + c + '"><b>' + v + '</b><span>' + l + '</span>' + (sub ? '<small>' + sub + '</small>' : '') + '</div>';
  const porAdmin = Object.keys(BR_ADMIN).map(k => [k, lista.filter(b => (b.administracion || '').toUpperCase() === k).length]).filter(x => x[1]);
  const filas = lista.map(b => {
    const vT = brVisitasTemp_(b, T), vA = Tant ? brVisitasTemp_(b, Tant) : null;
    const dias = state.br.visitas.filter(v => v.id_br === b.id_br && v.temporada === T);
    const pico = dias.reduce((m, v) => (v.personas > (m ? m.personas : -1) ? v : m), null);
    const vAc = Tant ? (visACorte[b.id_br] || 0) : null;   // anterior al mismo corte (para la variación)
    return { b, vT, vA, dias: dias.length, prom: dias.length ? Math.round(vT / dias.length) : 0, pico, var: vAc ? Math.round(100 * (vT - vAc) / vAc) : null };
  }).sort((a, b) => b.vT - a.vT || (b.vA || 0) - (a.vA || 0) || a.b.nombre.localeCompare(b.b.nombre, 'es'));
  cuerpo.innerHTML =
    '<div class="br-kpis">' +
      kpi(lista.length, 'bosques recreativos', '#15803D', lista.filter(b => b.estado === 'NUEVO').length + ' nuevos · ' + lista.filter(b => b.estado === 'EJECUTADO').length + ' ejecutados') +
      kpi(brNum_(totT), 'visitas · temporada ' + escapeHtml_(T || '—'), '#2563EB', (delta != null ? (delta >= 0 ? '▲ ' : '▼ ') + Math.abs(delta) + '% vs ' + Tant + corteTxt : 'sin temporada anterior') + ' · ' + conVis + ' bosques con registro' +
        (parcial ? ' · ⚠️ temporada con registro hasta el ' + brFechaTxt_(ultT) : '')) +
      kpi(diasT ? brNum_(Math.round(totT / diasT)) : '—', 'visitas por día (promedio)', '#0EA5E9', diasT + ' días con registro en la temporada') +
      kpi(comunit, 'administrados por la comunidad', '#15803D', 'Comunidad o Junta de vecinos · ' + (lista.length ? Math.round(100 * comunit / lista.length) : 0) + '% del total') +
      kpi(lista.filter(b => (b.condicion_acceso || '').toUpperCase() === 'LIBRE ACCESO').length, 'con libre acceso', '#16A34A',
        lista.filter(b => (b.condicion_acceso || '').toUpperCase() === 'AUTORIZACIÓN DE ACCESO').length + ' con autorización · ' + lista.filter(b => (b.condicion_acceso || '').toUpperCase() === 'SIN ACCESO').length + ' sin acceso') +
    '</div>' +
    '<div class="br-chips"><span class="tit">Administración</span>' + porAdmin.map(([k, n]) => {
      const a = BR_ADMIN[k]; return '<button class="br-chip' + (state.br.f.admin === k ? ' on' : '') + '" data-br-fadmin="' + escapeHtml_(k) + '" style="--c:' + a.c + '">' + a.ico + ' ' + a.txt + ' <small>' + n + '</small></button>';
    }).join('') + '</div>' +
    '<div class="br-graficos">' +
      '<div class="br-card"><div class="br-sec">👥 Visitas por bosque <small>temporada ' + escapeHtml_(T) + (Tant ? ' vs ' + Tant : '') + ' · los 20 con más visitas</small></div><div class="br-canvas" style="height:420px;"><canvas id="br-ch-bosques"></canvas></div></div>' +
      '<div class="br-card"><div class="br-sec">📈 Visitas por semana de la temporada <small>semana 1 = primera de diciembre</small></div><div class="br-canvas" style="height:420px;"><canvas id="br-ch-semanas"></canvas></div></div>' +
    '</div>' +
    '<div class="br-card"><div class="br-sec">🏆 Ranking de visitas <small>clic en un bosque para ver su ficha' + (parcial ? ' · * variación' + corteTxt : '') + '</small></div><div class="br-tabla-wrap"><table class="admin-table br-tabla"><thead><tr>' +
      '<th>#</th><th>Bosque</th><th>Área · Comuna</th><th>Administración</th><th>Acceso</th><th style="text-align:right">' + escapeHtml_(T) + '</th>' + (Tant ? '<th style="text-align:right">' + Tant + '</th><th style="text-align:right" title="' + (parcial ? 'Variación contra ' + Tant + corteTxt : 'Variación contra ' + Tant) + '">Var.' + (parcial ? '*' : '') + '</th>' : '') +
      '<th style="text-align:right">Días</th><th style="text-align:right">Prom./día</th><th>Día peak</th></tr></thead><tbody>' +
      filas.map((f, i) => '<tr data-br-ficha="' + escapeHtml_(f.b.id_br) + '" class="br-fila">' +
        '<td>' + (i + 1) + '</td><td><b>' + escapeHtml_(f.b.nombre) + '</b> <small class="br-id">' + escapeHtml_(f.b.id_br) + '</small>' + (f.b.estado === 'NUEVO' ? ' <span class="br-badge suave" style="--c:#7C3AED">Nuevo</span>' : '') + '</td>' +
        '<td>' + escapeHtml_(aTitulo_(f.b.area || '')) + '<br><small>' + escapeHtml_(f.b.comuna || '') + '</small></td>' +
        '<td>' + brBadgeAdmin_(f.b) + '</td><td>' + brBadgeAcceso_(f.b) + '</td>' +
        '<td style="text-align:right"><b>' + (f.vT ? brNum_(f.vT) : '—') + '</b></td>' +
        (Tant ? '<td style="text-align:right">' + (f.vA ? brNum_(f.vA) : '—') + '</td><td style="text-align:right;color:' + (f.var == null ? 'inherit' : f.var >= 0 ? '#16A34A' : '#DC2626') + ';font-weight:700;">' + (f.var == null ? '—' : (f.var >= 0 ? '+' : '') + f.var + '%') + '</td>' : '') +
        '<td style="text-align:right">' + (f.dias || '—') + '</td><td style="text-align:right">' + (f.prom || '—') + '</td>' +
        '<td>' + (f.pico ? brFechaTxt_(f.pico.fecha) + ' · <b>' + brNum_(f.pico.personas) + '</b>' : '—') + '</td></tr>').join('') +
    '</tbody></table></div></div>';
  if (!window.Chart) return;
  const oscuro = document.body.classList.contains('tema-oscuro');
  const txt = oscuro ? '#CBD5E1' : '#475569', grid = oscuro ? 'rgba(148,163,184,.15)' : 'rgba(15,23,42,.07)';
  const top = filas.filter(f => f.vT || f.vA).slice(0, 20);
  state.br.charts.bosques = new Chart(document.getElementById('br-ch-bosques'), {
    type: 'bar',
    data: { labels: top.map(f => f.b.nombre), datasets: [{ label: 'Temporada ' + T, data: top.map(f => f.vT), backgroundColor: top.map(f => brComunitario_(f.b) ? '#15803D' : '#2563EB'), borderRadius: 4 }]
      .concat(Tant ? [{ label: 'Temporada ' + Tant, data: top.map(f => f.vA), backgroundColor: oscuro ? 'rgba(148,163,184,.45)' : 'rgba(100,116,139,.35)', borderRadius: 4 }] : []) },
    options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom', labels: { color: txt, boxWidth: 12 } },
        tooltip: { callbacks: { label: it => ' ' + it.dataset.label + ': ' + brNum_(it.parsed.x) + ' personas', afterBody: its => brComunitario_(top[its[0].dataIndex].b) ? '🏘️ Administrado por la comunidad' : '' } } },
      scales: { x: { ticks: { color: txt }, grid: { color: grid } }, y: { ticks: { color: txt, font: { size: 11 } }, grid: { display: false } } },
      onClick: (e, els) => { if (els.length) abrirFichaBosque_(top[els[0].index].b.id_br); } },
  });
  // Semanas de temporada (desde el 1 de diciembre), una línea por temporada
  // (los días de fines de noviembre cuentan en la semana 1)
  const semana = (iso, t) => { const ini = new Date(Number(t.slice(0, 4)), 11, 1); const d = parseISOLocal_(iso); return Math.max(1, Math.floor((d - ini) / (7 * 864e5)) + 1); };
  const maxSem = Math.max(1, ...vis.map(v => semana(v.fecha, v.temporada)).filter(n => n > 0 && n < 30));
  const colores = ['#94A3B8', '#2563EB', '#16A34A', '#D97706', '#7C3AED'];
  state.br.charts.semanas = new Chart(document.getElementById('br-ch-semanas'), {
    type: 'line',
    data: { labels: Array.from({ length: maxSem }, (_, i) => 'Sem ' + (i + 1)),
      datasets: temps.map((t, k) => {
        const s = Array(maxSem).fill(0);
        vis.filter(v => v.temporada === t).forEach(v => { const n = semana(v.fecha, t); if (n >= 1 && n <= maxSem) s[n - 1] += v.personas; });
        return { label: 'Temporada ' + t, data: s, borderColor: t === T ? '#2563EB' : colores[k % colores.length], backgroundColor: t === T ? 'rgba(37,99,235,.12)' : 'transparent',
          fill: t === T, tension: 0.3, borderWidth: t === T ? 3 : 2, pointRadius: 2 };
      }) },
    options: { responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
      plugins: { legend: { position: 'bottom', labels: { color: txt, boxWidth: 12 } }, tooltip: { callbacks: { label: it => ' ' + it.dataset.label + ': ' + brNum_(it.parsed.y) } } },
      scales: { x: { ticks: { color: txt }, grid: { display: false } }, y: { beginAtZero: true, ticks: { color: txt }, grid: { color: grid } } } },
  });
}

/* ── 🗺️ Mapa: ubicación de los bosques (tamaño = visitas de la temporada, color = administración) ── */
function renderBrMapa_(lista, cuerpo) {
  const T = state.br.temp;
  cuerpo.innerHTML = '<div class="br-mapa-wrap"><div id="br-mapa"></div>' +
    '<div class="br-leyenda"><b>Administración</b>' + Object.values(BR_ADMIN).map(a => '<div><i style="background:' + a.c + '"></i>' + a.ico + ' ' + a.txt + '</div>').join('') +
    '<b style="margin-top:6px;">Tamaño</b><div>visitas · temporada ' + escapeHtml_(T) + '</div><div><i class="anillo"></i> borde rojo: sin acceso / 🔑 con autorización</div></div></div>';
  if (state.br.mapa) { try { state.br.mapa.remove(); } catch (e) {} state.br.mapa = null; }
  const m = state.br.mapa = L.map('br-mapa', { zoomControl: true, attributionControl: false }).setView([-37.5, -72.6], 7);
  L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 18 }).addTo(m);
  m.createPane('brRef'); m.getPane('brRef').style.zIndex = 450; m.getPane('brRef').style.pointerEvents = 'none';
  L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', { maxZoom: 18, pane: 'brRef' }).addTo(m);
  const maxV = Math.max(1, ...lista.map(b => brVisitasTemp_(b, T)));
  const grupo = L.featureGroup().addTo(m);
  lista.filter(b => b.lat != null && b.lng != null).sort((a, b) => brVisitasTemp_(b, T) - brVisitasTemp_(a, T)).forEach(b => {
    const v = brVisitasTemp_(b, T), a = brAdmin_(b), acc = (b.condicion_acceso || '').toUpperCase();
    const radio = 6 + 15 * Math.sqrt(v / maxV);
    const c = L.circleMarker([b.lat, b.lng], { radius: radio, color: acc === 'SIN ACCESO' ? '#DC2626' : acc.startsWith('AUTORIZ') ? '#F59E0B' : '#FFFFFF',
      weight: acc === 'LIBRE ACCESO' ? 2 : 4, fillColor: a.c, fillOpacity: 0.85 });
    c.bindTooltip('<b>' + escapeHtml_(b.nombre) + '</b> · ' + escapeHtml_(b.id_br) + '<br>' + a.ico + ' ' + escapeHtml_(a.txt) + ' · ' + brAcceso_(b).ico + ' ' + escapeHtml_(brAcceso_(b).txt) +
      '<br>👥 ' + brNum_(v) + ' visitas (' + escapeHtml_(T) + ')', { direction: 'top', sticky: true });
    c.on('click', () => abrirFichaBosque_(b.id_br));
    c.addTo(grupo);
    if (brComunitario_(b)) L.marker([b.lat, b.lng], { interactive: false, icon: L.divIcon({ className: 'br-pin-com', html: '🏘️', iconSize: [18, 18], iconAnchor: [9, radio + 14] }) }).addTo(grupo);
  });
  // El contenedor recién creado toma su tamaño final después: encuadrar de nuevo cuando lo tenga
  const encuadrar = () => { if (state.br.mapa !== m) return; m.invalidateSize(); if (grupo.getLayers().length) m.fitBounds(grupo.getBounds(), { padding: [30, 30], maxZoom: 11 }); };
  setTimeout(encuadrar, 80); setTimeout(encuadrar, 450);
}

/* ── 🪑 Implementación: mesas, fogones y letreros (última revisión de terreno) ── */
function renderBrImplementacion_(lista, cuerpo) {
  const sum = k => lista.reduce((s, b) => s + Number(b[k] || 0), 0);
  const elem = [
    ['Mesas', '🪑', 'mesas_total', 'mesas_danadas', 'mesas_nuevas'],
    ['Fogones', '🔥', 'fogones_total', 'fogones_danados', 'fogones_nuevos'],
    ['Letreros', '🪧', 'letreros_total', 'letreros_danados', 'letreros_nuevos'],
  ];
  const sinRev = lista.filter(b => !b.revision_fecha), viejas = lista.filter(b => b.revision_fecha && brDiasDesde_(b.revision_fecha) > BR_REVISION_VIGENTE_DIAS);
  const tarjetas = elem.map(([n, ico, t, d, nu]) => {
    const tot = sum(t), dan = sum(d), nue = sum(nu), ok = Math.max(0, tot - dan), pct = tot ? Math.round(100 * ok / tot) : 0;
    return '<div class="br-impl-card"><div class="t">' + ico + ' ' + n + '</div><div class="v">' + brNum_(tot) + '<small> instalados</small></div>' +
      '<div class="br-barra"><i style="width:' + pct + '%;background:#16A34A"></i><i style="width:' + (100 - pct) + '%;background:#DC2626"></i></div>' +
      '<div class="d"><span style="color:#16A34A">● ' + brNum_(ok) + ' en buen estado (' + pct + '%)</span><span style="color:#DC2626">● ' + brNum_(dan) + ' dañados</span><span style="color:#2563EB">＋ ' + brNum_(nue) + ' por agregar</span></div></div>';
  }).join('');
  // Necesidades sin proyecto abierto (para pasar a Inversión)
  const abiertos = new Set(state.br.proyectos.filter(p => p.estado !== 'Ejecutado' && p.estado !== 'Cancelado').map(p => p.id_br + '|' + p.categoria));
  const filas = lista.slice().sort((a, b) => ((b.mesas_danadas || 0) + (b.fogones_danados || 0) + (b.letreros_danados || 0) + (b.mesas_nuevas || 0) + (b.fogones_nuevos || 0) + (b.letreros_nuevos || 0)) -
    ((a.mesas_danadas || 0) + (a.fogones_danados || 0) + (a.letreros_danados || 0) + (a.mesas_nuevas || 0) + (a.fogones_nuevos || 0) + (a.letreros_nuevos || 0)) || a.nombre.localeCompare(b.nombre, 'es'));
  const celda = (b, [n, , t, d, nu]) => {
    if (b[t] == null) return '<td class="br-c">—</td>';
    const tot = b[t] || 0, dan = b[d] || 0, nue = b[nu] || 0;
    const btn = (dan || nue) && brPuedeEditar_(b) && !abiertos.has(b.id_br + '|' + n)
      ? ' <button class="br-mini" data-br-nuevo="' + escapeHtml_(b.id_br) + '" data-br-cat="' + n + '" data-br-cant="' + (dan + nue) + '" title="Crear un proyecto de inversión para reponer/agregar ' + n.toLowerCase() + '">＋💰</button>' : '';
    const raro = dan > tot ? ' <span title="Dato a revisar: hay más dañados (' + dan + ') que instalados (' + tot + ') en la revisión de terreno" style="cursor:help;">⚠️</span>' : '';
    return '<td class="br-c"><b>' + tot + '</b>' + (dan ? ' <span class="br-dan">' + dan + ' dañ.</span>' : '') + (nue ? ' <span class="br-nue">+' + nue + '</span>' : '') + raro + btn + '</td>';
  };
  cuerpo.innerHTML =
    '<div class="br-impl-cards">' + tarjetas +
      '<div class="br-impl-card"><div class="t">📋 Revisiones de terreno</div><div class="v">' + (lista.length - sinRev.length) + '<small> de ' + lista.length + ' bosques revisados</small></div>' +
      '<div class="d"><span style="color:#DC2626">● ' + sinRev.length + ' sin revisión</span><span style="color:#D97706">● ' + viejas.length + ' con revisión de más de ' + BR_REVISION_VIGENTE_DIAS + ' días</span></div>' +
      (sinRev.length ? '<div class="d" style="margin-top:4px;color:var(--text-tertiary);">' + sinRev.map(b => escapeHtml_(b.nombre)).join(' · ') + '</div>' : '') +
      (() => { const raros = lista.filter(b => elem.some(([, , t, d]) => b[t] != null && (b[d] || 0) > (b[t] || 0)));
        return raros.length ? '<div class="d" style="margin-top:4px;color:#B45309;" title="' + escapeHtml_(raros.map(b => b.nombre).join(', ')) + '">⚠️ ' + raros.length + ' con datos a revisar (más dañados que instalados)</div>' : ''; })() + '</div>' +
    '</div>' +
    '<div class="br-card"><div class="br-sec">🌲 Estado por área <small>elementos dañados y por agregar según la última revisión</small></div><div class="br-canvas" style="height:260px;"><canvas id="br-ch-impl"></canvas></div></div>' +
    '<div class="br-card"><div class="br-sec">Detalle por bosque <small>total instalado · <span class="br-dan">dañados</span> · <span class="br-nue">por agregar</span> · ＋💰 crea un proyecto de inversión</small></div>' +
    '<div class="br-tabla-wrap"><table class="admin-table br-tabla"><thead><tr><th>Bosque</th><th>Área</th><th>Administración</th><th>🪑 Mesas</th><th>🔥 Fogones</th><th>🪧 Letreros</th><th>Última revisión</th><th>Observaciones</th></tr></thead><tbody>' +
    filas.map(b => {
      const dias = brDiasDesde_(b.revision_fecha);
      return '<tr class="br-fila" data-br-ficha="' + escapeHtml_(b.id_br) + '"><td><b>' + escapeHtml_(b.nombre) + '</b> <small class="br-id">' + escapeHtml_(b.id_br) + '</small></td>' +
        '<td>' + escapeHtml_(aTitulo_(b.area || '')) + '</td><td>' + brBadgeAdmin_(b) + '</td>' + elem.map(e => celda(b, e)).join('') +
        '<td>' + (b.revision_fecha ? brFechaTxt_(b.revision_fecha) + '<br><small style="color:' + (dias > BR_REVISION_VIGENTE_DIAS ? '#D97706' : 'var(--text-tertiary)') + '">' + (b.revision_autor ? escapeHtml_(b.revision_autor) : '') + (b.revision_sitios > 1 ? ' · ' + b.revision_sitios + ' sitios' : '') + '</small>'
          : '<span style="color:#DC2626;font-weight:700;">Sin revisión</span>') + '</td>' +
        '<td class="br-obs" title="' + escapeHtml_(b.revision_observaciones || '') + '">' + escapeHtml_(b.revision_observaciones || '') + '</td></tr>';
    }).join('') + '</tbody></table></div></div>';
  if (!window.Chart) return;
  const areas = [...new Set(lista.map(b => b.area).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
  const por = (a, k) => lista.filter(b => b.area === a).reduce((s, b) => s + Number(b[k] || 0), 0);
  const oscuro = document.body.classList.contains('tema-oscuro'), txt = oscuro ? '#CBD5E1' : '#475569';
  state.br.charts.impl = new Chart(document.getElementById('br-ch-impl'), {
    type: 'bar',
    data: { labels: areas.map(aTitulo_), datasets: [
      { label: 'Mesas dañadas', data: areas.map(a => por(a, 'mesas_danadas')), backgroundColor: '#DC2626', stack: 'd' },
      { label: 'Fogones dañados', data: areas.map(a => por(a, 'fogones_danados')), backgroundColor: '#F97316', stack: 'd' },
      { label: 'Letreros dañados', data: areas.map(a => por(a, 'letreros_danados')), backgroundColor: '#FBBF24', stack: 'd' },
      { label: 'Mesas por agregar', data: areas.map(a => por(a, 'mesas_nuevas')), backgroundColor: '#1D4ED8', stack: 'n' },
      { label: 'Fogones por agregar', data: areas.map(a => por(a, 'fogones_nuevos')), backgroundColor: '#3B82F6', stack: 'n' },
      { label: 'Letreros por agregar', data: areas.map(a => por(a, 'letreros_nuevos')), backgroundColor: '#93C5FD', stack: 'n' },
    ] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { color: txt, boxWidth: 12, font: { size: 11 } } } },
      scales: { x: { stacked: true, ticks: { color: txt }, grid: { display: false } }, y: { stacked: true, beginAtZero: true, ticks: { color: txt, precision: 0 } } } },
  });
}

/* ── 💰 Inversión: proyectos por estado (cotizaciones → presupuesto → ejecución) ── */
function brMontosProyecto_(p) {
  const cot = state.br.cotiz.filter(c => c.proyecto_id === p.id), gas = state.br.gastos.filter(g => g.proyecto_id === p.id);
  const sel = cot.find(c => c.seleccionada);
  return { cot, gas, sel, ejecutado: gas.reduce((s, g) => s + Number(g.monto || 0), 0) };
}
function renderBrInversion_(lista, cuerpo) {
  const ids = new Set(lista.map(b => b.id_br));
  const proys = state.br.proyectos.filter(p => ids.has(p.id_br));
  const vivos = proys.filter(p => p.estado !== 'Cancelado');
  const est = vivos.reduce((s, p) => s + Number(p.monto_estimado || 0), 0), apr = vivos.reduce((s, p) => s + Number(p.monto_aprobado || 0), 0);
  const ejec = vivos.reduce((s, p) => s + brMontosProyecto_(p).ejecutado, 0);
  const puedeAlguno = lista.some(brPuedeEditar_);
  const kpi = (v, l, c, sub) => '<div class="br-kpi" style="--c:' + c + '"><b>' + v + '</b><span>' + l + '</span>' + (sub ? '<small>' + sub + '</small>' : '') + '</div>';
  // Inversión por bosque (aprobado y ejecutado)
  const porBosque = lista.map(b => {
    const ps = vivos.filter(p => p.id_br === b.id_br);
    return { b, n: ps.length, est: ps.reduce((s, p) => s + Number(p.monto_estimado || 0), 0), apr: ps.reduce((s, p) => s + Number(p.monto_aprobado || 0), 0), ejec: ps.reduce((s, p) => s + brMontosProyecto_(p).ejecutado, 0) };
  }).filter(x => x.n).sort((a, b) => b.apr - a.apr || b.est - a.est);
  cuerpo.innerHTML =
    '<div class="br-kpis">' +
      kpi(proys.filter(p => p.estado !== 'Ejecutado' && p.estado !== 'Cancelado').length, 'proyectos abiertos', '#7C3AED', proys.filter(p => p.estado === 'Ejecutado').length + ' ejecutados · ' + proys.length + ' en total') +
      kpi(brPesos_(est), 'monto estimado', '#64748B', 'suma de proyectos no cancelados') +
      kpi(brPesos_(apr), 'presupuesto aprobado', '#2563EB', est ? Math.round(100 * apr / est) + '% de lo estimado' : '') +
      kpi(brPesos_(ejec), 'ejecutado (gastos)', '#16A34A', apr ? Math.round(100 * ejec / apr) + '% del aprobado' : 'registra OC / facturas en cada proyecto') +
    '</div>' +
    '<div class="br-chips"><span class="tit">Flujo</span>' + BR_ESTADOS_PROY.map(e => '<span class="br-flujo" style="--c:' + BR_ESTADO_COLOR[e] + '">' + e + '</span>').join('<span class="br-flecha">→</span>') +
      (puedeAlguno ? '<button class="turnos-btn br-nuevo" data-br-nuevo="" style="margin-left:auto;">＋ Nuevo proyecto</button>' : '') + '</div>' +
    '<div class="br-kanban">' + BR_ESTADOS_PROY.map(e => {
      const ps = proys.filter(p => p.estado === e).sort((a, b) => ({ Alta: 0, Media: 1, Baja: 2 }[a.prioridad] - { Alta: 0, Media: 1, Baja: 2 }[b.prioridad]));
      return '<div class="br-col" style="--c:' + BR_ESTADO_COLOR[e] + '"><div class="cab">' + e + ' <small>' + ps.length + '</small></div>' +
        (ps.map(p => {
          const b = brById_(p.id_br) || {}, M = brMontosProyecto_(p);
          return '<div class="br-proy" data-br-proy="' + p.id + '"><div class="t">' + escapeHtml_(p.titulo) + '</div>' +
            '<div class="s">🌳 ' + escapeHtml_(b.nombre || p.id_br) + ' · ' + escapeHtml_(p.categoria) + (p.cantidad ? ' × ' + p.cantidad : '') + '</div>' +
            '<div class="m"><span title="Estimado">Est. ' + brPesos_(p.monto_estimado) + '</span>' + (p.monto_aprobado ? '<span title="Aprobado" style="color:#2563EB">Apr. ' + brPesos_(p.monto_aprobado) + '</span>' : '') +
              (M.ejecutado ? '<span title="Ejecutado" style="color:#16A34A">Ejec. ' + brPesos_(M.ejecutado) + '</span>' : '') + '</div>' +
            '<div class="f"><span class="br-prio ' + (p.prioridad || 'Media').toLowerCase() + '">' + escapeHtml_(p.prioridad || 'Media') + '</span>' +
              (M.cot.length ? '<span>📄 ' + M.cot.length + ' cotiz.' + (M.sel ? ' ✔' : '') + '</span>' : '') + (p.temporada ? '<span>' + escapeHtml_(p.temporada) + '</span>' : '') + '</div></div>';
        }).join('') || '<div class="vacio">—</div>') + '</div>';
    }).join('') + '</div>' +
    '<div class="br-card"><div class="br-sec">🌳 Inversión por bosque <small>proyectos no cancelados</small></div><div class="br-tabla-wrap"><table class="admin-table br-tabla"><thead><tr><th>Bosque</th><th>Área</th><th>Administración</th><th style="text-align:right">Proyectos</th><th style="text-align:right">Estimado</th><th style="text-align:right">Aprobado</th><th style="text-align:right">Ejecutado</th><th>Avance</th></tr></thead><tbody>' +
      (porBosque.map(x => { const p = x.apr ? Math.min(100, Math.round(100 * x.ejec / x.apr)) : 0;
        return '<tr class="br-fila" data-br-ficha="' + escapeHtml_(x.b.id_br) + '"><td><b>' + escapeHtml_(x.b.nombre) + '</b> <small class="br-id">' + escapeHtml_(x.b.id_br) + '</small></td><td>' + escapeHtml_(aTitulo_(x.b.area || '')) + '</td><td>' + brBadgeAdmin_(x.b) + '</td>' +
          '<td style="text-align:right">' + x.n + '</td><td style="text-align:right">' + brPesos_(x.est) + '</td><td style="text-align:right">' + brPesos_(x.apr) + '</td><td style="text-align:right">' + brPesos_(x.ejec) + '</td>' +
          '<td><div class="br-barra" style="width:120px;"><i style="width:' + p + '%;background:#16A34A"></i></div><small>' + p + '% del aprobado</small></td></tr>'; }).join('') ||
        '<tr><td colspan="8" class="tb-vacio">Aún no hay proyectos de inversión' + (puedeAlguno ? '. Crea el primero con «＋ Nuevo proyecto» o desde 🪑 Implementación (botón ＋💰 en los elementos dañados).' : '.') + '</td></tr>') +
    '</tbody></table></div></div>';
}

/* ── Ventanas (ficha del bosque y proyecto) ── */
function brModal_(html, ancho) {
  cerrarBrModal_();
  const o = document.createElement('div');
  o.className = 'br-modal-overlay'; o.id = 'br-modal';
  o.innerHTML = '<div class="br-modal" style="width:min(' + (ancho || 900) + 'px,96vw);">' + html + '</div>';
  o.addEventListener('click', e => { if (e.target === o || e.target.closest('[data-br-cerrar]')) cerrarBrModal_(); });
  document.body.appendChild(o);
  return o;
}
function cerrarBrModal_() { const o = document.getElementById('br-modal'); if (o) o.remove(); if (state.br.chartFicha) { try { state.br.chartFicha.destroy(); } catch (e) {} state.br.chartFicha = null; } }

async function abrirFichaBosque_(id) {
  const b = brById_(id); if (!b) return;
  const puede = brPuedeEditar_(b), temps = brTemporadas_();
  const proys = state.br.proyectos.filter(p => p.id_br === id);
  const a = brAdmin_(b), acc = brAcceso_(b);
  const opts = (lista, actual) => '<option value="">—</option>' + lista.map(v => '<option' + (String(actual || '').toUpperCase() === v ? ' selected' : '') + '>' + v + '</option>').join('');
  const campo = (k, lbl, tipo, ph) => '<label class="br-campo"><span>' + lbl + '</span>' + (tipo === 'area'
    ? '<textarea data-br-k="' + k + '" rows="2" placeholder="' + (ph || '') + '"' + (puede ? '' : ' disabled') + '>' + escapeHtml_(b[k] || '') + '</textarea>'
    : '<input data-br-k="' + k + '" value="' + escapeHtml_(b[k] || '') + '" placeholder="' + (ph || '') + '"' + (puede ? '' : ' disabled') + '>') + '</label>';
  const gmaps = b.lat != null ? 'https://www.google.com/maps/dir/?api=1&destination=' + b.lat + ',' + b.lng : '';
  const o = brModal_(
    '<div class="br-ficha-cab" style="--c:' + a.c + '"><div><div class="id">' + escapeHtml_(b.id_br) + (b.en_maestro === false ? ' · ⚠️ fuera del maestro' : '') + '</div><h3>🌳 ' + escapeHtml_(b.nombre) + '</h3>' +
      '<div class="sub">' + escapeHtml_([aTitulo_(b.subgerencia || ''), aTitulo_(b.area || ''), b.comuna, b.sector && 'Sector ' + aTitulo_(b.sector), b.fundo && 'Fundo ' + b.fundo, b.anio_implementacion && 'Implementado ' + b.anio_implementacion].filter(Boolean).join(' · ')) + '</div>' +
      '<div style="margin-top:6px;display:flex;gap:6px;flex-wrap:wrap;">' + brBadgeAdmin_(b) + brBadgeAcceso_(b) + '<span class="br-badge suave" style="--c:#475569">' + escapeHtml_(aTitulo_(b.estado || '')) + '</span>' +
      (b.vecino_cercano ? '<span class="br-badge suave" style="--c:#475569">🏠 ' + escapeHtml_(aTitulo_(b.vecino_cercano)) + '</span>' : '') + '</div></div>' +
      '<button class="br-x" data-br-cerrar>✕</button></div>' +
    '<div class="br-ficha-grid">' +
      '<div class="br-ficha-sec"><div class="br-sec">🏘️ Administración</div>' +
        '<label class="br-campo"><span>Quién administra</span><select data-br-k="administracion"' + (puede ? '' : ' disabled') + '>' + opts(Object.keys(BR_ADMIN), b.administracion) + '</select></label>' +
        campo('admin_nombre', 'Nombre (comunidad, JJVV o persona)', '', 'Ej.: Comunidad Fco. Huentecol') + campo('admin_contacto', 'Contacto', '', 'Teléfono / correo') +
        '<div class="br-sec" style="margin-top:12px;">🚗 Detalles de acceso</div>' +
        '<label class="br-campo"><span>Condición de acceso</span><select data-br-k="condicion_acceso"' + (puede ? '' : ' disabled') + '>' + opts(Object.keys(BR_ACCESO), b.condicion_acceso) + '</select></label>' +
        '<label class="br-campo"><span>Tipo de vehículo</span><select data-br-k="acceso_vehiculo"' + (puede ? '' : ' disabled') + '>' + ['', 'Todo vehículo', 'Solo camioneta / 4x4', 'Solo a pie'].map(v => '<option' + ((b.acceso_vehiculo || '') === v ? ' selected' : '') + '>' + v + '</option>').join('') + '</select></label>' +
        campo('acceso_como_llegar', 'Cómo llegar', 'area', 'Ruta, desvío, referencias, portón…') + campo('acceso_horario', 'Horario', '', 'Ej.: 09:00 a 20:00') +
        campo('acceso_temporada', 'Temporada de apertura', '', 'Ej.: diciembre a marzo') + campo('acceso_contacto', 'Contacto para el acceso / llaves', '', 'Nombre y teléfono') +
        campo('servicios', 'Servicios', '', 'Agua, baños, basureros, estacionamiento…') + campo('observaciones', 'Observaciones', 'area') +
        (gmaps ? '<a class="turnos-btn" href="' + gmaps + '" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;text-decoration:none;margin-top:6px;">🧭 Cómo llegar (Google Maps)</a>' : '') +
        (puede ? '<button class="turnos-btn br-guardar" id="br-guardar-ficha" style="margin:6px 0 0 6px;">💾 Guardar</button>' : '<p class="br-nota">Solo consulta: edita el Administrador o el Jefe del área.</p>') +
      '</div>' +
      '<div class="br-ficha-sec"><div class="br-sec">👥 Visitas por temporada</div><div style="height:170px;"><canvas id="br-ch-ficha"></canvas></div>' +
        '<div class="br-mini-kpis">' + temps.map(t => '<div><b>' + brNum_(brVisitasTemp_(b, t)) + '</b><span>' + t + '</span></div>').join('') + '</div>' +
        '<div class="br-sec" style="margin-top:12px;">🪑 Implementación <small>' + (b.revision_fecha ? 'revisión ' + brFechaTxt_(b.revision_fecha) + (b.revision_autor ? ' · ' + escapeHtml_(b.revision_autor) : '') : 'sin revisión de terreno') + '</small></div>' +
        (b.revision_fecha ? '<table class="br-impl-mini"><tr><th></th><th>Instalados</th><th>Dañados</th><th>Por agregar</th></tr>' +
          [['🪑 Mesas', 'mesas_total', 'mesas_danadas', 'mesas_nuevas'], ['🔥 Fogones', 'fogones_total', 'fogones_danados', 'fogones_nuevos'], ['🪧 Letreros', 'letreros_total', 'letreros_danados', 'letreros_nuevos']]
            .map(([n, t, d, nu]) => '<tr><td>' + n + '</td><td>' + (b[t] == null ? '—' : b[t]) + '</td><td class="br-dan">' + (b[d] || 0) + '</td><td class="br-nue">' + (b[nu] || 0) + '</td></tr>').join('') + '</table>' +
          (b.revision_observaciones ? '<p class="br-nota">📝 ' + escapeHtml_(b.revision_observaciones) + '</p>' : '') : '') +
        '<div id="br-hist-rev" class="br-nota">Cargando historial de revisiones…</div>' +
        '<div class="br-sec" style="margin-top:12px;">💰 Inversión <small>' + proys.length + ' proyecto(s)</small>' + (puede ? '<button class="br-mini" data-br-nuevo-ficha="' + escapeHtml_(id) + '" style="margin-left:auto;">＋ Proyecto</button>' : '') + '</div>' +
        (proys.map(p => { const M = brMontosProyecto_(p); return '<div class="br-proy-linea" data-br-proy-ficha="' + p.id + '"><span class="br-badge suave" style="--c:' + BR_ESTADO_COLOR[p.estado] + '">' + p.estado + '</span> <b>' + escapeHtml_(p.titulo) + '</b><small> · aprobado ' + brPesos_(p.monto_aprobado) + ' · ejecutado ' + brPesos_(M.ejecutado) + '</small></div>'; }).join('') || '<p class="br-nota">Sin proyectos de inversión.</p>') +
        '<div class="br-sec" style="margin-top:12px;">🧾 Bitácora del bosque</div><div id="br-bitacora-bosque" class="br-bitacora">Cargando…</div>' +
      '</div>' +
    '</div>', 1040);
  // Guardar administración y acceso
  const g = o.querySelector('#br-guardar-ficha');
  if (g) g.addEventListener('click', async () => {
    const cambios = {};
    o.querySelectorAll('[data-br-k]').forEach(el => { const v = el.value.trim() || null; if ((b[el.dataset.brK] || null) !== v) cambios[el.dataset.brK] = v; });
    if (!Object.keys(cambios).length) { mostrarToast_('Sin cambios.'); return; }
    g.disabled = true;
    const { data, error } = await supabaseClient.from('bosques_recreativos').update(cambios).eq('id_br', id).select('id_br');
    g.disabled = false;
    if (error || !data || !data.length) { mostrarToast_('No se guardó: ' + (error ? error.message : 'sin permiso sobre este bosque')); return; }
    Object.assign(b, cambios);
    mostrarToast_('✅ Bosque actualizado.');
    poblarFiltrosBosques_(); renderBosques_(); abrirFichaBosque_(id);
  });
  o.querySelectorAll('[data-br-proy-ficha]').forEach(el => el.addEventListener('click', () => abrirProyectoBosque_(el.dataset.brProyFicha)));
  const nf = o.querySelector('[data-br-nuevo-ficha]'); if (nf) nf.addEventListener('click', () => abrirProyectoBosque_(null, id));
  if (window.Chart && temps.length) state.br.chartFicha = new Chart(o.querySelector('#br-ch-ficha'), {
    type: 'bar', data: { labels: temps, datasets: [{ data: temps.map(t => brVisitasTemp_(b, t)), backgroundColor: temps.map(t => t === state.br.temp ? '#2563EB' : '#94A3B8'), borderRadius: 5 }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } },
  });
  // Historial de revisiones y bitácora (en segundo plano)
  const [rv, bt] = await Promise.all([
    supabaseClient.from('br_revisiones').select('fecha, sitio, autor, mesas_total, mesas_danadas, fogones_total, fogones_danados, letreros_total, letreros_danados, administracion, condicion_acceso').eq('id_br', id).order('fecha', { ascending: false }),
    supabaseClient.from('br_bitacora').select('*').eq('id_br', id).order('fecha', { ascending: false }).limit(40),
  ]);
  const h = o.querySelector('#br-hist-rev');
  if (h) h.innerHTML = (rv.data || []).length ? '📋 ' + (rv.data || []).length + ' revisión(es): ' + (rv.data || []).map(r => brFechaTxt_(r.fecha) + (r.sitio ? ' (' + escapeHtml_(r.sitio) + ')' : '')).join(' · ') : '';
  const bb = o.querySelector('#br-bitacora-bosque');
  if (bb) bb.innerHTML = brBitacoraHtml_(bt.data || []);
}
function brBitacoraHtml_(filas) {
  if (!filas.length) return '<p class="br-nota">Sin movimientos registrados.</p>';
  return filas.map(f => '<div class="br-bit"><span class="f">' + new Date(f.fecha).toLocaleString('es-CL', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) + '</span>' +
    '<b>' + escapeHtml_(f.accion) + '</b> ' + escapeHtml_(f.detalle || '') + '<small> · ' + escapeHtml_(f.usuario_nombre || 'sistema') + '</small></div>').join('');
}

/* Proyecto de inversión: datos + cotizaciones + gastos + bitácora */
async function abrirProyectoBosque_(proyId, idBr, categoria, cantidad) {
  let p = proyId ? state.br.proyectos.find(x => x.id === proyId) : null;
  const nuevo = !p;
  if (nuevo) {
    const disponibles = bosquesFiltrados_().filter(brPuedeEditar_);
    if (!disponibles.length) { mostrarToast_('No tienes bosques que puedas gestionar con estos filtros.'); return; }
    p = { id_br: idBr || disponibles[0].id_br, titulo: categoria ? 'Reposición de ' + categoria.toLowerCase() : '', categoria: categoria || 'Mesas', cantidad: cantidad ? Number(cantidad) : null,
      estado: 'Idea', prioridad: 'Media', temporada: brTemporadaProxima_() };
  }
  const b = brById_(p.id_br) || {}, puede = brPuedeEditar_(b);
  const M = nuevo ? { cot: [], gas: [], sel: null, ejecutado: 0 } : brMontosProyecto_(p);
  const dis = puede ? '' : ' disabled';
  const inp = (k, lbl, tipo, extra) => '<label class="br-campo"><span>' + lbl + '</span><input data-bp="' + k + '" type="' + (tipo || 'text') + '" value="' + escapeHtml_(p[k] == null ? '' : String(p[k])) + '"' + dis + (extra || '') + '></label>';
  const sel = (k, lbl, ops) => '<label class="br-campo"><span>' + lbl + '</span><select data-bp="' + k + '"' + dis + '>' + ops.map(v => '<option' + (p[k] === v ? ' selected' : '') + '>' + v + '</option>').join('') + '</select></label>';
  const bosquesOpc = state.br.datos.filter(x => brEnAlcance_(x) && brPuedeEditar_(x)).sort((x, y) => x.nombre.localeCompare(y.nombre, 'es'));
  const o = brModal_(
    '<div class="br-ficha-cab" style="--c:' + BR_ESTADO_COLOR[p.estado] + '"><div><div class="id">' + (nuevo ? 'Nuevo proyecto de inversión' : 'Proyecto · ' + escapeHtml_(p.estado)) + '</div>' +
      '<h3>💰 ' + escapeHtml_(p.titulo || 'Sin título') + '</h3><div class="sub">🌳 ' + escapeHtml_(b.nombre || p.id_br) + ' · ' + escapeHtml_(aTitulo_(b.area || '')) + '</div>' +
      (!nuevo ? '<div class="br-montos"><div><span>Estimado</span><b>' + brPesos_(p.monto_estimado) + '</b></div><div><span>Cotización elegida</span><b>' + (M.sel ? brPesos_(M.sel.monto_total || M.sel.monto_neto) : '—') + '</b></div>' +
        '<div><span>Aprobado</span><b style="color:#2563EB">' + brPesos_(p.monto_aprobado) + '</b></div><div><span>Ejecutado</span><b style="color:#16A34A">' + brPesos_(M.ejecutado) + '</b></div>' +
        '<div><span>Saldo</span><b style="color:' + ((p.monto_aprobado || 0) - M.ejecutado < 0 ? '#DC2626' : 'inherit') + '">' + (p.monto_aprobado ? brPesos_(p.monto_aprobado - M.ejecutado) : '—') + '</b></div></div>' : '') +
    '</div><button class="br-x" data-br-cerrar>✕</button></div>' +
    '<div class="br-ficha-grid">' +
      '<div class="br-ficha-sec"><div class="br-sec">📝 Datos del proyecto</div>' +
        '<label class="br-campo"><span>Bosque</span><select data-bp="id_br"' + (nuevo && puede ? '' : ' disabled') + '>' + (bosquesOpc.some(x => x.id_br === p.id_br) ? '' : '<option value="' + escapeHtml_(p.id_br) + '">' + escapeHtml_(b.nombre || p.id_br) + '</option>') +
          bosquesOpc.map(x => '<option value="' + escapeHtml_(x.id_br) + '"' + (x.id_br === p.id_br ? ' selected' : '') + '>' + escapeHtml_(x.nombre + ' · ' + x.id_br) + '</option>').join('') + '</select></label>' +
        inp('titulo', 'Título') +
        '<div class="br-2col">' + sel('categoria', 'Categoría', BR_CATEGORIAS) + inp('cantidad', 'Cantidad', 'number', ' min="0"') + '</div>' +
        '<div class="br-2col">' + sel('estado', 'Estado', BR_ESTADOS_PROY) + sel('prioridad', 'Prioridad', ['Alta', 'Media', 'Baja']) + '</div>' +
        '<div class="br-2col">' + inp('temporada', 'Temporada') + inp('responsable', 'Responsable') + '</div>' +
        '<label class="br-campo"><span>Descripción</span><textarea data-bp="descripcion" rows="2"' + dis + '>' + escapeHtml_(p.descripcion || '') + '</textarea></label>' +
        '<div class="br-sec" style="margin-top:10px;">💵 Presupuesto</div>' +
        '<div class="br-2col">' + inp('monto_estimado', 'Monto estimado ($)', 'number', ' min="0"') + inp('monto_aprobado', 'Monto aprobado ($)', 'number', ' min="0"') + '</div>' +
        '<div class="br-2col">' + inp('fecha_aprobacion', 'Fecha de aprobación', 'date') + inp('aprobado_por', 'Aprobado por') + '</div>' +
        '<div class="br-2col">' + inp('orden_compra', 'N° orden de compra') + inp('centro_costo', 'Centro de costo') + '</div>' +
        '<div class="br-2col">' + inp('fecha_inicio', 'Inicio', 'date') + inp('fecha_termino', 'Término', 'date') + '</div>' +
        (puede ? '<div style="display:flex;gap:8px;margin-top:8px;"><button class="turnos-btn br-guardar" id="bp-guardar">💾 ' + (nuevo ? 'Crear proyecto' : 'Guardar') + '</button>' +
          (!nuevo && brPuedeEditar_(b) ? '<button class="turnos-btn" id="bp-eliminar" style="color:#DC2626;">🗑️ Eliminar</button>' : '') + '</div>' : '<p class="br-nota">Solo consulta.</p>') +
      '</div>' +
      '<div class="br-ficha-sec">' + (nuevo ? '<p class="br-nota">Crea el proyecto para agregar cotizaciones, registrar gastos (OC, facturas) y ver su bitácora.</p>' :
        '<div class="br-sec">📄 Cotizaciones <small>' + M.cot.length + '</small></div>' +
        (M.cot.map(c => '<div class="br-cot' + (c.seleccionada ? ' sel' : '') + '"><div><b>' + escapeHtml_(c.proveedor) + '</b>' + (c.rut_proveedor ? ' <small>' + escapeHtml_(c.rut_proveedor) + '</small>' : '') +
          '<br><small>' + brFechaTxt_(c.fecha) + (c.validez_dias ? ' · validez ' + c.validez_dias + ' días' : '') + (c.detalle ? ' · ' + escapeHtml_(c.detalle) : '') + '</small></div>' +
          '<div class="m">' + brPesos_(c.monto_total || c.monto_neto) + (c.monto_neto && c.monto_total ? '<small>neto ' + brPesos_(c.monto_neto) + '</small>' : '') + '</div>' +
          '<div class="acc">' + (c.archivo_path ? '<button class="br-mini" data-br-doc="' + escapeHtml_(c.archivo_path) + '">📎</button>' : '') +
            (c.seleccionada ? '<span class="br-badge" style="--c:#16A34A">✔ Elegida</span>' : (puede ? '<button class="br-mini" data-br-elegir="' + c.id + '">Elegir</button>' : '')) +
            (puede ? '<button class="br-mini" data-br-borrar-cot="' + c.id + '" title="Eliminar">✕</button>' : '') + '</div></div>').join('') || '<p class="br-nota">Sin cotizaciones.</p>') +
        (puede ? '<details class="br-agregar"><summary>＋ Agregar cotización</summary><div class="br-2col">' +
          '<label class="br-campo"><span>Proveedor</span><input id="bc-proveedor"></label><label class="br-campo"><span>RUT</span><input id="bc-rut"></label></div><div class="br-2col">' +
          '<label class="br-campo"><span>Monto neto ($)</span><input id="bc-neto" type="number" min="0"></label><label class="br-campo"><span>Monto total con IVA ($)</span><input id="bc-total" type="number" min="0"></label></div><div class="br-2col">' +
          '<label class="br-campo"><span>Fecha</span><input id="bc-fecha" type="date" value="' + fechaISO_(new Date()) + '"></label><label class="br-campo"><span>Validez (días)</span><input id="bc-validez" type="number" min="0"></label></div>' +
          '<label class="br-campo"><span>Detalle</span><input id="bc-detalle"></label><label class="br-campo"><span>Archivo (PDF / imagen)</span><input id="bc-archivo" type="file" accept=".pdf,image/*"></label>' +
          '<button class="turnos-btn br-guardar" id="bc-guardar">Agregar cotización</button></details>' : '') +
        '<div class="br-sec" style="margin-top:12px;">🧾 Gastos ejecutados <small>' + brPesos_(M.ejecutado) + '</small></div>' +
        (M.gas.map(g => '<div class="br-cot"><div><b>' + escapeHtml_(g.tipo_documento) + (g.n_documento ? ' N° ' + escapeHtml_(g.n_documento) : '') + '</b><br><small>' + brFechaTxt_(g.fecha) + (g.proveedor ? ' · ' + escapeHtml_(g.proveedor) : '') + (g.detalle ? ' · ' + escapeHtml_(g.detalle) : '') + '</small></div>' +
          '<div class="m">' + brPesos_(g.monto) + '</div><div class="acc">' + (g.archivo_path ? '<button class="br-mini" data-br-doc="' + escapeHtml_(g.archivo_path) + '">📎</button>' : '') +
          (puede ? '<button class="br-mini" data-br-borrar-gas="' + g.id + '" title="Eliminar">✕</button>' : '') + '</div></div>').join('') || '<p class="br-nota">Sin gastos registrados.</p>') +
        (puede ? '<details class="br-agregar"><summary>＋ Registrar gasto</summary><div class="br-2col">' +
          '<label class="br-campo"><span>Documento</span><select id="bg-tipo"><option>Orden de compra</option><option selected>Factura</option><option>Boleta</option><option>Otro</option></select></label><label class="br-campo"><span>N° documento</span><input id="bg-num"></label></div><div class="br-2col">' +
          '<label class="br-campo"><span>Monto ($)</span><input id="bg-monto" type="number" min="0"></label><label class="br-campo"><span>Fecha</span><input id="bg-fecha" type="date" value="' + fechaISO_(new Date()) + '"></label></div>' +
          '<div class="br-2col"><label class="br-campo"><span>Proveedor</span><input id="bg-proveedor" value="' + escapeHtml_(M.sel ? M.sel.proveedor : '') + '"></label><label class="br-campo"><span>Detalle</span><input id="bg-detalle"></label></div>' +
          '<label class="br-campo"><span>Archivo</span><input id="bg-archivo" type="file" accept=".pdf,image/*"></label><button class="turnos-btn br-guardar" id="bg-guardar">Registrar gasto</button></details>' : '') +
        '<div class="br-sec" style="margin-top:12px;">🕓 Trazabilidad</div>' +
        (puede ? '<div style="display:flex;gap:6px;margin-bottom:6px;"><input id="bb-nota" class="admin-search" style="min-width:0;flex:1;" placeholder="Agregar una nota a la bitácora…"><button class="br-mini" id="bb-guardar">Anotar</button></div>' : '') +
        '<div id="bp-bitacora" class="br-bitacora">Cargando…</div>') +
      '</div>' +
    '</div>', 1040);
  const recargar = async (msg) => { if (msg) mostrarToast_(msg); await cargarBosques_(); abrirProyectoBosque_(p.id); };
  const subir = async (input) => {
    const f = input && input.files && input.files[0]; if (!f) return null;
    const ruta = (p.id || 'nuevo') + '/' + Date.now() + '_' + f.name.replace(/[^\w.\-]+/g, '_');
    const { error } = await supabaseClient.storage.from('bosques-docs').upload(ruta, f);
    if (error) { mostrarToast_('No se subió el archivo: ' + error.message); return null; }
    return ruta;
  };
  const gp = o.querySelector('#bp-guardar');
  if (gp) gp.addEventListener('click', async () => {
    const reg = {};
    o.querySelectorAll('[data-bp]').forEach(el => { const k = el.dataset.bp; let v = el.value.trim(); reg[k] = v === '' ? null : (el.type === 'number' ? Number(v) : v); });
    if (!reg.titulo) { mostrarToast_('Escribe un título para el proyecto.'); return; }
    if (reg.estado === 'Presupuesto aprobado' && !reg.monto_aprobado) { mostrarToast_('Para «Presupuesto aprobado» ingresa el monto aprobado.'); return; }
    gp.disabled = true;
    const r = nuevo ? await supabaseClient.from('br_proyectos').insert(reg).select('id').single()
                    : await supabaseClient.from('br_proyectos').update(reg).eq('id', p.id).select('id').single();
    gp.disabled = false;
    if (r.error) { mostrarToast_('No se guardó: ' + r.error.message); return; }
    p.id = r.data.id;
    await recargar(nuevo ? '✅ Proyecto creado.' : '✅ Proyecto actualizado.');
  });
  const ge = o.querySelector('#bp-eliminar');
  if (ge) ge.addEventListener('click', async () => {
    if (!confirm('¿Eliminar el proyecto «' + p.titulo + '» con sus cotizaciones y gastos? Quedará anotado en la bitácora del bosque.')) return;
    const { error } = await supabaseClient.from('br_proyectos').delete().eq('id', p.id);
    if (error) { mostrarToast_('No se eliminó: ' + error.message); return; }
    cerrarBrModal_(); mostrarToast_('Proyecto eliminado.'); cargarBosques_();
  });
  const gc = o.querySelector('#bc-guardar');
  if (gc) gc.addEventListener('click', async () => {
    const v = id => (o.querySelector(id).value || '').trim();
    if (!v('#bc-proveedor') || !(v('#bc-neto') || v('#bc-total'))) { mostrarToast_('Indica el proveedor y un monto.'); return; }
    gc.disabled = true;
    const archivo = await subir(o.querySelector('#bc-archivo'));
    const { error } = await supabaseClient.from('br_cotizaciones').insert({ proyecto_id: p.id, proveedor: v('#bc-proveedor'), rut_proveedor: v('#bc-rut') || null,
      monto_neto: v('#bc-neto') ? Number(v('#bc-neto')) : null, monto_total: v('#bc-total') ? Number(v('#bc-total')) : (v('#bc-neto') ? Math.round(Number(v('#bc-neto')) * 1.19) : null),
      fecha: v('#bc-fecha') || null, validez_dias: v('#bc-validez') ? Number(v('#bc-validez')) : null, detalle: v('#bc-detalle') || null, archivo_path: archivo });
    gc.disabled = false;
    if (error) { mostrarToast_('No se agregó: ' + error.message); return; }
    if (p.estado === 'Idea') await supabaseClient.from('br_proyectos').update({ estado: 'Cotizando' }).eq('id', p.id);
    await recargar('📄 Cotización agregada.');
  });
  const gg = o.querySelector('#bg-guardar');
  if (gg) gg.addEventListener('click', async () => {
    const v = id => (o.querySelector(id).value || '').trim();
    if (!v('#bg-monto')) { mostrarToast_('Indica el monto del gasto.'); return; }
    gg.disabled = true;
    const archivo = await subir(o.querySelector('#bg-archivo'));
    const { error } = await supabaseClient.from('br_gastos').insert({ proyecto_id: p.id, tipo_documento: v('#bg-tipo'), n_documento: v('#bg-num') || null, monto: Number(v('#bg-monto')),
      fecha: v('#bg-fecha') || fechaISO_(new Date()), proveedor: v('#bg-proveedor') || null, detalle: v('#bg-detalle') || null, archivo_path: archivo });
    gg.disabled = false;
    if (error) { mostrarToast_('No se registró: ' + error.message); return; }
    if (p.estado === 'Presupuesto aprobado') await supabaseClient.from('br_proyectos').update({ estado: 'En ejecución' }).eq('id', p.id);
    await recargar('🧾 Gasto registrado.');
  });
  o.addEventListener('click', async e => {
    const el = e.target.closest('[data-br-elegir]');
    if (el) {
      await supabaseClient.from('br_cotizaciones').update({ seleccionada: false }).eq('proyecto_id', p.id).neq('id', el.dataset.brElegir);
      const c = M.cot.find(x => x.id === el.dataset.brElegir);
      const { error } = await supabaseClient.from('br_cotizaciones').update({ seleccionada: true }).eq('id', el.dataset.brElegir);
      if (error) { mostrarToast_(error.message); return; }
      if (c && !p.monto_estimado) await supabaseClient.from('br_proyectos').update({ monto_estimado: c.monto_total || c.monto_neto }).eq('id', p.id);
      await recargar('✔ Cotización elegida.'); return;
    }
    const bc = e.target.closest('[data-br-borrar-cot]');
    if (bc && confirm('¿Eliminar esta cotización?')) { const { error } = await supabaseClient.from('br_cotizaciones').delete().eq('id', bc.dataset.brBorrarCot); if (error) mostrarToast_(error.message); else await recargar('Cotización eliminada.'); return; }
    const bg = e.target.closest('[data-br-borrar-gas]');
    if (bg && confirm('¿Eliminar este gasto?')) { const { error } = await supabaseClient.from('br_gastos').delete().eq('id', bg.dataset.brBorrarGas); if (error) mostrarToast_(error.message); else await recargar('Gasto eliminado.'); return; }
    const d = e.target.closest('[data-br-doc]');
    if (d) { const { data, error } = await supabaseClient.storage.from('bosques-docs').createSignedUrl(d.dataset.brDoc, 300); if (error) mostrarToast_(error.message); else window.open(data.signedUrl, '_blank', 'noopener'); }
  });
  const bn = o.querySelector('#bb-guardar');
  if (bn) bn.addEventListener('click', async () => {
    const t = o.querySelector('#bb-nota').value.trim(); if (!t) return;
    const { error } = await supabaseClient.from('br_bitacora').insert({ proyecto_id: p.id, id_br: p.id_br, accion: 'Nota', detalle: t, usuario: state.user && state.user.id, usuario_nombre: state.perfil && state.perfil.nombre_completo });
    if (error) { mostrarToast_(error.message); return; }
    await recargar('📝 Nota agregada.');
  });
  if (!nuevo) {
    const { data } = await supabaseClient.from('br_bitacora').select('*').eq('proyecto_id', p.id).order('fecha', { ascending: false });
    const el = o.querySelector('#bp-bitacora'); if (el) el.innerHTML = brBitacoraHtml_(data || []);
  }
}
function brTemporadaProxima_() { const d = new Date(), y = d.getFullYear() - (d.getMonth() < 6 ? 1 : 0); return y + '-' + (y + 1); }

async function descargarBosques_() {
  try {
    const XLSX = await tbCargarSheetJs_();
    const lista = bosquesFiltrados_(), temps = brTemporadas_();
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(lista.map(b => Object.assign({
      'ID': b.id_br, 'Bosque': b.nombre, 'Estado': b.estado, 'Año': b.anio_implementacion, 'Subgerencia': b.subgerencia, 'Área': b.area, 'Comuna': b.comuna, 'Sector': b.sector, 'Fundo': b.fundo,
      'Administración': brAdmin_(b).txt, 'Administrado por la comunidad': brComunitario_(b) ? 'Sí' : 'No', 'Administrador': b.admin_nombre || '', 'Contacto': b.admin_contacto || '',
      'Acceso': brAcceso_(b).txt, 'Cómo llegar': b.acceso_como_llegar || '', 'Horario': b.acceso_horario || '', 'Vehículo': b.acceso_vehiculo || '',
      'Lat': b.lat, 'Lng': b.lng,
      'Mesas': b.mesas_total, 'Mesas dañadas': b.mesas_danadas, 'Mesas por agregar': b.mesas_nuevas, 'Fogones': b.fogones_total, 'Fogones dañados': b.fogones_danados, 'Fogones por agregar': b.fogones_nuevos,
      'Letreros': b.letreros_total, 'Letreros dañados': b.letreros_danados, 'Letreros por agregar': b.letreros_nuevos, 'Última revisión': b.revision_fecha || '',
      'Proyectos': b.proyectos, 'Estimado $': b.monto_estimado || 0, 'Aprobado $': b.monto_aprobado || 0, 'Ejecutado $': b.monto_ejecutado || 0,
    }, Object.fromEntries(temps.map(t => ['Visitas ' + t, brVisitasTemp_(b, t)]))))), 'Bosques');
    const ids = new Set(lista.map(b => b.id_br));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(state.br.proyectos.filter(p => ids.has(p.id_br)).map(p => { const M = brMontosProyecto_(p), b = brById_(p.id_br) || {};
      return { 'Bosque': b.nombre, 'ID': p.id_br, 'Proyecto': p.titulo, 'Categoría': p.categoria, 'Cantidad': p.cantidad, 'Estado': p.estado, 'Prioridad': p.prioridad, 'Temporada': p.temporada,
        'Estimado $': p.monto_estimado, 'Aprobado $': p.monto_aprobado, 'Ejecutado $': M.ejecutado, 'Cotizaciones': M.cot.length, 'Proveedor elegido': M.sel ? M.sel.proveedor : '', 'OC': p.orden_compra || '' }; })), 'Inversión');
    XLSX.writeFile(wb, 'bosques_recreativos_' + fechaISO_(new Date()) + '.xlsx');
    mostrarToast_('✅ Excel descargado.');
  } catch (e) { mostrarToast_('No se pudo generar el Excel: ' + (e.message || e)); }
}

