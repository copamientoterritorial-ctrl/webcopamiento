/* ============ UNIR DOS LÍNEAS POR EL VÉRTICE ELEGIDO ============
 * Pensado para caminos con cruces, donde la ruta de un recurso se dibujó por
 * tramos y hay que consolidarla en un trazado continuo.
 *
 * A diferencia de una unión por extremos, aquí TÚ eliges en qué vértice se
 * empalma cada línea. Al pulsar 🔗 Unir aparecen todos los vértices de las
 * líneas visibles como puntos azules; haces clic en el vértice de la primera
 * línea y luego en el de la segunda.
 *
 * Qué se conserva: cada línea se recorta en el vértice indicado y se queda el
 * tramo MÁS LARGO de los dos que quedan. Si el vértice elegido es un extremo,
 * no se recorta nada y se une la línea completa. La segunda línea se elimina.
 */
state.unionLinea = null;          // { id, institucionId, indice, vertices }
const unionVerticesLayer = L.layerGroup();

function salirModoUnionLinea_() {
  state.unionLinea = null;
  state.unionEscenario = null;
  try { unionVerticesLayer.clearLayers(); map.removeLayer(unionVerticesLayer); } catch (e) {}
  const caja = document.getElementById('regla-medicion');
  if (caja && caja.dataset.modoUnion === '1') {
    caja.style.display = 'none';
    caja.innerHTML = '';
    delete caja.dataset.modoUnion;
  }
}

function avisoUnionLinea_(texto) {
  const caja = document.getElementById('regla-medicion');
  if (!caja) return;
  caja.dataset.modoUnion = '1';
  caja.innerHTML = '<div style="white-space:normal;max-width:260px;"><b>🔗 Unir líneas</b> · ' +
                   '<span style="font-size:11.5px;">' + texto + '</span></div>';
  caja.style.display = 'block';
}

/** Dibuja los vértices seleccionables.
 *  excluirId: línea que NO se ofrece (la ya elegida).
 *  soloId: si se indica, se muestran únicamente los vértices de esa línea.
 *  Mostrar de a una evita la confusión de ver todos los vértices del mapa
 *  a la vez sin saber cuál pertenece a qué ruta. */
function mostrarVerticesUnion_(excluirId, soloId, escenario) {
  unionVerticesLayer.clearLayers();
  if (!map.hasLayer(unionVerticesLayer)) unionVerticesLayer.addTo(map);

  const registro = window.planRecursosMarkersById || {};
  Object.keys(registro).forEach(idRec => {
    if (excluirId && String(idRec) === String(excluirId)) return;
    if (soloId && String(idRec) !== String(soloId)) return;
    const capa = registro[idRec];
    if (!capa || !capa._esLinea) return;
    // La unión se confina al escenario que se está editando: mezclar líneas
    // de Verde, Amarilla y Roja rompería la coherencia del copamiento.
    if (escenario && capa._escenario !== escenario) return;

    const partes = partesDeLinea_(capa);
    if (partes.length === 0) return;

    partes.forEach((vs, idxParte) => {
      vs.forEach((v, idx) => {
        const esExtremo = (idx === 0 || idx === vs.length - 1);
        const marcador = L.marker(v, {
          icon: L.divIcon({
            className: '', iconSize: [14, 14], iconAnchor: [7, 7],
            html: '<div style="width:14px;height:14px;border-radius:50%;background:' +
                  (esExtremo ? '#0EA5E9' : '#fff') + ';border:3px solid #0EA5E9;box-shadow:0 1px 4px rgba(0,0,0,0.45);cursor:pointer;"></div>',
          }),
          zIndexOffset: 1200,
        });
        marcador.on('click', (ev) => {
          if (ev && ev.originalEvent) L.DomEvent.stopPropagation(ev.originalEvent);
          elegirVerticeUnion_(idRec, capa, { parte: idxParte, indice: idx }, partes);
        });
        unionVerticesLayer.addLayer(marcador);
      });
    });
  });
}

/** Devuelve los tramos de una línea como arreglo de arreglos de latlng.
 *  Una línea simple tiene un solo tramo; una ruta unida tiene varios. */
function partesDeLinea_(capa) {
  if (!capa || typeof capa.getLatLngs !== 'function') return [];
  const crudos = capa.getLatLngs();
  if (!crudos || crudos.length === 0) return [];
  const partes = Array.isArray(crudos[0]) ? crudos : [crudos];
  return partes
    .map(parte => (parte || []).filter(p => p && typeof p.lat === 'number' && typeof p.lng === 'number'))
    .filter(parte => parte.length >= 2);
}

/** Extrae los vértices de una capa de línea como arreglo plano (compatibilidad). */
function verticesDeLinea_(capa) {
  const partes = partesDeLinea_(capa);
  if (partes.length === 0) return null;
  return partes.reduce((acc, p) => acc.concat(p), []);
}

/* Construye la ruta unida conservando TODOS los vértices y SIN repetir
 * ningún tramo.
 *
 * La entidad resultante es una multilínea: los tramos de ambas rutas se
 * guardan como partes separadas que se tocan exactamente en el vértice de
 * empalme. El vértice elegido de la segunda línea se desplaza a la posición
 * del vértice elegido de la primera, que es lo que significa unirlos.
 *
 * Así no hay ida y vuelta artificial y la longitud calculada es la real.
 */
function construirRutaUnida_(partesA, refA, partesB, refB) {
  const empalme = partesA[refA.parte][refA.indice];

  // Los tramos de A se conservan tal cual.
  const partes = partesA.map(parte => parte.slice());

  // Los de B también, salvo el vértice de empalme, que se mueve al de A.
  partesB.forEach((parte, idxParte) => {
    const copia = parte.slice();
    if (idxParte === refB.parte) copia[refB.indice] = empalme;
    partes.push(copia);
  });

  const totalVertices = partes.reduce((n, p) => n + p.length, 0);
  return { partes, tramos: partes.length, totalVertices };
}

