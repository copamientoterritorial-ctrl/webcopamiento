/* ============ Simbología por tipo de recurso (catálogo en BD: tipos_recurso) ============ */
// Los tipos y su emoji de respaldo salen ahora de la tabla public.tipos_recurso.
// Agregar un tipo nuevo ya no exige editar este archivo: basta un INSERT.
// El ícono con imagen (icono_url) sigue teniendo prioridad sobre el emoji.

state.tiposRecursoCatalogo = [];
let tiposRecursoPromesa = null;

/** Quita acentos y normaliza a minúsculas para comparar sin sorpresas. */
function normalizarTipoTexto_(texto) {
  return (texto === null || texto === undefined ? '' : String(texto))
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

/** Carga el catálogo de tipos desde la BD. Cachea el resultado. */
async function cargarTiposRecurso_(forzar) {
  if (tiposRecursoPromesa && !forzar) return tiposRecursoPromesa;

  tiposRecursoPromesa = (async () => {
    const { data, error } = await supabaseClient
      .from('tipos_recurso')
      .select('nombre, etiqueta, emoji, color_hex, sirena, patron_nombre, orden')
      .eq('activo', true)
      .order('orden', { ascending: true })
      .order('nombre', { ascending: true });

    if (error) {
      console.error('No se pudo cargar tipos_recurso:', error.message);
      tiposRecursoPromesa = null;
      return state.tiposRecursoCatalogo;
    }

    // Orden del sistema: Brigada Multipropósito, Brigada Disuasiva, Vigía Camioneta, Vigía
    // Motorizado, Vigía Montado, Vigía Infantería, Vigía Dron; luego el resto según su «orden».
    state.tiposRecursoCatalogo = (data || []).slice().sort((a, b) => rangoTipoRecurso_(a.nombre) - rangoTipoRecurso_(b.nombre));
    return state.tiposRecursoCatalogo;
  })();

  return tiposRecursoPromesa;
}

/* ── Orden de los tipos de recurso en TODO el sistema (14-10-2026): menús, listas desplegables,
 *    listados, tarjetas, gráficos, PDF y Excel. Comparar siempre con compararTipoRecurso_. ── */
const ORDEN_TIPOS_RECURSO = ['BRIGADA MULTIPROPOSITO', 'BRIGADA DISUASIVA', 'VIGIA CAMIONETA', 'VIGIA MOTORIZADO', 'VIGIA MONTADO', 'VIGIA INFANTERIA', 'VIGIA DRON'];
function rangoTipoRecurso_(tipo) {
  const t = normalizarTipoTexto_(tipo).toUpperCase().replace(/\s+/g, ' ');
  const i = ORDEN_TIPOS_RECURSO.findIndex(o => t === o || t.startsWith(o));
  if (i >= 0) return i;
  if (t === 'INFANTERIA') return 5;   // «infantería» a secas
  return 100;
}
/** Compara dos tipos de recurso según el orden del sistema (y luego alfabético). */
function compararTipoRecurso_(a, b) {
  return rangoTipoRecurso_(a) - rangoTipoRecurso_(b) || String(a || '').localeCompare(String(b || ''), 'es');
}

/**
 * Resuelve el tipo del catálogo que corresponde a un recurso.
 * Prioridad: coincidencia exacta del tipo, luego patrón sobre el nombre.
 *
 * IMPORTANTE: los patrones se ordenan de MÁS LARGO a MÁS CORTO antes de
 * buscar. Eso es lo que hace que 'tipo iii' gane sobre 'tipo i'. Si se
 * quita ese ordenamiento, las brigadas Tipo I, II y III se clasifican mal.
 */
function buscarTipoRecurso_(rm) {
  const lista = state.tiposRecursoCatalogo || [];
  if (lista.length === 0) return null;

  const tipo = normalizarTipoTexto_(rm && rm.tipo_recurso);
  const nombre = normalizarTipoTexto_(rm && rm.nombre_recurso);

  if (tipo) {
    const exacto = lista.find(t => normalizarTipoTexto_(t.nombre) === tipo);
    if (exacto) return exacto;
  }

  const texto = tipo + ' ' + nombre;
  const conPatron = lista
    .filter(t => t.patron_nombre && String(t.patron_nombre).trim() !== '')
    .sort((a, b) => String(b.patron_nombre).length - String(a.patron_nombre).length);
  const porPatron = conPatron.find(t => texto.includes(normalizarTipoTexto_(t.patron_nombre)));
  if (porPatron) return porPatron;

  return null;
}

/** Color asociado al tipo, útil para leyendas y tarjetas. */
function colorParaRecursoMaestro_(rm) {
  const tipo = buscarTipoRecurso_(rm || {});
  return tipo && tipo.color_hex ? tipo.color_hex : '#64748B';
}

/** Rellena un <select> con los tipos activos del catálogo. */
function poblarSelectTiposRecurso_(selectEl, valorSeleccionado) {
  if (!selectEl) return;
  const lista = state.tiposRecursoCatalogo || [];
  if (lista.length === 0) {
    // Sin catálogo se conservan las opciones fijas del HTML.
    if (valorSeleccionado) selectEl.value = valorSeleccionado;
    return;
  }

  selectEl.innerHTML = '';
  lista.forEach(t => {
    const opt = document.createElement('option');
    opt.value = t.nombre;
    opt.textContent = (t.emoji ? t.emoji + '  ' : '') + (t.etiqueta || t.nombre);
    selectEl.appendChild(opt);
  });

  // Si el recurso tiene un tipo que ya no está activo, se agrega temporalmente
  // para no perder el valor al editar.
  if (valorSeleccionado) {
    const existe = Array.prototype.some.call(selectEl.options, o => o.value === valorSeleccionado);
    if (!existe) {
      const opt = document.createElement('option');
      opt.value = valorSeleccionado;
      opt.textContent = valorSeleccionado + ' (tipo inactivo)';
      selectEl.appendChild(opt);
    }
    selectEl.value = valorSeleccionado;
  }
}

function emojiParaRecursoMaestro_(rm) {
  const recurso = rm || {};

  // 1. Emoji definido en el catálogo de tipos (tabla tipos_recurso).
  const tipoCatalogo = buscarTipoRecurso_(recurso);
  if (tipoCatalogo) return { emoji: tipoCatalogo.emoji || '🚶', sirena: !!tipoCatalogo.sirena };

  // 2. Respaldo: si el catálogo no cargó, se aplica la lógica anterior
  //    para que el mapa nunca quede sin iconos.
  const tipo = (recurso.tipo_recurso || '').toLowerCase();
  const nombre = (recurso.nombre_recurso || '').toLowerCase();
  const texto = tipo + ' ' + nombre;
  if (texto.includes('multiprop'))  return { emoji: '🚚', sirena: true };
  if (texto.includes('disuasiv'))   return { emoji: '🚚', sirena: false };
  if (texto.includes('montad') || texto.includes('caballo')) return { emoji: '🐴', sirena: false };
  if (texto.includes('motoriz') || texto.includes('moto'))   return { emoji: '🏍️', sirena: false };
  if (texto.includes('dron'))       return { emoji: '🛸', sirena: false };
  if (texto.includes('camioneta'))  return { emoji: '🚚', sirena: false };
  if (texto.includes('infanter'))   return { emoji: '🚶', sirena: false };
  if (recurso.tipo_movil === 'Camioneta' || recurso.tipo_movil === 'CAMIONETA') return { emoji: '🚚', sirena: false };
  if (recurso.tipo_movil === 'Moto' || recurso.tipo_movil === 'MOTO') return { emoji: '🏍️', sirena: false };
  return { emoji: '🚶', sirena: false };
}

/* ============ FILTRO POR INSTITUCIÓN EN LAS CAPAS DE ALERTA ============
 * Enciende o apaga los polígonos, líneas y puntos de una institución en
 * los TRES niveles de alerta a la vez. Sirve para leer el nivel de
 * copamiento aportado por cada organización: se apagan todas menos una y
 * queda a la vista qué territorio cubre esa institución en Verde,
 * Amarilla y Roja.
 *
 * El filtro es visual: no modifica la base de datos ni el estado de las
 * capas. Convive con el interruptor de cada nivel de alerta, que sigue
 * mandando: si Roja está apagada, nada de Roja se ve aunque su
 * institución esté encendida aquí.
 */
state.institucionesAlertaOcultas = state.institucionesAlertaOcultas || {};

/* Filtro por tipo de figura: punto, línea y polígono.
 * Es independiente del filtro por institución y se cruza con él. */
state.tipoGeomOculto = state.tipoGeomOculto || { punto: false, linea: false, area: false };

/* Jerarquía interna de una institución: pertenencia y tipo de recurso.
 * Se usa para CMPC y solo la ven los perfiles que planifican recursos
 * propios (Administrador y Jefe de Área). */
state.pertenenciaAlertaOculta = state.pertenenciaAlertaOculta || {};
state.tipoRecursoAlertaOculto = state.tipoRecursoAlertaOculto || {};
state.colapsoJerarquiaInst = state.colapsoJerarquiaInst || {};
// Los tipos arrancan plegados dentro de cada pertenencia: con 15 tipos la
// lista ocupaba toda la altura del panel y obligaba a desplazarse.
state.colapsoPertenencia = state.colapsoPertenencia || {};

function pertenenciaAlertaOculta_(p) { return !!state.pertenenciaAlertaOculta[p]; }
function setPertenenciaAlertaOculta_(p, o) { state.pertenenciaAlertaOculta[p] = o; }
function tipoRecursoAlertaOculto_(t) { return !!state.tipoRecursoAlertaOculto[t]; }
function setTipoRecursoAlertaOculto_(t, o) { state.tipoRecursoAlertaOculto[t] = o; }

/** Desglose de una institución: pertenencia -> tipo -> conteo por escenario.
 *  Se cuenta por alerta y no en total: un número único mezclaba los tres
 *  escenarios y hacía imposible saber de dónde venía. */
function desgloseInstitucionAlerta_(idInstitucion) {
  const arbol = {};
  const niveles = ['Verde', 'Amarilla', 'Roja'];

  capasAlertaPlanificacion_().forEach((grupo, idx) => {
    if (!grupo || typeof grupo.eachLayer !== 'function') return;
    const esc = niveles[idx];
    grupo.eachLayer(ly => {
      if (String(ly._institucionId) !== String(idInstitucion)) return;
      if (ly._esLogoDeFigura) return;   // acompaña a una figura ya contada
      const pert = ly._pertenencia || 'Sin clasificar';
      const tipo = ly._tipoRecurso || 'Sin tipo';
      if (!arbol[pert]) arbol[pert] = {};
      if (!arbol[pert][tipo]) arbol[pert][tipo] = { Verde: 0, Amarilla: 0, Roja: 0 };
      arbol[pert][tipo][esc]++;
    });
  });
  return arbol;
}

/** Tres cifras por escenario, con el color de cada alerta. */
function cifrasPorEscenario_(c, tamano) {
  const t = tamano || 10;
  return '<span title="Normal · Amarilla · Roja" style="font-size:' + t + 'px;' +
    'font-variant-numeric:tabular-nums;flex-shrink:0;">' +
    '<span style="color:#16A34A;">' + c.Verde + '</span>' +
    '<span style="opacity:.35;">·</span>' +
    '<span style="color:#F59E0B;">' + c.Amarilla + '</span>' +
    '<span style="opacity:.35;">·</span>' +
    '<span style="color:#EF4444;">' + c.Roja + '</span>' +
  '</span>';
}

/** Etiqueta corta para la pertenencia dentro del árbol. */
const PERTENENCIA_CORTA = {
  'Protección': '🛡️ R. Protección',
  'Relacionamiento': '🤝 R. Relacionamiento',
  'Sin clasificar': '❔ Sin clasificar',
};

function institucionConJerarquia_(nombre) {
  // Por ahora solo CMPC tiene catálogo propio de tipos.
  return esInstitucionCmpc_({ nombre }) && perfilPuedeUsarCatalogoCmpc_();
}

function tipoGeomOculto_(t) {
  return !!(state.tipoGeomOculto && state.tipoGeomOculto[t]);
}
function setTipoGeomOculto_(t, oculto) {
  if (!state.tipoGeomOculto) state.tipoGeomOculto = { punto: false, linea: false, area: false };
  state.tipoGeomOculto[t] = oculto;
}

/** "CARABINEROS DE CHILE" -> "Carabineros de Chile".
 *  Preposiciones y artículos en minúscula (salvo al inicio) y siglas
 *  respetadas: CMPC y CONAF no deben convertirse en Cmpc ni Conaf. */
const MINUSCULAS_TITULO = ['de', 'del', 'la', 'las', 'los', 'el', 'y', 'e', 'en', 'a'];
const SIGLAS_CONOCIDAS = ['CMPC', 'CONAF', 'SENAPRED', 'ONEMI', 'SIGEI', 'GRD', 'PDI', 'BMP', 'SIDCO', 'KM'];

function esSigla_(palabra) {
  const p = palabra.toUpperCase();
  if (SIGLAS_CONOCIDAS.indexOf(p) !== -1) return true;
  // Una abreviatura con punto no es sigla: "Br." debe quedar "Br.", no "BR.".
  if (p.indexOf('.') !== -1) return false;
  // Palabra corta sin vocales: casi siempre una sigla (CMPC, SPA, etc.).
  return p.length <= 5 && !/[AEIOUÁÉÍÓÚ]/.test(p);
}

function aTitulo_(texto) {
  const t = (texto === null || texto === undefined) ? '' : String(texto).trim();
  if (!t) return '';
  // Si ya viene en formato mixto, se respeta tal cual.
  if (t !== t.toUpperCase()) return t;
  return t.split(/\s+/).map((palabra, i) => {
    if (esSigla_(palabra)) return palabra.toUpperCase();
    const min = palabra.toLowerCase();
    if (i > 0 && MINUSCULAS_TITULO.indexOf(min) !== -1) return min;
    return min.charAt(0).toUpperCase() + min.slice(1);
  }).join(' ');
}

function capasAlertaPlanificacion_() {
  return [
    planificacionRecursosVerdeLayer,
    planificacionRecursosAmarillaLayer,
    planificacionRecursosRojaLayer,
  ];
}

function institucionAlertaOculta_(id) {
  return !!state.institucionesAlertaOcultas[id];
}

function setInstitucionAlertaOculta_(id, oculto) {
  state.institucionesAlertaOcultas[id] = oculto;
}

/** Deja la figura vigilada: el filtro se aplica cada vez que entra al mapa.
 *
 * Aplicarlo solo al crearla no basta. Si el grupo todavía no está en el
 * mapa, la figura no tiene elemento HTML y no hay nada que ocultar; al
 * encender la capa después, Leaflet crea el elemento visible y el filtro
 * llegaba tarde. De ahí el destello con todas las entidades.
 *
 * El evento 'add' se dispara justo cuando el elemento existe, así que ese
 * es el momento correcto.
 */
function vigilarFiltroEntidad_(ly) {
  if (!ly || ly._filtroVigilado) return;
  ly._filtroVigilado = true;
  aplicarFiltroAEntidad_(ly);
  ly.on('add', () => aplicarFiltroAEntidad_(ly));
}

/** Aplica el filtro a UNA figura. */
function aplicarFiltroAEntidad_(ly) {
  try {
    if (!ly || !ly._institucionId) return;
    const oculto = institucionAlertaOculta_(ly._institucionId)
      || tipoGeomOculto_(ly._tipoGeometria)
      || pertenenciaAlertaOculta_(ly._pertenencia || 'Sin clasificar')
      || tipoRecursoAlertaOculto_(ly._tipoRecurso || 'Sin tipo');
    if (!oculto) return;
    const el = ly.getElement && ly.getElement();
    if (el) el.style.display = 'none';
    const tt = ly.getTooltip && ly.getTooltip();
    if (tt) { const tel = tt.getElement && tt.getElement(); if (tel) tel.style.display = 'none'; }
  } catch (e) { /* no debe interrumpir la carga */ }
}

/** Aplica el filtro a las tres capas de alerta. */
function aplicarVisibilidadInstitucionesAlerta_() {
  // Todos los filtros del panel terminan pasando por aquí, así que es el
  // único punto donde hace falta enganchar el recálculo.
  if (typeof programarRecalculoCopamiento_ === 'function') programarRecalculoCopamiento_();
  capasAlertaPlanificacion_().forEach(grupo => {
    if (!grupo || typeof grupo.eachLayer !== 'function') return;
    grupo.eachLayer(ly => {
      const id = ly._institucionId;
      if (!id) return;
      // Se ocultan si está apagada su institución, su tipo de figura, su
      // pertenencia o su tipo de recurso. Cualquiera de los cuatro basta.
      const oculto = institucionAlertaOculta_(id)
        || tipoGeomOculto_(ly._tipoGeometria)
        || pertenenciaAlertaOculta_(ly._pertenencia || 'Sin clasificar')
        || tipoRecursoAlertaOculto_(ly._tipoRecurso || 'Sin tipo');
      try {
        const el = ly.getElement && ly.getElement();
        if (el) el.style.display = oculto ? 'none' : '';
        const tt = ly.getTooltip && ly.getTooltip();
        if (tt) { const tel = tt.getElement && tt.getElement(); if (tel) tel.style.display = oculto ? 'none' : ''; }
      } catch (e) { /* una figura problemática no debe cortar el resto */ }
    });
  });
}

/** Resumen por institución: cuántos elementos aporta en cada nivel. */
function resumenInstitucionesAlerta_() {
  const mapa = {};
  const niveles = ['verde', 'amarilla', 'roja'];
  capasAlertaPlanificacion_().forEach((grupo, idx) => {
    if (!grupo || typeof grupo.eachLayer !== 'function') return;
    grupo.eachLayer(ly => {
      const id = ly._institucionId;
      if (!id) return;
      // Los marcadores de logo acompañan a una figura ya contada.
      if (ly._esLogoDeFigura) return;
      if (!mapa[id]) {
        mapa[id] = { id, nombre: ly._institucionNombre || 'Institución', verde: 0, amarilla: 0, roja: 0, total: 0 };
      }
      mapa[id][niveles[idx]]++;
      mapa[id].total++;
    });
  });
  return Object.values(mapa).sort(compararInstitucionesCapa_);
}

/* Orden de capas pedido (07-10-2026), de ARRIBA hacia abajo, en la simbología y en
 * el mapa: Municipalidad, Carabineros, Fuerza Militar, Comunidad, Agricultores,
 * Red de Prevención, otras (alfabético) y al final CMPC (queda debajo de todo). */
const ORDEN_INSTITUCIONES_CAPA = [
  /MUNICIPAL/, /CARABINER/, /MILITAR|EJERCITO|ARMADA|FUERZA AEREA/, /COMUNIDAD/,
  /AGRICULTOR/, /PREVENCION/,
];
function rangoInstitucionCapa_(nombre) {
  const n = plNorm_(nombre || '');
  if (/CMPC/.test(n)) return 99;
  const i = ORDEN_INSTITUCIONES_CAPA.findIndex(re => re.test(n));
  return i === -1 ? 50 : i;
}
function compararInstitucionesCapa_(a, b) {
  return rangoInstitucionCapa_(a.nombre) - rangoInstitucionCapa_(b.nombre) || (a.nombre || '').localeCompare(b.nombre || '');
}

/** Enciende o apaga todas las instituciones de una vez. */
function setTodasInstitucionesAlerta_(ocultar) {
  resumenInstitucionesAlerta_().forEach(i => { state.institucionesAlertaOcultas[i.id] = !!ocultar; });
  aplicarVisibilidadInstitucionesAlerta_();
}

/* ============ RESUMEN DINÁMICO DE RECURSOS POR ALERTA ============
 * Barras horizontales con el total de entidades planificadas en cada
 * escenario y su desglose por tipo de figura. Se recalcula solo cada vez
 * que cambian las capas, los filtros o la comuna activa.
 *
 * Se mantiene deliberadamente pequeño y traslúcido, arriba y al centro:
 * ahí no estorba a los controles de zoom, ni al panel de Capas, ni a la
 * barra de escenarios ni a la simbología.
 */
state.resumenAlertasColapsado = state.resumenAlertasColapsado || false;

function contarRecursosPorAlerta_() {
  const conteo = {
    Verde:    { total: 0, visibles: 0, punto: 0, linea: 0, area: 0 },
    Amarilla: { total: 0, visibles: 0, punto: 0, linea: 0, area: 0 },
    Roja:     { total: 0, visibles: 0, punto: 0, linea: 0, area: 0 },
  };
  const grupos = [
    ['Verde', planificacionRecursosVerdeLayer],
    ['Amarilla', planificacionRecursosAmarillaLayer],
    ['Roja', planificacionRecursosRojaLayer],
  ];

  grupos.forEach(([esc, grupo]) => {
    if (!grupo || typeof grupo.eachLayer !== 'function') return;
    grupo.eachLayer(ly => {
      // Los marcadores de logo acompañan a una figura ya contada.
      if (ly._esLogoDeFigura) return;
      const g = ly._tipoGeometria || (ly.getLatLngs ? 'linea' : 'punto');
      conteo[esc].total++;
      if (conteo[esc][g] !== undefined) conteo[esc][g]++;

      const oculto = institucionAlertaOculta_(ly._institucionId)
        || tipoGeomOculto_(g)
        || pertenenciaAlertaOculta_(ly._pertenencia || 'Sin clasificar')
        || tipoRecursoAlertaOculto_(ly._tipoRecurso || 'Sin tipo');
      if (!oculto) conteo[esc].visibles++;
    });
  });

  return conteo;
}

/* Apila el resumen justo encima de la simbología y le da su mismo ancho,
 * para que el bloque de la esquina C3 se lea como una sola pieza.
 * La simbología cambia de alto según cuántas instituciones haya y de ancho
 * con los botones S/M/L, así que la medida se toma en cada render. */
function alinearResumenConSimbologia_() {
  const resumen = document.getElementById('resumen-alertas');
  const simb = document.getElementById('simbologia-flotante');
  const escala = document.getElementById('escala-zoom');

  // Columna derecha, de abajo hacia arriba: escala → simbología → nivel de copamiento.
  // La base sale del CSS de la escala (16 px en escritorio, más alto en móvil).
  const base = escala ? (parseFloat(getComputedStyle(escala).bottom) || 16) : 16;
  const simbVisible = !!(simb && simb.style.display !== 'none' && simb.offsetParent);
  // Primero el ancho (puede hacer que la escala pase a 2 filas) y después se mide el alto.
  if (escala) escala.style.width = simbVisible ? (simb.offsetWidth || 240) + 'px' : '';
  const hEscala = (escala && escala.offsetParent) ? escala.offsetHeight + 6 : 0;

  if (simb) simb.style.bottom = (base + hEscala) + 'px';
  if (!resumen) return;

  if (!simbVisible) {
    resumen.style.bottom = (base + hEscala) + 'px';
    resumen.style.width = '240px';
    return;
  }

  const alto = simb.offsetHeight || 0;
  const ancho = simb.offsetWidth || 240;
  resumen.style.bottom = (base + hEscala + alto + 8) + 'px';
  resumen.style.width = ancho + 'px';
}

/* ============ ÁREAS DE INFLUENCIA Y NIVEL DE COPAMIENTO ============
 * Reglas de negocio (aplicadas en PostGIS, no aquí):
 *   · Líneas -> franja de 500 m a cada lado.
 *   · Puntos -> círculo de 500 m de radio.
 *   · Áreas  -> sin zona de influencia, se usan tal cual.
 *   · La capa resultante une todas las influencias disolviendo los solapes
 *     y se recorta al límite comunal.
 *
 * El cálculo vive en la base porque el buffer debe ser geodésico y la
 * unión con disolución es costosa. Aquí solo se dibuja el resultado.
 */
const BUFFER_INFLUENCIA_M = 500;
state.influenciaVisible = state.influenciaVisible || false;
state.copamiento = state.copamiento || {};        // { Verde: {...}, Amarilla: {...}, Roja: {...} }
state.copamientoCargando = false;

/* Ids de las entidades VISIBLES de cada escenario.
 *
 * Es lo que hace dinámico el copamiento: al apagar una institución, una
 * pertenencia, un tipo de recurso o un tipo de figura, esas entidades
 * salen del conjunto y el indicador baja. Al encender la Municipalidad,
 * sus entidades entran y el porcentaje sube.
 *
 * Se aplica exactamente el mismo criterio de visibilidad que usa el mapa,
 * para que lo que se mide sea lo que se ve.
 */
function idsVisiblesPorEscenario_() {
  const res = { Verde: [], Amarilla: [], Roja: [] };
  const grupos = [
    ['Verde', planificacionRecursosVerdeLayer],
    ['Amarilla', planificacionRecursosAmarillaLayer],
    ['Roja', planificacionRecursosRojaLayer],
  ];

  grupos.forEach(([esc, grupo]) => {
    if (!grupo || typeof grupo.eachLayer !== 'function') return;
    grupo.eachLayer(ly => {
      if (ly._esLogoDeFigura) return;          // acompaña a una figura ya contada
      if (!ly._recursoId) return;
      const oculto = institucionAlertaOculta_(ly._institucionId)
        || tipoGeomOculto_(ly._tipoGeometria)
        || pertenenciaAlertaOculta_(ly._pertenencia || 'Sin clasificar')
        || tipoRecursoAlertaOculto_(ly._tipoRecurso || 'Sin tipo');
      if (!oculto) res[esc].push(ly._recursoId);
    });
  });

  return res;
}

/** Firma del conjunto visible, para no recalcular si nada cambió. */
function firmaVisibles_(ids) {
  return ['Verde', 'Amarilla', 'Roja'].map(e => e + ':' + ids[e].length).join('|')
    + '#' + JSON.stringify(state.institucionesAlertaOcultas)
    + JSON.stringify(state.tipoGeomOculto)
    + JSON.stringify(state.pertenenciaAlertaOculta)
    + JSON.stringify(state.tipoRecursoAlertaOculto);
}

/* Descarta todo lo calculado para la comuna anterior.
 *
 * Los indicadores —áreas de influencia, amebas de incendios, KPI e
 * informe— son siempre relativos a una comuna. Al cambiar de comuna hay
 * que borrarlos, o se muestran cifras de un territorio sobre otro.
 *
 * Las amebas siguen guardadas en la base por comuna, así que al volver se
 * recuperan de inmediato: aquí solo se limpia lo que está en memoria.
 */
function limpiarIndicadoresComuna_() {
  try {
    // Áreas de influencia
    ['Verde', 'Amarilla', 'Roja'].forEach(esc => {
      const capa = capaInfluenciaDe_(esc);
      if (capa) { capa.clearLayers(); if (map.hasLayer(capa)) map.removeLayer(capa); }
    });
    state.copamiento = {};

    // Amebas de incendios
    Object.keys(amebaLayers).forEach(id => {
      const capa = amebaLayers[id];
      if (capa) { capa.clearLayers(); if (map.hasLayer(capa)) map.removeLayer(capa); }
      state.amebaVisible[id] = false;
      state.amebaCargando[id] = false;
    });
    state.amebaDatos = {};
    state.amebaKpi = {};

    // Focos por temporada: pertenecen a la comuna anterior.
    state.focosPorTemporada = {};
    state.temporadasComuna = [];

    // Informe y firmas de recálculo
    state.informe = null;
    state.firmaCopamiento = null;
    state.idsVisiblesCache = null;

    const modalInforme = document.getElementById('informe-modal-overlay');
    if (modalInforme) modalInforme.classList.remove('show');

    if (typeof renderKpiIncendios_ === 'function') renderKpiIncendios_();
    if (typeof renderResumenAlertas_ === 'function') renderResumenAlertas_();
  } catch (e) {
    console.error('limpiarIndicadoresComuna_:', e);
  }
}

function capaInfluenciaDe_(escenario) {
  return escenario === 'Verde' ? influenciaVerdeLayer
       : escenario === 'Amarilla' ? influenciaAmarillaLayer
       : influenciaRojaLayer;
}

/** Pide a la base la capa unida de un escenario y la dibuja. */
async function cargarInfluenciaEscenario_(escenario) {
  const capa = capaInfluenciaDe_(escenario);
  capa.clearLayers();
  if (!state.activeComunaId) return;
  // Se anota la comuna al iniciar: si el usuario cambia de comuna mientras
  // la consulta está en vuelo, el resultado se descarta.
  const comunaSolicitada = String(state.activeComunaId);

  // Solo las entidades visibles: el copamiento sigue a los filtros del panel.
  const ids = (state.idsVisiblesCache || idsVisiblesPorEscenario_())[escenario] || [];
  if (ids.length === 0) {
    state.copamiento[escenario] = { area_km2: 0, pct: 0, entidades: 0 };
    return;
  }

  const { data, error } = await supabaseClient.rpc('capa_influencia_ids_geojson', {
    p_comuna_id: String(state.activeComunaId),
    p_ids: ids,
    p_buffer_m: BUFFER_INFLUENCIA_M,
  });

  if (error) {
    console.error('capa_influencia_ids_geojson (' + escenario + '):', error.message);
    return;
  }

  if (String(state.activeComunaId) !== comunaSolicitada) return;   // cambió de comuna

  const fila = (data && data[0]) ? data[0] : null;
  state.copamiento[escenario] = fila
    ? { area_km2: Number(fila.area_km2) || 0, pct: fila.pct_comuna, entidades: Number(fila.entidades) || 0 }
    : { area_km2: 0, pct: null, entidades: 0 };

  if (!fila || !fila.geojson) return;

  let geo;
  try { geo = JSON.parse(fila.geojson); } catch (e) { return; }

  const color = escenario === 'Verde' ? '#16A34A' : escenario === 'Amarilla' ? '#F59E0B' : '#EF4444';
  L.geoJSON(geo, {
    style: { color, weight: 1.5, opacity: 0.75, fillColor: color, fillOpacity: 0.16, dashArray: '5,4' },
    interactive: false,     // no debe robar clics a las figuras ni al dibujo
  }).addTo(capa);
}

/* Recálculo automático al cambiar los filtros.
 *
 * Cada clic en una institución, pertenencia, tipo o figura cambia el
 * conjunto visible. Se espera medio segundo antes de recalcular para no
 * lanzar una consulta por clic cuando se apagan varias seguidas, y se
 * compara la firma del conjunto para no repetir el mismo cálculo.
 */
state.firmaCopamiento = null;
let temporizadorCopamiento = null;

function programarRecalculoCopamiento_() {
  // Solo si hay algún indicador encendido: si no, no hay nada que actualizar.
  if (!state.influenciaVisible && !state.kpiIncendiosVisible) return;

  if (temporizadorCopamiento) clearTimeout(temporizadorCopamiento);
  temporizadorCopamiento = setTimeout(async () => {
    const ids = idsVisiblesPorEscenario_();
    const firma = firmaVisibles_(ids);
    if (firma === state.firmaCopamiento) return;   // nada cambió de verdad
    state.firmaCopamiento = firma;

    if (state.influenciaVisible) await refrescarInfluencia_();
    if (state.kpiIncendiosVisible) await cargarKpiIncendios_();
  }, 500);
}

/** Recarga las tres capas y actualiza el indicador. */
async function refrescarInfluencia_() {
  if (state.copamientoCargando) return;
  state.copamientoCargando = true;
  // Una sola foto del conjunto visible para los tres escenarios.
  state.idsVisiblesCache = idsVisiblesPorEscenario_();
  try {
    await Promise.all(['Verde', 'Amarilla', 'Roja'].map(e => cargarInfluenciaEscenario_(e)));
    aplicarVisibilidadInfluencia_();
  } catch (e) {
    console.error('refrescarInfluencia_:', e);
  } finally {
    state.copamientoCargando = false;
    state.idsVisiblesCache = null;
    renderResumenAlertas_();
  }
}

/** Muestra u oculta las capas según el interruptor y las alertas activas. */
function aplicarVisibilidadInfluencia_() {
  [['Verde', 'verde'], ['Amarilla', 'amarilla'], ['Roja', 'roja']].forEach(([esc, clave]) => {
    const capa = capaInfluenciaDe_(esc);
    const debeVerse = state.influenciaVisible
      && !!(state.alertaLayersOn && state.alertaLayersOn[clave]);
    if (debeVerse) {
      if (!map.hasLayer(capa)) capa.addTo(map);
      capa.bringToBack();     // por debajo de las figuras y sus etiquetas
    } else if (map.hasLayer(capa)) {
      map.removeLayer(capa);
    }
  });
}

async function toggleInfluencia_() {
  state.influenciaVisible = !state.influenciaVisible;
  const btn = document.getElementById('btn-influencia');
  if (btn) btn.classList.toggle('active', state.influenciaVisible);

  if (state.influenciaVisible) {
    mostrarToast_('🎯 Calculando áreas de influencia (500 m)…');
    await refrescarInfluencia_();
    const total = ['Verde', 'Amarilla', 'Roja']
      .filter(e => state.alertaLayersOn && state.alertaLayersOn[e.toLowerCase()])
      .map(e => state.copamiento[e])
      .filter(Boolean);
    if (total.length === 0) mostrarToast_('⚠️ Enciende alguna capa de alerta para ver su influencia.');
  } else {
    aplicarVisibilidadInfluencia_();
  }
  renderResumenAlertas_();
}

