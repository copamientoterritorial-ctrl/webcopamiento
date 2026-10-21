/* ============ ASISTENTE DE PERIODO CRÍTICO EN 3 PASOS (11-10-2026) ============
 * 1) Comuna, nombre y fechas (con valores sugeridos)  2) Punto de partida: copiar
 * un escenario planificado (con su cantidad de recursos) o empezar vacío
 * 3) Confirmar → crea el periodo, copia los recursos y abre el Modo Planificador
 * en edición. Usa las mismas RPC de siempre (crear_periodo, crear_recurso*). */
state.pca = null;
function isoLocal_(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function abrirAsistentePeriodo_() {
  if (!puedeEditarModulo_('periodo_critico') || !['GRD', 'Administrador', 'Jefe de Área Relacionamiento'].includes(state.perfil.perfil)) {
    mostrarToast_('Tu usuario no tiene permiso para crear periodos críticos.');
    return;
  }
  const comunas = comunasSeleccionablesUsuario_();
  if (!comunas.length) { mostrarToast_('No tienes comunas asignadas.'); return; }
  const hoy = new Date(), y = hoy.getFullYear(), m = hoy.getMonth() + 1;
  const temporada = m >= 7 ? y + '-' + (y + 1) : (y - 1) + '-' + y;
  const fin = new Date(hoy); fin.setDate(fin.getDate() + 1);   // por defecto: hasta mañana
  state.pca = {
    paso: 1,
    comunaId: comunas.some(c => c.id === state.activeComunaId) ? state.activeComunaId : comunas[0].id,
    nombre: 'Periodo Crítico ' + temporada,
    inicio: isoLocal_(hoy), fin: isoLocal_(fin),
    planes: null, partida: undefined, activo: null,
  };
  renderAsistentePeriodo_();
  document.getElementById('pca-overlay').classList.add('show');
}
function cerrarAsistentePeriodo_() {
  document.getElementById('pca-overlay').classList.remove('show');
  state.pca = null;
}
function leerPaso1Periodo_() {
  const a = state.pca; if (!a) return;
  const sel = document.getElementById('pca-comuna'); if (sel) a.comunaId = sel.value;
  const n = document.getElementById('pca-nombre'); if (n) a.nombre = n.value.trim();
  const i = document.getElementById('pca-inicio'); if (i) a.inicio = i.value;
  const f = document.getElementById('pca-fin'); if (f) a.fin = f.value;
}
async function renderAsistentePeriodo_() {
  const a = state.pca; if (!a) return;
  const cuerpo = document.getElementById('pca-cuerpo');
  const err = document.getElementById('pca-error'); err.classList.remove('show');
  document.querySelectorAll('#pca-pasos .pca-paso').forEach(el => {
    const p = Number(el.dataset.p);
    el.classList.toggle('actual', p === a.paso); el.classList.toggle('hecho', p < a.paso);
  });
  const btnAtras = document.getElementById('pca-atras'), btnSig = document.getElementById('pca-siguiente');
  btnAtras.textContent = a.paso === 1 ? 'Cancelar' : '← Atrás';
  btnSig.textContent = a.paso === 3 ? '✔ Crear y empezar a editar' : 'Siguiente →';
  btnSig.disabled = false;

  if (a.paso === 1) {
    document.getElementById('pca-sub').textContent = '¿Dónde y cuándo? Los valores vienen sugeridos: cámbialos si lo necesitas.';
    const comunas = comunasSeleccionablesUsuario_().slice().sort((x, y) => x.comuna.localeCompare(y.comuna));
    cuerpo.innerHTML =
      (comunas.length > 1
        ? '<div class="form-group"><label>Comuna</label><select id="pca-comuna">' +
          comunas.map(c => '<option value="' + c.id + '"' + (c.id === a.comunaId ? ' selected' : '') + '>' + escapeHtml_(c.comuna) + '</option>').join('') + '</select></div>'
        : '<div class="form-group"><label>Comuna</label><div style="font-weight:700;padding:6px 0;">' + escapeHtml_(nombreComuna_(a.comunaId)) + '</div></div>') +
      '<div class="form-group"><label>Nombre del periodo</label><input type="text" id="pca-nombre" value="' + escapeHtml_(a.nombre) + '"></div>' +
      '<div class="form-row">' +
        '<div class="form-group"><label>Fecha inicio</label><input type="date" id="pca-inicio" value="' + a.inicio + '"></div>' +
        '<div class="form-group"><label>Fecha término (estimada)</label><input type="date" id="pca-fin" value="' + a.fin + '"></div>' +
      '</div>' +
      '<div class="pca-chips"><span style="font-size:11px;color:var(--text-tertiary);align-self:center;">Duración rápida:</span>' +
        [2, 3, 5, 10].map(n => '<button class="pca-chip" data-dias="' + n + '">' + n + ' días</button>').join('') + '</div>';
    cuerpo.querySelectorAll('[data-dias]').forEach(b => b.addEventListener('click', () => {
      leerPaso1Periodo_();
      const ini = a.inicio ? new Date(a.inicio + 'T12:00:00') : new Date();
      const f = new Date(ini); f.setDate(f.getDate() + Number(b.dataset.dias));
      a.fin = isoLocal_(f);
      document.getElementById('pca-fin').value = a.fin;
    }));
    setTimeout(() => { const n = document.getElementById('pca-nombre'); if (n) n.focus(); }, 50);
    return;
  }

  if (a.paso === 2) {
    document.getElementById('pca-sub').textContent = '¿Desde dónde partes? Copiar un escenario ya planificado ahorra dibujar todo de nuevo (la planificación original no cambia).';
    if (!a.planes) {
      cuerpo.innerHTML = '<div class="layer-empty-msg">Revisando la planificación de ' + escapeHtml_(nombreComuna_(a.comunaId)) + '…</div>';
      btnSig.disabled = true;
      const { data: planes } = await supabaseClient.from('planes_contingencia')
        .select('id, escenario').eq('ambito', 'comuna').eq('comuna_id', a.comunaId);
      const conteos = await Promise.all((planes || []).map(async p => {
        const { count } = await supabaseClient.from('planificacion_recursos').select('id', { count: 'exact', head: true }).eq('plan_id', p.id);
        return { id: p.id, escenario: p.escenario, count: count || 0 };
      }));
      if (!state.pca || state.pca !== a) return;   // se cerró mientras cargaba
      a.planes = conteos;
      if (a.partida === undefined) {
        const pref = ['Roja', 'Amarilla', 'Verde'].map(e => conteos.find(p => p.escenario === e && p.count > 0)).find(Boolean);
        a.partida = pref ? { planId: pref.id, escenario: pref.escenario } : null;
      }
      btnSig.disabled = false;
    }
    const ICO = { Verde: '🟢', Amarilla: '🟡', Roja: '🔴' };
    const opciones = ['Roja', 'Amarilla', 'Verde'].map(e => {
      const p = a.planes.find(x => x.escenario === e && x.count > 0) || a.planes.find(x => x.escenario === e);
      const n = p ? p.count : 0;
      const sel = a.partida && p && a.partida.planId === p.id;
      return '<button class="pca-opcion' + (sel ? ' sel' : '') + '" data-plan="' + (p ? p.id : '') + '" data-esc="' + e + '"' + (n ? '' : ' disabled') + '>' +
        '<span class="po-ico">' + ICO[e] + '</span><span><b>Copiar ' + escapeHtml_(etiquetaEscenario_(e)) + '</b>' +
        '<small>' + (n ? n + ' recurso(s) planificado(s) · rutas, puntos y zonas' : 'Sin recursos planificados en este escenario') + '</small></span></button>';
    }).join('') +
      '<button class="pca-opcion' + (a.partida === null ? ' sel' : '') + '" data-plan=""><span class="po-ico">⬜</span>' +
      '<span><b>Empezar vacío</b><small>Dibujarás los recursos del periodo desde cero</small></span></button>';
    cuerpo.innerHTML = '<div class="pca-opciones">' + opciones + '</div>' +
      '<div class="pca-aviso" style="background:#EFF6FF;border-color:#BFDBFE;color:#1E40AF;">ℹ️ Se copia la plantilla completa. Después, en el panel <b>Recursos de la emergencia</b>, marcas por institución lo que sí se dispone y lo guardas con <b>💾 Guardar selección</b>.</div>';
    cuerpo.querySelectorAll('.pca-opcion').forEach(b => b.addEventListener('click', () => {
      if (b.disabled) return;
      a.partida = b.dataset.plan ? { planId: b.dataset.plan, escenario: b.dataset.esc } : null;
      renderAsistentePeriodo_();
    }));
    return;
  }

  // Paso 3: resumen + aviso si ya hay un periodo activo (se cerrará solo)
  document.getElementById('pca-sub').textContent = 'Revisa y confirma. Al crear, el mapa se abre en Modo Planificador listo para editar.';
  if (a.activo === null) {
    const { data: act } = await supabaseClient.from('config_periodos').select('nombre_plan')
      .eq('comuna_id', a.comunaId).eq('estado_periodo', 'activo').limit(1);
    if (!state.pca || state.pca !== a) return;
    a.activo = (act && act[0]) ? act[0].nombre_plan || 'sin nombre' : '';
  }
  const fmt = iso => iso ? iso.split('-').reverse().join('-') : '—';
  const partidaTxt = a.partida
    ? 'Copia de ' + etiquetaEscenario_(a.partida.escenario) + ' (' + ((a.planes || []).find(p => p.id === a.partida.planId) || {}).count + ' recurso(s))'
    : 'Vacío (dibujar desde cero)';
  cuerpo.innerHTML =
    '<div class="pca-resumen">' +
      '<div><span>Comuna</span><b>' + escapeHtml_(nombreComuna_(a.comunaId)) + '</b></div>' +
      '<div><span>Nombre</span><b>' + escapeHtml_(a.nombre) + '</b></div>' +
      '<div><span>Fechas</span>' + fmt(a.inicio) + ' → ' + fmt(a.fin) + '</div>' +
      '<div><span>Punto de partida</span>' + escapeHtml_(partidaTxt) + '</div>' +
    '</div>' +
    (a.activo ? '<div class="pca-aviso">⚠️ La comuna ya tiene un periodo activo (<b>' + escapeHtml_(a.activo) + '</b>). Al crear este, el anterior se cierra automáticamente.</div>' : '');
}
async function avanzarAsistentePeriodo_() {
  const a = state.pca; if (!a) return;
  const err = document.getElementById('pca-error');
  const fallo = msg => { err.textContent = msg; err.classList.add('show'); };
  if (a.paso === 1) {
    const comunaAntes = a.comunaId;
    leerPaso1Periodo_();
    if (!a.comunaId) return fallo('Selecciona la comuna.');
    if (!a.nombre) return fallo('Ponle un nombre al periodo.');
    if (!a.inicio) return fallo('Indica la fecha de inicio.');
    if (a.fin && a.fin < a.inicio) return fallo('La fecha de término no puede ser anterior al inicio.');
    if (a.comunaId !== comunaAntes) { a.planes = null; a.partida = undefined; a.activo = null; }
    a.paso = 2; return renderAsistentePeriodo_();
  }
  if (a.paso === 2) { if (a.planes) { a.paso = 3; return renderAsistentePeriodo_(); } return; }
  // Paso 3 → crear
  const datos = Object.assign({}, a);
  cerrarAsistentePeriodo_();
  mostrarLandingPeriodoCritico_(datos.nombre);
  const { error } = await supabaseClient.rpc('crear_periodo', {
    p_comuna_id: datos.comunaId, p_nombre_plan: datos.nombre,
    p_fecha_inicio: datos.inicio || null, p_fecha_fin: datos.fin || null,
  });
  if (error) {
    ocultarLandingPlanificacion_();
    state.pca = Object.assign(datos, { paso: 3 });
    document.getElementById('pca-overlay').classList.add('show');
    await renderAsistentePeriodo_();
    fallo('No se pudo crear: ' + error.message);
    return;
  }
  landingAvanzarPaso_(2, 'Cargando capas y recursos del periodo…');
  if (datos.comunaId !== state.activeComunaId) {
    await setActiveComuna(datos.comunaId, true);
    const sel = document.getElementById('comuna-select');
    if (sel && sel.style.display !== 'none') sel.value = datos.comunaId;
  }
  landingAvanzarPaso_(3, datos.partida ? 'Copiando ' + etiquetaEscenario_(datos.partida.escenario) + ' al periodo…' : 'Activando modo de edición…');
  if (datos.partida) await copiarPlanificacionAPeriodo_(datos.partida.planId, datos.partida.escenario);
  await loadRecursos(state.activeComunaId, ++comunaRequestToken);
  ocultarLandingPlanificacion_();
  // Abrir el Modo Emergencia en la pestaña Copamiento, con la edición activa.
  mostrarVista_('mapa', 'emergencia');
  setTimeout(() => {
    abrirPanelMapa_('copamiento');   // panel 📍 Copamiento desplegado bajo su ícono
    if (!state.editorMode) setTimeout(() => toggleEditorMode(), 150);
  }, 120);
  mostrarToast_('🔥 Periodo "' + datos.nombre + '" creado y activo en ' + nombreComuna_(datos.comunaId) + '. Ya puedes editar en el mapa.');
}
function retrocederAsistentePeriodo_() {
  const a = state.pca; if (!a) return;
  if (a.paso === 1) return cerrarAsistentePeriodo_();
  if (a.paso === 2) leerPaso1Periodo_();
  a.paso -= 1; renderAsistentePeriodo_();
}

async function eliminarPeriodo_(periodoId, nombrePlan, cantidadRecursos) {
  const mensaje = cantidadRecursos > 0
    ? '¿Eliminar el periodo "' + nombrePlan + '"? Esto también eliminará permanentemente sus ' + cantidadRecursos + ' recurso(s) asociado(s). Esta acción no se puede deshacer.'
    : '¿Eliminar el periodo "' + nombrePlan + '"? Esta acción no se puede deshacer.';
  if (!confirm(mensaje)) return;
  const { error } = await supabaseClient.from('config_periodos').delete().eq('id', periodoId);
  if (error) { mostrarToast_('No se pudo eliminar el periodo: ' + error.message); return; }
  mostrarToast_('Periodo y sus recursos eliminados.');
  loadRecursos(state.activeComunaId, ++comunaRequestToken);
}

let periodoAcerrarId = null;

function abrirModalCerrarPeriodo_(periodoId, nombrePlan) {
  periodoAcerrarId = periodoId;
  document.getElementById('cerrar-periodo-nombre').textContent = nombrePlan;
  document.getElementById('cp-conclusion').value = '';
  document.getElementById('cerrar-periodo-error').classList.remove('show');
  document.getElementById('cerrar-periodo-modal-overlay').classList.add('show');
}

async function confirmarCerrarPeriodo_() {
  const btn = document.getElementById('btn-confirmar-cerrar-periodo');
  const errEl = document.getElementById('cerrar-periodo-error');
  errEl.classList.remove('show');

  const conclusion = document.getElementById('cp-conclusion').value.trim();
  if (!conclusion) { errEl.textContent = 'Escribe una conclusión antes de cerrar el periodo.'; errEl.classList.add('show'); return; }

  btn.textContent = 'Cerrando…'; btn.disabled = true;
  const { error } = await supabaseClient.rpc('cerrar_periodo', { p_periodo_id: periodoAcerrarId, p_conclusion: conclusion });
  btn.textContent = 'Cerrar periodo'; btn.disabled = false;

  if (error) { errEl.textContent = 'No se pudo cerrar: ' + error.message; errEl.classList.add('show'); return; }

  document.getElementById('cerrar-periodo-modal-overlay').classList.remove('show');
  mostrarToast_('Periodo cerrado correctamente.');
  periodoAcerrarId = null;
  loadRecursos(state.activeComunaId, ++comunaRequestToken);
}

let chartResumenActivo = null;

/* ============ DESCARGA PDF (punto 4): mapa + resumen de recursos ============
 * Genera un PDF con encabezado del plan/periodo, captura del mapa actual y la
 * tabla de recursos con compromiso. Si la captura del mapa falla (CORS de tiles),
 * el PDF se genera igual con el resumen (red de seguridad). */
async function capturarMapaParaPDF_() {
  // La edge function 'mapa-pdf' devuelve un SVG georreferenciado (tiles + geometrías
  // alineados). Aquí lo rasterizamos a PNG con el canvas del navegador (nativo, sin
  // desalineación) y ese PNG va al PDF.
  try {
    const geometrias = recolectarGeometriasMapa_();
    const center = map.getCenter();
    const size = map.getSize();
    const { data, error } = await supabaseClient.functions.invoke('mapa-pdf', {
      body: {
        center: { lat: center.lat, lng: center.lng },
        zoom: map.getZoom(),
        width: Math.round(size.x),
        height: Math.round(size.y),
        geometrias,
      },
    });
    if (error || !data || !data.ok || !data.svg) {
      const detalle = (error && error.message) || (data && data.error) || 'sin respuesta';
      console.warn('mapa-pdf falló:', detalle);
      mostrarToast_('Mapa PDF: ' + detalle);
      return null;
    }
    return await svgAPng_(data.svg, Math.round(size.x), Math.round(size.y));
  } catch (e) {
    console.warn('No se pudo componer el mapa server-side:', e);
    return null;
  }
}

// Rasteriza un SVG (string) a PNG dataURL usando el canvas del navegador.
function svgAPng_(svgString, w, h) {
  return new Promise((resolve) => {
    try {
      const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = w; canvas.height = h;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, w, h);
          URL.revokeObjectURL(url);
          resolve(canvas.toDataURL('image/png'));
        } catch (e) { URL.revokeObjectURL(url); console.warn('rasterizar SVG falló:', e); resolve(null); }
      };
      img.onerror = () => { URL.revokeObjectURL(url); console.warn('no se pudo cargar el SVG como imagen'); resolve(null); };
      img.src = url;
    } catch (e) { resolve(null); }
  });
}

