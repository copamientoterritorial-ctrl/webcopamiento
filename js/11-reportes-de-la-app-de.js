/* ==================== 📱 REPORTES DE LA APP DE PATRULLAJE (Prevención ▾, 18-10-2026, SQL 122) ====================
 * La central revisa los reportes que envían los patrulleros desde app-patrullero/app.html, ve la foto (bucket
 * privado app-fotos, URL firmada), cambia el estado y responde: el patrullero ve estado y respuesta en su app.
 * Lectura: cualquier usuario autenticado (RLS); cambiar estado: Admin + Jefe de Área (política app_rep_gestionar). */
const AR_ESTADOS = {
  enviado:     { t: 'Sin revisar', c: '#1D4ED8', c2: '#DBEAFE', ico: '📨' },
  recibido:    { t: 'Recibido',    c: '#4338CA', c2: '#E0E7FF', ico: '👁️' },
  en_atencion: { t: 'En atención', c: '#C2410C', c2: '#FFEDD5', ico: '🚨' },
  cerrado:     { t: 'Cerrado',     c: '#15803D', c2: '#DCFCE7', ico: '✅' },
};
state.ar = { reportes: [], usuarios: {}, tipos: {}, turnos: [], posTurnos: {}, listeners: false, mapa: null, capa: null, timer: null, encuadrado: false,
             vista: 'vivo', vivo: { turnos: [], puntos: {} }, vivoCapas: {}, vivoEncuadrado: false };

function puedeReportesApp_() { return esAdminOJefe_(); }
function arComuna_(id) { const c = (state.comunas || []).find(x => String(x.id) === String(id)); return c ? c.comuna : ''; }
function arAbierto_(r) { return r.estado !== 'cerrado'; }

async function abrirReportesApp_() {
  if (!state.ar.listeners) {
    state.ar.listeners = true;
    const re = () => renderReportesApp_();
    document.getElementById('ar-periodo').addEventListener('change', () => cargarReportesApp_());
    ['ar-estado', 'ar-comuna', 'ar-tipo'].forEach(id => document.getElementById(id).addEventListener('change', re));
    let t = null;
    document.getElementById('ar-buscar').addEventListener('input', () => { clearTimeout(t); t = setTimeout(re, 200); });
    document.getElementById('ar-descargar').addEventListener('click', descargarReportesApp_);
    document.getElementById('ar-actualizar').addEventListener('click', () => cargarReportesApp_());
    const tabla = document.getElementById('ar-tabla');
    tabla.addEventListener('change', e => {
      const s = e.target.closest('[data-ar-estado]'); if (s) cambiarEstadoReporteApp_(s.dataset.arEstado, s.value, s);
    });
    document.getElementById('ar-vistas').addEventListener('click', e => {
      const b = e.target.closest('[data-ar-vista]'); if (!b || b.dataset.arVista === state.ar.vista) return;
      state.ar.vista = b.dataset.arVista;
      aplicarVistaApp_();
      cargarReportesApp_();
    });
    tabla.addEventListener('click', e => {
      const tv = e.target.closest('tr[data-ar-turno]'); if (tv) { enfocarTurnoApp_(tv.dataset.arTurno); return; }
      const f = e.target.closest('[data-ar-foto]'); if (f) { verFotoReporteApp_(f.dataset.arFoto); return; }
      const b = e.target.closest('[data-ar-resp]'); if (b) { cambiarEstadoReporteApp_(b.dataset.arResp, null, null); return; }
      const fila = e.target.closest('tr[data-ar-id]');
      if (fila && !e.target.closest('select,button,a')) enfocarReporteApp_(fila.dataset.arId);
    });
  }
  aplicarVistaApp_();
  await cargarReportesApp_();
  // Se refresca solo cada 30 s mientras la vista esté abierta
  clearInterval(state.ar.timer);
  state.ar.timer = setInterval(() => {
    if (state.vistaActual === 'appreportes') cargarReportesApp_(true);
    else { clearInterval(state.ar.timer); state.ar.timer = null; }
  }, 30000);
}
function aplicarVistaApp_() {
  const vivo = state.ar.vista === 'vivo';
  document.querySelectorAll('#ar-vistas [data-ar-vista]').forEach(b => b.classList.toggle('on', b.dataset.arVista === state.ar.vista));
  document.getElementById('ar-filtros').style.display = vivo ? 'none' : 'contents';
  document.getElementById('ar-descargar').style.display = vivo ? 'none' : '';
}
function arMapa_() {
  if (!state.ar.mapa) {
    state.ar.mapa = L.map('ar-mapa', { zoomControl: true }).setView([-38.6, -72.5], 8);
    // Mapas base de Esri, como el resto del sistema (los servidores de OpenStreetMap bloquean este uso: error 403)
    const esri = s => 'https://server.arcgisonline.com/ArcGIS/rest/services/' + s + '/MapServer/tile/{z}/{y}/{x}';
    const calles = L.tileLayer(esri('World_Street_Map'), { maxZoom: 19, attribution: 'Tiles &copy; Esri' }).addTo(state.ar.mapa);
    const sat = L.layerGroup([L.tileLayer(esri('World_Imagery'), { maxZoom: 19, attribution: 'Tiles &copy; Esri' }),
                              L.tileLayer(esri('Reference/World_Transportation'), { maxZoom: 19 })]);
    const gris = L.tileLayer(esri('Canvas/World_Light_Gray_Base'), { maxZoom: 16, attribution: 'Tiles &copy; Esri' });
    L.control.layers({ '🗺️ Calles': calles, '🛰️ Satélite': sat, '⬜ Gris': gris }, null, { position: 'topright', collapsed: true }).addTo(state.ar.mapa);
    state.ar.capa = L.layerGroup().addTo(state.ar.mapa);
  }
  setTimeout(() => state.ar.mapa.invalidateSize(), 80);
  return state.ar.mapa;
}

