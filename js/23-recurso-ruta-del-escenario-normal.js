/* ============ RECURSO ↔ RUTA DEL ESCENARIO NORMAL (SQL 79) ============
 * La ruta de un recurso (referencia_recursos) es una LÍNEA del escenario Normal,
 * enlazada por planificacion_recursos.recurso_ref_id (no las rutas SIGEI).
 * En el formulario de crear/editar una ruta Normal aparece "Recurso asociado":
 * recursos de Relacionamiento de la comuna/área, del tipo elegido; los que ya
 * tienen ruta salen BLOQUEADOS (🔒) para no perder su enlace. Alerta Amarilla y
 * Roja heredan el recurso al propagar. El mismo id une la ruta con el Calendario. */

/** Llena el select "Recurso asociado" de un formulario (prefijo 'f' = crear, 'erp' = editar). */
async function cargarOpcionesRecursoRef_(prefijo, ctx) {
  const wrap = document.getElementById(prefijo + '-recurso-ref-wrap');
  const sel = document.getElementById(prefijo + '-recurso-ref');
  const ayuda = document.getElementById(prefijo + '-recurso-ref-ayuda');
  if (!wrap || !sel) return;
  wrap.style.display = '';
  sel.disabled = true;
  sel.innerHTML = '<option value="">Cargando recursos…</option>';
  ayuda.textContent = '';
  const pedido = (wrap._pedido = (wrap._pedido || 0) + 1);

  // Recursos del área (plan de área) o, en un plan de COMUNA, de TODAS las áreas a las
  // que pertenece la comuna (13-10-2026): un área abarca varias comunas y sus recursos
  // pueden estar ubicados en otra comuna del área o aún sin ubicar (sin comuna).
  // Áreas de la comuna = las de los recursos ubicados en ella + Administración ›
  // Comunas por área (area_comunas_manual, SQL 93).
  let res, areasComuna = [];
  if (ctx.area) res = await recursosDeAreas_(ctx.area, 'codigo_ref');
  else {
    res = await supabaseClient.from('recursos_disponibles_area_geojson').select('*').eq('id_comuna', ctx.idComuna);
    if (!res.error) {
      // Una entrada por área (la misma área puede venir con o sin tilde / guiones)
      const areas = new Map(), agregar = a => { if (a) { const k = plNorm_(a).replace(/[^A-Z0-9]/g, ''); if (!areas.has(k)) areas.set(k, a); } };
      (res.data || []).forEach(r => agregar(r.area));
      try {
        // Áreas que administran la comuna (SQL 94: asignación administrativa, reasignable)
        let { data: adm, error: ea } = await supabaseClient.from('v_area_comunas_admin').select('area').eq('id_comuna', ctx.idComuna);
        if (ea) ({ data: adm, error: ea } = await supabaseClient.from('area_comunas_manual').select('area').eq('id_comuna', ctx.idComuna));
        if (!ea) (adm || []).forEach(m => { if (m.area && m.area !== '(sin área)') agregar(m.area); });
      } catch (e) { /* sin el SQL 93/94: solo las áreas de los recursos de la comuna */ }
      areasComuna = [...areas.values()];
      if (areasComuna.length) {
        const resArea = await recursosDeAreas_(areasComuna, 'codigo_ref');
        if (!resArea.error) res = resArea;
      }
    }
  }
  if (pedido !== wrap._pedido) return;
  if (res.error) { sel.innerHTML = '<option value="">No se pudieron cargar los recursos</option>'; ayuda.textContent = res.error.message; return; }

  const deRel = (res.data || []).filter(r => pertenenciaDeRecurso_(r) === 'Relacionamiento');
  const candidatos = deRel.filter(r => !ctx.tipo || plNorm_(r.tipo_recurso) === plNorm_(ctx.tipo))
    .sort((a, b) => compararTipoRecurso_(a.tipo_recurso, b.tipo_recurso) ||
      String(claveRecurso_(a) || '~').localeCompare(String(claveRecurso_(b) || '~'), 'es', { numeric: true }));

  // ¿Cuáles ya tienen ruta en el escenario Normal?
  const ids = candidatos.map(r => r.id);
  let asignadas = {};
  if (ids.length) {
    const { data: rn } = await supabaseClient.from('v_recurso_ruta_normal').select('recurso_id, ruta_id, descripcion').in('recurso_id', ids);
    (rn || []).forEach(x => { asignadas[x.recurso_id] = x; });
  }
  if (pedido !== wrap._pedido) return;

  let libres = 0, bloqueados = 0;
  const opcion = (r, conComuna) => {
    const a = asignadas[r.id];
    const esEsta = a && ctx.rutaId && a.ruta_id === ctx.rutaId;
    const ocupado = a && !esEsta;
    if (ocupado) bloqueados++; else libres++;
    const comunaR = r.comuna || r.comuna_corma || '';
    const texto = (claveRecurso_(r) || 'Sin clave') + (r.codigo_ref && r.codigo_ref !== claveRecurso_(r) ? ' (' + r.codigo_ref + ')' : '') + ' · ' + aTitulo_(r.tipo_recurso || '') + (r.sector ? ' · ' + r.sector : '') +
      (conComuna ? ' · ' + (comunaR ? aTitulo_(comunaR) : 'sin ubicar') : '') +
      (ocupado ? ' — 🔒 ya tiene ruta' : '');
    return '<option value="' + escapeHtml_(r.id) + '"' + (ocupado ? ' disabled' : '') +
      ((esEsta || r.id === ctx.recursoActual) ? ' selected' : '') +
      (ocupado && a.descripcion ? ' title="Ruta: ' + escapeHtml_(a.descripcion) + '"' : '') + '>' + escapeHtml_(texto) + '</option>';
  };
  // Grupos: primero los que NO tienen ruta (de esta comuna, sin ubicar, de otras comunas del área); al final los bloqueados
  const tieneRuta = r => { const a = asignadas[r.id]; return a && !(ctx.rutaId && a.ruta_id === ctx.rutaId); };
  const grupo = (titulo, lista, conComuna) => lista.length ? '<optgroup label="' + escapeHtml_(titulo + ' (' + lista.length + ')') + '">' + lista.map(r => opcion(r, conComuna)).join('') + '</optgroup>' : '';
  const enComuna = r => !ctx.area && Number(r.id_comuna) === Number(ctx.idComuna);
  const libresL = candidatos.filter(r => !tieneRuta(r)), ocupadosL = candidatos.filter(tieneRuta);
  const etqAreas = ctx.area ? 'del área' : (areasComuna.length ? 'del área ' + areasComuna.map(a => aTitulo_(a)).join(' / ') : '');
  sel.innerHTML = '<option value="">— Sin recurso asociado —</option>' + (ctx.area
    ? grupo('🟢 Sin ruta', libresL, true) + grupo('🔒 Ya tienen ruta', ocupadosL, true)
    : grupo('🟢 Sin ruta · en esta comuna', libresL.filter(enComuna), false) +
      grupo('📍 Sin ruta · aún sin ubicar en el mapa', libresL.filter(r => !enComuna(r) && r.id_comuna == null), false) +
      grupo('🟢 Sin ruta · otras comunas ' + etqAreas, libresL.filter(r => !enComuna(r) && r.id_comuna != null), true) +
      grupo('🔒 Ya tienen ruta', ocupadosL, true));
  sel.disabled = false;
  wrap.dataset.original = ctx.recursoActual || '';
  ayuda.textContent = !candidatos.length
    ? (ctx.tipo ? 'No hay recursos de Relacionamiento del tipo "' + aTitulo_(ctx.tipo) + '" en esta ' + (ctx.area ? 'área' : 'comuna o su área') + '.'
                : 'No hay recursos de Relacionamiento en esta ' + (ctx.area ? 'área' : 'comuna o su área') + '.') +
      (!ctx.area && !areasComuna.length ? ' Si la comuna pertenece a un área, asóciala en Administración › Comunas por área.' : '')
    : libres + ' sin ruta' + (bloqueados ? ' · ' + bloqueados + ' bloqueado(s) porque ya tienen ruta' : '') +
      (!ctx.area && areasComuna.length ? ' · se listan los recursos ' + etqAreas : '') +
      '. El enlace también une la ruta con el Calendario de Turnos del recurso.';
}