async function elegirVerticeUnion_(idRec, capa, refVertice, partes) {
  // ---- Primer vértice ----
  if (!state.unionLinea) {
    state.unionLinea = {
      id: idRec,
      institucionId: capa._institucionId,
      ref: refVertice,
      partes,
      escenario: capa._escenario || null,
    };
    try { capa.setStyle({ dashArray: '8,6', weight: 6 }); } catch (e) {}
    const esc = capa._escenario || state.unionEscenario || null;
    avisoUnionLinea_('<b>Paso 2 de 2</b>' + (esc ? ' · ' + nombreEscenario_(esc) : '') + '<br>' +
                     'Punto de enganche marcado. Ahora haz clic en el punto azul de la <b>otra línea</b> que debe quedar unido a ese.<br><br>' +
                     '<span style="opacity:.7;">Solo se muestran líneas de ' + (esc ? nombreEscenario_(esc) : 'el mismo escenario') + '.<br>Escape para cancelar.</span>');
    // Solo las demás líneas del MISMO escenario.
    mostrarVerticesUnion_(idRec, null, esc);
    return;
  }

  const primera = state.unionLinea;
  if (String(primera.id) === String(idRec)) {
    mostrarToast_('⚠️ Elige un vértice de OTRA línea.');
    return;
  }
  // Blindaje: nunca unir entre escenarios distintos.
  if (primera.escenario && capa._escenario && primera.escenario !== capa._escenario) {
    mostrarToast_('🔒 Solo se pueden unir líneas del mismo escenario (' + nombreEscenario_(primera.escenario) + ').');
    return;
  }

  if (String(primera.institucionId) !== String(capa._institucionId)) {
    if (!confirm('Las dos líneas pertenecen a instituciones distintas.\n\nLa ruta resultante quedará asignada a la institución de la primera. ¿Continuar?')) return;
  }

  // ---- Armar la multilínea ----
  const resultado = construirRutaUnida_(primera.partes, primera.ref, partes, refVertice);
  const longitudTotalRuta = resultado.partes.reduce((n, p) => n + longitudTotal_(p, false), 0);
  const separacion = distanciaHaversine_(
    primera.partes[primera.ref.parte][primera.ref.indice],
    partes[refVertice.parte][refVertice.indice]
  );

  const aviso =
    'Unir las dos líneas en el vértice elegido.\n\n' +
    'No se descarta ningún vértice y ningún tramo se recorre dos veces:\n' +
    'la ruta queda como una geometría de varios tramos que se tocan en el\n' +
    'punto de empalme.\n\n' +
    'Tramos de la ruta final: ' + resultado.tramos + '\n' +
    'Vértices: ' + resultado.totalVertices + '\n' +
    'Longitud real: ' + formatearDistancia_(longitudTotalRuta) + '\n' +
    'Separación entre los vértices elegidos: ' + formatearDistancia_(separacion) + '\n\n' +
    'La segunda línea se eliminará y su trazado pasa a formar parte de la primera. ¿Continuar?';
  if (!confirm(aviso)) return;

  const partesGeo = resultado.partes.map(parte => parte.map(ll => [ll.lng, ll.lat]));
  // Una sola llamada: el servidor actualiza la de destino y elimina la
  // absorbida en la misma transacción. Antes se hacían dos llamadas y, si
  // el DELETE quedaba bloqueado por RLS, PostgREST respondía con éxito sin
  // borrar nada y la ruta aparecía duplicada en el mapa.
  const { data: resUnion, error: errUnion } = await supabaseClient.rpc('unir_lineas_planificacion', {
    p_id_destino: primera.id,
    p_partes: partesGeo,
    p_id_eliminar: idRec,
  });

  if (errUnion) {
    mostrarToast_('No se pudo unir: ' + errUnion.message);
    console.error('unir_lineas_planificacion:', errUnion);
    return;
  }

  const fila = (resUnion && resUnion[0]) ? resUnion[0] : null;
  if (!fila || fila.ok === false) {
    mostrarToast_('No se pudo unir: ' + ((fila && fila.mensaje) || 'respuesta vacía del servidor.'));
    return;
  }

  salirModoUnionLinea_();
  map.closePopup();
  mostrarToast_('🔗 Rutas unidas: ' + resultado.tramos + ' tramo(s), ' + formatearDistancia_(longitudTotalRuta) + '.');
  await loadPlanificacionRecursos_(state.activeComunaId);
}

/** Extrae los vértices de una capa de línea como arreglo plano. */
function verticesDeLinea_(capa) {
  if (!capa || typeof capa.getLatLngs !== 'function') return null;
  const crudos = capa.getLatLngs();
  if (!crudos || crudos.length === 0) return null;
  const planos = Array.isArray(crudos[0]) ? crudos[0] : crudos;
  return planos.filter(p => p && typeof p.lat === 'number' && typeof p.lng === 'number');
}

/* ============ SEPARAR UNA RUTA UNIDA EN SUS LÍNEAS ============
 * Operación inversa de la unión por vértice. Cada tramo vuelve a ser una
 * entidad independiente, heredando institución, tipo, descripción y plan.
 *
 * Para corregir la forma ya NO hace falta separar: ✏️ Editar forma edita la
 * ruta unida con todos sus tramos a la vez (iniciarEdicionFormaMulti_).
 */
async function separarRutaPlanificacion_(id) {
  if (!state.modoPlanificacion && !state.editorMode) {
    mostrarToast_('✏️ Activa el modo edición para separar rutas.');
    return;
  }
  if (!id) return;

  const capa = window.planRecursosMarkersById && window.planRecursosMarkersById[id];
  const partes = partesDeLinea_(capa);
  const nTramos = partes.length || 0;

  const aviso =
    'Separar esta ruta en sus líneas individuales.\n\n' +
    (nTramos > 1 ? 'Tramos detectados: ' + nTramos + '\n' : '') +
    'El primer tramo se queda en esta entidad y cada tramo adicional pasa a\n' +
    'ser una entidad nueva, con la misma institución, tipo de recurso y\n' +
    'descripción.\n\n' +
    'Después podrás editar la forma de cada una por separado y volver a\n' +
    'unirlas si quieres. ¿Continuar?';
  if (!confirm(aviso)) return;

  mostrarToast_('✂️ Separando la ruta…');

  const { data, error } = await supabaseClient.rpc('separar_ruta_planificacion', { p_id: id });
  if (error) {
    mostrarToast_('No se pudo separar: ' + error.message);
    console.error('separar_ruta_planificacion:', error);
    return;
  }

  const fila = (data && data[0]) ? data[0] : null;
  if (!fila || fila.ok === false) {
    mostrarToast_('ℹ️ ' + ((fila && fila.mensaje) || 'No hubo cambios.'));
    return;
  }

  map.closePopup();
  mostrarToast_('✂️ ' + fila.mensaje);
  await loadPlanificacionRecursos_(state.activeComunaId);
}

