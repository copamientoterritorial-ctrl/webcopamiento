/* ============ PLANIFICADOR: capas de contexto, simbología, crear y eliminar (06-10-2026) ============ */

/** Nombre del área elegida (como viene en los recursos, con tilde). */
function plNombreArea_() {
  const a = plAreasVisibles_().find(x => x.id === state.pl.idArea);
  return a ? a.nombre : null;
}

/** Variantes del nombre del área (con y sin tilde) para filtrar tablas que lo guardan de una u otra forma. */
function plVariantesArea_(nombre) {
  const n = plNorm_(nombre);
  const fuentes = [nombre, ...(state.areasCatalogo || []), ...(state.misAreasIds || []),
                   ...state.pl.recursos.map(r => r.area)];
  return [...new Set(fuentes.filter(v => v && plNorm_(v) === n))];
}

/* Controles del mapa del Planificador (12-10-2026):
 *   · arriba a la derecha, botón 🗂️ Capas: mapa base + capas del área + TODAS las capas del
 *     Planificador de Alertas (Red Vial MOP y CMPC, Fundos CMPC y Arauco, Red de Prevención,
 *     Rutas SIGEI, Alertas Normal/Amarilla/Roja e Incendios SIDCO +10 km), cargadas por área;
 *   · abajo a la izquierda: simbología "Recursos disponibles" con los conteos de los filtros. */
function crearControlCapasPlanificador_() {
  const Capas = L.Control.extend({
    options: { position: 'topright' },
    onAdd() {
      const div = L.DomUtil.create('div', 'pl-capas-ctrl');
      div.innerHTML = '<button class="pl-capas-btn" id="pl-capas-btn" title="Capas y mapa base">🗂️ Capas</button><div class="pl-capas-panel" id="pl-capas"></div>';
      L.DomEvent.disableClickPropagation(div);
      L.DomEvent.disableScrollPropagation(div);
      div.addEventListener('change', (e) => {
        const t = e.target;
        if (t.dataset.plinc) {   // una temporada de incendios
          state.pl.extra.incOn[t.dataset.plinc] = t.checked; plMostrarIncendios_(); return;
        }
        const k = t.dataset.plcapa;
        if (!k) return;
        state.pl.capas[k] = t.checked;
        plAplicarCapa_(k);
      });
      div.addEventListener('click', (e) => {
        if (e.target.closest('#pl-capas-btn')) {
          const p = div.querySelector('.pl-capas-panel');
          p.classList.toggle('show');
          div.querySelector('#pl-capas-btn').classList.toggle('abierto', p.classList.contains('show'));
          return;
        }
        const b = e.target.closest('[data-plbase]');
        if (b) { plSetBasemap_(b.dataset.plbase); renderControlCapasPlanificador_(); }
      });
      return div;
    },
  });
  const Leyenda = L.Control.extend({
    options: { position: 'bottomleft' },
    onAdd() {
      const div = L.DomUtil.create('div', 'pl-leyenda');
      div.id = 'pl-leyenda';
      L.DomEvent.disableClickPropagation(div);
      L.DomEvent.disableScrollPropagation(div);
      div.addEventListener('input', (e) => { if (e.target.id === 'pl-tam') plCambiarEscalaIconos_(Number(e.target.value)); });
      div.addEventListener('click', (e) => {
        if (e.target.closest('.pl-leyenda-tit')) { div.classList.toggle('plegado'); return; }
        const t = e.target.closest('[data-pltipo]');
        if (t) {   // clic en un tipo = filtrar por ese tipo (otro clic lo quita)
          state.pl.tipo = state.pl.tipo === t.dataset.pltipo ? '' : t.dataset.pltipo;
          renderPlanificador_();
        }
      });
      return div;
    },
  });
  new Capas().addTo(plMap);
  new Leyenda().addTo(plMap);
  renderControlCapasPlanificador_();
}

