/* ============ INSTITUCIONES (solo Administrador) — catálogo con color/ícono/estado ============ */
state.instituciones = state.instituciones || [];
let editingInstitucionId = null;

async function abrirPanelInstituciones_() {
  document.getElementById('instituciones-panel-overlay').classList.add('show');
  await cargarInstitucionesAdmin();
}

async function cargarInstitucionesAdmin() {
  refrescarAdminSiVisible_();
  const cont = document.getElementById('instituciones-panel-list');
  cont.innerHTML = '<div class="layer-empty-msg">Cargando…</div>';
  const { data, error } = await supabaseClient.from('instituciones').select('*').order('nombre');
  if (error) {
    cont.innerHTML = '<div class="layer-empty-msg">No se pudo cargar: ' + error.message + '</div>';
    return;
  }
  state.instituciones = data || [];
  renderInstitucionesPanelList_();
}

function renderInstitucionesPanelList_() {
  const cont = document.getElementById('instituciones-panel-list');
  cont.innerHTML = '';
  if (state.instituciones.length === 0) {
    const msg = document.createElement('div'); msg.className = 'layer-empty-msg';
    msg.textContent = 'Sin instituciones registradas.';
    cont.appendChild(msg);
    return;
  }
  state.instituciones.forEach(i => {
    const card = document.createElement('div'); card.className = 'user-card';
    card.innerHTML =
      '<div class="uc-top"><div class="uc-name"><span class="rc-sw" style="background:' + i.color_hex + ';display:inline-block;width:11px;height:11px;border-radius:3px;margin-right:7px;vertical-align:middle;"></span>' + i.nombre + '</div>' +
      (i.estado === 'inactivo' ? '<span class="uc-badge estado-inactivo">Inactiva</span>' : '') + '</div>' +
      '<div class="uc-comunas">Ícono: ' + (i.icono_key || '—') + '</div>' +
      '<div class="uc-actions">' +
      '<button class="popup-btn" data-accion="editar">Editar</button>' +
      '<button class="popup-btn" data-accion="estado">' + (i.estado === 'activo' ? 'Desactivar' : 'Activar') + '</button>' +
      '</div>';
    card.querySelector('[data-accion="editar"]').addEventListener('click', () => abrirModalInstitucion_(i));
    card.querySelector('[data-accion="estado"]').addEventListener('click', () => toggleEstadoInstitucion_(i.id, i.estado));
    cont.appendChild(card);
  });
}

function abrirModalInstitucion_(inst) {
  editingInstitucionId = inst ? inst.id : null;
  document.getElementById('institucion-modal-title').textContent = inst ? 'Editar institución' : 'Nueva institución';
  document.getElementById('i-nombre').value = inst ? inst.nombre : '';
  document.getElementById('i-color').value = inst ? inst.color_hex : '#64748B';
  document.getElementById('i-icono').value = inst ? (inst.icono_key || '') : '';
  // Logo: mostrar el actual si existe
  const logoActual = inst ? (inst.logo_url || '') : '';
  document.getElementById('i-logo-url').value = logoActual;
  document.getElementById('i-logo-file').value = '';
  const prev = document.getElementById('i-logo-preview');
  const btnQuitar = document.getElementById('btn-quitar-logo');
  if (logoActual) { prev.src = logoActual; prev.style.display = 'block'; btnQuitar.style.display = 'inline-block'; }
  else { prev.src = ''; prev.style.display = 'none'; btnQuitar.style.display = 'none'; }
  document.getElementById('institucion-modal-error').classList.remove('show');
  document.getElementById('institucion-modal-overlay').classList.add('show');
}

async function guardarInstitucionDesdeModal_() {
  const btn = document.getElementById('btn-save-institucion');
  const errEl = document.getElementById('institucion-modal-error');
  errEl.classList.remove('show');

  const nombre = document.getElementById('i-nombre').value.trim();
  const color = document.getElementById('i-color').value;
  const icono = document.getElementById('i-icono').value.trim() || 'briefcase';

  if (!nombre) { errEl.textContent = 'El nombre es obligatorio.'; errEl.classList.add('show'); return; }

  btn.textContent = 'Guardando…'; btn.disabled = true;

  // Logo: si se seleccionó un archivo nuevo, subirlo al bucket público y usar su URL
  let logoUrl = document.getElementById('i-logo-url').value || null;
  const archivoLogo = document.getElementById('i-logo-file').files[0];
  if (archivoLogo) {
    const ext = (archivoLogo.name.split('.').pop() || 'png').toLowerCase();
    const ruta = 'inst_' + (editingInstitucionId || Date.now()) + '_' + Date.now() + '.' + ext;
    const { error: upErr } = await supabaseClient.storage.from('logos-instituciones')
      .upload(ruta, archivoLogo, { upsert: false, contentType: archivoLogo.type || 'image/png' });
    if (upErr) { btn.textContent = 'Guardar'; btn.disabled = false; errEl.textContent = 'No se pudo subir el logo: ' + upErr.message; errEl.classList.add('show'); return; }
    const { data: pub } = supabaseClient.storage.from('logos-instituciones').getPublicUrl(ruta);
    logoUrl = pub ? pub.publicUrl : null;
  }

  const payload = { nombre, color_hex: color, icono_key: icono, logo_url: logoUrl };
  const { error } = editingInstitucionId
    ? await supabaseClient.from('instituciones').update(payload).eq('id', editingInstitucionId)
    : await supabaseClient.from('instituciones').insert({ ...payload, estado: 'activo' });

  btn.textContent = 'Guardar'; btn.disabled = false;

  if (error) { errEl.textContent = 'No se pudo guardar: ' + error.message; errEl.classList.add('show'); return; }

  document.getElementById('institucion-modal-overlay').classList.remove('show');
  mostrarToast_(editingInstitucionId ? 'Institución actualizada.' : 'Institución creada.');
  editingInstitucionId = null;
  cargarInstitucionesAdmin();
  // Refresca también el catálogo usado en el formulario de recursos.
  supabaseClient.from('instituciones').select('id, nombre, color_hex, icono_key, logo_url').eq('estado', 'activo').order('nombre')
    .then(({ data }) => {
      state.instituciones = data || state.instituciones;
      const fInst = document.getElementById('f-institucion');
      fInst.innerHTML = '';
      (data || []).forEach(i => {
        const opt = document.createElement('option'); opt.value = i.id; opt.textContent = i.nombre;
        fInst.appendChild(opt);
      });
    });
}

async function toggleEstadoInstitucion_(id, estadoActual) {
  const nuevoEstado = estadoActual === 'activo' ? 'inactivo' : 'activo';
  const { error } = await supabaseClient.from('instituciones').update({ estado: nuevoEstado }).eq('id', id);
  if (error) { mostrarToast_('Error: ' + error.message); return; }
  mostrarToast_('Institución marcada como ' + nuevoEstado + '.');
  cargarInstitucionesAdmin();
}

function poblarComunasChecklist_(comunaIdsSeleccionadas) {
  const cont = document.getElementById('u-comunas-list');
  cont.innerHTML = '';
  document.getElementById('u-comunas-search').value = '';
  const porRegion = {};
  state.comunas.forEach(c => { (porRegion[c.region] = porRegion[c.region] || []).push(c); });
  const solo = document.getElementById('u-comunas-solo'); if (solo) solo.checked = false;
  Object.keys(porRegion).sort().forEach(region => {
    const grupo = document.createElement('div'); grupo.className = 'comuna-region-grupo';
    // Cabecera de región (fija al desplazar) con conteo y «Marcar todas / Quitar todas»
    const label = document.createElement('div'); label.className = 'region-label';
    label.innerHTML = '<span><span class="um-reg-nom"></span> <span class="um-reg-n"></span></span><button type="button" class="um-reg-btn">Marcar todas</button>';
    label.querySelector('.um-reg-nom').textContent = region;
    grupo.appendChild(label);
    const items = document.createElement('div'); items.className = 'um-reg-items';
    porRegion[region].sort((a, b) => a.comuna.localeCompare(b.comuna)).forEach(c => {
      const lab = document.createElement('label');
      lab.dataset.nombre = normalizarBusqueda_(c.comuna);
      const checked = comunaIdsSeleccionadas.includes(c.id) ? 'checked' : '';
      lab.innerHTML = '<input type="checkbox" value="' + c.id + '" ' + checked + '> ' + escapeHtml_(c.comuna);
      items.appendChild(lab);
    });
    grupo.appendChild(items);
    cont.appendChild(grupo);
  });
  actualizarConteoUsuario_();
}