/* ============ ✂️ CORTAR UNA RUTA EN DOS (13-10-2026) ============
 * Barra del modo edición › ✂️ Cortar ruta: clic SOBRE una ruta (línea) del escenario que se
 * está planificando, en el punto de corte. Se ve la vista previa de los dos tramos y, al
 * confirmar:
 *   · el tramo 1 se queda en la MISMA entidad (conserva su id, recurso asociado y enlaces);
 *   · el tramo 2 pasa a ser una entidad nueva del mismo plan, con la misma institución,
 *     tipo y descripción (+ «tramo 2»), sin recurso asociado (una ruta por recurso).
 * Usa las mismas RPC que «Editar forma» y crear línea (sin SQL nuevo). Si la ruta está
 * enlazada en otros escenarios (SQL 68), allí se actualiza la forma del tramo 1. */
state.cortarRuta = null;     // { capa, id, partesA, partesB, prev: layer }
let cortarRutaPrevLayer = null;

// 14-10-2026: guía visual. Al activar se resaltan las rutas cortables (con sus vértices) y un
// marcador ✂️ sigue al mouse pegado a la ruta más cercana (imán de 28 px; se ajusta al vértice
// si está a menos de 12 px), mostrando el largo de los dos tramos. El clic corta ahí mismo.
let cortarRutaGuiaLayer = null, cortarRutaCursor = null;
const CORTE_IMAN_PX = 28, CORTE_VERTICE_PX = 12;

/** Rutas (líneas) propias del escenario que se planifica, visibles con los filtros. */
function rutasCortables_() {
  const esc = state.modoPlanificacion && state.modoPlanificacion.escenario;
  const grupo = esc === 'Verde' ? planificacionRecursosVerdeLayer : esc === 'Amarilla' ? planificacionRecursosAmarillaLayer : planificacionRecursosRojaLayer;
  const lista = [];
  grupo.eachLayer(ly => {
    if (!ly._recursoId || !ly._esLinea || ly._otraComuna) return;   // solo rutas propias de la comuna activa
    if (ly._bloqueoCmpc) return;                                       // GRD: las rutas CMPC no se cortan
    const el = ly.getElement && ly.getElement(); if (el && el.style.display === 'none') return;   // oculta por filtro
    lista.push(ly);
  });
  return lista;
}

function iniciarCortarRuta_() {
  if (!state.modoPlanificacion) { mostrarToast_('✏️ Entra a planificar un escenario para cortar rutas.'); return; }
  if (state.editandoForma) { mostrarToast_('Termina la edición de forma antes de cortar.'); return; }
  const rutas = rutasCortables_();
  if (!rutas.length) { mostrarToast_('No hay rutas (líneas) en este escenario para cortar.'); return; }
  cancelarDibujo_();
  map.closePopup();
  state.cortarRuta = { paso: 'elegir' };
  map.getContainer().classList.add('cortando-ruta');
  // Guía: halo naranjo sobre cada ruta cortable + sus vértices
  cortarRutaGuiaLayer = L.layerGroup().addTo(map);
  rutas.forEach(ly => {
    const partes = partesDeLinea_(ly);
    L.polyline(partes, { color: '#F97316', weight: 12, opacity: 0.28, interactive: false, lineCap: 'round' }).addTo(cortarRutaGuiaLayer);
    L.polyline(partes, { color: '#F97316', weight: 2, opacity: 0.9, dashArray: '6,6', interactive: false }).addTo(cortarRutaGuiaLayer);
    partes.forEach(pt => pt.forEach(ll => L.circleMarker(ll, { radius: 3.5, color: '#C2410C', weight: 1.5, fillColor: '#fff', fillOpacity: 1, interactive: false }).addTo(cortarRutaGuiaLayer)));
  });
  map.on('click', clicCortarRuta_);
  map.on('mousemove', moverCortarRuta_);
  actualizarBotonesModoDibujo_();
  document.getElementById('editor-banner-texto').textContent = '✂️ CORTAR RUTA — pasa el mouse sobre una ruta resaltada; el ✂️ marca dónde se corta. Clic para cortar (Esc para cancelar)';
  mostrarToast_('✂️ ' + rutas.length + ' ruta(s) resaltada(s). Acerca el mouse: el punto de corte se pega a la ruta.');
}
function salirCortarRuta_() {
  if (!state.cortarRuta) return;
  state.cortarRuta = null;
  map.off('click', clicCortarRuta_);
  map.off('mousemove', moverCortarRuta_);
  map.getContainer().classList.remove('cortando-ruta', 'corte-listo');
  if (cortarRutaPrevLayer) { map.removeLayer(cortarRutaPrevLayer); cortarRutaPrevLayer = null; }
  if (cortarRutaGuiaLayer) { map.removeLayer(cortarRutaGuiaLayer); cortarRutaGuiaLayer = null; }
  if (cortarRutaCursor) { map.removeLayer(cortarRutaCursor); cortarRutaCursor = null; }
  try { actualizarBotonesModoDibujo_(); } catch (e) {}
}

/** Ruta más cercana al punto (px), con el punto de corte ajustado al vértice si está cerca. */
function rutaMasCercanaParaCortar_(latlng, tolPx) {
  const p = map.latLngToLayerPoint(latlng);
  let mejor = null;
  rutasCortables_().forEach(ly => {
    partesDeLinea_(ly).forEach((parte, k) => {
      for (let i = 0; i < parte.length - 1; i++) {
        const a = map.latLngToLayerPoint(parte[i]), b = map.latLngToLayerPoint(parte[i + 1]);
        const q = L.LineUtil.closestPointOnSegment(p, a, b), d = p.distanceTo(q);
        if (!mejor || d < mejor.d) mejor = { d, capa: ly, k, i, punto: map.layerPointToLatLng(q), a, b, pa: parte[i], pb: parte[i + 1] };
      }
    });
  });
  if (!mejor || mejor.d > (tolPx || CORTE_IMAN_PX)) return null;
  // Imán al vértice más cercano del tramo tocado
  const q = map.latLngToLayerPoint(mejor.punto);
  const da = q.distanceTo(mejor.a), db = q.distanceTo(mejor.b);
  if (Math.min(da, db) <= CORTE_VERTICE_PX) { mejor.punto = L.latLng(da <= db ? mejor.pa : mejor.pb); mejor.enVertice = true; }
  return mejor;
}

