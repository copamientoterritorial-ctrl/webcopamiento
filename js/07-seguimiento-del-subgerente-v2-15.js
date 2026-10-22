/* ==================== 📈 SEGUIMIENTO DEL SUBGERENTE (v2, 15-10-2026) ====================
 * Solo el perfil Subgerente de Relacionamiento (el Administrador lo prueba con «Ver como… › 📈 Modo
 * Subgerente»). Dos vistas simples, separadas:
 *   🏘️ Comunas y copamiento — por área, TODAS sus comunas con su prioridad (Comunas Prioritarias) y su
 *      AVANCE = nivel de copamiento (promedio de Normal · Amarilla · Roja sobre la zona de incendios del
 *      trienio), estado (⛔ sin iniciar / 🟠 en curso / ✅ 3 escenarios) y los usuarios que trabajaron en ella.
 *   🌲 Inicio de recursos — fechas de inicio de operación por área: gráfico por semana, línea de tiempo y
 *      lista, con filtros rápidos (área, periodo, tipo). */
state.sg = { datos: null, vista: 'comunas', area: '', estado: '', prios: [], q: '', rArea: '', rPeriodo: '', rTipo: '', tPer: 'mes', tArea: '', turnos: {}, listeners: false };
const SG_MAX_LIBRES = 4;   // más de 4 días libres seguidos (operando) = calendario de turnos incompleto
let chartSgInicios = null, chartSgActivacion = null;
/** 16-10-2026: el Administrador también ve el Seguimiento, con ambas subgerencias y un filtro (Ambas / Norte / Sur). */
function sgModoAdmin_() { return !state.subgerencia && !!(state.perfil && state.perfil.perfil === 'Administrador'); }
function puedeSeguimiento_() { return esSubgerente_() || sgModoAdmin_(); }
/** Subgerencia que se está mirando: la propia (Subgerente) o la del filtro del Administrador ('' = ambas). */
function sgSubgActiva_() { return sgModoAdmin_() ? (state.sg.subg || '') : (state.subgerencia || ''); }
function sgTituloSubg_() { const s = sgSubgActiva_(); return s ? 'Subgerencia ' + aTitulo_(s) : 'Ambas subgerencias'; }
/** Filtro de subgerencia del Administrador: guarda lo calculado de la subgerencia actual y carga la nueva. */
function cambiarSubgSeguimiento_(v) {
  const S = state.sg; if ((S.subg || '') === v) return;
  S.cachePor = S.cachePor || {};
  if (S.datos) S.cachePor[S.subg || ''] = { datos: S.datos, turnos: S.turnos, ultimoTurnos: S.ultimoTurnos };
  S.subg = v; S.area = ''; S.rArea = ''; S.tArea = '';
  const c = S.cachePor[v];
  S.datos = c ? c.datos : null; S.turnos = c ? c.turnos : {}; S.ultimoTurnos = c ? c.ultimoTurnos : null;
  abrirSeguimiento_();
}
function renderFiltroSubgSeguimiento_() {
  const cont = document.getElementById('sg-subg'); if (!cont) return;
  if (!sgModoAdmin_()) { cont.style.display = 'none'; return; }
  const lista = state.sg.subgsDisponibles || [];
  cont.style.display = '';
  cont.innerHTML = '<span class="tit">Subgerencia</span>' + [['', 'Ambas']].concat(lista.map(s => [s, aTitulo_(s)])).map(([v, t]) =>
    '<button class="sg-chip' + ((state.sg.subg || '') === v ? ' on' : '') + '" data-sg-subg="' + escapeHtml_(v) + '">' + escapeHtml_(t) + '</button>').join('');
}
const SG_KEY = a => plNorm_(a).replace(/[^A-Z0-9]/g, '');
const SG_DIA = 864e5;
const SG_MIN_HA_CMPC = 100;   // presencia CMPC mínima (ha) = filtro por defecto de Comunas Prioritarias
function sgFecha_(s) { if (!s) return null; const d = new Date(String(s).slice(0, 10) + 'T12:00:00'); return isNaN(d) ? null : d; }
function sgFechaTxt_(d) { return d ? d.toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: '2-digit' }) : '—'; }
function sgColorAv_(p) { return p >= 60 ? '#16A34A' : p >= 30 ? '#D97706' : p > 0 ? '#EA580C' : '#DC2626'; }

/** Nombres de usuarios por id. 19-10-2026 (SQL 124): por RPC, porque la RLS de `perfiles` no deja al Subgerente /
 *  Jefe leer el perfil de otras personas (veía «Usuario (27)»). Sin el SQL 124, lectura directa como antes. */
async function nombresPerfiles_(ids) {
  const out = {};
  if (!ids || !ids.length) return out;
  const { data, error } = await supabaseClient.rpc('nombres_perfiles', { p_ids: ids });
  if (!error) { (data || []).forEach(p => { out[p.id] = p.nombre_completo; }); }
  const faltan = ids.filter(id => !out[id]);
  if (faltan.length) {
    const { data: pf } = await supabaseClient.from('perfiles').select('id, nombre_completo').in('id', faltan);
    (pf || []).forEach(p => { out[p.id] = p.nombre_completo; });
  }
  return out;
}

async function abrirSeguimiento_() {
  if (!state.sg.listeners) {
    state.sg.listeners = true;
    document.getElementById('sg-vistas').addEventListener('click', e => {
      const b = e.target.closest('[data-sg-vista]'); if (!b) return;
      state.sg.vista = b.dataset.sgVista; renderSeguimiento_();
    });
    document.getElementById('sg-recargar').addEventListener('click', () => cargarSeguimiento_(true));
    document.getElementById('sg-excel').addEventListener('click', descargarSeguimiento_);
    const cuerpo = document.getElementById('sg-cuerpo');
    cuerpo.addEventListener('click', e => {
      const vm = e.target.closest('[data-sg-mapa]'); if (vm) { verCopamientoMapaSg_(vm.dataset.sgMapa); return; }
      // Prioridad: selección múltiple
      const bp = e.target.closest('[data-sg-prio]');
      if (bp) {
        const p = bp.dataset.sgPrio, S = state.sg;
        S.prios = p === '__todas__' ? [] : (S.prios || []).includes(p) ? S.prios.filter(x => x !== p) : (S.prios || []).concat(p);
        renderSeguimiento_(); return;
      }
      const c = e.target.closest('[data-sg-f]'); if (!c) return;
      const [k, v] = c.dataset.sgF.split('|');
      state.sg[k] = state.sg[k] === v && k !== 'area' && k !== 'rArea' && k !== 'tPer' ? '' : v;
      renderSeguimiento_();
    });
    cuerpo.addEventListener('input', e => { if (e.target.id === 'sg-q') { clearTimeout(state.sg.tq); state.sg.tq = setTimeout(() => { state.sg.q = e.target.value; renderSeguimiento_(true); }, 200); } });
    cuerpo.addEventListener('change', e => { if (e.target.id === 'sg-rtipo') { state.sg.rTipo = e.target.value; renderSeguimiento_(); } });
  }
  if (!state.sg.listenerSubg) {
    state.sg.listenerSubg = true;
    document.getElementById('sg-subg').addEventListener('click', e => { const b = e.target.closest('[data-sg-subg]'); if (b) cambiarSubgSeguimiento_(b.dataset.sgSubg); });
  }
  document.getElementById('sg-titulo').textContent = '📈 Seguimiento · ' + sgTituloSubg_();
  renderFiltroSubgSeguimiento_();
  if (!state.sg.datos) await cargarSeguimiento_();
  else renderSeguimiento_();
}