function renderControlCapasPlanificador_() {
  const div = document.getElementById('pl-capas');
  const ley = document.getElementById('pl-leyenda');
  if (!div) return;
  const c = state.pl.capas, d = state.pl.capasData, inf = state.pl.extra.info || {};
  const n = (k, v) => {   // contador / estado de carga de una capa
    const i = inf[k];
    if (i === 'cargando') return '<span class="pl-capa-n cargando">Cargando…</span>';
    if (i && i.error) return '<span class="pl-capa-n error" title="' + escapeHtml_(i.error) + '">Error</span>';
    if (i && i.texto) return '<span class="pl-capa-n">' + escapeHtml_(i.texto) + '</span>';
    if (v != null) return '<span class="pl-capa-n">' + v + '</span>';
    if (i && i.n != null) return '<span class="pl-capa-n">' + i.n.toLocaleString('es-CL') + '</span>';
    return '';
  };
  const fila = (k, color, texto, v, estilo, deshab) =>
    '<label class="pl-capa-fila"' + (deshab ? ' style="opacity:.5;" title="' + deshab + '"' : '') + '><input type="checkbox" data-plcapa="' + k + '"' +
    (c[k] ? ' checked' : '') + (deshab ? ' disabled' : '') + '>' +
    '<span class="pl-capa-muestra" style="' + estilo.replace(/\$c/g, color) + '"></span>' + texto + n(k, v) + '</label>';
  const sinArea = state.pl.idArea == null ? 'Elige un área' : '';
  const asignadas = plRecursosDelArea_().filter(r => plRutaNormal_(r)).length;
  const linea = 'border-top:3px solid $c;height:0;margin-top:6px';
  const temporadas = state.pl.extra.temporadas || [];

  div.innerHTML =
    '<div class="pl-grupo-tit">Mapa base</div><div class="pl-bases">' +
      BASEMAPS.map(b => '<button class="pl-base' + (state.pl.base === b.id ? ' sel' : '') + '" data-plbase="' + b.id + '" title="' + escapeHtml_(b.nombre) + '">' +
        '<img src="' + b.url.replace('{z}/{y}/{x}', '7/78/38') + '" alt="" loading="lazy"><span>' +
        escapeHtml_({ positron: 'Topográfico', calles_ref: 'Rutas', calles: 'Calles', satellite: 'Satélite', gris: 'Oscuro' }[b.id] || b.nombre) + '</span></button>').join('') +
    '</div>' +
    '<div class="pl-grupo-tit">Área</div>' +
      fila('comunas', '#94A3B8', 'Límites comunales', d.comunas.length || null, 'border:1px dashed $c;background:rgba(148,163,184,.12)') +
      fila('areaRel', '#7C3AED', 'Áreas de Relacionamiento', d.areaRel.length || null, 'border:1.5px solid $c;background:rgba(196,181,253,.35)') +
      fila('fundos', '#059669', 'Fundos CMPC', d.fundos.length || null, 'border:1.5px solid $c;background:rgba(52,211,153,.3)') +
      fila('fundosArauco', '#B45309', 'Fundos Arauco', null, 'border:1.5px solid $c;background:rgba(251,191,36,.3)', sinArea) +
    '<div class="pl-grupo-tit">Rutas y caminos</div>' +
      fila('asignadas', '#2563EB', 'Rutas de los recursos (Normal)', asignadas || null, linea) +
      fila('rutas', '#475569', 'Rutas de Patrullaje SIGEI', state.pl.rutas.length || null, 'border-top:2px dashed $c;height:0;margin-top:6px') +
      fila('redVial', '#F59E0B', 'Red Vial (MOP)', null, 'border-top:4px solid #FCD34D;outline:1px solid #C9A227;height:0;margin-top:6px', sinArea) +
      (puedeVerRedVialCmpc_() ? fila('redVialCmpc', '#D32F2F', 'Red Vial CMPC', null, linea, sinArea) : '') +
    '<div class="pl-grupo-tit">Prevención</div>' +
      fila('comites', '#EA580C', 'Red de Prevención (comités)', null, 'border:1.5px solid $c;background:rgba(253,186,116,.35)', sinArea) +
    '<div class="pl-grupo-tit">Alertas (zonas y planificación)</div>' +
      fila('alertaVerde', '#16A34A', 'Normal', null, 'border:2px solid $c;background:rgba(22,163,74,.2)', sinArea) +
      fila('alertaAmarilla', '#F59E0B', 'Alerta Amarilla', null, 'border:2px solid $c;background:rgba(245,158,11,.2)', sinArea) +
      fila('alertaRoja', '#EF4444', 'Alerta Roja', null, 'border:2px solid $c;background:rgba(239,68,68,.2)', sinArea) +
    '<div class="pl-grupo-tit">Incendios</div>' +
      fila('incendios', '#EF4444', 'Incendios SIDCO (área + 10 km)', null, 'background:$c;border-radius:50%;width:10px;height:10px;margin:0 3px', sinArea) +
      (c.incendios && temporadas.length
        ? '<div class="pl-sub-filas">' + temporadas.map((t, i) => '<label class="pl-capa-fila"><input type="checkbox" data-plinc="' + escapeHtml_(t.nombre) + '"' +
            (state.pl.extra.incOn[t.nombre] ? ' checked' : '') + '><span class="pl-capa-muestra" style="background:' + t.color + ';border-radius:50%;width:9px;height:9px;"></span>' +
            escapeHtml_(t.nombre) + '<span class="pl-capa-n">' + t.n.toLocaleString('es-CL') + '</span></label>').join('') + '</div>'
        : '');

  // Simbología: solo "Recursos disponibles", con los conteos que dejan los filtros (sector, tipo, búsqueda)
  if (ley) {
    const filtrados = plRecursosFiltrados_();
    const porTipo = {};
    // Los tipos del área siempre aparecen (para poder volver a ellos); el número es el filtrado
    plRecursosDelArea_().forEach(r => { porTipo[r.tipo_recurso || 'Sin tipo'] = 0; });
    filtrados.forEach(r => { const t = r.tipo_recurso || 'Sin tipo'; porTipo[t] = (porTipo[t] || 0) + 1; });
    const tipos = Object.keys(porTipo).sort(compararTipoRecurso_);   // orden de tipos del sistema
    const iconoTipo = (t) => {
      const url = iconoPersonalizadoPorTipo_(t);
      return url ? '<img src="' + escapeHtml_(url) + '" alt="">'
                 : '<span>' + emojiParaRecursoMaestro_({ tipo_recurso: t }).emoji + '</span>';
    };
    ley.style.display = tipos.length ? '' : 'none';
    ley.innerHTML = '<div class="pl-leyenda-tit">📍 Recursos disponibles <small>' + filtrados.length + '</small><span class="pl-capas-caret">▾</span></div>' +
      '<div class="pl-leyenda-cuerpo">' + tipos.map(t => '<div class="pl-tipo-fila' + (state.pl.tipo === t ? ' activo' : '') + '" data-pltipo="' + escapeHtml_(t) + '"' +
        (porTipo[t] ? '' : ' style="opacity:.4;"') + ' title="Clic para filtrar por este tipo">' +
        '<span class="pl-tipo-ico">' + iconoTipo(t) + '</span><span class="pl-tipo-nom">' + escapeHtml_(aTitulo_(t)) + '</span>' +
        '<span class="pl-capa-n">' + porTipo[t] + '</span></div>').join('') + '</div>' +
      // Barra para achicar / agrandar los íconos de los recursos (50 % – 200 %)
      '<div class="pl-tam" title="Tamaño de los íconos de recursos en el mapa">🔍<input type="range" id="pl-tam" min="0.5" max="2" step="0.1" value="' + (state.escalaIconos || 1) + '">' +
        '<span id="pl-tam-txt">' + Math.round((state.escalaIconos || 1) * 100) + '%</span></div>';
  }
}

/* ── Capas del Planificador de Alertas en el mapa del Planificador ──────────── */
function plGrupoExtra_(k) {
  if (!plExtraLayers[k]) plExtraLayers[k] = L.layerGroup();
  return plExtraLayers[k];
}
/** Clave del área para las fuentes que trabajan por área (= clave_area_red_vial_, SQL 71). */
function plClaveArea_() { const n = plNombreArea_(); return n ? plNorm_(n).replace(/[^A-Z0-9]/g, '') : null; }
/** Al cambiar de área: se descarta lo cargado y se recargan las capas encendidas. */
function plResetExtra_() {
  Object.values(plExtraLayers).forEach(g => { g.clearLayers(); if (plMap && plMap.hasLayer(g)) plMap.removeLayer(g); });
  state.pl.extra = { idArea: state.pl.idArea, info: {}, temporadas: [], incOn: state.pl.extra.incOn || {}, rv: [] };
  ['fundosArauco', 'redVial', 'redVialCmpc', 'comites', 'alertaVerde', 'alertaAmarilla', 'alertaRoja', 'incendios']
    .forEach(k => { if (state.pl.capas[k]) plAplicarCapa_(k); });
}
/** Enciende / apaga una capa del panel. */
function plAplicarCapa_(k) {
  if (k === 'rutas' || k === 'asignadas') { renderMapaPlanificador_(plRecursosFiltrados_()); renderControlCapasPlanificador_(); return; }
  if (k === 'comunas' || k === 'areaRel' || k === 'fundos') { renderCapasPlanificador_(); return; }
  if (k === 'incendios') {   // ya cargados: solo se muestran/ocultan; si no, se cargan (y se muestran al terminar)
    if (state.pl.capas.incendios) plCargarCapaExtra_('incendios');
    plMostrarIncendios_(); renderControlCapasPlanificador_(); return;
  }
  const g = plGrupoExtra_(k);
  if (state.pl.capas[k]) { plCargarCapaExtra_(k); if (!plMap.hasLayer(g)) g.addTo(plMap); }
  else if (plMap.hasLayer(g)) plMap.removeLayer(g);
  renderControlCapasPlanificador_();
}
function plMostrarIncendios_() {
  const g = plGrupoExtra_('incendios');
  g.clearLayers();
  if (state.pl.capas.incendios) (state.pl.extra.temporadas || []).forEach(t => { if (state.pl.extra.incOn[t.nombre]) g.addLayer(t.layer); });
  if (state.pl.capas.incendios && !plMap.hasLayer(g)) g.addTo(plMap);
  if (!state.pl.capas.incendios && plMap.hasLayer(g)) plMap.removeLayer(g);
}
/** Estilo de la Red Vial MOP según el zoom del mapa del Planificador (mismo de la capa principal). */
function plRestilarRedVial_() {
  const z = plMap.getZoom();
  (state.pl.extra.rv || []).forEach(t => {
    const e = estiloRedVial_(t.cat, z);
    const visible = z >= RED_VIAL_CATEGORIAS[t.cat].minZ;
    t.casing.setStyle(Object.assign({}, e.casing, visible ? {} : { opacity: 0 }));
    t.fill.setStyle(Object.assign({}, e.fill, visible ? {} : { opacity: 0 }));
  });
}

