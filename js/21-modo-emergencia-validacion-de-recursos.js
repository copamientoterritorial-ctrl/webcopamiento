/* ============ MODO EMERGENCIA: VALIDACIÓN DE RECURSOS (11-10-2026, SQL 84) ============
 * Un botón por institución con los recursos del Periodo Crítico activo; cada
 * recurso tiene un check «Va en la emergencia». Pensado para la reunión: el líder
 * revisa institución por institución y marca lo que efectivamente sale. Lo no
 * validado se atenúa en el mapa. Se guarda en la base (quién y cuándo). */
state.vaEmergencia = {};          // { idRecurso: { va, por, en } }
state.vaEmergenciaClave = null;   // periodo + recursos ya consultados
state.vaEmergenciaError = null;
state.peAbiertas = state.peAbiertas || {};
function recursosEmergencia_() {
  const per = periodoActivoActual_();
  return { per, recs: per ? (state.recursos || []).filter(r => r.id_periodo === per.id) : [] };
}
function puedeValidarEmergencia_() {
  return !!state.perfil && ['GRD', 'Administrador', 'Jefe de Área Relacionamiento'].includes(state.perfil.perfil) &&
    puedeEditarModulo_('periodo_critico');
}
async function cargarValidacionEmergencia_(recs, clave) {
  state.vaEmergenciaClave = clave;
  if (!recs.length) return;
  const { data, error } = await supabaseClient.rpc('estado_recursos_emergencia', { p_ids: recs.map(r => String(r.id)) });
  if (error) { state.vaEmergenciaError = error.message; }
  else {
    state.vaEmergenciaError = null;
    (data || []).forEach(x => { state.vaEmergencia[x.id] = { va: !!x.va, por: x.por_nombre, en: x.en }; });
  }
  if (state.modoMapa === 'emergencia') renderPanelEmergencia_();
}
/* ── CMPC por tipo de recurso (21-10-2026) ──
 * Los recursos del periodo se copian de la planificación sin guardar el recurso enlazado; para mostrar la CLAVE RADIAL y el TURNO
 * se reconoce cada uno por su geometría frente a la planificación de la comuna (líneas con recurso asociado, SQL 79/91) y luego
 * se lee v_planificador_recursos (alias = clave radial, en_turno_hoy). Filtro Todos / En turno / Libre (por defecto Todos). */
state.peRef = {};            // id recurso del periodo → { clave, refId, enTurno }
state.peRefClave = null;
state.peTurnoFiltro = state.peTurnoFiltro || 'todos';
function claveGeomEmergencia_(tipoGeom, gjTxt, lat, lng) {
  const r5 = v => Number(v).toFixed(5);
  if (tipoGeom === 'linea' || tipoGeom === 'area') {
    let gj; try { gj = typeof gjTxt === 'string' ? JSON.parse(gjTxt) : gjTxt; } catch (e) { return null; }
    if (!gj || !gj.coordinates) return null;
    const pts = tipoGeom === 'area'
      ? (gj.type === 'MultiPolygon' ? (gj.coordinates[0] || [])[0] : gj.coordinates[0])
      : (gj.type === 'MultiLineString' ? lineaEncadenada_(gj.coordinates) : gj.coordinates);
    if (!pts || !pts.length) return null;
    return tipoGeom + ':' + pts.length + ':' + r5(pts[0][0]) + ',' + r5(pts[0][1]) + ':' + r5(pts[pts.length - 1][0]) + ',' + r5(pts[pts.length - 1][1]);
  }
  return lat == null || lng == null ? null : 'punto:' + r5(lng) + ',' + r5(lat);
}
async function cargarRefRecursosEmergencia_(recs, clave) {
  state.peRefClave = clave;
  try {
    const { data: planes } = await supabaseClient.from('planes_contingencia').select('id').eq('ambito', 'comuna').eq('comuna_id', state.activeComunaId);
    const ids = (planes || []).map(p => p.id);
    if (!ids.length) return;
    const { data: pl } = await supabaseClient.from('planificacion_recursos_geojson')
      .select('recurso_ref_id, recurso_ref_clave, tipo_geometria, geom_geojson, lat, lng').in('plan_id', ids).not('recurso_ref_id', 'is', null);
    const porGeom = {};
    (pl || []).forEach(p => {
      // Rutas de varios tramos: al periodo se copia una línea por cadena continua → se reconoce cualquiera de ellas
      let gj = null; try { gj = typeof p.geom_geojson === 'string' ? JSON.parse(p.geom_geojson) : p.geom_geojson; } catch (e) {}
      if (p.tipo_geometria === 'linea' && gj && gj.type === 'MultiLineString') {
        cadenasLinea_(gj.coordinates).forEach(c => { const k = claveGeomEmergencia_('linea', { type: 'LineString', coordinates: c }); if (k) porGeom[k] = p; });
        return;
      }
      const k = claveGeomEmergencia_(p.tipo_geometria, p.geom_geojson, p.lat, p.lng); if (k) porGeom[k] = p;
    });
    const refIds = [...new Set((pl || []).map(p => p.recurso_ref_id))];
    const info = {};
    for (let i = 0; i < refIds.length; i += 150) {
      const { data: v } = await supabaseClient.from('v_planificador_recursos').select('id, alias, codigo_ref, en_turno_hoy').in('id', refIds.slice(i, i + 150));
      (v || []).forEach(x => { info[x.id] = x; });
    }
    if (state.peRefClave !== clave) return;
    state.peRef = {};
    recs.forEach(r => {
      const p = porGeom[claveGeomEmergencia_(r.tipo_geometria, r.geom_geojson, r.lat, r.lng)];
      if (!p) return;
      const x = info[p.recurso_ref_id] || {};
      state.peRef[String(r.id)] = { refId: p.recurso_ref_id, clave: x.alias || p.recurso_ref_clave || x.codigo_ref || '',
        enTurno: x.en_turno_hoy == null ? null : !!x.en_turno_hoy };
    });
  } catch (e) { /* sin enlace: se muestra la descripción */ }
  if (state.modoMapa === 'emergencia') renderPanelEmergencia_();
}
/** Nombre del comité si la descripción es la de un comité sumado al copamiento («Comité Red de Prevención: <nombre> (N° x)»), o ''. */
function nombreComiteDeDescripcion_(desc) {
  const m = /^Comit[ée] Red de Prevenci[óo]n:\s*(.+?)(?:\s*\(N°\s*[^)]*\))?\s*$/i.exec(String(desc || '').trim());
  return m ? m[1] : '';
}
function htmlCmpcPorTipoEmergencia_(g, vaDe, editable, ICO) {
  const f = state.peTurnoFiltro || 'todos';
  const pasa = r => { if (f === 'todos') return true; const t = (state.peRef[String(r.id)] || {}).enTurno; return f === 'turno' ? t === true : t === false; };
  const porTipo = {};
  g.recs.forEach(r => { (porTipo[r.tipo_recurso || 'Sin tipo'] = porTipo[r.tipo_recurso || 'Sin tipo'] || []).push(r); });
  const nTurno = g.recs.filter(r => (state.peRef[String(r.id)] || {}).enTurno === true).length;
  const nLibre = g.recs.filter(r => (state.peRef[String(r.id)] || {}).enTurno === false).length;
  const filtro = '<div class="pe-turno-sw" title="Filtrar por el turno de hoy (Calendario de Turnos)">' +
    [['todos', 'Todos', g.recs.length], ['turno', '🟢 En turno', nTurno], ['libre', '⚪ Libre', nLibre]]
      .map(([k, tx, n]) => '<button data-pe-turno="' + k + '"' + (f === k ? ' class="on"' : '') + '>' + tx + ' <small>' + n + '</small></button>').join('') + '</div>';
  const tipos = Object.keys(porTipo).sort(compararTipoRecurso_);
  return filtro + tipos.map(t => {
    const lista = porTipo[t].filter(pasa);
    const llave = g.id + '|' + t, abierto = !!(state.peTipoAbierto && state.peTipoAbierto[llave]);
    const nVa = porTipo[t].filter(vaDe).length;
    const color = typeof colorTipoModoCmpc_ === 'function' ? colorTipoModoCmpc_(t) : '#64748B';
    return '<div class="pe-tipo' + (abierto ? ' abierto' : '') + '">' +
      '<button class="pe-tipo-cab" data-pe-tipo="' + escapeHtml_(llave) + '"><i style="background:' + color + '"></i><b>' + escapeHtml_(aTitulo_(t)) + '</b>' +
        '<span class="pe-cont' + (nVa === porTipo[t].length ? ' completo' : '') + '">' + nVa + ' / ' + porTipo[t].length + '</span>' +
        (editable && !recursosEmergencia_().per.seleccion_guardada ? '<span class="pe-tipo-todos" data-pe-tipo-todos="' + (nVa === porTipo[t].length ? '0' : '1') + '" data-ids="' +
          escapeHtml_(porTipo[t].map(r => String(r.id)).join(',')) + '" title="' + (nVa === porTipo[t].length ? 'Desmarcar' : 'Marcar') + ' todo este tipo">' + (nVa === porTipo[t].length ? '✕' : '✓ todos') + '</span>' : '') +
        '<span class="pe-caret">▼</span></button>' +
      '<div class="pe-tipo-lista">' + (lista.length ? lista.map(r => {
        const va = vaDe(r), ref = state.peRef[String(r.id)] || {}, info = state.vaEmergencia[String(r.id)] || {};
        const turno = ref.enTurno === true ? '<span class="pe-turno si">En turno</span>' : ref.enTurno === false ? '<span class="pe-turno no">Libre</span>' : '';
        const det = [ref.clave ? r.descripcion : '', va && info.por ? 'Validó ' + info.por : ''].filter(Boolean).join(' · ');
        return '<label class="pe-rec' + (va ? ' va' : '') + '">' +
          '<input type="checkbox" data-rec="' + escapeHtml_(String(r.id)) + '"' + (va ? ' checked' : '') + (editable ? '' : ' disabled') + '>' +
          '<span class="pe-rec-txt" data-ver="' + escapeHtml_(String(r.id)) + '"><b>' + (ICO[r.tipo_geometria] || '📍') + ' ' +
            (ref.clave ? '<span class="pe-clave">📻 ' + escapeHtml_(ref.clave) + '</span>' : escapeHtml_(r.descripcion || 'Sin clave radial')) + turno + '</b>' +
          (det ? '<small>' + escapeHtml_(det) + '</small>' : '') + '</span></label>';
      }).join('') : '<div class="pe-vacio" style="padding:4px 2px;">Ninguno con ese turno.</div>') + '</div></div>';
  }).join('');
}

