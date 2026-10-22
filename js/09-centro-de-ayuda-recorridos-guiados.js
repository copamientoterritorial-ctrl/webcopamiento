/* ==================== ❓ CENTRO DE AYUDA + RECORRIDOS GUIADOS (15-10-2026) ====================
 * Botón ❓ de la barra superior → ventana con 4 guías ilustradas (escenarios de alerta, copamiento,
 * asignación de recursos y restricciones, edición). Cada guía tiene «▶ Recorrido guiado»: resalta en
 * vivo los botones reales del sistema (foco + globo), navega a la vista y abre los menús paso a paso. */
const AY_SVG = {
  escenarios:
    '<svg class="ay-ilus" viewBox="0 0 760 210" xmlns="http://www.w3.org/2000/svg" font-family="Inter,Arial,sans-serif">' +
    [['Condiciones Normales', '#16A34A', '#DCFCE7', 20, 2], ['Alerta Amarilla', '#D97706', '#FEF3C7', 275, 4], ['Alerta Roja', '#DC2626', '#FEE2E2', 530, 6]].map(([t, c, f, x, n]) =>
      '<g transform="translate(' + x + ',22)"><rect width="210" height="166" rx="14" fill="' + f + '" stroke="' + c + '" stroke-width="2"/>' +
      '<text x="14" y="24" font-size="13" font-weight="800" fill="' + c + '">' + t + '</text>' +
      '<path d="M22 48 L95 38 L178 54 L190 120 L130 150 L40 142 L18 98 Z" fill="#fff" stroke="#334155" stroke-width="1.5" stroke-dasharray="5 3"/>' +
      Array.from({ length: n }, (_, i) => '<path d="M' + (34 + i * 22) + ' ' + (128 - i * 6) + ' q 30 -' + (40 + i * 4) + ' ' + (70 - i * 4) + ' -' + (52 - i * 3) + '" fill="none" stroke="' + c + '" stroke-width="3.5" stroke-linecap="round"/>').join('') +
      '<circle cx="152" cy="' + (78 + n * 4) + '" r="7" fill="' + c + '" stroke="#fff" stroke-width="2"/>' +
      '<text x="14" y="158" font-size="10.5" fill="#475569">' + (n === 2 ? 'Copamiento base' : n === 4 ? 'Refuerzo del copamiento' : 'Copamiento máximo') + '</text></g>').join('') +
    '<g fill="#7C3AED" font-size="11" font-weight="800"><path d="M236 105 h30 l-8 -7 M266 105 l-8 7" stroke="#7C3AED" stroke-width="2.5" fill="none"/><text x="228" y="94">Propagar</text>' +
    '<path d="M491 105 h30 l-8 -7 M521 105 l-8 7" stroke="#7C3AED" stroke-width="2.5" fill="none"/><text x="483" y="94">Propagar</text></g></svg>',
  copamiento:
    '<svg class="ay-ilus" viewBox="0 0 760 200" xmlns="http://www.w3.org/2000/svg" font-family="Inter,Arial,sans-serif">' +
    '<g transform="translate(18,30)"><rect width="160" height="140" rx="14" fill="#FEF3C7" stroke="#D97706" stroke-width="2"/><text x="14" y="26" font-size="13" font-weight="800" fill="#92400E">📋 Plantilla</text>' +
    '<text x="14" y="48" font-size="11" fill="#78350F">Plan de la alerta</text><text x="14" y="64" font-size="11" fill="#78350F">(Normal · Amarilla · Roja)</text>' +
    '<rect x="14" y="80" width="132" height="12" rx="6" fill="#FCD34D"/><rect x="14" y="98" width="100" height="12" rx="6" fill="#FCD34D"/><rect x="14" y="116" width="118" height="12" rx="6" fill="#FCD34D"/></g>' +
    '<path d="M186 100 h40 l-9 -7 M226 100 l-9 7" stroke="#334155" stroke-width="2.5" fill="none"/><text x="180" y="88" font-size="10.5" font-weight="700" fill="#334155">🔥 Crear</text>' +
    '<g transform="translate(236,30)"><rect width="190" height="140" rx="14" fill="#FEE2E2" stroke="#DC2626" stroke-width="2"/><text x="14" y="26" font-size="13" font-weight="800" fill="#991B1B">🚨 Periodo Crítico</text>' +
    ['CONAF', 'CMPC', 'Carabineros'].map((t, i) => '<g transform="translate(14,' + (44 + i * 30) + ')"><rect width="162" height="24" rx="7" fill="#fff" stroke="#FCA5A5"/>' +
      '<rect x="7" y="6" width="12" height="12" rx="3" fill="' + (i === 2 ? '#fff' : '#16A34A') + '" stroke="#16A34A"/>' + (i === 2 ? '' : '<path d="M9 12 l3 3 l5 -6" stroke="#fff" stroke-width="2" fill="none"/>') +
      '<text x="26" y="16" font-size="11" fill="#334155">' + t + (i === 0 ? ' · 5 de 9 Va' : i === 1 ? ' · 12 de 12 Va' : ' · no va') + '</text></g>').join('') + '</g>' +
    '<path d="M434 100 h40 l-9 -7 M474 100 l-9 7" stroke="#334155" stroke-width="2.5" fill="none"/><text x="426" y="88" font-size="10.5" font-weight="700" fill="#334155">💾 Guardar</text>' +
    '<g transform="translate(484,30)"><rect width="258" height="140" rx="14" fill="#F0FDF4" stroke="#16A34A" stroke-width="2"/><text x="14" y="26" font-size="13" font-weight="800" fill="#166534">✅ Solo lo seleccionado</text>' +
    '<path d="M22 60 L100 46 L160 64 L150 120 L60 128 L24 100 Z" fill="#fff" stroke="#334155" stroke-dasharray="5 3"/>' +
    '<path d="M40 110 q30 -40 90 -50" stroke="#DC2626" stroke-width="3.5" fill="none" stroke-linecap="round"/><path d="M50 82 q40 10 80 30" stroke="#DC2626" stroke-width="3.5" fill="none" stroke-linecap="round"/>' +
    '<text x="172" y="62" font-size="11" fill="#166534">Mapa</text><text x="172" y="80" font-size="11" fill="#166534">PDF</text><text x="172" y="98" font-size="11" fill="#166534">Informe</text>' +
    '<text x="14" y="134" font-size="10.5" fill="#475569">＋ Ver no activadas → reactivar</text></g></svg>',
  asignar:
    '<svg class="ay-ilus" viewBox="0 0 760 190" xmlns="http://www.w3.org/2000/svg" font-family="Inter,Arial,sans-serif">' +
    '<g transform="translate(20,24)"><rect width="300" height="142" rx="14" fill="#F0FDF4" stroke="#16A34A" stroke-width="2"/><text x="14" y="24" font-size="13" font-weight="800" fill="#166534">🟢 Ruta del escenario Normal</text>' +
    '<path d="M30 110 q60 -70 130 -40 t120 -30" stroke="#16A34A" stroke-width="5" fill="none" stroke-linecap="round"/><circle cx="160" cy="70" r="7" fill="#22C55E" stroke="#fff" stroke-width="2"/>' +
    '<text x="14" y="130" font-size="10.5" fill="#475569">CMPC · Vigía Camioneta · punto 🟢 = tiene recurso</text></g>' +
    '<path d="M330 95 h80" stroke="#2563EB" stroke-width="3" stroke-dasharray="6 4"/><text x="334" y="84" font-size="11" font-weight="800" fill="#2563EB">Recurso asociado</text>' +
    '<g transform="translate(420,24)"><rect width="320" height="142" rx="14" fill="#fff" stroke="#CBD5E1" stroke-width="2"/>' +
    '<text x="14" y="24" font-size="12" font-weight="800" fill="#334155">Lista de recursos del área</text>' +
    [['🟢 AV3.51 · Vigía Camioneta · sin ruta', '#16A34A', '#F0FDF4'], ['📍 AV3.58 · Vigía Camioneta · sin ubicar', '#2563EB', '#EFF6FF'], ['🔒 AV3.52 · Vigía Camioneta · ya tiene ruta', '#94A3B8', '#F1F5F9']].map(([t, c, f], i) =>
      '<g transform="translate(14,' + (36 + i * 33) + ')"><rect width="292" height="26" rx="8" fill="' + f + '" stroke="' + c + '"/><text x="10" y="17" font-size="11" fill="#334155">' + t + '</text></g>').join('') + '</g></svg>',
  cmpc:
    '<svg class="ay-ilus" viewBox="0 0 760 200" xmlns="http://www.w3.org/2000/svg" font-family="Inter,Arial,sans-serif">' +
    // 1) Turnos: grilla del mes con T (turno) y L (libre)
    '<g transform="translate(14,18)"><rect width="176" height="166" rx="14" fill="#fff" stroke="#2563EB" stroke-width="2"/><text x="12" y="22" font-size="12.5" font-weight="800" fill="#1E3A8A">📅 Turnos</text>' +
    Array.from({ length: 4 }, (_, f) => '<text x="12" y="' + (50 + f * 26) + '" font-size="9.5" font-weight="700" fill="#334155">AV3.5' + (f + 1) + '</text>' +
      Array.from({ length: 6 }, (_, d) => { const t = (f + d) % 3 !== 0; return '<rect x="' + (56 + d * 19) + '" y="' + (38 + f * 26) + '" width="16" height="16" rx="3" fill="' + (t ? '#16A34A' : '#FDE68A') + '"/><text x="' + (60 + d * 19) + '" y="' + (50 + f * 26) + '" font-size="9" font-weight="800" fill="' + (t ? '#fff' : '#92400E') + '">' + (t ? 'T' : 'L') + '</text>'; }).join('')).join('') +
    '<text x="12" y="156" font-size="9.5" fill="#475569">Avance · PDF mensual · panorama</text></g>' +
    // 2) Planificador gráfico: mapa con recursos y su ruta
    '<g transform="translate(200,18)"><rect width="176" height="166" rx="14" fill="#F0FDF4" stroke="#16A34A" stroke-width="2"/><text x="12" y="22" font-size="12.5" font-weight="800" fill="#166534">🧭 Planificador gráfico</text>' +
    '<path d="M18 120 L60 40 L140 52 L160 130 L70 146 Z" fill="#fff" stroke="#334155" stroke-dasharray="5 3"/>' +
    '<path d="M40 120 q40 -50 100 -40" stroke="#2563EB" stroke-width="3.5" fill="none" stroke-linecap="round"/>' +
    '<circle cx="62" cy="92" r="7" fill="#16A34A" stroke="#fff" stroke-width="2"/><circle cx="120" cy="118" r="7" fill="#F59E0B" stroke="#fff" stroke-width="2"/><circle cx="96" cy="66" r="7" fill="#7C3AED" stroke="#fff" stroke-width="2"/>' +
    '<text x="12" y="160" font-size="9.5" fill="#475569">Ruta asociada · 📍 Ubicar / mover</text></g>' +
    // 3) Tablero: barras por tipo
    '<g transform="translate(386,18)"><rect width="176" height="166" rx="14" fill="#FFFBEB" stroke="#D97706" stroke-width="2"/><text x="12" y="22" font-size="12.5" font-weight="800" fill="#92400E">📊 Tablero</text>' +
    [[32, '#16A34A'], [64, '#2563EB'], [48, '#F59E0B'], [80, '#7C3AED'], [24, '#DC2626']].map(([h, c], i) => '<rect x="' + (22 + i * 28) + '" y="' + (130 - h) + '" width="18" height="' + h + '" rx="3" fill="' + c + '"/>').join('') +
    '<line x1="16" y1="131" x2="160" y2="131" stroke="#CBD5E1"/><text x="12" y="156" font-size="9.5" fill="#475569">Activación por quincena · Excel</text></g>' +
    // 4) Gestión de Recursos: tabla editable
    '<g transform="translate(572,18)"><rect width="176" height="166" rx="14" fill="#F5F3FF" stroke="#7C3AED" stroke-width="2"/><text x="12" y="22" font-size="12.5" font-weight="800" fill="#5B21B6">🗂️ Gestión</text>' +
    Array.from({ length: 5 }, (_, f) => '<rect x="12" y="' + (34 + f * 21) + '" width="152" height="17" rx="4" fill="' + (f ? '#fff' : '#DDD6FE') + '" stroke="#E9D5FF"/>' +
      (f ? '<text x="18" y="' + (46 + f * 21) + '" font-size="8.5" fill="#334155">AV3.5' + f + '</text><rect x="64" y="' + (38 + f * 21) + '" width="' + (40 + f * 9) + '" height="8" rx="3" fill="' + (f === 2 ? '#BFDBFE' : '#E2E8F0') + '"/>' : '<text x="18" y="46" font-size="8.5" font-weight="800" fill="#5B21B6">Clave · Persona · RUT</text>')).join('') +
    '<text x="12" y="156" font-size="9.5" fill="#475569">Contacto · Excel masivo · 🏢</text></g></svg>',
  subgerente:
    '<svg class="ay-ilus" viewBox="0 0 760 210" xmlns="http://www.w3.org/2000/svg" font-family="Inter,Arial,sans-serif">' +
    // Subgerencia → áreas → comunas, con barras de avance
    '<g transform="translate(16,78)"><rect width="150" height="58" rx="14" fill="#0F766E"/><text x="14" y="25" font-size="12" font-weight="800" fill="#CCFBF1">📈 SUBGERENCIA</text><text x="14" y="45" font-size="15" font-weight="900" fill="#fff">Norte · 7 áreas</text></g>' +
    [['Los Ángeles', 72, '#16A34A', 22], ['Mulchén', 50, '#D97706', 84], ['Nacimiento', 25, '#EA580C', 146]].map(([n, p, c, y]) =>
      '<path d="M166 107 C 200 107, 200 ' + (y + 22) + ', 236 ' + (y + 22) + '" stroke="#94A3B8" stroke-width="2" fill="none"/>' +
      '<g transform="translate(236,' + y + ')"><rect width="210" height="46" rx="11" fill="#fff" stroke="' + c + '" stroke-width="2"/>' +
      '<text x="12" y="19" font-size="12" font-weight="800" fill="#0F172A">' + n + '</text><text x="196" y="19" font-size="13" font-weight="900" fill="' + c + '" text-anchor="end">' + p + '%</text>' +
      '<rect x="12" y="28" width="186" height="7" rx="3.5" fill="#E2E8F0"/><rect x="12" y="28" width="' + (186 * p / 100) + '" height="7" rx="3.5" fill="' + c + '"/></g>').join('') +
    '<path d="M446 45 C 480 45, 480 60, 512 60" stroke="#94A3B8" stroke-width="2" fill="none"/>' +
    '<g transform="translate(512,22)"><rect width="234" height="166" rx="14" fill="#F8FAFC" stroke="#CBD5E1" stroke-width="2"/><text x="12" y="22" font-size="12" font-weight="800" fill="#334155">🏘️ Comunas del área</text>' +
    [['Los Ángeles', [1, 1, 1, 0], 'Media'], ['Quilleco', [1, 1, 0, 0], 'Media'], ['Laja', [0, 1, 1, 1], 'Media'], ['Cabrero', [1, 1, 1, 1], 'Media']].map(([n, h, pr], i) =>
      '<g transform="translate(12,' + (36 + i * 31) + ')"><text x="0" y="14" font-size="11" font-weight="700" fill="#0F172A">' + n + '</text>' +
      ['👤', 'N', 'A', 'R'].map((t, k) => '<rect x="' + (92 + k * 22) + '" y="2" width="18" height="18" rx="5" fill="' + (h[k] ? '#DCFCE7' : '#F1F5F9') + '"/><text x="' + (101 + k * 22) + '" y="15" font-size="9.5" font-weight="800" fill="' + (h[k] ? '#166534' : '#CBD5E1') + '" text-anchor="middle">' + t + '</text>').join('') +
      '<text x="210" y="14" font-size="10" font-weight="800" fill="' + (h.every(Boolean) ? '#16A34A' : '#D97706') + '" text-anchor="end">' + (h.filter(Boolean).length * 25) + '%</text></g>').join('') + '</g></svg>',
  editar:
    '<svg class="ay-ilus" viewBox="0 0 760 180" xmlns="http://www.w3.org/2000/svg" font-family="Inter,Arial,sans-serif">' +
    '<g transform="translate(20,20)"><rect width="340" height="140" rx="14" fill="#EFF6FF" stroke="#2563EB" stroke-width="2"/><text x="14" y="24" font-size="13" font-weight="800" fill="#1E3A8A">🧩 Editar forma</text>' +
    '<path d="M30 110 L100 70 L170 92 L250 50 L310 76" stroke="#2563EB" stroke-width="4" fill="none" stroke-linejoin="round"/>' +
    [[30, 110], [100, 70], [250, 50], [310, 76]].map(([x, y]) => '<circle cx="' + x + '" cy="' + y + '" r="6" fill="#fff" stroke="#2563EB" stroke-width="2.5"/>').join('') +
    '<circle cx="170" cy="92" r="8" fill="#FBBF24" stroke="#fff" stroke-width="2"/><path d="M170 92 L178 120" stroke="#F59E0B" stroke-width="2" stroke-dasharray="3 3"/>' +
    '<text x="14" y="132" font-size="10.5" fill="#475569">Arrastra un vértice · clic derecho lo borra · se sincroniza en los 3 escenarios</text></g>' +
    '<g transform="translate(400,20)"><rect width="340" height="140" rx="14" fill="#FFF7ED" stroke="#F97316" stroke-width="2"/><text x="14" y="24" font-size="13" font-weight="800" fill="#9A3412">✂️ Cortar ruta</text>' +
    '<path d="M30 100 Q 110 40 170 80" stroke="#2563EB" stroke-width="5" fill="none" stroke-linecap="round"/><path d="M170 80 Q 240 120 310 60" stroke="#F97316" stroke-width="5" fill="none" stroke-linecap="round"/>' +
    '<circle cx="170" cy="80" r="13" fill="#fff" stroke="#DC2626" stroke-width="2.5"/><text x="162" y="85" font-size="13">✂️</text>' +
    '<text x="14" y="132" font-size="10.5" fill="#475569">🔵 tramo 1 conserva el recurso · 🟠 tramo 2 = ruta nueva</text></g></svg>',
  agricultores:
    '<svg class="ay-ilus" viewBox="0 0 760 200" xmlns="http://www.w3.org/2000/svg" font-family="Inter,Arial,sans-serif">' +
    // 1) Planificación: calendario con actividades
    '<g transform="translate(14,18)"><rect width="176" height="166" rx="14" fill="#EFF6FF" stroke="#2563EB" stroke-width="2"/><text x="12" y="22" font-size="12.5" font-weight="800" fill="#1E3A8A">🗓️ Planificación</text>' +
    Array.from({ length: 3 }, (_, f) => Array.from({ length: 5 }, (_, d) => { const k = (f * 5 + d) % 4; const c = ['#BFDBFE', '#BBF7D0', '#FECACA', '#F1F5F9'][k];
      return '<rect x="' + (12 + d * 31) + '" y="' + (36 + f * 34) + '" width="28" height="30" rx="5" fill="#fff" stroke="#DBEAFE"/>' + (k < 3 ? '<rect x="' + (15 + d * 31) + '" y="' + (52 + f * 34) + '" width="22" height="8" rx="3" fill="' + c + '"/>' : ''); }).join('')).join('') +
    '<text x="12" y="156" font-size="9.5" fill="#475569">Azul plan · verde hecho · rojo vencido</text></g>' +
    // 2) App de terreno: celular con pincho y nube
    '<g transform="translate(206,18)"><rect width="150" height="166" rx="14" fill="#F7FEE7" stroke="#65A30D" stroke-width="2"/><text x="12" y="22" font-size="12.5" font-weight="800" fill="#3F6212">📱 App de terreno</text>' +
    '<rect x="45" y="32" width="60" height="110" rx="10" fill="#0F172A"/><rect x="50" y="40" width="50" height="86" rx="4" fill="#ECFCCB"/>' +
    '<path d="M55 110 q15 -25 40 -30" stroke="#65A30D" stroke-width="2.5" fill="none" stroke-dasharray="3 3"/><path d="M69 65 L75 78 L81 65 Z" fill="#DC2626"/><circle cx="75" cy="62" r="7" fill="#DC2626"/><circle cx="75" cy="62" r="2.5" fill="#fff"/>' +
    '<text x="12" y="158" font-size="9.5" fill="#475569">Formulario · fotos · sin señal</text></g>' +
    // 3) Control diario: bitácora
    '<g transform="translate(372,18)"><rect width="176" height="166" rx="14" fill="#FFFBEB" stroke="#D97706" stroke-width="2"/><text x="12" y="22" font-size="12.5" font-weight="800" fill="#92400E">📅 Control diario</text>' +
    [['🧑‍🌾 Visita · Los Laureles', '09:40'], ['🎓 Capacitación · 18 pers.', '11:15'], ['🚧 Operativo R-86', '15:30'], ['⏳ Reunión (sin registrar)', '—']].map(([t, h], i) =>
      '<g transform="translate(12,' + (34 + i * 30) + ')"><rect width="152" height="24" rx="6" fill="#fff" stroke="' + (i === 3 ? '#FCA5A5' : '#FDE68A') + '"/><text x="7" y="16" font-size="9.5" fill="#334155">' + t + '</text><text x="146" y="16" font-size="9" fill="#94A3B8" text-anchor="end">' + h + '</text></g>').join('') + '</g>' +
    // 4) Tablero: meta vs realizado
    '<g transform="translate(564,18)"><rect width="182" height="166" rx="14" fill="#F0FDF4" stroke="#16A34A" stroke-width="2"/><text x="12" y="22" font-size="12.5" font-weight="800" fill="#166534">📊 Meta vs realizado</text>' +
    [[92, '#16A34A'], [74, '#D97706'], [48, '#DC2626'], [100, '#16A34A']].map(([p, c], i) =>
      '<g transform="translate(12,' + (36 + i * 28) + ')"><text x="0" y="11" font-size="9.5" font-weight="700" fill="#334155">A' + (i + 1) + '</text><rect x="22" y="3" width="104" height="10" rx="5" fill="#E2E8F0"/>' +
      '<rect x="22" y="3" width="' + (104 * p / 100) + '" height="10" rx="5" fill="' + c + '"/><text x="158" y="12" font-size="9.5" font-weight="800" fill="' + c + '" text-anchor="end">' + p + '%</text></g>').join('') +
    '<text x="12" y="156" font-size="9.5" fill="#475569">Mes y temporada · ⬇️ Excel</text></g></svg>',
};
const AY_GUIAS = [
  {
    k: 'escenarios', ico: '🧭', c: '#16A34A', titulo: 'Crear escenarios de alertas', sub: 'Planes Normal, Alerta Amarilla y Roja por comuna',
    intro: 'Cada comuna tiene <b>tres planes</b>: 🟢 Condiciones Normales, 🟡 Alerta Amarilla y 🔴 Alerta Roja. Cada plan reúne puntos, rutas (líneas) y áreas por institución: a mayor alerta, más copamiento.',
    flujo: [['Planificador de Alertas', 'Gestión SIG ▾'], ['Elige la comuna', 'o el filtro 🧭 Área'], ['✏️ Planificar', 'elige el escenario'], ['Dibuja', 'punto · línea · área'], ['Ficha y guardar', 'institución, tipo, recurso'], ['⏫ Propagar', 'Normal → Amarilla → Roja']],
    pasos: [
      ['Abre el Planificador de Alertas', 'En el menú superior: <b>Gestión SIG ▾ › Planificador de Alertas</b>.', ['<span class="m">🗺️ Gestión SIG ▾</span>', '<span class="fl">›</span>', '<span class="m az">🧭 Planificador de Alertas</span>']],
      ['Elige la comuna', 'Con el selector de comuna (arriba a la derecha). El Jefe de Área también puede usar el filtro <b>🧭 Área</b> para trabajar todas las comunas de su área: el resto se ve atenuado.', ['<span class="m">📍 Comuna ▾</span>', '<span class="m">🧭 Área ▾</span>']],
      ['Abre ✏️ Planificar y elige el escenario', 'El botón del lápiz muestra los escenarios que tu perfil puede planificar.', ['<span class="m osc">✏️</span>', '<span class="fl">›</span>', '<span class="m v">🟢 Escenario Normal</span>', '<span class="m a">🟡 Alerta Amarilla</span>', '<span class="m r">🔴 Alerta Roja</span>']],
      ['Dibuja en el mapa', 'En la barra de edición elige qué dibujar. Las líneas se trazan con un clic por vértice (o ✍️ trazo libre); el <b>🧲 imán</b> pega la ruta a la Red Vial. Termina con doble clic o ✓ Finalizar.', ['<span class="m">📍 Punto</span>', '<span class="m">📏 Línea</span>', '<span class="m">📐 Área</span>', '<span class="m">🧲 Imán Red Vial</span>', '<span class="m">📥 Importar KML</span>']],
      ['Completa la ficha y guarda', 'Institución, <b>tipo de recurso</b> (con CMPC aparece el catálogo: Brigada Multipropósito, Vigía Camioneta…), <b>recurso asociado</b> (solo en Normal) y la descripción operativa.', ['<span class="m">Institución ▾</span>', '<span class="m">Tipo de recurso ▾</span>', '<span class="m">Recurso asociado ▾</span>', '<span class="m osc">Guardar en la planificación</span>']],
      ['Propaga a las otras alertas', '<b>⏫ Propagar copamiento</b> copia lo NUEVO de Normal a Amarilla y luego a Roja. Si el plan de la alerta no existe, se crea. Lo que ya está (misma ruta o misma forma) no se duplica.', ['<span class="m mo">⏫ Propagar copamiento</span>']],
      ['Sal de la planificación', 'Con <b>🚪 Salir de planificación</b> en la barra de edición. Todo queda guardado al instante.', ['<span class="m">🚪 Salir de planificación</span>']],
    ],
    notas: [
      ['tip', '💡 Consejos', ['Junto a cada ruta CMPC del escenario Normal: punto 🟢 = tiene recurso, punto 🔴 = falta asignarlo.', 'La forma de una ruta se mantiene igual en los 3 escenarios (al editarla en uno, cambia en los otros).', '📤 Exportar plan descarga el escenario en GeoJSON o KML.']],
      ['rol', '👥 Quién puede', ['Administrador y Jefe de Área: los 3 escenarios.', 'GRD: las Alertas Amarilla y Roja de su comuna (Normal solo consulta).', 'Visor: solo consulta.']],
    ],
    tour: 'escenarios',
  },
  {
    k: 'copamiento', ico: '🚨', c: '#DC2626', titulo: 'Realizar un copamiento de recursos', sub: 'Periodo Crítico a partir de un plan de alerta',
    intro: 'Cuando se declara una alerta, se crea un <b>Periodo Crítico</b> a partir de la plantilla (el plan Normal, Amarilla o Roja). Luego se marca qué recursos <b>van</b> realmente y el sistema muestra solo lo seleccionado.',
    flujo: [['Modo Emergencia', 'Gestión SIG ▾'], ['🔥 Crear Periodo Crítico', 'asistente 3 pasos'], ['Marca lo que «Va»', 'por institución'], ['💾 Guardar selección', 'mapa, PDF e informe'], ['Reactivar', 'si llegan más recursos']],
    pasos: [
      ['Entra al Modo Emergencia', '<b>Gestión SIG ▾ › Modo Emergencia</b> y elige la comuna.', ['<span class="m">🗺️ Gestión SIG ▾</span>', '<span class="fl">›</span>', '<span class="m r">🚨 Modo Emergencia</span>']],
      ['Crea el Periodo Crítico', 'Botón <b>🔥 Crear Periodo Crítico</b>: asistente en 3 pasos (fechas → plantilla de alerta → confirmar). Se copia el plan completo de la alerta elegida.', ['<span class="m r">🔥 Crear Periodo Crítico</span>']],
      ['Marca qué recursos van', 'En el panel <b>Recursos de la emergencia</b>, por institución, marca ✓ <b>Va</b> lo que realmente se dispone. Ej.: CONAF tiene 9 rutas pero hoy dispone de 5.', ['<span class="m v">✓ Va</span>', '<span class="m">CONAF · 5 de 9</span>']],
      ['Guarda la selección', '<b>💾 Guardar selección</b>: desde ese momento el mapa, el PDF del periodo y el informe muestran SOLO lo seleccionado.', ['<span class="m osc">💾 Guardar selección</span>']],
      ['Reactiva si llegan más recursos', 'En cada institución, <b>＋ Ver n no activadas</b> muestra lo que quedó fuera para activarlo de nuevo.', ['<span class="m">＋ Ver 4 no activadas</span>', '<span class="m v">✓ Activar las 4</span>']],
      ['Ajusta en terreno e informa', '<b>✏️ › Editar Periodo Crítico</b> agrega, mueve o edita recursos del periodo activo. El informe de copamiento está en <b>Gestión SIG ▾ › Generar informe</b>.', ['<span class="m osc">✏️</span>', '<span class="fl">›</span>', '<span class="m az">🗓️ Editar Periodo Crítico</span>', '<span class="m">📄 Generar informe</span>']],
    ],
    notas: [
      ['tip', '💡 Consejos', ['La plantilla debe estar planificada antes (guía «Crear escenarios de alertas»).', 'El % de copamiento se calcula sobre la zona de incendios del trienio.']],
      ['rol', '👥 Quién puede', ['Administrador, Jefe de Área y GRD crean y editan el Periodo Crítico.', 'Visor: solo consulta.']],
    ],
    tour: 'copamiento',
  },
  {
    k: 'asignar', ico: '🔗', c: '#2563EB', titulo: 'Asignar recursos y sus restricciones', sub: 'Recurso asociado, turnos y reglas del sistema',
    intro: 'La <b>ruta de un recurso</b> es su línea del <b>escenario Normal</b>. Al asociarlos, la ruta queda enlazada con el recurso en el Planificador gráfico, el Tablero y el Calendario de Turnos.',
    flujo: [['Escenario 🟢 Normal', 'dibuja o abre la ruta'], ['Recurso asociado', 'del mismo tipo'], ['Turnos', 'días del recurso'], ['Seguimiento', 'avance y tablero']],
    pasos: [
      ['Abre la ruta en el escenario Normal', 'Planifica 🟢 Normal y dibuja la línea, o haz clic en una ruta existente › ✏️ Editar.', ['<span class="m osc">✏️</span>', '<span class="fl">›</span>', '<span class="m v">🟢 Escenario Normal</span>']],
      ['Elige el recurso asociado', 'La lista muestra los recursos de <b>Relacionamiento (CMPC)</b> del <b>mismo tipo</b> de la ruta, de las áreas de la comuna. Primero los que no tienen ruta en la comuna, luego los aún sin ubicar y los de otras comunas del área. Los que ya tienen ruta aparecen 🔒 bloqueados.', ['<span class="m">Recurso asociado ▾</span>', '<span class="m v">🟢 AV3.51 · sin ruta</span>', '<span class="m">🔒 AV3.52 · ya tiene ruta</span>']],
      ['Programa los turnos', '<b>Planificador CMPC ▾ › Turnos de Recursos</b>: por área y mes, marca los días de turno (los días sin turno quedan «L» libre). Descarga el PDF mensual o el panorama.', ['<span class="m">🌲 Planificador CMPC ▾</span>', '<span class="fl">›</span>', '<span class="m az">📅 Turnos de Recursos</span>']],
      ['Revisa y completa los datos', '<b>Gestión de Recursos</b>: datos y contacto de cada recurso (Jefe de Área en sus áreas; carga masiva por Excel solo el Administrador). <b>Planificador gráfico</b>: ubicar o mover el punto del recurso.', ['<span class="m az">🗂️ Gestión de Recursos</span>', '<span class="m az">🧭 Planificador gráfico</span>']],
    ],
    tabla: [
      ['Regla', 'Qué pasa'],
      ['Un recurso = una ruta por plan', 'Si ya tiene ruta, aparece 🔒 en la lista y no se puede elegir.'],
      ['Mismo tipo', 'La ruta y el recurso deben ser del mismo tipo (Vigía Camioneta ↔ Vigía Camioneta).'],
      ['Solo Relacionamiento (CMPC)', 'Se asocian recursos CMPC de las áreas a las que pertenece la comuna.'],
      ['Comuna sin área', 'No aparecen recursos: asigna la comuna en Administración › Comunas por área.'],
      ['Eliminar un recurso', 'Solo si NO tiene rutas (🔒 en Gestión de Recursos). Quita primero la asociación.'],
      ['Turnos', 'No se asignan antes de la fecha de inicio de operación del recurso.'],
      ['Perfiles', 'Jefe de Área: solo sus áreas · GRD: solo Alerta Amarilla · Visor: solo consulta.'],
    ],
    notas: [['tip', '💡 Consejo', ['En el escenario Normal, el punto 🔴 junto a una ruta CMPC indica que aún no tiene recurso: es la lista de pendientes.']]],
    tour: 'asignar',
  },
  {
    k: 'cmpc', ico: '🌲', c: '#0F766E', titulo: 'Planificador CMPC', sub: 'Turnos, planificador gráfico, tablero y gestión',
    intro: 'El menú <b>🌲 Planificador CMPC</b> reúne la operación diaria de los recursos de Relacionamiento: cuándo trabajan (<b>Turnos</b>), dónde están y qué ruta cubren (<b>Planificador gráfico</b>), cuántos hay activos (<b>Tablero</b>) y sus datos y contacto (<b>Gestión de Recursos</b>).',
    flujo: [['Gestión de Recursos', 'datos y contacto'], ['Planificador gráfico', 'ubicar y ver su ruta'], ['Turnos', 'días de trabajo'], ['Seguimiento', 'quién falta actualizar'], ['Tablero', 'resumen y Excel']],
    pasos: [
      ['Abre el menú Planificador CMPC', 'En el menú superior: <b>🌲 Planificador CMPC ▾</b>. Las opciones dependen de tu perfil.', ['<span class="m">🌲 Planificador CMPC ▾</span>', '<span class="fl">›</span>', '<span class="m az">📅 Turnos</span>', '<span class="m az">🧭 Planificador gráfico</span>', '<span class="m az">📊 Tablero</span>', '<span class="m az">🗂️ Gestión</span>']],
      ['Completa los datos en Gestión de Recursos', 'Tabla editable por área: tipo, sector, empresa (desplegable de las empresas del área), turno, horario, N° de personas, fechas y <b>contacto</b> (persona, RUT, teléfono, mail). Guarda con <b>💾 Guardar cambios</b>. Elige qué columnas ver con <b>🧩 Columnas</b> y descarga el <b>📋 Resumen PDF</b> por área.', ['<span class="m">🧩 Columnas</span>', '<span class="m">Empresa ▾</span>', '<span class="m osc">💾 Guardar cambios</span>', '<span class="m">📋 Resumen PDF</span>', '<span class="m">⬇️ Excel</span>']],
      ['Ubica el recurso y revisa su ruta', '<b>Planificador gráfico</b>: filtra por subgerencia, área, sector y tipo; la lista y el mapa muestran cada recurso con su <b>ruta asociada</b> (escenario Normal). En la ficha, <b>📍 Ubicar / mover</b> fija el punto en el mapa (Administrador y Jefe de Área).', ['<span class="m">Área ▾</span>', '<span class="m">Tipo ▾</span>', '<span class="m v">📍 Ubicar en el mapa</span>', '<span class="m">✕ Limpiar filtros</span>']],
      ['Programa los turnos', '<b>Turnos de Recursos</b>: elige el área y el mes (vista <b>Mes</b> por defecto). Haz clic o arrastra sobre los días: verde <b>T</b> = turno, amarillo <b>L</b> = libre. Filtra por tipo y por clave radial. La columna <b>Avance</b> muestra días trabajados / días de operación.', ['<span class="m">Área ▾</span>', '<span class="m">Tipo ▾</span>', '<span class="m">📻 Clave ▾</span>', '<span class="m v">T</span>', '<span class="m a">L</span>', '<span class="m">Mes</span>']],
      ['Descarga los PDF de turnos', '<b>PDF mensual</b> (una página por recurso) y <b>PDF panorama</b> (todos los recursos + resumen por día: cuántos operan, cuántos en turno y % disponible).', ['<span class="m">🖨️ PDF mensual</span>', '<span class="m">🗓️ PDF panorama</span>']],
      ['Haz seguimiento', 'En Turnos, <b>📊 Seguimiento</b> muestra qué recursos y áreas faltan por actualizar el calendario. El <b>Tablero de Recursos</b> resume por tipo y área, la activación por quincena, y descarga todo a Excel.', ['<span class="m">📊 Seguimiento</span>', '<span class="m az">📊 Tablero</span>', '<span class="m">⬇️ Descargar Excel</span>']],
    ],
    tabla: [
      ['Regla', 'Qué pasa'],
      ['Turnos e inicio de operación', 'No se puede marcar turno antes de la fecha de inicio de operación del recurso (📅 en la fila).'],
      ['El ID no se modifica', 'En Gestión de Recursos el ID está bloqueado; es la llave de la carga masiva por Excel.'],
      ['Carga masiva', 'Subir Excel, ➕ Nuevo recurso, 🏢 Empresas y 🗑️ Eliminar: solo el Administrador.'],
      ['Eliminar un recurso', 'Solo si NO tiene ruta asignada (aparece 🔒).'],
      ['Datos de contacto', 'Solo los ven el Administrador y el Jefe de esa área.'],
      ['Jefe de Área', 'Ve y edita solo los recursos de sus áreas.'],
    ],
    notas: [
      ['tip', '💡 Consejos', ['En el mapa, los Recursos disponibles muestran «Clave radial · ID», la persona a cargo y el punto 🟢 con ruta / 🔴 sin ruta.', 'Los tipos siempre aparecen en el mismo orden: Brigada Multipropósito, Disuasiva, Vigía Camioneta, Motorizado, Montado, Infantería, Dron.']],
      ['rol', '👥 Quién puede', ['Administrador: todo, incluida la carga masiva.', 'Jefe de Área: Turnos, Planificador gráfico, Tablero y Gestión de sus áreas.', 'GRD y Visor: según los permisos de su perfil (consulta).']],
    ],
    tour: 'cmpc',
  },
  {
    k: 'subgerente', ico: '📈', c: '#0F766E', titulo: 'Subgerente · Seguimiento', sub: 'Avance de las áreas de la subgerencia en sus comunas',
    intro: 'El <b>Subgerente de Relacionamiento</b> administra todas las áreas de su subgerencia (Norte o Sur) con los permisos de un Jefe de Área. Su tablero <b>📈 Seguimiento</b> (exclusivo de este perfil) tiene dos vistas simples: <b>🏘️ Comunas y copamiento</b> (avance = nivel de copamiento de cada comuna, su prioridad, qué falta iniciar y quién ha trabajado) y <b>🌲 Inicio de recursos</b> (fechas de inicio de operación por área, con gráfico y filtros rápidos).',
    flujo: [['📈 Seguimiento', 'entra directo aquí'], ['Elige un área', 've todas sus comunas'], ['⛔ Sin iniciar', 'lo primero a atender'], ['Copamiento', 'Normal · Amarilla · Roja'], ['🌲 Recursos', 'cuándo inicia cada uno']],
    pasos: [
      ['Entra al tablero', 'Al iniciar sesión, el Subgerente llega directo a <b>📈 Seguimiento</b> (pestaña superior). No ve los reportes meteorológicos.', ['<span class="m osc">📈 Seguimiento</span>', '<span class="m">🏘️ Comunas y copamiento</span>', '<span class="m">🌲 Inicio de recursos</span>']],
      ['Elige un área', 'Los botones de <b>Área</b> muestran <b>todas</b> las comunas de esa área (con su cantidad). Cada comuna trae su <b>prioridad</b> de Comunas Prioritarias (Alta, Media, Baja) y 🤝 si la comparte con otra área.', ['<span class="m">Todas</span>', '<span class="m v">Los Ángeles</span>', '<span class="m">Mulchén</span>', '<span class="m">Prioridad Alta</span>']],
      ['Mira el avance de cada comuna', 'Parte eligiendo la <b>prioridad</b> (puedes marcar varias, p. ej. Alta + Media). Cada comuna muestra <b>tres tarjetas</b>: el nivel de copamiento en <b>Normal</b>, <b>Amarilla</b> y <b>Roja</b> sobre la zona de incendios del trienio. Arriba, el promedio de cada alerta para las comunas mostradas.', ['<span class="m v">Normal 40%</span>', '<span class="m a">Amarilla 62%</span>', '<span class="m r">Roja 81%</span>']],
      ['Detecta lo que falta iniciar', 'Cada comuna dice su estado: <b>⛔ Sin iniciar</b> (ningún escenario con entidades), <b>🟠 En curso</b> (y qué escenario falta) o <b>✅ 3 escenarios</b>. Filtra con los botones de <b>Estado</b> y <b>Prioridad</b>.', ['<span class="m r">⛔ Sin iniciar</span>', '<span class="m a">🟠 En curso · falta Roja</span>', '<span class="m v">✅ 3 escenarios</span>']],
      ['Quién ha trabajado', 'En cada comuna aparecen los <b>usuarios que han trabajado</b> en sus planes (con cuántas entidades crearon) y su usuario GRD. «Nadie ha trabajado aún» = hay que asignar o activar a alguien.', ['<span class="m">👤 Claudio León (2)</span>', '<span class="m">🏛️ GRD</span>']],
      ['Revisa el inicio de los recursos', 'Vista <b>🌲 Inicio de recursos</b>: filtros rápidos por <b>área</b> (o toda la subgerencia), <b>periodo</b> (ya iniciados, próximos 7 o 30 días, más adelante, sin fecha) y tipo. La <b>línea de tiempo</b> muestra cada recurso en su fecha de inicio (línea roja = hoy) y el gráfico, cuántos inician por semana.', ['<span class="m">✅ Ya iniciados</span>', '<span class="m">⏳ Próximos 7 días</span>', '<span class="m">📅 Próximos 30 días</span>', '<span class="m">❓ Sin fecha</span>']],
      ['Turnos y Excel', '<b>📅 Turnos</b>: qué áreas tienen el calendario completo en el periodo (un recurso con más de 4 días libres seguidos queda incompleto) y qué recursos faltan. <b>⬇️ Excel</b>: hojas «Comunas», «Inicio de recursos» y «Turnos».', ['<span class="m osc">📅 Turnos</span>', '<span class="m">⬇️ Excel</span>']],
    ],
    tabla: [
      ['Indicador', 'Cómo se lee'],
      ['Copamiento por alerta', '% de copamiento de Normal, Amarilla y Roja (una tarjeta cada una) sobre la zona de incendios de las últimas 3 temporadas (mismo cálculo de Comunas Prioritarias).'],
      ['Prioridad', 'Nivel de la comuna en la matriz de Comunas Prioritarias (Alta, Media, Baja).'],
      ['⛔ Sin iniciar', 'La comuna no tiene entidades planificadas en ningún escenario.'],
      ['🟠 En curso', 'Tiene planificación, pero le falta al menos un escenario (se indica cuál).'],
      ['👤 Trabajaron', 'Usuarios que crearon entidades en los planes de la comuna (entre paréntesis, cuántas).'],
      ['Inicio de recursos', 'Fecha de inicio de operación de cada recurso (Gestión de Recursos). «Sin fecha» = falta cargarla.'],
    ],
    notas: [
      ['rol', '👥 Quién lo ve', ['Solo el Subgerente de Relacionamiento (todas las áreas de su subgerencia, que se asignan solas).', 'El Administrador lo prueba con <b>Ver el sistema como… › 📈 Modo Subgerente</b>.']],
      ['tip', '💡 Consejos', ['Empieza por las comunas ⛔ sin iniciar de prioridad Alta.', 'Revisa cada semana los recursos ⏳ que inician en los próximos 7 días y los ❓ sin fecha.']],
    ],
    tour: 'subgerente',
  },
  {
    k: 'editar', ico: '✏️', c: '#7C3AED', titulo: 'Editar y mejorar', sub: 'Forma, corte, datos y seguimiento',
    intro: 'Todo lo planificado se puede corregir y mejorar: forma de las rutas, cortes, ficha, ubicación del recurso, datos y contacto. Los cambios se guardan al instante y se reflejan en todo el sistema.',
    flujo: [['Clic en la entidad', 'abre su ventana'], ['Editar ficha o forma', 'vértices'], ['✂️ Cortar', 'una ruta en dos'], ['⏫ Propagar', 'a otras alertas'], ['🔄 Actualizar', 'datos al día']],
    pasos: [
      ['Edita la ficha o la forma', 'Durante la planificación, clic en una ruta, punto o área: <b>✏️ Editar</b> (institución, tipo, recurso, descripción), <b>🧩 Editar forma</b> (arrastra vértices; clic derecho borra uno), <b>⏫ Propagar</b> o <b>🗑️ Eliminar</b>.', ['<span class="m">✏️ Editar</span>', '<span class="m">🧩 Editar forma</span>', '<span class="m mo">⏫ Propagar</span>', '<span class="m r">🗑️ Eliminar</span>']],
      ['Corta una ruta', 'En la barra de edición, <b>✂️ Cortar ruta</b>: las rutas se resaltan y el ✂️ se pega a la más cercana (y al vértice). Clic para cortar: el tramo 1 conserva el recurso; el tramo 2 queda como ruta nueva.', ['<span class="m">✂️ Cortar ruta</span>']],
      ['Importa rutas', '<b>📥 Importar KML/KMZ</b> trae rutas de Google Earth u otros sistemas.', ['<span class="m">📥 Importar KML/KMZ</span>']],
      ['Mejora los datos de los recursos', '<b>Gestión de Recursos</b>: edita en la tabla (Jefe de Área en sus áreas), elige 🧩 columnas, filtra por empresa, tipo o sector; el Administrador administra 🏢 Empresas y elimina recursos sin ruta (doble confirmación).', ['<span class="m az">🗂️ Gestión de Recursos</span>', '<span class="m">🧩 Columnas</span>', '<span class="m">🏢 Empresas</span>']],
      ['Haz seguimiento', '<b>Prevención ▾ › Comunas Prioritarias</b> (📈 KPI de avance, ✅ comunas listas) y <b>Acciones de Riesgo</b>. El botón <b>🔄</b> trae los últimos datos de la base.', ['<span class="m">🛡️ Prevención ▾</span>', '<span class="m">📈 KPI de avance</span>', '<span class="m">🔄 Actualizar</span>']],
    ],
    notas: [
      ['ok', '✅ Buenas prácticas', ['Antes de cortar o eliminar, revisa si la ruta tiene recurso asociado (punto 🟢).', 'Tras editar una ruta en Normal, propágala si quieres que la Amarilla/Roja tengan lo nuevo.']],
      ['no', '⛔ Cuidado', ['Si eliminas algo por error: <b>↶ Deshacer</b> (20 s) o <b>🗑️ Recuperar</b> en la barra de edición (lo eliminado en la comuna, 30 días).', 'Unir/separar tramos no se sincroniza entre escenarios (solo los cambios de forma).']],
    ],
    tour: 'editar',
  },
  {
    k: 'agricultores', ico: '🌾', c: '#65A30D', titulo: 'Agricultores · Asociación Malleco', sub: 'Tablero, control diario, planificación y app de terreno',
    intro: 'Seguimiento del trabajo de prevención de la <b>Asociación de Agricultores Malleco</b> (Collipulli, Lumaco y Victoria): metas mensuales por actividad, lo realizado en terreno, la planificación del equipo y el registro de agricultores con su nivel de riesgo. Los gestores registran desde la <b>📱 App de terreno</b>, que funciona sin señal.',
    flujo: [['🌾 Agricultores', 'menú superior'], ['🗓️ Planificar', 'actividades del equipo'], ['📱 Registrar', 'en terreno, con o sin señal'], ['📅 Control diario', 'bitácora del día'], ['📊 Tablero', 'meta vs realizado'], ['🗺️ Mapa · ⬇️ Excel', 'dónde y cuánto']],
    pasos: [
      ['Abre el módulo', 'En el menú superior: <b>🌾 Agricultores ▾ › Gestión Asociación Malleco</b>. El perfil de la Asociación entra directo a este módulo.', ['<span class="m">🌾 Agricultores ▾</span>', '<span class="fl">›</span>', '<span class="m az">Gestión Asociación Malleco</span>']],
      ['📊 Tablero: metas del mes y de la temporada', 'Arriba, el cumplimiento del mes y de la temporada (oct–mar), agricultores por riesgo, personas capacitadas y operativos. La <b>Agenda de trabajo</b> compara meta vs realizado por actividad y mes: 🟢 ≥ 90 % · 🟡 60–89 % · 🔴 &lt; 60 %. Cada actividad cuenta como máximo su meta (tope 100 %).', ['<span class="m">📊 Tablero</span>', '<span class="m v">🟢 ≥ 90 %</span>', '<span class="m a">🟡 60–89 %</span>', '<span class="m r">🔴 &lt; 60 %</span>']],
      ['🗓️ Planifica las actividades', 'Vista semanal, quincenal o mensual. <b>➕ Planificar actividad</b> (o clic en un día) asigna actividad, responsable y comuna. Azul = planificada, verde = realizada, rojo = vencida sin registrar.', ['<span class="m">🗓️ Planificación</span>', '<span class="m">Semanal · Quincenal · Mensual</span>', '<span class="m osc">➕ Planificar actividad</span>']],
      ['📱 Registra en terreno', 'El gestor abre la <b>📱 App de terreno</b> con su mismo correo y clave, elige la actividad (visita a agricultor, capacitación, operativo carretero, reunión…), completa el formulario, agrega fotos y ubica el pincho en el mapa (se puede mover). <b>Sin señal</b> guarda todo en el teléfono y lo envía al volver la conexión. Desde el web, <b>➕ Registrar</b> usa los mismos formularios.', ['<span class="m">📱 App de terreno</span>', '<span class="m">➕ Registrar</span>', '<span class="m v">Funciona sin señal</span>']],
      ['📅 Revisa el control diario', 'La bitácora de cada día: quién registró qué, dónde, con fotos y si estaba planificado. Arriba aparecen las <b>planificadas sin registrar</b> para completarlas.', ['<span class="m">📅 Control diario</span>', '<span class="m">◀ Hoy ▶</span>', '<span class="m r">⏳ Planificadas sin registrar</span>']],
      ['👨‍🌾 Agricultores y 🗺️ Mapa', '<b>Agricultores</b>: ficha de cada uno (fundo, cultivos, nivel de riesgo, cortafuegos, fechas de cosecha y quema) con buscador y filtro por riesgo; avisa las quemas de los próximos 14 días. <b>Mapa</b>: las actividades por periodo (Hoy · 24 h · 48 h · 72 h · 7 días · Mes) sobre mapa sobrio o satélite.', ['<span class="m">👨‍🌾 Agricultores</span>', '<span class="m">🗺️ Mapa</span>', '<span class="m">Hoy · 24 h · 7 días · Mes</span>']],
      ['Descarga el respaldo', '<b>⬇️ Excel</b> descarga metas, registros, planificación y agricultores. <b>🔄</b> vuelve a leer los datos.', ['<span class="m">⬇️ Excel</span>', '<span class="m">🔄</span>']],
    ],
    notas: [
      ['tip', '💡 Instalar la app en el celular', ['Abre <b>copamientoterritorial.cl/app-agricultores/instalar.html</b> y sigue los pasos para Android (Chrome) o iPhone (Safari).', 'La app se actualiza sola; en «Yo» está <b>🔄 Buscar actualización</b>. Actualizar no borra lo pendiente por enviar.', 'Descarga el mapa de tu zona antes de salir a terreno para usarlo sin señal.']],
      ['rol', '👥 Quién puede', ['Asociación de Agricultores: registra, planifica e ingresa la meta de escuelas (A8).', 'Administrador: todo, incluidas las metas.', 'Jefes de Área, Subgerente y GRT del área Victoria: ven el tablero (solo consulta). El Administrador y los Jefes ven además el GPS real cuando el pincho se movió ≥ 30 m.']],
    ],
    tour: 'agricultores',
  },
];