/** Divide la ruta en el punto tocado. Devuelve { partesA, partesB } o { error }. */
function partirRutaEnPunto_(hit) {
  const partes = partesDeLinea_(hit.capa).map(pt => pt.map(ll => L.latLng(ll.lat, ll.lng)));
  const parte = partes[hit.k], P = hit.punto;
  // No cortar pegado a un extremo de la ruta (tramos de menos de 5 m)
  const ini = partes[0][0], fin = partes[partes.length - 1][partes[partes.length - 1].length - 1];
  if ((hit.k === 0 && map.distance(P, ini) < 5) || (hit.k === partes.length - 1 && map.distance(P, fin) < 5)) return { error: 'Extremo de la ruta: elige un punto intermedio.' };
  // Tramo A = partes anteriores + inicio de la parte cortada hasta P; tramo B = P + resto + partes siguientes
  const casi = (x, y) => map.distance(x, y) < 0.5;
  const parteA = parte.slice(0, hit.i + 1); if (!casi(parteA[parteA.length - 1], P)) parteA.push(P);
  const parteB = parte.slice(hit.i + 1); if (!casi(parteB[0], P)) parteB.unshift(P);
  const partesA = partes.slice(0, hit.k).concat(parteA.length >= 2 ? [parteA] : []);
  const partesB = (parteB.length >= 2 ? [parteB] : []).concat(partes.slice(hit.k + 1));
  if (!partesA.length || !partesB.length) return { error: 'No se puede cortar en ese punto: elige un punto intermedio.' };
  return { partesA, partesB };
}
function largoPartes_(ps) { return ps.reduce((s, pt) => s + pt.slice(1).reduce((t, ll, j) => t + map.distance(pt[j], ll), 0), 0); }

/** Marcador ✂️ que sigue al mouse pegado a la ruta, con el largo de los dos tramos. */
function moverCortarRuta_(e) {
  if (!state.cortarRuta) return;
  const hit = rutaMasCercanaParaCortar_(e.latlng);
  const cont = map.getContainer();
  if (!hit) {
    if (cortarRutaCursor) { map.removeLayer(cortarRutaCursor); cortarRutaCursor = null; }
    cont.classList.remove('corte-listo');
    return;
  }
  const res = partirRutaEnPunto_(hit);
  const txt = res.error ? '⛔ ' + res.error
    : '✂️ Cortar aquí' + (hit.enVertice ? ' (vértice)' : '') + '<br><span style="color:#93C5FD;">🔵 ' + formatearDistancia_(largoPartes_(res.partesA)) + '</span> · <span style="color:#FDBA74;">🟠 ' + formatearDistancia_(largoPartes_(res.partesB)) + '</span>';
  if (!cortarRutaCursor) {
    cortarRutaCursor = L.marker(hit.punto, { interactive: false, keyboard: false, zIndexOffset: 2000,
      icon: L.divIcon({ className: '', html: '<div class="corte-cursor">✂️</div>', iconSize: [26, 26], iconAnchor: [13, 13] }) }).addTo(map);
    cortarRutaCursor.bindTooltip('', { permanent: true, direction: 'top', offset: [0, -14], className: 'map-label map-label-detalle' });
  }
  cortarRutaCursor.setLatLng(hit.punto);
  cortarRutaCursor.setTooltipContent(txt);
  const el = cortarRutaCursor.getElement(); if (el) el.firstChild.classList.toggle('bloqueado', !!res.error);
  cont.classList.toggle('corte-listo', !res.error);
}

async function clicCortarRuta_(e) {
  if (!state.cortarRuta) return;
  setTimeout(() => map.closePopup(), 0);   // el clic sobre la ruta no debe abrir su ventana
  const hit = rutaMasCercanaParaCortar_(e.latlng);
  if (!hit) { mostrarToast_('Acerca el mouse a una ruta resaltada hasta que aparezca el ✂️ y haz clic.'); return; }
  const res = partirRutaEnPunto_(hit);
  if (res.error) { mostrarToast_(res.error); return; }
  const { partesA, partesB } = res;
  // Vista previa: tramo 1 azul, tramo 2 naranjo, punto de corte
  if (cortarRutaPrevLayer) map.removeLayer(cortarRutaPrevLayer);
  cortarRutaPrevLayer = L.layerGroup([
    L.polyline(partesA, { color: '#2563EB', weight: 7, opacity: 0.9, interactive: false }),
    L.polyline(partesB, { color: '#F97316', weight: 7, opacity: 0.9, interactive: false }),
    L.circleMarker(hit.punto, { radius: 8, color: '#fff', weight: 3, fillColor: '#DC2626', fillOpacity: 1, interactive: false }),
  ]).addTo(map);
  const r = (state.planificacionRecursos || []).find(x => x.id === hit.capa._recursoId);
  if (!r) { mostrarToast_('No se encontró la ruta en la planificación cargada.'); return; }
  const ok = confirm('✂️ Cortar esta ruta en dos:\n\n' +
    '🔵 Tramo 1: ' + formatearDistancia_(largoPartes_(partesA)) + ' — se queda en esta misma ruta' + (r.recurso_ref_id ? ' (conserva su recurso asociado)' : '') + '.\n' +
    '🟠 Tramo 2: ' + formatearDistancia_(largoPartes_(partesB)) + ' — pasa a ser una ruta nueva (' + (r.tipo_recurso || 'mismo tipo') + ', sin recurso asociado).\n\n' +
    'Si esta ruta está propagada, el corte se aplica también en las otras alertas.\n\n¿Confirmar el corte?');
  if (!ok) { if (cortarRutaPrevLayer) { map.removeLayer(cortarRutaPrevLayer); cortarRutaPrevLayer = null; } return; }
  await ejecutarCorteRuta_(r, partesA, partesB);
}

