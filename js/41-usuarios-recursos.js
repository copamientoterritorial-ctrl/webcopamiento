/* ============ 🔑 USUARIOS RECURSOS — cuentas de la App Bitácora (Administración, solo Admin, 21-11-2026, SQL 186) ============
 * Cada recurso de prevención de la bitácora (BMP, Brigada Disuasiva, Vigía Camioneta, Vigía Motorizado) puede tener UNA cuenta propia
 * para ingresar a la App Bitácora (/app-bitacora/app.html) con su USUARIO (el del líder / titular, p. ej. amedina) y la CLAVE (por defecto
 * <tipo>.2627, BMP → bmp.2627).
 *   · Listado: RPC bit_cuentas_recursos() (solo Admin).
 *   · Crear / cambiar clave / activar / desactivar / eliminar: Edge Function «admin-cuentas-recurso» (Auth necesita la llave de servicio).
 *   · Las cuentas de recurso NO entran a la web del copamiento ni aparecen en Administración › Usuarios.
 * La clave solo se ve al crearla o cambiarla (no se guarda en ninguna parte): copiarla, enviarla por WhatsApp o bajar el Excel. */
const UR_DOMINIO = 'recursos.copamientoterritorial.cl';   // = DOMINIO de la Edge Function y DOMINIO_CUENTAS de app-bitacora
const UR_APP_URL = 'https://www.copamientoterritorial.cl/app-bitacora/app.html';
state.ur = state.ur || { filas: [], area: '', tipo: '', estado: '', q: '', lideres: {} };
// 22-11-2026: USUARIO = líder del recurso (el ⭐ titular de 👥 Personas o, si no hay, el Jefe de Brigada): inicial del primer nombre +
// primer apellido (Alex Medina → amedina; Juan Carlos Pérez González → jperez). CLAVE por defecto = <tipo>.2627 (BMP → bmp.2627).
const UR_TEMPORADA = '2627';
function urClaveDefecto_(r) { return String(r.tipo_codigo || 'rec').toLowerCase() + '.' + UR_TEMPORADA; }
/** Líder del recurso: titular; si no, la persona con cargo «Jefe…» (Jefe de Brigada). */
function urLider_(r) {
  const ps = state.ur.lideres[r.recurso_id] || [];
  return ps.find(p => p.titular) || ps.find(p => /^jefe/i.test(String(p.cargo || '').trim())) || null;
}
/** Usuario a partir del nombre: inicial del primer nombre + primer apellido (2–3 palabras: la 2ª; 4 o más: la penúltima). */
function urUsuarioDeNombre_(nombre) {
  const t = String(nombre || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z\s]/g, ' ').trim().split(/\s+/).filter(Boolean);
  if (t.length < 2) return '';
  const ape = t.length >= 4 ? t[t.length - 2] : t[1];
  return (t[0][0] + ape).slice(0, 40);
}
/** Usuario para MOSTRAR (23-11-2026): en mayúsculas (caninir → CANINIR). Se guarda y se ingresa en minúsculas: la app acepta cualquiera. */
const urU_ = u => String(u || '').toUpperCase();
function urUsuarioSugerido_(r) {
  const l = urLider_(r);
  return l ? urUsuarioDeNombre_(l.nombre) : '';
}

async function urInvocar_(body) {
  const { data, error } = await supabaseClient.functions.invoke('admin-cuentas-recurso', { body });
  if (error || !data || !data.ok) {
    let msg = await mensajeErrorEdgeFunction_(data, error);
    if (/Failed to send|not found|404|FunctionsFetchError|FunctionsRelayError/i.test(msg)) msg = 'Falta crear la Edge Function «admin-cuentas-recurso» en Supabase (' + msg + ').';
    throw new Error(msg);
  }
  return data;
}

