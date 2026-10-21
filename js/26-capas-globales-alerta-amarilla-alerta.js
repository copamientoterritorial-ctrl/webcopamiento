/* ============ CAPAS GLOBALES: Alerta Amarilla / Alerta Roja (todas las comunas activas) ============ */
const capaAlertaVerdeLayer    = L.layerGroup();
const capaAlertaAmarillaLayer = L.layerGroup();
const capaAlertaRojaLayer     = L.layerGroup();
// Arrays planos para etiquetas de alertas (mismo patrón que recursosDisponiblesFeatureLayers)
const alertaVerdeFeatureLayers    = [];
const alertaAmarillaFeatureLayers = [];
const alertaRojaFeatureLayers     = [];
// Arrays planos para etiquetas — igual que recursosDisponiblesFeatureLayers
// arrays de alerta movidos a declaraciones globales

async function cargarCapasAlertaGlobales_() {
  capaAlertaVerdeLayer.clearLayers();
  capaAlertaAmarillaLayer.clearLayers();
  capaAlertaRojaLayer.clearLayers();
  // Borrar del array SOLO las zonas (tienen _etiquetaTexto); los recursos planif los maneja loadPlanificacionRecursos_
  [alertaVerdeFeatureLayers, alertaAmarillaFeatureLayers, alertaRojaFeatureLayers].forEach(arr => {
    for (let i = arr.length - 1; i >= 0; i--) {
      if (arr[i].layer && arr[i].layer._etiquetaTexto) arr.splice(i, 1);
    }
  });

  const { data, error } = await supabaseClient.from('comunas_alerta_activa').select('*');
  if (error) { console.error('No se pudieron cargar las capas de alerta:', error); return; }

  (data || []).forEach(c => {
    try {
    let geojson = c.geom_geojson;
    if (typeof geojson === 'string') { try { geojson = JSON.parse(geojson); } catch (e) { return; } }
    if (!geojson || !geojson.type) return;
    const color = c.escenario === 'Verde' ? '#16A34A' : c.escenario === 'Amarilla' ? '#F59E0B' : '#EF4444';
    const ico   = c.escenario === 'Verde' ? '🟢' : c.escenario === 'Amarilla' ? '🟡' : '🔴';
    const clavePrevia = c.escenario === 'Verde' ? 'verde' : c.escenario === 'Amarilla' ? 'amarilla' : 'roja';
    const capa = L.geoJSON(geojson, { style: { color, weight: 3, fillColor: color, fillOpacity: opacidadRellenoAlerta_(clavePrevia), opacity: opacidadBordeAlerta_(clavePrevia) } });
    // Etiqueta: se activa con 🏷️ en el panel de capas
    const textoEtiqueta = ico + ' ' + c.comuna_nombre;
    capa._etiquetaTexto = textoEtiqueta;
    capa.eachLayer(poly => { poly._etiquetaTexto = textoEtiqueta; });
    const tituloPopup = ico + ' Plan ' + nombreEscenario_(c.escenario);
    capa.bindPopup('<div class="popup-title">' + tituloPopup + '</div><div class="popup-row">' + c.comuna_nombre + ' · ' + c.region + '</div><div class="popup-row" style="margin-top:6px;"><em>Cargando comparativo…</em></div>');
    capa.on('popupopen', async (ev) => {
      const { data: comparativo } = await supabaseClient.from('planes_contingencia_comparativo').select('*').eq('plan_id', c.plan_id);
      const filas = (comparativo || []).map(x => '<div class="popup-row">' + x.institucion_nombre + ': propuesta <b>' + x.cantidad_propuesta + '</b>, tenemos <b>' + x.cantidad_actual + '</b></div>').join('');
      const btnPdf = esAdminOJefe_()
        ? '<div class="popup-actions"><button class="popup-btn" data-pdf-plan="' + c.plan_id + '" data-esc="' + c.escenario + '" data-com="' + escapeHtml_(c.comuna_nombre) + '">📄 Descargar PDF</button></div>'
        : '';
      ev.popup.setContent('<div class="popup-title">' + tituloPopup + '</div><div class="popup-row">' + c.comuna_nombre + ' · ' + c.region + '</div>' + (filas || '<div class="popup-row">Sin recursos planificados aún.</div>') + btnPdf);
      const b = document.querySelector('[data-pdf-plan="' + c.plan_id + '"]');
      if (b) b.onclick = () => generarPDFPlan_(b.dataset.pdfPlan, b.dataset.esc, b.dataset.com);
    });
    const _textoEtiq = textoEtiqueta;
    const clave = c.escenario === 'Verde' ? 'verde' : c.escenario === 'Amarilla' ? 'amarilla' : 'roja';
    const grupo = clave === 'verde' ? capaAlertaVerdeLayer : clave === 'amarilla' ? capaAlertaAmarillaLayer : capaAlertaRojaLayer;
    const arr   = clave === 'verde' ? alertaVerdeFeatureLayers : clave === 'amarilla' ? alertaAmarillaFeatureLayers : alertaRojaFeatureLayers;
    const etiqOn = !!(state.mostrarEtiquetasAlerta && state.mostrarEtiquetasAlerta[clave]);
    grupo.addLayer(capa);
    // Registrar polígonos internos en el array plano (mismo patrón que Recursos Disponibles)
    // y aplicar tooltip permanente si el 🏷️ está activo para que sobreviva recargas
    let n = 0;
    capa.eachLayer(poly => {
      n++;
      arr.push({ layer: poly, texto: _textoEtiq });
      if (etiqOn) poly.bindTooltip(_textoEtiq, { permanent: true, direction: 'center', className: 'map-label' });
    });
    if (n === 0) {
      arr.push({ layer: capa, texto: _textoEtiq });
      if (etiqOn) capa.bindTooltip(_textoEtiq, { permanent: true, direction: 'center', className: 'map-label' });
    }
    } catch (eRow) { console.warn('[alerta] fila omitida:', eRow.message, c); }
  });

  if (state.alertaLayersOn && state.alertaLayersOn.verde)   { capaAlertaVerdeLayer.addTo(map);    planificacionRecursosVerdeLayer.addTo(map); }
  if (state.alertaLayersOn && state.alertaLayersOn.amarilla) { capaAlertaAmarillaLayer.addTo(map); planificacionRecursosAmarillaLayer.addTo(map); }
  if (state.alertaLayersOn && state.alertaLayersOn.roja)     { capaAlertaRojaLayer.addTo(map);     planificacionRecursosRojaLayer.addTo(map); }
  reaplicarFiltrosAlerta_();

  // Reglas 2 y 3a: encender rutas de las comunas con alerta activa, con glow por nivel.
  encenderRutasEnAlerta_(data || []);

  if (document.querySelector('.rail-btn.active') && document.querySelector('.rail-btn.active').dataset.tab === 'capas') renderTab('capas');
}

