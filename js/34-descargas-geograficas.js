/* ==================== 🗺️ DESCARGAS GEOGRÁFICAS (Planificador CMPC ▾, 02-11-2026) ====================
 * Solo Administrador. Como el Planificador gráfico (filtros + mapa), pero su función es DESCARGAR la información geográfica del
 * sistema en GeoJSON y KML (Google Earth): recursos (puntos), sus rutas asociadas (escenario Normal), rutas SIGEI, las demás
 * entidades planificadas (por escenario e institución) y los límites de comunas, todo con los filtros de subgerencia, área,
 * sector, comuna, tipo, escenario e institución. Cada capa se descarga sola o todas juntas (KML con una carpeta por capa).
 * El KML se arma con dgKml_: XML escapado, sin caracteres inválidos, estilos por color y ExtendedData con los atributos. */
state.dg = { base: null, res: null, mapa: null, capasMapa: null, listeners: false, cargando: false };
const DG_CAPAS = [
  { k: 'recursos', nom: '📍 Recursos (puntos)', color: '#2563EB' },
  { k: 'rutasRec', nom: '🔗 Rutas asociadas a los recursos (Normal)', color: '#16A34A' },
  { k: 'sigei', nom: '🚓 Rutas de Patrullaje SIGEI', color: '#DC2626' },
  { k: 'entidades', nom: '🧭 Entidades planificadas (escenarios)', color: '#7C3AED' },
  { k: 'comunas', nom: '🏘️ Límites de comunas', color: '#475569' },
  { k: 'predios', nom: '🌾 Predios de agricultores', color: '#65A30D' },   // SQL 150 (agr_predios)
];
function puedeDescargasGeo_() { return !!(state.perfil && state.perfil.perfil === 'Administrador'); }

/** Lee todas las filas de una consulta (PostgREST entrega como máximo 1.000 por llamada). */
async function dgLeerTodo_(crear) {
  const out = [];
  for (let d = 0; ; d += 1000) {
    const { data, error } = await crear().range(d, d + 999);
    if (error) throw error;
    out.push(...(data || [])); if (!data || data.length < 1000) break;
  }
  return out;
}
function dgGeom_(g) { if (!g) return null; if (typeof g === 'string') { try { g = JSON.parse(g); } catch (e) { return null; } } return g.type === 'Feature' ? g.geometry : g; }

async function abrirDescargasGeo_() {
  const cuerpo = document.getElementById('dg-cuerpo');
  if (!state.dg.base) {
    cuerpo.innerHTML = '<div class="tb-vacio">Leyendo recursos, rutas SIGEI y comunas…</div>';
    try {
      const [recursos, sigei, ac, planes] = await Promise.all([
        dgLeerTodo_(() => supabaseClient.from('recursos_disponibles_area_geojson')
          .select('id, codigo_ref, clave_radial, nombre_recurso, tipo_recurso, tipo_movil, empresa, zona_alerta, subgerencia, area, sector, id_comuna, comuna, lat, lng, fecha_inicio_operacion, actividad, institucion_id')),
        dgLeerTodo_(() => supabaseClient.from('v_rutas_patrullaje')
          .select('id, nombre_ruta, alias, temporada, tipo_recurso, actividad, tipo_movil, km, empresa, zona_alerta, sector, subgerencia, area, id_comuna, comuna, geometry')),
        dgLeerTodo_(() => supabaseClient.from('v_area_comunas_admin').select('area, id_comuna')),
        dgLeerTodo_(() => supabaseClient.from('planes_contingencia').select('id, escenario, comuna_id').eq('ambito', 'comuna')),
      ]);
      const nombreArea = {};
      const regArea = a => { if (!a) return; const k = SG_KEY(a); if (!nombreArea[k] || /[^\x00-\x7F]/.test(a)) nombreArea[k] = a; };
      recursos.forEach(r => regArea(r.area)); ac.forEach(x => regArea(x.area));
      const subgDeArea = {}; recursos.forEach(r => { const k = SG_KEY(r.area || ''); if (k && r.subgerencia && !subgDeArea[k]) subgDeArea[k] = String(r.subgerencia).toUpperCase(); });
      state.dg.base = { recursos, sigei, ac, planes, nombreArea, subgDeArea };
    } catch (e) {
      cuerpo.innerHTML = '<div class="tb-vacio">No se pudieron leer los datos: ' + escapeHtml_(e.message || String(e)) + '</div>';
      return;
    }
  }
  if (!document.getElementById('dg-mapa')) dgArmarPantalla_();
  dgRefrescarOpciones_();
  setTimeout(() => { if (state.dg.mapa) state.dg.mapa.invalidateSize(); }, 80);
}