// ── 🛰️ Patrullajes en vivo: turnos activos + los de hoy, con su recorrido
async function cargarVivoApp_(silencioso) {
  if (!silencioso) document.getElementById('ar-estado-txt').textContent = 'Cargando…';
  const hoy0 = new Date(); hoy0.setHours(0, 0, 0, 0);
  const [act, hoy, usr] = await Promise.all([
    supabaseClient.from('app_turnos').select('*').eq('estado', 'activo').limit(500),
    supabaseClient.from('app_turnos').select('*').gte('inicio', hoy0.toISOString()).limit(500),
    supabaseClient.from('app_usuarios').select('id, nombre, telefono, institucion, comuna_id'),
  ]);
  const av = document.getElementById('ar-aviso');
  if (act.error) { av.style.display = ''; av.textContent = '⚠️ ' + act.error.message; document.getElementById('ar-estado-txt').textContent = 'Error'; return; }
  av.style.display = 'none';
  state.ar.usuarios = {}; (usr.data || []).forEach(u => { state.ar.usuarios[u.id] = u; });
  const porId = {}; (act.data || []).concat(hoy.data || []).forEach(t => { porId[t.id] = t; });
  const turnos = Object.values(porId);
  // Recorridos (de a 1.000 puntos)
  const puntos = {};
  const ids = turnos.map(t => t.id);
  for (let i = 0; i < ids.length; i += 60) {
    for (let d = 0; d < 30000; d += 1000) {
      const { data, error } = await supabaseClient.from('app_sesiones_gps').select('turno_id, lat, lng, registrado_en')
        .in('turno_id', ids.slice(i, i + 60)).order('registrado_en', { ascending: true }).range(d, d + 999);
      if (error || !data || !data.length) break;
      data.forEach(p => { (puntos[p.turno_id] = puntos[p.turno_id] || []).push(p); });
      if (data.length < 1000) break;
    }
  }
  const dist = (a, b) => { const r = Math.PI / 180, h = Math.sin((b.lat - a.lat) * r / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin((b.lng - a.lng) * r / 2) ** 2; return 12742 * Math.asin(Math.sqrt(h)); };
  turnos.forEach(t => {
    const ps = puntos[t.id] || [];
    let km = 0;
    for (let i = 1; i < ps.length; i++) {
      const d = dist(ps[i - 1], ps[i]), hrs = (new Date(ps[i].registrado_en) - new Date(ps[i - 1].registrado_en)) / 36e5;
      if (hrs <= 0 || d / hrs <= 200) km += d;
    }
    t._km = t.estado === 'cerrado' && Number(t.km) ? Number(t.km) : km;
    t._ult = ps.length ? ps[ps.length - 1] : null;
    t._min = t._ult ? (Date.now() - new Date(t._ult.registrado_en)) / 60000 : null;
  });
  turnos.sort((a, b) => (a.estado === 'activo' ? 0 : 1) - (b.estado === 'activo' ? 0 : 1) || new Date(b.inicio) - new Date(a.inicio));
  state.ar.vivo = { turnos, puntos };
  renderVivoApp_();
  document.getElementById('ar-estado-txt').textContent = 'En vivo · ' + new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}
function arSenal_(t) {
  if (t.estado !== 'activo') return '<span class="rg-chip" style="background:#F1F5F9;color:#64748B;">⏹ Terminado</span>';
  if (t._min == null) return '<span class="rg-chip" style="background:#FEE2E2;color:#B91C1C;">⚠️ Sin señal</span>';
  const m = Math.round(t._min), txt = m < 1 ? 'ahora' : m < 60 ? 'hace ' + m + ' min' : 'hace ' + Math.floor(m / 60) + ' h';
  const [c, c2] = m <= 5 ? ['#15803D', '#DCFCE7'] : m <= 15 ? ['#B45309', '#FEF3C7'] : ['#B91C1C', '#FEE2E2'];
  return '<span class="rg-chip" style="background:' + c2 + ';color:' + c + ';">● ' + txt + '</span>';
}
function renderVivoApp_() {
  const { turnos, puntos } = state.ar.vivo;
  const activos = turnos.filter(t => t.estado === 'activo');
  const kpi = (n, t, c) => '<div class="gr-kpi" style="--c:' + c + '"><b>' + n + '</b>' + t + '</div>';
  document.getElementById('ar-kpis').innerHTML =
    kpi(activos.length, '🚓 patrullando ahora', '#16A34A') +
    kpi(activos.filter(t => t._min == null || t._min > 15).length, '⚠️ sin señal > 15 min', '#DC2626') +
    kpi(turnos.filter(t => t.estado !== 'activo').length, '⏹ terminados hoy', '#64748B') +
    kpi(turnos.reduce((s, t) => s + (t._km || 0), 0).toFixed(1), 'km recorridos hoy', '#2563EB') +
    kpi(turnos.reduce((s, t) => s + (t.reportes || 0), 0), '📋 reportes en turnos', '#7C3AED');
  const cont = document.getElementById('ar-tabla');
  cont.innerHTML = !turnos.length ? '<div class="tb-vacio">No hay patrullajes hoy. Aparecen aquí apenas un patrullero toca «Iniciar patrullaje» en la app.</div>'
    : '<table class="gr-tabla"><thead><tr><th>Patrullero</th><th>Comuna</th><th>Ruta</th><th>Inicio</th><th>Duración</th><th>Km</th><th>Señal</th></tr></thead><tbody>' +
      turnos.map(t => {
        const u = state.ar.usuarios[t.usuario_id] || {};
        const fin = t.estado === 'activo' ? Date.now() : new Date(t.fin || t.inicio).getTime();
        const min = Math.max(0, Math.round((fin - new Date(t.inicio)) / 60000));
        return '<tr data-ar-turno="' + escapeHtml_(t.id) + '" style="cursor:pointer;" title="Clic para ver el recorrido en el mapa">' +
          '<td><b>' + escapeHtml_(u.nombre || '—') + '</b><br><small>' + escapeHtml_([u.institucion, u.telefono].filter(Boolean).join(' · ')) + '</small></td>' +
          '<td>' + escapeHtml_(arComuna_(t.comuna_id) || '—') + '</td>' +
          '<td>' + escapeHtml_(t.ruta_nombre || 'Patrullaje libre') + '</td>' +
          '<td style="white-space:nowrap;">' + rgFechaHora_(t.inicio) + '</td>' +
          '<td>' + Math.floor(min / 60) + ':' + String(min % 60).padStart(2, '0') + ' h</td>' +
          '<td>' + (t._km || 0).toFixed(1) + '<br><small>' + ((puntos[t.id] || []).length) + ' pts</small></td>' +
          '<td>' + arSenal_(t) + '</td></tr>';
      }).join('') + '</tbody></table>';
  // Mapa: recorridos (terminados atenuados) + 🚓 en la última posición de los activos
  const mapa = arMapa_();
  state.ar.capa.clearLayers();
  state.ar.vivoCapas = {};
  const colores = ['#2563EB', '#16A34A', '#7C3AED', '#EA580C', '#0891B2', '#DB2777', '#CA8A04', '#DC2626'];
  turnos.forEach((t, i) => {
    const ps = puntos[t.id] || [], u = state.ar.usuarios[t.usuario_id] || {}, activo = t.estado === 'activo';
    const g = L.featureGroup().addTo(state.ar.capa);
    if (ps.length > 1) L.polyline(ps.map(p => [p.lat, p.lng]), activo ? { color: colores[i % colores.length], weight: 4, opacity: .9 } : { color: '#64748B', weight: 3, opacity: .5, dashArray: '5 6' })
      .bindPopup('<b>' + escapeHtml_(u.nombre || 'Patrullero') + '</b><br>' + escapeHtml_(t.ruta_nombre || 'Patrullaje libre') + '<br><small>' + (t._km || 0).toFixed(1) + ' km</small>').addTo(g);
    if (activo && t._ult) L.marker([t._ult.lat, t._ult.lng], { icon: L.divIcon({ className: '', html: '<div style="font-size:24px;filter:drop-shadow(0 1px 2px rgba(0,0,0,.45))">🚓</div>', iconSize: [26, 26], iconAnchor: [13, 13] }), zIndexOffset: 500 })
      .bindTooltip(escapeHtml_(u.nombre || 'Patrullero'), { permanent: true, direction: 'top', offset: [0, -12] })
      .bindPopup('<b>🚓 ' + escapeHtml_(u.nombre || 'Patrullero') + '</b><br>' + escapeHtml_([u.institucion, u.telefono].filter(Boolean).join(' · ')) + '<br>' + escapeHtml_(t.ruta_nombre || 'Patrullaje libre') +
        '<br><small>Última señal ' + new Date(t._ult.registrado_en).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }) + ' · ' + (t._km || 0).toFixed(1) + ' km</small>').addTo(g);
    state.ar.vivoCapas[t.id] = g;
  });
  if (!state.ar.vivoEncuadrado && state.ar.capa.getLayers().some(g => g.getLayers().length)) {
    state.ar.vivoEncuadrado = true;
    setTimeout(() => {
      mapa.invalidateSize();
      const b = L.featureGroup(state.ar.capa.getLayers().filter(g => g.getLayers().length)).getBounds();
      if (b.isValid()) mapa.fitBounds(b, { padding: [30, 30], maxZoom: 15 });
    }, 120);
  }
}
function enfocarTurnoApp_(id) {
  const g = state.ar.vivoCapas[id];
  if (!g || !g.getLayers().length) { mostrarToast_('Este patrullaje aún no tiene puntos GPS.'); return; }
  const b = g.getBounds();
  if (b.isValid()) state.ar.mapa.fitBounds(b, { padding: [30, 30], maxZoom: 16 });
  const m = g.getLayers().find(l => l instanceof L.Marker); if (m) m.openPopup();
}