function filtrarComunasChecklist_() {
  const filtro = normalizarBusqueda_(document.getElementById('u-comunas-search').value);
  const soloSel = !!(document.getElementById('u-comunas-solo') || {}).checked;
  document.querySelectorAll('#u-comunas-list .comuna-region-grupo').forEach(grupo => {
    let algunaVisible = false;
    grupo.querySelectorAll('label[data-nombre]').forEach(lab => {
      const coincide = (!filtro || lab.dataset.nombre.includes(filtro)) && (!soloSel || lab.querySelector('input').checked);
      lab.style.display = coincide ? 'flex' : 'none';
      if (coincide) algunaVisible = true;
    });
    grupo.style.display = algunaVisible ? 'block' : 'none';
  });
  actualizarConteoUsuario_();
}

/** Conteos (total, por región), resaltado de lo marcado y resumen de la columna izquierda. */
function actualizarConteoUsuario_() {
  const marcadas = [...document.querySelectorAll('#u-comunas-list input:checked')];
  document.querySelectorAll('#u-comunas-list label[data-nombre], #u-areas-list label').forEach(l => l.classList.toggle('sel', l.querySelector('input').checked));
  document.querySelectorAll('#u-comunas-list .comuna-region-grupo').forEach(g => {
    const ins = [...g.querySelectorAll('input')], n = ins.filter(i => i.checked).length;
    g.querySelector('.um-reg-n').textContent = '(' + n + ' / ' + ins.length + ')';
    const visibles = ins.filter(i => i.closest('label').style.display !== 'none');
    g.querySelector('.um-reg-btn').textContent = visibles.length && visibles.every(i => i.checked) ? 'Quitar todas' : 'Marcar todas';
  });
  const zonas = [...document.querySelectorAll('#u-areas-list input:checked')].map(i => i.value);
  const cc = document.getElementById('u-comunas-cuenta'), ca = document.getElementById('u-areas-cuenta');
  if (cc) cc.textContent = marcadas.length + ' seleccionada(s)';
  if (ca) ca.textContent = zonas.length + ' seleccionada(s)';
  const res = document.getElementById('u-resumen');
  if (!res) return;
  const perfil = document.getElementById('u-perfil').value;
  const verComunas = perfil !== 'Administrador', verZonas = perfil === 'Jefe de Área Relacionamiento' || perfil === PERFIL_GRT;
  const nombres = marcadas.map(i => i.closest('label').textContent.trim());
  res.innerHTML = perfil === 'Administrador' ? '🔑 El Administrador ve todas las comunas y áreas.' :
    (verZonas ? '<b>Zonas:</b> ' + (zonas.length ? escapeHtml_(zonas.join(', ')) : '<span style="color:#DC2626;">ninguna</span>') + '<br>' : '') +
    (verComunas ? '<b>Comunas (' + nombres.length + '):</b> ' + (nombres.length ? escapeHtml_(nombres.slice(0, 12).join(', ')) + (nombres.length > 12 ? '…' : '') : '<span style="color:' + (verZonas ? 'inherit' : '#DC2626') + ';">ninguna</span>') : '');
}

/** Comunas (comunas.id) que administra cada área, por clave de área sin tildes/espacios (v_area_comunas_admin). */
async function comunasPorAreaUsuario_(forzar) {
  if (state.comunasPorAreaUsr && !forzar) return state.comunasPorAreaUsr;
  const mapa = {};
  try {
    const { data } = await supabaseClient.from('v_area_comunas_admin').select('area, id_comuna');
    const slug = {}; (state.comunas || []).forEach(c => { slug[Number(c.id_comuna)] = c.id; });
    state.nombreAreaPorClave = state.nombreAreaPorClave || {};
    (data || []).forEach(x => { const s = slug[Number(x.id_comuna)]; if (!s) return; const k = SG_KEY(x.area); state.nombreAreaPorClave[k] = x.area; (mapa[k] = mapa[k] || []); if (!mapa[k].includes(s)) mapa[k].push(s); });
  } catch (e) { /* sin SQL 94 */ }
  state.comunasPorAreaUsr = mapa;
  return mapa;
}
/** Al marcar un área en el formulario de usuario, se marcan solas las comunas que administra. */
async function marcarComunasDeAreasUsuario_() {
  const mapa = await comunasPorAreaUsuario_();
  const areas = [...document.querySelectorAll('#u-areas-list input:checked')].map(i => i.value);
  const ids = new Set(areas.flatMap(a => mapa[SG_KEY(a)] || []));
  document.querySelectorAll('#u-comunas-list input[type="checkbox"]').forEach(i => { if (ids.has(i.value)) i.checked = true; });
  actualizarConteoUsuario_();
}

function poblarAreasChecklist_(areaIdsSeleccionadas) {
  const cont = document.getElementById('u-areas-list');
  cont.innerHTML = '';
  state.areasCatalogo.forEach(area => {
    const lab = document.createElement('label');
    const checked = areaIdsSeleccionadas.includes(area) ? 'checked' : '';
    lab.innerHTML = '<input type="checkbox" value="' + escapeHtml_(area) + '" ' + checked + '> ' + escapeHtml_(area);
    // Marcar un área carga sus comunas (se pueden desmarcar o agregar otras a mano)
    lab.querySelector('input').addEventListener('change', e => { if (e.target.checked) marcarComunasDeAreasUsuario_(); });
    cont.appendChild(lab);
  });
  actualizarConteoUsuario_();
}

function actualizarVisibilidadComunasSegunPerfil_() {
  const perfilVal = document.getElementById('u-perfil').value;
  const esAdmin = perfilVal === 'Administrador';
  const esJefeArea = perfilVal === 'Jefe de Área Relacionamiento' || perfilVal === PERFIL_GRT;   // GRT: por áreas, como el Jefe
  const esSubg = perfilVal === 'Subgerente de Relacionamiento';   // áreas y comunas automáticas (su subgerencia)
  const esAsoc = perfilVal === PERFIL_ASOC;                        // comunas automáticas (área Victoria)
  document.getElementById('u-asoc-nota').style.display = esAsoc ? 'block' : 'none';
  document.getElementById('u-comunas-wrap').style.display = esAdmin || esSubg || esAsoc ? 'none' : 'block';
  document.getElementById('u-areas-wrap').style.display = esJefeArea ? 'block' : 'none';
  document.getElementById('u-subg-wrap').style.display = esSubg ? 'block' : 'none';
  if (esSubg) poblarSubgerenciasUsuario_();
}
/** Subgerencias que existen (según los recursos) y sus áreas, para el formulario de usuario. */
async function poblarSubgerenciasUsuario_() {
  const sel = document.getElementById('u-subg'), actual = sel.dataset.valor || sel.value;
  if (!state.subgCatalogo) {
    const { data } = await supabaseClient.from('referencia_recursos').select('subgerencia, area_nombre').not('subgerencia', 'is', null);
    const cat = {};
    (data || []).forEach(r => { const s = String(r.subgerencia).trim().toUpperCase(); if (!s) return; (cat[s] = cat[s] || new Set()).add(r.area_nombre); });
    state.subgCatalogo = cat;
  }
  sel.innerHTML = '<option value="">— Selecciona —</option>' + Object.keys(state.subgCatalogo).sort().map(s =>
    '<option value="' + escapeHtml_(s) + '">' + escapeHtml_(aTitulo_(s)) + ' (' + state.subgCatalogo[s].size + ' áreas)</option>').join('');
  sel.value = actual && state.subgCatalogo[String(actual).toUpperCase()] ? String(actual).toUpperCase() : '';
}