async function cargarSeguimiento_(forzar) {
  const est = document.getElementById('sg-estado'), cuerpo = document.getElementById('sg-cuerpo');
  if (state.sg.datos && !forzar) { renderSeguimiento_(); return; }
  state.sg.turnos = {};   // los calendarios se vuelven a leer al abrir la vista Turnos
  est.textContent = 'Calculando…';
  if (!state.sg.datos) cuerpo.innerHTML = '<div class="tb-vacio">Reuniendo comunas, copamiento y recursos de la subgerencia…</div>';
  try {
    const misAreas = new Set((state.misAreasIds || []).map(SG_KEY));
    // Recursos de la subgerencia (con fechas de operación)
    const recursos = [];
    for (let d = 0; ; d += 1000) {
      const { data, error } = await supabaseClient.from('referencia_recursos')
        .select('id, codigo_ref, alias, area_nombre, subgerencia, tipo_recurso, fecha_inicio_operacion, fecha_termino_operacion').range(d, d + 999);
      if (error) throw error;
      recursos.push(...(data || [])); if (!data || data.length < 1000) break;
    }
    // Áreas de la subgerencia con el MISMO criterio del filtro Subgerencia de Comunas Prioritarias
    // (cargarAreasPrio_): el área toma la subgerencia de sus recursos. Sin subgerencia: perfil_areas.
    const subgDeArea = {};
    recursos.forEach(r => { const k = SG_KEY(r.area_nombre); if (k && r.subgerencia && !subgDeArea[k]) subgDeArea[k] = r.subgerencia; });
    // Administrador: todas las áreas con subgerencia (Ambas) o las de la subgerencia del filtro
    state.sg.subgsDisponibles = [...new Set(Object.values(subgDeArea).map(s => String(s).toUpperCase()))].sort((a, b) => a.localeCompare(b, 'es'));
    renderFiltroSubgSeguimiento_();
    const miSubg = SG_KEY(sgSubgActiva_());
    const areasSubg = new Set(Object.keys(subgDeArea).filter(k => sgModoAdmin_() && !miSubg ? true : (miSubg && SG_KEY(subgDeArea[k]) === miSubg)));
    const esMia = k => areasSubg.size ? areasSubg.has(k) : misAreas.has(k);
    const areas = {};
    const area = (k, nom) => (areas[k] = areas[k] || { k, nombre: nom || k, comunas: new Set(), rec: [], jefes: [] });
    recursos.forEach(r => { const k = SG_KEY(r.area_nombre); if (k && esMia(k)) area(k, r.area_nombre).rec.push(r); });
    // Comunas de cada área (asignación administrativa, SQL 94)
    const { data: ac } = await supabaseClient.from('v_area_comunas_admin').select('area, area_norm, id_comuna');
    // Áreas y subgerencias de TODAS las comunas (para mostrar las 103 CMPC con su subgerencia, 18-10-2026)
    const areasPorComuna = {}, subgsPorComuna = {};
    (ac || []).forEach(x => {
      if (x.id_comuna == null) return;
      const id = Number(x.id_comuna), k = SG_KEY(x.area_norm || x.area);
      (areasPorComuna[id] = areasPorComuna[id] || []); if (!areasPorComuna[id].some(a => SG_KEY(a) === k)) areasPorComuna[id].push(x.area);
      const s = subgDeArea[k]; if (s) { (subgsPorComuna[id] = subgsPorComuna[id] || []); if (!subgsPorComuna[id].includes(String(s).toUpperCase())) subgsPorComuna[id].push(String(s).toUpperCase()); }
      if (esMia(k)) area(k, (areas[k] || {}).nombre || x.area).comunas.add(id);
    });
    const idsCom = new Set(); Object.values(areas).forEach(a => a.comunas.forEach(id => idsCom.add(id)));
    // Prioridad (Comunas Prioritarias: misma matriz y parámetros vigentes) — toda la matriz
    const [cp, pp] = await Promise.all([
      supabaseClient.from('comunas_prioridad').select('*'),
      supabaseClient.from('prioridad_parametros').select('id, parametros'),
    ]);
    // Comunas = las mismas del mapa de Comunas Prioritarias con el filtro de la subgerencia (aunque la
    // comuna aún no esté habilitada en el sistema: entonces no tiene planes y figura «sin iniciar»).
    const habil = {}; (state.comunas || []).forEach(c => { habil[Number(c.id_comuna)] = c; });
    const comunas = [...idsCom].map(id => {
      const m = (cp.data || []).find(x => Number(x.id_comuna) === id);
      // Solo comunas con presencia CMPC ≥ 100 ha (filtro por defecto del mapa: las ~103 de la matriz)
      return m && Number(m.v1_ha_cmpc) >= SG_MIN_HA_CMPC ? (habil[id] || { id: null, id_comuna: id, comuna: m.comuna }) : null;
    }).filter(Boolean).sort((a, b) => a.comuna.localeCompare(b.comuna, 'es'));
    const idsLista = new Set(comunas.map(c => Number(c.id_comuna)));
    Object.values(areas).forEach(a => { a.comunas = new Set([...a.comunas].filter(id => idsLista.has(id))); });
    // Las ~103 comunas con presencia CMPC: de la subgerencia («mia»), de otra subgerencia («otra») o sin área («sin»)
    const todas = (cp.data || []).filter(m => Number(m.v1_ha_cmpc) >= SG_MIN_HA_CMPC).map(m => {
      const id = Number(m.id_comuna);
      return { c: habil[id] || { id: null, id_comuna: id, comuna: m.comuna }, alcance: idsLista.has(id) ? 'mia' : (areasPorComuna[id] ? 'otra' : 'sin'),
        subgs: subgsPorComuna[id] || [] };
    }).sort((a, b) => a.c.comuna.localeCompare(b.c.comuna, 'es'));
    const vig = (pp.data || []).find(f => f.id === 'vigente');
    const P = paramsCompletosPrio_(vig ? vig.parametros : null);
    const prioPor = {}; (cp.data || []).forEach(c => { prioPor[c.id_comuna] = calcularPrio_(c, P); });
    // Copamiento sobre incendios por escenario (mismo resumen de Comunas Prioritarias)
    let resumen = (state.prio && state.prio.resumen) || cargarCopamientoAlertasDash_.resumen || null;
    if (!resumen || forzar) {
      est.textContent = 'Calculando copamiento sobre incendios…';
      const { data } = await supabaseClient.rpc('resumen_comunas_prevencion');
      resumen = {}; (data || []).forEach(x => { resumen[x.id_comuna] = x; });
      cargarCopamientoAlertasDash_.resumen = resumen;
    }
    // Usuarios que trabajaron en cada comuna (quién creó entidades en sus planes)
    const usuariosPor = {};
    try {
      const slugs = comunas.map(c => c.id).filter(Boolean);
      const { data: planes } = slugs.length ? await supabaseClient.from('planes_contingencia').select('id, comuna_id').in('comuna_id', slugs) : { data: [] };
      const comunaDePlan = {}; (planes || []).forEach(p => { comunaDePlan[p.id] = p.comuna_id; });
      const pids = Object.keys(comunaDePlan), ids = new Set();
      for (let i = 0; i < pids.length; i += 120) {
        const { data } = await supabaseClient.from('planificacion_recursos').select('plan_id, creado_por').in('plan_id', pids.slice(i, i + 120));
        (data || []).forEach(r => { if (!r.creado_por) return; const s = comunaDePlan[r.plan_id]; const u = usuariosPor[s] = usuariosPor[s] || {}; u[r.creado_por] = (u[r.creado_por] || 0) + 1; ids.add(r.creado_por); });
      }
      if (ids.size) state.sg.nombres = await nombresPerfiles_([...ids]);
    } catch (e) { /* sin detalle de usuarios */ }
    // 🪜 Avance de la implementación por comuna (SQL 124; solo las 24 comunas relevantes V6)
    let etapas = null;
    try {
      const { data, error } = await supabaseClient.from('implementacion_etapas').select('id_comuna, etapa, completada, fecha');
      if (!error) { etapas = {}; (data || []).forEach(r => { if (r.completada) (etapas[r.id_comuna] = etapas[r.id_comuna] || {})[r.etapa] = r; }); }
    } catch (e) { /* sin el SQL 124 */ }
    // Jefes de cada área
    try {
      const [pa, pf, ps] = await Promise.all([
        supabaseClient.from('perfil_areas').select('perfil_id, area'),
        supabaseClient.from('perfiles').select('id, nombre_completo, perfil'),
        supabaseClient.from('perfil_subgerencias').select('perfil_id'),
      ]);
      const subgs = new Set((ps.data || []).map(x => x.perfil_id));
      const nom = {}; (pf.data || []).forEach(p => { if (esJefeAreaPerfil_(p.perfil) && !subgs.has(p.id)) nom[p.id] = p.nombre_completo; });
      (pa.data || []).forEach(x => { const a = areas[SG_KEY(x.area)]; if (a && nom[x.perfil_id] && !a.jefes.includes(nom[x.perfil_id])) a.jefes.push(nom[x.perfil_id]); });
    } catch (e) { /* sin nombres */ }
    state.sg.datos = { areas, comunas, todas, areasPorComuna, prioPor, resumen, usuariosPor, listas: P.listas || {}, responsables: P.responsables || {},
      etapas, implIds: new Set(((P.v6 && P.v6.ids) || PRIO_RELEVANTES_DEFECTO).map(Number)) };
    est.textContent = 'Actualizado ' + new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
  } catch (e) {
    est.textContent = 'Error';
    cuerpo.innerHTML = '<div class="tb-vacio">No se pudo calcular el seguimiento: ' + escapeHtml_(e.message || String(e)) + '</div>';
    return;
  }
  renderSeguimiento_();
}

