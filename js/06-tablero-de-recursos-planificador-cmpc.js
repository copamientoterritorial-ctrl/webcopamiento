/* ==================== TABLERO DE RECURSOS (Planificador CMPC ▾, 12-10-2026) ====================
 * Resumen de los recursos del Planificador gráfico (referencia_recursos) filtrable por
 * subgerencia, área, tipo y estado: KPIs, recursos por tipo con su ícono, activación por
 * quincena (gráfico + línea de tiempo con el detalle), matriz área × tipo y descarga a Excel.
 * Lee lo mismo que el Planificador (v_planificador_recursos + ruta Normal) y, de la tabla, las
 * columnas de la carga inicial (n_personas, horario, fecha de término, trabajo actual; SQL 90).
 * Respeta las áreas visibles del usuario (plAreasVisibles_). */
state.tb = { listeners: false, extra: {}, quincena: null, grafico: null };
const TB_MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const TB_ESTADOS = { activo: '🟢 Activo', prox: '🟡 Por activar', fin: '⚪ Finalizado', sin: '🔴 Sin fecha' };

async function abrirTablero_(forzar) {
  if (!state.tb.listeners) { state.tb.listeners = true; iniciarListenersTablero_(); }
  const est = document.getElementById('tb-estado-txt');
  est.textContent = 'Cargando…';
  try {
    if (!Object.keys(state.iconosPorTipoRecurso || {}).length) await cargarIconosRecursos_();
    await cargarTiposRecurso_();
    if (forzar || !state.pl.cargado) await cargarRecursosPlanificador_();
    // Columnas de la carga inicial (SQL 90); si aún no existen, el tablero funciona sin ellas
    const { data, error } = await supabaseClient.from('referencia_recursos')
      .select('id, n_personas, horario, fecha_termino_operacion, trabajo_actual');
    state.tb.extra = {};
    if (!error) (data || []).forEach(x => { state.tb.extra[x.id] = x; });
    else console.warn('Tablero: columnas de la carga inicial no disponibles:', error.message);
  } catch (e) {
    est.textContent = 'Error al cargar';
    mostrarToast_('No se pudo cargar el tablero: ' + (e.message || e));
    return;
  }
  poblarFiltrosTablero_();
  renderTablero_();
}

function iniciarListenersTablero_() {
  selMultiple_('tb-tipo', 'tipos');   // ☑️ varios tipos a la vez (22-10-2026)
  ['tb-subg', 'tb-area', 'tb-tipo', 'tb-movil', 'tb-estado'].forEach(id => document.getElementById(id).addEventListener('change', () => {
    if (id === 'tb-subg') poblarFiltrosTablero_();
    state.tb.quincena = null;
    renderTablero_();
  }));
  document.getElementById('tb-limpiar').addEventListener('click', () => {
    ['tb-subg', 'tb-area', 'tb-tipo', 'tb-movil', 'tb-estado'].forEach(id => { document.getElementById(id).value = ''; });
    state.tb.quincena = null;
    poblarFiltrosTablero_(); renderTablero_();
  });
  document.getElementById('tb-descargar').addEventListener('click', descargarTablero_);
  // Clics dentro del tablero: tarjeta de tipo (filtra) y columna de quincena (detalle)
  document.getElementById('tb-cuerpo').addEventListener('click', (e) => {
    const t = e.target.closest('[data-tb-tipo]');
    if (t) {
      // Clic en una tarjeta: suma o quita ese tipo de la selección (selector múltiple)
      const vs = valoresSel_('tb-tipo'), tt = t.dataset.tbTipo;
      fijarValoresSel_('tb-tipo', vs.includes(tt) ? vs.filter(x => x !== tt) : vs.concat(tt));
      state.tb.quincena = null; renderTablero_(); return;
    }
    const q = e.target.closest('[data-tb-q]');
    if (q) {
      e.preventDefault();
      state.tb.quincena = state.tb.quincena === q.dataset.tbQ ? null : q.dataset.tbQ;
      renderTablero_();
      if (state.tb.quincena) tbIrAlDetalle_();
    }
  });
}

/** Lleva la vista a la tabla de detalle (al elegir una quincena). */
function tbIrAlDetalle_() {
  const d = document.getElementById('tb-detalle');
  if (d) d.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
/** Recursos de las áreas que ve el usuario (mismo criterio que el Planificador). */
function tbBase_() {
  const ids = new Set(plAreasVisibles_().map(a => a.id));
  return (state.pl.recursos || []).filter(r => ids.has(r.id_area));
}
function poblarFiltrosTablero_() {
  const base = tbBase_();
  const opts = (sel, valores, todos, etiqueta) => {
    const el = document.getElementById(sel), actual = el.value;
    el.innerHTML = '<option value="">' + todos + '</option>' + valores.map(v =>
      '<option value="' + escapeHtml_(v) + '">' + escapeHtml_(etiqueta ? etiqueta(v) : v) + '</option>').join('');
    if (el._msel) actualizarSel_(el); else el.value = valores.includes(actual) ? actual : '';
  };
  const uniq = arr => [...new Set(arr.filter(v => v != null && v !== ''))].sort((a, b) => String(a).localeCompare(String(b), 'es'));
  opts('tb-subg', uniq(base.map(r => r.subgerencia)), 'Todas las subgerencias', v => 'Subgerencia ' + v);
  const subg = document.getElementById('tb-subg').value;
  opts('tb-area', uniq(base.filter(r => !subg || r.subgerencia === subg).map(r => r.area)), 'Todas las áreas');
  opts('tb-tipo', uniq(base.map(r => r.tipo_recurso)).sort(compararTipoRecurso_), 'Todos los tipos', aTitulo_);
  opts('tb-movil', uniq(base.map(r => tbMovil_(r))), 'Todos los móviles', v => tbMovilInfo_(v).ico + ' ' + aTitulo_(v));
}
/** Tipo de móvil normalizado (SIN MOVIL = SIN MÓVIL). */
function tbMovil_(r) {
  const m = String(r.tipo_movil || '').trim().toUpperCase();
  if (!m) return 'SIN DATO';
  return normalizarBusqueda_(m).toUpperCase() === 'SIN MOVIL' ? 'SIN MÓVIL' : m;
}
function tbMovilInfo_(m) {
  const n = normalizarBusqueda_(m).toUpperCase();
  if (n.includes('CAMIONETA')) return { ico: '🛻', color: '#1D4ED8' };
  if (n.includes('MOTO')) return { ico: '🏍️', color: '#7C3AED' };
  if (n.includes('SIN')) return { ico: '🚶', color: '#64748B' };
  return { ico: '🚙', color: '#0891B2' };
}

/** Porcentaje legible (1 decimal solo si es menor a 10 %). */
function tbPct_(n, total) {
  if (!total) return '0%';
  const p = 100 * n / total;
  return (p > 0 && p < 10 ? p.toLocaleString('es-CL', { maximumFractionDigits: 1 }) : Math.round(p)) + '%';
}
function tbHoyISO_() { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function tbExtra_(r) { return state.tb.extra[r.id] || {}; }
function tbEstado_(r, hoy) {
  const ini = r.fecha_inicio_operacion ? String(r.fecha_inicio_operacion).slice(0, 10) : null;
  if (!ini) return 'sin';
  const fin = tbExtra_(r).fecha_termino_operacion ? String(tbExtra_(r).fecha_termino_operacion).slice(0, 10) : null;
  if (fin && fin < hoy) return 'fin';
  return ini <= hoy ? 'activo' : 'prox';
}
/** Quincena de una fecha ISO: 1Q = días 1–15, 2Q = 16–fin de mes. */
function tbQuincena_(iso) {
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  const q = d <= 15 ? 1 : 2;
  const ultimo = new Date(y, m, 0).getDate();
  const mm = String(m).padStart(2, '0');
  return { key: y + '-' + mm + '-' + q, q, y, m,
    label: q + 'Q ' + TB_MESES[m - 1] + (String(y).slice(2) ? ' ' + String(y).slice(2) : ''),
    largo: (q === 1 ? '1ª' : '2ª') + ' quincena de ' + TB_MESES[m - 1].toLowerCase() + '. ' + y,
    ini: y + '-' + mm + '-' + (q === 1 ? '01' : '16'), fin: y + '-' + mm + '-' + (q === 1 ? '15' : String(ultimo)) };
}
function tbQuincenaSiguiente_(q) {
  if (q.q === 1) return tbQuincena_(q.y + '-' + String(q.m).padStart(2, '0') + '-16');
  const m = q.m === 12 ? 1 : q.m + 1, y = q.m === 12 ? q.y + 1 : q.y;
  return tbQuincena_(y + '-' + String(m).padStart(2, '0') + '-01');
}
/** Ícono del tipo (el mismo del mapa: ícono del catálogo o emoji con el color del tipo). */
function tbIcono_(tipo, px) {
  const url = iconoPersonalizadoPorTipo_(tipo);
  const color = plColorTipo_(tipo);
  // Íconos anchos (camioneta, brigadas): más ancho que alto, para que el dibujo no quede chico
  if (url) return '<span class="tb-ico" style="width:' + Math.round(px * Math.max(1, Math.min(1.8, aspectoIconoTipo_(tipo)))) + 'px;height:' + px + 'px;"><img src="' + escapeHtml_(url) + '" alt=""></span>';
  const { emoji } = emojiParaRecursoMaestro_({ tipo_recurso: tipo });
  return '<span class="tb-ico emo" style="--c:' + color + ';width:' + px + 'px;height:' + px + 'px;font-size:' + Math.round(px * 0.55) + 'px;">' + emoji + '</span>';
}

function tbFiltrados_() {
  const f = id => document.getElementById(id).value;
  const subg = f('tb-subg'), area = f('tb-area'), tipo = f('tb-tipo'), movil = f('tb-movil'), estado = f('tb-estado');
  const hoy = tbHoyISO_();
  return tbBase_().filter(r => (!subg || r.subgerencia === subg) && (!area || r.area === area) &&
    pasaSel_('tb-tipo', r.tipo_recurso) && (!movil || tbMovil_(r) === movil) && (!estado || tbEstado_(r, hoy) === estado));
}

function renderTablero_() {
  const cuerpo = document.getElementById('tb-cuerpo');
  const hayFiltro = ['tb-subg', 'tb-area', 'tb-tipo', 'tb-movil', 'tb-estado'].some(id => document.getElementById(id).value);
  document.getElementById('tb-limpiar').style.display = hayFiltro ? '' : 'none';
  const lista = tbFiltrados_();
  const hoy = tbHoyISO_();
  const est = document.getElementById('tb-estado-txt');
  est.textContent = lista.length + ' recurso(s)' + (hayFiltro ? ' (filtrados)' : '');
  if (state.tb.grafico) { state.tb.grafico.destroy(); state.tb.grafico = null; }
  if (!lista.length) { cuerpo.innerHTML = '<div class="tb-vacio">No hay recursos con estos filtros.</div>'; return; }
  const esc = escapeHtml_;
  const fmt = n => Number(n || 0).toLocaleString('es-CL');

  // ── KPIs
  const estados = { activo: 0, prox: 0, fin: 0, sin: 0 };
  lista.forEach(r => { estados[tbEstado_(r, hoy)]++; });
  const personas = lista.reduce((s, r) => s + (Number(tbExtra_(r).n_personas) || 0), 0);
  const en15 = new Date(); en15.setDate(en15.getDate() + 15);
  const en15ISO = en15.toISOString().slice(0, 10);
  const prox15 = lista.filter(r => r.fecha_inicio_operacion && String(r.fecha_inicio_operacion).slice(0, 10) > hoy && String(r.fecha_inicio_operacion).slice(0, 10) <= en15ISO).length;
  const conRuta = lista.filter(r => plRutaNormal_(r)).length;
  const sinUbic = lista.filter(r => r.lat == null).length;
  const kpi = (c, n, t, s) => '<div class="tb-kpi" style="--c:' + c + '"><b>' + n + '</b><span>' + t + '</span><small>' + s + '</small></div>';
  let html = '<div class="tb-kpis">' +
    kpi('#2563EB', fmt(lista.length), 'Recursos', fmt(new Set(lista.map(r => r.area)).size) + ' área(s) · ' + fmt(new Set(lista.map(r => r.tipo_recurso)).size) + ' tipo(s)') +
    kpi('#7C3AED', fmt(personas), 'Personas', personas ? 'según N° de personas del Excel' : 'sin dato de personas') +
    kpi('#16A34A', fmt(estados.activo), 'Activos hoy', Math.round(100 * estados.activo / lista.length) + '% del total') +
    kpi('#F59E0B', fmt(estados.prox), 'Por activar', fmt(prox15) + ' en los próximos 15 días') +
    kpi('#0891B2', fmt(conRuta), 'Con ruta (Normal)', fmt(lista.length - conRuta) + ' sin ruta asignada') +
    kpi(sinUbic ? '#DC2626' : '#64748B', fmt(sinUbic), 'Pendientes de ubicar', sinUbic ? 'sin punto en el mapa' : 'todos ubicados') +
    // Móviles (12-10-2026)
    (() => {
      const nM = t => lista.filter(r => tbMovil_(r) === t).length;
      const cam = lista.filter(r => /CAMIONETA/.test(tbMovil_(r))).length, moto = lista.filter(r => /MOTO/.test(tbMovil_(r))).length;
      return kpi('#1D4ED8', '🛻 ' + fmt(cam), 'Camionetas', Math.round(100 * cam / lista.length) + '% de los recursos') +
             kpi('#7C3AED', '🏍️ ' + fmt(moto), 'Motos', fmt(nM('SIN MÓVIL')) + ' recursos sin móvil');
    })() +
    '</div>';

  // ── Personas por subgerencia (destacado)
  const porSubg = {};
  lista.forEach(r => {
    const s = r.subgerencia || 'Sin subgerencia';
    const o = porSubg[s] = porSubg[s] || { personas: 0, recursos: 0, activas: 0, areas: new Set() };
    const p = Number(tbExtra_(r).n_personas) || 0;
    o.personas += p; o.recursos++; o.areas.add(r.area);
    if (tbEstado_(r, hoy) === 'activo') o.activas += p;
  });
  const subgOrden = Object.keys(porSubg).sort();
  const maxPers = Math.max(1, ...subgOrden.map(s => porSubg[s].personas));
  html += '<div class="tb-subgs">' + subgOrden.map(s => {
    const o = porSubg[s];
    return '<div class="tb-subg-card"><div class="tb-subg-ico">👥</div><div class="tb-subg-cuerpo">' +
      '<div class="tb-subg-nom">Subgerencia ' + esc(s) + '</div>' +
      '<div class="tb-subg-n">' + fmt(o.personas) + '<span>personas trabajando</span></div>' +
      '<div class="tb-subg-barra"><i style="width:' + (100 * o.personas / maxPers) + '%"></i></div>' +
      '<div class="tb-subg-det">' + fmt(o.recursos) + ' recursos · ' + o.areas.size + ' área(s) · ' + fmt(o.activas) + ' personas activas hoy</div>' +
      '</div></div>';
  }).join('') + '</div>';

  // ── Recursos por tipo (con su ícono)
  const porTipo = {};
  lista.forEach(r => {
    const k = r.tipo_recurso || 'Sin tipo';
    const o = porTipo[k] = porTipo[k] || { n: 0, activo: 0, prox: 0, personas: 0 };
    o.n++; const e = tbEstado_(r, hoy); if (e === 'activo') o.activo++; if (e === 'prox') o.prox++;
    o.personas += Number(tbExtra_(r).n_personas) || 0;
  });
  const tipos = Object.keys(porTipo).sort(compararTipoRecurso_);   // orden de tipos del sistema
  const tiposSel = valoresSel_('tb-tipo');
  html += '<div class="tb-fila2 tb-graf-ancho"><div class="tb-card"><h3>🧩 Recursos por tipo</h3><p class="tb-sub">Clic en un tipo para filtrar el tablero · barra: activos (sólido) y por activar (tenue)</p><div class="tb-tipos">' +
    tipos.map(t => {
      const o = porTipo[t];
      return '<div class="tb-tipo' + (tiposSel.includes(t) ? ' sel' : '') + '" data-tb-tipo="' + esc(t) + '" style="--c:' + plColorTipo_(t) + '" title="' + esc(aTitulo_(t)) + '">' +
        tbIcono_(t, 36) + '<div class="tb-n">' + fmt(o.n) + '</div><div class="tb-nom">' + esc(aTitulo_(t)) + '</div>' +
        '<div class="tb-barra"><i style="width:' + (100 * o.activo / o.n) + '%"></i><i class="prox" style="width:' + (100 * o.prox / o.n) + '%"></i></div>' +
        '<div class="tb-det">' + o.activo + ' activos · ' + o.prox + ' por activar' + (o.personas ? '<br>' + o.personas + ' personas' : '') + '</div></div>';
    }).join('') + '</div></div>';

  // ── Gráfico de activación por quincena (barras apiladas por tipo + acumulado)
  const conFecha = lista.filter(r => r.fecha_inicio_operacion);
  let quincenas = [];
  if (conFecha.length) {
    const fechas = conFecha.map(r => String(r.fecha_inicio_operacion).slice(0, 10)).sort();
    // Desde la quincena actual si es anterior a la 1ª activación (referencia de "hoy"), hasta la última
    let q = tbQuincena_(hoy < fechas[0] ? hoy : fechas[0]); const ultima = tbQuincena_(fechas[fechas.length - 1]).key;
    for (let i = 0; i < 48; i++) { quincenas.push(q); if (q.key === ultima) break; q = tbQuincenaSiguiente_(q); }
  }
  const recPorQ = {}; quincenas.forEach(q => { recPorQ[q.key] = []; });
  conFecha.forEach(r => { const k = tbQuincena_(r.fecha_inicio_operacion).key; (recPorQ[k] = recPorQ[k] || []).push(r); });
  html += '<div class="tb-card"><h3>📈 Activación de recursos por quincena</h3><p class="tb-sub">Barras: recursos que inician operación en cada quincena, por tipo · línea verde: % acumulado de activación' +
    (lista.length - conFecha.length ? ' · ' + (lista.length - conFecha.length) + ' sin fecha de inicio' : '') + '</p><div class="tb-graf"><canvas id="tb-canvas"></canvas></div></div></div>';

  // ── Línea de tiempo (detalle por quincena)
  const qHoy = tbQuincena_(hoy).key;
  let acum = 0;
  html += '<div class="tb-card"><h3>🗓️ Línea de tiempo de activación</h3><p class="tb-sub">Cada columna es una quincena: cuántos recursos se activan y de qué tipo. Clic para ver el detalle. La quincena actual va en verde.</p><div class="tb-linea" id="tb-linea">' +
    quincenas.map(q => {
      const rs = recPorQ[q.key] || []; acum += rs.length;
      const t = {}; rs.forEach(r => { t[r.tipo_recurso] = (t[r.tipo_recurso] || 0) + 1; });
      const cls = 'tb-q' + (rs.length ? '' : ' vacia') + (q.key === qHoy ? ' hoy' : '') + (state.tb.quincena === q.key ? ' sel' : '');
      return '<div class="' + cls + '" data-tb-q="' + q.key + '" title="' + esc(q.largo) + '">' +
        '<div class="tb-q-head"><b>' + esc(q.label) + '</b><small>' + plFechaCorta_(q.ini) + ' al ' + plFechaCorta_(q.fin) + '</small>' +
          '<div class="tb-q-n">' + rs.length + '<em>recurso' + (rs.length === 1 ? '' : 's') + (rs.length ? ' · +' + tbPct_(rs.length, lista.length) : '') + '</em></div></div>' +
        '<div class="tb-q-cuerpo">' + Object.keys(t).sort((a, b) => t[b] - t[a]).map(k =>
          '<div class="tb-q-tipo">' + tbIcono_(k, 20) + '<span>' + esc(aTitulo_(k)) + '</span><span class="tb-x">×' + t[k] + '</span></div>').join('') + '</div>' +
        '<div class="tb-q-acum">Activación acumulada: <b class="pct">' + tbPct_(acum, lista.length) + '</b><br>' + acum + ' de ' + lista.length + ' recursos' +
          '<div class="tb-q-pct"><i style="width:' + (100 * acum / lista.length) + '%"></i></div></div></div>';
    }).join('') + '</div></div>';

  // ── Detalle (quincena elegida o todos)
  const qSel = state.tb.quincena ? quincenas.find(q => q.key === state.tb.quincena) : null;
  const detalle = (qSel ? (recPorQ[qSel.key] || []) : lista).slice()
    .sort((a, b) => String(a.fecha_inicio_operacion || '9').localeCompare(String(b.fecha_inicio_operacion || '9')) || String(a.codigo_ref).localeCompare(String(b.codigo_ref)));
  // ── Matriz área × tipo
  const subgs = [...new Set(lista.map(r => r.subgerencia || '—'))].sort();
  const celda = (rs, t) => { const n = rs.filter(r => r.tipo_recurso === t).length;
    return '<td class="cel" style="' + (n ? 'background:color-mix(in srgb,' + plColorTipo_(t) + ' ' + Math.min(55, 12 + n * 6) + '%,transparent);' : 'color:var(--text-tertiary);') + '">' + (n || '·') + '</td>'; };
  const filaArea = (nombre, rs, clase) => {
    const ini = rs.map(r => r.fecha_inicio_operacion).filter(Boolean).map(f => String(f).slice(0, 10)).sort();
    return '<tr' + (clase ? ' class="' + clase + '"' : '') + '><td>' + esc(nombre) + '</td>' + tipos.map(t => celda(rs, t)).join('') +
      '<td class="cel">' + rs.length + '</td><td class="cel pers">' + (rs.reduce((s, r) => s + (Number(tbExtra_(r).n_personas) || 0), 0) || '—') + '</td>' +
      '<td class="cel">' + rs.filter(r => tbEstado_(r, hoy) === 'activo').length + '</td>' +
      '<td>' + (ini.length ? plFechaCorta_(ini[0]) : '—') + '</td><td>' + (ini.length ? plFechaCorta_(ini[ini.length - 1]) : '—') + '</td></tr>';
  };
  html += '<div class="tb-fila2"><div class="tb-card"><h3>🗺️ Recursos por área y tipo</h3><p class="tb-sub">Subtotal por subgerencia · color más intenso = más recursos</p><div class="tb-scroll"><table class="tb-tabla"><thead><tr><th>Área</th>' +
    tipos.map(t => '<th title="' + esc(aTitulo_(t)) + '">' + tbIcono_(t, 24) + '</th>').join('') + '<th>Total</th><th>Personas</th><th>Activos</th><th>1ª activación</th><th>Última</th></tr></thead><tbody>' +
    subgs.map(s => {
      const rsS = lista.filter(r => (r.subgerencia || '—') === s);
      const areas = [...new Set(rsS.map(r => r.area))].sort((a, b) => String(a).localeCompare(String(b), 'es'));
      return filaArea('Subgerencia ' + s, rsS, 'tb-subg') + areas.map(a => filaArea(a, rsS.filter(r => r.area === a))).join('');
    }).join('') + (subgs.length > 1 ? filaArea('TOTAL', lista, 'tb-subg') : '') + '</tbody></table></div></div>';

  html += '<div class="tb-card" id="tb-detalle"><h3>📋 ' + (qSel ? 'Recursos que se activan en la ' + esc(qSel.largo) : 'Detalle de recursos') + '</h3><p class="tb-sub">' + detalle.length + ' recurso(s)' +
    (qSel ? ' · <a href="#" data-tb-q="' + qSel.key + '">ver todos</a>' : ' · elige una quincena en la línea de tiempo para acotar') + '</p><div class="tb-scroll"><table class="tb-tabla"><thead><tr>' +
    '<th>Código</th><th>Tipo</th><th>Área</th><th>Sector</th><th>Empresa</th><th>Inicio</th><th>Término</th><th>Estado</th></tr></thead><tbody>' +
    detalle.map(r => { const e = tbEstado_(r, hoy);
      return '<tr><td><b>📻 ' + esc(claveRecurso_(r) || '—') + '</b><br><small style="color:var(--text-tertiary);">' + esc(r.codigo_ref || '') + '</small></td><td style="text-align:left;"><span style="display:inline-flex;align-items:center;gap:6px;">' + tbIcono_(r.tipo_recurso, 20) + esc(aTitulo_(r.tipo_recurso || '—')) + '</span></td>' +
        '<td>' + esc(r.area || '—') + '</td><td>' + esc(r.sector || '—') + '</td><td>' + esc(r.empresa || '—') + '</td>' +
        '<td>' + plFechaCorta_(r.fecha_inicio_operacion) + '</td><td>' + plFechaCorta_(tbExtra_(r).fecha_termino_operacion) + '</td>' +
        '<td><span class="tb-estado ' + e + '">' + TB_ESTADOS[e] + '</span></td></tr>'; }).join('') +
    '</tbody></table></div></div></div>';

  cuerpo.innerHTML = html;
  // La línea de tiempo arranca en la quincena actual (o la elegida)
  const linea = document.getElementById('tb-linea');
  const foco = linea && (linea.querySelector('.tb-q.sel') || linea.querySelector('.tb-q.hoy'));
  if (foco) linea.scrollLeft = Math.max(0, foco.offsetLeft - linea.offsetLeft - 20);

  // Gráfico (Chart.js): barras apiladas por tipo + línea de acumulado
  const canvas = document.getElementById('tb-canvas');
  if (canvas && quincenas.length && window.Chart) {
    const oscuro = document.body.classList.contains('tema-oscuro');
    const txt = oscuro ? '#CBD5E1' : '#475569', grid = oscuro ? 'rgba(148,163,184,.15)' : 'rgba(15,23,42,.07)';
    let a = 0;
    // Activación acumulada en % del total de recursos (filtrados), con su etiqueta fija en cada punto
    const acumN = quincenas.map(q => (a += (recPorQ[q.key] || []).length));
    const acumulado = acumN.map(n => Math.round(1000 * n / lista.length) / 10);
    const colLinea = oscuro ? '#E2E8F0' : '#0F172A';
    const etiquetasPct = {
      id: 'tbEtiquetasPct',
      afterDatasetsDraw(chart) {
        const i = chart.data.datasets.length - 1, meta = chart.getDatasetMeta(i);
        if (!meta || meta.hidden) return;
        const ctx = chart.ctx; ctx.save();
        ctx.font = '700 11px Inter, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
        meta.data.forEach((pt, k) => {
          const v = chart.data.datasets[i].data[k];
          if (k > 0 && v === chart.data.datasets[i].data[k - 1]) return;   // sin cambio: no se repite
          const txt = (v > 0 && v < 10 ? v.toLocaleString('es-CL') : Math.round(v)) + '%';
          const w = ctx.measureText(txt).width + 8, x = pt.x, y = pt.y - 8;
          ctx.fillStyle = oscuro ? 'rgba(15,23,42,.92)' : 'rgba(255,255,255,.95)';
          ctx.strokeStyle = '#16A34A'; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x - w / 2, y - 16, w, 16, 6) : ctx.rect(x - w / 2, y - 16, w, 16); ctx.fill(); ctx.stroke();
          ctx.fillStyle = '#16A34A'; ctx.fillText(txt, x, y - 2);
        });
        ctx.restore();
      },
    };
    state.tb.grafico = new Chart(canvas, {
      plugins: [etiquetasPct],
      data: {
        labels: quincenas.map(q => q.label),
        datasets: tipos.map(t => ({
          type: 'bar', label: aTitulo_(t), stack: 'q', backgroundColor: plColorTipo_(t), borderRadius: 3, yAxisID: 'y',
          data: quincenas.map(q => (recPorQ[q.key] || []).filter(r => r.tipo_recurso === t).length),
        })).concat([{ type: 'line', label: 'Activación acumulada (%)', data: acumulado, yAxisID: 'y2', borderColor: '#16A34A',
          backgroundColor: '#16A34A', borderWidth: 2.5, pointRadius: 4, pointBackgroundColor: colLinea, tension: 0.25, borderDash: [5, 4] }]),
      },
      options: {
        responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { position: 'bottom', labels: { color: txt, boxWidth: 12, font: { size: 11 } } },
          tooltip: { callbacks: {
            label: (it) => it.dataset.type === 'line' ? ' Activación acumulada: ' + it.parsed.y.toLocaleString('es-CL') + '% (' + acumN[it.dataIndex] + ' de ' + lista.length + ')'
                                                      : ' ' + it.dataset.label + ': ' + it.parsed.y,
            footer: (items) => 'Se activan: ' + items.filter(i => i.dataset.type === 'bar').reduce((s, i) => s + i.parsed.y, 0) } },
        },
        layout: { padding: { top: 22 } },
        scales: {
          x: { stacked: true, ticks: { color: txt, font: { size: 11 } }, grid: { display: false } },
          y: { stacked: true, beginAtZero: true, title: { display: true, text: 'Recursos que se activan', color: txt }, ticks: { color: txt, precision: 0 }, grid: { color: grid } },
          y2: { position: 'right', min: 0, max: 100, title: { display: true, text: 'Activación acumulada', color: txt },
                ticks: { color: txt, callback: v => v + '%' }, grid: { display: false } },
        },
        onClick: (ev, els) => {
          if (!els.length) return;
          const q = quincenas[els[0].index];
          state.tb.quincena = state.tb.quincena === q.key ? null : q.key; renderTablero_();
          if (state.tb.quincena) tbIrAlDetalle_();
        },
      },
    });
  }
}

