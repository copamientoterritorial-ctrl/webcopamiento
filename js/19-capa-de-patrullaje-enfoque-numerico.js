/* ============ CAPA DE PATRULLAJE (enfoque numérico: id_comuna / id_area) ============
 * Rutas de patrullaje CMPC desde la vista v_rutas_patrullaje. Se relaciona por
 * IDs numéricos (id_comuna, id_area, id_subg) — NO por strings — evitando los
 * errores de emparejamiento por nombre/slug. El contenido se filtra por perfil:
 *   - Administrador: todas las rutas.
 *   - Jefe de Área Relacionamiento: rutas de sus áreas (state.misAreasIds, por nombre de área).
 *   - GRD / Visor / otros: rutas de sus comunas asignadas (state.misComunaIds, slug de comuna).
 * El filtro por comuna usa comuna_slug de la vista, que corresponde 1:1 con el
 * id (slug) que ya guarda perfil_comunas — así el puente numérico id_comuna vive
 * en la ruta y el emparejamiento con el usuario sigue siendo exacto.
 * Las reglas de negocio adicionales se agregarán aquí. */
function normalizarTextoCli_(s) {
  return (s || '').toString().trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function filtrarRutasPorPerfil_(rutas) {
  const rol = state.perfil.perfil;

  // Administrador: TODAS las rutas
  if (rol === 'Administrador') return rutas;

  // Jefe de Área: según modo área o modo comuna
  if (rol === 'Jefe de Área Relacionamiento') {
    if (state.areaActiva) {
      // Modo Área: rutas del área activa
      const areaAct = normalizarTextoCli_(state.areaActiva);
      return rutas.filter(r => r.area && normalizarTextoCli_(r.area) === areaAct);
    }
    // Modo Comuna: solo rutas de la comuna activa
    const idc = idComunaActiva_();
    if (idc == null) return [];
    return rutas.filter(r => r.id_comuna === idc);
  }

  // GRD / Visor: solo rutas de la comuna activa
  const idc = idComunaActiva_();
  if (idc == null) return [];
  return rutas.filter(r => r.id_comuna === idc);
}

// Neón en la ruta de patrullaje seleccionada (popup abierto)
function resaltarPatrullajeNeon_(idRuta) {
  Object.keys(window.patrullajeRutaCapas || {}).forEach(id => {
    const capa = window.patrullajeRutaCapas[id];
    capa.eachLayer(s => { const el = s.getElement && s.getElement(); if (!el) return; if (id === idRuta) el.classList.add('ruta-seleccionada-neon'); else el.classList.remove('ruta-seleccionada-neon'); });
    if (id === idRuta) capa.eachLayer(s => s.bringToFront && s.bringToFront());
  });
}
function quitarPatrullajeNeon_() {
  Object.keys(window.patrullajeRutaCapas || {}).forEach(id => { window.patrullajeRutaCapas[id].eachLayer(s => { const el = s.getElement && s.getElement(); if (el) el.classList.remove('ruta-seleccionada-neon'); }); });
}

/* ============ TRASPASO DE RUTAS DE PATRULLAJE A LAS ALERTAS ============
 * Una ruta de patrullaje es un recorrido ya definido en terreno. Traspasarla
 * a un escenario de alerta la convierte en una entidad de planificación, con
 * lo cual empieza a contar en el nivel de copamiento: su área de influencia
 * de 500 m se suma a la cobertura de ese escenario.
 *
 * Se puede enviar a uno o varios escenarios a la vez. La ruta original
 * permanece intacta en su capa: esto copia, no mueve.
 */
function puedeTraspasarRutas_() {
  const p = state.perfil && state.perfil.perfil;
  // Sumar una ruta al copamiento escribe en los escenarios: requiere poder editarlos.
  return (p === 'Administrador' || esJefeAreaPerfil_(p) || p === 'GRD') && puedeEditarModulo_('planificador_mapa');
}

function tooltipRuta_(r) {
  const partes = [];
  partes.push('<b>🚓 ' + escapeHtml_(r.nombre_ruta || r.id) + '</b>');
  if (r.actividad) partes.push(escapeHtml_(r.actividad));
  if (r.tipo_movil) partes.push(escapeHtml_(r.tipo_movil));
  if (r.km != null) partes.push(Number(r.km).toFixed(1) + ' km');

  let html = '<div style="text-align:left;line-height:1.45;">';
  html += '<div style="white-space:nowrap;">' + partes.join('<span style="opacity:.45;"> · </span>') + '</div>';
  const sub = [r.area, r.sector, r.comuna].filter(Boolean).map(escapeHtml_).join(' · ');
  if (sub) html += '<div style="margin-top:3px;opacity:.85;font-size:11px;">' + sub + '</div>';
  if (r.temporada) html += '<div style="margin-top:2px;opacity:.65;font-size:10.5px;">Temporada ' + escapeHtml_(r.temporada) + '</div>';
  html += '</div>';
  return html;
}

function bindAccionesRutaPopup_() {
  document.querySelectorAll('.popup-btn[data-action="ruta-a-alertas"]').forEach(btn => {
    btn.onclick = () => abrirTraspasoRuta_(btn.dataset.id);
  });
}

state.rutaTraspaso = null;

/** Textos del modal de traspaso según lo que se suma: ruta SIGEI o área de influencia de un comité. */
function textosModalTraspaso_(modo) {
  const comite = modo === 'comite';
  document.querySelector('#ruta-traspaso-overlay .rt-icono').textContent = '⏫';
  document.querySelector('#ruta-traspaso-overlay .rt-titulo').textContent = comite ? 'Sumar comité al nivel de copamiento' : 'Sumar ruta al nivel de copamiento';
  document.querySelector('#ruta-traspaso-overlay .rt-subtitulo').textContent = comite ? 'Su área de influencia se copia como área de planificación' : 'La ruta se copia como línea de planificación';
  document.querySelector('#ruta-traspaso-overlay .rt-ruta-icono').textContent = comite ? '🖐️' : '🚓';
  document.querySelector('#ruta-traspaso-overlay .rt-aviso span:last-child').textContent = comite
    ? 'El área de influencia del comité pasa a contar en el copamiento del escenario. El comité original permanece intacto en su capa.'
    : 'Su área de influencia de 500 m pasa a contar en el copamiento. La ruta original permanece intacta en su capa.';
}

/* ── Comités de la Red de Prevención: sumar su área de influencia al copamiento (19-10-2026) ──
 * Misma lógica que las rutas SIGEI: se copia como entidad de planificación (aquí un ÁREA) en los escenarios
 * elegidos, sin duplicar (si ya hay en el plan un área con la misma descripción, se omite) y enlazando las copias. */
function anilloComite_(geom) {
  const g = geom && (geom.type === 'Feature' ? geom.geometry : geom);
  if (!g || !g.coordinates) return null;
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
  // El anillo exterior más grande (las áreas de influencia son un solo polígono; si vinieran varios, el principal)
  let mejor = null, area = -1;
  polys.forEach(p => {
    const r = p[0] || [];
    let s = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) s += (r[j][0] + r[i][0]) * (r[j][1] - r[i][1]);
    if (Math.abs(s) > area) { area = Math.abs(s); mejor = r; }
  });
  return mejor && mejor.length >= 4 ? mejor.map(c => [c[0], c[1]]) : null;
}
function abrirTraspasoComite_(comiteId) {
  const reg = (window.comitesPorId || {})[comiteId];
  const r = reg && reg.datos;
  if (!r) { mostrarToast_('No se encontró el comité.'); return; }
  if (!state.activeComunaId) { mostrarToast_('⚠️ Selecciona una comuna primero.'); return; }
  const geom = typeof r.area_geom === 'string' ? JSON.parse(r.area_geom) : r.area_geom;
  if (!anilloComite_(geom)) { mostrarToast_('El comité no tiene un área de influencia válida.'); return; }
  state.traspasoModo = 'comite';
  state.rutaTraspaso = { comite: r, geom };
  textosModalTraspaso_('comite');
  document.getElementById('ruta-traspaso-nombre').textContent = r.nombre_comite || ('Comité N° ' + (r.num_comite || r.comite_id));
  document.getElementById('ruta-traspaso-meta').textContent = ['Red de Prevención Comunitaria', 'Comité N° ' + (r.num_comite || r.comite_id), r.sector].filter(Boolean).join('  ·  ');
  // Institución: la de la Red de Prevención / comunidad si existe; si no, CMPC
  const fInst = document.getElementById('ruta-traspaso-institucion');
  fInst.innerHTML = (state.instituciones || []).map(i => '<option value="' + escapeHtml_(i.id) + '">' + escapeHtml_(i.nombre) + '</option>').join('');
  const insts = state.instituciones || [];
  const pref = insts.find(i => /PREVENC|COMUNI|VECIN/i.test(i.nombre)) || insts.find(i => /CMPC/i.test(i.nombre));
  if (pref) fInst.value = pref.id;
  // Tipo de recurso: «Efecto disuasivo» si está en el catálogo (válido para áreas, SQL 117)
  const fTipo = document.getElementById('ruta-traspaso-tipo');
  poblarSelectTiposRecurso_(fTipo, TIPO_EFECTO_DISUASIVO);
  cargarTiposRecurso_().then(() => poblarSelectTiposRecurso_(fTipo, TIPO_EFECTO_DISUASIVO)).catch(() => {});
  // El GRD solo escribe en Amarilla y Roja (SQL 120)
  document.getElementById('ruta-esc-verde').checked = !(state.perfil && state.perfil.perfil === 'GRD');
  document.getElementById('ruta-esc-amarilla').checked = true;
  document.getElementById('ruta-esc-roja').checked = true;
  document.getElementById('ruta-traspaso-error').classList.remove('show');
  map.closePopup();
  document.getElementById('ruta-traspaso-overlay').classList.add('show');
}
async function confirmarTraspasoComite_() {
  const t = state.rutaTraspaso; if (!t || !t.comite) return;
  const r = t.comite;
  const escenarios = ['Verde', 'Amarilla', 'Roja'].filter(e => document.getElementById('ruta-esc-' + { Verde: 'verde', Amarilla: 'amarilla', Roja: 'roja' }[e]).checked);
  const err = document.getElementById('ruta-traspaso-error');
  if (!escenarios.length) { err.textContent = 'Selecciona al menos un escenario de alerta.'; err.classList.add('show'); return; }
  const anillo = anilloComite_(t.geom);
  const institucionId = document.getElementById('ruta-traspaso-institucion').value;
  const tipoRecurso = document.getElementById('ruta-traspaso-tipo').value;
  const descripcion = 'Comité Red de Prevención: ' + (r.nombre_comite || ('N° ' + (r.num_comite || r.comite_id))) + ' (N° ' + (r.num_comite || r.comite_id) + ')';
  const btn = document.getElementById('ruta-traspaso-guardar');
  btn.disabled = true;
  const { data: planes, error: errPlanes } = await supabaseClient.from('planes_contingencia').select('id, escenario').eq('ambito', 'comuna').eq('comuna_id', state.activeComunaId);
  if (errPlanes) { err.textContent = 'No se pudieron leer los planes: ' + errPlanes.message; err.classList.add('show'); btn.disabled = false; return; }
  let creadas = 0; const faltan = [], fallos = [], ids = [], yaEstaban = [];
  for (const esc of escenarios) {
    const plan = (planes || []).find(p => p.escenario === esc);
    if (!plan) { faltan.push(esc); continue; }
    btn.textContent = 'Revisando ' + etiquetaEscenario_(esc) + '…';
    // ¿Ya está el comité en este escenario? (misma descripción) → no se duplica
    const ya = await supabaseClient.from('planificacion_recursos').select('id').eq('plan_id', plan.id).eq('descripcion', descripcion).limit(1);
    if (!ya.error && ya.data && ya.data.length) { yaEstaban.push(nombreEscenario_(esc)); ids.push(ya.data[0].id); continue; }
    btn.textContent = 'Enviando a ' + etiquetaEscenario_(esc) + '…';
    const { error } = await supabaseClient.rpc('crear_recurso_planificacion_area', {
      p_plan_id: plan.id, p_institucion_id: institucionId, p_tipo_recurso: tipoRecurso, p_puntos: anillo, p_descripcion: descripcion,
    });
    if (error) { fallos.push(nombreEscenario_(esc) + ': ' + error.message); continue; }
    const nuevo = await supabaseClient.from('planificacion_recursos').select('id').eq('plan_id', plan.id).eq('descripcion', descripcion).limit(1);
    if (nuevo.data && nuevo.data.length) ids.push(nuevo.data[0].id);
    creadas++;
  }
  // Enlazar las copias entre escenarios (como las rutas): editar la forma en una alerta la actualiza en las demás
  if (ids.length > 1 && creadas > 0) { const vin = await supabaseClient.rpc('vincular_ruta_escenarios', { p_ids: ids }); if (vin.error) console.warn('vincular_ruta_escenarios:', vin.error.message); }
  btn.disabled = false; btn.textContent = 'Sumar al copamiento';
  if (fallos.length && !creadas) {
    err.innerHTML = '<b>No se pudo sumar el comité.</b><br>' + escapeHtml_(fallos[0].slice(0, 220)); err.classList.add('show'); return;
  }
  document.getElementById('ruta-traspaso-overlay').classList.remove('show');
  state.rutaTraspaso = null; state.traspasoModo = null;
  const avisoYa = yaEstaban.length ? ' · Ya estaba en ' + yaEstaban.join(' y ') + ' (no se duplicó).' : '';
  const avisoFalta = faltan.length ? ' · Sin plan en ' + faltan.map(nombreEscenario_).join(' y ') + '.' : '';
  if (fallos.length) mostrarToast_('⚠️ ' + creadas + ' copia(s) creadas · falló: ' + fallos[0] + avisoYa);
  else if (!creadas) mostrarToast_(yaEstaban.length ? 'ℹ️ El comité ya estaba en ' + yaEstaban.join(' y ') + '.' : '⚠️ No se creó ninguna copia.' + avisoFalta);
  else mostrarToast_('⏫ Comité sumado al copamiento en ' + creadas + ' escenario(s).' + avisoYa + avisoFalta);
  if (state.activeComunaId) loadPlanificacionRecursos_(state.activeComunaId);
}

