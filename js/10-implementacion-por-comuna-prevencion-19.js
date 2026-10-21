/* ==================== 🪜 IMPLEMENTACIÓN POR COMUNA (Prevención ▾, 19-10-2026, SQL 124) ====================
 * Control interno: avance de las 24 comunas relevantes (V6 de Comunas Prioritarias) en 7 etapas, por comuna y por
 * área. Solo el Administrador marca; Jefes de Área, Subgerentes y GRT ven (RLS de implementacion_etapas). */
const IM_ETAPAS = [
  ['reunion_autoridades', '🤝', 'Reunión autoridades'],
  ['capacitacion_sistema', '🎓', 'Capacitación del Sistema'],
  ['bajada_gestores', '👥', 'Bajada a Gestores'],
  ['rutas_normal', '🛣️', 'Construcción de rutas en condiciones normales'],
  ['bajada_alcalde', '🏛️', 'Bajada a Alcalde'],
  ['sistema_grd', '🖥️', 'Mostrar Sistema a GRD'],
  ['autonomia_grd', '🚀', 'Autonomía de GRD en el Sistema'],
];
state.im = { datos: null, area: '', listeners: false };
function puedeImplementacion_() { return esAdminOJefe_(); }
function imPuedeEditar_() { return !!(state.perfil && state.perfil.perfil === 'Administrador'); }
function imColor_(p) { return p >= 100 ? '#16A34A' : p >= 60 ? '#65A30D' : p >= 30 ? '#D97706' : p > 0 ? '#EA580C' : '#DC2626'; }

async function abrirImplementacion_() {
  if (!state.im.listeners) {
    state.im.listeners = true;
    document.getElementById('im-recargar').addEventListener('click', () => cargarImplementacion_());
    document.getElementById('im-excel').addEventListener('click', descargarImplementacion_);
    document.getElementById('im-cuerpo').addEventListener('click', e => {
      const a = e.target.closest('[data-im-area]');
      if (a) { e.preventDefault(); state.im.area = state.im.area === a.dataset.imArea ? '' : a.dataset.imArea; renderImplementacion_(); return; }
      const c = e.target.closest('[data-im-celda]');
      if (c && imPuedeEditar_()) { const [id, et] = c.dataset.imCelda.split('|'); marcarEtapa_(Number(id), et); }
    });
  }
  document.getElementById('im-modo').textContent = imPuedeEditar_() ? '✏️ Puedes marcar las etapas (clic en cada casilla)' : '👁️ Solo lectura';
  if (!state.im.datos) await cargarImplementacion_();
  else renderImplementacion_();
}

async function cargarImplementacion_() {
  const est = document.getElementById('im-estado'), cuerpo = document.getElementById('im-cuerpo');
  est.textContent = 'Cargando…';
  try {
    const { data: pp } = await supabaseClient.from('prioridad_parametros').select('id, parametros');
    const vig = (pp || []).find(f => f.id === 'vigente');
    const P = paramsCompletosPrio_(vig ? vig.parametros : null);
    const ids = (P.v6 && P.v6.ids) || PRIO_RELEVANTES_DEFECTO;
    const [cp, ac, et] = await Promise.all([
      supabaseClient.from('comunas_prioridad').select('*').in('id_comuna', ids),
      supabaseClient.from('v_area_comunas_admin').select('area, id_comuna').in('id_comuna', ids),
      supabaseClient.from('implementacion_etapas').select('*').in('id_comuna', ids),
    ]);
    if (et.error) {
      cuerpo.innerHTML = '<div class="gr-aviso">⚠️ ' + (/implementacion_etapas/.test(et.error.message)
        ? 'Falta ejecutar en Supabase el SQL 124 (sql/pendientes/124_implementacion_etapas_y_nombres.sql).' : escapeHtml_(et.error.message)) + '</div>';
      est.textContent = 'Error'; return;
    }
    // Un nombre por área aunque venga escrita con y sin tilde («CONCEPCION» / «CONCEPCIÓN»): se prefiere la con tilde
    const nombreArea = {};
    (ac.data || []).forEach(x => { if (!x.area) return; const k = SG_KEY(x.area); if (!nombreArea[k] || /[^\x00-\x7F]/.test(x.area)) nombreArea[k] = x.area; });
    const areasDe = {};
    (ac.data || []).forEach(x => { if (!x.area) return; const k = Number(x.id_comuna), a = nombreArea[SG_KEY(x.area)]; (areasDe[k] = areasDe[k] || []); if (!areasDe[k].includes(a)) areasDe[k].push(a); });
    const marcas = {}; (et.data || []).forEach(r => { marcas[r.id_comuna + '|' + r.etapa] = r; });
    const nombres = await nombresPerfiles_([...new Set((et.data || []).map(r => r.actualizado_por).filter(Boolean))]);
    const comunas = ids.map(id => {
      const m = (cp.data || []).find(x => Number(x.id_comuna) === Number(id)) || { id_comuna: id, comuna: 'Comuna ' + id };
      const pr = calcularPrio_(m, P);
      return { id: Number(id), comuna: m.comuna, prio: pr.prio, nivel: pr.nivel, areas: areasDe[Number(id)] || [] };
    }).sort((a, b) => a.prio - b.prio || (b.nivel || 0) - (a.nivel || 0) || a.comuna.localeCompare(b.comuna, 'es'));
    state.im.datos = { comunas, marcas, nombres };
    est.textContent = 'Actualizado ' + new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
  } catch (e) {
    est.textContent = 'Error';
    cuerpo.innerHTML = '<div class="tb-vacio">No se pudo cargar: ' + escapeHtml_(e.message || String(e)) + '</div>';
    return;
  }
  renderImplementacion_();
}

/** Gráfico de torta (anillo) del avance con el % al centro (SVG, sin librería). */
function imTorta_(pct, tam, sub) {
  const r = 42, cir = 2 * Math.PI * r, p = Math.max(0, Math.min(100, pct || 0)), col = imColor_(p);
  return '<svg class="im-torta" viewBox="0 0 100 100" width="' + tam + '" height="' + tam + '" role="img" aria-label="Avance ' + p + '%">' +
    '<circle cx="50" cy="50" r="' + r + '" fill="none" stroke="#E2E8F0" stroke-width="13"/>' +
    '<circle cx="50" cy="50" r="' + r + '" fill="none" stroke="' + col + '" stroke-width="13" stroke-linecap="round" transform="rotate(-90 50 50)"' +
      ' stroke-dasharray="' + (cir * p / 100).toFixed(1) + ' ' + cir.toFixed(1) + '"/>' +
    '<text x="50" y="' + (sub ? 50 : 56) + '" text-anchor="middle" font-size="' + (sub ? 21 : 22) + '" font-weight="900" fill="' + col + '">' + p + '%</text>' +
    (sub ? '<text x="50" y="66" text-anchor="middle" font-size="9.5" font-weight="700" fill="#64748B">' + sub + '</text>' : '') + '</svg>';
}
function imHechas_(c) { const M = state.im.datos.marcas; return IM_ETAPAS.filter(([k]) => M[c.id + '|' + k] && M[c.id + '|' + k].completada).length; }

function renderImplementacion_() {
  const D = state.im.datos; if (!D) return;
  const cuerpo = document.getElementById('im-cuerpo'), M = D.marcas, edita = imPuedeEditar_();
  const N = IM_ETAPAS.length;
  const pctDe = lista => { const tot = lista.length * N; return tot ? Math.round(lista.reduce((s, c) => s + imHechas_(c), 0) * 100 / tot) : 0; };
  // Áreas (una comuna compartida cuenta en ambas; el nombre ya viene unificado con/sin tilde desde la carga)
  const porArea = {};
  D.comunas.forEach(c => (c.areas.length ? c.areas : ['(sin área)']).forEach(a => { (porArea[a] = porArea[a] || []).push(c); }));
  const areas = Object.keys(porArea).map(a => ({ a, lista: porArea[a], pct: pctDe(porArea[a]) })).sort((x, y) => y.pct - x.pct || x.a.localeCompare(y.a, 'es'));
  const filas = state.im.area ? (porArea[state.im.area] || []) : D.comunas;
  const pctG = pctDe(D.comunas), pctF = pctDe(filas);
  const completas = D.comunas.filter(c => imHechas_(c) === N).length, sinIniciar = D.comunas.filter(c => imHechas_(c) === 0).length;
  const porEtapa = IM_ETAPAS.map(([k]) => filas.filter(c => M[c.id + '|' + k] && M[c.id + '|' + k].completada).length);
  const fmtF = f => f ? new Date(String(f).slice(0, 10) + 'T12:00:00').toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit' }) : '';
  cuerpo.innerHTML =
    '<div class="im-global" style="--c:' + imColor_(pctG) + '">' + imTorta_(pctG, 132, 'avance') +
      '<div class="barra"><b style="font-size:15px;">Avance de la implementación</b>' +
      '<small style="margin:2px 0 8px;">' + D.comunas.length + ' comunas × ' + N + ' etapas · ✅ ' + completas + ' comuna(s) completas · ⛔ ' + sinIniciar + ' sin iniciar</small>' +
      '<div class="im-etapas-res">' + IM_ETAPAS.map(([k, ico, nom]) => {
        const n = D.comunas.filter(c => M[c.id + '|' + k] && M[c.id + '|' + k].completada).length, p = D.comunas.length ? Math.round(n * 100 / D.comunas.length) : 0;
        return '<div title="' + escapeHtml_(nom) + ': ' + n + ' de ' + D.comunas.length + ' comunas"><span>' + ico + ' ' + escapeHtml_(nom) + '</span><span class="im-barra chica" style="--c:' + imColor_(p) + '"><em style="width:' + p + '%"></em></span><b style="color:' + imColor_(p) + '">' + p + '%</b></div>';
      }).join('') + '</div></div></div>' +
    '<div class="im-areas">' + areas.map(x => '<div class="im-area' + (state.im.area === x.a ? ' on' : '') + '" style="--c:' + imColor_(x.pct) + '" data-im-area="' + escapeHtml_(x.a) + '" title="Clic para ver solo esta área">' +
      imTorta_(x.pct, 54) + '<div><b>📍 ' + escapeHtml_(aTitulo_(x.a)) + '</b>' +
      '<small style="color:var(--text-tertiary);">' + x.lista.length + ' comuna(s) · ' + x.lista.filter(c => imHechas_(c) === N).length + ' completa(s)</small></div></div>').join('') + '</div>' +
    (state.im.area ? '<div class="sg-area-cab2"><b>📍 ' + escapeHtml_(aTitulo_(state.im.area)) + '</b><span>' + filas.length + ' comuna(s) · avance ' + pctF + '% · <a href="#" data-im-area="' + escapeHtml_(state.im.area) + '">ver todas</a></span></div>' : '') +
    '<div style="overflow:auto;"><table class="im-tabla"><thead><tr><th class="izq">Comuna</th><th class="izq">Área</th>' +
      IM_ETAPAS.map(([, ico, nom], i) => '<th title="' + escapeHtml_(nom) + '"><span class="ico">' + ico + '</span>' + (i + 1) + '. ' + escapeHtml_(nom.length > 18 ? nom.slice(0, 16) + '…' : nom) + '</th>').join('') +
      '<th class="izq">Avance</th></tr></thead><tbody>' +
      filas.map(c => {
        const h = imHechas_(c), p = Math.round(h * 100 / N), n = prioInfo_(c.prio);
        return '<tr><td class="izq"><b>' + escapeHtml_(c.comuna) + '</b><br><span class="prio-badge" style="background:' + n.color + ';color:' + n.texto + ';">' + n.nombre + (c.nivel != null ? ' · ' + fmtNivelPrio_(c.nivel) : '') + '</span></td>' +
          '<td class="izq" style="font-size:11px;">' + escapeHtml_(c.areas.map(aTitulo_).join(' / ') || '—') + '</td>' +
          IM_ETAPAS.map(([k, , nom]) => {
            const r = M[c.id + '|' + k], ok = !!(r && r.completada);
            const quien = r && r.actualizado_por ? (D.nombres[r.actualizado_por] || 'Administrador') : '';
            const t = nom + (ok ? ' · ✅ ' + (r.fecha ? fmtF(r.fecha) + ' · ' : '') + quien : ' · pendiente') + (edita ? ' · clic para ' + (ok ? 'desmarcar' : 'marcar') : '');
            return '<td><span class="im-celda' + (ok ? ' ok' : '') + (edita ? ' editable' : '') + '" data-im-celda="' + c.id + '|' + k + '" title="' + escapeHtml_(t) + '">' +
              (ok ? '✓<small>' + fmtF(r.fecha) + '</small>' : '') + '</span></td>';
          }).join('') +
          '<td class="izq"><div class="im-av" style="--c:' + imColor_(p) + '"><span class="im-barra chica"><em style="width:' + p + '%"></em></span><b>' + p + '%</b></div><small style="color:var(--text-tertiary);">' + h + ' de ' + N + '</small></td></tr>';
      }).join('') +
      '</tbody><tfoot><tr><td class="izq" colspan="2">Comunas con la etapa cumplida</td>' +
      porEtapa.map(n => { const p = filas.length ? Math.round(n * 100 / filas.length) : 0; return '<td style="color:' + imColor_(p) + '">' + n + '/' + filas.length + '<br>' + p + '%</td>'; }).join('') +
      '<td class="izq" style="color:' + imColor_(pctF) + '">' + pctF + '%</td></tr></tfoot></table></div>';
}

