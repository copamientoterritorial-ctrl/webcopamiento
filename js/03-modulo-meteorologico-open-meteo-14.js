/* ==================== MÓDULO METEOROLÓGICO (Open-Meteo, 14 días, horario) ==================== */
state.meteoComparadas = [];   // [{id, comuna, lat, lng, color}]
const METEO_COLORES = ['#2563EB', '#DC2626', '#16A34A', '#7C3AED', '#EA580C'];
const meteoCharts = {};

function destruirChartMeteo_(k) { if (meteoCharts[k]) { meteoCharts[k].destroy(); delete meteoCharts[k]; } }

// Coordenadas de una comuna (centroide desde v_comunas_centro; fallback al límite dibujado)
async function coordsComuna_(comunaId) {
  try {
    if (comunaId === state.activeComunaId && limiteLayer.getBounds && limiteLayer.getBounds().isValid()) {
      const c = limiteLayer.getBounds().getCenter(); return { lat: c.lat, lng: c.lng };
    }
  } catch (e) {}
  const { data } = await supabaseClient.from('v_comunas_centro').select('lat, lng').eq('id', comunaId).maybeSingle();
  if (data && data.lat != null) return { lat: data.lat, lng: data.lng };
  return { lat: -38.0, lng: -72.5 };
}


// ═══════════════════════════════════════════════════════
// MODAL METEOROLOGÍA HORARIA — gráfico T°, HR, Viento
// ═══════════════════════════════════════════════════════
let meteoHorariaChart_ = null;
let meteo7DiasChart_   = null;
let meteoModalAmpliado_ = false;

async function abrirMeteoHoraria_() {
  const overlay = document.getElementById('meteo-horaria-overlay');
  if (!overlay) return;
  overlay.classList.add('show');

  const cfg = state.comunas.find(c => c.id === state.activeComunaId);
  const nombreComuna = cfg ? cfg.comuna : '—';
  document.getElementById('meteo-horaria-subtitulo').textContent = '— ' + nombreComuna;
  document.getElementById('meteo-horaria-cargando').style.display = 'block';
  document.getElementById('meteo-horaria-chart-wrap').style.display = 'none';
  document.getElementById('meteo-horaria-error').style.display = 'none';

  let coords;
  try {
    coords = await coordsComuna_(state.activeComunaId);
  } catch(e) {
    try { const c = map.getCenter(); coords = { lat: c.lat, lng: c.lng }; }
    catch(e2) { coords = { lat: -38.0, lng: -72.5 }; }
  }
  if (!coords || coords.lat == null) {
    document.getElementById('meteo-horaria-cargando').style.display = 'none';
    document.getElementById('meteo-horaria-error').style.display = 'block';
    return;
  }

  try {
    const data = await fetchMeteo_(coords.lat, coords.lng);
    const h = data.hourly; const d = data.daily;

    // ── Gráfico 1: Evolución HORARIA hoy ──────────────────────────────────
    const hoyStr = new Date().toISOString().slice(0, 10);
    const idx = h.time.map((t, i) => t.startsWith(hoyStr) ? i : -1).filter(i => i >= 0);
    const labelsH  = idx.map(i => h.time[i].slice(11, 16));
    const temp     = idx.map(i => h.temperature_2m[i]);
    const hum      = idx.map(i => h.relative_humidity_2m[i]);
    const viento   = idx.map(i => h.wind_speed_10m[i]);
    const rafaga   = idx.map(i => h.wind_gusts_10m[i]);
    const UMBRAL   = 10;

    document.getElementById('meteo-horaria-cargando').style.display = 'none';
    document.getElementById('meteo-horaria-chart-wrap').style.display = 'block';
    if (meteoHorariaChart_) { meteoHorariaChart_.destroy(); meteoHorariaChart_ = null; }

    meteoHorariaChart_ = new Chart(
      document.getElementById('meteo-horaria-canvas').getContext('2d'), {
      data: { labels: labelsH, datasets: [
        { type:'line', label:'HR (%)', data:hum, borderColor:'#3B82F6', yAxisID:'yL',
          tension:.4, pointRadius:2, borderWidth:2, fill:false },
        { type:'line', label:'Ráfaga (km/h)', data:rafaga, borderColor:'#F97316', yAxisID:'yL',
          tension:.4, pointRadius:0, borderWidth:1.8, borderDash:[6,3], fill:false },
        { type:'line', label:'T° (°C)', data:temp, borderColor:'#EF4444', yAxisID:'yL',
          tension:.4, pointRadius:3, borderWidth:2, fill:false,
          pointBackgroundColor:'#EF4444' },
        { type:'line', label:'Viento (km/h)', data:viento, borderColor:'#22C55E', yAxisID:'yL',
          tension:.4, pointRadius:2, borderWidth:2, fill:false },
        { type:'line', label:'Umbral 10 km/h', data:labelsH.map(()=>UMBRAL),
          borderColor:'rgba(239,68,68,0.45)', borderDash:[5,4], borderWidth:1.5,
          pointRadius:0, yAxisID:'yL', fill:false },
        { type:'line', label:'_hr_r', data:hum, borderColor:'transparent',
          yAxisID:'yR', pointRadius:0, borderWidth:0, fill:false },
      ]},
      options: {
        responsive:true, maintainAspectRatio:false,
        interaction:{ mode:'index', intersect:false },
        plugins:{
          legend:{ position:'top', labels:{ usePointStyle:true, pointStyle:'circle',
            padding:12, font:{size:11}, filter: i => !['Umbral 10 km/h','_hr_r'].includes(i.text) }},
          tooltip:{ callbacks:{ label: c2 => {
            if (['_hr_r','Umbral 10 km/h'].includes(c2.dataset.label)) return null;
            return ' '+c2.dataset.label+': '+(c2.parsed.y!=null?c2.parsed.y.toFixed(1):'—');
          }}}
        },
        scales:{
          x:{ grid:{color:'rgba(0,0,0,0.05)'}, ticks:{font:{size:10}, maxRotation:0, maxTicksLimit:12} },
          yL:{ position:'left', grid:{color:'rgba(0,0,0,0.05)'}, ticks:{font:{size:10}}, suggestedMin:0 },
          yR:{ position:'right', grid:{drawOnChartArea:false},
            ticks:{font:{size:10}, callback:v=>v+'%'}, suggestedMin:0, suggestedMax:100 }
        }
      }
    });

    // ── Gráfico 2: Próximos 7 DÍAS ────────────────────────────────────────
    const dias7   = d.time.slice(0, 7);
    const labelsD = dias7.map(t => {
      const f = new Date(t+'T12:00'); const ds=['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
      return ds[f.getDay()]+' '+String(f.getDate()).padStart(2,'0')+'/'+String(f.getMonth()+1).padStart(2,'0');
    });
    const tMax  = d.temperature_2m_max.slice(0,7);
    const tMin  = d.temperature_2m_min.slice(0,7);
    const vMax  = d.wind_speed_10m_max.slice(0,7);
    const rMax  = d.wind_gusts_10m_max.slice(0,7);
    const hMax  = d.relative_humidity_2m_max.slice(0,7);

    if (meteo7DiasChart_) { meteo7DiasChart_.destroy(); meteo7DiasChart_ = null; }
    meteo7DiasChart_ = new Chart(
      document.getElementById('meteo-7dias-canvas').getContext('2d'), {
      data: { labels: labelsD, datasets: [
        { type:'line', label:'T° Máx (°C)', data:tMax, borderColor:'#EF4444',
          backgroundColor:'rgba(239,68,68,0.08)', fill:true, tension:.4, pointRadius:4,
          borderWidth:2, pointBackgroundColor:'#EF4444', yAxisID:'yL' },
        { type:'line', label:'T° Mín (°C)', data:tMin, borderColor:'#3B82F6',
          backgroundColor:'rgba(59,130,246,0.08)', fill:true, tension:.4, pointRadius:4,
          borderWidth:2, borderDash:[4,3], pointBackgroundColor:'#3B82F6', yAxisID:'yL' },
        { type:'line', label:'Viento Máx (km/h)', data:vMax, borderColor:'#22C55E',
          backgroundColor:'rgba(34,197,94,0.08)', fill:true, tension:.4, pointRadius:4,
          borderWidth:2, pointBackgroundColor:'#22C55E', yAxisID:'yL' },
        { type:'line', label:'Ráfaga Máx (km/h)', data:rMax, borderColor:'#F97316',
          backgroundColor:'rgba(249,115,22,0.08)', fill:true, tension:.4, pointRadius:4,
          borderWidth:2, borderDash:[5,3], pointBackgroundColor:'#F97316', yAxisID:'yL' },
        { type:'line', label:'HR Máx (%)', data:hMax, borderColor:'#A855F7',
          borderDash:[5,3], tension:.4, pointRadius:3, borderWidth:1.8, yAxisID:'yR', fill:false },
      ]},
      options: {
        responsive:true, maintainAspectRatio:false,
        interaction:{ mode:'index', intersect:false },
        plugins:{
          legend:{ position:'top', labels:{ usePointStyle:true, pointStyle:'circle',
            padding:12, font:{size:11} }},
          tooltip:{ callbacks:{ label: c2 =>
            ' '+c2.dataset.label+': '+(c2.parsed.y!=null?c2.parsed.y.toFixed(1):'—')
          }}
        },
        scales:{
          x:{ grid:{color:'rgba(0,0,0,0.05)'}, ticks:{font:{size:11}} },
          yL:{ position:'left', grid:{color:'rgba(0,0,0,0.05)'}, ticks:{font:{size:10}}, suggestedMin:0 },
          yR:{ position:'right', grid:{drawOnChartArea:false},
            ticks:{font:{size:10}, callback:v=>v+'%'}, suggestedMin:0, suggestedMax:100 }
        }
      }
    });

  } catch (e) {
    document.getElementById('meteo-horaria-cargando').style.display = 'none';
    document.getElementById('meteo-horaria-error').style.display = 'block';
    console.error('meteo horaria:', e);
  }
}

function cerrarMeteoHoraria_() {
  document.getElementById('meteo-horaria-overlay').classList.remove('show');
  // restaurar tamaño si estaba ampliado
  if (meteoModalAmpliado_) toggleMeteoAmpliar_();
}

function toggleMeteoAmpliar_() {
  meteoModalAmpliado_ = !meteoModalAmpliado_;
  const card = document.getElementById('meteo-modal-inner');
  const btn  = document.getElementById('btn-meteo-ampliar');
  if (meteoModalAmpliado_) {
    card.style.maxWidth = '100vw'; card.style.width = '100vw';
    card.style.borderRadius = '0'; btn.textContent = '🗗';
    btn.title = 'Reducir';
  } else {
    card.style.maxWidth = '960px'; card.style.width = '96vw';
    card.style.borderRadius = ''; btn.textContent = '⛶';
    btn.title = 'Ampliar';
  }
  setTimeout(() => {
    if (meteoHorariaChart_) meteoHorariaChart_.resize();
    if (meteo7DiasChart_)   meteo7DiasChart_.resize();
  }, 150);
}
async function fetchMeteo_(lat, lng) {
  const url = 'https://api.open-meteo.com/v1/forecast?latitude=' + lat + '&longitude=' + lng +
    '&current=temperature_2m,relative_humidity_2m,wind_speed_10m,wind_gusts_10m,wind_direction_10m,precipitation' +
    '&hourly=temperature_2m,relative_humidity_2m,wind_speed_10m,wind_gusts_10m,wind_direction_10m' +
    '&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max,wind_gusts_10m_max,relative_humidity_2m_max,relative_humidity_2m_min,wind_direction_10m_dominant' +
    '&timezone=America%2FSantiago&forecast_days=14';
  const r = await fetch(url); if (!r.ok) throw new Error('Open-Meteo HTTP ' + r.status);
  return r.json();
}

function dirCardinal_(deg) {
  if (deg == null) return '—';
  const d = ['N','NE','E','SE','S','SO','O','NO']; return d[Math.round(deg / 45) % 8];
}
function etiquetaDia_(iso) {
  const f = new Date(iso + 'T12:00:00'); const dias = ['dom','lun','mar','mié','jue','vie','sáb'];
  return dias[f.getDay()] + ' ' + String(f.getDate()).padStart(2,'0') + '/' + String(f.getMonth()+1).padStart(2,'0');
}

// Poblar el selector "Comparar con otra comuna" (una sola vez)
function poblarSelectorComparar_() {
  const sel = document.getElementById('meteo-comparar-select');
  if (!sel || sel.options.length > 1) return;
  const porRegion = {};
  state.comunas.forEach(c => { (porRegion[c.region] = porRegion[c.region] || []).push(c); });
  Object.keys(porRegion).sort().forEach(region => {
    const g = document.createElement('optgroup'); g.label = region;
    porRegion[region].sort((a,b)=>a.comuna.localeCompare(b.comuna)).forEach(c => { const o=document.createElement('option'); o.value=c.id; o.textContent=c.comuna; g.appendChild(o); });
    sel.appendChild(g);
  });
  sel.onchange = async () => {
    const id = sel.value; sel.value = '';
    if (!id) return;
    if (state.meteoComparadas.length >= 4) { mostrarToast_('Máximo 4 comunas a comparar.'); return; }
    if (state.meteoComparadas.some(c => c.id === id)) return;
    const cfg = state.comunas.find(c => c.id === id); if (!cfg) return;
    const coords = await coordsComuna_(id);
    state.meteoComparadas.push({ id, comuna: cfg.comuna, lat: coords.lat, lng: coords.lng });
    cargarMeteoDashboard_(state.comunas.find(c => c.id === comunaDashboard_()) || null);
  };
}
function renderChipsComparadas_() {
  const cont = document.getElementById('meteo-comparadas'); if (!cont) return;
  cont.innerHTML = '';
  state.meteoComparadas.forEach((c, i) => {
    const chip = document.createElement('span'); chip.className = 'comp-chip';
    chip.innerHTML = '<span class="cc-dot" style="background:' + METEO_COLORES[i + 1] + '"></span>' + escapeHtml_(c.comuna) + ' <button title="Quitar">✕</button>';
    chip.querySelector('button').addEventListener('click', () => { state.meteoComparadas.splice(i, 1); cargarMeteoDashboard_(state.comunas.find(x => x.id === comunaDashboard_()) || null); });
    cont.appendChild(chip);
  });
}

async function cargarMeteoDashboard_(cfg) {
  const cont = document.getElementById('dash-meteo');
  poblarSelectorComparar_();
  renderChipsComparadas_();
  cont.innerHTML = '<div class="layer-empty-msg">Consultando pronóstico…</div>';
  try {
    // Serie principal: comuna del dashboard (o punto central si es general)
    const principal = cfg ? { id: cfg.id, comuna: cfg.comuna } : { id: null, comuna: 'Región (centro)' };
    const coordsP = cfg ? await coordsComuna_(cfg.id) : { lat: -38.0, lng: -72.5 };
    const series = [{ ...principal, lat: coordsP.lat, lng: coordsP.lng }, ...state.meteoComparadas];
    const datos = await Promise.all(series.map(s => fetchMeteo_(s.lat, s.lng)));
    series.forEach((s, i) => { s.color = METEO_COLORES[i]; s.d = datos[i]; });
    const dP = datos[0]; const cur = dP.current || {};
    document.getElementById('dash-meteo-actualizado').textContent = new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });

    // ---- Cabecera: condiciones actuales + riesgo ----
    const riesgo = riesgoIncendio_(cur.temperature_2m, cur.relative_humidity_2m, cur.wind_speed_10m);
    cont.innerHTML = '<div class="meteo-actual">' +
      mbox_('Temperatura', cur.temperature_2m, '°C') + mbox_('Humedad', cur.relative_humidity_2m, '%') +
      mbox_('Viento', cur.wind_speed_10m, 'km/h') + mbox_('Ráfagas', cur.wind_gusts_10m, 'km/h') +
      '<div class="meteo-box"><div class="m-label">Dirección</div><div class="m-value">' + dirCardinal_(cur.wind_direction_10m) + '</div></div>' +
      '<div class="meteo-box" style="display:flex;flex-direction:column;justify-content:center;"><div class="m-label">Riesgo de incendio</div><div style="margin-top:6px;"><span class="riesgo-badge riesgo-' + riesgo.nivel + '">' + riesgo.etiqueta + '</span></div></div>' +
      '</div><div class="meteo-analisis"><b>Análisis de contexto (' + escapeHtml_(principal.comuna) + '):</b> ' + riesgo.analisis + ' ' + analisisSemana_(dP.daily) + '</div>';

    const labels = (dP.daily.time || []).map(etiquetaDia_);
    const opciones = (yTitle, extra) => Object.assign({ responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 10 }, usePointStyle: true } } },
      scales: { y: { title: { display: !!yTitle, text: yTitle } }, x: { ticks: { font: { size: 10 }, maxRotation: 0 } } } }, extra || {});

    // ---- 1) Térmica: máx (sólida) y mín (punteada) por comuna ----
    destruirChartMeteo_('temp');
    const dsTemp = [];
    series.forEach(s => {
      dsTemp.push({ label: s.comuna + ' Máx', data: s.d.daily.temperature_2m_max, borderColor: s.color, backgroundColor: s.color, tension: 0.4, pointRadius: 3 });
      dsTemp.push({ label: s.comuna + ' Mín', data: s.d.daily.temperature_2m_min, borderColor: s.color, backgroundColor: s.color, borderDash: [5, 4], tension: 0.4, pointRadius: 2, borderWidth: 1.5 });
    });
    meteoCharts.temp = new Chart(document.getElementById('ch-meteo-temp'), { type: 'line', data: { labels, datasets: dsTemp }, options: opciones('°C') });

    // ---- 2) Humedad: máx y mín ----
    destruirChartMeteo_('hum');
    const dsHum = [];
    series.forEach(s => {
      dsHum.push({ label: s.comuna + ' Máx', data: s.d.daily.relative_humidity_2m_max, borderColor: s.color, backgroundColor: s.color, tension: 0.4, pointRadius: 3 });
      dsHum.push({ label: s.comuna + ' Mín', data: s.d.daily.relative_humidity_2m_min, borderColor: s.color, backgroundColor: s.color, borderDash: [5, 4], tension: 0.4, pointRadius: 2, borderWidth: 1.5 });
    });
    meteoCharts.hum = new Chart(document.getElementById('ch-meteo-hum'), { type: 'line', data: { labels, datasets: dsHum }, options: opciones('%', { scales: { y: { min: 0, max: 100 } } }) });

    // ---- 3) Viento y ráfagas (principal: área de ráfagas + línea de viento; comparadas: líneas) ----
    destruirChartMeteo_('viento');
    const dsV = [
      { label: principal.comuna + ' Ráfagas', data: dP.daily.wind_gusts_10m_max, borderColor: '#EA580C', backgroundColor: 'rgba(234,88,12,0.18)', fill: true, tension: 0.4, pointRadius: 3 },
      { label: principal.comuna + ' Viento', data: dP.daily.wind_speed_10m_max, borderColor: '#2563EB', backgroundColor: '#2563EB', tension: 0.4, pointRadius: 3 },
    ];
    state.meteoComparadas.forEach((c, i) => { const s = series[i + 1]; dsV.push({ label: s.comuna + ' Viento', data: s.d.daily.wind_speed_10m_max, borderColor: s.color, backgroundColor: s.color, borderDash: [4, 3], tension: 0.4, pointRadius: 2 }); });
    meteoCharts.viento = new Chart(document.getElementById('ch-meteo-viento'), { type: 'line', data: { labels, datasets: dsV }, options: opciones('km/h', { scales: { y: { min: 0 } } }) });

    // ---- 4) Ventanas de peligro de viento (horario, principal) ----
    document.getElementById('meteo-ventanas-viento').innerHTML = renderVentanasViento_(dP.hourly);

    // ---- 4b) COMBINADO: Viento + Temperatura (doble eje) con días de riesgo combinado ----
    destruirChartMeteo_('combinado');
    const tMax = dP.daily.temperature_2m_max || [], vMax = dP.daily.wind_speed_10m_max || [], rMax = dP.daily.wind_gusts_10m_max || [];
    // Días críticos: T° máx ≥25 y viento ≥25 el mismo día -> barra de fondo roja
    const diasCriticos = labels.map((_, i) => (tMax[i] >= 25 && vMax[i] >= 25) ? 1 : 0);
    const topeCrit = Math.max(50, Math.ceil(Math.max(...rMax, ...vMax, 0) / 10) * 10 + 10);
    meteoCharts.combinado = new Chart(document.getElementById('ch-meteo-combinado'), {
      type: 'bar',
      data: { labels, datasets: [
        { type: 'bar', label: 'Día de riesgo combinado', data: diasCriticos.map(c => c ? topeCrit : null), backgroundColor: 'rgba(220,38,38,0.13)', borderWidth: 0, yAxisID: 'yV', barPercentage: 1, categoryPercentage: 1, order: 3 },
        { type: 'line', label: 'T° máxima (°C)', data: tMax, borderColor: '#DC2626', backgroundColor: '#DC2626', tension: 0.4, pointRadius: 3, borderWidth: 2.5, yAxisID: 'yT', order: 1 },
        { type: 'line', label: 'Ráfagas (km/h)', data: rMax, borderColor: '#EA580C', backgroundColor: 'rgba(234,88,12,0.15)', fill: true, tension: 0.4, pointRadius: 2, borderWidth: 1.5, borderDash: [4, 3], yAxisID: 'yV', order: 2 },
        { type: 'line', label: 'Viento (km/h)', data: vMax, borderColor: '#2563EB', backgroundColor: '#2563EB', tension: 0.4, pointRadius: 3, borderWidth: 2.5, yAxisID: 'yV', order: 1 },
      ] },
      options: { responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
        plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 10 }, usePointStyle: true, filter: (it) => it.text !== 'Día de riesgo combinado' } },
          tooltip: { filter: (it) => it.dataset.label !== 'Día de riesgo combinado' } },
        scales: {
          yT: { type: 'linear', position: 'left', title: { display: true, text: 'Temperatura (°C)', color: '#DC2626' }, ticks: { color: '#DC2626' }, grid: { drawOnChartArea: true } },
          yV: { type: 'linear', position: 'right', min: 0, max: topeCrit, title: { display: true, text: 'Viento (km/h)', color: '#2563EB' }, ticks: { color: '#2563EB' }, grid: { drawOnChartArea: false } },
          x: { ticks: { font: { size: 10 }, maxRotation: 0 } },
        } },
    });
    // Análisis del combinado
    const nCrit = diasCriticos.reduce((a, b) => a + b, 0);
    const idxCrit = diasCriticos.map((c, i) => c ? i : -1).filter(i => i >= 0);
    let txtC = '<b>Lectura combinada:</b> ';
    if (nCrit === 0) txtC += 'No se proyectan días con calor y viento fuerte simultáneos en los próximos 14 días. El riesgo de propagación rápida es acotado.';
    else {
      const peor = idxCrit.reduce((a, b) => (tMax[b] + vMax[b] > tMax[a] + vMax[a]) ? b : a, idxCrit[0]);
      txtC += 'Se proyectan <b>' + nCrit + ' día(s)</b> con calor y viento fuerte al mismo tiempo (zonas rojas): ' + idxCrit.map(i => labels[i]).join(', ') + '. ' +
        'El más crítico es <b>' + labels[peor] + '</b> (' + Math.round(tMax[peor]) + ' °C · viento ' + Math.round(vMax[peor]) + ' km/h · ráfagas ' + Math.round(rMax[peor] || 0) + '). ' +
        'Esta combinación acelera la propagación; conviene concentrar el copamiento y la vigilancia en esas jornadas.';
    }
    document.getElementById('meteo-combinado-analisis').innerHTML = txtC;

    // ---- 5) Precipitación acumulada (barras; comparadas agrupadas) ----
    destruirChartMeteo_('precip');
    const dsP = series.map(s => ({ label: s.comuna, data: s.d.daily.precipitation_sum, backgroundColor: s.color }));
    meteoCharts.precip = new Chart(document.getElementById('ch-meteo-precip'), { type: 'bar', data: { labels, datasets: dsP },
      options: opciones('mm', { plugins: { legend: { display: series.length > 1, position: 'bottom' } }, scales: { y: { min: 0 } } }) });
    const totalP = (dP.daily.precipitation_sum || []).reduce((a, b) => a + (b || 0), 0);
    document.getElementById('meteo-precip-total').textContent = totalP.toFixed(1) + ' mm';

    // ---- 6) Heladas: mínimas en barras con color por umbral ----
    destruirChartMeteo_('heladas');
    const mins = dP.daily.temperature_2m_min || [];
    const coloresH = mins.map(v => v <= 0 ? '#7C3AED' : v <= 2 ? '#3B82F6' : v <= 5 ? '#94A3B8' : '#16A34A');
    meteoCharts.heladas = new Chart(document.getElementById('ch-meteo-heladas'), { type: 'bar',
      data: { labels, datasets: [{ label: 'T° mínima', data: mins, backgroundColor: coloresH }] },
      options: opciones('°C', { plugins: { legend: { display: false }, annotation: undefined }, scales: { y: { suggestedMin: -3 } } }) });

    // ---- 7) Ventanas de heladas (mínima ≤ 2 °C) ----
    document.getElementById('meteo-ventanas-heladas').innerHTML = renderVentanasHeladas_(dP.daily, dP.hourly);
  } catch (e) {
    cont.innerHTML = '<div class="layer-empty-msg">No se pudo obtener el pronóstico (' + escapeHtml_(e.message) + ').</div>';
  }
}

