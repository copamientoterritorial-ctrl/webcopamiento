/* ============ REGLA DE MEDICIÓN (dibujo y edición de líneas y áreas) ============
 * Calcula en vivo longitud, perímetro y superficie mientras se dibuja o se
 * edita una geometría. No usa librerías externas: la distancia se obtiene con
 * la fórmula de Haversine y la superficie con exceso esférico, que para las
 * escalas de una comuna da un error muy por debajo del margen operativo.
 */
const RADIO_TIERRA_M = 6371008.8;

function distanciaHaversine_(a, b) {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const lat1 = a.lat * rad, lat2 = b.lat * rad;
  const h = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 2 * RADIO_TIERRA_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Longitud acumulada de una secuencia de puntos. Si cerrar=true suma el tramo final. */
function longitudTotal_(puntos, cerrar) {
  if (!puntos || puntos.length < 2) return 0;
  let total = 0;
  for (let i = 0; i < puntos.length - 1; i++) total += distanciaHaversine_(puntos[i], puntos[i + 1]);
  if (cerrar) total += distanciaHaversine_(puntos[puntos.length - 1], puntos[0]);
  return total;
}

/** Superficie de un polígono sobre la esfera, en metros cuadrados. */
function areaEsferica_(puntos) {
  if (!puntos || puntos.length < 3) return 0;
  const rad = Math.PI / 180;
  let total = 0;
  for (let i = 0; i < puntos.length; i++) {
    const p1 = puntos[i];
    const p2 = puntos[(i + 1) % puntos.length];
    total += (p2.lng - p1.lng) * rad *
             (2 + Math.sin(p1.lat * rad) + Math.sin(p2.lat * rad));
  }
  return Math.abs(total * RADIO_TIERRA_M * RADIO_TIERRA_M / 2);
}

function formatearDistancia_(metros) {
  if (metros < 1000) return metros.toFixed(0) + ' m';
  return (metros / 1000).toFixed(metros < 10000 ? 2 : 1).replace('.', ',') + ' km';
}

function formatearArea_(m2) {
  const ha = m2 / 10000;
  if (ha < 1) return m2.toFixed(0) + ' m²';
  if (ha < 1000) return ha.toFixed(2).replace('.', ',') + ' ha';
  return (ha / 100).toFixed(2).replace('.', ',') + ' km² (' + ha.toFixed(0) + ' ha)';
}

/** Refresca el indicador flotante. Se llama en cada cambio de la geometría. */
function actualizarReglaMedicion_() {
  const caja = document.getElementById('regla-medicion');
  if (!caja) return;

  const modo = state.dibujoModo;
  const pts = tempDibujoVertices || [];
  if (trazoLibreActivo) return;   // el trazo libre en curso muestra su propia medición

  if ((modo !== 'linea' && modo !== 'area') || pts.length < 2) {
    caja.style.display = 'none';
    caja.innerHTML = '';
    return;
  }

  // Formato compacto en una línea (19-10-2026)
  let html = '';
  if (modo === 'linea') {
    const ef = state.editandoForma;
    const largo = (ef && ef.partes)  // ruta unida: suma de tramos, sin el salto entre ellos
      ? ef.partes.reduce((s, parte) => s + longitudTotal_(parte, false), 0)
      : longitudTotal_(pts, false);
    const ultimo = distanciaHaversine_(pts[pts.length - 2], pts[pts.length - 1]);
    html = '📏 <b>' + formatearDistancia_(largo) + '</b> <span style="opacity:.7;">· último ' + formatearDistancia_(ultimo) + ' · ' + pts.length + ' vért.</span>';
  } else if (pts.length < 3) {
    html = '📐 ' + formatearDistancia_(longitudTotal_(pts, false)) + ' <span style="opacity:.7;">· faltan ' + (3 - pts.length) + ' vért. para cerrar</span>';
  } else {
    html = '📐 <b>' + formatearArea_(areaEsferica_(pts)) + '</b> <span style="opacity:.7;">· perím. ' + formatearDistancia_(longitudTotal_(pts, true)) + ' · ' + pts.length + ' vért.</span>';
  }

  caja.innerHTML = html;
  caja.style.display = 'block';
}

/* ============ HERRAMIENTA REGLA: medición libre con el cursor ============
 * Modo independiente del dibujo. Se activa con el botón 📐 del mapa.
 *   · Clic en el mapa       -> agrega un punto de medición
 *   · Doble clic            -> termina la medición en curso
 *   · Clic derecho          -> deshace el último punto
 *   · Botón "Cerrar área"   -> une el último punto con el primero y calcula superficie
 *   · Tecla Escape          -> sale de la herramienta
 * No escribe nada en la base de datos: es una ayuda visual para las reuniones.
 */
state.modoRegla = false;
let reglaPuntos = [];
let reglaCerrada = false;
const reglaLayerGroup = L.layerGroup();
let reglaLineaSeguimiento = null;

function toggleRegla_() {
  if (state.modoRegla) { salirRegla_(); return; }

  // La regla y el modo dibujo comparten el clic del mapa: no pueden convivir.
  if (state.dibujoModo === 'linea' || state.dibujoModo === 'area') {
    if (tempDibujoVertices && tempDibujoVertices.length > 0) {
      mostrarToast_('⚠️ Termina o cancela el dibujo en curso antes de usar la regla.');
      return;
    }
  }

  state.modoRegla = true;
  reglaPuntos = [];
  reglaCerrada = false;
  if (!map.hasLayer(reglaLayerGroup)) reglaLayerGroup.addTo(map);
  reglaLayerGroup.clearLayers();

  document.getElementById('btn-regla').classList.add('active');
  document.getElementById('regla-panel').style.display = 'flex';
  document.getElementById('map').style.cursor = 'crosshair';

  map.on('click', reglaClick_);
  map.on('mousemove', reglaMouseMove_);
  map.on('dblclick', reglaDobleClick_);
  map.on('contextmenu', reglaDeshacer_);
  map.doubleClickZoom.disable();

  actualizarPanelRegla_();
  mostrarToast_('📐 Regla activa. Clic para medir; doble clic para terminar.');
}

function salirRegla_() {
  state.modoRegla = false;
  reglaPuntos = [];
  reglaCerrada = false;
  reglaLayerGroup.clearLayers();
  if (reglaLineaSeguimiento) { map.removeLayer(reglaLineaSeguimiento); reglaLineaSeguimiento = null; }

  document.getElementById('btn-regla').classList.remove('active');
  document.getElementById('regla-panel').style.display = 'none';
  document.getElementById('map').style.cursor = '';

  map.off('click', reglaClick_);
  map.off('mousemove', reglaMouseMove_);
  map.off('dblclick', reglaDobleClick_);
  map.off('contextmenu', reglaDeshacer_);
  map.doubleClickZoom.enable();
}

function reglaLimpiar_() {
  reglaPuntos = [];
  reglaCerrada = false;
  reglaLayerGroup.clearLayers();
  if (reglaLineaSeguimiento) { map.removeLayer(reglaLineaSeguimiento); reglaLineaSeguimiento = null; }
  actualizarPanelRegla_();
}

function reglaClick_(e) {
  if (!state.modoRegla) return;
  if (reglaCerrada) reglaLimpiar_();
  reglaPuntos.push(e.latlng);
  redibujarRegla_();
}

function reglaDeshacer_(e) {
  if (!state.modoRegla) return;
  if (e && e.originalEvent) e.originalEvent.preventDefault();
  if (reglaPuntos.length === 0) return;
  reglaPuntos.pop();
  reglaCerrada = false;
  redibujarRegla_();
}

function reglaDobleClick_(e) {
  if (!state.modoRegla) return;
  if (e && e.originalEvent) { e.originalEvent.preventDefault(); e.originalEvent.stopPropagation(); }
  if (reglaLineaSeguimiento) { map.removeLayer(reglaLineaSeguimiento); reglaLineaSeguimiento = null; }
  actualizarPanelRegla_();
}

function reglaCerrarArea_() {
  if (reglaPuntos.length < 3) { mostrarToast_('⚠️ Se necesitan al menos 3 puntos para medir una superficie.'); return; }
  reglaCerrada = true;
  if (reglaLineaSeguimiento) { map.removeLayer(reglaLineaSeguimiento); reglaLineaSeguimiento = null; }
  redibujarRegla_();
}

function reglaMouseMove_(e) {
  if (!state.modoRegla || reglaPuntos.length === 0 || reglaCerrada) return;
  const ultimo = reglaPuntos[reglaPuntos.length - 1];
  if (!reglaLineaSeguimiento) {
    reglaLineaSeguimiento = L.polyline([ultimo, e.latlng], {
      color: '#0EA5E9', weight: 2, dashArray: '5,6', opacity: 0.85, interactive: false,
    }).addTo(map);
  } else {
    reglaLineaSeguimiento.setLatLngs([ultimo, e.latlng]);
  }
  const parcial = longitudTotal_(reglaPuntos, false) + distanciaHaversine_(ultimo, e.latlng);
  const datos = document.getElementById('regla-panel-datos');
  if (datos) {
    datos.innerHTML = '📐 <b>' + formatearDistancia_(parcial) + '</b> <span style="opacity:.6;">· ' + reglaPuntos.length + ' pts · en curso</span>';
  }
}

function redibujarRegla_() {
  reglaLayerGroup.clearLayers();
  if (reglaPuntos.length === 0) { actualizarPanelRegla_(); return; }

  if (reglaCerrada && reglaPuntos.length >= 3) {
    L.polygon(reglaPuntos, {
      color: '#0EA5E9', weight: 3, fillColor: '#38BDF8', fillOpacity: 0.18, interactive: false,
    }).addTo(reglaLayerGroup);
  } else if (reglaPuntos.length >= 2) {
    L.polyline(reglaPuntos, { color: '#0EA5E9', weight: 3, interactive: false }).addTo(reglaLayerGroup);
  }

  // Vértices con la distancia acumulada hasta ese punto.
  let acumulado = 0;
  reglaPuntos.forEach((p, i) => {
    if (i > 0) acumulado += distanciaHaversine_(reglaPuntos[i - 1], p);
    const etiqueta = i === 0 ? 'Inicio' : formatearDistancia_(acumulado);
    L.marker(p, {
      interactive: false,
      icon: L.divIcon({
        className: '', iconSize: [12, 12], iconAnchor: [6, 6],
        html: '<div style="width:12px;height:12px;border-radius:50%;background:#fff;border:2.5px solid #0EA5E9;box-shadow:0 1px 3px rgba(0,0,0,0.4);"></div>' +
              '<div style="position:absolute;left:15px;top:-4px;background:rgba(15,23,42,0.9);color:#fff;font-size:10.5px;padding:1px 5px;border-radius:4px;white-space:nowrap;">' + etiqueta + '</div>',
      }),
    }).addTo(reglaLayerGroup);
  });

  actualizarPanelRegla_();
}

function actualizarPanelRegla_() {
  const datos = document.getElementById('regla-panel-datos');
  if (!datos) return;

  datos.title = 'Clic: agrega punto · doble clic: termina · clic derecho: deshace el último · Esc: salir';
  if (reglaPuntos.length === 0) { datos.innerHTML = '📐 Clic en el mapa para medir'; return; }
  if (reglaPuntos.length === 1) { datos.innerHTML = '📐 <span style="opacity:.8;">1 punto · agrega otro</span>'; return; }

  const largo = longitudTotal_(reglaPuntos, reglaCerrada);
  datos.innerHTML = '📐 ' + (reglaCerrada && reglaPuntos.length >= 3 ? '<b>' + formatearArea_(areaEsferica_(reglaPuntos)) + '</b> · perím. ' : '<b>') +
    formatearDistancia_(largo) + (reglaCerrada ? '' : '</b>') + ' <span style="opacity:.6;">· ' + reglaPuntos.length + ' pts</span>';
}

/* ============ IMPORTAR RUTAS DESDE KML / KMZ ============
 * Trae los trazados de un archivo de Google Earth a la planificación
 * activa. Solo se importan LÍNEAS: los puntos y polígonos se ignoran,
 * porque el caso de uso son rutas de recorrido.
 *
 * Cada LineString se crea como una ENTIDAD INDEPENDIENTE. Es habitual que
 * un KMZ traiga un único Placemark con un MultiGeometry que agrupa varios
 * tramos; esos tramos se separan y cada uno pasa a ser su propia ruta,
 * que después se puede editar, unir o propagar por separado.
 *
 * Los trazados de Google Earth suelen traer cientos de puntos por tramo,
 * así que se simplifican con Douglas-Peucker antes de guardarlos.
 */
state.kmlImportacion = null;

/** Extrae el texto del KML desde un archivo .kml o .kmz. */
async function leerArchivoKml_(file) {
  const nombre = (file.name || '').toLowerCase();

  if (nombre.endsWith('.kmz')) {
    if (typeof JSZip === 'undefined') {
      throw new Error('No se pudo cargar el lector de archivos KMZ. Revisa tu conexión y recarga la página.');
    }
    const zip = await JSZip.loadAsync(file);
    // El KML principal suele llamarse doc.kml, pero no siempre.
    let entrada = zip.file('doc.kml');
    if (!entrada) {
      const candidatos = zip.file(/\.kml$/i);
      if (!candidatos || candidatos.length === 0) throw new Error('El archivo KMZ no contiene ningún KML dentro.');
      entrada = candidatos[0];
    }
    return await entrada.async('string');
  }

  return await file.text();
}

/** Devuelve las líneas del KML: [{ nombre, puntos: [LatLng, ...] }, ...] */
function extraerLineasKml_(textoKml) {
  const doc = new DOMParser().parseFromString(textoKml, 'text/xml');
  if (doc.querySelector('parsererror')) throw new Error('El archivo no es un KML válido.');

  const parsearCoordenadas = (texto) => {
    return (texto || '')
      .trim()
      .split(/\s+/)
      .map(par => {
        const t = par.split(',');
        const lng = parseFloat(t[0]), lat = parseFloat(t[1]);
        if (isNaN(lat) || isNaN(lng)) return null;
        return L.latLng(lat, lng);   // el KML viene como lng,lat,altura
      })
      .filter(Boolean);
  };

  const lineas = [];
  const placemarks = doc.getElementsByTagName('Placemark');

  for (let i = 0; i < placemarks.length; i++) {
    const pm = placemarks[i];
    const nodoNombre = pm.getElementsByTagName('name')[0];
    const base = nodoNombre ? nodoNombre.textContent.trim() : 'Ruta ' + (i + 1);

    const tramos = pm.getElementsByTagName('LineString');
    for (let j = 0; j < tramos.length; j++) {
      const nodoCoords = tramos[j].getElementsByTagName('coordinates')[0];
      if (!nodoCoords) continue;
      const puntos = parsearCoordenadas(nodoCoords.textContent);
      if (puntos.length < 2) continue;
      lineas.push({
        // Si el Placemark agrupa varios tramos, se numeran para distinguirlos.
        nombre: tramos.length > 1 ? base + ' · tramo ' + (j + 1) : base,
        puntos,
      });
    }
  }

  return lineas;
}

function abrirImportacionKml_() {
  if (!state.modoPlanificacion || !state.modoPlanificacion.planId) {
    mostrarToast_('📥 Entra primero al modo planificación del escenario donde quieres importar las rutas.');
    return;
  }
  const input = document.getElementById('input-kml');
  if (input) { input.value = ''; input.click(); }
}

async function procesarArchivoKml_(file) {
  if (!file) return;
  if (!state.modoPlanificacion || !state.modoPlanificacion.planId) {
    mostrarToast_('📥 Necesitas estar en modo planificación para importar.');
    return;
  }

  mostrarToast_('📥 Leyendo ' + file.name + '…');

  let lineas;
  try {
    const texto = await leerArchivoKml_(file);
    lineas = extraerLineasKml_(texto);
  } catch (e) {
    mostrarToast_('No se pudo leer el archivo: ' + e.message);
    console.error('importar KML:', e);
    return;
  }

  if (!lineas || lineas.length === 0) {
    mostrarToast_('⚠️ El archivo no contiene líneas. Solo se importan rutas, no puntos ni polígonos.');
    return;
  }

  // Simplificación: los trazados de Google Earth traen cientos de puntos.
  const tolerancia = 0.00004;   // unos 4 m
  let totalCrudos = 0, totalFinal = 0;
  lineas.forEach(l => {
    totalCrudos += l.puntos.length;
    l.simplificados = simplificarTrazo_(l.puntos, tolerancia);
    if (l.simplificados.length < 2) l.simplificados = l.puntos;
    l.largo = longitudTotal_(l.simplificados, false);
    totalFinal += l.simplificados.length;
  });

  state.kmlImportacion = { archivo: file.name, lineas };
  abrirModalImportarKml_(totalCrudos, totalFinal);
}

function abrirModalImportarKml_(totalCrudos, totalFinal) {
  const imp = state.kmlImportacion;
  if (!imp) return;

  const cont = document.getElementById('kml-modal-lista');
  if (!cont) return;

  document.getElementById('kml-resumen').textContent =
    imp.lineas.length + ' ruta(s) encontrada(s) en ' + imp.archivo +
    ' · ' + totalFinal + ' vértices tras simplificar (de ' + totalCrudos + ')';

  cont.innerHTML = imp.lineas.map((l, i) =>
    '<label style="display:flex;align-items:center;gap:8px;padding:6px 4px;border-bottom:1px solid var(--border);cursor:pointer;">' +
      '<input type="checkbox" data-kml-linea="' + i + '" checked>' +
      '<span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;">' +
        escapeHtml_(l.nombre) + '</span>' +
      '<span style="font-size:11px;opacity:.7;white-space:nowrap;">' +
        formatearDistancia_(l.largo) + ' · ' + l.simplificados.length + ' vért.</span>' +
    '</label>'
  ).join('');

  document.getElementById('kml-modal-error').classList.remove('show');
  document.getElementById('kml-modal-overlay').classList.add('show');
}

/* Cola de importación.
 *
 * No se piden atributos aquí: por cada ruta seleccionada se abre el
 * formulario de creación de la planificación activa, el mismo que aparece
 * al terminar de dibujar una línea a mano. Así la ruta se guarda en el
 * escenario que se está editando y con las mismas validaciones, sin
 * duplicar lógica ni listas de tipos.
 */
state.kmlCola = null;

function confirmarImportacionKml_() {
  const imp = state.kmlImportacion;
  if (!imp) return;

  const seleccionadas = [];
  document.querySelectorAll('[data-kml-linea]').forEach(chk => {
    if (chk.checked) seleccionadas.push(imp.lineas[parseInt(chk.dataset.kmlLinea, 10)]);
  });

  if (seleccionadas.length === 0) {
    const err = document.getElementById('kml-modal-error');
    err.textContent = 'Selecciona al menos una ruta.';
    err.classList.add('show');
    return;
  }

  document.getElementById('kml-modal-overlay').classList.remove('show');
  state.kmlImportacion = null;
  state.kmlCola = { pendientes: seleccionadas, total: seleccionadas.length, hechas: 0 };
  siguienteRutaKml_();
}

/** Toma la siguiente ruta de la cola y abre el formulario de la planificación. */
function siguienteRutaKml_() {
  const cola = state.kmlCola;
  if (!cola) return;

  if (cola.pendientes.length === 0) {
    const n = cola.hechas;
    state.kmlCola = null;
    mostrarToast_(n > 0 ? '📥 ' + n + ' ruta(s) importada(s).' : 'Importación terminada.');
    if (state.activeComunaId) loadPlanificacionRecursos_(state.activeComunaId);
    return;
  }

  if (!state.modoPlanificacion) {
    state.kmlCola = null;
    mostrarToast_('📥 Se salió del modo planificación: importación cancelada.');
    return;
  }

  const ruta = cola.pendientes.shift();
  cola.actual = ruta;

  // Se reutiliza exactamente el mismo flujo que al terminar un dibujo a mano.
  state.editingIdPlan = null;
  state.pendingLatLng = null;
  state.pendingAreaPuntos = null;
  state.pendingLineaPuntos = ruta.simplificados.slice();

  const esc = state.modoPlanificacion.escenario;
  const ico = esc === 'Verde' ? '🟢' : esc === 'Amarilla' ? '🟡' : '🔴';
  const restantes = cola.pendientes.length;

  document.getElementById('modal-title').textContent =
    'Línea importada — ' + ico + ' ' + nombreEscenario_(esc);
  document.getElementById('modal-coords').textContent =
    escapeHtml_(ruta.nombre) + ' · ' + ruta.simplificados.length + ' vértices · ' +
    formatearDistancia_(ruta.largo) +
    '  (ruta ' + (cola.total - restantes) + ' de ' + cola.total + ')';
  actualizarTipoRecursoPorInstitucion_();
  document.getElementById('f-descripcion').value = ruta.nombre || '';
  document.getElementById('modal-fechas-wrap').style.display = 'none';
  document.getElementById('modal-periodo-wrap').style.display = 'none';
  document.getElementById('modal-error').classList.remove('show');
  document.getElementById('btn-save-modal').textContent =
    restantes > 0 ? 'Guardar y seguir (' + restantes + ' más)' : 'Guardar en la planificación';
  document.getElementById('modal-overlay').classList.add('show');
}

/* ============ DIBUJO A MANO ALZADA (TRAZO LIBRE) ============
 * Evita tener que hacer clic vértice por vértice: se mantiene pulsado el
 * botón del mouse y se arrastra, y el recorrido se captura de corrido.
 *
 * Al soltar, el trazado se simplifica con el algoritmo de Douglas-Peucker:
 * un trazo a mano genera cientos de puntos casi colineales, y guardarlos
 * todos haría la geometría pesada y el mapa lento sin ganar precisión.
 * La tolerancia se ajusta al zoom, de modo que al alejarse no se conserve
 * un detalle que de todas formas no se ve.
 */
state.dibujoLibre = false;
let trazoLibreActivo = false;
let trazoLibrePuntos = [];

function toggleDibujoLibre_() {
  if (state.dibujoModo !== 'linea' && state.dibujoModo !== 'area') {
    mostrarToast_('✍️ Elige primero 📏 Línea o 📐 Área.');
    return;
  }
  if (state.dibujoLibre && trazoLibreActivo) terminarTrazoLibre_();   // apagarlo a mitad conserva el tramo
  state.dibujoLibre = !state.dibujoLibre;
  actualizarBotonesModoDibujo_();
  if (state.dibujoLibre) {
    mostrarToast_('✍️ Trazo libre: clic para empezar, mueve el mouse y clic otra vez para terminar.');
  } else {
    mostrarToast_('Trazo libre desactivado: vuelve al dibujo por clics.');
  }
}

/** Distancia perpendicular de un punto al segmento a-b, en grados proyectados. */
function distanciaPerpendicular_(p, a, b) {
  const escalaLng = Math.cos(((a.lat + b.lat) / 2) * Math.PI / 180) || 1;
  const px = p.lng * escalaLng, py = p.lat;
  const ax = a.lng * escalaLng, ay = a.lat;
  const bx = b.lng * escalaLng, by = b.lat;
  const dx = bx - ax, dy = by - ay;
  const largo2 = dx * dx + dy * dy;
  if (largo2 === 0) return Math.hypot(px - ax, py - ay);
  let t = ((px - ax) * dx + (py - ay) * dy) / largo2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** Douglas-Peucker: conserva la forma descartando los puntos redundantes. */
function simplificarTrazo_(puntos, tolerancia) {
  if (!puntos || puntos.length < 3) return puntos || [];
  let maxDist = 0, indice = 0;
  const primero = puntos[0], ultimo = puntos[puntos.length - 1];
  for (let i = 1; i < puntos.length - 1; i++) {
    const d = distanciaPerpendicular_(puntos[i], primero, ultimo);
    if (d > maxDist) { maxDist = d; indice = i; }
  }
  if (maxDist > tolerancia) {
    const izq = simplificarTrazo_(puntos.slice(0, indice + 1), tolerancia);
    const der = simplificarTrazo_(puntos.slice(indice), tolerancia);
    return izq.slice(0, -1).concat(der);
  }
  return [primero, ultimo];
}

/** Tolerancia en grados según el zoom: más zoom, más detalle conservado. */
function toleranciaSegunZoom_() {
  const z = map.getZoom();
  // A zoom 15 ronda los 4 m; a zoom 11, unos 60 m.
  return 0.00004 * Math.pow(2, Math.max(0, 15 - z));
}

/** Muestra del trazo libre: pegada al camino más cercano si el imán está activo (Shift = sin imán). */
function puntoTrazoConIman_(e) {
  if (!imanActivo_() || (e.originalEvent && e.originalEvent.shiftKey)) return e.latlng;
  const s = snapRedVial_(e.latlng);
  return s ? s.punto : e.latlng;
}

/* Trazo libre por CLIC (19-10-2026): clic = empezar · mover el mouse SIN apretar = la ruta sigue el cursor (con el
 * 🧲 imán se pega al camino) · clic otra vez = terminar el tramo. Arrastrar con el botón apretado mueve el mapa sin
 * cortar el trazo; Esc descarta el tramo en curso. Los tramos se suman a lo ya dibujado hasta ✓ Finalizar. */
function clicTrazoLibre_(e) {
  if (!state.dibujoLibre) return;
  if (state.dibujoModo !== 'linea' && state.dibujoModo !== 'area') return;
  if (!state.editorMode && !state.modoPlanificacion) return;
  if (state.modoRegla || state.unionLinea || state.cortarRuta || state.editandoForma) return;
  if (trazoLibreActivo) {
    agregarMuestraTrazo_(puntoTrazoConIman_(e), true);
    terminarTrazoLibre_();
    return;
  }
  trazoLibreActivo = true;
  trazoLibrePuntos = [puntoTrazoConIman_(e)];
  map.doubleClickZoom.disable();     // el clic de término no debe hacer zoom
  pintarTrazoLibre_();
  actualizarBotonesModoDibujo_();
}

function agregarMuestraTrazo_(punto, forzar) {
  const ultimo = trazoLibrePuntos[trazoLibrePuntos.length - 1];
  // Umbral mínimo entre muestras: evita acumular cientos de puntos pegados.
  if (!forzar && ultimo && distanciaHaversine_(ultimo, punto) < 3) return;
  trazoLibrePuntos.push(punto);
}

// Vista previa: lo ya dibujado + el tramo en curso, para que se vea continuo.
function pintarTrazoLibre_() {
  const puntos = tempDibujoVertices.concat(trazoLibrePuntos);
  if (tempDibujoLayer) tempDibujoLayer.setLatLngs(puntos);
  else tempDibujoLayer = (state.dibujoModo === 'area')
    ? L.polygon(puntos, { color: '#7C3AED', weight: 3, fillOpacity: 0.12 }).addTo(map)
    : L.polyline(puntos, { color: '#7C3AED', weight: 4 }).addTo(map);
  const caja = document.getElementById('regla-medicion');
  if (caja) {
    caja.innerHTML = '✍️ <b>' + formatearDistancia_(longitudTotal_(puntos, false)) + '</b>' +
      ' <span style="opacity:.7;">· tramo ' + formatearDistancia_(longitudTotal_(trazoLibrePuntos, false)) + '</span>';
    caja.style.display = 'block';
  }
}

function continuarTrazoLibre_(e) {
  if (!trazoLibreActivo) return;
  // Con un botón apretado se está moviendo el mapa: no se dibuja.
  if (e.originalEvent && e.originalEvent.buttons) return;
  agregarMuestraTrazo_(puntoTrazoConIman_(e), false);
  pintarTrazoLibre_();
}

function descartarTramoLibre_() {
  if (!trazoLibreActivo) return;
  trazoLibreActivo = false;
  trazoLibrePuntos = [];
  map.doubleClickZoom.enable();
  if (tempDibujoLayer) { map.removeLayer(tempDibujoLayer); tempDibujoLayer = null; }
  if (tempDibujoVertices.length) {
    tempDibujoLayer = (state.dibujoModo === 'area')
      ? L.polygon(tempDibujoVertices, { color: '#7C3AED', weight: 3, dashArray: '8,6', fillOpacity: 0.12 }).addTo(map)
      : L.polyline(tempDibujoVertices, { color: '#7C3AED', weight: 4, dashArray: '8,6' }).addTo(map);
  }
  actualizarBotonesModoDibujo_();
  mostrarToast_('✍️ Tramo descartado.');
}
document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && trazoLibreActivo) descartarTramoLibre_(); });