function ocultarRecursoRef_(prefijo) {
  const wrap = document.getElementById(prefijo + '-recurso-ref-wrap');
  if (wrap) { wrap.style.display = 'none'; wrap._pedido = (wrap._pedido || 0) + 1; }
  const sel = document.getElementById(prefijo + '-recurso-ref');
  if (sel) sel.innerHTML = '';
}

/** Formulario de CREAR: solo para una ruta (línea) del escenario Normal. */
function prepararRecursoRefCrear_() {
  const mp = state.modoPlanificacion;
  const esRutaNormal = !!(mp && mp.escenario === 'Verde' && state.pendingLineaPuntos && !state.editingIdPlan);
  if (!esRutaNormal) { ocultarRecursoRef_('f'); return; }
  const cm = (state.comunas || []).find(c => c.id === mp.comunaId);
  cargarOpcionesRecursoRef_('f', {
    tipo: document.getElementById('f-tipo-recurso').value,
    area: mp.ambito === 'area' ? mp.nombre : null,
    idComuna: cm ? cm.id_comuna : idComunaActiva_(),
    rutaId: null, recursoActual: null,
  });
}

/** Formulario de EDITAR una entidad planificada. */
async function prepararRecursoRefEditar_(r) {
  ocultarRecursoRef_('erp');
  if (!r || r.tipo_geometria !== 'linea') return;
  const { data: plan } = await supabaseClient.from('planes_contingencia')
    .select('id, escenario, ambito, comuna_id, area').eq('id', r.plan_id).maybeSingle();
  if (!plan) return;
  const wrap = document.getElementById('erp-recurso-ref-wrap');
  const sel = document.getElementById('erp-recurso-ref');
  if (plan.escenario !== 'Verde') {
    // Alerta Amarilla / Roja: el recurso se hereda de la ruta Normal (solo se muestra)
    if (!r.recurso_ref_id) return;
    const { data: rr } = await supabaseClient.from('recursos_disponibles_area_geojson')
      .select('codigo_ref, tipo_recurso').eq('id', r.recurso_ref_id).maybeSingle();
    wrap.style.display = '';
    sel.innerHTML = '<option>' + escapeHtml_((rr && rr.codigo_ref) || 'Recurso') + (rr ? ' · ' + escapeHtml_(aTitulo_(rr.tipo_recurso || '')) : '') + '</option>';
    sel.disabled = true;
    wrap.dataset.original = r.recurso_ref_id;
    document.getElementById('erp-recurso-ref-ayuda').textContent = 'Heredado de la ruta del escenario Normal: se cambia allí.';
    return;
  }
  const cm = (state.comunas || []).find(c => c.id === plan.comuna_id);
  wrap._ctx = { tipo: r.tipo_recurso, area: plan.ambito === 'area' ? plan.area : null,
                idComuna: cm ? cm.id_comuna : idComunaActiva_(), rutaId: r.id, recursoActual: r.recurso_ref_id };
  await cargarOpcionesRecursoRef_('erp', wrap._ctx);
}