/** Carga (una vez por área) los datos de una capa del Planificador de Alertas. */
async function plCargarCapaExtra_(k, forzar) {
  const ex = state.pl.extra;
  if (ex.idArea !== state.pl.idArea) { plResetExtra_(); return; }
  const nombre = plNombreArea_(), clave = plClaveArea_();
  if (!nombre) return;
  const info = ex.info;
  const yaCargada = info[k] && info[k] !== 'cargando' && !info[k].error;
  if (k !== 'redVialCmpc' && (yaCargada || info[k] === 'cargando')) return;
  const g = plGrupoExtra_(k);
  const variantes = plVariantesArea_(nombre);
  const idArea = state.pl.idArea;
  const vigente = () => state.pl.idArea === idArea && state.pl.extra === ex;
  info[k] = 'cargando'; renderControlCapasPlanificador_();
  try {
    if (k === 'fundosArauco') {
      const { data, error } = await supabaseClient.from('v_fundos_arauco').select('id, propietario, nombre_fundo, sup_ha, area, sector, geometry').in('area', variantes);
      if (error) throw error;
      if (!vigente()) return;
      g.clearLayers();
      (data || []).forEach(f => {
        if (!f.geometry) return;
        L.geoJSON(f.geometry, { pane: 'plFundos', style: { color: '#B45309', weight: 1.3, fillColor: '#FBBF24', fillOpacity: 0.18 } })
          .bindTooltip('<b>' + escapeHtml_(f.nombre_fundo || 'Fundo') + '</b>' + (f.sup_ha ? '<br>' + Number(f.sup_ha).toFixed(1) + ' ha' : '') + '<br>Arauco', { sticky: true })
          .addTo(g);
      });
      info[k] = { n: (data || []).length };

    } else if (k === 'comites') {
      const { data, error } = await supabaseClient.from('v_comite_por_comuna').select('comite_id, nombre_comite, area, sector, num_comite, area_geom, lat, lng').in('area', variantes);
      if (error) throw error;
      if (!vigente()) return;
      g.clearLayers();
      (data || []).forEach(r => {
        const popup = '<div class="popup-title">🖐️ ' + escapeHtml_(r.nombre_comite || 'Comité') + '</div><div class="popup-row">Red de Prevención · Comité N° ' +
          (r.num_comite || r.comite_id) + (r.sector ? ' · ' + escapeHtml_(r.sector) : '') + '</div>';
        if (r.area_geom) L.geoJSON(r.area_geom, { pane: 'plComites', style: { color: '#EA580C', weight: 1.5, fillColor: '#FDBA74', fillOpacity: 0.2 } }).bindPopup(popup).addTo(g);
        if (r.lat != null && r.lng != null) L.marker([r.lat, r.lng], { icon: iconoManito, pane: 'plIncendios' }).bindPopup(popup).addTo(g);
      });
      info[k] = { n: (data || []).length };

    } else if (k === 'redVial') {
      const filas = [];
      for (let desde = 0; ; desde += 1000) {   // un área completa supera las 1.000 filas por consulta
        const { data, error } = await supabaseClient.from('v_red_vial_recorte')
          .select('objectid, rol, rol_label, nombre_camino, clasificacion, carpeta, concesionado, geometry')
          .eq('ambito', 'area').eq('clave', clave).order('objectid').range(desde, desde + 999);
        if (error) throw error;
        filas.push(...(data || []));
        if (!data || data.length < 1000) break;
      }
      if (!vigente()) return;
      g.clearLayers(); ex.rv = [];
      const borde = L.canvas({ pane: 'plRvBorde', padding: 0.3 }), relleno = L.canvas({ pane: 'plRvRelleno', padding: 0.3 });
      filas.forEach(r => {
        const geom = typeof r.geometry === 'string' ? JSON.parse(r.geometry) : r.geometry;
        if (!geom || !geom.coordinates) return;
        const partes = (geom.type === 'LineString' ? [geom.coordinates] : geom.type === 'MultiLineString' ? geom.coordinates : [])
          .map(p => p.map(c => L.latLng(c[1], c[0]))).filter(p => p.length >= 2);
        if (!partes.length) return;
        const cat = categoriaRedVial_(r);
        const casing = L.polyline(partes, { renderer: borde, interactive: false });
        const fill = L.polyline(partes, { renderer: relleno });
        fill.bindPopup('<div class="popup-title">🛣️ ' + escapeHtml_(r.rol || r.rol_label || 'Camino') + '</div>' +
          (r.nombre_camino ? '<div class="popup-row">' + escapeHtml_(r.nombre_camino) + '</div>' : '') +
          '<div class="popup-row">🏷️ ' + escapeHtml_(r.clasificacion || '—') + ' · ' + escapeHtml_(r.carpeta || '—') + '</div>');
        casing.addTo(g); fill.addTo(g);
        ex.rv.push({ cat, casing, fill });
      });
      plRestilarRedVial_();
      info[k] = { n: ex.rv.length };

    } else if (k === 'redVialCmpc') {
      if (!state.pl.capas.redVialCmpc) { info[k] = null; return; }
      if (plMap.getZoom() < RED_VIAL_CMPC_MIN_Z) { g.clearLayers(); info[k] = { texto: 'Acércate (zoom ≥ ' + RED_VIAL_CMPC_MIN_Z + ')' }; return; }
      const caja = plMap.getBounds().pad(0.3);
      const pedido = (ex.pedidoCmpc = (ex.pedidoCmpc || 0) + 1);
      const { data, error } = await supabaseClient.rpc('red_vial_cmpc_en_vista_json', {
        p_ambito: 'area', p_clave: clave, p_oeste: caja.getWest(), p_sur: caja.getSouth(), p_este: caja.getEast(), p_norte: caja.getNorth(),
        p_limite: RED_VIAL_CMPC_LIMITE, p_simplificar_m: simplificacionCmpc_(plMap.getZoom()), p_sin_traslape: !!state.pl.capas.redVial,
      });
      if (error) throw error;
      if (!vigente() || pedido !== ex.pedidoCmpc) return;
      g.clearLayers();
      const rnd = L.canvas({ pane: 'plRvCmpc', padding: 0.3 }), z = plMap.getZoom();
      (data || []).forEach(r => {
        const geom = typeof r.geometry === 'string' ? JSON.parse(r.geometry) : r.geometry;
        if (!geom || !geom.coordinates) return;
        const partes = (geom.type === 'LineString' ? [geom.coordinates] : geom.type === 'MultiLineString' ? geom.coordinates : [])
          .map(p => p.map(c => L.latLng(c[1], c[0]))).filter(p => p.length >= 2);
        if (!partes.length) return;
        const cat = RED_VIAL_CMPC_CATEGORIAS[r.categoria] ? r.categoria : 'tierra';
        L.polyline(partes, Object.assign({ renderer: rnd }, estiloRedVialCmpc_(cat, z)))
          .bindPopup('<div class="popup-title">🌲 Camino CMPC' + (r.c_codigo ? ' · ' + escapeHtml_(r.c_codigo) : '') + '</div>' +
            (r.c_nombre ? '<div class="popup-row">' + escapeHtml_(r.c_nombre) + '</div>' : '') +
            '<div class="popup-row">🧱 ' + RED_VIAL_CMPC_CATEGORIAS[cat].nombre + '</div>')
          .addTo(g);
      });
      info[k] = { texto: (data || []).length.toLocaleString('es-CL') + ' en pantalla' };

    } else if (k === 'alertaVerde' || k === 'alertaAmarilla' || k === 'alertaRoja') {
      await plCargarAlertas_(vigente);
      return;

    } else if (k === 'incendios') {
      const [focos, zona] = await Promise.all([
        cargarIncendiosNacional_(),
        supabaseClient.rpc('zona_incendios_geojson', { p_ambito: 'area', p_clave: clave, p_metros: INCENDIOS_MARGEN_M }),
      ]);
      if (zona.error) throw zona.error;
      if (!vigente()) return;
      const polys = zona.data ? poligonosDeGeojson_(typeof zona.data === 'string' ? JSON.parse(zona.data) : zona.data) : [];
      polys.forEach(p => {
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        p[0].forEach(([x, y]) => { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; });
        p.__bb = [x0, y0, x1, y1];
      });
      const grupos = {};
      focos.forEach(f => { if (polys.length && puntoEnPoligonos_(f.c[0], f.c[1], polys)) (grupos[f.t] = grupos[f.t] || []).push(f.c); });
      const nombres = Object.keys(grupos).sort().reverse();
      ex.temporadas = nombres.map((t, i) => {
        const color = TEMPORADA_PALETTE[i % TEMPORADA_PALETTE.length];
        const capa = L.layerGroup(grupos[t].map(([lng, lat]) => L.marker([lat, lng], { icon: flameDivIcon_(color), pane: 'plIncendios' })));
        if (ex.incOn[t] === undefined) ex.incOn[t] = i < 3;   // por defecto, las 3 últimas temporadas
        return { nombre: t, color, n: grupos[t].length, layer: capa };
      });
      info[k] = { n: nombres.reduce((s, t) => s + grupos[t].length, 0) };
      plMostrarIncendios_();
    }
  } catch (e) {
    if (vigente()) info[k] = { error: (e && e.message) || String(e) };
    console.warn('Planificador · capa ' + k + ':', e);
  }
  if (vigente()) renderControlCapasPlanificador_();
}

