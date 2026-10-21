/* ============ AMEBAS DE INCENDIOS Y KPI SOBRE LA OCURRENCIA ============
 * Una "ameba" es la unión de círculos alrededor de cada foco histórico:
 * representa el territorio donde de verdad se producen incendios.
 *
 * Se calculan tres niveles según cuántas temporadas se consideren:
 *   N1 -> la última temporada
 *   N2 -> las tres últimas
 *   N3 -> las cinco últimas
 *
 * El KPI resultante es más exigente que el porcentaje de comuna copada:
 * se puede cubrir mucho territorio y aun así dejar fuera la zona donde
 * históricamente se quema. Ese es el dato que importa.
 *
 * Los focos llegan por Edge Function, no por tabla, así que las
 * coordenadas se envían desde aquí a PostGIS, que hace el buffer
 * geodésico, la unión y el cruce con las áreas de influencia.
 */
const BUFFER_AMEBA_M = 500;    // radio alrededor de cada foco

const NIVELES_AMEBA = [
  { id: 'n1', temporadas: 1, etiqueta: 'Ameba 1 temporada',   color: '#F97316' },
  { id: 'n2', temporadas: 3, etiqueta: 'Ameba 3 temporadas',  color: '#DC2626' },
  { id: 'n3', temporadas: 5, etiqueta: 'Ameba 5 temporadas',  color: '#7F1D1D' },
];

const amebaLayers = { n1: L.layerGroup(), n2: L.layerGroup(), n3: L.layerGroup() };
state.amebaVisible = state.amebaVisible || { n1: false, n2: false, n3: false };
state.amebaDatos = state.amebaDatos || {};        // { n1: {area_km2, pct_comuna, focos} }
state.amebaKpi = state.amebaKpi || {};            // { n1: [{escenario, pct_ameba, ...}] }
state.amebaCargando = state.amebaCargando || {};

/** Temporadas ordenadas de la más reciente a la más antigua. */
function temporadasOrdenadas_() {
  // Las de la COMUNA (no las del margen de 10 km del mapa): la ameba es comunal.
  return (state.temporadasComuna || state.temporadasDetectadas || [])
    .filter(t => t && t !== 'Sin clasificar')
    .slice()
    .sort()
    .reverse();
}

/** Focos acumulados de las N temporadas más recientes. */
function focosDeUltimasTemporadas_(n) {
  const temporadas = temporadasOrdenadas_().slice(0, n);
  const puntos = [];
  temporadas.forEach(t => {
    (state.focosPorTemporada[t] || []).forEach(p => puntos.push([p[0], p[1]]));
  });
  return { puntos, temporadas };
}

async function cargarAmeba_(nivel) {
  const cfg = NIVELES_AMEBA.find(x => x.id === nivel);
  if (!cfg || !state.activeComunaId) return;

  const capa = amebaLayers[nivel];
  capa.clearLayers();

  const comunaSolicitada = String(state.activeComunaId);
  const { puntos, temporadas } = focosDeUltimasTemporadas_(cfg.temporadas);

  state.amebaCargando[nivel] = true;
  try {
    // Primera llamada SIN los focos: la ameba es histórica y suele estar ya
    // guardada en la base. Solo si no existe o quedó obsoleta se vuelve a
    // llamar enviando las coordenadas, que pueden ser miles.
    const args = {
      p_comuna_id: String(state.activeComunaId),
      p_nivel: cfg.temporadas,
      p_temporadas: temporadas,
      p_buffer_m: BUFFER_AMEBA_M,
    };

    let { data, error } = await supabaseClient.rpc('obtener_ameba_incendios', args);
    if (error) { console.error('obtener_ameba_incendios:', error.message); return; }

    let fila = (data && data[0]) ? data[0] : null;

    if (fila && fila.requiere_calculo) {
      if (puntos.length === 0) {
        state.amebaDatos[nivel] = { area_km2: 0, pct_comuna: null, focos: 0, temporadas: [] };
        return;
      }
      mostrarToast_('🔥 Calculando por primera vez la zona de ocurrencia (' + puntos.length + ' focos)…');
      const r2 = await supabaseClient.rpc('obtener_ameba_incendios',
        Object.assign({}, args, { p_puntos: puntos }));
      if (r2.error) { console.error('obtener_ameba_incendios (cálculo):', r2.error.message); return; }
      fila = (r2.data && r2.data[0]) ? r2.data[0] : null;
    }

    if (!fila) return;
    if (String(state.activeComunaId) !== comunaSolicitada) return;   // cambió de comuna

    state.amebaDatos[nivel] = {
      area_km2: Number(fila.area_km2) || 0,
      pct_comuna: fila.pct_comuna,
      focos: Number(fila.focos) || 0,
      temporadas: fila.temporadas || temporadas,
      desdeCache: !!fila.desde_cache,
      calculadaEn: fila.calculada_en,
    };

    if (fila.geojson) {
      let geo;
      try { geo = JSON.parse(fila.geojson); } catch (e) { geo = null; }
      if (geo) {
        L.geoJSON(geo, {
          style: { color: cfg.color, weight: 2, opacity: 0.9, fillColor: cfg.color, fillOpacity: 0.14, dashArray: '2,5', className: 'ameba-latido ameba-' + (cfg.temporadas === 1 ? 'n1' : cfg.temporadas === 3 ? 'n3' : 'n5') },
          interactive: false,
        }).addTo(capa);
      }
    }

    // El KPI sí se recalcula siempre: la planificación cambia. Es liviano
    // porque cruza contra la ameba ya guardada.
    const kpi = await supabaseClient.rpc('kpi_copamiento_ameba', {
      p_comuna_id: String(state.activeComunaId),
      p_nivel: cfg.temporadas,
      p_buffer_influencia_m: BUFFER_INFLUENCIA_M,
    });
    if (!kpi.error) state.amebaKpi[nivel] = kpi.data || [];
    else console.error('kpi_copamiento_ameba:', kpi.error.message);
  } finally {
    state.amebaCargando[nivel] = false;
  }
}

async function toggleAmeba_(nivel) {
  // Evita dobles clics mientras se está calculando.
  if (state.amebaCargando[nivel]) {
    mostrarToast_('⏳ La zona de ocurrencia se está calculando…');
    return;
  }

  const encender = !state.amebaVisible[nivel];
  state.amebaVisible[nivel] = encender;

  // Respuesta visual inmediata: la casilla no espera al cálculo.
  pintarEstadoAmeba_(nivel, encender, encender);

  if (!encender) {
    if (map.hasLayer(amebaLayers[nivel])) map.removeLayer(amebaLayers[nivel]);
    pintarEstadoAmeba_(nivel, false, false);
    return;
  }

  // Si la geometría ya está en memoria, se muestra sin volver a pedirla.
  const yaCargada = amebaLayers[nivel].getLayers().length > 0 && state.amebaDatos[nivel];
  if (!yaCargada) await cargarAmeba_(nivel);

  // El usuario pudo apagarla mientras se calculaba.
  if (!state.amebaVisible[nivel]) { pintarEstadoAmeba_(nivel, false, false); return; }

  amebaLayers[nivel].addTo(map);
  amebaLayers[nivel].bringToBack();
  pintarEstadoAmeba_(nivel, true, false);

  const d = state.amebaDatos[nivel];
  if (d && d.focos > 0) {
    const kpi = (state.amebaKpi[nivel] || []).map(k => etiquetaEscenario_(k.escenario) + ' ' + k.pct_ameba + '%').join(' · ');
    mostrarToast_('🔥 ' + d.focos + ' focos · ' + d.area_km2 + ' km²' +
      (d.pct_comuna != null ? ' (' + d.pct_comuna + '% de la comuna)' : '') +
      (kpi ? '  |  Copado: ' + kpi : '') +
      (d.desdeCache ? '  ·  guardada' : ''));
  } else {
    mostrarToast_('⚠️ No hay focos cargados para esas temporadas en esta comuna.');
    state.amebaVisible[nivel] = false;
    pintarEstadoAmeba_(nivel, false, false);
  }
}

/* Actualiza la fila sin repintar todo el panel.
 * Repintar con renderTab reconstruye el árbol completo, pierde el scroll y
 * cierra los nodos desplegados; para un interruptor eso es desproporcionado. */
function pintarEstadoAmeba_(nivel, activo, cargando) {
  // El cuadro "Copamiento sobre incendios" destaca la columna de la ameba encendida.
  if (state.kpiIncendiosVisible && !state.kpiIncendiosCargando) renderKpiIncendios_();
  const chk = document.querySelector('[data-ameba="' + nivel + '"]');
  if (!chk) return;
  chk.classList.toggle('on', !!activo);

  const fila = chk.closest('.tree-row');
  if (!fila) return;
  const contador = fila.querySelector('.tree-count');
  if (!contador) return;

  if (cargando) { contador.textContent = 'calculando…'; return; }

  const cfg = NIVELES_AMEBA.find(x => x.temporadas === nivelATemporadas_(nivel));
  const d = state.amebaDatos[nivel];
  const kpi = state.amebaKpi[nivel] || [];
  const roja = kpi.find(k => k.escenario === 'Roja');
  contador.textContent = (d && d.focos > 0)
    ? d.area_km2 + ' km²' + (roja ? ' · ' + roja.pct_ameba + '%' : '')
    : (temporadasOrdenadas_().length > 0 ? '—' : 'sin datos');
}