function renderPanelEmergencia_() {
  const cuerpo = document.getElementById('pe-cuerpo');
  if (!cuerpo) return;
  const { per, recs } = recursosEmergencia_();
  const sub = document.getElementById('pe-sub'), barra = document.getElementById('pe-barra'), total = document.getElementById('pe-total');
  if (!per) {
    sub.textContent = 'Sin Periodo Crítico activo';
    barra.style.width = '0'; total.textContent = '';
    cuerpo.innerHTML = '<div class="pe-vacio">Esta comuna no tiene un Periodo Crítico activo. Créalo con <b>🔥 Crear Periodo Crítico</b> (puedes copiar los recursos de un escenario).</div>';
    return;
  }
  const clave = per.id + ':' + recs.map(r => r.id).join(',');
  if (state.vaEmergenciaClave !== clave) { cargarValidacionEmergencia_(recs, clave); }
  if (state.peRefClave !== clave) cargarRefRecursosEmergencia_(recs.concat(state.recursosNoActivos || []), clave);
  const vaDe = r => !!(state.vaEmergencia[String(r.id)] && state.vaEmergencia[String(r.id)].va);
  const nVa = recs.filter(vaDe).length;
  // 💾 Selección guardada (SQL 96): recs = solo los activos; los no activados quedan en state.recursosNoActivos
  const guardada = !!per.seleccion_guardada;
  const noActivos = (state.recursosNoActivos || []).filter(r => String(r.id_periodo) === String(per.id));
  sub.textContent = (per.nombre_plan || 'Periodo Crítico activo') + (guardada ? ' · ✅ selección guardada' : '');
  barra.style.width = guardada ? '100%' : ((recs.length ? Math.round(100 * nVa / recs.length) : 0) + '%');
  total.textContent = guardada ? recs.length + ' activo(s) · ' + noActivos.length + ' no activado(s)' : nVa + ' de ' + recs.length + ' van';
  const puede = puedeValidarEmergencia_();
  const barraSel = guardada
    ? '<div class="pe-guardada"><div><b>✅ Selección guardada</b><small>El mapa, los indicadores y los reportes muestran solo lo seleccionado (' + recs.length + ').' +
        (noActivos.length ? ' Hay ' + noActivos.length + ' recurso(s) no activado(s): ábrelos en cada institución con «＋ Ver no activadas».' : '') + '</small></div>' +
        (puede ? '<button data-pe-sel="editar" title="Volver a ver todos los recursos de la plantilla para cambiar la selección">✏️ Modificar</button>' : '') + '</div>'
    : (puede && recs.length ? '<button class="pe-guardar" data-pe-sel="guardar"' + (nVa ? '' : ' disabled') + ' title="' + (nVa ? 'Guardar: desde ahora solo se ve lo seleccionado' : 'Marca primero lo que se dispone') + '">💾 Guardar selección (' + nVa + ' de ' + recs.length + ')</button>' +
        '<div class="pe-ayuda">Marca por institución lo que se dispone y guarda: el resto se oculta en todo el sistema, sin borrarse.</div>' : '');
  if (!recs.length && !noActivos.length) {
    cuerpo.innerHTML = '<div class="pe-vacio">El periodo todavía no tiene recursos. Agrégalos con ✏️ ▸ Editar Periodo Crítico o cópialos de la planificación.</div>' +
      (puede ? '<button class="pe-completar" data-pe-completar="1">⬇️ Copiar desde la planificación</button>' : '');
    cuerpo.querySelectorAll('[data-pe-completar]').forEach(b => b.addEventListener('click', () => ofrecerCopiaPlanificacionPrevia_(state.activeComunaId, true)));
    return;
  }
  // Agrupar por institución (orden de capas del sistema): activos + no activados
  const grupos = {};
  const agregar = (r, inactivo) => {
    const k = String(r.institucion_id || 'sin');
    const inst = r.instituciones || {};
    if (!grupos[k]) grupos[k] = { id: k, nombre: inst.nombre || 'Sin institución', color: inst.color_hex || '#64748B', logo: inst.logo_url || '', recs: [], inactivos: [] };
    grupos[k][inactivo ? 'inactivos' : 'recs'].push(r);
  };
  recs.forEach(r => agregar(r, false));
  noActivos.forEach(r => agregar(r, true));
  const lista = Object.values(grupos).sort(compararInstitucionesCapa_);
  const editable = puedeValidarEmergencia_() && !state.vaEmergenciaError;
  const ICO = { punto: '📍', linea: '📏', area: '📐' };
  cuerpo.innerHTML =
    (state.vaEmergenciaError ? '<div class="pe-vacio" style="color:#B45309;">No se pudo leer la validación: ' + escapeHtml_(state.vaEmergenciaError) + '<br>¿Ya se ejecutó <b>84_validacion_recursos_emergencia.sql</b>?</div>' : '') +
    (!puedeValidarEmergencia_() ? '<div class="pe-vacio" style="padding:8px 6px 0;">👁️ Solo lectura: tu usuario no puede validar recursos.</div>' : '') +
    barraSel +
    (puede ? '<button class="pe-completar" data-pe-completar="1" title="Copia al periodo lo que falte de la planificación Normal / Amarilla / Roja de la comuna (lo que ya está no se duplica)">⬇️ Completar desde la planificación</button>' : '') +
    '<div class="pe-vista"><span>En el mapa:</span><button data-ver-todas="1">👁 Ver todas</button><button data-ver-todas="0">Ocultar todas</button></div>' +
    lista.map(g => {
      const n = g.recs.filter(vaDe).length;
      const oculta = !!state.institucionesOcultas[g.id];
      // Con selección guardada: «activos / total de la plantilla» (ej. CONAF 5 / 9)
      const cont = guardada ? g.recs.length + ' / ' + (g.recs.length + g.inactivos.length) : n + ' / ' + g.recs.length;
      const completo = guardada ? !g.inactivos.length : n === g.recs.length;
      const abiertoNA = !!(state.peNoActivasAbiertas && state.peNoActivasAbiertas[g.id]);
      return '<div class="pe-inst' + (state.peAbiertas[g.id] ? ' abierta' : '') + (oculta ? ' oculta' : '') + '" data-inst="' + escapeHtml_(g.id) + '">' +
        '<div class="pe-inst-fila">' +
        '<button class="pe-ojo" data-ojo="' + escapeHtml_(g.id) + '" title="' + (oculta ? 'Mostrar' : 'Ocultar') + ' esta institución en el mapa">' + (oculta ? '🚫' : '👁') + '</button>' +
        '<button class="pe-inst-btn"><span class="pe-logo" style="border-color:' + g.color + ';">' +
          (g.logo ? '<img src="' + escapeHtml_(g.logo) + '" alt="" onerror="this.remove()">' : '') + '</span>' +
          '<b>' + escapeHtml_(aTitulo_(g.nombre)) + '</b><span class="pe-cont' + (completo ? ' completo' : '') + '" title="' + (guardada ? 'Activos / total de la plantilla' : 'Van / total') + '">' + cont + '</span>' +
          '<span class="pe-caret">▼</span></button></div>' +
        '<div class="pe-lista">' +
          (editable && !guardada ? '<div class="pe-todos"><button data-todos="1">✓ Todos van</button><button data-todos="0">✕ Ninguno</button></div>' : '') +
          (!g.recs.length && guardada ? '<div class="pe-vacio" style="padding:4px 2px;">Ninguno activo en esta institución.</div>' : '') +
          (esInstitucionCmpc_({ nombre: g.nombre }) ? htmlCmpcPorTipoEmergencia_(g, vaDe, editable, ICO) : g.recs.map(r => {
            const va = vaDe(r), info = state.vaEmergencia[String(r.id)] || {};
            // Comités de la Red de Prevención: se muestra el NOMBRE del comité (viene en la descripción) para saber cuál se activa
            const comite = nombreComiteDeDescripcion_(r.descripcion);
            const det = [comite ? (r.tipo_recurso || '') : r.descripcion, va && info.por ? 'Validó ' + info.por : ''].filter(Boolean).join(' · ');
            return '<label class="pe-rec' + (va ? ' va' : '') + '" title="' + (va ? 'Va en la emergencia' : 'Pendiente') + '">' +
              '<input type="checkbox" data-rec="' + escapeHtml_(String(r.id)) + '"' + (va ? ' checked' : '') + (editable ? '' : ' disabled') + '>' +
              '<span class="pe-rec-txt" data-ver="' + escapeHtml_(String(r.id)) + '"><b>' + (comite ? '🖐️ ' + escapeHtml_(comite) : (ICO[r.tipo_geometria] || '📍') + ' ' + escapeHtml_(r.tipo_recurso || 'Recurso')) + '</b>' +
              '<small>' + escapeHtml_(det || 'Sin descripción') + '</small></span></label>';
          }).join('')) +
          // No activados de la plantilla: se pueden volver a activar
          (g.inactivos.length
            ? '<button class="pe-na-btn" data-na="' + escapeHtml_(g.id) + '">' + (abiertoNA ? '− Ocultar' : '＋ Ver') + ' ' + g.inactivos.length + ' no activada(s)</button>' +
              (abiertoNA ? '<div class="pe-na-lista">' + g.inactivos.map(r =>
                '<label class="pe-rec pe-rec-na" title="No activado: márcalo para volver a activarlo">' +
                  '<input type="checkbox" data-reactivar="' + escapeHtml_(String(r.id)) + '"' + (editable ? '' : ' disabled') + '>' +
                  '<span class="pe-rec-txt"><b>' + (nombreComiteDeDescripcion_(r.descripcion) ? '🖐️ ' + escapeHtml_(nombreComiteDeDescripcion_(r.descripcion)) : (ICO[r.tipo_geometria] || '📍') + ' ' + escapeHtml_(r.tipo_recurso || 'Recurso')) + '</b>' +
                  '<small>' + escapeHtml_(r.descripcion || 'Sin descripción') + '</small></span></label>').join('') +
                (editable && g.inactivos.length > 1 ? '<button class="pe-na-todas" data-reactivar-todas="' + escapeHtml_(g.id) + '">✓ Activar las ' + g.inactivos.length + '</button>' : '') + '</div>' : '')
            : '') +
        '</div></div>';
    }).join('');

  // ⬇️ Completar el periodo con lo que falte de la planificación (no duplica: compara geometrías)
  cuerpo.querySelectorAll('[data-pe-completar]').forEach(b => b.addEventListener('click', () => ofrecerCopiaPlanificacionPrevia_(state.activeComunaId, true)));
  // 💾 Guardar / ✏️ Modificar la selección
  cuerpo.querySelectorAll('[data-pe-sel]').forEach(b => b.addEventListener('click', () => guardarSeleccionPeriodo_(b.dataset.peSel === 'guardar')));
  // No activadas: abrir / reactivar
  cuerpo.querySelectorAll('[data-na]').forEach(b => b.addEventListener('click', () => {
    state.peNoActivasAbiertas = state.peNoActivasAbiertas || {};
    state.peNoActivasAbiertas[b.dataset.na] = !state.peNoActivasAbiertas[b.dataset.na];
    renderPanelEmergencia_();
  }));
  cuerpo.querySelectorAll('input[data-reactivar]').forEach(chk => chk.addEventListener('change', () => { if (chk.checked) reactivarRecursosPeriodo_([chk.dataset.reactivar]); }));
  cuerpo.querySelectorAll('[data-reactivar-todas]').forEach(b => b.addEventListener('click', () => {
    const g = grupos[b.dataset.reactivarTodas]; if (g) reactivarRecursosPeriodo_(g.inactivos.map(r => String(r.id)));
  }));
  cuerpo.querySelectorAll('[data-ver-todas]').forEach(b => b.addEventListener('click', () => verTodasInstitucionesEmergencia_(b.dataset.verTodas === '1')));
  cuerpo.querySelectorAll('[data-ojo]').forEach(b => b.addEventListener('click', (ev) => { ev.stopPropagation(); alternarInstitucionEmergencia_(b.dataset.ojo); }));
  cuerpo.querySelectorAll('.pe-inst').forEach(bloque => {
    const id = bloque.dataset.inst;
    bloque.querySelector('.pe-inst-btn').addEventListener('click', () => {
      state.peAbiertas[id] = !state.peAbiertas[id];
      bloque.classList.toggle('abierta', !!state.peAbiertas[id]);
    });
    bloque.querySelectorAll('[data-todos]').forEach(b => b.addEventListener('click', () => {
      const ids = (grupos[id] ? grupos[id].recs : []).map(r => String(r.id));
      marcarRecursosEmergencia_(ids, b.dataset.todos === '1');
    }));
  });
  // Al ACTIVAR un recurso (check «Va») el mapa se acerca a él para ver su detalle.
  cuerpo.querySelectorAll('input[data-rec]').forEach(chk => chk.addEventListener('change', () => {
    const id = chk.dataset.rec, activar = chk.checked;
    marcarRecursosEmergencia_([id], activar);
    if (activar) ubicarRecursoEmergencia_(id);
  }));
  // CMPC por tipo de recurso: abrir / cerrar cada tipo, marcar todo el tipo y filtro de turno
  cuerpo.querySelectorAll('[data-pe-tipo]').forEach(b => b.addEventListener('click', () => {
    state.peTipoAbierto = state.peTipoAbierto || {};
    state.peTipoAbierto[b.dataset.peTipo] = !state.peTipoAbierto[b.dataset.peTipo];
    b.parentElement.classList.toggle('abierto', !!state.peTipoAbierto[b.dataset.peTipo]);
  }));
  cuerpo.querySelectorAll('[data-pe-tipo-todos]').forEach(b => b.addEventListener('click', (ev) => {
    ev.stopPropagation();
    marcarRecursosEmergencia_(String(b.dataset.ids || '').split(',').filter(Boolean), b.dataset.peTipoTodos === '1');
  }));
  cuerpo.querySelectorAll('[data-pe-turno]').forEach(b => b.addEventListener('click', () => {
    state.peTurnoFiltro = b.dataset.peTurno; renderPanelEmergencia_();
  }));
  // Clic en el nombre: ubica el recurso en el mapa
  cuerpo.querySelectorAll('[data-ver]').forEach(t => t.addEventListener('click', (ev) => {
    ev.preventDefault();
    ubicarRecursoEmergencia_(t.dataset.ver);
  }));
  aplicarEstiloEmergencia_();
}
/** 💾 Guarda (o abre para modificar) la selección del Periodo Crítico activo (SQL 96).
 *  Guardada: en todo el sistema se ve solo lo que «Va»; lo demás queda como «no activado». */
