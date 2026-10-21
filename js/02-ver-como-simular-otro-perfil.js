/* ============ "VER COMO…" — SIMULAR OTRO PERFIL (solo Administrador) ============
 * Para verificar qué ve y qué puede hacer cada perfil. Se guarda en
 * sessionStorage (solo esta pestaña) y se RECARGA la página: así toda la
 * interfaz se arma desde cero con el perfil simulado y sus asignaciones:
 *   · Jefe de Área: el área elegida (y las comunas de esa área, v_area_comunas)
 *   · GRD / Visor: la comuna elegida
 * Importante: la base de datos sigue reconociendo al usuario como Administrador
 * (la sesión no cambia). Se prueban las restricciones de la INTERFAZ (pestañas,
 * botones, capas, filtros); lo que la base permitiría escribir sigue siendo de
 * Administrador, y capas que filtra el servidor por perfil (p. ej. Áreas de
 * Relacionamiento) pueden mostrar de más. */
const SIM_CLAVE = 'sig_simulacion_perfil';
const SIM_PERFILES = ['GRD', 'Visor', 'Jefe de Área Relacionamiento'];

function leerSimulacion_() {
  try { return JSON.parse(sessionStorage.getItem(SIM_CLAVE) || 'null'); } catch (e) { return null; }
}

function aplicarSimulacionPerfil_(perfilReal) {
  state.perfilReal = perfilReal.perfil;
  state.simulacion = null;
  const sim = leerSimulacion_();
  if (perfilReal.perfil !== 'Administrador') {           // solo un Administrador puede simular
    if (sim) try { sessionStorage.removeItem(SIM_CLAVE); } catch (e) {}
    return;
  }
  if (!sim || !SIM_PERFILES.includes(sim.perfil)) return;
  state.simulacion = sim;
  state.perfil = Object.assign({}, perfilReal, { perfil: sim.perfil, comuna_id: sim.comunaId || perfilReal.comuna_id });
}

async function cargarAsignacionSimulada_() {
  const s = state.simulacion;
  if (s.subgerencia) {
    // Modo Subgerente: todas las áreas de la subgerencia (según los recursos) y sus comunas (SQL 94)
    const { data: rr } = await supabaseClient.from('referencia_recursos').select('area_nombre, subgerencia').not('subgerencia', 'is', null);
    const areas = new Map();
    (rr || []).forEach(r => { if (String(r.subgerencia).trim().toUpperCase() === s.subgerencia && r.area_nombre) areas.set(plNorm_(r.area_nombre).replace(/[^A-Z0-9]/g, ''), r.area_nombre); });
    state.misAreasIds = [...areas.values()];
    const { data: ac } = await supabaseClient.from('v_area_comunas_admin').select('area_norm, id_comuna');
    const ids = new Set((ac || []).filter(x => areas.has(String(x.area_norm || '').toUpperCase())).map(x => Number(x.id_comuna)));
    state.misComunaIds = (state.comunas || []).filter(c => ids.has(Number(c.id_comuna))).map(c => c.id);
    if (!state.misAreasIds.length) mostrarToast_('⚠️ La subgerencia "' + s.subgerencia + '" no tiene áreas.');
    return;
  }
  if (s.perfil === 'Jefe de Área Relacionamiento') {
    state.misAreasIds = [s.area];
    const clave = plNorm_(s.area).replace(/[^A-Z0-9]/g, '');   // = clave_area_red_vial_ (SQL 71)
    // Comunas que administra el área (SQL 94); sin el 94, la relación territorial
    let { data, error } = await supabaseClient.from('v_area_comunas_admin').select('id_comuna').eq('area_norm', clave);
    if (error) ({ data } = await supabaseClient.from('v_area_comunas').select('id_comuna').eq('area_norm', clave));
    const ids = new Set((data || []).map(x => x.id_comuna));
    state.misComunaIds = (state.comunas || []).filter(c => ids.has(c.id_comuna)).map(c => c.id);
    if (!state.misComunaIds.length) mostrarToast_('⚠️ El área "' + s.area + '" no tiene comunas asociadas.');
  } else {
    state.misComunaIds = s.comunaId ? [s.comunaId] : [];
    state.misAreasIds = [];
  }
}

function entrarSimulacion_(sim) {
  try { sessionStorage.setItem(SIM_CLAVE, JSON.stringify(sim)); } catch (e) { mostrarToast_('No se pudo activar el modo.'); return; }
  location.reload();
}

function salirSimulacion_() {
  try { sessionStorage.removeItem(SIM_CLAVE); } catch (e) {}
  location.reload();
}