function nivelATemporadas_(nivel) {
  const cfg = NIVELES_AMEBA.find(x => x.id === nivel);
  return cfg ? cfg.temporadas : 0;
}

/* ============ SEGUNDO NIVEL DE COPAMIENTO: SOBRE INCENDIOS ============
 * El primer nivel mide qué porcentaje de la COMUNA está copado.
 * Este mide algo más exigente: qué porcentaje de la ZONA DONDE
 * HISTÓRICAMENTE SE QUEMA está cubierto por los recursos de cada alerta.
 *
 * Es el cruce entre dos superficies que ya se calculan por separado:
 *   · áreas de influencia de los recursos, por escenario (500 m)
 *   · amebas de ocurrencia de incendios, por ventana histórica (500 m)
 *
 * Se presenta como una matriz de 3 escenarios por 3 ventanas: última
 * temporada, tres temporadas y quinquenio.
 */
state.kpiIncendiosVisible = state.kpiIncendiosVisible || false;
state.kpiIncendiosCargando = false;

async function cargarKpiIncendios_() {
  if (!state.activeComunaId) return;
  state.kpiIncendiosCargando = true;
  renderKpiIncendios_();

  try {
    // Cada ameba se asegura primero: si ya está guardada en la base, la
    // llamada es inmediata; si no, se calcula una vez y queda persistida.
    for (const cfg of NIVELES_AMEBA) {
      if (!state.amebaDatos[cfg.id] || !state.amebaKpi[cfg.id]) {
        await cargarAmeba_(cfg.id);
      } else {
        // La ameba no cambia, pero la planificación sí: el KPI se refresca.
        await recalcularKpiAmebaVisible_(cfg);
      }
    }
  } catch (e) {
    console.error('cargarKpiIncendios_:', e);
  } finally {
    state.kpiIncendiosCargando = false;
    renderKpiIncendios_();
  }
}

/* Recalcula el KPI de una ameba escenario por escenario, usando solo las
 * entidades visibles. Es la versión dinámica: refleja los filtros activos. */
async function recalcularKpiAmebaVisible_(cfg) {
  const ids = idsVisiblesPorEscenario_();
  const filas = [];

  for (const esc of ['Verde', 'Amarilla', 'Roja']) {
    const lista = ids[esc] || [];
    if (lista.length === 0) {
      const base = (state.amebaDatos[cfg.id] || {}).area_km2 || 0;
      filas.push({ escenario: esc, ameba_km2: base, copado_km2: 0, pct_ameba: 0, sin_cubrir_km2: base });
      continue;
    }
    const { data, error } = await supabaseClient.rpc('kpi_ameba_ids', {
      p_comuna_id: String(state.activeComunaId),
      p_nivel: cfg.temporadas,
      p_ids: lista,
      p_buffer_m: BUFFER_INFLUENCIA_M,
    });
    if (error) { console.error('kpi_ameba_ids:', error.message); continue; }
    const f = (data && data[0]) ? data[0] : null;
    filas.push({
      escenario: esc,
      ameba_km2: f ? f.ameba_km2 : 0,
      copado_km2: f ? f.copado_km2 : 0,
      pct_ameba: f ? f.pct_ameba : 0,
      sin_cubrir_km2: f ? f.sin_cubrir_km2 : 0,
    });
  }

  state.amebaKpi[cfg.id] = filas;
}

function renderKpiIncendios_() {
  const cont = document.getElementById('kpi-incendios-cuerpo');
  if (!cont) return;

  if (!state.kpiIncendiosVisible) { cont.style.display = 'none'; cont.innerHTML = ''; return; }
  cont.style.display = '';
  cont.style.borderTop = 'none';   // ahora va solo (los conteos se ocultan en modo Incendios)

  if (state.kpiIncendiosCargando) {
    cont.innerHTML = '<div style="padding:7px 0;font-size:10px;opacity:.7;">Calculando copamiento sobre incendios…</div>';
    setTimeout(alinearResumenConSimbologia_, 0);
    return;
  }

  const escenarios = [
    { esc: 'Verde',    color: '#22C55E' },
    { esc: 'Amarilla', color: '#F59E0B' },
    { esc: 'Roja',     color: '#EF4444' },
  ];

  const hayDatos = NIVELES_AMEBA.some(cfg => (state.amebaKpi[cfg.id] || []).length > 0);
  if (!hayDatos) {
    cont.innerHTML = '<div style="padding:7px 0;font-size:10px;opacity:.7;">' +
      'Sin zona de ocurrencia calculada para esta comuna.</div>';
    setTimeout(alinearResumenConSimbologia_, 0);
    return;
  }

  // Color de fondo según el nivel de cobertura, para leer la matriz de un vistazo.
  const tinte = (v) => {
    if (v == null) return 'transparent';
    if (v >= 75) return 'rgba(34,197,94,0.28)';
    if (v >= 50) return 'rgba(245,158,11,0.26)';
    if (v >= 25) return 'rgba(249,115,22,0.26)';
    return 'rgba(239,68,68,0.26)';
  };

  let html = '<div style="font-size:10px;font-weight:600;opacity:.75;margin:2px 0 5px;">🔥 Copamiento sobre incendios</div>';

  // Cabecera con las tres ventanas históricas; la ameba encendida en el mapa, destacada.
  html += '<div style="display:flex;align-items:center;gap:4px;font-size:9px;margin-bottom:3px;">' +
    '<span style="width:58px;flex-shrink:0;"></span>' +
    NIVELES_AMEBA.map(cfg => {
      const on = state.amebaVisible && state.amebaVisible[cfg.id];
      return '<span style="flex:1;text-align:center;' + (on ? 'opacity:1;font-weight:800;color:#FDBA74;' : 'opacity:.6;') + '">' +
        cfg.temporadas + ' temp.</span>';
    }).join('') +
    '</div>';

  // Escenario encendido en el mapa = fila destacada con efecto onda (como en los conteos).
  const claveEsc = { Verde: 'verde', Amarilla: 'amarilla', Roja: 'roja' };
  const escActivo = (esc) => !!(state.alertaLayersOn && state.alertaLayersOn[claveEsc[esc]]);

  html += escenarios.map(e => {
    const celdas = NIVELES_AMEBA.map(cfg => {
      const fila = (state.amebaKpi[cfg.id] || []).find(k => k.escenario === e.esc);
      const v = fila && fila.pct_ameba != null ? Number(fila.pct_ameba) : null;
      const titulo = fila
        ? etiquetaEscenario_(e.esc) + ' · ' + cfg.temporadas + ' temporada(s): ' + fila.copado_km2 +
          ' de ' + fila.ameba_km2 + ' km² cubiertos, ' + fila.sin_cubrir_km2 + ' km² sin cubrir'
        : '';
      return '<span title="' + titulo + '" style="flex:1;text-align:center;padding:3px 0;border-radius:4px;' +
        'background:' + tinte(v) + ';font-variant-numeric:tabular-nums;font-weight:700;font-size:10px;">' +
        (v != null ? v.toFixed(0) + '%' : '—') + '</span>';
    }).join('');

    const activa = escActivo(e.esc);
    return '<div class="kpi-inc-fila' + (activa ? ' activa' : '') + '" style="--fila-color:' + e.color + ';display:flex;align-items:center;gap:4px;">' +
      '<span style="width:58px;flex-shrink:0;font-size:10px;display:flex;align-items:center;gap:6px;color:' + e.color + ';">' +
        '<span class="' + (activa ? 'res-radar' : 'res-punto') + '"></span>' +
        '<span class="kpi-inc-nombre" style="color:#fff;opacity:.85;">' + etiquetaEscenario_(e.esc) + '</span></span>' +
      celdas +
    '</div>';
  }).join('');

  html += '<div style="margin-top:6px;font-size:9px;opacity:.5;">% de la zona de ocurrencia cubierta por los recursos</div>';

  cont.innerHTML = html;
  setTimeout(alinearResumenConSimbologia_, 0);
}

async function toggleKpiIncendios_() {
  state.kpiIncendiosVisible = !state.kpiIncendiosVisible;
  const btn = document.getElementById('btn-kpi-incendios');
  if (btn) btn.classList.toggle('active', state.kpiIncendiosVisible);

  // Cambia qué muestra el cuadro (conteos ↔ solo incendios): se re-renderiza entero.
  renderResumenAlertas_();
  if (state.kpiIncendiosVisible) await cargarKpiIncendios_();
  else renderKpiIncendios_();
  renderResumenAlertas_();
  setTimeout(alinearResumenConSimbologia_, 0);
}

/* ============ NOMBRE VISIBLE DE LOS ESCENARIOS ============
 * El valor interno sigue siendo 'Verde' | 'Amarilla' | 'Roja' (BD, RPC, capas).
 * Solo cambia lo que se MUESTRA: el escenario Verde no es una alerta, es "Normal".
 *   etiquetaEscenario_ -> 'Normal' | 'Amarilla' | 'Roja'              (corto)
 *   nombreEscenario_   -> 'Normal' | 'Alerta Amarilla' | 'Alerta Roja' (largo) */