async function guardarSeleccionPeriodo_(guardar) {
  const { per, recs } = recursosEmergencia_(); if (!per) return;
  if (guardar) {
    const nVa = recs.filter(r => state.vaEmergencia[String(r.id)] && state.vaEmergencia[String(r.id)].va).length;
    if (!nVa) { mostrarToast_('Marca primero lo que se dispone.'); return; }
    if (!confirm('💾 Guardar la selección del periodo:\n\n' + nVa + ' de ' + recs.length + ' recurso(s) activo(s).\n\nDesde ahora el mapa, los indicadores y los reportes muestran solo lo seleccionado. ' +
      'Los ' + (recs.length - nVa) + ' no activados no se borran: puedes volver a activarlos con «＋ Ver no activadas».')) return;
  }
  const { error } = await supabaseClient.rpc('guardar_seleccion_periodo', { p_periodo_id: String(per.id), p_guardada: !!guardar });
  if (error) {
    mostrarToast_(/guardar_seleccion_periodo/.test(error.message) ? 'Falta ejecutar en Supabase el SQL 96 (96_seleccion_periodo_critico.sql).' : 'No se pudo guardar: ' + error.message);
    return;
  }
  per.seleccion_guardada = !!guardar;
  state.vaEmergenciaClave = null;
  await loadRecursos(state.activeComunaId, ++comunaRequestToken, null, true);
  renderPanelEmergencia_();
  mostrarToast_(guardar ? '💾 Selección guardada: se muestra solo lo seleccionado.' : '✏️ Modifica la selección: se ven todos los recursos de la plantilla. Vuelve a guardar al terminar.');
}
/** Vuelve a activar recursos no activados del periodo (quedan «Va» y aparecen en todo el sistema). */
async function reactivarRecursosPeriodo_(ids) {
  if (!ids.length || !puedeValidarEmergencia_()) return;
  const { error } = await supabaseClient.rpc('marcar_recursos_emergencia', { p_ids: ids, p_va: true });
  if (error) { mostrarToast_('No se pudo activar: ' + error.message); renderPanelEmergencia_(); return; }
  ids.forEach(id => { state.vaEmergencia[id] = { va: true, por: state.perfil.nombre_completo, en: new Date().toISOString() }; });
  await loadRecursos(state.activeComunaId, ++comunaRequestToken, null, true);
  renderPanelEmergencia_();
  mostrarToast_('✅ ' + ids.length + ' recurso(s) activado(s) nuevamente.');
}
/** Acerca el mapa al recurso y lo destaca unos segundos con un anillo pulsante. */
function ubicarRecursoEmergencia_(id) {
  const capa = recursosMarkersById[id];
  if (!capa) return;
  let centro = null;
  try {
    if (capa.getLatLng) { centro = capa.getLatLng(); map.flyTo(centro, Math.max(map.getZoom(), 16), { duration: 0.8 }); }
    else if (capa.getBounds) { const b = capa.getBounds(); centro = b.getCenter(); map.flyToBounds(b, { padding: [80, 80], maxZoom: 16, duration: 0.8 }); }
  } catch (e) { return; }
  if (!centro) return;
  // Anillo de resalte (no interactivo) que se retira solo
  if (window.__resalteEmergencia) { try { map.removeLayer(window.__resalteEmergencia); } catch (e) {} }
  const anillo = L.circleMarker(centro, { radius: 26, color: '#16A34A', weight: 4, fillColor: '#16A34A', fillOpacity: 0.12, interactive: false, className: 'resalte-emergencia' }).addTo(map);
  window.__resalteEmergencia = anillo;
  setTimeout(() => { if (window.__resalteEmergencia === anillo) { try { map.removeLayer(anillo); } catch (e) {} window.__resalteEmergencia = null; } }, 3500);
}
async function marcarRecursosEmergencia_(ids, va) {
  if (!ids.length || !puedeValidarEmergencia_()) return;
  const antes = {};
  ids.forEach(id => { antes[id] = state.vaEmergencia[id]; state.vaEmergencia[id] = { va, por: state.perfil.nombre_completo, en: new Date().toISOString() }; });
  renderPanelEmergencia_();   // respuesta inmediata en pantalla
  const { error } = await supabaseClient.rpc('marcar_recursos_emergencia', { p_ids: ids, p_va: va });
  if (error) {
    ids.forEach(id => { if (antes[id]) state.vaEmergencia[id] = antes[id]; else delete state.vaEmergencia[id]; });
    renderPanelEmergencia_();
    mostrarToast_('No se pudo guardar la validación: ' + error.message);
    return;
  }
  // Con la selección guardada, desmarcar un recurso lo pasa a «no activado» (sale del mapa y los reportes)
  const per = periodoActivoActual_();
  if (per && per.seleccion_guardada && !va) {
    await loadRecursos(state.activeComunaId, ++comunaRequestToken, null, true);
    renderPanelEmergencia_();
  }
}
/** Modo Emergencia: los recursos no validados se atenúan y SOLO los activados («Va»)
 *  llevan el efecto neón (brillo pulsante y resalte al pasar el mouse). */