/** Guarda el enlace si cambió. Devuelve el mensaje de error o null. */
async function guardarRecursoRef_(prefijo, rutaId) {
  const wrap = document.getElementById(prefijo + '-recurso-ref-wrap');
  const sel = document.getElementById(prefijo + '-recurso-ref');
  if (!wrap || wrap.style.display === 'none' || !sel || sel.disabled) return null;
  const nuevo = sel.value || null;
  if ((nuevo || '') === (wrap.dataset.original || '')) return null;
  const { error } = await supabaseClient.rpc('asociar_recurso_planificacion', { p_id: rutaId, p_recurso_ref_id: nuevo });
  // El indicador 🟢/🔴 de los Recursos disponibles cambia con la asociación: se refresca la capa si está visible
  if (!error && typeof recursosDisponiblesAreaLayer !== 'undefined' && map.hasLayer(recursosDisponiblesAreaLayer)) loadRecursosDisponiblesAreaLayer_();
  return error ? error.message : null;
}

(function iniciarRecursoRef_() {
  // Crear: se recalcula al abrir el formulario y al cambiar el tipo de recurso.
  const overlay = document.getElementById('modal-overlay');
  if (overlay) new MutationObserver(() => {
    if (!overlay.classList.contains('show')) return;
    // GRD planificando: sin CMPC en la lista de instituciones (solo planifica las otras)
    const fI = document.getElementById('f-institucion');
    Array.prototype.forEach.call(fI.options, o => { o.hidden = false; o.disabled = false; });
    if (state.modoPlanificacion) quitarCmpcSelectGrd_(fI);
    // Tipos según institución y geometría («Efecto disuasivo» solo rutas/áreas). Al EDITAR no se repuebla:
    // se perdería un tipo guardado que ya no está en el catálogo.
    if (!state.editingIdPlan) actualizarTipoRecursoPorInstitucion_();
    prepararRecursoRefCrear_();
  }).observe(overlay, { attributes: true, attributeFilter: ['class'] });
  const fTipo = document.getElementById('f-tipo-recurso');
  if (fTipo) fTipo.addEventListener('change', prepararRecursoRefCrear_);
  // Cambiar la institución repuebla los tipos: se recalcula después de ese cambio.
  const fInst = document.getElementById('f-institucion');
  if (fInst) fInst.addEventListener('change', () => setTimeout(prepararRecursoRefCrear_, 0));
  // Editar: al cambiar el tipo, la lista se filtra por el nuevo tipo.
  const erpTipo = document.getElementById('erp-tipo');
  if (erpTipo) erpTipo.addEventListener('change', () => {
    const wrap = document.getElementById('erp-recurso-ref-wrap');
    if (wrap && wrap._ctx && wrap.style.display !== 'none' && !document.getElementById('erp-recurso-ref').disabled) {
      cargarOpcionesRecursoRef_('erp', Object.assign({}, wrap._ctx, { tipo: erpTipo.value }));
    }
  });
})();