function etiquetaEscenario_(esc) {
  return esc === 'Verde' ? 'Normal' : (esc || '');
}
function nombreEscenario_(esc) {
  return esc === 'Verde' ? 'Normal' : 'Alerta ' + (esc || '');
}
/** Los mensajes de las RPC de propagación traen 'Verde' en el texto: se traducen al mostrarlos. */
function textoEscenariosServidor_(s) {
  return String(s == null ? '' : s).replace(/Alerta Verde/g, 'Normal').replace(/\bVerde\b/g, 'Normal');
}

/* ============ EXPORTAR UN PLAN DE ALERTA ============
 * Descarga todas las entidades planificadas de un escenario en la comuna
 * activa, en dos formatos:
 *   · GeoJSON -> para QGIS, ArcGIS y cualquier sistema GIS.
 *   · KML     -> para Google Earth, con un color por institución.
 *
 * Se genera en el navegador a partir de la vista geojson, sin funciones
 * nuevas en la base.
 */
state.exportarDatos = null;

function abrirExportarPlan_() {
  const panel = document.getElementById('planificar-panel');
  if (panel) panel.classList.remove('show');

  if (!state.activeComunaId) { mostrarToast_('⚠️ Selecciona una comuna primero.'); return; }

  document.getElementById('exportar-comuna').textContent = nombreComuna_(state.activeComunaId);
  document.getElementById('exportar-error').classList.remove('show');

  // Conteo por escenario, a partir de lo que ya está cargado en el mapa.
  const conteo = contarRecursosPorAlerta_();
  ['Verde', 'Amarilla', 'Roja'].forEach(esc => {
    const el = document.getElementById('exp-n-' + esc.toLowerCase());
    if (el) el.textContent = (conteo[esc] ? conteo[esc].total : 0) + ' entidades';
  });

  document.getElementById('exportar-overlay').classList.add('show');
}

function escenarioExportSeleccionado_() {
  const r = document.querySelector('input[name="exp-esc"]:checked');
  return r ? r.value : 'Amarilla';
}

/** Trae del servidor las entidades del plan indicado. */
async function datosPlanParaExportar_(escenario) {
  const { data: planes, error: errPlanes } = await supabaseClient
    .from('planes_contingencia')
    .select('id, escenario')
    .eq('ambito', 'comuna')
    .eq('comuna_id', state.activeComunaId);
  if (errPlanes) throw new Error(errPlanes.message);

  const plan = (planes || []).find(p => p.escenario === escenario);
  if (!plan) throw new Error('No existe un plan ' + nombreEscenario_(escenario) + ' en esta comuna.');

  const { data, error } = await supabaseClient
    .from('planificacion_recursos_geojson')
    .select('id, tipo_recurso, tipo_geometria, descripcion, geom_geojson, institucion_id, instituciones(nombre, color_hex)')
    .eq('plan_id', plan.id);
  if (error) throw new Error(error.message);

  const soloLineas = document.getElementById('exp-solo-lineas').checked;
  const filas = (data || []).filter(r => r.geom_geojson && (!soloLineas || r.tipo_geometria === 'linea'));
  if (filas.length === 0) throw new Error('El plan no tiene entidades que exportar con ese criterio.');

  return { filas, escenario, comuna: nombreComuna_(state.activeComunaId) };
}

function nombreArchivoPlan_(escenario, ext) {
  const comuna = String(nombreComuna_(state.activeComunaId) || 'comuna')
    .replace(/[^A-Za-zÁÉÍÓÚÑáéíóúñ0-9]+/g, '_');
  const fecha = new Date().toISOString().slice(0, 10);
  return 'plan_' + etiquetaEscenario_(escenario).toLowerCase() + '_' + comuna + '_' + fecha + '.' + ext;
}

async function exportarPlanGeoJSON_() {
  const esc = escenarioExportSeleccionado_();
  const err = document.getElementById('exportar-error');
  try {
    const { filas, comuna } = await datosPlanParaExportar_(esc);

    const features = filas.map(r => {
      let geom = null;
      try { geom = JSON.parse(r.geom_geojson); } catch (e) { return null; }
      if (!geom) return null;
      const inst = r.instituciones || {};
      return {
        type: 'Feature',
        geometry: geom,
        properties: {
          id: r.id,
          institucion: inst.nombre || 'Sin institución',
          color: inst.color_hex || '#64748B',
          tipo_recurso: r.tipo_recurso || '',
          tipo_geometria: r.tipo_geometria || '',
          descripcion: r.descripcion || '',
          escenario: etiquetaEscenario_(esc),
          comuna: comuna,
        },
      };
    }).filter(Boolean);

    const fc = {
      type: 'FeatureCollection',
      name: 'Plan ' + nombreEscenario_(esc) + ' — ' + comuna,
      crs: { type: 'name', properties: { name: 'urn:ogc:def:crs:OGC:1.3:CRS84' } },
      features,
    };

    descargarArchivo_(JSON.stringify(fc, null, 2), nombreArchivoPlan_(esc, 'geojson'),
      'application/geo+json;charset=utf-8');
    document.getElementById('exportar-overlay').classList.remove('show');
    mostrarToast_('⬇️ ' + features.length + ' entidad(es) exportadas en GeoJSON.');
  } catch (e) {
    err.textContent = e.message;
    err.classList.add('show');
  }
}

/** #RRGGBB -> AABBGGRR, que es el orden que usa KML. */
function colorKml_(hex, alfa) {
  const h = String(hex || '#64748B').replace('#', '');
  const rr = h.slice(0, 2) || '64', gg = h.slice(2, 4) || '74', bb = h.slice(4, 6) || '8B';
  return (alfa || 'ff') + bb + gg + rr;
}

async function exportarPlanKML_() {
  const esc = escenarioExportSeleccionado_();
  const err = document.getElementById('exportar-error');
  try {
    const { filas, comuna } = await datosPlanParaExportar_(esc);

    // Un estilo por institución: en Google Earth se distinguen por color.
    const instituciones = {};
    filas.forEach(r => {
      const inst = r.instituciones || {};
      const nom = inst.nombre || 'Sin institución';
      if (!instituciones[nom]) instituciones[nom] = inst.color_hex || '#64748B';
    });

    const idEstilo = (nom) => 'est_' + String(nom).replace(/[^A-Za-z0-9]/g, '_');

    let kml = '<?xml version="1.0" encoding="UTF-8"?>\\n' +
      '<kml xmlns="http://www.opengis.net/kml/2.2"><Document>\\n' +
      '<name>' + escapeHtml_('Plan ' + nombreEscenario_(esc) + ' — ' + comuna) + '</name>\\n' +
      '<description>' + escapeHtml_('SIG Copamiento Territorial · ' +
        new Date().toLocaleDateString('es-CL')) + '</description>\\n';

    Object.keys(instituciones).forEach(nom => {
      const c = colorKml_(instituciones[nom]);
      kml += '<Style id="' + idEstilo(nom) + '">' +
        '<LineStyle><color>' + c + '</color><width>3</width></LineStyle>' +
        '<PolyStyle><color>' + colorKml_(instituciones[nom], '66') + '</color></PolyStyle>' +
        '<IconStyle><color>' + c + '</color><scale>1.1</scale></IconStyle>' +
        '</Style>\\n';
    });

    // Una carpeta por institución, para poder encender y apagar en Earth.
    Object.keys(instituciones).forEach(nom => {
      const suyas = filas.filter(r => (r.instituciones && r.instituciones.nombre || 'Sin institución') === nom);
      kml += '<Folder><name>' + escapeHtml_(nom) + '</name>\\n';

      suyas.forEach(r => {
        let geom = null;
        try { geom = JSON.parse(r.geom_geojson); } catch (e) { return; }
        if (!geom) return;

        const titulo = (r.tipo_recurso || 'Recurso') +
          (r.descripcion ? ' · ' + r.descripcion : '');

        kml += '<Placemark><name>' + escapeHtml_(titulo.slice(0, 120)) + '</name>' +
          '<styleUrl>#' + idEstilo(nom) + '</styleUrl>' +
          '<description><![CDATA[' +
            '<b>Institución:</b> ' + escapeHtml_(nom) + '<br>' +
            '<b>Tipo:</b> ' + escapeHtml_(r.tipo_recurso || '—') + '<br>' +
            '<b>Escenario:</b> ' + nombreEscenario_(esc) + '<br>' +
            (r.descripcion ? '<b>Descripción:</b> ' + escapeHtml_(r.descripcion) : '') +
          ']]></description>' +
          geometriaKml_(geom) +
          '</Placemark>\\n';
      });

      kml += '</Folder>\\n';
    });

    kml += '</Document></kml>';

    descargarArchivo_(kml, nombreArchivoPlan_(esc, 'kml'),
      'application/vnd.google-earth.kml+xml;charset=utf-8');
    document.getElementById('exportar-overlay').classList.remove('show');
    mostrarToast_('🌍 ' + filas.length + ' entidad(es) exportadas en KML.');
  } catch (e) {
    err.textContent = e.message;
    err.classList.add('show');
  }
}

