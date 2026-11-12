/* ════════════════════════════════════════════════════════════════
 * 39 · ✕ LIMPIAR FILTROS en todos los paneles (11-11-2026)
 * Cada barra de filtros del sistema (.pat-toolbar, .turnos-toolbar, #ppa-filtros, .br-filtros, #ar-filtros y las búsquedas
 * .admin-search de Administración) recibe un botón «✕ Limpiar filtros (n)» que aparece solo cuando hay filtros cambiados.
 * «Cambiado» = distinto de cómo estaba la barra ANTES de la primera interacción del usuario (foto tomada en el primer toque):
 * así respeta los valores por defecto de cada panel (p. ej. el área autoseleccionada de un Jefe, el mes actual).
 * Al limpiar se devuelven los valores y se dispara 'input' + 'change', de modo que cada panel vuelve a filtrar con su propia lógica.
 * Barras con limpiador propio (Comunas Prioritarias, Tablero de Recursos, Planificador gráfico) se omiten.
 * Excluir un control: atributo data-no-limpiar. Excluir una barra: data-sin-limpiador.
 * ════════════════════════════════════════════════════════════════ */
const LF_BARRAS = '.pat-toolbar, .turnos-toolbar, #ppa-filtros, .br-filtros, #ar-filtros';
const LF_CON_PROPIO = '#prio-limpiar, #tb-limpiar, #pl-limpiar';

/** Controles de filtro de una barra (sin botones, archivos ni ocultos). */
function lfControles_(barra) {
  return [...barra.querySelectorAll('select, input')].filter(el => {
    if (el.closest('.lf-limpiar') || el.hasAttribute('data-no-limpiar')) return false;
    const t = (el.type || '').toLowerCase();
    return !['button', 'submit', 'reset', 'file', 'hidden', 'image', 'color', 'range', 'password'].includes(t);
  });
}
function lfClave_(el, i) { return el.id || el.name || ('#' + i); }
function lfValor_(el) {
  if (el.tagName === 'SELECT') return JSON.stringify(typeof valoresSel_ === 'function' ? valoresSel_(el) : [el.value]);
  if (el.type === 'checkbox' || el.type === 'radio') return el.checked ? '1' : '0';
  return el.value || '';
}
function lfFijar_(el, v) {
  if (el.tagName === 'SELECT') {
    const vals = JSON.parse(v || '[]');
    if (typeof fijarValoresSel_ === 'function') { fijarValoresSel_(el, vals); }   // ya dispara 'change'
    else { el.value = vals[0] || ''; el.dispatchEvent(new Event('change', { bubbles: true })); }
    return;
  }
  if (el.type === 'checkbox' || el.type === 'radio') el.checked = v === '1'; else el.value = v;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}
/** Foto de la barra (una sola vez, antes de la primera interacción). Los controles nuevos que aparezcan después se suman. */
function lfFoto_(barra) {
  const foto = barra._lfFoto || (barra._lfFoto = {});
  lfControles_(barra).forEach((el, i) => { const k = lfClave_(el, i); if (!(k in foto)) foto[k] = lfValor_(el); });
  return foto;
}
function lfCambiados_(barra) {
  if (!barra._lfFoto) return [];
  const foto = barra._lfFoto;
  return lfControles_(barra).map((el, i) => ({ el, k: lfClave_(el, i) })).filter(x => x.k in foto && lfValor_(x.el) !== foto[x.k]);
}
function lfActualizarBoton_(barra) {
  const b = barra._lfBoton; if (!b) return;
  const n = lfCambiados_(barra).length;
  b.style.display = n ? '' : 'none';
  b.querySelector('span').textContent = n;
}
function lfLimpiar_(barra) {
  const foto = barra._lfFoto; if (!foto) return;
  // Uno a uno, volviendo a buscar el control cada vez: algunos paneles redibujan sus filtros al cambiar uno
  for (let vuelta = 0; vuelta < 3; vuelta++) {
    const pend = lfCambiados_(barra); if (!pend.length) break;
    pend.forEach(({ k }) => {
      const el = lfControles_(barra).find((c, i) => lfClave_(c, i) === k);
      if (el && lfValor_(el) !== foto[k]) lfFijar_(el, foto[k]);
    });
  }
  lfActualizarBoton_(barra);
}
/** Instala el botón en una barra (idempotente). */
function lfInstalar_(barra) {
  if (barra._lfBoton || barra.hasAttribute('data-sin-limpiador') || barra.querySelector(LF_CON_PROPIO)) return;
  if (lfControles_(barra).length < 2) return;   // un solo selector (p. ej. comuna del Dashboard) no es una barra de filtros
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'lf-limpiar'; b.title = 'Quitar los filtros y volver a como estaba el panel al abrirlo';
  b.innerHTML = '✕ Limpiar filtros <span></span>';
  b.style.display = 'none';
  b.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); lfLimpiar_(barra); });
  const destino = barra.querySelector('.pat-toolbar-left') || barra;
  destino.appendChild(b);
  barra._lfBoton = b;
  // Foto ANTES del primer cambio (captura: corre antes que los manejadores del panel)
  const foto = () => lfFoto_(barra);
  barra.addEventListener('pointerdown', foto, true);
  barra.addEventListener('focusin', foto, true);
  barra.addEventListener('keydown', foto, true);
  const revisar = () => setTimeout(() => lfActualizarBoton_(barra), 0);
  barra.addEventListener('input', revisar);
  barra.addEventListener('change', revisar);
}
function lfBarrasEn_(raiz) {
  const set = new Set();
  if (!raiz || !raiz.querySelectorAll) return set;
  if (raiz.matches && raiz.matches(LF_BARRAS)) set.add(raiz);
  raiz.querySelectorAll(LF_BARRAS).forEach(b => set.add(b));
  // Búsquedas de Administración que no están dentro de una barra conocida: su contenedor directo
  // (solo si TODOS sus controles son búsquedas/filtros .admin-search: así nunca aparece dentro de un formulario de edición)
  raiz.querySelectorAll('.admin-search').forEach(el => {
    const p = el.parentElement;
    if (!p || el.closest(LF_BARRAS) || el.closest('form, .modal, .br-modal')) return;
    if (lfControles_(p).every(c => c.classList.contains('admin-search'))) set.add(p);
  });
  return set;
}
function lfEscanear_(raiz) { lfBarrasEn_(raiz || document.body).forEach(lfInstalar_); }

// Paneles que se dibujan después (innerHTML): se revisan al aparecer, agrupando los cambios
(function iniciarLimpiadorFiltros_() {
  let pend = false;
  const programar = () => { if (pend) return; pend = true; setTimeout(() => { pend = false; lfEscanear_(document.body); }, 300); };
  document.addEventListener('DOMContentLoaded', () => {
    lfEscanear_(document.body);
    new MutationObserver(programar).observe(document.body, { childList: true, subtree: true });
  });
  // Un filtro cambiado desde el código (p. ej. clic en una tarjeta) también actualiza el contador
  document.addEventListener('change', e => { const b = e.target.closest && e.target.closest(LF_BARRAS); if (b && b._lfBoton) setTimeout(() => lfActualizarBoton_(b), 0); }, true);
})();