async function guardarRecursoDesdeModal_() {
  const btn = document.getElementById('btn-save-modal');
  const errEl = document.getElementById('modal-error');
  errEl.classList.remove('show');

  const institucionId = document.getElementById('f-institucion').value;
  const tipoRecurso = document.getElementById('f-tipo-recurso').value;
  const descripcion = document.getElementById('f-descripcion').value;

  if (!institucionId) { errEl.textContent = 'Selecciona una institución.'; errEl.classList.add('show'); return; }

  // 17-10-2026: si lo dibujado cae sobre todo en OTRA comuna de su administración, el usuario decide en
  // cuál dejarlo (decidirComunaTrazado_, SQL 117). Solo en planificación y al crear.
  let destinoPlan = null;
  if (!state.editingIdPlan && state.modoPlanificacion) {
    const pts = state.pendingLineaPuntos || state.pendingAreaPuntos || (state.pendingLatLng ? [state.pendingLatLng] : null);
    if (pts) {
      const tipoG = state.pendingLineaPuntos ? 'linea' : state.pendingAreaPuntos ? 'area' : 'punto';
      destinoPlan = await decidirComunaTrazado_(pts.map(p => [p.lng, p.lat]), tipoG);
      if (destinoPlan === null) return;   // canceló: el formulario sigue abierto
    }
  }
  // Punto 2: advertir si la geometría nueva cae fuera del límite comunal.
  // (Solo al crear; al editar no se cambia la geometría.)
  if (!state.editingIdPlan && !(destinoPlan && destinoPlan.saltarAvisoFuera)) {
    let puntosParaChequear = null;
    if (state.pendingLatLng) puntosParaChequear = [state.pendingLatLng];
    else if (state.pendingLineaPuntos) puntosParaChequear = state.pendingLineaPuntos;
    else if (state.pendingAreaPuntos) puntosParaChequear = state.pendingAreaPuntos;
    if (puntosParaChequear && !confirmarSiFueraDeComuna_(puntosParaChequear)) {
      return; // el usuario canceló; se mantiene el modal abierto
    }
  }

  btn.textContent = state.editingIdPlan ? 'Actualizando…' : 'Guardando…';
  btn.disabled = true;

  let error;

  if (state.modoPlanificacion) {
    const planId = (destinoPlan && destinoPlan.planId) || state.modoPlanificacion.planId;
    if (destinoPlan && destinoPlan.comuna) mostrarToast_('🏘️ Se guardará en el plan de ' + destinoPlan.comuna + '.');
    let idRutaNueva = null;   // ruta recién creada (para preguntar si también va en las alertas superiores)
    if (state.pendingLineaPuntos) {
      const puntosGeoJSON = state.pendingLineaPuntos.map(p => [p.lng, p.lat]);
      let creada;
      ({ data: creada, error } = await supabaseClient.rpc('crear_recurso_planificacion_linea', {
        p_plan_id: planId, p_institucion_id: institucionId, p_tipo_recurso: tipoRecurso, p_puntos: puntosGeoJSON, p_descripcion: descripcion,
      }));
      // Ruta Normal: enlazar el recurso elegido (SQL 79). Si falla, la ruta igual queda guardada.
      const idCreada = creada && (creada.id || (Array.isArray(creada) && creada[0] && creada[0].id));
      if (!error && idCreada) idRutaNueva = idCreada;
      if (!error && idCreada) {
        const errRef = await guardarRecursoRef_('f', idCreada);
        if (errRef) mostrarToast_('⚠️ La ruta se guardó, pero no se pudo asociar el recurso: ' + errRef);
      }
    } else if (state.pendingAreaPuntos) {
      const puntosGeoJSON = state.pendingAreaPuntos.map(p => [p.lng, p.lat]);
      ({ error } = await supabaseClient.rpc('crear_recurso_planificacion_area', {
        p_plan_id: planId, p_institucion_id: institucionId, p_tipo_recurso: tipoRecurso, p_puntos: puntosGeoJSON, p_descripcion: descripcion,
      }));
    } else {
      if (!state.pendingLatLng) { errEl.textContent = 'Ubicación no definida.'; errEl.classList.add('show'); btn.disabled = false; btn.textContent = 'Guardar en la planificación'; return; }
      ({ error } = await supabaseClient.rpc('crear_recurso_planificacion', {
        p_plan_id: planId, p_institucion_id: institucionId, p_tipo_recurso: tipoRecurso,
        p_lat: state.pendingLatLng.lat, p_lng: state.pendingLatLng.lng, p_descripcion: descripcion,
      }));
    }

    btn.textContent = 'Guardar en la planificación'; btn.disabled = false;

    if (error) {
      errEl.textContent = error.message.includes('dentro del límite')
        ? '⚠️ Ese punto/línea/área queda fuera del límite de la comuna.'
        : 'No se pudo guardar: ' + error.message;
      errEl.classList.add('show');
      return;
    }

    document.getElementById('modal-overlay').classList.remove('show');
    document.getElementById('f-descripcion').value = '';
    state.pendingLatLng = null;
    cancelarDibujo_();

    // Importación de KML en curso: encadenar con la siguiente ruta en vez de
    // recargar entre una y otra, que sería lento con varios tramos.
    if (state.kmlCola) {
      state.kmlCola.hechas++;
      mostrarToast_('📥 Ruta guardada (' + state.kmlCola.hechas + ' de ' + state.kmlCola.total + ').');
      siguienteRutaKml_();
      return;
    }

    mostrarToast_('Recurso agregado a la planificación.');
    loadPlanificacionRecursos_(state.activeComunaId);
    // 20-10-2026: ruta de una institución distinta de CMPC → preguntar si también se requiere en las alertas superiores
    const instNueva = (state.instituciones || []).find(i => String(i.id) === String(institucionId));
    if (idRutaNueva && instNueva && !esInstitucionCmpc_(instNueva)) preguntarAlertasRutaNueva_(idRutaNueva, state.modoPlanificacion.escenario, instNueva.nombre);
    return;
  }

  const fechaInicio = document.getElementById('f-fecha-inicio').value || null;
  const fechaTermino = document.getElementById('f-fecha-termino').value || null;
  const periodo = document.getElementById('f-periodo').value;

  if (state.editingIdPlan) {
    ({ error } = await supabaseClient
      .from('copamiento_recursos')
      .update({
        institucion_id: institucionId,
        tipo_recurso: tipoRecurso,
        fecha_inicio: fechaInicio,
        fecha_termino: fechaTermino,
        periodo_trabajo: periodo,
        descripcion: descripcion,
      })
      .eq('id', state.editingIdPlan));
  } else if (state.pendingLineaPuntos) {
    const puntosGeoJSON = state.pendingLineaPuntos.map(p => [p.lng, p.lat]);
    ({ error } = await supabaseClient.rpc('crear_recurso_linea', {
      p_comuna_id: state.activeComunaId,
      p_institucion_id: institucionId,
      p_puntos: puntosGeoJSON,
      p_fecha_inicio: fechaInicio,
      p_fecha_termino: fechaTermino,
      p_descripcion: descripcion,
      p_periodo_trabajo: periodo,
      p_tipo_recurso: tipoRecurso,
    }));
  } else if (state.pendingAreaPuntos) {
    const puntosGeoJSON = state.pendingAreaPuntos.map(p => [p.lng, p.lat]);
    ({ error } = await supabaseClient.rpc('crear_recurso_area', {
      p_comuna_id: state.activeComunaId,
      p_institucion_id: institucionId,
      p_puntos: puntosGeoJSON,
      p_fecha_inicio: fechaInicio,
      p_fecha_termino: fechaTermino,
      p_descripcion: descripcion,
      p_periodo_trabajo: periodo,
      p_tipo_recurso: tipoRecurso,
    }));
  } else {
    if (!state.pendingLatLng) { errEl.textContent = 'Ubicación no definida.'; errEl.classList.add('show'); btn.disabled = false; btn.textContent = 'Guardar recurso'; return; }
    ({ error } = await supabaseClient.rpc('crear_recurso', {
      p_comuna_id: state.activeComunaId,
      p_institucion_id: institucionId,
      p_lat: state.pendingLatLng.lat,
      p_lng: state.pendingLatLng.lng,
      p_fecha_inicio: fechaInicio,
      p_fecha_termino: fechaTermino,
      p_descripcion: descripcion,
      p_periodo_trabajo: periodo,
      p_tipo_recurso: tipoRecurso,
    }));
  }

  btn.textContent = state.editingIdPlan ? 'Actualizar recurso' : 'Guardar recurso';
  btn.disabled = false;

  if (error) {
    errEl.textContent = error.message.includes('dentro del límite')
      ? '⚠️ Ese punto/línea queda fuera del límite de la comuna. Ajusta la posición e intenta de nuevo.'
      : 'No se pudo guardar: ' + error.message;
    errEl.classList.add('show');
    return;
  }

  document.getElementById('modal-overlay').classList.remove('show');
  document.getElementById('f-descripcion').value = '';
  mostrarToast_(state.editingIdPlan ? 'Recurso actualizado correctamente.' : 'Recurso creado correctamente.');
  state.editingIdPlan = null;
  state.pendingLatLng = null;
  cancelarDibujo_();
  loadRecursos(state.activeComunaId, ++comunaRequestToken);
}

