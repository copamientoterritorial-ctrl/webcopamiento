/* ==================== 🆕 NOVEDADES DEL SISTEMA (16-11-2026) ====================
 * Al ingresar, cada usuario ve UNA VEZ las novedades nuevas que le aplican a su perfil (claves de ayPerfil_(): admin, subgerente, grt,
 * jefe, grd, visor, asoc). Lo visto se guarda por usuario en el navegador (localStorage `novedades_vistas_<id usuario>`); en otro equipo
 * se muestran otra vez. Para avisar algo nuevo: agregar una entrada AL INICIO de NOVEDADES con un `id` nuevo (no reutilizar ids).
 *   { id, fecha, titulo, items: [{ ico, t (título), d (detalle, HTML simple), perfiles: [...] }] }  — sin `perfiles` = todos.
 * Se pueden volver a ver con «🆕 Novedades» (botón del encabezado de Ayuda, abrirNovedades_(true)). */
const NOVEDADES = [
  {
    id: '2026-11-21-usuarios-recursos', fecha: '21-11-2026', titulo: 'Usuarios Recursos y Modo SSO',
    items: [
      { ico: '🔑', t: 'Usuarios Recursos (App Bitácora)', perfiles: ['admin'],
        d: 'En Administración › <b>🔑 Usuarios Recursos</b> creas la cuenta de cada recurso de prevención: usuario = inicial del nombre + apellido del líder / ⭐ titular (Alex Medina → <code>amedina</code>) y clave por defecto <code>bmp.2627</code> en las BMP (cada tipo con su sigla), ' +
           'una por una o <b>todas las faltantes</b> de un área (baja un Excel con usuarios y claves). Cambias claves y activas / desactivas cuentas. Estas cuentas solo entran a la App Bitácora.' },
      { ico: '🦺', t: 'Modo SSO y perfil SSO sin comunas', perfiles: ['admin'],
        d: 'En tu menú de usuario › «Ver como…» está el <b>🦺 Modo SSO</b> para revisar lo que ve ese perfil. Al crear un usuario SSO ya no se piden comunas.' },
    ],
  },
  {
    id: '2026-11-21-turnos-gestores-temporada', fecha: '21-11-2026', titulo: 'Turnos de Gestores',
    items: [
      { ico: '👥', t: 'Turnos de Gestores por temporada', perfiles: ['admin', 'subgerente', 'jefe', 'grt'],
        d: 'Ahora se ve la <b>temporada completa (diciembre a marzo)</b> con solo los <b>sábados, domingos y feriados</b> 🎉. Los días ya pasados quedan bloqueados 🔒. ' +
           'Programan el <b>Jefe de Área</b> y el <b>delegado de prevención</b> del área; si necesitas un cambio, el sistema te indica a qué delegado informar.' },
      { ico: '🦺', t: 'Delegados de prevención', perfiles: ['admin'],
        d: 'En Administración › <b>🦺 Delegados de prevención</b> asignas el delegado de cada área y mantienes la lista de <b>feriados</b>.' },
    ],
  },
  {
    id: '2026-11-21-perfil-sso', fecha: '21-11-2026', titulo: 'Perfil SSO',
    items: [
      { ico: '🦺', t: 'Bienvenido al Sistema de Copamiento', perfiles: ['sso'],
        d: 'Tu perfil <b>SSO (Gestión en Prevención en Seguridad)</b> consulta los recursos de <b>todas las áreas</b> en el menú 🌲 Planificador CMPC: ' +
           '<b>🧭 Planificador gráfico</b> (mapa), <b>📊 Tablero de Recursos</b> y <b>🗂️ Gestión de Recursos</b>, con las 👥 personas de cada recurso. ' +
           'Puedes filtrar y descargar a Excel o PDF; los datos no se modifican desde tu perfil.' },
      { ico: '🦺', t: 'Nuevo perfil SSO', perfiles: ['admin'],
        d: 'En Administración › Usuarios ya puedes crear el <b>Perfil SSO (Gestión en Prevención en Seguridad)</b>: solo consulta de Planificador gráfico, Tablero y ' +
           'Gestión de Recursos de todas las áreas, con las personas de cada recurso.' },
    ],
  },
  {
    id: '2026-11-19-ppa-reporte', fecha: '19-11-2026', titulo: 'PPA: reporte del área y app sin señal',
    items: [
      { ico: '📈', t: 'PPA › Reporte del área', perfiles: ['admin', 'subgerente', 'jefe', 'grt'],
        d: 'Nuevo reporte de tus áreas con el <b>avance general</b> (sobre todo el período) y el <b>avance a la fecha</b>, las medidas pendientes y atrasadas, ' +
           'las acciones registradas con fotos y mapa, y tablas por sector y por plan.' },
      { ico: '🌲', t: 'Fundos y límite del área en las acciones registradas', perfiles: ['admin', 'subgerente', 'jefe', 'grt'],
        d: 'El mapa de 📸 Acciones registradas muestra el límite del área con sus sectores y los fundos CMPC con su nombre (al acercarte). Se apagan en el control de capas del mapa.' },
      { ico: '📵', t: 'App Prevención sin señal', perfiles: ['admin', 'subgerente', 'jefe', 'grt', 'grd'],
        d: 'La app abre sin señal con tus datos guardados y deja los avances en pendientes; al volver la señal los envía sola.' },
    ],
  },
  {
    id: '2026-11-18-ppa-eliminar', fecha: '18-11-2026', titulo: 'App Prevención Territorial',
    items: [
      { ico: '📊', t: 'PPA: avance general y avance a la fecha', perfiles: ['admin', 'subgerente', 'jefe', 'grt'],
        d: 'En los tableros del PPA (web y app) hay dos indicadores nuevos: <b>Avance general del PPA</b> (lo hecho sobre la meta de todo el período) ' +
           'y <b>Avance a la fecha</b> (lo hecho sobre lo que ya debía estar hecho).' },
      { ico: '🗂️', t: 'Sectores y fundos al registrar actividades', perfiles: ['admin', 'subgerente', 'jefe', 'grt'],
        d: 'En la app, el mapa para ubicar una actividad muestra los <b>sectores</b> y los <b>fundos CMPC</b> del área con sus nombres. ' +
           'Con el botón 🗂️ puedes apagar cada capa o las etiquetas; los nombres aparecen al acercarte.' },
      { ico: '🗑️', t: 'Eliminar un registro del PPA', perfiles: ['admin', 'subgerente', 'jefe', 'grt'],
        d: 'En la app, en los registros de una medida, quien ingresó un avance puede <b>modificarlo o eliminarlo</b> (el Administrador, cualquiera). ' +
           'Los demás usuarios del área solo lo ven.' },
    ],
  },
  {
    id: '2026-11-18-planificador-capas', fecha: '18-11-2026', titulo: 'Planificador de Alertas: más capas',
    items: [
      { ico: '🗺️', t: 'Entidades territoriales en el Planificador', perfiles: ['admin', 'subgerente', 'jefe', 'grt', 'grd', 'visor'],
        d: 'Lo cargado en <b>Planificación Territorial Comuna</b> (juntas de vecinos, fuentes de agua, escuelas, puentes… e incendios registrados) ' +
           'ahora también se ve en el <b>Planificador de Alertas</b>, en 🗂️ Capas › «🗺️ Planificación Territorial». Ahí es solo consulta: se edita en su propio módulo.' },
      { ico: '🌾', t: 'Capas de Agricultores en el Planificador', perfiles: ['admin', 'subgerente', 'jefe', 'grt'],
        d: 'En 🗂️ Capas › «🌾 Agricultores»: <b>predios</b> y <b>agricultores</b> por nivel de riesgo, y las <b>actividades registradas</b> de los últimos 30 días.' },
    ],
  },
  {
    id: '2026-11-17-focos-nasa', fecha: '17-11-2026', titulo: 'Focos de calor NASA',
    items: [
      { ico: '🛰️', t: 'Capa «Focos de calor NASA»', perfiles: ['admin', 'subgerente', 'jefe', 'grt', 'grd', 'visor'],
        d: 'En el mapa, panel <b>Capas</b>: incendios activos detectados por los satélites de la NASA (VIIRS y MODIS) en las últimas <b>24 h, 48 h o 7 días</b>. ' +
           'El color indica hace cuánto se detectó y el tamaño la potencia del fuego. Toca un punto para ver hora, satélite y confianza. Es una detección satelital: confírmala en terreno.' },
    ],
  },
  {
    id: '2026-11-17-windfinder', fecha: '17-11-2026', titulo: 'Meteorología: Windfinder',
    items: [
      { ico: '🪁', t: 'Pestaña Windfinder en Meteorología', perfiles: ['admin', 'subgerente', 'jefe', 'grt', 'grd', 'visor'],
        d: 'En el Dashboard, junto a <b>API Meteorología</b>, <b>Windy</b> y <b>DGAC</b>, ahora está <b>🪁 Windfinder</b>: pronóstico de viento, ráfagas, ' +
           'temperatura y lluvia del lugar de Windfinder más cercano a la comuna. Puedes elegir otro lugar cercano y de 2 a 4 días.' },
    ],
  },
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