async function marcarEtapa_(idComuna, etapa) {
  const D = state.im.datos, k = idComuna + '|' + etapa, actual = D.marcas[k];
  const nuevo = !(actual && actual.completada);
  const { data, error } = await supabaseClient.from('implementacion_etapas')
    .upsert({ id_comuna: idComuna, etapa, completada: nuevo }, { onConflict: 'id_comuna,etapa' }).select().maybeSingle();
  if (error) { mostrarToast_('No se pudo guardar: ' + error.message); return; }
  D.marcas[k] = data || { id_comuna: idComuna, etapa, completada: nuevo, fecha: nuevo ? tbHoyISO_() : null, actualizado_por: state.perfil.id };
  if (state.perfil && state.perfil.id) D.nombres[state.perfil.id] = state.perfil.nombre_completo;
  const c = D.comunas.find(x => x.id === idComuna), et = IM_ETAPAS.find(x => x[0] === etapa);
  mostrarToast_((nuevo ? '✅ ' : '↩️ ') + (c ? c.comuna : '') + ' · ' + (et ? et[2] : etapa) + (nuevo ? ' cumplida' : ' pendiente'));
  renderImplementacion_();
}

async function descargarImplementacion_() {
  const D = state.im.datos; if (!D) { mostrarToast_('No hay datos para descargar.'); return; }
  try {
    const XLSX = await tbCargarSheetJs_();
    const wb = XLSX.utils.book_new(), N = IM_ETAPAS.length;
    const filas = D.comunas.map(c => {
      const o = { 'Comuna': c.comuna, 'Área': c.areas.map(aTitulo_).join(' / '), 'Prioridad': prioInfo_(c.prio).nombre };
      IM_ETAPAS.forEach(([k, , nom], i) => { const r = D.marcas[c.id + '|' + k]; o[(i + 1) + '. ' + nom] = r && r.completada ? 'Sí' + (r.fecha ? ' (' + String(r.fecha).slice(0, 10) + ')' : '') : 'No'; });
      o['Etapas cumplidas'] = imHechas_(c); o['Avance %'] = Math.round(imHechas_(c) * 100 / N);
      return o;
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(filas), 'Por comuna');
    const porArea = {}; D.comunas.forEach(c => (c.areas.length ? c.areas : ['(sin área)']).forEach(a => { (porArea[a] = porArea[a] || []).push(c); }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(Object.keys(porArea).sort().map(a => ({
      'Área': aTitulo_(a), 'Comunas': porArea[a].length, 'Comunas completas': porArea[a].filter(c => imHechas_(c) === N).length,
      'Avance %': Math.round(porArea[a].reduce((s, c) => s + imHechas_(c), 0) * 100 / (porArea[a].length * N)),
    }))), 'Por área');
    XLSX.writeFile(wb, 'implementacion_comunas_' + tbHoyISO_() + '.xlsx');
    mostrarToast_('✅ Descargado: ' + filas.length + ' comunas.');
  } catch (e) { mostrarToast_('No se pudo generar el Excel: ' + (e.message || e)); }
}

/* ==================== 🌾 GESTIÓN ASOCIACIÓN MALLECO (Agricultores ▾, 20-10-2026, SQL 129) ====================
 * Agenda de prevención de la Asociación de Agricultores (Excel «Plan de prevención de agricultores»): actividades A1–A9 con
 * meta mensual (totales de la Asociación), registros desde la app de terreno (app-agricultores/app.html) o desde aquí,
 * planificación con frecuencia (semanal / quincenal / mensual) y ficha de cada agricultor.
 *   Ven: Administrador, Asociación (Visor + perfil_asociacion) y Jefes con el área VICTORIA (puede_ver_agricultores_).
 *   Registran y planifican: Administrador y Asociación. Metas: Administrador; la Asociación solo A8 (escuelas). */
const AGR_FORMULARIOS = {
  agricultor: { nombre: 'Agricultor / evaluación de riesgo', campos: [
    { k: 'nombre_agricultor', t: 'Nombre del agricultor', tipo: 'text', req: true },
    { k: 'fundo', t: 'Nombre del fundo', tipo: 'text' },
    { k: 'telefono', t: 'Teléfono de contacto', tipo: 'text' },
    { k: 'superficie_ha', t: 'Superficie (ha)', tipo: 'number' },
    { k: 'cultivos', t: 'Tipo de cultivo', tipo: 'multi', op: ['Trigo', 'Avena', 'Raps', 'Otro'] },
    { k: 'nivel_riesgo', t: 'Nivel de riesgo', tipo: 'select', op: ['alto', 'medio', 'bajo'], req: true },
    { k: 'recursos_proteccion', t: 'Posee recursos de protección', tipo: 'bool' },
    { k: 'recursos_detalle', t: '¿Cuáles? (estanque, bomba, maquinaria…)', tipo: 'text' },
    { k: 'cortafuegos', t: 'Cortafuegos', tipo: 'bool' },
    { k: 'zona_poblada', t: 'Zona poblada', tipo: 'bool' },
    { k: 'vinculacion', t: 'Vinculación', tipo: 'select', op: ['directa', 'indirecta'] },
    { k: 'fecha_cosecha', t: 'Fecha de cosecha aprox.', tipo: 'date' },
    { k: 'fecha_quema', t: 'Fecha estimada de quema', tipo: 'date' },
    { k: 'gestor_cmpc', t: 'Gestor CMPC participa', tipo: 'bool' },
    { k: 'gestor_cmpc_nombre', t: 'Gestor CMPC (nombre)', tipo: 'text' },
    { k: 'motivo', t: 'Motivo', tipo: 'textarea' },
    { k: 'observaciones', t: 'Observaciones', tipo: 'textarea' },
  ] },
  capacitacion: { nombre: 'Capacitación / charla', campos: [
    { k: 'organizacion', t: 'Nombre de la organización', tipo: 'text', req: true },
    { k: 'dirige', t: 'Nombre de quien dirige', tipo: 'text' },
    { k: 'publico', t: 'Tipo de público', tipo: 'select', op: ['Agricultores', 'Comunidad', 'Junta de vecinos', 'PDTI', 'Organización funcional / territorial', 'Trabajadores agrícolas', 'Escuela', 'Otro'] },
    { k: 'tema', t: 'Tema', tipo: 'select', op: ['Prevención de incendios', 'Cortafuegos', 'Técnicas de quema', 'Otro'] },
    { k: 'nivel_riesgo', t: 'Nivel de riesgo (según datos)', tipo: 'select', op: ['alto', 'medio', 'bajo'] },
    { k: 'zona_poblada', t: 'Zona poblada', tipo: 'bool' },
    { k: 'vinculacion', t: 'Vinculación', tipo: 'select', op: ['directa', 'indirecta'] },
    { k: 'participantes', t: 'N° de participantes', tipo: 'number', req: true },
    { k: 'observaciones', t: 'Observaciones', tipo: 'textarea' },
  ] },
  operativo: { nombre: 'Operativo carretero', campos: [
    { k: 'ruta_rol', t: 'Ruta (rol MOP, ej. R-86)', tipo: 'text', req: true },
    { k: 'km', t: 'Kilómetro', tipo: 'number' },
    { k: 'lugar', t: 'Lugar / sector', tipo: 'text' },
    { k: 'instituciones', t: 'Instituciones participantes', tipo: 'multi', op: ['Carabineros', 'CONAF', 'Municipalidad', 'CMPC', 'Asociación', 'Otra'] },
    { k: 'vehiculos', t: 'N° de vehículos controlados', tipo: 'number' },
    { k: 'folletos', t: 'N° de folletos entregados', tipo: 'number' },
    { k: 'participantes', t: 'N° de personas del operativo', tipo: 'number' },
    { k: 'incidencias', t: 'Incidencias (quemas, basurales, conductas de riesgo)', tipo: 'textarea' },
  ] },
  reunion: { nombre: 'Reunión', campos: [
    { k: 'tipo_reunion', t: 'Tipo de reunión', tipo: 'select', op: ['Coordinación SG + jefes de área', 'Área comunal', 'Otra'], req: true },
    { k: 'participantes', t: 'N° de participantes', tipo: 'number' },
    { k: 'asistentes', t: 'Asistentes', tipo: 'textarea' },
    { k: 'acuerdos', t: 'Acuerdos', tipo: 'textarea' },
    { k: 'proxima_fecha', t: 'Próxima reunión', tipo: 'date' },
  ] },
};
const AGR_FRECUENCIAS = [['unica', 'Una vez'], ['semanal', 'Semanal'], ['quincenal', 'Quincenal'], ['mensual', 'Mensual']];
const AGR_RIESGO_COLOR = { alto: '#DC2626', medio: '#D97706', bajo: '#16A34A' };
state.ag = { tab: 'tablero', datos: null, dia: null, planVista: 'semana', planRef: null, q: '', riesgo: '', mapa: null, capas: null, listeners: false };

function esAdminPerfil_() { return !!(state.perfil && state.perfil.perfil === 'Administrador'); }
function esAsociacion_() { return !!state.asociacion; }
function puedeAgricultores_() {
  if (esAdminPerfil_() || esAsociacion_()) return true;
  if (!state.perfil || !esJefeAreaPerfil_(state.perfil.perfil)) return false;
  return (state.misAreasIds || []).some(a => SG_KEY(a) === SG_KEY(AGR_AREA_VISIBLE));
}
function agrPuedeRegistrar_() { return esAdminPerfil_() || esAsociacion_(); }
/** GPS real del teléfono al registrar (SQL 132): control de supervisión, lo ven el Administrador y los Jefes (no la Asociación). */
function agrVeGpsReal_() { return !esAsociacion_() && (esAdminPerfil_() || !!(state.perfil && esJefeAreaPerfil_(state.perfil.perfil))); }
function agrTxtGpsReal_(r) {
  if (!agrVeGpsReal_() || r.gps_lat == null) return '';
  const aj = r.ajuste_m != null ? Number(r.ajuste_m) : null;
  return aj == null ? '📡 GPS real registrado' : aj < 30 ? '📡 GPS coincide con el punto (' + Math.round(aj) + ' m)' : '📡 Punto movido ' + (aj >= 1000 ? (aj / 1000).toFixed(1) + ' km' : Math.round(aj) + ' m') + ' desde el GPS real';
}
const AGR_COLOR_FORM = { agricultor: '#15803D', capacitacion: '#2563EB', operativo: '#EA580C', reunion: '#7C3AED' };
const AGR_PERIODOS = [['24', 'Hoy (24 h)', 24], ['48', '2 días', 48], ['72', '3 días', 72], ['168', '7 días', 168], ['720', 'Último mes', 720], ['0', 'Toda la temporada', 0]];
function agrPuedeMeta_(act) { return esAdminPerfil_() || (esAsociacion_() && !!(act && act.meta_editable_asociacion)); }
function agrISO_(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function agrDiaDe_(ts) { return agrISO_(new Date(ts)); }
function agrMesDe_(ts) { return agrDiaDe_(ts).slice(0, 7); }
function agrFecha_(iso) { return new Date(String(iso).slice(0, 10) + 'T12:00:00'); }
function agrMesTxt_(mk) { const d = agrFecha_(mk + '-01'); const t = d.toLocaleDateString('es-CL', { month: 'short', year: '2-digit' }); return t.charAt(0).toUpperCase() + t.slice(1); }
function agrClaseCump_(p) { return p == null ? 'ag-n' : p >= 90 ? 'ag-v' : p >= 60 ? 'ag-a' : 'ag-r'; }
function agrAct_(id) { return ((state.ag.datos && state.ag.datos.actividades) || []).find(a => a.id === id) || { id, nombre: id, icono: '•', formulario: 'reunion' }; }
function agrNombre_(id) { const D = state.ag.datos; return (D && D.nombres[id]) || (id ? 'Usuario' : '—'); }

async function abrirAgricultores_() {
  if (!state.ag.listeners) {
    state.ag.listeners = true;
    document.getElementById('ag-vistas').addEventListener('click', e => {
      const b = e.target.closest('[data-ag-tab]'); if (!b) return;
      state.ag.tab = b.dataset.agTab;
      document.querySelectorAll('#ag-vistas [data-ag-tab]').forEach(x => x.classList.toggle('on', x === b));
      renderAgricultores_();
    });
    document.getElementById('ag-recargar').addEventListener('click', () => cargarAgricultores_());
    document.getElementById('ag-excel').addEventListener('click', descargarAgricultores_);
    document.getElementById('ag-registrar').addEventListener('click', () => abrirRegistroAgr_({}));
    document.getElementById('ag-cuerpo').addEventListener('click', clicAgricultores_);
    document.getElementById('ag-cuerpo').addEventListener('change', cambioAgricultores_);
  }
  document.getElementById('ag-registrar').style.display = agrPuedeRegistrar_() ? '' : 'none';
  if (!state.ag.datos) await cargarAgricultores_();
  else renderAgricultores_();
}

async function cargarAgricultores_() {
  const est = document.getElementById('ag-estado'), cuerpo = document.getElementById('ag-cuerpo');
  est.textContent = 'Cargando…';
  try {
    const sb = supabaseClient;
    const [as, ac, me, re, ag, pl, pa] = await Promise.all([
      sb.from('agr_asociaciones').select('*').eq('id', 'MALLECO').maybeSingle(),
      sb.from('agr_actividades').select('*').order('orden'),
      sb.from('agr_metas').select('*'),
      // '*': incluye gps_lat / gps_lng / ajuste_m (SQL 132) si ya existen
      sb.from('agr_registros').select('*').order('fecha', { ascending: false }).limit(5000),
      sb.from('agr_agricultores').select('id, codigo, nombre, fundo, telefono, superficie_ha, cultivos, nivel_riesgo, recursos_proteccion, recursos_detalle, cortafuegos, zona_poblada, vinculacion, fecha_cosecha, fecha_quema, lat, lng, id_comuna, comuna, ultima_visita, visitas').order('nombre'),
      sb.from('agr_planificacion').select('*').order('fecha'),
      sb.from('perfil_asociacion').select('perfil_id, asociacion'),
    ]);
    const err = [as, ac, me, re, ag, pl].find(r => r.error);
    if (err) {
      cuerpo.innerHTML = '<div class="gr-aviso">⚠️ ' + (/agr_|relation|does not exist/i.test(err.error.message)
        ? 'Falta ejecutar en Supabase el SQL 129 (sql/pendientes/129_agricultores_asociacion.sql).' : escapeHtml_(err.error.message)) + '</div>';
      est.textContent = 'Error'; return;
    }
    const metas = {}; (me.data || []).forEach(m => { metas[m.actividad_id + '|' + String(m.mes).slice(0, 7)] = m.meta; });
    const asoc = as.data || { id: 'MALLECO', nombre: 'Asociación de Agricultores Malleco', comunas: [9211, 9207, 9202], temporada_ini: '2026-10-01', temporada_fin: '2027-03-31' };
    const meses = [];
    for (let d = agrFecha_(String(asoc.temporada_ini).slice(0, 7) + '-01'); agrISO_(d) <= String(asoc.temporada_fin).slice(0, 10); d.setMonth(d.getMonth() + 1)) meses.push(agrISO_(d).slice(0, 7));
    const plan = pl.data || [], registros = re.data || [], gestores = (pa.data || []).map(x => x.perfil_id);
    const ids = [...new Set([...registros.map(r => r.usuario_id), ...plan.map(p => p.responsable), ...gestores].filter(Boolean))];
    const nombres = await nombresPerfiles_(ids);
    const comunasAsoc = (state.comunas || []).filter(c => (asoc.comunas || []).map(Number).includes(Number(c.id_comuna)));
    state.ag.datos = { asoc, meses, actividades: ac.data || [], metas, registros, agricultores: ag.data || [], plan, gestores, nombres, comunasAsoc };
    est.textContent = 'Actualizado ' + new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
  } catch (e) {
    est.textContent = 'Error';
    cuerpo.innerHTML = '<div class="tb-vacio">No se pudo cargar: ' + escapeHtml_(e.message || String(e)) + '</div>';
    return;
  }
  renderAgricultores_();
}

function renderAgricultores_() {
  const D = state.ag.datos; if (!D) return;
  const t = state.ag.tab;
  if (t === 'tablero') renderAgTablero_();
  else if (t === 'diario') renderAgDiario_();
  else if (t === 'plan') renderAgPlan_();
  else if (t === 'agricultores') renderAgListado_();
  else if (t === 'mapa') renderAgMapa_();
}

/** Realizadas por actividad y mes (registros). */
function agrRealizadas_() {
  const out = {};
  state.ag.datos.registros.forEach(r => { const k = r.actividad_id + '|' + agrMesDe_(r.fecha); out[k] = (out[k] || 0) + 1; });
  return out;
}
/** Cumplimiento con tope 100 % por actividad: Σ mín(realizado, meta) / Σ meta. */
function agrCumplimiento_(meses) {
  const D = state.ag.datos, R = agrRealizadas_();
  let meta = 0, ok = 0;
  D.actividades.forEach(a => meses.forEach(m => { const mt = D.metas[a.id + '|' + m] || 0; meta += mt; ok += Math.min(R[a.id + '|' + m] || 0, mt); }));
  return meta ? Math.round(ok * 100 / meta) : null;
}

function renderAgTablero_() {
  const D = state.ag.datos, cuerpo = document.getElementById('ag-cuerpo'), R = agrRealizadas_();
  const hoy = tbHoyISO_(), mesAct = hoy.slice(0, 7);
  const mesesHasta = D.meses.filter(m => m <= mesAct);
  const cMes = agrCumplimiento_([mesAct]), cTemp = agrCumplimiento_(mesesHasta.length ? mesesHasta : [D.meses[0]]);
  const enTemp = r => { const m = agrMesDe_(r.fecha); return m >= D.meses[0] && m <= D.meses[D.meses.length - 1]; };
  const regT = D.registros.filter(enTemp);
  const capacitados = regT.filter(r => r.formulario === 'capacitacion').reduce((s, r) => s + (Number(r.participantes) || 0), 0);
  const porRiesgo = { alto: 0, medio: 0, bajo: 0 }; D.agricultores.forEach(a => { if (porRiesgo[a.nivel_riesgo] != null) porRiesgo[a.nivel_riesgo]++; });
  const kpi = (ico, val, txt, sub) => '<div class="ag-kpi"><span style="font-size:26px;">' + ico + '</span><div><b>' + val + '</b><small>' + txt + (sub ? '<br>' + sub : '') + '</small></div></div>';
  const celda = (real, meta, futuro) => {
    if (!meta && !real) return '<span class="ag-celda ag-n">—</span>';
    const p = meta ? Math.round(real * 100 / meta) : null;
    return '<span class="ag-celda ' + (futuro ? 'ag-n' : agrClaseCump_(p)) + '" title="' + real + ' realizada(s) de ' + meta + ' (meta)">' + real + ' / ' + meta + '<small>' + (p != null ? p + '%' : 'sin meta') + '</small></span>';
  };
  // Por gestor (mes actual)
  const porGestor = {}; D.registros.filter(r => agrMesDe_(r.fecha) === mesAct).forEach(r => { porGestor[r.usuario_id] = (porGestor[r.usuario_id] || 0) + 1; });
  cuerpo.innerHTML =
    '<div class="ag-kpis">' +
      '<div class="ag-kpi">' + imTorta_(cMes || 0, 64) + '<div><b>' + (cMes == null ? '—' : cMes + '%') + '</b><small>Cumplimiento de ' + agrMesTxt_(mesAct) + '</small></div></div>' +
      '<div class="ag-kpi">' + imTorta_(cTemp || 0, 64) + '<div><b>' + (cTemp == null ? '—' : cTemp + '%') + '</b><small>Temporada acumulada<br>(' + agrMesTxt_(D.meses[0]) + ' – ' + agrMesTxt_(D.meses[D.meses.length - 1]) + ')</small></div></div>' +
      kpi('👨‍🌾', D.agricultores.length, 'Agricultores registrados', '<span class="ag-riesgo alto">' + porRiesgo.alto + ' alto</span> <span class="ag-riesgo medio">' + porRiesgo.medio + ' medio</span> <span class="ag-riesgo bajo">' + porRiesgo.bajo + ' bajo</span>') +
      kpi('🎓', capacitados.toLocaleString('es-CL'), 'Personas capacitadas en la temporada') +
      kpi('🚧', regT.filter(r => r.formulario === 'operativo').length, 'Operativos carreteros') +
      kpi('📝', D.registros.filter(r => agrDiaDe_(r.fecha) === hoy).length, 'Registros de hoy', D.registros.filter(r => (r.fotos || []).length).length + ' con fotos en total') +
    '</div>' +
    '<div class="ag-caja"><h4>📋 Agenda de trabajo · meta mensual vs realizado <small style="font-weight:500;color:var(--text-tertiary);">🟢 ≥ 90 % · 🟡 60–89 % · 🔴 &lt; 60 % · totales de la Asociación' +
      (D.actividades.some(a => agrPuedeMeta_(a)) ? ' · ✏️ cambia la meta en la fila «Meta»' : '') + '</small></h4>' +
    '<div style="overflow:auto;"><table class="ag-tabla"><thead><tr><th class="izq">Actividad</th>' + D.meses.map(m => '<th>' + agrMesTxt_(m) + (m === mesAct ? ' ◀' : '') + '</th>').join('') + '<th>Temporada</th></tr></thead><tbody>' +
    D.actividades.map(a => {
      const tr = D.meses.reduce((s, m) => s + (R[a.id + '|' + m] || 0), 0), tm = D.meses.reduce((s, m) => s + (D.metas[a.id + '|' + m] || 0), 0);
      const fila = '<tr><td class="izq"><b>' + escapeHtml_((a.icono || '') + ' ' + a.id + ' · ' + a.nombre) + '</b><br><small style="color:var(--text-tertiary);">' + escapeHtml_(a.tipo) + ' · formulario ' + escapeHtml_((AGR_FORMULARIOS[a.formulario] || {}).nombre || a.formulario) + '</small></td>' +
        D.meses.map(m => '<td>' + celda(R[a.id + '|' + m] || 0, D.metas[a.id + '|' + m] || 0, m > mesAct) + '</td>').join('') + '<td>' + celda(tr, tm, false) + '</td></tr>';
      const filaMeta = agrPuedeMeta_(a) ? '<tr><td class="izq" style="font-size:11px;color:var(--text-tertiary);">✏️ Meta ' + escapeHtml_(a.id) + (a.meta_editable_asociacion ? ' (la ingresa la Asociación)' : '') + '</td>' +
        D.meses.map(m => '<td><input type="number" min="0" class="ag-meta-in" data-ag-meta="' + escapeHtml_(a.id + '|' + m) + '" value="' + (D.metas[a.id + '|' + m] || 0) + '"></td>').join('') + '<td></td></tr>' : '';
      return fila + filaMeta;
    }).join('') +
    '</tbody><tfoot><tr><td class="izq"><b>Cumplimiento (tope 100 % por actividad)</b></td>' + D.meses.map(m => { const c = agrCumplimiento_([m]); return '<td><span class="ag-celda ' + (m > mesAct ? 'ag-n' : agrClaseCump_(c)) + '">' + (c == null ? '—' : c + '%') + '</span></td>'; }).join('') +
      '<td><span class="ag-celda ' + agrClaseCump_(cTemp) + '">' + (cTemp == null ? '—' : cTemp + '%') + '</span></td></tr></tfoot></table></div></div>' +
    '<div class="ag-caja"><h4>👥 Registros por gestor · ' + agrMesTxt_(mesAct) + '</h4>' +
      (Object.keys(porGestor).length ? '<table class="ag-tabla" style="max-width:520px;"><tbody>' + Object.keys(porGestor).sort((a, b) => porGestor[b] - porGestor[a])
        .map(id => '<tr><td class="izq">' + escapeHtml_(agrNombre_(id)) + '</td><td><b>' + porGestor[id] + '</b></td></tr>').join('') + '</tbody></table>'
        : '<div class="tb-vacio">Sin registros este mes.</div>') + '</div>';
}

function renderAgDiario_() {
  const D = state.ag.datos, cuerpo = document.getElementById('ag-cuerpo');
  const dia = state.ag.dia || tbHoyISO_(); state.ag.dia = dia;
  const regs = D.registros.filter(r => agrDiaDe_(r.fecha) === dia).sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)));
  const tareas = D.plan.filter(p => p.fecha === dia && p.estado !== 'cancelada');
  const pend = tareas.filter(p => p.estado === 'pendiente');
  const fechaTxt = agrFecha_(dia).toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  cuerpo.innerHTML =
    '<div class="ag-caja" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">' +
      '<button class="turnos-btn" data-ag-dia="-1">◀</button><input type="date" id="ag-dia" value="' + dia + '" style="padding:5px 8px;"><button class="turnos-btn" data-ag-dia="1">▶</button>' +
      '<button class="turnos-btn" data-ag-dia="hoy">Hoy</button><b style="margin-left:8px;text-transform:capitalize;">' + escapeHtml_(fechaTxt) + '</b>' +
      '<span style="margin-left:auto;font-size:12px;color:var(--text-tertiary);">' + regs.length + ' registro(s) · ' + tareas.length + ' planificada(s)</span></div>' +
    (pend.length ? '<div class="ag-caja" style="border-color:#FCA5A5;background:#FFF7F7;"><h4>⏳ Planificadas sin registrar (' + pend.length + ')</h4>' +
      pend.map(p => { const a = agrAct_(p.actividad_id); return '<div class="ag-bit"><span class="ico">' + (a.icono || '•') + '</span><div style="flex:1;"><b>' + escapeHtml_(a.id + ' · ' + (p.titulo || a.nombre)) + '</b><br><small>' +
        escapeHtml_((p.responsable ? agrNombre_(p.responsable) + ' · ' : '') + nombreComunaAgr_(p.id_comuna)) + '</small></div>' +
        (agrPuedeRegistrar_() ? '<button class="turnos-btn" data-ag-reg-plan="' + p.id + '">➕ Registrar</button>' : '') + '</div>'; }).join('') + '</div>' : '') +
    '<div class="ag-caja"><h4>📝 Bitácora del día</h4>' +
      (regs.length ? regs.map(r => {
        const a = agrAct_(r.actividad_id), d = r.datos || {};
        const titulo = d.nombre_agricultor || d.organizacion || d.ruta_rol || d.tipo_reunion || a.nombre;
        const agr = r.agricultor_id ? D.agricultores.find(x => x.id === r.agricultor_id) : null;
        return '<div class="ag-bit"><span class="ico">' + (a.icono || '•') + '</span><div style="flex:1;min-width:0;">' +
          '<b>' + new Date(r.fecha).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }) + ' · ' + escapeHtml_(a.id + ' ' + a.nombre) + '</b> — ' + escapeHtml_(titulo) +
          (agr ? ' <span class="ag-riesgo ' + escapeHtml_(agr.nivel_riesgo || '') + '">' + escapeHtml_(agr.codigo + (agr.nivel_riesgo ? ' · ' + agr.nivel_riesgo : '')) + '</span>' : '') +
          '<br><small style="color:var(--text-tertiary);">👤 ' + escapeHtml_(agrNombre_(r.usuario_id)) + ' · 📍 ' + escapeHtml_(r.comuna || 'sin comuna') +
            (r.participantes ? ' · 👥 ' + r.participantes : '') + ' · ' + (r.origen === 'web' ? '💻 web' : '📱 app') + (r.planificacion_id ? ' · ✅ planificada' : '') +
            (agrTxtGpsReal_(r) ? ' · <span style="color:' + (Number(r.ajuste_m) >= 30 ? '#B45309' : '#15803D') + ';font-weight:700;">' + agrTxtGpsReal_(r) + '</span>' : '') + '</small>' +
          (d.observaciones || d.acuerdos || d.incidencias || d.motivo ? '<div style="font-size:12px;margin-top:3px;">' + escapeHtml_(d.observaciones || d.acuerdos || d.incidencias || d.motivo) + '</div>' : '') +
          ((r.fotos || []).length ? '<div class="fotos" data-ag-fotos="' + r.id + '">' + r.fotos.map(() => '<span style="width:64px;height:64px;border-radius:8px;background:#F1F5F9;display:inline-block;"></span>').join('') + '</div>' : '') +
          '</div>' + (r.lat != null ? '<button class="turnos-btn" data-ag-ver-mapa="' + r.id + '" title="Ver en el mapa">🗺️</button>' : '') + '</div>';
      }).join('') : '<div class="tb-vacio">Sin registros este día.</div>') + '</div>';
  agrCargarFotos_(regs.filter(r => (r.fotos || []).length));
}
function nombreComunaAgr_(id) { const c = (state.comunas || []).find(x => Number(x.id_comuna) === Number(id)); return c ? c.comuna : (id ? 'Comuna ' + id : 'Sin comuna'); }
/** Fotos del bucket privado agr-fotos (URL firmada de 1 hora). */
async function agrCargarFotos_(regs) {
  for (const r of regs) {
    const cont = document.querySelector('[data-ag-fotos="' + r.id + '"]'); if (!cont) continue;
    try {
      const { data } = await supabaseClient.storage.from('agr-fotos').createSignedUrls(r.fotos, 3600);
      cont.innerHTML = (data || []).filter(x => x.signedUrl).map(x => '<a href="' + escapeHtml_(x.signedUrl) + '" target="_blank" rel="noopener"><img src="' + escapeHtml_(x.signedUrl) + '" alt="Foto"></a>').join('') || '<small>Fotos no disponibles</small>';
    } catch (e) { cont.innerHTML = '<small>Fotos no disponibles</small>'; }
  }
}