function abrirTraspasoRuta_(idRuta) {
  const ruta = (state.patrullajeRutas || []).find(x => String(x.id) === String(idRuta));
  if (!ruta) { mostrarToast_('No se encontró la ruta.'); return; }
  if (!state.activeComunaId) { mostrarToast_('⚠️ Selecciona una comuna primero.'); return; }

  state.traspasoModo = 'ruta';
  textosModalTraspaso_('ruta');
  state.rutaTraspaso = ruta;

  document.getElementById('ruta-traspaso-nombre').textContent = ruta.nombre_ruta || ruta.id;
  document.getElementById('ruta-traspaso-meta').textContent =
    [ruta.actividad, ruta.tipo_movil, ruta.km != null ? Number(ruta.km).toFixed(1) + ' km' : null,
     ruta.comuna].filter(Boolean).join('  ·  ');

  // Institución: se preselecciona la que coincida con la empresa de la ruta.
  const fInst = document.getElementById('ruta-traspaso-institucion');
  fInst.innerHTML = '';
  (state.instituciones || []).forEach(i => {
    const opt = document.createElement('option');
    opt.value = i.id; opt.textContent = i.nombre;
    fInst.appendChild(opt);
  });
  // CMPC es la institución por defecto: es la que opera la mayoría de las
  // rutas. Si la ruta declara otra empresa y existe como institución, manda esa.
  const cmpc = (state.instituciones || []).find(i =>
    String(i.nombre).trim().toUpperCase().indexOf('CMPC') !== -1);
  if (cmpc) fInst.value = cmpc.id;

  const empresa = String(ruta.empresa || '').trim().toUpperCase();
  if (empresa) {
    const coincide = (state.instituciones || []).find(i =>
      String(i.nombre).trim().toUpperCase().indexOf(empresa) !== -1);
    if (coincide) fInst.value = coincide.id;
  }

  const fTipo = document.getElementById('ruta-traspaso-tipo');
  poblarSelectTiposRecurso_(fTipo, ruta.tipo_recurso || null);
  cargarTiposRecurso_().then(() => poblarSelectTiposRecurso_(fTipo, ruta.tipo_recurso || null)).catch(() => {});

  // Por defecto, la combinación más habitual.
  document.getElementById('ruta-esc-verde').checked = false;
  document.getElementById('ruta-esc-amarilla').checked = true;
  document.getElementById('ruta-esc-roja').checked = true;

  document.getElementById('ruta-traspaso-error').classList.remove('show');
  map.closePopup();
  document.getElementById('ruta-traspaso-overlay').classList.add('show');
}