function terminarTrazoLibre_() {
  if (!trazoLibreActivo) return;
  trazoLibreActivo = false;
  setTimeout(() => { try { map.doubleClickZoom.enable(); } catch (x) {} }, 400);

  const crudos = trazoLibrePuntos.slice();
  trazoLibrePuntos = [];

  const minimo = state.dibujoModo === 'area' && !tempDibujoVertices.length ? 3 : 2;
  if (crudos.length < minimo) {
    mostrarToast_('✍️ Tramo demasiado corto: tras el primer clic mueve el mouse antes de hacer el segundo.');
    if (tempDibujoLayer) { map.removeLayer(tempDibujoLayer); tempDibujoLayer = null; }
    if (tempDibujoVertices.length) {
      tempDibujoLayer = (state.dibujoModo === 'area')
        ? L.polygon(tempDibujoVertices, { color: '#7C3AED', weight: 3, dashArray: '8,6', fillOpacity: 0.12 }).addTo(map)
        : L.polyline(tempDibujoVertices, { color: '#7C3AED', weight: 4, dashArray: '8,6' }).addTo(map);
    }
    actualizarBotonesModoDibujo_();
    return;
  }

  const simplificados = simplificarTrazo_(crudos, toleranciaSegunZoom_());
  const puntos = simplificados.length >= minimo ? simplificados : crudos;

  // Los vértices del trazo se AÑADEN a lo que ya hubiera dibujado, así se
  // pueden combinar tramos a mano alzada con vértices puestos por clic.
  guardarPasoDibujo_();
  tempDibujoVertices = tempDibujoVertices.concat(puntos);

  if (tempDibujoLayer) { map.removeLayer(tempDibujoLayer); tempDibujoLayer = null; }
  tempDibujoLayer = (state.dibujoModo === 'area')
    ? L.polygon(tempDibujoVertices, { color: '#7C3AED', weight: 3, dashArray: '8,6', fillOpacity: 0.12 }).addTo(map)
    : L.polyline(tempDibujoVertices, { color: '#7C3AED', weight: 4, dashArray: '8,6' }).addTo(map);

  redibujarVerticesEdicion_();
  actualizarBotonesModoDibujo_();

  const ahorro = crudos.length > 0 ? Math.round((1 - puntos.length / crudos.length) * 100) : 0;
  mostrarToast_('✍️ Trazo capturado: ' + puntos.length + ' vértices (' + ahorro + '% menos que las ' + crudos.length + ' muestras).');
}