// Ventanas de peligro de viento: agrupa horas consecutivas con viento ≥25 km/h o ráfagas ≥40.
function renderVentanasViento_(hourly) {
  if (!hourly || !hourly.time) return '<div class="layer-empty-msg">Sin datos horarios.</div>';
  const UMBRAL_V = 25, UMBRAL_R = 40;
  const ventanas = []; let actual = null;
  hourly.time.forEach((t, i) => {
    const v = hourly.wind_speed_10m[i] || 0, r = hourly.wind_gusts_10m[i] || 0, dir = hourly.wind_direction_10m[i];
    const peligro = v >= UMBRAL_V || r >= UMBRAL_R;
    const dia = t.slice(0, 10), hora = t.slice(11, 16);
    if (peligro) {
      if (actual && actual.dia === dia && actual.ultimoIdx === i - 1) { actual.fin = hora; actual.horas++; actual.maxV = Math.max(actual.maxV, v); actual.maxR = Math.max(actual.maxR, r); actual.dirs.push(dir); actual.ultimoIdx = i; }
      else { if (actual) ventanas.push(actual); actual = { dia, inicio: hora, fin: hora, horas: 1, maxV: v, maxR: r, dirs: [dir], ultimoIdx: i }; }
    }
  });
  if (actual) ventanas.push(actual);
  const relevantes = ventanas.filter(w => w.horas >= 2); // al menos 2 h sostenidas
  if (!relevantes.length) return '<div class="layer-empty-msg">✅ Sin ventanas de peligro de viento en los próximos 14 días.</div>';
  return relevantes.slice(0, 8).map(w => {
    const dirDom = dirCardinal_(w.dirs.reduce((a, b) => a + (b || 0), 0) / w.dirs.length);
    const finH = (parseInt(w.fin.slice(0, 2), 10) + 1) % 24;
    return '<div class="ventana-item"><div class="v-head"><span>' + etiquetaDia_(w.dia) + '</span><span class="v-tag">' + w.horas + 'h sostenidas</span></div>' +
      '<div class="v-grid"><div class="v-cell"><div class="vl">Viento máximo</div><div class="vv warn">' + Math.round(w.maxV) + ' km/h</div></div>' +
      '<div class="v-cell"><div class="vl">Ráfaga máxima</div><div class="vv warn">' + Math.round(w.maxR) + ' km/h</div></div>' +
      '<div class="v-cell"><div class="vl">Dir. predominante</div><div class="vv">' + dirDom + '</div></div>' +
      '<div class="v-cell"><div class="vl">Ventana crítica</div><div class="vv">' + w.inicio + ' a ' + String(finH).padStart(2, '0') + ':00 hrs</div></div></div></div>';
  }).join('');
}

// Ventanas de heladas: días con mínima ≤ 2 °C, con horas bajo cero si las hay.
function renderVentanasHeladas_(daily, hourly) {
  if (!daily || !daily.time) return '<div class="layer-empty-msg">Sin datos.</div>';
  const items = [];
  daily.time.forEach((dia, i) => {
    const min = daily.temperature_2m_min[i];
    if (min == null || min > 2) return;
    let horasBajoCero = 0;
    if (hourly && hourly.time) hourly.time.forEach((t, j) => { if (t.slice(0, 10) === dia && (hourly.temperature_2m[j] || 99) <= 0) horasBajoCero++; });
    const severa = min <= 0;
    const intensidad = min <= -2 ? 'Severa' : min <= 0 ? 'Moderada' : 'Leve';
    const tag = severa ? (horasBajoCero + 'h bajo cero') : 'Alerta (cercano a 0 °C)';
    items.push('<div class="ventana-item helada' + (severa ? ' severa' : '') + '"><div class="v-head"><span>' + etiquetaDia_(dia) + '</span><span class="v-tag">' + tag + '</span></div>' +
      '<div class="v-grid"><div class="v-cell"><div class="vl">Temperatura mínima</div><div class="vv cold">' + min.toFixed(1) + ' °C</div></div>' +
      '<div class="v-cell"><div class="vl">Intensidad</div><div class="vv">' + intensidad + '</div></div></div></div>');
  });
  if (!items.length) return '<div class="layer-empty-msg">✅ Sin riesgo de heladas en los próximos 14 días.</div>';
  return items.join('');
}

function mbox_(label, val, unit) {
  return '<div class="meteo-box"><div class="m-label">' + label + '</div><div class="m-value">' + (val != null ? Math.round(val * 10) / 10 : '—') + ' <span class="m-unit">' + unit + '</span></div></div>';
}
// Índice simplificado de riesgo de incendio: temperatura + humedad + viento.
function riesgoIncendio_(temp, hum, viento) {
  temp = temp || 0; hum = hum == null ? 50 : hum; viento = viento || 0;
  let score = 0;
  if (temp >= 30) score += 3; else if (temp >= 25) score += 2; else if (temp >= 20) score += 1;
  if (hum <= 20) score += 3; else if (hum <= 30) score += 2; else if (hum <= 40) score += 1;
  if (viento >= 40) score += 3; else if (viento >= 25) score += 2; else if (viento >= 15) score += 1;
  if (score >= 7) return { nivel: 'extremo', etiqueta: 'EXTREMO', color: '#DC2626', analisis: 'Condiciones críticas: calor, baja humedad y viento fuerte. Máxima probabilidad de ignición y propagación rápida; reforzar copamiento y vigilancia.' };
  if (score >= 5) return { nivel: 'alto', etiqueta: 'ALTO', color: '#EA580C', analisis: 'Riesgo alto de incendio: la combinación de temperatura, humedad y viento favorece la propagación. Mantener recursos en alerta.' };
  if (score >= 3) return { nivel: 'moderado', etiqueta: 'MODERADO', color: '#F59E0B', analisis: 'Riesgo moderado: condiciones parcialmente favorables al fuego. Monitorear evolución del viento y la humedad.' };
  return { nivel: 'bajo', etiqueta: 'BAJO', color: '#16A34A', analisis: 'Riesgo bajo: condiciones desfavorables para la propagación de incendios.' };
}
function analisisSemana_(daily) {
  if (!daily || !daily.time) return '';
  let diasAlto = 0, maxT = -99, maxV = 0;
  daily.time.forEach((t, i) => {
    const r = riesgoIncendio_(daily.temperature_2m_max[i], daily.relative_humidity_2m_min[i], daily.wind_speed_10m_max[i]);
    if (r.nivel === 'alto' || r.nivel === 'extremo') diasAlto++;
    maxT = Math.max(maxT, daily.temperature_2m_max[i] || -99); maxV = Math.max(maxV, daily.wind_speed_10m_max[i] || 0);
  });
  if (diasAlto === 0) return 'En los próximos 7 días no se proyectan jornadas de riesgo alto.';
  return 'Se proyectan ' + diasAlto + ' día(s) con riesgo alto o extremo en la semana (máx. ' + Math.round(maxT) + ' °C, viento hasta ' + Math.round(maxV) + ' km/h).';
}

/* ==================== PANEL DE ADMINISTRACIÓN DEL SISTEMA (solo Admin) ==================== */
// Refresca la sección activa del panel de administración si está visible
function refrescarAdminSiVisible_() {
  if (state.vistaActual === 'admin' && state.adminSeccion) cargarSeccionAdmin_(state.adminSeccion);
}

state.adminSeccion = 'resumen';

function cargarSeccionAdmin_(seccion) {
  state.adminSeccion = seccion;
  document.querySelectorAll('.admin-menu-item').forEach(b => b.classList.toggle('active', b.dataset.seccion === seccion));
  const c = document.getElementById('admin-content');
  c.innerHTML = '<div class="layer-empty-msg">Cargando…</div>';
  const fn = {
    resumen: adminSeccionResumen_, usuarios: adminSeccionUsuarios_, permisosPerfil: adminSeccionPermisosPerfil_, instituciones: adminSeccionInstituciones_,
    recursos: adminSeccionRecursos_, patrulleros: adminSeccionPatrulleros_, comunas: adminSeccionComunas_, areaComunas: adminSeccionAreaComunas_, auditoria: adminSeccionAuditoria_, auditoriaPerfiles: adminSeccionAuditoriaPerfiles_, modulosPerfil: adminSeccionModulosPerfil_, actividad: adminSeccionActividad_, sesiones: adminSeccionSesiones_,
    appPatrulleros: adminSeccionAppPatrulleros_, appAcciones: adminSeccionAppAcciones_,
  }[seccion];
  if (fn) fn(c);
}

function adminHead_(titulo, sub, toolbarHtml) {
  return '<div class="admin-head"><div><h2>' + titulo + '</h2><p>' + sub + '</p></div><div class="admin-toolbar">' + (toolbarHtml || '') + '</div></div>';
}

// ---------- RESUMEN DEL SISTEMA ----------
async function adminSeccionResumen_(c) {
  const { data: st } = await supabaseClient.from('v_admin_estadisticas').select('*').maybeSingle();
  const { data: ult } = await supabaseClient.from('auditoria').select('fecha, usuario_nombre, tabla, operacion, descripcion').order('fecha', { ascending: false }).limit(10);
  const s = st || {};
  c.innerHTML = adminHead_('Resumen del sistema', 'Estado general de los mantenedores y actividad reciente') +
    '<div class="dash-kpis" style="margin-bottom:18px;">' +
    kpi_('Usuarios', s.usuarios_total || 0, (s.usuarios_activos || 0) + ' activo(s)') +
    kpi_('Instituciones activas', s.instituciones_activas || 0, 'en el catálogo') +
    kpi_('Recursos maestro', s.recursos_maestro_activos || 0, 'activos') +
    kpi_('Patrulleros', s.patrulleros || 0, 'registrados') +
    kpi_('Comunas', s.comunas || 0, 'en el sistema') +
    kpi_('Periodos activos', s.periodos_activos || 0, 'copamiento vigente') +
    kpi_('Planes de alerta activos', s.planes_activos || 0, 'Amarilla / Roja') +
    kpi_('Cambios (24 h / 7 d)', (s.cambios_24h || 0) + ' / ' + (s.cambios_7d || 0), 'registros de auditoría') +
    '</div>' +
    '<div class="dash-card"><div class="dash-card-title" style="display:flex;justify-content:space-between;"><span>Últimos cambios</span><button class="popup-btn" id="btn-ir-auditoria">Ver auditoría completa →</button></div>' +
    '<div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Fecha</th><th>Usuario</th><th>Operación</th><th>Detalle</th></tr></thead><tbody>' +
    ((ult || []).map(a => '<tr><td style="white-space:nowrap;">' + new Date(a.fecha).toLocaleString('es-CL') + '</td><td>' + escapeHtml_(a.usuario_nombre || 'Sistema') + '</td><td><span class="audit-op ' + a.operacion + '">' + a.operacion + '</span></td><td>' + escapeHtml_(a.descripcion || a.tabla) + '</td></tr>').join('') || '<tr><td colspan="4" style="padding:14px;color:var(--text-tertiary);">Sin actividad registrada aún.</td></tr>') +
    '</tbody></table></div></div>';
  const b = document.getElementById('btn-ir-auditoria'); if (b) b.addEventListener('click', () => cargarSeccionAdmin_('auditoria'));
}

// ===== Helpers de presentación para mantenedores =====
state.admDensidad = state.admDensidad || 'normal';
const COLORES_AVATAR = ['#2563EB','#7C3AED','#059669','#DC2626','#EA580C','#0891B2','#DB2777','#65A30D'];
function colorAvatar_(txt) { let h = 0; for (const ch of (txt || '')) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return COLORES_AVATAR[h % COLORES_AVATAR.length]; }
function avatar_(nombre, sm) { return '<span class="avatar' + (sm ? ' sm' : '') + '" style="background:' + colorAvatar_(nombre) + '">' + escapeHtml_(initials(nombre)) + '</span>'; }
function badgePerfil_(p) {
  const m = { 'Administrador': 'bdg-admin', 'GRD': 'bdg-grd', 'Visor': 'bdg-visor', 'Jefe de Área Relacionamiento': 'bdg-jefe', 'Subgerente de Relacionamiento': 'bdg-subg', 'Gestor de Relacionamiento Territorial': 'bdg-jefe', 'Asociación de Agricultores': 'bdg-ok' };
  return '<span class="bdg ' + (m[p] || 'bdg-neutral') + '" title="' + escapeHtml_(p || '') + '">' + escapeHtml_(p === 'Jefe de Área Relacionamiento' ? 'Jefe de Área' : p === 'Subgerente de Relacionamiento' ? 'Subgerente' : p === 'Gestor de Relacionamiento Territorial' ? 'GRT' : p === 'Asociación de Agricultores' ? '🌾 Asociación' : p) + '</span>';
}
function admKpi_(ico, bg, label, value, opts) {
  opts = opts || {};
  // click: '' es un filtro válido (= todos, p.ej. la tarjeta "Total"): no evaluar por truthiness.
  const clic = typeof opts.click === 'string';
  return '<div class="adm-kpi' + (clic ? ' clickable' : '') + (opts.activo ? ' activo' : '') + '"' + (clic ? ' data-kpi="' + escapeHtml_(opts.click) + '"' : '') + '>' +
    '<div class="ak-ico" style="background:' + bg + '">' + ico + '</div><div><div class="ak-label">' + label + '</div><div class="ak-value">' + value + '</div></div></div>';
}
function densToggle_() {
  return '<div class="dens-toggle" title="Densidad de la tabla">' + ['compacta','normal','amplia'].map(d =>
    '<button class="dens-btn' + (state.admDensidad === d ? ' active' : '') + '" data-dens="' + d + '">' + d.charAt(0).toUpperCase() + d.slice(1) + '</button>').join('') + '</div>';
}
function bindDensidad_(c, rerender) {
  c.querySelectorAll('[data-dens]').forEach(b => b.addEventListener('click', () => { state.admDensidad = b.dataset.dens; rerender(); }));
}
// Botón de acción compacto con ícono SVG. tipo: editar | clave | activar | desactivar | eliminar | mapa
const ICONOS_ACT = {
  editar:     '<svg viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>',
  clave:      '<svg viewBox="0 0 24 24"><circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6"/><path d="m15.5 7.5 3 3L22 7l-3-3"/></svg>',
  desactivar: '<svg viewBox="0 0 24 24"><path d="M18.36 6.64A9 9 0 1 1 5.64 6.64"/><line x1="12" y1="2" x2="12" y2="12"/></svg>',
  activar:    '<svg viewBox="0 0 24 24"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
  eliminar:   '<svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>',
  mapa:       '<svg viewBox="0 0 24 24"><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/></svg>',
};
ICONOS_ACT.permisos = '<svg viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg>';
const TITULOS_ACT = { editar: 'Editar', clave: 'Resetear clave', desactivar: 'Desactivar', activar: 'Activar', eliminar: 'Eliminar', mapa: 'Ir al mapa', permisos: 'Permisos: módulos, edición y capas' };
function actBtn_(tipo, dataAttrs) {
  const cls = tipo === 'eliminar' ? ' danger' : (tipo === 'desactivar' ? ' warn' : '');
  return '<button class="act-btn' + cls + '" title="' + TITULOS_ACT[tipo] + '" ' + dataAttrs + '>' + ICONOS_ACT[tipo] + '</button>';
}
function grupoRow_(titulo, n, cols) { return '<tr class="grupo-row"><td colspan="' + cols + '">' + escapeHtml_(titulo) + '<span class="g-count">' + n + '</span></td></tr>'; }