/** 🪜 Torta del avance de la implementación de la comuna (7 etapas) con la lista de etapas al pasar el mouse. */
function sgImplHtml_(c) {
  const D = state.sg.datos;
  if (!D || !D.etapas) return '';   // sin el SQL 124
  const id = Number(c.id_comuna);
  if (!D.implIds.has(id)) return '<div class="sg-impl" title="Esta comuna no está entre las 24 comunas de implementación"><span class="sg-impl-na">—</span><small>Fuera de<br>implementación</small></div>';
  const M = D.etapas[id] || {}, N = IM_ETAPAS.length;
  const h = IM_ETAPAS.filter(([k]) => M[k]).length, p = Math.round(h * 100 / N);
  const fmtF = f => f ? new Date(String(f).slice(0, 10) + 'T12:00:00').toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit' }) : '';
  return '<div class="sg-impl im-av-torta" tabindex="0">' + imTorta_(p, 64) + '<small><b style="color:var(--text-secondary);">🪜 Implementación</b><br>' + h + ' de ' + N + ' etapas<br><span style="color:var(--cobalt);">ver detalle ›</span></small>' +
    '<div class="im-pop"><b>🪜 ' + escapeHtml_(c.comuna) + ' · ' + p + '%</b>' + IM_ETAPAS.map(([k, ico, nom]) => {
      const r = M[k];
      return '<div class="' + (r ? 'ok' : 'pend') + '">' + (r ? '✅' : '⬜') + ' ' + ico + ' ' + escapeHtml_(nom) + (r && r.fecha ? ' <small>' + fmtF(r.fecha) + '</small>' : '') + '</div>';
    }).join('') + '</div></div>';
}

/** Comuna: avance = nivel de copamiento (promedio N·A·R), estado y usuarios. */
function sgComuna_(c) {
  const D = state.sg.datos, r = D.resumen[c.id_comuna] || {};
  const num = v => (v == null || isNaN(Number(v))) ? 0 : Number(v);
  const pN = num(r.pct_verde), pA = num(r.pct_amarilla), pR = num(r.pct_roja);
  const esc = { n: (r.ent_verde || 0) > 0, a: (r.ent_amarilla || 0) > 0, r: (r.ent_roja || 0) > 0 };
  const nEsc = Object.values(esc).filter(Boolean).length;
  const estado = nEsc === 0 ? 'sin' : nEsc === 3 ? 'ok' : 'curso';
  const falta = [!esc.n && 'Normal', !esc.a && 'Amarilla', !esc.r && 'Roja'].filter(Boolean);
  const pr = D.prioPor[c.id_comuna];
  const u = D.usuariosPor[c.id] || {};
  const usuarios = Object.keys(u).sort((a, b) => u[b] - u[a]).map(id => ({ nombre: (state.sg.nombres || {})[id] || 'Usuario', n: u[id] }));
  let areas = Object.values(D.areas).filter(a => a.comunas.has(Number(c.id_comuna))).map(a => a.nombre);
  if (!areas.length) areas = (D.areasPorComuna || {})[Number(c.id_comuna)] || [];   // comunas de otra subgerencia
  // Responsable de la comuna (Comunas Prioritarias › 👥 Asignar responsables): [Jefe de Área, Responsable]
  const resp = (D.responsables || {})[c.id_comuna] || (D.responsables || {})[String(c.id_comuna)] || ['', ''];
  // 🧭 Jefe = el Jefe REAL del área en el sistema (perfil_areas). La matriz de responsables puede estar desactualizada
  // (ej.: Yumbel figura con Christian S., pero la administra el área Concepción): si no coincide, se avisa.
  const jefesArea = [...new Set(Object.values(D.areas).filter(a => a.comunas.has(Number(c.id_comuna))).flatMap(a => a.jefes))];
  const mismoNombre = (a, b) => { const x = normalizarBusqueda_(a).split(/\s+/), y = normalizarBusqueda_(b).split(/\s+/);
    return x[0] === y[0] && (!x[1] || !y[1] || x[1][0] === y[1][0]); };
  const jefeMatriz = resp[0] || '';
  const jefeDistinto = !!(jefeMatriz && jefesArea.length && !jefesArea.some(j => mismoNombre(j, jefeMatriz)));
  return { c, pN, pA, pR, avance: Math.round((pN + pA + pR) / 3), estado, falta, prio: pr ? pr.prio : 3, nivel: pr ? pr.nivel : null,
    usuarios, grd: r.grd_nombres || '', areas, jefe: jefesArea.length ? jefesArea.join(', ') : jefeMatriz, jefeMatriz, jefeDistinto, responsable: resp[1] || '',
    lista: !!(D.listas[c.id_comuna] || D.listas[String(c.id_comuna)]) };
}

function renderSeguimiento_(soloLista) {
  const D = state.sg.datos; if (!D) return;
  document.querySelectorAll('#sg-vistas [data-sg-vista]').forEach(b => b.classList.toggle('on', b.dataset.sgVista === state.sg.vista));
  if (state.sg.vista === 'recursos') renderSgRecursos_();
  else if (state.sg.vista === 'turnos') renderSgTurnos_();
  else renderSgComunas_(soloLista);
}

/* ── 📅 Vista Turnos: completitud del calendario por área (16-10-2026) ──
 * Un recurso tiene el calendario COMPLETO en el periodo si, en los días que opera (ya inició —o no tiene
 * fecha de inicio, como en el Calendario— y no terminó), no tiene más de SG_MAX_LIBRES días libres seguidos.
 * Un área está completa cuando todos sus recursos que operan lo están. */
function sgPeriodoTurnos_(k) {
  const hoy = new Date(); hoy.setHours(12, 0, 0, 0);
  const y = hoy.getFullYear(), m = hoy.getMonth();
  let d0, d1, nombre;
  if (/^m\d{4}-\d{2}$/.test(k)) {   // mes puntual de la temporada (diciembre a marzo)
    const [yy, mm] = k.slice(1).split('-').map(Number);
    d0 = new Date(yy, mm - 1, 1); d1 = new Date(yy, mm, 0); nombre = TURNOS_MESES[mm - 1] + ' ' + yy;
  } else if (k === 'sig') { d0 = new Date(y, m + 1, 1); d1 = new Date(y, m + 2, 0); nombre = TURNOS_MESES[d0.getMonth()] + ' ' + d0.getFullYear(); }
  else if (k === '30') { d0 = new Date(y, m, hoy.getDate()); d1 = new Date(y, m, hoy.getDate() + 29); nombre = 'próximos 30 días'; }
  else { d0 = new Date(y, m, 1); d1 = new Date(y, m + 1, 0); nombre = TURNOS_MESES[m] + ' ' + y; }
  const dias = []; for (let d = new Date(d0); d <= d1; d.setDate(d.getDate() + 1)) dias.push(fechaISO_(d));
  return { k, dias, nombre };
}
/** Diciembre, enero, febrero y marzo de la temporada en curso o la próxima (de abril a diciembre: dic de
 *  este año → mar del siguiente; de enero a marzo: la temporada que empezó el diciembre pasado). */