/** Menú del usuario (opciones "Ver como…") + franja visible mientras se simula. */
function renderSimulacionPerfil_() {
  const bloque = document.getElementById('up-simulacion');
  if (bloque) bloque.style.display = state.perfilReal === 'Administrador' ? '' : 'none';
  const salir = document.getElementById('btn-sim-salir');
  if (salir) salir.style.display = state.simulacion ? '' : 'none';

  let franja = document.getElementById('franja-simulacion');
  if (!state.simulacion) { if (franja) franja.remove(); return; }
  const s = state.simulacion;
  const nombrePerfil = s.asociacion ? 'Asociación de Agricultores' : s.subgerencia ? 'Subgerente' : s.perfil === 'Jefe de Área Relacionamiento' ? 'Jefe de Área' : s.perfil;
  const cm = (state.comunas || []).find(c => c.id === s.comunaId);
  const donde = s.asociacion ? aTitulo_(s.asociacion) + ' · área ' + aTitulo_(AGR_AREA_VISIBLE)
    : s.subgerencia ? 'Subgerencia ' + aTitulo_(s.subgerencia) + ' (' + (state.misAreasIds || []).length + ' áreas)'
    : s.perfil === 'Jefe de Área Relacionamiento' ? 'Área ' + s.area : (cm ? cm.comuna : s.comunaId);
  if (!franja) {
    // Dentro de la barra superior (junto a 🔄), para no tapar filtros ni barras de herramientas
    franja = document.createElement('div');
    franja.id = 'franja-simulacion';
    const der = document.querySelector('.navbar__right'), ref = document.getElementById('btn-actualizar-datos');
    if (der && ref) der.insertBefore(franja, ref); else document.body.appendChild(franja);
  }
  franja.title = 'Viendo como ' + nombrePerfil + ' · ' + (donde || '—') +
    '. La sesión sigue siendo de Administrador: se prueban las restricciones de la interfaz; la base de datos te sigue permitiendo todo lo de Administrador.';
  franja.innerHTML = '<span class="fs-ico">👁️</span><span class="fs-txt"><b>' + escapeHtml_(nombrePerfil) + '</b> · ' + escapeHtml_(donde || '—') + '</span>' +
    '<button type="button" id="fs-salir" title="Volver a Administrador">Salir</button>';
  franja.querySelector('#fs-salir').addEventListener('click', salirSimulacion_);
  const rol = document.getElementById('up-rol');
  if (rol) rol.textContent = nombrePerfil + ' (simulado)';
}

/** Ventana para elegir el modo: 'jefe' (área) o 'comuna' (GRD / Visor + comuna). */
function abrirModalSimulacion_(tipo) {
  document.getElementById('user-panel').classList.remove('show');
  let ov = document.getElementById('sim-overlay');
  if (!ov) {
    ov = document.createElement('div');
    ov.id = 'sim-overlay';
    ov.className = 'modal-overlay';
    document.body.appendChild(ov);
    ov.addEventListener('click', (e) => { if (e.target === ov) ov.classList.remove('show'); });
  }
  if (tipo === 'subgerente') { abrirModalSimulacionSubgerente_(ov); return; }
  const esJefe = tipo === 'jefe';
  const opcComunas = () => {
    const porRegion = {};
    (state.comunas || []).forEach(c => { (porRegion[c.region] = porRegion[c.region] || []).push(c); });
    return Object.keys(porRegion).sort().map(reg => '<optgroup label="' + escapeHtml_(reg) + '">' +
      porRegion[reg].sort((a, b) => a.comuna.localeCompare(b.comuna, 'es'))
        .map(c => '<option value="' + escapeHtml_(c.id) + '"' + (c.id === state.activeComunaId ? ' selected' : '') + '>' + escapeHtml_(c.comuna) + '</option>').join('') +
      '</optgroup>').join('');
  };
  ov.innerHTML =
    '<div class="modal-card" style="max-width:420px;">' +
      '<h3>' + (esJefe ? '🧭 Modo Jefe de Área' : '🏛️ Modo GRD / Visor') + '</h3>' +
      '<p class="coords">Verás el sistema con las restricciones de ese perfil. La página se recargará; para volver usa "Salir" en la franja naranja.</p>' +
      (esJefe
        ? '<div class="form-group"><label>Área a revisar</label><select id="sim-area">' +
            (state.areasCatalogo || []).map(a => '<option value="' + escapeHtml_(a) + '">' + escapeHtml_(a) + '</option>').join('') + '</select></div>'
        : '<div class="form-group"><label>Perfil</label><select id="sim-perfil"><option value="GRD">GRD (edita su comuna)</option><option value="Visor">Visor (solo consulta)</option></select></div>' +
          '<div class="form-group"><label>Comuna a monitorear</label><select id="sim-comuna">' + opcComunas() + '</select></div>') +
      '<div class="modal-actions" style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px;">' +
        '<button class="btn-secondary" id="sim-cancelar">Cancelar</button>' +
        '<button class="btn-primary" id="sim-entrar">Entrar en el modo</button>' +
      '</div>' +
    '</div>';
  ov.querySelector('#sim-cancelar').addEventListener('click', () => ov.classList.remove('show'));
  ov.querySelector('#sim-entrar').addEventListener('click', () => {
    if (esJefe) {
      const area = ov.querySelector('#sim-area').value;
      if (!area) return;
      entrarSimulacion_({ perfil: 'Jefe de Área Relacionamiento', area });
    } else {
      const comunaId = ov.querySelector('#sim-comuna').value;
      if (!comunaId) return;
      entrarSimulacion_({ perfil: ov.querySelector('#sim-perfil').value, comunaId });
    }
  });
  ov.classList.add('show');
}