/** Rango del calendario de planificación: semana (lun–dom), quincena (1–15 / 16–fin) o mes. */
function agrRangoPlan_() {
  const ref = agrFecha_(state.ag.planRef || tbHoyISO_()), v = state.ag.planVista;
  let ini, fin;
  if (v === 'semana') { ini = new Date(ref); ini.setDate(ref.getDate() - ((ref.getDay() + 6) % 7)); fin = new Date(ini); fin.setDate(ini.getDate() + 6); }
  else if (v === 'quincena') { ini = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate() <= 15 ? 1 : 16, 12); fin = ref.getDate() <= 15 ? new Date(ref.getFullYear(), ref.getMonth(), 15, 12) : new Date(ref.getFullYear(), ref.getMonth() + 1, 0, 12); }
  else { ini = new Date(ref.getFullYear(), ref.getMonth(), 1, 12); fin = new Date(ref.getFullYear(), ref.getMonth() + 1, 0, 12); }
  return { ini, fin };
}
function renderAgPlan_() {
  const D = state.ag.datos, cuerpo = document.getElementById('ag-cuerpo'), hoy = tbHoyISO_();
  const { ini, fin } = agrRangoPlan_(), iIni = agrISO_(ini), iFin = agrISO_(fin);
  const tareas = D.plan.filter(p => p.fecha >= iIni && p.fecha <= iFin);
  const vivas = tareas.filter(p => p.estado !== 'cancelada'), hechas = vivas.filter(p => p.estado === 'realizada');
  const vencidas = vivas.filter(p => p.estado === 'pendiente' && p.fecha < hoy);
  const pct = vivas.length ? Math.round(hechas.length * 100 / vivas.length) : null;
  // Celdas: en el mes se completa la grilla desde el lunes
  const desde = new Date(ini); if (state.ag.planVista !== 'semana') desde.setDate(desde.getDate() - ((desde.getDay() + 6) % 7));
  const dias = []; for (const d = new Date(desde); agrISO_(d) <= iFin || dias.length % 7; d.setDate(d.getDate() + 1)) dias.push(agrISO_(d));
  const titulo = state.ag.planVista === 'semana' ? 'Semana del ' + ini.toLocaleDateString('es-CL', { day: 'numeric', month: 'short' }) + ' al ' + fin.toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' })
    : (state.ag.planVista === 'quincena' ? (ini.getDate() === 1 ? '1ª' : '2ª') + ' quincena de ' : '') + ini.toLocaleDateString('es-CL', { month: 'long', year: 'numeric' });
  const item = p => {
    const a = agrAct_(p.actividad_id), est = p.estado === 'pendiente' && p.fecha < hoy ? 'vencida' : p.estado;
    return '<span class="ag-t ' + est + '" data-ag-tarea="' + p.id + '" title="' + escapeHtml_(a.nombre + (p.titulo ? ' · ' + p.titulo : '') + ' · ' + est + (p.responsable ? ' · ' + agrNombre_(p.responsable) : '')) + '">' + (a.icono || '•') + ' ' + escapeHtml_(p.titulo || a.nombre) + '</span>';
  };
  cuerpo.innerHTML =
    '<div class="ag-caja" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">' +
      '<div class="sg-vistas">' + [['semana', 'Semanal'], ['quincena', 'Quincenal'], ['mes', 'Mensual']].map(([v, t]) => '<button data-ag-pvista="' + v + '"' + (state.ag.planVista === v ? ' class="on"' : '') + '>' + t + '</button>').join('') + '</div>' +
      '<button class="turnos-btn" data-ag-pnav="-1">◀</button><button class="turnos-btn" data-ag-pnav="0">Hoy</button><button class="turnos-btn" data-ag-pnav="1">▶</button>' +
      '<b style="text-transform:capitalize;">' + escapeHtml_(titulo) + '</b>' +
      (agrPuedeRegistrar_() ? '<button class="btn-primary" data-ag-planificar="' + (hoy >= iIni && hoy <= iFin ? hoy : iIni) + '" style="margin-left:auto;padding:7px 12px;">➕ Planificar actividad</button>' : '') + '</div>' +
    '<div class="ag-kpis">' +
      '<div class="ag-kpi">' + imTorta_(pct || 0, 58) + '<div><b>' + (pct == null ? '—' : pct + '%') + '</b><small>Cumplimiento de lo planificado</small></div></div>' +
      '<div class="ag-kpi"><span style="font-size:24px;">🗓️</span><div><b>' + vivas.length + '</b><small>Planificadas en el periodo</small></div></div>' +
      '<div class="ag-kpi"><span style="font-size:24px;">✅</span><div><b>' + hechas.length + '</b><small>Realizadas</small></div></div>' +
      '<div class="ag-kpi"><span style="font-size:24px;">⏰</span><div><b style="color:' + (vencidas.length ? '#DC2626' : 'inherit') + ';">' + vencidas.length + '</b><small>Vencidas sin registrar</small></div></div>' +
    '</div>' +
    '<div class="ag-cal">' + ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map(x => '<div class="cab">' + x + '</div>').join('') +
      dias.map(d => {
        const fuera = d < iIni || d > iFin;
        const ts = D.plan.filter(p => p.fecha === d), regsSin = D.registros.filter(r => !r.planificacion_id && agrDiaDe_(r.fecha) === d);
        return '<div class="dia' + (d === hoy ? ' hoy' : '') + (fuera ? ' fuera' : '') + '" data-ag-dia-cal="' + d + '"><div class="n"><span>' + Number(d.slice(8)) + '</span>' +
          (ts.length || regsSin.length ? '<small>' + ts.length + ' plan · ' + (ts.filter(p => p.estado === 'realizada').length + regsSin.length) + ' ✔</small>' : '') + '</div>' +
          ts.map(item).join('') + regsSin.slice(0, 4).map(r => { const a = agrAct_(r.actividad_id); return '<span class="ag-t reg" title="Registrado sin planificar">✔ ' + escapeHtml_((a.icono || '') + ' ' + a.nombre) + '</span>'; }).join('') +
          (regsSin.length > 4 ? '<small>+' + (regsSin.length - 4) + ' más</small>' : '') + '</div>';
      }).join('') + '</div>' +
    '<p style="font-size:11.5px;color:var(--text-tertiary);margin-top:8px;">Azul = planificada · verde tachado = realizada · rojo = vencida · punteado = registrada sin planificar. ' +
      (agrPuedeRegistrar_() ? 'Clic en un día para planificar; clic en una actividad para registrarla, cancelarla o eliminarla.' : 'Solo lectura.') + '</p>';
}