function aplicarEstiloEmergencia_() {
  if (state.modoMapa !== 'emergencia') return;
  const { recs } = recursosEmergencia_();
  recs.forEach(r => {
    const capa = recursosMarkersById[r.id];
    if (!capa) return;
    const va = !!(state.vaEmergencia[String(r.id)] && state.vaEmergencia[String(r.id)].va);
    capa._sinNeon = !va;
    const el = capa.getElement && capa.getElement();
    if (capa.setOpacity) {
      capa.setOpacity(va ? 1 : 0.4);
      const pin = el && el.querySelector('.custom-pin');
      if (pin) pin.classList.toggle('recurso-activo-glow', va);
      if (el && !va) el.classList.remove('neon-hover');
      return;
    }
    if (capa.setStyle) {
      if (!capa._estiloOrigEmerg) capa._estiloOrigEmerg = { opacity: capa.options.opacity != null ? capa.options.opacity : 1, fillOpacity: capa.options.fillOpacity != null ? capa.options.fillOpacity : 0.2 };
      capa.setStyle(va ? capa._estiloOrigEmerg : { opacity: 0.35, fillOpacity: 0.05 });
      if (el) {
        el.classList.toggle('recurso-activo-glow', va);
        if (!va) el.classList.remove('neon-hover', 'periodo-hover-resalte');
      }
    }
  });
}