/* ============ WINDY ============ */
function abrirWindy_(lat, lng, zoom) {
  zoom = zoom || 9;
  const url = 'https://embed.windy.com/embed2.html?lat=' + lat + '&lon=' + lng +
    '&detailLat=' + lat + '&detailLon=' + lng + '&zoom=' + zoom +
    '&level=surface&overlay=wind&menu=&message=true&marker=true&calendar=now&pressure=&type=map&location=coordinates&detail=&metricWind=km%2Fh&metricTemp=%C2%B0C&radarRange=-1';
  document.getElementById('windy-iframe').src = url;
  document.getElementById('windy-title').textContent = 'Windy · ' + lat.toFixed(3) + ', ' + lng.toFixed(3);
  document.getElementById('windy-overlay').classList.add('show');
}

function abrirWindyDesdeToolbar_() {
  const centro = map.getCenter();
  abrirWindy_(centro.lat, centro.lng, map.getZoom());
}

/* ============ PERIODOS CRÍTICOS ============ */
function comunasSeleccionablesUsuario_() {
  if (state.perfil.perfil === 'Administrador') return state.comunas;
  return state.comunas.filter(c => (state.misComunaIds || []).includes(c.id));
}

function abrirModalPeriodo_() {
  document.getElementById('p-nombre').value = '';
  document.getElementById('p-fecha-inicio').value = '';
  document.getElementById('p-fecha-fin').value = '';
  document.getElementById('periodo-modal-error').classList.remove('show');

  const comunasDisponibles = comunasSeleccionablesUsuario_();
  const wrap = document.getElementById('p-comuna-wrap');
  const select = document.getElementById('p-comuna');
  if (comunasDisponibles.length > 1) {
    wrap.style.display = 'block';
    select.innerHTML = '';
    const porRegion = {};
    comunasDisponibles.forEach(c => { (porRegion[c.region] = porRegion[c.region] || []).push(c); });
    Object.keys(porRegion).sort().forEach(region => {
      const grupo = document.createElement('optgroup'); grupo.label = region;
      porRegion[region].sort((a, b) => a.comuna.localeCompare(b.comuna)).forEach(c => {
        const opt = document.createElement('option'); opt.value = c.id; opt.textContent = c.comuna;
        grupo.appendChild(opt);
      });
      select.appendChild(grupo);
    });
    select.value = state.activeComunaId;
  } else {
    wrap.style.display = 'none';
  }

  document.getElementById('periodo-modal-overlay').classList.add('show');
}