/** Modo Subgerente: elegir la subgerencia (sus áreas salen de los recursos). */
async function abrirModalSimulacionSubgerente_(ov) {
  ov.innerHTML = '<div class="modal-card" style="max-width:440px;"><h3>📈 Modo Subgerente</h3><p class="coords">Cargando subgerencias…</p></div>';
  ov.classList.add('show');
  const { data } = await supabaseClient.from('referencia_recursos').select('subgerencia, area_nombre').not('subgerencia', 'is', null);
  const cat = {};
  (data || []).forEach(r => { const s = String(r.subgerencia).trim().toUpperCase(); if (s) (cat[s] = cat[s] || new Set()).add(plNorm_(r.area_nombre)); });
  const subgs = Object.keys(cat).sort();
  ov.innerHTML =
    '<div class="modal-card" style="max-width:440px;">' +
      '<h3>📈 Modo Subgerente de Relacionamiento</h3>' +
      '<p class="coords">Verás el sistema como un Subgerente: todas las áreas de la subgerencia y sus comunas, el tablero 📈 Seguimiento y sin reportes meteorológicos. La página se recargará; para volver usa «Salir» en la etiqueta de la barra superior.</p>' +
      '<div class="form-group"><label>Subgerencia</label><select id="sim-subg">' +
        subgs.map(s => '<option value="' + escapeHtml_(s) + '">' + escapeHtml_(aTitulo_(s)) + ' (' + cat[s].size + ' áreas)</option>').join('') + '</select></div>' +
      '<div class="modal-actions" style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px;">' +
        '<button class="btn-secondary" id="sim-cancelar">Cancelar</button>' +
        '<button class="btn-primary" id="sim-entrar"' + (subgs.length ? '' : ' disabled') + '>Entrar en el modo</button>' +
      '</div>' +
    '</div>';
  ov.querySelector('#sim-cancelar').addEventListener('click', () => ov.classList.remove('show'));
  ov.querySelector('#sim-entrar').addEventListener('click', () => {
    const subgerencia = ov.querySelector('#sim-subg').value;
    if (subgerencia) entrarSimulacion_({ perfil: 'Jefe de Área Relacionamiento', subgerencia });
  });
}

/* ============ DASHBOARD: datos, gráficos y meteorología ============ */
let chartDashCopamiento = null, chartDashAlertas = null;

function comunaDashboard_() {
  const sel = document.getElementById('dash-comuna-select');
  if (state.perfil.perfil === 'Administrador' || tieneVariasComunas_()) {
    return (sel && sel.value) ? sel.value : null; // null = vista general (todas mis comunas)
  }
  return state.activeComunaId || (state.misComunaIds && state.misComunaIds[0]) || null;
}

function poblarFiltroComunaDashboard_() {
  const wrap = document.getElementById('dash-filtro-wrap');
  const sel = document.getElementById('dash-comuna-select');
  const esAdmin = state.perfil.perfil === 'Administrador';
  const variasComunas = tieneVariasComunas_();
  // Filtro visible para: Admin, o cualquier perfil con más de una comuna
  if (!esAdmin && !variasComunas) { wrap.style.display = 'none'; return; }
  wrap.style.display = 'block';
  if (sel.options.length > 0) return;
  const optTodas = document.createElement('option'); optTodas.value = ''; optTodas.textContent = '— Todas mis comunas (general) —';
  sel.appendChild(optTodas);
  if (esAdmin) {
    const favSet = state.comunasFavoritas || new Set();
    const favs = state.comunas.filter(c => favSet.has(c.id));
    if (favs.length) {
      const g = document.createElement('optgroup'); g.label = '⭐ Favoritas';
      favs.sort((a,b)=>a.comuna.localeCompare(b.comuna)).forEach(c => { const o=document.createElement('option'); o.value=c.id; o.textContent='⭐ '+c.comuna; g.appendChild(o); });
      sel.appendChild(g);
    }
    const porRegion = {};
    state.comunas.forEach(c => { (porRegion[c.region] = porRegion[c.region] || []).push(c); });
    Object.keys(porRegion).sort().forEach(region => {
      const g = document.createElement('optgroup'); g.label = region;
      porRegion[region].sort((a,b)=>a.comuna.localeCompare(b.comuna)).forEach(c => { const o=document.createElement('option'); o.value=c.id; o.textContent=c.comuna; g.appendChild(o); });
      sel.appendChild(g);
    });
  } else {
    // Jefe de Área / GRD: solo sus comunas asignadas
    comunasSeleccionablesUsuario_().sort((a,b)=>a.comuna.localeCompare(b.comuna)).forEach(c => {
      const o = document.createElement('option'); o.value = c.id; o.textContent = c.comuna; sel.appendChild(o);
    });
  }
  sel.onchange = () => cargarDashboard_();
}

/** 🤝 Carrusel de municipalidades que forman parte del sistema (17-10-2026): TODOS los logos de
 *  comuna_logo_municipal (no solo las comunas del usuario), en desplazamiento continuo; se detiene al
 *  pasar el mouse. Visible para todos los perfiles menos GRD. Se carga una vez por sesión. */