function preajusteTraspaso_(cuales) {
  document.getElementById('ruta-esc-verde').checked = cuales.indexOf('Verde') !== -1;
  document.getElementById('ruta-esc-amarilla').checked = cuales.indexOf('Amarilla') !== -1;
  document.getElementById('ruta-esc-roja').checked = cuales.indexOf('Roja') !== -1;
}

/** Tramos de la geometría de la ruta, como arreglos de [lng, lat]. */
function tramosDeRuta_(geometry) {
  if (!geometry) return [];
  const g = geometry.type === 'Feature' ? geometry.geometry : geometry;
  if (!g || !g.coordinates) return [];
  if (g.type === 'LineString') return [g.coordinates];
  if (g.type === 'MultiLineString') return g.coordinates;
  return [];
}

async function confirmarTraspasoRuta_() {
  if (state.traspasoModo === 'comite') return confirmarTraspasoComite_();
  const ruta = state.rutaTraspaso;
  if (!ruta) return;

  const escenarios = [];
  if (document.getElementById('ruta-esc-verde').checked) escenarios.push('Verde');
  if (document.getElementById('ruta-esc-amarilla').checked) escenarios.push('Amarilla');
  if (document.getElementById('ruta-esc-roja').checked) escenarios.push('Roja');

  const err = document.getElementById('ruta-traspaso-error');
  if (escenarios.length === 0) {
    err.textContent = 'Selecciona al menos un escenario de alerta.';
    err.classList.add('show');
    return;
  }

  const tramos = tramosDeRuta_(ruta.geometry);
  if (tramos.length === 0) {
    err.textContent = 'La ruta no tiene una geometría de línea válida.';
    err.classList.add('show');
    return;
  }

  const institucionId = document.getElementById('ruta-traspaso-institucion').value;
  const tipoRecurso = document.getElementById('ruta-traspaso-tipo').value;
  const descripcion = 'Ruta de patrullaje: ' + (ruta.nombre_ruta || ruta.id) +
    (ruta.sector ? ' · ' + ruta.sector : '');

  const btn = document.getElementById('ruta-traspaso-guardar');
  btn.disabled = true;

  // Planes de la comuna: uno por escenario.
  const { data: planes, error: errPlanes } = await supabaseClient
    .from('planes_contingencia')
    .select('id, escenario')
    .eq('ambito', 'comuna')
    .eq('comuna_id', state.activeComunaId);

  if (errPlanes) {
    err.textContent = 'No se pudieron leer los planes: ' + errPlanes.message;
    err.classList.add('show');
    btn.disabled = false;
    return;
  }

  let creadas = 0;
  const faltan = [];
  const fallos = [];
  const idsCreados = []; // en orden Normal → Amarilla → Roja: el primero es la raíz
  const yaEstaban = [];  // escenarios donde la ruta ya existía (se omiten: evita duplicados, SQL 80)
  const geojsonRuta = tramos.length > 1
    ? { type: 'MultiLineString', coordinates: tramos }
    : { type: 'LineString', coordinates: tramos[0] };

  for (const esc of escenarios) {
    const plan = (planes || []).find(p => p.escenario === esc);
    if (!plan) { faltan.push(esc); continue; }

    btn.textContent = 'Revisando ' + etiquetaEscenario_(esc) + '…';
    // ¿Ya hay en ese escenario una línea que coincide (≥ 90 %)? Entonces no se crea otra.
    const sup = await supabaseClient.rpc('ruta_superpuesta_en_plan', { p_plan_id: plan.id, p_geojson: geojsonRuta, p_pct: 90 });
    if (!sup.error && sup.data && sup.data.length) { yaEstaban.push(nombreEscenario_(esc)); continue; }

    btn.textContent = 'Enviando a ' + etiquetaEscenario_(esc) + '…';

    // UNA sola entidad por ruta, aunque el trazado venga en varios tramos.
    // Antes se creaba una entidad por tramo y una ruta partida en cinco
    // aparecía como cinco recursos, inflando el conteo y el copamiento.
    const { data, error } = await supabaseClient.rpc('crear_linea_planificacion_catalogo', {
      p_plan_id: plan.id,
      p_institucion_id: institucionId,
      p_tipo_recurso: tipoRecurso,
      p_puntos: tramos[0],
      p_descripcion: descripcion,
    });

    const fila = (data && data[0]) ? data[0] : null;
    if (error) { fallos.push(esc + ': ' + error.message); continue; }
    if (fila && fila.ok === false) { fallos.push(esc + ': ' + fila.mensaje); continue; }
    if (!fila || !fila.id) { fallos.push(esc + ': respuesta sin identificador.'); continue; }

    // Si la ruta tiene más de un tramo, se reemplaza su geometría por la
    // multilínea completa: sigue siendo un solo registro.
    if (tramos.length > 1) {
      const geo = await supabaseClient.rpc('actualizar_geometria_multilinea_planificacion', {
        p_id: fila.id,
        p_partes: tramos,
      });
      if (geo.error) fallos.push(esc + ' (tramos): ' + geo.error.message);
    }

    creadas++;
    idsCreados.push(fila.id);
  }

  // Enlazar las copias entre escenarios (68): así, al editar la forma en uno,
  // la misma ruta se actualiza en los demás.
  if (idsCreados.length > 1) {
    const vin = await supabaseClient.rpc('vincular_ruta_escenarios', { p_ids: idsCreados });
    if (vin.error) console.error('vincular_ruta_escenarios:', vin.error);
  }

  btn.disabled = false;
  btn.textContent = 'Sumar al copamiento';

  // Si algo falló, el modal se queda abierto mostrando el motivo real: que
  // el usuario tenga que abrir la consola para saber qué pasó no sirve.
  if (fallos.length > 0 && creadas === 0) {
    console.error('Traspaso de ruta:', fallos);
    err.innerHTML = '<b>No se pudo copiar la ruta.</b><br>' +
      escapeHtml_(fallos[0].length > 220 ? fallos[0].slice(0, 219) + '…' : fallos[0]);
    err.classList.add('show');
    return;
  }

  document.getElementById('ruta-traspaso-overlay').classList.remove('show');
  state.rutaTraspaso = null;

  const avisoYa = yaEstaban.length ? ' · Ya estaba en ' + yaEstaban.join(' y ') + ' (no se duplicó).' : '';
  if (fallos.length > 0) {
    console.error('Traspaso de ruta:', fallos);
    mostrarToast_('⚠️ ' + creadas + ' copia(s) creadas · falló: ' + fallos[0] + avisoYa);
  } else if (creadas === 0) {
    mostrarToast_(yaEstaban.length ? 'ℹ️ La ruta ya estaba en ' + yaEstaban.join(' y ') + ': no se creó ninguna copia.'
                                   : '⚠️ No se creó ninguna copia.');
  } else {
    mostrarToast_('⏫ Ruta sumada a ' + escenarios.filter(e => faltan.indexOf(e) === -1 && yaEstaban.indexOf(nombreEscenario_(e)) === -1)
      .map(nombreEscenario_).join(' y ') +
      (tramos.length > 1 ? ' · ' + tramos.length + ' tramos en una sola línea' : '') + '.' + avisoYa);
  }
  if (faltan.length > 0) {
    mostrarToast_('ℹ️ Sin plan en esta comuna para: ' + faltan.join(', ') + '. Créalo y repite.');
  }

  await loadPlanificacionRecursos_(state.activeComunaId);
  if (state.influenciaVisible) refrescarInfluencia_();
}