function sgMesesTemporada_() {
  const hoy = new Date(), y = hoy.getFullYear(), y0 = hoy.getMonth() <= 2 ? y - 1 : y;
  return [[y0, 12], [y0 + 1, 1], [y0 + 1, 2], [y0 + 1, 3]].map(([yy, mm]) =>
    ({ k: 'm' + yy + '-' + String(mm).padStart(2, '0'), txt: TURNOS_MESES[mm - 1] + ' ' + String(yy).slice(2) }));
}
function sgEvaluarTurnos_(r, dias, activos) {
  const fin = r.fecha_termino_operacion ? String(r.fecha_termino_operacion).slice(0, 10) : null;
  let operan = 0, turnos = 0, racha = 0, max = 0, ini = null, maxIni = null, maxFin = null;
  dias.forEach(iso => {
    if (!turnoPermitido_(r, iso) || (fin && iso > fin)) { racha = 0; return; }
    operan++;
    if (activos.has(r.id + '|' + iso)) { turnos++; racha = 0; return; }
    if (!racha) ini = iso;
    racha++;
    if (racha > max) { max = racha; maxIni = ini; maxFin = iso; }
  });
  return { operan, turnos, max, maxIni, maxFin, completo: operan > 0 && max <= SG_MAX_LIBRES };
}
async function cargarSgTurnos_(forzar) {
  const S = state.sg, D = S.datos, P = sgPeriodoTurnos_(S.tPer);
  if (S.turnos[P.k] && !forzar) return S.turnos[P.k];
  const recs = Object.values(D.areas).flatMap(a => a.rec);
  const filas = recs.length ? await turnosDeRecursosRango_(recs.map(r => r.id), P.dias[0], P.dias[P.dias.length - 1]) : [];
  const activos = new Set(filas.filter(t => t.activo).map(t => t.recurso_id + '|' + String(t.fecha).slice(0, 10)));
  return (S.turnos[P.k] = { P, activos });
}
async function renderSgTurnos_() {
  const S = state.sg, D = S.datos, cuerpo = document.getElementById('sg-cuerpo');
  const P = sgPeriodoTurnos_(S.tPer);
  if (!S.turnos[P.k]) {
    cuerpo.innerHTML = '<div class="tb-vacio">Leyendo los calendarios de turnos (' + escapeHtml_(P.nombre) + ')…</div>';
    try { await cargarSgTurnos_(); }
    catch (e) { cuerpo.innerHTML = '<div class="tb-vacio">No se pudieron leer los turnos: ' + escapeHtml_(e.message || String(e)) + '</div>'; return; }
    if (S.vista !== 'turnos') return;
  }
  const { activos } = S.turnos[P.k];
  const fmtD = iso => { const d = parseISOLocal_(iso); return d.getDate() + ' ' + TURNOS_MESES[d.getMonth()].slice(0, 3).toLowerCase(); };
  const areas = Object.values(D.areas).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')).map(a => {
    const ev = a.rec.map(r => Object.assign({ r }, sgEvaluarTurnos_(r, P.dias, activos))).filter(x => x.operan);
    const inc = ev.filter(x => !x.completo).sort((p, q) => q.max - p.max || compararTipoRecurso_(p.r.tipo_recurso, q.r.tipo_recurso));
    return { a, ev, inc, pct: ev.length ? Math.round(100 * (ev.length - inc.length) / ev.length) : null, sinTurnos: ev.filter(x => !x.turnos).length };
  }).sort((p, q) => (p.pct == null ? 101 : p.pct) - (q.pct == null ? 101 : q.pct) || p.a.nombre.localeCompare(q.a.nombre, 'es'));
  const conRec = areas.filter(x => x.ev.length);
  const completas = conRec.filter(x => !x.inc.length).length;
  const nEv = conRec.reduce((s, x) => s + x.ev.length, 0), nInc = conRec.reduce((s, x) => s + x.inc.length, 0);
  const pctTot = nEv ? Math.round(100 * (nEv - nInc) / nEv) : 0;
  const chip = (k, v, txt) => '<button class="sg-chip' + (S[k] === v ? ' on' : '') + '" data-sg-f="' + k + '|' + v + '">' + txt + '</button>';
  const html = areas.map(x => {
    const col = x.pct == null ? '#94A3B8' : x.pct === 100 ? '#16A34A' : x.pct >= 80 ? '#D97706' : '#DC2626';
    const abierta = S.tArea === x.a.k;
    const est = !x.ev.length ? '<span class="sg-estado" style="background:#F1F5F9;color:#475569;">Sin recursos operando</span>'
      : !x.inc.length ? '<span class="sg-estado ok">✅ Calendario completo</span>'
      : '<span class="sg-estado sin">⚠️ Falta completar · ' + x.inc.length + ' recurso(s)</span>';
    const detalle = abierta && x.inc.length ? '<div class="sg-tu-det">' + x.inc.map(i =>
      '<div><b>📻 ' + escapeHtml_(claveIdRecurso_(i.r) || '—') + '</b><span>' + escapeHtml_(aTitulo_(i.r.tipo_recurso || '')) + '</span>' +
      '<em>' + (i.turnos ? i.max + ' días libres seguidos (' + fmtD(i.maxIni) + ' – ' + fmtD(i.maxFin) + ')' : 'Sin ningún turno en el periodo') + '</em>' +
      '<small>' + i.turnos + ' de ' + i.operan + ' días en turno</small></div>').join('') + '</div>' : '';
    return '<div class="sg-tu-area" style="--c:' + col + '">' +
      '<div class="cab" ' + (x.inc.length ? 'data-sg-f="tArea|' + escapeHtml_(x.a.k) + '" title="Ver los recursos que faltan"' : '') + '>' +
        '<div class="nom"><b>' + escapeHtml_(aTitulo_(x.a.nombre)) + '</b><small>' + (x.a.jefes.length ? 'Jefe de Área: ' + escapeHtml_(x.a.jefes.join(', ')) : 'Sin Jefe de Área asignado') + '</small></div>' +
        '<div class="barra"><i><em style="width:' + (x.pct || 0) + '%"></em></i><span>' + (x.ev.length ? (x.ev.length - x.inc.length) + ' de ' + x.ev.length + ' recursos completos' : '—') + '</span></div>' +
        '<div class="pct">' + (x.pct == null ? '—' : x.pct + '%') + '</div>' +
        '<div>' + est + (x.sinTurnos ? '<div class="sg-tu-nota">' + x.sinTurnos + ' sin ningún turno</div>' : '') + '</div>' +
        '<div class="flecha">' + (x.inc.length ? (abierta ? '▲' : '▼') : '') + '</div>' +
      '</div>' + detalle + '</div>';
  }).join('') || '<div class="tb-vacio">La subgerencia no tiene recursos.</div>';
  cuerpo.innerHTML =
    '<div class="sg-chips"><span class="tit">Periodo</span>' + chip('tPer', 'mes', '📅 Este mes') + chip('tPer', 'sig', '➡️ Próximo mes') + chip('tPer', '30', '⏳ Próximos 30 días') +
      '<span class="tit" style="margin-left:10px;">Temporada</span>' + sgMesesTemporada_().map(x => chip('tPer', x.k, x.txt)).join('') +
      '<span style="margin-left:auto;font-size:11.5px;color:var(--text-tertiary);">Regla: un recurso con <b>más de ' + SG_MAX_LIBRES + ' días libres seguidos</b> (en días que opera) tiene el calendario incompleto.</span></div>' +
    '<div class="sg-resumen">' +
      '<div style="--c:' + (completas === conRec.length ? '#16A34A' : '#DC2626') + '"><b>' + completas + ' / ' + conRec.length + '</b><span>áreas con calendario completo · ' + escapeHtml_(P.nombre) + '</span></div>' +
      '<div style="--c:' + (pctTot === 100 ? '#16A34A' : pctTot >= 80 ? '#D97706' : '#DC2626') + '"><b>' + pctTot + '%</b><span>recursos con calendario completo (' + (nEv - nInc) + ' de ' + nEv + ')</span></div>' +
      '<div style="--c:#DC2626"><b>' + nInc + '</b><span>⚠️ recursos por completar</span></div>' +
      '<div style="--c:#B45309"><b>' + conRec.reduce((s, x) => s + x.sinTurnos, 0) + '</b><span>sin ningún turno en el periodo</span></div>' +
    '</div>' +
    '<div class="sg-tu-lista">' + html + '</div>';
  S.ultimoTurnos = { P, areas };
}