function urFecha_(f) {
  if (!f) return '';
  const d = new Date(f);
  return isNaN(d) ? '' : d.toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' }) + ' ' + d.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
}
function urEstado_(r) {
  if (!r.usuario_id) return 'sin';
  if (!r.es_cuenta_recurso) return 'plataforma';
  return r.activo ? 'activa' : 'inactiva';
}
const UR_ESTADOS = {
  sin: { t: 'Sin cuenta', c: '#94A3B8' },
  activa: { t: 'Activa', c: '#16A34A' },
  inactiva: { t: 'Desactivada', c: '#DC2626' },
  plataforma: { t: 'Usuario de la plataforma', c: '#2563EB' },
};
function urFiltradas_() {
  const s = state.ur, q = normalizarBusqueda_(s.q || '');
  return s.filas.filter(r => (!s.area || areaClave_(r.area) === areaClave_(s.area)) &&
    (!s.tipo || r.tipo_codigo === s.tipo) &&
    (!s.estado || urEstado_(r) === s.estado) &&
    (!q || normalizarBusqueda_([r.clave_radial, r.codigo_ref, r.usuario, r.empresa, r.comuna].join(' ')).includes(q)));
}
function urTextoCredencial_(c) {
  return '🔑 App Bitácora · ' + (c.recurso || '') + '\nIngresa en: ' + UR_APP_URL + '\nUsuario: ' + urU_(c.usuario) + '\nClave: ' + c.clave +
    '\n(Escribe solo el usuario, sin @. Guarda la clave: no se puede volver a ver.)';
}

async function adminSeccionUsuariosRecursos_(c) {
  c.innerHTML = adminHead_('🔑 Usuarios Recursos', 'Cargando…');
  const [{ data, error }, pers] = await Promise.all([
    supabaseClient.rpc('bit_cuentas_recursos'),
    (async () => {   // personas de los recursos (SQL 147) para el líder / titular
      const out = [];
      for (let d = 0; ; d += 1000) {
        const r = await supabaseClient.from('recurso_personas').select('recurso_id, nombre, cargo, titular').range(d, d + 999);
        if (r.error) break;
        out.push(...(r.data || []));
        if (!r.data || r.data.length < 1000) break;
      }
      return out;
    })(),
  ]);
  state.ur.lideres = {};
  pers.forEach(p => { (state.ur.lideres[p.recurso_id] = state.ur.lideres[p.recurso_id] || []).push(p); });
  if (error) {
    c.innerHTML = adminHead_('🔑 Usuarios Recursos', '') + '<div class="gr-aviso">⚠️ ' + escapeHtml_(/bit_cuentas_recursos|function|schema cache/i.test(error.message) ? 'Falta ejecutar en Supabase el SQL 186.' : error.message) + '</div>';
    return;
  }
  state.ur.filas = data || [];
  urRender_(c);
}