function abrirAyuda_(guia) {
  let m = document.getElementById('ay-modal');
  if (!m) {
    m = document.createElement('div'); m.id = 'ay-modal'; m.className = 'ay-modal';
    m.innerHTML = '<div class="ay-caja"><div class="ay-cab"><span style="font-size:24px;">❓</span><h3>Centro de ayuda<small>Guías ilustradas y recorridos paso a paso por el sistema</small></h3>' +
      '<button data-ay="cerrar">✕ Cerrar</button></div><div class="ay-cuerpo"><div class="ay-nav" id="ay-nav"></div><div class="ay-contenido" id="ay-contenido"></div></div></div>';
    document.body.appendChild(m);
    m.addEventListener('click', e => {
      e.stopPropagation();
      if (e.target === m || e.target.closest('[data-ay="cerrar"]')) { m.classList.remove('show'); return; }
      const g = e.target.closest('[data-ay-guia]'); if (g) { renderAyuda_(g.dataset.ayGuia); return; }
      const t = e.target.closest('[data-ay-tour]'); if (t) { m.classList.remove('show'); iniciarRecorrido_(t.dataset.ayTour); }
    });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && m.classList.contains('show') && !document.getElementById('ay-globo')) m.classList.remove('show'); });
  }
  // renderAyuda_ solo deja abrir las guías del perfil (la Asociación ve únicamente la suya)
  renderAyuda_(guia || state.ayGuia || 'escenarios');
  m.classList.add('show');
}
/** Guías que ve cada perfil (21-10-2026): la de Agricultores SOLO el perfil Asociación de Agricultores, que a su vez solo ve esa. */
function guiasAyudaVisibles_() {
  const asoc = typeof esAsociacion_ === 'function' && esAsociacion_();
  return AY_GUIAS.filter(x => asoc ? x.k === 'agricultores' : x.k !== 'agricultores');
}
function renderAyuda_(k) {
  const lista = guiasAyudaVisibles_();
  const g = lista.find(x => x.k === k) || lista[0];
  state.ayGuia = g.k;
  document.getElementById('ay-nav').innerHTML = lista.map(x =>
    '<button data-ay-guia="' + x.k + '" class="' + (x.k === g.k ? 'on' : '') + '" style="--c:' + x.c + '"><span class="ico">' + x.ico + '</span><span><b>' + x.titulo + '</b><small>' + x.sub + '</small></span></button>').join('') +
    '<div style="margin-top:auto;font-size:11px;color:var(--text-tertiary);padding:8px 4px;line-height:1.45;">Cada guía tiene un <b>▶ Recorrido guiado</b> que te lleva por los botones reales del sistema. Puedes salir con <b>Esc</b>.</div>';
  const cont = document.getElementById('ay-contenido');
  cont.style.setProperty('--c', g.c);
  cont.innerHTML =
    '<div class="ay-hero"><span style="font-size:34px;">' + g.ico + '</span><div><h2>' + g.titulo + '</h2><p>' + g.intro + '</p></div>' +
      '<button class="ay-tour" data-ay-tour="' + g.tour + '">▶ Recorrido guiado</button></div>' +
    AY_SVG[g.k] +
    '<div class="ay-flujo">' + g.flujo.map(([t, s], i) => (i ? '<span class="f">→</span>' : '') + '<div class="p"><i>' + (i + 1) + '</i><b>' + t + '</b>' + s + '</div>').join('') + '</div>' +
    '<div class="ay-pasos">' + g.pasos.map(([t, d, ui], i) =>
      '<div class="ay-paso"><div class="n">' + (i + 1) + '</div><div><h4>' + t + '</h4><p>' + d + '</p>' + (ui && ui.length ? '<div class="ay-ui">' + ui.join('') + '</div>' : '') + '</div></div>').join('') + '</div>' +
    (g.tabla ? '<table class="ay-tabla"><thead><tr><th>' + g.tabla[0][0] + '</th><th>' + g.tabla[0][1] + '</th></tr></thead><tbody>' +
      g.tabla.slice(1).map(([a, b]) => '<tr><td><b>🔒 ' + a + '</b></td><td>' + b + '</td></tr>').join('') + '</tbody></table>' : '') +
    '<div class="ay-cajas">' + (g.notas || []).map(([cls, t, items]) => '<div class="ay-nota ' + cls + '"><b>' + t + '</b><ul>' + items.map(x => '<li>' + x + '</li>').join('') + '</ul></div>').join('') + '</div>';
  cont.scrollTop = 0;
}