async function loadPatrullajeLayer_() {
  patrullajeLayer.clearLayers();
  window.arbolPatrullaje = {};
  try {
    const { data, error } = await supabaseClient
      .from('v_rutas_patrullaje')
      .select('id, nombre_ruta, alias, temporada, tipo_recurso, actividad, tipo_movil, km, empresa, zona_alerta, sector, id_subg, subgerencia, id_area, area, id_comuna, comuna, comuna_slug, geometry');
    if (error) {
      state.patrullajeInfo = { ok: false, count: 0, cargado: true, error: error.message };
      if (document.querySelector('.rail-btn.active') && document.querySelector('.rail-btn.active').dataset.tab === 'capas') renderTab('capas');
      return;
    }
    const permitidas = filtrarRutasPorPerfil_(data || []);
    state.patrullajeRutas = permitidas;

    window.patrullajeRutaCapas = {}; // id -> capa (para el neón al seleccionar)
    permitidas.forEach(r => {
      if (!r.geometry) return;
      const capaRuta = L.geoJSON(r.geometry, {
        style: { color: '#DC2626', weight: 3, opacity: 0.85 },
        onEachFeature: (f, layer) => {
          layer.bindPopup(
            '<div class="popup-title">🚓 ' + escapeHtml_(r.nombre_ruta || r.id) + '</div>' +
            '<div class="popup-row">Subgerencia: ' + escapeHtml_(r.subgerencia || '—') + '</div>' +
            '<div class="popup-row">Área: ' + escapeHtml_(r.area || '—') + ' · Sector: ' + escapeHtml_(r.sector || '—') + '</div>' +
            '<div class="popup-row">Comuna: ' + escapeHtml_(r.comuna || '—') + '</div>' +
            '<div class="popup-row">Actividad: ' + escapeHtml_(r.actividad || '—') + ' · ' + escapeHtml_(r.tipo_movil || '—') + '</div>' +
            '<div class="popup-row">KM: ' + (r.km != null ? Number(r.km).toFixed(1) : '—') + ' · Temp: ' + escapeHtml_(r.temporada || '—') + '</div>' +
            (puedeTraspasarRutas_()
              ? '<div class="popup-actions"><button class="popup-btn" data-action="ruta-a-alertas" ' +
                'data-id="' + escapeHtml_(String(r.id)) + '" style="color:#7C3AED;">⏫ Sumar a alertas</button></div>'
              : '')
          );
          // Neón mientras el popup de la ruta está abierto (seleccionada)
          layer.on('popupopen', () => { resaltarPatrullajeNeon_(r.id); bindAccionesRutaPopup_(r.id); });
          layer.on('popupclose', () => quitarPatrullajeNeon_());

          // Neón e información al pasar el cursor, sin necesidad de hacer clic.
          // El tooltip se enlaza al crear la capa: Leaflet lo muestra y lo
          // oculta solo al pasar el cursor. Intentar crearlo dentro del
          // mouseover no funcionaba, porque setTooltipContent existe siempre
          // en el prototipo y la condición nunca llegaba a enlazarlo.
          layer.bindTooltip(tooltipRuta_(r), {
            sticky: true,
            direction: 'top',
            opacity: 1,
            className: 'map-label map-label-detalle',
          });

          layer.on('mouseover', () => {
            if ((state.editorMode || state.modoPlanificacion) &&
                (state.dibujoModo === 'linea' || state.dibujoModo === 'area')) {
              layer.closeTooltip();
              return;
            }
            resaltarPatrullajeNeon_(r.id);
          });
          layer.on('mouseout', () => quitarPatrullajeNeon_());
        },
      });
      window.patrullajeRutaCapas[r.id] = capaRuta;
      // Árbol Área → Sector, igual que Áreas de Relacionamiento.
      const areaP = r.area || 'Sin área';
      const sectorP = r.sector || 'Sin sector';
      if (!window.arbolPatrullaje[areaP]) window.arbolPatrullaje[areaP] = {};
      if (!window.arbolPatrullaje[areaP][sectorP]) window.arbolPatrullaje[areaP][sectorP] = [];
      window.arbolPatrullaje[areaP][sectorP].push(capaRuta);
      capaRuta.addTo(patrullajeLayer);
    });

    state.patrullajeInfo = { ok: true, count: permitidas.length, cargado: true };
    if (state.patrullajeLayerOn) patrullajeLayer.addTo(map);
    enviarLimiteAlFondo_();
    if (document.querySelector('.rail-btn.active') && document.querySelector('.rail-btn.active').dataset.tab === 'capas') renderTab('capas');
  } catch (e) {
    state.patrullajeInfo = { ok: false, count: 0, cargado: true, error: e.message };
  }
}