async function cargarReportesApp_(silencioso) {
  if (state.ar.vista === 'vivo') return cargarVivoApp_(silencioso);
  const dias = Number(document.getElementById('ar-periodo').value || 7);
  const desde = new Date(Date.now() - dias * 864e5).toISOString();
  if (!silencioso) document.getElementById('ar-estado-txt').textContent = 'Cargando…';
  const [rep, usr, tip, tur] = await Promise.all([
    supabaseClient.from('app_reportes').select('*').gte('creado_en', desde).order('creado_en', { ascending: false }).limit(3000),
    supabaseClient.from('app_usuarios').select('id, nombre, telefono, institucion, comuna_id'),
    supabaseClient.from('app_tipos_accion').select('id, nombre, icono, color'),
    supabaseClient.from('app_turnos').select('*').eq('estado', 'activo'),
  ]);
  const av = document.getElementById('ar-aviso');
  if (rep.error) {
    av.style.display = '';
    av.textContent = /estado|app_turnos/.test(rep.error.message) ? '⚠️ Falta ejecutar en Supabase el SQL 122 (app_patrullero_v2).' : '⚠️ ' + rep.error.message;
    document.getElementById('ar-tabla').innerHTML = '';
    document.getElementById('ar-estado-txt').textContent = 'Error';
    return;
  }
  av.style.display = 'none';
  const nuevos = state.ar.reportes.length ? (rep.data || []).filter(r => !state.ar.reportes.some(x => x.id === r.id)).length : 0;
  state.ar.reportes = rep.data || [];
  state.ar.usuarios = {}; (usr.data || []).forEach(u => { state.ar.usuarios[u.id] = u; });
  state.ar.tipos = {}; (tip.data || []).forEach(t => { state.ar.tipos[t.id] = t; });
  state.ar.turnos = tur.error ? [] : (tur.data || []);
  // Última posición de cada patrullero en turno (últimas 3 h)
  state.ar.posTurnos = {};
  if (state.ar.turnos.length) {
    const { data: pts } = await supabaseClient.from('app_sesiones_gps').select('turno_id, lat, lng, registrado_en')
      .in('turno_id', state.ar.turnos.map(t => t.id)).gte('registrado_en', new Date(Date.now() - 3 * 36e5).toISOString())
      .order('registrado_en', { ascending: false }).limit(2000);
    (pts || []).forEach(p => { if (!state.ar.posTurnos[p.turno_id]) state.ar.posTurnos[p.turno_id] = p; });
  }
  // Filtros con lo que hay
  const comunas = [...new Set(state.ar.reportes.map(r => r.comuna_id).filter(Boolean))].map(id => [id, arComuna_(id) || id]).sort((a, b) => a[1].localeCompare(b[1], 'es'));
  const selC = document.getElementById('ar-comuna'), vC = selC.value;
  selC.innerHTML = '<option value="">Todas las comunas (' + comunas.length + ')</option>' + comunas.map(([id, n]) => '<option value="' + escapeHtml_(id) + '">' + escapeHtml_(n) + '</option>').join('');
  selC.value = [...selC.options].some(o => o.value === vC) ? vC : '';
  const selT = document.getElementById('ar-tipo'), vT = selT.value;
  const tipos = Object.values(state.ar.tipos).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  selT.innerHTML = '<option value="">Todas las acciones</option>' + tipos.map(t => '<option value="' + escapeHtml_(t.id) + '">' + escapeHtml_((t.icono || '') + ' ' + t.nombre) + '</option>').join('');
  selT.value = [...selT.options].some(o => o.value === vT) ? vT : '';
  renderReportesApp_();
  document.getElementById('ar-estado-txt').textContent = 'Actualizado ' + new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
  if (silencioso && nuevos) mostrarToast_('📱 ' + nuevos + ' reporte(s) nuevo(s) de la app de patrullaje');
}

function arFiltrados_() {
  const fE = document.getElementById('ar-estado').value, fC = document.getElementById('ar-comuna').value, fT = document.getElementById('ar-tipo').value;
  const q = plNorm_(document.getElementById('ar-buscar').value || '');
  return state.ar.reportes.filter(r => {
    if (fE === '__abiertos__' ? !arAbierto_(r) : fE === '__urgentes__' ? !(r.urgencia === 'urgente' && arAbierto_(r)) : (fE && r.estado !== fE)) return false;
    if (fC && String(r.comuna_id) !== fC) return false;
    if (fT && String(r.tipo_accion_id) !== fT) return false;
    if (q) {
      const u = state.ar.usuarios[r.usuario_id] || {}, t = state.ar.tipos[r.tipo_accion_id] || {};
      if (!plNorm_([r.descripcion, u.nombre, u.institucion, u.telefono, t.nombre, arComuna_(r.comuna_id), r.respuesta].join(' ')).includes(q)) return false;
    }
    return true;
  });
}

function renderReportesApp_() {
  const lista = arFiltrados_(), todos = state.ar.reportes;
  const cuenta = k => lista.filter(r => r.estado === k).length;
  const kpi = (n, t, c) => '<div class="gr-kpi" style="--c:' + c + '"><b>' + n + '</b>' + t + '</div>';
  const urg = lista.filter(r => r.urgencia === 'urgente' && arAbierto_(r)).length;
  document.getElementById('ar-kpis').innerHTML =
    kpi(lista.length, 'reportes' + (lista.length !== todos.length ? ' (de ' + todos.length + ')' : ''), '#0F172A') +
    kpi(cuenta('enviado'), '📨 sin revisar', AR_ESTADOS.enviado.c) +
    kpi(cuenta('recibido'), '👁️ recibidos', AR_ESTADOS.recibido.c) +
    kpi(cuenta('en_atencion'), '🚨 en atención', AR_ESTADOS.en_atencion.c) +
    kpi(cuenta('cerrado'), '✅ cerrados', AR_ESTADOS.cerrado.c) +
    kpi(urg, '⚠️ urgentes abiertos', '#DC2626') +
    kpi(state.ar.turnos.length, '🚓 patrullando ahora', '#16A34A');
  const cont = document.getElementById('ar-tabla');
  if (!lista.length) {
    cont.innerHTML = '<div class="tb-vacio">' + (todos.length ? 'No hay reportes con estos filtros.' : 'Aún no hay reportes de la app en este periodo.') + '</div>';
  } else {
    cont.innerHTML = '<table class="gr-tabla"><thead><tr><th>Fecha</th><th>Acción</th><th>Patrullero</th><th>Comuna</th><th>Foto</th><th>Estado</th><th>Respuesta al patrullero</th></tr></thead><tbody>' +
      lista.map(r => {
        const e = AR_ESTADOS[r.estado] || AR_ESTADOS.enviado, t = state.ar.tipos[r.tipo_accion_id] || {}, u = state.ar.usuarios[r.usuario_id] || {};
        const foto = r.foto_path || r.foto_url;
        const alerta = r.urgencia === 'urgente' && arAbierto_(r);
        return '<tr data-ar-id="' + escapeHtml_(r.id) + '" style="cursor:pointer;' + (alerta ? 'background:#FEF2F2;' : '') + '" title="Clic para ver en el mapa">' +
          '<td style="white-space:nowrap;">' + rgFechaHora_(r.creado_en) + '</td>' +
          '<td>' + escapeHtml_(t.icono || '⚠️') + ' <b>' + escapeHtml_(t.nombre || 'Reporte') + '</b>' +
            (r.urgencia === 'urgente' ? ' <span class="rg-chip" style="background:#DC2626;color:#fff;">URGENTE</span>' : '') +
            (r.descripcion ? '<div class="rg-obs">' + escapeHtml_(r.descripcion) + '</div>' : '') + '</td>' +
          '<td>' + escapeHtml_(u.nombre || '—') + '<br><small>' + escapeHtml_([u.institucion, u.telefono].filter(Boolean).join(' · ')) + '</small></td>' +
          '<td>' + escapeHtml_(arComuna_(r.comuna_id) || '—') + '<br><a href="https://maps.google.com/?q=' + Number(r.lat).toFixed(6) + ',' + Number(r.lng).toFixed(6) + '" target="_blank" rel="noopener" style="font-size:11px;">📍 Google Maps</a>' +
            (r.precision_m ? ' <small style="color:var(--text-tertiary);">±' + Math.round(r.precision_m) + ' m</small>' : '') + '</td>' +
          '<td>' + (foto ? '<button class="gr-del" style="width:auto;padding:0 8px;" data-ar-foto="' + escapeHtml_(r.id) + '">📷 Ver</button>' : '<small style="color:var(--text-tertiary);">—</small>') + '</td>' +
          '<td><span class="rg-chip" style="background:' + e.c2 + ';color:' + e.c + ';">' + e.ico + ' ' + e.t + '</span>' +
            (puedeReportesApp_() ? '<div style="margin-top:4px;"><select class="rg-sel" data-ar-estado="' + escapeHtml_(r.id) + '" title="Cambiar estado">' +
              Object.keys(AR_ESTADOS).map(k => '<option value="' + k + '"' + (k === r.estado ? ' selected' : '') + '>' + AR_ESTADOS[k].t + '</option>').join('') + '</select></div>' : '') + '</td>' +
          '<td>' + (r.respuesta ? '<div class="rg-obs">' + escapeHtml_(r.respuesta) + '</div><small style="color:var(--text-tertiary);">' + escapeHtml_(r.atendido_por || '') + (r.actualizado_en ? ' · ' + rgFechaHora_(r.actualizado_en) : '') + '</small>' : '<small style="color:var(--text-tertiary);">Sin respuesta</small>') +
            (puedeReportesApp_() ? '<div><button class="gr-del" style="width:auto;padding:0 8px;margin-top:4px;" data-ar-resp="' + escapeHtml_(r.id) + '">✍️ Responder</button></div>' : '') + '</td>' +
          '</tr>';
      }).join('') + '</tbody></table>';
  }
  renderMapaReportesApp_(lista);
}