/* ── Recorrido guiado: foco sobre el elemento real + globo con el paso ── */
function ayVisible_(el) { if (!el) return false; const r = el.getBoundingClientRect(); return r.width > 2 && r.height > 2 && getComputedStyle(el).visibility !== 'hidden'; }
function ayAbrirGrupo_(id) { const g = document.getElementById(id); if (g && !g.classList.contains('abierto')) alternarSubmenu_(g); }
function ayCerrarMenus_() { cerrarSubmenus_(); const p = document.getElementById('planificar-panel'); if (p) p.classList.remove('show'); }
function ayIrMapa_(modo) { try { if (state.vistaActual !== 'mapa' || state.modoMapa !== modo) mostrarVista_('mapa', modo); } catch (e) { /* sin permiso: el paso lo explica */ } }
function ayIrVista_(v) { try { if (state.vistaActual !== v) mostrarVista_(v); } catch (e) { /* sin permiso: el paso lo explica */ } }
function ayAbrirPlanificar_() { const b = document.getElementById('btn-planificar'), p = document.getElementById('planificar-panel'); if (b && p && ayVisible_(b)) p.classList.add('show'); }
const AY_TOURS = {
  escenarios: [
    { sel: '#grupo-mapa .vista-tab-grupo', t: 'Menú Gestión SIG', d: 'Aquí están el <b>Planificador de Alertas</b>, el <b>Modo Emergencia</b> y el informe de copamiento.', antes: () => { ayCerrarMenus_(); ayAbrirGrupo_('grupo-mapa'); } },
    { sel: '#sub-mapa-visor', t: 'Planificador de Alertas', d: 'Abre el mapa para planificar los escenarios Normal, Alerta Amarilla y Roja.', antes: () => ayAbrirGrupo_('grupo-mapa') },
    { sel: '#comuna-select', t: 'Elige la comuna', d: 'Los planes son por comuna. Elígela aquí (o usa el filtro 🧭 Área para ver todas las de tu área).', antes: () => { ayCerrarMenus_(); ayIrMapa_('planificador'); }, aviso: 'El selector aparece en el mapa cuando tienes más de una comuna asignada.' },
    { sel: '#btn-planificar', t: '✏️ Planificar', d: 'Con una comuna elegida, este botón abre la lista de escenarios que puedes planificar.', antes: () => ayIrMapa_('planificador'), aviso: 'Aparece cuando hay una comuna seleccionada y tu perfil puede planificar.' },
    { sel: '#plan-verde', t: '🟢 Escenario Normal', d: 'Condiciones normales: la base del copamiento. Aquí se asocia cada ruta CMPC con su recurso.', antes: ayAbrirPlanificar_, aviso: 'Abre ✏️ Planificar con una comuna elegida para ver los escenarios.' },
    { sel: '#plan-amarilla', t: '🟡 Alerta Amarilla', d: 'Refuerzo del copamiento para la alerta amarilla. El GRD planifica este escenario y la Alerta Roja.', antes: ayAbrirPlanificar_ },
    { sel: '#plan-roja', t: '🔴 Alerta Roja', d: 'Máximo copamiento. Al elegir un escenario se activa su capa y aparece la barra de edición: 📍 Punto · 📏 Línea · 📐 Área · 🧲 Imán · ✂️ Cortar · 📥 KML.', antes: ayAbrirPlanificar_ },
    { sel: '#plan-propagar-copamiento', t: '⏫ Propagar copamiento', d: 'Copia lo NUEVO de Normal → Amarilla → Roja, crea los planes que falten y no duplica lo que ya existe.', antes: ayAbrirPlanificar_ },
    { sel: '#btn-ayuda', t: '¡Listo!', d: 'Elige un escenario y dibuja tu primera ruta. Puedes volver a esta ayuda cuando quieras con el botón ❓.', antes: ayCerrarMenus_ },
  ],
  copamiento: [
    { sel: '#grupo-mapa .vista-tab-grupo', t: 'Menú Gestión SIG', d: 'El copamiento en terreno se gestiona desde el <b>Modo Emergencia</b>.', antes: () => { ayCerrarMenus_(); ayAbrirGrupo_('grupo-mapa'); } },
    { sel: '#sub-emergencia', t: '🚨 Modo Emergencia', d: 'Mapa del Periodo Crítico: copamiento real durante la alerta.', antes: () => ayAbrirGrupo_('grupo-mapa') },
    { sel: '#comuna-select', t: 'Elige la comuna', d: 'El Periodo Crítico es de la comuna seleccionada.', antes: () => { ayCerrarMenus_(); ayIrMapa_('emergencia'); }, aviso: 'El selector aparece cuando tienes más de una comuna asignada.' },
    { sel: '#btn-crear-periodo-mapa', t: '🔥 Crear Periodo Crítico', d: 'Asistente en 3 pasos: fechas → plantilla (Normal, Amarilla o Roja) → confirmar. Copia el plan completo de esa alerta.', antes: () => ayIrMapa_('emergencia'), aviso: 'Aparece en el Modo Emergencia con una comuna elegida y permiso para crear periodos.' },
    { sel: '#panel-emergencia', t: 'Recursos de la emergencia', d: 'Por institución, marca ✓ <b>Va</b> lo que realmente se dispone y pulsa <b>💾 Guardar selección</b>. Con <b>＋ Ver n no activadas</b> reactivas lo que llegue después.', antes: () => ayIrMapa_('emergencia'), aviso: 'El panel aparece cuando la comuna tiene un Periodo Crítico activo.' },
    { sel: '#btn-planificar', t: '✏️ › Editar Periodo Crítico', d: 'Agrega, mueve o edita recursos del periodo activo directamente en el mapa.', antes: () => ayIrMapa_('emergencia'), aviso: 'Aparece con una comuna elegida y permiso para editar el Periodo Crítico.' },
    { sel: '#grupo-mapa .vista-tab-grupo', t: '📄 Informe de copamiento', d: 'En <b>Gestión SIG ▾ › Generar informe</b>: copamiento por institución y sobre incendios (solo lo seleccionado).', antes: () => { ayCerrarMenus_(); ayAbrirGrupo_('grupo-mapa'); } },
  ],
  asignar: [
    { sel: '#grupo-mapa .vista-tab-grupo', t: 'La ruta se asocia en el escenario Normal', d: 'Gestión SIG ▾ › Planificador de Alertas › ✏️ › 🟢 Escenario Normal. Dibuja la línea o abre una existente › ✏️ Editar.', antes: () => { ayCerrarMenus_(); ayAbrirGrupo_('grupo-mapa'); } },
    { sel: '#btn-planificar', t: 'Recurso asociado', d: 'En la ficha de la ruta, el campo <b>Recurso asociado</b> lista los recursos CMPC del mismo tipo de las áreas de la comuna. 🔒 = ya tiene ruta (un recurso, una ruta).', antes: () => { ayCerrarMenus_(); ayIrMapa_('planificador'); }, aviso: 'Elige una comuna en el Planificador de Alertas para ver este botón.' },
    { sel: '#grupo-cmpc .vista-tab-grupo', t: 'Planificador CMPC', d: 'Aquí están Turnos, Planificador gráfico, Tablero y Gestión de Recursos.', antes: () => { ayCerrarMenus_(); ayAbrirGrupo_('grupo-cmpc'); } },
    { sel: '#tab-turnos', t: '📅 Turnos de Recursos', d: 'Marca los días de turno de cada recurso por mes. No se puede antes de su fecha de inicio de operación.', antes: () => ayAbrirGrupo_('grupo-cmpc'), aviso: 'Disponible para Administrador y Jefe de Área.' },
    { sel: '#tab-planificador', t: '🧭 Planificador gráfico', d: 'Ve los recursos del área en el mapa, su ruta asociada, y ubica o mueve su punto.', antes: () => ayAbrirGrupo_('grupo-cmpc') },
    { sel: '#tab-gestion', t: '🗂️ Gestión de Recursos', d: 'Datos y contacto de cada recurso. 🔒 Un recurso con ruta no se puede eliminar.', antes: () => ayAbrirGrupo_('grupo-cmpc'), aviso: 'Disponible para Administrador y Jefe de Área.' },
  ],
  cmpc: [
    { sel: '#grupo-cmpc .vista-tab-grupo', t: 'Menú Planificador CMPC', d: 'Turnos, Planificador gráfico, Tablero y Gestión de Recursos: la operación diaria de los recursos CMPC.', antes: () => { ayCerrarMenus_(); ayAbrirGrupo_('grupo-cmpc'); } },
    { sel: '#tab-gestion', t: '🗂️ Gestión de Recursos', d: 'Primero los datos: tipo, sector, empresa, turno, personas, fechas y contacto de cada recurso.', antes: () => ayAbrirGrupo_('grupo-cmpc'), aviso: 'Disponible para Administrador y Jefe de Área.' },
    { sel: '#gr-area', t: 'Elige el área', d: 'La tabla se filtra por subgerencia, área, sector, tipo y empresa. El Jefe de Área ve solo sus áreas.', antes: () => { ayCerrarMenus_(); ayIrVista_('gestion'); }, aviso: 'Gestión de Recursos es solo para Administrador y Jefe de Área.' },
    { sel: '#gr-tabla', t: 'Edita directo en la tabla', d: 'Los campos cambiados se ven en azul; los errores (RUT, mail, fechas) en rojo. Guarda con <b>💾 Guardar cambios</b>. El 🔒 ID no se modifica; 🗑️ elimina solo recursos sin ruta.', antes: () => ayIrVista_('gestion') },
    { sel: '#gr-columnas', t: '🧩 Columnas', d: 'Elige qué columnas ver (Todas · Contacto · Operación). Se recuerda en tu navegador.', antes: () => ayIrVista_('gestion') },
    { sel: '#tab-planificador', t: '🧭 Planificador gráfico', d: 'Los recursos del área en el mapa con su ruta asociada.', antes: () => { ayCerrarMenus_(); ayAbrirGrupo_('grupo-cmpc'); } },
    { sel: '#pl-area', t: 'Filtra el área', d: 'Subgerencia, área, sector y tipo. ✕ Limpiar filtros vuelve a ver todo.', antes: () => { ayCerrarMenus_(); ayIrVista_('planificador'); }, aviso: 'El Planificador gráfico depende de los permisos de tu perfil.' },
    { sel: '#pl-lista', t: 'Lista de recursos', d: 'Clic en un recurso para abrir su ficha: ruta asociada y <b>📍 Ubicar / mover</b> el punto en el mapa.', antes: () => ayIrVista_('planificador') },
    { sel: '#tab-turnos', t: '📅 Turnos de Recursos', d: 'El calendario de trabajo de cada recurso.', antes: () => { ayCerrarMenus_(); ayAbrirGrupo_('grupo-cmpc'); }, aviso: 'Disponible para Administrador y Jefe de Área.' },
    { sel: '#turnos-area-select', t: 'Área y mes', d: 'Elige el área; la vista Mes viene por defecto. Filtra por tipo y por clave radial.', antes: () => { ayCerrarMenus_(); ayIrVista_('turnos'); }, aviso: 'Turnos es solo para Administrador y Jefe de Área.' },
    { sel: '#turnos-grid', t: 'Marca los turnos', d: 'Clic o arrastra sobre los días: verde <b>T</b> = turno, amarillo <b>L</b> = libre. La columna Avance muestra lo trabajado del periodo.', antes: () => ayIrVista_('turnos') },
    { sel: '#turnos-pdf-pano', t: 'PDF de turnos', d: 'PDF mensual por recurso y PDF panorama con el resumen diario (operan, en turno, % disponible).', antes: () => ayIrVista_('turnos') },
    { sel: '#turnos-modo-seg', t: '📊 Seguimiento', d: 'Qué recursos y áreas faltan por actualizar el calendario.', antes: () => ayIrVista_('turnos') },
    { sel: '#tab-tablero', t: '📊 Tablero de Recursos', d: 'Resumen por tipo y área, activación por quincena y descarga a Excel.', antes: () => { ayCerrarMenus_(); ayAbrirGrupo_('grupo-cmpc'); } },
    { sel: '#tb-descargar', t: '⬇️ Descargar Excel', d: 'Toda la información de los recursos filtrados en un Excel.', antes: () => { ayCerrarMenus_(); ayIrVista_('tablero'); }, aviso: 'El Tablero depende de los permisos de tu perfil.' },
    { sel: '#btn-ayuda', t: '¡Listo!', d: 'Ya conoces el Planificador CMPC. Vuelve a esta ayuda cuando quieras con ❓.', antes: ayCerrarMenus_ },
  ],
  subgerente: [
    { sel: '#tab-seguimiento', t: '📈 Seguimiento', d: 'El tablero exclusivo del Subgerente. Es su vista de inicio.', antes: () => { ayCerrarMenus_(); }, aviso: 'Solo lo ve el Subgerente (el Administrador lo prueba con «Ver como… › 📈 Modo Subgerente»).' },
    { sel: '#sg-vistas', t: 'Dos vistas simples', d: '<b>🏘️ Comunas y copamiento</b> y <b>🌲 Inicio de recursos</b>, por separado.', antes: () => { ayIrVista_('seguimiento'); state.sg.vista = 'comunas'; if (state.sg.datos) renderSeguimiento_(); } },
    { sel: '#sg-cuerpo .sg-chips', t: 'Elige un área', d: 'Muestra todas las comunas del área, cada una con su prioridad de Comunas Prioritarias.', antes: () => ayIrVista_('seguimiento'), aviso: 'Aparece cuando el tablero termina de calcular.' },
    { sel: '.sg-com', t: 'Avance de una comuna', d: 'Tres tarjetas con el <b>nivel de copamiento</b> de Normal, Amarilla y Roja. A la derecha: ⛔ sin iniciar / 🟠 en curso / ✅ 3 escenarios y los usuarios que han trabajado.', antes: () => ayIrVista_('seguimiento'), aviso: 'Aparece cuando el tablero termina de calcular.' },
    { sel: '[data-sg-vista="recursos"]', t: '🌲 Inicio de recursos', d: 'Fechas de inicio de operación por área: línea de tiempo, inicios por semana y filtros rápidos (ya iniciados, próximos 7 / 30 días, sin fecha).', antes: () => ayIrVista_('seguimiento') },
    { sel: '[data-sg-vista="turnos"]', t: '📅 Turnos', d: 'Qué áreas tienen el calendario de turnos completo. Un recurso queda incompleto si tiene más de 4 días libres seguidos en el periodo.', antes: () => ayIrVista_('seguimiento') },
    { sel: '#sg-excel', t: '⬇️ Excel', d: 'Descarga comunas, inicio de recursos y, si abriste la vista Turnos, la completitud del calendario por recurso.', antes: () => ayIrVista_('seguimiento') },
    { sel: '#grupo-mapa .vista-tab-grupo', t: 'Actúa en tus áreas', d: 'Con permisos de Jefe de Área: planifica alertas (Gestión SIG), revisa recursos y turnos (Planificador CMPC) y da seguimiento en Prevención.', antes: () => { ayCerrarMenus_(); ayAbrirGrupo_('grupo-mapa'); } },
    { sel: '#user-chip', t: 'Probar la vista (Administrador)', d: 'El Administrador puede ver el sistema como un Subgerente: menú de usuario › <b>Ver el sistema como… › 📈 Modo Subgerente</b>.', antes: ayCerrarMenus_ },
    { sel: '#btn-ayuda', t: '¡Listo!', d: 'Vuelve a esta ayuda cuando quieras con ❓.', antes: ayCerrarMenus_ },
  ],
  editar: [
    { sel: '#btn-planificar', t: 'Editar lo planificado', d: 'Entra a planificar un escenario y haz clic en una ruta, punto o área: ✏️ Editar · 🧩 Editar forma · ⏫ Propagar · 🗑️ Eliminar.', antes: () => { ayCerrarMenus_(); ayIrMapa_('planificador'); }, aviso: 'Elige una comuna en el Planificador de Alertas para ver este botón.' },
    { sel: '#btn-planificar', t: '✂️ Cortar ruta', d: 'Con un escenario abierto, la barra de edición tiene <b>✂️ Cortar ruta</b>: el ✂️ se pega a la ruta y al vértice más cercano; clic para cortar.', antes: () => ayIrMapa_('planificador') },
    { sel: '#grupo-cmpc .vista-tab-grupo', t: 'Mejora los datos', d: 'Planificador CMPC ▾ › <b>Gestión de Recursos</b>: edición en la tabla, columnas, filtros por empresa/tipo/sector y 🏢 Empresas.', antes: () => { ayCerrarMenus_(); ayAbrirGrupo_('grupo-cmpc'); } },
    { sel: '#grupo-prevencion .vista-tab-grupo', t: 'Seguimiento', d: 'Prevención ▾ › <b>Comunas Prioritarias</b> (📈 KPI de avance, ✅ listas) y <b>Acciones de Riesgo</b>.', antes: () => { ayCerrarMenus_(); ayAbrirGrupo_('grupo-prevencion'); }, aviso: 'El menú Prevención depende de tu perfil.' },
    { sel: '#btn-actualizar-datos', t: '🔄 Actualizar datos', d: 'Trae los últimos cambios de la base de datos (de todos los usuarios).', antes: ayCerrarMenus_ },
    { sel: '#btn-ayuda', t: '¡Listo!', d: 'Vuelve a esta ayuda cuando quieras con ❓.', antes: ayCerrarMenus_ },
  ],
  agricultores: [
    { sel: '#grupo-agricultores .vista-tab-grupo', t: 'Menú 🌾 Agricultores', d: 'El seguimiento de la Asociación de Agricultores Malleco.', antes: () => { ayCerrarMenus_(); ayAbrirGrupo_('grupo-agricultores'); }, aviso: 'Lo ven el Administrador, la Asociación y los Jefes, Subgerente y GRT del área Victoria.' },
    { sel: '#tab-agricultores', t: 'Gestión Asociación Malleco', d: 'Abre el tablero, el control diario, la planificación, los agricultores y el mapa.', antes: () => ayAbrirGrupo_('grupo-agricultores'), aviso: 'Tu perfil no tiene acceso a este módulo.' },
    { sel: '#ag-vistas [data-ag-tab="tablero"]', t: '📊 Tablero', d: 'Cumplimiento del mes y de la temporada, y la agenda de trabajo: meta vs realizado por actividad (🟢 ≥ 90 % · 🟡 60–89 % · 🔴 &lt; 60 %).', antes: () => { ayCerrarMenus_(); ayIrVista_('agricultores'); ayTabAgr_('tablero'); } },
    { sel: '#ag-vistas [data-ag-tab="plan"]', t: '🗓️ Planificación', d: 'Planifica las actividades del equipo por semana, quincena o mes con <b>➕ Planificar actividad</b> (o clic en un día).', antes: () => { ayIrVista_('agricultores'); ayTabAgr_('plan'); } },
    { sel: '#ag-app', t: '📱 App de terreno', d: 'El gestor registra en terreno con su mismo correo y clave: formulario, fotos y ubicación. <b>Funciona sin señal</b> y envía todo al volver la conexión.', antes: () => ayIrVista_('agricultores') },
    { sel: '#ag-registrar', t: '➕ Registrar desde el web', d: 'Los mismos formularios de la app, para registrar una actividad desde el computador.', antes: () => ayIrVista_('agricultores'), aviso: 'Lo ven quienes pueden registrar: la Asociación y el Administrador.' },
    { sel: '#ag-vistas [data-ag-tab="diario"]', t: '📅 Control diario', d: 'La bitácora del día: quién registró qué, dónde y con fotos, y las actividades planificadas que faltan por registrar.', antes: () => { ayIrVista_('agricultores'); ayTabAgr_('diario'); } },
    { sel: '#ag-vistas [data-ag-tab="agricultores"]', t: '👨‍🌾 Agricultores', d: 'Ficha de cada agricultor con su nivel de riesgo, fundo, cultivos y fechas de cosecha y quema (avisa las quemas de los próximos 14 días).', antes: () => { ayIrVista_('agricultores'); ayTabAgr_('agricultores'); } },
    { sel: '#ag-vistas [data-ag-tab="mapa"]', t: '🗺️ Mapa', d: 'Las actividades en el mapa por periodo (Hoy · 24 h · 48 h · 72 h · 7 días · Mes), sobre mapa sobrio o satélite.', antes: () => { ayIrVista_('agricultores'); ayTabAgr_('mapa'); } },
    { sel: '#ag-excel', t: '⬇️ Excel', d: 'Descarga metas, registros, planificación y agricultores.', antes: () => ayIrVista_('agricultores') },
    { sel: '#btn-ayuda', t: '¡Listo!', d: 'Para instalar la app en el celular: <b>copamientoterritorial.cl/app-agricultores/instalar.html</b>. Vuelve a esta ayuda cuando quieras con ❓.', antes: ayCerrarMenus_ },
  ],
};
/** Cambia la pestaña del módulo Agricultores (para el recorrido guiado). */
function ayTabAgr_(tab) {
  const b = document.querySelector('#ag-vistas [data-ag-tab="' + tab + '"]');
  if (b && !b.classList.contains('on')) b.click();
}
let ayRec_ = null;
function iniciarRecorrido_(k) {
  const pasos = AY_TOURS[k]; if (!pasos) return;
  const g = AY_GUIAS.find(x => x.tour === k) || AY_GUIAS[0];
  terminarRecorrido_();
  ayRec_ = { k, pasos, i: 0, g };
  const foco = document.createElement('div'); foco.id = 'ay-foco';
  const globo = document.createElement('div'); globo.id = 'ay-globo'; globo.style.setProperty('--c', g.c);
  document.body.appendChild(foco); document.body.appendChild(globo);
  globo.addEventListener('click', e => {
    e.stopPropagation();   // no cerrar los menús abiertos por el recorrido
    const b = e.target.closest('[data-ay-g]'); if (!b) return;
    if (b.dataset.ayG === 'sig') { if (ayRec_.i < ayRec_.pasos.length - 1) mostrarPasoRecorrido_(ayRec_.i + 1); else { terminarRecorrido_(); mostrarToast_('✅ Recorrido terminado. Vuelve cuando quieras con ❓.'); } }
    else if (b.dataset.ayG === 'ant') mostrarPasoRecorrido_(Math.max(0, ayRec_.i - 1));
    else if (b.dataset.ayG === 'guia') { terminarRecorrido_(); abrirAyuda_(g.k); }
    else terminarRecorrido_();
  });
  ayRec_.onKey = e => { if (!ayRec_) return; if (e.key === 'Escape') terminarRecorrido_(); else if (e.key === 'ArrowRight') globo.querySelector('[data-ay-g="sig"]').click(); else if (e.key === 'ArrowLeft') mostrarPasoRecorrido_(Math.max(0, ayRec_.i - 1)); };
  // Al redimensionar, el sistema cierra los submenús: se vuelve a preparar el paso y se reubica el foco
  ayRec_.onResize = () => {
    if (!ayRec_) return;
    clearTimeout(ayRec_.tRes);
    ayRec_.tRes = setTimeout(() => { if (!ayRec_) return; const p = ayRec_.pasos[ayRec_.i]; try { if (p.antes) p.antes(); } catch (e) { /* nada */ } setTimeout(() => { if (ayRec_) posicionarRecorrido_(); }, 220); }, 150);
  };
  document.addEventListener('keydown', ayRec_.onKey);
  window.addEventListener('resize', ayRec_.onResize);
  mostrarPasoRecorrido_(0);
}
function mostrarPasoRecorrido_(i) {
  if (!ayRec_) return;
  ayRec_.i = i;
  const p = ayRec_.pasos[i];
  try { if (p.antes) p.antes(); } catch (e) { /* el paso igual se explica */ }
  // Espera a que la vista / menú se dibuje antes de ubicar el foco
  setTimeout(() => { if (ayRec_ && ayRec_.i === i) posicionarRecorrido_(); }, 280);
}
function posicionarRecorrido_() {
  const { pasos, i, g } = ayRec_, p = pasos[i];
  const foco = document.getElementById('ay-foco'), globo = document.getElementById('ay-globo');
  const el = document.querySelector(p.sel), vis = ayVisible_(el);
  globo.innerHTML = '<div class="g-top"><span class="g-guia">' + g.ico + ' ' + g.titulo + '</span><span class="g-n">' + (i + 1) + ' / ' + pasos.length + '</span></div>' +
    '<h4>' + p.t + '</h4><p>' + p.d + '</p>' +
    (!vis ? '<div class="g-aviso">ℹ️ ' + (p.aviso || 'Este elemento no está visible en este momento.') + '</div>' : '') +
    '<div class="g-barra"><i style="width:' + Math.round((i + 1) / pasos.length * 100) + '%"></i></div>' +
    '<div class="g-pie"><button class="g-salir" data-ay-g="salir">Salir</button><button data-ay-g="guia" title="Volver a la guía ilustrada">📖 Guía</button>' +
    (i ? '<button data-ay-g="ant">← Anterior</button>' : '') +
    '<button class="g-sig" data-ay-g="sig">' + (i === pasos.length - 1 ? 'Terminar ✓' : 'Siguiente →') + '</button></div>';
  const W = window.innerWidth, H = window.innerHeight, gw = globo.offsetWidth, gh = globo.offsetHeight;
  if (!vis) {
    foco.classList.add('sin'); foco.style.left = (W / 2) + 'px'; foco.style.top = (H / 2) + 'px';
    globo.style.left = Math.round((W - gw) / 2) + 'px'; globo.style.top = Math.round((H - gh) / 2) + 'px';
    return;
  }
  foco.classList.remove('sin');
  const r = el.getBoundingClientRect(), pad = 6;
  foco.style.left = (r.left - pad) + 'px'; foco.style.top = (r.top - pad) + 'px';
  foco.style.width = (r.width + pad * 2) + 'px'; foco.style.height = (r.height + pad * 2) + 'px';
  // Dentro de un menú desplegable: el globo va al costado del menú (para no tapar las otras opciones)
  const menu = el.closest('.vista-submenu, .planificar-panel');
  if (menu) {
    const mr = menu.getBoundingClientRect();
    const izq = mr.right + 14 + gw <= W - 8 ? mr.right + 14 : Math.max(8, mr.left - gw - 14);
    globo.style.left = Math.round(izq) + 'px';
    globo.style.top = Math.round(Math.min(Math.max(12, r.top - 10), H - gh - 12)) + 'px';
    return;
  }
  // Globo: debajo del elemento si cabe; si no, arriba; si no, al costado
  let top = r.bottom + 14, left = Math.min(Math.max(12, r.left + r.width / 2 - gw / 2), W - gw - 12);
  if (top + gh > H - 12) top = r.top - gh - 14;
  if (top < 12) { top = Math.min(Math.max(12, r.top), H - gh - 12); left = r.right + 14 + gw < W ? r.right + 14 : Math.max(12, r.left - gw - 14); }
  globo.style.left = Math.round(left) + 'px'; globo.style.top = Math.round(top) + 'px';
}
function terminarRecorrido_() {
  if (!ayRec_) { ['ay-foco', 'ay-globo'].forEach(id => { const x = document.getElementById(id); if (x) x.remove(); }); return; }
  document.removeEventListener('keydown', ayRec_.onKey);
  window.removeEventListener('resize', ayRec_.onResize);
  ayRec_ = null;
  ['ay-foco', 'ay-globo'].forEach(id => { const x = document.getElementById(id); if (x) x.remove(); });
  ayCerrarMenus_();
}