/* Botón del medio (rueda apretada) + arrastre = desplazar el mapa, en cualquier
 * modo. Clave en el trazo libre, donde el arrastre con el botón izquierdo dibuja:
 * así se puede mover el mapa a mitad de una ruta sin cortar el trazo ni crear
 * puntos. Leaflet no desplaza con el botón del medio, por eso va aparte. */
(function panConBotonMedio_() {
  const cont = map.getContainer();
  let ultimo = null;
  cont.addEventListener('mousedown', (e) => {
    if (e.button !== 1) return;
    e.preventDefault();                 // evita el autodesplazamiento del navegador
    ultimo = { x: e.clientX, y: e.clientY };
    cont.classList.add('pan-boton-medio');
  });
  window.addEventListener('mousemove', (e) => {
    if (!ultimo) return;
    const dx = e.clientX - ultimo.x, dy = e.clientY - ultimo.y;
    ultimo = { x: e.clientX, y: e.clientY };
    if (dx || dy) map.panBy([-dx, -dy], { animate: false });
  });
  window.addEventListener('mouseup', (e) => {
    if (e.button !== 1 || !ultimo) return;
    ultimo = null;
    cont.classList.remove('pan-boton-medio');
  });
  // Sin esto, soltar el botón del medio sobre un enlace o popup abre otra pestaña.
  cont.addEventListener('auxclick', (e) => { if (e.button === 1) e.preventDefault(); });
})();