function abrirModalUsuario_(usuario) {
  editingUsuarioId = usuario ? usuario.id : null;
  document.getElementById('user-modal-title').textContent = usuario ? 'Editar usuario' : 'Nuevo usuario';
  document.getElementById('user-modal-sub').textContent = usuario ? usuario.email : 'Crea acceso para un GRD o Visor';
  document.getElementById('u-nombre').value = usuario ? usuario.nombre_completo : '';
  document.getElementById('u-email').value = usuario ? usuario.email : '';
  document.getElementById('u-email').disabled = !!usuario;
  document.getElementById('u-cargo').value = usuario ? (usuario.cargo || '') : '';
  document.getElementById('u-perfil').value = usuario ? usuario.perfil : 'Visor';
  document.getElementById('u-subg').dataset.valor = (usuario && usuario.subgerencia) || '';
  poblarComunasChecklist_(usuario ? usuario.comuna_ids : []);
  poblarAreasChecklist_(usuario ? (usuario.area_ids || []) : []);
  actualizarVisibilidadComunasSegunPerfil_();
  document.getElementById('user-modal-error').classList.remove('show');
  document.getElementById('user-modal-overlay').classList.add('show');
}

async function guardarUsuarioDesdeModal_() {
  const btn = document.getElementById('btn-save-user-modal');
  const errEl = document.getElementById('user-modal-error');
  errEl.classList.remove('show');

  const nombre = document.getElementById('u-nombre').value.trim();
  const email = document.getElementById('u-email').value.trim();
  const cargo = document.getElementById('u-cargo').value.trim();
  const perfilSel = document.getElementById('u-perfil').value;
  const comunaIds = Array.from(document.querySelectorAll('#u-comunas-list input:checked')).map(el => el.value);
  let areaIds = Array.from(document.querySelectorAll('#u-areas-list input:checked')).map(el => el.value);
  // Subgerente de Relacionamiento (SQL 107): se guarda como Jefe de Área con TODAS las áreas de su subgerencia
  const esSubg = perfilSel === 'Subgerente de Relacionamiento';
  const esGRT = perfilSel === PERFIL_GRT;   // GRT (SQL 119): Jefe de Área + marca, con sus áreas
  const esAsoc = perfilSel === PERFIL_ASOC; // Asociación de Agricultores (SQL 129): Visor + marca
  const subg = esSubg ? document.getElementById('u-subg').value : '';
  const perfil = (esSubg || esGRT) ? 'Jefe de Área Relacionamiento' : esAsoc ? 'Visor' : perfilSel;
  if (esAsoc) {   // comunas del área Victoria (Administración › Comunas por área)
    comunaIds.length = 0; areaIds = [];
    const mapa = await comunasPorAreaUsuario_();
    (mapa[SG_KEY(AGR_AREA_VISIBLE)] || []).forEach(id => comunaIds.push(id));
  }
  if (esSubg) {
    if (!subg) { errEl.textContent = 'Elige la subgerencia del Subgerente.'; errEl.classList.add('show'); return; }
    const delCat = [...((state.subgCatalogo || {})[subg] || [])].map(plNorm_);
    areaIds = (state.areasCatalogo || []).filter(a => delCat.includes(plNorm_(a)));
    if (!areaIds.length) areaIds = [...((state.subgCatalogo || {})[subg] || [])];
  }
  // Comunas automáticas (17-10-2026): Jefe de Área y Subgerente reciben las comunas de sus áreas
  // (Administración › Comunas por área) además de las que se marquen a mano.
  if (perfil === 'Jefe de Área Relacionamiento') {
    const mapa = await comunasPorAreaUsuario_();
    areaIds.forEach(a => (mapa[SG_KEY(a)] || []).forEach(id => { if (!comunaIds.includes(id)) comunaIds.push(id); }));
  }

  if (!nombre) { errEl.textContent = 'El nombre es obligatorio.'; errEl.classList.add('show'); return; }
  if (!editingUsuarioId && !email) { errEl.textContent = 'El correo es obligatorio.'; errEl.classList.add('show'); return; }
  if (perfil !== 'Administrador' && perfil !== 'Jefe de Área Relacionamiento' && comunaIds.length === 0) { errEl.textContent = 'Selecciona al menos una comuna.'; errEl.classList.add('show'); return; }
  if (perfil === 'Jefe de Área Relacionamiento' && areaIds.length === 0) { errEl.textContent = 'Selecciona al menos una zona de relacionamiento.'; errEl.classList.add('show'); return; }

  btn.textContent = 'Guardando…'; btn.disabled = true;

  const action = editingUsuarioId ? 'actualizar' : 'crear';
  const payload = editingUsuarioId
    ? { action, perfil_id: editingUsuarioId, nombre_completo: nombre, cargo, perfil, comuna_ids: comunaIds, area_ids: areaIds }
    : { action, email, nombre_completo: nombre, cargo, perfil, comuna_ids: comunaIds, area_ids: areaIds };

  const { data, error } = await supabaseClient.functions.invoke('admin-usuarios', { body: payload });

  btn.textContent = 'Guardar'; btn.disabled = false;

  if (error || !data || !data.ok) {
    errEl.textContent = await mensajeErrorEdgeFunction_(data, error);
    errEl.classList.add('show');
    return;
  }

  // Subgerencia (SQL 107) y GRT (SQL 119): asignar o quitar según el perfil elegido
  let idUsuario = editingUsuarioId || data.perfil_id || data.id || (data.usuario && data.usuario.id) || null;
  const eraSubg = !!(editingUsuarioId && state.subgPorPerfil && state.subgPorPerfil[editingUsuarioId]);
  const eraGRT = !!(editingUsuarioId && state.grtPorPerfil && state.grtPorPerfil[editingUsuarioId]);
  const eraAsoc = !!(editingUsuarioId && state.asocPorPerfil && state.asocPorPerfil[editingUsuarioId]);
  if ((esGRT || eraGRT || esAsoc || eraAsoc) && !idUsuario && email) {
    const { data: l } = await supabaseClient.functions.invoke('admin-usuarios', { body: { action: 'listar' } });
    const u = l && (l.usuarios || []).find(x => String(x.email).toLowerCase() === email.toLowerCase());
    idUsuario = u ? u.id : null;
  }
  if (esGRT || eraGRT) {
    if (idUsuario) {
      const { error: eG } = await supabaseClient.rpc('asignar_gestor_territorial', { p_perfil: idUsuario, p_es: esGRT });
      if (eG) alert('⚠️ Usuario guardado, pero NO se pudo ' + (esGRT ? 'marcar como GRT' : 'quitar la marca GRT') + ': ' + eG.message +
        (/function|does not exist/i.test(eG.message) ? '\n(¿Se ejecutó el SQL 119?)' : ''));
    } else alert('⚠️ Usuario guardado, pero no se encontró su cuenta para marcarla como GRT: edítalo y vuelve a elegir el perfil.');
  }
  if (esAsoc || eraAsoc) {
    if (idUsuario) {
      const { error: eA } = await supabaseClient.rpc('asignar_asociacion', { p_perfil: idUsuario, p_asociacion: esAsoc ? 'MALLECO' : null });
      if (eA) alert('⚠️ Usuario guardado, pero NO se pudo ' + (esAsoc ? 'marcar como Asociación de Agricultores' : 'quitar la marca de Asociación') + ': ' + eA.message +
        (/function|does not exist/i.test(eA.message) ? '\n(¿Se ejecutó el SQL 129?)' : ''));
    } else alert('⚠️ Usuario guardado, pero no se encontró su cuenta para marcarla como Asociación de Agricultores: edítalo y vuelve a elegir el perfil.');
  }
  if (esSubg || eraSubg) {
    if (!idUsuario && email) {   // el usuario recién creado: se busca por su correo
      const { data: l } = await supabaseClient.functions.invoke('admin-usuarios', { body: { action: 'listar' } });
      const u = l && (l.usuarios || []).find(x => String(x.email).toLowerCase() === email.toLowerCase());
      idUsuario = u ? u.id : null;
    }
    if (idUsuario) {
      const { error: eS } = await supabaseClient.rpc('asignar_subgerencia', { p_perfil: idUsuario, p_subgerencia: esSubg ? subg : null });
      if (eS) alert('⚠️ Usuario guardado, pero NO se pudo asignar la subgerencia: ' + eS.message + '\nQuedará como Jefe de Área: edítalo y vuelve a elegir «Subgerente de Relacionamiento».');
    } else {
      // Antes se omitía en silencio y el Subgerente quedaba como Jefe de Área
      alert('⚠️ Usuario guardado, pero no se encontró su cuenta para asignarle la subgerencia.\nQuedará como Jefe de Área: actualiza la lista, edítalo y vuelve a elegir «Subgerente de Relacionamiento».');
    }
  }

  document.getElementById('user-modal-overlay').classList.remove('show');
  if (!editingUsuarioId) {
    mostrarCredencialModal_('Usuario creado', 'Clave temporal para ' + email, data.tempPassword);
  } else {
    mostrarToast_('Usuario actualizado correctamente.');
  }
  cargarUsuariosAdmin();
}