/** Convierte una geometría GeoJSON al fragmento KML equivalente. */
function geometriaKml_(g) {
  const coords = (arr) => arr.map(c => c[0] + ',' + c[1] + ',0').join(' ');

  if (g.type === 'Point') {
    return '<Point><coordinates>' + g.coordinates[0] + ',' + g.coordinates[1] + ',0</coordinates></Point>';
  }
  if (g.type === 'LineString') {
    return '<LineString><tessellate>1</tessellate><coordinates>' + coords(g.coordinates) + '</coordinates></LineString>';
  }
  if (g.type === 'MultiLineString') {
    return '<MultiGeometry>' + g.coordinates.map(parte =>
      '<LineString><tessellate>1</tessellate><coordinates>' + coords(parte) + '</coordinates></LineString>'
    ).join('') + '</MultiGeometry>';
  }
  if (g.type === 'Polygon') {
    return '<Polygon><outerBoundaryIs><LinearRing><coordinates>' +
      coords(g.coordinates[0]) + '</coordinates></LinearRing></outerBoundaryIs></Polygon>';
  }
  if (g.type === 'MultiPolygon') {
    return '<MultiGeometry>' + g.coordinates.map(poly =>
      '<Polygon><outerBoundaryIs><LinearRing><coordinates>' +
      coords(poly[0]) + '</coordinates></LinearRing></outerBoundaryIs></Polygon>'
    ).join('') + '</MultiGeometry>';
  }
  return '';
}

function renderResumenAlertas_() {
  const panel = document.getElementById('resumen-alertas');
  const cuerpo = document.getElementById('resumen-alertas-cuerpo');
  if (!panel || !cuerpo) return;

  // Sigue la misma dinámica que la simbología: si ese panel no está visible,
  // este tampoco. Son dos piezas del mismo bloque de la esquina.
  const simb = document.getElementById('simbologia-flotante');
  const simbVisible = !!(simb
    && simb.style.display !== 'none'
    && simb.offsetParent !== null
    && simb.offsetHeight > 0);
  if (!simbVisible) {
    panel.style.display = 'none';
    const kpiCont = document.getElementById('kpi-incendios-cuerpo');
    if (kpiCont) kpiCont.style.display = 'none';
    return;
  }

  const conteo = contarRecursosPorAlerta_();
  const total = conteo.Verde.total + conteo.Amarilla.total + conteo.Roja.total;
  if (total === 0) { panel.style.display = 'none'; return; }
  panel.style.display = '';

  const filas = [
    { esc: 'Verde',    clave: 'verde',    color: '#22C55E' },
    { esc: 'Amarilla', clave: 'amarilla', color: '#F59E0B' },
    { esc: 'Roja',     clave: 'roja',     color: '#EF4444' },
  ];

  // 06-10-2026: se quitaron los conteos de entidades y su "% respecto a Roja"
  // (confundían y no aportaban). El cuadro muestra solo los botones de cálculo;
  // los datos aparecen al activar 🎯 Influencia o 🔥 Incendios.
  const activo = (clave) => !!(state.alertaLayersOn && state.alertaLayersOn[clave]);
  const botones = panel.querySelector('.ra-botones');

  setTimeout(alinearResumenConSimbologia_, 0);

  if (state.resumenAlertasColapsado) {
    const kpiCont = document.getElementById('kpi-incendios-cuerpo');
    if (kpiCont) kpiCont.style.display = 'none';
    if (botones) botones.style.display = 'none';
    cuerpo.innerHTML = '';
    cuerpo.style.display = 'none';
    return;
  }
  if (botones) botones.style.display = '';

  // Con 🔥 Incendios activo se muestra SOLO el copamiento sobre incendios
  // (los conteos de arriba se ocultan para no mezclar números).
  if (state.kpiIncendiosVisible) {
    cuerpo.innerHTML = '';
    cuerpo.style.display = 'none';
    renderKpiIncendios_();
    return;
  }
  // 🎯 Influencia: % del territorio comunal copado (áreas de influencia de 500 m).
  if (state.influenciaVisible) {
    cuerpo.style.display = '';
    cuerpo.innerHTML = '<div style="font-size:10px;font-weight:600;opacity:.75;margin:2px 0 2px;">🎯 Territorio comunal copado</div>' +
      filas.map(f => {
        const cop = state.copamiento[f.esc];
        const tiene = cop && cop.pct != null;
        const titulo = tiene ? 'Territorio copado: ' + Number(cop.pct).toFixed(1) + '% de la comuna (' + cop.area_km2 + ' km²)' : '';
        return '<div title="' + titulo + '" style="display:flex;align-items:center;gap:7px;margin-top:6px;white-space:nowrap;color:' + f.color + ';">' +
          '<span class="' + (activo(f.clave) ? 'res-radar' : 'res-punto') + '"></span>' +
          '<span style="flex:1;min-width:60px;font-size:10.5px;color:#fff;opacity:.85;">' + etiquetaEscenario_(f.esc) + '</span>' +
          '<span style="text-align:right;font-weight:700;font-variant-numeric:tabular-nums;color:#fff;">' +
            (tiene ? Number(cop.pct).toFixed(1) + '%' : '—') + '</span>' +
        '</div>';
      }).join('') +
      '<div style="margin-top:6px;font-size:9.5px;opacity:.5;color:#fff;">% de la comuna copada · influencia 500 m</div>';
  } else {
    // Ningún cálculo activo: solo el título y los botones.
    cuerpo.innerHTML = '';
    cuerpo.style.display = 'none';
  }

  renderKpiIncendios_();
}

function toggleResumenAlertas_() {
  state.resumenAlertasColapsado = !state.resumenAlertasColapsado;
  const btn = document.getElementById('btn-resumen-alertas-toggle');
  if (btn) btn.textContent = state.resumenAlertasColapsado ? '▸' : '▾';
  renderResumenAlertas_();
  setTimeout(alinearResumenConSimbologia_, 60);
}

/* Reaplica los filtros visuales de las capas de alerta.
 *
 * Es necesario llamarlo cada vez que una capa se agrega al mapa: Leaflet
 * reconstruye los elementos del DOM al reinsertar un layerGroup, y con eso
 * se pierde el display:none que aplica el filtro por institución. Sin esto,
 * al cambiar de nivel de alerta reaparecían todas las instituciones.
 *
 * El doble llamado (inmediato y diferido) cubre el caso en que Leaflet aún
 * no ha creado los elementos en el momento de la invocación.
 */
function reaplicarFiltrosAlerta_() {
  const aplicar = () => {
    try {
      aplicarVisibilidadInstitucionesAlerta_();
      ['verde', 'amarilla', 'roja'].forEach(k => aplicarOpacidadAlerta_(k));
      // El panel flotante muestra el mismo copamiento por institución:
      // se redibuja para que los conteos reflejen las capas encendidas.
      const pf = document.getElementById('simbologia-flotante');
      if (pf && pf.style.display !== 'none' && typeof renderSimbologiaInstituciones_ === 'function') {
        renderSimbologiaInstituciones_();
      }
      if (typeof renderResumenAlertas_ === 'function') renderResumenAlertas_();
      if (typeof aplicarVisibilidadInfluencia_ === 'function') aplicarVisibilidadInfluencia_();
    } catch (e) { /* no debe interrumpir el flujo del mapa */ }
  };
  aplicar();
  setTimeout(aplicar, 0);
}

/** Activa el efecto neón al pasar el cursor sobre una entidad del mapa.
 *  Sirve para puntos, líneas y áreas de cualquier capa. Si se indica una
 *  clase de escenario se usa esa; si no, la genérica con el color dado. */
function activarNeonHover_(capa, color, clase) {
  if (!capa || capa._neonHoverActivo) return;
  capa._neonHoverActivo = true;
  const cls = clase || 'neon-hover';

  capa.on('mouseover', () => {
    try {
      if (capa._sinNeon) return;   // Modo Emergencia: sin neón en recursos no activados
      const el = capa.getElement && capa.getElement();
      if (!el) return;
      if (color && !clase) el.style.setProperty('--glow-c', color);
      el.classList.add(cls);
    } catch (e) { /* no debe interrumpir el mapa */ }
  });

  capa.on('mouseout', () => {
    try {
      const el = capa.getElement && capa.getElement();
      if (el) el.classList.remove(cls);
    } catch (e) { /* idem */ }
  });
}

// ════════════════════════════════════════════════════════════════
// HOVER ENRIQUECIDO SOBRE LAS ETIQUETAS DEL MAPA
//
// Al pasar el cursor por una figura o por su etiqueta, el tooltip pasa a
// mostrar institución, tipo y descripción del recurso; al salir vuelve al
// texto corto de siempre.
//
// Funciona en los dos estados:
//   · Etiquetas encendidas -> se reemplaza el contenido y se restaura.
//   · Etiquetas apagadas   -> se muestra un tooltip temporal solo al pasar.
//
// Los manejadores se registran una sola vez sobre la capa, así que
// sobreviven a que el usuario encienda o apague las etiquetas con 🏷️.
// ════════════════════════════════════════════════════════════════