// Recolecta las geometrías visibles del mapa en el formato de la edge function.
function recolectarGeometriasMapa_() {
  const geoms = [];
  const pushCapa = (layer) => {
    // Grupos y capas geoJSON: recorrer hijos
    if (layer.eachLayer && !(layer.getLatLng || layer.getLatLngs)) { layer.eachLayer(pushCapa); return; }
    const opt = layer.options || {};
    if (layer instanceof L.Polygon) {
      const anillos = layer.getLatLngs();
      const ring = Array.isArray(anillos[0]) ? anillos[0] : anillos;
      const esLimite = (opt.fillOpacity != null && opt.fillOpacity <= 0.05);
      geoms.push({ tipo: 'area', coords: ring.map(ll => [ll.lng, ll.lat]),
        color: opt.color || '#0F172A', fillColor: opt.fillColor || opt.color,
        weight: opt.weight || (esLimite ? 2 : 3), fillOpacity: esLimite ? 0 : (opt.fillOpacity != null ? opt.fillOpacity : 0.2),
        etiqueta: esLimite ? '' : extraerTooltipCapa_(layer) });
    } else if (layer instanceof L.Polyline) {
      const pts = layer.getLatLngs();
      const seg = Array.isArray(pts[0]) ? pts[0] : pts;
      geoms.push({ tipo: 'linea', coords: seg.map(ll => [ll.lng, ll.lat]), color: opt.color || '#3388ff', weight: opt.weight || 4,
        etiqueta: extraerTooltipCapa_(layer) });
    } else if (layer.getLatLng && opt.icon) {
      const ll = layer.getLatLng();
      const etiqueta = extraerTooltipMarcador_(layer);
      geoms.push({ tipo: 'punto', coords: [ll.lng, ll.lat], color: extraerColorMarcador_(layer), etiqueta });
    }
  };
  map.eachLayer(pushCapa);

  // Límite comunal: capturarlo explícitamente desde limiteLayer (L.geoJSON con
  // estilo en el padre). Se recorren todos sus anillos (incluye MultiPolygon).
  try {
    if (limiteLayer && map.hasLayer(limiteLayer)) {
      limiteLayer.eachLayer(sub => {
        if (!sub.getLatLngs) return;
        const anillos = sub.getLatLngs();
        // Aplanar hasta llegar a arrays de latlng
        const empujarAnillo = (arr) => {
          if (!arr.length) return;
          if (arr[0] && arr[0].lat != null) {
            geoms.push({ tipo: 'linea', coords: arr.map(ll => [ll.lng, ll.lat]).concat([[arr[0].lng, arr[0].lat]]),
              color: '#0F172A', weight: 2.5 });
          } else {
            arr.forEach(empujarAnillo);
          }
        };
        empujarAnillo(anillos);
      });
    }
  } catch (e) { console.warn('No se pudo capturar el límite comunal:', e); }

  return geoms;
}

