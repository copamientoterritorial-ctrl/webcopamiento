/* ============ 📋 BITÁCORA · APERTURAS (Planificador CMPC ▾, 22-11-2026, SQL 183 / 187 / 188) ============
 * Tabla de TODAS las aperturas de jornada registradas en la App Bitácora (/app-bitacora/app.html) con la información de cada unidad:
 * estado, turno, actividad general, avance de actividades (% del turno), dotación (jefe, fuerza, reemplazantes), móvil, km, fundo y punto.
 *   · Ven: Administrador (todas las áreas) y Jefe de Área / Subgerente / GRT (sus áreas; lo decide el RLS de bit_jornada).
 *   · Lee la vista v_bit_jornadas (security_invoker). Avance = actividades_hasta ÷ turno (columnas del SQL 188; sin el 188 queda vacío).
 *   · ⬇️ Excel con 2 hojas: «Aperturas» (detalle de cada recurso y jornada) y «Personal» (una fila por persona de cada unidad).
 * Vista: data-vista="bitacora" → #bitacora-panel (`abrirBitacoraWeb_`, `cargarBitacoraWeb_`). */
state.bt = state.bt || { desde: '', hasta: '', area: '', tipo: '', estado: '', q: '', filas: [], abierta: '', cargado: false };
function puedeBitacoraWeb_() { return esAdminOJefe_(); }

const BT_TIPOS = { BMP: '🚒 Brigada Multipropósito', BD: '🚓 Brigada Disuasiva', VC: '🛻 Vigía Camioneta', VM: '🏍️ Vigía Motorizado', VI: '🚶 Vigía Infantería', VMON: '🐎 Vigía Montado' };
function btDiaISO_(n) { const d = new Date(); d.setDate(d.getDate() + n); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function btFecha_(iso) { if (!iso) return ''; const p = String(iso).slice(0, 10).split('-'); return p[2] + '-' + p[1] + '-' + p[0]; }
function btHora_(ts) { return ts ? new Date(ts).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }) : ''; }
function btDur_(min) { min = Math.max(0, Math.round(Number(min) || 0)); const h = Math.floor(min / 60), m = min % 60; return h ? h + ' h' + (m ? ' ' + m + ' min' : '') : m + ' min'; }
/** Estado de la apertura para filtrar y pintar: abierta · cerrada · otro (día libre, licencia…). */
function btEstado_(j) { return !j.en_servicio ? 'otro' : (j.cerrada ? 'cerrada' : 'abierta'); }
const BT_ESTADOS = { abierta: { t: '🟢 Abierta', c: '#16A34A' }, cerrada: { t: '✅ Cerrada', c: '#2563EB' }, otro: { t: 'Sin servicio', c: '#7C3AED' } };
function btReemplazantes_(j) { return (j.dotacion || []).filter(p => p.es_reemplazo); }
function btJefe_(j) { return (j.dotacion || []).find(p => p.es_jefe) || null; }