async function cargarCarruselMunicipios_() {
  const wrap = document.getElementById('dash-munis');
  if (!wrap) return;
  if (!state.perfil) { wrap.style.display = 'none'; return; }   // todos los perfiles (también GRD)
  if (!state.munisLogos) {
    const { data, error } = await supabaseClient.from('comuna_logo_municipal').select('comuna_id, logo_url');
    if (error) { wrap.style.display = 'none'; return; }
    const conLogo = (data || []).filter(l => l.logo_url);
    // Nombres: de las comunas del usuario o, si no las tiene, de la tabla comunas (o el id legible)
    const nombre = {}; (state.comunas || []).forEach(c => { nombre[c.id] = c.comuna; });
    const faltan = conLogo.map(l => l.comuna_id).filter(id => !nombre[id]);
    if (faltan.length) {
      try { const { data: cs } = await supabaseClient.from('comunas').select('id, comuna').in('id', faltan); (cs || []).forEach(c => { nombre[c.id] = c.comuna; }); } catch (e) {}
    }
    const legible = id => String(id || '').replace(/[-_]+/g, ' ').replace(/\b\w/g, m => m.toUpperCase());
    state.munisLogos = conLogo.map(l => ({ id: l.comuna_id, logo: l.logo_url, nombre: nombre[l.comuna_id] || legible(l.comuna_id) }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  }
  const L = state.munisLogos;
  if (!L.length) { wrap.style.display = 'none'; return; }
  const item = m => '<div class="muni-item" title="Municipalidad de ' + escapeHtml_(m.nombre) + '"><img src="' + escapeHtml_(m.logo) + '" alt="' + escapeHtml_(m.nombre) + '" loading="lazy">' +
    '<span class="muni-etq"><small>Municipalidad de</small>' + escapeHtml_(m.nombre) + '</span></div>';
  // Se repite la lista para que el desplazamiento sea continuo (la animación recorre la mitad)
  const vueltas = L.length < 8 ? Math.ceil(8 / L.length) : 1;
  const tira = Array.from({ length: vueltas }, () => L.map(item).join('')).join('');
  const pista = document.getElementById('munis-pista');
  pista.innerHTML = tira + tira;
  pista.style.setProperty('--dur', Math.max(25, L.length * vueltas * 3.2) + 's');
  document.getElementById('munis-n').textContent = '· ' + L.length + (L.length === 1 ? ' municipalidad' : ' municipalidades');
  wrap.style.display = '';
}

async function cargarDashboard_() {
  poblarFiltroComunaDashboard_();
  const comunaId = comunaDashboard_();
  const cfg = comunaId ? state.comunas.find(c => c.id === comunaId) : null;
  document.getElementById('dash-titulo').textContent = cfg ? ('Dashboard · ' + cfg.comuna) : 'Dashboard general';
  document.getElementById('dash-sub').textContent = cfg ? (cfg.region + ' · Resumen de copamiento y alertas') : 'Todas mis comunas · Resumen de copamiento y alertas';
  // Logo bajo el brand: si el filtro tiene una comuna -> logo de esa; si es general -> lista de logos
  actualizarLogoDashboard_(comunaId);
  cargarRedPrevencionDashboard_(comunaId);
  cargarCarruselMunicipios_();   // 🤝 logos municipales al final (todos los perfiles menos GRD)

  let qPeriodos = supabaseClient.from('config_periodos').select('id, comuna_id, nombre_plan, estado_periodo, fecha_inicio, fecha_fin');
  let qRecursos = supabaseClient.from('copamiento_recursos').select('id, comuna_id, id_periodo, tipo_recurso, institucion_id, instituciones(nombre, color_hex)');
  let qPlanes   = supabaseClient.from('planes_contingencia').select('id, comuna_id, escenario, activo');
  if (comunaId) { qPeriodos = qPeriodos.eq('comuna_id', comunaId); qRecursos = qRecursos.eq('comuna_id', comunaId); qPlanes = qPlanes.eq('comuna_id', comunaId); }
  const [{ data: periodos }, { data: recursos }, { data: planes }] = await Promise.all([qPeriodos, qRecursos, qPlanes]);

  const periodosActivos = (periodos || []).filter(p => p.estado_periodo === 'activo');
  const idsActivos = new Set(periodosActivos.map(p => p.id));
  const recActivos = (recursos || []).filter(r => idsActivos.has(r.id_periodo));

  const planIds = (planes || []).map(p => p.id);
  let recPlanif = [];
  if (planIds.length) {
    const { data } = await supabaseClient.from('planificacion_recursos').select('plan_id, tipo_recurso, institucion_id, instituciones(nombre, color_hex)').in('plan_id', planIds);
    recPlanif = data || [];
  }
  const escPorPlan = {}; (planes || []).forEach(p => { escPorPlan[p.id] = p.escenario; });
  const planifAmarilla = recPlanif.filter(r => escPorPlan[r.plan_id] === 'Amarilla');
  const planifRoja = recPlanif.filter(r => escPorPlan[r.plan_id] === 'Roja');

  // (16-10-2026) Sin la fila de KPI del encabezado: el resumen por alerta está en «🧭 Copamiento planificado por alerta».

  // Gráfico copamiento por institución
  const porInst = {};
  recActivos.forEach(r => { const n = (r.instituciones && r.instituciones.nombre) || 'Sin institución'; const c = (r.instituciones && r.instituciones.color_hex) || '#64748B'; if (!porInst[n]) porInst[n] = { n: 0, c }; porInst[n].n++; });
  const labelsC = Object.keys(porInst).sort((a,b)=>porInst[b].n-porInst[a].n);
  renderChartDash_('chart-dash-copamiento', 'copamiento', labelsC, [{ label: 'Recursos', data: labelsC.map(l => porInst[l].n), backgroundColor: labelsC.map(l => porInst[l].c) }], false, 'Sin recursos en periodos activos.');

  // Gráfico alertas por institución
  const instsAl = {};
  const agr = (lista, key) => lista.forEach(r => { const n = (r.instituciones && r.instituciones.nombre) || 'Sin institución'; if (!instsAl[n]) instsAl[n] = { A: 0, R: 0 }; instsAl[n][key]++; });
  agr(planifAmarilla, 'A'); agr(planifRoja, 'R');
  const labelsA = Object.keys(instsAl).sort();
  renderChartDash_('chart-dash-alertas', 'alertas', labelsA, [
    { label: 'Alerta Amarilla', data: labelsA.map(l => instsAl[l].A), backgroundColor: '#F59E0B' },
    { label: 'Alerta Roja', data: labelsA.map(l => instsAl[l].R), backgroundColor: '#EF4444' },
  ], true, 'Sin recursos planificados en alertas.');

  if (!esSubgerente_()) cargarMeteoDashboard_(cfg);   // el Subgerente no usa los reportes meteorológicos
  cargarCopamientoAlertasDash_(planes || [], comunaId);
}

/* ── 🧭 Copamiento planificado por alerta (15-10-2026) ──
 * Por escenario (Normal / Amarilla / Roja): % de la zona de incendios del trienio cubierta (mismo cálculo de
 * Comunas Prioritarias, RPC resumen_comunas_prevencion), km reales de rutas (largo de las líneas planificadas),
 * entidades, instituciones presentes y el aumento respecto de Normal. */
let chartDashKm = null;
const DESC_ESC = [
  { k: 'Verde', n: 'Condiciones Normales', ico: '🟢', c: '#16A34A', pct: 'pct_verde' },
  { k: 'Amarilla', n: 'Alerta Amarilla', ico: '🟡', c: '#D97706', pct: 'pct_amarilla' },
  { k: 'Roja', n: 'Alerta Roja', ico: '🔴', c: '#DC2626', pct: 'pct_roja' },
];
/** Largo en km de un GeoJSON de línea (LineString / MultiLineString), con distancia geodésica. */
function kmGeojsonLinea_(g) {
  if (!g || !g.coordinates) return 0;
  const partes = g.type === 'LineString' ? [g.coordinates] : g.type === 'MultiLineString' ? g.coordinates : [];
  const R = 6371.0088, rad = x => x * Math.PI / 180;
  let km = 0;
  partes.forEach(p => { for (let i = 1; i < p.length; i++) {
    const [lo1, la1] = p[i - 1], [lo2, la2] = p[i];
    const a = Math.sin(rad(la2 - la1) / 2) ** 2 + Math.cos(rad(la1)) * Math.cos(rad(la2)) * Math.sin(rad(lo2 - lo1) / 2) ** 2;
    km += 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
  } });
  return km;
}
async function cargarCopamientoAlertasDash_(planes, comunaId) {
  const cols = document.getElementById('dash-esc-cols'); if (!cols) return;
  const pedido = (cargarCopamientoAlertasDash_.n = (cargarCopamientoAlertasDash_.n || 0) + 1);
  const planesCom = planes.filter(p => p.comuna_id);   // planes de comuna
  const escPorPlan = {}; planesCom.forEach(p => { escPorPlan[p.id] = p.escenario; });
  const cfgDe = id => (state.comunas || []).find(c => c.id === id);
  const comunasPlan = [...new Set(planesCom.map(p => p.comuna_id))];
  document.getElementById('dash-esc-alcance').textContent = comunaId ? (cfgDe(comunaId) || {}).comuna || '' : comunasPlan.length + ' comuna(s) con planificación';
  if (!planesCom.length) {
    cols.innerHTML = '<div class="layer-empty-msg">Aún no hay escenarios planificados' + (comunaId ? ' en esta comuna' : '') + '. Créalos en Gestión SIG ▾ › Planificador de Alertas.</div>';
    document.getElementById('dash-esc-frase').innerHTML = ''; document.getElementById('dash-esc-inst').innerHTML = '';
    if (chartDashKm) { chartDashKm.destroy(); chartDashKm = null; }
    return;
  }
  cols.innerHTML = '<div class="layer-empty-msg">Calculando kilómetros y copamiento…</div>';
  // Entidades planificadas con su geometría (por lotes de planes para no exceder la URL)
  const ids = planesCom.map(p => p.id), filas = [];
  for (let i = 0; i < ids.length; i += 120) {
    const { data, error } = await supabaseClient.from('planificacion_recursos_geojson')
      .select('id, plan_id, tipo_geometria, institucion_id, recurso_ref_id, geom_geojson, instituciones(nombre, color_hex)').in('plan_id', ids.slice(i, i + 120));
    if (error) { cols.innerHTML = '<div class="layer-empty-msg">No se pudo leer la planificación: ' + escapeHtml_(error.message) + '</div>'; return; }
    filas.push(...(data || []));
  }
  if (pedido !== cargarCopamientoAlertasDash_.n) return;
  // Agregados por escenario e institución
  const E = {}; DESC_ESC.forEach(e => { E[e.k] = { km: 0, rutas: 0, puntos: 0, areas: 0, inst: {}, comunas: new Set(), cmpcRutas: 0, cmpcConRec: 0 }; });
  const inst = {};
  filas.forEach(r => {
    const esc = escPorPlan[r.plan_id]; if (!E[esc]) return;
    const e = E[esc], i = r.instituciones || {}, nom = i.nombre || 'Sin institución';
    const plan = planesCom.find(p => p.id === r.plan_id); if (plan) e.comunas.add(plan.comuna_id);
    let km = 0;
    if (r.tipo_geometria === 'linea') {
      try { km = kmGeojsonLinea_(typeof r.geom_geojson === 'string' ? JSON.parse(r.geom_geojson) : r.geom_geojson); } catch (x) { km = 0; }
      e.km += km; e.rutas++;
      if (/CMPC/i.test(nom)) { e.cmpcRutas++; if (r.recurso_ref_id) e.cmpcConRec++; }
    } else if (r.tipo_geometria === 'area') e.areas++; else e.puntos++;
    const ii = inst[nom] = inst[nom] || { color: i.color_hex || '#64748B', esc: {} };
    const ie = ii.esc[esc] = ii.esc[esc] || { km: 0, n: 0 };
    ie.km += km; ie.n++;
    e.inst[nom] = true;
  });
  // % de copamiento sobre la zona de incendios del trienio (promedio de las comunas con plan en cada escenario)
  // El cálculo es pesado (geometría): primero se muestran km e instituciones y el % llega después
  const resumen = (state.prio && state.prio.resumen) || cargarCopamientoAlertasDash_.resumen || null;
  if (!resumen && !cargarCopamientoAlertasDash_.pidiendo) {
    cargarCopamientoAlertasDash_.pidiendo = true;
    supabaseClient.rpc('resumen_comunas_prevencion').then(({ data }) => {
      const m = {}; (data || []).forEach(x => { m[x.id_comuna] = x; });
      cargarCopamientoAlertasDash_.resumen = m;
      cargarCopamientoAlertasDash_.pidiendo = false;
      if (pedido === cargarCopamientoAlertasDash_.n && state.vistaActual === 'dashboard') cargarCopamientoAlertasDash_(planes, comunaId);
    }).catch(() => { cargarCopamientoAlertasDash_.pidiendo = false; });
  }
  const pctEsc = esc => {
    if (!resumen) return null;
    const vals = [...E[esc.k].comunas].map(id => { const c = cfgDe(id); const r = c && resumen[c.id_comuna]; return r ? Number(r[esc.pct]) : null; }).filter(v => v != null && !isNaN(v));
    return vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : null;
  };
  const fmt = (v, d) => Number(v || 0).toLocaleString('es-CL', { minimumFractionDigits: 0, maximumFractionDigits: d == null ? 1 : d });
  const base = E.Verde;
  const pcts = {}; DESC_ESC.forEach(e => { pcts[e.k] = pctEsc(e); });
  cols.innerHTML = DESC_ESC.map(esc => {
    const e = E[esc.k], p = pcts[esc.k], nInst = Object.keys(e.inst).length;
    const chips = Object.keys(e.inst).sort((a, b) => (inst[b].esc[esc.k] || {}).km - (inst[a].esc[esc.k] || {}).km || a.localeCompare(b, 'es'))
      .map(n => '<span class="desc-chip" title="' + fmt((inst[n].esc[esc.k] || {}).km) + ' km · ' + (inst[n].esc[esc.k] || {}).n + ' entidades"><i style="background:' + escapeHtml_(inst[n].color) + '"></i>' + escapeHtml_(aTitulo_(n)) + '</span>').join('');
    let delta = '';
    if (esc.k !== 'Verde' && (base.km || base.rutas)) {
      const dKm = e.km - base.km, dInst = nInst - Object.keys(base.inst).length;
      const pctKm = base.km ? Math.round(dKm / base.km * 100) : null;
      delta = '<div class="desc-delta">vs Normal: ' + (dKm >= 0 ? '+' : '') + fmt(dKm) + ' km' + (pctKm != null ? ' (' + (pctKm >= 0 ? '+' : '') + pctKm + '%)' : '') +
        ' · ' + (dInst >= 0 ? '+' : '') + dInst + ' institución(es)' + (p != null && pcts.Verde != null ? ' · ' + (p - pcts.Verde >= 0 ? '+' : '') + fmt(p - pcts.Verde) + ' pts de copamiento' : '') + '</div>';
    }
    return '<div class="desc-col" style="--c:' + esc.c + '">' +
      '<div class="desc-col-cab"><b>' + esc.ico + ' ' + esc.n + '</b><span>' + e.comunas.size + ' comuna(s)</span></div>' +
      '<div class="desc-pct"><span class="v">' + (p == null ? (resumen ? '—' : '…') : fmt(p) + '%') + '</span><span class="t">' + (p == null && !resumen ? 'calculando copamiento…' : 'de la zona de incendios<br>del trienio cubierta') + '</span></div>' +
      '<div class="desc-barra"><i style="width:' + Math.min(100, p || 0) + '%"></i></div>' +
      '<div class="desc-met">' +
        '<div><b>' + fmt(e.km) + ' km</b><small>en ' + e.rutas + ' ruta(s)' + (e.rutas ? ' · prom. ' + fmt(e.km / e.rutas) + ' km' : '') + '</small></div>' +
        '<div><b>' + nInst + '</b><small>institución(es) presentes</small></div>' +
        '<div><b>' + (e.rutas + e.puntos + e.areas) + '</b><small>📏 ' + e.rutas + ' · 📍 ' + e.puntos + ' · 📐 ' + e.areas + '</small></div>' +
        (esc.k === 'Verde'
          ? '<div><b>' + (e.cmpcRutas ? Math.round(e.cmpcConRec / e.cmpcRutas * 100) + '%' : '—') + '</b><small>rutas CMPC con recurso (' + e.cmpcConRec + '/' + e.cmpcRutas + ')</small></div>'
          : '<div><b>' + (e.rutas - base.rutas >= 0 ? '+' : '') + (e.rutas - base.rutas) + '</b><small>ruta(s) nuevas vs Normal</small></div>') +
      '</div>' +
      delta +
      '<div class="desc-chips">' + (chips || '<span style="font-size:11px;color:var(--text-tertiary);">Sin entidades</span>') + '</div></div>';
  }).join('');
  // Frase que da sentido a los números
  const r = E.Roja, n = E.Verde;
  const veces = n.km ? r.km / n.km : null;
  document.getElementById('dash-esc-frase').innerHTML =
    'En <b>condiciones normales</b> se patrullan <b>' + fmt(n.km) + ' km</b> con <b>' + Object.keys(n.inst).length + '</b> institución(es)' +
    (pcts.Verde != null ? ', cubriendo el <b>' + fmt(pcts.Verde) + '%</b> de la zona de incendios' : '') + '. ' +
    (r.km || r.rutas
      ? 'En <b>Alerta Roja</b> el despliegue sube a <b>' + fmt(r.km) + ' km</b> con <b>' + Object.keys(r.inst).length + '</b> institución(es)' +
        (veces && veces > 1.05 ? ' (<b>' + fmt(veces) + ' veces</b> lo normal)' : '') + (pcts.Roja != null ? ' y cubre el <b>' + fmt(pcts.Roja) + '%</b>' : '') + '.'
      : 'La <b>Alerta Roja</b> aún no tiene rutas: usa ⏫ Propagar copamiento para escalarla.') +
    (n.cmpcRutas && n.cmpcConRec < n.cmpcRutas ? ' Faltan <b>' + (n.cmpcRutas - n.cmpcConRec) + '</b> ruta(s) CMPC por asociar a un recurso.' : '');
  // Tabla de instituciones × alerta
  const nombres = Object.keys(inst).sort((a, b) => {
    const t = x => DESC_ESC.reduce((s, e) => s + ((inst[x].esc[e.k] || {}).km || 0), 0);
    return t(b) - t(a) || a.localeCompare(b, 'es');
  });
  document.getElementById('dash-esc-inst').innerHTML = '<table class="desc-tabla"><thead><tr><th>Institución</th>' +
    DESC_ESC.map(e => '<th style="text-align:center;color:' + e.c + ';">' + e.ico + ' ' + e.n.replace('Condiciones ', '') + '</th>').join('') + '</tr></thead><tbody>' +
    nombres.map(nm => '<tr><td><span class="desc-chip" style="border:0;padding:0;"><i style="background:' + escapeHtml_(inst[nm].color) + '"></i>' + escapeHtml_(aTitulo_(nm)) + '</span></td>' +
      DESC_ESC.map(e => { const v = inst[nm].esc[e.k]; return v ? '<td class="n"><b>' + fmt(v.km) + ' km</b><small>' + v.n + ' entidad(es)</small></td>' : '<td class="no">—</td>'; }).join('') + '</tr>').join('') +
    '</tbody></table>';
  // Gráfico: km por alerta, apilado por institución
  const canvas = document.getElementById('chart-dash-km');
  if (chartDashKm) { chartDashKm.destroy(); chartDashKm = null; }
  if (canvas && window.Chart) {
    chartDashKm = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: DESC_ESC.map(e => e.n.replace('Condiciones ', '')),
        datasets: nombres.map(nm => ({ label: aTitulo_(nm), data: DESC_ESC.map(e => Math.round(((inst[nm].esc[e.k] || {}).km || 0) * 10) / 10), backgroundColor: inst[nm].color })),
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 10 } } },
          tooltip: { callbacks: { label: c => ' ' + c.dataset.label + ': ' + fmt(c.parsed.y) + ' km' } } },
        scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true, title: { display: true, text: 'km de rutas' } } },
      },
    });
  }
}