function renderAgListado_() {
  const D = state.ag.datos, cuerpo = document.getElementById('ag-cuerpo'), hoy = tbHoyISO_();
  const q = normalizarBusqueda_(state.ag.q || ''), fr = state.ag.riesgo;
  const lista = D.agricultores.filter(a => (!fr || a.nivel_riesgo === fr) && (!q || normalizarBusqueda_([a.codigo, a.nombre, a.fundo, a.comuna].join(' ')).includes(q)));
  const lim = new Date(); lim.setDate(lim.getDate() + 14); const iLim = agrISO_(lim);
  const quemas = D.agricultores.filter(a => a.fecha_quema && a.fecha_quema >= hoy && a.fecha_quema <= iLim).sort((a, b) => a.fecha_quema.localeCompare(b.fecha_quema));
  const sn = v => v == null ? '—' : v ? 'Sí' : 'No';
  const fF = f => f ? agrFecha_(f).toLocaleDateString('es-CL', { day: '2-digit', month: 'short' }) : '—';
  cuerpo.innerHTML =
    '<div class="ag-caja" style="border-color:#FDBA74;background:#FFFBF5;"><h4>🔥 Quemas estimadas en los próximos 14 días (' + quemas.length + ')</h4>' +
      (quemas.length ? quemas.map(a => '<span class="ag-t pendiente" style="display:inline-block;margin:2px;">' + fF(a.fecha_quema) + ' · ' + escapeHtml_(a.nombre + (a.fundo ? ' (' + a.fundo + ')' : '') + ' · ' + (a.comuna || '')) + '</span>').join('')
        : '<small style="color:var(--text-tertiary);">No hay quemas estimadas en las próximas 2 semanas.</small>') + '</div>' +
    '<div class="ag-caja"><h4>👨‍🌾 Agricultores (' + lista.length + ' de ' + D.agricultores.length + ')' +
      '<input id="ag-q" placeholder="🔎 Buscar por código, nombre, fundo o comuna…" value="' + escapeHtml_(state.ag.q || '') + '" style="margin-left:auto;padding:6px 10px;min-width:240px;">' +
      '<select id="ag-riesgo" style="padding:6px;"><option value="">Todos los riesgos</option>' + ['alto', 'medio', 'bajo'].map(r => '<option value="' + r + '"' + (fr === r ? ' selected' : '') + '>Riesgo ' + r + '</option>').join('') + '</select></h4>' +
    '<div style="overflow:auto;"><table class="ag-tabla"><thead><tr><th class="izq">Código</th><th class="izq">Agricultor</th><th class="izq">Fundo</th><th class="izq">Comuna</th><th>Sup. (ha)</th><th class="izq">Cultivos</th><th>Riesgo</th><th>Protección</th><th>Cortafuegos</th><th>Zona poblada</th><th>Vinculación</th><th>Cosecha</th><th>Quema</th><th>Visitas</th><th>Última visita</th></tr></thead><tbody>' +
      (lista.length ? lista.map(a => '<tr><td class="izq"><b>' + escapeHtml_(a.codigo) + '</b></td><td class="izq">' + escapeHtml_(a.nombre) + (a.telefono ? '<br><small>📞 ' + escapeHtml_(a.telefono) + '</small>' : '') + '</td>' +
        '<td class="izq">' + escapeHtml_(a.fundo || '—') + '</td><td class="izq">' + escapeHtml_(a.comuna || '—') + '</td><td>' + (a.superficie_ha != null ? Number(a.superficie_ha).toLocaleString('es-CL') : '—') + '</td>' +
        '<td class="izq">' + escapeHtml_((a.cultivos || []).join(', ') || '—') + '</td><td>' + (a.nivel_riesgo ? '<span class="ag-riesgo ' + a.nivel_riesgo + '">' + a.nivel_riesgo + '</span>' : '—') + '</td>' +
        '<td>' + sn(a.recursos_proteccion) + '</td><td>' + sn(a.cortafuegos) + '</td><td>' + sn(a.zona_poblada) + '</td><td>' + escapeHtml_(a.vinculacion || '—') + '</td>' +
        '<td>' + fF(a.fecha_cosecha) + '</td><td>' + fF(a.fecha_quema) + '</td><td>' + (a.visitas || 0) + '</td><td>' + (a.ultima_visita ? fF(agrDiaDe_(a.ultima_visita)) : '—') + '</td></tr>').join('')
        : '<tr><td colspan="15" class="tb-vacio">Sin agricultores. Se crean con cada visita o evaluación (A3 / A9) desde la app o con ➕ Registrar.</td></tr>') +
    '</tbody></table></div></div>';
}