/* Reglas 2 + 3a: por cada comuna con plan activo, enciende sus rutas de
 * patrullaje (mapeadas por id_comuna) con glow del color del nivel de alerta.
 * Capa independiente del toggle manual de patrullaje: se muestra automáticamente
 * mientras el plan esté activo. Si una comuna tiene Amarilla y Roja, gana Roja. */
async function encenderRutasEnAlerta_(comunasAlerta) {
  rutasEnAlertaLayer.clearLayers();
  if (!comunasAlerta || !comunasAlerta.length) return;

  // Nivel por comuna (id_comuna -> 'Roja' | 'Amarilla'; Roja prevalece)
  const nivelPorComuna = {};
  comunasAlerta.forEach(c => {
    if (c.id_comuna == null) return;
    const prev = nivelPorComuna[c.id_comuna];
    if (c.escenario === 'Roja' || !prev) nivelPorComuna[c.id_comuna] = c.escenario;
  });
  const idsAlerta = Object.keys(nivelPorComuna).map(Number);
  if (!idsAlerta.length) return;

  // Traer las rutas de esas comunas (enfoque numérico id_comuna). Se consulta la
  // vista directamente para no depender de que la capa de patrullaje esté cargada.
  const { data: rutas, error } = await supabaseClient
    .from('v_rutas_patrullaje')
    .select('id, nombre_ruta, km, area, comuna, id_comuna, actividad, tipo_movil, sector, geometry')
    .in('id_comuna', idsAlerta);
  if (error) { console.error('No se pudieron cargar rutas en alerta:', error); return; }

  (rutas || []).forEach(r => {
    if (!r.geometry) return;
    const nivel = nivelPorComuna[r.id_comuna];
    const color = nivel === 'Roja' ? '#EF4444' : '#F59E0B';
    const clase = nivel === 'Roja' ? 'ruta-alerta-roja' : 'ruta-alerta-amarilla';
    L.geoJSON(r.geometry, {
      style: { color, weight: 4, opacity: 0.95, className: clase },
      onEachFeature: (f, layer) => {
        layer.bindTooltip(
          '📏 ' + (r.km != null ? Number(r.km).toFixed(1) + ' km' : 's/d') + ' · ' + escapeHtml_(r.nombre_ruta || r.id),
          { sticky: true, direction: 'top', className: 'ruta-hover-tip', opacity: 1 }
        );
        layer.bindPopup(
          '<div class="popup-title">' + (nivel === 'Roja' ? '🔴' : '🟡') + ' Ruta en ' + (nivel === 'Roja' ? 'Alerta Roja' : 'Alerta Amarilla') + '</div>' +
          '<div class="popup-row">' + escapeHtml_(r.nombre_ruta || r.id) + '</div>' +
          '<div class="popup-row">Área: ' + escapeHtml_(r.area || '—') + ' · Sector: ' + escapeHtml_(r.sector || '—') + '</div>' +
          '<div class="popup-row">Comuna: ' + escapeHtml_(r.comuna || '—') + '</div>' +
          '<div class="popup-row">KM: ' + (r.km != null ? Number(r.km).toFixed(1) : '—') + ' · ' + escapeHtml_(r.actividad || '—') + '</div>'
        );
      },
    }).addTo(rutasEnAlertaLayer);
  });
}