async function resetearClaveUsuario_(id, email) {
  if (!confirm('¿Restablecer la contraseña de ' + email + '? Se generará una clave temporal nueva.')) return;
  const { data, error } = await supabaseClient.functions.invoke('admin-usuarios', { body: { action: 'resetear_clave', perfil_id: id } });
  if (error || !data || !data.ok) { mostrarToast_('Error: ' + await mensajeErrorEdgeFunction_(data, error)); return; }
  mostrarCredencialModal_('Contraseña restablecida', 'Clave temporal para ' + email, data.tempPassword);
  cargarUsuariosAdmin();
}

async function toggleEstadoUsuario_(id, estadoActual) {
  const nuevoEstado = estadoActual === 'activo' ? 'inactivo' : 'activo';
  if (!confirm('¿Marcar este usuario como "' + nuevoEstado + '"?')) return;
  const { data, error } = await supabaseClient.functions.invoke('admin-usuarios', { body: { action: 'cambiar_estado', perfil_id: id, estado: nuevoEstado } });
  if (error || !data || !data.ok) { mostrarToast_('Error: ' + await mensajeErrorEdgeFunction_(data, error)); return; }
  mostrarToast_('Usuario marcado como ' + nuevoEstado + '.');
  cargarUsuariosAdmin();
}

/* ============ SIDEBAR / PESTAÑAS ============ */
const tabMeta = {
  capas: { title:'Capas', sub:'Capas disponibles en tu perfil' },
  copamiento: { title:'Copamiento', sub:'Recursos vigentes en esta comuna' },
  usuarios: { title:'Usuarios', sub:'Gestión de accesos por comuna' },
  informe: { title:'Informe de copamiento', sub:'Por institución y sobre la ocurrencia de incendios' },
};

/* ============ INFORME DE COPAMIENTO ============
 * Reúne los dos niveles en un documento imprimible y descargable:
 *   · Nivel comunal por institución: recursos y km² copados.
 *   · Nivel de incendios por alerta: km² de ocurrencia cubiertos en las
 *     tres ventanas históricas.
 *
 * Los datos salen de las mismas funciones que alimentan el mapa, así que
 * el informe siempre coincide con lo que se está viendo.
 */
state.informe = state.informe || null;

function renderTabInforme_(c) {
  const nombreComuna = state.activeComunaId ? nombreComuna_(state.activeComunaId) : '—';
  c.innerHTML =
    '<div style="padding:6px 2px;">' +
      '<div style="font-size:12px;opacity:.8;margin-bottom:4px;">Comuna</div>' +
      '<div style="font-size:14px;font-weight:700;margin-bottom:14px;">' + escapeHtml_(nombreComuna) + '</div>' +
      '<div style="font-size:11.5px;opacity:.75;line-height:1.55;margin-bottom:14px;">' +
        'Reúne el copamiento comunal por institución y el copamiento sobre la zona ' +
        'de ocurrencia de incendios, con sus gráficos. Se abre en pantalla completa ' +
        'y se puede descargar en HTML o CSV.' +
      '</div>' +
      '<button id="btn-generar-informe" class="btn-primary" style="width:100%;">📊 Generar y abrir informe</button>' +
    '</div>';

  document.getElementById('btn-generar-informe').addEventListener('click', generarInforme_);
}

function enlazarModalInforme_() {
  const cerrar = document.getElementById('btn-cerrar-informe');
  if (cerrar) cerrar.addEventListener('click', () => {
    document.getElementById('informe-modal-overlay').classList.remove('show');
  });
  const bp = document.getElementById('btn-descargar-pdf');
  if (bp) bp.addEventListener('click', descargarInformePdf_);
  const bd = document.getElementById('btn-descargar-informe');
  if (bd) bd.addEventListener('click', descargarInformeHtml_);
  const bc = document.getElementById('btn-descargar-csv');
  if (bc) bc.addEventListener('click', descargarInformeCsv_);
}

async function generarInforme_() {
  if (!state.activeComunaId) { mostrarToast_('⚠️ Selecciona una comuna primero.'); return; }

  const btn = document.getElementById('btn-generar-informe');
  if (btn) { btn.disabled = true; btn.textContent = 'Calculando…'; }
  mostrarToast_('📊 Calculando copamiento…');

  try {
    // Nivel comunal, por institución y escenario.
    const porInst = await supabaseClient.rpc('copamiento_por_institucion', {
      p_comuna_id: String(state.activeComunaId),
      p_buffer_m: BUFFER_INFLUENCIA_M,
    });
    if (porInst.error) throw new Error(porInst.error.message);

    // Superficie de la comuna: da contexto a los porcentajes.
    const superficie = await supabaseClient.rpc('superficie_comuna', {
      p_comuna_id: String(state.activeComunaId),
    });

    // Desglose por tipo de recurso, solo para quienes planifican recursos
    // propios. Para el resto ese detalle es ruido.
    let porTipo = [];
    if (perfilPuedeUsarCatalogoCmpc_()) {
      const rt = await supabaseClient.rpc('copamiento_por_tipo_recurso', {
        p_comuna_id: String(state.activeComunaId),
        p_buffer_m: BUFFER_INFLUENCIA_M,
      });
      if (!rt.error) porTipo = rt.data || [];
      else console.error('copamiento_por_tipo_recurso:', rt.error.message);
    }

    // Nivel de incendios, por ventana histórica y escenario.
    const incendios = {};
    for (const cfg of NIVELES_AMEBA) {
      if (!state.amebaDatos[cfg.id]) await cargarAmeba_(cfg.id);
      const r = await supabaseClient.rpc('kpi_copamiento_ameba', {
        p_comuna_id: String(state.activeComunaId),
        p_nivel: cfg.temporadas,
        p_buffer_influencia_m: BUFFER_INFLUENCIA_M,
      });
      incendios[cfg.id] = r.error ? [] : (r.data || []);
    }

    const sup = (superficie.data && superficie.data[0]) ? superficie.data[0] : null;

    state.informe = {
      comuna: nombreComuna_(state.activeComunaId),
      superficie: sup,
      porTipo,
      generado: new Date(),
      bufferInfluencia: BUFFER_INFLUENCIA_M,
      bufferAmeba: BUFFER_AMEBA_M,
      instituciones: porInst.data || [],
      incendios,
      amebas: NIVELES_AMEBA.map(cfg => ({
        id: cfg.id,
        temporadas: cfg.temporadas,
        datos: state.amebaDatos[cfg.id] || null,
      })),
    };

    pintarInforme_();
    document.getElementById('informe-modal-overlay').classList.add('show');
  } catch (e) {
    console.error('generarInforme_:', e);
    mostrarToast_('No se pudo generar el informe: ' + e.message);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '📊 Generar y abrir informe'; }
  }
}