async function guardarPeriodoDesdeModal_() {
  const btn = document.getElementById('btn-save-periodo');
  const errEl = document.getElementById('periodo-modal-error');
  errEl.classList.remove('show');

  const comunasDisponibles = comunasSeleccionablesUsuario_();
  const comunaDestino = comunasDisponibles.length > 1 ? document.getElementById('p-comuna').value : state.activeComunaId;
  const nombre = document.getElementById('p-nombre').value.trim();
  const fechaInicio = document.getElementById('p-fecha-inicio').value || null;
  const fechaFin = document.getElementById('p-fecha-fin').value || null;

  if (!comunaDestino) { errEl.textContent = 'Selecciona la comuna para este periodo.'; errEl.classList.add('show'); return; }
  if (!nombre) { errEl.textContent = 'Ponle un nombre al periodo.'; errEl.classList.add('show'); return; }

  btn.textContent = 'Creando…'; btn.disabled = true;

  // ── LOADING: mostrar pantalla de preparación ─────────────────────────────
  document.getElementById('periodo-modal-overlay').classList.remove('show');
  mostrarLandingPeriodoCritico_(nombre);

  const { error, data: nuevoPeriodo } = await supabaseClient.rpc('crear_periodo', {
    p_comuna_id: comunaDestino,
    p_nombre_plan: nombre,
    p_fecha_inicio: fechaInicio,
    p_fecha_fin: fechaFin,
  });

  btn.textContent = 'Crear periodo'; btn.disabled = false;

  if (error) {
    ocultarLandingPlanificacion_();
    errEl.textContent = 'No se pudo crear: ' + error.message;
    errEl.classList.add('show');
    document.getElementById('periodo-modal-overlay').classList.add('show');
    return;
  }

  // Paso 2 del landing
  landingAvanzarPaso_(2, 'Cargando capas y recursos del periodo…');

  if (comunaDestino === state.activeComunaId) {
    await loadRecursos(state.activeComunaId, ++comunaRequestToken);
  } else {
    await setActiveComuna(comunaDestino, true);
    const sel = document.getElementById('comuna-select');
    if (sel && sel.style.display !== 'none') sel.value = comunaDestino;
  }

  // Paso 3 del landing
  landingAvanzarPaso_(3, 'Activando modo de edición…');
  await ofrecerCopiaPlanificacionPrevia_(comunaDestino);

  ocultarLandingPlanificacion_();
  mostrarToast_('Periodo "' + nombre + '" creado y activado en ' + nombreComuna_(comunaDestino) + '.');
}