let planifCargaToken_ = 0;   // solo dibuja la ÚLTIMA llamada (evita entidades duplicadas en el mapa)
async function loadPlanificacionRecursos_(comunaId) {
  const miCarga = ++planifCargaToken_;
  planificacionRecursosVerdeLayer.clearLayers();
  planificacionRecursosAmarillaLayer.clearLayers();
  planificacionRecursosRojaLayer.clearLayers();
  // Limpiar del array de etiquetas los recursos de planificación (dejar solo las zonas)
  [alertaVerdeFeatureLayers, alertaAmarillaFeatureLayers, alertaRojaFeatureLayers].forEach(arr => {
    for (let i = arr.length - 1; i >= 0; i--) {
      const ly = arr[i].layer;
      // Recursos de planificación: markers o figuras SIN _etiquetaTexto (las zonas SÍ tienen _etiquetaTexto)
      if (!ly._etiquetaTexto) arr.splice(i, 1);
    }
  });
  if (!comunaId) return;

  const planIds = [];
  const escenarioPorPlan = {};

  const { data: planesComuna, error: errPlanes } = await supabaseClient.from('planes_contingencia').select('id, escenario').eq('ambito', 'comuna').eq('comuna_id', comunaId);
  if (window.__DEBUG__) console.log('[DEBUG PLANIF] planes por comuna:', planesComuna, 'error:', errPlanes);
  (planesComuna || []).forEach(p => { planIds.push(p.id); escenarioPorPlan[p.id] = p.escenario; });

  if (state.modoPlanificacion && state.modoPlanificacion.ambito === 'area') {
    planIds.push(state.modoPlanificacion.planId);
    escenarioPorPlan[state.modoPlanificacion.planId] = state.modoPlanificacion.escenario;
  }
  // Filtro por área (🧭): también los planes de las OTRAS comunas del área, solo para consulta
  const otraComunaPorPlan = {};
  const otrasComunas = (state.areaFiltro && state.modoMapa === 'planificador') ? [...state.areaFiltro.ids].filter(id => id !== comunaId) : [];
  if (otrasComunas.length) {
    const { data: po } = await supabaseClient.from('planes_contingencia').select('id, escenario, comuna_id').eq('ambito', 'comuna').in('comuna_id', otrasComunas);
    (po || []).forEach(p => { planIds.push(p.id); escenarioPorPlan[p.id] = p.escenario; otraComunaPorPlan[p.id] = p.comuna_id; });
  }

  if (planIds.length === 0) return;

  const { data: recursos, error: errRecursos } = await supabaseClient
    .from('planificacion_recursos_geojson')
    .select('*, instituciones(nombre, color_hex, logo_url)')
    .in('plan_id', planIds);
  if (window.__DEBUG__) console.log('[DEBUG PLANIF] recursos encontrados:', recursos, 'error:', errRecursos);

  // Solo las entidades de la comuna activa cuentan como «su» planificación (KPI, edición, filtros)
  state.planificacionRecursos = (recursos || []).filter(r => !otraComunaPorPlan[r.plan_id]);
  window.planRecursosMarkersById = window.planRecursosMarkersById || {};
  // Recursos enlazados a rutas (SQL 79): código, tipo y estado de turno para la ventana de la ruta.
  state.recursoRefInfo = {};
  const refIds = [...new Set((recursos || []).map(r => r.recurso_ref_id).filter(Boolean))];
  if (refIds.length) {
    try {
      const { data: rinf } = await supabaseClient.from('v_planificador_recursos')
        .select('id, codigo_ref, alias, tipo_recurso, area, sector, en_turno_hoy, proximo_turno, fecha_inicio_operacion').in('id', refIds);
      (rinf || []).forEach(x => { state.recursoRefInfo[x.id] = x; });
    } catch (e) { /* solo informativo */ }
  }
  // Trazabilidad de los recursos planificados (quién creó / modificó)
  state.trazaPlanif = {};
  if (state.planificacionRecursos.length) {
    try {
      const { data: tz } = await supabaseClient.from('v_trazabilidad_planificacion').select('*').in('id', state.planificacionRecursos.map(r => r.id));
      (tz || []).forEach(t => { state.trazaPlanif[t.id] = t; });
    } catch (e) {}
  }
  // 🚦 Semáforo de propagación (SQL 117): en qué alertas está cada entidad de la comuna
  state.propagacionEsc = {};
  const planesPropios = planIds.filter(id => !otraComunaPorPlan[id]);
  if (state.planificacionRecursos.length && planesPropios.length) {
    try {
      const { data: pe, error: ePe } = await supabaseClient.rpc('propagacion_escenarios', { p_plan_ids: planesPropios });
      if (!ePe) (pe || []).forEach(x => { state.propagacionEsc[x.id] = x.escenarios || []; });
    } catch (e) { /* sin SQL 117: sin semáforo */ }
  }

  // Si mientras se consultaba empezó otra carga (p. ej. guardar + refrescar seguidos),
  // esta se descarta: si las dos dibujaran, cada ruta aparecería DOS veces.
  if (miCarga !== planifCargaToken_) return;
  planificacionRecursosVerdeLayer.clearLayers();
  planificacionRecursosAmarillaLayer.clearLayers();
  planificacionRecursosRojaLayer.clearLayers();

  // Orden de capas: se dibuja primero lo de abajo (CMPC) y al final lo de arriba
  // (Municipalidad), así en el mapa queda encima lo que encabeza la simbología.
  const rangoDe_ = r => rangoInstitucionCapa_((r.instituciones || {}).nombre);
  // Entidades de OTRAS comunas del área (filtro 🧭): subgrupo dentro de cada escenario, así se
  // encienden/apagan con su escenario pero no cuentan en KPI, simbología ni filtros de la comuna.
  const subOtras = {};
  if (Object.keys(otraComunaPorPlan).length) {
    [['Verde', planificacionRecursosVerdeLayer], ['Amarilla', planificacionRecursosAmarillaLayer], ['Roja', planificacionRecursosRojaLayer]]
      .forEach(([e, g]) => { subOtras[e] = L.layerGroup(); g.addLayer(subOtras[e]); });
  }
  (recursos || []).slice().sort((a, b) => rangoDe_(b) - rangoDe_(a)).forEach(r => {
    const inst = r.instituciones || { nombre: 'Institución', color_hex: '#64748B' };
    const escenario = escenarioPorPlan[r.plan_id];
    const otra = otraComunaPorPlan[r.plan_id] || null;   // id de la otra comuna del área, o null
    const colorEscenario = escenario === 'Verde' ? '#16A34A' : escenario === 'Amarilla' ? '#F59E0B' : '#EF4444';
    const colorInstitucion = inst.color_hex; // simbología: color propio de cada institución
    const layerDestino = otra ? subOtras[escenario] : escenario === 'Verde' ? planificacionRecursosVerdeLayer : escenario === 'Amarilla' ? planificacionRecursosAmarillaLayer : planificacionRecursosRojaLayer;
    const bloqueoCmpc = !otra && puedePlanificarEscenario_(escenario) && grdBloqueaInst_(inst);   // GRD: CMPC solo consulta
    const puedeEditar = !otra && puedePlanificarEscenario_(escenario) && !bloqueoCmpc;
    const comunaOtra = otra ? ((state.comunas || []).find(c => c.id === otra) || {}).comuna || otra : '';

    const popupHtml = otra
      ? '<div class="popup-title"><span class="pr-sw" style="background:' + colorInstitucion + ';display:inline-block;width:9px;height:9px;border-radius:3px;margin-right:6px;"></span>' + escapeHtml_(inst.nombre) +
          ' <span style="font-size:10px;">(' + (escenario === 'Verde' ? '🟢' : escenario === 'Amarilla' ? '🟡' : '🔴') + ' ' + escapeHtml_(comunaOtra) + ')</span></div>' +
        '<div class="popup-row">🏷️ ' + iconoTipoGeometria_(r.tipo_geometria) + ' · ' + escapeHtml_(r.tipo_recurso || '') + '</div>' +
        '<div class="popup-row" style="margin-top:4px;">' + escapeHtml_(r.descripcion || 'Sin descripción') + '</div>' +
        bloqueRecursoRuta_(r, escenario) +
        '<div class="popup-row" style="margin-top:6px;color:#6D28D9;font-size:11px;">🧭 Planificada en la comuna <b>' + escapeHtml_(comunaOtra) + '</b> (otra comuna del área). Para editarla, cambia a esa comuna.</div>' +
        '<div class="popup-actions"><button class="popup-btn" onclick="irAComunaArea_(\'' + escapeHtml_(otra) + '\')">📍 Ir a ' + escapeHtml_(comunaOtra) + '</button></div>'
      :
      '<div class="popup-title"><span class="pr-sw" style="background:' + colorInstitucion + ';display:inline-block;width:9px;height:9px;border-radius:3px;margin-right:6px;"></span>' + inst.nombre + ' <span style="font-size:10px;">(' + (escenario === 'Verde' ? '🟢 Planificado' : escenario === 'Amarilla' ? '🟡 Planificado' : '🔴 Planificado') + ')</span></div>' +
      '<div class="popup-row">🏷️ ' + iconoTipoGeometria_(r.tipo_geometria) + ' · ' + r.tipo_recurso + '</div>' +
      '<div class="popup-row" style="margin-top:4px;">' + escapeHtml_(r.descripcion || 'Sin descripción') + '</div>' +
      bloqueRecursoRuta_(r, escenario) +
      bloquePropagacion_(r.id, escenario) +
      bloqueTrazabilidad_(state.trazaPlanif && state.trazaPlanif[r.id]) +
      (bloqueoCmpc ? '<div class="popup-row" style="margin-top:6px;color:#B45309;font-size:11px;">🔒 Recurso de CMPC: tu perfil GRD solo lo consulta (planificas las otras instituciones).</div>' : '') +
      (puedeEditar ? '<div class="popup-actions">' +
        '<button class="popup-btn" data-action="editar-planificacion" data-id="' + r.id + '">Editar</button>' +
        ((r.tipo_geometria === 'linea' || r.tipo_geometria === 'area') ? '<button class="popup-btn" data-action="editar-forma-plan" data-id="' + r.id + '">✏️ Editar forma</button>' : '') +
        (r.tipo_geometria === 'linea' ? '<button class="popup-btn" data-action="unir-linea" data-id="' + r.id + '" data-inst="' + r.institucion_id + '" style="color:#0E7490;">🔗 Unir</button>' : '') +
        ((r.tipo_geometria === 'linea' && String(r.geom_geojson || '').indexOf('MultiLineString') !== -1)
          ? '<button class="popup-btn" data-action="separar-ruta" data-id="' + r.id + '" style="color:#B45309;">✂️ Separar</button>'
          : '') +
        (puedePropagar_()   // 17-10-2026: a las demás alertas, desde cualquier escenario (GRD: desde Amarilla)
          ? '<button class="popup-btn" data-action="propagar-entidad" data-id="' + r.id + '" data-esc="' + escenario + '" style="color:#7C3AED;">⏫ Propagar</button>'
          : '') +
        (comunasCambioRuta_().length > 1 && !(state.modoPlanificacion && state.modoPlanificacion.ambito === 'area')
          ? '<button class="popup-btn" data-action="cambiar-comuna" data-id="' + r.id + '" style="color:#0369A1;" title="Mover esta entidad (y sus copias en las otras alertas) a otra comuna">🏘️ Comuna</button>'
          : '') +
        '<button class="popup-btn" data-action="eliminar-planificacion" data-id="' + r.id + '" style="color:#DC2626;">Eliminar</button></div>' : '');

    if (r.tipo_geometria === 'linea' || r.tipo_geometria === 'area') {
      let geojson;
      try { geojson = JSON.parse(r.geom_geojson); } catch (e) { return; }
      // Se admiten geometrías simples y múltiples. Una ruta unida por un
      // vértice intermedio se guarda como MultiLineString: varios tramos que
      // se tocan en el empalme, sin repetir ningún segmento.
      const aLatLng = p => [p[1], p[0]];
      const tipoGeo = geojson.type || '';
      let latlngs;
      if (tipoGeo === 'MultiLineString') {
        latlngs = (geojson.coordinates || []).map(parte => parte.map(aLatLng));
      } else if (tipoGeo === 'MultiPolygon') {
        latlngs = (geojson.coordinates || []).map(poly => (poly[0] || []).map(aLatLng));
      } else if (r.tipo_geometria === 'area') {
        latlngs = (geojson.coordinates || []).map(anillo => anillo.map(aLatLng));
      } else {
        latlngs = (geojson.coordinates || []).map(aLatLng);
      }
      const figura = r.tipo_geometria === 'area'
        ? L.polygon(latlngs, { color: colorInstitucion, weight: 3, dashArray: '6,5', fillColor: colorInstitucion, fillOpacity: 0.18, className: puedeEditar ? 'plan-editable' : '' })
        : L.polyline(latlngs, { color: colorInstitucion, weight: 4, className: puedeEditar ? 'plan-editable' : '' });
      figura._etiquetaNombre = inst.nombre;
      figura.bindPopup(popupHtml);
      const claveEscFig = escenario === 'Verde' ? 'verde' : escenario === 'Amarilla' ? 'amarilla' : 'roja';
      const arrEtiqFig = claveEscFig === 'verde' ? alertaVerdeFeatureLayers : claveEscFig === 'amarilla' ? alertaAmarillaFeatureLayers : alertaRojaFeatureLayers;
      // Ruta CMPC del escenario Normal: punto neón según tenga o no recurso asociado
      const infoRuta = infoRecursoRutaPlan_(r, escenario);
      const textoEtiqFig = infoRuta ? puntoNeonRecursoRuta_(infoRuta) + escapeHtml_(inst.nombre) : inst.nombre;
      arrEtiqFig.push({ layer: figura, texto: textoEtiqFig });
      if (state.mostrarEtiquetasAlerta && state.mostrarEtiquetasAlerta[claveEscFig]) {
        figura.bindTooltip(textoEtiqFig, { permanent: true, direction: 'center', className: 'map-label' });
      }
      habilitarHoverEtiqueta_(figura, { institucion: inst.nombre, tipo: r.tipo_recurso, descripcion: r.descripcion, recursoRuta: infoRuta }, { direction: 'center', offset: [0, 0] });
      figura.on('popupopen', () => {
        if (otra) return;   // otra comuna del área: ventana de consulta, siempre se abre
        if (!state.modoPlanificacion && !state.editorMode) { figura.closePopup(); mostrarToast_('✏️ Activa el modo planificación para modificar.'); return; }
        bindPopupActionsPlanificacion_();
      });
      // Efecto neón al pasar el mouse (color según escenario Amarilla/Roja)
      const claseNeon = escenario === 'Verde' ? 'neon-hover-verde' : escenario === 'Amarilla' ? 'neon-hover-amarilla' : 'neon-hover-roja';
      figura.on('mouseover', () => { const el = figura.getElement && figura.getElement(); if (el) { el.classList.add(claseNeon); figura.setStyle({ weight: 5, fillOpacity: 0.32 }); } });
      figura.on('mouseout',  () => { const el = figura.getElement && figura.getElement(); if (el) { el.classList.remove(claseNeon); figura.setStyle({ weight: r.tipo_geometria === 'area' ? 3 : 4, fillOpacity: otra ? 0.08 : 0.18 }); } });
      figura._institucionId = r.institucion_id;
      figura._institucionNombre = inst.nombre;
      figura._esLinea = (r.tipo_geometria === 'linea');
      figura._escenario = escenario;   // Verde | Amarilla | Roja
      figura._tipoGeometria = r.tipo_geometria;
      figura._tipoRecurso = r.tipo_recurso || 'Sin tipo';
      figura._pertenencia = pertenenciaDeRecurso_(r);
      if (otra) {
        // Otra comuna del área: atenuada, sin edición y fuera de KPI / filtros de la comuna activa
        figura.setStyle({ opacity: 0.55, fillOpacity: 0.08, dashArray: r.tipo_geometria === 'linea' ? '10,6' : '6,5' });
        figura._otraComuna = otra;
        layerDestino.addLayer(figura);
      } else {
        figura._recursoId = r.id;
        figura._bloqueoCmpc = bloqueoCmpc;   // GRD: no se corta ni se edita
        layerDestino.addLayer(figura);
        vigilarFiltroEntidad_(figura);
        window.planRecursosMarkersById[r.id] = figura;
      }

      // Marcador con el LOGO de la institución
      //   · Líneas: se ancla en el VÉRTICE CENTRAL del trazado. El centroide
      //     puede caer fuera del recorrido cuando la línea es curva o tiene
      //     cruces, y el logo quedaba flotando lejos de la ruta.
      //   · Áreas: se mantiene el centro del bounding box, que sí queda dentro.
      // Rutas (líneas) de CMPC: sin logo al centro (15-10-2026; ya se distinguen por el punto 🟢/🔴 y su etiqueta)
      const logoFig = (r.tipo_geometria === 'linea' && esInstitucionCmpc_(inst)) ? null : logoEfectivoInstitucion_(inst);
      if (logoFig) {
        try {
          let centro;
          if (r.tipo_geometria === 'linea') {
            const puntos = figura.getLatLngs();
            // getLatLngs puede devolver un arreglo anidado en multilíneas.
            const planos = Array.isArray(puntos[0]) ? puntos[0] : puntos;
            centro = (planos && planos.length > 0)
              ? planos[Math.floor(planos.length / 2)]
              : figura.getBounds().getCenter();
          } else {
            centro = figura.getBounds().getCenter();
          }
          // Tamaño reducido respecto del original (34 px) para que no tape el trazado.
          const iconoLogo = L.divIcon({
            className: '', iconSize: [24, 24], iconAnchor: [12, 12],
            html: '<div style="width:24px;height:24px;border-radius:50%;background:#F1F5F9;border:2px solid ' + colorInstitucion + ';box-shadow:0 1px 4px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;overflow:hidden;">' +
              '<img src="' + escapeHtml_(logoFig) + '" alt="" style="width:17px;height:17px;object-fit:contain;transform:scale(' + ZOOM_LOGO_MARCADOR + ');" onerror="this.style.display=\'none\'"></div>',
          });
          const mLogo = L.marker(centro, { icon: iconoLogo, interactive: false, keyboard: false, opacity: otra ? 0.55 : 1 });
          mLogo._institucionId = r.institucion_id;
          mLogo._institucionNombre = inst.nombre;
          mLogo._esLogoDeFigura = true;
          mLogo._tipoGeometria = r.tipo_geometria;   // sigue a su figura
          if (!otra) vigilarFiltroEntidad_(mLogo);
          mLogo._tipoRecurso = r.tipo_recurso || 'Sin tipo';
          mLogo._pertenencia = pertenenciaDeRecurso_(r);
          layerDestino.addLayer(mLogo);
          figura._logoMarker = mLogo;
        } catch(e) {}
      }
      // 🚦 Semáforo de propagación sobre el mapa (SQL 117): en el primer vértice de la ruta / esquina del área
      if (!otra && state.propagacionEsc && state.propagacionEsc[r.id]) {
        try {
          const ll = figura.getLatLngs();
          const plano = Array.isArray(ll[0]) ? (Array.isArray(ll[0][0]) ? ll[0][0] : ll[0]) : ll;
          const anc = r.tipo_geometria === 'linea' ? plano[0] : figura.getBounds().getNorthWest();
          const mSem = L.marker(anc, { interactive: false, keyboard: false,
            icon: L.divIcon({ className: '', iconSize: [34, 12], iconAnchor: [17, 16], html: semaforoPropagacionHtml_(r.id, escenario, true) }) });
          mSem._esLogoDeFigura = true; mSem._institucionId = r.institucion_id; mSem._institucionNombre = inst.nombre;
          mSem._tipoGeometria = r.tipo_geometria; mSem._tipoRecurso = r.tipo_recurso || 'Sin tipo'; mSem._pertenencia = pertenenciaDeRecurso_(r);
          vigilarFiltroEntidad_(mSem);
          layerDestino.addLayer(mSem);
          figura._semaforoMarker = mSem;
        } catch (e) {}
      }
      return;
    }

    const lat = Number(r.lat), lng = Number(r.lng);
    if (isNaN(lat) || isNaN(lng)) return;
    const logoInst = logoEfectivoInstitucion_(inst);
    let icono;
    // Los PUNTOS se dibujan como pin tipo globo (gota) y no como círculo.
    // La punta inferior marca la coordenada exacta y la silueta los distingue
    // de los logos redondos que acompañan a líneas y áreas.
    // Contorno continuo con el color del escenario y logo institucional dentro.
    if (logoInst) {
      icono = L.divIcon({
        className: '', iconSize: [26, 34], iconAnchor: [13, 33], popupAnchor: [0, -30],
        html: '<div style="position:relative;width:26px;height:34px;filter:drop-shadow(0 1px 3px rgba(0,0,0,0.45));">' +
          '<svg width="26" height="34" viewBox="0 0 26 34" style="position:absolute;inset:0;z-index:1;">' +
            '<path d="M13 33 C13 33 2.5 20.5 2.5 12.5 A10.5 10.5 0 1 1 23.5 12.5 C23.5 20.5 13 33 13 33 Z" fill="#fff" stroke="' + colorEscenario + '" stroke-width="2.2"/>' +
          '</svg>' +
          '<div style="position:absolute;top:5.5px;left:6px;width:14px;height:14px;background:#F1F5F9;border-radius:50%;display:flex;align-items:center;justify-content:center;overflow:hidden;z-index:2;">' +
          '<img src="' + escapeHtml_(logoInst) + '" alt="" style="width:13px;height:13px;object-fit:contain;transform:scale(' + ZOOM_LOGO_MARCADOR + ');" onerror="this.parentElement.innerHTML=\'<div style=&quot;width:10px;height:10px;border-radius:50%;background:' + colorInstitucion + '&quot;></div>\'"></div>' +
          '</div>',
      });
    } else {
      // Sin logo cargado en la institución: globo blanco con la inicial, para
      // que el punto siga identificando a quién pertenece.
      const inicial = escapeHtml_(String(inst.nombre || '?').trim().charAt(0).toUpperCase());
      icono = L.divIcon({
        className: '', iconSize: [26, 34], iconAnchor: [13, 33], popupAnchor: [0, -30],
        html: '<svg class="plan-marker-icon" width="26" height="34" viewBox="0 0 26 34" style="filter:drop-shadow(0 1px 3px rgba(0,0,0,0.4));">' +
          '<path d="M13 33 C13 33 2.5 20.5 2.5 12.5 A10.5 10.5 0 1 1 23.5 12.5 C23.5 20.5 13 33 13 33 Z" fill="#fff" stroke="' + colorEscenario + '" stroke-width="2.2"/>' +
          '<circle cx="13" cy="12.5" r="7.5" fill="' + colorInstitucion + '"/>' +
          '<text x="13" y="16" text-anchor="middle" font-family="Inter,sans-serif" font-size="10" font-weight="700" fill="#fff">' + inicial + '</text>' +
          '</svg>',
      });
    }
    const m = L.marker([lat, lng], { icon: icono, draggable: puedeEditar && !!(state.modoPlanificacion || state.editorMode),
      zIndexOffset: (100 - rangoInstitucionCapa_(inst.nombre)) * 10 });   // orden de capas: Municipalidad arriba, CMPC abajo
    m._puedeArrastrar = puedeEditar;
    if (otra) { m.setOpacity(0.55); m._otraComuna = otra; }
    m.bindPopup(popupHtml);
    m.on('popupopen', () => {
      if (otra) return;   // otra comuna del área: ventana de consulta
      if (!state.modoPlanificacion && !state.editorMode) {
        m.closePopup();
        mostrarToast_('✏️ Activa el modo planificación para modificar.');
        return;
      }
      bindPopupActionsPlanificacion_();
    });
    if (puedeEditar) {
      m.on('dragend', async () => {
        if (!state.modoPlanificacion && !state.editorMode) {
          mostrarToast_('✏️ Activa el modo planificación para mover recursos.');
          loadPlanificacionRecursos_(state.activeComunaId);
          return;
        }
        const pos = m.getLatLng();
        // Puntos usan RPC específico (la geometría es PostGIS, no lat/lng simples)
        const { error } = await supabaseClient.rpc('mover_punto_planificacion', {
          p_id: r.id,
          p_lat: pos.lat,
          p_lng: pos.lng
        });
        if (error) {
          mostrarToast_('Error al mover: ' + error.message);
          loadPlanificacionRecursos_(state.activeComunaId);
          return;
        }
        mostrarToast_('✅ Recurso reubicado');
        const rec = (state.planificacionRecursos || []).find(x => x.id === r.id);
        if (rec) { rec.lat = pos.lat; rec.lng = pos.lng; }
      });
    }
    // Guardar referencia para activar/desactivar dragging (no las de otras comunas del área)
    if (!otra) window.planRecursosMarkersById[r.id] = m;
    // Registrar en el array de etiquetas del escenario (para toggle 🏷️)
    const claveEsc = escenario === 'Verde' ? 'verde' : escenario === 'Amarilla' ? 'amarilla' : 'roja';
    const arrEtiq = claveEsc === 'verde' ? alertaVerdeFeatureLayers : claveEsc === 'amarilla' ? alertaAmarillaFeatureLayers : alertaRojaFeatureLayers;
    arrEtiq.push({ layer: m, texto: inst.nombre });
    if (state.mostrarEtiquetasAlerta && state.mostrarEtiquetasAlerta[claveEsc]) {
      m.bindTooltip(inst.nombre, { permanent: true, interactive: true, direction: 'top', offset: [0, -14], className: 'map-label' });
    }
    habilitarHoverEtiqueta_(m, { institucion: inst.nombre, tipo: r.tipo_recurso, descripcion: r.descripcion }, { direction: 'top', offset: [0, -22] });
    activarNeonHover_(m, null, escenario === 'Verde' ? 'neon-hover-verde' : escenario === 'Amarilla' ? 'neon-hover-amarilla' : 'neon-hover-roja');
    m._institucionId = r.institucion_id;
    m._institucionNombre = inst.nombre;
    m._tipoGeometria = 'punto';
    m._tipoRecurso = r.tipo_recurso || 'Sin tipo';
    m._pertenencia = pertenenciaDeRecurso_(r);
    if (otra) layerDestino.addLayer(m);
    else {
      m._recursoId = r.id;
      layerDestino.addLayer(m);
      vigilarFiltroEntidad_(m);
    }
  }); // fin forEach recursos

  // Reaplicar los filtros visuales tras recargar las capas.
  reaplicarFiltrosAlerta_();
  // Si la influencia está encendida, se recalcula: cambió la geometría.
  if (state.influenciaVisible) refrescarInfluencia_();

  if (state.alertaLayersOn && state.alertaLayersOn.verde)   { capaAlertaVerdeLayer.addTo(map);    planificacionRecursosVerdeLayer.addTo(map); }
  if (state.alertaLayersOn && state.alertaLayersOn.amarilla) { capaAlertaAmarillaLayer.addTo(map); planificacionRecursosAmarillaLayer.addTo(map); }
  if (state.alertaLayersOn && state.alertaLayersOn.roja)     { capaAlertaRojaLayer.addTo(map);     planificacionRecursosRojaLayer.addTo(map); }
  reaplicarFiltrosAlerta_();
  // En modo planificación, las figuras editables van al frente
  if (state.modoPlanificacion) priorizarCapasEditables_('planificacion');
  enviarLimiteAlFondo_();
}