/** Arma el bloque HTML del detalle. Devuelve null si no hay nada que mostrar. */
/** Punto con efecto neón: verde = la ruta tiene recurso asociado; rojo = no tiene. */
function puntoNeonRecursoRuta_(info) {
  return '<span class="punto-neon ' + (info.con ? 'con' : 'sin') + '" title="' + (info.con ? 'Con recurso asociado' : 'Sin recurso asociado') + '"></span>';
}
/** Para una línea CMPC del escenario Normal: { con, clave } según su recurso_ref_id (SQL 79). */
function infoRecursoRutaPlan_(r, escenario) {
  if (escenario !== 'Verde' || r.tipo_geometria !== 'linea') return null;
  if (!/CMPC/i.test(String((r.instituciones || {}).nombre || ''))) return null;
  if (!r.recurso_ref_id) return { con: false };
  const ri = (state.recursoRefInfo || {})[r.recurso_ref_id] || {};
  return { con: true, clave: claveIdTexto_(r.recurso_ref_clave || ri.alias, r.recurso_ref_codigo || ri.codigo_ref) };   // «Clave radial · ID»
}
function detalleHoverRecurso_(datos) {
  const institucion = (datos && datos.institucion) ? String(datos.institucion).trim() : '';
  const tipo = (datos && datos.tipo) ? String(datos.tipo).trim() : '';
  const nombre = (datos && datos.nombre) ? String(datos.nombre).trim() : '';
  const descripcion = (datos && datos.descripcion) ? String(datos.descripcion).trim() : '';
  if (!institucion && !tipo && !descripcion && !nombre) return null;

  // Formato ancho y compacto: los datos cortos van en una sola línea separados
  // por puntos medios, y la descripción debajo. Antes se apilaban en una
  // columna estrecha que crecía hacia abajo y tapaba el mapa.
  const encabezado = [];
  // Rutas CMPC del escenario Normal: punto neón 🟢 con recurso asociado / 🔴 sin recurso (13-10-2026)
  const punto = datos && datos.recursoRuta ? puntoNeonRecursoRuta_(datos.recursoRuta) : '';
  if (institucion) encabezado.push(punto + '<b>' + escapeHtml_(aTitulo_(institucion)) + '</b>');
  if (nombre && nombre !== institucion) encabezado.push(escapeHtml_(nombre));
  if (tipo) encabezado.push('<span style="opacity:.8;">' + escapeHtml_(aTitulo_(tipo)) + '</span>');
  if (datos && datos.recursoRuta) encabezado.push(datos.recursoRuta.con
    ? '<span style="color:#4ADE80;font-weight:700;">📻 ' + escapeHtml_(datos.recursoRuta.clave || 'Recurso asociado') + '</span>'
    : '<span style="color:#F87171;font-weight:700;">Sin recurso asociado</span>');
  // Recursos disponibles: ¿tiene ruta asignada? (mismo punto neón que las rutas)
  if (datos && datos.rutaDelRecurso) encabezado.unshift(puntoNeonRecursoRuta_(datos.rutaDelRecurso) + (datos.rutaDelRecurso.con
    ? '<span style="color:#4ADE80;font-weight:700;">Con ruta asignada</span>'
    : '<span style="color:#F87171;font-weight:700;">Sin ruta asignada</span>'));

  let html = '<div style="text-align:left;line-height:1.4;">';
  html += '<div style="white-space:nowrap;">' + encabezado.join('<span style="opacity:.45;"> · </span>') + '</div>';
  if (descripcion) {
    const corta = descripcion.length > 160 ? descripcion.slice(0, 157) + '…' : descripcion;
    html += '<div style="margin-top:3px;opacity:.85;font-size:11px;white-space:normal;">' + escapeHtml_(corta) + '</div>';
  }
  html += '</div>';
  return html;
}

/** Activa el hover enriquecido sobre una capa del mapa. */
function habilitarHoverEtiqueta_(capa, datos, opcionesTooltip) {
  if (!capa || capa._hoverEtiquetaActivo) return;
  const detalle = detalleHoverRecurso_(datos);
  if (!detalle) return;

  capa._detalleHover = detalle;
  capa._hoverEtiquetaActivo = true;
  const opts = opcionesTooltip || { direction: 'top', offset: [0, -14] };

  capa.on('mouseover', () => {
    try {
      // Solo se suprime mientras se está dibujando de verdad: en modo
      // edición o planificación con una herramienta de línea o área activa,
      // o editando una forma. Fuera de eso el hover funciona normalmente.
      if (state.editandoForma) return;
      if ((state.editorMode || state.modoPlanificacion) &&
          (state.dibujoModo === 'linea' || state.dibujoModo === 'area')) return;
      const tt = capa.getTooltip && capa.getTooltip();
      if (tt) {
        // Ya hay etiqueta visible: se guarda su texto y se reemplaza.
        if (capa._textoEtiquetaPrevio == null) capa._textoEtiquetaPrevio = tt.getContent();
        capa.setTooltipContent(capa._detalleHover);
        // El estilo de etiqueta (nowrap + sombra blanca) no sirve para texto
        // largo, así que se cambia a tarjeta mientras dura el hover.
        const el = tt.getElement && tt.getElement();
        if (el) el.classList.add('map-label-detalle');
      } else {
        // Etiquetas apagadas: se muestra un tooltip solo mientras dura el hover.
        capa.bindTooltip(capa._detalleHover, {
          permanent: false,
          direction: opts.direction || 'top',
          offset: opts.offset || [0, -14],
          className: 'map-label map-label-detalle',
          sticky: true,
        });
        capa._tooltipTemporal = true;
        capa.openTooltip();
      }
    } catch (e) { /* un fallo de tooltip no debe romper el mapa */ }
  });

  capa.on('mouseout', () => {
    try {
      if (capa._tooltipTemporal) {
        capa.closeTooltip();
        capa.unbindTooltip();
        capa._tooltipTemporal = false;
        return;
      }
      const tt = capa.getTooltip && capa.getTooltip();
      if (tt) {
        const el = tt.getElement && tt.getElement();
        if (el) el.classList.remove('map-label-detalle');
      }
      if (capa._textoEtiquetaPrevio != null) {
        capa.setTooltipContent(capa._textoEtiquetaPrevio);
        capa._textoEtiquetaPrevio = null;
      }
    } catch (e) { /* idem */ }
  });
}

// ════════════════════════════════════════════════════════════════
// PERTENENCIA DEL RECURSO: Protección / Relacionamiento
// Nivel intermedio del árbol de filtros. El dato vive en
// recursos_maestro.pertenencia; si la vista geojson no lo expone, se
// resuelve con un mapa auxiliar por tipo de recurso.
// ════════════════════════════════════════════════════════════════
state.pertenenciaPorTipo = state.pertenenciaPorTipo || {};
state.pertenenciaOculta = state.pertenenciaOculta || {};

const PERTENENCIA_ETIQUETA = {
  'Protección': '🛡️ Recursos de Protección',
  'Relacionamiento': '🤝 Recursos de Relacionamiento',
  'Sin clasificar': '❔ Sin clasificar',
};
const PERTENENCIA_ORDEN = ['Protección', 'Relacionamiento', 'Sin clasificar'];

/** Carga el mapa tipo_recurso -> pertenencia desde el catálogo maestro. */
async function cargarPertenenciaRecursos_() {
  try {
    const { data, error } = await supabaseClient
      .from('recursos_maestro')
      .select('tipo_recurso, pertenencia');
    if (error) { console.error('pertenencia:', error.message); return; }
    const mapa = {};
    (data || []).forEach(r => {
      if (r.tipo_recurso && r.pertenencia) {
        mapa[String(r.tipo_recurso).trim().toUpperCase()] = r.pertenencia;
      }
    });
    state.pertenenciaPorTipo = mapa;
  } catch (e) {
    console.error('cargarPertenenciaRecursos_:', e);
  }
}

// ════════════════════════════════════════════════════════════════
// TURNO DE HOY: filtrar recursos activos según el calendario
// ════════════════════════════════════════════════════════════════
state.soloTurnoHoy = state.soloTurnoHoy || false;
state.recursosActivosHoy = state.recursosActivosHoy || null;  // Set de recurso_ids activos hoy

async function cargarRecursosActivosHoy_() {
  const hoy = new Date();
  const iso = hoy.getFullYear() + '-' + String(hoy.getMonth()+1).padStart(2,'0') + '-' + String(hoy.getDate()).padStart(2,'0');
  try {
    const { data } = await supabaseClient
      .from('recurso_turnos')
      .select('recurso_id')
      .eq('fecha', iso).eq('activo', true);
    state.recursosActivosHoy = new Set((data || []).map(t => t.recurso_id));
  } catch (e) { state.recursosActivosHoy = new Set(); }
}

function recursoActivoHoy_(recursoId) {
  if (!state.soloTurnoHoy) return true;              // filtro apagado: todos visibles
  if (!state.recursosActivosHoy) return true;         // aún no cargado: no ocultar
  return state.recursosActivosHoy.has(recursoId);
}

/** Determina la pertenencia de un registro de recurso. */
function pertenenciaDeRecurso_(r) {
  if (!r) return 'Sin clasificar';
  if (r.pertenencia) return r.pertenencia;
  const clave = String(r.tipo_recurso || '').trim().toUpperCase();
  return (state.pertenenciaPorTipo && state.pertenenciaPorTipo[clave]) || 'Sin clasificar';
}

function pertenenciaOculta_(p) {
  return !!state.pertenenciaOculta[p];
}
function setPertenenciaOculta_(p, oculto) {
  state.pertenenciaOculta[p] = oculto;
}

// ════════════════════════════════════════════════════════════════
// FILTRO JERÁRQUICO POR TIPO DE RECURSO (para las 2 capas de recursos)
// ════════════════════════════════════════════════════════════════
state.tiposRecursoOcultos = state.tiposRecursoOcultos || {};

function tipoRecursoOculto_(tipo) {
  return !!state.tiposRecursoOcultos[tipo];
}
function setTipoRecursoOculto_(tipo, oculto) {
  state.tiposRecursoOcultos[tipo] = oculto;
}