function actualizarBotonesModoDibujo_() {
  document.getElementById('btn-modo-punto').classList.toggle('active', state.dibujoModo === 'punto');
  document.getElementById('btn-modo-linea').classList.toggle('active', state.dibujoModo === 'linea');
  document.getElementById('btn-modo-area').classList.toggle('active', state.dibujoModo === 'area');

  const enDibujo = state.dibujoModo === 'linea' || state.dibujoModo === 'area';
  const minimo = MIN_VERTICES[state.dibujoModo] || 0;

  // Trazo libre: solo tiene sentido dibujando líneas o áreas.
  const btnLibre = document.getElementById('btn-dibujo-libre');
  if (btnLibre) {
    btnLibre.style.display = enDibujo ? 'inline-block' : 'none';
    btnLibre.classList.toggle('active', enDibujo && !!state.dibujoLibre);
    if (!enDibujo) state.dibujoLibre = false;
  }
  // Imán a la Red Vial: solo al crear líneas.
  const btnIman = document.getElementById('btn-iman-red-vial');
  if (btnIman) {
    btnIman.style.display = state.dibujoModo === 'linea' ? 'inline-block' : 'none';
    btnIman.classList.toggle('active', state.dibujoModo === 'linea' && !!state.imanRedVial && !!(state.redVialOn || state.redVialCmpcOn));
  }
  // ✂️ Cortar ruta: solo planificando (rutas de los escenarios) y sin un dibujo en curso
  const btnCortar = document.getElementById('btn-cortar-ruta');
  if (btnCortar) {
    btnCortar.style.display = (state.modoPlanificacion && !(enDibujo && tempDibujoVertices.length)) ? 'inline-block' : 'none';
    btnCortar.classList.toggle('active', !!state.cortarRuta);
  }
  document.getElementById('btn-finalizar-dibujo').style.display = (enDibujo && tempDibujoVertices.length >= minimo) ? 'inline-block' : 'none';
  document.getElementById('btn-cancelar-dibujo').style.display = (enDibujo && tempDibujoVertices.length > 0) ? 'inline-block' : 'none';

  if (enDibujo && state.dibujoLibre) {
    document.getElementById('editor-banner-texto').textContent =
      (state.dibujoModo === 'area' ? 'Área' : 'Línea') + ' · ✍️ ' + tempDibujoVertices.length + ' vért. — ' +
      (trazoLibreActivo
        ? 'TRAZANDO: mueve el mouse' + (imanActivo_() ? ' (🧲 se pega al camino)' : '') + ' · clic = terminar tramo · arrastrar = mover el mapa · Esc = descartar tramo'
        : 'clic para EMPEZAR el trazo, mueve el mouse sin apretar y clic otra vez para terminar · luego ✓ Finalizar');
  } else if (state.dibujoModo === 'linea') {
    document.getElementById('editor-banner-texto').textContent = 'Línea · ' + tempDibujoVertices.length + ' vért. (mín. 2) — clic agrega punto' +
      (imanActivo_() ? ' · 🧲 se pega al camino (Shift = sin imán)' : '') +
      ' · arrastra un vértice para moverlo o un punto intermedio para insertar · clic derecho borra · ↶ Atrás o Ctrl+Z deshace';
  } else if (state.dibujoModo === 'area') {
    document.getElementById('editor-banner-texto').textContent = 'Área · ' + tempDibujoVertices.length + ' vért. (mín. 3) — clic agrega vértice · arrastra para mover · punto intermedio = insertar · clic derecho borra';
  } else {
    document.getElementById('editor-banner-texto').textContent = 'Modo edición activo — haz clic en el mapa para posicionar un recurso';
  }

  // Marca para el CSS: con dibujo activo las etiquetas no capturan el clic.
  const contenedorMapa = document.getElementById('map');
  const dibujandoDeVerdad = (!!state.editorMode || !!state.modoPlanificacion) && !!enDibujo;
  if (contenedorMapa) contenedorMapa.classList.toggle('modo-dibujo', dibujandoDeVerdad || !!state.editandoForma);

  // Regla de medición: se actualiza en cada cambio de la geometría.
  actualizarReglaMedicion_();
  actualizarBotonDeshacer_();
}