async function ejecutarCorteRuta_(r, partesA, partesB) {
  const geo = ps => ps.map(pt => pt.map(ll => [ll.lng, ll.lat]));
  const A = geo(partesA), B = geo(partesB);
  mostrarToast_('✂️ Cortando la ruta…');
  // 15-10-2026 (SQL 106): el corte se aplica en TODOS los escenarios donde está la misma ruta
  // (tramo 1 = misma entidad en cada alerta; tramo 2 nuevo en cada una, enlazados entre sí).
  const todo = await supabaseClient.rpc('cortar_ruta_escenarios', { p_id: r.id, p_a: A, p_b: B });
  if (!todo.error) {
    const res = todo.data || {}, omit = res.omitidos || [];
    salirCortarRuta_();
    map.closePopup();
    mostrarToast_('✂️ Ruta cortada en dos tramos' + (res.otros_escenarios ? ' (también en ' + res.otros_escenarios + ' escenario(s) más)' : '') + '.' +
      (omit.length ? ' ⚠️ Sin permiso en: ' + omit.map(x => String(x).split(':')[0]).join(', ') : ''));
    if (omit.length) console.warn('Corte de ruta, escenarios omitidos:', omit);
    await loadPlanificacionRecursos_(state.activeComunaId);
    return;
  }
  if (!/cortar_ruta_escenarios|PGRST202|does not exist|schema cache/i.test(todo.error.message || '')) {
    mostrarToast_('No se pudo cortar: ' + todo.error.message);
    return;
  }
  // Sin el SQL 106: corte solo en este escenario (comportamiento anterior)
  // 1) Tramo 1: nueva forma de la MISMA entidad
  const resA = A.length > 1
    ? await supabaseClient.rpc('actualizar_geometria_multilinea_planificacion', { p_id: r.id, p_partes: A })
    : await supabaseClient.rpc('actualizar_geometria_planificacion', { p_id: r.id, p_puntos: A[0] });
  if (resA.error) { mostrarToast_('No se pudo cortar: ' + resA.error.message); return; }
  // 2) Tramo 2: ruta nueva en el mismo plan
  const desc = (r.descripcion ? r.descripcion + ' · ' : '') + 'tramo 2';
  const resB = await supabaseClient.rpc('crear_recurso_planificacion_linea', {
    p_plan_id: r.plan_id, p_institucion_id: r.institucion_id, p_tipo_recurso: r.tipo_recurso, p_puntos: B[0], p_descripcion: desc,
  });
  let aviso = '';
  if (resB.error) aviso = ' ⚠️ El tramo 1 quedó cortado, pero no se pudo crear el tramo 2: ' + resB.error.message;
  else if (B.length > 1) {
    const idB = resB.data && (resB.data.id || (Array.isArray(resB.data) && resB.data[0] && resB.data[0].id));
    if (idB) {
      const g = await supabaseClient.rpc('actualizar_geometria_multilinea_planificacion', { p_id: idB, p_partes: B });
      if (g.error) aviso = ' ⚠️ Tramo 2 creado solo con su primera parte: ' + g.error.message;
    }
  }
  salirCortarRuta_();
  map.closePopup();
  mostrarToast_(aviso ? aviso.trim() : '✂️ Ruta cortada en dos tramos.');
  if (!aviso) avisarRutaEnOtrosEscenarios_(r.id, '✂️ Ruta cortada en dos tramos.');
  await loadPlanificacionRecursos_(state.activeComunaId);
}

/** Punto de entrada desde el popup: activa el modo de selección de vértices. */
function unirLineaPaso_(id) {
  if (!state.modoPlanificacion && !state.editorMode) {
    mostrarToast_('✏️ Activa el modo edición para unir líneas.');
    return;
  }
  const capa = window.planRecursosMarkersById && window.planRecursosMarkersById[id];
  const partes = partesDeLinea_(capa);
  if (partes.length === 0) {
    mostrarToast_('⚠️ No se pudieron leer los vértices de esta línea.');
    return;
  }

  const escenarioBase = capa._escenario || null;

  salirModoUnionLinea_();
  map.closePopup();
  state.unionEscenario = escenarioBase;
  // Paso 1: solo los vértices de ESTA línea, para no confundir con el resto.
  mostrarVerticesUnion_(null, id, escenarioBase);
  avisoUnionLinea_('<b>Paso 1 de 2</b>' +
                   (escenarioBase ? ' · ' + nombreEscenario_(escenarioBase) : '') + '<br>' +
                   'Haz clic en el punto azul de <b>esta</b> línea donde quieres que se enganche la otra.<br><br>' +
                   '<span style="opacity:.7;">Solo se podrá unir con líneas del mismo escenario.<br>Escape para cancelar.</span>');
  mostrarToast_('🔗 Paso 1: elige el punto de enganche en esta línea.');
}

/* ============ PROPAGACIÓN INDIVIDUAL DE UNA ENTIDAD ============
 * Escala una figura concreta al o a los escenarios superiores, sin tocar
 * el resto del plan. Desde Normal ('Verde') ofrece tres caminos; desde Amarilla solo
 * queda Roja, así que se ejecuta directo.
 */
/* ── 🚦 Semáforo de propagación (17-10-2026, SQL 117) ──
 * state.propagacionEsc[id] = alertas donde está la entidad (su familia por origen o la misma geometría). */
const SEM_ESC = [['Verde', '#16A34A'], ['Amarilla', '#F59E0B'], ['Roja', '#EF4444']];
function escenariosEntidad_(id, escActual) {
  const l = (state.propagacionEsc && state.propagacionEsc[id]) || [];
  return l.includes(escActual) ? l : l.concat(escActual ? [escActual] : []);
}
function semaforoPropagacionHtml_(id, escActual, compacto) {
  const esc = escenariosEntidad_(id, escActual);
  const luz = ([e, c]) => '<i title="' + nombreEscenario_(e) + (esc.includes(e) ? ': propagada' : ': falta') + '" style="display:inline-block;width:' + (compacto ? 8 : 11) + 'px;height:' + (compacto ? 8 : 11) +
    'px;border-radius:50%;margin:0 1px;background:' + (esc.includes(e) ? c : '#E2E8F0') + ';border:1.5px solid ' + (esc.includes(e) ? '#fff' : '#94A3B8') + ';' +
    (esc.includes(e) ? 'box-shadow:0 0 5px ' + c + ';' : '') + '"></i>';
  return '<span' + (compacto ? ' class="sem-mapa"' : '') + ' style="display:inline-flex;align-items:center;padding:' + (compacto ? '1px 3px' : '2px 5px') + ';border-radius:99px;background:rgba(15,23,42,' + (compacto ? '.78' : '.06') + ');">' +
    SEM_ESC.map(luz).join('') + '</span>';
}
function bloquePropagacion_(id, escActual) {
  if (!state.propagacionEsc || !state.propagacionEsc[id]) return '';
  const esc = escenariosEntidad_(id, escActual);
  const falta = SEM_ESC.map(x => x[0]).filter(e => !esc.includes(e));
  return '<div class="popup-row" style="margin-top:6px;display:flex;align-items:center;gap:6px;flex-wrap:wrap;font-size:11.5px;">🚦 <b>Propagación</b> ' + semaforoPropagacionHtml_(id, escActual, false) +
    '<span style="color:' + (falta.length ? '#B45309' : '#15803D') + ';font-weight:700;">' +
    (falta.length ? 'Falta en ' + falta.map(nombreEscenario_).join(' y ') : '✔ En las 3 alertas') + '</span></div>';
}