/** Alertas: zonas comunales con plan activo (Normal / Amarilla / Roja) + lo planificado en el área. */
async function plCargarAlertas_(vigente) {
  const ex = state.pl.extra, info = ex.info;
  if (ex.alertasCargando) return;
  ex.alertasCargando = true;
  ['alertaVerde', 'alertaAmarilla', 'alertaRoja'].forEach(k => { info[k] = 'cargando'; });
  renderControlCapasPlanificador_();
  try {
    const nombre = plNombreArea_(), clave = plClaveArea_();
    // Comunas del área (mismo criterio que las capas de contexto)
    const { data: ac } = await supabaseClient.from('v_area_comunas').select('id_comuna').eq('area_norm', clave);
    const ids = new Set((ac || []).map(x => x.id_comuna));
    plRecursosDelArea_().forEach(r => { if (r.id_comuna != null) ids.add(r.id_comuna); });
    const slugs = (state.comunas || []).filter(cm => ids.has(cm.id_comuna)).map(cm => cm.id);
    const [zonas, planesCom, planesArea] = await Promise.all([
      supabaseClient.from('comunas_alerta_activa').select('*'),
      slugs.length ? supabaseClient.from('planes_contingencia').select('id, escenario').eq('ambito', 'comuna').in('comuna_id', slugs) : { data: [] },
      supabaseClient.from('planes_contingencia').select('id, escenario, area').eq('ambito', 'area'),
    ]);
    if (zonas.error) throw zonas.error;
    const planes = (planesCom.data || []).concat((planesArea.data || []).filter(p => plNorm_(p.area) === plNorm_(nombre)));
    const escPorPlan = {}; planes.forEach(p => { escPorPlan[p.id] = p.escenario; });
    let recursos = [];
    if (planes.length) {
      const { data, error } = await supabaseClient.from('planificacion_recursos_geojson')
        .select('*, instituciones(nombre, color_hex, logo_url)').in('plan_id', planes.map(p => p.id));
      if (error) throw error;
      recursos = data || [];
    }
    if (!vigente()) return;
    const grupos = { Verde: plGrupoExtra_('alertaVerde'), Amarilla: plGrupoExtra_('alertaAmarilla'), Roja: plGrupoExtra_('alertaRoja') };
    Object.values(grupos).forEach(g => g.clearLayers());
    const cuenta = { Verde: 0, Amarilla: 0, Roja: 0 };
    const colorEsc = e => e === 'Verde' ? '#16A34A' : e === 'Amarilla' ? '#F59E0B' : '#EF4444';
    (zonas.data || []).filter(z => ids.has(z.id_comuna)).forEach(z => {
      let gj = z.geom_geojson; if (typeof gj === 'string') { try { gj = JSON.parse(gj); } catch (e) { return; } }
      if (!gj || !grupos[z.escenario]) return;
      const col = colorEsc(z.escenario);
      L.geoJSON(gj, { pane: 'plAlertas', style: { color: col, weight: 3, fillColor: col, fillOpacity: 0.12 } })
        .bindPopup('<div class="popup-title">' + etiquetaEscenario_(z.escenario) + '</div><div class="popup-row">' + escapeHtml_(z.comuna_nombre || '') + '</div>')
        .addTo(grupos[z.escenario]);
    });
    // Lo planificado: color de la institución (misma simbología del Planificador de Alertas)
    recursos.slice().sort((a, b) => rangoInstitucionCapa_((b.instituciones || {}).nombre) - rangoInstitucionCapa_((a.instituciones || {}).nombre)).forEach(r => {
      const esc = escPorPlan[r.plan_id];
      if (!grupos[esc] || !r.geom_geojson) return;
      let gj; try { gj = typeof r.geom_geojson === 'string' ? JSON.parse(r.geom_geojson) : r.geom_geojson; } catch (e) { return; }
      const inst = r.instituciones || { nombre: 'Institución', color_hex: '#64748B' };
      const popup = '<div class="popup-title"><span style="display:inline-block;width:9px;height:9px;border-radius:3px;margin-right:6px;background:' + inst.color_hex + ';"></span>' +
        escapeHtml_(inst.nombre) + '</div><div class="popup-row">' + etiquetaEscenario_(esc) + ' · ' + escapeHtml_(r.tipo_recurso || '') + '</div>' +
        (r.descripcion ? '<div class="popup-row">' + escapeHtml_(r.descripcion) + '</div>' : '');
      if (gj.type === 'Point') L.marker([gj.coordinates[1], gj.coordinates[0]], { icon: pinDivIcon(inst.color_hex, false, inst.logo_url), pane: 'plIncendios' }).bindPopup(popup).addTo(grupos[esc]);
      else L.geoJSON(gj, { pane: 'plAlertas', style: { color: inst.color_hex, weight: r.tipo_geometria === 'linea' ? 4 : 2, fillColor: inst.color_hex, fillOpacity: 0.22 } }).bindPopup(popup).addTo(grupos[esc]);
      cuenta[esc]++;
    });
    info.alertaVerde = { n: cuenta.Verde }; info.alertaAmarilla = { n: cuenta.Amarilla }; info.alertaRoja = { n: cuenta.Roja };
  } catch (e) {
    ['alertaVerde', 'alertaAmarilla', 'alertaRoja'].forEach(k => { info[k] = { error: (e && e.message) || String(e) }; });
    console.warn('Planificador · alertas:', e);
  } finally {
    ex.alertasCargando = false;
  }
  if (vigente()) renderControlCapasPlanificador_();
}