/** 🗺️ Visor de gestión (20-10-2026): estilo sobrio (mapa base Esri Light Gray Canvas o satélite Esri), controles flotantes y una línea de
 *  tiempo a la izquierda (Hoy · 24 h · 48 h · 72 h · 7 días · Mes · Todo) que filtra los pinchos de las actividades. Sin rutas por ahora.
 *  Administrador y Jefes ven además el GPS real del teléfono cuando el pincho se movió ≥ 30 m. */
const AGV_BASES = {
  mapa: () => L.layerGroup([
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, maxNativeZoom: 16, attribution: 'Tiles © Esri' }),
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, maxNativeZoom: 16 })]),
  satelite: () => L.layerGroup([
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, maxNativeZoom: 18, attribution: 'Imágenes © Esri' }),
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, maxNativeZoom: 18 })]),
};
const AGV_PERIODOS = [['hoy', 'Hoy'], ['24', '24 h'], ['48', '48 h'], ['72', '72 h'], ['168', '7 días'], ['720', 'Mes'], ['0', 'Todo']];
function agvDesde_(k) {
  if (k === 'hoy') { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); }
  return Number(k) ? Date.now() - Number(k) * 3600e3 : 0;
}
function renderAgMapa_() {
  const D = state.ag.datos, cuerpo = document.getElementById('ag-cuerpo');
  if (state.ag.mapa) { try { state.ag.mapa.remove(); } catch (e) {} state.ag.mapa = null; }
  const S = state.ag;
  if (!S.periodo || !AGV_PERIODOS.some(p => p[0] === S.periodo)) S.periodo = '168';
  S.base = S.base || 'mapa';
  S.capasOn = S.capasOn || { act: true, agr: false, gps: true };
  const supervisa = agrVeGpsReal_();
  cuerpo.innerHTML =
    '<div class="agv" id="agv">' +
      '<div id="ag-mapa"></div>' +
      '<div class="agv-resumen" id="agv-resumen"></div>' +
      '<div class="agv-tiempo" id="agv-tiempo"><div class="t">Actividades</div>' +
        AGV_PERIODOS.map(([k, tx]) => '<button data-agv-per="' + k + '"' + (k === S.periodo ? ' class="on"' : '') + '><i></i>' + tx + '</button>').join('') + '</div>' +
      '<div class="agv-ley" id="agv-ley"></div>' +
      '<button class="agv-btn agv-capas-btn" id="agv-capas-btn" title="Mapa base y capas"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg></button>' +
      '<div class="agv-pop" id="agv-pop" hidden>' +
        '<div class="t">Mapa base</div>' +
        '<div class="agv-bases">' + [['mapa', 'Mapa'], ['satelite', 'Satélite']].map(([k, tx]) => '<button data-agv-base="' + k + '"' + (S.base === k ? ' class="on"' : '') + '><span class="pv pv-' + k + '"></span>' + tx + '</button>').join('') + '</div>' +
        '<div class="t">Capas</div>' +
        '<label><input type="checkbox" data-agv-capa="act"' + (S.capasOn.act ? ' checked' : '') + '> Actividades</label>' +
        '<label><input type="checkbox" data-agv-capa="agr"' + (S.capasOn.agr ? ' checked' : '') + '> Agricultores (por riesgo)</label>' +
        (supervisa ? '<label><input type="checkbox" data-agv-capa="gps"' + (S.capasOn.gps ? ' checked' : '') + '> GPS real (puntos movidos)</label>' : '') +
      '</div>' +
      '<button class="agv-btn agv-full" id="agv-full" title="Pantalla completa"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg></button>' +
    '</div>';
  const m = L.map('ag-mapa', { zoomControl: false, attributionControl: true }).setView([-38.15, -72.35], 10);
  S.mapa = m;
  L.control.zoom({ position: 'topleft' }).addTo(m);
  L.control.scale({ position: 'bottomleft', imperial: false, maxWidth: 110 }).addTo(m);
  S.capaBase = AGV_BASES[S.base]().addTo(m);
  S.gAct = L.featureGroup(); S.gAgr = L.layerGroup(); S.gGps = L.layerGroup();
  pintarAgvCapas_(true);
  const agv = document.getElementById('agv');
  agv.addEventListener('click', e => {
    const per = e.target.closest('[data-agv-per]');
    if (per) { S.periodo = per.dataset.agvPer; agv.querySelectorAll('[data-agv-per]').forEach(b => b.classList.toggle('on', b === per)); pintarAgvCapas_(true); return; }
    const base = e.target.closest('[data-agv-base]');
    if (base) {
      S.base = base.dataset.agvBase; m.removeLayer(S.capaBase); S.capaBase = AGV_BASES[S.base]().addTo(m); S.capaBase.bringToBack && S.capaBase.bringToBack();
      agv.querySelectorAll('[data-agv-base]').forEach(b => b.classList.toggle('on', b === base)); return;
    }
    if (e.target.closest('#agv-capas-btn')) { const p = document.getElementById('agv-pop'); p.hidden = !p.hidden; return; }
    if (e.target.closest('#agv-full')) {
      if (document.fullscreenElement) document.exitFullscreen(); else if (agv.requestFullscreen) agv.requestFullscreen();
      setTimeout(() => m.invalidateSize(), 250); return;
    }
  });
  agv.addEventListener('change', e => { const c = e.target.dataset.agvCapa; if (c) { S.capasOn[c] = e.target.checked; pintarAgvCapas_(false); } });
  m.on('click', () => { const p = document.getElementById('agv-pop'); if (p) p.hidden = true; });
  setTimeout(() => m.invalidateSize(), 80);
  return Promise.resolve();
}
/** Dibuja los pinchos del periodo elegido, la leyenda y el resumen; encuadra si se pide. */
function pintarAgvCapas_(encuadrar) {
  const S = state.ag, D = S.datos, m = S.mapa; if (!m) return;
  [S.gAct, S.gAgr, S.gGps].forEach(g => { g.clearLayers(); m.removeLayer(g); });
  const desde = agvDesde_(S.periodo), supervisa = agrVeGpsReal_();
  const regs = D.registros.filter(r => r.lat != null && new Date(r.fecha).getTime() >= desde);
  regs.forEach(r => {
    const a = agrAct_(r.actividad_id), d = r.datos || {}, col = AGR_COLOR_FORM[r.formulario] || '#475569';
    const titulo = d.nombre_agricultor || d.organizacion || d.ruta_rol || d.tipo_reunion || '';
    L.marker([r.lat, r.lng], { icon: L.divIcon({ className: '', html: '<div class="agv-pin" style="background:' + col + '"><span>' + (a.icono || '📍') + '</span></div>', iconSize: [28, 28], iconAnchor: [14, 28], popupAnchor: [0, -26] }) })
      .bindPopup('<div class="agv-popup"><b>' + escapeHtml_(a.nombre) + '</b>' + (titulo ? '<div>' + escapeHtml_(titulo) + '</div>' : '') +
        '<small>' + new Date(r.fecha).toLocaleString('es-CL', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) + ' · ' + escapeHtml_(agrNombre_(r.usuario_id)) +
        (r.comuna ? ' · ' + escapeHtml_(r.comuna) : '') + (r.participantes ? ' · ' + r.participantes + ' participantes' : '') + '</small>' +
        (agrTxtGpsReal_(r) ? '<small class="gps">' + agrTxtGpsReal_(r) + '</small>' : '') + '</div>').addTo(S.gAct);
    if (supervisa && r.gps_lat != null && Number(r.ajuste_m) >= 30) {
      L.polyline([[r.gps_lat, r.gps_lng], [r.lat, r.lng]], { color: '#B45309', weight: 1.6, dashArray: '4 5' }).addTo(S.gGps);
      L.circleMarker([r.gps_lat, r.gps_lng], { radius: 4, color: '#fff', weight: 1.5, fillColor: '#B45309', fillOpacity: 1 })
        .bindTooltip('GPS real del teléfono al registrar · ' + Math.round(Number(r.ajuste_m)) + ' m del punto').addTo(S.gGps);
    }
  });
  D.agricultores.filter(a => a.lat != null).forEach(a => L.circleMarker([a.lat, a.lng], { radius: 6, color: '#fff', weight: 2, fillColor: AGR_RIESGO_COLOR[a.nivel_riesgo] || '#64748B', fillOpacity: .95 })
    .bindPopup('<div class="agv-popup"><b>' + escapeHtml_(a.nombre) + '</b><div>' + escapeHtml_(a.codigo + (a.fundo ? ' · ' + a.fundo : '')) + '</div><small>Riesgo ' + escapeHtml_(a.nivel_riesgo || '—') +
      (a.superficie_ha ? ' · ' + a.superficie_ha + ' ha' : '') + (a.fecha_quema ? ' · quema ' + escapeHtml_(a.fecha_quema) : '') + ' · ' + (a.visitas || 0) + ' visita(s)</small></div>').addTo(S.gAgr));
  if (S.capasOn.act) S.gAct.addTo(m);
  if (S.capasOn.agr) S.gAgr.addTo(m);
  if (supervisa && S.capasOn.gps) S.gGps.addTo(m);
  // Leyenda y resumen
  const porForm = {}; regs.forEach(r => { porForm[r.formulario] = (porForm[r.formulario] || 0) + 1; });
  const per = AGV_PERIODOS.find(p => p[0] === S.periodo);
  document.getElementById('agv-resumen').innerHTML = '<b>' + regs.length + '</b> actividad' + (regs.length === 1 ? '' : 'es') + ' · ' + escapeHtml_(per ? per[1].toLowerCase() : '');
  document.getElementById('agv-ley').innerHTML = Object.keys(AGR_COLOR_FORM).map(f => '<span' + (porForm[f] ? '' : ' class="cero"') + '><i style="background:' + AGR_COLOR_FORM[f] + '"></i>' +
    escapeHtml_(AGR_FORMULARIOS[f].nombre.split(' /')[0]) + ' <b>' + (porForm[f] || 0) + '</b></span>').join('');
  if (encuadrar && regs.length && S.capasOn.act) m.fitBounds(S.gAct.getBounds(), { padding: [70, 70], maxZoom: 14 });
}