let editandoRecursoPlanId = null;

function bindPopupActionsPlanificacion_() {
  document.querySelectorAll('.popup-btn[data-action="eliminar-planificacion"]').forEach(btn => {
    btn.onclick = async () => {
      if (!confirm('¿Eliminar este recurso planificado?')) return;
      // .select() devuelve las filas realmente borradas: un DELETE bloqueado
      // por RLS responde con éxito y cero filas, sin error.
      const { data: borradas, error } = await supabaseClient
        .from('planificacion_recursos').delete().eq('id', btn.dataset.id).select('id');
      if (error) { mostrarToast_('Error: ' + error.message); return; }
      if (!borradas || borradas.length === 0) {
        mostrarToast_('🔒 No se eliminó: no tienes permisos sobre ese registro o ya no existe.');
        return;
      }
      map.closePopup();
      mostrarToast_('Eliminado.');
      loadPlanificacionRecursos_(state.activeComunaId);
    };
  });
  document.querySelectorAll('.popup-btn[data-action="editar-planificacion"]').forEach(btn => {
    btn.onclick = () => abrirEditarRecursoPlanificado_(btn.dataset.id);
  });
  document.querySelectorAll('.popup-btn[data-action="editar-forma-plan"]').forEach(btn => {
    btn.onclick = () => iniciarEdicionForma_('planificacion', btn.dataset.id);
  });
  document.querySelectorAll('.popup-btn[data-action="propagar-entidad"]').forEach(btn => {
    btn.onclick = () => propagarEntidadIndividual_(btn.dataset.id, btn.dataset.esc);
  });
  document.querySelectorAll('.popup-btn[data-action="cambiar-comuna"]').forEach(btn => {
    btn.onclick = () => cambiarComunaEntidad_(btn.dataset.id);
  });
  document.querySelectorAll('.popup-btn[data-action="unir-linea"]').forEach(btn => {
    btn.onclick = () => unirLineaPaso_(btn.dataset.id);
  });
  document.querySelectorAll('.popup-btn[data-action="separar-ruta"]').forEach(btn => {
    btn.onclick = () => separarRutaPlanificacion_(btn.dataset.id);
  });
  document.querySelectorAll('.popup-btn[data-action="calendario-recurso"]').forEach(btn => {
    btn.onclick = () => abrirCalendarioDeArea_(btn.dataset.area);
  });
}