// Dibuja (o vacía) un gráfico del dashboard sin destruir el canvas del DOM
function renderChartDash_(canvasId, cual, labels, datasets, conLeyenda, msgVacio) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const wrap = canvas.parentElement;
  let vacio = wrap.querySelector('.layer-empty-msg');
  if (cual === 'copamiento' && chartDashCopamiento) { chartDashCopamiento.destroy(); chartDashCopamiento = null; }
  if (cual === 'alertas' && chartDashAlertas) { chartDashAlertas.destroy(); chartDashAlertas = null; }
  if (!labels.length) {
    canvas.style.display = 'none';
    if (!vacio) { vacio = document.createElement('div'); vacio.className = 'layer-empty-msg'; wrap.appendChild(vacio); }
    vacio.textContent = msgVacio; vacio.style.display = '';
    return;
  }
  if (vacio) vacio.style.display = 'none';
  canvas.style.display = '';
  const ch = new Chart(canvas, {
    type: 'bar',
    data: { labels, datasets },
    options: { responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: conLeyenda, position: 'bottom', labels: { boxWidth: 10, font: { size: 10 } } } },
      scales: { y: { beginAtZero: true, ticks: { precision: 0 } }, x: { ticks: { font: { size: 10 } } } } },
  });
  if (cual === 'copamiento') chartDashCopamiento = ch; else chartDashAlertas = ch;
}