/* ============ COPIAR PLANIFICACIÓN PREVIA A UN PERIODO RECIÉN CREADO ============ */
async function ofrecerCopiaPlanificacionPrevia_(comunaId) {
  const { data: planes } = await supabaseClient
    .from('planes_contingencia')
    .select('id, escenario')
    .eq('ambito', 'comuna')
    .eq('comuna_id', comunaId);

  if (!planes || planes.length === 0) return;

  const conteos = await Promise.all(planes.map(async p => {
    const { count } = await supabaseClient.from('planificacion_recursos').select('id', { count: 'exact', head: true }).eq('plan_id', p.id);
    return { ...p, count: count || 0 };
  }));

  const conRecursos = conteos.filter(p => p.count > 0);
  if (conRecursos.length === 0) return;

  const cont = document.getElementById('copiar-planificacion-opciones');
  cont.innerHTML = '';
  conRecursos.forEach(p => {
    const btn = document.createElement('button');
    btn.className = 'btn-primary';
    btn.style.cssText = 'width:100%;background:' + (p.escenario === 'Verde' ? '#16A34A' : p.escenario === 'Amarilla' ? '#F59E0B' : '#EF4444') + ';';
    btn.textContent = (p.escenario === 'Verde' ? '🟢 Copiar Normal' : p.escenario === 'Amarilla' ? '🟡 Copiar Alerta Amarilla' : '🔴 Copiar Alerta Roja') + ' (' + p.count + ' recurso(s))';
    btn.addEventListener('click', () => copiarPlanificacionAPeriodo_(p.id, p.escenario));
    cont.appendChild(btn);
  });

  document.getElementById('copiar-planificacion-overlay').classList.add('show');
}

