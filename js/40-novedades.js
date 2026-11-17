/* ==================== 🆕 NOVEDADES DEL SISTEMA (16-11-2026) ====================
 * Al ingresar, cada usuario ve UNA VEZ las novedades nuevas que le aplican a su perfil (claves de ayPerfil_(): admin, subgerente, grt,
 * jefe, grd, visor, asoc). Lo visto se guarda por usuario en el navegador (localStorage `novedades_vistas_<id usuario>`); en otro equipo
 * se muestran otra vez. Para avisar algo nuevo: agregar una entrada AL INICIO de NOVEDADES con un `id` nuevo (no reutilizar ids).
 *   { id, fecha, titulo, items: [{ ico, t (título), d (detalle, HTML simple), perfiles: [...] }] }  — sin `perfiles` = todos.
 * Se pueden volver a ver con «🆕 Novedades» (botón del encabezado de Ayuda, abrirNovedades_(true)). */
const NOVEDADES = [
  {
    id: '2026-11-16', fecha: '16-11-2026', titulo: 'Novedades de noviembre',
    items: [
      { ico: '📋', t: 'PPA para Jefes de Área y Gestores', perfiles: ['jefe', 'grt', 'subgerente'],
        d: 'Nuevo menú <b>📋 PPA ▾</b> con el Plan de Prevención de <b>tus áreas</b> (solo consulta): <b>📄 Detalle</b>, <b>🎯 Metas</b> (meta y avance de cada quincena) y ' +
           '<b>🧩 Avance por sector</b> (medidas, por vencer, vencidas y % a la fecha, con las fotos y la ubicación de las acciones). Filtra por <b>sector</b> y <b>plan</b>.' },
      { ico: '🧩', t: 'PPA › Avance por sector', perfiles: ['admin'],
        d: 'Vista nueva del PPA por sector (misma lógica del Seguimiento). El PPA ya está abierto, solo consulta, a Jefes de Área, Gestores (GRT) y Subgerentes en sus áreas.' },
      { ico: '📈', t: 'Seguimiento › 📋 PPA', perfiles: ['admin', 'subgerente'],
        d: 'Pestaña nueva con cada área: total de medidas, ⏳ por vencer, ⏰ vencidas y % de avance a la fecha. Botones para ver las <b>pendientes y atrasadas</b> (por sector y plan) ' +
           'y las <b>acciones registradas</b> con sus fotos y su ubicación en el mapa. También en el Excel.' },
      { ico: '📊', t: 'PPA › Gráfico de cumplimiento', perfiles: ['admin'],
        d: 'En el Tablero de Gestión: cumplimiento a la fecha por grupo, área, acción general o medida, descargable como imagen.' },
      { ico: '📱', t: 'App Prevención Territorial', perfiles: ['admin', 'subgerente', 'jefe', 'grt', 'grd'],
        d: 'Entra con tu mismo correo y clave. Registra los avances del PPA (también sin señal), ve el <b>% de cumplimiento al mes</b>, medidas vencidas y del mes, ' +
           'los <b>recursos</b> de tu área con su ícono y mapa, el <b>copamiento</b> por comuna y la meteorología. Se <b>actualiza sola</b> cuando hay versión nueva.' },
      { ico: '🚓', t: 'App de Patrullaje', perfiles: ['admin', 'subgerente', 'jefe', 'grt', 'grd'],
        d: 'Alertas compartidas en tiempo real con la hora de cada reporte, mapa estilo Waze, botón 🔄 de sincronización, solo los reportes del día y solo las rutas y áreas de la institución del patrullero.' },
      { ico: '🗺️', t: 'Mapa vivo SIG', perfiles: ['admin', 'subgerente', 'jefe'],
        d: 'Prevención › 📱 App de Patrullaje › <b>🗺️ Mapa vivo SIG</b>: las alertas de la jornada y los patrulleros en el mapa, con refresco automático.' },
      { ico: '🌦️', t: 'Meteorología: 3 visiones', perfiles: ['admin', 'jefe', 'grt', 'grd', 'visor'],
        d: 'En el Dashboard puedes alternar entre <b>API-Meteorología</b>, <b>Windy</b> y la <b>DGAC</b> (Dirección Meteorológica de Chile).' },
      { ico: '🏗️', t: 'Recursos de Operaciones', perfiles: ['admin', 'subgerente', 'jefe', 'grt'],
        d: 'Nueva pertenencia «Operaciones» (camión de transporte, jefe y supervisor de faena, <b>punto de faena</b> con ícono de cosechadora) y su grupo en la simbología.' },
    ],
  },
];
function novClave_() { return 'novedades_vistas_' + ((state.user && state.user.id) || (state.perfil && state.perfil.id) || 'anon'); }
function novVistas_() { try { return JSON.parse(localStorage.getItem(novClave_()) || '[]'); } catch (e) { return []; } }
function novMarcarVistas_(ids) { try { localStorage.setItem(novClave_(), JSON.stringify([...new Set(novVistas_().concat(ids))])); } catch (e) { /* sin almacenamiento */ } }
function novPerfil_() { try { return typeof ayPerfil_ === 'function' ? ayPerfil_() : 'visor'; } catch (e) { return 'visor'; } }
/** Novedades (con sus ítems filtrados por perfil) que este usuario aún no ve; con `todas` = las de los últimos envíos aunque ya las haya visto. */
function novPendientes_(todas) {
  const p = novPerfil_(), vistas = new Set(novVistas_());
  return NOVEDADES.filter(n => todas || !vistas.has(n.id))
    .map(n => Object.assign({}, n, { items: n.items.filter(i => !i.perfiles || i.perfiles.includes(p)) }))
    .filter(n => n.items.length);
}
/** Muestra las novedades no vistas (al ingresar). `forzar` = abrirlas desde el botón aunque ya se hayan visto. */
function abrirNovedades_(forzar) {
  const lista = novPendientes_(!!forzar).slice(0, forzar ? 3 : 10);
  if (!lista.length) { if (forzar) mostrarToast_('No hay novedades para tu perfil.'); return; }
  let ov = document.getElementById('nov-modal');
  if (!ov) {
    ov = document.createElement('div'); ov.id = 'nov-modal'; ov.className = 'modal-overlay'; ov.style.position = 'fixed'; ov.style.zIndex = '6000';   // sobre la Ayuda (5500)
    document.body.appendChild(ov);
    ov.addEventListener('click', e => { if (e.target === ov || e.target.closest('[data-nov-ok]')) cerrarNovedades_(); });
  }
  ov.dataset.ids = JSON.stringify(lista.map(n => n.id));
  ov.innerHTML = '<div class="modal-card nov-card" role="dialog" aria-label="Novedades del sistema">' +
    '<div class="nov-cab"><span class="nov-ico">🆕</span><div><h3>Novedades del Sistema de Copamiento</h3><p class="coords">Lo nuevo para tu perfil · se muestra una sola vez</p></div></div>' +
    '<div class="nov-cuerpo">' + lista.map(n => '<div class="nov-bloque"><div class="nov-fecha">' + escapeHtml_(n.titulo) + ' · ' + escapeHtml_(n.fecha) + '</div>' +
      n.items.map(i => '<div class="nov-item"><span>' + i.ico + '</span><div><b>' + escapeHtml_(i.t) + '</b><p>' + i.d + '</p></div></div>').join('') + '</div>').join('') + '</div>' +
    '<div class="nov-pie"><small>Puedes volver a verlas en <b>❓ Ayuda › 🆕 Novedades</b>.</small><button class="btn-primary" data-nov-ok>Entendido</button></div></div>';
  ov.classList.add('show');
}
function cerrarNovedades_() {
  const ov = document.getElementById('nov-modal'); if (!ov) return;
  try { novMarcarVistas_(JSON.parse(ov.dataset.ids || '[]')); } catch (e) { /* nada */ }
  ov.classList.remove('show');
}
/** Llamada al terminar el ingreso (bootstrap, js/01): solo si hay algo nuevo para el perfil. */
function mostrarNovedadesAlIngresar_() {
  if (!state.perfil || document.getElementById('nov-modal')?.classList.contains('show')) return;
  if (novPendientes_(false).length) abrirNovedades_(false);
}