/** Carga las capas de contexto del área elegida (una vez por área). */
async function cargarCapasAreaPlanificador_() {
  const idArea = state.pl.idArea;
  const nombre = plNombreArea_();
  state.pl.capasData = { idArea, comunas: [], areaRel: [], fundos: [] };
  if (idArea == null || !nombre) { renderCapasPlanificador_(); return; }
  const variantes = plVariantesArea_(nombre);
  const clave = plNorm_(nombre).replace(/[^A-Z0-9]/g, '');   // = clave_area_red_vial_ (SQL 71)

  // 1) Comunas del área (v_area_comunas → límites)
  const tareaComunas = (async () => {
    const { data: ac } = await supabaseClient.from('v_area_comunas').select('id_comuna').eq('area_norm', clave);
    const ids = new Set((ac || []).map(x => x.id_comuna));
    state.pl.recursos.filter(r => r.id_area === idArea && r.id_comuna != null).forEach(r => ids.add(r.id_comuna));
    const slugs = (state.comunas || []).filter(cm => ids.has(cm.id_comuna)).map(cm => cm.id);
    if (!slugs.length) return [];
    const { data } = await supabaseClient.from('v_comunas_limite').select('id, comuna, geometry').in('id', slugs);
    return data || [];
  })();

  // 2) Fundos CMPC del área (el nombre puede venir con o sin tilde)
  const tareaFundos = (async () => {
    const { data } = await supabaseClient.from('v_fundos_cmpc')
      .select('id, nombre_fundo, sup_ha, area, sector, propietario, geometry').in('area', variantes);
    return data || [];
  })();

  // 3) Áreas de Relacionamiento (sectores) del área: se reutiliza lo que cargó el mapa principal
  const tareaAreaRel = (async () => {
    if (!state.areaRelGeojson) {
      const { data: res } = await supabaseClient.functions.invoke('get-area-layers', { body: {} });
      if (res && res.areaRelacionamiento && res.areaRelacionamiento.ok) state.areaRelGeojson = res.areaRelacionamiento.data;
    }
    const feats = (state.areaRelGeojson && state.areaRelGeojson.features) || [];
    return feats.filter(f => plNorm_((f.properties || {}).AREA) === plNorm_(nombre));
  })();

  const [comunas, fundos, areaRel] = await Promise.all([
    tareaComunas.catch(() => []), tareaFundos.catch(() => []), tareaAreaRel.catch(() => []),
  ]);
  if (state.pl.idArea !== idArea) return;   // cambió el área mientras cargaba
  state.pl.capasData = { idArea, comunas, fundos, areaRel };
  renderCapasPlanificador_();
}

/** Dibuja las capas de contexto (no se redibujan en cada clic de la lista). */
function renderCapasPlanificador_() {
  if (!plMap) return;
  plComunasLayer.clearLayers(); plAreaRelLayer.clearLayers(); plFundosLayer.clearLayers();
  const c = state.pl.capas, d = state.pl.capasData;

  if (c.comunas) d.comunas.forEach(cm => {
    if (!cm.geometry) return;
    const capa = L.geoJSON(cm.geometry, { pane: 'plComunas', interactive: false,
      style: { color: '#64748B', weight: 1.2, opacity: 0.55, dashArray: '4,4', fillColor: '#94A3B8', fillOpacity: 0.04 } });
    plComunasLayer.addLayer(capa);
    try {
      L.marker(capa.getBounds().getCenter(), { pane: 'plComunas', interactive: false,
        icon: L.divIcon({ className: 'pl-comuna-label', iconSize: null, html: '<span>' + escapeHtml_(cm.comuna) + '</span>' }) })
        .addTo(plComunasLayer);
    } catch (e) {}
  });

  if (c.areaRel) d.areaRel.forEach(f => {
    const p = f.properties || {};
    const capa = L.geoJSON(f, { pane: 'plAreaRel',
      style: { color: '#7C3AED', weight: 1.5, fillColor: '#C4B5FD', fillOpacity: 0.14 } });
    capa.bindTooltip('Sector ' + escapeHtml_(p.SECTOR || '—'), { sticky: true });
    plAreaRelLayer.addLayer(capa);
  });

  if (c.fundos) d.fundos.forEach(f => {
    if (!f.geometry) return;
    const capa = L.geoJSON(f.geometry, { pane: 'plFundos',
      style: { color: '#059669', weight: 1.2, fillColor: '#34D399', fillOpacity: 0.16 } });
    capa.bindTooltip('<b>' + escapeHtml_(f.nombre_fundo || 'Fundo') + '</b>' +
      (f.sup_ha ? '<br>' + Number(f.sup_ha).toFixed(1) + ' ha' : '') + (f.sector ? '<br>' + escapeHtml_(f.sector) : ''), { sticky: true });
    plFundosLayer.addLayer(capa);
  });

  renderControlCapasPlanificador_();
}