/** Descarga a Excel (.xlsx con SheetJS, cargado al usarlo): recursos filtrados + resúmenes. */
let tbSheetJsPromesa_ = null;
function tbCargarSheetJs_() {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  if (!tbSheetJsPromesa_) tbSheetJsPromesa_ = new Promise((ok, mal) => {
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
    s.onload = () => ok(window.XLSX); s.onerror = () => { tbSheetJsPromesa_ = null; mal(new Error('No se pudo cargar la librería de Excel')); };
    document.head.appendChild(s);
  });
  return tbSheetJsPromesa_;
}
async function descargarTablero_() {
  const lista = tbFiltrados_();
  if (!lista.length) { mostrarToast_('No hay recursos para descargar con estos filtros.'); return; }
  const hoy = tbHoyISO_();
  const f = v => v ? String(v).slice(0, 10) : '';
  const filas = lista.slice().sort((a, b) => String(a.area).localeCompare(String(b.area), 'es') || compararTipoRecurso_(a.tipo_recurso, b.tipo_recurso) ||
      String(claveRecurso_(a) || '').localeCompare(String(claveRecurso_(b) || ''), 'es', { numeric: true }))
    .map(r => { const x = tbExtra_(r), rn = plRutaNormal_(r); return {
      'Clave radial': claveRecurso_(r) || '', 'Código (ID_BG)': r.codigo_ref || '', 'Tipo de recurso': r.tipo_recurso || '', 'COD recurso': r.cod_recurso ?? '',
      'Subgerencia': r.subgerencia || '', 'ID área': r.id_area ?? '', 'Área': r.area || '', 'ID sector': r.id_sector ?? '', 'Sector': r.sector || '',
      'Empresa (EESS)': r.empresa || '', 'Tipo de móvil': r.tipo_movil || '', 'Turno': r.actividad || '', 'Horario': x.horario || '',
      'N° personas': x.n_personas ?? '', 'Fecha inicio': f(r.fecha_inicio_operacion), 'Quincena de inicio': r.fecha_inicio_operacion ? tbQuincena_(r.fecha_inicio_operacion).label : '',
      'Fecha término': f(x.fecha_termino_operacion), 'Estado hoy': TB_ESTADOS[tbEstado_(r, hoy)].replace(/^\S+\s/, ''), 'Trabajo actual': x.trabajo_actual || '',
      'Clave / alias': r.alias || '', 'Nombre de ruta': r.nombre_ruta || '', 'Ruta (escenario Normal)': rn ? (rn.descripcion || 'Asignada') : '', 'Km ruta Normal': rn && rn.km != null ? rn.km : '',
      'Zona de alerta': r.zona_alerta || '', 'Región': r.region_corma || '', 'Provincia': r.provincia_corma || '', 'ID comuna': r.id_comuna ?? '', 'Comuna': r.comuna || '',
      'Latitud': r.lat ?? '', 'Longitud': r.lng ?? '', 'UTM X (18S)': r.coord_x != null ? Math.round(r.coord_x) : '', 'UTM Y (18S)': r.coord_y != null ? Math.round(r.coord_y) : '',
      'Temporada': r.temporada || '', 'OBJECTID': r.objectid ?? '' }; });
  // Resumen por quincena y por área × tipo
  const porQ = {};
  lista.filter(r => r.fecha_inicio_operacion).forEach(r => { const q = tbQuincena_(r.fecha_inicio_operacion);
    const o = porQ[q.key] = porQ[q.key] || { 'Quincena': q.label, 'Desde': q.ini, 'Hasta': q.fin, 'Recursos que se activan': 0 };
    o['Recursos que se activan']++; o[r.tipo_recurso] = (o[r.tipo_recurso] || 0) + 1; });
  let acum = 0;
  const resQ = Object.keys(porQ).sort().map(k => { acum += porQ[k]['Recursos que se activan']; return Object.assign(porQ[k], { 'Acumulado': acum }); });
  const tipos = [...new Set(lista.map(r => r.tipo_recurso))].sort(compararTipoRecurso_);
  const areas = [...new Set(lista.map(r => (r.subgerencia || '') + '|' + r.area))].sort();
  const resA = areas.map(k => { const [s, a] = k.split('|'); const rs = lista.filter(r => (r.subgerencia || '') === s && r.area === a);
    const o = { 'Subgerencia': s, 'Área': a }; tipos.forEach(t => { o[t] = rs.filter(r => r.tipo_recurso === t).length; });
    o['Total'] = rs.length; o['Personas'] = rs.reduce((x, r) => x + (Number(tbExtra_(r).n_personas) || 0), 0);
    o['Activos hoy'] = rs.filter(r => tbEstado_(r, hoy) === 'activo').length; return o; });
  const nombre = 'recursos_' + hoy + (document.getElementById('tb-area').value ? '_' + document.getElementById('tb-area').value.replace(/\s+/g, '_') : '');
  try {
    mostrarToast_('Generando Excel…');
    const XLSX = await tbCargarSheetJs_();
    const wb = XLSX.utils.book_new();
    const hoja = (datos, nom, anchos) => { const ws = XLSX.utils.json_to_sheet(datos); if (anchos) ws['!cols'] = anchos; XLSX.utils.book_append_sheet(wb, ws, nom); };
    hoja(filas, 'Recursos', Object.keys(filas[0]).map(k => ({ wch: Math.max(10, Math.min(34, k.length + 4)) })));
    if (resQ.length) hoja(resQ, 'Activación por quincena');
    hoja(resA, 'Por área y tipo');
    XLSX.writeFile(wb, nombre + '.xlsx');
    mostrarToast_('✅ Descargado: ' + filas.length + ' recursos.');
  } catch (e) {
    // Respaldo sin librería: CSV (Excel lo abre directamente)
    const cols = Object.keys(filas[0]);
    const csv = '﻿' + [cols.join(';')].concat(filas.map(fl => cols.map(c => '"' + String(fl[c]).replace(/"/g, '""') + '"').join(';'))).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = nombre + '.csv'; a.click(); URL.revokeObjectURL(url);
    mostrarToast_('Excel no disponible (' + e.message + '): se descargó en CSV.');
  }
}

/* ==================== GESTIÓN DE RECURSOS (Planificador CMPC ▾, 12-10-2026, SQL 92) ====================
 * Tabla de datos de cada recurso + contacto (nombre de la persona, RUT, teléfono, mail).
 *   · Jefe de Área: edita directo en la tabla los recursos de SUS áreas (RPC actualizar_datos_recurso).
 *   · Administrador: todo lo anterior + carga masiva subiendo el Excel descargado
 *     (RPC actualizar_recursos_masivo; se cruza por el ID, que nunca se modifica).
 * El contacto vive en recurso_contacto (RLS: solo Admin y Jefe del área lo leen).
 * Desde 02-11-2026 (SQL 147) el contacto = TITULAR de 👥 Personas (recurso_personas): se edita en ese botón. */
const GR_COLS = [
  { k: 'alias', t: 'Clave radial', ed: true, w: 90 },
  { k: 'codigo_ref', t: 'ID', lock: true },
  { k: 'tipo_recurso', t: 'Tipo de recurso', ed: true, w: 170, lista: 'gr-tipos' },
  { k: 'subgerencia', t: 'Subgerencia' },
  { k: 'area', t: 'Área' },
  { k: 'sector', t: 'Sector', ed: true, w: 120 },
  { k: 'zona_alerta', t: 'Zona de alerta' },   // calculada por el punto del recurso (SQL 126), no se edita
  // 02-11-2026 (SQL 147): el contacto es el TITULAR de 👥 Personas (un trigger lo copia); se edita en ese botón, no en la tabla
  { k: 'nombre_persona', t: 'Titular', c: true, w: 190 },
  { k: 'rut', t: 'RUT titular', c: true, w: 110, tipo: 'rut' },
  { k: 'telefono', t: 'Teléfono titular', c: true, w: 120, tipo: 'tel' },
  { k: 'mail', t: 'Mail titular', c: true, w: 190, tipo: 'mail' },
  { k: 'empresa', t: 'Empresa (EESS)', ed: true, w: 140 },
  { k: 'tipo_movil', t: 'Tipo de móvil', ed: true, w: 110 },
  { k: 'actividad', t: 'Turno', ed: true, w: 90 },
  { k: 'horario', t: 'Horario', ed: true, w: 110 },
  { k: 'n_personas', t: 'N° personas', ed: true, w: 60, tipo: 'num' },
  { k: 'fecha_inicio_operacion', t: 'Fecha inicio', ed: true, w: 125, tipo: 'fecha' },
  { k: 'fecha_termino_operacion', t: 'Fecha término', ed: true, w: 125, tipo: 'fecha' },
  { k: 'trabajo_actual', t: 'Trabajo actual', ed: true, w: 180 },
];
const GR_CONTACTO = ['nombre_persona', 'rut', 'telefono', 'mail'];
state.gr = { recursos: [], cambios: {}, errores: {}, listeners: false, sinSql92: false, carga: null,
  empresas: null,          // [{ id, nombre, activo, areas: [...] }] (SQL 100) o null si no está
  personas: {},            // { recurso_id: [{ id, nombre, rut, cargo, titular }] } (SQL 147)
  sinSql147: false,
  colsOcultas: new Set() };
// Columnas ocultas: preferencia de cada usuario en este navegador (la Clave radial siempre se ve)
const GR_COLS_KEY = 'gr-cols-ocultas';
try { state.gr.colsOcultas = new Set(JSON.parse(localStorage.getItem(GR_COLS_KEY) || '[]')); } catch (e) { /* sin almacenamiento */ }
function grColsVisibles_() { return GR_COLS.filter((c, i) => i === 0 || !state.gr.colsOcultas.has(c.k)); }
function grGuardarCols_() { try { localStorage.setItem(GR_COLS_KEY, JSON.stringify([...state.gr.colsOcultas])); } catch (e) { /* sin almacenamiento */ } }
/** Empresas activas que trabajan en el área (comparación sin tildes); null si no hay catálogo (SQL 100). */
function grEmpresasDeArea_(area) {
  if (!state.gr.empresas) return null;
  const k = plNorm_(area);
  return state.gr.empresas.filter(e => e.activo && e.areas.some(a => plNorm_(a) === k))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
}
async function cargarEmpresasGestion_() {
  const [e1, e2] = await Promise.all([
    supabaseClient.from('empresas').select('id, nombre, activo').order('nombre'),
    supabaseClient.from('empresa_areas').select('empresa_id, area'),
  ]);
  if (e1.error || e2.error) { state.gr.empresas = null; return; }   // sin el SQL 100: Empresa sigue como texto libre
  const areas = {};
  (e2.data || []).forEach(x => { (areas[x.empresa_id] = areas[x.empresa_id] || []).push(x.area); });
  state.gr.empresas = (e1.data || []).map(e => Object.assign({}, e, { areas: areas[e.id] || [] }));
}

function puedeGestionRecursos_() {
  return !!state.perfil && (state.perfil.perfil === 'Administrador' || esJefeAreaPerfil_(state.perfil.perfil)) &&
    puedeVerModulo_('planificador_grafico');
}
function grEsAdmin_() { return esAdminOJefe_(); }   // 17-10-2026: Jefe de Área = Administrador (nuevo recurso, Excel, empresas)
function grPuedeEditar_(r) { return plPuedeEditar_(r); }
function grCodigo_(s) { return String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); }

/* ── Normalización y validación de valores (tabla y Excel) ── */
function grRut_(s) {
  const t = String(s || '').toUpperCase().replace(/[^0-9K]/g, '');
  if (!t) return { ok: true, v: '' };
  if (t.length < 2 || !/^\d+[0-9K]$/.test(t)) return { ok: false, v: String(s).trim(), msg: 'RUT con formato inválido' };
  const cuerpo = t.slice(0, -1), dv = t.slice(-1);
  let suma = 0, mul = 2;
  for (let i = cuerpo.length - 1; i >= 0; i--) { suma += Number(cuerpo[i]) * mul; mul = mul === 7 ? 2 : mul + 1; }
  const res = 11 - (suma % 11), esperado = res === 11 ? '0' : res === 10 ? 'K' : String(res);
  const v = cuerpo.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + '-' + dv;
  return dv === esperado ? { ok: true, v } : { ok: false, v, msg: 'RUT con dígito verificador incorrecto (debería ser ' + esperado + ')' };
}
function grFechaISO_(v) {
  if (v == null || v === '') return '';
  if (v instanceof Date && !isNaN(v)) { const d = new Date(v.getTime() + 12 * 3600e3); return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0') + '-' + String(d.getUTCDate()).padStart(2, '0'); }
  if (typeof v === 'number' && v > 20000 && v < 80000) { const d = new Date(Math.round((v - 25569) * 86400e3)); return d.toISOString().slice(0, 10); }
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return m[1] + '-' + m[2].padStart(2, '0') + '-' + m[3].padStart(2, '0');
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (m) return m[3] + '-' + m[2].padStart(2, '0') + '-' + m[1].padStart(2, '0');
  return null;   // no reconocida
}
/** Devuelve { ok, v, msg } con el valor normalizado del campo. */
function grNormalizar_(col, valor) {
  const s = valor == null ? '' : (valor instanceof Date ? valor : String(valor).trim());
  switch (col.tipo) {
    case 'rut': return grRut_(s);
    case 'mail': { const v = String(s).toLowerCase(); return (!v || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) ? { ok: true, v } : { ok: false, v, msg: 'Mail inválido' }; }
    case 'tel': {
      const v = String(s).replace(/\s+/g, ' ');
      const dig = v.replace(/\D/g, '');
      return (!v || dig.length >= 8) ? { ok: true, v } : { ok: false, v, msg: 'Teléfono con menos de 8 dígitos' };
    }
    case 'num': {
      if (s === '') return { ok: true, v: '' };
      const n = Number(String(s).replace(',', '.'));
      return Number.isInteger(n) && n >= 0 ? { ok: true, v: String(n) } : { ok: false, v: String(s), msg: 'N° de personas debe ser un entero' };
    }
    case 'fecha': { const v = grFechaISO_(s); return v === null ? { ok: false, v: String(s), msg: 'Fecha no reconocida (use AAAA-MM-DD o DD-MM-AAAA)' } : { ok: true, v }; }
    default: return { ok: true, v: String(s) };
  }
}
function grValorActual_(r, k) {
  const v = r[k];
  if (v == null) return '';
  if (k.startsWith('fecha_')) return String(v).slice(0, 10);
  return String(v).trim();
}
function grValor_(r, k) {   // valor mostrado: cambio pendiente o el guardado
  const c = state.gr.cambios[r.id];
  return c && k in c ? c[k] : grValorActual_(r, k);
}

/* ── Carga ── */
async function abrirGestionRecursos_(forzar) {
  if (!state.gr.listeners) { state.gr.listeners = true; iniciarListenersGestion_(); }
  if (state.gr.recursos.length && !forzar) { renderGestion_(); return; }
  if (forzar && Object.keys(state.gr.cambios).length &&
      !confirm('Hay cambios sin guardar en Gestión de Recursos. ¿Descartarlos y recargar?')) return;
  const est = document.getElementById('gr-estado');
  est.textContent = 'Cargando…';
  try {
    await cargarTiposRecurso_();
    const cols = 'id, codigo_ref, alias, tipo_recurso, id_subg, subgerencia, id_area, area_nombre, sector, empresa, tipo_movil, actividad, ' +
      'horario, n_personas, fecha_inicio_operacion, fecha_termino_operacion, trabajo_actual, comuna_corma, zona_alerta';
    const filas = [];
    for (let d = 0; ; d += 1000) {
      const { data, error } = await supabaseClient.from('referencia_recursos').select(cols).order('codigo_ref').range(d, d + 999);
      if (error) throw error;
      filas.push(...(data || []));
      if (!data || data.length < 1000) break;
    }
    // Recursos con ruta asignada (línea del escenario Normal, SQL 79, o recurso_rutas): no se pueden eliminar
    state.gr.conRuta = new Set();
    try {
      const [rn, rr] = await Promise.all([
        supabaseClient.from('v_recurso_ruta_normal').select('recurso_id'),
        supabaseClient.from('recurso_rutas').select('recurso_id'),
      ]);
      (rn.data || []).concat(rr.data || []).forEach(x => state.gr.conRuta.add(String(x.recurso_id)));
    } catch (e) { /* sin las vistas: la base igual bloquea (SQL 97) */ }
    try { await cargarEmpresasGestion_(); } catch (e) { state.gr.empresas = null; }
    const contactos = {};
    state.gr.sinSql92 = false;
    const { data: cs, error: ec } = await supabaseClient.from('recurso_contacto').select('recurso_id, nombre_persona, rut, telefono, mail, actualizado_en');
    if (ec) { state.gr.sinSql92 = true; console.warn('Gestión de Recursos: recurso_contacto no disponible (¿falta el SQL 92?):', ec.message); }
    else (cs || []).forEach(c => { contactos[c.recurso_id] = c; });
    await cargarPersonasGestion_();
    const esAdmin = grEsAdmin_();
    const mias = (state.misAreasIds || []).map(plNorm_);
    state.gr.recursos = filas
      .map(r => Object.assign({}, r, { area: r.area_nombre || '', comuna: r.comuna_corma || '' },
        GR_CONTACTO.reduce((o, k) => { o[k] = contactos[r.id] ? contactos[r.id][k] : null; return o; }, {}),
        { contacto_en: contactos[r.id] ? contactos[r.id].actualizado_en : null }))
      .filter(r => esAdmin || mias.includes(plNorm_(r.area)))
      .sort((a, b) => String(a.area).localeCompare(String(b.area), 'es') || compararTipoRecurso_(a.tipo_recurso, b.tipo_recurso) ||
        String(claveRecurso_(a) || '').localeCompare(String(claveRecurso_(b) || ''), 'es', { numeric: true }));
    state.gr.cambios = {}; state.gr.errores = {};
  } catch (e) {
    est.textContent = 'Error al cargar';
    mostrarToast_('No se pudo cargar Gestión de Recursos: ' + (e.message || e));
    return;
  }
  document.getElementById('gr-tipos').innerHTML = (state.tiposRecursoCatalogo || [])
    .map(t => '<option value="' + escapeHtml_(t.nombre) + '">').join('');
  document.getElementById('gr-subir').style.display = grEsAdmin_() ? '' : 'none';
  document.getElementById('gr-empresas').style.display = grEsAdmin_() ? '' : 'none';
  poblarFiltrosGestion_();
  renderGestion_();
}

function poblarFiltrosGestion_() {
  const rs = state.gr.recursos;
  const selS = document.getElementById('gr-subg'), selA = document.getElementById('gr-area');
  const vS = selS.value, vA = selA.value;
  const subgs = [...new Set(rs.map(r => r.subgerencia).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
  selS.innerHTML = '<option value="">Todas las subgerencias</option>' + subgs.map(s => '<option>' + escapeHtml_(s) + '</option>').join('');
  selS.value = subgs.includes(vS) ? vS : '';
  const areas = [...new Set(rs.filter(r => !selS.value || r.subgerencia === selS.value).map(r => r.area).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
  selA.innerHTML = '<option value="">Todas las áreas</option>' + areas.map(a => '<option>' + escapeHtml_(a) + '</option>').join('');
  selA.value = areas.includes(vA) ? vA : (areas.length === 1 ? areas[0] : '');
  // Sector: los de la subgerencia / área elegidas (con su cantidad de recursos)
  // 22-10-2026: sector, tipo y empresa admiten VARIOS valores (selMultiple_, js/01). Lo elegido que ya no está se descarta solo.
  const selSe = document.getElementById('gr-sector');
  const enAlcance = rs.filter(r => (!selS.value || r.subgerencia === selS.value) && (!selA.value || r.area === selA.value));
  const cuenta = {}; enAlcance.forEach(r => { const s = r.sector || ''; if (s) cuenta[s] = (cuenta[s] || 0) + 1; });
  const sectores = Object.keys(cuenta).sort((a, b) => a.localeCompare(b, 'es'));
  const sinSector = enAlcance.filter(r => !r.sector).length;
  selSe.innerHTML = '<option value="">Todos los sectores (' + sectores.length + ')</option>' +
    sectores.map(s => '<option value="' + escapeHtml_(s) + '">' + escapeHtml_(s) + ' (' + cuenta[s] + ')</option>').join('') +
    (sinSector ? '<option value="__sin__">— Sin sector (' + sinSector + ')</option>' : '');
  actualizarSel_(selSe);
  // Tipo de recurso: los de la subgerencia / área / sector(es) elegidos (con su cantidad)
  const selT = document.getElementById('gr-tipo');
  const enSector = enAlcance.filter(r => grPasaConSin_('gr-sector', r.sector));
  const porTipo = {}; enSector.forEach(r => { const t = r.tipo_recurso || ''; if (t) porTipo[t] = (porTipo[t] || 0) + 1; });
  const tipos = Object.keys(porTipo).sort(compararTipoRecurso_);
  selT.innerHTML = '<option value="">Todos los tipos (' + tipos.length + ')</option>' +
    tipos.map(t => '<option value="' + escapeHtml_(t) + '">' + escapeHtml_(aTitulo_(t)) + ' (' + porTipo[t] + ')</option>').join('');
  actualizarSel_(selT);
  // Empresa: las de la subgerencia / área / sector(es) / tipo(s) elegidos (con su cantidad)
  const selE = document.getElementById('gr-empresa');
  const enTipo = enSector.filter(r => pasaSel_('gr-tipo', r.tipo_recurso));
  const porEmp = {}; enTipo.forEach(r => { const e = (r.empresa || '').trim(); if (e) porEmp[e] = (porEmp[e] || 0) + 1; });
  const emps = Object.keys(porEmp).sort((a, b) => a.localeCompare(b, 'es'));
  const sinEmp = enTipo.filter(r => !(r.empresa || '').trim()).length;
  selE.innerHTML = '<option value="">Todas las empresas (' + emps.length + ')</option>' +
    emps.map(e => '<option value="' + escapeHtml_(e) + '">' + escapeHtml_(e) + ' (' + porEmp[e] + ')</option>').join('') +
    (sinEmp ? '<option value="__sin__">— Sin empresa (' + sinEmp + ')</option>' : '');
  actualizarSel_(selE);
}
/** Filtro múltiple con la opción «— Sin …» (__sin__): pasa si no hay nada elegido, si se eligió su valor o si va vacío y se eligió «Sin». */
function grPasaConSin_(id, v) {
  const vs = valoresSel_(id); v = (v || '').trim();
  return !vs.length || (v ? vs.includes(v) : vs.includes('__sin__'));
}

function grContactoCompleto_(r) { return GR_CONTACTO.every(k => grValor_(r, k) !== ''); }
function grFiltrados_() {
  const q = normalizarBusqueda_(document.getElementById('gr-buscar').value || '');
  const fS = document.getElementById('gr-subg').value, fA = document.getElementById('gr-area').value;
  const fC = document.getElementById('gr-contacto').value;
  return state.gr.recursos.filter(r => {
    if (!pasaSel_('gr-tipo', r.tipo_recurso)) return false;         // tipo(s) guardado(s) del recurso
    if (!grPasaConSin_('gr-empresa', r.empresa)) return false;      // empresa(s), o «Sin empresa»
    if (fS && r.subgerencia !== fS) return false;
    if (fA && r.area !== fA) return false;
    if (!grPasaConSin_('gr-sector', r.sector)) return false;        // sector(es), o «Sin sector»
    if (fC === 'completo' && !grContactoCompleto_(r)) return false;
    if (fC === 'incompleto' && grContactoCompleto_(r)) return false;
    if (fC === 'modificado' && !state.gr.cambios[r.id]) return false;
    if (fC === 'pers_completo' && grEstadoPersonas_(r) !== 'ok') return false;
    if (fC === 'pers_incompleto' && grEstadoPersonas_(r) === 'ok') return false;
    if (fC === 'pers_sin_titular' && (state.gr.personas[r.id] || []).some(p => p.titular)) return false;
    if (q) {
      const txt = normalizarBusqueda_([claveRecurso_(r), r.codigo_ref, r.tipo_recurso, r.sector, r.empresa,
        grValor_(r, 'nombre_persona'), grValor_(r, 'rut'), grValor_(r, 'telefono'), grValor_(r, 'mail')]
        .concat((state.gr.personas[r.id] || []).map(p => p.nombre + ' ' + p.rut)).join(' '));
      if (!txt.includes(q)) return false;
    }
    return true;
  });
}

/* ── Render ── */
/** «➕ Nuevo recurso»: solo Administrador y solo con un área elegida (SQL 95). */
function grActualizarNuevo_() {
  const b = document.getElementById('gr-nuevo'); if (!b) return;
  b.style.display = grEsAdmin_() ? '' : 'none';
  const area = document.getElementById('gr-area').value;
  b.disabled = !area || state.gr.sinSql92;
  b.title = area ? 'Agregar un recurso que falte en ' + area : 'Elige primero un área de relacionamiento para agregar un recurso';
  b.style.opacity = b.disabled ? '.5' : '';
}
function renderGestion_() {
  grActualizarNuevo_();
  const lista = grFiltrados_();
  const todos = state.gr.recursos;
  const nCamb = Object.keys(state.gr.cambios).length;
  const completos = lista.filter(grContactoCompleto_).length;
  const kpi = (n, t, c) => '<div class="gr-kpi" style="--c:' + c + '"><b>' + n + '</b>' + t + '</div>';
  document.getElementById('gr-kpis').innerHTML =
    kpi(lista.length, 'recursos' + (lista.length !== todos.length ? ' (de ' + todos.length + ')' : ''), '#2563EB') +
    kpi(completos, 'con contacto completo', '#16A34A') +
    kpi(lista.length - completos, 'con contacto incompleto', '#DC2626') +
    kpi(lista.reduce((s, r) => s + (Number(grValor_(r, 'n_personas')) || 0), 0), '👥 personas', '#7C3AED') +
    (nCamb ? kpi(nCamb, 'con cambios sin guardar', '#7C3AED') : '') +
    grKpiPersonasHtml_(lista);
  const aviso = document.getElementById('gr-aviso');
  aviso.style.display = state.gr.sinSql92 ? '' : 'none';
  if (state.gr.sinSql92) aviso.textContent = '⚠️ Falta ejecutar en Supabase el SQL 92 (sql/pendientes/92_gestion_recursos_contacto.sql): por ahora no se pueden guardar cambios ni ver los datos de contacto.';
  document.getElementById('gr-estado').textContent = grEsAdmin_() ? 'Administrador · edición directa y carga masiva' : 'Edición directa de tus áreas';
  document.getElementById('gr-guardar').style.display = nCamb ? '' : 'none';
  document.getElementById('gr-guardar').textContent = '💾 Guardar cambios (' + nCamb + ')';
  document.getElementById('gr-descartar').style.display = nCamb ? '' : 'none';

  const cont = document.getElementById('gr-tabla');
  if (!lista.length) { cont.innerHTML = '<div class="tb-vacio">No hay recursos con estos filtros.</div>'; return; }
  const cols = grColsVisibles_();
  const cab = '<tr>' + cols.map((c, i) => '<th class="' + (i === 0 ? 'gr-fijo ' : '') + (c.c ? 'gr-th-contacto' : '') + '">' +
    (c.lock ? '🔒 ' : c.c ? '👤 ' : '') + escapeHtml_(c.t) + (i === 0 ? ' · 👥' : '') + '</th>').join('') +
    '<th>Contacto</th><th title="Eliminar recurso (solo si no tiene rutas)"></th></tr>';
  const cuerpo = lista.map(r => {
    const editable = grPuedeEditar_(r) && !state.gr.sinSql92;
    const camb = state.gr.cambios[r.id] || {}, errs = state.gr.errores[r.id] || {};
    const celdas = cols.map((c, i) => {
      const v = grValor_(r, c.k);
      const fijo = i === 0 ? ' gr-fijo' : '';
      if (c.lock) return '<td class="gr-lock' + fijo + '" title="El ID no se modifica">' + escapeHtml_(v || '—') + '</td>';
      if (!c.ed) return '<td class="gr-ro' + fijo + '">' + escapeHtml_(v || '—') + '</td>';
      const cls = 'gr-in' + (c.k in camb ? ' gr-mod' : '') + (errs[c.k] ? ' gr-error' : '') + (c.k === 'alias' ? ' gr-clave' : '');
      // Empresa: desplegable con las empresas que trabajan en el área del recurso (catálogo 🏢, SQL 100)
      const empsArea = c.k === 'empresa' ? grEmpresasDeArea_(r.area) : null;
      if (empsArea) {
        const nombres = empsArea.map(e => e.nombre);
        const fuera = v && !nombres.some(n => n.toUpperCase() === v.toUpperCase());
        return '<td><select class="' + cls + '" style="--w:' + (c.w || 110) + 'px" data-gr-id="' + escapeHtml_(String(r.id)) + '" data-gr-k="empresa"' +
          (editable ? '' : ' disabled') + (fuera ? ' title="Esta empresa no está asignada al área ' + escapeHtml_(r.area) + ' en 🏢 Empresas"' : '') + '>' +
          '<option value="">— Sin empresa —</option>' +
          (fuera ? '<option value="' + escapeHtml_(v) + '" selected>⚠️ ' + escapeHtml_(v) + ' (no asignada al área)</option>' : '') +
          nombres.map(n => '<option value="' + escapeHtml_(n) + '"' + (!fuera && v && n.toUpperCase() === v.toUpperCase() ? ' selected' : '') + '>' + escapeHtml_(n) + '</option>').join('') +
          '</select></td>';
      }
      const tipo = c.tipo === 'fecha' ? 'date' : c.tipo === 'num' ? 'number' : c.tipo === 'mail' ? 'email' : c.tipo === 'tel' ? 'tel' : 'text';
      const input = '<input class="' + cls + '" type="' + tipo + '" style="--w:' + (c.w || 110) + 'px"' +
        ' data-gr-id="' + escapeHtml_(String(r.id)) + '" data-gr-k="' + c.k + '" value="' + escapeHtml_(v) + '"' +
        (c.lista ? ' list="' + c.lista + '"' : '') + (c.tipo === 'num' ? ' min="0" step="1"' : '') +
        (errs[c.k] ? ' title="' + escapeHtml_(errs[c.k]) + '"' : '') + (editable ? '' : ' readonly tabindex="-1"') + '>';
      // 👥 Personas va junto a la Clave radial (columna fija)
      return '<td class="' + fijo.trim() + '">' + (i === 0 ? '<div class="gr-clave-cel">' + input + grBotonPersonas_(r) + '</div>' : input) + '</td>';
    }).join('');
    const ok = grContactoCompleto_(r);
    // 🗑️ Eliminar: solo quien puede editar el recurso, y nunca si tiene rutas asignadas
    const conRuta = !!(state.gr.conRuta && state.gr.conRuta.has(String(r.id)));
    const btnEliminar = !editable ? ''
      : conRuta ? '<button class="gr-del" disabled title="Tiene ruta asignada: no se puede eliminar">🔒</button>'
      : '<button class="gr-del" data-gr-eliminar="' + escapeHtml_(String(r.id)) + '" title="Eliminar este recurso (doble confirmación)">🗑️</button>';
    return '<tr>' + celdas + '<td><span class="gr-pill ' + (ok ? 'ok' : 'no') + '">' + (ok ? 'Completo' : 'Incompleto') + '</span></td><td>' + btnEliminar + '</td></tr>';
  }).join('');
  const scroll = cont.querySelector('.gr-tabla') ? [cont.scrollTop, cont.scrollLeft] : null;
  cont.innerHTML = '<table class="gr-tabla"><thead>' + cab + '</thead><tbody>' + cuerpo + '</tbody></table>';
  if (scroll) { cont.scrollTop = scroll[0]; cont.scrollLeft = scroll[1]; }
}

/* ── 🧩 Columnas visibles (preferencia por navegador; la Clave radial siempre se ve) ── */
function renderColsGestion_() {
  const pop = document.getElementById('gr-cols-pop');
  const vis = GR_COLS.length - GR_COLS.filter((c, i) => i > 0 && state.gr.colsOcultas.has(c.k)).length;
  pop.innerHTML = '<div style="font-weight:700;margin:0 0 6px 4px;">Columnas visibles (' + vis + ' de ' + GR_COLS.length + ')</div>' +
    '<div class="gr-cols-acc"><button data-gr-cols="todas">Todas</button><button data-gr-cols="contacto">👤 Contacto</button><button data-gr-cols="operacion">⚙️ Operación</button></div>' +
    GR_COLS.map((c, i) => '<label class="' + (i === 0 ? 'fijo' : '') + '"><input type="checkbox" data-gr-col="' + c.k + '"' +
      (i === 0 || !state.gr.colsOcultas.has(c.k) ? ' checked' : '') + (i === 0 ? ' disabled' : '') + '>' +
      (c.lock ? '🔒 ' : c.c ? '👤 ' : '') + escapeHtml_(c.t) + (i === 0 ? ' <small>(siempre)</small>' : '') + '</label>').join('');
}

/* ── 🏢 Empresas (solo Administrador; SQL 100): catálogo y áreas donde trabaja cada una ── */
function grAreasConocidas_() {
  const m = new Map();
  const add = a => { if (a && !m.has(plNorm_(a))) m.set(plNorm_(a), a); };
  state.gr.recursos.forEach(r => add(r.area));
  (state.gr.empresas || []).forEach(e => e.areas.forEach(add));
  return [...m.values()].sort((a, b) => a.localeCompare(b, 'es'));
}
async function abrirEmpresasGestion_() {
  if (!grEsAdmin_()) { mostrarToast_('Solo el Administrador o el Jefe de Área administran las empresas.'); return; }
  document.getElementById('gr-cols-pop').style.display = 'none';
  await cargarEmpresasGestion_();
  if (!state.gr.empresas) { mostrarToast_('⚠️ Falta ejecutar en Supabase el SQL 100 (sql/pendientes/100_empresas_por_area.sql).'); return; }
  let m = document.getElementById('emp-modal');
  if (!m) {
    m = document.createElement('div'); m.id = 'emp-modal'; m.className = 'gr-modal';
    m.innerHTML = '<div class="gr-modal-caja" style="width:min(1100px,96vw);"><div class="gr-modal-cab"><b>🏢 Empresas y áreas de relacionamiento</b><button class="turnos-btn" data-emp="cerrar">✕</button></div>' +
      '<div class="gr-modal-cuerpo" id="emp-cuerpo"></div>' +
      '<div class="gr-modal-pie"><span style="flex:1;font-size:11.5px;color:var(--text-secondary);">Los cambios se guardan al instante. En la tabla, la columna Empresa ofrece solo las empresas activas del área de cada recurso.</span>' +
      '<button class="turnos-btn" data-emp="cerrar">Cerrar</button></div></div>';
    document.body.appendChild(m);
    m.addEventListener('click', e => {
      const a = e.target.closest('[data-emp]');
      if (e.target === m || (a && a.dataset.emp === 'cerrar')) { m.style.display = 'none'; renderGestion_(); return; }
      if (a && a.dataset.emp === 'crear') crearEmpresaGestion_();
      if (a && a.dataset.emp === 'eliminar') eliminarEmpresaGestion_(a.dataset.id);
    });
    m.addEventListener('change', e => {
      const t = e.target, id = t.dataset.id;
      if (t.matches('[data-emp-area]')) alternarAreaEmpresa_(id, t.dataset.empArea, t.checked, t);
      else if (t.matches('[data-emp-activo]')) actualizarEmpresaGestion_(id, { activo: t.checked });
      else if (t.matches('[data-emp-nombre]')) renombrarEmpresaGestion_(id, t);
    });
    m.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.id === 'emp-nueva') crearEmpresaGestion_(); });
  }
  renderEmpresasGestion_();
  m.style.display = 'flex';
}
function renderEmpresasGestion_() {
  const areas = grAreasConocidas_();
  const usos = {};
  state.gr.recursos.forEach(r => { const k = (r.empresa || '').trim().toUpperCase(); if (k) usos[k] = (usos[k] || 0) + 1; });
  const filas = state.gr.empresas.slice().sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')).map(e => {
    const n = usos[e.nombre.trim().toUpperCase()] || 0;
    const id = escapeHtml_(e.id);
    return '<tr class="' + (e.activo ? '' : 'emp-inactiva') + '">' +
      '<td><input class="emp-nombre" data-emp-nombre="1" data-id="' + id + '" value="' + escapeHtml_(e.nombre) + '" data-original="' + escapeHtml_(e.nombre) + '"></td>' +
      '<td style="text-align:center;white-space:nowrap;">' + n + '</td>' +
      '<td style="text-align:center;"><input type="checkbox" data-emp-activo="1" data-id="' + id + '"' + (e.activo ? ' checked' : '') + ' title="Inactiva: no aparece en el desplegable"></td>' +
      '<td><div class="emp-areas">' + areas.map(a => {
        const on = e.areas.some(x => plNorm_(x) === plNorm_(a));
        return '<label class="emp-area' + (on ? ' on' : '') + '"><input type="checkbox" data-emp-area="' + escapeHtml_(a) + '" data-id="' + id + '"' + (on ? ' checked' : '') + '>' + escapeHtml_(aTitulo_(a)) + '</label>';
      }).join('') + '</div></td>' +
      '<td>' + (n ? '<button class="gr-del" disabled title="La usan ' + n + ' recurso(s): desactívala en vez de eliminarla">🔒</button>'
                  : '<button class="gr-del" data-emp="eliminar" data-id="' + id + '" title="Eliminar empresa (no la usa ningún recurso)">🗑️</button>') + '</td></tr>';
  }).join('');
  document.getElementById('emp-cuerpo').innerHTML =
    '<div class="emp-nueva"><input id="emp-nueva" class="emp-nombre" style="max-width:320px;" placeholder="Nombre de la nueva empresa (EESS)">' +
      '<button class="turnos-btn gr-btn-guardar" data-emp="crear">➕ Agregar empresa</button>' +
      '<span style="font-size:11.5px;color:var(--text-secondary);">' + state.gr.empresas.length + ' empresa(s) · marca en verde las áreas donde trabaja cada una</span></div>' +
    '<table class="emp-tabla"><thead><tr><th>Empresa</th><th>Recursos</th><th>Activa</th><th>Áreas de relacionamiento donde trabaja</th><th></th></tr></thead><tbody>' +
      (filas || '<tr><td colspan="5" class="tb-vacio">Aún no hay empresas.</td></tr>') + '</tbody></table>';
}
async function crearEmpresaGestion_() {
  const inp = document.getElementById('emp-nueva');
  const nombre = (inp.value || '').trim().replace(/\s+/g, ' ');
  if (!nombre) { mostrarToast_('Escribe el nombre de la empresa.'); return; }
  if (state.gr.empresas.some(e => e.nombre.trim().toUpperCase() === nombre.toUpperCase())) { mostrarToast_('Ya existe la empresa ' + nombre + '.'); return; }
  // Con un área elegida en los filtros, la empresa nueva queda asignada a esa área
  const area = document.getElementById('gr-area').value;
  const { data, error } = await supabaseClient.from('empresas').insert({ nombre }).select('id, nombre, activo').single();
  if (error) { mostrarToast_('No se pudo crear: ' + error.message); return; }
  const nueva = Object.assign({}, data, { areas: [] });
  if (area) {
    const { error: ea } = await supabaseClient.from('empresa_areas').insert({ empresa_id: data.id, area });
    if (!ea) nueva.areas.push(area);
  }
  state.gr.empresas.push(nueva);
  inp.value = '';
  renderEmpresasGestion_();
  mostrarToast_('✅ Empresa ' + nombre + ' creada' + (area ? ' y asignada a ' + aTitulo_(area) : '') + '. Marca sus áreas de trabajo.');
}
async function alternarAreaEmpresa_(id, area, on, chk) {
  const e = state.gr.empresas.find(x => x.id === id); if (!e) return;
  const res = on
    ? await supabaseClient.from('empresa_areas').insert({ empresa_id: id, area })
    : await supabaseClient.from('empresa_areas').delete().eq('empresa_id', id).in('area', e.areas.filter(x => plNorm_(x) === plNorm_(area)));
  if (res.error) { chk.checked = !on; mostrarToast_('No se pudo guardar: ' + res.error.message); return; }
  e.areas = on ? e.areas.concat(area) : e.areas.filter(x => plNorm_(x) !== plNorm_(area));
  chk.closest('.emp-area').classList.toggle('on', on);
}
async function actualizarEmpresaGestion_(id, cambios) {
  const e = state.gr.empresas.find(x => x.id === id); if (!e) return;
  const { error } = await supabaseClient.from('empresas').update(cambios).eq('id', id);
  if (error) { mostrarToast_('No se pudo guardar: ' + error.message); renderEmpresasGestion_(); return; }
  Object.assign(e, cambios);
  renderEmpresasGestion_();
}
async function renombrarEmpresaGestion_(id, inp) {
  const e = state.gr.empresas.find(x => x.id === id); if (!e) return;
  const nuevo = (inp.value || '').trim().replace(/\s+/g, ' ');
  if (!nuevo || nuevo === e.nombre) { inp.value = e.nombre; return; }
  const n = state.gr.recursos.filter(r => (r.empresa || '').trim().toUpperCase() === e.nombre.trim().toUpperCase()).length;
  if (!confirm('¿Renombrar «' + e.nombre + '» a «' + nuevo + '»?' + (n ? '\n\nTambién se actualiza en ' + n + ' recurso(s) que la usan.' : ''))) { inp.value = e.nombre; return; }
  const { data, error } = await supabaseClient.rpc('renombrar_empresa', { p_id: id, p_nombre: nuevo });
  if (error) { inp.value = e.nombre; mostrarToast_('No se pudo renombrar: ' + error.message); return; }
  state.gr.recursos.forEach(r => { if ((r.empresa || '').trim().toUpperCase() === e.nombre.trim().toUpperCase()) r.empresa = nuevo; });
  e.nombre = nuevo;
  state.pl.cargado = false;   // Planificador / Tablero releen los recursos
  poblarFiltrosGestion_();
  renderEmpresasGestion_();
  mostrarToast_('✅ Empresa renombrada' + (data ? ' · ' + data + ' recurso(s) actualizados' : '') + '.');
}
async function eliminarEmpresaGestion_(id) {
  const e = state.gr.empresas.find(x => x.id === id); if (!e) return;
  if (!confirm('¿Eliminar la empresa «' + e.nombre + '» del catálogo?')) return;
  const { error } = await supabaseClient.from('empresas').delete().eq('id', id);
  if (error) { mostrarToast_('No se pudo eliminar: ' + error.message); return; }
  state.gr.empresas = state.gr.empresas.filter(x => x.id !== id);
  renderEmpresasGestion_();
  mostrarToast_('🗑️ Empresa eliminada.');
}

/* ── Edición directa ── */
function grRegistrarCambio_(input) {
  const r = state.gr.recursos.find(x => String(x.id) === input.dataset.grId);
  const col = GR_COLS.find(c => c.k === input.dataset.grK);
  if (!r || !col || !grPuedeEditar_(r)) return;
  const n = grNormalizar_(col, input.value);
  const camb = state.gr.cambios[r.id] = state.gr.cambios[r.id] || {};
  const errs = state.gr.errores[r.id] = state.gr.errores[r.id] || {};
  if (n.ok && n.v !== input.value && col.tipo !== 'fecha') input.value = n.v;   // p. ej. RUT con puntos y guion
  if (n.v === grValorActual_(r, col.k)) delete camb[col.k]; else camb[col.k] = n.v;
  if (n.ok) delete errs[col.k]; else errs[col.k] = n.msg;
  if (!Object.keys(camb).length) delete state.gr.cambios[r.id];
  if (!Object.keys(errs).length) delete state.gr.errores[r.id];
  input.classList.toggle('gr-mod', col.k in camb);
  input.classList.toggle('gr-error', !n.ok);
  input.title = n.ok ? '' : n.msg;
  if (!n.ok) mostrarToast_('⚠️ ' + n.msg);
  // Solo KPIs y botones (sin redibujar la tabla para no perder el foco)
  const nCamb = Object.keys(state.gr.cambios).length;
  document.getElementById('gr-guardar').style.display = nCamb ? '' : 'none';
  document.getElementById('gr-guardar').textContent = '💾 Guardar cambios (' + nCamb + ')';
  document.getElementById('gr-descartar').style.display = nCamb ? '' : 'none';
}

async function guardarGestion_() {
  const ids = Object.keys(state.gr.cambios);
  if (!ids.length) return;
  const conError = ids.filter(id => state.gr.errores[id]);
  if (conError.length) { mostrarToast_('⚠️ Corrige los campos en rojo antes de guardar (' + conError.length + ' recurso(s)).'); return; }
  const btn = document.getElementById('gr-guardar');
  btn.disabled = true;
  let ok = 0; const fallos = [];
  for (const id of ids) {
    const r = state.gr.recursos.find(x => String(x.id) === id);
    btn.textContent = '💾 Guardando ' + (ok + fallos.length + 1) + ' de ' + ids.length + '…';
    const { error } = await supabaseClient.rpc('actualizar_datos_recurso', { p_recurso_id: id, p_datos: state.gr.cambios[id] });
    if (error) { fallos.push((claveRecurso_(r) || r.codigo_ref) + ': ' + error.message); continue; }
    Object.assign(r, state.gr.cambios[id]);
    if (Object.keys(state.gr.cambios[id]).some(k => GR_CONTACTO.includes(k))) r.contacto_en = new Date().toISOString();
    delete state.gr.cambios[id];
    ok++;
  }
  btn.disabled = false;
  state.pl.cargado = false;   // Planificador / Tablero / Turnos releen los datos
  poblarFiltrosGestion_();    // conteos de sector / tipo / empresa con lo guardado
  renderGestion_();
  if (fallos.length) { console.warn('Gestión de Recursos, errores al guardar:', fallos); mostrarToast_('⚠️ Guardados ' + ok + '; con error ' + fallos.length + ': ' + fallos[0]); }
  else mostrarToast_('✅ ' + ok + ' recurso(s) actualizados.');
}

/* ── ➕ Nuevo recurso (solo Administrador, con un área elegida; SQL 95) ──
 * Se crea SIN ubicación; después se ubica en Planificador gráfico › ficha › 📍 Ubicar en el mapa. */
function abrirNuevoRecursoGestion_() {
  if (!grEsAdmin_()) { mostrarToast_('Solo el Administrador o el Jefe de Área pueden agregar recursos.'); return; }
  const area = document.getElementById('gr-area').value;
  if (!area) { mostrarToast_('Elige primero un área de relacionamiento.'); return; }
  const delArea = state.gr.recursos.filter(r => r.area === area);
  const ref = delArea.find(r => r.id_area != null);
  if (!ref) { mostrarToast_('No se pudo determinar el área (sin recursos de referencia).'); return; }
  let m = document.getElementById('gr-nuevo-modal');
  if (!m) {
    m = document.createElement('div'); m.id = 'gr-nuevo-modal'; m.className = 'gr-modal';
    m.innerHTML = '<div class="gr-modal-caja" style="width:min(760px,96vw);"><div class="gr-modal-cab"><b id="grn-titulo">➕ Nuevo recurso</b><button class="turnos-btn" data-grn="cerrar">✕</button></div>' +
      '<div class="gr-modal-cuerpo" id="grn-cuerpo"></div>' +
      '<div class="gr-modal-pie"><span id="grn-error" style="flex:1;color:#DC2626;font-size:12px;"></span>' +
      '<button class="turnos-btn" data-grn="cerrar">Cancelar</button><button class="turnos-btn gr-btn-guardar" data-grn="crear">✅ Crear recurso</button></div></div>';
    document.body.appendChild(m);
    m.addEventListener('click', e => {
      if (e.target === m || (e.target.closest('[data-grn]') || {}).dataset?.grn === 'cerrar') { m.style.display = 'none'; return; }
      if ((e.target.closest('[data-grn]') || {}).dataset?.grn === 'crear') crearRecursoGestion_();
    });
  }
  m._area = { nombre: area, id: Number(ref.id_area), subgerencia: ref.subgerencia || '' };
  const tipos = (state.tiposRecursoCatalogo || []).map(t => t.nombre);
  const distintos = k => [...new Set(delArea.map(r => r[k]).filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b), 'es'));
  const dl = (id, vals) => '<datalist id="' + id + '">' + vals.map(v => '<option value="' + escapeHtml_(v) + '">').join('') + '</datalist>';
  const campo = (k, t, extra, full) => '<label class="grn-campo' + (full ? ' full' : '') + '"><span>' + t + '</span>' + extra.replace('%ID%', 'grn-' + k) + '</label>';
  const inp = (tipo, attrs) => '<input id="%ID%" type="' + tipo + '"' + (attrs || '') + '>';
  document.getElementById('grn-titulo').textContent = '➕ Nuevo recurso · ' + aTitulo_(area);
  document.getElementById('grn-error').textContent = '';
  document.getElementById('grn-cuerpo').innerHTML =
    '<div class="pl-aviso info" style="margin:0;">Área <b>' + escapeHtml_(area) + '</b>' + (ref.subgerencia ? ' · Subgerencia ' + escapeHtml_(ref.subgerencia) : '') +
      '. Se crea <b>sin ubicación</b>: después ubícalo en <b>Planificador gráfico › ficha › 📍 Ubicar en el mapa</b>. ' +
      'Las personas (y el titular) se agregan luego con <b>👥 Personas</b> en su fila.</div>' +
    '<div class="grn-grid">' +
      campo('codigo_ref', '🔒 ID (obligatorio, único)', inp('text', ' placeholder="Ej.: VCAM-0315" style="text-transform:uppercase;"')) +
      campo('alias', '📻 Clave radial', inp('text', ' placeholder="Ej.: AV3.71"')) +
      campo('tipo_recurso', 'Tipo de recurso (obligatorio)', '<select id="%ID%"><option value="">— Selecciona —</option>' +
        tipos.map(t => '<option value="' + escapeHtml_(t) + '">' + escapeHtml_(aTitulo_(t)) + '</option>').join('') + '</select>', true) +
      campo('sector', 'Sector', inp('text', ' list="grn-dl-sector"')) +
      campo('empresa', 'Empresa (EESS)', inp('text', ' list="grn-dl-empresa"')) +
      campo('tipo_movil', 'Tipo de móvil', inp('text', ' list="grn-dl-movil"')) +
      campo('actividad', 'Turno', inp('text', ' list="grn-dl-turno" placeholder="DIURNO / NOCTURNO"')) +
      campo('horario', 'Horario', inp('text', ' placeholder="Ej.: 12:00 - 20:00"')) +
      campo('n_personas', 'N° personas', inp('number', ' min="0" step="1"')) +
      campo('fecha_inicio_operacion', 'Fecha inicio', inp('date')) +
      campo('fecha_termino_operacion', 'Fecha término', inp('date')) +
      campo('trabajo_actual', 'Trabajo actual', inp('text'), true) +
    '</div>' +
    dl('grn-dl-sector', distintos('sector')) + dl('grn-dl-empresa', distintos('empresa')) + dl('grn-dl-movil', distintos('tipo_movil')) + dl('grn-dl-turno', distintos('actividad'));
  m.style.display = 'flex';
  setTimeout(() => document.getElementById('grn-codigo_ref').focus(), 50);
}
async function crearRecursoGestion_() {
  const m = document.getElementById('gr-nuevo-modal'), err = document.getElementById('grn-error');
  const val = k => { const el = document.getElementById('grn-' + k); return el ? el.value.trim() : ''; };
  err.textContent = '';
  const codigo = val('codigo_ref').toUpperCase(), tipo = val('tipo_recurso');
  if (!codigo) { err.textContent = 'El ID es obligatorio.'; return; }
  if (state.gr.recursos.some(r => grCodigo_(r.codigo_ref) === grCodigo_(codigo))) { err.textContent = 'Ya existe un recurso con el ID ' + codigo + '.'; return; }
  if (!tipo) { err.textContent = 'Elige el tipo de recurso.'; return; }
  // Mismas validaciones que la edición (RUT, mail, teléfono, N° personas, fechas)
  const datos = {};
  for (const c of GR_COLS) {
    if (!c.ed || c.k === 'tipo_recurso') continue;
    const v = val(c.k); if (v === '') continue;
    const n = grNormalizar_(c, v);
    if (!n.ok) { err.textContent = c.t + ': ' + n.msg; return; }
    datos[c.k] = n.v;
  }
  const btn = m.querySelector('[data-grn="crear"]'); btn.disabled = true; btn.textContent = 'Creando…';
  const { error } = await supabaseClient.rpc('crear_recurso_gestion', { p_id_area: m._area.id, p_codigo: codigo, p_tipo: tipo, p_datos: datos });
  btn.disabled = false; btn.textContent = '✅ Crear recurso';
  if (error) {
    err.textContent = /crear_recurso_gestion/.test(error.message) ? 'Falta ejecutar el SQL 95 en Supabase.' : error.message;
    return;
  }
  m.style.display = 'none';
  state.pl.cargado = false;   // Planificador / Tablero / Turnos releen los recursos
  state.gr.recursos = [];
  await abrirGestionRecursos_(true);
  const q = document.getElementById('gr-buscar'); if (q) { q.value = codigo; renderGestion_(); }
  mostrarToast_('✅ Recurso ' + codigo + ' creado en ' + m._area.nombre + '. Ubícalo en Planificador gráfico › 📍 Ubicar en el mapa.');
}

/** 🗑️ Elimina un recurso con DOBLE confirmación (aviso + escribir su ID). Un recurso con rutas
 *  asignadas no se puede eliminar (también lo bloquea la base, SQL 97). */
async function eliminarRecursoGestion_(id) {
  const r = state.gr.recursos.find(x => String(x.id) === String(id)); if (!r) return;
  if (state.gr.conRuta && state.gr.conRuta.has(String(id))) { mostrarToast_('Este recurso tiene ruta asignada: no se puede eliminar.'); return; }
  const nombre = (claveRecurso_(r) || 'Sin clave') + ' (' + (r.codigo_ref || 'sin ID') + ')';
  if (!confirm('🗑️ ¿Eliminar el recurso ' + nombre + '?\n\n' + aTitulo_(r.tipo_recurso || '') + ' · ' + (r.area || '') + (r.sector ? ' · ' + r.sector : '') +
    '\n\nSe eliminan también sus turnos y su contacto. Esta acción no se puede deshacer.')) return;
  const escrito = prompt('Segunda confirmación: escribe el ID del recurso (' + (r.codigo_ref || '') + ') para eliminarlo definitivamente.');
  if (escrito == null) return;
  if (grCodigo_(escrito) !== grCodigo_(r.codigo_ref || '')) { mostrarToast_('El ID no coincide: no se eliminó.'); return; }
  const { error } = await supabaseClient.rpc('eliminar_recurso_referencia', { p_recurso_id: r.id });
  if (error) { mostrarToast_('No se pudo eliminar: ' + error.message); return; }
  state.pl.cargado = false;
  state.gr.recursos = state.gr.recursos.filter(x => String(x.id) !== String(id));
  delete state.gr.cambios[id]; delete state.gr.errores[id];
  poblarFiltrosGestion_(); renderGestion_();
  mostrarToast_('🗑️ Recurso ' + nombre + ' eliminado.');
}

/* ── 👥 PERSONAS DE CADA RECURSO (02-11-2026, SQL 147) ──
 * Cada recurso tiene N° personas; se registran de a una (nombre, RUT, teléfono, dirección, temporada, correo,
 * curso Call Fire, cargo, conductor, titular). UNA persona es el titular: un trigger la copia a recurso_contacto
 * y es la que muestra la planilla (columnas 👤 Titular). Escriben el Admin y el Jefe del área (puede_gestionar_recurso_). */
function grCargosDe_(tipo) {   // = cargos_recurso_ del SQL 147
  return /MULTIPROPOSITO/.test(normalizarBusqueda_(tipo || '').toUpperCase())
    ? ['Jefe de Brigada', 'Motosierrista', 'Manual'] : ['Vigía'];
}
/** Temporadas = N° de temporadas trabajando (SQL 148): 1 → «1ª temporada». */
function grTemporadas_(n) { return /^\d+$/.test(String(n == null ? '' : n)) && Number(n) >= 1 ? n + 'ª' : '—'; }
async function cargarPersonasGestion_() {
  state.gr.personas = {}; state.gr.sinSql147 = false;
  for (let d = 0; ; d += 1000) {
    const { data, error } = await supabaseClient.from('recurso_personas').select('id, recurso_id, nombre, rut, cargo, titular').order('nombre').range(d, d + 999);
    if (error) { state.gr.sinSql147 = true; console.warn('Gestión de Recursos: recurso_personas no disponible (¿falta el SQL 147?):', error.message); return; }
    (data || []).forEach(p => { (state.gr.personas[p.recurso_id] = state.gr.personas[p.recurso_id] || []).push(p); });
    if (!data || data.length < 1000) break;
  }
}
/** Estado de personas del recurso: 'ok' (registradas ≥ N° personas y con titular), 'parcial' o 'cero'. */
function grEstadoPersonas_(r) {
  const ps = state.gr.personas[r.id] || [], total = Number(grValorActual_(r, 'n_personas')) || 0;
  if (!ps.length) return 'cero';
  return total && ps.length >= total && ps.some(p => p.titular) ? 'ok' : 'parcial';
}
/** 📈 KPI «Avance de actualización de personas» de los recursos filtrados.
 *  Avance = Σ mín(registradas, N° personas) / Σ N° personas (los recursos sin N° personas no entran al %). */
function grKpiPersonasHtml_(lista) {
  if (state.gr.sinSql147 || !lista.length) return '';
  let esperadas = 0, cubiertas = 0, registradas = 0, completos = 0, titulares = 0, sinN = 0;
  lista.forEach(r => {
    const ps = state.gr.personas[r.id] || [], total = Number(grValorActual_(r, 'n_personas')) || 0;
    registradas += ps.length;
    if (ps.some(p => p.titular)) titulares++;
    if (grEstadoPersonas_(r) === 'ok') completos++;
    if (!total) { sinN++; return; }
    esperadas += total; cubiertas += Math.min(ps.length, total);
  });
  const pct = esperadas ? Math.round(cubiertas / esperadas * 1000) / 10 : 0;
  const color = pct >= 90 ? '#16A34A' : pct >= 50 ? '#F59E0B' : '#DC2626';
  const pctR = Math.round(completos / lista.length * 100), pctT = Math.round(titulares / lista.length * 100);
  const barra = (p, c) => '<div class="grk-barra"><i style="width:' + Math.min(100, p) + '%;background:' + c + '"></i></div>';
  return '<div class="grk-personas" title="Avance = personas registradas (hasta el N° personas de cada recurso) / N° personas esperado. Filtra con «👥 Faltan personas» o «⭐ Sin titular».">' +
    '<div class="grk-cab"><span>👥 Avance de actualización de personas</span><b style="color:' + color + '">' + pct.toLocaleString('es-CL') + ' %</b></div>' +
    barra(pct, color) +
    '<div class="grk-det">' +
      '<span><b>' + cubiertas.toLocaleString('es-CL') + '</b> de ' + esperadas.toLocaleString('es-CL') + ' personas' + (registradas > cubiertas ? ' <small>(+' + (registradas - cubiertas) + ' sobre el N°)</small>' : '') + '</span>' +
      '<span>✅ <b>' + completos + '</b>/' + lista.length + ' recursos completos (' + pctR + ' %)</span>' +
      '<span>⭐ <b>' + titulares + '</b>/' + lista.length + ' con titular (' + pctT + ' %)</span>' +
      (sinN ? '<span class="grk-aviso">⚠️ ' + sinN + ' sin N° personas</span>' : '') +
    '</div></div>';
}
function grBotonPersonas_(r) {
  const n = (state.gr.personas[r.id] || []).length, total = Number(grValorActual_(r, 'n_personas')) || 0;
  const est = grEstadoPersonas_(r), cls = est === 'ok' ? 'ok' : est === 'cero' ? 'cero' : 'parcial';
  return '<button class="gr-pers ' + cls + '" data-gr-personas="' + escapeHtml_(String(r.id)) + '" title="Personas registradas de ' + (total || '?') +
    ' (N° personas). Clic para ver, agregar o editar.">👥 ' + n + (total ? '/' + total : '') + '</button>';
}

async function abrirPersonasRecurso_(id) {
  const r = state.gr.recursos.find(x => String(x.id) === String(id)); if (!r) return;
  if (state.gr.sinSql147) { mostrarToast_('⚠️ Falta ejecutar en Supabase el SQL 147 (sql/pendientes/147_personas_por_recurso.sql).'); return; }
  let m = document.getElementById('grp-modal');
  if (!m) {
    m = document.createElement('div'); m.id = 'grp-modal'; m.className = 'gr-modal';
    m.innerHTML = '<div class="gr-modal-caja" style="width:min(1150px,97vw);"><div class="gr-modal-cab"><b id="grp-titulo">👥 Personas</b><span style="display:flex;gap:6px;">' +
      '<button class="turnos-btn" data-grp="guia" title="Cómo registrar y actualizar las personas del recurso">❓ Guía rápida</button>' +
      '<button class="turnos-btn" data-grp="cerrar">✕</button></span></div>' +
      '<div class="gr-modal-cuerpo" id="grp-cuerpo"></div>' +
      '<div class="gr-modal-pie"><span id="grp-pie" style="flex:1;font-size:11.5px;color:var(--text-secondary);"></span><button class="turnos-btn" data-grp="cerrar">Cerrar</button></div></div>';
    document.body.appendChild(m);
    m.addEventListener('click', e => {
      const a = e.target.closest('[data-grp]');
      if (e.target === m || (a && a.dataset.grp === 'cerrar')) { m.style.display = 'none'; renderGestion_(); return; }
      if (!a) return;
      if (a.dataset.grp === 'guia') { m._guia = !m._guia; grpGuardarGuia_(m._guia); grpRender_(); return; }
      if (a.dataset.grp === 'nueva') grpFormulario_(null);
      if (a.dataset.grp === 'editar') grpFormulario_(m._lista.find(p => p.id === a.dataset.id));
      if (a.dataset.grp === 'cancelar') grpFormulario_(undefined);
      if (a.dataset.grp === 'guardar') grpGuardar_();
      if (a.dataset.grp === 'eliminar') grpEliminar_(a.dataset.id);
    });
  }
  m._recurso = r; m._lista = []; m._form = undefined;
  // La guía rápida se abre sola la primera vez; después se recuerda si el usuario la cerró
  try { m._guia = localStorage.getItem('grp-guia') !== '0'; } catch (e) { m._guia = true; }
  document.getElementById('grp-titulo').textContent = '👥 Personas · 📻 ' + (claveRecurso_(r) || 'Sin clave') + ' (' + (r.codigo_ref || 'sin ID') + ') · ' + aTitulo_(r.tipo_recurso || '');
  document.getElementById('grp-cuerpo').innerHTML = '<div class="tb-vacio">Cargando…</div>';
  m.style.display = 'flex';
  await grpRecargar_();
}
async function grpRecargar_() {
  const m = document.getElementById('grp-modal'), r = m._recurso;
  const { data, error } = await supabaseClient.from('recurso_personas').select('*').eq('recurso_id', r.id);
  if (error) { document.getElementById('grp-cuerpo').innerHTML = '<div class="tb-vacio">No se pudo cargar: ' + escapeHtml_(error.message) + '</div>'; return; }
  const cargos = grCargosDe_(r.tipo_recurso);
  m._lista = (data || []).sort((a, b) => (b.titular - a.titular) || (cargos.indexOf(a.cargo) - cargos.indexOf(b.cargo)) || a.nombre.localeCompare(b.nombre, 'es'));
  state.gr.personas[r.id] = m._lista.map(p => ({ id: p.id, recurso_id: p.recurso_id, nombre: p.nombre, rut: p.rut, cargo: p.cargo, titular: p.titular }));
  const t = m._lista.find(p => p.titular);   // la planilla muestra al titular
  r.nombre_persona = t ? t.nombre : null; r.rut = t ? t.rut : null; r.telefono = t ? t.telefono : null; r.mail = t ? t.correo : null;
  grpRender_();
}
function grpRender_() {
  const m = document.getElementById('grp-modal'), r = m._recurso, lista = m._lista;
  const editable = grPuedeEditar_(r);
  const total = Number(grValorActual_(r, 'n_personas')) || 0;
  const si = v => v ? '<span class="gr-pill ok">Sí</span>' : '<span style="color:var(--text-tertiary);">No</span>';
  const porCargo = {}; lista.forEach(p => { porCargo[p.cargo] = (porCargo[p.cargo] || 0) + 1; });
  const filas = lista.map(p => '<tr' + (p.titular ? ' class="grp-titular"' : '') + '>' +
    '<td>' + (p.titular ? '⭐ ' : '') + '<b>' + escapeHtml_(p.nombre) + '</b></td><td>' + escapeHtml_(p.rut) + '</td><td>' + escapeHtml_(p.cargo) + '</td>' +
    '<td>' + si(p.titular) + '</td><td>' + si(p.conductor) + '</td><td>' + si(p.curso_call_fire) + '</td>' +
    '<td>' + escapeHtml_(p.telefono || '—') + '</td><td>' + escapeHtml_(p.correo || '—') + '</td><td>' + escapeHtml_(p.direccion || '—') + '</td><td style="text-align:center;">' + escapeHtml_(grTemporadas_(p.temporada)) + '</td>' +
    '<td style="white-space:nowrap;">' + (editable ? '<button class="gr-del" style="width:auto;padding:0 7px;" data-grp="editar" data-id="' + escapeHtml_(p.id) + '" title="Editar">✏️</button> ' +
      '<button class="gr-del" data-grp="eliminar" data-id="' + escapeHtml_(p.id) + '" title="Eliminar persona">🗑️</button>' : '') + '</td></tr>').join('');
  const falta = total ? total - lista.length : 0;
  const cubiertas = total ? Math.min(lista.length, total) : 0, pct = total ? Math.round(cubiertas / total * 100) : 0;
  const color = pct >= 100 && lista.some(p => p.titular) ? '#16A34A' : pct >= 50 ? '#F59E0B' : '#DC2626';
  document.getElementById('grp-cuerpo').innerHTML =
    (m._guia ? grpGuiaHtml_(r) : '') +
    (total ? '<div class="grk-personas grk-mini"><div class="grk-cab"><span>👥 Avance de este recurso</span><b style="color:' + color + '">' + pct + ' %</b></div>' +
      '<div class="grk-barra"><i style="width:' + pct + '%;background:' + color + '"></i></div></div>' : '') +
    '<div class="grp-resumen">' +
      '<span class="grp-chip">👥 <b>' + lista.length + '</b>' + (total ? ' de ' + total + ' personas' : ' persona(s) · N° personas sin dato') + '</span>' +
      Object.keys(porCargo).map(c => '<span class="grp-chip">' + escapeHtml_(c) + ': <b>' + porCargo[c] + '</b></span>').join('') +
      (lista.length && !lista.some(p => p.titular) ? '<span class="grp-chip aviso">⚠️ Falta marcar el titular</span>' : '') +
      (falta > 0 ? '<span class="grp-chip aviso">Faltan ' + falta + '</span>' : falta < 0 ? '<span class="grp-chip aviso">Hay ' + (-falta) + ' más que el N° personas</span>' : '') +
      (editable && m._form === undefined ? '<button class="turnos-btn gr-btn-guardar" style="margin-left:auto;" data-grp="nueva">➕ Agregar persona</button>' : '') +
    '</div>' +
    '<div id="grp-form"></div>' +
    (lista.length ? '<div style="overflow:auto;"><table class="emp-tabla grp-tabla"><thead><tr><th>Nombre completo</th><th>RUT</th><th>Cargo</th><th>Titular</th><th>Conductor</th><th>Curso Call Fire</th>' +
      '<th>Teléfono</th><th>Correo</th><th>Dirección</th><th title="N° de temporadas trabajando">Temporadas</th><th></th></tr></thead><tbody>' + filas + '</tbody></table></div>'
      : '<div class="tb-vacio">Aún no hay personas registradas en este recurso.</div>');
  document.getElementById('grp-pie').textContent = 'Cargos de ' + aTitulo_(r.tipo_recurso || 'este recurso') + ': ' + grCargosDe_(r.tipo_recurso).join(', ') +
    '. El titular (uno por recurso) es el que aparece en la planilla.' + (editable ? '' : ' · Solo consulta.');
  if (m._form !== undefined) grpFormulario_(m._form);
}
function grpGuardarGuia_(abierta) { try { localStorage.setItem('grp-guia', abierta ? '1' : '0'); } catch (e) { /* sin almacenamiento */ } }
/** ❓ Guía rápida del actualizador de personas (dentro de la ventana 👥 Personas). */
function grpGuiaHtml_(r) {
  const cargos = grCargosDe_(r.tipo_recurso).join(' · ');
  const paso = (n, t, d) => '<li><span class="grp-guia-n">' + n + '</span><div><b>' + t + '</b><br>' + d + '</div></li>';
  return '<div class="grp-guia"><div class="grp-guia-cab"><b>❓ Guía rápida · Actualizar las personas del recurso</b>' +
      '<button class="turnos-btn" data-grp="guia" style="padding:2px 9px;">Ocultar</button></div>' +
    '<ol>' +
      paso(1, 'Revisa el N° de personas', 'Debe estar en la columna <b>N° personas</b> de la planilla: es la meta del avance (ej.: 👥 2/4 = faltan 2).') +
      paso(2, '➕ Agregar persona', 'Una a la vez: <b>nombre completo, RUT y cargo</b> son obligatorios. Completa teléfono, correo, dirección y <b>N° de temporadas trabajando</b> (1 = primera).') +
      paso(3, 'Elige el cargo', 'Para este recurso: <b>' + escapeHtml_(cargos) + '</b>. (Brigada Multipropósito: Jefe de Brigada, Motosierrista, Manual · resto: Vigía.)') +
      paso(4, 'Marca ⭐ Titular', 'Solo <b>uno</b> por recurso: es el que aparece en la planilla (Titular, RUT, teléfono y mail). Marca también 🚗 Conductor y 🎓 Curso Call Fire si corresponde.') +
      paso(5, '💾 Guardar y repetir', 'Se guarda al instante. Usa ✏️ para corregir y 🗑️ para quitar a quien ya no está. El recurso queda <b style="color:#16A34A">completo (verde)</b> con todas sus personas y un titular.') +
    '</ol>' +
    '<div class="grp-guia-pie">💡 En la planilla: filtro <b>«👥 Faltan personas»</b> o <b>«⭐ Sin titular»</b> para ver lo pendiente · <b>👥 Descargar personas</b> baja todo a Excel · ' +
      'muchas a la vez: <b>📋 Plantilla personas</b> → completar en Excel → <b>⬆️ Subir personas</b>.</div></div>';
}
/** Muestra el formulario: null = persona nueva, objeto = editar, undefined = cerrarlo. */
function grpFormulario_(p) {
  const m = document.getElementById('grp-modal'), r = m._recurso;
  const prev = m._form; m._form = p;
  if ((prev === undefined) !== (p === undefined)) { grpRender_(); return; }   // cambia el botón «➕ Agregar»
  const caja = document.getElementById('grp-form');
  if (p === undefined) { caja.innerHTML = ''; return; }
  const x = p || {};
  const cargos = grCargosDe_(r.tipo_recurso);
  const sinTitular = !m._lista.some(q => q.titular && q.id !== x.id);
  const campo = (t, html, full) => '<label class="grn-campo' + (full ? ' full' : '') + '"><span>' + t + '</span>' + html + '</label>';
  const val = v => ' value="' + escapeHtml_(v == null ? '' : v) + '"';
  const chk = (k, t, on) => '<label class="grp-chk"><input type="checkbox" id="grp-' + k + '"' + (on ? ' checked' : '') + '> ' + t + '</label>';
  caja.innerHTML = '<div class="grp-form"><div style="font-weight:700;margin-bottom:8px;">' + (p ? '✏️ Editar persona' : '➕ Nueva persona') + '</div><div class="grn-grid">' +
    campo('Nombre completo *', '<input id="grp-nombre"' + val(x.nombre) + '>', true) +
    campo('RUT *', '<input id="grp-rut" placeholder="12.345.678-5"' + val(x.rut) + '>') +
    campo('Cargo *', '<select id="grp-cargo">' + (cargos.length > 1 ? '<option value="">— Selecciona —</option>' : '') +
      cargos.map(c => '<option' + (x.cargo === c ? ' selected' : '') + '>' + escapeHtml_(c) + '</option>').join('') +
      (x.cargo && !cargos.includes(x.cargo) ? '<option selected>' + escapeHtml_(x.cargo) + '</option>' : '') + '</select>') +
    campo('N° de temporadas trabajando', '<input id="grp-temporada" type="number" min="1" max="60" step="1" placeholder="1 = primera temporada"' + val(x.temporada) + '>') +
    campo('Teléfono', '<input id="grp-telefono" type="tel"' + val(x.telefono) + '>') +
    campo('Correo', '<input id="grp-correo" type="email"' + val(x.correo) + '>') +
    campo('Dirección', '<input id="grp-direccion"' + val(x.direccion) + '>') +
    '<div class="grn-campo full grp-chks">' +
      chk('titular', '⭐ Titular del recurso <small>(solo uno; aparece en la planilla)</small>', p ? x.titular : sinTitular) +
      chk('conductor', '🚗 Conductor', x.conductor) +
      chk('curso_call_fire', '🎓 Curso certificado Call Fire', x.curso_call_fire) +
    '</div></div>' +
    '<div class="grp-form-pie"><span id="grp-error" style="flex:1;color:#DC2626;font-size:12px;"></span>' +
      '<button class="turnos-btn" data-grp="cancelar">Cancelar</button><button class="turnos-btn gr-btn-guardar" data-grp="guardar">💾 Guardar persona</button></div></div>';
  setTimeout(() => { const el = document.getElementById('grp-nombre'); if (el) el.focus(); }, 30);
}
async function grpGuardar_() {
  const m = document.getElementById('grp-modal'), r = m._recurso, err = document.getElementById('grp-error');
  const v = k => (document.getElementById('grp-' + k).value || '').trim();
  const c = k => document.getElementById('grp-' + k).checked;
  err.textContent = '';
  const nombre = v('nombre').replace(/\s+/g, ' ');
  if (!nombre) { err.textContent = 'El nombre completo es obligatorio.'; return; }
  const rut = grRut_(v('rut'));
  if (!rut.v) { err.textContent = 'El RUT es obligatorio.'; return; }
  if (!rut.ok) { err.textContent = rut.msg; return; }
  if (!v('cargo')) { err.textContent = 'Elige el cargo.'; return; }
  const tel = grNormalizar_({ tipo: 'tel' }, v('telefono')), mail = grNormalizar_({ tipo: 'mail' }, v('correo'));
  if (!tel.ok) { err.textContent = tel.msg; return; }
  if (!mail.ok) { err.textContent = 'Correo inválido.'; return; }
  const temp = v('temporada');
  if (temp && !(/^\d{1,2}$/.test(temp) && Number(temp) >= 1)) { err.textContent = 'Temporadas: número entero desde 1 (1 = primera temporada).'; return; }
  const id = m._form && m._form.id;
  // Aviso (no bloquea): el mismo RUT en otro recurso
  const k = grCodigo_(rut.v), otro = Object.keys(state.gr.personas).find(rid => rid !== String(r.id) && state.gr.personas[rid].some(p => grCodigo_(p.rut) === k));
  if (otro) {
    const ro = state.gr.recursos.find(x => String(x.id) === otro);
    if (!confirm('El RUT ' + rut.v + ' ya está registrado en el recurso ' + (ro ? (claveRecurso_(ro) || ro.codigo_ref) : 'otro') + '.\n¿Guardarlo igual también en este?')) return;
  }
  const titular = c('titular'), titularPrevio = m._lista.find(p => p.titular && p.id !== id);
  if (titular && titularPrevio && !confirm('⭐ ' + titularPrevio.nombre + ' deja de ser el titular y pasa a serlo ' + nombre + '. ¿Continuar?')) return;
  const btn = m.querySelector('[data-grp="guardar"]'); btn.disabled = true; btn.textContent = 'Guardando…';
  const { error } = await supabaseClient.rpc('guardar_persona_recurso', { p_recurso_id: r.id, p_persona: {
    id: id || null, nombre, rut: rut.v, cargo: v('cargo'), temporada: temp, telefono: tel.v, correo: mail.v, direccion: v('direccion'),
    titular, conductor: c('conductor'), curso_call_fire: c('curso_call_fire') } });
  btn.disabled = false; btn.textContent = '💾 Guardar persona';
  if (error) { err.textContent = error.message; return; }
  m._form = undefined;
  await grpRecargar_();
  mostrarToast_('✅ ' + nombre + (id ? ' actualizado(a).' : ' agregado(a) al recurso.'));
}
async function grpEliminar_(pid) {
  const m = document.getElementById('grp-modal'), p = m._lista.find(x => x.id === pid); if (!p) return;
  if (!confirm('🗑️ ¿Eliminar a ' + p.nombre + ' (' + p.rut + ') de este recurso?' + (p.titular ? '\n\nEs el TITULAR: la planilla quedará sin titular hasta que marques otro.' : ''))) return;
  const { error } = await supabaseClient.rpc('eliminar_persona_recurso', { p_id: pid });
  if (error) { mostrarToast_('No se pudo eliminar: ' + error.message); return; }
  if (m._form && m._form.id === pid) m._form = undefined;
  await grpRecargar_();
  mostrarToast_('🗑️ Persona eliminada.');
}

/** 👥 Descargar personas: TODAS las columnas de recurso_personas de los recursos filtrados + datos del recurso. */
async function descargarPersonasGestion_() {
  if (state.gr.sinSql147) { mostrarToast_('⚠️ Falta ejecutar en Supabase el SQL 147.'); return; }
  const lista = grFiltrados_();
  if (!lista.length) { mostrarToast_('No hay recursos con estos filtros.'); return; }
  try {
    mostrarToast_('Generando Excel de personas…');
    const ids = lista.map(r => r.id), pers = [];
    for (let i = 0; i < ids.length; i += 150) {
      const { data, error } = await supabaseClient.from('recurso_personas').select('*').in('recurso_id', ids.slice(i, i + 150));
      if (error) throw error;
      pers.push(...(data || []));
    }
    if (!pers.length) { mostrarToast_('Los recursos filtrados no tienen personas registradas.'); return; }
    // Nombre de quien actualizó (si la tabla de perfiles es legible)
    const quien = {};
    try {
      const uids = [...new Set(pers.map(p => p.actualizado_por).filter(Boolean))];
      if (uids.length) { const { data } = await supabaseClient.from('perfiles').select('id, nombre_completo').in('id', uids); (data || []).forEach(u => { quien[u.id] = u.nombre_completo; }); }
    } catch (e) { /* sin nombres: queda el id */ }
    const porId = {}; lista.forEach(r => { porId[r.id] = r; });
    const sn = b => b ? 'Sí' : 'No';
    const fh = v => v ? new Date(v).toLocaleString('es-CL') : '';
    const cab = ['Clave radial', 'ID recurso', 'Tipo de recurso', 'Subgerencia', 'Área', 'Sector', 'Comuna', 'Empresa (EESS)', 'Turno', 'N° personas del recurso',
      'Nombre completo', 'RUT', 'Cargo', 'Titular', 'Conductor', 'Curso certificado Call Fire', 'Teléfono', 'Correo', 'Dirección', 'N° temporadas trabajando',
      'Registrado el', 'Actualizado el', 'Actualizado por', 'ID persona'];
    const filas = pers.map(p => { const r = porId[p.recurso_id] || {}; return {
      'Clave radial': claveRecurso_(r) || '', 'ID recurso': r.codigo_ref || '', 'Tipo de recurso': r.tipo_recurso || '', 'Subgerencia': r.subgerencia || '',
      'Área': r.area || '', 'Sector': r.sector || '', 'Comuna': r.comuna || '', 'Empresa (EESS)': r.empresa || '', 'Turno': r.actividad || '',
      'N° personas del recurso': r.n_personas == null ? '' : Number(r.n_personas),
      'Nombre completo': p.nombre, 'RUT': p.rut, 'Cargo': p.cargo, 'Titular': sn(p.titular), 'Conductor': sn(p.conductor),
      'Curso certificado Call Fire': sn(p.curso_call_fire), 'Teléfono': p.telefono || '', 'Correo': p.correo || '', 'Dirección': p.direccion || '',
      'N° temporadas trabajando': p.temporada == null ? '' : Number(p.temporada), 'Registrado el': fh(p.creado_en), 'Actualizado el': fh(p.actualizado_en),
      'Actualizado por': quien[p.actualizado_por] || p.actualizado_por || '', 'ID persona': p.id }; })
      .sort((a, b) => String(a['Área']).localeCompare(String(b['Área']), 'es') || String(a['ID recurso']).localeCompare(String(b['ID recurso']), 'es', { numeric: true }) ||
        (a.Titular === 'Sí' ? -1 : b.Titular === 'Sí' ? 1 : 0) || String(a['Nombre completo']).localeCompare(String(b['Nombre completo']), 'es'));
    const XLSX = await tbCargarSheetJs_();
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(filas, { header: cab });
    ws['!cols'] = [12, 12, 22, 12, 16, 16, 16, 18, 10, 10, 30, 13, 16, 8, 10, 12, 14, 26, 30, 11, 18, 18, 22, 38].map(wch => ({ wch }));
    ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: filas.length, c: cab.length - 1 } }) };
    XLSX.utils.book_append_sheet(wb, ws, 'Personas');
    // Resumen por recurso: registradas vs N° personas y titular
    const res = lista.map(r => { const ps = pers.filter(p => p.recurso_id === r.id), t = ps.find(p => p.titular); return {
      'Clave radial': claveRecurso_(r) || '', 'ID recurso': r.codigo_ref || '', 'Tipo de recurso': r.tipo_recurso || '', 'Área': r.area || '',
      'N° personas': r.n_personas == null ? '' : Number(r.n_personas), 'Registradas': ps.length,
      'Faltan': r.n_personas ? Math.max(0, Number(r.n_personas) - ps.length) : '', 'Titular': t ? t.nombre : '',
      'Conductores': ps.filter(p => p.conductor).length, 'Con curso Call Fire': ps.filter(p => p.curso_call_fire).length }; });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(res), 'Resumen por recurso');
    const area = document.getElementById('gr-area').value;
    XLSX.writeFile(wb, 'personas_recursos_' + tbHoyISO_() + (area ? '_' + normalizarBusqueda_(area).toUpperCase().replace(/[^\w.-]+/g, '_') : '') + '.xlsx');
    mostrarToast_('✅ Descargadas ' + pers.length + ' persona(s) de ' + lista.length + ' recurso(s).');
  } catch (e) {
    mostrarToast_('No se pudo generar el Excel de personas: ' + (e.message || e));
  }
}