/* Ver / ocultar instituciones en el mapa del Modo Emergencia: usa el mismo estado
 * que la simbología del periodo (state.institucionesOcultas). Al dejar UNA sola
 * visible, el mapa encuadra su despliegue; con todas, el panorama completo. */
function alternarInstitucionEmergencia_(instId) {
  state.institucionesOcultas[instId] = !state.institucionesOcultas[instId];
  aplicarVisibilidadInstituciones_();
  aplicarEstiloEmergencia_();
  renderPanelEmergencia_();
  const { recs } = recursosEmergencia_();
  const visibles = [...new Set(recs.map(r => String(r.institucion_id)))].filter(id => !state.institucionesOcultas[id]);
  if (visibles.length === 1) encuadrarRecursosEmergencia_(recs.filter(r => String(r.institucion_id) === visibles[0]));
}
function verTodasInstitucionesEmergencia_(ver) {
  const { recs } = recursosEmergencia_();
  [...new Set(recs.map(r => String(r.institucion_id)))].forEach(id => { state.institucionesOcultas[id] = !ver; });
  aplicarVisibilidadInstituciones_();
  aplicarEstiloEmergencia_();
  renderPanelEmergencia_();
  if (ver) encuadrarRecursosEmergencia_(recs);
}
function encuadrarRecursosEmergencia_(recs) {
  let b = null;
  recs.forEach(r => {
    const capa = recursosMarkersById[r.id];
    if (!capa) return;
    try {
      const bb = capa.getLatLng ? L.latLngBounds([capa.getLatLng(), capa.getLatLng()]) : capa.getBounds();
      b = b ? b.extend(bb) : L.latLngBounds(bb.getSouthWest(), bb.getNorthEast());
    } catch (e) {}
  });
  if (b && b.isValid()) map.flyToBounds(b, { padding: [70, 70], maxZoom: 15, duration: 0.8 });
}

// Muestra/oculta las figuras del periodo activo según state.institucionesOcultas
function aplicarVisibilidadInstituciones_() {
  const registro = window.figurasPorInstitucion || {};
  Object.keys(registro).forEach(instId => {
    const oculta = !!state.institucionesOcultas[instId];
    registro[instId].forEach(capa => {
      const el = capa.getElement && capa.getElement();
      if (el) el.style.display = oculta ? 'none' : '';
      // Para tooltips permanentes
      const tt = capa.getTooltip && capa.getTooltip();
      if (tt) { const tel = tt.getElement && tt.getElement(); if (tel) tel.style.display = oculta ? 'none' : ''; }
    });
  });
}

async function reubicarRecurso_(idRecurso, marker) {
  const nuevaPos = marker.getLatLng();
  const { error } = await supabaseClient.rpc('actualizar_ubicacion_recurso', {
    p_id: idRecurso, p_lat: nuevaPos.lat, p_lng: nuevaPos.lng,
  });
  if (error) {
    mostrarToast_(error.message.includes('dentro del límite')
      ? '⚠️ Esa posición queda fuera del límite de la comuna. Se revirtió el movimiento.'
      : 'No se pudo reubicar: ' + error.message);
    loadRecursos(state.activeComunaId, ++comunaRequestToken); // revierte visualmente al recargar la posición real
    return;
  }
  const r = state.recursos.find(x => x.id === idRecurso);
  if (r) { r.lat = nuevaPos.lat; r.lng = nuevaPos.lng; }
  mostrarToast_('Ubicación actualizada.');
}

async function eliminarRecurso_(idRecurso) {
  const r = state.recursos.find(x => x.id === idRecurso);
  if (r && periodoCerrado_(r.id_periodo)) { mostrarToast_('Este recurso pertenece a un periodo cerrado y no se puede eliminar.'); return; }
  if (!confirm('¿Eliminar este recurso de copamiento? Esta acción no se puede deshacer.')) return;
  const { error } = await supabaseClient.from('copamiento_recursos').delete().eq('id', idRecurso);
  if (error) { mostrarToast_('No se pudo eliminar: ' + error.message); return; }
  map.closePopup();
  mostrarToast_('Recurso eliminado.');
  loadRecursos(state.activeComunaId, ++comunaRequestToken);
}

function parseFechaLocal_(valor) {
  if (!valor) return null;
  if (typeof valor === 'string' && /^\d{4}-\d{2}-\d{2}/.test(valor)) {
    const p = valor.split('-').map(Number);
    return new Date(p[0], p[1] - 1, p[2]);
  }
  const d = new Date(valor);
  return isNaN(d.getTime()) ? null : d;
}

function diasHastaVencimiento_(fechaTermino) {
  if (!fechaTermino) return null;
  const fin = parseFechaLocal_(fechaTermino);
  if (!fin) return null;
  const hoy = new Date(); hoy.setHours(0,0,0,0); fin.setHours(0,0,0,0);
  return Math.round((fin - hoy) / 86400000);
}