// ---------- USUARIOS ----------
async function adminSeccionUsuarios_(c) {
  const { data, error } = await supabaseClient.functions.invoke('admin-usuarios', { body: { action: 'listar' } });
  if (error || !data || !data.ok) { c.innerHTML = adminHead_('Usuarios', 'Gestión de accesos') + '<div class="layer-empty-msg">No se pudo cargar: ' + await mensajeErrorEdgeFunction_(data, error) + '</div>'; return; }
  state.usuarios = data.usuarios;
  // Subgerentes (SQL 107): en la BD son Jefe de Área + subgerencia; aquí se muestran con su perfil propio
  state.subgPorPerfil = {};
  try {
    const { data: ps } = await supabaseClient.from('perfil_subgerencias').select('perfil_id, subgerencia');
    (ps || []).forEach(x => { state.subgPorPerfil[x.perfil_id] = x.subgerencia; });
  } catch (e) { /* sin SQL 107 */ }
  state.usuarios.forEach(u => { if (state.subgPorPerfil[u.id]) { u.perfil = 'Subgerente de Relacionamiento'; u.subgerencia = state.subgPorPerfil[u.id]; } });
  // Gestores de Relacionamiento Territorial (SQL 119): Jefe de Área + marca
  state.grtPorPerfil = {};
  try {
    const { data: gs } = await supabaseClient.from('perfil_gestor_territorial').select('perfil_id');
    (gs || []).forEach(x => { state.grtPorPerfil[x.perfil_id] = true; });
  } catch (e) { /* sin SQL 119 */ }
  state.usuarios.forEach(u => { if (state.grtPorPerfil[u.id] && !state.subgPorPerfil[u.id]) u.perfil = PERFIL_GRT; });
  // Asociación de Agricultores (SQL 129): Visor + marca
  state.asocPorPerfil = {};
  try {
    const { data: as } = await supabaseClient.from('perfil_asociacion').select('perfil_id, asociacion');
    (as || []).forEach(x => { state.asocPorPerfil[x.perfil_id] = x.asociacion; });
  } catch (e) { /* sin SQL 129 */ }
  state.usuarios.forEach(u => { if (state.asocPorPerfil[u.id] && u.perfil === 'Visor') u.perfil = PERFIL_ASOC; });
  state.admFiltroPerfil = state.admFiltroPerfil || '';
  state.admFiltroArea = state.admFiltroArea || '';
  const ORDEN = ['Administrador','Subgerente de Relacionamiento','Jefe de Área Relacionamiento',PERFIL_GRT,'GRD','Visor',PERFIL_ASOC];
  // Filtro por área de relacionamiento (18-10-2026): el usuario tiene el área asignada (Jefe, Subgerente, GRT)
  // o alguna de sus comunas es de esa área (GRD, Visor), según Administración › Comunas por área.
  const comunasDeArea = await comunasPorAreaUsuario_();
  const areasUsuario_ = u => {
    const set = new Set((u.area_ids || []).map(SG_KEY));
    const mias = new Set(u.comuna_ids || []);
    Object.keys(comunasDeArea).forEach(k => { if (comunasDeArea[k].some(id => mias.has(id))) set.add(k); });
    return set;
  };
  state.usuarios.forEach(u => { u._areas = areasUsuario_(u); });
  const render = () => {
    const q = normalizarBusqueda_((document.getElementById('adm-u-search') || {}).value || '');
    const fP = state.admFiltroPerfil, fA = state.admFiltroArea;
    const lista = state.usuarios.filter(u => (!fP || u.perfil === fP) && (!fA || u._areas.has(SG_KEY(fA))) &&
      (!q || normalizarBusqueda_(u.nombre_completo + ' ' + u.email + ' ' + u.comuna_ids.map(nombreComuna_).join(' ')).includes(q)));
    const cont = {}; state.usuarios.forEach(u => { cont[u.perfil] = (cont[u.perfil] || 0) + 1; });
    const act = state.usuarios.filter(u => u.estado === 'activo').length;
    c.innerHTML = adminHead_('Usuarios', 'Accesos, perfiles y asignación de comunas/zonas',
      '<input id="adm-u-search" class="admin-search" placeholder="Buscar por nombre, correo o comuna…" value="' + escapeHtml_(q) + '">' +
      '<select id="adm-u-area" class="admin-search" style="min-width:0;max-width:230px;' + (fA ? 'border-color:#0F766E;font-weight:700;' : '') + '" title="Usuarios con esa área de relacionamiento (asignada o por sus comunas)">' +
        '<option value="">Todas las áreas</option>' + (state.areasCatalogo || []).slice().sort((a, b) => a.localeCompare(b, 'es')).map(a => {
          const n = state.usuarios.filter(u => u._areas.has(SG_KEY(a))).length;
          return '<option value="' + escapeHtml_(a) + '"' + (a === fA ? ' selected' : '') + '>' + escapeHtml_(aTitulo_(a)) + ' (' + n + ')</option>';
        }).join('') + '</select>' +
      '<span class="admin-count">' + lista.length + ' de ' + state.usuarios.length + '</span>' + densToggle_() +
      '<button class="btn-primary" id="adm-u-nuevo" style="padding:9px 14px;">+ Nuevo usuario</button>') +
      '<div class="adm-kpis">' +
      admKpi_('👥', '#EFF4FF', 'Total', state.usuarios.length, { click: '', activo: !fP }) +
      admKpi_('🛡️', '#EDE9FE', 'Administradores', cont['Administrador'] || 0, { click: 'Administrador', activo: fP === 'Administrador' }) +
      admKpi_('📈', '#CCFBF1', 'Subgerentes', cont['Subgerente de Relacionamiento'] || 0, { click: 'Subgerente de Relacionamiento', activo: fP === 'Subgerente de Relacionamiento' }) +
      admKpi_('🧭', '#FEF3C7', 'Jefes de Área', cont['Jefe de Área Relacionamiento'] || 0, { click: 'Jefe de Área Relacionamiento', activo: fP === 'Jefe de Área Relacionamiento' }) +
      admKpi_('🤝', '#E0E7FF', 'Gestores (GRT)', cont[PERFIL_GRT] || 0, { click: PERFIL_GRT, activo: fP === PERFIL_GRT }) +
      admKpi_('🚒', '#DBEAFE', 'GRD', cont['GRD'] || 0, { click: 'GRD', activo: fP === 'GRD' }) +
      admKpi_('👁️', '#F1F5F9', 'Visores', cont['Visor'] || 0, { click: 'Visor', activo: fP === 'Visor' }) +
      admKpi_('🌾', '#ECFCCB', 'Asociación Agricultores', cont[PERFIL_ASOC] || 0, { click: PERFIL_ASOC, activo: fP === PERFIL_ASOC }) +
      admKpi_('✅', '#DCFCE7', 'Activos / Inactivos', act + ' / ' + (state.usuarios.length - act)) +
      '</div>' +
      '<div class="admin-table-wrap"><table class="admin-table dens-' + state.admDensidad + '"><thead><tr><th>Usuario</th><th>Perfil</th><th>Comunas / Zonas</th><th>Estado</th><th></th></tr></thead><tbody id="adm-u-tbody"></tbody></table></div>';
    // Agrupado por perfil
    let html = '';
    ORDEN.forEach(p => {
      const g = lista.filter(u => u.perfil === p); if (!g.length) return;
      html += grupoRow_(p, g.length, 5);
      g.sort((a,b)=>a.nombre_completo.localeCompare(b.nombre_completo)).forEach(u => {
        const asig = u.perfil === 'Administrador' ? 'Todas las comunas'
          : u.perfil === 'Subgerente de Relacionamiento' ? 'Subgerencia ' + aTitulo_(u.subgerencia || '') + ' · ' + ((u.area_ids || []).join(', ') || '—')
          : (u.perfil === 'Jefe de Área Relacionamiento' || u.perfil === PERFIL_GRT) ? ((u.area_ids || []).join(', ') || '—') : (u.comuna_ids.map(nombreComuna_).join(', ') || '—');
        html += '<tr><td><div class="cell-persona">' + avatar_(u.nombre_completo) + '<div><div class="cp-nombre">' + escapeHtml_(u.nombre_completo) + '</div><div class="cp-sub">' + escapeHtml_(u.email) + (u.cargo ? ' · ' + escapeHtml_(u.cargo) : '') + '</div></div></div></td>' +
          '<td>' + badgePerfil_(u.perfil) + '</td><td style="font-size:11px;color:var(--text-secondary);max-width:280px;">' + escapeHtml_(asig) + '</td>' +
          '<td>' + (u.estado === 'activo' ? '<span class="bdg bdg-ok">Activo</span>' : '<span class="bdg bdg-off">Inactivo</span>') + (u.debe_cambiar_clave ? ' <span class="bdg bdg-neutral" title="Debe cambiar su clave">🔑</span>' : '') + '</td>' +
          '<td class="acciones-cell"><span class="act-btns">' + actBtn_('editar', 'data-e="' + u.id + '"') +
            (u.perfil !== 'Administrador' ? actBtn_('permisos', 'data-perm="' + u.id + '"') : '') + actBtn_('clave', 'data-k="' + u.id + '" data-m="' + escapeHtml_(u.email) + '"') + actBtn_(u.estado === 'activo' ? 'desactivar' : 'activar', 'data-s="' + u.id + '" data-st="' + u.estado + '"') +
            (u.estado !== 'activo' && !(state.user && state.user.id === u.id) ? actBtn_('eliminar', 'data-del="' + u.id + '"') : '') + '</span></td></tr>';
      });
    });
    document.getElementById('adm-u-tbody').innerHTML = html || '<tr><td colspan="5" style="padding:14px;color:var(--text-tertiary);">Sin resultados.</td></tr>';
    const inp = document.getElementById('adm-u-search'); inp.addEventListener('input', render); inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length);
    document.getElementById('adm-u-area').addEventListener('change', e => { state.admFiltroArea = e.target.value; render(); });
    document.getElementById('adm-u-nuevo').addEventListener('click', () => abrirModalUsuario_(null));
    c.querySelectorAll('[data-kpi]').forEach(k => k.addEventListener('click', () => { state.admFiltroPerfil = k.dataset.kpi; render(); }));
    bindDensidad_(c, render);
    c.querySelectorAll('[data-e]').forEach(b => b.onclick = () => abrirModalUsuario_(state.usuarios.find(x => x.id === b.dataset.e)));
    c.querySelectorAll('[data-k]').forEach(b => b.onclick = () => resetearClaveUsuario_(b.dataset.k, b.dataset.m));
    c.querySelectorAll('[data-perm]').forEach(b => b.onclick = () => abrirPermisosUsuario_(state.usuarios.find(x => x.id === b.dataset.perm)));
    c.querySelectorAll('[data-s]').forEach(b => b.onclick = async () => { await toggleEstadoUsuario_(b.dataset.s, b.dataset.st); });
    c.querySelectorAll('[data-del]').forEach(b => b.onclick = () => eliminarUsuarioInactivo_(state.usuarios.find(x => x.id === b.dataset.del)));
  };
  render();
}

/** 🗑️ Eliminar una cuenta INACTIVA (SQL 115): primero simula (qué registros se tocan), luego doble confirmación.
 *  Los datos que creó el usuario (rutas, revisiones, proyectos…) se conservan sin su nombre. */
async function eliminarUsuarioInactivo_(u) {
  if (!u) return;
  if (u.estado === 'activo') { mostrarToast_('Primero desactiva la cuenta.'); return; }
  const { data: sim, error } = await supabaseClient.rpc('eliminar_usuario_inactivo', { p_perfil: u.id, p_simular: true });
  if (error) { mostrarToast_('No se pudo revisar la cuenta: ' + error.message + (/function|does not exist/i.test(error.message) ? ' (¿se ejecutó el SQL 115?)' : '')); return; }
  if (!sim || !sim.ok) { alert('🔒 ' + ((sim && sim.mensaje) || 'No se puede eliminar esta cuenta.')); return; }
  const det = (sim.detalle || []);
  const txt = det.length ? det.map(d => '· ' + d.tabla + ': ' + d.filas + ' registro(s) → ' +
      ({ borrar: 'se borran (son de la cuenta)', anonimizar: 'se conservan sin el usuario', automatico: 'se ajustan solos' }[d.accion] || d.accion)).join('\n')
    : '· Sin registros asociados.';
  if (!confirm('¿Eliminar DEFINITIVAMENTE la cuenta de ' + u.nombre_completo + ' (' + u.email + ')?\n\n' + txt + '\n\nLa persona ya no podrá entrar. Esta acción no se puede deshacer.')) return;
  const escrito = prompt('Para confirmar, escribe ELIMINAR:');
  if ((escrito || '').trim().toUpperCase() !== 'ELIMINAR') { mostrarToast_('Eliminación cancelada.'); return; }
  const { error: e2 } = await supabaseClient.rpc('eliminar_usuario_inactivo', { p_perfil: u.id, p_simular: false });
  if (e2) { mostrarToast_('No se eliminó: ' + e2.message); return; }
  mostrarToast_('🗑️ Cuenta de ' + u.nombre_completo + ' eliminada.');
  cargarUsuariosAdmin();
}

// ---------- 🔎 AUDITORÍA DE PERFILES (17-10-2026) ----------
// Qué puede hacer cada perfil (matriz función × perfil) y cada usuario (nivel efectivo por módulo).
// Catálogo de capacidades según las reglas del sistema (JS + BD). Cada fila: módulo, función, módulo de
// permiso que la gobierna (k) y nivel que exige (n), y la regla por perfil:
//   'si' = puede · 'no' = no puede · texto = puede con esa condición. Las filas con k se ajustan con
//   🛡️ Permisos por perfil (si el perfil quedó por debajo de n, se muestra «restringido por perfil»).
const AUD_PERFILES = ['Administrador', 'Subgerente de Relacionamiento', 'Jefe de Área Relacionamiento', PERFIL_GRT, 'GRD', 'Visor', PERFIL_ASOC];
const AUD_CORTO = { 'Administrador': 'Admin', 'Subgerente de Relacionamiento': 'Subgerente', 'Jefe de Área Relacionamiento': 'Jefe de Área', [PERFIL_GRT]: 'GRT', 'GRD': 'GRD', 'Visor': 'Visor', [PERFIL_ASOC]: 'Asociación' };
// Orden de las columnas en cada fila: Admin, Subgerente, Jefe, GRT, GRD, Visor, Asociación de Agricultores
const AUD_CAPACIDADES = [
  ['📊 Dashboard', 'Ver el Dashboard y sus indicadores', 'dashboard', 'ver', ['si', 'si', 'si', 'si', 'si', 'si', 'no']],
  ['📊 Dashboard', 'Ver pronóstico meteorológico', 'dashboard', 'ver', ['si', 'no', 'si', 'si', 'si', 'si', 'no']],
  ['🗺️ Mapa', 'Ver capas del mapa (visor)', 'mapa', 'ver', ['si', 'si', 'si', 'si', 'si', 'si', 'no']],
  ['🗺️ Mapa', 'Capa Red Vial CMPC', 'mapa', 'ver', ['si', 'si', 'si', 'si', 'no', 'no', 'no']],
  ['🗺️ Mapa', 'Capas «Recursos / Rutas de la comuna»', 'mapa', 'ver', ['si', 'si', 'si', 'si', 'no', 'no', 'no']],
  ['🧭 Planificador de Alertas', 'Planificar escenario Normal', 'planificador_mapa', 'editar', ['si', 'Sus áreas', 'Sus áreas', 'Sus áreas', 'no (consulta)', 'no (consulta)', 'no']],
  ['🧭 Planificador de Alertas', 'Planificar Alerta Amarilla', 'planificador_mapa', 'editar', ['si', 'Sus áreas', 'Sus áreas', 'Sus áreas', 'Sus comunas', 'no (consulta)', 'no']],
  ['🧭 Planificador de Alertas', 'Planificar Alerta Roja', 'planificador_mapa', 'editar', ['si', 'Sus áreas', 'Sus áreas', 'Sus áreas', 'Sus comunas', 'no (consulta)', 'no']],
  ['🧭 Planificador de Alertas', 'Editar / eliminar entidades de CMPC', 'planificador_mapa', 'editar', ['si', 'si', 'si', 'si', 'no (solo consulta)', 'no', 'no']],
  ['🧭 Planificador de Alertas', 'Usar el catálogo de tipos CMPC', 'planificador_mapa', 'editar', ['si', 'si', 'si', 'si', 'no', 'no', 'no']],
  ['🧭 Planificador de Alertas', 'Tipo «Efecto disuasivo» en rutas / áreas', 'planificador_mapa', 'editar', ['si', 'si', 'si', 'si', 'Amarilla y Roja', 'no', 'no']],
  ['🧭 Planificador de Alertas', 'Editar forma, cortar, unir y separar rutas', 'planificador_mapa', 'editar', ['si', 'si', 'si', 'si', 'Amarilla y Roja, sin CMPC', 'no', 'no']],
  ['🧭 Planificador de Alertas', 'Propagar a las demás alertas (⏫)', 'planificador_mapa', 'editar', ['si', 'si', 'si', 'si', 'Desde Amarilla/Roja, sin CMPC', 'no', 'no']],
  ['🧭 Planificador de Alertas', 'Cambiar la comuna de una ruta (🏘️)', 'planificador_mapa', 'editar', ['si', 'Sus comunas', 'Sus comunas', 'Sus comunas', 'Amarilla y Roja, sin CMPC', 'no', 'no']],
  ['🧭 Planificador de Alertas', 'Traspasar rutas SIGEI a las alertas', 'planificador_mapa', 'editar', ['si', 'si', 'si', 'si', 'no', 'no', 'no']],
  ['🧭 Planificador de Alertas', 'Sumar el área de influencia de un comité (Red de Prevención) al copamiento', 'planificador_mapa', 'editar', ['si', 'si', 'si', 'si', 'Amarilla y Roja', 'no', 'no']],
  ['🚓 Prevención', 'Asignar gestor de relacionamiento a rutas SIGEI (y planilla codificada)', null, null, ['si', 'si', 'si', 'si', 'no', 'no', 'no']],
  ['🚓 Prevención', 'Ver rutas SIGEI por gestor (color, filtro y leyenda)', null, null, ['si', 'si', 'si', 'si', 'no', 'no', 'no']],
  ['🌲 Planificador CMPC', 'Turnos de Gestores de relacionamiento: programar', null, null, ['si', 'Sus áreas', 'Sus áreas', 'no (solo ve)', 'no', 'no', 'no']],
  ['🌲 Planificador CMPC', 'Turnos de Gestores de relacionamiento: ver', null, null, ['si', 'Sus áreas', 'Sus áreas', 'Sus áreas', 'no', 'no', 'no']],
  ['🧭 Planificador de Alertas', 'Al crear una ruta (no CMPC): ofrecer agregarla a Amarilla / Roja', 'planificador_mapa', 'editar', ['si', 'si', 'si', 'si', 'Desde Amarilla', 'no', 'no']],
  ['🧭 Planificador de Alertas', 'Descargar PDF del plan', 'planificador_mapa', 'ver', ['si', 'si', 'si', 'si', 'no', 'no', 'no']],
  ['🔥 Periodo Crítico', 'Ver periodos críticos y copamiento', 'periodo_critico', 'ver', ['si', 'si', 'si', 'si', 'si', 'si', 'no']],
  ['🔥 Periodo Crítico', 'Crear y editar periodos críticos', 'periodo_critico', 'editar', ['si', 'Sus comunas', 'Sus comunas', 'Sus comunas', 'Sus comunas', 'no', 'no']],
  ['🔥 Periodo Crítico', 'Eliminar periodos (activos o cerrados)', 'periodo_critico', 'editar', ['si', 'si', 'si', 'si', 'Solo los que creó (activos)', 'no', 'no']],
  ['📄 Informe', 'Ver y descargar el informe de copamiento', 'informe', 'ver', ['si', 'si', 'si', 'si', 'si', 'si', 'no']],
  ['📅 Turnos', 'Calendario de turnos de recursos', 'turnos', 'editar', ['si', 'Sus áreas', 'Sus áreas', 'Sus áreas', 'no', 'no', 'no']],
  ['🌲 Planificador CMPC', 'Planificador gráfico / Tablero de recursos', 'planificador_grafico', 'ver', ['si', 'si', 'si', 'si', 'no', 'si (consulta)', 'no']],
  ['🌲 Planificador CMPC', 'Mover / ubicar recursos en el mapa', 'planificador_grafico', 'editar', ['si', 'Sus áreas', 'Sus áreas', 'Sus áreas', 'no', 'no', 'no']],
  ['🌲 Planificador CMPC', 'Gestión de Recursos: editar datos y contacto', null, null, ['si', 'Sus áreas', 'Sus áreas', 'Sus áreas', 'no', 'no', 'no']],
  ['🌲 Planificador CMPC', 'Gestión de Recursos: nuevo recurso, carga Excel, empresas', null, null, ['si', 'Sus áreas', 'Sus áreas', 'Sus áreas', 'no', 'no', 'no']],
  ['🌲 Planificador CMPC', 'Gestión de Recursos: eliminar recurso (sin rutas)', null, null, ['si', 'Sus áreas', 'Sus áreas', 'Sus áreas', 'no', 'no', 'no']],
  ['🚓 Prevención', 'Gestión Patrullajes SIGEI', 'patrullajes', 'editar', ['si', 'si', 'si', 'si', 'no', 'no', 'no']],
  ['🚓 Prevención', 'Comunas Prioritarias: consultar', 'prioridad', 'ver', ['si', 'si', 'si', 'si', 'no', 'no', 'no']],
  ['🚓 Prevención', 'Comunas Prioritarias: editar parámetros y responsables', 'prioridad', 'editar', ['si', 'si', 'si', 'si', 'no', 'no', 'no']],
  ['🚓 Prevención', 'Acciones de Riesgo (Central de Transporte)', null, null, ['si', 'Sus áreas', 'Sus áreas', 'Sus áreas', 'no', 'no', 'no']],
  ['🚓 Prevención', 'Reportes de la App de Patrullaje (estado y respuesta al patrullero)', null, null, ['si', 'si', 'si', 'si', 'no', 'no', 'no']],
  ['🚓 Prevención', 'Implementación por comuna (7 etapas, 24 comunas) — marcar etapas', null, null, ['si', 'no (solo lectura)', 'no (solo lectura)', 'no (solo lectura)', 'no', 'no', 'no']],
  ['🚓 Prevención', 'Implementación por comuna — ver avance', null, null, ['si', 'si', 'si', 'si', 'no', 'no', 'no']],
  ['🚓 Prevención', 'Bosques recreativos: consultar', null, null, ['si', 'Su subgerencia', 'Sus áreas', 'Sus áreas', 'no', 'no', 'no']],
  ['🚓 Prevención', 'Bosques recreativos: administración, acceso e inversión', null, null, ['si', 'Sus áreas', 'Sus áreas', 'Sus áreas', 'no', 'no', 'no']],
  ['🚓 Prevención', 'Bosques recreativos: crear o eliminar bosques', null, null, ['si', 'no', 'no', 'no', 'no', 'no', 'no']],
  ['📈 Seguimiento', 'Tablero de Seguimiento (comunas, recursos, turnos)', null, null, ['Ambas subgerencias', 'Su subgerencia', 'no', 'no', 'no', 'no', 'no']],
  ['🌾 Agricultores', 'Tablero Gestión Asociación Malleco (ver)', null, null, ['si', 'Si tiene el área Victoria', 'Área Victoria', 'Área Victoria', 'no', 'no', 'si']],
  ['🌾 Agricultores', 'Registrar actividades, agricultores y planificación (web y app de terreno)', null, null, ['si', 'no', 'no', 'no', 'no', 'no', 'si']],
  ['🌾 Agricultores', 'Metas mensuales de las actividades', null, null, ['si', 'no', 'no', 'no', 'no', 'no', 'Solo escuelas (A8)']],
  ['🌾 Agricultores', 'Patrullaje en días de alerta desde la app (misma sesión)', null, null, ['si', 'no', 'no', 'no', 'no', 'no', 'si']],
  ['🌾 Agricultores', 'Resto del sistema (mapa, dashboard, planificadores)', null, null, ['si', 'si', 'si', 'si', 'si', 'si', 'no']],
  ['⚙️ Administración', 'Usuarios: crear, editar, desactivar, clave', null, null, ['si', 'no', 'no', 'no', 'no', 'no', 'no']],
  ['⚙️ Administración', 'Eliminar cuentas inactivas', null, null, ['si', 'no', 'no', 'no', 'no', 'no', 'no']],
  ['⚙️ Administración', 'Permisos por perfil y por usuario', null, null, ['si', 'no', 'no', 'no', 'no', 'no', 'no']],
  ['⚙️ Administración', 'Instituciones, catálogo, comunas por área', null, null, ['si', 'no', 'no', 'no', 'no', 'no', 'no']],
  ['⚙️ Administración', 'Sesiones, actividad y auditoría', null, null, ['si', 'no', 'no', 'no', 'no', 'no', 'no']],
  ['⚙️ Administración', '«Ver como…» otro perfil', null, null, ['si', 'no', 'no', 'no', 'no', 'no', 'no']],
];
state.audp = { vista: 'matriz', q: '', perfil: '', permPerfil: null, permUsuario: null };
/** Nivel del perfil en un módulo: mínimo(máximo técnico, ajuste en 🛡️ Permisos por perfil). */
function audNivelPerfil_(perfil, k) {
  let n = nivelMaximoPerfil_(perfil, k);
  const cfg = (state.audp.permPerfil || {})[perfil];
  const v = cfg && cfg.modulos && cfg.modulos[k];
  if (v && ORDEN_NIVEL_PERMISO[v] < ORDEN_NIVEL_PERMISO[n]) n = v;
  return n;
}
/** Celda de la matriz: { txt, cls } (si / condición / no / restringido por perfil). */
function audCelda_(fila, i) {
  const [, , k, n, reglas] = fila, regla = reglas[i], perfil = AUD_PERFILES[i];
  if (regla === 'no' || /^no\b/.test(regla)) return { txt: regla === 'no' ? '—' : regla.replace(/^no\s*/, '').replace(/[()]/g, '') || '—', cls: 'no' };
  if (k && ORDEN_NIVEL_PERMISO[audNivelPerfil_(perfil, k)] < ORDEN_NIVEL_PERMISO[n]) return { txt: 'Restringido por perfil', cls: 'restr' };
  return regla === 'si' ? { txt: '✔', cls: 'si' } : { txt: regla, cls: 'cond' };
}
/* ── 🧩 Módulos por perfil (19-10-2026): TODOS los menús del sistema y qué ve / edita cada perfil, calculado con las
 *  MISMAS reglas de los menús (MENU_MODULOS) simulando cada perfil con sus permisos guardados (permisos_perfil). ── */