function renderMapaReportesApp_(lista) {
  arMapa_();
  state.ar.capa.clearLayers();
  state.ar.marcadores = {};
  lista.forEach(r => {
    if (r.lat == null || r.lng == null) return;
    const e = AR_ESTADOS[r.estado] || AR_ESTADOS.enviado, t = state.ar.tipos[r.tipo_accion_id] || {}, u = state.ar.usuarios[r.usuario_id] || {};
    const m = L.circleMarker([r.lat, r.lng], { radius: r.urgencia === 'urgente' ? 10 : 7, color: '#fff', weight: 2, fillColor: e.c, fillOpacity: .9 })
      .bindPopup('<b>' + escapeHtml_((t.icono || '⚠️') + ' ' + (t.nombre || 'Reporte')) + '</b>' + (r.urgencia === 'urgente' ? ' · <b style="color:#DC2626">URGENTE</b>' : '') +
        '<br>' + escapeHtml_(r.descripcion || '') + '<br><small>' + escapeHtml_(u.nombre || '') + ' · ' + rgFechaHora_(r.creado_en) + '<br>' + e.ico + ' ' + e.t + '</small>')
      .addTo(state.ar.capa);
    state.ar.marcadores[r.id] = m;
  });
  // Patrulleros en turno: última posición conocida
  state.ar.turnos.forEach(tu => {
    const p = state.ar.posTurnos[tu.id]; if (!p) return;
    const u = state.ar.usuarios[tu.usuario_id] || {};
    L.marker([p.lat, p.lng], { icon: L.divIcon({ className: '', html: '<div style="font-size:22px;filter:drop-shadow(0 1px 2px rgba(0,0,0,.4))">🚓</div>', iconSize: [24, 24], iconAnchor: [12, 12] }), zIndexOffset: 500 })
      .bindPopup('<b>🚓 ' + escapeHtml_(u.nombre || 'Patrullero') + '</b><br>' + escapeHtml_(tu.ruta_nombre || 'Patrullaje libre') +
        '<br><small>En turno desde ' + rgFechaHora_(tu.inicio) + ' · última posición ' + new Date(p.registrado_en).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }) + '</small>')
      .addTo(state.ar.capa);
  });
  // Encuadre inicial, después de que el mapa toma su tamaño real
  if (!state.ar.encuadrado && state.ar.capa.getLayers().length) {
    state.ar.encuadrado = true;
    setTimeout(() => {
      state.ar.mapa.invalidateSize();
      const b = L.featureGroup(state.ar.capa.getLayers()).getBounds();
      if (b.isValid()) state.ar.mapa.fitBounds(b, { padding: [30, 30], maxZoom: 14 });
    }, 120);
  }
}

function enfocarReporteApp_(id) {
  const m = state.ar.marcadores && state.ar.marcadores[id];
  if (!m) return;
  state.ar.mapa.setView(m.getLatLng(), Math.max(state.ar.mapa.getZoom(), 14));
  m.openPopup();
}

async function verFotoReporteApp_(id) {
  const r = state.ar.reportes.find(x => x.id === id); if (!r) return;
  let url = r.foto_url || null;
  if (r.foto_path) {
    const { data, error } = await supabaseClient.storage.from('app-fotos').createSignedUrl(r.foto_path, 3600);
    if (error) { mostrarToast_('No se pudo abrir la foto: ' + error.message); return; }
    url = data.signedUrl;
  }
  if (url) window.open(url, '_blank', 'noopener');
}

async function cambiarEstadoReporteApp_(id, estado, sel) {
  const r = state.ar.reportes.find(x => x.id === id); if (!r) return;
  const nuevo = estado || r.estado;
  const resp = prompt((estado ? 'Cambiar el reporte a «' + AR_ESTADOS[nuevo].t + '».' : 'Respuesta al patrullero.') +
    '\n\nMensaje para el patrullero (lo verá en su app; opcional al cambiar de estado):', estado ? '' : (r.respuesta || ''));
  if (resp === null) { if (sel) sel.value = r.estado; return; }
  if (!estado && !resp.trim()) return;
  const cambios = { estado: nuevo, atendido_por: state.perfil.nombre_completo || null, actualizado_en: new Date().toISOString() };
  if (resp.trim()) cambios.respuesta = resp.trim();
  const { error } = await supabaseClient.from('app_reportes').update(cambios).eq('id', id);
  if (error) { mostrarToast_('No se pudo guardar: ' + error.message); if (sel) sel.value = r.estado; return; }
  mostrarToast_('✅ Reporte actualizado · ' + AR_ESTADOS[nuevo].t);
  await cargarReportesApp_(true);
}

async function descargarReportesApp_() {
  const lista = arFiltrados_();
  if (!lista.length) { mostrarToast_('No hay reportes para descargar con estos filtros.'); return; }
  try {
    mostrarToast_('Generando Excel…');
    const XLSX = await tbCargarSheetJs_();
    const filas = lista.map(r => {
      const t = state.ar.tipos[r.tipo_accion_id] || {}, u = state.ar.usuarios[r.usuario_id] || {};
      return {
        'Fecha': rgFechaHora_(r.creado_en), 'Acción': t.nombre || '', 'Urgencia': r.urgencia === 'urgente' ? 'Urgente' : 'Normal',
        'Descripción': r.descripcion || '', 'Patrullero': u.nombre || '', 'Institución': u.institucion || '', 'Teléfono': u.telefono || '',
        'Comuna': arComuna_(r.comuna_id), 'Estado': (AR_ESTADOS[r.estado] || AR_ESTADOS.enviado).t, 'Respuesta': r.respuesta || '',
        'Atendido por': r.atendido_por || '', 'Con foto': (r.foto_path || r.foto_url) ? 'Sí' : 'No',
        'Latitud': Number(r.lat), 'Longitud': Number(r.lng), 'Precisión (m)': r.precision_m != null ? Math.round(r.precision_m) : '',
      };
    });
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(filas);
    ws['!cols'] = Object.keys(filas[0]).map(k => ({ wch: ['Descripción', 'Respuesta'].includes(k) ? 50 : 16 }));
    XLSX.utils.book_append_sheet(wb, ws, 'Reportes app');
    XLSX.writeFile(wb, 'reportes_app_patrullaje_' + tbHoyISO_() + '.xlsx');
    mostrarToast_('✅ Descargado: ' + filas.length + ' reportes.');
  } catch (e) { mostrarToast_('No se pudo generar el Excel: ' + (e.message || e)); }
}

/* ==================== MÓDULO GESTIÓN DE PATRULLAJES (mapa exclusivo) ==================== */
let patMap = null, patRutasLayer = null;
state.patRutas = [];
state.patRutaSel = null;
state.patSeleccion = {};
window.patRutaCapas = {};

function initPatMap_() {
  if (patMap) { setTimeout(() => patMap.invalidateSize(), 60); return; }
  patMap = L.map('pat-map', { zoomControl: true, attributionControl: false }).setView([-38.4, -72.4], 8);
  L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}', { maxZoom: 16, attribution: 'Tiles &copy; Esri' }).addTo(patMap);
  patRutasLayer = L.layerGroup().addTo(patMap);
}

/* ==================== 👤 GESTOR DE RELACIONAMIENTO POR RUTA SIGEI (19-10-2026, SQL 128) ====================
 * Catálogo codificado (GR-001…) en gestores_relacionamiento y relación ruta → gestor en ruta_gestor. Se asigna ruta a ruta
 * desde el panel lateral o en bloque con la planilla Excel codificada (👥 Gestores › descargar / cargar).
 * Escriben Administrador y Jefe de Área; los demás solo ven. */