function setModoDibujo_(modo) {
  cancelarDibujo_();
  state.dibujoModo = modo;
  // Cerrar cualquier tarjeta de hover que haya quedado abierta: si no, se
  // queda flotando sobre el mapa mientras se dibuja.
  cerrarTarjetasHover_();
  actualizarBotonesModoDibujo_();
}

/** Restaura las etiquetas que estuvieran mostrando el detalle de hover. */
function cerrarTarjetasHover_() {
  try {
    document.querySelectorAll('.map-label-detalle').forEach(el => {
      el.classList.remove('map-label-detalle');
    });
  } catch (e) { /* no debe interrumpir el flujo */ }
}

function cancelarDibujo_() {
  // Si quedó un trazo libre a medias, se suelta el mapa antes de limpiar.
  if (trazoLibreActivo) {
    trazoLibreActivo = false;
    trazoLibrePuntos = [];
    try { map.dragging.enable(); if (map.boxZoom) map.boxZoom.enable(); map.doubleClickZoom.enable(); } catch (e) {}
  }
  tempDibujoVertices = [];
  ultimoSnapIman_ = null;
  if (tempDibujoLayer) { map.removeLayer(tempDibujoLayer); tempDibujoLayer = null; }
  tempVerticeMarkers.clearLayers();
  reiniciarPasosDibujo_();
  actualizarBotonesModoDibujo_();
}