/* ── 🏘️ Vista Comunas y copamiento ── */
function renderSgComunas_(soloLista) {
  const D = state.sg.datos, S = state.sg, cuerpo = document.getElementById('sg-cuerpo');
  const areas = Object.values(D.areas).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  if (S.area && !D.areas[S.area]) S.area = '';
  S.alcance = ''; S.estado = '';   // 22-10-2026: los filtros «Mostrar» y «Estado» ya no están en pantalla
  // Alcance (18-10-2026): '' = comunas de mi subgerencia · 'todas' = las ~103 con presencia CMPC (las de otra
  // subgerencia o sin área aparecen identificadas y atenuadas, para que el Subgerente vea cuáles tiene disponibles)
  const T = D.todas || [];
  const nMia = T.filter(x => x.alcance === 'mia').length, nOtra = T.filter(x => x.alcance === 'otra').length, nSin = T.filter(x => x.alcance === 'sin').length;
  const base = S.alcance === 'todas' && !S.area ? T : D.comunas.map(c => ({ c, alcance: 'mia', subgs: [] }));
  const delArea = S.area ? base.filter(x => D.areas[S.area].comunas.has(Number(x.c.id_comuna))) : base;
  const todasSinPrio = delArea.map(x => Object.assign(sgComuna_(x.c), { alcance: x.alcance, subgs: x.subgs }));
  // 19-10-2026: el filtro de PRIORIDAD va primero y admite varias a la vez (p. ej. Alta + Media); los conteos y
  // tarjetas de resumen se calculan sobre las comunas de las prioridades elegidas.
  S.prios = S.prios || [];
  const todas = S.prios.length ? todasSinPrio.filter(f => S.prios.includes(String(f.prio))) : todasSinPrio;
  const q = normalizarBusqueda_(S.q || '');
  const filas = todas.filter(f => (!S.estado || f.estado === S.estado) && (!q || normalizarBusqueda_(f.c.comuna).includes(q)))
    .sort((a, b) => ({ mia: 0, otra: 1, sin: 2 }[a.alcance] || 0) - ({ mia: 0, otra: 1, sin: 2 }[b.alcance] || 0) ||   // primero las de la subgerencia
      a.prio - b.prio || (b.nivel || 0) - (a.nivel || 0) || a.c.comuna.localeCompare(b.c.comuna, 'es'));
  const fmt = v => Number(v || 0).toLocaleString('es-CL', { maximumFractionDigits: 0 });
  const cuenta = (k, v) => todas.filter(f => f[k] === v).length;
  const chip = (k, v, txt, n) => '<button class="sg-chip' + (S[k] === v ? ' on' : '') + '" data-sg-f="' + k + '|' + escapeHtml_(v) + '">' + txt + (n != null ? '<small>' + n + '</small>' : '') + '</button>';
  // 19-10-2026: sin promedio; una tarjeta por alerta (Normal · Amarilla · Roja) con su % y barra
  const tarjetaAlerta = (lbl, p, c) => '<div class="sg-al" style="--a:' + c + '"><span>' + lbl + '</span><b>' + fmt(p) + '%</b><i><em style="width:' + Math.min(100, p) + '%"></em></i></div>';
  const colEstado = { sin: '#DC2626', curso: '#D97706', ok: '#16A34A' };
  const lista = filas.map(f => {
    const n = prioInfo_(f.prio), col = colEstado[f.estado] || '#94A3B8';
    const est = f.estado === 'sin' ? '<span class="sg-estado sin">⛔ Sin iniciar</span>'
      : f.estado === 'ok' ? '<span class="sg-estado ok">✅ 3 escenarios</span>' : '<span class="sg-estado curso">🟠 En curso · falta ' + f.falta.join(', ') + '</span>';
    const usu = f.usuarios.length
      ? '👤 Trabajaron: ' + f.usuarios.slice(0, 4).map(u => '<b>' + escapeHtml_(u.nombre) + '</b> (' + u.n + ')').join(', ') + (f.usuarios.length > 4 ? ' y ' + (f.usuarios.length - 4) + ' más' : '')
      : '👤 Nadie ha trabajado aún en esta comuna';
    const ajena = f.alcance && f.alcance !== 'mia';
    // 19-10-2026: la torta de implementación va junto al nombre (aprovecha el espacio de la primera columna)
    return '<div class="sg-com' + (ajena ? ' ajena' : '') + '" style="--c:' + (ajena ? '#94A3B8' : col) + '">' +
      '<div class="sg-nom-impl"><div class="nom"><b>' + escapeHtml_(f.c.comuna) + (f.lista ? ' ✅' : '') + '</b>' +
        '<span class="prio-badge" style="background:' + n.color + ';color:' + n.texto + ';">Prioridad ' + n.nombre + (f.nivel != null ? ' · ' + fmtNivelPrio_(f.nivel) : '') + '</span>' +
        // Etiquetas: responsable y jefe (Comunas Prioritarias › 👥 Asignar responsables) y SIEMPRE el área de relacionamiento
        '<div class="sg-resp">' +
          (ajena ? (f.alcance === 'otra'
            ? '<span class="sg-etq otra" title="Esta comuna es de otra subgerencia">🔒 Subgerencia ' + escapeHtml_(f.subgs.map(aTitulo_).join(' / ') || '—') + '</span>'
            : '<span class="sg-etq sinarea" title="Sin área de relacionamiento: asígnala en Administración › Comunas por área">⚠️ Sin área asignada</span>') : '') +
          (f.responsable ? '<span class="sg-etq resp" title="Responsable de la comuna">👤 ' + escapeHtml_(f.responsable) + '</span>'
                         : '<span class="sg-etq vacio" title="Asígnalo en Comunas Prioritarias › 👥 Asignar responsables">👤 Sin responsable</span>') +
          // 19-10-2026: sin las etiquetas de Jefe de Área y Área de relacionamiento (siguen en el Excel y en el filtro Área)
        '</div></div>' + sgImplHtml_(f.c) + '</div>' +
      '<div class="sg-alertas" title="Nivel de copamiento por alerta sobre la zona de incendios del trienio">' +
        tarjetaAlerta('🟢 Normal', f.pN, '#16A34A') + tarjetaAlerta('🟡 Amarilla', f.pA, '#D97706') + tarjetaAlerta('🔴 Roja', f.pR, '#DC2626') + '</div>' +
      '<div>' + est + '<div class="sg-usu">' + usu + (f.grd ? '<br>🏛️ GRD: ' + escapeHtml_(f.grd) : '') + '</div>' +
        (ajena ? '' : '<button class="sg-ver-mapa" data-sg-mapa="' + f.c.id_comuna + '" title="Ver el copamiento de ' + escapeHtml_(f.c.comuna) + ' en el mapa (Normal, Amarilla y Roja)">🗺️ Ver copamiento en el mapa</button>') + '</div>' +
    '</div>';
  }).join('') || '<div class="tb-vacio">Sin comunas con este filtro.</div>';
  if (soloLista && document.getElementById('sg-lista')) { document.getElementById('sg-lista').innerHTML = lista; return; }
  const promDe = k => todas.length ? Math.round(todas.reduce((s, f) => s + (Number(f[k]) || 0), 0) / todas.length) : 0;
  const cuentaPrio = p => todasSinPrio.filter(f => String(f.prio) === p).length;
  const chipPrio = (p, txt) => '<button class="sg-chip' + (S.prios.includes(p) ? ' on' : '') + '" data-sg-prio="' + p + '">' + txt + '<small>' + cuentaPrio(p) + '</small></button>';
  const A = S.area ? D.areas[S.area] : null;
  const verTodas = S.alcance === 'todas' && !S.area;
  const subgTxt = sgModoAdmin_() && !sgSubgActiva_() ? 'las subgerencias' : 'tu subgerencia';
  cuerpo.innerHTML =
    // Prioridad primero (varias a la vez)
    '<div class="sg-chips sg-chips-prio"><span class="tit">Prioridad</span>' + chipPrio('1', '🔴 Alta') + chipPrio('2', '🟠 Media') + chipPrio('3', '🟢 Baja') +
      (S.prios.length ? '<button class="sg-chip" data-sg-prio="__todas__">✕ Todas</button>' : '') +
      '<span style="font-size:11px;color:var(--text-tertiary);margin-left:6px;">Puedes marcar varias (p. ej. Alta + Media)</span></div>' +
    // 22-10-2026: sin la franja «N comunas con presencia CMPC · Mostrar», sin la fila «Estado» y sin la cabecera del área
    // elegida (pedido del usuario). El buscador pasa a la fila de Área.
    '<div class="sg-chips"><span class="tit">Área</span>' + chip('area', '', 'Todas', D.comunas.length) +
      areas.map(a => chip('area', a.k, escapeHtml_(aTitulo_(a.nombre)), a.comunas.size)).join('') +
      '<input id="sg-q" class="admin-search" placeholder="Buscar comuna…" value="' + escapeHtml_(S.q || '') + '" style="max-width:180px;margin-left:auto;"></div>' +
    '<div class="sg-resumen">' +
      '<div><b>' + todas.length + '</b><span>comunas' + (A ? ' del área' : verTodas ? ' mostradas (todas las CMPC)' : ' de la subgerencia') + ' con presencia CMPC</span></div>' +
      '<div style="--c:#DC2626"><b>' + cuenta('estado', 'sin') + '</b><span>⛔ sin iniciar</span></div>' +
      '<div style="--c:#16A34A"><b>' + cuenta('estado', 'ok') + '</b><span>✅ con los 3 escenarios</span></div>' +
      // Una tarjeta por alerta: copamiento promedio de las comunas mostradas
      '<div class="sg-res-al" style="--c:#16A34A"><b>' + promDe('pN') + '%</b><span>🟢 copamiento Normal</span><i><em style="width:' + promDe('pN') + '%"></em></i></div>' +
      '<div class="sg-res-al" style="--c:#D97706"><b>' + promDe('pA') + '%</b><span>🟡 copamiento Alerta Amarilla</span><i><em style="width:' + promDe('pA') + '%"></em></i></div>' +
      '<div class="sg-res-al" style="--c:#DC2626"><b>' + promDe('pR') + '%</b><span>🔴 copamiento Alerta Roja</span><i><em style="width:' + promDe('pR') + '%"></em></i></div>' +
    '</div>' +
    '<div class="sg-lista" id="sg-lista">' + lista + '</div>';
  state.sg.ultimoComunas = filas;
}