function conPerfilSimulado_(perfilVisible, permPerfil, fn) {
  const g = { perfil: state.perfil, subgerencia: state.subgerencia, esGRT: state.esGRT, pp: state.permisosPerfilRol, pu: state.permisosUsuario,
    asoc: state.asociacion, areas: state.misAreasIds };
  try {
    state.perfil = Object.assign({}, state.perfil || {}, { perfil: perfilBase_(perfilVisible) });
    state.subgerencia = perfilVisible === 'Subgerente de Relacionamiento' ? 'NORTE' : null;
    state.esGRT = perfilVisible === PERFIL_GRT;
    state.asociacion = perfilVisible === PERFIL_ASOC ? 'MALLECO' : null;
    // Jefe / Subgerente / GRT simulados con el área de la Asociación: así la matriz muestra quién ve 🌾 Agricultores
    if (esJefeAreaPerfil_(perfilBase_(perfilVisible))) state.misAreasIds = [AGR_AREA_VISIBLE];
    state.permisosPerfilRol = (permPerfil || {})[perfilVisible] || null;
    state.permisosUsuario = null;   // sin restricciones propias de un usuario
    return fn();
  } finally {
    state.perfil = g.perfil; state.subgerencia = g.subgerencia; state.esGRT = g.esGRT; state.permisosPerfilRol = g.pp; state.permisosUsuario = g.pu;
    state.asociacion = g.asoc; state.misAreasIds = g.areas;
  }
}
function matrizModulosPerfil_(permPerfil) {
  return MENU_MODULOS.map(m => ({ m, celdas: AUD_PERFILES.map(p => conPerfilSimulado_(p, permPerfil, () => {
    let ve = false, nivel = 'no', nota = '';
    try { ve = menuVisible_(m); if (ve) { nivel = m.nivel ? m.nivel() : 'ver'; nota = m.nota ? m.nota() : ''; } } catch (e) { ve = false; }
    return { ve, nivel: ve ? (nivel === 'no' ? 'ver' : nivel) : 'no', nota };
  })) }));
}
async function adminSeccionModulosPerfil_(c) {
  c.innerHTML = adminHead_('🧩 Módulos por perfil', 'Cargando…');
  const permPerfil = {};
  try { const { data } = await supabaseClient.from('permisos_perfil').select('*'); (data || []).forEach(f => { permPerfil[f.perfil] = f; }); } catch (e) { /* sin SQL 119 */ }
  const filas = matrizModulosPerfil_(permPerfil);
  const ICO = { editar: ['✏️', 'Editar', 'mp-ed'], ver: ['👁️', 'Ver', 'mp-ver'], no: ['—', 'No ve', 'mp-no'] };
  const totales = AUD_PERFILES.map((p, i) => filas.filter(f => f.celdas[i].ve).length);
  let grupo = '';
  c.innerHTML = adminHead_('🧩 Módulos por perfil', 'Todos los menús del sistema y lo que ve cada perfil. Se calcula con las mismas reglas que muestran los menús, con los permisos por perfil guardados.',
      '<button class="popup-btn" id="mp-excel" style="padding:9px 12px;">⬇️ Excel</button>') +
    '<div class="mp-leyenda"><span class="mp-ed">✏️ Editar</span><span class="mp-ver">👁️ Solo ver</span><span class="mp-no">— No lo ve</span>' +
      '<span style="margin-left:auto;">Para cambiar un perfil: <a href="#" data-mp-ir="permisosPerfil">🛡️ Permisos por perfil</a> · por usuario: <a href="#" data-mp-ir="usuarios">👥 Usuarios</a></span></div>' +
    '<div class="admin-table-wrap" style="max-height:72vh;"><table class="admin-table mp-tabla"><thead><tr><th>Módulo</th>' +
      AUD_PERFILES.map((p, i) => '<th>' + escapeHtml_(AUD_CORTO[p] || p) + '<small>' + totales[i] + ' de ' + filas.length + '</small></th>').join('') + '</tr></thead><tbody>' +
      filas.map(f => {
        const cab = f.m.grupo !== grupo ? '<tr class="mp-grupo"><td colspan="' + (AUD_PERFILES.length + 1) + '">' + escapeHtml_(f.m.grupo) + '</td></tr>' : '';
        grupo = f.m.grupo;
        return cab + '<tr><td><b>' + escapeHtml_(f.m.nombre) + '</b></td>' + f.celdas.map(x => {
          const [ico, txt, cls] = ICO[x.nivel] || ICO.no;
          return '<td class="' + cls + '" title="' + escapeHtml_(txt + (x.nota ? ' · ' + x.nota : '')) + '"><span>' + ico + ' ' + txt + '</span>' + (x.nota ? '<small>' + escapeHtml_(x.nota) + '</small>' : '') + '</td>';
        }).join('') + '</tr>';
      }).join('') + '</tbody></table></div>';
  c.querySelectorAll('[data-mp-ir]').forEach(a => a.addEventListener('click', e => { e.preventDefault(); state.adminSeccion = a.dataset.mpIr; cargarSeccionAdmin_(a.dataset.mpIr); }));
  document.getElementById('mp-excel').addEventListener('click', async () => {
    try {
      const XLSX = await tbCargarSheetJs_();
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(filas.map(f => Object.assign({ 'Menú': f.m.grupo, 'Módulo': f.m.nombre },
        ...AUD_PERFILES.map((p, i) => ({ [p]: (ICO[f.celdas[i].nivel] || ICO.no)[1] + (f.celdas[i].nota ? ' (' + f.celdas[i].nota + ')' : '') }))))), 'Módulos por perfil');
      XLSX.writeFile(wb, 'modulos_por_perfil_' + tbHoyISO_() + '.xlsx');
    } catch (e) { mostrarToast_('No se pudo generar el Excel: ' + (e.message || e)); }
  });
}

async function adminSeccionAuditoriaPerfiles_(c) {
  const S = state.audp;
  c.innerHTML = adminHead_('🔎 Auditoría de perfiles', 'Cargando…');
  // Ajustes por perfil (SQL 119), restricciones por usuario (SQL 83) y usuarios
  S.permPerfil = {};
  try { const { data } = await supabaseClient.from('permisos_perfil').select('*'); (data || []).forEach(f => { S.permPerfil[f.perfil] = f; }); } catch (e) {}
  S.permUsuario = {};
  try { const { data } = await supabaseClient.from('permisos_usuario').select('perfil_id, modulos, capas_ocultas'); (data || []).forEach(f => { S.permUsuario[f.perfil_id] = f; }); } catch (e) {}
  if (!state.usuarios || !state.usuarios.length) {
    try {
      const { data } = await supabaseClient.functions.invoke('admin-usuarios', { body: { action: 'listar' } });
      state.usuarios = (data && data.usuarios) || [];
      const [{ data: ps }, { data: gs }, { data: ao }] = await Promise.all([
        supabaseClient.from('perfil_subgerencias').select('perfil_id, subgerencia'),
        supabaseClient.from('perfil_gestor_territorial').select('perfil_id'),
        supabaseClient.from('perfil_asociacion').select('perfil_id'),
      ]);
      const sg = {}; (ps || []).forEach(x => { sg[x.perfil_id] = x.subgerencia; });
      const gt = new Set((gs || []).map(x => x.perfil_id)), asc = new Set((ao || []).map(x => x.perfil_id));
      state.usuarios.forEach(u => { if (sg[u.id]) { u.perfil = 'Subgerente de Relacionamiento'; u.subgerencia = sg[u.id]; } else if (gt.has(u.id)) u.perfil = PERFIL_GRT; else if (asc.has(u.id) && u.perfil === 'Visor') u.perfil = PERFIL_ASOC; });
    } catch (e) { state.usuarios = state.usuarios || []; }
  }
  renderAuditoriaPerfiles_(c);
}
function audNivelUsuario_(u, k) {
  let n = audNivelPerfil_(u.perfil, k);
  const pu = state.audp.permUsuario[u.id], v = pu && pu.modulos && pu.modulos[k];
  if (v && ORDEN_NIVEL_PERMISO[v] < ORDEN_NIVEL_PERMISO[n]) n = v;
  return n;
}
function renderAuditoriaPerfiles_(c) {
  const S = state.audp;
  const NIV = { no: ['⛔', 'No'], ver: ['👁', 'Ver'], editar: ['✏️', 'Editar'] };
  const cuentaPerfil = p => (state.usuarios || []).filter(u => u.perfil === p && u.estado === 'activo').length;
  const tabs = '<div class="sg-chips" style="margin-bottom:12px;">' +
    [['matriz', '🧩 Qué puede hacer cada perfil'], ['modulos', '🛡️ Niveles por módulo y perfil'], ['usuarios', '👥 Permisos efectivos por usuario']].map(([v, t]) =>
      '<button class="sg-chip' + (S.vista === v ? ' on' : '') + '" data-aud-vista="' + v + '">' + t + '</button>').join('') +
    '<button class="btn-primary" id="aud-excel" style="flex:none;padding:7px 14px;margin-left:auto;">⬇️ Excel</button></div>';
  let cuerpo = '';
  if (S.vista === 'matriz') {
    let grupo = '';
    cuerpo = '<div class="admin-table-wrap" style="max-height:70vh;"><table class="admin-table aud-tabla"><thead><tr><th>Función</th>' +
      AUD_PERFILES.map(p => '<th class="c">' + escapeHtml_(AUD_CORTO[p]) + '<br><small>' + cuentaPerfil(p) + ' activo(s)</small></th>').join('') + '</tr></thead><tbody>' +
      AUD_CAPACIDADES.map(f => {
        const cab = f[0] !== grupo ? (grupo = f[0], '<tr class="grupo-row"><td colspan="' + (AUD_PERFILES.length + 1) + '">' + escapeHtml_(f[0]) + '</td></tr>') : '';
        return cab + '<tr><td>' + escapeHtml_(f[1]) + (f[2] ? ' <small style="color:var(--text-tertiary);">· módulo ' + escapeHtml_(f[2]) + '</small>' : '') + '</td>' +
          AUD_PERFILES.map((p, i) => { const x = audCelda_(f, i); return '<td class="c aud-' + x.cls + '">' + escapeHtml_(x.txt) + '</td>'; }).join('') + '</tr>';
      }).join('') + '</tbody></table></div>' +
      '<p style="font-size:11.5px;color:var(--text-tertiary);margin-top:8px;line-height:1.5;">✔ puede · texto = puede con esa condición · — no puede · «Restringido por perfil» = lo quitó el Administrador en 🛡️ Permisos por perfil. ' +
      'Además, a cada usuario se le pueden restringir módulos y capas (pestaña 👥). «Sus áreas» = áreas de relacionamiento asignadas (con sus comunas); «Sus comunas» = comunas asignadas.</p>';
  } else if (S.vista === 'modulos') {
    cuerpo = '<div class="admin-table-wrap"><table class="admin-table aud-tabla"><thead><tr><th>Módulo</th>' + AUD_PERFILES.map(p => '<th class="c">' + escapeHtml_(AUD_CORTO[p]) + '</th>').join('') + '</tr></thead><tbody>' +
      MODULOS_PERMISO.map(m => '<tr><td>' + m.nombre + '</td>' + AUD_PERFILES.map(p => {
        const max = nivelMaximoPerfil_(p, m.k), n = audNivelPerfil_(p, m.k);
        return '<td class="c aud-' + n + '" title="Máximo del perfil: ' + NIV[max][1] + '">' + NIV[n][0] + ' ' + NIV[n][1] + (n !== max ? ' <small>(máx. ' + NIV[max][1] + ')</small>' : '') + '</td>';
      }).join('') + '</tr>').join('') +
      '<tr><td>Capas ocultas</td>' + AUD_PERFILES.map(p => {
        const ocultas = capasOcultasPerfil_(perfilBase_(p)).concat(((S.permPerfil[p] || {}).capas_ocultas) || []);
        const nom = k => (CAPAS_PERMISO.find(x => x.k === k) || { nombre: k }).nombre;
        return '<td class="c" style="font-size:11px;">' + (ocultas.length ? escapeHtml_([...new Set(ocultas)].map(nom).join(', ')) : '—') + '</td>';
      }).join('') + '</tr></tbody></table></div>';
  } else {
    const q = normalizarBusqueda_(S.q || '');
    const lista = (state.usuarios || []).filter(u => (!S.perfil || u.perfil === S.perfil) && (!q || normalizarBusqueda_(u.nombre_completo + ' ' + u.email).includes(q)))
      .sort((a, b) => AUD_PERFILES.indexOf(a.perfil) - AUD_PERFILES.indexOf(b.perfil) || String(a.nombre_completo).localeCompare(String(b.nombre_completo), 'es'));
    cuerpo = '<div style="display:flex;gap:8px;margin-bottom:10px;flex-wrap:wrap;"><input id="aud-q" class="admin-search" placeholder="Buscar usuario…" value="' + escapeHtml_(S.q || '') + '">' +
      '<select id="aud-perfil" class="admin-search" style="min-width:0;"><option value="">Todos los perfiles</option>' + AUD_PERFILES.map(p => '<option' + (S.perfil === p ? ' selected' : '') + '>' + escapeHtml_(p) + '</option>').join('') + '</select>' +
      '<span class="admin-count">' + lista.length + ' usuario(s)</span></div>' +
      '<div class="admin-table-wrap" style="max-height:70vh;"><table class="admin-table aud-tabla"><thead><tr><th>Usuario</th><th>Perfil</th><th>Estado</th>' +
      MODULOS_PERMISO.map(m => '<th class="c" title="' + escapeHtml_(m.nombre) + '">' + m.nombre.split(' ')[0] + '<br><small>' + escapeHtml_(m.k.replace('_', ' ')) + '</small></th>').join('') + '<th>Ajustes propios</th></tr></thead><tbody>' +
      lista.map(u => {
        const pu = S.permUsuario[u.id];
        const propios = pu ? Object.keys(pu.modulos || {}).length + (pu.capas_ocultas || []).length : 0;
        return '<tr><td><b>' + escapeHtml_(u.nombre_completo || '—') + '</b><br><small style="color:var(--text-tertiary);">' + escapeHtml_(u.email || '') + '</small></td>' +
          '<td>' + badgePerfil_(u.perfil) + (u.subgerencia ? ' <small>' + escapeHtml_(aTitulo_(u.subgerencia)) + '</small>' : '') + '</td>' +
          '<td>' + (u.estado === 'activo' ? '<span class="bdg bdg-ok">Activo</span>' : '<span class="bdg bdg-off">Inactivo</span>') + '</td>' +
          MODULOS_PERMISO.map(m => { const n = audNivelUsuario_(u, m.k); return '<td class="c aud-' + n + '">' + NIV[n][0] + '</td>'; }).join('') +
          '<td style="font-size:11px;">' + (propios ? '🔐 ' + propios + ' restricción(es)' : '—') + '</td></tr>';
      }).join('') + '</tbody></table></div>' +
      '<p style="font-size:11.5px;color:var(--text-tertiary);margin-top:8px;">✏️ Editar · 👁 Ver · ⛔ Sin acceso — nivel efectivo = mínimo entre el perfil, 🛡️ Permisos por perfil y las restricciones propias del usuario.</p>';
  }
  c.innerHTML = adminHead_('🔎 Auditoría de perfiles', 'Todo lo que puede hacer cada perfil y cada usuario en el sistema') + tabs + cuerpo;
  c.querySelectorAll('[data-aud-vista]').forEach(b => b.addEventListener('click', () => { S.vista = b.dataset.audVista; renderAuditoriaPerfiles_(c); }));
  const qi = document.getElementById('aud-q');
  if (qi) { let t = null; qi.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { S.q = qi.value; renderAuditoriaPerfiles_(c); const n = document.getElementById('aud-q'); if (n) { n.focus(); n.setSelectionRange(n.value.length, n.value.length); } }, 250); }); }
  const ps = document.getElementById('aud-perfil'); if (ps) ps.addEventListener('change', () => { S.perfil = ps.value; renderAuditoriaPerfiles_(c); });
  document.getElementById('aud-excel').addEventListener('click', descargarAuditoriaPerfiles_);
}
async function descargarAuditoriaPerfiles_() {
  try {
    const XLSX = await tbCargarSheetJs_();
    const S = state.audp, NIV = { no: 'No', ver: 'Ver', editar: 'Editar' };
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(AUD_CAPACIDADES.map(f => Object.assign({ 'Módulo': f[0], 'Función': f[1], 'Módulo de permiso': f[2] || '' },
      Object.fromEntries(AUD_PERFILES.map((p, i) => { const x = audCelda_(f, i); return [AUD_CORTO[p], x.cls === 'si' ? 'Sí' : x.cls === 'no' ? (x.txt === '—' ? 'No' : 'No (' + x.txt + ')') : x.txt]; }))))), 'Funciones por perfil');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(MODULOS_PERMISO.map(m => Object.assign({ 'Módulo': m.nombre },
      Object.fromEntries(AUD_PERFILES.map(p => [AUD_CORTO[p], NIV[audNivelPerfil_(p, m.k)]]))))), 'Niveles por perfil');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet((state.usuarios || []).map(u => Object.assign({
      'Usuario': u.nombre_completo, 'Correo': u.email, 'Perfil': u.perfil, 'Subgerencia': u.subgerencia || '', 'Estado': u.estado,
      'Áreas': (u.area_ids || []).join(', '), 'Comunas': (u.comuna_ids || []).length },
      Object.fromEntries(MODULOS_PERMISO.map(m => [m.nombre.replace(/^\S+\s/, ''), NIV[audNivelUsuario_(u, m.k)]])),
      { 'Restricciones propias': S.permUsuario[u.id] ? JSON.stringify(S.permUsuario[u.id].modulos || {}) : '' }))), 'Usuarios');
    XLSX.writeFile(wb, 'auditoria_perfiles_' + fechaISO_(new Date()) + '.xlsx');
    mostrarToast_('✅ Auditoría de perfiles descargada.');
  } catch (e) { mostrarToast_('No se pudo generar el Excel: ' + (e.message || e)); }
}

// ---------- 🛡️ PERMISOS POR PERFIL (17-10-2026, SQL 119) ----------
// Matriz módulo × nivel y capas visibles para TODOS los usuarios de un perfil. El tope de cada módulo es lo
// que el perfil puede hacer técnicamente (nivelMaximoPerfil_; la BD no deja subir más). Encima se siguen
// aplicando las restricciones por usuario (🔐 en la lista de usuarios). El panel de Administración no se restringe.
state.pp = { perfil: 'Jefe de Área Relacionamiento' };
async function adminSeccionPermisosPerfil_(c) {
  const S = state.pp;
  c.innerHTML = adminHead_('🛡️ Permisos por perfil', 'Cargando…');
  const { data: filas, error } = await supabaseClient.from('permisos_perfil').select('*');
  if (error) {
    c.innerHTML = adminHead_('🛡️ Permisos por perfil', 'Permisos masivos para todos los usuarios de cada perfil') +
      '<div class="layer-empty-msg">No se pudieron leer los permisos por perfil: ' + escapeHtml_(error.message) + '<br>¿Ya se ejecutó <b>119_perfil_grt_y_permisos_por_perfil.sql</b> en Supabase?</div>';
    return;
  }
  const porPerfil = {}; (filas || []).forEach(f => { porPerfil[f.perfil] = f; });
  const fila = porPerfil[S.perfil] || { modulos: {}, capas_ocultas: [] };
  const usuariosDe = p => (state.usuarios || []).filter(u => u.perfil === p).length;
  const NOMBRE_NIVEL = { no: 'No acceso', ver: 'Ver', editar: 'Editar' };
  const resumen = p => { const f = porPerfil[p]; const n = f ? Object.keys(f.modulos || {}).length + (f.capas_ocultas || []).length : 0; return n ? n + ' ajuste(s)' : 'sin ajustes'; };
  let tabla = '<table class="perm-tabla"><thead><tr><th>Módulo</th><th class="c">No acceso</th><th class="c">Ver</th><th class="c">Editar</th><th>Máximo del perfil</th></tr></thead><tbody>';
  MODULOS_PERMISO.forEach(m => {
    const max = nivelMaximoPerfil_(S.perfil, m.k);
    const g = fila.modulos && fila.modulos[m.k];
    const actual = (g && ORDEN_NIVEL_PERMISO[g] < ORDEN_NIVEL_PERMISO[max]) ? g : max;
    tabla += '<tr><td>' + m.nombre + '</td>' + ['no', 'ver', 'editar'].map(nv => {
      const posible = m.niveles.includes(nv) && ORDEN_NIVEL_PERMISO[nv] <= ORDEN_NIVEL_PERMISO[max];
      return '<td class="c"><input type="radio" name="pp-' + m.k + '" value="' + nv + '" title="' + NOMBRE_NIVEL[nv] + '"' + (actual === nv ? ' checked' : '') + (posible ? '' : ' disabled') + '></td>';
    }).join('') + '<td style="font-size:11px;color:var(--text-tertiary);">' + NOMBRE_NIVEL[max] + '</td></tr>';
  });
  tabla += '</tbody></table>';
  const ocultas = Array.isArray(fila.capas_ocultas) ? fila.capas_ocultas : [];
  const capas = CAPAS_PERMISO.map(cp => {
    const fija = capasOcultasPerfil_(perfilBase_(S.perfil)).includes(cp.k);
    return '<label' + (fija ? ' style="opacity:.45;cursor:not-allowed;" title="Este perfil no incluye esta capa"' : '') + '>' +
      '<input type="checkbox" data-pp-capa="' + cp.k + '"' + (fija ? ' disabled' : (ocultas.includes(cp.k) ? '' : ' checked')) + '><span>' + escapeHtml_(cp.nombre) + '</span></label>';
  }).join('');
  c.innerHTML = adminHead_('🛡️ Permisos por perfil', 'Lo que se define aquí se aplica a TODOS los usuarios del perfil (al volver a entrar al sistema)') +
    '<div class="sg-chips" style="margin-bottom:12px;">' + PERFILES_CONFIGURABLES.map(p =>
      '<button class="sg-chip' + (p === S.perfil ? ' on' : '') + '" data-pp-perfil="' + escapeHtml_(p) + '">' + escapeHtml_(p === PERFIL_GRT ? 'GRT · Gestor de Relacionamiento Territorial' : p) +
      ' <small>' + resumen(p) + '</small></button>').join('') + '</div>' +
    '<div class="dash-card" style="max-width:860px;">' +
      '<div class="dash-card-title" style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px;"><span>' + escapeHtml_(S.perfil) + '</span>' +
        '<span style="font-size:11.5px;font-weight:600;color:var(--text-tertiary);">' + (state.usuarios ? usuariosDe(S.perfil) + ' usuario(s) con este perfil' : '') +
        (porPerfil[S.perfil] && porPerfil[S.perfil].actualizado_en ? ' · modificado ' + new Date(porPerfil[S.perfil].actualizado_en).toLocaleString('es-CL') : '') + '</span></div>' +
      (S.perfil === 'Administrador' ? '<div class="pl-aviso warn" style="margin-bottom:10px;">⚠️ Restringir al Administrador afecta a todos los administradores (el panel de Administración siempre queda disponible).</div>' : '') +
      tabla +
      '<p class="section-label" style="margin:12px 0 8px;">Capas que puede ver en el mapa</p><div class="perm-capas">' + capas + '</div>' +
      '<p style="font-size:11px;color:var(--text-tertiary);margin-top:10px;line-height:1.45;">Los niveles grises superan lo que el perfil puede hacer. Las ediciones se bloquean también en la base de datos. ' +
        'Las restricciones por usuario (🔐 en Usuarios) se aplican además de estas.</p>' +
      '<div style="display:flex;gap:8px;margin-top:12px;"><button class="btn-primary" id="pp-guardar" style="flex:none;padding:9px 16px;">💾 Guardar para todo el perfil</button>' +
        '<button class="btn-secondary" id="pp-restablecer" style="flex:none;padding:9px 16px;">↺ Restablecer (sin ajustes)</button></div>' +
    '</div>';
  c.querySelectorAll('[data-pp-perfil]').forEach(b => b.addEventListener('click', () => { S.perfil = b.dataset.ppPerfil; adminSeccionPermisosPerfil_(c); }));
  document.getElementById('pp-guardar').addEventListener('click', async () => {
    const modulos = {};
    MODULOS_PERMISO.forEach(m => {
      const sel = c.querySelector('input[name="pp-' + m.k + '"]:checked'); if (!sel) return;
      if (ORDEN_NIVEL_PERMISO[sel.value] < ORDEN_NIVEL_PERMISO[nivelMaximoPerfil_(S.perfil, m.k)]) modulos[m.k] = sel.value;   // solo lo restringido
    });
    const capasOc = [...c.querySelectorAll('[data-pp-capa]')].filter(i => !i.disabled && !i.checked).map(i => i.dataset.ppCapa);
    if (!confirm('¿Aplicar estos permisos a TODOS los usuarios con perfil «' + S.perfil + '»?\nSe aplican la próxima vez que cada usuario entre al sistema.')) return;
    const { error: e2 } = await supabaseClient.from('permisos_perfil').upsert({ perfil: S.perfil, modulos, capas_ocultas: capasOc, actualizado_en: new Date().toISOString(), actualizado_por: state.user && state.user.id });
    if (e2) { mostrarToast_('No se guardó: ' + e2.message); return; }
    mostrarToast_('🛡️ Permisos del perfil «' + S.perfil + '» guardados.');
    adminSeccionPermisosPerfil_(c);
  });
  document.getElementById('pp-restablecer').addEventListener('click', async () => {
    if (!porPerfil[S.perfil]) { mostrarToast_('Este perfil no tiene ajustes.'); return; }
    if (!confirm('¿Quitar todos los ajustes del perfil «' + S.perfil + '»? Vuelve a sus permisos por defecto.')) return;
    const { error: e3 } = await supabaseClient.from('permisos_perfil').delete().eq('perfil', S.perfil);
    if (e3) { mostrarToast_('No se pudo restablecer: ' + e3.message); return; }
    mostrarToast_('↺ Perfil «' + S.perfil + '» restablecido.');
    adminSeccionPermisosPerfil_(c);
  });
}