state.gest = { lista: null, porRuta: {}, sinSql: false };
function puedeGestionarGestores_() { return esAdminOJefe_(); }
async function cargarGestoresRutas_(forzar) {
  if (state.gest.lista && !forzar) return;
  const [g, rg] = await Promise.all([
    supabaseClient.from('gestores_relacionamiento').select('*').order('codigo'),
    supabaseClient.from('ruta_gestor').select('ruta_id, gestor_id'),
  ]);
  if (g.error) { state.gest = { lista: [], porRuta: {}, sinSql: /gestores_relacionamiento/.test(g.error.message) }; return; }
  state.gest.sinSql = false;
  state.gest.lista = g.data || [];
  state.gest.porRuta = {}; (rg.data || []).forEach(x => { state.gest.porRuta[String(x.ruta_id)] = x.gestor_id; });
}
function gestorPorId_(id) { return (state.gest.lista || []).find(g => g.id === id) || null; }
async function renderGestorRutaPat_(ruta) {
  const cont = document.getElementById('pat-gestor'); if (!cont) return;
  await cargarGestoresRutas_();
  if (state.patRutaSel !== ruta) return;   // el usuario ya eligió otra ruta
  if (state.gest.sinSql) { cont.innerHTML = '<span class="gris">👤 Gestor: falta ejecutar el SQL 128.</span>'; return; }
  const id = state.gest.porRuta[String(ruta.id_ruta)] || null, g = gestorPorId_(id);
  if (!puedeGestionarGestores_()) {
    cont.innerHTML = '👤 <b>Gestor:</b> ' + (g ? escapeHtml_(g.codigo + ' · ' + g.nombre) : '<span class="gris">sin asignar</span>');
    pintarTurnoGestorRuta_(ruta, id);
    return;
  }
  cont.innerHTML = '<label>👤 <b>Gestor de relacionamiento</b></label><select id="pat-gestor-sel" class="admin-search" style="width:100%;min-width:0;">' +
    '<option value="">— Sin gestor —</option>' + (state.gest.lista || []).filter(x => x.activo || x.id === id).map(x =>
      '<option value="' + x.id + '"' + (x.id === id ? ' selected' : '') + '>' + escapeHtml_(x.codigo + ' · ' + x.nombre + (x.area ? ' (' + aTitulo_(x.area) + ')' : '')) + '</option>').join('') + '</select>';
  document.getElementById('pat-gestor-sel').onchange = async e => {
    const nuevo = e.target.value ? Number(e.target.value) : null;
    const res = nuevo
      ? await supabaseClient.from('ruta_gestor').upsert({ ruta_id: ruta.id_ruta, gestor_id: nuevo }, { onConflict: 'ruta_id' })
      : await supabaseClient.from('ruta_gestor').delete().eq('ruta_id', ruta.id_ruta);
    if (res.error) { mostrarToast_('No se pudo guardar el gestor: ' + res.error.message); e.target.value = id || ''; return; }
    if (nuevo) state.gest.porRuta[String(ruta.id_ruta)] = nuevo; else delete state.gest.porRuta[String(ruta.id_ruta)];
    const ng = gestorPorId_(nuevo);
    mostrarToast_(ng ? '👤 ' + ng.nombre + ' asignado a la ruta' : 'Gestor quitado de la ruta');
    poblarFiltroGestorPat_(); dibujarRutasPat_();   // color / leyenda por gestor al día
    pintarTurnoGestorRuta_(ruta, nuevo);
  };
  pintarTurnoGestorRuta_(ruta, id);
}
/** Turno del gestor de la ruta en la fecha de la jornada (SQL 134), bajo su nombre en el panel de la ruta. */
async function pintarTurnoGestorRuta_(ruta, gid) {
  const cont = document.getElementById('pat-gestor'); if (!cont) return;
  let el = document.getElementById('pat-gestor-turno');
  if (!el) { el = document.createElement('div'); el.id = 'pat-gestor-turno'; el.style.cssText = 'font-size:11.5px;margin-top:4px;color:var(--text-secondary);'; cont.appendChild(el); }
  if (!gid) { el.textContent = ''; return; }
  const fecha = document.getElementById('pat-fecha').value || hoyISO_();
  const { data, error } = await supabaseClient.from('gestor_turnos').select('estado, horario').eq('gestor_id', gid).eq('fecha', fecha).maybeSingle();
  if (state.patRutaSel !== ruta) return;
  if (error) { el.textContent = ''; return; }
  const e = data && TG_ESTADOS[data.estado];
  el.innerHTML = '📅 ' + fecha.split('-').reverse().join('-') + ': ' + (e ? '<b style="color:' + (data.estado === 'turno' ? '#15803D' : '#475569') + '">' + e.t + (data.horario ? ' · ' + escapeHtml_(data.horario) : '') + '</b>' : '<span class="gris">sin turno programado</span>');
}