async function copiarPlanificacionAPeriodo_(planId, escenario) {
  document.getElementById('copiar-planificacion-overlay').classList.remove('show');
  mostrarToast_('Copiando recursos de la planificación ' + etiquetaEscenario_(escenario) + '…');

  const { data: recursos, error } = await supabaseClient
    .from('planificacion_recursos_geojson')
    .select('*')
    .eq('plan_id', planId);

  if (error || !recursos) { mostrarToast_('No se pudo leer la planificación: ' + (error ? error.message : '')); return; }

  let copiados = 0, fallidos = 0;
  for (const r of recursos) {
    let resultado;
    const periodoTrabajo = 'Jornada completa';
    if (r.tipo_geometria === 'linea' || r.tipo_geometria === 'area') {
      let geojson;
      try { geojson = JSON.parse(r.geom_geojson); } catch (e) { fallidos++; continue; }
      const puntos = r.tipo_geometria === 'area' ? geojson.coordinates[0] : geojson.coordinates;
      resultado = r.tipo_geometria === 'area'
        ? await supabaseClient.rpc('crear_recurso_area', {
            p_comuna_id: state.activeComunaId, p_institucion_id: r.institucion_id, p_puntos: puntos,
            p_fecha_inicio: null, p_fecha_termino: null, p_descripcion: r.descripcion, p_periodo_trabajo: periodoTrabajo, p_tipo_recurso: r.tipo_recurso,
          })
        : await supabaseClient.rpc('crear_recurso_linea', {
            p_comuna_id: state.activeComunaId, p_institucion_id: r.institucion_id, p_puntos: puntos,
            p_fecha_inicio: null, p_fecha_termino: null, p_descripcion: r.descripcion, p_periodo_trabajo: periodoTrabajo, p_tipo_recurso: r.tipo_recurso,
          });
    } else {
      if (r.lat == null || r.lng == null) { fallidos++; continue; }
      resultado = await supabaseClient.rpc('crear_recurso', {
        p_comuna_id: state.activeComunaId, p_institucion_id: r.institucion_id, p_lat: r.lat, p_lng: r.lng,
        p_fecha_inicio: null, p_fecha_termino: null, p_descripcion: r.descripcion, p_periodo_trabajo: periodoTrabajo, p_tipo_recurso: r.tipo_recurso,
      });
    }
    if (resultado && resultado.error) fallidos++; else copiados++;
  }

  mostrarToast_(copiados + ' recurso(s) copiado(s) al periodo' + (fallidos > 0 ? ' (' + fallidos + ' no se pudieron copiar)' : '') + '. La planificación original sigue intacta.');
  loadRecursos(state.activeComunaId, ++comunaRequestToken);
}