function finalizarDibujo_() {
  const minimo = MIN_VERTICES[state.dibujoModo] || 0;
  if (tempDibujoVertices.length < minimo) return;

  state.editingIdPlan = null;
  state.pendingLatLng = null;
  state.pendingLineaPuntos = state.dibujoModo === 'linea' ? tempDibujoVertices.slice() : null;
  state.pendingAreaPuntos = state.dibujoModo === 'area' ? tempDibujoVertices.slice() : null;

  if (state.modoRecursosArea) {
    abrirModalRecursoAreaDesdeDibujo_();
    return;
  }

  if (state.modoPlanificacion) {
    const icoEscModal = state.modoPlanificacion.escenario === 'Verde' ? '🟢' : state.modoPlanificacion.escenario === 'Amarilla' ? '🟡' : '🔴';
    document.getElementById('modal-title').textContent = (state.dibujoModo === 'area' ? 'Área planificada — ' : 'Línea planificada — ') + icoEscModal + ' ' + nombreEscenario_(state.modoPlanificacion.escenario);
    document.getElementById('modal-coords').textContent = tempDibujoVertices.length + ' vértices trazados';
    document.getElementById('f-institucion').selectedIndex = 0;
    actualizarTipoRecursoPorInstitucion_();
    document.getElementById('f-tipo-recurso').selectedIndex = 0;
    document.getElementById('f-descripcion').value = '';
    document.getElementById('modal-fechas-wrap').style.display = 'none';
    document.getElementById('modal-periodo-wrap').style.display = 'none';
    document.getElementById('modal-error').classList.remove('show');
    document.getElementById('btn-save-modal').textContent = 'Guardar en la planificación';
    document.getElementById('modal-overlay').classList.add('show');
    return;
  }

  const hayPeriodoActivo = state.periodos.some(p => p.estado_periodo === 'activo');
  if (!hayPeriodoActivo) {
    mostrarToast_('Todo recurso debe pertenecer a un Periodo Crítico. Crea uno primero.');
    return;
  }
  document.getElementById('modal-title').textContent = state.dibujoModo === 'area' ? 'Nueva área de copamiento' : 'Nueva línea de copamiento';
  document.getElementById('modal-coords').textContent = tempDibujoVertices.length + ' vértices trazados';
  document.getElementById('f-institucion').selectedIndex = 0;
  document.getElementById('f-tipo-recurso').selectedIndex = 0;
  { const per = periodoActivoActual_();
    document.getElementById('f-fecha-inicio').value = per ? (per.fecha_inicio || '') : '';
    document.getElementById('f-fecha-termino').value = per ? (per.fecha_fin || '') : ''; }
  document.getElementById('f-periodo').selectedIndex = 0;
  document.getElementById('f-descripcion').value = '';
  document.getElementById('modal-fechas-wrap').style.display = '';
  document.getElementById('modal-periodo-wrap').style.display = '';
  document.getElementById('modal-error').classList.remove('show');
  document.getElementById('btn-save-modal').textContent = state.dibujoModo === 'area' ? 'Guardar área' : 'Guardar línea';
  document.getElementById('modal-overlay').classList.add('show');
}