/** 🗺️ Ver el copamiento de la comuna en el mapa (interactivo): Planificador de Alertas en modo consulta,
 *  con las capas Normal, Amarilla y Roja encendidas, y un botón para volver al Seguimiento. */
function verCopamientoMapaSg_(idComuna) {
  const cm = (state.comunas || []).find(c => Number(c.id_comuna) === Number(idComuna));
  if (!cm) { mostrarToast_('Esta comuna no está habilitada en el sistema.'); return; }
  if (hayModoTrabajoActivo_()) { mostrarToast_('🔒 Termina o cancela ' + nombreModoTrabajo_() + ' antes de cambiar de comuna.'); return; }
  mostrarVista_('mapa', 'planificador');
  if (state.activeComunaId !== cm.id) seleccionarComuna_(cm.id);
  const encender = () => {
    const capas = {
      verde: [capaAlertaVerdeLayer, planificacionRecursosVerdeLayer],
      amarilla: [capaAlertaAmarillaLayer, planificacionRecursosAmarillaLayer],
      roja: [capaAlertaRojaLayer, planificacionRecursosRojaLayer],
    };
    Object.keys(capas).forEach(k => { state.alertaLayersOn[k] = true; capas[k].forEach(l => { if (!map.hasLayer(l)) l.addTo(map); }); });
    try { renderTab(state.activeTab || 'capas'); } catch (e) { /* panel cerrado */ }
  };
  setTimeout(encender, 400); setTimeout(encender, 1500);   // tras cargar la comuna y su planificación
  // Botón flotante para volver al tablero
  let b = document.getElementById('btn-volver-sg');
  if (!b) {
    b = document.createElement('button'); b.id = 'btn-volver-sg'; b.type = 'button';
    b.addEventListener('click', () => { b.style.display = 'none'; mostrarVista_('seguimiento'); });
    document.body.appendChild(b);
  }
  b.textContent = '← Volver a Seguimiento · ' + cm.comuna;
  b.style.display = '';
  mostrarToast_('🗺️ ' + cm.comuna + ': copamiento Normal · Amarilla · Roja. Clic en rutas y puntos para ver su detalle.');
}