/* ── 🏘️ Comunas de la administración del usuario (para crear o mover rutas entre comunas) ── */
function comunasCambioRuta_() {
  try { return (comunasSeleccionablesUsuario_() || []).filter(c => c && c.id); } catch (e) { return state.comunas || []; }
}
function dialogoBr_(html, ancho) {
  return new Promise(resolve => {
    const o = document.createElement('div');
    o.className = 'br-modal-overlay';
    o.innerHTML = '<div class="br-modal" style="width:min(' + (ancho || 520) + 'px,94vw);padding:18px 20px;">' + html + '</div>';
    o.addEventListener('click', e => {
      const b = e.target.closest('[data-resp]');
      if (e.target === o) { o.remove(); resolve(null); return; }
      if (b) { const sel = o.querySelector('[data-valor]'); const chk = o.querySelector('[data-chk]');
        o.remove(); resolve(b.dataset.resp === '__sel__' ? { valor: sel && sel.value, chk: chk ? chk.checked : null } : (b.dataset.resp === '__no__' ? null : b.dataset.resp)); }
    });
    document.body.appendChild(o);
  });
}
/** Al crear en planificación: si el trazado cae sobre todo en OTRA comuna de su administración, pregunta
 *  dónde guardarlo. Devuelve { planId, comuna, saltarAvisoFuera } o null si se cancela. */
async function decidirComunaTrazado_(puntosLngLat, tipo) {
  const mp = state.modoPlanificacion;
  if (!mp) return { planId: null };
  const actual = { planId: mp.planId };
  if (mp.ambito === 'area' || state.kmlCola) return actual;
  let filas;
  try { const { data, error } = await supabaseClient.rpc('comunas_de_trazado', { p_puntos: puntosLngLat, p_tipo: tipo }); if (error) return actual; filas = data || []; }
  catch (e) { return actual; }
  if (!filas.length || filas[0].comuna_id === state.activeComunaId) return actual;
  const top = filas[0];
  if (!comunasCambioRuta_().some(c => c.id === top.comuna_id)) return actual;   // no es de su administración: aviso normal de «fuera de la comuna»
  const nomActual = nombreComuna_(state.activeComunaId);
  const que = tipo === 'linea' ? 'Esta ruta' : tipo === 'area' ? 'Esta área' : 'Este punto';
  const r = await dialogoBr_(
    '<h3 style="margin:0 0 6px;">🏘️ ' + que + ' está en otra comuna</h3>' +
    '<p style="font-size:13px;margin:0 0 10px;">Estás trabajando en <b>' + escapeHtml_(nomActual) + '</b>, pero ' + que.toLowerCase() + ' se está creando ' +
      (tipo === 'punto' ? 'en' : 'principalmente en') + ' la comuna <b>' + escapeHtml_(top.comuna) + '</b>' + (tipo !== 'punto' ? ' (' + Number(top.pct).toLocaleString('es-CL') + ' %)' : '') + '.</p>' +
    (filas.length > 1 ? '<p style="font-size:11.5px;color:var(--text-tertiary);margin:0 0 10px;">Recorre: ' + filas.map(f => escapeHtml_(f.comuna) + ' ' + Number(f.pct).toLocaleString('es-CL') + ' %').join(' · ') + '</p>' : '') +
    '<p style="font-size:12.5px;margin:0 0 12px;">¿En qué comuna quieres dejarla? Se guarda en el plan de <b>' + escapeHtml_(nombreEscenario_(mp.escenario)) + '</b> de esa comuna.</p>' +
    '<div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end;">' +
      '<button class="btn-secondary" data-resp="__no__" style="flex:none;padding:9px 14px;">Cancelar</button>' +
      '<button class="btn-secondary" data-resp="actual" style="flex:none;padding:9px 14px;">Dejar en ' + escapeHtml_(nomActual) + '</button>' +
      '<button class="btn-primary" data-resp="otra" style="flex:none;padding:9px 14px;">Guardar en ' + escapeHtml_(top.comuna) + '</button></div>');
  if (r === null) return null;
  if (r === 'actual') return Object.assign(actual, { saltarAvisoFuera: true });
  const { data: plan, error } = await supabaseClient.rpc('obtener_o_crear_plan_contingencia', {
    p_ambito: 'comuna', p_comuna_id: top.comuna_id, p_area: null, p_escenario: mp.escenario });
  const p = Array.isArray(plan) ? plan[0] : plan;
  if (error || !p || !p.id) { mostrarToast_('No se pudo abrir el plan de ' + top.comuna + ': ' + (error ? error.message : 'sin plan')); return null; }
  return { planId: p.id, comuna: top.comuna, saltarAvisoFuera: true };
}
/** 🏘️ Cambiar la comuna de una entidad planificada (y de sus copias en las otras alertas). */
async function cambiarComunaEntidad_(id) {
  const todas = comunasCambioRuta_().filter(c => c.id !== state.activeComunaId)
    .sort((a, b) => String(a.comuna).localeCompare(String(b.comuna), 'es'));
  if (!todas.length) { mostrarToast_('No tienes otras comunas a las que moverla.'); return; }
  // 19-10-2026: por defecto solo las comunas del ÁREA de la comuna actual (p. ej. área Victoria), dentro de las del perfil
  const porArea = await comunasPorAreaUsuario_();
  const areasActual = Object.keys(porArea).filter(k => porArea[k].includes(state.activeComunaId));
  const deArea = new Set(areasActual.flatMap(k => porArea[k]));
  const delArea = todas.filter(c => deArea.has(c.id));
  const nomAreas = areasActual.map(k => aTitulo_((state.nombreAreaPorClave || {})[k] || k)).join(' / ');
  const opciones = lista => lista.map(c => '<option value="' + escapeHtml_(c.id) + '">' + escapeHtml_(c.comuna) + '</option>').join('');
  const inicial = delArea.length ? delArea : todas;
  const promesa = dialogoBr_(
    '<h3 style="margin:0 0 6px;">🏘️ Cambiar de comuna</h3>' +
    '<p style="font-size:12.5px;margin:0 0 10px;">Mueve la entidad desde <b>' + escapeHtml_(nombreComuna_(state.activeComunaId)) + '</b> al plan de la misma alerta en otra comuna' +
      (delArea.length ? ' del área <b>' + escapeHtml_(nomAreas) + '</b>' : '') + '.</p>' +
    '<select data-valor class="admin-search" style="width:100%;min-width:0;margin-bottom:8px;">' + opciones(inicial) + '</select>' +
    (delArea.length && delArea.length < todas.length
      ? '<label style="display:flex;gap:6px;align-items:center;font-size:12px;margin-bottom:6px;color:var(--text-secondary);"><input type="checkbox" data-todas> Mostrar también comunas de otras áreas (' + (todas.length - delArea.length) + ')</label>' : '') +
    '<label style="display:flex;gap:6px;align-items:center;font-size:12.5px;margin-bottom:12px;"><input type="checkbox" data-chk checked> También sus copias en las otras alertas (Normal / Amarilla / Roja)</label>' +
    '<div style="display:flex;gap:8px;justify-content:flex-end;"><button class="btn-secondary" data-resp="__no__" style="flex:none;padding:9px 14px;">Cancelar</button>' +
    '<button class="btn-primary" data-resp="__sel__" style="flex:none;padding:9px 14px;">Mover</button></div>');
  const ov = [...document.querySelectorAll('.br-modal-overlay')].pop();
  const chkTodas = ov && ov.querySelector('[data-todas]');
  if (chkTodas) chkTodas.addEventListener('change', () => { ov.querySelector('[data-valor]').innerHTML = opciones(chkTodas.checked ? todas : delArea); });
  const r = await promesa;
  if (!r || !r.valor) return;
  const { data, error } = await supabaseClient.rpc('mover_entidad_comuna', { p_id: id, p_comuna_id: r.valor, p_familia: !!r.chk });
  if (error) { mostrarToast_('No se pudo cambiar la comuna: ' + error.message + (/function|does not exist/i.test(error.message) ? ' (¿se ejecutó el SQL 117?)' : '')); return; }
  map.closePopup();
  mostrarToast_('🏘️ Movida a ' + nombreComuna_(r.valor) + ' (' + (data || 0) + ' entidad(es)). Ya no se ve en ' + nombreComuna_(state.activeComunaId) + '.');
  loadPlanificacionRecursos_(state.activeComunaId);
}