/* ── Crear un recurso: botón "➕ Nuevo recurso" → clic en el mapa → tipo y código → crear_recurso_referencia */
function plPuedeEditarArea_() {
  const nombre = plNombreArea_();
  return !!nombre && plPuedeEditar_({ area: nombre });
}

function iniciarNuevoRecursoPlanificador_() {
  if (!plPuedeEditarArea_()) { mostrarToast_('🔒 No tienes permiso para crear recursos en esta área.'); return; }
  if (state.pl.nuevo) { cancelarNuevoRecursoPlanificador_(); return; }
  state.pl.nuevo = { latlng: null };
  state.pl.selId = null;
  renderPlanificador_();
  document.getElementById('pl-map').classList.add('pl-ubicando');
  document.getElementById('pl-nuevo').textContent = '✕ Cancelar nuevo';
  mostrarToast_('📍 Haz clic en el mapa donde quedará el nuevo recurso.');
  state.pl.clicUbicar = (e) => {
    if (!state.pl.nuevo) return;
    state.pl.nuevo.latlng = e.latlng;
    document.getElementById('pl-map').classList.remove('pl-ubicando');
    renderPlanificador_();
  };
  plMap.once('click', state.pl.clicUbicar);
}

function cancelarNuevoRecursoPlanificador_() {
  state.pl.nuevo = null;
  if (plMap && state.pl.clicUbicar) plMap.off('click', state.pl.clicUbicar);
  state.pl.clicUbicar = null;
  const mapa = document.getElementById('pl-map'); if (mapa) mapa.classList.remove('pl-ubicando');
  const btn = document.getElementById('pl-nuevo'); if (btn) btn.textContent = '➕ Nuevo recurso';
  renderPlanificador_();
}

async function crearRecursoPlanificador_() {
  const n = state.pl.nuevo;
  if (!n || !n.latlng) return;
  const tipo = (document.getElementById('pl-n-tipo') || {}).value || '';
  const codigo = ((document.getElementById('pl-n-codigo') || {}).value || '').trim();
  if (!tipo) { mostrarToast_('⚠️ Elige el tipo de recurso.'); return; }
  const datos = { tipo_recurso: tipo };
  if (codigo) datos.codigo_ref = codigo;
  plEstado_('Creando recurso…', 'guardando');
  const { data: id, error } = await supabaseClient.rpc('crear_recurso_referencia', {
    p_id_area: state.pl.idArea, p_lat: n.latlng.lat, p_lng: n.latlng.lng, p_datos: datos,
  });
  if (error) { plEstado_('Error al crear', 'error'); mostrarToast_('No se pudo crear: ' + error.message); return; }
  await refrescarRecursoPlanificador_(id);
  state.pl.nuevo = null;
  const btn = document.getElementById('pl-nuevo'); if (btn) btn.textContent = '➕ Nuevo recurso';
  plEstado_('Recurso creado', 'ok');
  mostrarToast_('✅ Recurso creado. Completa su ficha (actividad, móvil, sector, rutas, fecha de inicio).');
  seleccionarRecursoPlanificador_(id);
  renderListaPlanificador_(plRecursosFiltrados_());     // el recurso nuevo entra a la lista y al resumen
  renderKpisPlanificador_(plRecursosDelArea_());
  if (typeof loadRecursosDisponiblesAreaLayer_ === 'function') loadRecursosDisponiblesAreaLayer_().catch(() => {});
}

async function eliminarRecursoPlanificador_() {
  const r = plSeleccionado_();
  if (!r || !plPuedeEditar_(r)) return;
  if (!confirm('¿Eliminar el recurso ' + (claveRecurso_(r) || aTitulo_(r.tipo_recurso || '')) + (r.codigo_ref ? ' (ID ' + r.codigo_ref + ')' : '') + '?\n\n' +
               'También se borran sus turnos y sus rutas asociadas. No se puede deshacer.')) return;
  plEstado_('Eliminando…', 'guardando');
  const { error } = await supabaseClient.rpc('eliminar_recurso_referencia', { p_recurso_id: r.id });
  if (error) { plEstado_('Error al eliminar', 'error'); mostrarToast_('No se pudo eliminar: ' + error.message); return; }
  state.pl.recursos = state.pl.recursos.filter(x => x.id !== r.id);
  state.pl.selId = null; state.pl.preview = null; state.pl.moviendo = false;
  plEstado_('Recurso eliminado', 'ok');
  mostrarToast_('🗑️ Recurso eliminado.');
  renderPlanificador_();
  if (typeof loadRecursosDisponiblesAreaLayer_ === 'function') loadRecursosDisponiblesAreaLayer_().catch(() => {});
}

/* ── Cancelar toda acción en curso (13-10-2026): nuevo recurso, ubicar, mover, ficha abierta ── */
function plHayAccion_() {
  return !!(state.pl.nuevo || state.pl.ubicandoId || state.pl.ocultarFicha || state.pl.moviendo);
}
function plActualizarCancelar_() {
  const b = document.getElementById('pl-cancelar');
  if (b) b.style.display = plHayAccion_() ? '' : 'none';
}
function plCancelarTodo_() {
  if (state.pl.nuevo) cancelarNuevoRecursoPlanificador_();
  if (state.pl.clicUbicarRec && plMap) plMap.off('click', state.pl.clicUbicarRec);
  state.pl.clicUbicarRec = null; state.pl.ubicandoId = null;
  const mapa = document.getElementById('pl-map'); if (mapa) mapa.classList.remove('pl-ubicando');
  // Se descarta todo: ficha cerrada, sin movimientos pendientes (el ícono vuelve a su punto guardado)
  state.pl.selId = null; state.pl.moviendo = false; state.pl.preview = null; state.pl.ocultarFicha = false;
  const menu = document.getElementById('pl-export-menu'); if (menu) menu.classList.remove('show');
  renderPlanificador_();
  mostrarToast_('Acción cancelada.');
}