async function abrirBitacoraWeb_() {
  const s = state.bt;
  if (!s.desde) { s.desde = btDiaISO_(-6); s.hasta = btDiaISO_(0); }
  const p = document.getElementById('bitacora-panel'); if (!p) return;
  if (!p.dataset.montado) {
    p.dataset.montado = '1';
    p.innerHTML = '<div class="pat-toolbar"><div class="pat-toolbar-left"><strong>📋 Bitácora · Aperturas</strong>' +
        '<label class="bt-f">Desde <input type="date" id="bt-desde" class="admin-search"></label>' +
        '<label class="bt-f">Hasta <input type="date" id="bt-hasta" class="admin-search"></label>' +
        '<select id="bt-area" class="admin-search" title="Área"></select>' +
        '<select id="bt-tipo" class="admin-search" title="Tipo de recurso"></select>' +
        '<select id="bt-estado" class="admin-search" title="Estado"><option value="">Todos los estados</option>' + Object.keys(BT_ESTADOS).map(k => '<option value="' + k + '">' + BT_ESTADOS[k].t + '</option>').join('') + '</select>' +
        '<input type="search" id="bt-q" class="admin-search" placeholder="🔎 Recurso, empresa, jefe, fundo, patente…" style="min-width:220px;"></div>' +
      '<div class="pat-toolbar-right" style="display:flex;gap:8px;align-items:center;"><span class="turnos-estado" id="bt-estado-txt">—</span>' +
        '<button class="turnos-btn" id="bt-recargar" title="Volver a leer">🔄</button><button class="turnos-btn" id="bt-excel" title="Excel con 2 hojas: Aperturas y Personal">⬇️ Excel</button></div></div>' +
      '<div id="bt-kpis" class="bt-kpis"></div><div class="gr-cuerpo" id="bt-cuerpo" style="overflow:auto;"><div class="tb-vacio">Cargando…</div></div>';
    const $b = id => document.getElementById(id);
    $b('bt-desde').value = s.desde; $b('bt-hasta').value = s.hasta;
    $b('bt-desde').onchange = e => { s.desde = e.target.value || btDiaISO_(-6); if (s.hasta < s.desde) { s.hasta = s.desde; $b('bt-hasta').value = s.hasta; } cargarBitacoraWeb_(); };
    $b('bt-hasta').onchange = e => { s.hasta = e.target.value || btDiaISO_(0); if (s.hasta < s.desde) { s.desde = s.hasta; $b('bt-desde').value = s.desde; } cargarBitacoraWeb_(); };
    $b('bt-area').onchange = e => { s.area = e.target.value; renderBitacoraWeb_(); };
    $b('bt-tipo').onchange = e => { s.tipo = e.target.value; renderBitacoraWeb_(); };
    $b('bt-estado').onchange = e => { s.estado = e.target.value; renderBitacoraWeb_(); };
    let esp = null;
    $b('bt-q').oninput = e => { clearTimeout(esp); esp = setTimeout(() => { s.q = e.target.value; renderBitacoraWeb_(); }, 250); };
    $b('bt-recargar').onclick = () => cargarBitacoraWeb_();
    $b('bt-excel').onclick = () => descargarBitacoraExcel_();
    $b('bt-cuerpo').addEventListener('click', e => {
      const f = e.target.closest('[data-bt-fila]'); if (!f) return;
      s.abierta = s.abierta === f.dataset.btFila ? '' : f.dataset.btFila; renderBitacoraWeb_();
    });
  }
  if (!s.cargado) await cargarBitacoraWeb_(); else renderBitacoraWeb_();
}

async function cargarBitacoraWeb_() {
  const s = state.bt, est = document.getElementById('bt-estado-txt'), cu = document.getElementById('bt-cuerpo');
  if (est) est.textContent = 'Cargando…';
  try {
    const filas = [];
    for (let d = 0; ; d += 1000) {
      const { data, error } = await supabaseClient.from('v_bit_jornadas').select('*')
        .gte('fecha_operativa', s.desde).lte('fecha_operativa', s.hasta)
        .order('fecha_operativa', { ascending: false }).order('area').order('clave_radial').range(d, d + 999);
      if (error) throw error;
      filas.push(...(data || []));
      if (!data || data.length < 1000) break;
    }
    s.filas = filas; s.cargado = true;
  } catch (e) {
    s.filas = []; s.cargado = false;
    const m = (e && e.message) || String(e);
    if (cu) cu.innerHTML = '<div class="tb-vacio">' + escapeHtml_(/v_bit_jornadas|does not exist|schema cache/i.test(m) ? 'La base aún no tiene la Bitácora (SQL 183).' : 'No se pudieron leer las aperturas: ' + m) + '</div>';
    if (est) est.textContent = '⚠️ Error';
    return;
  }
  renderBitacoraWeb_();
}

function btFiltradas_() {
  const s = state.bt, q = normalizarBusqueda_(s.q || '');
  return s.filas.filter(j => (!s.area || areaClave_(j.area) === areaClave_(s.area)) && (!s.tipo || j.tipo_codigo === s.tipo) &&
    (!s.estado || btEstado_(j) === s.estado) &&
    (!q || normalizarBusqueda_([j.clave_radial, j.codigo_ref, j.empresa, j.area, j.jefe_nombre, j.fundo_nombre, j.cod_fundo, j.patente, j.observacion,
      (j.dotacion || []).map(p => p.nombre + ' ' + (p.rut || '')).join(' ')].join(' ')).includes(q)));
}
function btOpciones_(sel, valores, todos, actual) {
  const el = document.getElementById(sel); if (!el) return;
  el.innerHTML = '<option value="">' + todos + '</option>' + valores.map(v => '<option value="' + escapeHtml_(v[0]) + '"' + (v[0] === actual ? ' selected' : '') + '>' + escapeHtml_(v[1]) + '</option>').join('');
}