/** 20-10-2026: al crear una ruta de una institución distinta de CMPC se pregunta si también se requiere en las alertas
 *  superiores (desde Normal: Amarilla y/o Roja; desde Amarilla: Roja). Copia con copiar_entidad_planificada (enlazada:
 *  los cambios de forma se sincronizan entre escenarios, SQL 68/106). */
function preguntarAlertasRutaNueva_(id, escenario, institucion) {
  if (!puedePropagar_()) return;
  const destinos = escenario === 'Verde' ? ['Amarilla', 'Roja'] : escenario === 'Amarilla' ? ['Roja'] : [];
  if (!destinos.length) return;
  let ov = document.getElementById('alertas-ruta-overlay');
  if (!ov) { ov = document.createElement('div'); ov.id = 'alertas-ruta-overlay'; ov.className = 'modal-overlay'; document.body.appendChild(ov); }
  const ico = { Amarilla: '🟡', Roja: '🔴' };
  ov.innerHTML = '<div class="modal-card" style="max-width:440px;">' +
    '<h3>¿Esta ruta también se requiere en alerta?</h3>' +
    '<p class="coords">Ruta de <b>' + escapeHtml_(institucion) + '</b> creada en ' + escapeHtml_(nombreEscenario_(escenario)) + '. Marca las alertas donde también debe estar (queda enlazada: si después cambias su forma, se actualiza en todas).</p>' +
    destinos.map(d => '<label style="display:flex;align-items:center;gap:10px;padding:10px 12px;border:1px solid var(--border);border-radius:10px;margin-top:8px;cursor:pointer;font-weight:700;">' +
      '<input type="checkbox" data-ar-dest="' + d + '" checked style="width:18px;height:18px;"> ' + ico[d] + ' ' + escapeHtml_(nombreEscenario_(d)) + '</label>').join('') +
    '<div class="modal-actions" style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px;">' +
      '<button class="btn-secondary" id="ar-no">No, solo en ' + escapeHtml_(nombreEscenario_(escenario)) + '</button>' +
      '<button class="btn-primary" id="ar-si">Sí, agregar</button></div></div>';
  ov.classList.add('show');
  ov.querySelector('#ar-no').onclick = () => ov.classList.remove('show');
  ov.querySelector('#ar-si').onclick = async () => {
    const elegidos = [...ov.querySelectorAll('[data-ar-dest]:checked')].map(c => c.dataset.arDest);
    ov.classList.remove('show');
    if (!elegidos.length) return;
    mostrarToast_('⏫ Agregando la ruta a ' + elegidos.map(nombreEscenario_).join(' y ') + '…');
    const res = [];
    for (const d of elegidos) {
      const r = await supabaseClient.rpc('copiar_entidad_planificada', { p_recurso_id: id, p_destino: d });
      if (r.error) { mostrarToast_('No se pudo agregar a ' + nombreEscenario_(d) + ': ' + r.error.message); return; }
      res.push(...(Array.isArray(r.data) ? r.data : (r.data ? [r.data] : [])));
    }
    const ocultas = elegidos.filter(d => !(state.alertaLayersOn && state.alertaLayersOn[d === 'Amarilla' ? 'amarilla' : 'roja']));
    mostrarToast_('✅ Ruta agregada a ' + elegidos.map(nombreEscenario_).join(' y ') + (ocultas.length ? ' · enciende ' + ocultas.map(nombreEscenario_).join(' / ') + ' en el panel de alertas para verla.' : '.'));
    try { await loadPlanificacionRecursos_(state.activeComunaId); reaplicarFiltrosAlerta_(); } catch (e) {}
  };
}