map.on('click', (e) => {
  if (state.modoRegla) return;      // la regla toma el control del clic
  if (state.cortarRuta) return;     // ✂️ Cortar ruta toma el control del clic
  if (state.dibujoLibre && (state.dibujoModo === 'linea' || state.dibujoModo === 'area')) return; // el trazo libre usa arrastre, no clic
  if (state.editandoForma) return; // en edición de forma: solo arrastrar/borrar vértices, no agregar por clic
  if (!state.editorMode) return;

  if (state.dibujoModo === 'linea' || state.dibujoModo === 'area') {
    // Imán a la Red Vial (solo líneas): el vértice se pega al camino y, si el
    // anterior también estaba en ese tramo, se agregan los vértices de la curva.
    const conIman = verticesConIman_(e.latlng, e.originalEvent);
    guardarPasoDibujo_();
    if (conIman) conIman.forEach(v => tempDibujoVertices.push(v));
    else tempDibujoVertices.push(e.latlng);
    if (!tempDibujoLayer) {
      tempDibujoLayer = state.dibujoModo === 'area'
        ? L.polygon(tempDibujoVertices, { color: '#2563EB', weight: 3, dashArray: '8,6', fillOpacity: 0.12 }).addTo(map)
        : L.polyline(tempDibujoVertices, { color: '#2563EB', weight: 4, dashArray: '8,6' }).addTo(map);
    } else {
      tempDibujoLayer.setLatLngs(tempDibujoVertices);
    }
    redibujarVerticesEdicion_();
    actualizarBotonesModoDibujo_();
    return;
  }

  if (state.modoRecursosArea) {
    state.editingIdPlan = null;
    state.pendingLatLng = e.latlng;
    state.pendingLineaPuntos = null;
    state.pendingAreaPuntos = null;
    abrirModalRecursoAreaDesdeDibujo_();
    return;
  }

  if (state.modoPlanificacion) {
    state.editingIdPlan = null;
    state.pendingLatLng = e.latlng;
    state.pendingLineaPuntos = null;
    state.pendingAreaPuntos = null;
    document.getElementById('modal-title').textContent = 'Recurso planificado — ' + (state.modoPlanificacion.escenario === 'Verde' ? '🟢' : state.modoPlanificacion.escenario === 'Amarilla' ? '🟡' : '🔴') + ' ' + nombreEscenario_(state.modoPlanificacion.escenario);
    document.getElementById('modal-coords').textContent = 'Lat ' + e.latlng.lat.toFixed(4) + ', Lng ' + e.latlng.lng.toFixed(4);
    document.getElementById('f-institucion').selectedIndex = 0;
    actualizarTipoRecursoPorInstitucion_();
    document.getElementById('f-tipo-recurso').selectedIndex = 0;
    document.getElementById('f-descripcion').value = '';
    document.getElementById('modal-fechas-wrap').style.display = 'none';
    document.getElementById('modal-periodo-wrap').style.display = 'none';
    document.getElementById('modal-error').classList.remove('show');
    document.getElementById('btn-save-modal').textContent = 'Guardar en la planificación';
    document.getElementById('modal-overlay').classList.add('show');
    return;
  }

  const hayPeriodoActivo = state.periodos.some(p => p.estado_periodo === 'activo');
  if (!hayPeriodoActivo) {
    mostrarToast_('Todo recurso debe pertenecer a un Periodo Crítico. Crea uno con "+ Nuevo Periodo Crítico" en la pestaña Copamiento antes de agregar puntos.');
    return;
  }
  state.editingIdPlan = null;
  state.pendingLatLng = e.latlng;
  state.pendingLineaPuntos = null;
  state.pendingAreaPuntos = null;
  document.getElementById('modal-title').textContent = 'Asignar Institución/Empresa al Periodo Crítico';
  document.getElementById('modal-coords').textContent = 'Lat ' + e.latlng.lat.toFixed(4) + ', Lng ' + e.latlng.lng.toFixed(4);
  document.getElementById('f-institucion').selectedIndex = 0;
  document.getElementById('f-tipo-recurso').selectedIndex = 0;
  actualizarTipoRecursoPorInstitucion_();
  { const per = periodoActivoActual_();
    document.getElementById('f-fecha-inicio').value = per ? (per.fecha_inicio || '') : '';
    document.getElementById('f-fecha-termino').value = per ? (per.fecha_fin || '') : ''; }
  document.getElementById('f-periodo').selectedIndex = 0;
  document.getElementById('f-descripcion').value = '';
  document.getElementById('modal-fechas-wrap').style.display = '';
  document.getElementById('modal-periodo-wrap').style.display = '';
  document.getElementById('modal-error').classList.remove('show');
  document.getElementById('btn-save-modal').textContent = 'Guardar recurso';
  document.getElementById('modal-overlay').classList.add('show');
});