function periodoActivoActual_() {
  return state.periodos.find(p => p.estado_periodo === 'activo') || null;
}

function periodoCerrado_(idPeriodo) {
  if (!idPeriodo) return false;
  const p = state.periodos.find(x => x.id === idPeriodo);
  return !!p && p.estado_periodo === 'cerrado';
}

function iconoTipoGeometria_(tipo) {
  if (tipo === 'linea') return '📏 Línea';
  if (tipo === 'area') return '📐 Área';
  return '📍 Punto';
}

// Bloque "quién creó / quién modificó" para popups (control de acciones por usuario)
function bloqueTrazabilidad_(t) {
  if (!t) return '';
  const fmt = (f) => { if (!f) return ''; const d = new Date(f); return d.toLocaleDateString('es-CL') + ' ' + d.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }); };
  let html = '<div class="popup-traza">';
  if (t.creado_por_nombre || t.creado_en) {
    html += '<div>👤 <b>Creado por:</b> ' + escapeHtml_(t.creado_por_nombre || 'Usuario eliminado') + (t.creado_por_perfil ? ' <span class="traza-perfil">' + escapeHtml_(t.creado_por_perfil) + '</span>' : '') + (t.creado_en ? ' · ' + fmt(t.creado_en) : '') + '</div>';
  }
  if (t.modificado_por_nombre || t.modificado_en) {
    html += '<div>✏️ <b>Modificado por:</b> ' + escapeHtml_(t.modificado_por_nombre || 'Sistema') + (t.modificado_en ? ' · ' + fmt(t.modificado_en) : '') + '</div>';
  }
  html += '</div>';
  return html;
}

function construirPopupRecurso_(r, inst, latRepresentativo, lngRepresentativo) {
  const dias = diasHastaVencimiento_(r.fecha_termino);
  let etiqueta = '';
  if (dias !== null) {
    etiqueta = dias <= 3
      ? '<span class="expiry-tag expiry-soon">Vence en ' + dias + ' día(s)</span>'
      : '<span class="expiry-tag expiry-ok">Vigente</span>';
  }
  const cerrado = periodoCerrado_(r.id_periodo);
  const esPunto = !r.tipo_geometria || r.tipo_geometria === 'punto';
  const puedeEditar = (['GRD','Administrador','Jefe de Área Relacionamiento'].includes(state.perfil.perfil)) && !cerrado;
  const lat = latRepresentativo !== undefined ? latRepresentativo : r.lat;
  const lng = lngRepresentativo !== undefined ? lngRepresentativo : r.lng;
  const logoPopup = logoEfectivoInstitucion_(inst);
  return (
    '<div class="popup-title" style="display:flex;align-items:center;gap:8px;">' +
    (logoPopup ? '<img src="' + escapeHtml_(logoPopup) + '" alt="" style="width:26px;height:26px;border-radius:50%;object-fit:contain;background:#fff;border:2px solid ' + inst.color_hex + ';flex-shrink:0;" onerror="this.style.display=\'none\'">' : '') +
    '<span>' + inst.nombre + '</span></div>' +
    '<div class="popup-row">' + iconoTipoGeometria_(r.tipo_geometria) + ' · ' + (r.tipo_recurso || 'Personal') + '</div>' +
    '<div class="popup-row">📅 ' + (r.fecha_inicio || '—') + ' → ' + (r.fecha_termino || 'indefinido') + '</div>' +
    '<div class="popup-row">🕒 ' + (r.periodo_trabajo || '') + '</div>' +
    '<div class="popup-row" style="margin-top:6px;color:#0F172A;">' + escapeHtml_(r.descripcion || 'Sin descripción') + '</div>' +
    etiqueta +
    bloqueTrazabilidad_(state.trazaRecursos && state.trazaRecursos[r.id]) +
    (cerrado ? '<div class="popup-row" style="margin-top:6px;font-size:10.5px;color:var(--text-tertiary);">🔒 Periodo cerrado: este recurso no se puede editar' + (esPunto ? ' ni mover' : '') + '.</div>' : '') +
    (puedeEditar && esPunto ? '<div class="popup-row" style="margin-top:6px;font-size:10.5px;color:var(--text-tertiary);">💡 Arrastra el pin en el mapa para reubicarlo</div>' : '') +
    '<div class="popup-actions">' +
    (puedeEditar ? '<button class="popup-btn" data-action="editar" data-id="' + r.id + '">Editar</button>' : '') +
    (puedeEditar && !esPunto && !cerrado ? '<button class="popup-btn" data-action="editar-forma" data-id="' + r.id + '">✏️ Editar forma</button>' : '') +
    (puedeEditar ? '<button class="popup-btn" data-action="eliminar" data-id="' + r.id + '" style="color:#DC2626;">Eliminar</button>' : '') +
    '<button class="popup-btn" data-action="windy" data-lat="' + lat + '" data-lng="' + lng + '">Ver en Windy</button>' +
    '</div>'
  );
}

/* ============ MODO EDICIÓN + CREAR/EDITAR RECURSOS (punto, línea o área) ============ */
let tempDibujoLayer = null;
let tempDibujoVertices = [];
let tempVerticeMarkers = L.layerGroup();
const VERTICES_SIN_RECORTE = 150;      // hasta aquí se dibujan todos los vértices; sobre esto, solo los de la pantalla
const MAX_INTERMEDIOS_VISIBLES = 350;  // con más vértices visibles se omiten los puntos intermedios (insertar = acercar zoom)