// ---------- PERMISOS POR USUARIO (11-10-2026, SQL 83) ----------
// Matriz módulo × nivel (No acceso / Ver / Editar) + capas visibles. Solo se
// puede RESTRINGIR lo que el perfil ya permite: los niveles por encima del
// perfil aparecen deshabilitados. Se guardan solo las restricciones.
state.permEdit = null;
async function abrirPermisosUsuario_(u) {
  if (!u) return;
  const ov = document.getElementById('permisos-overlay');
  const cuerpo = document.getElementById('perm-cuerpo');
  const err = document.getElementById('perm-error'); err.classList.remove('show');
  document.getElementById('perm-nombre').textContent = u.nombre_completo || u.email || '—';
  document.getElementById('perm-sub').textContent = 'Perfil: ' + u.perfil + '. Aquí solo se puede restringir lo que su perfil ya permite (los niveles grises no aplican a este perfil).';
  cuerpo.innerHTML = '<div class="layer-empty-msg">Cargando permisos…</div>';
  ov.classList.add('show');
  const { data, error } = await supabaseClient.from('permisos_usuario').select('modulos, capas_ocultas').eq('perfil_id', u.id).maybeSingle();
  if (error) {
    cuerpo.innerHTML = '<div class="layer-empty-msg">No se pudieron leer los permisos: ' + escapeHtml_(error.message) +
      '<br>¿Ya se ejecutó <b>sql/pendientes/83_permisos_usuario.sql</b> en Supabase?</div>';
    return;
  }
  const fila = data || { modulos: {}, capas_ocultas: [] };
  state.permEdit = { u };
  const NOMBRE_NIVEL = { no: 'No acceso', ver: 'Ver', editar: 'Editar' };
  let html = '<table class="perm-tabla"><thead><tr><th>Módulo</th><th class="c">No acceso</th><th class="c">Ver</th><th class="c">Editar</th></tr></thead><tbody>';
  MODULOS_PERMISO.forEach(m => {
    const max = nivelMaximoPerfil_(u.perfil, m.k);
    const guardado = fila.modulos && fila.modulos[m.k];
    const actual = (guardado && ORDEN_NIVEL_PERMISO[guardado] < ORDEN_NIVEL_PERMISO[max]) ? guardado : max;
    html += '<tr><td>' + m.nombre + '</td>' + ['no', 'ver', 'editar'].map(nv => {
      const posible = m.niveles.includes(nv) && ORDEN_NIVEL_PERMISO[nv] <= ORDEN_NIVEL_PERMISO[max];
      return '<td class="c"><input type="radio" name="perm-' + m.k + '" value="' + nv + '" title="' + NOMBRE_NIVEL[nv] + '"' +
        (actual === nv ? ' checked' : '') + (posible ? '' : ' disabled') + '></td>';
    }).join('') + '</tr>';
  });
  html += '</tbody></table>';
  const ocultas = Array.isArray(fila.capas_ocultas) ? fila.capas_ocultas : [];
  html += '<p class="section-label" style="margin:4px 0 8px;">Capas que puede ver en el mapa</p><div class="perm-capas">' +
    CAPAS_PERMISO.map(cp => {
      const porPerfil = capasOcultasPerfil_(u.perfil).includes(cp.k);   // el perfil no la ve nunca
      return '<label' + (porPerfil ? ' style="opacity:.45;cursor:not-allowed;" title="Su perfil no incluye esta capa"' : '') + '>' +
        '<input type="checkbox" data-capa="' + cp.k + '"' + (porPerfil ? ' disabled' : (ocultas.includes(cp.k) ? '' : ' checked')) + '>' +
        '<span>' + escapeHtml_(cp.nombre) + '</span></label>';
    }).join('') +
    '</div><p style="font-size:11px;color:var(--text-tertiary);margin-top:10px;line-height:1.45;">' +
    'Las ediciones se bloquean también en la base de datos. La visibilidad de capas se aplica en el panel de capas del mapa. ' +
    'Los cambios se aplican la próxima vez que el usuario entre al sistema.</p>';
  cuerpo.innerHTML = html;
}
async function guardarPermisosUsuario_(restablecer) {
  const pe = state.permEdit; if (!pe || !pe.u) return;
  const err = document.getElementById('perm-error'); err.classList.remove('show');
  const u = pe.u;
  let error;
  if (restablecer) {
    if (!confirm('¿Quitar todas las restricciones de ' + (u.nombre_completo || u.email) + '? Quedará con todo lo que permite su perfil.')) return;
    ({ error } = await supabaseClient.from('permisos_usuario').delete().eq('perfil_id', u.id));
  } else {
    const modulos = {};
    MODULOS_PERMISO.forEach(m => {
      const r = document.querySelector('input[name="perm-' + m.k + '"]:checked');
      const max = nivelMaximoPerfil_(u.perfil, m.k);
      if (r && ORDEN_NIVEL_PERMISO[r.value] < ORDEN_NIVEL_PERMISO[max]) modulos[m.k] = r.value;   // solo restricciones
    });
    // Solo restricciones propias del usuario (las del perfil ya se aplican siempre)
    const capas_ocultas = Array.from(document.querySelectorAll('#perm-cuerpo [data-capa]')).filter(x => !x.checked && !x.disabled).map(x => x.dataset.capa);
    if (!Object.keys(modulos).length && !capas_ocultas.length) {
      ({ error } = await supabaseClient.from('permisos_usuario').delete().eq('perfil_id', u.id));
    } else {
      ({ error } = await supabaseClient.from('permisos_usuario').upsert({
        perfil_id: u.id, modulos, capas_ocultas, actualizado_en: new Date().toISOString(), actualizado_por: state.user.id,
      }, { onConflict: 'perfil_id' }));
    }
  }
  if (error) { err.textContent = 'No se pudo guardar: ' + error.message; err.classList.add('show'); return; }
  document.getElementById('permisos-overlay').classList.remove('show');
  mostrarToast_('🔐 Permisos de ' + (u.nombre_completo || u.email) + ' ' + (restablecer ? 'restablecidos según su perfil.' : 'guardados.'));
}

// ---------- INSTITUCIONES ----------
async function adminSeccionInstituciones_(c) {
  const { data, error } = await supabaseClient.from('instituciones').select('*').order('nombre');
  if (error) { c.innerHTML = adminHead_('Instituciones', '') + '<div class="layer-empty-msg">' + error.message + '</div>'; return; }
  state.instituciones = data || [];
  const render = () => {
    const conLogo = state.instituciones.filter(i => i.logo_url).length;
    const activas = state.instituciones.filter(i => i.estado === 'activo').length;
    c.innerHTML = adminHead_('Instituciones', 'Catálogo de instituciones y empresas, con color y logo',
      densToggle_() + '<button class="btn-primary" id="adm-i-nuevo" style="padding:9px 14px;">+ Nueva institución</button>') +
      '<div class="adm-kpis">' +
      admKpi_('🏢', '#EFF4FF', 'Total', state.instituciones.length) +
      admKpi_('✅', '#DCFCE7', 'Activas', activas) +
      admKpi_('⏸️', '#FEE2E2', 'Inactivas', state.instituciones.length - activas) +
      admKpi_('🖼️', '#FEF3C7', 'Con logo', conLogo) +
      admKpi_('◻️', '#F1F5F9', 'Sin logo', state.instituciones.length - conLogo) +
      '</div>' +
      '<div class="admin-table-wrap"><table class="admin-table dens-' + state.admDensidad + '"><thead><tr><th>Institución</th><th>Color</th><th>Logo</th><th>Estado</th><th></th></tr></thead><tbody>' +
      grupoRow_('Activas', activas, 5) +
      state.instituciones.filter(i => i.estado === 'activo').map(filaInst_).join('') +
      (state.instituciones.length - activas > 0 ? grupoRow_('Inactivas', state.instituciones.length - activas, 5) + state.instituciones.filter(i => i.estado !== 'activo').map(filaInst_).join('') : '') +
      '</tbody></table></div>';
    document.getElementById('adm-i-nuevo').addEventListener('click', () => abrirModalInstitucion_(null));
    bindDensidad_(c, render);
    c.querySelectorAll('[data-e]').forEach(b => b.onclick = () => abrirModalInstitucion_(state.instituciones.find(x => x.id === b.dataset.e)));
    c.querySelectorAll('[data-s]').forEach(b => b.onclick = async () => { await toggleEstadoInstitucion_(b.dataset.s, b.dataset.st); });
  };
  const filaInst_ = (i) => '<tr><td><div class="cell-persona"><span class="swatch-lg" style="background:' + i.color_hex + '"></span><div><div class="cp-nombre">' + escapeHtml_(i.nombre) + '</div><div class="cp-sub">' + escapeHtml_(i.icono_key || '') + '</div></div></div></td>' +
    '<td><span style="font-family:monospace;font-size:11px;">' + i.color_hex + '</span></td>' +
    '<td>' + (i.logo_url ? '<img class="logo-cell" src="' + escapeHtml_(i.logo_url) + '">' : '<span class="logo-empty">+</span>') + '</td>' +
    '<td>' + (i.estado === 'activo' ? '<span class="bdg bdg-ok">Activa</span>' : '<span class="bdg bdg-off">Inactiva</span>') + '</td>' +
    '<td class="acciones-cell"><span class="act-btns">' + actBtn_('editar', 'data-e="' + i.id + '"') + actBtn_(i.estado === 'activo' ? 'desactivar' : 'activar', 'data-s="' + i.id + '" data-st="' + i.estado + '"') + '</span></td></tr>';
  render();
}

// ---------- CATÁLOGO DE RECURSOS ----------
async function adminSeccionRecursos_(c) {
  const { data, error } = await supabaseClient.from('recursos_maestro').select('*, instituciones(nombre, color_hex, logo_url)').order('created_at', { ascending: false });
  if (error) { c.innerHTML = adminHead_('Catálogo de recursos', '') + '<div class="layer-empty-msg">' + error.message + '</div>'; return; }
  state.recursosMaestroLista = data || [];
  const render = () => {
    const L = state.recursosMaestroLista;
    const porTipo = {}; L.forEach(r => { porTipo[r.tipo_recurso] = (porTipo[r.tipo_recurso] || 0) + 1; });
    const personas = L.reduce((a, r) => a + (r.cantidad_personas || 0), 0);
    const activos = L.filter(r => r.activo).length;
    c.innerHTML = adminHead_('Catálogo de recursos', 'Tabla maestra de recursos que luego se asignan por zona',
      densToggle_() + '<button class="btn-primary" id="adm-r-nuevo" style="padding:9px 14px;">+ Nuevo recurso</button>') +
      '<div class="adm-kpis">' +
      admKpi_('📦', '#EFF4FF', 'Total', L.length) +
      admKpi_('✅', '#DCFCE7', 'Activos', activos) +
      admKpi_('🧑‍🚒', '#FEF3C7', 'Brigadas', porTipo['Brigada'] || 0) +
      admKpi_('👁️', '#EDE9FE', 'Vigías', porTipo['Vigía'] || 0) +
      admKpi_('🚓', '#DBEAFE', 'Patrullaje', porTipo['Patrullaje'] || 0) +
      admKpi_('👥', '#F1F5F9', 'Personas totales', personas) +
      '</div>' +
      '<div class="admin-table-wrap"><table class="admin-table dens-' + state.admDensidad + '"><thead><tr><th>Recurso</th><th>Tipo</th><th>Móvil</th><th>Personas</th><th>Estado</th><th></th></tr></thead><tbody id="adm-r-tbody"></tbody></table></div>';
    // Agrupado por institución
    const porInst = {}; L.forEach(r => { const n = (r.instituciones && r.instituciones.nombre) || 'Sin institución'; (porInst[n] = porInst[n] || []).push(r); });
    let html = '';
    Object.keys(porInst).sort().forEach(n => {
      const g = porInst[n]; const inst = g[0].instituciones || { color_hex: '#64748B' };
      html += '<tr class="grupo-row"><td colspan="6"><span class="swatch-lg" style="background:' + inst.color_hex + ';width:12px;height:12px;margin-right:8px;"></span>' + escapeHtml_(n) + '<span class="g-count">' + g.length + ' · ' + g.reduce((a, r) => a + (r.cantidad_personas || 0), 0) + ' pers.</span></td></tr>';
      g.forEach(r => {
        html += '<tr><td><div class="cell-persona"><div><div class="cp-nombre">' + escapeHtml_(r.nombre_recurso || '—') + '</div><div class="cp-sub">' + escapeHtml_(r.descripcion_funcion || '') + '</div></div></div></td>' +
          '<td><span class="bdg bdg-neutral">' + escapeHtml_(r.tipo_recurso) + '</span></td><td>' + escapeHtml_(r.tipo_movil && r.tipo_movil !== 'No Aplica' ? r.tipo_movil : '—') + '</td><td><b>' + (r.cantidad_personas || 0) + '</b></td>' +
          '<td>' + (r.activo ? '<span class="bdg bdg-ok">Activo</span>' : '<span class="bdg bdg-off">Inactivo</span>') + '</td>' +
          '<td class="acciones-cell"><span class="act-btns">' + actBtn_('editar', 'data-e="' + r.id + '"') + actBtn_(r.activo ? 'desactivar' : 'activar', 'data-s="' + r.id + '" data-st="' + r.activo + '"') + actBtn_('eliminar', 'data-d="' + r.id + '"') + '</span></td></tr>';
      });
    });
    document.getElementById('adm-r-tbody').innerHTML = html || '<tr><td colspan="6" style="padding:14px;color:var(--text-tertiary);">Sin recursos.</td></tr>';
    document.getElementById('adm-r-nuevo').addEventListener('click', () => abrirModalRecursoMaestro_(null));
    bindDensidad_(c, render);
    c.querySelectorAll('[data-e]').forEach(b => b.onclick = () => abrirModalRecursoMaestro_(state.recursosMaestroLista.find(x => x.id === b.dataset.e)));
    c.querySelectorAll('[data-s]').forEach(b => b.onclick = async () => { await toggleActivoRecursoMaestro_(b.dataset.s, b.dataset.st === 'true'); });
    c.querySelectorAll('[data-d]').forEach(b => b.onclick = async () => { await eliminarRecursoMaestro_(b.dataset.d); });
  };
  render();
}

// ---------- PATRULLEROS ----------

// ══════════════════════════════════════════════════════════════════════════
// ADMIN APP — PATRULLEROS (crear / editar usuarios de la app móvil)
// ══════════════════════════════════════════════════════════════════════════
async function adminSeccionAppPatrulleros_(c) {
  c.innerHTML = adminHead_('📱 Patrulleros App',
    'Usuarios registrados en la app móvil de patrullaje',
    '<button class="btn-admin-action" id="btn-nuevo-patrullero-app">+ Nuevo patrullero</button>'
  ) + '<div id="app-pat-contenido"><div class="layer-empty-msg">Cargando…</div></div>';

  c.querySelector('#btn-nuevo-patrullero-app').addEventListener('click', () => abrirModalPatrulleroApp_());
  await renderAppPatrullerosList_(c.querySelector('#app-pat-contenido'));
}

async function renderAppPatrullerosList_(cont) {
  const { data, error } = await supabaseClient
    .from('app_usuarios')
    .select('*, comunas(comuna)')
    .order('creado_en', { ascending: false });

  if (error || !data || !data.length) {
    cont.innerHTML = '<div class="layer-empty-msg">Sin patrulleros registrados aún.<br><small>Usa el botón "+ Nuevo patrullero" para agregar.</small></div>';
    return;
  }

  cont.innerHTML = '<div class="admin-table-wrap"><table class="admin-table"><thead><tr>' +
    '<th>Patrullero</th><th>Teléfono</th><th>Institución</th><th>Comuna</th><th>Último acceso</th><th>Estado</th><th>Acciones</th>' +
    '</tr></thead><tbody>' +
    data.map(u => {
      const ini = (u.nombre||'?').split(' ').map(n=>n[0]).join('').substring(0,2).toUpperCase();
      const col = colorAvatar_(u.nombre);
      const acceso = u.ultimo_acceso
        ? new Date(u.ultimo_acceso).toLocaleString('es-CL',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})
        : 'Nunca';
      const estadoColor = u.activo ? '#DCFCE7' : '#F1F5F9';
      const estadoTxt   = u.activo ? '#166534' : '#64748B';
      return '<tr>' +
        '<td style="display:flex;align-items:center;gap:8px;padding:10px 8px;">' +
          '<span class="avatar sm" style="background:'+col+'">'+escapeHtml_(ini)+'</span>' +
          '<span>'+escapeHtml_(u.nombre||'—')+'</span></td>' +
        '<td>'+escapeHtml_(u.telefono)+'</td>' +
        '<td>'+escapeHtml_(u.institucion||'—')+'</td>' +
        '<td>'+escapeHtml_(u.comunas?.comuna||'—')+'</td>' +
        '<td style="white-space:nowrap;">'+acceso+'</td>' +
        '<td><span class="rol-badge" style="background:'+estadoColor+';color:'+estadoTxt+'">'+(u.activo?'Activo':'Inactivo')+'</span></td>' +
        '<td><div style="display:flex;gap:6px;">' +
          '<button class="popup-btn btn-edit-pat-app" data-id="'+u.id+'" title="Editar">✏️ Editar</button>' +
          '<button class="popup-btn btn-toggle-pat-app" data-id="'+u.id+'" data-activo="'+u.activo+'" title="'+(u.activo?'Desactivar':'Activar')+'">'+(u.activo?'🔒 Desactivar':'🔓 Activar')+'</button>' +
        '</div></td>' +
        '</tr>';
    }).join('') +
    '</tbody></table></div>';

  // Listeners con data-id (sin onclick inline)
  cont.querySelectorAll('.btn-edit-pat-app').forEach(btn =>
    btn.addEventListener('click', () => abrirModalPatrulleroApp_(btn.dataset.id))
  );
  cont.querySelectorAll('.btn-toggle-pat-app').forEach(btn =>
    btn.addEventListener('click', async () => {
      const nuevoEstado = btn.dataset.activo === 'true' ? false : true;
      await supabaseClient.from('app_usuarios').update({ activo: nuevoEstado }).eq('id', btn.dataset.id);
      mostrarToast_(nuevoEstado ? '✅ Patrullero activado' : 'Patrullero desactivado');
      cargarSeccionAdmin_('appPatrulleros');
    })
  );
}