/* ==================== ACCIONES DE RIESGO (Prevención ▾, 14-10-2026, SQL 101) ====================
 * Reportes de riesgo de incendio que levantan los conductores y registra la Central de Transporte CMPC
 * en /gestioncentral. El Administrador ve todas las áreas (tablero general); el Jefe de Área ve y
 * gestiona los de SUS áreas (RLS de reportes_riesgo + RPC gestionar_reporte_riesgo). */
const RG_ESTADOS = {
  'Nuevo':      { c: '#C62828', c2: '#FEE2E2', ico: '🆕' },
  'Notificado': { c: '#B45309', c2: '#FEF3C7', ico: '📲' },
  'En gestión': { c: '#1D4ED8', c2: '#DBEAFE', ico: '🛠️' },
  'Cerrado':    { c: '#15803D', c2: '#DCFCE7', ico: '✅' },
  'Descartado': { c: '#64748B', c2: '#F1F5F9', ico: '✖️' },
};
const RG_TIPOS_ICO = { 'Quema de desechos': '🔥', 'Personas fumando en pastizales': '🚬', 'Herramientas con chispas': '🛠️', 'Tendido eléctrico con chispas': '⚡', 'Fuego en la ruta': '🚨', 'Otro riesgo': '⚠️' };
state.rg = { reportes: [], listeners: false, canal: null, sinSql101: false };