// ── Catálogo + planilla codificada (2 hojas: Gestores y Rutas, con su ID) para asignar en bloque
const GEST_COLS = [['codigo', 'Código gestor'], ['nombre', 'Nombre'], ['rut', 'RUT'], ['telefono', 'Teléfono'], ['correo', 'Correo'], ['area', 'Área'], ['activo', 'Activo (SI/NO)']];
const GEST_RUTA_COLS = [['ruta_id', 'ID ruta (no modificar)'], ['nombre_ruta', 'Nombre ruta'], ['subgerencia', 'Subgerencia'], ['area', 'Área'], ['comuna', 'Comuna'], ['km', 'Km'], ['codigo_gestor', 'Código gestor'], ['nombre_gestor', 'Nombre gestor (referencia)']];
async function abrirModalGestores_() {
  await cargarGestoresRutas_(true);
  if (state.gest.sinSql) { mostrarToast_('Falta ejecutar en Supabase el SQL 128 (gestores de rutas SIGEI).'); return; }
  const cuenta = {}; Object.values(state.gest.porRuta).forEach(id => { cuenta[id] = (cuenta[id] || 0) + 1; });
  document.querySelectorAll('.gest-modal').forEach(o => o.remove());
  const o = document.createElement('div'); o.className = 'br-modal-overlay gest-modal';
  o.innerHTML = '<div class="br-modal" style="width:min(720px,95vw);padding:18px 20px;max-height:88vh;overflow:auto;">' +
    '<h3 style="margin:0 0 4px;">👥 Gestores de relacionamiento</h3>' +
    '<p style="font-size:12.5px;color:var(--text-secondary);margin:0 0 12px;">Cada ruta SIGEI puede tener un gestor. Asígnalo ruta a ruta en el panel lateral, o en bloque con la planilla codificada: ' +
    'descárgala, completa la hoja <b>Gestores</b> (uno por fila, con su código) y en la hoja <b>Rutas</b> escribe el código del gestor de cada ruta; luego cárgala.</p>' +
    '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;">' +
      '<button class="btn-primary" data-g="bajar" style="flex:none;padding:9px 14px;">⬇️ Descargar planilla codificada</button>' +
      '<button class="btn-secondary" data-g="subir" style="flex:none;padding:9px 14px;">⬆️ Cargar planilla completada</button>' +
      '<input type="file" accept=".xlsx,.xls" data-g="archivo" style="display:none;">' +
      '<button class="btn-secondary" data-g="cerrar" style="flex:none;padding:9px 14px;margin-left:auto;">Cerrar</button></div>' +
    '<div data-g="resultado"></div>' +
    '<table class="admin-table"><thead><tr><th>Código</th><th>Nombre</th><th>Área</th><th>Contacto</th><th style="text-align:right;">Rutas</th></tr></thead><tbody>' +
      ((state.gest.lista || []).map(g => '<tr style="' + (g.activo ? '' : 'opacity:.5') + '"><td><b>' + escapeHtml_(g.codigo) + '</b></td><td>' + escapeHtml_(g.nombre) + (g.perfil_id ? ' <span title="Tiene usuario en el sistema">🔑</span>' : '') + '</td>' +
        '<td>' + escapeHtml_(g.area ? aTitulo_(g.area) : '—') + '</td><td style="font-size:11.5px;">' + escapeHtml_([g.telefono, g.correo].filter(Boolean).join(' · ') || '—') + '</td>' +
        '<td style="text-align:right;">' + (cuenta[g.id] || 0) + '</td></tr>').join('') || '<tr><td colspan="5" style="color:var(--text-tertiary);">Aún no hay gestores. Descarga la planilla y complétala.</td></tr>') +
    '</tbody></table></div>';
  document.body.appendChild(o);
  const q = k => o.querySelector('[data-g="' + k + '"]');
  o.addEventListener('click', e => { if (e.target === o) o.remove(); });
  q('cerrar').onclick = () => o.remove();
  q('bajar').onclick = descargarPlanillaGestores_;
  q('subir').onclick = () => q('archivo').click();
  q('archivo').onchange = async ev => { const f = ev.target.files && ev.target.files[0]; if (f) await cargarPlanillaGestores_(f, q('resultado')); ev.target.value = ''; };
}
async function descargarPlanillaGestores_() {
  try {
    mostrarToast_('Generando planilla…');
    const XLSX = await tbCargarSheetJs_();
    const rutas = [];
    for (let d = 0; ; d += 1000) {
      const { data, error } = await supabaseClient.from('v_rutas_patrullaje').select('id, nombre_ruta, subgerencia, area, comuna, km').order('area').order('nombre_ruta').range(d, d + 999);
      if (error) throw error;
      rutas.push(...(data || [])); if (!data || data.length < 1000) break;
    }
    const wb = XLSX.utils.book_new();
    const instr = [['PLANILLA CODIFICADA · GESTORES DE RELACIONAMIENTO POR RUTA SIGEI'], [''],
      ['1. Hoja «Gestores»: un gestor por fila. «Código gestor» es su clave (ej. GR-005): no la repitas. Activo = SI o NO.'],
      ['2. Hoja «Rutas»: NO modifiques «ID ruta». En «Código gestor» escribe el código del gestor de esa ruta (vacío = sin gestor).'],
      ['3. «Nombre gestor» es solo referencia: el sistema usa el código.'],
      ['4. Guarda el archivo y cárgalo en Gestión Patrullajes SIGEI › 👥 Gestores › ⬆️ Cargar planilla completada.'],
      [''], ['Generada el ' + new Date().toLocaleString('es-CL') + ' · ' + rutas.length + ' rutas · ' + (state.gest.lista || []).length + ' gestores']];
    const wsI = XLSX.utils.aoa_to_sheet(instr); wsI['!cols'] = [{ wch: 120 }];
    XLSX.utils.book_append_sheet(wb, wsI, 'Instrucciones');
    const gest = (state.gest.lista || []).map(g => Object.fromEntries(GEST_COLS.map(([k, t]) => [t, k === 'activo' ? (g.activo ? 'SI' : 'NO') : (g[k] || '')])));
    const wsG = XLSX.utils.json_to_sheet(gest.length ? gest : [Object.fromEntries(GEST_COLS.map(([, t]) => [t, '']))], { header: GEST_COLS.map(c => c[1]) });
    wsG['!cols'] = GEST_COLS.map(([k]) => ({ wch: k === 'nombre' || k === 'correo' ? 30 : 16 }));
    XLSX.utils.book_append_sheet(wb, wsG, 'Gestores');
    const filas = rutas.map(r => { const g = gestorPorId_(state.gest.porRuta[String(r.id)]);
      return { 'ID ruta (no modificar)': r.id, 'Nombre ruta': r.nombre_ruta || '', 'Subgerencia': r.subgerencia || '', 'Área': r.area || '', 'Comuna': r.comuna || '',
               'Km': r.km != null ? Number(r.km) : '', 'Código gestor': g ? g.codigo : '', 'Nombre gestor (referencia)': g ? g.nombre : '' }; });
    const wsR = XLSX.utils.json_to_sheet(filas, { header: GEST_RUTA_COLS.map(c => c[1]) });
    wsR['!cols'] = [{ wch: 38 }, { wch: 34 }, { wch: 12 }, { wch: 18 }, { wch: 18 }, { wch: 8 }, { wch: 14 }, { wch: 30 }];
    XLSX.utils.book_append_sheet(wb, wsR, 'Rutas');
    XLSX.writeFile(wb, 'gestores_rutas_sigei_' + tbHoyISO_() + '.xlsx');
    mostrarToast_('✅ Planilla descargada: ' + rutas.length + ' rutas.');
  } catch (e) { mostrarToast_('No se pudo generar la planilla: ' + (e.message || e)); }
}
async function cargarPlanillaGestores_(archivo, resultado) {
  try {
    const XLSX = await tbCargarSheetJs_();
    const wb = XLSX.read(await archivo.arrayBuffer(), { type: 'array' });
    const hoja = n => { const k = wb.SheetNames.find(s => normalizarBusqueda_(s) === normalizarBusqueda_(n)); return k ? XLSX.utils.sheet_to_json(wb.Sheets[k], { defval: '' }) : null; };
    const hg = hoja('Gestores'), hr = hoja('Rutas');
    if (!hg || !hr) { resultado.innerHTML = '<div class="gr-aviso">La planilla debe tener las hojas «Gestores» y «Rutas» (usa la planilla descargada).</div>'; return; }
    const col = (fila, t) => { const k = Object.keys(fila).find(x => normalizarBusqueda_(x) === normalizarBusqueda_(t)); return k ? String(fila[k]).trim() : ''; };
    const gestores = hg.map(f => ({ codigo: col(f, 'Código gestor'), nombre: col(f, 'Nombre'), rut: col(f, 'RUT'), telefono: col(f, 'Teléfono'),
      correo: col(f, 'Correo'), area: col(f, 'Área'), activo: !/^n/i.test(col(f, 'Activo (SI/NO)')) })).filter(g => g.codigo || g.nombre);
    const asignaciones = hr.map(f => ({ ruta_id: col(f, 'ID ruta (no modificar)'), codigo_gestor: col(f, 'Código gestor') })).filter(a => a.ruta_id);
    const conGestor = asignaciones.filter(a => a.codigo_gestor).length;
    if (!confirm('Cargar la planilla:\n\n· ' + gestores.length + ' gestor(es) (alta o actualización por código)\n· ' + asignaciones.length + ' ruta(s): ' + conGestor +
      ' con gestor y ' + (asignaciones.length - conGestor) + ' sin gestor\n\n¿Continuar?')) return;
    resultado.innerHTML = '<div class="tb-vacio">Cargando…</div>';
    const { data, error } = await supabaseClient.rpc('cargar_gestores_rutas', { p_gestores: gestores, p_asignaciones: asignaciones });
    if (error) { resultado.innerHTML = '<div class="gr-aviso">⚠️ ' + escapeHtml_(error.message) + '</div>'; return; }
    const errs = (data && data.errores) || [];
    await cargarGestoresRutas_(true);
    resultado.innerHTML = '<div class="gr-aviso" style="background:#DCFCE7;border-color:#16A34A;color:#166534;">✅ ' + (data.gestores || 0) + ' gestor(es) guardados · ' +
      (data.asignadas || 0) + ' ruta(s) asignadas · ' + (data.quitadas || 0) + ' sin gestor' + (errs.length ? ' · ⚠️ ' + errs.length + ' fila(s) con error' : '') + '</div>' +
      (errs.length ? '<div style="font-size:11.5px;max-height:140px;overflow:auto;margin:6px 0 10px;">' + errs.slice(0, 50).map(x => '• ' + escapeHtml_(x.error + ' — ' + JSON.stringify(x.fila))).join('<br>') + '</div>' : '');
    if (state.patRutaSel) renderGestorRutaPat_(state.patRutaSel);
  } catch (e) { resultado.innerHTML = '<div class="gr-aviso">No se pudo leer la planilla: ' + escapeHtml_(e.message || String(e)) + '</div>'; }
}

async function abrirGestionPatrullajes_() {
  initPatMap_();
  const bG = document.getElementById('pat-gestores');
  if (bG) { bG.style.display = puedeGestionarGestores_() ? '' : 'none'; bG.onclick = abrirModalGestores_; }
  // Fecha por defecto: hoy
  const fInput = document.getElementById('pat-fecha');
  if (!fInput.value) fInput.value = hoyISO_();
  // Poblar filtros comuna/área (según perfil)
  poblarFiltrosPatrullaje_();
  await cargarRutasPatMap_();
}