function clicAgricultores_(e) {
  const D = state.ag.datos; if (!D) return;
  const t = e.target;
  const nav = t.closest('[data-ag-dia]');
  if (nav) {
    const v = nav.dataset.agDia;
    if (v === 'hoy') state.ag.dia = tbHoyISO_();
    else { const d = agrFecha_(state.ag.dia || tbHoyISO_()); d.setDate(d.getDate() + Number(v)); state.ag.dia = agrISO_(d); }
    renderAgDiario_(); return;
  }
  const pv = t.closest('[data-ag-pvista]'); if (pv) { state.ag.planVista = pv.dataset.agPvista; renderAgPlan_(); return; }
  const pe = t.closest('[data-ag-periodo]'); if (pe) { state.ag.periodo = pe.dataset.agPeriodo; renderAgMapa_(); return; }
  const pn = t.closest('[data-ag-pnav]');
  if (pn) {
    const n = Number(pn.dataset.agPnav);
    if (!n) state.ag.planRef = tbHoyISO_();
    else {
      const { ini, fin } = agrRangoPlan_(), d = n > 0 ? new Date(fin) : new Date(ini);
      d.setDate(d.getDate() + n); state.ag.planRef = agrISO_(d);
    }
    renderAgPlan_(); return;
  }
  const rp = t.closest('[data-ag-reg-plan]'); if (rp) { const p = D.plan.find(x => x.id === rp.dataset.agRegPlan); if (p) abrirRegistroAgr_({ plan: p }); return; }
  const tarea = t.closest('[data-ag-tarea]'); if (tarea) { e.stopPropagation(); abrirTareaAgr_(tarea.dataset.agTarea); return; }
  const np = t.closest('[data-ag-planificar]'); if (np) { abrirPlanificarAgr_(np.dataset.agPlanificar); return; }
  const dc = t.closest('[data-ag-dia-cal]'); if (dc && agrPuedeRegistrar_()) { abrirPlanificarAgr_(dc.dataset.agDiaCal); return; }
  const vm = t.closest('[data-ag-ver-mapa]');
  if (vm) {
    const r = D.registros.find(x => x.id === vm.dataset.agVerMapa); if (!r) return;
    state.ag.tab = 'mapa';
    document.querySelectorAll('#ag-vistas [data-ag-tab]').forEach(x => x.classList.toggle('on', x.dataset.agTab === 'mapa'));
    state.ag.periodo = '0';   // toda la temporada: así el registro elegido siempre aparece
    renderAgMapa_().then(() => { if (state.ag.mapa) state.ag.mapa.setView([r.lat, r.lng], 15); });
  }
}
async function cambioAgricultores_(e) {
  const t = e.target;
  if (t.id === 'ag-dia' && t.value) { state.ag.dia = t.value; renderAgDiario_(); return; }
  if (t.id === 'ag-riesgo') { state.ag.riesgo = t.value; renderAgListado_(); return; }
  if (t.id === 'ag-q') { state.ag.q = t.value; renderAgListado_(); return; }
  if (t.dataset.agMeta) {
    const [act, mes] = t.dataset.agMeta.split('|'), meta = Math.max(0, parseInt(t.value, 10) || 0);
    const { error } = await supabaseClient.from('agr_metas').upsert({ actividad_id: act, mes: mes + '-01', meta, actualizado_en: new Date().toISOString() }, { onConflict: 'actividad_id,mes' });
    if (error) { mostrarToast_('No se pudo guardar la meta: ' + error.message); t.value = state.ag.datos.metas[t.dataset.agMeta] || 0; return; }
    state.ag.datos.metas[t.dataset.agMeta] = meta;
    mostrarToast_('✅ Meta ' + act + ' · ' + agrMesTxt_(mes) + ' = ' + meta);
    renderAgTablero_();
  }
}

/** Ventana genérica del módulo (devuelve el contenedor). */
function agrModal_(html, ancho) {
  let ov = document.getElementById('ag-overlay');
  if (!ov) {
    ov = document.createElement('div'); ov.id = 'ag-overlay'; ov.className = 'modal-overlay';
    document.body.appendChild(ov);
    ov.addEventListener('click', e => { if (e.target === ov) agrCerrarModal_(); });
  }
  ov.innerHTML = '<div class="modal-card ag-form" style="max-width:' + (ancho || 520) + 'px;width:calc(100% - 24px);max-height:92vh;overflow:auto;">' + html + '</div>';
  ov.classList.add('show');
  return ov;
}
function agrCerrarModal_() {
  const ov = document.getElementById('ag-overlay'); if (!ov) return;
  if (state.ag.mapaModal) { try { state.ag.mapaModal.remove(); } catch (e) {} state.ag.mapaModal = null; }
  ov.classList.remove('show'); ov.innerHTML = '';
}