/* ── 📋 PLANTILLA DE PERSONAS + ⬆️ CARGA MASIVA (02-11-2026, SQL 149) ──
 * Plantilla: una fila por CUPO (N° personas) de cada recurso filtrado; trae las personas ya registradas y filas vacías
 * para las que faltan. Se sube completa: vista previa (nuevas / actualizadas / sin cambios / errores) y se aplica con
 * cargar_personas_masivo (cada fila con guardar_persona_recurso: mismas validaciones y permiso por área). No elimina personas. */
const GRP_PLANTILLA = [
  { h: 'ID recurso', k: 'codigo', w: 12 }, { h: 'Clave radial', w: 12 }, { h: 'Tipo de recurso', w: 22 }, { h: 'Área', w: 16 },
  { h: 'Sector', w: 16 }, { h: 'N° personas', w: 10 }, { h: 'Cupo', w: 6 },
  { h: 'Nombre completo *', k: 'nombre', w: 30 }, { h: 'RUT *', k: 'rut', w: 13 }, { h: 'Cargo *', k: 'cargo', w: 16 },
  { h: 'Titular (Sí/No)', k: 'titular', w: 9 }, { h: 'Conductor (Sí/No)', k: 'conductor', w: 10 }, { h: 'Curso Call Fire (Sí/No)', k: 'curso_call_fire', w: 12 },
  { h: 'Teléfono', k: 'telefono', w: 14 }, { h: 'Correo', k: 'correo', w: 26 }, { h: 'Dirección', k: 'direccion', w: 30 },
  { h: 'N° temporadas trabajando', k: 'temporada', w: 12 }, { h: 'ID persona (no modificar)', k: 'id', w: 38 },
];
const grpNormH_ = s => normalizarBusqueda_(String(s || '')).replace(/\(.*?\)/g, '').replace(/[^a-z0-9]/g, '');
const grpSiNo_ = v => /^(si|s|x|1|true|verdadero)$/.test(normalizarBusqueda_(String(v == null ? '' : v)).trim());