/* ── 🌲 Vista Inicio de recursos ── */
function sgRecursosFiltrados_() {
  const D = state.sg.datos, S = state.sg, hoy = new Date(); hoy.setHours(12, 0, 0, 0);
  const todos = Object.values(D.areas).flatMap(a => a.rec.map(r => Object.assign({ _area: a }, r)));
  return todos.filter(r => {
    if (S.rArea && r._area.k !== S.rArea) return false;
    if (S.rTipo && r.tipo_recurso !== S.rTipo) return false;
    const d = sgFecha_(r.fecha_inicio_operacion), dias = d ? Math.round((d - hoy) / SG_DIA) : null;
    if (S.rPeriodo === 'iniciados' && !(d && dias <= 0)) return false;
    if (S.rPeriodo === '7' && !(d && dias > 0 && dias <= 7)) return false;
    if (S.rPeriodo === '30' && !(d && dias > 0 && dias <= 30)) return false;
    if (S.rPeriodo === 'futuro' && !(d && dias > 30)) return false;
    if (S.rPeriodo === 'sin' && d) return false;
    return true;
  }).sort((a, b) => (sgFecha_(a.fecha_inicio_operacion) || 9e15) - (sgFecha_(b.fecha_inicio_operacion) || 9e15) || compararTipoRecurso_(a.tipo_recurso, b.tipo_recurso));
}
function renderSgRecursos_() {
  const D = state.sg.datos, S = state.sg, cuerpo = document.getElementById('sg-cuerpo');
  const areas = Object.values(D.areas).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  const hoy = new Date(); hoy.setHours(12, 0, 0, 0);
  const base = Object.values(D.areas).flatMap(a => a.rec.map(r => Object.assign({ _area: a }, r))).filter(r => !S.rArea || r._area.k === S.rArea);
  const diasDe = r => { const d = sgFecha_(r.fecha_inicio_operacion); return d ? Math.round((d - hoy) / SG_DIA) : null; };
  const cnt = f => base.filter(f).length;
  const chip = (k, v, txt, n) => '<button class="sg-chip' + (S[k] === v ? ' on' : '') + '" data-sg-f="' + k + '|' + escapeHtml_(v) + '">' + txt + (n != null ? '<small>' + n + '</small>' : '') + '</button>';
  const tipos = [...new Set(base.map(r => r.tipo_recurso).filter(Boolean))].sort(compararTipoRecurso_);
  const lista = sgRecursosFiltrados_();
  const paleta = ['#2563EB', '#16A34A', '#D97706', '#7C3AED', '#DC2626', '#0891B2', '#DB2777', '#65A30D', '#EA580C', '#0F766E'];
  const colorArea = {}; areas.forEach((a, i) => { colorArea[a.k] = paleta[i % paleta.length]; });
  // Línea de tiempo: eje entre la primera y la última fecha de inicio (y hoy)
  const fechas = lista.map(r => sgFecha_(r.fecha_inicio_operacion)).filter(Boolean);
  let tl = '<div class="tb-vacio" style="padding:10px;">Sin fechas de inicio para graficar con este filtro.</div>';
  if (fechas.length) {
    const t0 = new Date(Math.min(hoy, ...fechas)); t0.setDate(1);
    const t1 = new Date(Math.max(hoy, ...fechas)); t1.setMonth(t1.getMonth() + 1, 1);
    const pos = d => ((d - t0) / (t1 - t0) * 100).toFixed(2) + '%';
    const meses = []; for (const m = new Date(t0); m <= t1; m.setMonth(m.getMonth() + 1)) meses.push(new Date(m));
    const carriles = S.rArea
      ? [...new Set(lista.map(r => r.tipo_recurso || 'Sin tipo'))].sort(compararTipoRecurso_).map(t => ({ lbl: aTitulo_(t), rs: lista.filter(r => (r.tipo_recurso || 'Sin tipo') === t) }))
      : areas.map(a => ({ lbl: aTitulo_(a.nombre), rs: lista.filter(r => r._area.k === a.k) })).filter(x => x.rs.length);
    tl = '<div class="sg-tl-eje">' + meses.map(m => '<span style="left:' + pos(m) + '">' + TURNOS_MESES[m.getMonth()].slice(0, 3) + ' ' + String(m.getFullYear()).slice(2) + '</span>').join('') + '</div>' +
      carriles.map(c => '<div class="sg-tl-fila"><div class="lbl" title="' + escapeHtml_(c.lbl) + '">' + escapeHtml_(c.lbl) + ' <small>' + c.rs.length + '</small></div><div class="pista">' +
        (hoy >= t0 && hoy <= t1 ? '<div class="sg-tl-hoy" style="left:' + pos(hoy) + '"></div>' : '') +
        c.rs.filter(r => sgFecha_(r.fecha_inicio_operacion)).map(r => '<span class="sg-tl-punto" style="left:' + pos(sgFecha_(r.fecha_inicio_operacion)) + ';background:' + (S.rArea ? plColorTipo_(r.tipo_recurso) : colorArea[r._area.k]) + ';" title="' +
          escapeHtml_(claveIdRecurso_(r) + ' · ' + aTitulo_(r.tipo_recurso || '') + ' · inicia ' + sgFechaTxt_(sgFecha_(r.fecha_inicio_operacion))) + '"></span>').join('') +
        '</div></div>').join('');
  }
  const estadoTxt = r => { const d = diasDe(r); return d == null ? '<span style="color:#B45309;font-weight:700;">❓ Sin fecha</span>' : d <= 0 ? '<span style="color:#16A34A;font-weight:700;">✅ Iniciado hace ' + (-d) + ' día(s)</span>' : '<span style="color:' + (d <= 7 ? '#DC2626' : '#2563EB') + ';font-weight:700;">⏳ Inicia en ' + d + ' día(s)</span>'; };
  cuerpo.innerHTML =
    '<div class="sg-chips"><span class="tit">Área</span>' + chip('rArea', '', 'Toda la subgerencia', Object.values(D.areas).reduce((s, a) => s + a.rec.length, 0)) +
      areas.map(a => chip('rArea', a.k, '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:' + colorArea[a.k] + ';margin-right:4px;"></span>' + escapeHtml_(aTitulo_(a.nombre)), a.rec.length)).join('') + '</div>' +
    '<div class="sg-chips"><span class="tit">Inicio</span>' +
      chip('rPeriodo', 'iniciados', '✅ Ya iniciados', cnt(r => { const d = diasDe(r); return d != null && d <= 0; })) +
      chip('rPeriodo', '7', '⏳ Próximos 7 días', cnt(r => { const d = diasDe(r); return d != null && d > 0 && d <= 7; })) +
      chip('rPeriodo', '30', '📅 Próximos 30 días', cnt(r => { const d = diasDe(r); return d != null && d > 0 && d <= 30; })) +
      chip('rPeriodo', 'futuro', '🗓️ Más adelante', cnt(r => { const d = diasDe(r); return d != null && d > 30; })) +
      chip('rPeriodo', 'sin', '❓ Sin fecha', cnt(r => diasDe(r) == null)) +
      '<select id="sg-rtipo" class="admin-search" style="margin-left:auto;max-width:210px;"><option value="">Todos los tipos</option>' +
        tipos.map(t => '<option value="' + escapeHtml_(t) + '"' + (S.rTipo === t ? ' selected' : '') + '>' + escapeHtml_(aTitulo_(t)) + '</option>').join('') + '</select></div>' +
    '<div class="sg-resumen">' +
      '<div><b>' + lista.length + '</b><span>recursos con este filtro</span></div>' +
      '<div style="--c:#16A34A"><b>' + lista.filter(r => { const d = diasDe(r); return d != null && d <= 0; }).length + '</b><span>✅ ya iniciados</span></div>' +
      '<div style="--c:#2563EB"><b>' + lista.filter(r => { const d = diasDe(r); return d != null && d > 0 && d <= 30; }).length + '</b><span>⏳ inician en 30 días</span></div>' +
      '<div style="--c:#B45309"><b>' + lista.filter(r => diasDe(r) == null).length + '</b><span>❓ sin fecha de inicio</span></div>' +
    '</div>' +
    '<div class="sg-graficos">' +
    '<div class="sg-tl"><div class="sg-sec" style="margin-top:0;">📅 Inicios de operación ' + (S.rArea ? 'por tipo · ' + escapeHtml_(aTitulo_(D.areas[S.rArea].nombre)) : 'por área') + ' <small>cada punto es un recurso · línea roja = hoy</small></div>' +
      '<div class="sg-tl-cuerpo">' + tl + '</div></div>' +
    '<div class="sg-tl"><div class="sg-sec" style="margin-top:0;">📈 Activación de recursos por quincena</div>' +
      '<p style="margin:-6px 0 8px;font-size:11.5px;color:var(--text-tertiary);">Barras: recursos que inician en cada quincena, por tipo · línea verde: % acumulado hasta el 100%' +
      (lista.length - lista.filter(r => sgFecha_(r.fecha_inicio_operacion)).length ? ' · ' + (lista.length - lista.filter(r => sgFecha_(r.fecha_inicio_operacion)).length) + ' sin fecha de inicio' : '') + '</p>' +
      '<div class="sg-graf-canvas"><canvas id="sg-chart-quincena"></canvas></div></div>' +
    '</div>' +
    '<div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Recurso</th><th>Tipo</th><th>Área</th><th>Inicio</th><th>Término</th><th>Estado</th></tr></thead><tbody>' +
      (lista.map(r => '<tr><td><b>📻 ' + escapeHtml_(claveIdRecurso_(r) || '—') + '</b></td><td>' + escapeHtml_(aTitulo_(r.tipo_recurso || '')) + '</td>' +
        '<td><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:' + colorArea[r._area.k] + ';margin-right:5px;"></span>' + escapeHtml_(aTitulo_(r._area.nombre)) + '</td>' +
        '<td>' + sgFechaTxt_(sgFecha_(r.fecha_inicio_operacion)) + '</td><td>' + sgFechaTxt_(sgFecha_(r.fecha_termino_operacion)) + '</td><td>' + estadoTxt(r) + '</td></tr>').join('') ||
        '<tr><td colspan="6" style="padding:14px;color:var(--text-tertiary);">Sin recursos con este filtro.</td></tr>') +
    '</tbody></table></div>';
  // Gráfico: activación por quincena (igual al Tablero de Recursos): barras apiladas por tipo + % acumulado
  if (chartSgInicios) { chartSgInicios.destroy(); chartSgInicios = null; }
  if (chartSgActivacion) { chartSgActivacion.destroy(); chartSgActivacion = null; }
  const conFecha = lista.filter(r => sgFecha_(r.fecha_inicio_operacion));
  const canvas = document.getElementById('sg-chart-quincena');
  if (canvas && window.Chart && conFecha.length) {
    const fechasQ = conFecha.map(r => String(r.fecha_inicio_operacion).slice(0, 10)).sort();
    const quincenas = [];
    const hoyQ = tbHoyISO_();
    let q = tbQuincena_(hoyQ < fechasQ[0] ? hoyQ : fechasQ[0]); const ultima = tbQuincena_(fechasQ[fechasQ.length - 1]).key;
    for (let i = 0; i < 48; i++) { quincenas.push(q); if (q.key === ultima) break; q = tbQuincenaSiguiente_(q); }
    const recPorQ = {}; quincenas.forEach(x => { recPorQ[x.key] = []; });
    conFecha.forEach(r => { const k = tbQuincena_(r.fecha_inicio_operacion).key; (recPorQ[k] = recPorQ[k] || []).push(r); });
    const tiposQ = [...new Set(conFecha.map(r => r.tipo_recurso || 'Sin tipo'))].sort(compararTipoRecurso_);
    const oscuro = document.body.classList.contains('tema-oscuro');
    const txt = oscuro ? '#CBD5E1' : '#475569', grid = oscuro ? 'rgba(148,163,184,.15)' : 'rgba(15,23,42,.07)';
    let a = 0;
    const acumN = quincenas.map(x => (a += (recPorQ[x.key] || []).length));
    const total = lista.length;
    const acumulado = acumN.map(n => Math.round(1000 * n / total) / 10);
    const etiquetasPct = {
      id: 'sgEtiquetasPct',
      afterDatasetsDraw(chart) {
        const i = chart.data.datasets.length - 1, meta = chart.getDatasetMeta(i);
        if (!meta || meta.hidden) return;
        const ctx = chart.ctx; ctx.save();
        ctx.font = '700 11px Inter, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
        meta.data.forEach((pt, k) => {
          const v = chart.data.datasets[i].data[k];
          if (k > 0 && v === chart.data.datasets[i].data[k - 1]) return;   // sin cambio: no se repite
          const t = (v > 0 && v < 10 ? v.toLocaleString('es-CL') : Math.round(v)) + '%';
          const w = ctx.measureText(t).width + 8, x = pt.x, y = pt.y - 8;
          ctx.fillStyle = oscuro ? 'rgba(15,23,42,.92)' : 'rgba(255,255,255,.95)';
          ctx.strokeStyle = '#16A34A'; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x - w / 2, y - 16, w, 16, 6) : ctx.rect(x - w / 2, y - 16, w, 16); ctx.fill(); ctx.stroke();
          ctx.fillStyle = '#16A34A'; ctx.fillText(t, x, y - 2);
        });
        ctx.restore();
      },
    };
    chartSgInicios = new Chart(canvas, {
      plugins: [etiquetasPct],
      data: {
        labels: quincenas.map(x => x.label),
        datasets: tiposQ.map(t => ({
          type: 'bar', label: aTitulo_(t), stack: 'q', backgroundColor: plColorTipo_(t), borderRadius: 3, yAxisID: 'y',
          data: quincenas.map(x => (recPorQ[x.key] || []).filter(r => (r.tipo_recurso || 'Sin tipo') === t).length),
        })).concat([{ type: 'line', label: 'Activación acumulada (%)', data: acumulado, yAxisID: 'y2', borderColor: '#16A34A',
          backgroundColor: '#16A34A', borderWidth: 2.5, pointRadius: 4, pointBackgroundColor: oscuro ? '#E2E8F0' : '#0F172A', tension: 0.25, borderDash: [5, 4] }]),
      },
      options: {
        responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { position: 'bottom', labels: { color: txt, boxWidth: 12, font: { size: 11 } } },
          tooltip: { callbacks: {
            label: it => it.dataset.type === 'line' ? ' Activación acumulada: ' + it.parsed.y.toLocaleString('es-CL') + '% (' + acumN[it.dataIndex] + ' de ' + total + ')'
                                                    : ' ' + it.dataset.label + ': ' + it.parsed.y,
            footer: items => 'Se activan: ' + items.filter(i => i.dataset.type === 'bar').reduce((s, i) => s + i.parsed.y, 0) } },
        },
        layout: { padding: { top: 22 } },
        scales: {
          x: { stacked: true, ticks: { color: txt, font: { size: 11 } }, grid: { display: false } },
          y: { stacked: true, beginAtZero: true, title: { display: true, text: 'Recursos que se activan', color: txt }, ticks: { color: txt, precision: 0 }, grid: { color: grid } },
          y2: { position: 'right', min: 0, max: 100, title: { display: true, text: 'Activación acumulada', color: txt }, ticks: { color: txt, callback: v => v + '%' }, grid: { display: false } },
        },
      },
    });
  }
  state.sg.ultimoRecursos = lista;
}