function renderBitacoraWeb_() {
  const s = state.bt, cu = document.getElementById('bt-cuerpo'); if (!cu) return;
  const areas = [...new Set(s.filas.map(j => j.area).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
  if (s.area && !areas.some(a => areaClave_(a) === areaClave_(s.area))) s.area = '';
  btOpciones_('bt-area', areas.map(a => [a, a]), 'Todas las áreas', s.area);
  const tipos = [...new Set(s.filas.map(j => j.tipo_codigo).filter(Boolean))];
  btOpciones_('bt-tipo', tipos.map(t => [t, BT_TIPOS[t] || t]), 'Todos los tipos', s.tipo);
  const l = btFiltradas_();
  const serv = l.filter(j => j.en_servicio), conAv = serv.filter(j => j.avance_pct != null);
  const kpi = (n, t, c) => '<div class="bt-kpi" style="--c:' + c + '"><b>' + n + '</b><span>' + t + '</span></div>';
  document.getElementById('bt-kpis').innerHTML =
    kpi(l.length, 'Aperturas', '#0F766E') + kpi(serv.length, 'En servicio', '#15803D') +
    kpi(serv.filter(j => !j.cerrada).length, 'Abiertas', '#16A34A') + kpi(serv.filter(j => j.cerrada).length, 'Cerradas', '#2563EB') +
    kpi(conAv.length ? Math.round(conAv.reduce((a, j) => a + j.avance_pct, 0) / conAv.length) + ' %' : '—', 'Avance promedio del turno', '#D97706') +
    kpi(serv.filter(j => j.avance_pct >= 100).length, 'Turnos al 100 %', '#16A34A') +
    kpi(serv.reduce((a, j) => a + (j.dotacion_n || 0), 0), 'Personas (fuerza)', '#7C3AED') +
    kpi(serv.reduce((a, j) => a + btReemplazantes_(j).length, 0), 'Reemplazantes', '#B45309');
  const est = document.getElementById('bt-estado-txt');
  if (est) est.textContent = l.length + ' de ' + s.filas.length + ' aperturas · ' + btFecha_(s.desde) + ' → ' + btFecha_(s.hasta);
  if (!l.length) { cu.innerHTML = '<div class="tb-vacio">' + (s.filas.length ? 'Ninguna apertura coincide con los filtros.' : 'No hay aperturas registradas en estas fechas.') + '</div>'; return; }
  const th = ['Fecha', 'Área', 'Recurso', 'Tipo', 'Empresa', 'Estado', 'Turno', 'Actividad general', 'Avance', 'Actividades', 'Fuerza', 'Jefe', 'Reempl.', 'Patente', 'Km', 'Fundo', 'Coordenadas', 'Abrió', 'Cierre'];
  const filas = l.map(j => {
    const e = BT_ESTADOS[btEstado_(j)], jefe = btJefe_(j), ree = btReemplazantes_(j), av = j.avance_pct;
    const avHtml = j.en_servicio && av != null ? '<div class="bt-av"><i style="width:' + av + '%;background:' + (av >= 100 ? '#16A34A' : av >= 50 ? '#D97706' : '#DC2626') + '"></i></div><small>' + av + ' %</small>' : '';
    let h = '<tr data-bt-fila="' + escapeHtml_(j.id) + '" class="bt-fila' + (s.abierta === j.id ? ' on' : '') + '">' +
      '<td class="gr-fijo gr-ro"><b>' + btFecha_(j.fecha_operativa) + '</b></td><td class="gr-ro">' + escapeHtml_(j.area || '') + '</td>' +
      '<td class="gr-ro"><b>' + escapeHtml_(j.clave_radial || '') + '</b><br><small>' + escapeHtml_(j.codigo_ref || '') + '</small></td>' +
      '<td class="gr-ro">' + escapeHtml_(BT_TIPOS[j.tipo_codigo] || j.tipo_recurso || '') + '</td><td class="gr-ro">' + escapeHtml_(j.empresa || '') + '</td>' +
      '<td class="gr-ro"><span class="bt-chip" style="--c:' + e.c + '">' + escapeHtml_(j.en_servicio ? e.t : (j.estado_emoji || '') + ' ' + (j.estado || '')) + '</span></td>' +
      '<td class="gr-ro">' + escapeHtml_(j.turno || '') + (j.tipo_jornada ? '<br><small>' + escapeHtml_(j.tipo_jornada) + '</small>' : '') + '</td>' +
      '<td class="gr-ro">' + escapeHtml_(j.foco || '') + '</td><td class="gr-ro" style="min-width:110px;">' + avHtml + '</td>' +
      '<td class="gr-ro">' + (j.en_servicio ? (j.actividades_n || 0) + ' · ' + btDur_(j.actividades_min) : '') + '</td>' +
      '<td class="gr-ro" style="text-align:center;">' + (j.en_servicio ? '👥 ' + (j.dotacion_n || 0) : '') + '</td>' +
      '<td class="gr-ro">' + escapeHtml_(jefe ? jefe.nombre : (j.jefe_nombre || '')) + (j.jefe_telefono ? '<br><small>' + escapeHtml_(j.jefe_telefono) + '</small>' : '') + '</td>' +
      '<td class="gr-ro" style="text-align:center;">' + (ree.length ? '<span class="bt-chip" style="--c:#B45309">' + ree.length + '</span>' : '') + '</td>' +
      '<td class="gr-ro">' + escapeHtml_(j.patente || '') + (j.cambio_movil ? '<br><small>cambio de móvil</small>' : '') + '</td>' +
      '<td class="gr-ro">' + (j.km_inicio != null ? j.km_inicio + (j.km_fin != null ? ' → ' + j.km_fin : '') : '') + '</td>' +
      '<td class="gr-ro">' + escapeHtml_(j.fundo_nombre || '') + (j.cod_fundo ? ' <small>(' + escapeHtml_(j.cod_fundo) + ')</small>' : '') + '</td>' +
      '<td class="gr-ro"><small>' + (j.lat != null ? escapeHtml_(coordGms_(j.lat, j.lng)) : '') + '</small></td>' +
      '<td class="gr-ro">' + escapeHtml_(j.creado_por_nombre || '') + '<br><small>' + btHora_(j.creado_dispositivo_en || j.creado_en) + '</small></td>' +
      '<td class="gr-ro">' + (j.cierre_en ? '🔒 ' + btHora_(j.cierre_en) + '<br><small>manual</small>' : j.cerrada ? '<small>automático</small>' : (j.en_servicio ? '<small>abierta</small>' : '')) + '</td></tr>';
    if (s.abierta === j.id) {
      h += '<tr class="bt-det"><td colspan="' + th.length + '"><div class="bt-det-in"><b>👥 Dotación (' + (j.dotacion || []).length + ')</b>' +
        ((j.dotacion || []).length ? '<table class="bt-dot"><tr><th>Nombre</th><th>RUT</th><th>Teléfono</th><th>Cargo</th><th></th></tr>' +
          j.dotacion.map(p => '<tr><td>' + (p.es_jefe ? '⭐ ' : '') + escapeHtml_(p.nombre) + '</td><td>' + escapeHtml_(p.rut || '') + '</td><td>' + escapeHtml_(p.telefono || '') + '</td><td>' + escapeHtml_(p.cargo || '') + '</td><td>' +
            (p.es_reemplazo ? '<span class="bt-chip" style="--c:#B45309">Reemplazante</span>' : '') + '</td></tr>').join('') + '</table>' : '<div>Sin personas (no estaba en servicio).</div>') +
        (j.observacion ? '<div style="margin-top:6px;"><b>Observación:</b> ' + escapeHtml_(j.observacion) + '</div>' : '') +
        (j.cierre_observacion ? '<div><b>Observación de cierre:</b> ' + escapeHtml_(j.cierre_observacion) + '</div>' : '') + '</div></td></tr>';
    }
    return h;
  }).join('');
  cu.innerHTML = '<div class="gr-tabla-wrap"><table class="gr-tabla bt-tabla"><thead><tr>' + th.map((t, i) => '<th' + (i === 0 ? ' class="gr-fijo"' : '') + '>' + t + '</th>').join('') + '</tr></thead><tbody>' + filas + '</tbody></table></div>' +
    '<div class="muted" style="font-size:11.5px;margin:6px 2px;">Toca una fila para ver la dotación. Avance = actividades registradas ÷ duración del turno.</div>';
}

/** Excel de 2 hojas con lo filtrado: «Aperturas» (detalle de cada recurso y jornada) y «Personal» (una fila por persona de cada unidad). */
async function descargarBitacoraExcel_() {
  const l = btFiltradas_();
  if (!l.length) return mostrarToast_('No hay aperturas para descargar con estos filtros.');
  let XLSX; try { XLSX = await tbCargarSheetJs_(); } catch (e) { return mostrarToast_(e.message); }
  const aperturas = l.map(j => {
    const jefe = btJefe_(j);
    return {
      'Fecha': btFecha_(j.fecha_operativa), 'Subgerencia': j.subgerencia || '', 'Área': j.area || '',
      'Clave radial': j.clave_radial || '', 'Código': j.codigo_ref || '', 'Tipo': BT_TIPOS[j.tipo_codigo] ? BT_TIPOS[j.tipo_codigo].replace(/^\S+\s/, '') : (j.tipo_recurso || ''),
      'Empresa': j.empresa || '', 'Estado del día': j.estado || '', 'Situación': j.en_servicio ? (j.cerrada ? 'Cerrada' : 'Abierta') : '',
      'Turno': j.turno_codigo ? j.turno_codigo + ' · ' + (j.turno || '') : '', 'Jornada': j.tipo_jornada || '', 'Actividad general': j.foco || '',
      'Avance del turno (%)': j.en_servicio && j.avance_pct != null ? j.avance_pct : '', 'N° actividades': j.en_servicio ? (j.actividades_n || 0) : '',
      'Horas registradas': j.en_servicio ? Math.round((j.actividades_min || 0) / 6) / 10 : '',
      'Registrado hasta': j.actividades_hasta ? btHora_(j.actividades_hasta) : '',
      'Fuerza (personas)': j.dotacion_n || 0, 'Jefe': jefe ? jefe.nombre : (j.jefe_nombre || ''), 'Teléfono jefe': j.jefe_telefono || (jefe && jefe.telefono) || '',
      'Reemplazantes': btReemplazantes_(j).map(p => p.nombre).join(', '),
      'Patente': j.patente || '', 'Cambio de móvil': j.cambio_movil ? 'Sí' : '', 'Km inicial': j.km_inicio != null ? j.km_inicio : '', 'Km final': j.km_fin != null ? j.km_fin : '',
      'Fundo': j.fundo_nombre || '', 'Código fundo': j.cod_fundo || '',
      'Latitud': j.lat != null ? Number(j.lat.toFixed(6)) : '', 'Longitud': j.lng != null ? Number(j.lng.toFixed(6)) : '',
      'Coordenadas (GMS)': j.lat != null ? coordGms_(j.lat, j.lng) : '',
      'Inicio turno': j.inicio_programado ? btHora_(j.inicio_programado) : '', 'Fin turno': j.fin_programado ? btHora_(j.fin_programado) : '',
      'Abrió': j.creado_por_nombre || '', 'Hora apertura': btHora_(j.creado_dispositivo_en || j.creado_en),
      'Cierre': j.cierre_en ? 'Manual ' + btHora_(j.cierre_en) : (j.cerrada ? 'Automático' : ''), 'Cerró': j.cierre_por_nombre || '',
      'Observación': j.observacion || '', 'Observación de cierre': j.cierre_observacion || '', 'Origen': j.origen || ''
    };
  });
  const personal = [];
  l.forEach(j => (j.dotacion || []).forEach(p => personal.push({
    'Fecha': btFecha_(j.fecha_operativa), 'Área': j.area || '', 'Clave radial': j.clave_radial || '', 'Código': j.codigo_ref || '',
    'Tipo': BT_TIPOS[j.tipo_codigo] ? BT_TIPOS[j.tipo_codigo].replace(/^\S+\s/, '') : (j.tipo_recurso || ''), 'Empresa': j.empresa || '',
    'Nombre': p.nombre || '', 'RUT': p.rut || '', 'Teléfono': p.telefono || '', 'Cargo': p.cargo || '',
    'Jefe': p.es_jefe ? 'Sí' : '', 'Reemplazante': p.es_reemplazo ? 'Sí' : '', 'Turno': j.turno || '', 'Fundo': j.fundo_nombre || ''
  })));
  const wb = XLSX.utils.book_new();
  const h1 = XLSX.utils.json_to_sheet(aperturas), h2 = XLSX.utils.json_to_sheet(personal.length ? personal : [{ 'Fecha': '', 'Nombre': 'Sin personal en las aperturas filtradas' }]);
  h1['!cols'] = Object.keys(aperturas[0]).map(k => ({ wch: Math.min(40, Math.max(10, k.length + 2)) }));
  if (personal.length) h2['!cols'] = Object.keys(personal[0]).map(k => ({ wch: Math.min(36, Math.max(10, k.length + 2)) }));
  XLSX.utils.book_append_sheet(wb, h1, 'Aperturas');
  XLSX.utils.book_append_sheet(wb, h2, 'Personal');
  XLSX.writeFile(wb, 'bitacora_aperturas_' + state.bt.desde + '_a_' + state.bt.hasta + '.xlsx');
}