// Redibuja los marcadores arrastrables de cada vértice durante el dibujo.
// Arrastrar = mover el vértice; clic derecho = eliminarlo.
function redibujarVerticesEdicion_() {
  // Ruta unida en edición: todos los tramos a la vez, con empalmes compartidos.
  if (state.editandoForma && state.editandoForma.partes) { redibujarVerticesMulti_(); return; }
  tempVerticeMarkers.clearLayers();
  if (!map.hasLayer(tempVerticeMarkers)) tempVerticeMarkers.addTo(map);
  const esArea = state.dibujoModo === 'area';
  const n = tempDibujoVertices.length;
  // RENDIMIENTO (20-10-2026): en rutas largas solo se crean los marcadores que caen en pantalla (con margen); al mover el
  // mapa se vuelven a dibujar (moveend). Con muchos vértices visibles se omiten los puntos intermedios (zoom para verlos).
  const recortar = n > VERTICES_SIN_RECORTE;
  const vista = recortar ? map.getBounds().pad(0.25) : null;
  const enVista = ll => !vista || vista.contains(ll);
  const visibles = recortar ? tempDibujoVertices.filter(enVista).length : n;
  const conIntermedios = visibles <= MAX_INTERMEDIOS_VISIBLES;
  if (recortar && !conIntermedios && !state._avisoIntermedios) { state._avisoIntermedios = true; mostrarToast_('🔍 Ruta con muchos vértices: acerca el zoom para ver los puntos intermedios (para insertar vértices).'); }

  // 1) Puntos intermedios (fantasma) en el medio de cada segmento: al arrastrarlos
  //    se convierten en un vértice NUEVO insertado en esa posición.
  //    En áreas también hay segmento de cierre (último -> primero).
  const nSegmentos = conIntermedios ? (esArea ? n : Math.max(0, n - 1)) : 0;
  for (let i = 0; i < nSegmentos; i++) {
    const a = tempDibujoVertices[i];
    const b = tempDibujoVertices[(i + 1) % n];
    if (!a || !b) continue;
    if (recortar && !enVista(a) && !enVista(b)) continue;
    const medio = L.latLng((a.lat + b.lat) / 2, (a.lng + b.lng) / 2);
    const mid = L.marker(medio, {
      draggable: true,
      icon: L.divIcon({ className: '', iconSize: [10, 10], iconAnchor: [5, 5],
        html: '<div title="Arrastra para agregar un vértice" style="width:10px;height:10px;border-radius:50%;background:rgba(37,99,235,0.35);border:1.5px solid #2563EB;cursor:copy;"></div>' }),
    });
    const insertarEn = i + 1; // se inserta entre a y b
    let insertado = false;
    mid.on('dragstart', () => {
      // Al empezar a arrastrar, insertamos el nuevo vértice en el array
      guardarPasoDibujo_();
      tempDibujoVertices.splice(insertarEn, 0, medio);
      insertado = true;
    });
    mid.on('drag', (ev) => {
      if (!insertado) return;
      tempDibujoVertices[insertarEn] = ev.target.getLatLng();
      if (tempDibujoLayer) tempDibujoLayer.setLatLngs(tempDibujoVertices); actualizarReglaMedicion_();
    });
    mid.on('dragend', () => {
      redibujarVerticesEdicion_(); // reconstruye vértices + nuevos intermedios
      actualizarBotonesModoDibujo_();
    });
    tempVerticeMarkers.addLayer(mid);
  }

  // 2) Vértices reales: arrastrar mueve, clic derecho borra
  tempDibujoVertices.forEach((ll, idx) => {
    if (recortar && !enVista(ll)) return;   // fuera de pantalla: se dibuja al llegar ahí
    const m = L.marker(ll, {
      draggable: true,
      icon: L.divIcon({ className: '', iconSize: [14, 14], iconAnchor: [7, 7],
        html: '<div style="width:10px;height:10px;border-radius:50%;background:#fff;border:2.5px solid #2563EB;box-shadow:0 1px 3px rgba(0,0,0,0.4);cursor:move;"></div>' }),
    });
    m.on('dragstart', () => guardarPasoDibujo_());
    m.on('drag', (ev) => {
      tempDibujoVertices[idx] = ev.target.getLatLng();
      if (tempDibujoLayer) tempDibujoLayer.setLatLngs(tempDibujoVertices); actualizarReglaMedicion_();
    });
    m.on('dragend', () => { redibujarVerticesEdicion_(); actualizarBotonesModoDibujo_(); });
    m.on('contextmenu', () => {
      const minimo = esArea ? 3 : 2;
      if (tempDibujoVertices.length <= minimo) { mostrarToast_('No puedes eliminar más vértices (mínimo ' + minimo + ').'); return; }
      guardarPasoDibujo_();
      tempDibujoVertices.splice(idx, 1);
      if (tempDibujoLayer) tempDibujoLayer.setLatLngs(tempDibujoVertices); actualizarReglaMedicion_();
      redibujarVerticesEdicion_();
      actualizarBotonesModoDibujo_();
    });
    tempVerticeMarkers.addLayer(m);
  });
}
const MIN_VERTICES = { linea: 2, area: 3 };

/* ↶ DESHACER al dibujar o editar la forma (20-10-2026). Antes de cada cambio de tempDibujoVertices (clic, tramo de trazo
 * libre, mover / insertar / borrar vértice) se guarda una copia. Deshace: el botón «Atrás» del navegador (o el botón
 * lateral del mouse), Ctrl+Z / Retroceso (fuera de un campo de texto) y el botón ↶ Deshacer de la barra.
 * Para que «Atrás» no salga del sistema, cada paso agrega una entrada al historial (pushState); al terminar o cancelar
 * el dibujo esas entradas se retiran. Rutas unidas (varios tramos) no se deshacen. */
let pasosDibujo_ = [];        // copias de tempDibujoVertices
let pasosHistorial_ = 0;      // entradas propias en el historial del navegador aún sin consumir
let ignorarPops_ = 0;         // popstate provocados por nosotros (history.back / go)
function enDibujoActivo_() {
  return !!(state.editorMode || state.modoPlanificacion) &&
    ((state.dibujoModo === 'linea' || state.dibujoModo === 'area') || !!state.editandoForma);
}
function guardarPasoDibujo_() {
  if (state.editandoForma && state.editandoForma.partes) return;
  if (!tempDibujoVertices.length && !state.editandoForma) pasosDibujo_ = [];   // empieza un dibujo nuevo
  pasosDibujo_.push(tempDibujoVertices.map(v => L.latLng(v.lat, v.lng)));
  if (pasosDibujo_.length > 200) pasosDibujo_.shift();
  // (si aún se está retirando el historial de un dibujo anterior, no se agrega entrada: evita desordenarlo)
  if (!ignorarPops_) { try { history.pushState({ sigDibujo: pasosDibujo_.length }, ''); pasosHistorial_++; } catch (e) {} }
  actualizarBotonDeshacer_();
}
function reiniciarPasosDibujo_() {
  pasosDibujo_ = [];
  if (pasosHistorial_ > 0) { const n = pasosHistorial_; pasosHistorial_ = 0; ignorarPops_++; try { history.go(-n); } catch (e) { ignorarPops_--; } }
  actualizarBotonDeshacer_();
}
/** desdeHistorial = true cuando lo provocó el botón «Atrás» (el popstate ya descontó su entrada). */
function deshacerDibujo_(desdeHistorial) {
  if (trazoLibreActivo) { descartarTramoLibre_(); return true; }
  if (!enDibujoActivo_() || !pasosDibujo_.length) return false;
  const previo = pasosDibujo_.pop();
  // Teclado / botón no tocan el historial (varios history.back() seguidos se fusionan y lo desordenan): las entradas
  // que sobren las retira reiniciarPasosDibujo_ de una vez al terminar o cancelar.
  tempDibujoVertices = previo;
  ultimoSnapIman_ = null;
  if (tempDibujoLayer) {
    if (tempDibujoVertices.length || state.editandoForma) tempDibujoLayer.setLatLngs(tempDibujoVertices);
    else { map.removeLayer(tempDibujoLayer); tempDibujoLayer = null; }
  }
  redibujarVerticesEdicion_();
  actualizarBotonesModoDibujo_();
  actualizarBotonDeshacer_();
  mostrarToast_('↶ Deshecho · ' + tempDibujoVertices.length + ' vértice(s)');
  return true;
}
function actualizarBotonDeshacer_() {
  const b = document.getElementById('btn-deshacer-dibujo');
  if (b) b.style.display = (enDibujoActivo_() && pasosDibujo_.length && !state.editandoForma) ? 'inline-block' : 'none';
  const b2 = document.getElementById('btn-deshacer-forma');
  if (b2) b2.style.display = (state.editandoForma && !state.editandoForma.partes && pasosDibujo_.length) ? '' : 'none';
}
window.addEventListener('popstate', () => {
  if (ignorarPops_ > 0) { ignorarPops_--; return; }
  if (pasosHistorial_ > 0) pasosHistorial_--;          // se consumió una entrada propia
  if (enDibujoActivo_() && pasosDibujo_.length) deshacerDibujo_(true);
});
document.addEventListener('keydown', (ev) => {
  const enCampo = ev.target && (/^(INPUT|TEXTAREA|SELECT)$/.test(ev.target.tagName) || ev.target.isContentEditable);
  if (enCampo || !enDibujoActivo_()) return;
  if ((ev.key === 'z' || ev.key === 'Z') && (ev.ctrlKey || ev.metaKey) && !ev.shiftKey) { if (deshacerDibujo_(false)) ev.preventDefault(); }
  else if (ev.key === 'Backspace') { if (deshacerDibujo_(false)) ev.preventDefault(); }
});