/* ── Exportar recursos a KML (Google Earth) o GeoJSON (SIG) ── */
function plDatosExport_(r) {
  const rn = plRutaNormal_(r);
  return {
    clave_radial: claveRecurso_(r) || null, id: r.codigo_ref || null, tipo_recurso: r.tipo_recurso || null,
    subgerencia: r.subgerencia || null, area: r.area || null, sector: r.sector || null, comuna: r.comuna || null,
    empresa: r.empresa || null, tipo_movil: r.tipo_movil || null, actividad: r.actividad || null,
    zona_alerta: r.zona_alerta || null, fecha_inicio: r.fecha_inicio_operacion ? String(r.fecha_inicio_operacion).slice(0, 10) : null,
    nombre_ruta: r.nombre_ruta || null, ruta_normal: rn ? (rn.descripcion || 'Asignada') : null, km_ruta_normal: rn && rn.km != null ? Number(rn.km) : null,
    temporada: r.temporada || null, lat: r.lat != null ? Number(r.lat) : null, lng: r.lng != null ? Number(r.lng) : null,
    utm_x: r.coord_x != null ? Math.round(r.coord_x) : null, utm_y: r.coord_y != null ? Math.round(r.coord_y) : null,
  };
}
function plExportar_(formato) {
  const lista = plRecursosFiltrados_();
  if (!lista.length) { mostrarToast_('No hay recursos para exportar con estos filtros.'); return; }
  const nombreArch = 'recursos_' + (plNombreArea_() ? plNorm_(plNombreArea_()).replace(/[^A-Z0-9]+/g, '_') : (state.pl.subg ? 'SUBG_' + state.pl.subg : 'todas')) +
    '_' + new Date().toISOString().slice(0, 10);
  const bajar = (texto, ext, tipo) => {
    const url = URL.createObjectURL(new Blob([texto], { type: tipo }));
    const a = document.createElement('a'); a.href = url; a.download = nombreArch + '.' + ext; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };
  const sinPunto = lista.filter(r => r.lat == null).length;
  if (formato === 'geojson') {
    // Todos los recursos; los sin punto van con geometría null (válido en GeoJSON)
    const fc = { type: 'FeatureCollection', name: nombreArch, features: lista.map(r => ({
      type: 'Feature', geometry: r.lat != null ? { type: 'Point', coordinates: [Number(r.lng), Number(r.lat)] } : null, properties: plDatosExport_(r) })) };
    bajar(JSON.stringify(fc, null, 1), 'geojson', 'application/geo+json');
  } else {
    // KML: carpeta por área, estilo por tipo (color del tipo); los sin punto no se pueden dibujar
    const x = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const kmlColor = hex => { const m = /^#?([0-9a-f]{6})$/i.exec(hex || ''); const h = m ? m[1] : '64748B'; return 'ff' + h.slice(4, 6) + h.slice(2, 4) + h.slice(0, 2); };
    const tipos = [...new Set(lista.map(r => r.tipo_recurso || 'Sin tipo'))].sort(compararTipoRecurso_);
    const idEstilo = t => 'tipo_' + plNorm_(t).replace(/[^A-Z0-9]+/g, '_');
    const estilos = tipos.map(t => '<Style id="' + idEstilo(t) + '"><IconStyle><color>' + kmlColor(plColorTipo_(t)) + '</color><scale>1.1</scale>' +
      '<Icon><href>http://maps.google.com/mapfiles/kml/paddle/wht-blank.png</href></Icon></IconStyle><LabelStyle><scale>0.8</scale></LabelStyle></Style>').join('');
    const areas = [...new Set(lista.map(r => r.area || 'Sin área'))].sort((a, b) => a.localeCompare(b, 'es'));
    const placemark = r => {
      const d = plDatosExport_(r);
      return '<Placemark><name>' + x(d.clave_radial || d.id || 'Recurso') + '</name><styleUrl>#' + idEstilo(r.tipo_recurso || 'Sin tipo') + '</styleUrl>' +
        '<description><![CDATA[<b>' + x(aTitulo_(d.tipo_recurso || '')) + '</b><br>ID: ' + x(d.id || '—') + '<br>Área: ' + x(d.area || '—') + ' · Sector: ' + x(d.sector || '—') +
        '<br>Empresa: ' + x(d.empresa || '—') + '<br>Móvil: ' + x(d.tipo_movil || '—') + ' · ' + x(d.actividad || '—') + '<br>Inicio: ' + x(d.fecha_inicio || '—') +
        (d.ruta_normal ? '<br>Ruta Normal: ' + x(d.ruta_normal) : '') + ']]></description>' +
        '<ExtendedData>' + Object.entries(d).map(([k, v]) => '<Data name="' + k + '"><value>' + x(v) + '</value></Data>').join('') + '</ExtendedData>' +
        '<Point><coordinates>' + Number(r.lng) + ',' + Number(r.lat) + ',0</coordinates></Point></Placemark>';
    };
    const kml = '<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>' + x(nombreArch) + '</name>' + estilos +
      areas.map(a => '<Folder><name>' + x(a) + '</name>' + lista.filter(r => (r.area || 'Sin área') === a && r.lat != null).map(placemark).join('') + '</Folder>').join('') +
      '</Document></kml>';
    bajar(kml, 'kml', 'application/vnd.google-earth.kml+xml');
  }
  mostrarToast_('⬇️ Exportados ' + (formato === 'kml' ? lista.length - sinPunto : lista.length) + ' recursos' +
    (sinPunto ? (formato === 'kml' ? ' (' + sinPunto + ' sin punto no van en el KML)' : ' (' + sinPunto + ' sin punto, con geometría vacía)') : '') + '.');
}

/* ── Tamaño de los íconos de recursos (barra en la simbología; vale para todos los mapas) ── */
state.escalaIconos = (function () { try { return Number(localStorage.getItem('escala_iconos')) || 1; } catch (e) { return 1; } })();
function plCambiarEscalaIconos_(v) {
  state.escalaIconos = Math.max(0.5, Math.min(2, v));
  try { localStorage.setItem('escala_iconos', String(state.escalaIconos)); } catch (e) {}
  const t = document.getElementById('pl-tam-txt'); if (t) t.textContent = Math.round(state.escalaIconos * 100) + '%';
  clearTimeout(state.pl.tEscala);
  state.pl.tEscala = setTimeout(() => {
    renderMapaPlanificador_(plRecursosFiltrados_());
    // El mapa principal toma el nuevo tamaño al redibujar Recursos disponibles
    if (typeof recursosDisponiblesAreaLayer !== 'undefined' && recursosDisponiblesAreaLayer.getLayers().length) loadRecursosDisponiblesAreaLayer_().catch(() => {});
  }, 120);
}

function iniciarListenersPlanificador_() {
  document.getElementById('pl-area').addEventListener('change', (e) => {
    if (state.pl.nuevo) cancelarNuevoRecursoPlanificador_();
    state.pl.idArea = e.target.value ? Number(e.target.value) : null;
    state.pl.sector = ''; state.pl.tipo = ''; state.pl.selId = null; state.pl.preview = null;
    state.pl.moviendo = false; state.pl.rutas = []; state.pl.encuadrar = true;
    renderPlanificador_();
    cargarRutasPlanificador_();
    plResetExtra_();   // capas del Planificador de Alertas: se recargan para la nueva área
  });
  document.getElementById('pl-sector').addEventListener('change', (e) => { state.pl.sector = e.target.value; state.pl.encuadrar = true; renderPlanificador_(); });
  document.getElementById('pl-tipo').addEventListener('change', (e) => { state.pl.tipo = e.target.value; renderPlanificador_(); });
  // Subgerencia: limita las áreas y, sin área, muestra todos los recursos de esa subgerencia
  document.getElementById('pl-subg').addEventListener('change', (e) => {
    const antes = state.pl.idArea;
    state.pl.subg = e.target.value; state.pl.selId = null; state.pl.encuadrar = true;
    poblarAreasPlanificador_();
    if (state.pl.idArea !== antes) { state.pl.sector = ''; state.pl.rutas = []; plResetExtra_(); }
    renderPlanificador_();
  });
  // Gráfica: recursos sin punto en el mapa, sin ruta Normal, etc.
  document.getElementById('pl-grafica').addEventListener('change', (e) => { state.pl.grafica = e.target.value; state.pl.encuadrar = true; renderPlanificador_(); });
  document.getElementById('pl-kpis').addEventListener('click', (e) => {
    const c = e.target.closest('[data-plgraf]');
    if (!c) return;
    state.pl.grafica = state.pl.grafica === c.dataset.plgraf ? '' : c.dataset.plgraf;
    if (state.pl.listaOculta) { state.pl.listaOculta = false; document.getElementById('pl-body').classList.remove('sin-lista'); document.getElementById('pl-toggle-lista').classList.add('activo'); }
    renderPlanificador_();
  });
  // Exportar (KML / GeoJSON)
  const menuExp = document.getElementById('pl-export-menu');
  document.getElementById('pl-exportar').addEventListener('click', (e) => { e.stopPropagation(); menuExp.classList.toggle('show'); });
  menuExp.addEventListener('click', (e) => {
    const b = e.target.closest('[data-plexp]');
    if (b) { menuExp.classList.remove('show'); plExportar_(b.dataset.plexp); }
  });
  document.addEventListener('click', (e) => { if (!e.target.closest('.pl-export-wrap')) menuExp.classList.remove('show'); });
  // Cancelar toda acción en curso
  document.getElementById('pl-cancelar').addEventListener('click', plCancelarTodo_);
  document.getElementById('pl-limpiar').addEventListener('click', plLimpiarFiltros_);
  let tBusq = null;
  document.getElementById('pl-busqueda').addEventListener('input', (e) => {
    clearTimeout(tBusq);
    tBusq = setTimeout(() => { state.pl.q = e.target.value; renderPlanificador_(); }, 180);
  });
  document.getElementById('pl-recargar').addEventListener('click', async () => {
    state.pl.cargado = false;
    state.pl.capasData.idArea = undefined;   // también se releen las capas de contexto
    await cargarRecursosPlanificador_();
    poblarAreasPlanificador_();
    state.pl.rutas = [];
    await cargarRutasPlanificador_();
    renderPlanificador_();
    plResetExtra_();
  });
  document.getElementById('pl-lista').addEventListener('click', (e) => {
    const b = e.target.closest('.pl-item');
    if (b) seleccionarRecursoPlanificador_(b.dataset.id);
  });
  const ficha = document.getElementById('pl-ficha');
  ficha.addEventListener('click', (e) => {
    const b = e.target.closest('[data-pl]');
    if (!b) return;
    const accion = b.dataset.pl;
    if (accion === 'cerrar') { state.pl.selId = null; state.pl.moviendo = false; state.pl.preview = null; renderPlanificador_(); }
    else if (accion === 'guardar') guardarFichaPlanificador_();
    else if (accion === 'mover') {
      // Solo se redibuja el mapa: re-renderizar la ficha borraría lo que aún no se guardó.
      state.pl.moviendo = !state.pl.moviendo;
      b.textContent = state.pl.moviendo ? '✕ Cancelar movimiento' : '📍 Mover punto en el mapa';
      renderMapaPlanificador_(plRecursosFiltrados_());
      if (state.pl.moviendo) mostrarToast_('📍 Arrastra el marcador al nuevo punto de referencia.');
    }
    else if (accion === 'calendario') abrirCalendarioDesdePlanificador_();
    else if (accion === 'ubicar') ubicarRecursoPlanificador_();
    else if (accion === 'mover-mapa') {
      // Se oculta la ficha (el recurso sigue elegido, con su anillo) para arrastrar el ícono
      state.pl.ocultarFicha = true; renderFichaPlanificador_();
      mostrarToast_('✋ Arrastra el ícono con anillo azul al nuevo punto. Clic en el ícono para volver a la ficha.');
    }
    else if (accion === 'ver-ruta') {
      // Cierra la ficha y encuadra la ruta Normal (azul) + el punto del recurso
      const r = plSeleccionado_(), rn = plRutaNormal_(r);
      let gj = rn && rn.geom_geojson;
      if (typeof gj === 'string') { try { gj = JSON.parse(gj); } catch (er) { gj = null; } }
      state.pl.ocultarFicha = true; renderFichaPlanificador_();
      if (gj && plMap) {
        try {
          const lim = L.geoJSON(gj).getBounds();
          if (r.lat != null) lim.extend([r.lat, r.lng]);
          plMap.fitBounds(lim, { padding: [50, 50], maxZoom: 16 });
        } catch (er) {}
      }
      mostrarToast_('🛣️ Ruta del recurso en azul. Clic en el ícono para volver a la ficha.');
    }
    else if (accion === 'gestion') {
      const r = plSeleccionado_();
      mostrarVista_('gestion');
      const q = document.getElementById('gr-buscar');
      if (q && r) { q.value = claveRecurso_(r) || r.codigo_ref || ''; renderGestion_(); }
    }
    else if (accion === 'eliminar') eliminarRecursoPlanificador_();
    else if (accion === 'crear') crearRecursoPlanificador_();
    else if (accion === 'cancelar-nuevo') cancelarNuevoRecursoPlanificador_();
  });
  // Ficha modal: clic fuera de la ventana o Esc la cierra (Esc también cancela un "Ubicar")
  const cerrarFicha = () => {
    if (state.pl.nuevo) { cancelarNuevoRecursoPlanificador_(); return; }
    state.pl.selId = null; state.pl.moviendo = false; state.pl.preview = null; state.pl.ocultarFicha = false;
    renderPlanificador_();
  };
  document.getElementById('pl-ficha-modal').addEventListener('mousedown', (e) => { if (e.target.id === 'pl-ficha-modal') cerrarFicha(); });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || state.vistaActual !== 'planificador') return;
    // Esc = cancelar la acción en curso (ubicar, mover, nuevo) o cerrar la ficha
    if (plHayAccion_()) { plCancelarTodo_(); return; }
    if (document.getElementById('pl-ficha-modal').classList.contains('show')) cerrarFicha();
  });
  // Lista de recursos plegable: más espacio para el mapa
  const aplicarLista = () => {
    document.getElementById('pl-body').classList.toggle('sin-lista', !!state.pl.listaOculta);
    document.getElementById('pl-toggle-lista').classList.toggle('activo', !state.pl.listaOculta);
    if (plMap) setTimeout(() => plMap.invalidateSize(), 60);
  };
  document.getElementById('pl-toggle-lista').addEventListener('click', () => { state.pl.listaOculta = !state.pl.listaOculta; aplicarLista(); });
  aplicarLista();
  document.getElementById('pl-nuevo').addEventListener('click', iniciarNuevoRecursoPlanificador_);
}