function puedeAccionesRiesgo_() {
  const p = state.perfil && state.perfil.perfil;
  return p === 'Administrador' || esJefeAreaPerfil_(p);
}
function rgPendiente_(r) { return r.estado === 'Nuevo' || r.estado === 'Notificado'; }
function rgFechaHora_(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: '2-digit' }) + ' ' + d.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
}
async function abrirAccionesRiesgo_() {
  if (!state.rg.listeners) {
    state.rg.listeners = true;
    const re = () => renderAccionesRiesgo_();
    document.getElementById('rg-periodo').addEventListener('change', () => cargarAccionesRiesgo_());
    ['rg-area', 'rg-estado', 'rg-tipo'].forEach(id => document.getElementById(id).addEventListener('change', re));
    let t = null;
    document.getElementById('rg-buscar').addEventListener('input', () => { clearTimeout(t); t = setTimeout(re, 200); });
    document.getElementById('rg-descargar').addEventListener('click', descargarAccionesRiesgo_);
    document.getElementById('rg-areas').addEventListener('click', e => {
      const c = e.target.closest('[data-rg-area]'); if (!c) return;
      const sel = document.getElementById('rg-area');
      sel.value = sel.value === c.dataset.rgArea ? '' : c.dataset.rgArea;
      renderAccionesRiesgo_();
    });
    document.getElementById('rg-tabla').addEventListener('change', e => {
      const s = e.target.closest('[data-rg-estado]'); if (s) cambiarEstadoRiesgo_(s.dataset.rgEstado, s.value, s);
    });
    document.getElementById('rg-tabla').addEventListener('click', e => {
      const b = e.target.closest('[data-rg-obs]'); if (b) cambiarEstadoRiesgo_(b.dataset.rgObs, null, null);
    });
  }
  document.getElementById('rg-central').style.display = esAdminOJefe_() ? '' : 'none';
  await cargarAccionesRiesgo_();
  // Tiempo real: un reporte nuevo de la central aparece solo
  if (!state.rg.canal && !state.rg.sinSql101) {
    try {
      state.rg.canal = supabaseClient.channel('rg-reportes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'reportes_riesgo' }, () => {
          clearTimeout(state.rg._t);
          state.rg._t = setTimeout(() => { if (state.vistaActual === 'riesgo') cargarAccionesRiesgo_(); }, 500);
        }).subscribe();
    } catch (e) { /* sin tiempo real: se refresca al abrir */ }
  }
}
async function cargarAccionesRiesgo_() {
  const dias = Number(document.getElementById('rg-periodo').value || 30);
  const desde = new Date(Date.now() - dias * 864e5).toISOString();
  document.getElementById('rg-estado-txt').textContent = 'Cargando…';
  const filas = [];
  for (let d = 0; ; d += 1000) {
    const { data, error } = await supabaseClient.from('reportes_riesgo').select('*').gte('creado_en', desde)
      .order('creado_en', { ascending: false }).range(d, d + 999);
    if (error) {
      state.rg.sinSql101 = /reportes_riesgo/.test(error.message);
      const av = document.getElementById('rg-aviso');
      av.style.display = '';
      av.textContent = state.rg.sinSql101 ? '⚠️ Falta ejecutar en Supabase el SQL 101 (sql/pendientes/101_gestion_central_riesgo.sql).' : '⚠️ ' + error.message;
      document.getElementById('rg-tabla').innerHTML = '';
      document.getElementById('rg-estado-txt').textContent = 'Error';
      return;
    }
    filas.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  document.getElementById('rg-aviso').style.display = 'none';
  state.rg.reportes = filas;
  // Filtros con lo que hay
  const areas = [...new Set(filas.map(r => r.area).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
  const selA = document.getElementById('rg-area'), vA = selA.value;
  selA.innerHTML = '<option value="">Todas las áreas (' + areas.length + ')</option>' + areas.map(a => '<option value="' + escapeHtml_(a) + '">' + escapeHtml_(aTitulo_(a)) + '</option>').join('') +
    (filas.some(r => !r.area) ? '<option value="__sin__">⚠️ Sin área</option>' : '');
  selA.value = [...selA.options].some(o => o.value === vA) ? vA : '';
  const selE = document.getElementById('rg-estado'), vE = selE.value;
  selE.innerHTML = '<option value="">Todos los estados</option><option value="__pend__">⏳ Pendientes (Nuevo + Notificado)</option>' +
    Object.keys(RG_ESTADOS).map(k => '<option value="' + k + '">' + RG_ESTADOS[k].ico + ' ' + k + '</option>').join('');
  selE.value = vE;
  const tipos = [...new Set(filas.map(r => r.tipo_riesgo).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
  const selT = document.getElementById('rg-tipo'), vT = selT.value;
  selT.innerHTML = '<option value="">Todos los tipos</option>' + tipos.map(t => '<option value="' + escapeHtml_(t) + '">' + (RG_TIPOS_ICO[t] || '⚠️') + ' ' + escapeHtml_(t) + '</option>').join('');
  selT.value = tipos.includes(vT) ? vT : '';
  document.getElementById('rg-estado-txt').textContent = 'Actualizado ' + new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
  renderAccionesRiesgo_();
}
function rgFiltrados_() {
  const fA = document.getElementById('rg-area').value, fE = document.getElementById('rg-estado').value, fT = document.getElementById('rg-tipo').value;
  const q = normalizarBusqueda_(document.getElementById('rg-buscar').value || '');
  return state.rg.reportes.filter(r => {
    if (fA === '__sin__' ? !!r.area : (fA && r.area !== fA)) return false;
    if (fE === '__pend__' ? !rgPendiente_(r) : (fE && r.estado !== fE)) return false;
    if (fT && r.tipo_riesgo !== fT) return false;
    if (q && !normalizarBusqueda_(['#' + r.folio, r.folio, r.comuna, r.sector, r.ruta, r.empresa_transporte, r.patente, r.tipo_riesgo, r.descripcion].join(' ')).includes(q)) return false;
    return true;
  });
}
function renderAccionesRiesgo_() {
  const lista = rgFiltrados_(), todos = state.rg.reportes;
  const cuenta = k => lista.filter(r => r.estado === k).length;
  const cerr = lista.filter(r => r.estado === 'Cerrado' && r.cerrado_en);
  const horas = cerr.length ? cerr.reduce((s, r) => s + (new Date(r.cerrado_en) - new Date(r.creado_en)) / 36e5, 0) / cerr.length : null;
  const kpi = (n, t, c) => '<div class="gr-kpi" style="--c:' + c + '"><b>' + n + '</b>' + t + '</div>';
  document.getElementById('rg-kpis').innerHTML =
    kpi(lista.length, 'reportes' + (lista.length !== todos.length ? ' (de ' + todos.length + ')' : ''), '#0F172A') +
    kpi(cuenta('Nuevo'), '🆕 nuevos', RG_ESTADOS.Nuevo.c) +
    kpi(cuenta('Notificado'), '📲 notificados al área', RG_ESTADOS.Notificado.c) +
    kpi(cuenta('En gestión'), '🛠️ en gestión', RG_ESTADOS['En gestión'].c) +
    kpi(cuenta('Cerrado'), '✅ cerrados', RG_ESTADOS.Cerrado.c) +
    kpi(lista.length ? Math.round((cuenta('Cerrado') + cuenta('Descartado')) / lista.length * 100) + ' %' : '—', 'resueltos', '#15803D') +
    kpi(horas == null ? '—' : (horas < 48 ? horas.toFixed(1) + ' h' : (horas / 24).toFixed(1) + ' d'), '⏱️ tiempo medio de cierre', '#7C3AED');
  // Tablero por área (estado de cada área en el periodo; clic = filtrar)
  const fA = document.getElementById('rg-area').value;
  const porArea = {};
  todos.forEach(r => { const k = r.area || '__sin__'; (porArea[k] = porArea[k] || []).push(r); });
  const claves = Object.keys(porArea).sort((a, b) => porArea[b].filter(rgPendiente_).length - porArea[a].filter(rgPendiente_).length || a.localeCompare(b, 'es'));
  document.getElementById('rg-areas').innerHTML = claves.length > 1 || (claves.length === 1 && state.perfil.perfil === 'Administrador')
    ? '<div class="rg-areas">' + claves.map(k => {
        const rs = porArea[k], n = rs.length, pend = rs.filter(rgPendiente_).length;
        const barra = Object.keys(RG_ESTADOS).map(e => { const c = rs.filter(r => r.estado === e).length; return c ? '<span style="width:' + (c / n * 100) + '%;background:' + RG_ESTADOS[e].c + '" title="' + e + ': ' + c + '"></span>' : ''; }).join('');
        return '<div class="rg-area' + (fA === k ? ' on' : '') + '" data-rg-area="' + escapeHtml_(k) + '"><b>' + (k === '__sin__' ? '⚠️ Sin área' : escapeHtml_(aTitulo_(k))) + '</b>' +
          n + ' reporte(s) · <span style="color:' + (pend ? '#C62828' : '#15803D') + ';font-weight:700;">' + (pend ? pend + ' pendiente(s)' : 'al día') + '</span>' +
          '<div class="rg-barra">' + barra + '</div></div>';
      }).join('') + '</div>'
    : '';
  const cont = document.getElementById('rg-tabla');
  if (!lista.length) { cont.innerHTML = '<div class="tb-vacio">' + (todos.length ? 'No hay reportes con estos filtros.' : 'Aún no hay reportes de riesgo en este periodo. La Central de Transporte CMPC los registra en /gestioncentral.') + '</div>'; return; }
  cont.innerHTML = '<table class="gr-tabla"><thead><tr><th>Folio</th><th>Fecha aviso</th><th>Riesgo</th><th>Ubicación</th><th>Área</th><th>Reporta</th><th>Estado</th><th>Gestión</th></tr></thead><tbody>' +
    lista.map(r => {
      const e = RG_ESTADOS[r.estado] || RG_ESTADOS.Nuevo;
      const mapsUrl = 'https://maps.google.com/?q=' + Number(r.lat).toFixed(6) + ',' + Number(r.lng).toFixed(6);
      return '<tr>' +
        '<td><b>#' + r.folio + '</b></td>' +
        '<td style="white-space:nowrap;">' + rgFechaHora_(r.fecha_evento) + '</td>' +
        '<td>' + (RG_TIPOS_ICO[r.tipo_riesgo] || '⚠️') + ' ' + escapeHtml_(r.tipo_riesgo) + (r.descripcion ? '<div class="rg-obs">' + escapeHtml_(r.descripcion) + '</div>' : '') + '</td>' +
        '<td>' + escapeHtml_(aTitulo_(r.comuna || '—')) + (r.sector ? ' · ' + escapeHtml_(r.sector) : '') +
          (r.ruta ? '<br><small>Ruta ' + escapeHtml_(r.ruta) + (r.km != null ? ' · km ' + r.km : '') + '</small>' : '') +
          '<br><a href="' + mapsUrl + '" target="_blank" rel="noopener" style="font-size:11px;">📍 Ver en mapa</a></td>' +
        '<td>' + (r.area ? escapeHtml_(aTitulo_(r.area)) : '<b style="color:#B45309;">Sin área</b>') + '</td>' +
        '<td>' + escapeHtml_(r.empresa_transporte || '—') + (r.patente ? '<br><small>' + escapeHtml_(r.patente) + '</small>' : '') + '</td>' +
        '<td><span class="rg-chip" style="background:' + e.c2 + ';color:' + e.c + ';">' + e.ico + ' ' + escapeHtml_(r.estado) + '</span>' +
          '<div style="margin-top:4px;"><select class="rg-sel" data-rg-estado="' + escapeHtml_(r.id) + '" title="Cambiar estado">' +
          Object.keys(RG_ESTADOS).map(k => '<option' + (k === r.estado ? ' selected' : '') + '>' + k + '</option>').join('') + '</select></div></td>' +
        '<td>' + (r.gestion_obs ? '<div class="rg-obs">' + escapeHtml_(r.gestion_obs) + '</div>' : '<small style="color:var(--text-tertiary);">Sin observaciones</small>') +
          '<div><button class="gr-del" style="width:auto;padding:0 8px;margin-top:4px;" data-rg-obs="' + escapeHtml_(r.id) + '" title="Agregar una observación de la gestión">✍️ Observación</button></div></td>' +
        '</tr>';
    }).join('') + '</tbody></table>';
}
async function cambiarEstadoRiesgo_(id, estado, sel) {
  const r = state.rg.reportes.find(x => x.id === id); if (!r) return;
  const nuevo = estado || r.estado;
  const obs = prompt((estado ? 'Cambiar el reporte #' + r.folio + ' a «' + nuevo + '».' : 'Observación para el reporte #' + r.folio + '.') +
    '\n\nDescribe la gestión realizada (quedará registrada con tu nombre y la hora):', '');
  if (obs === null) { if (sel) sel.value = r.estado; return; }
  if (!estado && !obs.trim()) return;
  if ((nuevo === 'Cerrado' || nuevo === 'Descartado') && !obs.trim()) {
    mostrarToast_('Para cerrar o descartar, describe la gestión realizada.'); if (sel) sel.value = r.estado; return;
  }
  const { error } = await supabaseClient.rpc('gestionar_reporte_riesgo', { p_id: id, p_estado: nuevo, p_obs: obs.trim() || null });
  if (error) { mostrarToast_('No se pudo guardar: ' + error.message); if (sel) sel.value = r.estado; return; }
  mostrarToast_('✅ Reporte #' + r.folio + ' · ' + nuevo + '.');
  await cargarAccionesRiesgo_();
}
async function descargarAccionesRiesgo_() {
  const lista = rgFiltrados_();
  if (!lista.length) { mostrarToast_('No hay reportes para descargar con estos filtros.'); return; }
  try {
    mostrarToast_('Generando Excel…');
    const XLSX = await tbCargarSheetJs_();
    const filas = lista.map(r => ({
      'Folio': r.folio, 'Fecha aviso': rgFechaHora_(r.fecha_evento), 'Registrado': rgFechaHora_(r.creado_en),
      'Tipo de riesgo': r.tipo_riesgo, 'Detalle': r.descripcion || '', 'Comuna': aTitulo_(r.comuna || ''), 'Sector': r.sector || '',
      'Ruta': r.ruta || '', 'Km': r.km != null ? Number(r.km) : '', 'Área': r.area ? aTitulo_(r.area) : 'Sin área',
      'Empresa de transporte': r.empresa_transporte || '', 'Patente': r.patente || '', 'Conductor': r.conductor || '',
      'Estado': r.estado, 'Notificado': rgFechaHora_(r.notificado_en), 'Cerrado': r.cerrado_en ? rgFechaHora_(r.cerrado_en) : '',
      'Gestión': r.gestion_obs || '', 'Latitud': Number(r.lat), 'Longitud': Number(r.lng),
    }));
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(filas);
    ws['!cols'] = Object.keys(filas[0]).map(k => ({ wch: ['Detalle', 'Gestión'].includes(k) ? 50 : 16 }));
    XLSX.utils.book_append_sheet(wb, ws, 'Acciones de riesgo');
    XLSX.writeFile(wb, 'acciones_riesgo_' + tbHoyISO_() + '.xlsx');
    mostrarToast_('✅ Descargado: ' + filas.length + ' reportes.');
  } catch (e) { mostrarToast_('No se pudo generar el Excel: ' + (e.message || e)); }
}