/** ➕ Planificar: una actividad con frecuencia → una fila por fecha (misma serie) hasta la fecha final. */
function abrirPlanificarAgr_(fecha) {
  const D = state.ag.datos; if (!agrPuedeRegistrar_()) return;
  const fin = String(D.asoc.temporada_fin || '').slice(0, 10) || fecha;
  const opGestores = '<option value="">— Sin responsable —</option>' + D.gestores.map(id => '<option value="' + id + '">' + escapeHtml_(agrNombre_(id)) + '</option>').join('');
  const ov = agrModal_('<h3>🗓️ Planificar actividad</h3>' +
    '<div class="form-group"><label>Actividad</label><select id="agp-act">' + D.actividades.filter(a => a.activo !== false).map(a => '<option value="' + a.id + '">' + escapeHtml_((a.icono || '') + ' ' + a.id + ' · ' + a.nombre) + '</option>').join('') + '</select></div>' +
    '<div class="form-group"><label>Título / detalle (opcional)</label><input id="agp-tit" placeholder="Ej. Visita a fundo Las Lomas"></div>' +
    '<div class="fila"><div class="form-group"><label>Fecha</label><input type="date" id="agp-fecha" value="' + fecha + '"></div>' +
      '<div class="form-group"><label>Frecuencia</label><select id="agp-frec">' + AGR_FRECUENCIAS.map(([v, t]) => '<option value="' + v + '">' + t + '</option>').join('') + '</select></div></div>' +
    '<div class="fila"><div class="form-group" id="agp-hasta-w" style="display:none;"><label>Repetir hasta</label><input type="date" id="agp-hasta" value="' + fin + '"></div>' +
      '<div class="form-group"><label>Comuna</label><select id="agp-comuna"><option value="">—</option>' + D.comunasAsoc.map(c => '<option value="' + c.id_comuna + '">' + escapeHtml_(c.comuna) + '</option>').join('') + '</select></div></div>' +
    '<div class="form-group"><label>Responsable (gestor de la Asociación)</label><select id="agp-resp">' + opGestores + '</select></div>' +
    '<p class="coords" id="agp-resumen"></p>' +
    '<div class="modal-actions" style="display:flex;gap:8px;justify-content:flex-end;"><button class="btn-secondary" id="agp-cancelar">Cancelar</button><button class="btn-primary" id="agp-ok">Planificar</button></div>');
  const fechas = () => {
    const f = ov.querySelector('#agp-frec').value, ini = ov.querySelector('#agp-fecha').value, hasta = ov.querySelector('#agp-hasta').value || ini;
    if (!ini) return [];
    if (f === 'unica') return [ini];
    const out = [], d0 = agrFecha_(ini);
    for (let i = 0; i < 60; i++) {
      const d = new Date(d0);
      if (f === 'semanal') d.setDate(d0.getDate() + 7 * i);
      else if (f === 'quincenal') d.setDate(d0.getDate() + 14 * i);
      else { d.setDate(1); d.setMonth(d0.getMonth() + i); d.setDate(Math.min(d0.getDate(), new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate())); }
      const s = agrISO_(d); if (s > hasta) break; out.push(s);
    }
    return out;
  };
  const resumen = () => {
    ov.querySelector('#agp-hasta-w').style.display = ov.querySelector('#agp-frec').value === 'unica' ? 'none' : '';
    const fs = fechas(); ov.querySelector('#agp-resumen').textContent = fs.length ? 'Se crearán ' + fs.length + ' actividad(es): ' + fs.slice(0, 6).map(s => agrFecha_(s).toLocaleDateString('es-CL', { day: '2-digit', month: 'short' })).join(', ') + (fs.length > 6 ? '…' : '') : 'Revisa las fechas.';
  };
  ['#agp-frec', '#agp-fecha', '#agp-hasta'].forEach(s => ov.querySelector(s).addEventListener('change', resumen)); resumen();
  ov.querySelector('#agp-cancelar').addEventListener('click', agrCerrarModal_);
  ov.querySelector('#agp-ok').addEventListener('click', async () => {
    const fs = fechas(); if (!fs.length) return;
    const frec = ov.querySelector('#agp-frec').value, serie = fs.length > 1 ? (crypto.randomUUID ? crypto.randomUUID() : null) : null;
    const filas = fs.map(f => ({ actividad_id: ov.querySelector('#agp-act').value, titulo: ov.querySelector('#agp-tit').value.trim() || null, fecha: f, frecuencia: frec, serie_id: serie,
      id_comuna: Number(ov.querySelector('#agp-comuna').value) || null, responsable: ov.querySelector('#agp-resp').value || null }));
    const btn = ov.querySelector('#agp-ok'); btn.disabled = true; btn.textContent = 'Guardando…';
    const { data, error } = await supabaseClient.from('agr_planificacion').insert(filas).select();
    if (error) { btn.disabled = false; btn.textContent = 'Planificar'; mostrarToast_('No se pudo planificar: ' + error.message); return; }
    D.plan = D.plan.concat(data || []).sort((a, b) => a.fecha.localeCompare(b.fecha));
    agrCerrarModal_(); mostrarToast_('✅ ' + (data || []).length + ' actividad(es) planificada(s).'); renderAgricultores_();
  });
}
/** Clic en una actividad planificada: registrar, cancelar o eliminar (la serie completa, solo las pendientes). */
function abrirTareaAgr_(id) {
  const D = state.ag.datos, p = D.plan.find(x => x.id === id); if (!p) return;
  const a = agrAct_(p.actividad_id), edita = agrPuedeRegistrar_();
  const enSerie = p.serie_id ? D.plan.filter(x => x.serie_id === p.serie_id && x.estado === 'pendiente').length : 0;
  const ov = agrModal_('<h3>' + (a.icono || '') + ' ' + escapeHtml_(a.id + ' · ' + a.nombre) + '</h3>' +
    '<p class="coords">' + escapeHtml_((p.titulo ? p.titulo + ' · ' : '') + agrFecha_(p.fecha).toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' }) +
      ' · ' + (AGR_FRECUENCIAS.find(f => f[0] === p.frecuencia) || ['', p.frecuencia])[1] + ' · ' + nombreComunaAgr_(p.id_comuna) + (p.responsable ? ' · ' + agrNombre_(p.responsable) : '')) + '</p>' +
    '<p><b>Estado:</b> ' + escapeHtml_(p.estado) + '</p>' +
    '<div class="modal-actions" style="display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;">' +
      (edita && p.estado === 'pendiente' ? '<button class="btn-primary" data-x="reg">➕ Registrar ahora</button><button class="btn-secondary" data-x="cancelar">🚫 Cancelar esta</button>' : '') +
      (edita && p.estado === 'cancelada' ? '<button class="btn-secondary" data-x="reactivar">↩️ Reactivar</button>' : '') +
      (edita && p.estado !== 'realizada' ? '<button class="btn-secondary" data-x="eliminar" style="color:#B91C1C;">🗑️ Eliminar</button>' : '') +
      (edita && enSerie > 1 ? '<button class="btn-secondary" data-x="serie" style="color:#B91C1C;">🗑️ Eliminar la serie (' + enSerie + ' pendientes)</button>' : '') +
      '<button class="btn-secondary" data-x="cerrar">Cerrar</button></div>', 480);
  ov.querySelectorAll('[data-x]').forEach(b => b.addEventListener('click', async () => {
    const x = b.dataset.x;
    if (x === 'cerrar') { agrCerrarModal_(); return; }
    if (x === 'reg') { agrCerrarModal_(); abrirRegistroAgr_({ plan: p }); return; }
    let q;
    if (x === 'cancelar' || x === 'reactivar') q = supabaseClient.from('agr_planificacion').update({ estado: x === 'cancelar' ? 'cancelada' : 'pendiente' }).eq('id', p.id);
    else if (x === 'eliminar') { if (!confirm('¿Eliminar esta actividad planificada?')) return; q = supabaseClient.from('agr_planificacion').delete().eq('id', p.id); }
    else if (x === 'serie') { if (!confirm('¿Eliminar las ' + enSerie + ' actividades pendientes de esta serie?')) return; q = supabaseClient.from('agr_planificacion').delete().eq('serie_id', p.serie_id).eq('estado', 'pendiente'); }
    const { error } = await q;
    if (error) { mostrarToast_('No se pudo: ' + error.message); return; }
    if (x === 'cancelar' || x === 'reactivar') p.estado = x === 'cancelar' ? 'cancelada' : 'pendiente';
    else if (x === 'eliminar') D.plan = D.plan.filter(y => y.id !== p.id);
    else D.plan = D.plan.filter(y => !(y.serie_id === p.serie_id && y.estado === 'pendiente'));
    agrCerrarModal_(); renderAgricultores_();
  }));
}

/** Campo de formulario (mismos campos que la app de terreno). */
function agrCampoHtml_(c, v) {
  const id = 'agf-' + c.k, req = c.req ? ' *' : '';
  if (c.tipo === 'select') return '<div class="form-group"><label>' + escapeHtml_(c.t) + req + '</label><select id="' + id + '"><option value="">—</option>' + c.op.map(o => '<option value="' + escapeHtml_(o) + '"' + (v === o ? ' selected' : '') + '>' + escapeHtml_(o.charAt(0).toUpperCase() + o.slice(1)) + '</option>').join('') + '</select></div>';
  if (c.tipo === 'multi') return '<div class="form-group"><label>' + escapeHtml_(c.t) + '</label><div class="ag-chk" id="' + id + '">' + c.op.map(o => '<label><input type="checkbox" value="' + escapeHtml_(o) + '"' + ((v || []).includes(o) ? ' checked' : '') + '> ' + escapeHtml_(o) + '</label>').join('') + '</div></div>';
  if (c.tipo === 'bool') return '<div class="form-group"><label>' + escapeHtml_(c.t) + '</label><select id="' + id + '"><option value="">—</option><option value="true"' + (v === true ? ' selected' : '') + '>Sí</option><option value="false"' + (v === false ? ' selected' : '') + '>No</option></select></div>';
  if (c.tipo === 'textarea') return '<div class="form-group" style="grid-column:1/-1;"><label>' + escapeHtml_(c.t) + req + '</label><textarea id="' + id + '" rows="2">' + escapeHtml_(v || '') + '</textarea></div>';
  return '<div class="form-group"><label>' + escapeHtml_(c.t) + req + '</label><input id="' + id + '" type="' + (c.tipo === 'number' ? 'number' : c.tipo === 'date' ? 'date' : 'text') + '"' + (c.tipo === 'number' ? ' min="0" step="any"' : '') + ' value="' + escapeHtml_(v == null ? '' : v) + '"></div>';
}
function agrLeerCampos_(ov, form) {
  const datos = {}, faltan = [];
  AGR_FORMULARIOS[form].campos.forEach(c => {
    const el = ov.querySelector('#agf-' + c.k); if (!el) return;
    let v;
    if (c.tipo === 'multi') v = [...el.querySelectorAll('input:checked')].map(i => i.value);
    else if (c.tipo === 'bool') v = el.value === '' ? null : el.value === 'true';
    else if (c.tipo === 'number') v = el.value === '' ? null : Number(el.value);
    else v = el.value.trim() || null;
    if (c.req && (v == null || (Array.isArray(v) && !v.length))) faltan.push(c.t);
    if (v != null && !(Array.isArray(v) && !v.length)) datos[c.k] = v;
  });
  return { datos, faltan };
}
/** Foto → JPEG de hasta 1600 px (más liviana para subir). */
function agrComprimirFoto_(file) {
  return new Promise(ok => {
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => {
      const k = Math.min(1, 1600 / Math.max(img.width, img.height)), cv = document.createElement('canvas');
      cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k);
      cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height); URL.revokeObjectURL(url);
      cv.toBlob(b => ok(b || file), 'image/jpeg', 0.8);
    };
    img.onerror = () => { URL.revokeObjectURL(url); ok(file); };
    img.src = url;
  });
}