async function descargarSeguimiento_() {
  const D = state.sg.datos; if (!D) { mostrarToast_('No hay datos para descargar.'); return; }
  try {
    const XLSX = await tbCargarSheetJs_();
    const wb = XLSX.utils.book_new();
    const hoy = new Date(); hoy.setHours(12, 0, 0, 0);
    // Las ~103 comunas CMPC, indicando si son de la subgerencia (18-10-2026)
    const baseX = D.todas || D.comunas.map(c => ({ c, alcance: 'mia', subgs: [] }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(baseX.map(x => Object.assign(sgComuna_(x.c), { alcance: x.alcance, subgs: x.subgs }))
      .sort((a, b) => (a.alcance === 'mia' ? 0 : 1) - (b.alcance === 'mia' ? 0 : 1) || a.prio - b.prio || a.c.comuna.localeCompare(b.c.comuna, 'es')).map(f => ({
      'Comuna': f.c.comuna,
      'Alcance': f.alcance === 'mia' ? 'De la subgerencia' : f.alcance === 'otra' ? 'Otra subgerencia (' + f.subgs.map(aTitulo_).join(' / ') + ')' : 'Sin área asignada',
      'Responsable': f.responsable, 'Jefe de Área': f.jefe, 'Área(s)': f.areas.map(aTitulo_).join(' / '), 'Prioridad': prioInfo_(f.prio).nombre, 'Nivel': f.nivel,
      'Copamiento Normal %': Math.round(f.pN), 'Copamiento Amarilla %': Math.round(f.pA), 'Copamiento Roja %': Math.round(f.pR),
      'Estado': f.estado === 'sin' ? 'Sin iniciar' : f.estado === 'ok' ? '3 escenarios' : 'En curso (falta ' + f.falta.join(', ') + ')',
      'Usuarios que trabajaron': f.usuarios.map(u => u.nombre + ' (' + u.n + ')').join(', '), 'GRD': f.grd, 'Lista': f.lista ? 'Sí' : 'No',
    }))), 'Comunas');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(Object.values(D.areas).flatMap(a => a.rec.map(r => {
      const d = sgFecha_(r.fecha_inicio_operacion), dias = d ? Math.round((d - hoy) / SG_DIA) : null;
      return { 'Clave · ID': claveIdRecurso_(r), 'Tipo': aTitulo_(r.tipo_recurso || ''), 'Área': aTitulo_(a.nombre), 'Inicio': d ? d.toISOString().slice(0, 10) : '',
        'Término': (sgFecha_(r.fecha_termino_operacion) || { toISOString: () => '' }).toISOString().slice(0, 10),
        'Estado': dias == null ? 'Sin fecha' : dias <= 0 ? 'Iniciado' : 'Inicia en ' + dias + ' día(s)' };
    }))), 'Inicio de recursos');
    // Turnos: completitud del calendario (si ya se abrió la vista 📅 Turnos)
    const T = state.sg.ultimoTurnos;
    if (T) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(T.areas.flatMap(x => x.ev.map(i => ({
      'Periodo': T.P.nombre, 'Área': aTitulo_(x.a.nombre), 'Jefe de Área': x.a.jefes.join(', '), 'Clave · ID': claveIdRecurso_(i.r), 'Tipo': aTitulo_(i.r.tipo_recurso || ''),
      'Días que opera': i.operan, 'Días en turno': i.turnos, 'Máx. días libres seguidos': i.max,
      'Calendario': i.completo ? 'Completo' : 'Falta completar', 'Racha libre': i.max ? i.maxIni + ' a ' + i.maxFin : '',
    })))), 'Turnos');
    XLSX.writeFile(wb, 'seguimiento_subgerencia_' + tbHoyISO_() + '.xlsx');
    mostrarToast_('✅ Seguimiento descargado.');
  } catch (e) { mostrarToast_('No se pudo generar el Excel: ' + (e.message || e)); }
}