async function grpPersonasDe_(ids) {
  const pers = [];
  for (let i = 0; i < ids.length; i += 150) {
    const { data, error } = await supabaseClient.from('recurso_personas').select('*').in('recurso_id', ids.slice(i, i + 150));
    if (error) throw error;
    pers.push(...(data || []));
  }
  return pers;
}

async function descargarPlantillaPersonas_() {
  if (state.gr.sinSql147) { mostrarToast_('⚠️ Falta ejecutar en Supabase el SQL 147.'); return; }
  const lista = grFiltrados_().filter(grPuedeEditar_);
  if (!lista.length) { mostrarToast_('No hay recursos editables con estos filtros.'); return; }
  try {
    mostrarToast_('Generando plantilla de personas…');
    const pers = await grpPersonasDe_(lista.map(r => r.id));
    const porRec = {}; pers.forEach(p => { (porRec[p.recurso_id] = porRec[p.recurso_id] || []).push(p); });
    const sn = b => b ? 'Sí' : 'No';
    const filas = [];
    let vacias = 0;
    lista.forEach(r => {
      const cargos = grCargosDe_(r.tipo_recurso);
      const ps = (porRec[r.id] || []).sort((a, b) => (b.titular - a.titular) || (cargos.indexOf(a.cargo) - cargos.indexOf(b.cargo)) || a.nombre.localeCompare(b.nombre, 'es'));
      const total = Number(grValorActual_(r, 'n_personas')) || 0;
      const cupos = Math.max(total, ps.length, 1);
      const base = [r.codigo_ref || '', claveRecurso_(r) || '', r.tipo_recurso || '', r.area || '', r.sector || '', total || ''];
      for (let i = 0; i < cupos; i++) {
        const p = ps[i];
        if (!p) vacias++;
        filas.push(base.concat([i + 1,
          p ? p.nombre : '', p ? p.rut : '', p ? p.cargo : (cargos.length === 1 ? cargos[0] : ''),
          p ? sn(p.titular) : '', p ? sn(p.conductor) : '', p ? sn(p.curso_call_fire) : '',
          p ? p.telefono || '' : '', p ? p.correo || '' : '', p ? p.direccion || '' : '',
          p && p.temporada != null ? Number(p.temporada) : '', p ? p.id : '']));
      }
    });
    const XLSX = await tbCargarSheetJs_();
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([GRP_PLANTILLA.map(c => c.h)].concat(filas));
    ws['!cols'] = GRP_PLANTILLA.map(c => ({ wch: c.w }));
    ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: filas.length, c: GRP_PLANTILLA.length - 1 } }) };
    ws['!freeze'] = { xSplit: 2, ySplit: 1 };
    XLSX.utils.book_append_sheet(wb, ws, 'Personas');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ['Tipo de recurso', 'Cargos válidos'],
      ['Brigada Multipropósito', 'Jefe de Brigada · Motosierrista · Manual'],
      ['Todos los demás tipos', 'Vigía'],
    ]), 'Cargos');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ['Plantilla de personas por recurso — Gestión de Recursos'], [''],
      ['1. Cada recurso tiene una fila por cupo (N° personas). Complete las filas vacías y corrija las que ya tienen datos.'],
      ['2. Obligatorios: Nombre completo, RUT (con dígito verificador) y Cargo (ver hoja «Cargos»).'],
      ['3. Titular: «Sí» en UNA sola persona por recurso (es la que aparece en la planilla del sistema). Conductor y Curso Call Fire: Sí / No.'],
      ['4. N° temporadas trabajando: número entero desde 1 (1 = primera temporada).'],
      ['5. NO modifique «ID recurso» ni «ID persona»: son las llaves para cruzar con el sistema. Las demás columnas del recurso son informativas.'],
      ['6. Si faltan cupos, copie una fila del mismo recurso (con el mismo ID recurso), borre el «ID persona» y complete los datos.'],
      ['7. Una fila sin nombre ni RUT se ignora. La carga NO elimina personas: para quitar a alguien use 🗑️ en 👥 Personas.'],
      ['8. En el sistema: Gestión de Recursos › ⬆️ Subir personas. Verá una vista previa antes de aplicar.'],
    ]), 'Instrucciones');
    const area = document.getElementById('gr-area').value;
    XLSX.writeFile(wb, 'plantilla_personas_' + tbHoyISO_() + (area ? '_' + normalizarBusqueda_(area).toUpperCase().replace(/[^\w.-]+/g, '_') : '') + '.xlsx');
    mostrarToast_('✅ Plantilla: ' + lista.length + ' recurso(s), ' + pers.length + ' persona(s) registradas y ' + vacias + ' cupo(s) por completar.');
  } catch (e) {
    mostrarToast_('No se pudo generar la plantilla: ' + (e.message || e));
  }
}