async function abrirModalPatrulleroApp_(id) {
  // Cargar datos existentes si es edición
  let u = null;
  if (id) {
    const { data } = await supabaseClient.from('app_usuarios').select('*').eq('id', id).maybeSingle();
    u = data;
  }

  // Cargar instituciones actualizadas desde BD
  const { data: insts } = await supabaseClient.from('instituciones')
    .select('id, nombre').eq('estado','activo').order('nombre');
  const instOpts = (insts||[]).map(i =>
    '<option value="'+escapeHtml_(i.nombre)+'"'+(u?.institucion===i.nombre?' selected':'')+'>'+escapeHtml_(i.nombre)+'</option>'
  ).join('');

  // Comunas
  const comunasOpts = (state.comunas||[]).map(c =>
    '<option value="'+escapeHtml_(c.id)+'"'+(u?.comuna_id===c.id?' selected':'')+'>'+escapeHtml_(c.comuna)+'</option>'
  ).join('');

  // Quitar modal previo si existe
  document.getElementById('modal-patrullero-app')?.remove();

  const modal = document.createElement('div');
  modal.className = 'modal-overlay show';
  modal.id = 'modal-patrullero-app';
  modal.innerHTML = `
    <div class="modal-card" style="max-width:520px;width:95vw;max-height:90vh;overflow-y:auto;">
      <h3 style="margin-bottom:20px;font-size:16px;">${id ? '✏️ Editar Patrullero' : '➕ Nuevo Patrullero App'}</h3>

      <div class="form-group">
        <label class="form-label">Nombre completo</label>
        <input type="text" id="app-p-nombre" class="form-control" value="${escapeHtml_(u?.nombre||'')}" placeholder="Juan Pérez">
      </div>

      <div class="form-group">
        <label class="form-label">Teléfono <small style="color:var(--text-tertiary)">(es el usuario de ingreso)</small></label>
        <input type="tel" id="app-p-tel" class="form-control" value="${escapeHtml_(u?.telefono||'')}" placeholder="+56912345678" ${id?'readonly style="background:#F8FAFC"':''}>
      </div>

      <div class="form-group">
        <label class="form-label">Contraseña ${id?'<small style="color:var(--text-tertiary)">(vacío = no cambia)</small>':''}</label>
        <input type="text" id="app-p-clave" class="form-control" placeholder="Ej: collipulli">
        <p style="font-size:11px;color:var(--text-tertiary);margin-top:4px;">Se guarda cifrada. El patrullero la ingresa en la app.</p>
      </div>

      <div class="form-group">
        <label class="form-label">Institución</label>
        <select id="app-p-inst" class="form-control">
          <option value="">— Selecciona institución —</option>
          ${instOpts}
        </select>
      </div>

      <div class="form-group">
        <label class="form-label">Comuna asignada</label>
        <select id="app-p-comuna" class="form-control">
          <option value="">— Selecciona comuna —</option>
          ${comunasOpts}
        </select>
      </div>

      <div class="form-group">
        <label class="form-label">Estado</label>
        <select id="app-p-activo" class="form-control">
          <option value="true" ${u?.activo!==false?'selected':''}>✅ Activo</option>
          <option value="false" ${u?.activo===false?'selected':''}>🔒 Inactivo</option>
        </select>
      </div>

      <p class="form-error" id="app-p-error" style="min-height:16px;color:var(--red);font-size:12px;margin-top:4px;"></p>

      <div style="display:flex;gap:10px;margin-top:16px;justify-content:flex-end;">
        <button class="popup-btn" id="btn-cancelar-pat-app">Cancelar</button>
        <button class="popup-btn primary" id="btn-guardar-pat-app">${id ? 'Guardar cambios' : 'Crear patrullero'}</button>
      </div>
    </div>`;

  document.body.appendChild(modal);

  // Listeners dentro del modal (sin onclick inline)
  document.getElementById('btn-cancelar-pat-app').addEventListener('click', () => modal.remove());
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });

  document.getElementById('btn-guardar-pat-app').addEventListener('click', async () => {
    const btnGuardar = document.getElementById('btn-guardar-pat-app');
    const errEl      = document.getElementById('app-p-error');
    errEl.textContent = '';

    const nombre   = document.getElementById('app-p-nombre').value.trim();
    const telefono = document.getElementById('app-p-tel').value.trim().replace(/\s/g,'');
    const claveRaw = document.getElementById('app-p-clave').value.trim();
    const inst     = document.getElementById('app-p-inst').value;
    const comunaId = document.getElementById('app-p-comuna').value;
    const activo   = document.getElementById('app-p-activo').value === 'true';

    if (!nombre)              { errEl.textContent = 'El nombre es obligatorio.'; return; }
    if (!id && !telefono)     { errEl.textContent = 'El teléfono es obligatorio.'; return; }
    if (!id && !claveRaw)     { errEl.textContent = 'La contraseña es obligatoria.'; return; }
    if (!inst)                { errEl.textContent = 'Selecciona una institución.'; return; }

    btnGuardar.textContent = 'Guardando…'; btnGuardar.disabled = true;

    // Hash SHA-256
    let claveHash = null;
    if (claveRaw) {
      const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(claveRaw.toLowerCase().trim()));
      claveHash = Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join('');
    }

    const payload = { nombre, institucion: inst, comuna_id: comunaId||null, activo };
    if (claveHash) payload.clave_hash = claveHash;

    let error;
    if (id) {
      ({ error } = await supabaseClient.from('app_usuarios').update(payload).eq('id', id));
    } else {
      payload.telefono = telefono;
      ({ error } = await supabaseClient.from('app_usuarios').insert(payload));
    }

    btnGuardar.textContent = id ? 'Guardar cambios' : 'Crear patrullero';
    btnGuardar.disabled = false;

    if (error) { errEl.textContent = 'Error: ' + error.message; return; }

    modal.remove();
    mostrarToast_(id ? '✅ Patrullero actualizado' : '✅ Patrullero creado — ya puede ingresar a la app');
    cargarSeccionAdmin_('appPatrulleros');
  });
}

// ══════════════════════════════════════════════════════════════════════════
// ADMIN APP — ACCIONES DE PELIGRO (mantenedor tipos de reporte)
// ══════════════════════════════════════════════════════════════════════════
const APP_ICONOS = ['🚧','🔥','🆘','👁️','🌊','💨','⚡','🐾','🏚️','🪵','🛑','⛽','🚗','🔒','📡','☢️','🌿','🦁','⛰️','🌪️'];
const APP_COLORES = ['#EF4444','#F97316','#F59E0B','#22C55E','#2563EB','#A855F7','#EC4899','#0EA5E9','#64748B','#DC2626'];

async function adminSeccionAppAcciones_(c) {
  const { data } = await supabaseClient.from('app_tipos_accion').select('*').order('por_defecto', { ascending: false });
  const tipos = data || [];

  c.innerHTML = adminHead_('⚠️ Acciones de Peligro',
    'Tipos de reporte disponibles en la app móvil',
    '<button class="admin-btn primary" onclick="abrirModalAccionApp_()">+ Nueva acción</button>'
  ) +
  '<div class="admin-table-wrap"><table class="admin-table"><thead><tr>' +
  '<th>Acción</th><th>Ícono</th><th>Color</th><th>Estado</th><th>Tipo</th><th></th>' +
  '</tr></thead><tbody>' +
  tipos.map(t => '<tr>' +
    '<td><b>' + escapeHtml_(t.nombre) + '</b></td>' +
    '<td style="font-size:20px;text-align:center;">' + t.icono + '</td>' +
    '<td><span style="display:inline-block;width:22px;height:22px;border-radius:6px;background:' + t.color + ';vertical-align:middle;"></span></td>' +
    '<td><span class="rol-badge" style="background:' + (t.activo ? '#DCFCE7' : '#F1F5F9') + ';color:' + (t.activo ? '#166534' : '#64748B') + '">' +
      (t.activo ? 'Activa' : 'Inactiva') + '</span></td>' +
    '<td>' + (t.por_defecto ? '⭐ Por defecto' : 'Personalizada') + '</td>' +
    '<td style="display:flex;gap:6px;">' +
      '<button class="admin-btn sm" onclick="abrirModalAccionApp_(\'' + t.id + '\',\'' + escapeHtml_(t.nombre) + '\',\'' + t.icono + '\',\'' + t.color + '\')">✏️</button>' +
      (t.por_defecto ? '' : '<button class="admin-btn sm danger" onclick="toggleAccionApp_(\''+t.id+'\','+!t.activo+')">' + (t.activo?'🔒':'🔓') + '</button>') +
    '</td>' +
    '</tr>'
  ).join('') +
  '</tbody></table></div>';
}

function abrirModalAccionApp_(id, nombre, icono, color) {
  const esEdicion = !!id;
  const icoSel = icono || '⚠️';
  const colSel = color || '#EF4444';

  const modal = document.createElement('div');
  modal.className = 'modal-overlay show';
  modal.id = 'modal-accion-app';
  modal.innerHTML = '<div class="modal-card" style="max-width:440px;width:94vw;">' +
    '<h3 style="margin-bottom:18px;">' + (esEdicion ? '✏️ Editar Acción' : '➕ Nueva Acción de Peligro') + '</h3>' +
    '<div class="form-group"><label>Nombre</label>' +
      '<input type="text" id="accion-nombre" class="admin-input" value="' + escapeHtml_(nombre || '') + '" placeholder="Ej: Árbol Caído"></div>' +
    '<div class="form-group"><label>Ícono</label>' +
      '<div style="display:grid;grid-template-columns:repeat(10,1fr);gap:6px;" id="accion-ico-grid">' +
        APP_ICONOS.map(i => '<button style="font-size:20px;padding:6px;border-radius:8px;border:2px solid ' + (i===icoSel?'#2563EB':'#E2E8F0') + ';background:' + (i===icoSel?'#EFF4FF':'#fff') + ';cursor:pointer;" onclick="selAccionIco(this,\''+i+'\')">' + i + '</button>').join('') +
      '</div></div>' +
    '<div class="form-group"><label>Color</label>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;" id="accion-col-grid">' +
        APP_COLORES.map(col => '<button style="width:32px;height:32px;border-radius:50%;background:'+col+';border:3px solid '+(col===colSel?'#1E293B':'transparent')+';cursor:pointer;" onclick="selAccionCol(this,\''+col+'\')"></button>').join('') +
      '</div></div>' +
    '<input type="hidden" id="accion-ico-val" value="' + icoSel + '">' +
    '<input type="hidden" id="accion-col-val" value="' + colSel + '">' +
    '<p class="form-error" id="accion-error" style="min-height:16px;color:var(--red);font-size:12px;"></p>' +
    '<div style="display:flex;gap:10px;margin-top:12px;">' +
      '<button class="popup-btn" onclick="this.closest(\'.modal-overlay\').remove()">Cancelar</button>' +
      '<button class="popup-btn primary" onclick="guardarAccionApp_(\'' + (id||'') + '\')">Guardar</button>' +
    '</div></div>';

  document.body.appendChild(modal);
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
}

function selAccionIco(btn, ico) {
  document.querySelectorAll('#accion-ico-grid button').forEach(b => {
    b.style.borderColor = '#E2E8F0'; b.style.background = '#fff';
  });
  btn.style.borderColor = '#2563EB'; btn.style.background = '#EFF4FF';
  document.getElementById('accion-ico-val').value = ico;
}

function selAccionCol(btn, col) {
  document.querySelectorAll('#accion-col-grid button').forEach(b => b.style.borderColor = 'transparent');
  btn.style.borderColor = '#1E293B';
  document.getElementById('accion-col-val').value = col;
}

async function guardarAccionApp_(id) {
  const nombre = document.getElementById('accion-nombre').value.trim();
  const icono  = document.getElementById('accion-ico-val').value;
  const color  = document.getElementById('accion-col-val').value;
  const errEl  = document.getElementById('accion-error');
  if (!nombre) { errEl.textContent = 'El nombre es obligatorio.'; return; }

  const payload = { nombre, icono, color };
  let error;
  if (id) {
    ({ error } = await supabaseClient.from('app_tipos_accion').update(payload).eq('id', id));
  } else {
    payload.activo = true; payload.por_defecto = false;
    ({ error } = await supabaseClient.from('app_tipos_accion').insert(payload));
  }
  if (error) { errEl.textContent = 'Error: ' + error.message; return; }
  document.querySelector('.modal-overlay')?.remove();
  mostrarToast_(id ? '✅ Acción actualizada' : '✅ Acción "' + nombre + '" creada');
  cargarSeccionAdmin_('appAcciones');
}

async function toggleAccionApp_(id, nuevoEstado) {
  await supabaseClient.from('app_tipos_accion').update({ activo: nuevoEstado }).eq('id', id);
  mostrarToast_(nuevoEstado ? '✅ Acción activada' : 'Acción desactivada');
  cargarSeccionAdmin_('appAcciones');
}
async function adminSeccionPatrulleros_(c) {
  const { data, error } = await supabaseClient.from('tb_patrulleros').select('*').order('id_patrullero');
  if (error) { c.innerHTML = adminHead_('Patrulleros', '') + '<div class="layer-empty-msg">' + error.message + '</div>'; return; }
  state.patrulleros = data || [];
  const render = () => {
    const q = normalizarBusqueda_((document.getElementById('adm-p-search') || {}).value || '');
    const L = state.patrulleros;
    const lista = L.filter(p => !q || normalizarBusqueda_([p.nombre_colaborador, p.correo_colaborador, p.cargo, p.area_relacionamiento, p.gerencia].join(' ')).includes(q));
    const enAreas = L.filter(p => p.id_area_trabajo >= 1 && p.id_area_trabajo <= 14).length;
    const conCam = L.filter(p => /^si/i.test(p.tiene_camioneta || '')).length;
    const vigentes = L.filter(p => /^s/i.test(p.vigente || '')).length;
    c.innerHTML = adminHead_('Patrulleros', 'Consolidado de personal de patrullaje y corporativo',
      '<input id="adm-p-search" class="admin-search" placeholder="Buscar por nombre, correo, cargo, área o gerencia…" value="' + escapeHtml_(q) + '"><span class="admin-count">' + lista.length + ' de ' + L.length + '</span>' + densToggle_() +
      '<button class="btn-primary" id="adm-p-nuevo" style="padding:9px 14px;">+ Nuevo</button>' +
      '<button class="popup-btn" id="adm-p-import" style="padding:9px 12px;">⬆ Importar</button><button class="popup-btn" id="adm-p-export" style="padding:9px 12px;">⬇ Exportar</button>') +
      '<div class="adm-kpis">' +
      admKpi_('🚓', '#EFF4FF', 'Total', L.length) +
      admKpi_('🌲', '#DCFCE7', 'En áreas de patrullaje', enAreas) +
      admKpi_('🏢', '#F1F5F9', 'Corporativo / otros', L.length - enAreas) +
      admKpi_('🚐', '#FEF3C7', 'Con camioneta', conCam) +
      admKpi_('✅', '#DBEAFE', 'Vigentes', vigentes) +
      '</div>' +
      '<div class="admin-table-wrap"><table class="admin-table dens-' + state.admDensidad + '"><thead><tr><th>Patrullero</th><th>Cargo</th><th>Área</th><th>Camioneta</th><th>Vigente</th><th></th></tr></thead><tbody id="adm-p-tbody"></tbody></table></div>';
    // Agrupado por gerencia
    const porGer = {}; lista.forEach(p => { const g = p.gerencia || 'Sin gerencia'; (porGer[g] = porGer[g] || []).push(p); });
    let html = '';
    Object.keys(porGer).sort().forEach(g => {
      html += grupoRow_(g, porGer[g].length, 6);
      porGer[g].sort((a,b)=>(a.nombre_colaborador||'').localeCompare(b.nombre_colaborador||'')).forEach(p => {
        const cam = /^si/i.test(p.tiene_camioneta || '');
        html += '<tr><td><div class="cell-persona">' + avatar_(p.nombre_colaborador || p.id_patrullero, true) + '<div><div class="cp-nombre">' + escapeHtml_(p.nombre_colaborador || '') + ' <span style="font-weight:600;color:var(--text-tertiary);font-size:10px;">' + escapeHtml_(p.id_patrullero) + '</span></div><div class="cp-sub">' + escapeHtml_(p.correo_colaborador || '') + '</div></div></div></td>' +
          '<td style="font-size:11.5px;">' + escapeHtml_(p.cargo || '—') + '</td><td style="font-size:11.5px;">' + escapeHtml_(p.area_relacionamiento || '—') + (p.sector ? '<div class="cp-sub">' + escapeHtml_(p.sector) + '</div>' : '') + '</td>' +
          '<td>' + (cam ? '<span class="bdg bdg-si">🚐 Sí</span>' : '<span class="bdg bdg-no">No</span>') + (p.patente_movil ? '<div class="cp-sub">' + escapeHtml_(p.patente_movil) + '</div>' : '') + '</td>' +
          '<td>' + (/^s/i.test(p.vigente || '') ? '<span class="bdg bdg-ok">Sí</span>' : '<span class="bdg bdg-neutral">' + escapeHtml_(p.vigente || '—') + '</span>') + '</td>' +
          '<td class="acciones-cell"><span class="act-btns">' + actBtn_('editar', 'data-e="' + escapeHtml_(p.id_patrullero) + '"') + actBtn_('eliminar', 'data-d="' + escapeHtml_(p.id_patrullero) + '"') + '</span></td></tr>';
      });
    });
    document.getElementById('adm-p-tbody').innerHTML = html || '<tr><td colspan="6" style="padding:14px;color:var(--text-tertiary);">Sin resultados.</td></tr>';
    const inp = document.getElementById('adm-p-search'); inp.addEventListener('input', render); inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length);
    document.getElementById('adm-p-nuevo').addEventListener('click', () => abrirFormPatrullero_(null));
    document.getElementById('adm-p-export').addEventListener('click', exportarPatrulleros_);
    document.getElementById('adm-p-import').addEventListener('click', () => document.getElementById('input-import-patrulleros').click());
    bindDensidad_(c, render);
    c.querySelectorAll('[data-e]').forEach(b => b.onclick = () => abrirFormPatrullero_(b.dataset.e));
    c.querySelectorAll('[data-d]').forEach(b => b.onclick = async () => { await eliminarPatrullero_(b.dataset.d); });
  };
  render();
}

// ---------- COMUNAS ----------
/* ---------- COMUNAS POR ÁREA (13-10-2026, SQL 93 + 94) ----------
 * Dos relaciones comuna ↔ área:
 *   · ADMINISTRATIVA (v_area_comunas_admin, SQL 94): qué comunas revisa cada área / Jefe de Área.
 *     Automática por los RECURSOS ubicados en la comuna, o la que fije el Administrador
 *     (reasignar / agregar / quitar; «↺ Automático» vuelve a la regla). Una comuna puede
 *     quedar en una sola área (reasignar) o en varias (agregar).
 *   · TERRITORIAL (fundos): los FUNDOS siempre conservan su propia área (fundos_cmpc.area),
 *     aunque la comuna donde están la administre otra área. No se edita aquí.
 * La administrativa la usan el filtro 🧭 Área del mapa, «Recurso asociado» de las rutas y
 * «Ver como…» Jefe de Área. La territorial: capa Fundos, red vial e incendios del área. */