function poblarFiltrosPatrullaje_() {
  const selC = document.getElementById('pat-comuna');
  const selA = document.getElementById('pat-area');
  if (selC.options.length <= 1) {
    const comunas = (state.perfil.perfil === 'Administrador') ? state.comunas : comunasSeleccionablesUsuario_();
    comunas.slice().sort((a,b)=>a.comuna.localeCompare(b.comuna)).forEach(c => { const o=document.createElement('option'); o.value=c.id_comuna; o.textContent=c.comuna; selC.appendChild(o); });
  }
  if (selA.options.length <= 1 && state.areasCatalogo) {
    // Áreas desde las rutas cargadas se rellenan tras cargar; aquí dejamos base
  }
  selC.onchange = cargarRutasPatMap_;
  selA.onchange = () => dibujarRutasPat_();
  document.getElementById('pat-fecha').onchange = cargarRutasPatMap_;
  document.getElementById('pat-gestor-filtro').onchange = () => dibujarRutasPat_();
  document.getElementById('pat-color').onchange = () => dibujarRutasPat_();
}

/* Rutas SIGEI por gestor de relacionamiento (20-10-2026): un color fijo por gestor (orden del código), filtro y leyenda. */
const PAT_COLORES_GESTOR = ['#2563EB', '#DC2626', '#16A34A', '#9333EA', '#EA580C', '#0891B2', '#CA8A04', '#DB2777', '#4F46E5', '#059669', '#B45309', '#7C3AED', '#0D9488', '#BE123C'];
function colorGestorPat_(gid) {
  const lista = (state.gest.lista || []).slice().sort((a, b) => String(a.codigo).localeCompare(String(b.codigo)));
  const i = lista.findIndex(g => g.id === gid);
  return i < 0 ? '#94A3B8' : PAT_COLORES_GESTOR[i % PAT_COLORES_GESTOR.length];
}
function poblarFiltroGestorPat_() {
  const sel = document.getElementById('pat-gestor-filtro'); if (!sel) return;
  const val = sel.value, cuenta = {};
  (state.patRutas || []).forEach(r => { const g = state.gest.porRuta[String(r.id_ruta)] || 0; cuenta[g] = (cuenta[g] || 0) + 1; });
  sel.innerHTML = '<option value="">Todos los gestores</option><option value="0">— Sin gestor (' + (cuenta[0] || 0) + ')</option>' +
    (state.gest.lista || []).filter(g => cuenta[g.id]).map(g => '<option value="' + g.id + '">' + escapeHtml_(g.codigo + ' · ' + g.nombre + ' (' + cuenta[g.id] + ')') + '</option>').join('');
  sel.value = [...sel.options].some(o => o.value === val) ? val : '';
}

async function cargarRutasPatMap_() {
  if (!patMap) return;
  const fecha = document.getElementById('pat-fecha').value || hoyISO_();
  // Trae todas las rutas visibles al perfil con su estado de asignación en la fecha
  const { data, error } = await supabaseClient.from('v_rutas_asignacion')
    .select('id_ruta, nombre_ruta, subgerencia, area, id_area, comuna, id_comuna, zona_alerta, km, geometry, fecha_patrullaje, n_patrulleros')
    .or('fecha_patrullaje.eq.' + fecha + ',fecha_patrullaje.is.null');
  if (error) { mostrarToast_('Error: ' + error.message); return; }
  // Filtrar por perfil (comunas del usuario) igual que la capa de patrullaje
  let rutas = filtrarRutasPorPerfil_((data || []).map(r => ({ ...r, id: r.id_ruta, comuna_slug: null })));
  // Consolidar por ruta (asignada en la fecha)
  const porRuta = {};
  (data || []).forEach(r => { if (!porRuta[r.id_ruta]) porRuta[r.id_ruta] = { ...r, n: 0 }; if (r.fecha_patrullaje === fecha && r.n_patrulleros > 0) porRuta[r.id_ruta].n = r.n_patrulleros; });
  state.patRutas = Object.values(porRuta);
  // Poblar áreas del filtro con las presentes
  const selA = document.getElementById('pat-area');
  const areasPresentes = [...new Set(state.patRutas.map(r => r.area).filter(Boolean))].sort();
  const valA = selA.value;
  selA.innerHTML = '<option value="">Todas las áreas</option>' + areasPresentes.map(a => '<option>' + escapeHtml_(a) + '</option>').join('');
  selA.value = valA;
  await cargarGestoresRutas_();   // gestor de cada ruta (SQL 128): filtro, color y leyenda
  poblarFiltroGestorPat_();
  dibujarRutasPat_();
}

function dibujarRutasPat_() {
  if (!patRutasLayer) return;
  patRutasLayer.clearLayers();
  window.patRutaCapas = {};
  const fComuna = document.getElementById('pat-comuna').value;
  const fArea = document.getElementById('pat-area').value;
  const fGestor = (document.getElementById('pat-gestor-filtro') || {}).value || '';
  const porGestor = (document.getElementById('pat-color') || {}).value === 'gestor';
  const gestorDe = r => state.gest.porRuta[String(r.id_ruta)] || 0;
  // FILTRO JERÁRQUICO: primero comuna, luego área (punto 1); después el gestor de relacionamiento
  const rutas = state.patRutas.filter(r =>
    (!fComuna || String(r.id_comuna) === String(fComuna)) &&
    (!fArea || r.area === fArea) &&
    (fGestor === '' || String(gestorDe(r)) === fGestor));
  let asignadas = 0;
  rutas.forEach(r => {
    if (!r.geometry) return;
    const asig = r.n > 0; if (asig) asignadas++;
    const gid = gestorDe(r), g = gid ? gestorPorId_(gid) : null;
    const estilo = porGestor
      ? (g ? { color: colorGestorPat_(gid), weight: 4, opacity: 0.95 } : { color: '#94A3B8', weight: 2.5, opacity: 0.7, dashArray: '5 6' })
      : { color: asig ? '#16A34A' : '#94A3B8', weight: asig ? 4 : 2.5, opacity: asig ? 0.95 : 0.6, className: asig ? 'ruta-asignada-glow' : '' };
    const capa = L.geoJSON(r.geometry, { style: estilo });
    capa.bindTooltip('<b>' + escapeHtml_(r.nombre_ruta || r.id_ruta) + '</b><br>👤 ' + (g ? escapeHtml_(g.codigo + ' · ' + g.nombre) : 'Sin gestor') +
      (asig ? '<br>🚓 ' + r.n + ' patrullero(s) en la jornada' : ''), { sticky: true });
    capa.on('click', () => abrirAsigPat_(r));
    window.patRutaCapas[r.id_ruta] = capa;
    capa.addTo(patRutasLayer);
  });
  // Leyenda por gestor (solo con el color por gestor): clic = filtrar ese gestor
  const ley = document.getElementById('pat-leyenda');
  if (ley) {
    if (!porGestor) ley.style.display = 'none';
    else {
      const cuenta = {}; rutas.forEach(r => { const id = gestorDe(r); cuenta[id] = (cuenta[id] || 0) + 1; });
      const ids = Object.keys(cuenta).map(Number).filter(Boolean).sort((a, b) => String((gestorPorId_(a) || {}).codigo).localeCompare(String((gestorPorId_(b) || {}).codigo)));
      ley.innerHTML = '<b>👤 Gestores de relacionamiento</b>' + ids.map(id => { const g = gestorPorId_(id) || { codigo: '?', nombre: '' };
        return '<div data-pat-ley="' + id + '" title="Ver solo sus rutas"><i style="background:' + colorGestorPat_(id) + '"></i>' + escapeHtml_(g.codigo + ' · ' + g.nombre) + ' <small>(' + cuenta[id] + ')</small></div>'; }).join('') +
        (cuenta[0] ? '<div data-pat-ley="0"><i style="background:repeating-linear-gradient(90deg,#94A3B8 0 5px,transparent 5px 9px)"></i>Sin gestor <small>(' + cuenta[0] + ')</small></div>' : '') +
        (fGestor !== '' ? '<div data-pat-ley="" style="color:#2563EB;">↺ Ver todos</div>' : '');
      ley.style.display = '';
      ley.querySelectorAll('[data-pat-ley]').forEach(d => d.onclick = () => { document.getElementById('pat-gestor-filtro').value = d.dataset.patLey; dibujarRutasPat_(); });
    }
  }
  const sinGestor = rutas.filter(r => !gestorDe(r)).length;
  document.getElementById('pat-resumen').textContent = asignadas + ' de ' + rutas.length + ' rutas asignadas · ' + (rutas.length - sinGestor) + ' con gestor · jornada ' + (document.getElementById('pat-fecha').value || '');
  // Encuadrar
  try { const b = patRutasLayer.getBounds(); if (b.isValid()) patMap.fitBounds(b, { padding: [30, 30], maxZoom: 12 }); } catch (e) {}
  if (state.patRutaSel) resaltarPatSel_(state.patRutaSel.id_ruta);
}