function abrirModalEdicion_(idRecurso) {
  const r = state.recursos.find(x => x.id === idRecurso);
  if (!r) return;
  if (periodoCerrado_(r.id_periodo)) { mostrarToast_('Este recurso pertenece a un periodo cerrado y no se puede editar.'); return; }
  state.editingIdPlan = idRecurso;
  state.pendingLatLng = null;

  document.getElementById('modal-title').textContent = 'Asignar Institución/Empresa al Periodo Crítico';
  document.getElementById('modal-coords').textContent = (r.lat != null && r.lng != null)
    ? ('Lat ' + Number(r.lat).toFixed(4) + ', Lng ' + Number(r.lng).toFixed(4))
    : (iconoTipoGeometria_(r.tipo_geometria) + ' (la geometría no se edita aquí — elimina y vuelve a trazarla si necesitas cambiarla)');
  document.getElementById('f-institucion').value = r.institucion_id;
  actualizarTipoRecursoPorInstitucion_();
  // Si el tipo guardado ya no está en la lista, se agrega para no perderlo.
  const fTipoEd = document.getElementById('f-tipo-recurso');
  const tipoGuardado = r.tipo_recurso || 'Vehículo';
  if (!Array.prototype.some.call(fTipoEd.options, o => o.value === tipoGuardado)) {
    const opt = document.createElement('option');
    opt.value = tipoGuardado;
    opt.textContent = tipoGuardado + ' (fuera del catálogo)';
    fTipoEd.appendChild(opt);
  }
  fTipoEd.value = tipoGuardado;
  document.getElementById('f-fecha-inicio').value = r.fecha_inicio || '';
  document.getElementById('f-fecha-termino').value = r.fecha_termino || '';
  document.getElementById('f-periodo').value = r.periodo_trabajo || 'Turno mañana (08:00–14:00)';
  document.getElementById('f-descripcion').value = r.descripcion || '';
  document.getElementById('modal-error').classList.remove('show');
  document.getElementById('btn-save-modal').textContent = 'Actualizar recurso';
  document.getElementById('modal-overlay').classList.add('show');
  map.closePopup();
}

function bindPopupActions_() {
  document.querySelectorAll('.popup-btn[data-action="editar"]').forEach(btn => {
    btn.onclick = () => abrirModalEdicion_(btn.dataset.id);
  });
  document.querySelectorAll('.popup-btn[data-action="editar-forma"]').forEach(btn => {
    btn.onclick = () => iniciarEdicionForma_('copamiento', btn.dataset.id);
  });
  document.querySelectorAll('.popup-btn[data-action="eliminar"]').forEach(btn => {
    btn.onclick = () => eliminarRecurso_(btn.dataset.id);
  });
  document.querySelectorAll('.popup-btn[data-action="windy"]').forEach(btn => {
    btn.onclick = () => abrirWindy_(Number(btn.dataset.lat), Number(btn.dataset.lng));
  });
}

