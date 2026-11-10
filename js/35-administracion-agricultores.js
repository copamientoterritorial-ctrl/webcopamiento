/* ==================== 🌾 ADMINISTRACIÓN AGRICULTORES (Prevención ▾, 03-11-2026, SQL 150) ====================
 * Capa de PREDIOS de agricultores (polígonos de agr_predios; primera capa: Nacimiento). La ven el Administrador, los Jefes de
 * Área (incluye Subgerentes y Gestores GRT) y la Asociación de Agricultores; la Asociación entra a este menú aunque solo ve 🌾.
 *   · Mapa + listado con filtros (capa, comuna, riesgo, gestor, búsqueda) y KPI (predios, hectáreas, agricultores, riesgo).
 *   · Descarga Excel, KML y GeoJSON de lo filtrado (también en 🗺️ Descargas geográficas, capa «🌾 Predios de agricultores»).
 *   · Solo el Administrador sube (⬆️ GeoJSON en WGS84; misma capa = reemplazo) o elimina capas (RPC cargar_predios_agr). */
state.agp = { datos: null, mapa: null, capa: null, sel: null, listeners: false };
const AGP_RIESGO_COLOR = { alto: '#DC2626', medio: '#D97706', bajo: '#16A34A' };

function puedeAdminAgricultores_() {
  if (!state.perfil) return false;
  return state.perfil.perfil === 'Administrador' || esJefeAreaPerfil_(state.perfil.perfil) || esAsociacion_();
}
function agpEsAdmin_() { return !!(state.perfil && state.perfil.perfil === 'Administrador') && !esAsociacion_(); }
function agpColorRiesgo_(r) { return AGP_RIESGO_COLOR[normalizarBusqueda_(agpRiesgo_(r))] || '#65A30D'; }
/** Atributos de un predio para las descargas (KML / GeoJSON / Excel). */
function agpPropiedades_(p) {
  return {
    capa: p.capa, id_bg: p.id_bg || null, nombre: p.nombre || null, nombre_predio: p.nombre_predio || null, agricultor: p.agricultor || null,
    celular: p.celular || null, tipo_propietario: p.tipo_propietario || null, propiedad: p.propiedad || null,
    sup_ha: p.sup_ha != null ? Number(p.sup_ha) : null, ha_calculadas: p.ha_calculadas != null ? Number(p.ha_calculadas) : null,
    tipo_cultivo: p.tipo_cultivo || null, riesgo: p.riesgo || null, cod_fundo: p.cod_fundo || null, nombre_fundo: p.nombre_fundo || null,
    subgerencia: p.subgerencia || null, area: p.area || null, sector: p.sector || null, gestor: p.gestor || null,
    id_comuna: p.id_comuna || null, comuna: p.comuna || null,
  };
}
const AGP_CAMPOS = [
  ['id_bg', 'ID'], ['nombre_predio', 'Predio'], ['agricultor', 'Agricultor'], ['celular', 'Celular'], ['tipo_propietario', 'Tipo propietario'],
  ['propiedad', 'Propiedad'], ['sup_ha', 'Superficie (ha)'], ['ha_calculadas', 'Superficie calculada (ha)'], ['tipo_cultivo', 'Cultivo'],
  ['riesgo', 'Riesgo'], ['cod_fundo', 'Cód. fundo'], ['nombre_fundo', 'Fundo CMPC'], ['subgerencia', 'Subgerencia'], ['area', 'Área'],
  ['sector', 'Sector'], ['gestor', 'Gestor'], ['comuna', 'Comuna'], ['nombre', 'Nombre (capa)'], ['capa', 'Capa'],
];