function resaltarPatSel_(idRuta) {
  Object.keys(window.patRutaCapas).forEach(id => {
    window.patRutaCapas[id].eachLayer(s => { const el = s.getElement && s.getElement(); if (!el) return; if (id === idRuta) el.classList.add('ruta-seleccionada-neon'); else el.classList.remove('ruta-seleccionada-neon'); });
    if (id === idRuta) window.patRutaCapas[id].eachLayer(s => s.bringToFront && s.bringToFront());
  });
}

async function abrirAsigPat_(ruta) {
  state.patRutaSel = ruta;
  resaltarPatSel_(ruta.id_ruta);
  document.getElementById('pat-side-empty').style.display = 'none';
  document.getElementById('pat-side-content').style.display = 'flex';
  document.getElementById('pat-ruta-nombre').textContent = ruta.nombre_ruta || ruta.id_ruta;
  document.getElementById('pat-ruta-meta').textContent = [ruta.subgerencia, ruta.area, ruta.comuna].filter(Boolean).join(' · ') + (ruta.km ? ' · ' + Number(ruta.km).toFixed(1) + ' km' : '');
  renderGestorRutaPat_(ruta);   // 👤 gestor de relacionamiento de la ruta (SQL 128)
  document.getElementById('pat-buscador').value = '';
  // Info del periodo (vínculo automático por fecha)
  const fecha = document.getElementById('pat-fecha').value;
  const { data: per } = await supabaseClient.rpc('periodo_para_ruta_fecha', { p_id_ruta: ruta.id_ruta, p_fecha: fecha });
  const info = document.getElementById('pat-periodo-info');
  if (per) {
    const { data: cp } = await supabaseClient.from('config_periodos').select('nombre_plan, fecha_inicio, fecha_fin').eq('id', per).maybeSingle();
    info.className = 'pat-periodo-info pat-periodo-ok';
    info.innerHTML = '🔥 <b>Vinculada al periodo activo:</b> ' + escapeHtml_(cp ? cp.nombre_plan : 'Periodo') + '<br>La jornada (' + fecha + ') cae dentro de sus fechas · se marcará automáticamente.';
    state.patPeriodoActual = per;
  } else {
    info.className = 'pat-periodo-info pat-periodo-no';
    info.innerHTML = '⚠️ La fecha ' + fecha + ' <b>no cae en un periodo crítico activo</b> de esta comuna. La asignación quedará suelta (no aparecerá en el mapa de la comuna).';
    state.patPeriodoActual = null;
  }
  // Cargar patrulleros
  if (!(state.patrulleros && state.patrulleros.length)) { const { data } = await supabaseClient.from('tb_patrulleros').select('*').order('id_patrullero'); state.patrulleros = data || []; }
  state.patSeleccion = {};
  const { data: asignados } = await supabaseClient.rpc('asignados_ruta', { p_id_ruta: ruta.id_ruta, p_fecha: fecha });
  (asignados || []).forEach(a => { state.patSeleccion[a.id_patrullero] = { asignar_camioneta: a.asignar_camioneta || '' }; });
  renderListaPat_();
}

function renderListaPat_() {
  const q = normalizarBusqueda_(document.getElementById('pat-buscador').value);
  const idArea = state.patRutaSel.id_area;
  const lista = state.patrulleros || [];
  let sug = q ? lista.filter(p => [p.nombre_colaborador, p.correo_colaborador, p.cargo].some(v => normalizarBusqueda_(v).includes(q))) : lista.filter(p => p.id_area_trabajo === idArea);
  const selIds = Object.keys(state.patSeleccion);
  const yaEn = new Set(sug.map(p => p.id_patrullero));
  const extra = lista.filter(p => selIds.includes(p.id_patrullero) && !yaEn.has(p.id_patrullero));
  const filas = [...extra, ...sug];
  const cont = document.getElementById('pat-lista');
  if (!filas.length) { cont.innerHTML = '<div class="layer-empty-msg">' + (q ? 'Sin resultados.' : 'No hay patrulleros sugeridos para esta área. Usa el buscador.') + '</div>'; return; }
  cont.innerHTML = '';
  filas.forEach(p => {
    const sel = !!state.patSeleccion[p.id_patrullero];
    const row = document.createElement('div'); row.className = 'pat-pat-row';
    row.innerHTML = '<input type="checkbox" data-pat="' + escapeHtml_(p.id_patrullero) + '"' + (sel ? ' checked' : '') + ' style="width:16px;height:16px;">' +
      '<div style="flex:1;min-width:0;"><div class="pp-nombre">' + escapeHtml_(p.nombre_colaborador || p.id_patrullero) + '</div><div class="pp-sub">' + escapeHtml_(p.cargo || '') + (p.area_relacionamiento ? ' · ' + escapeHtml_(p.area_relacionamiento) : '') + '</div></div>' +
      '<label style="font-size:10px;color:var(--text-secondary);display:flex;align-items:center;gap:3px;"><input type="checkbox" data-cam="' + escapeHtml_(p.id_patrullero) + '"' + (sel && state.patSeleccion[p.id_patrullero].asignar_camioneta === 'SI' ? ' checked' : '') + '>🚐</label>';
    cont.appendChild(row);
  });
  cont.querySelectorAll('[data-pat]').forEach(chk => chk.addEventListener('change', () => { const id = chk.dataset.pat; if (chk.checked) state.patSeleccion[id] = state.patSeleccion[id] || { asignar_camioneta: '' }; else delete state.patSeleccion[id]; }));
  cont.querySelectorAll('[data-cam]').forEach(chk => chk.addEventListener('change', () => { const id = chk.dataset.cam; if (!state.patSeleccion[id]) state.patSeleccion[id] = { asignar_camioneta: '' }; state.patSeleccion[id].asignar_camioneta = chk.checked ? 'SI' : ''; }));
}

async function guardarAsigPat_() {
  const idRuta = state.patRutaSel.id_ruta;
  const fecha = document.getElementById('pat-fecha').value;
  const patrulleros = Object.keys(state.patSeleccion).map(id => ({ id_patrullero: id, asignar_camioneta: state.patSeleccion[id].asignar_camioneta || null }));
  const { data, error } = await supabaseClient.rpc('asignar_patrulleros_ruta', { p_id_ruta: idRuta, p_fecha: fecha, p_patrulleros: patrulleros });
  if (error) { mostrarToast_('Error: ' + error.message); return; }
  mostrarToast_(data + ' patrullero(s) asignado(s).' + (state.patPeriodoActual ? ' Vinculado al periodo activo.' : ''));
  cerrarAsigPat_();
  await cargarRutasPatMap_();
}
async function cancelarAsigPat_() {
  const idRuta = state.patRutaSel.id_ruta;
  const fecha = document.getElementById('pat-fecha').value;
  if (!confirm('¿Cancelar la asignación de esta ruta para el ' + fecha + '?')) return;
  const { error } = await supabaseClient.rpc('cancelar_asignacion_ruta', { p_id_ruta: idRuta, p_fecha: fecha });
  if (error) { mostrarToast_('Error: ' + error.message); return; }
  mostrarToast_('Asignación cancelada.');
  cerrarAsigPat_();
  await cargarRutasPatMap_();
}
function cerrarAsigPat_() {
  document.getElementById('pat-side-content').style.display = 'none';
  document.getElementById('pat-side-empty').style.display = 'block';
  if (state.patRutaSel) { const c = window.patRutaCapas[state.patRutaSel.id_ruta]; if (c) c.eachLayer(s => { const el = s.getElement && s.getElement(); if (el) el.classList.remove('ruta-seleccionada-neon'); }); }
  state.patRutaSel = null;
}