function dgArmarPantalla_() {
  const cuerpo = document.getElementById('dg-cuerpo');
  // 02-11-2026 v2: filtro SIMPLE (Área —agrupada por subgerencia—, Comuna y Tipo); lo demás en «➕ Más filtros»
  cuerpo.innerHTML =
    '<div class="dg-lado">' +
      '<div class="dg-bloque"><b>1 · Filtros</b>' +
        '<label>Área de relacionamiento<select id="dg-area" class="admin-search"></select></label>' +
        '<label>Comuna<select id="dg-comuna" class="admin-search"></select></label>' +
        '<label>Tipo de recurso<select id="dg-tipo" class="admin-search" multiple></select></label>' +
        '<details class="dg-mas"><summary>➕ Más filtros</summary>' +
          '<label>Sector<select id="dg-sector" class="admin-search" multiple></select></label>' +
          '<label>Institución (entidades)<select id="dg-inst" class="admin-search" multiple>' +
            (state.instituciones || []).slice().sort((a, b) => String(a.nombre).localeCompare(String(b.nombre), 'es')).map(i => '<option value="' + escapeHtml_(i.id) + '">' + escapeHtml_(i.nombre) + '</option>').join('') + '</select></label>' +
          '<div class="dg-escs"><span>Escenarios (entidades)</span>' + [['Verde', '🟢'], ['Amarilla', '🟡'], ['Roja', '🔴']].map(([e, i]) =>
            '<label><input type="checkbox" class="dg-esc" value="' + e + '" checked> ' + i + ' ' + escapeHtml_(nombreEscenario_(e)) + '</label>').join('') + '</div>' +
        '</details>' +
      '</div>' +
      '<div class="dg-bloque"><b>2 · Capas</b>' +
        DG_CAPAS.map(c => '<label class="dg-capa"><input type="checkbox" class="dg-capa-chk" value="' + c.k + '"' + (c.k === 'comunas' ? '' : ' checked') + '>' +
          '<i style="background:' + c.color + '"></i><span>' + c.nom + '</span><em id="dg-n-' + c.k + '">—</em></label>').join('') +
        '<button class="turnos-btn dg-aplicar" id="dg-aplicar">🔍 Aplicar filtros y ver en el mapa</button>' +
      '</div>' +
      '<div class="dg-bloque"><b>3 · Descargar</b><div id="dg-descargas" class="dg-descargas"><span class="dg-nota">Aplica los filtros para preparar la descarga.</span></div></div>' +
    '</div>' +
    '<div class="dg-mapa-caja"><div id="dg-mapa"></div><div class="dg-estado" id="dg-estado"></div>' +
      '<div class="dg-prog" id="dg-prog"><div class="dg-prog-fila"><span class="cc-spin"></span><b id="dg-prog-txt">Preparando…</b><span id="dg-prog-pct">0%</span></div>' +
      '<div class="dg-prog-barra"><em id="dg-prog-barra"></em></div></div></div>';
  ['dg-sector', 'dg-tipo', 'dg-inst'].forEach(id => selMultiple_(id, id === 'dg-inst' ? 'instituciones' : id === 'dg-tipo' ? 'tipos' : 'sectores'));
  // Mapa sobrio (Esri)
  state.dg.mapa = L.map('dg-mapa', { zoomControl: true, attributionControl: false }).setView([-37.8, -72.6], 7);
  L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}', { maxZoom: 16 }).addTo(state.dg.mapa);
  state.dg.capasMapa = L.layerGroup().addTo(state.dg.mapa);
  document.getElementById('dg-area').addEventListener('change', () => { document.getElementById('dg-comuna').value = ''; dgRefrescarOpciones_(); });
  document.getElementById('dg-aplicar').addEventListener('click', dgAplicar_);
  document.getElementById('dg-descargas').addEventListener('click', e => {
    const b = e.target.closest('[data-dg-bajar]'); if (!b) return;
    const [capa, formato] = b.dataset.dgBajar.split('|');
    dgDescargar_(capa, formato);
  });
}