/** ➕ Registrar una actividad realizada desde la web (mismo RPC que la app: agr_guardar_registro). */
function abrirRegistroAgr_(op) {
  const D = state.ag.datos; if (!D || !agrPuedeRegistrar_()) return;
  const plan = op.plan || null;
  const ahora = new Date(); ahora.setMinutes(ahora.getMinutes() - ahora.getTimezoneOffset());
  const fechaIni = plan ? plan.fecha + 'T' + ahora.toISOString().slice(11, 16) : ahora.toISOString().slice(0, 16);
  const ov = agrModal_('<h3>➕ Registrar actividad</h3>' +
    '<div class="fila"><div class="form-group"><label>Actividad</label><select id="agr-act">' + D.actividades.filter(a => a.activo !== false).map(a => '<option value="' + a.id + '"' + (plan && plan.actividad_id === a.id ? ' selected' : '') + '>' + escapeHtml_((a.icono || '') + ' ' + a.id + ' · ' + a.nombre) + '</option>').join('') + '</select></div>' +
      '<div class="form-group"><label>Fecha y hora</label><input type="datetime-local" id="agr-fecha" value="' + fechaIni + '"></div></div>' +
    '<div class="form-group"><label>Planificada (opcional)</label><select id="agr-plan"></select></div>' +
    '<div class="form-group" id="agr-agr-w"><label>Agricultor</label><select id="agr-agr"><option value="">➕ Nuevo agricultor</option>' +
      D.agricultores.map(a => '<option value="' + a.id + '">' + escapeHtml_(a.codigo + ' · ' + a.nombre + (a.fundo ? ' (' + a.fundo + ')' : '')) + '</option>').join('') + '</select></div>' +
    '<div class="fila" id="agr-campos"></div>' +
    '<div class="form-group"><label>Ubicación (clic en el mapa)</label><div id="agr-mapa" style="height:220px;border-radius:10px;border:1px solid #CBD5E1;"></div>' +
      '<div class="fila" style="margin-top:6px;"><input id="agr-lat" placeholder="Latitud" type="number" step="any"><input id="agr-lng" placeholder="Longitud" type="number" step="any"></div></div>' +
    '<div class="form-group"><label>Fotos (hasta 4)</label><input type="file" id="agr-fotos" accept="image/*" multiple></div>' +
    '<p id="agr-error" style="color:#B91C1C;font-size:12px;"></p>' +
    '<div class="modal-actions" style="display:flex;gap:8px;justify-content:flex-end;"><button class="btn-secondary" id="agr-cancelar">Cancelar</button><button class="btn-primary" id="agr-ok">Guardar registro</button></div>', 640);
  const selAct = ov.querySelector('#agr-act'), selAgr = ov.querySelector('#agr-agr');
  const pintar = () => {
    const a = agrAct_(selAct.value), form = a.formulario;
    ov.querySelector('#agr-agr-w').style.display = form === 'agricultor' ? '' : 'none';
    const ag = form === 'agricultor' && selAgr.value ? D.agricultores.find(x => x.id === selAgr.value) : null;
    const pre = ag ? { nombre_agricultor: ag.nombre, fundo: ag.fundo, telefono: ag.telefono, superficie_ha: ag.superficie_ha, cultivos: ag.cultivos, nivel_riesgo: ag.nivel_riesgo,
      recursos_proteccion: ag.recursos_proteccion, recursos_detalle: ag.recursos_detalle, cortafuegos: ag.cortafuegos, zona_poblada: ag.zona_poblada, vinculacion: ag.vinculacion,
      fecha_cosecha: ag.fecha_cosecha, fecha_quema: ag.fecha_quema } : {};
    ov.querySelector('#agr-campos').innerHTML = AGR_FORMULARIOS[form].campos.map(c => agrCampoHtml_(c, pre[c.k])).join('');
    const pend = D.plan.filter(p => p.actividad_id === a.id && p.estado === 'pendiente');
    ov.querySelector('#agr-plan').innerHTML = '<option value="">— No estaba planificada —</option>' + pend.map(p => '<option value="' + p.id + '"' + (plan && plan.id === p.id ? ' selected' : '') + '>' +
      escapeHtml_(agrFecha_(p.fecha).toLocaleDateString('es-CL', { day: '2-digit', month: 'short' }) + (p.titulo ? ' · ' + p.titulo : '') + (p.responsable ? ' · ' + agrNombre_(p.responsable) : '')) + '</option>').join('');
    if (ag && ag.lat != null && !ov.querySelector('#agr-lat').value) fijar(ag.lat, ag.lng);
  };
  // Mapa para ubicar el punto
  const mm = L.map(ov.querySelector('#agr-mapa')).setView([-38.15, -72.35], 10);
  state.ag.mapaModal = mm;
  L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19 }).addTo(mm);
  let marca = null;
  function fijar(lat, lng) {
    ov.querySelector('#agr-lat').value = Number(lat).toFixed(6); ov.querySelector('#agr-lng').value = Number(lng).toFixed(6);
    if (marca) marca.setLatLng([lat, lng]); else marca = L.marker([lat, lng]).addTo(mm);
    mm.setView([lat, lng], Math.max(mm.getZoom(), 14));
  }
  mm.on('click', e => fijar(e.latlng.lat, e.latlng.lng));
  setTimeout(() => mm.invalidateSize(), 120);
  selAct.addEventListener('change', pintar); selAgr.addEventListener('change', pintar); pintar();
  ov.querySelector('#agr-cancelar').addEventListener('click', agrCerrarModal_);
  ov.querySelector('#agr-ok').addEventListener('click', async () => {
    const err = ov.querySelector('#agr-error'); err.textContent = '';
    const a = agrAct_(selAct.value), { datos, faltan } = agrLeerCampos_(ov, a.formulario);
    if (faltan.length) { err.textContent = 'Completa: ' + faltan.join(', ') + '.'; return; }
    const lat = parseFloat(ov.querySelector('#agr-lat').value), lng = parseFloat(ov.querySelector('#agr-lng').value);
    const files = [...ov.querySelector('#agr-fotos').files].slice(0, 4);
    const btn = ov.querySelector('#agr-ok'); btn.disabled = true; btn.textContent = 'Guardando…';
    try {
      const id = crypto.randomUUID(), fotos = [];
      for (let i = 0; i < files.length; i++) {
        const path = id + '/' + (i + 1) + '.jpg';
        const { error } = await supabaseClient.storage.from('agr-fotos').upload(path, await agrComprimirFoto_(files[i]), { contentType: 'image/jpeg', upsert: true });
        if (error) throw new Error('Foto ' + (i + 1) + ': ' + error.message);
        fotos.push(path);
      }
      const fecha = ov.querySelector('#agr-fecha').value;
      const { error } = await supabaseClient.rpc('agr_guardar_registro', { p: {
        id, actividad_id: a.id, fecha: fecha ? new Date(fecha).toISOString() : new Date().toISOString(),
        lat: isFinite(lat) ? lat : null, lng: isFinite(lng) ? lng : null, agricultor_id: a.formulario === 'agricultor' ? (selAgr.value || null) : null,
        planificacion_id: ov.querySelector('#agr-plan').value || null, datos, fotos, origen: 'web', dispositivo: 'web' } });
      if (error) throw error;
      agrCerrarModal_(); mostrarToast_('✅ Registro guardado.');
      await cargarAgricultores_();
    } catch (e) { btn.disabled = false; btn.textContent = 'Guardar registro'; err.textContent = 'No se pudo guardar: ' + (e.message || e); }
  });
}

async function descargarAgricultores_() {
  const D = state.ag.datos; if (!D) { mostrarToast_('No hay datos para descargar.'); return; }
  try {
    mostrarToast_('Generando Excel…');
    const XLSX = await tbCargarSheetJs_(), R = agrRealizadas_(), wb = XLSX.utils.book_new();
    const avance = [];
    D.actividades.forEach(a => D.meses.forEach(m => { const mt = D.metas[a.id + '|' + m] || 0, r = R[a.id + '|' + m] || 0;
      avance.push({ 'Actividad': a.id + ' · ' + a.nombre, 'Mes': m, 'Meta': mt, 'Realizado': r, 'Cumplimiento %': mt ? Math.round(r * 100 / mt) : '' }); }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(avance), 'Metas y avance');
    const regs = D.registros.map(r => Object.assign({ 'Fecha': new Date(r.fecha).toLocaleString('es-CL'), 'Actividad': r.actividad_id + ' · ' + agrAct_(r.actividad_id).nombre,
      'Gestor': agrNombre_(r.usuario_id), 'Comuna': r.comuna || '', 'Latitud': r.lat, 'Longitud': r.lng, 'Participantes': r.participantes || '', 'Fotos': (r.fotos || []).length, 'Origen': r.origen },
      agrVeGpsReal_() ? { 'GPS real latitud': r.gps_lat != null ? r.gps_lat : '', 'GPS real longitud': r.gps_lng != null ? r.gps_lng : '',
        'GPS precisión (m)': r.gps_precision_m != null ? Number(r.gps_precision_m) : '', 'Distancia punto ↔ GPS (m)': r.ajuste_m != null ? Number(r.ajuste_m) : '' } : {},
      ...Object.keys(r.datos || {}).map(k => ({ [k]: Array.isArray(r.datos[k]) ? r.datos[k].join(', ') : r.datos[k] }))));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(regs.length ? regs : [{ 'Sin registros': '' }]), 'Registros');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(D.agricultores.length ? D.agricultores.map(a => ({ 'Código': a.codigo, 'Agricultor': a.nombre, 'Fundo': a.fundo || '', 'Teléfono': a.telefono || '',
      'Comuna': a.comuna || '', 'Superficie (ha)': a.superficie_ha, 'Cultivos': (a.cultivos || []).join(', '), 'Riesgo': a.nivel_riesgo || '', 'Recursos de protección': a.recursos_proteccion, 'Detalle recursos': a.recursos_detalle || '',
      'Cortafuegos': a.cortafuegos, 'Zona poblada': a.zona_poblada, 'Vinculación': a.vinculacion || '', 'Cosecha': a.fecha_cosecha || '', 'Quema estimada': a.fecha_quema || '',
      'Visitas': a.visitas, 'Última visita': a.ultima_visita ? agrDiaDe_(a.ultima_visita) : '', 'Latitud': a.lat, 'Longitud': a.lng })) : [{ 'Sin agricultores': '' }]), 'Agricultores');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(D.plan.length ? D.plan.map(p => ({ 'Fecha': p.fecha, 'Actividad': p.actividad_id + ' · ' + agrAct_(p.actividad_id).nombre, 'Título': p.titulo || '',
      'Frecuencia': p.frecuencia, 'Comuna': nombreComunaAgr_(p.id_comuna), 'Responsable': p.responsable ? agrNombre_(p.responsable) : '', 'Estado': p.estado })) : [{ 'Sin planificación': '' }]), 'Planificación');
    XLSX.writeFile(wb, 'asociacion_agricultores_malleco_' + tbHoyISO_() + '.xlsx');
    mostrarToast_('✅ Excel descargado.');
  } catch (e) { mostrarToast_('No se pudo generar el Excel: ' + (e.message || e)); }
}