async function abrirAdminAgricultores_(forzar) {
  if (!puedeAdminAgricultores_()) { mostrarToast_('Tu perfil no tiene acceso a Administración Agricultores.'); return; }
  const cuerpo = document.getElementById('agp-cuerpo');
  if (!state.agp.listeners) agpArmarPantalla_();
  if (state.agp.datos && !forzar) { agpRender_(); setTimeout(() => state.agp.mapa.invalidateSize(), 60); return; }
  document.getElementById('agp-estado').textContent = 'Cargando…';
  try {
    const out = [];
    for (let d = 0; ; d += 1000) {
      const { data, error } = await supabaseClient.from('v_agr_predios').select('*').order('capa').order('id_bg').range(d, d + 999);
      if (error) throw error;
      out.push(...(data || [])); if (!data || data.length < 1000) break;
    }
    state.agp.datos = out.map(p => Object.assign(p, { geojson: dgGeom_(p.geojson) }));
  } catch (e) {
    state.agp.datos = [];
    document.getElementById('agp-estado').textContent = '⚠️ ' + (/v_agr_predios|does not exist|schema cache/i.test(e.message || '') ? 'Falta ejecutar el SQL 150 en Supabase' : (e.message || e));
  }
  agpPoblarFiltros_();
  agpRender_(true);
  setTimeout(() => state.agp.mapa.invalidateSize(), 60);
}

function agpArmarPantalla_() {
  state.agp.listeners = true;
  const esAdmin = agpEsAdmin_();
  document.getElementById('agp-subir').style.display = esAdmin ? '' : 'none';
  document.getElementById('agp-eliminar').style.display = esAdmin ? '' : 'none';
  document.getElementById('agp-cuerpo').innerHTML =
    '<div class="dg-lado agp-lado">' +
      '<div class="dg-bloque"><b>Filtros</b>' +
        '<label>Capa<select id="agp-capa" class="admin-search"></select></label>' +
        '<label>Subgerencia<select id="agp-subg" class="admin-search"></select></label>' +
        '<label>Comuna<select id="agp-comuna" class="admin-search"></select></label>' +
        '<label>Nivel de riesgo<select id="agp-riesgo" class="admin-search"></select></label>' +
        '<label>Gestor<select id="agp-gestor" class="admin-search"></select></label>' +
        '<input id="agp-q" class="admin-search" placeholder="🔎 Buscar predio, agricultor, ID, fundo…">' +
      '</div>' +
      '<div class="gr-kpis agp-kpis" id="agp-kpis"></div>' +
      '<div class="agp-lista" id="agp-lista"></div>' +
    '</div>' +
    '<div class="dg-mapa-caja"><div id="agp-mapa"></div><div class="agp-leyenda">' +
      Object.keys(AGP_RIESGO_COLOR).map(k => '<span><i style="background:' + AGP_RIESGO_COLOR[k] + '"></i>Riesgo ' + k + '</span>').join('') + '</div></div>';
  state.agp.mapa = L.map('agp-mapa', { zoomControl: true, attributionControl: false }).setView([-37.6, -72.6], 9);
  const sat = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19 });
  const gris = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}', { maxZoom: 16 }).addTo(state.agp.mapa);
  L.control.layers({ 'Mapa sobrio': gris, 'Satélite': sat }, null, { position: 'topright' }).addTo(state.agp.mapa);
  state.agp.capa = L.featureGroup().addTo(state.agp.mapa);
  ['agp-capa', 'agp-subg', 'agp-comuna', 'agp-riesgo', 'agp-gestor'].forEach(id => document.getElementById(id).addEventListener('change', () => agpRender_(true)));
  let t = null;
  document.getElementById('agp-q').addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => agpRender_(true), 200); });
  document.getElementById('agp-lista').addEventListener('click', e => { const f = e.target.closest('[data-agp]'); if (f) agpEnfocar_(f.dataset.agp); });
  document.getElementById('agp-recargar').addEventListener('click', () => abrirAdminAgricultores_(true));
  document.getElementById('agp-excel').addEventListener('click', agpExcel_);
  document.getElementById('agp-kml').addEventListener('click', () => agpDescargarGeo_('kml'));
  document.getElementById('agp-geojson').addEventListener('click', () => agpDescargarGeo_('geojson'));
  document.getElementById('agp-subir').addEventListener('click', () => document.getElementById('agp-archivo').click());
  document.getElementById('agp-archivo').addEventListener('change', e => { const f = e.target.files && e.target.files[0]; e.target.value = ''; if (f) agpSubirGeojson_(f); });
  document.getElementById('agp-eliminar').addEventListener('click', agpEliminarCapa_);
}