function actualizarBotonModoActivo_() {
  const btnCopamiento = document.getElementById('btn-editor-toggle') || document.createElement('button');
  const btnAlerta = document.getElementById('btn-alerta-rapida') || document.createElement('button');
  const btnRecursosArea = document.getElementById('btn-recursos-area-rapido') || document.createElement('button');
  [btnCopamiento, btnAlerta, btnRecursosArea].forEach(b => {
    if (!b) return;
    b.classList.remove('modo-activo');
    b.style.removeProperty('--glow-color');
  });

  if (state.modoPlanificacion) {
    const color = state.modoPlanificacion.escenario === 'Verde' ? 'rgba(22,163,74,0.45)' : state.modoPlanificacion.escenario === 'Amarilla' ? 'rgba(245,158,11,0.55)' : 'rgba(239,68,68,0.55)';
    btnAlerta.classList.add('modo-activo');
    btnAlerta.style.setProperty('--glow-color', color);
  } else if (state.modoRecursosArea) {
    btnRecursosArea.classList.add('modo-activo');
    btnRecursosArea.style.setProperty('--glow-color', 'rgba(15,23,42,0.6)');
  } else if (state.editorMode) {
    btnCopamiento.classList.add('modo-activo');
    btnCopamiento.style.setProperty('--glow-color', 'rgba(37,99,235,0.5)');
  }
}

function toggleEditorMode() {
  if (state.modoPlanificacion) { salirModoPlanificacion_(); return; }
  if (state.modoRecursosArea) { salirModoRecursosArea_(); return; }
  // Punto 5: bloquear modo edición de copamiento si no hay periodo activo.
  if (!state.editorMode) {
    const hayPeriodoActivo = state.periodos.some(p => p.estado_periodo === 'activo');
    if (!hayPeriodoActivo) {
      mostrarToast_('⚠️ No hay un Periodo Crítico activo. Crea uno primero en la pestaña Copamiento antes de agregar recursos.');
      return;
    }
  }
  state.editorMode = !state.editorMode;
  try { const _bet=document.getElementById('btn-editor-toggle'); if(_bet) _bet.classList.toggle('active', state.editorMode); } catch(e) {}
  document.getElementById('editor-banner').classList.toggle('show', state.editorMode);
  document.getElementById('map').classList.toggle('editing-mode', state.editorMode);
  // Indicador en la barra superior: chip rojo pulsante con botón salir
  const indEdit = document.getElementById('indicador-edicion');
  if (indEdit) indEdit.classList.toggle('show', state.editorMode);
  // Switcher: ocultar en modo edición
  if (state.editorMode) ocultarSwitcherEscenarios_();
  else if (state.vistaActual === 'mapa') mostrarSwitcherEscenarios_();
  if (!state.editorMode) cancelarDibujo_();
  // Punto: en modo edición, priorizar (traer al frente) las capas editables
  if (state.editorMode) {
    // Asegurar que el periodo activo esté visible al editar (para ver los recursos existentes)
    const perAct = periodoActivoActual_();
    if (perAct && periodoLayers[perAct.id] && !map.hasLayer(periodoLayers[perAct.id])) {
      periodoLayers[perAct.id].addTo(map);
      state.periodoLayersOn[perAct.id] = true;
      if (document.querySelector('.rail-btn.active') && document.querySelector('.rail-btn.active').dataset.tab === 'copamiento') renderTab('copamiento');
    }
    priorizarCapasEditables_('copamiento');
    activarDraggableEdicion_(true);
    desactivarInteractivaLimite_(true);
  } else {
    activarDraggableEdicion_(false);
    desactivarInteractivaLimite_(false);
  }
  actualizarBotonesModoDibujo_();
  actualizarBotonModoActivo_();
}

// Trae al frente las capas que se pueden editar en el modo indicado, para que
// no queden tapadas por otras capas (rutas, límites, áreas, etc.).
function activarDraggableEdicion_(activar) {
  const aplicar = (m) => {
    try {
      if (!m || !m._puedeArrastrar || typeof m.getLatLng !== 'function') return;
      // options.draggable: para markers que se añadan al mapa después
      m.options.draggable = !!activar;
      // dragging existe solo si el marker está en el mapa
      if (m.dragging) { if (activar) m.dragging.enable(); else m.dragging.disable(); }
      const el = m.getElement && m.getElement();
      if (el) { el.style.cursor = activar ? 'grab' : ''; el.title = activar ? 'Arrastra para reubicar' : ''; }
    } catch(e) {}
  };
  Object.values(recursosMarkersById || {}).forEach(aplicar);
  Object.values(window.planRecursosMarkersById || {}).forEach(aplicar);
}

function desactivarInteractivaLimite_(desactivar) {
  // Solo bloquear capas de REFERENCIA, no las editables
  const capasReferencia = [limiteLayer, areasPobladasLayer, comiteAreasLayer];
  capasReferencia.forEach(layer => {
    if (!layer) return;
    try {
      layer.eachLayer(l => {
        const el = l.getElement ? l.getElement() : null;
        if (el) { el.style.pointerEvents = desactivar ? 'none' : ''; el.style.cursor = desactivar ? 'crosshair' : ''; }
      });
    } catch(e) {}
  });
  // Bloquear solo paths que NO tengan clase editable
  const overlays = document.querySelectorAll('#map .leaflet-interactive:not(.leaflet-marker-icon):not(.recurso-editable):not(.plan-editable)');
  overlays.forEach(el => { el.style.pointerEvents = desactivar ? 'none' : ''; });
  // Asegurar que figuras editables sigan siendo clickeables
  if (desactivar) {
    document.querySelectorAll('#map .leaflet-interactive.recurso-editable, #map .leaflet-interactive.plan-editable').forEach(el => {
      el.style.pointerEvents = 'all';
      el.style.cursor = 'pointer';
    });
  } else {
    document.querySelectorAll('#map .leaflet-interactive.recurso-editable, #map .leaflet-interactive.plan-editable').forEach(el => {
      el.style.pointerEvents = '';
      el.style.cursor = '';
    });
  }
}

function priorizarCapasEditables_(modo) {
  try {
    if (modo === 'copamiento') {
      const per = periodoActivoActual_();
      if (per && periodoLayers[per.id]) {
        periodoLayers[per.id].eachLayer(c => { if (c.bringToFront) c.bringToFront(); });
      }
    } else if (modo === 'planificacion') {
      [planificacionRecursosAmarillaLayer, planificacionRecursosRojaLayer].forEach(grp => {
        grp.eachLayer(c => { if (c.bringToFront) c.bringToFront(); });
      });
    }
  } catch (e) { /* no crítico */ }
}