/* ---- Red de Prevención Comunitaria (requerimientos 1 y 2) ---- */
async function cargarRedPrevencionDashboard_(comunaId) {
  const card = document.getElementById('dash-red-card');
  const cont = document.getElementById('dash-red-contenido');
  if (!card) return;
  // Determinar qué comunas mostrar: la seleccionada, o las del usuario (general)
  let comunas = [];
  if (comunaId) {
    const cm = state.comunas.find(c => c.id === comunaId); if (cm) comunas = [cm];
  } else if (state.perfil.perfil === 'Administrador') {
    // Admin general: solo comunas con comités (para no listar 158)
    const favs = state.comunas.filter(c => (state.comunasFavoritas || new Set()).has(c.id));
    comunas = favs.length ? favs : [];
  } else {
    comunas = comunasSeleccionablesUsuario_();
  }
  if (!comunas.length) { card.style.display = 'none'; return; }

  card.style.display = 'block';
  cont.innerHTML = '<div class="layer-empty-msg">Calculando presencia de la red…</div>';

  // Cantidad de comités por comuna (requerimiento 1) — de la vista
  const ids = comunas.map(c => c.id_comuna).filter(Boolean);
  const { data: conteos } = await supabaseClient.from('v_comites_por_comuna').select('id_comuna, n_comites').in('id_comuna', ids);
  const nPorComuna = {}; (conteos || []).forEach(r => { nPorComuna[r.id_comuna] = r.n_comites; });

  // % de presencia (requerimiento 2) — RPC por comuna (solo las que tienen comités)
  const conComites = comunas.filter(c => (nPorComuna[c.id_comuna] || 0) > 0);
  if (!conComites.length) {
    cont.innerHTML = '<div class="layer-empty-msg">Ninguna de estas comunas tiene comités de la Red de Prevención registrados.</div>';
    return;
  }
  const presencias = await Promise.all(conComites.map(async c => {
    try { const { data } = await supabaseClient.rpc('presencia_red_comuna', { p_id_comuna: c.id_comuna }); return { c, pct: data != null ? Number(data) : 0 }; }
    catch (e) { return { c, pct: 0 }; }
  }));

  cont.innerHTML = '<div class="red-grid">' + presencias.map(({ c, pct }) => {
    const n = nPorComuna[c.id_comuna] || 0;
    const nivel = pct >= 40 ? 'Alta cobertura' : pct >= 15 ? 'Cobertura media' : 'Cobertura baja';
    return '<div class="red-comuna"><div class="red-comuna-head"><span class="red-comuna-nombre">🖐️ ' + escapeHtml_(c.comuna) + '</span><span class="red-comuna-badge">' + nivel + '</span></div>' +
      '<div class="red-metricas">' +
      '<div class="red-metrica"><div class="rm-val">' + n + '</div><div class="rm-lbl">Comités</div></div>' +
      '<div class="red-metrica"><div class="rm-val" style="color:#EA580C;">' + pct.toFixed(1) + '%</div><div class="rm-lbl">Presencia territorial</div></div>' +
      '</div>' +
      '<div class="red-barra"><div class="red-barra-fill" style="width:' + Math.min(100, pct) + '%"></div></div>' +
      '<div class="red-presencia-txt">' + pct.toFixed(1) + '% de la superficie comunal está cubierta por áreas de influencia de la red.</div></div>';
  }).join('') + '</div>';
}

function kpi_(label, value, foot) {
  return '<div class="dash-kpi"><div class="k-label">' + label + '</div><div class="k-value">' + value + '</div><div class="k-foot">' + escapeHtml_(foot) + '</div></div>';
}

/* ---- Meteorología con Open-Meteo (sin key) + análisis de riesgo de incendio ---- */