function agpPoblarFiltros_() {
  const D = state.agp.datos || [];
  const opciones = (id, todos, vals) => {
    const sel = document.getElementById(id), v = sel.value;
    const cuenta = {}; vals.forEach(x => { if (x) cuenta[x] = (cuenta[x] || 0) + 1; });
    const ks = Object.keys(cuenta).sort((a, b) => a.localeCompare(b, 'es'));
    sel.innerHTML = '<option value="">' + todos + ' (' + ks.length + ')</option>' + ks.map(k => '<option value="' + escapeHtml_(k) + '">' + escapeHtml_(k) + ' (' + cuenta[k] + ')</option>').join('');
    sel.value = ks.includes(v) ? v : '';
  };
  opciones('agp-capa', 'Todas las capas', D.map(p => p.capa));
  opciones('agp-subg', 'Todas las subgerencias', D.map(agpSubg_));
  opciones('agp-comuna', 'Todas las comunas', D.map(p => p.comuna));
  opciones('agp-riesgo', 'Todos los niveles', D.map(p => agpRiesgo_(p.riesgo)));
  opciones('agp-gestor', 'Todos los gestores', D.map(p => p.gestor));
}
/** 06-11-2026: riesgo uniforme («ALTO», «alto», «Alto » → «Alto») y subgerencia en mayúsculas (o «Sin subgerencia»). */
function agpRiesgo_(r) { const n = normalizarBusqueda_(r || ''); return !n ? '' : n.startsWith('alt') ? 'Alto' : n.startsWith('med') ? 'Medio' : n.startsWith('baj') ? 'Bajo' : String(r).trim(); }
function agpSubg_(p) { return p.subgerencia ? String(p.subgerencia).trim().toUpperCase() : 'Sin subgerencia'; }
function agpFiltrados_() {
  const v = id => document.getElementById(id).value;
  const q = normalizarBusqueda_(document.getElementById('agp-q').value || '');
  return (state.agp.datos || []).filter(p => (!v('agp-capa') || p.capa === v('agp-capa')) && (!v('agp-subg') || agpSubg_(p) === v('agp-subg')) &&
    (!v('agp-comuna') || p.comuna === v('agp-comuna')) &&
    (!v('agp-riesgo') || agpRiesgo_(p.riesgo) === v('agp-riesgo')) && (!v('agp-gestor') || p.gestor === v('agp-gestor')) &&
    (!q || normalizarBusqueda_([p.id_bg, p.nombre, p.nombre_predio, p.agricultor, p.celular, p.nombre_fundo, p.cod_fundo, p.sector, p.tipo_cultivo, p.gestor].join(' ')).includes(q)));
}
function agpPopup_(p) {
  const fmt = (k, v) => v == null || v === '' ? '—' : (k === 'sup_ha' || k === 'ha_calculadas') ? Number(v).toLocaleString('es-CL') + ' ha'
    : k === 'celular' ? '<a href="tel:+' + escapeHtml_(String(v).replace(/\D/g, '')) + '">' + escapeHtml_(String(v)) + '</a>' : escapeHtml_(String(v));
  return '<div class="agp-pop"><b>🌾 ' + escapeHtml_(p.nombre_predio || p.nombre || 'Predio') + '</b>' +
    '<span class="gr-pill" style="background:' + agpColorRiesgo_(p.riesgo) + '22;color:' + agpColorRiesgo_(p.riesgo) + '">Riesgo ' + escapeHtml_(p.riesgo || '—') + '</span>' +
    '<table>' + AGP_CAMPOS.filter(([k]) => k !== 'nombre_predio').map(([k, t]) => '<tr><td>' + t + '</td><td>' + fmt(k, p[k]) + '</td></tr>').join('') + '</table></div>';
}
function agpRender_(ajustar) {
  const lista = agpFiltrados_(), D = state.agp.datos || [];
  const ha = lista.reduce((s, p) => s + (Number(p.sup_ha) || 0), 0);
  const agri = new Set(lista.map(p => normalizarBusqueda_(p.agricultor || '')).filter(Boolean)).size;
  const porR = r => lista.filter(p => normalizarBusqueda_(agpRiesgo_(p.riesgo)) === r).length;
  const kpi = (n, t, c) => '<div class="gr-kpi" style="--c:' + c + '"><b>' + n + '</b>' + t + '</div>';
  document.getElementById('agp-kpis').innerHTML =
    kpi(lista.length + (lista.length !== D.length ? '/' + D.length : ''), 'predios', '#65A30D') + kpi(Math.round(ha).toLocaleString('es-CL'), 'hectáreas', '#0F766E') +
    kpi(agri, 'agricultores', '#2563EB') + kpi(porR('alto'), 'riesgo alto', '#DC2626') + kpi(porR('medio'), 'riesgo medio', '#D97706') + kpi(porR('bajo'), 'riesgo bajo', '#16A34A');
  const capas = [...new Set(D.map(p => p.capa))];
  document.getElementById('agp-estado').textContent = D.length ? capas.length + ' capa(s): ' + capas.join(', ') + (agpEsAdmin_() ? ' · Administrador' : ' · solo consulta')
    : (document.getElementById('agp-estado').textContent.startsWith('⚠️') ? document.getElementById('agp-estado').textContent : 'Sin predios cargados');
  document.getElementById('agp-lista').innerHTML = lista.length ? lista.map(p =>
    '<div class="agp-item' + (state.agp.sel === p.id ? ' sel' : '') + '" data-agp="' + escapeHtml_(p.id) + '"><i style="background:' + agpColorRiesgo_(p.riesgo) + '"></i>' +
      '<div><b>' + escapeHtml_(p.nombre_predio || p.nombre || 'Predio') + '</b> <small>' + escapeHtml_(p.id_bg || '') + '</small><br>' +
      '<small>👨‍🌾 ' + escapeHtml_(p.agricultor || '—') + ' · ' + (p.sup_ha != null ? Number(p.sup_ha).toLocaleString('es-CL') + ' ha' : '— ha') + ' · ' + escapeHtml_(p.tipo_cultivo || '—') +
      ' · ' + escapeHtml_(p.comuna || '') + '</small></div></div>').join('')
    : '<div class="tb-vacio">' + (D.length ? 'No hay predios con estos filtros.' : 'Aún no hay predios cargados.') + '</div>';
  const g = state.agp.capa; g.clearLayers();
  lista.forEach(p => {
    if (!p.geojson) return;
    const ly = L.geoJSON(p.geojson, { style: { color: agpColorRiesgo_(p.riesgo), weight: 2.5, fillOpacity: 0.25 } });
    ly.bindPopup(agpPopup_(p), { maxWidth: 340 });
    ly.bindTooltip(escapeHtml_(p.nombre_predio || p.nombre || ''), { sticky: true });
    ly.on('click', () => { state.agp.sel = p.id; document.querySelectorAll('.agp-item').forEach(el => el.classList.toggle('sel', el.dataset.agp === p.id)); });
    ly._agpId = p.id;
    g.addLayer(ly);
  });
  if (ajustar && g.getLayers().length) { try { state.agp.mapa.fitBounds(g.getBounds(), { padding: [30, 30], maxZoom: 14 }); } catch (e) {} }
}
function agpEnfocar_(id) {
  state.agp.sel = id;
  document.querySelectorAll('.agp-item').forEach(el => el.classList.toggle('sel', el.dataset.agp === id));
  const ly = state.agp.capa.getLayers().find(l => l._agpId === id); if (!ly) return;
  state.agp.mapa.fitBounds(ly.getBounds(), { padding: [40, 40], maxZoom: 15 });
  ly.openPopup();
}