/* Gráficos del informe en SVG puro.
 *
 * No se usa ninguna librería de gráficos: el SVG generado aquí va tanto en
 * el modal como dentro del archivo descargado, y así el HTML exportado se
 * ve igual en cualquier navegador sin depender de internet.
 */
const COLOR_ESC = { Verde: '#16A34A', Amarilla: '#F59E0B', Roja: '#EF4444' };

function envolverTexto_(t, max) {
  const s = String(t || '');
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

/** Barras horizontales agrupadas. series = [{nombre, color, valores:[]}]
 *
 * Las series enteramente en cero se omiten: dibujar una pista vacía por
 * cada escenario sin datos llenaba el gráfico de filas inútiles y hacía
 * difícil leer las que sí tenían valores.
 */
function graficoBarras_(categorias, series, opts) {
  const o = opts || {};
  const activas = series.filter(s => s.valores.some(v => (Number(v) || 0) > 0));
  const usar = activas.length > 0 ? activas : series.slice(0, 1);
  const omitidas = series.filter(s => usar.indexOf(s) === -1).map(s => s.nombre);

  const anchoEtiqueta = o.anchoEtiqueta || 150;
  const altoBarra = 15;
  const sepSerie = 4;
  const sepCat = 14;
  const margenDer = 62;
  const ancho = o.ancho || 780;
  const anchoBarras = ancho - anchoEtiqueta - margenDer;

  const maximo = Math.max(1, ...usar.flatMap(s => s.valores.map(v => Number(v) || 0)));
  const altoCat = usar.length * (altoBarra + sepSerie) - sepSerie + sepCat;
  const yInicio = usar.length > 1 ? 26 : 10;
  const alto = categorias.length * altoCat + yInicio + 6;

  let svg = '<svg width="100%" viewBox="0 0 ' + ancho + ' ' + alto + '" ' +
    'style="font-family:Inter,Segoe UI,sans-serif;max-width:' + ancho + 'px;">';

  // Leyenda: solo las series que se dibujan.
  if (usar.length > 1) {
    let lx = anchoEtiqueta;
    usar.forEach(s => {
      svg += '<rect x="' + lx + '" y="3" width="10" height="10" rx="3" fill="' + s.color + '"/>' +
             '<text x="' + (lx + 15) + '" y="12" font-size="11" fill="#475569">' + escapeHtml_(s.nombre) + '</text>';
      lx += 30 + s.nombre.length * 6.4;
    });
  }

  categorias.forEach((cat, i) => {
    const y0 = yInicio + i * altoCat;
    const altoGrupo = usar.length * (altoBarra + sepSerie) - sepSerie;

    // Franja alterna para separar categorías sin líneas duras.
    if (i % 2 === 1) {
      svg += '<rect x="0" y="' + (y0 - 5) + '" width="' + ancho + '" height="' + (altoGrupo + 10) + '" fill="#F8FAFC"/>';
    }

    const logo = o.logos ? o.logos[i] : null;
    const yTexto = y0 + altoGrupo / 2 + 4;
    if (logo) {
      // El logo va antes del nombre: ayuda a identificar la institución de
      // un vistazo cuando la lista es larga.
      svg += '<image href="' + escapeHtml_(logo) + '" x="' + (anchoEtiqueta - 30) + '" y="' +
             (yTexto - 13) + '" width="17" height="17" preserveAspectRatio="xMidYMid meet"/>';
      svg += '<text x="' + (anchoEtiqueta - 36) + '" y="' + yTexto + '" ' +
        'text-anchor="end" font-size="11.5" font-weight="600" fill="#1E293B">' +
        escapeHtml_(envolverTexto_(cat, 20)) + '</text>';
    } else {
      svg += '<text x="' + (anchoEtiqueta - 10) + '" y="' + yTexto + '" ' +
        'text-anchor="end" font-size="11.5" font-weight="600" fill="#1E293B">' +
        escapeHtml_(envolverTexto_(cat, 22)) + '</text>';
    }

    usar.forEach((s, j) => {
      const v = Number(s.valores[i]) || 0;
      const y = y0 + j * (altoBarra + sepSerie);
      const w = v > 0 ? Math.max(3, Math.round((v / maximo) * anchoBarras)) : 0;

      // Línea base tenue, no una pista de ancho completo.
      svg += '<line x1="' + anchoEtiqueta + '" y1="' + (y + altoBarra) + '" x2="' + (anchoEtiqueta + anchoBarras) +
             '" y2="' + (y + altoBarra) + '" stroke="#E2E8F0" stroke-width="1"/>';

      if (w > 0) {
        svg += '<rect x="' + anchoEtiqueta + '" y="' + y + '" width="' + w + '" height="' + altoBarra +
               '" rx="3" fill="' + s.color + '"/>';
        svg += '<text x="' + (anchoEtiqueta + w + 7) + '" y="' + (y + altoBarra - 3) + '" ' +
               'font-size="10.5" font-weight="600" fill="#334155">' +
               (o.formato ? o.formato(v) : v) + '</text>';
      } else {
        svg += '<text x="' + (anchoEtiqueta + 4) + '" y="' + (y + altoBarra - 3) + '" ' +
               'font-size="10" fill="#CBD5E1">sin datos</text>';
      }
    });
  });

  svg += '</svg>';

  if (omitidas.length > 0) {
    svg += '<div class="omitidas">Sin recursos en: ' + escapeHtml_(omitidas.join(', ')) + '</div>';
  }
  return svg;
}

/** Anillos de progreso, uno por escenario. */
function graficoAnillos_(items) {
  const r = 34, grosor = 9, paso = 150, alto = 132;
  const ancho = items.length * paso;
  let svg = '<svg width="100%" viewBox="0 0 ' + ancho + ' ' + alto + '" ' +
    'style="font-family:Inter,Segoe UI,sans-serif;max-width:' + ancho + 'px;">';

  items.forEach((it, i) => {
    const cx = paso / 2 + i * paso, cy = 50;
    const pct = Math.max(0, Math.min(100, Number(it.valor) || 0));
    const circ = 2 * Math.PI * r;
    const avance = circ * (pct / 100);

    svg += '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" stroke="#EEF2F7" stroke-width="' + grosor + '"/>';
    if (pct > 0) {
      svg += '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" stroke="' + it.color + '" ' +
        'stroke-width="' + grosor + '" stroke-linecap="round" ' +
        'stroke-dasharray="' + avance.toFixed(1) + ' ' + (circ - avance).toFixed(1) + '" ' +
        'transform="rotate(-90 ' + cx + ' ' + cy + ')"/>';
    }
    svg += '<text x="' + cx + '" y="' + (cy + 3) + '" text-anchor="middle" font-size="18" font-weight="800" fill="#0F172A">' +
      pct.toFixed(pct >= 10 ? 0 : 1) + '<tspan font-size="11" font-weight="600" fill="#64748B">%</tspan></text>';
    svg += '<circle cx="' + (cx - 32) + '" cy="' + (cy + r + 18) + '" r="4" fill="' + it.color + '"/>';
    svg += '<text x="' + (cx - 24) + '" y="' + (cy + r + 22) + '" font-size="11.5" font-weight="600" fill="#1E293B">' +
      escapeHtml_(it.etiqueta) + '</text>';
    if (it.detalle) {
      svg += '<text x="' + cx + '" y="' + (cy + r + 38) + '" text-anchor="middle" font-size="10" fill="#94A3B8">' +
        escapeHtml_(it.detalle) + '</text>';
    }
  });

  return svg + '</svg>';
}

/** Bloque de gráficos del informe. */
function graficosInforme_() {
  const inf = informeFiltrado_();
  if (!inf) return '';

  const escenarios = ['Verde', 'Amarilla', 'Roja'];
  let html = '';

  // ============================================================
  // 1. NIVEL DE COPAMIENTO
  // Abre el informe combinando las dos miradas: cuánto territorio comunal
  // se cubre y cuánto de la zona donde históricamente se quema. Son dos
  // preguntas distintas sobre el mismo despliegue y conviene leerlas juntas.
  // ============================================================
  const sup = inf.superficie;

  const anillosComuna = escenarios.map(esc => {
    const filas = inf.instituciones.filter(f => f.escenario === esc);
    const km = filas.reduce((n, f) => n + (Number(f.area_km2) || 0), 0);
    const pct = filas.reduce((n, f) => n + (Number(f.pct_comuna) || 0), 0);
    const rec = filas.reduce((n, f) => n + (Number(f.entidades) || 0), 0);
    return { etiqueta: nombreEscenario_(esc), valor: pct, color: COLOR_ESC[esc],
             detalle: rec + ' rec · ' + km.toFixed(1) + ' km²' };
  });

  const nInst = new Set(inf.instituciones.filter(f => (Number(f.entidades) || 0) > 0)
    .map(f => f.institucion)).size;

  const datosTerritorio = [
    { etiqueta: 'Superficie comunal', valor: sup && sup.area_km2 != null ? Number(sup.area_km2).toLocaleString('es-CL') : '—', unidad: 'km²' },
    { etiqueta: 'Perímetro',          valor: sup && sup.perimetro_km != null ? Number(sup.perimetro_km).toLocaleString('es-CL') : '—', unidad: 'km' },
    { etiqueta: 'Instituciones',      valor: nInst, unidad: 'participan' },
  ];

  html += '<h3>1. Nivel de copamiento</h3>';

  // ---- 1.a Sobre el territorio comunal ----
  html += '<h4 class="sub">a. Sobre el territorio comunal</h4>' +
    '<p class="nota">Porcentaje de la superficie de la comuna cubierto por las áreas de ' +
    'influencia de los recursos. Suma las coberturas por institución, de modo que un ' +
    'sector cubierto por dos instituciones se cuenta dos veces.</p>' +
    '<div class="grafico panel-copamiento">' +
      '<div class="pc-anillos">' + graficoAnillos_(anillosComuna) + '</div>' +
      '<div class="pc-datos">' +
        datosTerritorio.map(t =>
          '<div class="tarjeta-kpi">' +
            '<div class="tk-etiqueta">' + escapeHtml_(t.etiqueta) + '</div>' +
            '<div class="tk-valor">' + escapeHtml_(String(t.valor)) +
              '<span class="tk-unidad">' + escapeHtml_(t.unidad) + '</span></div>' +
          '</div>').join('') +
      '</div>' +
    '</div>';

  // ---- 1.b Sobre la ocurrencia de incendios ----
  const hayIncendios = NIVELES_AMEBA.some(cfg => (inf.incendios[cfg.id] || []).length > 0);

  if (hayIncendios) {
    html += '<h4 class="sub">b. Sobre la ocurrencia de incendios</h4>' +
      '<p class="nota">Porcentaje de la zona donde históricamente se producen incendios que ' +
      'queda cubierto por los recursos. Es un indicador más exigente: se puede copar mucho ' +
      'territorio y aun así dejar fuera los sectores que se queman. ' +
      (inf.filtrado ? '<b>No responde al filtro por institución:</b> se calcula con la unión de todos los recursos.' : '') +
      '</p>';

    const nombreVentana = { 1: 'Última temporada', 3: 'Últimas 3 temporadas', 5: 'Últimas 5 temporadas' };

    NIVELES_AMEBA.forEach(cfg => {
      const filas = inf.incendios[cfg.id] || [];
      if (filas.length === 0) return;

      const amebaKm = filas[0].ameba_km2;
      const datosAmeba = (inf.amebas || []).find(a => a.id === cfg.id);
      const focos = datosAmeba && datosAmeba.datos ? datosAmeba.datos.focos : null;
      const pctComunaAmeba = datosAmeba && datosAmeba.datos ? datosAmeba.datos.pct_comuna : null;

      const anillos = escenarios.map(esc => {
        const f = filas.find(x => x.escenario === esc);
        return {
          etiqueta: nombreEscenario_(esc),
          valor: f && f.pct_ameba != null ? Number(f.pct_ameba) : 0,
          color: COLOR_ESC[esc],
          detalle: f ? f.copado_km2 + ' de ' + f.ameba_km2 + ' km²' : '—',
        };
      });

      html += '<div class="ventana-titulo">' +
          '<span class="vt-nombre">' + escapeHtml_(nombreVentana[cfg.temporadas] || (cfg.temporadas + ' temporadas')) + '</span>' +
          '<span class="vt-meta">' +
            (focos != null ? focos + ' focos · ' : '') +
            amebaKm + ' km² de zona de ocurrencia' +
            (pctComunaAmeba != null ? ' · ' + pctComunaAmeba + '% de la comuna' : '') +
          '</span>' +
        '</div>' +
        '<div class="grafico">' + graficoAnillos_(anillos) + '</div>';
    });

    // Comparación entre ventanas
    const ventanas = NIVELES_AMEBA.map(cfg => nombreVentana[cfg.temporadas] || (cfg.temporadas + ' temp.'));
    const seriesInc = escenarios.map(esc => ({
      nombre: esc,
      color: COLOR_ESC[esc],
      valores: NIVELES_AMEBA.map(cfg => {
        const f = (inf.incendios[cfg.id] || []).find(x => x.escenario === esc);
        return f && f.pct_ameba != null ? Number(f.pct_ameba) : 0;
      }),
    }));
    html += '<h4 class="sub">c. Comparación entre ventanas históricas</h4>' +
      '<p class="nota">Si el porcentaje cae al ampliar la ventana, el despliegue está ajustado ' +
      'a los incendios recientes y deja fuera sectores que se quemaron en temporadas anteriores.</p>' +
      '<div class="grafico">' +
        graficoBarras_(ventanas, seriesInc, { formato: v => v.toFixed(0) + '%', anchoEtiqueta: 160 }) +
      '</div>';
  }

  // ---- Barras: km² copados por institución ----
  // Solo las instituciones que aportan algo: una fila en cero por cada
  // institución sin recursos no informa nada y alarga el gráfico.
  const instituciones = [...new Set(inf.instituciones
    .filter(f => (Number(f.entidades) || 0) > 0)
    .map(f => aTitulo_(f.institucion)))];
  if (instituciones.length > 0) {
    const series = escenarios.map(esc => ({
      nombre: esc,
      color: COLOR_ESC[esc],
      valores: instituciones.map(nom => {
        const f = inf.instituciones.find(x => x.escenario === esc && aTitulo_(x.institucion) === nom);
        return f ? Number(f.area_km2) || 0 : 0;
      }),
    }));
    const logosInst = instituciones.map(nom => {
      const i = (state.instituciones || []).find(x => aTitulo_(x.nombre) === nom);
      return i ? logoEfectivoInstitucion_(i) : null;
    });

    html += '<h3>2. Aporte de cada institución</h3>' +
      '<p class="nota">Superficie cubierta y cantidad de recursos aportados por cada ' +
      'institución en los tres escenarios.</p>' +
      '<h4 class="sub">a. Superficie copada</h4>' +
      '<div class="grafico">' +
        graficoBarras_(instituciones, series, { formato: v => v.toFixed(1) + ' km²', logos: logosInst, anchoEtiqueta: 178 }) +
      '</div>';

    const seriesRec = escenarios.map(esc => ({
      nombre: esc,
      color: COLOR_ESC[esc],
      valores: instituciones.map(nom => {
        const f = inf.instituciones.find(x => x.escenario === esc && aTitulo_(x.institucion) === nom);
        return f ? Number(f.entidades) || 0 : 0;
      }),
    }));
    html += '<h4 class="sub">b. Recursos aportados</h4>' +
      '<div class="grafico">' + graficoBarras_(instituciones, seriesRec, { logos: logosInst, anchoEtiqueta: 178 }) + '</div>';
  }

  // ---- Barras: copamiento sobre incendios ----
  const ventanas = NIVELES_AMEBA.map(cfg => cfg.temporadas + ' temporada' + (cfg.temporadas > 1 ? 's' : ''));
  const seriesInc = escenarios.map(esc => ({
    nombre: esc,
    color: COLOR_ESC[esc],
    valores: NIVELES_AMEBA.map(cfg => {
      const f = (inf.incendios[cfg.id] || []).find(x => x.escenario === esc);
      return f && f.pct_ameba != null ? Number(f.pct_ameba) : 0;
    }),
  }));
  html += '<h3>Copamiento sobre la ocurrencia de incendios</h3>' +
    '<p class="nota">Porcentaje de la zona de ocurrencia histórica cubierto por los recursos de cada alerta.</p>' +
    '<div class="grafico">' +
      graficoBarras_(ventanas, seriesInc, { formato: v => v.toFixed(0) + '%', anchoEtiqueta: 110 }) +
    '</div>';

  return html;
}

/** Tablas del informe, en HTML. Se usa igual en pantalla y en el archivo. */
function tablasInforme_() {
  const inf = informeFiltrado_();
  if (!inf) return '';

  const escenarios = ['Verde', 'Amarilla', 'Roja'];
  const colorEsc = { Verde: '#16A34A', Amarilla: '#F59E0B', Roja: '#EF4444' };

  let html = '';

  // ---- Nivel comunal por institución ----
  html += '<h3>3. Detalle por institución</h3>';
  escenarios.forEach(esc => {
    const filas = inf.instituciones.filter(f => f.escenario === esc);
    if (filas.length === 0) return;

    const totRec = filas.reduce((n, f) => n + (Number(f.entidades) || 0), 0);
    const totKm = filas.reduce((n, f) => n + (Number(f.area_km2) || 0), 0);

    html += '<h4 style="color:' + colorEsc[esc] + ';">' + nombreEscenario_(esc) + '</h4>';
    html += '<table><thead><tr>' +
      '<th>Institución</th><th class="n">Recursos</th>' +
      '<th class="n">Recursos fijos / Punto de control</th>' +
      '<th class="n">Rutas de patrullaje</th><th class="n">Área de influencia</th>' +
      '<th class="n">Copamiento km²</th><th class="n">% comuna</th>' +
      '</tr></thead><tbody>';
    filas.forEach(f => {
      html += '<tr>' +
        '<td>' + escapeHtml_(aTitulo_(f.institucion)) + '</td>' +
        '<td class="n">' + f.entidades + '</td>' +
        '<td class="n">' + f.puntos + '</td>' +
        '<td class="n">' + f.lineas + '</td>' +
        '<td class="n">' + f.areas + '</td>' +
        '<td class="n">' + f.area_km2 + '</td>' +
        '<td class="n">' + (f.pct_comuna != null ? f.pct_comuna + '%' : '—') + '</td>' +
      '</tr>';
    });
    html += '<tr class="tot"><td>Total</td><td class="n">' + totRec + '</td>' +
      '<td class="n"></td><td class="n"></td><td class="n"></td>' +
      '<td class="n">' + totKm.toFixed(2) + '</td><td class="n"></td></tr>';
    html += '</tbody></table>';
  });

  // ---- Tipos de recurso del área ----
  // Solo para Administrador y Jefe de Área: son quienes planifican
  // recursos propios y necesitan el detalle por tipo.
  if (inf.porTipo && inf.porTipo.length > 0) {
    html += '<h3>4. Tipos de recurso del área y su cobertura</h3>';
    html += '<p class="nota">Superficie cubierta por cada tipo de recurso, con los solapes ' +
      'entre entidades del mismo tipo ya descontados.</p>';

    escenarios.forEach(esc => {
      const filas = inf.porTipo.filter(f => f.escenario === esc);
      if (filas.length === 0) return;

      html += '<h4 style="color:' + colorEsc[esc] + ';">' + nombreEscenario_(esc) + '</h4>';
      html += '<table><thead><tr>' +
        '<th>Tipo de recurso</th><th>Pertenencia</th><th>Institución</th>' +
        '<th class="n">Recursos</th><th class="n">Rutas de patrullaje</th>' +
        '<th class="n">Área de influencia</th>' +
        '<th class="n">Cobertura km²</th><th class="n">% comuna</th>' +
        '</tr></thead><tbody>';
      filas.forEach(f => {
        html += '<tr>' +
          '<td>' + escapeHtml_(aTitulo_(f.tipo_recurso)) + '</td>' +
          '<td>' + escapeHtml_(f.pertenencia) + '</td>' +
          '<td>' + escapeHtml_(aTitulo_(f.institucion)) + '</td>' +
          '<td class="n">' + f.entidades + '</td>' +
          '<td class="n">' + f.lineas + '</td>' +
          '<td class="n">' + f.areas + '</td>' +
          '<td class="n">' + f.area_km2 + '</td>' +
          '<td class="n">' + (f.pct_comuna != null ? f.pct_comuna + '%' : '—') + '</td>' +
        '</tr>';
      });
      html += '</tbody></table>';
    });
  }

  // ---- Nivel de incendios ----
  html += '<h3>' + (inf.porTipo && inf.porTipo.length > 0 ? '5' : '4') +
          '. Detalle del copamiento sobre incendios</h3>';
  if (inf.filtrado) {
    html += '<p class="nota" style="color:#B45309;">Este bloque no se ve afectado por el filtro: ' +
      'se calcula con la unión de todos los recursos del escenario.</p>';
  }
  html += '<p class="nota">Zona de ocurrencia: unión de círculos de ' + inf.bufferAmeba +
    ' m alrededor de cada foco histórico. Influencia de los recursos: ' + inf.bufferInfluencia + ' m.</p>';

  html += '<table><thead><tr><th>Ventana histórica</th><th class="n">Zona km²</th>' +
    escenarios.map(e => '<th class="n">' + e + ' km²</th><th class="n">' + e + ' %</th>').join('') +
    '</tr></thead><tbody>';

  NIVELES_AMEBA.forEach(cfg => {
    const filas = inf.incendios[cfg.id] || [];
    const base = filas.length > 0 ? filas[0].ameba_km2 : '—';
    html += '<tr><td>' + cfg.temporadas + ' temporada' + (cfg.temporadas > 1 ? 's' : '') + '</td>' +
      '<td class="n">' + base + '</td>';
    escenarios.forEach(esc => {
      const f = filas.find(x => x.escenario === esc);
      html += '<td class="n">' + (f ? f.copado_km2 : '—') + '</td>' +
              '<td class="n">' + (f && f.pct_ameba != null ? f.pct_ameba + '%' : '—') + '</td>';
    });
    html += '</tr>';
  });
  html += '</tbody></table>';

  return html;
}

/* Filtro por institución.
 *
 * Trabaja sobre los datos ya calculados, sin volver a consultar: filtrar
 * es recortar la vista, no recalcular el copamiento. Afecta a los bloques
 * por institución y por tipo de recurso; el copamiento sobre incendios se
 * mantiene global y así se indica, porque esa cifra se calcula con la
 * unión de todos los recursos.
 */
state.informeFiltro = state.informeFiltro || null;   // null = todas

function institucionesDelInforme_() {
  const inf = state.informe;
  if (!inf) return [];
  return [...new Set(inf.instituciones
    .filter(f => (Number(f.entidades) || 0) > 0)
    .map(f => aTitulo_(f.institucion)))].sort();
}

function institucionActivaInforme_(nombre) {
  return !state.informeFiltro || state.informeFiltro.indexOf(nombre) !== -1;
}

/** Copia del informe con el filtro aplicado. */
function informeFiltrado_() {
  const inf = state.informe;
  if (!inf) return null;
  if (!state.informeFiltro) return inf;

  return Object.assign({}, inf, {
    instituciones: inf.instituciones.filter(f => institucionActivaInforme_(aTitulo_(f.institucion))),
    porTipo: (inf.porTipo || []).filter(f => institucionActivaInforme_(aTitulo_(f.institucion))),
    filtrado: true,
  });
}

function barraFiltroInforme_() {
  const todas = institucionesDelInforme_();
  if (todas.length === 0) return '';

  const activas = todas.filter(institucionActivaInforme_).length;
  return '<div class="filtro-inst">' +
    '<span class="fi-titulo">Instituciones</span>' +
    todas.map(nom => {
      const on = institucionActivaInforme_(nom);
      const i = (state.instituciones || []).find(x => aTitulo_(x.nombre) === nom);
      const color = (i && i.color_hex) ? i.color_hex : '#64748B';
      return '<button class="fi-chip' + (on ? ' on' : '') + '" data-fi="' + escapeHtml_(nom) + '" ' +
        'style="' + (on ? 'border-color:' + color + ';background:' + color + '18;' : '') + '">' +
        '<span class="fi-punto" style="background:' + (on ? color : '#CBD5E1') + ';"></span>' +
        escapeHtml_(nom) + '</button>';
    }).join('') +
    '<button class="fi-chip fi-todas" data-fi-todas="1">' +
      (activas === todas.length ? 'Ninguna' : 'Todas') + '</button>' +
  '</div>';
}

function enlazarFiltroInforme_() {
  document.querySelectorAll('[data-fi]').forEach(b => {
    b.addEventListener('click', () => {
      const nom = b.dataset.fi;
      const todas = institucionesDelInforme_();
      let sel = state.informeFiltro ? state.informeFiltro.slice() : todas.slice();
      const i = sel.indexOf(nom);
      if (i === -1) sel.push(nom); else sel.splice(i, 1);
      state.informeFiltro = (sel.length === todas.length) ? null : sel;
      pintarInforme_();
    });
  });
  const bt = document.querySelector('[data-fi-todas]');
  if (bt) bt.addEventListener('click', () => {
    const todas = institucionesDelInforme_();
    const activas = todas.filter(institucionActivaInforme_).length;
    state.informeFiltro = (activas === todas.length) ? [] : null;
    pintarInforme_();
  });
}

function pintarInforme_() {
  const cont = document.getElementById('informe-contenido');
  const sub = document.getElementById('informe-modal-sub');
  const inf = state.informe;
  if (!cont || !inf) return;

  if (sub) {
    const sup = inf.superficie;
    const lugar = sup
      ? [sup.comuna, sup.provincia, sup.region].filter(Boolean).join(' · ')
      : inf.comuna;
    sub.innerHTML =
      '<span class="informe-chip">📍 ' + escapeHtml_(lugar) + '</span>' +
      '<span class="informe-chip">🗓 ' + inf.generado.toLocaleDateString('es-CL') + ' ' +
        inf.generado.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }) + '</span>' +
      '<span class="informe-chip">🎯 Influencia ' + inf.bufferInfluencia + ' m</span>';
  }

  cont.innerHTML = estilosInforme_('#informe-contenido') +
    barraFiltroInforme_() + graficosInforme_() + tablasInforme_();
  enlazarFiltroInforme_();
}