// Mostrar/ocultar markers según el tipo, en un layerGroup dado
function aplicarVisibilidadTiposRecurso_(layerGroup) {
  layerGroup.eachLayer(m => {
    const tipo = m._tipoRecurso;
    if (!tipo) return;
    // Una figura se oculta si su tipo está apagado O si lo está su pertenencia.
    const pert = m._pertenencia || 'Sin clasificar';
    const oculto = tipoRecursoOculto_(tipo) || pertenenciaOculta_(pert) || !recursoActivoHoy_(m._recursoId);
    const el = m.getElement && m.getElement();
    if (el) el.style.display = oculto ? 'none' : '';
    // También el tooltip
    const tt = m.getTooltip && m.getTooltip();
    if (tt) { const tel = tt.getElement && tt.getElement(); if (tel) tel.style.display = oculto ? 'none' : ''; }
  });
}

// Renderiza el árbol jerárquico completo: Raíz (con toggle de capa) → Tipos de recurso
// Igual que Áreas de Relacionamiento: el checkbox de la raíz enciende/apaga toda la capa.
// opts: { titulo, dotColor, colapsoKey, layerGroup, featureLayers, infoCount,
//         onToggleCapa (async), btnEtiqId, etiqActiva, onToggleEtiq }
function renderArbolTiposRecurso_(contenedor, opts) {
  const { titulo, dotColor, colapsoKey, layerGroup, featureLayers, infoCount,
          onToggleCapa, btnEtiqId, etiqActiva, onToggleEtiq } = opts;

  // Agrupar en dos niveles: pertenencia -> tipo de recurso
  const porPertenencia = {};
  let totalTipos = 0;
  featureLayers.forEach(({ layer }) => {
    const p = layer._pertenencia || 'Sin clasificar';
    const t = layer._tipoRecurso || 'Sin tipo';
    if (!porPertenencia[p]) porPertenencia[p] = {};
    porPertenencia[p][t] = (porPertenencia[p][t] || 0) + 1;
  });
  const pertenencias = Object.keys(porPertenencia).sort((a, b) => {
    const ia = PERTENENCIA_ORDEN.indexOf(a), ib = PERTENENCIA_ORDEN.indexOf(b);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });
  pertenencias.forEach(p => { totalTipos += Object.keys(porPertenencia[p]).length; });
  const encendida = map.hasLayer(layerGroup);

  if (state[colapsoKey] === undefined) state[colapsoKey] = true; // arranca colapsado

  // Nodo raíz — es la fila principal de la capa (con toggle que enciende/apaga)
  const raiz = document.createElement('div'); raiz.className = 'tree-node';
  const rowRaiz = document.createElement('div'); rowRaiz.className = 'tree-row';
  rowRaiz.innerHTML =
    '<span class="tree-caret ' + (state[colapsoKey] ? 'collapsed' : '') + '">▼</span>' +
    '<span class="tree-check ' + (encendida ? 'on' : '') + '" data-recurso-raiz="1"></span>' +
    '<span class="flame-dot" style="background:' + dotColor + ';margin-right:2px;"></span>' +
    '<span class="tree-label">' + escapeHtml_(titulo) + '</span>' +
    '<span class="tree-count">' + (infoCount != null ? infoCount + ' rec.' : totalTipos + ' tipo(s)') + '</span>' +
    (btnEtiqId ? '<button id="' + btnEtiqId + '" class="icon-btn' + (etiqActiva ? ' active' : '') + '" title="Mostrar/ocultar nombres" style="width:22px;height:22px;font-size:11px;flex-shrink:0;margin-left:4px;">🏷️</button>' : '');
  raiz.appendChild(rowRaiz);

  const hijos = document.createElement('div');
  hijos.className = 'tree-children' + (state[colapsoKey] ? ' collapsed' : '');

  // Nivel 2: pertenencia (Protección / Relacionamiento)
  pertenencias.forEach(pert => {
    const tiposDe = Object.keys(porPertenencia[pert]).sort();
    const totalPert = tiposDe.reduce((n, t) => n + porPertenencia[pert][t], 0);
    const pertVisible = encendida && !pertenenciaOculta_(pert);
    const claveColapsoPert = colapsoKey + '_pert_' + pert;
    if (state[claveColapsoPert] === undefined) state[claveColapsoPert] = false;

    const nodoPert = document.createElement('div'); nodoPert.className = 'tree-node sector';
    const rowPert = document.createElement('div'); rowPert.className = 'tree-row';
    rowPert.innerHTML =
      '<span class="tree-caret ' + (state[claveColapsoPert] ? 'collapsed' : '') + '">▼</span>' +
      '<span class="tree-check ' + (pertVisible ? 'on' : '') + '" data-recurso-pert="' + escapeHtml_(pert) + '"></span>' +
      '<span class="tree-label">' + escapeHtml_(PERTENENCIA_ETIQUETA[pert] || pert) + '</span>' +
      '<span class="tree-count">' + totalPert + '</span>';
    nodoPert.appendChild(rowPert);

    const hijosPert = document.createElement('div');
    hijosPert.className = 'tree-children' + (state[claveColapsoPert] ? ' collapsed' : '');

    // Nivel 3: tipos de recurso dentro de esa pertenencia
    tiposDe.forEach(tipo => {
      const visible = encendida && !pertenenciaOculta_(pert) && !tipoRecursoOculto_(tipo);
      const nodo = document.createElement('div'); nodo.className = 'tree-node sector';
      const row = document.createElement('div'); row.className = 'tree-row';
      row.style.paddingLeft = '14px';
      row.innerHTML =
        '<span class="tree-caret leaf">▼</span>' +
        '<span class="tree-check ' + (visible ? 'on' : '') + '" data-recurso-tipo="' + escapeHtml_(tipo) + '"></span>' +
        '<span class="tree-label">' + escapeHtml_(tipo) + '</span>' +
        '<span class="tree-count">' + porPertenencia[pert][tipo] + '</span>';
      nodo.appendChild(row);
      hijosPert.appendChild(nodo);

      row.querySelector('[data-recurso-tipo]').addEventListener('click', () => {
        if (!map.hasLayer(layerGroup)) return; // solo si la capa está encendida
        setTipoRecursoOculto_(tipo, !tipoRecursoOculto_(tipo));
        aplicarVisibilidadTiposRecurso_(layerGroup);
        renderTab(state.activeTab || 'capas');
      });
    });

    nodoPert.appendChild(hijosPert);
    hijos.appendChild(nodoPert);

    // Caret de la pertenencia
    rowPert.querySelector('.tree-caret').addEventListener('click', (ev) => {
      ev.stopPropagation();
      state[claveColapsoPert] = !state[claveColapsoPert];
      hijosPert.classList.toggle('collapsed', state[claveColapsoPert]);
      rowPert.querySelector('.tree-caret').classList.toggle('collapsed', state[claveColapsoPert]);
    });

    // Checkbox de la pertenencia: apaga o enciende todo el grupo de una vez
    rowPert.querySelector('[data-recurso-pert]').addEventListener('click', () => {
      if (!map.hasLayer(layerGroup)) return;
      setPertenenciaOculta_(pert, !pertenenciaOculta_(pert));
      aplicarVisibilidadTiposRecurso_(layerGroup);
      renderTab(state.activeTab || 'capas');
    });
  });

  raiz.appendChild(hijos);
  contenedor.appendChild(raiz);

  // Caret: expandir/colapsar
  rowRaiz.querySelector('.tree-caret').addEventListener('click', () => {
    state[colapsoKey] = !state[colapsoKey];
    hijos.classList.toggle('collapsed', state[colapsoKey]);
    rowRaiz.querySelector('.tree-caret').classList.toggle('collapsed', state[colapsoKey]);
  });

  // Checkbox raíz: encender/apagar toda la capa
  rowRaiz.querySelector('[data-recurso-raiz]').addEventListener('click', async () => {
    await onToggleCapa();
    renderTab(state.activeTab || 'capas');
  });

  // Botón etiquetas
  if (btnEtiqId && onToggleEtiq) {
    const btn = rowRaiz.querySelector('#' + btnEtiqId);
    if (btn) btn.addEventListener('click', (ev) => { ev.stopPropagation(); onToggleEtiq(); });
  }
}