/* ── Descargas de lo filtrado ── */
function agpNombreArchivo_() {
  const capa = document.getElementById('agp-capa').value, com = document.getElementById('agp-comuna').value;
  return ('predios_agricultores_' + plNorm_(com || capa || 'todos').replace(/[^A-Z0-9]+/g, '_') + '_' + fechaISO_(new Date())).toLowerCase();
}
function agpDescargarGeo_(formato) {
  const lista = agpFiltrados_().filter(p => p.geojson);
  if (!lista.length) { mostrarToast_('No hay predios para descargar.'); return; }
  const nombre = agpNombreArchivo_();
  const feats = lista.map(p => ({ geometry: p.geojson, _nombre: p.nombre_predio || p.nombre || p.id_bg || 'Predio', _color: agpColorRiesgo_(p.riesgo),
    _carpeta: 'Capa ' + p.capa, properties: agpPropiedades_(p) }));
  if (formato === 'geojson') {
    descargarArchivo_(JSON.stringify({ type: 'FeatureCollection', name: nombre, features: feats.map(f => ({ type: 'Feature', geometry: f.geometry, properties: f.properties })) }),
      nombre + '.geojson', 'application/geo+json;charset=utf-8');
  } else {
    descargarArchivo_(dgKml_(nombre, [{ nombre: 'Predios de agricultores', features: feats }]), nombre + '.kml', 'application/vnd.google-earth.kml+xml;charset=utf-8');
  }
  mostrarToast_('⬇️ ' + lista.length + ' predio(s) en ' + (formato === 'kml' ? 'KML' : 'GeoJSON') + '.');
}
async function agpExcel_() {
  const lista = agpFiltrados_();
  if (!lista.length) { mostrarToast_('No hay predios para descargar.'); return; }
  try {
    const XLSX = await tbCargarSheetJs_();
    const filas = lista.map(p => AGP_CAMPOS.reduce((o, [k, t]) => { const v = p[k]; o[t] = v == null ? '' : ((k === 'sup_ha' || k === 'ha_calculadas') ? Number(v) : v); return o; },
      { 'Latitud': p.lat != null ? Number(p.lat) : '', 'Longitud': p.lng != null ? Number(p.lng) : '' }));
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(filas, { header: AGP_CAMPOS.map(c => c[1]).concat(['Latitud', 'Longitud']) });
    ws['!cols'] = AGP_CAMPOS.map(() => ({ wch: 16 })).concat([{ wch: 11 }, { wch: 11 }]);
    XLSX.utils.book_append_sheet(wb, ws, 'Predios');
    XLSX.writeFile(wb, agpNombreArchivo_() + '.xlsx');
    mostrarToast_('✅ Descargados ' + lista.length + ' predio(s).');
  } catch (e) { mostrarToast_('No se pudo generar el Excel: ' + (e.message || e)); }
}