/** Bloque de la ventana de una ruta planificada: recurso enlazado + su turno (Calendario). */
function bloqueRecursoRuta_(r, escenario) {
  if (r.tipo_geometria !== 'linea') return '';
  if (!r.recurso_ref_id) {
    return escenario === 'Verde'
      ? '<div class="popup-row" style="opacity:.65;font-size:11px;">🔗 Sin recurso asociado · se asigna en <b>Editar</b></div>'
      : '';
  }
  const i = (state.recursoRefInfo || {})[r.recurso_ref_id] || {};
  // Referencia = «Clave radial · ID» (SQL 91: recurso_ref_clave / recurso_ref_codigo)
  const codigo = claveIdTexto_(i.alias || r.recurso_ref_clave, i.codigo_ref || r.recurso_ref_codigo) || 'Recurso';
  const tipo = i.tipo_recurso || r.recurso_ref_tipo || '';
  const turno = i.en_turno_hoy
    ? '<span style="color:#16A34A;font-weight:700;">🟢 En turno hoy</span>'
    : '<span style="opacity:.75;">⚪ Sin turno hoy' + (i.proximo_turno ? ' · próximo ' + plFechaCorta_(i.proximo_turno) : '') + '</span>';
  return '<div class="popup-row" style="margin-top:4px;padding:5px 7px;border-radius:7px;background:rgba(37,99,235,.08);">' +
    '🔗 <b>' + escapeHtml_(codigo) + '</b> · ' + escapeHtml_(aTitulo_(tipo)) +
    (escenario !== 'Verde' ? ' <span style="opacity:.6;font-size:10px;">(heredado de Normal)</span>' : '') + '<br>' + turno +
    (puedeGestionarTurnos_() && i.area
      ? ' <button class="popup-btn" data-action="calendario-recurso" data-area="' + escapeHtml_(i.area) + '" style="padding:1px 6px;font-size:10px;">📅 Calendario</button>'
      : '') +
    '</div>';
}

/** Abre el Calendario de Turnos en el área indicada (nombres con o sin tilde). */
function abrirCalendarioDeArea_(area) {
  const areas = state.perfil.perfil === 'Administrador' ? (state.areasCatalogo || []) : (state.misAreasIds || []);
  const igual = areas.find(a => plNorm_(a) === plNorm_(area));
  if (igual) state.turnosArea = igual;
  map.closePopup();
  mostrarVista_('turnos');
}