// Extrae el texto del tooltip permanente de un marcador (para etiquetarlo en el PDF)
function extraerTooltipMarcador_(layer) {
  try {
    const tt = layer.getTooltip && layer.getTooltip();
    if (tt) { const c = tt.getContent(); return typeof c === 'string' ? c.replace(/<[^>]*>/g, '').trim() : ''; }
  } catch (e) {}
  return '';
}
// Etiqueta de líneas/áreas: usa su tooltip; devuelve también el centro para ubicarla
function extraerTooltipCapa_(layer) {
  try {
    const tt = layer.getTooltip && layer.getTooltip();
    if (tt) { const c = tt.getContent(); return typeof c === 'string' ? c.replace(/<[^>]*>/g, '').trim() : ''; }
  } catch (e) {}
  return '';
}

// Dibuja una capa Leaflet (o recorre sus subcapas) sobre el canvas.
function dibujarCapaEnCanvas_(layer, ctx, toPt, size, escala) {
  escala = escala || 1;
  if (layer.eachLayer && !(layer.getLatLng || layer.getLatLngs)) {
    layer.eachLayer(sub => { try { dibujarCapaEnCanvas_(sub, ctx, toPt, size, escala); } catch (e) {} });
    return;
  }
  const opt = layer.options || {};

  if (layer instanceof L.Polygon) {
    const anillos = layer.getLatLngs();
    const rings = Array.isArray(anillos[0]) ? anillos : [anillos];
    ctx.save();
    rings.forEach(ring => {
      ctx.beginPath();
      ring.forEach((ll, i) => { const p = toPt(ll); i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y); });
      ctx.closePath();
      if (opt.fillColor || opt.color) { ctx.fillStyle = hexToRgba_(opt.fillColor || opt.color, opt.fillOpacity != null ? opt.fillOpacity : 0.2); ctx.fill(); }
      ctx.strokeStyle = opt.color || '#3388ff'; ctx.lineWidth = (opt.weight || 3) * escala; ctx.globalAlpha = opt.opacity != null ? opt.opacity : 1; ctx.stroke(); ctx.globalAlpha = 1;
    });
    ctx.restore();
    return;
  }
  if (layer instanceof L.Polyline) {
    const pts = layer.getLatLngs();
    const segs = Array.isArray(pts[0]) ? pts : [pts];
    ctx.save();
    segs.forEach(seg => {
      ctx.beginPath();
      seg.forEach((ll, i) => { const p = toPt(ll); i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y); });
      ctx.strokeStyle = opt.color || '#3388ff'; ctx.lineWidth = (opt.weight || 4) * escala; ctx.globalAlpha = opt.opacity != null ? opt.opacity : 1;
      ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.stroke(); ctx.globalAlpha = 1;
    });
    ctx.restore();
    return;
  }
  if (layer.getLatLng && opt.icon) {
    const p = toPt(layer.getLatLng());
    if (p.x < 0 || p.y < 0 || p.x > size.x || p.y > size.y) return;
    const color = extraerColorMarcador_(layer);
    const r = 9 * escala, h = 14 * escala;
    ctx.save();
    ctx.beginPath(); ctx.fillStyle = color; ctx.arc(p.x, p.y - h, r, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.moveTo(p.x - 7 * escala, p.y - 12 * escala); ctx.lineTo(p.x + 7 * escala, p.y - 12 * escala); ctx.lineTo(p.x, p.y); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.fillStyle = '#fff'; ctx.arc(p.x, p.y - h, 3.5 * escala, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    return;
  }
}

function hexToRgba_(hex, alpha) {
  const c = hexToRgb_(hex);
  return 'rgba(' + c.r + ',' + c.g + ',' + c.b + ',' + (alpha != null ? alpha : 1) + ')';
}

function extraerColorMarcador_(capa) {
  try {
    const html = capa.options.icon.options.html || '';
    const m = html.match(/fill="(#[0-9a-fA-F]{3,6})"/);
    return m ? m[1] : '#DC2626';
  } catch (e) { return '#DC2626'; }
}

async function capturarConHtml2canvas_() {
  try {
    const cont = document.getElementById('map');
    if (!cont || typeof html2canvas === 'undefined') return null;
    const canvas = await html2canvas(cont, { useCORS: true, allowTaint: false, logging: false, scale: 1.4 });
    return canvas.toDataURL('image/jpeg', 0.85);
  } catch (e) {
    console.warn('No se pudo capturar el mapa:', e);
    return null;
  }
}

async function generarPDFPeriodo_(periodoId) {
  mostrarToast_('Generando PDF…');
  // 11-10-2026: el PDF incluye SOLO los recursos validados «Va» en el Modo
  // Emergencia (SQL 84), en la tabla y en la imagen del mapa.
  const [{ data: periodo }, { data: recursos, error: errRec }] = await Promise.all([
    supabaseClient.from('config_periodos').select('*').eq('id', periodoId).maybeSingle(),
    supabaseClient.from('copamiento_recursos_geojson').select('id, tipo_recurso, institucion_id, instituciones(nombre, color_hex)').eq('id_periodo', periodoId),
  ]);
  if (!periodo) { mostrarToast_('No se encontró el periodo.'); return; }
  if (errRec) { mostrarToast_('No se pudieron leer los recursos del periodo: ' + errRec.message); return; }
  const lista = recursos || [];
  let idsVan = new Set();
  if (lista.length) {
    const { data: est, error: errEst } = await supabaseClient.rpc('estado_recursos_emergencia', { p_ids: lista.map(r => String(r.id)) });
    if (errEst) { mostrarToast_('No se pudo leer la validación de recursos: ' + errEst.message); return; }
    idsVan = new Set((est || []).filter(x => x.va).map(x => String(x.id)));
  }
  const van = lista.filter(r => idsVan.has(String(r.id)));
  if (lista.length && !van.length) mostrarToast_('⚠️ Ningún recurso está validado «Va»: el PDF saldrá sin recursos. Valídalos en Modo Emergencia.');

  // Tabla: institución + tipo, solo lo que va
  const agrup = {};
  van.forEach(r => {
    const nom = (r.instituciones && r.instituciones.nombre) || 'Sin institución';
    const k = nom + '||' + (r.tipo_recurso || '—');
    if (!agrup[k]) agrup[k] = { institucion_nombre: nom, institucion_color: (r.instituciones && r.instituciones.color_hex) || '#64748B', tipo_recurso: r.tipo_recurso || '—', cantidad: 0 };
    agrup[k].cantidad++;
  });

  // Mapa: sacar temporalmente lo que NO va para que no salga en la imagen
  const grupo = periodoLayers[periodoId];
  const quitados = [];
  if (grupo) lista.forEach(r => {
    const capa = recursosMarkersById[r.id];
    if (capa && !idsVan.has(String(r.id)) && grupo.hasLayer(capa)) { grupo.removeLayer(capa); quitados.push(capa); }
  });

  const comunaNombre = (state.comunas.find(c => c.id === periodo.comuna_id) || {}).comuna || periodo.comuna_id || '';
  try {
    await construirPDF_({
      titulo: periodo.nombre_plan || 'Periodo Crítico',
      subtitulo: 'Periodo Crítico · ' + comunaNombre,
      nota: 'Solo recursos validados para la emergencia: ' + van.length + ' de ' + lista.length,
      fechas: (periodo.fecha_inicio || '—') + '  →  ' + (periodo.fecha_fin || 'indefinido'),
      estado: periodo.estado_periodo || '',
      conclusion: periodo.estado_periodo === 'cerrado' ? (periodo.conclusion || '') : '',
      filas: Object.values(agrup),
      nombreArchivo: 'periodo_' + (comunaNombre || 'comuna').toLowerCase().replace(/\s+/g, '_'),
    });
  } finally {
    quitados.forEach(capa => grupo.addLayer(capa));
    aplicarEstiloEmergencia_();
  }
}

async function generarPDFPlan_(planId, escenario, comunaNombre) {
  mostrarToast_('Generando PDF…');
  // Recursos planificados del plan, agrupados por institución + tipo
  const { data: recursos } = await supabaseClient
    .from('planificacion_recursos_geojson')
    .select('tipo_recurso, instituciones(nombre, color_hex, logo_url)')
    .eq('plan_id', planId);
  const agrup = {};
  (recursos || []).forEach(r => {
    const nom = (r.instituciones && r.instituciones.nombre) || 'Sin institución';
    const col = (r.instituciones && r.instituciones.color_hex) || '#64748B';
    const k = nom + '||' + r.tipo_recurso;
    if (!agrup[k]) agrup[k] = { institucion_nombre: nom, institucion_color: col, tipo_recurso: r.tipo_recurso, cantidad: 0 };
    agrup[k].cantidad++;
  });
  await construirPDF_({
    titulo: 'Plan ' + nombreEscenario_(escenario) + (escenario === 'Verde' ? ' 🟢' : escenario === 'Amarilla' ? ' 🟡' : ' 🔴'),
    subtitulo: 'Planificación Previa · ' + (comunaNombre || ''),
    fechas: 'Plan de contingencia (' + etiquetaEscenario_(escenario) + ')',
    estado: 'activo',
    conclusion: '',
    filas: Object.values(agrup),
    nombreArchivo: 'plan_' + etiquetaEscenario_(escenario).toLowerCase() + '_' + (comunaNombre || 'comuna').toLowerCase().replace(/\s+/g, '_'),
  });
}

async function construirPDF_(cfg) {
  const { jsPDF } = window.jspdf || {};
  if (!jsPDF) { mostrarToast_('No se pudo cargar el generador de PDF.'); return; }
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  let y = 14;

  // Encabezado
  doc.setFontSize(16); doc.setTextColor(15, 23, 42); doc.setFont(undefined, 'bold');
  doc.text(cfg.titulo, 14, y); y += 7;
  doc.setFontSize(10); doc.setFont(undefined, 'normal'); doc.setTextColor(90, 100, 115);
  doc.text(cfg.subtitulo, 14, y); y += 5;
  if (cfg.nota) { doc.setTextColor(21, 128, 61); doc.text(cfg.nota, 14, y); y += 5; doc.setTextColor(90, 100, 115); }
  doc.text('Vigencia: ' + cfg.fechas, 14, y); y += 5;
  doc.text('Estado: ' + cfg.estado + '   ·   Generado: ' + new Date().toLocaleString('es-CL'), 14, y); y += 6;
  doc.setDrawColor(220, 225, 232); doc.line(14, y, W - 14, y); y += 6;

  // Captura del mapa (blindada: si falla, el PDF se genera igual sin imagen)
  let mapaImg = null;
  try { mapaImg = await capturarMapaParaPDF_(); }
  catch (e) { console.warn('Captura de mapa falló, se genera PDF sin imagen:', e); mapaImg = null; }
  if (mapaImg) {
    const imgW = W - 28, imgH = imgW * 0.62;
    try { doc.addImage(mapaImg, 'PNG', 14, y, imgW, imgH); y += imgH + 6; }
    catch (e) { console.warn('addImage falló:', e); y += 2; }
  } else {
    doc.setFontSize(9); doc.setTextColor(150);
    doc.text('(No se pudo incluir la imagen del mapa en este PDF.)', 14, y); y += 8;
  }

  // Conclusión (si aplica)
  if (cfg.conclusion) {
    doc.setFontSize(11); doc.setFont(undefined, 'bold'); doc.setTextColor(15, 23, 42);
    doc.text('Conclusión del periodo', 14, y); y += 5;
    doc.setFontSize(9.5); doc.setFont(undefined, 'normal'); doc.setTextColor(60, 70, 85);
    const lineas = doc.splitTextToSize(cfg.conclusion, W - 28);
    doc.text(lineas, 14, y); y += lineas.length * 4.5 + 4;
  }

  // Resumen de recursos con compromiso
  const total = cfg.filas.reduce((a, f) => a + Number(f.cantidad), 0);
  doc.setFontSize(12); doc.setFont(undefined, 'bold'); doc.setTextColor(15, 23, 42);
  doc.text('Resumen de Recursos con Compromiso', 14, y); y += 5;
  doc.setFontSize(10); doc.setFont(undefined, 'normal'); doc.setTextColor(37, 99, 235);
  doc.text(total + ' recurso(s) comprometido(s) en total', 14, y); y += 7;

  // Tabla
  doc.setFontSize(9); doc.setTextColor(120, 130, 145); doc.setFont(undefined, 'bold');
  doc.text('Institución / Empresa', 14, y);
  doc.text('Tipo', W - 70, y);
  doc.text('Cantidad', W - 30, y); y += 2;
  doc.setDrawColor(230, 234, 240); doc.line(14, y, W - 14, y); y += 5;
  doc.setFont(undefined, 'normal'); doc.setTextColor(40, 48, 60);
  const filasOrden = cfg.filas.slice().sort((a, b) => Number(b.cantidad) - Number(a.cantidad));
  if (!filasOrden.length) {
    doc.setTextColor(150); doc.text('Sin recursos asociados.', 14, y); y += 6;
  }
  filasOrden.forEach(f => {
    if (y > 275) { doc.addPage(); y = 16; }
    // cuadro de color de la institución
    const col = hexToRgb_(f.institucion_color || '#64748B');
    doc.setFillColor(col.r, col.g, col.b); doc.rect(14, y - 3, 3, 3, 'F');
    doc.setTextColor(40, 48, 60); doc.setFontSize(9.5);
    doc.text(String(f.institucion_nombre || 'Sin institución').slice(0, 48), 19, y);
    doc.text(String(f.tipo_recurso || '—'), W - 70, y);
    doc.setFont(undefined, 'bold'); doc.text(String(f.cantidad), W - 27, y); doc.setFont(undefined, 'normal');
    y += 6;
  });

  // Pie
  doc.setFontSize(8); doc.setTextColor(160, 168, 180);
  doc.text('SIG Copamiento Territorial — documento generado automáticamente', 14, 290);

  doc.save(cfg.nombreArchivo + '_' + new Date().toISOString().slice(0, 10) + '.pdf');
  mostrarToast_('PDF generado.');
}

function hexToRgb_(hex) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || '');
  return m ? { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) } : { r: 100, g: 116, b: 139 };
}