async function leerPlantillaPersonas_(archivo) {
  if (state.gr.sinSql147) { mostrarToast_('⚠️ Falta ejecutar en Supabase el SQL 147.'); return; }
  let filas;
  try {
    const XLSX = await tbCargarSheetJs_();
    const wb = XLSX.read(await archivo.arrayBuffer(), { type: 'array' });
    const hoja = wb.Sheets['Personas'] || wb.Sheets[wb.SheetNames[0]];
    filas = XLSX.utils.sheet_to_json(hoja, { defval: '', raw: true });
  } catch (e) { mostrarToast_('No se pudo leer el archivo: ' + (e.message || e)); return; }
  if (!filas.length) { mostrarToast_('El archivo no tiene filas.'); return; }
  // Encabezados → campos (tolera tildes, mayúsculas, «*» y textos entre paréntesis)
  const mapa = {};
  Object.keys(filas[0]).forEach(h => { const c = GRP_PLANTILLA.find(x => x.k && grpNormH_(x.h) === grpNormH_(h)); if (c) mapa[c.k] = h; });
  if (!mapa.codigo) { mostrarToast_('El archivo no tiene la columna «ID recurso»: use la 📋 Plantilla personas.'); return; }
  if (!mapa.nombre || !mapa.rut || !mapa.cargo) { mostrarToast_('Faltan columnas obligatorias (Nombre completo, RUT, Cargo): use la 📋 Plantilla personas.'); return; }
  const val = (f, k) => mapa[k] ? String(f[mapa[k]] == null ? '' : f[mapa[k]]).trim() : '';

  const porCodigo = {};
  state.gr.recursos.forEach(r => { if (r.codigo_ref) porCodigo[grCodigo_(r.codigo_ref)] = r; });
  const usados = [...new Set(filas.map(f => porCodigo[grCodigo_(val(f, 'codigo'))]).filter(Boolean).map(r => r.id))];
  let existentes;
  try { existentes = await grpPersonasDe_(usados); } catch (e) { mostrarToast_('No se pudieron leer las personas actuales: ' + (e.message || e)); return; }
  const porRec = {}; existentes.forEach(p => { (porRec[p.recurso_id] = porRec[p.recurso_id] || []).push(p); });

  const cambios = [], errores = [], noEnc = [];
  let vacias = 0, iguales = 0;
  filas.forEach((f, i) => {
    const fila = i + 2, cod = val(f, 'codigo');
    const nombre = val(f, 'nombre').replace(/\s+/g, ' '), rutTxt = val(f, 'rut');
    if (!nombre && !rutTxt) { vacias++; return; }   // cupo sin completar
    const err = msg => errores.push({ fila, codigo: cod, msg });
    if (!cod) return err('Falta el ID recurso');
    const r = porCodigo[grCodigo_(cod)];
    if (!r) { noEnc.push(cod); return; }
    if (!grPuedeEditar_(r)) return err('No puedes editar este recurso (fuera de tus áreas)');
    if (!nombre) return err('Falta el nombre completo');
    const rut = grRut_(rutTxt);
    if (!rut.v) return err('Falta el RUT');
    if (!rut.ok) return err(rut.msg + ': «' + rutTxt + '»');
    const cargos = grCargosDe_(r.tipo_recurso);
    const cargo = cargos.find(c => grpNormH_(c) === grpNormH_(val(f, 'cargo')));
    if (!cargo) return err('Cargo «' + (val(f, 'cargo') || 'vacío') + '» no válido para ' + aTitulo_(r.tipo_recurso || '') + ' (' + cargos.join(', ') + ')');
    const tel = grNormalizar_({ tipo: 'tel' }, val(f, 'telefono'));
    if (!tel.ok) return err(tel.msg + ': «' + val(f, 'telefono') + '»');
    const mail = grNormalizar_({ tipo: 'mail' }, val(f, 'correo'));
    if (!mail.ok) return err('Correo inválido: «' + val(f, 'correo') + '»');
    const tempTxt = val(f, 'temporada');
    if (tempTxt && !(/^\d{1,2}$/.test(tempTxt) && Number(tempTxt) >= 1)) return err('N° temporadas debe ser un entero desde 1: «' + tempTxt + '»');
    const persona = {
      nombre, rut: rut.v, cargo, titular: grpSiNo_(val(f, 'titular')), conductor: grpSiNo_(val(f, 'conductor')),
      curso_call_fire: grpSiNo_(val(f, 'curso_call_fire')), telefono: tel.v, correo: mail.v, direccion: val(f, 'direccion'),
      temporada: tempTxt ? Number(tempTxt) : null };
    // ¿Persona existente? Por «ID persona» y si no, por RUT dentro del mismo recurso
    const ps = porRec[r.id] || [];
    const idTxt = val(f, 'id');
    const previa = ps.find(p => p.id === idTxt) || ps.find(p => grCodigo_(p.rut) === grCodigo_(rut.v));
    if (previa) {
      persona.id = previa.id;
      const igual = previa.nombre === persona.nombre && grCodigo_(previa.rut) === grCodigo_(persona.rut) && previa.cargo === persona.cargo &&
        !!previa.titular === persona.titular && !!previa.conductor === persona.conductor && !!previa.curso_call_fire === persona.curso_call_fire &&
        (previa.telefono || '') === persona.telefono && (previa.correo || '') === persona.correo && (previa.direccion || '') === persona.direccion &&
        (previa.temporada == null ? null : Number(previa.temporada)) === persona.temporada;
      if (igual) { iguales++; return; }
    }
    cambios.push({ fila, r, codigo: cod, persona, previa });
  });
  // Coherencia por recurso: un RUT una sola vez y un solo titular en el archivo
  const grupos = {};
  cambios.forEach(c => { (grupos[c.r.id] = grupos[c.r.id] || []).push(c); });
  const malas = new Set();
  Object.values(grupos).forEach(cs => {
    const ruts = {};
    cs.forEach(c => { const k = grCodigo_(c.persona.rut); if (ruts[k]) { malas.add(c); errores.push({ fila: c.fila, codigo: c.codigo, msg: 'RUT repetido en el mismo recurso (fila ' + ruts[k] + ')' }); } else ruts[k] = c.fila; });
    const tit = cs.filter(c => c.persona.titular);
    if (tit.length > 1) tit.forEach(c => { malas.add(c); errores.push({ fila: c.fila, codigo: c.codigo, msg: 'Más de un titular en el recurso (filas ' + tit.map(x => x.fila).join(', ') + ')' }); });
  });
  const validos = cambios.filter(c => !malas.has(c));
  errores.sort((a, b) => a.fila - b.fila);
  state.gr.carga = { tipo: 'personas', cambios: validos };
  mostrarVistaPreviaPersonas_(archivo.name, filas.length, validos, iguales, vacias, noEnc, errores);
}