function urRender_(c) {
  const s = state.ur, filas = s.filas, vis = urFiltradas_();
  const n = k => filas.filter(r => urEstado_(r) === k).length;
  const ingresaron = filas.filter(r => r.es_cuenta_recurso && r.ultimo_ingreso).length;
  const areas = [...new Set(filas.map(r => r.area).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
  const tipos = [...new Map(filas.map(r => [r.tipo_codigo, r.tipo_nombre])).entries()];
  const sinCuentaTodas = vis.filter(r => urEstado_(r) === 'sin');
  const sinCuentaVis = sinCuentaTodas.filter(r => urUsuarioSugerido_(r));   // el lote solo crea las que tienen líder / titular
  const sinLider = sinCuentaTodas.length - sinCuentaVis.length;
  const opt = (v, t, sel) => '<option value="' + escapeHtml_(v) + '"' + (sel ? ' selected' : '') + '>' + escapeHtml_(t) + '</option>';
  const tabla = vis.map(r => {
    const e = urEstado_(r), est = UR_ESTADOS[e];
    let acc = '';
    if (e === 'sin') acc = '<button class="btn-primary" data-ur-crear="' + r.recurso_id + '" style="padding:6px 10px;">➕ Crear cuenta</button>';
    else if (e === 'plataforma') acc = '<small style="color:var(--text-tertiary);">Se administra en 👥 Usuarios</small>';
    else acc = '<button class="popup-btn" data-ur-clave="' + r.usuario_id + '" title="Asignar una clave nueva">🔑 Clave</button> ' +
      '<button class="popup-btn" data-ur-estado="' + r.usuario_id + '" data-activo="' + (r.activo ? '0' : '1') + '" title="' + (r.activo ? 'Bloquear el ingreso' : 'Permitir el ingreso') + '">' + (r.activo ? '⏸️ Desactivar' : '▶️ Activar') + '</button> ' +
      '<button class="popup-btn" data-ur-borrar="' + r.usuario_id + '" title="Eliminar la cuenta">🗑️</button>';
    return '<tr><td><b>' + escapeHtml_(r.clave_radial || r.codigo_ref || '—') + '</b><small style="display:block;color:var(--text-tertiary);">' + escapeHtml_([r.codigo_ref, r.empresa].filter(Boolean).join(' · ')) + '</small></td>' +
      '<td>' + escapeHtml_(r.tipo_nombre || r.tipo_codigo || '') + '</td>' +
      '<td>' + (() => { const l = urLider_(r); return l ? escapeHtml_(l.nombre) + '<small style="display:block;color:var(--text-tertiary);">' + (l.titular ? '⭐ Titular' : escapeHtml_(l.cargo || '')) + '</small>'
        : '<span style="color:#DC2626;font-size:12px;" title="Regístralo en Gestión de Recursos › 👥 Personas (⭐ titular)">Sin titular</span>'; })() + '</td>' +
      '<td>' + escapeHtml_(aTitulo_(r.area || '—')) + '<small style="display:block;color:var(--text-tertiary);">' + escapeHtml_(aTitulo_(r.comuna || '')) + '</small></td>' +
      '<td>' + (r.usuario ? '<code>' + escapeHtml_(urU_(r.usuario)) + '</code>' : (r.correo ? escapeHtml_(r.correo) : '—')) + '</td>' +
      '<td><span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:700;color:#fff;background:' + est.c + ';">' + est.t + '</span></td>' +
      '<td>' + (r.ultimo_ingreso ? escapeHtml_(urFecha_(r.ultimo_ingreso)) : (r.usuario_id ? '<span style="color:var(--text-tertiary);">Nunca</span>' : '')) + '</td>' +
      '<td style="text-align:center;">' + (r.usuario_id ? Number(r.n_jornadas || 0) : '') + '</td>' +
      '<td style="white-space:nowrap;">' + acc + '</td></tr>';
  }).join('');
  c.innerHTML = adminHead_('🔑 Usuarios Recursos',
    'Cuentas con las que cada recurso de prevención ingresa a la <b>App Bitácora</b> (' + escapeHtml_(UR_APP_URL.replace('https://', '')) + ') con su usuario y la clave que asignes. No entran a la web del copamiento.',
    '<button class="btn-secondary" id="ur-excel">⬇️ Excel</button>') +
    '<div class="dash-kpis" style="margin-bottom:14px;">' +
      kpi_('Recursos de la bitácora', filas.length, 'BMP · B. Disuasiva · Vigías') + kpi_('Con cuenta activa', n('activa'), ingresaron + ' ya ingresaron') +
      kpi_('Sin cuenta', n('sin'), 'por crear') + kpi_('Desactivadas', n('inactiva'), 'sin ingreso') + '</div>' +
    '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:10px;">' +
      '<select id="ur-area" class="admin-search" style="max-width:220px;">' + opt('', '🧭 Todas las áreas', !s.area) + areas.map(a => opt(a, aTitulo_(a), s.area === a)).join('') + '</select>' +
      '<select id="ur-tipo" class="admin-search" style="max-width:220px;">' + opt('', 'Todos los tipos', !s.tipo) + tipos.map(([k, t]) => opt(k, t || k, s.tipo === k)).join('') + '</select>' +
      '<select id="ur-estado" class="admin-search" style="max-width:200px;">' + opt('', 'Todos los estados', !s.estado) + Object.keys(UR_ESTADOS).map(k => opt(k, UR_ESTADOS[k].t, s.estado === k)).join('') + '</select>' +
      '<input id="ur-q" class="admin-search" placeholder="Buscar clave, código, usuario, empresa…" value="' + escapeHtml_(s.q || '') + '" style="max-width:280px;">' +
      '<button class="btn-primary" id="ur-lote"' + (sinCuentaVis.length ? '' : ' disabled') + ' title="Crea la cuenta de cada recurso sin cuenta de la lista filtrada: usuario del líder / titular y clave por defecto (BMP → bmp.' + UR_TEMPORADA + '); baja un Excel con usuarios y claves">➕ Crear cuentas faltantes (' + sinCuentaVis.length + ')</button>' +
    '</div>' +
    '<div style="font-size:12px;color:var(--text-tertiary);margin-bottom:6px;">👤 Usuario = líder del recurso (⭐ titular de 👥 Personas o Jefe de Brigada): inicial del primer nombre + primer apellido (Alex Medina → <code>amedina</code>). ' +
      '🔑 Clave por defecto = tipo + «.' + UR_TEMPORADA + '» (BMP → <code>bmp.' + UR_TEMPORADA + '</code>).' +
      (sinLider ? ' <b style="color:#DC2626;">' + sinLider + ' recurso(s) sin titular</b>: regístralo en Gestión de Recursos › 👥 Personas o crea su cuenta a mano.' : '') + '</div>' +
    '<div style="font-size:12px;color:var(--text-tertiary);margin-bottom:6px;">' + vis.length + ' de ' + filas.length + ' recurso(s)</div>' +
    '<div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Recurso</th><th>Tipo</th><th>Líder / titular</th><th>Área</th><th>Usuario</th><th>Estado</th><th>Último ingreso</th><th>Aperturas</th><th></th></tr></thead><tbody>' +
      (tabla || '<tr><td colspan="9">Sin recursos con estos filtros</td></tr>') + '</tbody></table></div>';

  const rerender = () => urRender_(c);
  c.querySelector('#ur-area').addEventListener('change', e => { s.area = e.target.value; rerender(); });
  c.querySelector('#ur-tipo').addEventListener('change', e => { s.tipo = e.target.value; rerender(); });
  c.querySelector('#ur-estado').addEventListener('change', e => { s.estado = e.target.value; rerender(); });
  const q = c.querySelector('#ur-q');
  q.addEventListener('input', () => {
    clearTimeout(s.tq);
    s.tq = setTimeout(() => { s.q = q.value; rerender(); const n2 = c.querySelector('#ur-q'); n2.focus(); n2.setSelectionRange(n2.value.length, n2.value.length); }, 300);
  });
  c.querySelector('#ur-excel').addEventListener('click', () => urExcel_(vis));
  c.querySelector('#ur-lote').addEventListener('click', () => urCrearLote_(c, sinCuentaVis));
  c.querySelectorAll('[data-ur-crear]').forEach(b => b.addEventListener('click', () => urModalCrear_(c, filas.find(r => r.recurso_id === b.dataset.urCrear))));
  c.querySelectorAll('[data-ur-clave]').forEach(b => b.addEventListener('click', () => urModalClave_(c, filas.find(r => r.usuario_id === b.dataset.urClave))));
  c.querySelectorAll('[data-ur-estado]').forEach(b => b.addEventListener('click', async () => {
    const r = filas.find(x => x.usuario_id === b.dataset.urEstado), activo = b.dataset.activo === '1';
    if (!activo && !confirm('¿Desactivar la cuenta «' + urU_(r.usuario) + '»? El recurso no podrá ingresar a la App Bitácora hasta que la actives.')) return;
    b.disabled = true;
    try { await urInvocar_({ action: 'estado', usuario_id: r.usuario_id, activo }); mostrarToast_(activo ? '✅ Cuenta activada' : 'Cuenta desactivada'); adminSeccionUsuariosRecursos_(c); }
    catch (e) { b.disabled = false; mostrarToast_('⚠️ ' + e.message); }
  }));
  c.querySelectorAll('[data-ur-borrar]').forEach(b => b.addEventListener('click', async () => {
    const r = filas.find(x => x.usuario_id === b.dataset.urBorrar);
    const aviso = Number(r.n_jornadas) > 0 ? '\n\nRegistró ' + r.n_jornadas + ' apertura(s): se conservan, pero se recomienda DESACTIVAR en vez de eliminar.' : '';
    if (!confirm('¿Eliminar la cuenta «' + urU_(r.usuario) + '» de ' + (r.clave_radial || r.codigo_ref) + '? No se puede deshacer.' + aviso)) return;
    b.disabled = true;
    try { await urInvocar_({ action: 'eliminar', usuario_id: r.usuario_id }); mostrarToast_('Cuenta eliminada'); adminSeccionUsuariosRecursos_(c); }
    catch (e) { b.disabled = false; mostrarToast_('⚠️ ' + e.message); }
  }));
}

function urOverlay_() {
  let ov = document.getElementById('ur-overlay');
  if (!ov) {
    ov = document.createElement('div'); ov.id = 'ur-overlay'; ov.className = 'modal-overlay';
    document.body.appendChild(ov);
    ov.addEventListener('click', e => { if (e.target === ov) ov.classList.remove('show'); });
  }
  return ov;
}

/** Crear la cuenta de un recurso: usuario (sugerido = código) y clave (vacía = al azar). */
function urModalCrear_(c, r) {
  const ov = urOverlay_();
  ov.innerHTML = '<div class="modal-card" style="max-width:440px;">' +
    '<h3>➕ Cuenta para ' + escapeHtml_(r.clave_radial || r.codigo_ref) + '</h3>' +
    '<p class="coords">' + escapeHtml_([r.tipo_nombre, aTitulo_(r.area || ''), r.empresa].filter(Boolean).join(' · ')) + '</p>' +
    (() => { const l = urLider_(r); return l ? '<p class="coords">👤 Líder: <b>' + escapeHtml_(l.nombre) + '</b> (' + (l.titular ? '⭐ titular' : escapeHtml_(l.cargo || '')) + ')</p>'
      : '<div class="gr-aviso">⚠️ Sin titular ni Jefe de Brigada en 👥 Personas: escribe el usuario a mano (inicial del nombre + apellido del líder).</div>'; })() +
    '<div class="form-group"><label>Usuario</label><input id="ur-u" value="' + escapeHtml_(urU_(urUsuarioSugerido_(r))) + '" autocomplete="off" placeholder="AMEDINA" style="text-transform:uppercase;">' +
      '<small style="color:var(--text-tertiary);">Inicial del primer nombre + primer apellido del líder. Si ya existe, se agrega un número (AMEDINA2). Se muestra en mayúsculas; el recurso puede escribirlo en mayúsculas o minúsculas.</small></div>' +
    '<div class="form-group"><label>Clave</label><input id="ur-k" type="text" autocomplete="new-password" value="' + escapeHtml_(urClaveDefecto_(r)) + '">' +
      '<small style="color:var(--text-tertiary);">Por defecto ' + escapeHtml_(urClaveDefecto_(r)) + '. Mínimo 6 caracteres.</small></div>' +
    '<div class="gr-aviso" id="ur-err" style="display:none;"></div>' +
    '<div class="modal-actions" style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px;">' +
      '<button class="btn-secondary" id="ur-cancelar">Cancelar</button><button class="btn-primary" id="ur-ok">Crear cuenta</button></div></div>';
  ov.classList.add('show');
  ov.querySelector('#ur-cancelar').addEventListener('click', () => ov.classList.remove('show'));
  ov.querySelector('#ur-ok').addEventListener('click', async () => {
    const usuario = ov.querySelector('#ur-u').value.trim().toLowerCase(), clave = ov.querySelector('#ur-k').value.trim();
    const err = ov.querySelector('#ur-err'), btn = ov.querySelector('#ur-ok');
    const falla = m => { err.textContent = '⚠️ ' + m; err.style.display = ''; };
    if (!/^[a-z0-9][a-z0-9._-]{2,39}$/.test(usuario)) return falla('Usuario no válido: 3 a 40 letras, números, punto, guion o guion bajo.');
    if (clave && clave.length < 6) return falla('La clave debe tener al menos 6 caracteres.');
    btn.disabled = true; btn.textContent = 'Creando…';
    try {
      const d = await urInvocar_({ action: 'crear', recurso_id: r.recurso_id, usuario, clave: clave || urClaveDefecto_(r), numerar: true });
      urMostrarCredenciales_([d.cuenta], 'Cuenta creada');
      adminSeccionUsuariosRecursos_(c);
    } catch (e) { btn.disabled = false; btn.textContent = 'Crear cuenta'; falla(e.message); }
  });
}

function urModalClave_(c, r) {
  const ov = urOverlay_();
  ov.innerHTML = '<div class="modal-card" style="max-width:420px;">' +
    '<h3>🔑 Clave nueva · ' + escapeHtml_(urU_(r.usuario)) + '</h3>' +
    '<p class="coords">' + escapeHtml_(r.clave_radial || r.codigo_ref || '') + ' · la clave anterior deja de servir.</p>' +
    '<div class="form-group"><label>Clave nueva</label><input id="ur-k" type="text" autocomplete="new-password" value="' + escapeHtml_(urClaveDefecto_(r)) + '" placeholder="Vacía = se genera una al azar">' +
      '<small style="color:var(--text-tertiary);">Por defecto ' + escapeHtml_(urClaveDefecto_(r)) + '; bórrala para generar una al azar.</small></div>' +
    '<div class="gr-aviso" id="ur-err" style="display:none;"></div>' +
    '<div class="modal-actions" style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px;">' +
      '<button class="btn-secondary" id="ur-cancelar">Cancelar</button><button class="btn-primary" id="ur-ok">Asignar clave</button></div></div>';
  ov.classList.add('show');
  ov.querySelector('#ur-cancelar').addEventListener('click', () => ov.classList.remove('show'));
  ov.querySelector('#ur-ok').addEventListener('click', async () => {
    const clave = ov.querySelector('#ur-k').value.trim(), err = ov.querySelector('#ur-err'), btn = ov.querySelector('#ur-ok');
    if (clave && clave.length < 6) { err.textContent = '⚠️ La clave debe tener al menos 6 caracteres.'; err.style.display = ''; return; }
    btn.disabled = true; btn.textContent = 'Guardando…';
    try {
      const d = await urInvocar_({ action: 'clave', usuario_id: r.usuario_id, clave: clave || undefined });
      urMostrarCredenciales_([{ recurso: r.clave_radial || r.codigo_ref, usuario: d.usuario || r.usuario, clave: d.clave }], 'Clave asignada');
      adminSeccionUsuariosRecursos_(c);
    } catch (e) { btn.disabled = false; btn.textContent = 'Asignar clave'; err.textContent = '⚠️ ' + e.message; err.style.display = ''; }
  });
}

/** Crea las cuentas de los recursos sin cuenta (y con líder) de la lista filtrada, en grupos de 20: usuario del líder y clave por defecto. */
async function urCrearLote_(c, lista) {
  if (!lista.length) return;
  if (!confirm('¿Crear ' + lista.length + ' cuenta(s)?\n\n· Usuario: inicial del nombre + apellido del líder / titular (si se repite, se agrega un número).\n· Clave: la por defecto de cada tipo (BMP → bmp.' + UR_TEMPORADA + ').\n\nAl terminar se descarga un Excel con los usuarios y claves.')) return;
  const btn = c.querySelector('#ur-lote'); btn.disabled = true;
  const cuentas = [], errores = [];
  for (let i = 0; i < lista.length; i += 20) {
    btn.textContent = '⏳ Creando ' + Math.min(i + 20, lista.length) + ' / ' + lista.length + '…';
    try {
      const d = await urInvocar_({ action: 'crear_lote', items: lista.slice(i, i + 20).map(r => ({ recurso_id: r.recurso_id, usuario: urUsuarioSugerido_(r), clave: urClaveDefecto_(r) })) });
      cuentas.push(...(d.cuentas || [])); errores.push(...(d.errores || []));
    } catch (e) { errores.push(...lista.slice(i, i + 20).map(r => ({ recurso_id: r.recurso_id, error: e.message }))); if (/Edge Function/.test(e.message)) break; }
  }
  if (cuentas.length) urExcelCredenciales_(cuentas);
  urMostrarCredenciales_(cuentas, cuentas.length + ' cuenta(s) creada(s)', errores.map(x => {
    const r = state.ur.filas.find(f => f.recurso_id === x.recurso_id) || {};
    return (r.clave_radial || r.codigo_ref || x.recurso_id) + ': ' + x.error;
  }));
  adminSeccionUsuariosRecursos_(c);
}

/** Ventana con las credenciales recién creadas (copiar / WhatsApp / Excel). */
function urMostrarCredenciales_(cuentas, titulo, errores) {
  const ov = urOverlay_();
  const filas = cuentas.map((k, i) => '<tr><td><b>' + escapeHtml_(k.recurso || '') + '</b></td><td><code>' + escapeHtml_(urU_(k.usuario)) + '</code></td><td><code>' + escapeHtml_(k.clave) + '</code></td>' +
    '<td style="white-space:nowrap;"><button class="popup-btn" data-ur-copiar="' + i + '" title="Copiar el mensaje">📋</button> ' +
    '<a class="popup-btn" target="_blank" rel="noopener" href="https://wa.me/?text=' + encodeURIComponent(urTextoCredencial_(k)) + '" title="Enviar por WhatsApp">💬</a></td></tr>').join('');
  ov.innerHTML = '<div class="modal-card" style="max-width:620px;">' +
    '<h3>✅ ' + escapeHtml_(titulo) + '</h3>' +
    '<p class="coords">Entrega a cada recurso su usuario y clave. <b>La clave no se puede volver a ver</b>: si se pierde, asigna una nueva con 🔑 Clave. Ingreso: ' + escapeHtml_(UR_APP_URL.replace('https://', '')) + '</p>' +
    (cuentas.length ? '<div class="admin-table-wrap" style="max-height:340px;overflow:auto;"><table class="admin-table"><thead><tr><th>Recurso</th><th>Usuario</th><th>Clave</th><th></th></tr></thead><tbody>' + filas + '</tbody></table></div>' : '') +
    (errores && errores.length ? '<div class="gr-aviso" style="margin-top:10px;max-height:140px;overflow:auto;">⚠️ No se crearon ' + errores.length + ':<br>' + errores.map(escapeHtml_).join('<br>') + '</div>' : '') +
    '<div class="modal-actions" style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px;">' +
      (cuentas.length ? '<button class="btn-secondary" id="ur-cred-excel">⬇️ Excel con claves</button>' : '') +
      '<button class="btn-primary" id="ur-cred-cerrar">Listo</button></div></div>';
  ov.classList.add('show');
  ov.querySelector('#ur-cred-cerrar').addEventListener('click', () => ov.classList.remove('show'));
  const bx = ov.querySelector('#ur-cred-excel'); if (bx) bx.addEventListener('click', () => urExcelCredenciales_(cuentas));
  ov.querySelectorAll('[data-ur-copiar]').forEach(b => b.addEventListener('click', async () => {
    const t = urTextoCredencial_(cuentas[Number(b.dataset.urCopiar)]);
    try { await navigator.clipboard.writeText(t); mostrarToast_('📋 Copiado'); } catch (e) { prompt('Copia el mensaje:', t); }
  }));
}

function urExcelCredenciales_(cuentas) {
  try {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(cuentas.map(k => {
      const r = state.ur.filas.find(f => f.recurso_id === k.recurso_id) || {};
      return { 'Recurso': k.recurso || r.clave_radial || '', 'Código': r.codigo_ref || '', 'Tipo': r.tipo_nombre || '', 'Área': aTitulo_(r.area || ''),
        'Empresa': r.empresa || '', 'Usuario': urU_(k.usuario), 'Clave': k.clave, 'Ingreso': UR_APP_URL };
    }));
    ws['!cols'] = [16, 14, 22, 20, 22, 16, 12, 50].map(wch => ({ wch }));
    XLSX.utils.book_append_sheet(wb, ws, 'Cuentas');
    XLSX.writeFile(wb, 'cuentas_recursos_bitacora_' + tbHoyISO_() + '.xlsx');
  } catch (e) { mostrarToast_('No se pudo generar el Excel: ' + (e.message || e)); }
}

function urExcel_(lista) {
  try {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(lista.map(r => ({ 'Recurso': r.clave_radial || '', 'Código': r.codigo_ref || '', 'Tipo': r.tipo_nombre || '',
      'Área': aTitulo_(r.area || ''), 'Subgerencia': aTitulo_(r.subgerencia || ''), 'Comuna': aTitulo_(r.comuna || ''), 'Empresa': r.empresa || '',
      'Usuario': r.usuario ? urU_(r.usuario) : (r.correo || ''), 'Estado': UR_ESTADOS[urEstado_(r)].t, 'Último ingreso': urFecha_(r.ultimo_ingreso),
      'Clave cambiada': urFecha_(r.clave_cambiada_en), 'Aperturas': r.usuario_id ? Number(r.n_jornadas || 0) : '' })));
    XLSX.utils.book_append_sheet(wb, ws, 'Usuarios Recursos');
    XLSX.writeFile(wb, 'usuarios_recursos_' + tbHoyISO_() + '.xlsx');
  } catch (e) { mostrarToast_('No se pudo generar el Excel: ' + (e.message || e)); }
}