function construirIconoRecursoMaestro_(rm, color) {
  // Si el recurso tiene un ícono personalizado, usarlo
  // Ícono propio del recurso o el de su tipo; en ambos casos la versión RECORTADA (sin márgenes vacíos).
  const rec = rm.icono_url && (state.iconosRecortados || {})[rm.icono_url];
  const iconoUrl = rm.icono_url ? (rec ? rec.url : rm.icono_url) : iconoPersonalizadoPorTipo_(rm.tipo_recurso);
  if (iconoUrl) {
    // Ícono SIN fondo (transparente). Caja según la proporción del dibujo: los anchos
    // (camioneta, brigadas) ocupan más ancho en vez de achicarse dentro de un cuadrado.
    const asp = Math.max(0.6, Math.min(2.2, rec ? rec.aspecto : aspectoIconoTipo_(rm.tipo_recurso)));
    // Vigía Camioneta y Vigía Motorizado, un 20 % más grandes (pedido 13-10-2026)
    // × tamaño elegido por el usuario (barra "Tamaño de íconos" de la simbología)
    const extra = (/CAMIONETA|MOTORIZ/i.test(normalizarBusqueda_(rm.tipo_recurso || '')) ? 1.2 : 1) * (state.escalaIconos || 1);
    const alto = Math.round((asp > 1.25 ? 40 : 48) * extra), ancho = Math.round(Math.max(alto * asp, alto));
    return L.divIcon({
      className: '', iconSize: [ancho, alto], iconAnchor: [ancho / 2, alto / 2], popupAnchor: [0, -alto / 2],
      html: '<div style="width:' + ancho + 'px;height:' + alto + 'px;display:flex;align-items:center;justify-content:center;">' +
        '<img src="' + escapeHtml_(iconoUrl) + '" alt="" style="width:' + ancho + 'px;height:' + alto + 'px;object-fit:contain;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.5));" ' +
        'onerror="this.parentElement.innerHTML=\'' + emojiParaRecursoMaestro_(rm).emoji + '\';this.parentElement.style.fontSize=\'26px\'">' +
        '</div>',
    });
  }
  // Sin ícono personalizado: emoji por defecto
  const { emoji, sirena } = emojiParaRecursoMaestro_(rm);
  const fondo = sirena ? 'rgba(148,163,184,0.95)' : 'rgba(255,255,255,0.9)';
  const d = Math.round(32 * (state.escalaIconos || 1));   // tamaño elegido por el usuario
  return L.divIcon({
    className: '', iconSize: [d, d], iconAnchor: [d / 2, d / 2], popupAnchor: [0, -d / 2],
    html: '<div style="position:relative;width:' + d + 'px;height:' + d + 'px;border-radius:50%;background:' + fondo + ';border:2.6px solid ' + color + ';display:flex;align-items:center;justify-content:center;font-size:' + Math.round(d / 2) + 'px;line-height:1;box-shadow:0 2px 5px rgba(0,0,0,0.25);">' +
      emoji +
      (sirena ? '<span style="position:absolute;top:-7px;right:-4px;font-size:11px;">🚨</span>' : '') +
      '</div>',
  });
}

// Mapa de íconos personalizados por tipo de recurso (cargado desde el catálogo)
// { 'VIGÍA INFANTERÍA': 'https://...', ... }
state.iconosPorTipoRecurso = state.iconosPorTipoRecurso || {};
function iconoPersonalizadoPorTipo_(tipoRecurso) {
  if (!tipoRecurso) return null;
  const clave = tipoRecurso.toString().trim().toUpperCase();
  // 1. Coincidencia exacta
  if (state.iconosPorTipoRecurso[clave]) return state.iconosPorTipoRecurso[clave];
  // 2. Coincidencia parcial: el tipo del catálogo está contenido en el del recurso, o viceversa
  //    (ej: catálogo "VIGÍA" coincide con recurso "VIGÍA INFANTERÍA")
  for (const k of Object.keys(state.iconosPorTipoRecurso)) {
    if (clave.includes(k) || k.includes(clave)) return state.iconosPorTipoRecurso[k];
  }
  return null;
}

// Cargar los íconos del catálogo (recursos_maestro) mapeados por tipo de recurso
async function cargarIconosRecursos_() {
  try {
    const { data } = await supabaseClient
      .from('recursos_maestro')
      .select('tipo_recurso, icono_url')
      .not('icono_url', 'is', null);
    const mapa = {};
    (data || []).forEach(r => {
      if (r.tipo_recurso && r.icono_url) {
        mapa[r.tipo_recurso.toString().trim().toUpperCase()] = r.icono_url;
      }
    });
    // Íconos sin márgenes vacíos (13-10-2026): varios PNG traen mucho borde transparente
    // (p. ej. Vigía Camioneta / Motorizado) y en el mapa el dibujo se veía diminuto.
    const claves = Object.keys(mapa);
    const recortes = await Promise.all(claves.map(k => recortarImagenTransparente_(mapa[k]).catch(() => null)));
    state.iconosAspecto = state.iconosAspecto || {};
    state.iconosRecortados = state.iconosRecortados || {};   // URL original → { url recortada, aspecto }
    claves.forEach((k, i) => {
      if (!recortes[i]) return;
      state.iconosRecortados[mapa[k]] = recortes[i];
      mapa[k] = recortes[i].url;
      state.iconosAspecto[k] = recortes[i].aspecto;
    });
    state.iconosPorTipoRecurso = mapa;
  } catch (e) { /* silencioso: sin íconos personalizados */ }
}

/** Recorta los márgenes transparentes de una imagen (PNG/WebP) y la devuelve como dataURL
 *  nítido (máx. 320 px de alto, suavizado de alta calidad) + su proporción ancho/alto.
 *  Si la imagen no se puede leer (CORS) o no tiene transparencia, se rechaza o se deja igual. */
const cacheRecortesIcono_ = {};
function recortarImagenTransparente_(src, maxAlto = 320) {
  if (!src) return Promise.reject(new Error('sin imagen'));
  if (cacheRecortesIcono_[src]) return cacheRecortesIcono_[src];
  cacheRecortesIcono_[src] = new Promise((ok, mal) => {
    const img = new Image();
    if (!/^data:/.test(src)) img.crossOrigin = 'anonymous';
    const t = setTimeout(() => mal(new Error('tiempo agotado')), 6000);
    img.onerror = () => { clearTimeout(t); mal(new Error('no se pudo cargar')); };
    img.onload = () => {
      clearTimeout(t);
      try {
        const w = img.naturalWidth, h = img.naturalHeight;
        const c = document.createElement('canvas'); c.width = w; c.height = h;
        const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0);
        const px = ctx.getImageData(0, 0, w, h).data;
        let x0 = w, y0 = h, x1 = -1, y1 = -1;
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
          if (px[(y * w + x) * 4 + 3] > 16) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
        }
        if (x1 < 0) { mal(new Error('imagen vacía')); return; }
        const m = 2;   // pequeño margen para que la sombra no se corte
        x0 = Math.max(0, x0 - m); y0 = Math.max(0, y0 - m); x1 = Math.min(w - 1, x1 + m); y1 = Math.min(h - 1, y1 + m);
        const cw = x1 - x0 + 1, ch = y1 - y0 + 1;
        const esc = Math.min(1, maxAlto / ch);
        const out = document.createElement('canvas');
        out.width = Math.round(cw * esc); out.height = Math.round(ch * esc);
        const o = out.getContext('2d');
        o.imageSmoothingEnabled = true; o.imageSmoothingQuality = 'high';
        o.drawImage(c, x0, y0, cw, ch, 0, 0, out.width, out.height);
        ok({ url: out.toDataURL('image/png'), aspecto: cw / ch, recortado: cw < w || ch < h });
      } catch (e) { mal(e); }   // lienzo "contaminado" (sin CORS): se usa la URL original
    };
    img.src = src;
  });
  cacheRecortesIcono_[src].catch(() => { delete cacheRecortesIcono_[src]; });
  return cacheRecortesIcono_[src];
}
/** Proporción ancho/alto del ícono de un tipo (1 si no se conoce). */
function aspectoIconoTipo_(tipo) {
  const k = String(tipo || '').trim().toUpperCase();
  const a = state.iconosAspecto || {};
  if (a[k]) return a[k];
  for (const kk of Object.keys(a)) if (k.includes(kk) || kk.includes(k)) return a[kk];
  return 1;
}

let recursosDisponiblesFeatureLayers = []; // [{layer, nombre}] — para togglear solo las etiquetas