// ════════════════════════════════════════════════════════════════
// CAPAS ADMIN: Recursos y Rutas filtrados por COMUNA activa
// (solo para el perfil Administrador — complementan las capas globales)
// ════════════════════════════════════════════════════════════════
async function loadRecursosComunaAdmin_() {
  recursosComunaAdminLayer.clearLayers();
  recursosComunaAdminFeatureLayers = [];
  state.recursosComunaAdminInfo = { ok: false, count: 0 };
  const idc = idComunaActiva_();
  if (idc == null) { state.recursosComunaAdminInfo = { ok: true, count: 0 }; return; }

  const { data, error } = await supabaseClient
    .from('recursos_disponibles_area_geojson')
    .select('*')
    .eq('id_comuna', idc);
  if (error) { state.recursosComunaAdminInfo = { ok: false, count: 0, error: error.message }; return; }

  (data || []).forEach(r => {
    if (r.lat == null || r.lng == null) return;
    const etiqueta = escapeHtml_(r.tipo_recurso || r.nombre_recurso || 'Recurso');
    const m = L.marker([r.lat, r.lng], { icon: construirIconoRecursoMaestro_(r, '#0F172A') });
    m.bindPopup(
      '<div class="popup-title">' + escapeHtml_(r.nombre_recurso || r.tipo_recurso || 'Recurso') + '</div>' +
      '<div class="popup-row">🏷️ ' + escapeHtml_(r.tipo_recurso || '') + (r.tipo_movil && r.tipo_movil !== 'SIN MÓVIL' ? ' (' + escapeHtml_(r.tipo_movil) + ')' : '') + '</div>' +
      '<div class="popup-row">🏢 ' + escapeHtml_(r.empresa || '—') + '</div>' +
      '<div class="popup-row">🗺️ ' + escapeHtml_(r.area || '—') + ' · ' + escapeHtml_(r.sector || '—') + '</div>' +
      '<div class="popup-row">📍 ' + escapeHtml_(r.comuna || '—') + '</div>'
    );
    m._tipoRecurso = r.tipo_recurso || 'Sin tipo'; m._pertenencia = pertenenciaDeRecurso_(r);
    recursosComunaAdminFeatureLayers.push({ layer: m, nombre: etiqueta });
    if (state.mostrarEtiquetasRecursosComunaAdmin && !tipoRecursoOculto_(m._tipoRecurso)) {
      m.bindTooltip(etiqueta, { permanent: true, interactive: true, direction: 'top', offset: [0, -16], className: 'map-label' });
    }
    recursosComunaAdminLayer.addLayer(m);
    if (tipoRecursoOculto_(m._tipoRecurso)) { const el = m.getElement && m.getElement(); if (el) el.style.display = 'none'; }
  });
  setTimeout(() => aplicarVisibilidadTiposRecurso_(recursosComunaAdminLayer), 50);
  state.recursosComunaAdminInfo = { ok: true, count: (data || []).length };
}