/* ── ⬆️ Subir / 🗑️ eliminar capas (solo Administrador) ── */
async function agpSubirGeojson_(archivo) {
  if (!agpEsAdmin_()) { mostrarToast_('Solo el Administrador sube capas de predios.'); return; }
  let gj;
  try { gj = JSON.parse(await archivo.text()); } catch (e) { mostrarToast_('El archivo no es un GeoJSON válido: ' + (e.message || e)); return; }
  const feats = (gj && gj.type === 'FeatureCollection' ? gj.features : gj && gj.type === 'Feature' ? [gj] : null) || [];
  const pols = feats.filter(f => f && f.geometry && /Polygon$/.test(f.geometry.type));
  if (!pols.length) { mostrarToast_('El archivo no trae polígonos (Polygon / MultiPolygon).'); return; }
  // Coordenadas en grados (WGS84): si vienen en metros (UTM), el archivo hay que exportarlo en EPSG:4326
  const primera = (function c(a) { return Array.isArray(a[0]) ? c(a[0]) : a; })(pols[0].geometry.coordinates);
  if (Math.abs(primera[0]) > 180 || Math.abs(primera[1]) > 90) {
    mostrarToast_('⚠️ Las coordenadas no están en grados (WGS84). Exporta el GeoJSON en EPSG:4326 y vuelve a subirlo.'); return;
  }
  const sugerido = archivo.name.replace(/\.(geo)?json$/i, '');
  const capa = (prompt('Nombre de la capa (si ya existe, se REEMPLAZA completa):', sugerido) || '').trim();
  if (!capa) return;
  const existe = (state.agp.datos || []).filter(p => p.capa.toLowerCase() === capa.toLowerCase()).length;
  if (!confirm('⬆️ Subir ' + pols.length + ' predio(s) a la capa «' + capa + '».' + (existe ? '\n\nReemplaza los ' + existe + ' predio(s) que tiene hoy esa capa.' : '') +
    (feats.length > pols.length ? '\n\n' + (feats.length - pols.length) + ' elemento(s) sin polígono se omiten.' : '') + '\n\n¿Continuar?')) return;
  const btn = document.getElementById('agp-subir'); btn.disabled = true;
  let ok = 0; const errores = [];
  try {
    for (let i = 0; i < pols.length; i += 200) {
      btn.textContent = '⏳ ' + Math.min(i + 200, pols.length) + ' de ' + pols.length + '…';
      const { data, error } = await supabaseClient.rpc('cargar_predios_agr', { p_capa: capa, p_features: pols.slice(i, i + 200), p_reemplazar: i === 0 });
      if (error) throw error;
      ok += Number(data && data.cargados) || 0;
      ((data && data.errores) || []).forEach(x => errores.push('Elemento ' + (i + Number(x.n)) + ': ' + x.error));
    }
  } catch (e) {
    mostrarToast_(/cargar_predios_agr/.test(e.message || '') ? 'Falta ejecutar el SQL 150 en Supabase.' : 'No se pudo subir: ' + (e.message || e));
  } finally { btn.disabled = false; btn.textContent = '⬆️ Subir GeoJSON'; }
  if (errores.length) console.warn('Predios, errores de carga:', errores);
  await abrirAdminAgricultores_(true);
  if (ok) {
    const sel = document.getElementById('agp-capa'); sel.value = capa; agpRender_(true);
    mostrarToast_('✅ Capa «' + capa + '»: ' + ok + ' predio(s) cargados' + (errores.length ? '; ' + errores.length + ' con error (ver consola)' : '') + '.');
  }
}
async function agpEliminarCapa_() {
  if (!agpEsAdmin_()) return;
  const capa = document.getElementById('agp-capa').value;
  if (!capa) { mostrarToast_('Elige primero en el filtro «Capa» la capa que quieres eliminar.'); return; }
  const n = (state.agp.datos || []).filter(p => p.capa === capa).length;
  if (!confirm('🗑️ ¿Eliminar la capa «' + capa + '» con sus ' + n + ' predio(s)?\n\nSe puede volver a cargar subiendo el GeoJSON.')) return;
  const { data, error } = await supabaseClient.rpc('eliminar_capa_predios_agr', { p_capa: capa });
  if (error) { mostrarToast_('No se pudo eliminar: ' + error.message); return; }
  document.getElementById('agp-capa').value = '';
  await abrirAdminAgricultores_(true);
  mostrarToast_('🗑️ Capa «' + capa + '» eliminada (' + (data || 0) + ' predios).');
}