/** Opciones de Área, Comuna, Sector y Tipo según la subgerencia / área elegidas. */
function dgRefrescarOpciones_() {
  const B = state.dg.base, selA = document.getElementById('dg-area'), selC = document.getElementById('dg-comuna');
  const areaAct = selA.value, comAct = selC.value;
  // Área agrupada por subgerencia: «Toda la subgerencia X» (valor S:X) + sus áreas; las áreas sin subgerencia al final
  const subgs = [...new Set(Object.values(B.subgDeArea))].sort();
  const ordenA = (a, b) => B.nombreArea[a].localeCompare(B.nombreArea[b], 'es');
  const opA = k => '<option value="' + k + '">' + escapeHtml_(aTitulo_(B.nombreArea[k])) + '</option>';
  const sinSubg = Object.keys(B.nombreArea).filter(k => !B.subgDeArea[k]).sort(ordenA);
  selA.innerHTML = '<option value="">Todas las áreas</option>' +
    subgs.map(s => '<optgroup label="Subgerencia ' + escapeHtml_(aTitulo_(s)) + '"><option value="S:' + escapeHtml_(s) + '">Toda la subgerencia ' + escapeHtml_(aTitulo_(s)) + '</option>' +
      Object.keys(B.nombreArea).filter(k => B.subgDeArea[k] === s).sort(ordenA).map(opA).join('') + '</optgroup>').join('') +
    (sinSubg.length ? '<optgroup label="Sin subgerencia">' + sinSubg.map(opA).join('') + '</optgroup>' : '');
  selA.value = [...selA.options].some(o => o.value === areaAct) ? areaAct : '';
  const subg = selA.value.startsWith('S:') ? selA.value.slice(2) : '', areaSel = selA.value.startsWith('S:') ? '' : selA.value;
  const idsCom = dgIdsComunaFiltro_(subg, areaSel);
  const comunas = (state.comunas || []).filter(c => !idsCom || idsCom.has(Number(c.id_comuna))).sort((a, b) => a.comuna.localeCompare(b.comuna, 'es'));
  selC.innerHTML = '<option value="">Todas</option>' + comunas.map(c => '<option value="' + escapeHtml_(c.id) + '">' + escapeHtml_(c.comuna) + '</option>').join('');
  selC.value = comunas.some(c => c.id === comAct) ? comAct : '';
  const recs = B.recursos.filter(r => (!subg || String(r.subgerencia || '').toUpperCase() === subg) && (!areaSel || SG_KEY(r.area || '') === areaSel));
  const llenar = (id, vals) => { const s = document.getElementById(id); const prev = valoresSel_(id);
    s.innerHTML = vals.map(v => '<option value="' + escapeHtml_(v) + '"' + (prev.includes(v) ? ' selected' : '') + '>' + escapeHtml_(aTitulo_(v)) + '</option>').join(''); actualizarSel_(id); };
  llenar('dg-sector', [...new Set(recs.map(r => r.sector).concat(B.sigei.filter(r => !areaSel || SG_KEY(r.area || '') === areaSel).map(r => r.sector)).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es')));
  llenar('dg-tipo', [...new Set(recs.map(r => r.tipo_recurso).filter(Boolean))].sort(compararTipoRecurso_));
}
/** id_comuna (números) del filtro de subgerencia / área (null = todas). */
function dgIdsComunaFiltro_(subg, area) {
  const B = state.dg.base;
  if (!subg && !area) return null;
  const areas = area ? [area] : Object.keys(B.subgDeArea).filter(k => B.subgDeArea[k] === subg);
  return new Set(B.ac.filter(x => areas.includes(SG_KEY(x.area || ''))).map(x => Number(x.id_comuna)));
}
function dgFiltros_() {
  const vA = document.getElementById('dg-area').value, comuna = document.getElementById('dg-comuna').value;
  const subg = vA.startsWith('S:') ? vA.slice(2) : '', area = vA.startsWith('S:') ? '' : vA;
  const c = comuna ? (state.comunas || []).find(x => x.id === comuna) : null;
  return {
    subg, area, comuna, idComuna: c ? Number(c.id_comuna) : null, idsComuna: c ? new Set([Number(c.id_comuna)]) : dgIdsComunaFiltro_(subg, area),
    sectores: valoresSel_('dg-sector'), tipos: valoresSel_('dg-tipo'), insts: valoresSel_('dg-inst'),
    escs: [...document.querySelectorAll('.dg-esc:checked')].map(i => i.value),
    capas: [...document.querySelectorAll('.dg-capa-chk:checked')].map(i => i.value),
  };
}
function dgPasaRecurso_(r, F) {
  return (!F.subg || String(r.subgerencia || '').toUpperCase() === F.subg) && (!F.area || SG_KEY(r.area || '') === F.area) &&
    (!F.idComuna || Number(r.id_comuna) === F.idComuna) && (!F.sectores.length || F.sectores.includes(r.sector)) && (!F.tipos.length || F.tipos.includes(r.tipo_recurso));
}

/** Barra de carga con % sobre el mapa (null = ocultar). */
function dgProg_(pct, txt) {
  const el = document.getElementById('dg-prog'); if (!el) return;
  if (pct == null) { el.classList.remove('activo'); return; }
  el.classList.add('activo');
  const p = Math.max(1, Math.min(100, Math.round(pct)));
  document.getElementById('dg-prog-pct').textContent = p + '%';
  document.getElementById('dg-prog-barra').style.width = p + '%';
  if (txt) document.getElementById('dg-prog-txt').textContent = txt;
}
/** Lee por lotes chicos (la vista con geometría es pesada). Si un lote se corta por tiempo («statement timeout»), se parte en dos
 *  y se reintenta, hasta lotes de 1. avance(fracción 0..1) informa el progreso. */
async function dgLotes_(ids, tam, consulta, avance) {
  const out = [];
  const leer = async lote => {
    try { out.push(...await dgLeerTodo_(() => consulta(lote))); }
    catch (e) {
      if (lote.length > 1 && /timeout|57014|canceling/i.test((e && (e.message || e.code)) || '')) {
        const m = Math.ceil(lote.length / 2); await leer(lote.slice(0, m)); await leer(lote.slice(m)); return;
      }
      throw e;
    }
  };
  for (let i = 0; i < ids.length; i += tam) { await leer(ids.slice(i, i + tam)); if (avance) avance(Math.min(1, (i + tam) / ids.length)); }
  return out;
}

async function dgAplicar_() {
  if (state.dg.cargando) return;
  const B = state.dg.base, F = dgFiltros_(), est = document.getElementById('dg-estado'), btn = document.getElementById('dg-aplicar');
  state.dg.cargando = true; btn.disabled = true; btn.textContent = '⏳ Preparando…';
  est.textContent = '';
  // % por capa: cada capa elegida es un tramo igual de la barra
  const tramos = F.capas.length || 1;
  const prog = (iCapa, frac, txt) => dgProg_((iCapa + frac) * 100 / tramos, txt);
  const iDe = k => Math.max(0, F.capas.indexOf(k));
  prog(0, 0.02, 'Filtrando recursos…');
  const res = {};
  const nomComuna = id => { const c = (state.comunas || []).find(x => Number(x.id_comuna) === Number(id) || x.id === id); return c ? c.comuna : (id || ''); };
  try {
    // 📍 Recursos (puntos)
    const recs = B.recursos.filter(r => dgPasaRecurso_(r, F));
    if (F.capas.includes('recursos')) res.recursos = recs.filter(r => r.lat != null && r.lng != null).map(r => ({
      geometry: { type: 'Point', coordinates: [Number(r.lng), Number(r.lat)] }, _nombre: r.clave_radial || r.codigo_ref || 'Recurso', _color: plColorTipo_(r.tipo_recurso || ''),
      _carpeta: aTitulo_(r.area || 'Sin área'),
      properties: { clave_radial: r.clave_radial || null, id: r.codigo_ref || null, tipo_recurso: r.tipo_recurso || null, subgerencia: r.subgerencia || null,
        area: r.area || null, sector: r.sector || null, comuna: r.comuna || null, empresa: r.empresa || null, tipo_movil: r.tipo_movil || null,
        actividad: r.actividad || null, zona_alerta: r.zona_alerta || null, inicio_operacion: r.fecha_inicio_operacion ? String(r.fecha_inicio_operacion).slice(0, 10) : null } }));
    const escPlan = {}, comunaPlan = {}; B.planes.forEach(p => { escPlan[p.id] = p.escenario; comunaPlan[p.id] = p.comuna_id; });
    const selCols = 'id, plan_id, tipo_geometria, tipo_recurso, descripcion, geom_geojson, institucion_id, recurso_ref_id, recurso_ref_clave, recurso_ref_codigo, instituciones(nombre, color_hex)';
    // 🔗 Rutas asociadas a los recursos filtrados (su línea del escenario Normal)
    if (F.capas.includes('rutasRec')) {
      const ic = iDe('rutasRec');
      prog(ic, 0, 'Leyendo rutas asociadas…');
      const filas = await dgLotes_(recs.map(r => r.id), 25,
        lote => supabaseClient.from('planificacion_recursos_geojson').select(selCols).in('recurso_ref_id', lote),
        f => prog(ic, f, 'Leyendo rutas asociadas… ' + Math.round(f * 100) + '%'));
      const porId = {}; recs.forEach(r => { porId[r.id] = r; });
      res.rutasRec = filas.filter(f => escPlan[f.plan_id] === 'Verde').map(f => {
        const r = porId[f.recurso_ref_id] || {}, inst = f.instituciones || {};
        return { geometry: dgGeom_(f.geom_geojson), _nombre: (r.clave_radial || f.recurso_ref_clave || 'Ruta') + ' · ' + (f.tipo_recurso || ''), _color: inst.color_hex || '#16A34A',
          _carpeta: aTitulo_(r.area || 'Sin área'),
          properties: { clave_radial: r.clave_radial || f.recurso_ref_clave || null, id_recurso: r.codigo_ref || f.recurso_ref_codigo || null, tipo_recurso: f.tipo_recurso || null,
            area: r.area || null, comuna_plan: nomComuna(comunaPlan[f.plan_id]), institucion: inst.nombre || null, descripcion: f.descripcion || null, escenario: nombreEscenario_('Verde') } };
      }).filter(x => x.geometry);
    }
    // 🚓 Rutas SIGEI
    if (F.capas.includes('sigei')) res.sigei = B.sigei.filter(r => dgPasaRecurso_(r, F)).map(r => ({
      geometry: dgGeom_(r.geometry), _nombre: r.nombre_ruta || r.alias || 'Ruta SIGEI', _color: '#DC2626', _carpeta: aTitulo_(r.area || 'Sin área'),
      properties: { nombre_ruta: r.nombre_ruta || null, alias: r.alias || null, temporada: r.temporada || null, tipo_recurso: r.tipo_recurso || null, actividad: r.actividad || null,
        tipo_movil: r.tipo_movil || null, km: r.km != null ? Number(r.km) : null, empresa: r.empresa || null, subgerencia: r.subgerencia || null, area: r.area || null,
        sector: r.sector || null, comuna: r.comuna || null, zona_alerta: r.zona_alerta || null } })).filter(x => x.geometry);
    // 🧭 Entidades planificadas (por escenario, comuna e institución)
    if (F.capas.includes('entidades') && F.escs.length) {
      const ic = iDe('entidades');
      prog(ic, 0, 'Leyendo entidades planificadas…');
      const slugs = F.idsComuna ? new Set((state.comunas || []).filter(c => F.idsComuna.has(Number(c.id_comuna))).map(c => c.id)) : null;
      const planIds = B.planes.filter(p => F.escs.includes(p.escenario) && (!slugs || slugs.has(p.comuna_id))).map(p => p.id);
      const filas = await dgLotes_(planIds, 8,
        lote => supabaseClient.from('planificacion_recursos_geojson').select(selCols).in('plan_id', lote),
        f => prog(ic, f, 'Leyendo entidades planificadas… ' + Math.round(f * 100) + '%'));
      res.entidades = filas.filter(f => (!F.insts.length || F.insts.includes(String(f.institucion_id))) && (!F.tipos.length || F.tipos.includes(f.tipo_recurso))).map(f => {
        const inst = f.instituciones || {}, esc = escPlan[f.plan_id];
        return { geometry: dgGeom_(f.geom_geojson), _nombre: (inst.nombre || 'Institución') + ' · ' + (f.tipo_recurso || ''), _color: inst.color_hex || '#7C3AED',
          _carpeta: nombreEscenario_(esc) + ' · ' + nomComuna(comunaPlan[f.plan_id]),
          properties: { escenario: nombreEscenario_(esc), comuna: nomComuna(comunaPlan[f.plan_id]), institucion: inst.nombre || null, tipo_recurso: f.tipo_recurso || null,
            geometria: f.tipo_geometria || null, descripcion: f.descripcion || null, recurso_asociado: f.recurso_ref_clave || null } };
      }).filter(x => x.geometry);
    }
    // 🏘️ Límites de comunas
    if (F.capas.includes('comunas')) {
      const ic = iDe('comunas');
      prog(ic, 0, 'Leyendo límites de comunas…');
      const slugs = F.idsComuna ? (state.comunas || []).filter(c => F.idsComuna.has(Number(c.id_comuna))).map(c => c.id)
                                : (state.comunas || []).map(c => c.id);
      const filas = await dgLotes_(slugs, 15, lote => supabaseClient.from('v_comunas_limite').select('id, comuna, geometry').in('id', lote),
        f => prog(ic, f, 'Leyendo límites de comunas… ' + Math.round(f * 100) + '%'));
      res.comunas = filas.map(c => ({ geometry: dgGeom_(c.geometry), _nombre: c.comuna, _color: '#475569', _carpeta: 'Comunas', properties: { comuna: c.comuna, id: c.id } })).filter(x => x.geometry);
    }
    // 🌾 Predios de agricultores (SQL 150): filtro por subgerencia, área y comuna
    if (F.capas.includes('predios')) {
      const ic = iDe('predios');
      prog(ic, 0, 'Leyendo predios de agricultores…');
      let filas = [];
      try { filas = await dgLeerTodo_(() => supabaseClient.from('v_agr_predios').select('*').order('capa')); }
      catch (e) { console.warn('Descargas: predios no disponibles (¿falta el SQL 150?):', e.message || e); }
      res.predios = filas.filter(p => (!F.subg || String(p.subgerencia || '').toUpperCase() === F.subg) && (!F.area || SG_KEY(p.area || '') === F.area) &&
          (!F.idsComuna || F.idsComuna.has(Number(p.id_comuna))))
        .map(p => ({ geometry: dgGeom_(p.geojson), _nombre: p.nombre_predio || p.nombre || p.id_bg || 'Predio', _color: agpColorRiesgo_(p.riesgo),
          _carpeta: 'Capa ' + p.capa, properties: agpPropiedades_(p) })).filter(x => x.geometry);
      prog(ic, 1, 'Predios listos');
    }
    dgProg_(99, 'Dibujando en el mapa…');
    state.dg.res = res;
    dgPintar_();
    dgProg_(100, '✅ Listo para descargar');
    setTimeout(() => dgProg_(null), 1500);
  } catch (e) {
    dgProg_(null);
    est.textContent = '⚠️ ' + (e.message || e);
    mostrarToast_('No se pudo preparar la descarga: ' + (e.message || e));
  } finally {
    state.dg.cargando = false; btn.disabled = false; btn.textContent = '🔍 Aplicar filtros y ver en el mapa';
  }
}

/** Dibuja las capas preparadas, pone los conteos y los botones de descarga. */
function dgPintar_() {
  const res = state.dg.res || {}, grupo = state.dg.capasMapa;
  grupo.clearLayers();
  const total = [];
  DG_CAPAS.forEach(c => {
    const el = document.getElementById('dg-n-' + c.k), lista = res[c.k];
    if (el) el.textContent = lista ? lista.length.toLocaleString('es-CL') : '—';
    if (!lista || !lista.length) return;
    total.push(c);
    const capa = L.geoJSON({ type: 'FeatureCollection', features: lista.map(f => ({ type: 'Feature', geometry: f.geometry, properties: Object.assign({ _nombre: f._nombre, _color: f._color }, f.properties) })) }, {
      style: ft => ({ color: ft.properties._color || c.color, weight: c.k === 'comunas' ? 1.5 : 3, opacity: 0.9, fillOpacity: c.k === 'comunas' ? 0.03 : 0.18, dashArray: c.k === 'comunas' ? '5,5' : null }),
      pointToLayer: (ft, ll) => L.circleMarker(ll, { radius: 5, color: '#fff', weight: 1.5, fillColor: ft.properties._color || c.color, fillOpacity: 1 }),
      onEachFeature: (ft, ly) => ly.bindTooltip(escapeHtml_(ft.properties._nombre || ''), { sticky: true }),
    });
    grupo.addLayer(capa);
  });
  try { const b = L.featureGroup(grupo.getLayers()).getBounds(); if (b.isValid()) state.dg.mapa.fitBounds(b, { padding: [20, 20] }); } catch (e) {}
  const caja = document.getElementById('dg-descargas');
  caja.innerHTML = total.length
    // Nombre de la capa en su propia línea (completo) y, debajo, los botones
    ? '<div class="dg-bajar dg-bajar-todo"><div class="dg-bajar-nom">📦 Todas las capas</div>' +
        '<div class="dg-bajar-btns"><button class="turnos-btn" data-dg-bajar="__todas__|kml">🌍 KML</button><button class="turnos-btn" data-dg-bajar="__todas__|geojson">🧩 GeoJSON</button></div></div>' +
      total.map(c => '<div class="dg-bajar"><div class="dg-bajar-nom"><i style="background:' + c.color + '"></i>' + c.nom + ' <small>(' + res[c.k].length.toLocaleString('es-CL') + ')</small></div>' +
        '<div class="dg-bajar-btns"><button class="popup-btn" data-dg-bajar="' + c.k + '|kml">🌍 KML</button><button class="popup-btn" data-dg-bajar="' + c.k + '|geojson">🧩 GeoJSON</button></div></div>').join('')
    : '<span class="dg-nota">No hay elementos con estos filtros.</span>';
}

/** Nombre de archivo según los filtros: sig_<capa>_<área o comuna>_<fecha>. */
function dgNombreArchivo_(capa) {
  const F = dgFiltros_(), B = state.dg.base;
  const lugar = F.comuna ? F.comuna : F.area ? (B.nombreArea[F.area] || F.area) : F.subg ? 'subg_' + F.subg : 'todo';
  return ('sig_' + capa + '_' + plNorm_(String(lugar)).replace(/[^A-Z0-9]+/g, '_') + '_' + fechaISO_(new Date())).toLowerCase();
}
function dgDescargar_(capa, formato) {
  const res = state.dg.res || {};
  const capas = capa === '__todas__' ? DG_CAPAS.filter(c => res[c.k] && res[c.k].length) : DG_CAPAS.filter(c => c.k === capa);
  if (!capas.length) { mostrarToast_('No hay elementos para descargar.'); return; }
  const nombre = dgNombreArchivo_(capa === '__todas__' ? 'capas' : capa);
  if (formato === 'geojson') {
    const fc = { type: 'FeatureCollection', name: nombre, features: [] };
    capas.forEach(c => res[c.k].forEach(f => fc.features.push({ type: 'Feature', geometry: f.geometry, properties: Object.assign({ capa: c.k, nombre: f._nombre }, f.properties) })));
    descargarArchivo_(JSON.stringify(fc), nombre + '.geojson', 'application/geo+json;charset=utf-8');
  } else {
    descargarArchivo_(dgKml_(nombre, capas.map(c => ({ nombre: c.nom.replace(/^\S+\s/, ''), features: res[c.k] }))), nombre + '.kml', 'application/vnd.google-earth.kml+xml;charset=utf-8');
  }
  mostrarToast_('⬇️ ' + capas.reduce((s, c) => s + res[c.k].length, 0).toLocaleString('es-CL') + ' elemento(s) descargados en ' + (formato === 'kml' ? 'KML' : 'GeoJSON') + '.');
}

/** KML válido (Google Earth / QGIS): XML escapado, sin caracteres de control, un estilo por color, carpeta por capa y
 *  subcarpeta por _carpeta (área, escenario · comuna…), ExtendedData con todos los atributos. */
function dgKml_(nombreDoc, grupos) {
  const x = s => String(s == null ? '' : s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
  const hex = c => { const m = /^#?([0-9a-f]{6})$/i.exec(String(c || '')); return m ? m[1] : '64748B'; };
  const kmlColor = (c, a) => { const h = hex(c); return (a || 'ff') + h.slice(4, 6) + h.slice(2, 4) + h.slice(0, 2); };
  const colores = new Set(); grupos.forEach(g => g.features.forEach(f => colores.add(hex(f._color))));
  const estilos = [...colores].map(h => '<Style id="c' + h + '"><LineStyle><color>' + kmlColor(h) + '</color><width>3</width></LineStyle>' +
    '<PolyStyle><color>' + kmlColor(h, '55') + '</color></PolyStyle><IconStyle><color>' + kmlColor(h) + '</color><scale>1</scale>' +
    '<Icon><href>http://maps.google.com/mapfiles/kml/paddle/wht-blank.png</href></Icon></IconStyle><LabelStyle><scale>0.8</scale></LabelStyle></Style>').join('\n');
  const placemark = f => {
    const geo = geometriaKml_(f.geometry); if (!geo) return '';
    const props = Object.entries(f.properties || {}).filter(([, v]) => v != null && v !== '');
    return '<Placemark><name>' + x(f._nombre || '') + '</name><styleUrl>#c' + hex(f._color) + '</styleUrl>' +
      '<description>' + x(props.map(([k, v]) => k.replace(/_/g, ' ') + ': ' + v).join('\n')) + '</description>' +
      '<ExtendedData>' + props.map(([k, v]) => '<Data name="' + x(k) + '"><value>' + x(v) + '</value></Data>').join('') + '</ExtendedData>' + geo + '</Placemark>';
  };
  const carpetas = g => {
    const sub = {}; g.features.forEach(f => { (sub[f._carpeta || 'Elementos'] = sub[f._carpeta || 'Elementos'] || []).push(f); });
    const claves = Object.keys(sub).sort((a, b) => a.localeCompare(b, 'es'));
    return claves.length === 1 ? sub[claves[0]].map(placemark).join('\n')
      : claves.map(k => '<Folder><name>' + x(k) + '</name>\n' + sub[k].map(placemark).join('\n') + '\n</Folder>').join('\n');
  };
  return '<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2">\n<Document>\n<name>' + x(nombreDoc) + '</name>\n' +
    '<description>' + x('SIG Copamiento Territorial · ' + new Date().toLocaleString('es-CL')) + '</description>\n' + estilos + '\n' +
    grupos.map(g => '<Folder><name>' + x(g.nombre) + '</name>\n' + carpetas(g) + '\n</Folder>').join('\n') + '\n</Document>\n</kml>\n';
}