function mostrarVistaPreviaPersonas_(nombre, nFilas, cambios, iguales, vacias, noEnc, errores) {
  const nuevas = cambios.filter(c => !c.previa).length;
  const sn = b => b ? 'Sí' : 'No';
  let html = '<div><b>' + escapeHtml_(nombre) + '</b> · ' + nFilas + ' filas leídas · ' +
      [...new Set(cambios.map(c => c.r.id))].length + ' recurso(s) con cambios</div>' +
    '<div class="gr-kpis">' +
    '<div class="gr-kpi" style="--c:#16A34A"><b>' + nuevas + '</b>personas nuevas</div>' +
    '<div class="gr-kpi" style="--c:#2563EB"><b>' + (cambios.length - nuevas) + '</b>personas actualizadas</div>' +
    '<div class="gr-kpi" style="--c:#64748B"><b>' + iguales + '</b>sin cambios</div>' +
    '<div class="gr-kpi" style="--c:#94A3B8"><b>' + vacias + '</b>cupos vacíos (se ignoran)</div>' +
    '<div class="gr-kpi" style="--c:#DC2626"><b>' + errores.length + '</b>filas con error (no se aplican)</div>' +
    (noEnc.length ? '<div class="gr-kpi" style="--c:#F59E0B"><b>' + noEnc.length + '</b>ID recurso no encontrados</div>' : '') + '</div>';
  if (errores.length) html += '<div><b>⚠️ Errores</b><table><tr><th>Fila</th><th>ID recurso</th><th>Detalle</th></tr>' +
    errores.slice(0, 150).map(e => '<tr><td>' + e.fila + '</td><td>' + escapeHtml_(e.codigo) + '</td><td>' + escapeHtml_(e.msg) + '</td></tr>').join('') +
    '</table>' + (errores.length > 150 ? '<small>… y ' + (errores.length - 150) + ' más</small>' : '') + '</div>';
  if (noEnc.length) html += '<div><b>ID recurso no encontrados</b> (o fuera de tus áreas; la fila se omite): ' + escapeHtml_([...new Set(noEnc)].slice(0, 60).join(', ')) + '</div>';
  if (cambios.length) {
    const campos = [['nombre', 'Nombre'], ['rut', 'RUT'], ['cargo', 'Cargo'], ['titular', 'Titular', sn], ['conductor', 'Conductor', sn], ['curso_call_fire', 'Call Fire', sn],
      ['telefono', 'Teléfono'], ['correo', 'Correo'], ['direccion', 'Dirección'], ['temporada', 'Temporadas']];
    html += '<div><b>Cambios</b><table><tr><th>Fila</th><th>Recurso</th><th>Persona</th><th>Acción</th><th>Detalle</th></tr>' +
      cambios.slice(0, 400).map(c => {
        const det = c.previa
          ? campos.filter(([k, , fmt]) => { const a = c.previa[k] == null ? '' : c.previa[k], b = c.persona[k] == null ? '' : c.persona[k]; return fmt ? !!a !== !!b : String(a) !== String(b); })
              .map(([k, t, fmt]) => t + ': <span class="gr-antes">' + escapeHtml_(fmt ? fmt(c.previa[k]) : (c.previa[k] == null || c.previa[k] === '' ? '(vacío)' : String(c.previa[k]))) + '</span> → <span class="gr-despues">' +
                escapeHtml_(fmt ? fmt(c.persona[k]) : (c.persona[k] == null || c.persona[k] === '' ? '(vacío)' : String(c.persona[k]))) + '</span>').join(' · ')
          : escapeHtml_(c.persona.cargo) + (c.persona.titular ? ' · ⭐ titular' : '') + (c.persona.conductor ? ' · 🚗' : '') + (c.persona.curso_call_fire ? ' · 🎓' : '');
        return '<tr><td>' + c.fila + '</td><td><b>📻 ' + escapeHtml_(claveRecurso_(c.r) || c.codigo) + '</b></td><td>' + escapeHtml_(c.persona.nombre) + '<br><small>' + escapeHtml_(c.persona.rut) + '</small></td>' +
          '<td>' + (c.previa ? '✏️ Actualiza' : '➕ Nueva') + '</td><td>' + det + '</td></tr>';
      }).join('') + '</table>' + (cambios.length > 400 ? '<small>… y ' + (cambios.length - 400) + ' más</small>' : '') + '</div>';
  } else html += '<div class="tb-vacio">No hay personas nuevas ni cambios respecto de lo que está en el sistema.</div>';
  document.getElementById('gr-modal-titulo').textContent = 'Vista previa · carga masiva de personas';
  document.getElementById('gr-modal-cuerpo').innerHTML = html;
  const ap = document.getElementById('gr-modal-aplicar');
  ap.style.display = cambios.length ? '' : 'none';
  ap.disabled = false;
  ap.textContent = '✅ Aplicar ' + cambios.length + ' persona(s)';
  document.getElementById('gr-modal').style.display = 'flex';
}