async function abrirResumenPeriodo_(periodoId) {
  state.resumenPeriodoActivoId = periodoId;
  document.getElementById('resumen-modal-title').textContent = 'Resumen del periodo';
  document.getElementById('resumen-modal-sub').textContent = '—';
  document.getElementById('resumen-modal-body').innerHTML = '<div class="wx-loading" style="color:var(--text-tertiary);">Cargando resumen…</div>';
  document.getElementById('resumen-modal-overlay').classList.add('show');

  // 21-10-2026: el resumen cuenta SOLO los recursos activados en el panel «Recursos de la emergencia» (check «Va», SQL 84),
  // no toda la plantilla del periodo. Se agrupa aquí por institución + tipo (antes: vista resumen_recursos_por_periodo).
  const [{ data: periodo }, { data: recs, error }] = await Promise.all([
    supabaseClient.from('config_periodos').select('*').eq('id', periodoId).maybeSingle(),
    supabaseClient.from('copamiento_recursos').select('id, tipo_recurso, institucion_id, instituciones(nombre, color_hex)').eq('id_periodo', periodoId),
  ]);

  document.getElementById('resumen-modal-title').textContent = periodo ? periodo.nombre_plan : 'Resumen del periodo';
  document.getElementById('resumen-modal-sub').textContent = periodo ? ((periodo.fecha_inicio || '—') + ' → ' + (periodo.fecha_fin || 'indefinido')) : '—';

  if (error) {
    document.getElementById('resumen-modal-body').innerHTML = '<div class="layer-empty-msg">No se pudo cargar el resumen: ' + error.message + '</div>';
    return;
  }
  const todos = recs || [];
  let activos = [];
  if (todos.length) {
    const { data: est, error: errEst } = await supabaseClient.rpc('estado_recursos_emergencia', { p_ids: todos.map(r => String(r.id)) });
    if (errEst) {
      document.getElementById('resumen-modal-body').innerHTML = '<div class="layer-empty-msg">No se pudo leer qué recursos están activados: ' + escapeHtml_(errEst.message) + '</div>';
      return;
    }
    const va = new Set((est || []).filter(x => x.va).map(x => String(x.id)));
    activos = todos.filter(r => va.has(String(r.id)));
  }
  const agrupado = {};
  activos.forEach(r => {
    const inst = r.instituciones || {}, k = (inst.nombre || 'Sin institución') + '|' + (r.tipo_recurso || 'Sin tipo');
    const f = agrupado[k] = agrupado[k] || { institucion_nombre: inst.nombre || 'Sin institución', institucion_color: inst.color_hex || '#64748B', tipo_recurso: r.tipo_recurso || 'Sin tipo', cantidad: 0 };
    f.cantidad++;
  });
  const filas = Object.values(agrupado);
  const total = filas.reduce((acc, f) => acc + Number(f.cantidad), 0);

  const porTipo = {};
  filas.forEach(f => { porTipo[f.tipo_recurso] = (porTipo[f.tipo_recurso] || 0) + Number(f.cantidad); });

  const body = document.getElementById('resumen-modal-body');
  body.innerHTML = '';

  if (periodo && periodo.estado_periodo === 'cerrado' && periodo.conclusion) {
    const conclusionBox = document.createElement('div');
    conclusionBox.style.cssText = 'background:#F1F5F9;border-radius:10px;padding:11px 13px;margin-bottom:14px;';
    conclusionBox.innerHTML = '<div style="font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:0.4px;color:var(--text-tertiary);margin-bottom:4px;">🔒 Conclusión del periodo</div><div style="font-size:12.5px;color:var(--text-primary);line-height:1.5;">' + periodo.conclusion + '</div>';
    body.appendChild(conclusionBox);
  }

  const totalEl = document.createElement('div'); totalEl.className = 'resumen-total';
  totalEl.textContent = total + ' recurso(s) activado(s) en la emergencia';
  body.appendChild(totalEl);
  const notaAct = document.createElement('div');
  notaAct.style.cssText = 'font-size:11.5px;color:var(--text-tertiary);margin:-4px 0 12px;';
  notaAct.textContent = todos.length
    ? 'Solo cuenta lo marcado «Va» en «Recursos de la emergencia» (' + total + ' de ' + todos.length + ' del periodo).'
    : '';
  if (notaAct.textContent) body.appendChild(notaAct);

  const label1 = document.createElement('p'); label1.className = 'section-label'; label1.textContent = 'Por tipo de recurso';
  body.appendChild(label1);
  const canvasWrap = document.createElement('div'); canvasWrap.style.marginBottom = '16px'; canvasWrap.style.height = '180px';
  const canvas = document.createElement('canvas'); canvas.id = 'chart-resumen-tipo';
  canvasWrap.appendChild(canvas);
  body.appendChild(canvasWrap);

  const label2 = document.createElement('p'); label2.className = 'section-label'; label2.textContent = 'Por institución';
  body.appendChild(label2);
  if (filas.length === 0) {
    const msg = document.createElement('div'); msg.className = 'layer-empty-msg';
    msg.textContent = todos.length
      ? 'Todavía no hay recursos activados: márcalos en «Recursos de la emergencia» (Modo Emergencia).'
      : 'Este periodo todavía no tiene recursos asociados.';
    body.appendChild(msg);
  }
  filas.sort((a, b) => Number(b.cantidad) - Number(a.cantidad)).forEach(f => {
    const row = document.createElement('div'); row.className = 'resumen-row';
    row.innerHTML =
      '<div class="rr-left"><span class="rr-sw" style="background:' + (f.institucion_color || '#64748B') + '"></span>' +
      (f.institucion_nombre || 'Sin institución') + ' · ' + f.tipo_recurso + '</div><b>' + f.cantidad + '</b>';
    body.appendChild(row);
  });

  if (chartResumenActivo) { chartResumenActivo.destroy(); chartResumenActivo = null; }
  if (Object.keys(porTipo).length > 0) {
    chartResumenActivo = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: Object.keys(porTipo),
        datasets: [{ data: Object.values(porTipo), backgroundColor: ['#2563EB', '#F59E0B', '#7C3AED'] }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
      },
    });
  }
}