function toggleEtiquetasRecursosComunaAdmin_() {
  state.mostrarEtiquetasRecursosComunaAdmin = !state.mostrarEtiquetasRecursosComunaAdmin;
  recursosComunaAdminFeatureLayers.forEach(({ layer, nombre }) => {
    if (state.mostrarEtiquetasRecursosComunaAdmin) {
      layer.bindTooltip(nombre, { permanent: true, interactive: true, direction: 'top', offset: [0, -16], className: 'map-label' });
    } else {
      layer.unbindTooltip();
    }
  });
  const btn = document.getElementById('btn-etiq-recursos-comuna-admin');
  if (btn) btn.classList.toggle('active', state.mostrarEtiquetasRecursosComunaAdmin);
}

async function loadRutasComunaAdmin_() {
  rutasComunaAdminLayer.clearLayers();
  window.arbolRutasComuna = {};
  state.rutasComunaAdminInfo = { ok: false, count: 0 };
  const idc = idComunaActiva_();
  if (idc == null) { state.rutasComunaAdminInfo = { ok: true, count: 0 }; return; }

  const { data, error } = await supabaseClient
    .from('v_rutas_patrullaje')
    .select('id, nombre_ruta, subgerencia, area, sector, comuna, id_comuna, actividad, tipo_movil, km, temporada, geometry')
    .eq('id_comuna', idc);
  if (error) { state.rutasComunaAdminInfo = { ok: false, count: 0, error: error.message }; return; }

  // Las rutas de la comuna se registran en el mismo índice que las de
  // patrullaje: comparten el hover con neón y la acción de traspaso.
  state.patrullajeRutas = state.patrullajeRutas || [];
  window.patrullajeRutaCapas = window.patrullajeRutaCapas || {};

  (data || []).forEach(r => {
    if (!r.geometry) return;

    // Registrar la ruta para que el traspaso pueda encontrarla por id.
    if (!state.patrullajeRutas.some(x => String(x.id) === String(r.id))) {
      state.patrullajeRutas.push(r);
    }

    const capa = L.geoJSON(r.geometry, {
      style: { color: '#DC2626', weight: 3, opacity: 0.85 },
      onEachFeature: (f, layer) => {
        layer.bindPopup(
          '<div class="popup-title">🚓 ' + escapeHtml_(r.nombre_ruta || r.id) + '</div>' +
          '<div class="popup-row">Área: ' + escapeHtml_(r.area || '—') + ' · Sector: ' + escapeHtml_(r.sector || '—') + '</div>' +
          '<div class="popup-row">Comuna: ' + escapeHtml_(r.comuna || '—') + '</div>' +
          '<div class="popup-row">Actividad: ' + escapeHtml_(r.actividad || '—') + ' · ' + escapeHtml_(r.tipo_movil || '—') + '</div>' +
          '<div class="popup-row">KM: ' + (r.km != null ? Number(r.km).toFixed(1) : '—') + '</div>' +
          (puedeTraspasarRutas_()
            ? '<div class="popup-actions"><button class="popup-btn" data-action="ruta-a-alertas" ' +
              'data-id="' + escapeHtml_(String(r.id)) + '" style="color:#7C3AED;">⏫ Sumar a alertas</button></div>'
            : '')
        );
        layer.on('popupopen', () => { resaltarPatrullajeNeon_(r.id); bindAccionesRutaPopup_(); });
        layer.on('popupclose', () => quitarPatrullajeNeon_());

        layer.bindTooltip(tooltipRuta_(r), {
          sticky: true,
          direction: 'top',
          opacity: 1,
          className: 'map-label map-label-detalle',
        });

        layer.on('mouseover', () => {
          if ((state.editorMode || state.modoPlanificacion) &&
              (state.dibujoModo === 'linea' || state.dibujoModo === 'area')) {
            layer.closeTooltip();
            return;
          }
          resaltarPatrullajeNeon_(r.id);
        });
        layer.on('mouseout', () => quitarPatrullajeNeon_());
      }
    });
    window.patrullajeRutaCapas[r.id] = capa;
    const areaC = r.area || 'Sin área';
    const sectorC = r.sector || 'Sin sector';
    if (!window.arbolRutasComuna[areaC]) window.arbolRutasComuna[areaC] = {};
    if (!window.arbolRutasComuna[areaC][sectorC]) window.arbolRutasComuna[areaC][sectorC] = [];
    window.arbolRutasComuna[areaC][sectorC].push(capa);
    rutasComunaAdminLayer.addLayer(capa);
  });
  state.rutasComunaAdminInfo = { ok: true, count: (data || []).length };
}