async function loadRecursosDisponiblesAreaLayer_() {
  recursosDisponiblesAreaLayer.clearLayers();
  recursosDisponiblesFeatureLayers = [];
  state.recursosDisponiblesInfo = { ok: false, count: 0 };

  const perfil = state.perfil.perfil;
  let resultado;

  if ((perfil === 'Administrador' || esJefeAreaPerfil_(perfil)) && state.areaActiva) {
    // Filtro 🧭 Área (Admin y Jefe de Área): solo los recursos del área elegida
    // (nombre comparado sin tildes, espacios ni guiones). 13-10-2026: antes el Admin veía todos.
    resultado = await recursosDeAreas_(state.areaActiva);
  } else if (perfil === 'Administrador') {
    // Administrador sin área elegida: TODOS los recursos (sin filtro)
    resultado = await supabaseClient.from('recursos_disponibles_area_geojson').select('*');
  } else {
    // Jefe de Área en modo comuna, GRD y Visor: solo recursos de la comuna activa
    const idc = idComunaActiva_();
    if (!idc) { state.recursosDisponiblesInfo = { ok: true, count: 0 }; return; }
    resultado = await supabaseClient.from('recursos_disponibles_area_geojson').select('*').eq('id_comuna', idc);
  }

  const { data, error } = resultado;

  if (error) { state.recursosDisponiblesInfo = { ok: false, count: 0, error: error.message }; return; }

  // Nombre de la persona a cargo (recurso_contacto, SQL 92). Por RLS solo lo leen el Administrador
  // y el Jefe de su área; para los demás la etiqueta queda con ID y clave radial.
  const personaPor = {};
  try {
    const ids = (data || []).map(r => r.id);
    for (let i = 0; i < ids.length; i += 150) {
      const { data: cs } = await supabaseClient.from('recurso_contacto').select('recurso_id, nombre_persona').in('recurso_id', ids.slice(i, i + 150));
      (cs || []).forEach(c => { if (c.nombre_persona) personaPor[c.recurso_id] = c.nombre_persona; });
    }
  } catch (e) { /* sin contactos: solo ID y clave */ }

  // ¿Tiene ruta asignada? (línea del escenario Normal, SQL 79, o recurso_rutas): mismo punto neón que las rutas
  const conRuta = new Set();
  try {
    const [rn, rr] = await Promise.all([
      supabaseClient.from('v_recurso_ruta_normal').select('recurso_id'),
      supabaseClient.from('recurso_rutas').select('recurso_id'),
    ]);
    (rn.data || []).concat(rr.data || []).forEach(x => conRuta.add(String(x.recurso_id)));
  } catch (e) { /* sin las vistas: no se muestra el indicador */ }
  state.recursosConRuta = conRuta;

  (data || []).forEach(r => {
    const inst = r.instituciones || { nombre: 'Institución', color_hex: '#64748B' };
    // Etiqueta (15-10-2026): Clave radial · ID y, debajo, el nombre de la persona a cargo.
    // Sin ID ni clave se muestra el tipo de recurso, como antes.
    const idClave = escapeHtml_(claveIdTexto_(r.clave_radial, r.codigo_ref));   // «Clave radial · ID»
    // Indicador de ruta (recursos de Relacionamiento): 🟢 con ruta asignada · 🔴 sin ruta, como en las rutas creadas
    const infoRuta = pertenenciaDeRecurso_(r) === 'Relacionamiento' ? { con: conRuta.has(String(r.id)), clave: idClave ? claveIdTexto_(r.clave_radial, r.codigo_ref) : '' } : null;
    const punto = infoRuta ? '<span class="punto-neon ' + (infoRuta.con ? 'con' : 'sin') + '" title="' + (infoRuta.con ? 'Tiene ruta asignada' : 'Sin ruta asignada') + '"></span>' : '';
    const etiqueta = punto + (idClave ? '<b>' + idClave + '</b>' : escapeHtml_(r.tipo_recurso || r.nombre_recurso || inst.nombre)) +
      (personaPor[r.id] ? '<br><span class="lbl-persona">👤 ' + escapeHtml_(personaPor[r.id]) + '</span>' : '');
    const puedeEditar = puedeGestionarRecursoArea_(r.area);
    const enEdicionEstaZona = !!(state.modoRecursosArea && plNorm_(state.modoRecursosArea.area) === plNorm_(r.area));
    const popupHtml =
      '<div class="popup-title">' + (r.clave_radial ? '📻 ' + escapeHtml_(r.clave_radial) + ' · ' : '') + escapeHtml_(r.nombre_recurso || inst.nombre) + '</div>' +
      '<div class="popup-row">🏢 ' + inst.nombre + '</div>' +
      '<div class="popup-row">🏷️ ' + r.tipo_recurso + (r.tipo_movil && r.tipo_movil !== 'No Aplica' ? ' (' + r.tipo_movil + ')' : '') + (r.cantidad_personas ? ' · ' + r.cantidad_personas + ' persona(s)' : '') + '</div>' +
      (infoRuta ? '<div class="popup-row">' + punto + (infoRuta.con ? '<b style="color:#16A34A;">Tiene ruta asignada</b>' : '<b style="color:#DC2626;">Sin ruta asignada</b> · se asigna en el escenario Normal') + '</div>' : '') +
      (r.fecha_inicio_operacion ? '<div class="popup-row">📅 Inicio: ' + r.fecha_inicio_operacion + '</div>' : '') +
      '<div class="popup-row">' + escapeHtml_(r.descripcion_funcion || 'Sin descripción') + '</div>' +
      (puedeEditar ? '<div class="popup-actions">' +
        '<button class="popup-btn" data-action="editar-recurso-area" data-id="' + r.id + '">Editar</button>' +
        '<button class="popup-btn" data-action="eliminar-recurso-area" data-id="' + r.id + '" style="color:#DC2626;">Eliminar</button></div>' : '');

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
        ? L.polygon(latlngs, { color: inst.color_hex, weight: 3, dashArray: '6,5', fillColor: inst.color_hex, fillOpacity: 0.15 })
        : L.polyline(latlngs, { color: inst.color_hex, weight: 4 });
      figura.bindPopup(popupHtml);
      figura.on('popupopen', () => {
        if (!state.editorMode && !state.modoRecursosArea) { figura.closePopup(); mostrarToast_('✏️ Activa el modo edición para modificar.'); return; }
        bindPopupActionsRecursoArea_(r);
      });
      recursosDisponiblesFeatureLayers.push({ layer: figura, nombre: etiqueta });
      if (state.mostrarEtiquetasRecursosArea) {
        figura.bindTooltip(etiqueta, { permanent: true, direction: 'center', className: 'map-label' });
      }
      figura._tipoRecurso = r.tipo_recurso || 'Sin tipo'; figura._pertenencia = pertenenciaDeRecurso_(r);
      habilitarHoverEtiqueta_(figura, { institucion: inst.nombre, nombre: r.nombre_recurso, tipo: r.tipo_recurso, descripcion: r.descripcion_funcion, rutaDelRecurso: infoRuta }, { direction: 'center', offset: [0, 0] });
      activarNeonHover_(figura, inst.color_hex);
      recursosDisponiblesAreaLayer.addLayer(figura);
      return;
    }

    if (r.lat == null || r.lng == null) return;
    const m = L.marker([r.lat, r.lng], { icon: construirIconoRecursoMaestro_(r, inst.color_hex), draggable: enEdicionEstaZona });
    m.bindPopup(popupHtml);
    m.on('popupopen', () => {
      if (!state.editorMode && !state.modoRecursosArea) { m.closePopup(); mostrarToast_('✏️ Activa el modo edición para modificar.'); return; }
      bindPopupActionsRecursoArea_(r);
    });
    if (enEdicionEstaZona) {
      m.on('dragend', () => reubicarRecursoArea_(r.id, m));
    }
    m._tipoRecurso = r.tipo_recurso || 'Sin tipo'; m._pertenencia = pertenenciaDeRecurso_(r); m._recursoId = r.id;
    recursosDisponiblesFeatureLayers.push({ layer: m, nombre: etiqueta });
    if (state.mostrarEtiquetasRecursosArea && !tipoRecursoOculto_(m._tipoRecurso)) {
      m.bindTooltip(etiqueta, { permanent: true, interactive: true, direction: 'top', offset: [0, -16], className: 'map-label' });
    }
    habilitarHoverEtiqueta_(m, { institucion: inst.nombre, nombre: r.nombre_recurso, tipo: r.tipo_recurso, descripcion: r.descripcion_funcion, rutaDelRecurso: infoRuta }, { direction: 'top', offset: [0, -18] });
    activarNeonHover_(m, inst.color_hex);
    recursosDisponiblesAreaLayer.addLayer(m);
    if (tipoRecursoOculto_(m._tipoRecurso) || !recursoActivoHoy_(m._recursoId)) { const el = m.getElement && m.getElement(); if (el) el.style.display = 'none'; }
  });
  // Aplicar visibilidad por tipo tras cargar
  setTimeout(() => aplicarVisibilidadTiposRecurso_(recursosDisponiblesAreaLayer), 50);
  state.recursosDisponiblesInfo = { ok: true, count: (data || []).length };
}

async function reubicarRecursoArea_(id, marker) {
  const nuevaPos = marker.getLatLng();
  // Base única = referencia_recursos (SQL 67): se mueve por RPC (recalcula coord. UTM y valida permisos).
  const { error } = await supabaseClient.rpc('mover_recurso_referencia', {
    p_recurso_id: id, p_lat: Number(nuevaPos.lat), p_lng: Number(nuevaPos.lng),
  });
  if (error) {
    mostrarToast_('No se pudo reubicar: ' + error.message);
    loadRecursosDisponiblesAreaLayer_(); // revierte visualmente al recargar la posición real
    return;
  }
  mostrarToast_('Ubicación actualizada.');
}

function puedeGestionarRecursoArea_(area) {
  if (state.perfil.perfil === 'Administrador') return true;
  // perfil_areas viene sin tilde (MULCHEN) y los recursos con tilde (MULCHÉN): comparar normalizado.
  if (state.perfil.perfil === 'Jefe de Área Relacionamiento') return (state.misAreasIds || []).map(plNorm_).includes(plNorm_(area));
  return false;
}

/** Recursos de recursos_disponibles_area_geojson de una o varias áreas, comparando
 *  el nombre SIN tildes: el catálogo y perfil_areas dicen 'MULCHEN' y los recursos
 *  'MULCHÉN', así que un .eq('area', …) en la API no los encontraba. La vista es
 *  chica (cientos de filas): se trae paginada y se filtra aquí. */
async function recursosDeAreas_(areas, orden) {
  // Misma clave que clave_area_red_vial_ (SQL 71): sin tildes, espacios ni guiones
  const clave = a => plNorm_(a).replace(/[^A-Z0-9]/g, '');
  const buscadas = (Array.isArray(areas) ? areas : [areas]).filter(Boolean).map(clave);
  const filas = [];
  for (let desde = 0; ; desde += 1000) {
    let q = supabaseClient.from('recursos_disponibles_area_geojson').select('*');
    q = orden ? q.order(orden, { ascending: true }).order('id') : q.order('id');
    const { data, error } = await q.range(desde, desde + 999);
    if (error) return { data: null, error };
    filas.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return { data: filas.filter(r => buscadas.includes(clave(r.area))), error: null };
}