async function aplicarCargaPersonas_() {
  const carga = state.gr.carga;
  if (!carga || !carga.cambios.length) return;
  const ap = document.getElementById('gr-modal-aplicar');
  ap.disabled = true;
  let ok = 0, nuevas = 0; const errores = [];
  try {
    for (let i = 0; i < carga.cambios.length; i += 100) {
      ap.textContent = 'Aplicando ' + Math.min(i + 100, carga.cambios.length) + ' de ' + carga.cambios.length + '…';
      const lote = carga.cambios.slice(i, i + 100).map(c => ({ fila: c.fila, recurso_id: c.r.id, persona: c.persona }));
      const { data, error } = await supabaseClient.rpc('cargar_personas_masivo', { p_filas: lote });
      if (error) throw error;
      ok += Number(data && data.guardadas) || 0;
      nuevas += Number(data && data.nuevas) || 0;
      errores.push(...((data && data.errores) || []));
    }
  } catch (e) {
    ap.disabled = false; ap.textContent = '✅ Reintentar';
    mostrarToast_(/cargar_personas_masivo/.test(e.message || '') ? 'Falta ejecutar en Supabase el SQL 149.' : 'Error al aplicar la carga: ' + (e.message || e));
    return;
  }
  document.getElementById('gr-modal').style.display = 'none';
  state.gr.carga = null;
  await cargarPersonasGestion_();
  // La planilla muestra al titular: releer el contacto (lo actualiza el trigger del SQL 147)
  try {
    const { data: cs } = await supabaseClient.from('recurso_contacto').select('recurso_id, nombre_persona, rut, telefono, mail');
    const m = {}; (cs || []).forEach(c => { m[c.recurso_id] = c; });
    state.gr.recursos.forEach(r => { const c = m[r.id]; GR_CONTACTO.forEach(k => { r[k] = c ? c[k] : null; }); });
  } catch (e) { /* se ve al recargar */ }
  renderGestion_();
  if (errores.length) { console.warn('Carga de personas, errores:', errores); mostrarToast_('⚠️ Guardadas ' + ok + ' (' + nuevas + ' nuevas); con error ' + errores.length + ' (fila ' + errores[0].fila + ': ' + errores[0].error + ')'); }
  else mostrarToast_('✅ Carga de personas aplicada: ' + nuevas + ' nuevas y ' + (ok - nuevas) + ' actualizadas.');
}

/* ── Descarga ── */
async function descargarGestion_() {
  const lista = grFiltrados_();
  if (!lista.length) { mostrarToast_('No hay recursos para descargar con estos filtros.'); return; }
  const filas = lista.map(r => GR_COLS.reduce((o, c) => {
    let v = grValorActual_(r, c.k);
    if (c.tipo === 'num' && v !== '') v = Number(v);
    o[c.t] = v; return o; }, {}));
  try {
    mostrarToast_('Generando Excel…');
    const XLSX = await tbCargarSheetJs_();
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(filas, { header: GR_COLS.map(c => c.t) });
    ws['!cols'] = GR_COLS.map(c => ({ wch: Math.max(10, Math.min(36, Math.round((c.w || 110) / 6))) }));
    ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: filas.length, c: GR_COLS.length - 1 } }) };
    XLSX.utils.book_append_sheet(wb, ws, 'Recursos');
    // 👥 Hoja «Personas» (SQL 147): todas las personas de los recursos descargados (solo informativa)
    if (!state.gr.sinSql147) {
      const ids = lista.map(r => r.id), pers = [];
      for (let i = 0; i < ids.length; i += 150) {
        const { data, error } = await supabaseClient.from('recurso_personas').select('*').in('recurso_id', ids.slice(i, i + 150));
        if (error) break;
        pers.push(...(data || []));
      }
      const porId = {}; lista.forEach(r => { porId[r.id] = r; });
      const sn = b => b ? 'Sí' : 'No';
      const filasP = pers.map(p => { const r = porId[p.recurso_id] || {}; return {
        'Clave radial': claveRecurso_(r) || '', 'ID': r.codigo_ref || '', 'Tipo de recurso': r.tipo_recurso || '', 'Área': r.area || '',
        'Nombre completo': p.nombre, 'RUT': p.rut, 'Cargo': p.cargo, 'Titular': sn(p.titular), 'Conductor': sn(p.conductor),
        'Curso Call Fire': sn(p.curso_call_fire), 'Teléfono': p.telefono || '', 'Correo': p.correo || '', 'Dirección': p.direccion || '', 'N° temporadas': p.temporada == null ? '' : Number(p.temporada) }; })
        .sort((a, b) => String(a['Área']).localeCompare(String(b['Área']), 'es') || String(a.ID).localeCompare(String(b.ID), 'es', { numeric: true }) ||
          (a.Titular === 'Sí' ? -1 : b.Titular === 'Sí' ? 1 : 0));
      const wsP = XLSX.utils.json_to_sheet(filasP, { header: ['Clave radial', 'ID', 'Tipo de recurso', 'Área', 'Nombre completo', 'RUT', 'Cargo', 'Titular',
        'Conductor', 'Curso Call Fire', 'Teléfono', 'Correo', 'Dirección', 'N° temporadas'] });
      wsP['!cols'] = [12, 12, 22, 16, 30, 13, 16, 8, 10, 14, 14, 26, 30, 11].map(wch => ({ wch }));
      XLSX.utils.book_append_sheet(wb, wsP, 'Personas');
    }
    const instr = [
      ['Gestión de Recursos — instrucciones para la carga masiva (Administrador y Jefe de Área)'], [''],
      ['1. Edite los datos en la hoja «Recursos» y guarde el archivo (.xlsx).'],
      ['2. En el sistema: Planificador CMPC › Gestión de Recursos › ⬆️ Subir Excel. Verá una vista previa antes de aplicar.'],
      ['3. La columna «ID» es la llave: NO la modifique. Si cambia, la fila se informa como «ID no encontrado».'],
      ['4. Subgerencia y Área son informativas (no se actualizan desde el Excel).'],
      ['5. Una celda vacía borra el dato. Puede eliminar columnas que no quiera actualizar.'],
      ['6. Fechas: AAAA-MM-DD o DD-MM-AAAA. RUT: con o sin puntos, con guion y dígito verificador.'],
      ['7. Las columnas del Titular y la hoja «Personas» son informativas: las personas se registran en el sistema con el botón 👥 Personas de cada recurso.'],
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(instr), 'Instrucciones');
    const area = document.getElementById('gr-area').value;
    XLSX.writeFile(wb, 'gestion_recursos_' + tbHoyISO_() + (area ? '_' + normalizarBusqueda_(area).toUpperCase().replace(/[^\w.-]+/g, '_') : '') + '.xlsx');
    mostrarToast_('✅ Descargado: ' + filas.length + ' recursos.');
  } catch (e) {
    mostrarToast_('No se pudo generar el Excel: ' + (e.message || e));
  }
}

/* ── Descarga compacta para verificar (PDF por área) ──
 * Por área: resumen de recursos disponibles (total, personas, activos hoy, por activar, contacto)
 * y por tipo, más el listado compacto con una casilla «Verificado» y firma del Jefe de Área.
 * Con más de un área, la primera hoja es el resumen por área. Respeta los filtros vigentes. */