/** Estilos compartidos entre el modal y el archivo descargado. */
function estilosInforme_(scope) {
  const p = scope ? scope + ' ' : '';
  return '<style>' +
    p + 'h4.sub{font-size:12px;font-weight:700;color:#334155;margin:16px 0 3px;}' +
    p + '.ventana-titulo{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;' +
        'margin:14px 0 0;padding:7px 12px;border-radius:9px 9px 0 0;' +
        'background:linear-gradient(90deg,#EEF4FF 0%,#F8FAFC 100%);border:1px solid #E8EDF3;border-bottom:none;}' +
    p + '.vt-nombre{font-size:11.5px;font-weight:700;color:#1E293B;}' +
    p + '.vt-meta{font-size:10px;color:#64748B;}' +
    p + '.ventana-titulo + .grafico{margin-top:0;border-radius:0 0 12px 12px;}' +
    p + '.filtro-inst{display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin:0 0 16px;' +
        'padding:10px 12px;border-radius:11px;background:#fff;border:1px solid #E8EDF3;' +
        'box-shadow:0 1px 3px rgba(15,23,42,0.05);}' +
    p + '.fi-titulo{font-size:9.5px;text-transform:uppercase;letter-spacing:.05em;' +
        'color:#64748B;font-weight:700;margin-right:4px;}' +
    p + '.fi-chip{display:inline-flex;align-items:center;gap:5px;padding:4px 10px;border-radius:20px;' +
        'border:1px solid #E2E8F0;background:#F8FAFC;color:#475569;font-family:inherit;' +
        'font-size:10.5px;font-weight:600;cursor:pointer;transition:all .13s ease;}' +
    p + '.fi-chip:hover{border-color:#CBD5E1;}' +
    p + '.fi-chip.on{color:#0F172A;}' +
    p + '.fi-punto{width:8px;height:8px;border-radius:50%;flex-shrink:0;}' +
    p + '.fi-todas{margin-left:auto;background:#EEF2F7;}' +
    p + '.panel-copamiento{display:flex;gap:18px;align-items:center;flex-wrap:wrap;}' +
    p + '.pc-anillos{flex:1 1 420px;min-width:300px;}' +
    p + '.pc-datos{flex:0 0 170px;display:flex;flex-direction:column;gap:8px;' +
        'border-left:1px solid #E8EDF3;padding-left:16px;}' +
    p + '.tarjeta-kpi{padding:9px 12px;border-radius:9px;' +
        'background:linear-gradient(135deg,#FFFFFF 0%,#F4F7FB 100%);border:1px solid #E2E8F0;' +
        'box-shadow:0 1px 2px rgba(15,23,42,0.04);}' +
    p + '.tk-etiqueta{font-size:9.5px;text-transform:uppercase;letter-spacing:.05em;' +
        'color:#64748B;font-weight:700;margin-bottom:3px;}' +
    p + '.tk-valor{font-size:18px;font-weight:800;color:#0F172A;line-height:1.15;letter-spacing:-.3px;}' +
    p + '.tk-unidad{font-size:10.5px;font-weight:600;color:#94A3B8;margin-left:5px;letter-spacing:0;}' +
    p + 'h3{font-size:14px;font-weight:700;margin:26px 0 2px;color:#0F172A;' +
        'display:flex;align-items:center;gap:8px;}' +
    p + 'h3::before{content:"";width:3px;height:15px;border-radius:2px;background:#2563EB;}' +
    p + 'h3:first-child{margin-top:4px;}' +
    p + 'h4{font-size:12px;font-weight:700;margin:16px 0 4px;}' +
    p + '.nota{font-size:11px;color:#64748B;margin:0 0 10px;line-height:1.5;}' +
    p + '.grafico{margin:8px 0 22px;padding:14px 12px 10px;border:1px solid #E8EDF3;' +
        'border-radius:12px;overflow-x:auto;' +
        'background:linear-gradient(180deg,#FFFFFF 0%,#FAFCFE 100%);' +
        'box-shadow:0 1px 3px rgba(15,23,42,0.05);}' +
    p + '.omitidas{font-size:10.5px;color:#94A3B8;padding:6px 2px 0;border-top:1px solid #F1F5F9;margin-top:8px;}' +
    p + 'table{width:100%;border-collapse:separate;border-spacing:0;margin:6px 0 18px;font-size:11.5px;' +
        'border:1px solid #E2E8F0;border-radius:8px;overflow:hidden;}' +
    p + 'th,' + p + 'td{padding:6px 9px;text-align:left;border-bottom:1px solid #EEF2F7;}' +
    p + 'th{background:#F8FAFC;font-weight:700;font-size:10.5px;text-transform:uppercase;' +
        'letter-spacing:.03em;color:#475569;border-bottom:1px solid #E2E8F0;}' +
    p + 'tbody tr:last-child td{border-bottom:none;}' +
    p + 'tbody tr:nth-child(even) td{background:#FCFDFE;}' +
    p + 'td.n,' + p + 'th.n{text-align:right;font-variant-numeric:tabular-nums;}' +
    p + 'tr.tot td{font-weight:700;background:#F1F5F9 !important;border-top:1px solid #E2E8F0;}' +
    '</style>';
}