function bindPopupActionsRecursoArea_(r) {
  document.querySelectorAll('.popup-btn[data-action="editar-recurso-area"]').forEach(btn => {
    btn.onclick = () => { map.closePopup(); abrirModalRecursoArea_(r); };
  });
  document.querySelectorAll('.popup-btn[data-action="eliminar-recurso-area"]').forEach(btn => {
    btn.onclick = async () => {
      if (!confirm('¿Eliminar este recurso disponible? También se borran sus turnos y rutas asociadas.')) return;
      const { error } = await supabaseClient.rpc('eliminar_recurso_referencia', { p_recurso_id: btn.dataset.id });
      if (error) { mostrarToast_('Error: ' + error.message); return; }
      map.closePopup();
      mostrarToast_('Eliminado.');
      loadRecursosDisponiblesAreaLayer_();
    };
  });
}

function toggleEtiquetasRecursosArea_() {
  state.mostrarEtiquetasRecursosArea = !state.mostrarEtiquetasRecursosArea;
  recursosDisponiblesFeatureLayers.forEach(({ layer, nombre }) => {
    if (state.mostrarEtiquetasRecursosArea) {
      const esFigura = layer instanceof L.Polygon || layer instanceof L.Polyline;
      layer.bindTooltip(nombre, { permanent: true, direction: esFigura ? 'center' : 'top', offset: esFigura ? [0, 0] : [0, -16], className: 'map-label' });
    } else {
      layer.unbindTooltip();
    }
  });
  const btn = document.getElementById('btn-toggle-etiquetas-recursos-area');
  if (btn) btn.classList.toggle('active', state.mostrarEtiquetasRecursosArea);
}