function grEstadoHoy_(r, hoy) {
  const ini = grValorActual_(r, 'fecha_inicio_operacion'), fin = grValorActual_(r, 'fecha_termino_operacion');
  if (!ini) return 'sin';
  if (ini > hoy) return 'prox';
  if (fin && fin < hoy) return 'fin';
  return 'activo';
}
function grResumenArea_(rs, hoy) {
  const e = rs.map(r => grEstadoHoy_(r, hoy));
  return {
    total: rs.length,
    personas: rs.reduce((s, r) => s + (Number(r.n_personas) || 0), 0),
    activos: e.filter(x => x === 'activo').length,
    prox: e.filter(x => x === 'prox').length,
    sin: e.filter(x => x === 'sin').length,
    contacto: rs.filter(r => GR_CONTACTO.every(k => grValorActual_(r, k) !== '')).length,
  };
}
async function descargarResumenGestionPdf_() {
  const { jsPDF } = window.jspdf || {};
  if (!jsPDF) { mostrarToast_('No se pudo cargar la librería de PDF.'); return; }
  const lista = grFiltrados_();
  if (!lista.length) { mostrarToast_('No hay recursos con estos filtros.'); return; }
  const hoy = tbHoyISO_();
  const fmt = iso => iso ? iso.slice(8, 10) + '-' + iso.slice(5, 7) + '-' + iso.slice(0, 4) : '—';
  const areas = [...new Set(lista.map(r => r.area || 'Sin área'))].sort((a, b) => a.localeCompare(b, 'es'));
  const porArea = a => lista.filter(r => (r.area || 'Sin área') === a);
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const W = 297, H = 210, M = 10;
  const quien = (state.perfil && (state.perfil.nombre_completo || state.perfil.perfil)) || '';
  const corta = (t, ancho) => {
    t = String(t == null ? '' : t);
    if (doc.getTextWidth(t) <= ancho) return t;
    while (t.length > 1 && doc.getTextWidth(t + '…') > ancho) t = t.slice(0, -1);
    return t + '…';
  };
  const cabecera = (titulo, sub) => {
    doc.setFillColor(15, 23, 42); doc.rect(0, 0, W, 17, 'F');
    doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(14);
    doc.text(titulo, M, 8.5);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5);
    doc.text(sub, M, 13.5);
    doc.text('Emitido ' + fmt(hoy) + (quien ? ' · ' + quien : ''), W - M, 8.5, { align: 'right' });
    doc.setTextColor(30, 41, 59);
  };
  const chips = (res, y) => {
    const items = [['Recursos', res.total, [37, 99, 235]], ['Personas', res.personas, [124, 58, 237]], ['Activos hoy', res.activos, [22, 163, 74]],
      ['Por activar', res.prox, [217, 119, 6]], ['Sin fecha inicio', res.sin, [220, 38, 38]], ['Contacto completo', res.contacto + ' / ' + res.total, [71, 85, 105]]];
    const w = (W - 2 * M - 5 * 3) / 6;
    items.forEach(([t, n, c], i) => {
      const x = M + i * (w + 3);
      doc.setDrawColor(226, 232, 240); doc.setFillColor(255, 255, 255); doc.roundedRect(x, y, w, 12, 1.5, 1.5, 'FD');
      doc.setFillColor(c[0], c[1], c[2]); doc.rect(x, y, 1.2, 12, 'F');
      doc.setTextColor(c[0], c[1], c[2]); doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.text(String(n), x + 4, y + 6.5);
      doc.setTextColor(71, 85, 105); doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.text(t, x + 4, y + 10.3);
    });
    doc.setTextColor(30, 41, 59);
    return y + 15;
  };
  // Tabla genérica con cabecera repetida en cada hoja
  const tabla = (cols, filas, y, alNuevaHoja, colorFila) => {
    const alto = 5.4;
    const cab = () => {
      doc.setFillColor(241, 245, 249); doc.rect(M, y, W - 2 * M, 6, 'F');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(71, 85, 105);
      let x = M; cols.forEach(c => { doc.text(c.t, c.der ? x + c.w - 1.5 : x + 1.5, y + 4, c.der ? { align: 'right' } : undefined); x += c.w; });
      y += 6; doc.setTextColor(30, 41, 59);
    };
    cab();
    filas.forEach((f, i) => {
      if (y + alto > H - 16) { doc.addPage(); y = alNuevaHoja(); cab(); }
      if (i % 2) { doc.setFillColor(248, 250, 252); doc.rect(M, y, W - 2 * M, alto, 'F'); }
      if (colorFila) colorFila(f, y, alto);
      let x = M;
      cols.forEach(c => {
        const v = f[c.k];
        doc.setFont('helvetica', c.neg ? 'bold' : 'normal'); doc.setFontSize(7.3);
        if (c.caja) { doc.setDrawColor(100, 116, 139); doc.rect(x + c.w / 2 - 1.8, y + 1, 3.6, 3.6); }
        else if (c.der) doc.text(String(v == null ? '' : v), x + c.w - 1.5, y + 3.8, { align: 'right' });
        else doc.text(corta(v, c.w - 3), x + 1.5, y + 3.8);
        x += c.w;
      });
      doc.setDrawColor(226, 232, 240); doc.line(M, y + alto, W - M, y + alto);
      y += alto;
    });
    return y;
  };

  // 1) Resumen por área (si hay más de una)
  if (areas.length > 1) {
    cabecera('Resumen de recursos disponibles por área', areas.length + ' áreas · ' + lista.length + ' recursos');
    let y = chips(grResumenArea_(lista, hoy), 21) + 2;
    const cols = [{ k: 'subg', t: 'Subgerencia', w: 48 }, { k: 'area', t: 'Área', w: 58, neg: true }, { k: 'total', t: 'Recursos', w: 22, der: true },
      { k: 'personas', t: 'Personas', w: 22, der: true }, { k: 'activos', t: 'Activos hoy', w: 24, der: true }, { k: 'prox', t: 'Por activar', w: 24, der: true },
      { k: 'sin', t: 'Sin fecha', w: 20, der: true }, { k: 'contacto', t: 'Contacto completo', w: 30, der: true }, { k: 'pct', t: '% contacto', w: 29, der: true }];
    const filas = areas.map(a => { const rs = porArea(a), s = grResumenArea_(rs, hoy);
      return Object.assign({ subg: rs[0].subgerencia || '—', area: a, pct: Math.round(s.contacto / s.total * 100) + ' %' }, s); });
    tabla(cols, filas, y, () => { cabecera('Resumen de recursos disponibles por área', '(continuación)'); return 21; });
  }

  // 2) Una sección por área
  const ESTADO = { activo: 'Activo', prox: 'Por activar', fin: 'Finalizado', sin: 'Sin fecha' };
  areas.forEach((a, ia) => {
    if (areas.length > 1 || ia > 0) doc.addPage();
    const rs = porArea(a).slice().sort((x, z) => compararTipoRecurso_(x.tipo_recurso, z.tipo_recurso) ||
      String(claveRecurso_(x) || '').localeCompare(String(claveRecurso_(z) || ''), 'es', { numeric: true }));
    const s = grResumenArea_(rs, hoy);
    const titulo = 'Recursos disponibles · ' + a;
    const sub = (rs[0].subgerencia ? 'Subgerencia ' + rs[0].subgerencia + ' · ' : '') + 'Listado para verificación del Jefe de Área';
    cabecera(titulo, sub);
    let y = chips(s, 21);
    // Por tipo (una línea compacta de casillas)
    const tipos = {};
    rs.forEach(r => { const t = aTitulo_(r.tipo_recurso || 'Sin tipo'); tipos[t] = tipos[t] || { n: 0, p: 0 }; tipos[t].n++; tipos[t].p += Number(r.n_personas) || 0; });
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(71, 85, 105);
    doc.text('POR TIPO', M, y + 3.5);
    let x = M + 16;
    doc.setFont('helvetica', 'normal');
    Object.keys(tipos).sort(compararTipoRecurso_).forEach(t => {
      const txt = t + ': ' + tipos[t].n + (tipos[t].p ? ' (' + tipos[t].p + ' pers.)' : '');
      const w = doc.getTextWidth(txt) + 5;
      if (x + w > W - M) { x = M + 16; y += 6; }
      doc.setFillColor(241, 245, 249); doc.roundedRect(x, y, w, 5, 1.2, 1.2, 'F');
      doc.setTextColor(30, 41, 59); doc.text(txt, x + 2.5, y + 3.5);
      x += w + 2;
    });
    y += 8;
    const cols = [{ k: 'n', t: '#', w: 7, der: true }, { k: 'clave', t: 'Clave radial', w: 22, neg: true }, { k: 'id', t: 'ID', w: 20 },
      { k: 'tipo', t: 'Tipo', w: 38 }, { k: 'sector', t: 'Sector', w: 26 }, { k: 'turno', t: 'Turno', w: 16 }, { k: 'horario', t: 'Horario', w: 21 },
      { k: 'pers', t: 'Pers.', w: 10, der: true }, { k: 'inicio', t: 'Inicio', w: 17 }, { k: 'estado', t: 'Estado hoy', w: 17 },
      { k: 'persona', t: 'Persona a cargo', w: 45 }, { k: 'tel', t: 'Teléfono', w: 28 }, { k: 'ok', t: 'Verif.', w: 10, caja: true }];
    const filas = rs.map((r, i) => ({ n: i + 1, clave: claveRecurso_(r) || '—', id: r.codigo_ref || '—', tipo: aTitulo_(r.tipo_recurso || ''),
      sector: r.sector || '', turno: aTitulo_(r.actividad || ''), horario: r.horario || '', pers: r.n_personas ?? '',
      inicio: fmt(grValorActual_(r, 'fecha_inicio_operacion')), estadoK: grEstadoHoy_(r, hoy), estado: ESTADO[grEstadoHoy_(r, hoy)],
      persona: grValorActual_(r, 'nombre_persona') || '— falta —', tel: grValorActual_(r, 'telefono') || '—' }));
    const colorEstado = { activo: [22, 163, 74], prox: [217, 119, 6], fin: [148, 163, 184], sin: [220, 38, 38] };
    y = tabla(cols, filas, y, () => { cabecera(titulo, sub + ' (continuación)'); return 21; },
      (f, yy, alto) => { const c = colorEstado[f.estadoK]; doc.setFillColor(c[0], c[1], c[2]); doc.rect(M, yy, 1, alto, 'F'); });
    // Firma
    if (y + 16 > H - 10) { doc.addPage(); cabecera(titulo, sub + ' (continuación)'); y = 21; }
    y += 9;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(71, 85, 105); doc.setDrawColor(100, 116, 139);
    doc.text('Observaciones:', M, y); doc.line(M + 23, y + 0.5, M + 150, y + 0.5);
    doc.text('Firma Jefe de Área:', M + 160, y); doc.line(M + 189, y + 0.5, W - M - 32, y + 0.5);
    doc.text('Fecha:', W - M - 30, y); doc.line(W - M - 19, y + 0.5, W - M, y + 0.5);
  });

  // Pie con número de hoja
  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(148, 163, 184);
    doc.text('SIG Copamiento Territorial · Gestión de Recursos · Datos personales: uso interno', M, H - 5);
    doc.text('Hoja ' + i + ' de ' + n, W - M, H - 5, { align: 'right' });
  }
  const nombre = 'resumen_recursos_' + (areas.length === 1 ? normalizarBusqueda_(areas[0]).toUpperCase().replace(/[^\w.-]+/g, '_') + '_' : '') + hoy + '.pdf';
  doc.save(nombre);
  mostrarToast_('✅ Resumen descargado: ' + lista.length + ' recursos en ' + areas.length + ' área(s).');
}

/* ── Carga masiva (Administrador) ── */
async function leerExcelGestion_(archivo) {
  if (!grEsAdmin_()) { mostrarToast_('Solo el Administrador o el Jefe de Área pueden hacer cargas masivas.'); return; }
  if (state.gr.sinSql92) { mostrarToast_('Falta ejecutar el SQL 92 en Supabase.'); return; }
  let filas;
  try {
    const XLSX = await tbCargarSheetJs_();
    const wb = XLSX.read(await archivo.arrayBuffer(), { type: 'array', cellDates: true });
    const hoja = wb.Sheets['Recursos'] || wb.Sheets[wb.SheetNames[0]];
    filas = XLSX.utils.sheet_to_json(hoja, { defval: '', raw: true });
  } catch (e) { mostrarToast_('No se pudo leer el archivo: ' + (e.message || e)); return; }
  if (!filas.length) { mostrarToast_('El archivo no tiene filas.'); return; }

  // Encabezados → campos (tolera tildes, mayúsculas y el nombre del Tablero «Código (ID_BG)»)
  const norm = s => normalizarBusqueda_(String(s || '')).replace(/[^a-z0-9]/g, '');
  const alias = { id: 'codigo_ref', codigoidbg: 'codigo_ref', idbg: 'codigo_ref', codigo: 'codigo_ref', clave: 'alias', clavealias: 'alias',
    nombre: 'nombre_persona', persona: 'nombre_persona', correo: 'mail', email: 'mail', telefono: 'telefono', fono: 'telefono', celular: 'telefono' };
  const mapa = {};
  Object.keys(filas[0]).forEach(h => {
    const n = norm(h);
    const col = GR_COLS.find(c => norm(c.t) === n || norm(c.k) === n);
    const k = col ? col.k : alias[n];
    if (k) mapa[h] = k;
  });
  const hId = Object.keys(mapa).find(h => mapa[h] === 'codigo_ref');
  if (!hId) { mostrarToast_('El archivo no tiene la columna «ID»: no se puede cruzar con los recursos.'); return; }
  const editables = Object.keys(mapa).filter(h => { const c = GR_COLS.find(x => x.k === mapa[h]); return c && c.ed; });
  if (!editables.length) { mostrarToast_('El archivo no tiene columnas editables reconocidas.'); return; }

  const porCodigo = {};
  state.gr.recursos.forEach(r => { if (r.codigo_ref) porCodigo[grCodigo_(r.codigo_ref)] = r; });
  const cambios = [], noEncontrados = [], errores = [], vistos = {}, duplicados = [];
  filas.forEach((f, i) => {
    const cod = String(f[hId] || '').trim();
    if (!cod) return;
    const r = porCodigo[grCodigo_(cod)];
    if (!r) { noEncontrados.push(cod); return; }
    if (vistos[r.id]) { duplicados.push(cod); return; }
    vistos[r.id] = true;
    const datos = {}, det = [];
    editables.forEach(h => {
      const col = GR_COLS.find(c => c.k === mapa[h]);
      const n = grNormalizar_(col, f[h]);
      if (!n.ok) { errores.push({ fila: i + 2, codigo: cod, campo: col.t, msg: n.msg + ': «' + n.v + '»' }); return; }
      const antes = grValorActual_(r, col.k);
      if (n.v !== antes) { datos[col.k] = n.v; det.push({ campo: col.t, antes, despues: n.v }); }
    });
    if (det.length) cambios.push({ r, codigo: r.codigo_ref, datos, det });
  });
  state.gr.carga = { cambios };
  mostrarVistaPreviaCarga_(archivo.name, filas.length, editables.map(h => mapa[h]), cambios, noEncontrados, duplicados, errores);
}

function mostrarVistaPreviaCarga_(nombre, nFilas, campos, cambios, noEnc, dup, errores) {
  const nCampos = cambios.reduce((s, c) => s + c.det.length, 0);
  const titulos = campos.map(k => (GR_COLS.find(c => c.k === k) || {}).t).filter(Boolean);
  let html = '<div><b>' + escapeHtml_(nombre) + '</b> · ' + nFilas + ' filas leídas · columnas que se actualizan: ' + escapeHtml_(titulos.join(', ')) + '</div>' +
    '<div class="gr-kpis">' +
    '<div class="gr-kpi" style="--c:#2563EB"><b>' + cambios.length + '</b>recursos con cambios</div>' +
    '<div class="gr-kpi" style="--c:#7C3AED"><b>' + nCampos + '</b>datos que cambian</div>' +
    '<div class="gr-kpi" style="--c:#DC2626"><b>' + errores.length + '</b>valores con error (no se aplican)</div>' +
    '<div class="gr-kpi" style="--c:#F59E0B"><b>' + noEnc.length + '</b>ID no encontrados</div>' +
    (dup.length ? '<div class="gr-kpi" style="--c:#64748B"><b>' + dup.length + '</b>ID repetidos (se usa la 1ª fila)</div>' : '') + '</div>';
  if (errores.length) html += '<div><b>⚠️ Errores</b><table><tr><th>Fila</th><th>ID</th><th>Campo</th><th>Detalle</th></tr>' +
    errores.slice(0, 100).map(e => '<tr><td>' + e.fila + '</td><td>' + escapeHtml_(e.codigo) + '</td><td>' + escapeHtml_(e.campo) + '</td><td>' + escapeHtml_(e.msg) + '</td></tr>').join('') +
    '</table>' + (errores.length > 100 ? '<small>… y ' + (errores.length - 100) + ' más</small>' : '') + '</div>';
  if (noEnc.length) html += '<div><b>ID no encontrados</b> (la fila se omite): ' + escapeHtml_(noEnc.slice(0, 60).join(', ')) + (noEnc.length > 60 ? '…' : '') + '</div>';
  if (cambios.length) {
    const filasDet = [];
    cambios.forEach(c => c.det.forEach(d => filasDet.push('<tr><td><b>📻 ' + escapeHtml_(claveRecurso_(c.r) || '—') + '</b></td><td>' + escapeHtml_(c.codigo) + '</td><td>' +
      escapeHtml_(d.campo) + '</td><td class="gr-antes">' + escapeHtml_(d.antes || '(vacío)') + '</td><td class="gr-despues">' + escapeHtml_(d.despues || '(vacío)') + '</td></tr>')));
    html += '<div><b>Cambios</b><table><tr><th>Clave radial</th><th>ID</th><th>Campo</th><th>Antes</th><th>Después</th></tr>' +
      filasDet.slice(0, 400).join('') + '</table>' + (filasDet.length > 400 ? '<small>… y ' + (filasDet.length - 400) + ' más</small>' : '') + '</div>';
  } else html += '<div class="tb-vacio">No hay cambios respecto de lo que está en el sistema.</div>';
  document.getElementById('gr-modal-titulo').textContent = 'Vista previa de la carga masiva';
  document.getElementById('gr-modal-cuerpo').innerHTML = html;
  const ap = document.getElementById('gr-modal-aplicar');
  ap.style.display = cambios.length ? '' : 'none';
  ap.disabled = false;
  ap.textContent = '✅ Aplicar ' + cambios.length + ' recurso(s)';
  document.getElementById('gr-modal').style.display = 'flex';
}

async function aplicarCargaGestion_() {
  if (state.gr.carga && state.gr.carga.tipo === 'personas') return aplicarCargaPersonas_();   // ⬆️ Subir personas (SQL 149)
  const carga = state.gr.carga;
  if (!carga || !carga.cambios.length) return;
  const ap = document.getElementById('gr-modal-aplicar');
  ap.disabled = true;
  let ok = 0; const errores = [], noEnc = [];
  try {
    for (let i = 0; i < carga.cambios.length; i += 100) {
      ap.textContent = 'Aplicando ' + Math.min(i + 100, carga.cambios.length) + ' de ' + carga.cambios.length + '…';
      const lote = carga.cambios.slice(i, i + 100).map(c => ({ codigo: c.codigo, datos: c.datos }));
      const { data, error } = await supabaseClient.rpc('actualizar_recursos_masivo', { p_filas: lote });
      if (error) throw error;
      ok += Number(data && data.actualizados) || 0;
      errores.push(...((data && data.errores) || []));
      noEnc.push(...((data && data.no_encontrados) || []));
    }
  } catch (e) {
    ap.disabled = false; ap.textContent = '✅ Reintentar';
    mostrarToast_('Error al aplicar la carga: ' + (e.message || e));
    return;
  }
  document.getElementById('gr-modal').style.display = 'none';
  state.gr.carga = null;
  state.pl.cargado = false;
  state.gr.recursos = [];
  await abrirGestionRecursos_(true);
  if (errores.length) { console.warn('Carga masiva, errores:', errores); mostrarToast_('⚠️ Actualizados ' + ok + '; con error ' + errores.length + ' (' + errores[0].codigo + ': ' + errores[0].error + ')'); }
  else mostrarToast_('✅ Carga masiva aplicada: ' + ok + ' recurso(s) actualizados' + (noEnc.length ? '; ' + noEnc.length + ' sin coincidencia' : '') + '.');
}

function iniciarListenersGestion_() {
  selMultiple_('gr-sector', 'sectores'); selMultiple_('gr-tipo', 'tipos'); selMultiple_('gr-empresa', 'empresas');   // ☑️ varios a la vez
  let tBuscar = null;
  document.getElementById('gr-buscar').addEventListener('input', () => { clearTimeout(tBuscar); tBuscar = setTimeout(renderGestion_, 200); });
  document.getElementById('gr-subg').addEventListener('change', () => { poblarFiltrosGestion_(); renderGestion_(); });
  document.getElementById('gr-area').addEventListener('change', () => { poblarFiltrosGestion_(); renderGestion_(); });   // repuebla los sectores del área
  document.getElementById('gr-sector').addEventListener('change', () => { poblarFiltrosGestion_(); renderGestion_(); });   // repuebla los tipos del sector
  document.getElementById('gr-tipo').addEventListener('change', () => { poblarFiltrosGestion_(); renderGestion_(); });   // repuebla las empresas del tipo
  document.getElementById('gr-contacto').addEventListener('change', renderGestion_);
  document.getElementById('gr-tabla').addEventListener('change', e => { if (e.target.matches('input[data-gr-id], select[data-gr-id]')) grRegistrarCambio_(e.target); });
  document.getElementById('gr-empresa').addEventListener('change', () => renderGestion_());
  document.getElementById('gr-empresas').addEventListener('click', abrirEmpresasGestion_);
  // 🧩 Columnas visibles
  const pop = document.getElementById('gr-cols-pop');
  document.getElementById('gr-columnas').addEventListener('click', e => {
    e.stopPropagation();
    if (pop.style.display !== 'none') { pop.style.display = 'none'; return; }
    renderColsGestion_(); pop.style.display = '';
  });
  pop.addEventListener('click', e => {
    e.stopPropagation();
    const acc = e.target.closest('[data-gr-cols]');
    if (acc) {
      if (acc.dataset.grCols === 'todas') state.gr.colsOcultas.clear();
      else if (acc.dataset.grCols === 'contacto') { state.gr.colsOcultas = new Set(GR_COLS.filter(c => !c.c && !['alias', 'codigo_ref', 'tipo_recurso', 'area'].includes(c.k)).map(c => c.k)); }
      else if (acc.dataset.grCols === 'operacion') { state.gr.colsOcultas = new Set(GR_COLS.filter(c => c.c).map(c => c.k)); }
      grGuardarCols_(); renderColsGestion_(); renderGestion_();
    }
  });
  pop.addEventListener('change', e => {
    const k = e.target.dataset.grCol; if (!k) return;
    if (e.target.checked) state.gr.colsOcultas.delete(k); else state.gr.colsOcultas.add(k);
    grGuardarCols_(); renderGestion_();
  });
  document.addEventListener('click', () => { pop.style.display = 'none'; });
  document.getElementById('gr-tabla').addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.target.matches('input[data-gr-id]')) {   // Enter: baja a la misma columna de la fila siguiente
      e.preventDefault();
      const td = e.target.closest('td'), tr = td.parentElement, sig = tr.nextElementSibling;
      const inp = sig && sig.children[td.cellIndex] && sig.children[td.cellIndex].querySelector('input:not([readonly])');
      if (inp) inp.focus(); else e.target.blur();
    }
  });
  document.getElementById('gr-guardar').addEventListener('click', guardarGestion_);
  document.getElementById('gr-descartar').addEventListener('click', () => {
    if (!confirm('¿Descartar todos los cambios sin guardar?')) return;
    state.gr.cambios = {}; state.gr.errores = {}; renderGestion_();
  });
  document.getElementById('gr-descargar').addEventListener('click', descargarGestion_);
  document.getElementById('gr-descargar-personas').addEventListener('click', descargarPersonasGestion_);
  document.getElementById('gr-plantilla-personas').addEventListener('click', descargarPlantillaPersonas_);
  document.getElementById('gr-subir-personas').addEventListener('click', () => {
    if (Object.keys(state.gr.cambios).length) { mostrarToast_('Guarda o descarta primero los cambios de la tabla.'); return; }
    document.getElementById('gr-archivo-personas').click();
  });
  document.getElementById('gr-archivo-personas').addEventListener('change', e => {
    const f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (f) leerPlantillaPersonas_(f);
  });
  document.getElementById('gr-nuevo').addEventListener('click', abrirNuevoRecursoGestion_);
  document.getElementById('gr-tabla').addEventListener('click', e => {
    const b = e.target.closest('[data-gr-eliminar]'); if (b) eliminarRecursoGestion_(b.dataset.grEliminar);
    const bp = e.target.closest('[data-gr-personas]'); if (bp) abrirPersonasRecurso_(bp.dataset.grPersonas);
  });
  document.getElementById('gr-pdf').addEventListener('click', descargarResumenGestionPdf_);
  document.getElementById('gr-subir').addEventListener('click', () => {
    if (Object.keys(state.gr.cambios).length) { mostrarToast_('Guarda o descarta primero los cambios de la tabla.'); return; }
    document.getElementById('gr-archivo').click();
  });
  document.getElementById('gr-archivo').addEventListener('change', e => {
    const f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (f) leerExcelGestion_(f);
  });
  const cerrar = () => { document.getElementById('gr-modal').style.display = 'none'; state.gr.carga = null; };
  document.getElementById('gr-modal-cerrar').addEventListener('click', cerrar);
  document.getElementById('gr-modal-cancelar').addEventListener('click', cerrar);
  document.getElementById('gr-modal').addEventListener('click', e => { if (e.target.id === 'gr-modal') cerrar(); });
  document.getElementById('gr-modal-aplicar').addEventListener('click', aplicarCargaGestion_);
  window.addEventListener('beforeunload', e => { if (Object.keys(state.gr.cambios).length) { e.preventDefault(); e.returnValue = ''; } });
}