state.ac = { area: '', datos: null };
async function leerTodasFilas_(tabla, cols) {
  const filas = [];
  for (let d = 0; ; d += 1000) {
    const { data, error } = await supabaseClient.from(tabla).select(cols).range(d, d + 999);
    if (error) throw error;
    filas.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return filas;
}
async function adminSeccionAreaComunas_(c, recargar) {
  const claveA = a => plNorm_(a || '').replace(/[^A-Z0-9]/g, '');
  if (!state.ac.datos || recargar) {
    try {
      const [fundos, recursos] = await Promise.all([
        leerTodasFilas_('fundos_cmpc', 'area, id_comuna'),
        leerTodasFilas_('recursos_disponibles_area_geojson', 'id, area, id_comuna'),
      ]);
      let admin = [], manual = [], sinSql94 = false;
      try {
        [admin, manual] = await Promise.all([
          leerTodasFilas_('v_area_comunas_admin', 'area_norm, area, id_comuna, origen'),
          leerTodasFilas_('area_comunas_manual', 'area_norm, area, id_comuna'),
        ]);
      } catch (e) { sinSql94 = true; }
      state.ac.datos = { fundos, recursos, admin, manual, sinSql94 };
    } catch (e) {
      c.innerHTML = adminHead_('🧩 Comunas por área', 'Asociación de comunas a cada área de relacionamiento') +
        '<div class="layer-empty-msg">No se pudieron leer los datos: ' + escapeHtml_(e.message || String(e)) + '</div>';
      return;
    }
  }
  const D = state.ac.datos;
  const comunaPorId = {}; (state.comunas || []).forEach(x => { comunaPorId[Number(x.id_comuna)] = x; });
  const nombreC = id => (comunaPorId[id] && comunaPorId[id].comuna) || ('Comuna ' + id);
  const areas = (state.areasCatalogo || []).slice().sort((a, b) => a.localeCompare(b, 'es'));
  if (!state.ac.area || !areas.includes(state.ac.area)) state.ac.area = areas[0] || '';
  const kSel = claveA(state.ac.area);
  const nombreArea = k => { const a = areas.find(x => claveA(x) === k); return aTitulo_(a || k); };

  // Conteos por (área, comuna): fundos y recursos de ESTA área en cada comuna
  const cuenta = (filas, campoArea) => { const m = {}; filas.forEach(x => {
    if (x.id_comuna == null || claveA(x[campoArea]) !== kSel) return; const k = Number(x.id_comuna); m[k] = (m[k] || 0) + 1; }); return m; };
  const fundosAqui = cuenta(D.fundos, 'area'), recursosAqui = cuenta(D.recursos, 'area');
  const sinUbicar = D.recursos.filter(x => x.id_comuna == null && claveA(x.area) === kSel).length;
  // Asignación administrativa
  const adminPorComuna = {};   // id_comuna → [{ area_norm, origen }]
  D.admin.forEach(a => { (adminPorComuna[Number(a.id_comuna)] = adminPorComuna[Number(a.id_comuna)] || []).push(a); });
  const manualComunas = new Set(D.manual.map(m => Number(m.id_comuna)));
  const administradas = Object.entries(adminPorComuna).filter(([, l]) => l.some(a => a.area_norm === kSel)).map(([id]) => Number(id))
    .sort((a, b) => nombreC(a).localeCompare(nombreC(b), 'es'));
  const adm = new Set(administradas);
  // Comunas donde el área tiene fundos o recursos pero que NO administra
  const vinculadas = [...new Set([...Object.keys(fundosAqui), ...Object.keys(recursosAqui)].map(Number))].filter(id => !adm.has(id))
    .sort((a, b) => nombreC(a).localeCompare(nombreC(b), 'es'));
  const otrasDe = id => (adminPorComuna[id] || []).filter(a => a.area_norm !== kSel).map(a => nombreArea(a.area_norm));
  const optAreas = (excluir) => '<option value="">↪ Reasignar a…</option>' + areas.filter(a => claveA(a) !== excluir)
    .map(a => '<option value="' + escapeHtml_(a) + '">' + escapeHtml_(aTitulo_(a)) + '</option>').join('');
  const chip = (txt, col, bg) => '<span style="display:inline-block;padding:1px 7px;border-radius:99px;font-size:10.5px;font-weight:700;margin-right:4px;color:' + col + ';background:' + bg + ';">' + txt + '</span>';
  const n = v => v ? v : '<span style="color:var(--text-tertiary);">—</span>';

  const filasAdm = administradas.map(id => {
    const manual = manualComunas.has(id);
    return '<tr><td><b>' + escapeHtml_(nombreC(id)) + '</b> <small style="color:var(--text-tertiary);">' + id + '</small></td>' +
      '<td>' + (manual ? chip('✋ Asignada', '#7C3AED', '#EDE9FE') : chip('⚙️ Automática (recursos)', '#1D4ED8', '#DBEAFE')) + '</td>' +
      '<td style="text-align:right;">' + n(recursosAqui[id]) + '</td><td style="text-align:right;">' + n(fundosAqui[id]) + '</td>' +
      '<td style="font-size:11.5px;color:var(--text-secondary);">' + escapeHtml_(otrasDe(id).join(', ') || '—') + '</td>' +
      '<td style="text-align:right;white-space:nowrap;">' + (D.sinSql94 ? '' :
        '<select class="admin-search" data-ac-reasignar="' + id + '" style="max-width:150px;padding:4px 6px;font-size:11.5px;">' + optAreas(kSel) + '</select> ' +
        '<button class="popup-btn" data-ac-quitar="' + id + '" title="Esta área deja de administrar la comuna">✕ Quitar</button>' +
        (manual ? ' <button class="popup-btn" data-ac-auto="' + id + '" title="Volver a la asignación automática (por recursos)">↺ Automática</button>' : '')) + '</td></tr>';
  }).join('');
  const filasVinc = vinculadas.map(id => '<tr><td><b>' + escapeHtml_(nombreC(id)) + '</b> <small style="color:var(--text-tertiary);">' + id + '</small></td>' +
    '<td style="text-align:right;">' + n(recursosAqui[id]) + '</td><td style="text-align:right;">' + n(fundosAqui[id]) + '</td>' +
    '<td style="font-size:11.5px;">' + escapeHtml_(otrasDe(id).join(', ') || (manualComunas.has(id) ? 'Sin área (quitada)' : 'Ninguna')) + '</td>' +
    '<td style="text-align:right;white-space:nowrap;">' + (D.sinSql94 ? '' :
      '<button class="popup-btn" data-ac-agregar="' + id + '" title="Agregar: la comuna queda también en esta área">➕ Agregar</button> ' +
      '<button class="popup-btn" data-ac-solo="' + id + '" title="Reasignar: la comuna queda SOLO en esta área">↪ Solo esta área</button>') + '</td></tr>').join('');
  const opcionesTodas = (state.comunas || []).filter(x => !adm.has(Number(x.id_comuna)))
    .sort((a, b) => String(a.comuna).localeCompare(String(b.comuna), 'es'))
    .map(x => '<option value="' + Number(x.id_comuna) + '">' + escapeHtml_(x.comuna) + (x.region ? ' · ' + escapeHtml_(x.region) : '') + '</option>').join('');
  const fundosFuera = vinculadas.reduce((s, id) => s + (fundosAqui[id] || 0), 0);
  const tabla = (cab, cuerpo, vacio) => '<div class="admin-table-wrap"><table class="admin-table"><thead><tr>' + cab + '</tr></thead><tbody>' +
    (cuerpo || '<tr><td colspan="6" style="padding:14px;color:var(--text-tertiary);">' + vacio + '</td></tr>') + '</tbody></table></div>';

  c.innerHTML = adminHead_('🧩 Comunas por área',
      'Comunas que <b>administra</b> cada área (las ve su Jefe de Área y el filtro 🧭 Área del mapa). Los <b>fundos</b> conservan siempre su propia área.',
      '<select id="ac-area" class="admin-search" style="min-width:220px;">' + areas.map(a => '<option value="' + escapeHtml_(a) + '"' + (a === state.ac.area ? ' selected' : '') + '>' + escapeHtml_(aTitulo_(a)) + '</option>').join('') + '</select>' +
      (D.sinSql94 ? '' : '<button class="btn-primary" id="ac-multi" style="flex:none;padding:9px 14px;" title="Marcar y desmarcar varias comunas del área de una vez">📝 Agregar / quitar comunas</button>')) +
    (D.sinSql94 ? '<div class="pl-aviso warn" style="margin-bottom:12px;">⚠️ Falta ejecutar el SQL 94 (<b>sql/pendientes/94_comunas_area_administrativa.sql</b>): por ahora no se puede reasignar.</div>' : '') +
    '<div class="dash-kpis" style="margin-bottom:14px;">' +
      kpi_('Comunas que administra', administradas.length, administradas.filter(id => manualComunas.has(id)).length + ' asignada(s) a mano') +
      kpi_('Fundos en comunas de otras áreas', fundosFuera, 'siguen siendo de esta área') +
      kpi_('Recursos sin ubicar', sinUbicar, sinUbicar ? 'ubicarlos en el Planificador gráfico' : 'todos ubicados') +
    '</div>' +
    '<div class="dash-card"><div class="dash-card-title">🗂️ Comunas que administra ' + escapeHtml_(aTitulo_(state.ac.area)) + '</div>' +
      tabla('<th>Comuna</th><th>Asignación</th><th style="text-align:right;">Recursos del área</th><th style="text-align:right;">Fundos del área</th><th>También la administra</th><th></th>',
        filasAdm, 'Esta área no administra comunas. Agrégalas abajo.') +
      (D.sinSql94 ? '' : '<div style="display:flex;gap:8px;align-items:center;margin-top:12px;flex-wrap:wrap;">' +
        '<select id="ac-comuna" class="admin-search" style="min-width:260px;"><option value="">— Elegir otra comuna —</option>' + opcionesTodas + '</select>' +
        '<button class="btn-primary" id="ac-agregar" style="flex:none;padding:8px 14px;" title="La comuna queda también en esta área">➕ Agregar a esta área</button>' +
        '<button class="btn-secondary" id="ac-solo" style="flex:none;padding:8px 14px;" title="La comuna queda SOLO en esta área (se quita de las demás)">↪ Reasignar solo a esta área</button></div>') +
    '</div>' +
    '<div class="dash-card" style="margin-top:14px;"><div class="dash-card-title">🌲 Comunas con fundos o recursos de ' + escapeHtml_(aTitulo_(state.ac.area)) + ' que administra otra área</div>' +
      '<p style="font-size:11.5px;color:var(--text-tertiary);margin:0 0 8px;">Los fundos y recursos listados siguen siendo de esta área (capa Fundos, Gestión de Recursos, red vial e incendios del área). Solo cambia quién administra la comuna.</p>' +
      tabla('<th>Comuna</th><th style="text-align:right;">Recursos del área</th><th style="text-align:right;">Fundos del área</th><th>La administra</th><th></th>',
        filasVinc, 'No hay fundos ni recursos de esta área en comunas de otras áreas.') +
    '</div>';

  document.getElementById('ac-area').addEventListener('change', e => { state.ac.area = e.target.value; adminSeccionAreaComunas_(c); });
  const bMulti = document.getElementById('ac-multi');
  if (bMulti) bMulti.addEventListener('click', () => editarComunasAreaMultiple_(c, state.ac.area, administradas, otrasDe));
  const rpc = async (fn, args, msg) => {
    const { error } = await supabaseClient.rpc(fn, args);
    if (error) { mostrarToast_('No se pudo guardar: ' + error.message); return; }
    mostrarToast_(msg);
    adminSeccionAreaComunas_(c, true);
  };
  const agregar = id => rpc('asignar_comuna_area', { p_area: state.ac.area, p_id_comuna: id, p_asignar: true }, '✅ ' + nombreC(id) + ' agregada a ' + aTitulo_(state.ac.area) + '.');
  const solo = id => { if (confirm('¿Reasignar ' + nombreC(id) + ' SOLO al área ' + aTitulo_(state.ac.area) + '? Se quita de las demás áreas (sus fundos no cambian).'))
    rpc('reasignar_comuna_area', { p_id_comuna: id, p_area: state.ac.area }, '↪ ' + nombreC(id) + ' reasignada a ' + aTitulo_(state.ac.area) + '.'); };
  const bAg = document.getElementById('ac-agregar'), bSo = document.getElementById('ac-solo'), sCo = document.getElementById('ac-comuna');
  if (bAg) bAg.addEventListener('click', () => { if (!sCo.value) { mostrarToast_('Elige una comuna.'); return; } agregar(Number(sCo.value)); });
  if (bSo) bSo.addEventListener('click', () => { if (!sCo.value) { mostrarToast_('Elige una comuna.'); return; } solo(Number(sCo.value)); });
  c.querySelectorAll('[data-ac-agregar]').forEach(b => b.addEventListener('click', () => agregar(Number(b.dataset.acAgregar))));
  c.querySelectorAll('[data-ac-solo]').forEach(b => b.addEventListener('click', () => solo(Number(b.dataset.acSolo))));
  c.querySelectorAll('[data-ac-quitar]').forEach(b => b.addEventListener('click', () => {
    const id = Number(b.dataset.acQuitar);
    if (confirm('¿Quitar ' + nombreC(id) + ' del área ' + aTitulo_(state.ac.area) + '? Sus fundos y recursos siguen siendo del área.'))
      rpc('asignar_comuna_area', { p_area: state.ac.area, p_id_comuna: id, p_asignar: false }, nombreC(id) + ' ya no la administra ' + aTitulo_(state.ac.area) + '.');
  }));
  c.querySelectorAll('[data-ac-auto]').forEach(b => b.addEventListener('click', () => {
    const id = Number(b.dataset.acAuto);
    if (confirm('¿Volver ' + nombreC(id) + ' a la asignación automática (por sus recursos)?'))
      rpc('restablecer_comuna_area', { p_id_comuna: id }, '↺ ' + nombreC(id) + ' vuelve a la asignación automática.');
  }));
  c.querySelectorAll('[data-ac-reasignar]').forEach(s => s.addEventListener('change', () => {
    const id = Number(s.dataset.acReasignar), destino = s.value;
    if (!destino) return;
    if (!confirm('¿Reasignar ' + nombreC(id) + ' al área ' + aTitulo_(destino) + '? Deja de administrarla ' + aTitulo_(state.ac.area) + ' (sus fundos no cambian).')) { s.value = ''; return; }
    rpc('reasignar_comuna_area', { p_id_comuna: id, p_area: destino }, '↪ ' + nombreC(id) + ' reasignada a ' + aTitulo_(destino) + '.');
  }));
}

/** 📝 Formulario: marcar / desmarcar varias comunas de un área de una vez (por región, con buscador).
 *  Guarda solo las diferencias con asignar_comuna_area. Las cuentas de los Jefes y Subgerentes de esa
 *  área reciben solas las comunas nuevas (SQL 113). */
function editarComunasAreaMultiple_(c, area, administradas, otrasDe) {
  const actuales = new Set(administradas.map(Number));
  const porReg = {};
  (state.comunas || []).forEach(x => { (porReg[x.region || 'Sin región'] = porReg[x.region || 'Sin región'] || []).push(x); });
  const o = document.createElement('div');
  o.className = 'br-modal-overlay';
  o.innerHTML = '<div class="br-modal" style="width:min(760px,96vw);display:flex;flex-direction:column;">' +
    '<div class="br-ficha-cab" style="--c:#7C3AED"><div><div class="id">Comunas por área</div><h3>🧩 ' + escapeHtml_(aTitulo_(area)) + '</h3>' +
      '<div class="sub">Marca las comunas que administra esta área y desmarca las que deja. Las cuentas de sus Jefes de Área y Subgerentes las reciben automáticamente.</div></div>' +
      '<button class="br-x" data-ac-cerrar>✕</button></div>' +
    '<div style="padding:12px 20px;display:flex;gap:8px;align-items:center;flex-wrap:wrap;border-bottom:1px solid var(--border);">' +
      '<input id="acm-q" class="admin-search" style="min-width:0;flex:1;" placeholder="Buscar comuna…">' +
      '<label style="font-size:12px;display:flex;gap:5px;align-items:center;"><input type="checkbox" id="acm-solo"> Solo marcadas</label>' +
      '<span id="acm-cuenta" style="font-size:12px;font-weight:700;color:var(--text-secondary);"></span></div>' +
    '<div id="acm-lista" style="padding:8px 20px;overflow:auto;max-height:55vh;">' +
      Object.keys(porReg).sort((a, b) => a.localeCompare(b, 'es')).map(reg => '<div class="acm-reg"><div style="font-size:11px;font-weight:800;color:var(--text-tertiary);text-transform:uppercase;margin:10px 0 4px;">' + escapeHtml_(reg) + '</div>' +
        '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:3px 10px;">' +
        porReg[reg].sort((a, b) => String(a.comuna).localeCompare(String(b.comuna), 'es')).map(x => {
          const id = Number(x.id_comuna), otras = otrasDe(id);
          return '<label class="acm-item" data-n="' + escapeHtml_(normalizarBusqueda_(x.comuna)) + '" style="display:flex;gap:6px;align-items:center;font-size:12.5px;padding:3px 4px;border-radius:6px;">' +
            '<input type="checkbox" value="' + id + '"' + (actuales.has(id) ? ' checked' : '') + '> ' + escapeHtml_(x.comuna) +
            (otras.length ? ' <small style="color:var(--text-tertiary);" title="También la administra">· ' + escapeHtml_(otras.join(', ')) + '</small>' : '') + '</label>';
        }).join('') + '</div></div>').join('') + '</div>' +
    '<div style="padding:12px 20px;border-top:1px solid var(--border);display:flex;gap:8px;justify-content:flex-end;align-items:center;">' +
      '<span id="acm-cambios" style="font-size:12px;color:var(--text-secondary);margin-right:auto;"></span>' +
      '<button class="btn-secondary" data-ac-cerrar style="flex:none;padding:9px 16px;">Cancelar</button>' +
      '<button class="btn-primary" id="acm-guardar" style="flex:none;padding:9px 16px;">💾 Guardar cambios</button></div></div>';
  document.body.appendChild(o);
  const cajas = () => [...o.querySelectorAll('#acm-lista input[type="checkbox"]')];
  const diff = () => { const marc = new Set(cajas().filter(i => i.checked).map(i => Number(i.value)));
    return { agregar: [...marc].filter(id => !actuales.has(id)), quitar: [...actuales].filter(id => !marc.has(id)), total: marc.size }; };
  const refrescar = () => {
    const q = normalizarBusqueda_(o.querySelector('#acm-q').value), solo = o.querySelector('#acm-solo').checked;
    o.querySelectorAll('.acm-item').forEach(l => { const ok = (!q || l.dataset.n.includes(q)) && (!solo || l.querySelector('input').checked);
      l.style.display = ok ? 'flex' : 'none'; l.style.background = l.querySelector('input').checked ? 'color-mix(in srgb,#7C3AED 9%,transparent)' : ''; });
    o.querySelectorAll('.acm-reg').forEach(g => { g.style.display = [...g.querySelectorAll('.acm-item')].some(l => l.style.display !== 'none') ? '' : 'none'; });
    const d = diff();
    o.querySelector('#acm-cuenta').textContent = d.total + ' comuna(s) marcadas';
    o.querySelector('#acm-cambios').textContent = d.agregar.length || d.quitar.length ? '➕ ' + d.agregar.length + ' por agregar · ✕ ' + d.quitar.length + ' por quitar' : 'Sin cambios';
  };
  o.addEventListener('input', refrescar); o.addEventListener('change', refrescar);
  o.addEventListener('click', e => { if (e.target === o || e.target.closest('[data-ac-cerrar]')) o.remove(); });
  o.querySelector('#acm-guardar').addEventListener('click', async () => {
    const d = diff();
    if (!d.agregar.length && !d.quitar.length) { o.remove(); return; }
    if (d.quitar.length && !confirm('Se quitarán ' + d.quitar.length + ' comuna(s) del área ' + aTitulo_(area) + ' (sus fundos y recursos no cambian). ¿Continuar?')) return;
    const b = o.querySelector('#acm-guardar'); b.disabled = true;
    let errores = 0;
    for (const id of d.agregar) { b.textContent = 'Guardando…'; const { error } = await supabaseClient.rpc('asignar_comuna_area', { p_area: area, p_id_comuna: id, p_asignar: true }); if (error) errores++; }
    for (const id of d.quitar) { const { error } = await supabaseClient.rpc('asignar_comuna_area', { p_area: area, p_id_comuna: id, p_asignar: false }); if (error) errores++; }
    o.remove();
    state.comunasPorAreaUsr = null;   // el formulario de usuario vuelve a leer las comunas por área
    mostrarToast_(errores ? '⚠️ ' + errores + ' cambio(s) no se guardaron.' : '✅ ' + aTitulo_(area) + ': ' + d.agregar.length + ' agregada(s), ' + d.quitar.length + ' quitada(s).');
    adminSeccionAreaComunas_(c, true);
  });
  refrescar();
  o.querySelector('#acm-q').focus();
}

async function adminSeccionComunas_(c) {
  const [{ data: logos }, { data: periodos }, { data: planes }] = await Promise.all([
    supabaseClient.from('comuna_logo_municipal').select('comuna_id, logo_url'),
    supabaseClient.from('config_periodos').select('comuna_id').eq('estado_periodo', 'activo'),
    supabaseClient.from('planes_contingencia').select('comuna_id, escenario').eq('activo', true),
  ]);
  const logoPor = {}; (logos || []).forEach(l => { logoPor[l.comuna_id] = l.logo_url; });
  const periodoPor = new Set((periodos || []).map(p => p.comuna_id));
  const alertaPor = {}; (planes || []).forEach(p => { (alertaPor[p.comuna_id] = alertaPor[p.comuna_id] || []).push(p.escenario); });
  const render = () => {
    const q = normalizarBusqueda_((document.getElementById('adm-c-search') || {}).value || '');
    const lista = state.comunas.filter(cm => !q || normalizarBusqueda_(cm.comuna + ' ' + cm.region + ' ' + cm.provincia).includes(q));
    c.innerHTML = adminHead_('Comunas', state.comunas.length + ' comunas en el sistema · estado operativo y logo municipal',
      '<input id="adm-c-search" class="admin-search" placeholder="Buscar comuna, provincia o región…" value="' + escapeHtml_(q) + '"><span class="admin-count">' + lista.length + ' de ' + state.comunas.length + '</span>' + densToggle_()) +
      '<div class="adm-kpis">' +
      admKpi_('🗺️', '#EFF4FF', 'Comunas', state.comunas.length) +
      admKpi_('🏛️', '#FEF3C7', 'Con logo propio', Object.keys(logoPor).length) +
      admKpi_('🔥', '#DCFCE7', 'Con periodo activo', periodoPor.size) +
      admKpi_('⚠️', '#FEE2E2', 'Con alerta activa', Object.keys(alertaPor).length) +
      admKpi_('⭐', '#EDE9FE', 'Favoritas (mías)', (state.comunasFavoritas || new Set()).size) +
      '</div>' +
      '<div class="admin-table-wrap"><table class="admin-table dens-' + state.admDensidad + '"><thead><tr><th>Comuna</th><th>Provincia</th><th>ID</th><th>Estado operativo</th><th>Logo</th><th></th></tr></thead><tbody id="adm-c-tbody"></tbody></table></div>';
    // Agrupado por región
    const porReg = {}; lista.forEach(cm => { (porReg[cm.region || 'Sin región'] = porReg[cm.region || 'Sin región'] || []).push(cm); });
    let html = '';
    Object.keys(porReg).sort().forEach(reg => {
      html += grupoRow_(reg, porReg[reg].length, 6);
      porReg[reg].sort((a,b)=>a.comuna.localeCompare(b.comuna)).forEach(cm => {
        const fav = (state.comunasFavoritas || new Set()).has(cm.id);
        const al = alertaPor[cm.id] || [];
        html += '<tr><td><div class="cp-nombre">' + (fav ? '⭐ ' : '') + escapeHtml_(cm.comuna) + '</div></td><td style="font-size:11.5px;">' + escapeHtml_(cm.provincia || '—') + '</td><td style="font-family:monospace;font-size:11px;color:var(--text-tertiary);">' + (cm.id_comuna || '—') + '</td>' +
          '<td>' + (periodoPor.has(cm.id) ? '<span class="bdg bdg-ok">Periodo activo</span> ' : '') + al.map(e => '<span class="bdg" style="background:' + (e === 'Amarilla' ? '#FEF3C7;color:#92400E' : '#FEE2E2;color:#991B1B') + '">' + (e === 'Amarilla' ? '🟡' : '🔴') + ' ' + e + '</span> ').join('') + (!periodoPor.has(cm.id) && !al.length ? '<span class="bdg bdg-neutral">Sin actividad</span>' : '') + '</td>' +
          '<td>' + (logoPor[cm.id] ? '<img class="logo-cell sq" src="' + escapeHtml_(logoPor[cm.id]) + '">' : '<span class="cp-sub">genérico</span>') + '</td>' +
          '<td class="acciones-cell"><span class="act-btns">' + actBtn_('mapa', 'data-m="' + cm.id + '"') + '</span></td></tr>';
      });
    });
    document.getElementById('adm-c-tbody').innerHTML = html || '<tr><td colspan="6" style="padding:14px;color:var(--text-tertiary);">Sin resultados.</td></tr>';
    const inp = document.getElementById('adm-c-search'); inp.addEventListener('input', render); inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length);
    bindDensidad_(c, render);
    c.querySelectorAll('[data-m]').forEach(b => b.onclick = () => { setActiveComuna(b.dataset.m, true); const sel = document.getElementById('comuna-select'); if (sel && sel.style.display !== 'none') sel.value = b.dataset.m; mostrarVista_('mapa'); });
  };
  render();
}