function toggleEtiquetasFundos_() {
  state.mostrarEtiquetasFundos = !state.mostrarEtiquetasFundos;
  fundosCmpcFeatureLayers.forEach(({ layer, nombre }) => {
    if (state.mostrarEtiquetasFundos) {
      layer.bindTooltip(nombre, { permanent: true, direction: 'center', className: 'map-label label-fundo' });
    } else {
      layer.unbindTooltip();
    }
  });
  const btn = document.getElementById('btn-toggle-etiquetas-fundos');
  if (btn) btn.classList.toggle('active', state.mostrarEtiquetasFundos);
}

function onGeoData(comunaId, geo) {
  if (window.__DEBUG__) console.log('[DEBUG] Respuesta de get-comuna-geodata:', geo);
  if (window.__DEBUG__) console.log('[DEBUG] geo.limite:', geo.limite);

  if (geo.limite && geo.limite.ok) {
    limiteLayer.clearLayers(); // evitar acumular comunas visitadas
    limiteLayer.addData(geo.limite.data);
    // Con varias comunas manda el sistema multi (activa resaltada); el límite
    // individual NUNCA se muestra para no duplicar líneas negras sólidas.
    if (tieneVariasComunas_()) {
      map.removeLayer(limiteLayer);
    } else {
      if (state.limiteComunalOn) { if (!map.hasLayer(limiteLayer)) limiteLayer.addTo(map); }
      else { map.removeLayer(limiteLayer); }
    }
    enviarLimiteAlFondo_(); // capa de referencia: siempre al fondo
    try {
      const b = limiteLayer.getBounds();
      if (window.__DEBUG__) console.log('[DEBUG] Bounds del límite:', b, 'isValid:', b.isValid());
      if (b.isValid()) {
        map.fitBounds(b, { padding: [40, 40] });
      }
    } catch (e) {
      console.error('[DEBUG] Error al calcular/ajustar bounds del límite:', e);
    }
  } else {
    if (window.__DEBUG__) console.warn('[DEBUG] geo.limite no vino OK. Detalle:', geo.limite && geo.limite.error);
  }

  actualizarOverlayPlanContingencia_();
  loadPlanificacionRecursos_(comunaId);

  state.areasPobladasInfo = { ok: false, matched: false, count: 0 };
  if (window.__DEBUG__) console.log('[DEBUG] geo.areasPobladas:', geo.areasPobladas);
  if (geo.areasPobladas && geo.areasPobladas.ok) {
    const feats = geo.areasPobladas.data.features || [];
    state.areasPobladasInfo = { ok: true, matched: geo.areasPobladas.data.matched !== false, count: feats.length };
    L.geoJSON(geo.areasPobladas.data, {
      pointToLayer: (f, ll) => {
        const m = L.circleMarker(ll, { radius: 6, color: '#7C3AED', weight: 2, fillColor: '#C4B5FD', fillOpacity: 0.9 });
        const nombre = buscarProp_(f.properties, ['nombre', 'nom', 'area', 'localidad', 'poblado', 'name']);
        if (nombre) m.bindTooltip(String(nombre), { permanent: true, direction: 'top', offset: [0, -6], className: 'map-label label-areas' });
        return m;
      },
      style: { color: '#7C3AED', weight: 2, fillOpacity: 0.18 },
      onEachFeature: (f, layer) => {
        if (f.geometry && f.geometry.type !== 'Point' && layer.getBounds) {
          const nombre = buscarProp_(f.properties, ['nombre', 'nom', 'area', 'localidad', 'poblado', 'name']);
          if (nombre) {
            try {
              const centro = layer.getBounds().getCenter();
              L.marker(centro, { icon: L.divIcon({ className: '', html: '', iconSize: [0, 0] }) })
                .bindTooltip(String(nombre), { permanent: true, direction: 'center', className: 'map-label label-areas' })
                .addTo(areasPobladasLayer);
            } catch (e) {}
          }
        }
      }
    }).addTo(areasPobladasLayer);
  }

  // Limpieza defensiva del CONTENEDOR real de Leaflet (no solo referencias
  // JS sueltas) — garantiza que nunca queden capas de incendios de una
  // comuna anterior pegadas en el mapa, sin importar el orden de llegada
  // de las respuestas.
  state.incendiosMatched = true;
  const featsComuna = (geo.incendiosSidco && geo.incendiosSidco.ok) ? (geo.incendiosSidco.data.features || []) : [];
  if (geo.incendiosSidco && geo.incendiosSidco.ok) state.incendiosMatched = geo.incendiosSidco.data.matched !== false;
  // Focos SOLO de la comuna: base de las amebas y del KPI (no cambian con el margen).
  state.focosPorTemporada = agruparFocosPorTemporada_(featsComuna);
  state.temporadasComuna = Object.keys(state.focosPorTemporada).sort().reverse();
  // Mapa: primero la comuna (inmediato); luego comuna/área + 10 km desde el archivo nacional.
  state.incendiosAmpliado = false;
  pintarIncendios_(state.focosPorTemporada);
  ampliarIncendiosZona_();

  if (state.layersOn.__areasPobladas) areasPobladasLayer.addTo(map);

  // Capas nuevas por comuna (Fundos Arauco, Comité): se cargan aquí para que
  // se refresquen cada vez que cambia la comuna activa.
  Promise.all([loadFundosAraucoLayer_(), loadComiteLayer_(), loadAreaLayers_(), loadRedVialLayer_(), loadRedVialCmpc_(true)]).then(() => {
    return loadFundosCmpcPostgis_();
  }).then(() => {
    if (document.querySelector('.rail-btn.active').dataset.tab === 'capas') renderTab('capas');
  });

  if (document.querySelector('.rail-btn.active').dataset.tab === 'capas') renderTab('capas');
}