async function propagarEntidadIndividual_(id, escenarioActual) {
  if (!puedePropagar_()) {
    mostrarToast_('🔒 No tienes permiso para propagar entidades.');
    return;
  }
  if (!id) return;

  // 17-10-2026 (SQL 117): se propaga a CUALQUIERA de las otras alertas (subir o bajar). El GRD propaga
  // sus entidades de la Alerta Amarilla (sin CMPC) a Normal y/o Roja.
  const esGRD = state.perfil && state.perfil.perfil === 'GRD';
  if (esGRD && escenarioActual === 'Verde') { mostrarToast_('ℹ️ El perfil GRD propaga desde las Alertas Amarilla y Roja.'); return; }
  const otras = ['Verde', 'Amarilla', 'Roja'].filter(e => e !== escenarioActual);
  const opcion = prompt(
    'Propagar esta entidad desde ' + nombreEscenario_(escenarioActual) + ' a las demás alertas.\n\n' +
    'Escribe el número de la opción:\n' +
    '  1 = Solo a ' + nombreEscenario_(otras[0]) + '\n' +
    '  2 = Solo a ' + nombreEscenario_(otras[1]) + '\n' +
    '  3 = A ' + nombreEscenario_(otras[0]) + ' y ' + nombreEscenario_(otras[1]) + '\n' +
    '\n(Si el plan de esa alerta no existe, se crea. Lo que ya está no se duplica.)',
    '3'
  );
  if (opcion === null) return;
  const op = String(opcion).trim();
  const destinos = op === '1' ? [otras[0]] : op === '2' ? [otras[1]] : op === '3' ? otras : null;
  if (!destinos) { mostrarToast_('⚠️ Opción no válida.'); return; }

  mostrarToast_('⏫ Propagando entidad…');

  // Una llamada por destino; los mensajes se juntan en un solo resultado
  let respuesta = { data: [], error: null };
  for (const destino of destinos) {
    const r = await supabaseClient.rpc('copiar_entidad_planificada', { p_recurso_id: id, p_destino: destino });
    if (r.error) { respuesta = r; break; }
    respuesta.data = respuesta.data.concat(Array.isArray(r.data) ? r.data : (r.data ? [r.data] : []));
  }

  if (respuesta.error) {
    mostrarToast_('No se pudo propagar: ' + respuesta.error.message);
    console.error('propagar entidad:', respuesta.error);
    return;
  }

  const filas = respuesta.data || [];
  const copiadas = filas.filter(f => f.copiada).length;
  const mensajes = textoEscenariosServidor_(filas.map(f => (f.paso ? f.paso + ': ' : '') + f.mensaje).join('  ·  '));

  // 19-10-2026: ya NO se encienden las alertas de destino (se mantienen las que el usuario tenía encendidas);
  // el semáforo 🚦 de la entidad muestra en qué alertas quedó y basta encender la alerta en el panel para verla.
  const ocultas = destinos.filter(d => !(state.alertaLayersOn && state.alertaLayersOn[d === 'Verde' ? 'verde' : d === 'Amarilla' ? 'amarilla' : 'roja']));
  const verla = copiadas > 0 && ocultas.length ? ' · Para verla, enciende ' + ocultas.map(nombreEscenario_).join(' / ') + ' en el panel de alertas.' : '';
  if (copiadas > 0) {
    mostrarToast_('✅ ' + mensajes + verla);
  } else {
    mostrarToast_('ℹ️ ' + (mensajes || 'No hubo cambios.'));
  }

  map.closePopup();

  // Refrescar lo dibujado sin cambiar qué alertas están encendidas
  try {
    await loadPlanificacionRecursos_(state.activeComunaId);
    reaplicarFiltrosAlerta_();
    renderTab(state.activeTab || 'capas');
  } catch (e) {
    console.error('No se pudo refrescar tras propagar la entidad:', e);
  }
}

async function abrirEditarRecursoPlanificado_(id) {
  const { data: r, error } = await supabaseClient.from('planificacion_recursos').select('*').eq('id', id).maybeSingle();
  if (error || !r) { mostrarToast_('No se pudo cargar el recurso.'); return; }

  editandoRecursoPlanId = id;
  const fInst = document.getElementById('erp-institucion');
  fInst.innerHTML = '';
  state.instituciones.forEach(i => {
    const opt = document.createElement('option'); opt.value = i.id; opt.textContent = i.nombre;
    fInst.appendChild(opt);
  });
  fInst.value = r.institucion_id;
  if (grdBloqueaInst_((state.instituciones || []).find(i => String(i.id) === String(r.institucion_id)))) {
    mostrarToast_('🔒 Tu perfil GRD no puede editar recursos de CMPC (solo las otras instituciones).');
    editandoRecursoPlanId = null; return;
  }
  quitarCmpcSelectGrd_(fInst);   // GRD: no puede pasar el recurso a CMPC

  // Catálogo CMPC también al editar un recurso ya aplicado, con la misma
  // regla de perfil. Se repuebla al abrir y al cambiar de institución.
  const refrescarTiposErp = () => actualizarCatalogoTiposFormulario_(
    'erp-institucion', 'erp-tipo', TIPOS_GENERICOS_EDICION);
  fInst.onchange = refrescarTiposErp;
  refrescarTiposErp();

  // Si el tipo guardado no está en la lista (por ejemplo, un tipo que dejó de
  // estar activo), se agrega para no perder el valor al editar otra cosa.
  const fTipoErp = document.getElementById('erp-tipo');
  if (r.tipo_recurso && !Array.prototype.some.call(fTipoErp.options, o => o.value === r.tipo_recurso)) {
    const opt = document.createElement('option');
    opt.value = r.tipo_recurso;
    opt.textContent = r.tipo_recurso + ' (fuera del catálogo)';
    fTipoErp.appendChild(opt);
  }
  fTipoErp.value = r.tipo_recurso;
  document.getElementById('erp-descripcion').value = r.descripcion || '';
  document.getElementById('editar-recurso-plan-error').classList.remove('show');
  map.closePopup();
  document.getElementById('editar-recurso-plan-overlay').classList.add('show');
  prepararRecursoRefEditar_(r);   // "Recurso asociado" (solo rutas; editable en Normal)
}

async function guardarEdicionRecursoPlanificado_() {
  const btn = document.getElementById('btn-save-editar-recurso-plan');
  const errEl = document.getElementById('editar-recurso-plan-error');
  errEl.classList.remove('show');

  const institucionId = document.getElementById('erp-institucion').value;
  const tipo = document.getElementById('erp-tipo').value;
  const descripcion = document.getElementById('erp-descripcion').value.trim();

  btn.textContent = 'Guardando…'; btn.disabled = true;
  const { error } = await supabaseClient.from('planificacion_recursos')
    .update({ institucion_id: institucionId, tipo_recurso: tipo, descripcion })
    .eq('id', editandoRecursoPlanId);
  btn.textContent = 'Guardar'; btn.disabled = false;

  if (error) { errEl.textContent = 'No se pudo guardar: ' + error.message; errEl.classList.add('show'); return; }

  // Enlace ruta Normal ↔ recurso (SQL 79): si cambió, se guarda (y pasa a sus copias Amarilla/Roja).
  const errRef = await guardarRecursoRef_('erp', editandoRecursoPlanId);
  if (errRef) { errEl.textContent = 'Datos guardados, pero no se pudo asociar el recurso: ' + errRef; errEl.classList.add('show'); return; }

  document.getElementById('editar-recurso-plan-overlay').classList.remove('show');
  mostrarToast_('Recurso actualizado.');
  // SQL 106: institución, tipo y descripción pasan solos a la misma ruta en las otras alertas
  avisarRutaEnOtrosEscenarios_(editandoRecursoPlanId, 'Recurso actualizado.');
  editandoRecursoPlanId = null;
  loadPlanificacionRecursos_(state.activeComunaId);
  if (document.getElementById('admin-recursos-plan-overlay').classList.contains('show') && planContingenciaEditandoId) {
    abrirAdminRecursosPlan_();
  }
}