// ---------- ACTIVIDAD / EN LÍNEA ----------
async function adminSeccionActividad_(c) {
  const { data, error } = await supabaseClient.from('v_usuarios_actividad').select('*');
  if (error) { c.innerHTML = adminHead_('Actividad / En línea', '') + '<div class="layer-empty-msg">' + error.message + '</div>'; return; }
  const usuarios = data || [];
  const enLinea = usuarios.filter(u => u.en_linea);
  const hoy = usuarios.filter(u => u.ultimo_login && new Date(u.ultimo_login).toDateString() === new Date().toDateString());
  const fmt = (f) => { if (!f) return 'Nunca'; const d = new Date(f); const min = Math.round((Date.now() - d) / 60000); if (min < 1) return 'Ahora'; if (min < 60) return 'hace ' + min + ' min'; if (min < 1440) return 'hace ' + Math.round(min/60) + ' h'; return d.toLocaleDateString('es-CL') + ' ' + d.toLocaleTimeString('es-CL',{hour:'2-digit',minute:'2-digit'}); };

  // Historial de accesos reciente
  const { data: accesos } = await supabaseClient.from('usuario_accesos').select('perfil_id, fecha, tipo').order('fecha',{ascending:false}).limit(50);
  const nombrePorId = {}; usuarios.forEach(u => { nombrePorId[u.id] = u.nombre_completo; });

  const render = () => {
    c.innerHTML = adminHead_('Actividad / En línea', 'Uso del sistema en tiempo real e historial de accesos',
      '<button class="popup-btn" id="adm-act-refresh" style="padding:9px 12px;">🔄 Actualizar</button>') +
      '<div class="adm-kpis">' +
      admKpi_('🟢', '#DCFCE7', 'En línea ahora', enLinea.length, {}) +
      admKpi_('📅', '#DBEAFE', 'Entraron hoy', new Set(hoy.map(u=>u.id)).size) +
      admKpi_('👥', '#EFF4FF', 'Usuarios totales', usuarios.length) +
      admKpi_('🔑', '#FEF3C7', 'Accesos totales', usuarios.reduce((a,u)=>a+(u.total_accesos||0),0)) +
      '</div>' +
      '<div class="dash-grid"><div class="dash-card"><div class="dash-card-title">Estado de usuarios</div>' +
      '<div class="admin-table-wrap" style="max-height:340px;"><table class="admin-table"><thead><tr><th>Usuario</th><th>Estado</th><th>Última actividad</th><th>Accesos</th></tr></thead><tbody>' +
      usuarios.sort((a,b)=> (b.en_linea-a.en_linea) || (new Date(b.ultima_vez||0)-new Date(a.ultima_vez||0))).map(u =>
        '<tr><td><div class="cell-persona">' + avatar_(u.nombre_completo, true) + '<div><div class="cp-nombre">' + escapeHtml_(u.nombre_completo) + '</div><div class="cp-sub">' + escapeHtml_(u.perfil) + '</div></div></div></td>' +
        '<td>' + (u.en_linea ? '<span class="bdg bdg-ok">🟢 En línea</span>' : '<span class="bdg bdg-neutral">' + fmt(u.ultima_vez) + '</span>') + '</td>' +
        '<td style="font-size:11px;">' + fmt(u.ultima_vez) + (u.ultima_vista ? ' · ' + escapeHtml_(u.ultima_vista) : '') + '</td>' +
        '<td><b>' + (u.total_accesos||0) + '</b><div class="cp-sub">últ: ' + (u.ultimo_login ? new Date(u.ultimo_login).toLocaleDateString('es-CL') : '—') + '</div></td></tr>').join('') +
      '</tbody></table></div></div>' +
      '<div class="dash-card"><div class="dash-card-title">Historial de accesos reciente</div>' +
      '<div class="admin-table-wrap" style="max-height:340px;"><table class="admin-table"><thead><tr><th>Fecha</th><th>Usuario</th><th>Tipo</th></tr></thead><tbody>' +
      ((accesos||[]).map(a => '<tr><td style="white-space:nowrap;font-size:11px;">' + new Date(a.fecha).toLocaleString('es-CL') + '</td><td>' + escapeHtml_(nombrePorId[a.perfil_id] || '—') + '</td><td><span class="bdg bdg-grd">' + escapeHtml_(a.tipo) + '</span></td></tr>').join('') || '<tr><td colspan="3" style="padding:14px;color:var(--text-tertiary);">Sin accesos registrados aún.</td></tr>') +
      '</tbody></table></div></div></div>';
    const btn = document.getElementById('adm-act-refresh'); if (btn) btn.addEventListener('click', () => adminSeccionActividad_(c));
  };
  render();
}

// ---------- ⏱️ SESIONES DE USUARIOS (17-10-2026, SQL 116; solo Administrador) ----------
// Número de sesiones por usuario, fechas y tiempo conectado (inicio → último latido / salida).
state.ses = { dias: 30, perfil: '', q: '', abierto: '', filas: null, chart: null };
function fmtMinutosSes_(m) {
  m = Math.round(Number(m || 0));
  if (m < 60) return m + ' min';
  const h = Math.floor(m / 60), r = m % 60;
  return h + ' h' + (r ? ' ' + r + ' min' : '');
}
/** Perfil para mostrar en Sesiones: Subgerente con su subgerencia y GRD con su comuna (19-10-2026). */
function perfilSesion_(s) {
  if (s.subgerencia) return 'Subgerente · ' + aTitulo_(s.subgerencia);
  if (s.perfil === 'GRD') {
    const slugs = ((state.ses && state.ses.comunaGrd) || {})[s.perfil_id] || [];
    const nombres = slugs.map(id => { const c = (state.comunas || []).find(x => x.id === id); return c ? c.comuna : String(id).replace(/-/g, ' ').replace(/(^|\s)\S/g, m => m.toUpperCase()); });
    return nombres.length ? 'GRD (' + nombres.join(', ') + ')' : 'GRD';
  }
  return s.perfil;
}
async function adminSeccionSesiones_(c, recargar) {
  const S = state.ses;
  if (!S.filas || recargar) {
    c.innerHTML = adminHead_('⏱️ Sesiones de usuarios', 'Cargando…');
    const desde = new Date(Date.now() - S.dias * 864e5).toISOString();
    const filas = [];
    for (let d = 0; ; d += 1000) {
      const { data, error } = await supabaseClient.from('v_sesiones_usuarios').select('*').gte('inicio', desde).order('inicio', { ascending: false }).range(d, d + 999);
      if (error) {
        c.innerHTML = adminHead_('⏱️ Sesiones de usuarios', 'Número de sesiones, fechas y tiempo de conexión') +
          '<div class="layer-empty-msg">No se pudieron leer las sesiones: ' + escapeHtml_(error.message) + '<br>¿Ya se ejecutó <b>116_sesiones_usuarios.sql</b> en Supabase?</div>';
        return;
      }
      filas.push(...(data || [])); if (!data || data.length < 1000) break;
    }
    S.filas = filas;
    // 19-10-2026: comuna de cada GRD («GRD (Victoria)»): perfiles.comuna_id + perfil_comunas
    S.comunaGrd = {};
    const idsGrd = [...new Set(filas.filter(s => s.perfil === 'GRD').map(s => s.perfil_id))];
    if (idsGrd.length) {
      try {
        const [pf, pc] = await Promise.all([
          supabaseClient.from('perfiles').select('id, comuna_id').in('id', idsGrd),
          supabaseClient.from('perfil_comunas').select('perfil_id, comuna_id').in('perfil_id', idsGrd),
        ]);
        const add = (id, slug) => { if (!slug) return; const l = S.comunaGrd[id] = S.comunaGrd[id] || []; if (!l.includes(slug)) l.push(slug); };
        (pf.data || []).forEach(p => add(p.id, p.comuna_id));
        (pc.data || []).forEach(p => add(p.perfil_id, p.comuna_id));
      } catch (e) { /* sin comuna: se muestra solo «GRD» */ }
    }
  }
  const q = normalizarBusqueda_(S.q || '');
  const ses = S.filas.filter(s => (!S.perfil || (s.subgerencia ? 'Subgerente de Relacionamiento' : s.perfil) === S.perfil) && (!q || normalizarBusqueda_(s.nombre_completo || '').includes(q)));
  // Por usuario
  const porU = {};
  ses.forEach(s => {
    const u = porU[s.perfil_id] = porU[s.perfil_id] || { id: s.perfil_id, nombre: s.nombre_completo, perfil: perfilSesion_(s), estado: s.estado, n: 0, min: 0, dias: new Set(), ultima: null, primera: null, enCurso: false, lista: [] };
    u.n++; u.min += Number(s.minutos || 0); u.dias.add(String(s.inicio).slice(0, 10)); u.lista.push(s);
    if (!u.ultima || s.inicio > u.ultima) u.ultima = s.inicio;
    if (!u.primera || s.inicio < u.primera) u.primera = s.inicio;
    if (s.en_curso) u.enCurso = true;
  });
  const usuarios = Object.values(porU).sort((a, b) => b.min - a.min);
  const totMin = ses.reduce((t, s) => t + Number(s.minutos || 0), 0);
  const fh = iso => iso ? new Date(iso).toLocaleString('es-CL', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';
  const perfiles = ['Administrador', 'Subgerente de Relacionamiento', 'Jefe de Área Relacionamiento', 'GRD', 'Visor'];
  const detalle = u => '<tr class="ses-det"><td colspan="8" style="background:var(--bg-light);padding:8px 14px;">' +
    '<table class="admin-table" style="background:var(--white);"><thead><tr><th>Inicio</th><th>Fin</th><th>Duración</th><th>Vistas</th><th>Equipo</th></tr></thead><tbody>' +
    u.lista.map(s => '<tr><td>' + fh(s.inicio) + '</td><td>' + (s.en_curso ? '<span class="bdg bdg-ok">🟢 En curso</span>' : fh(s.fin)) + '</td><td><b>' + fmtMinutosSes_(s.minutos) + '</b></td>' +
      '<td style="font-size:11px;">' + escapeHtml_((s.vistas || []).join(', ') || '—') + '</td>' +
      '<td style="font-size:11px;color:var(--text-tertiary);" title="' + escapeHtml_(s.agente || '') + '">' + escapeHtml_(dispositivoSes_(s.agente)) + (s.pantalla ? ' · ' + escapeHtml_(s.pantalla) : '') + '</td></tr>').join('') +
    '</tbody></table></td></tr>';
  c.innerHTML = adminHead_('⏱️ Sesiones de usuarios', 'Número de sesiones, fechas y tiempo de conexión de cada usuario (solo Administrador)',
      '<select id="ses-dias" class="admin-search" style="min-width:0;">' + [[1, 'Hoy (24 h)'], [7, 'Últimos 7 días'], [30, 'Últimos 30 días'], [90, 'Últimos 90 días'], [365, 'Último año']]
        .map(([v, t]) => '<option value="' + v + '"' + (S.dias === v ? ' selected' : '') + '>' + t + '</option>').join('') + '</select>' +
      '<select id="ses-perfil" class="admin-search" style="min-width:0;"><option value="">Todos los perfiles</option>' + perfiles.map(p => '<option' + (S.perfil === p ? ' selected' : '') + '>' + p + '</option>').join('') + '</select>' +
      '<input id="ses-q" class="admin-search" style="min-width:180px;" placeholder="Buscar usuario…" value="' + escapeHtml_(S.q || '') + '">' +
      '<button class="popup-btn" id="ses-recargar" style="padding:9px 12px;">🔄</button><button class="popup-btn" id="ses-excel" style="padding:9px 12px;">⬇️ Excel</button>') +
    '<div class="adm-kpis">' +
      admKpi_('🔐', '#EFF4FF', 'Sesiones', ses.length) +
      admKpi_('👥', '#DBEAFE', 'Usuarios que entraron', usuarios.length) +
      admKpi_('⏱️', '#DCFCE7', 'Tiempo total conectado', fmtMinutosSes_(totMin)) +
      admKpi_('📊', '#FEF3C7', 'Promedio por sesión', ses.length ? fmtMinutosSes_(totMin / ses.length) : '—') +
      admKpi_('🟢', '#DCFCE7', 'Sesiones en curso', ses.filter(s => s.en_curso).length) +
    '</div>' +
    '<div class="dash-card" style="margin-bottom:14px;"><div class="dash-card-title">Sesiones y horas conectadas por día</div><div style="height:220px;position:relative;"><canvas id="ses-chart"></canvas></div></div>' +
    '<div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Usuario</th><th>Perfil</th><th style="text-align:right;">Sesiones</th><th style="text-align:right;">Días con uso</th>' +
      '<th style="text-align:right;">Tiempo total</th><th style="text-align:right;">Promedio</th><th>Última sesión</th><th>Primera del periodo</th></tr></thead><tbody>' +
      (usuarios.map(u => '<tr data-ses-u="' + u.id + '" style="cursor:pointer;"><td><div class="cell-persona">' + avatar_(u.nombre, u.enCurso) + '<div><div class="cp-nombre">' + escapeHtml_(u.nombre || '—') + '</div>' +
          '<div class="cp-sub">' + (u.enCurso ? '🟢 conectado ahora' : '') + (u.estado === 'inactivo' ? ' · cuenta inactiva' : '') + '</div></div></div></td>' +
        '<td style="font-size:11.5px;">' + escapeHtml_(u.perfil || '') + '</td><td style="text-align:right;"><b>' + u.n + '</b></td><td style="text-align:right;">' + u.dias.size + '</td>' +
        '<td style="text-align:right;"><b>' + fmtMinutosSes_(u.min) + '</b></td><td style="text-align:right;">' + fmtMinutosSes_(u.min / u.n) + '</td>' +
        '<td style="font-size:11.5px;">' + fh(u.ultima) + '</td><td style="font-size:11.5px;">' + fh(u.primera) + '</td></tr>' +
        (S.abierto === u.id ? detalle(u) : '')).join('') ||
        '<tr><td colspan="8" style="padding:14px;color:var(--text-tertiary);">Sin sesiones en el periodo. Las sesiones se registran desde que se ejecutó el SQL 116 y cada usuario volvió a entrar.</td></tr>') +
    '</tbody></table></div>';
  document.getElementById('ses-dias').addEventListener('change', e => { S.dias = Number(e.target.value); adminSeccionSesiones_(c, true); });
  document.getElementById('ses-perfil').addEventListener('change', e => { S.perfil = e.target.value; adminSeccionSesiones_(c); });
  let t = null;
  document.getElementById('ses-q').addEventListener('input', e => { clearTimeout(t); t = setTimeout(() => { S.q = e.target.value; adminSeccionSesiones_(c); const i = document.getElementById('ses-q'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }, 250); });
  document.getElementById('ses-recargar').addEventListener('click', () => adminSeccionSesiones_(c, true));
  document.getElementById('ses-excel').addEventListener('click', () => descargarSesiones_(ses));
  c.querySelectorAll('[data-ses-u]').forEach(tr => tr.addEventListener('click', () => { S.abierto = S.abierto === tr.dataset.sesU ? '' : tr.dataset.sesU; adminSeccionSesiones_(c); }));
  // Gráfico por día
  if (S.chart) { try { S.chart.destroy(); } catch (e) {} S.chart = null; }
  if (window.Chart) {
    const dias = []; const n = Math.min(S.dias, 90);
    for (let i = n - 1; i >= 0; i--) dias.push(fechaISO_(new Date(Date.now() - i * 864e5)));
    const porDia = {}; ses.forEach(s => { const k = fechaISO_(new Date(s.inicio)); const x = porDia[k] = porDia[k] || { n: 0, min: 0 }; x.n++; x.min += Number(s.minutos || 0); });
    S.chart = new Chart(document.getElementById('ses-chart'), {
      data: { labels: dias.map(d => { const p = parseISOLocal_(d); return p.getDate() + '/' + (p.getMonth() + 1); }),
        datasets: [{ type: 'bar', label: 'Sesiones', data: dias.map(d => (porDia[d] || {}).n || 0), backgroundColor: '#3B82F6', borderRadius: 3, yAxisID: 'y' },
                   { type: 'line', label: 'Horas conectadas', data: dias.map(d => Math.round(((porDia[d] || {}).min || 0) / 6) / 10), borderColor: '#16A34A', backgroundColor: '#16A34A', tension: 0.3, yAxisID: 'y2', pointRadius: 2 }] },
      options: { responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, plugins: { legend: { position: 'bottom' } },
        scales: { y: { beginAtZero: true, ticks: { precision: 0 }, title: { display: true, text: 'Sesiones' } },
                  y2: { position: 'right', beginAtZero: true, grid: { display: false }, title: { display: true, text: 'Horas' } } } },
    });
  }
}
function dispositivoSes_(ua) {
  ua = String(ua || '');
  const so = /Android/i.test(ua) ? 'Android' : /iPhone|iPad/i.test(ua) ? 'iOS' : /Windows/i.test(ua) ? 'Windows' : /Mac OS/i.test(ua) ? 'Mac' : /Linux/i.test(ua) ? 'Linux' : '';
  const nav = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : '';
  return [nav, so].filter(Boolean).join(' · ') || '—';
}
async function descargarSesiones_(ses) {
  try {
    const XLSX = await tbCargarSheetJs_();
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(ses.map(s => ({
      'Usuario': s.nombre_completo, 'Perfil': perfilSesion_(s), 'Inicio': new Date(s.inicio).toLocaleString('es-CL'),
      'Fin': s.en_curso ? 'En curso' : (s.fin ? new Date(s.fin).toLocaleString('es-CL') : ''), 'Minutos': Number(s.minutos || 0),
      'Vistas': (s.vistas || []).join(', '), 'Equipo': dispositivoSes_(s.agente), 'Pantalla': s.pantalla || '' }))), 'Sesiones');
    XLSX.writeFile(wb, 'sesiones_usuarios_' + fechaISO_(new Date()) + '.xlsx');
  } catch (e) { mostrarToast_('No se pudo generar el Excel: ' + (e.message || e)); }
}

// ---------- AUDITORÍA ----------
async function adminSeccionAuditoria_(c) {
  const render = async () => {
    const tabla = document.getElementById('adm-a-tabla').value;
    const op = document.getElementById('adm-a-op').value;
    const q = normalizarBusqueda_(document.getElementById('adm-a-search').value);
    let query = supabaseClient.from('auditoria').select('id, fecha, usuario_nombre, tabla, operacion, registro_id, descripcion, datos_antes, datos_despues').order('fecha', { ascending: false }).limit(300);
    if (tabla) query = query.eq('tabla', tabla);
    if (op) query = query.eq('operacion', op);
    const { data, error } = await query;
    const tb = document.getElementById('adm-a-tbody');
    if (error) { tb.innerHTML = '<tr><td colspan="5" style="padding:14px;color:#B91C1C;">' + escapeHtml_(error.message) + '</td></tr>'; return; }
    const lista = (data || []).filter(a => !q || normalizarBusqueda_((a.usuario_nombre || '') + ' ' + (a.descripcion || '')).includes(q));
    document.getElementById('adm-a-count').textContent = lista.length + ' registro(s)';
    tb.innerHTML = lista.map(a => {
      const cambios = diffAuditoria_(a.datos_antes, a.datos_despues);
      return '<tr class="audit-row" data-id="' + a.id + '" style="cursor:pointer;"><td style="white-space:nowrap;">' + new Date(a.fecha).toLocaleString('es-CL') + '</td><td>' + escapeHtml_(a.usuario_nombre || 'Sistema') + '</td><td><span class="audit-op ' + a.operacion + '">' + a.operacion + '</span></td><td><b>' + escapeHtml_(a.tabla) + '</b></td><td>' + escapeHtml_(a.descripcion || '') + '</td></tr>' +
        '<tr class="audit-detalle-row" style="display:none;"><td colspan="5" style="background:#FAFBFC;"><div class="audit-diff">' + escapeHtml_(cambios) + '</div></td></tr>';
    }).join('') || '<tr><td colspan="5" style="padding:14px;color:var(--text-tertiary);">Sin registros.</td></tr>';
    tb.querySelectorAll('.audit-row').forEach(r => r.addEventListener('click', () => { const d = r.nextElementSibling; d.style.display = d.style.display === 'none' ? '' : 'none'; }));
  };
  c.innerHTML = adminHead_('Auditoría', 'Quién cambió qué y cuándo. Clic en una fila para ver el detalle del cambio.',
    '<select id="adm-a-tabla" class="admin-search" style="min-width:170px;"><option value="">Todas las tablas</option>' +
    ['perfiles','instituciones','recursos_maestro','tb_patrulleros','config_periodos','copamiento_recursos','planes_contingencia','planificacion_recursos','tb_carga_patrullaje_por_dia'].map(t => '<option>' + t + '</option>').join('') + '</select>' +
    '<select id="adm-a-op" class="admin-search" style="min-width:130px;"><option value="">Toda operación</option><option>INSERT</option><option>UPDATE</option><option>DELETE</option></select>' +
    '<input id="adm-a-search" class="admin-search" placeholder="Buscar usuario o detalle…"><span class="admin-count" id="adm-a-count"></span>') +
    '<div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Fecha</th><th>Usuario</th><th>Op.</th><th>Tabla</th><th>Detalle</th></tr></thead><tbody id="adm-a-tbody"></tbody></table></div>';
  ['adm-a-tabla','adm-a-op'].forEach(id => document.getElementById(id).addEventListener('change', render));
  document.getElementById('adm-a-search').addEventListener('input', render);
  render();
}

// Resume qué campos cambiaron entre antes y después (para el detalle de auditoría)
function diffAuditoria_(antes, despues) {
  const OMITIR = new Set(['geom','updated_at','actualizado_en','fecha_registro']);
  if (!antes && despues) return 'CREADO:\n' + Object.keys(despues).filter(k => !OMITIR.has(k) && despues[k] != null).map(k => '  ' + k + ' = ' + JSON.stringify(despues[k])).join('\n');
  if (antes && !despues) return 'ELIMINADO:\n' + Object.keys(antes).filter(k => !OMITIR.has(k) && antes[k] != null).map(k => '  ' + k + ' = ' + JSON.stringify(antes[k])).join('\n');
  if (!antes || !despues) return '';
  const cambios = Object.keys(despues).filter(k => !OMITIR.has(k) && JSON.stringify(antes[k]) !== JSON.stringify(despues[k]));
  if (!cambios.length) return 'Sin cambios en campos visibles (posible actualización de geometría).';
  return 'MODIFICADO:\n' + cambios.map(k => '  ' + k + ': ' + JSON.stringify(antes[k]) + '  →  ' + JSON.stringify(despues[k])).join('\n');
}

