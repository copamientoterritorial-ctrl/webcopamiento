/* ============ ÁRBOL JERÁRQUICO: Áreas de Relacionamiento (Área → Sector) ============ */
function sectorOculto_(area, sector) {
  return !!(state.areaRelSectoresOcultos || {})[area + '||' + sector];
}
function setSectorOculto_(area, sector, oculto) {
  if (!state.areaRelSectoresOcultos) state.areaRelSectoresOcultos = {};
  state.areaRelSectoresOcultos[area + '||' + sector] = oculto;
}
function estadoAreaArbol_(area, sectores) {
  // Devuelve 'on' | 'off' | 'partial' según cuántos sectores están visibles
  const nombres = Object.keys(sectores);
  const visibles = nombres.filter(s => !sectorOculto_(area, s)).length;
  if (visibles === 0) return 'off';
  if (visibles === nombres.length) return 'on';
  return 'partial';
}
function hacerZoomArea_(area) {
  const arbol = window.arbolAreaRel || {};
  if (!arbol[area]) return;
  let bounds = null;
  Object.keys(arbol[area]).forEach(sector => {
    arbol[area][sector].forEach(capa => {
      try {
        const b = capa.getBounds && capa.getBounds();
        if (b && b.isValid()) bounds = bounds ? bounds.extend(b) : L.latLngBounds(b.getSouthWest(), b.getNorthEast());
      } catch (e) {}
    });
  });
  if (bounds && bounds.isValid()) map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
}
function aplicarVisibilidadAreaRel_() {
  const arbol = window.arbolAreaRel || {};
  const capaEncendida = map.hasLayer(areaRelacionamientoLayer);
  Object.keys(arbol).forEach(area => {
    Object.keys(arbol[area]).forEach(sector => {
      const oculto = !capaEncendida || sectorOculto_(area, sector);
      arbol[area][sector].forEach(capa => {
        // Método confiable en Leaflet: quitar/agregar la capa del layerGroup,
        // en vez de manipular el display del SVG (que falla con paths de relleno).
        const estaEnGrupo = areaRelacionamientoLayer.hasLayer(capa);
        if (oculto && estaEnGrupo) areaRelacionamientoLayer.removeLayer(capa);
        else if (!oculto && !estaEnGrupo) areaRelacionamientoLayer.addLayer(capa);
      });
    });
  });
}
function construirArbolAreaRel_() {
  const cont = document.createElement('div');
  const arbol = window.arbolAreaRel || {};
  const areas = Object.keys(arbol).sort();
  const capaEncendida = map.hasLayer(areaRelacionamientoLayer);
  const totalSectores = areas.reduce((n, a) => n + Object.keys(arbol[a]).length, 0);

  // Nodo raíz: "Áreas de Relacionamiento"
  const raiz = document.createElement('div'); raiz.className = 'tree-node';
  const rowRaiz = document.createElement('div'); rowRaiz.className = 'tree-row';
  if (state.arbolAreaRelColapsado === undefined) state.arbolAreaRelColapsado = true; // arranca colapsado
  rowRaiz.innerHTML =
    '<span class="tree-caret ' + (state.arbolAreaRelColapsado ? 'collapsed' : '') + '">▼</span>' +
    '<span class="tree-check ' + (capaEncendida ? 'on' : '') + '" data-arbol-raiz="1"></span>' +
    '<span class="tree-label">Áreas de Relacionamiento</span>' +
    '<span class="tree-count">' + areas.length + ' área(s) · ' + totalSectores + '</span>';
  raiz.appendChild(rowRaiz);

  const hijosRaiz = document.createElement('div');
  hijosRaiz.className = 'tree-children' + (state.arbolAreaRelColapsado ? ' collapsed' : '');

  areas.forEach((area, areaIdx) => {
    const sectores = arbol[area];
    const nombresSec = Object.keys(sectores).sort();
    const nodoArea = document.createElement('div'); nodoArea.className = 'tree-node';
    const estadoArea = capaEncendida ? estadoAreaArbol_(area, sectores) : 'off';
    const colKey = 'col_' + area;
    if (state[colKey] === undefined) state[colKey] = true; // sub-nivel colapsado
    const rowArea = document.createElement('div'); rowArea.className = 'tree-row';
    rowArea.innerHTML =
      '<span class="tree-caret ' + (state[colKey] ? 'collapsed' : '') + '">▼</span>' +
      '<span class="tree-check ' + (estadoArea === 'on' ? 'on' : estadoArea === 'partial' ? 'partial' : '') + '" data-arbol-area-idx="' + areaIdx + '"></span>' +
      '<span class="tree-label">' + escapeHtml_(area) + '</span>' +
      '<span class="tree-count">' + nombresSec.length + '</span>';
    nodoArea.appendChild(rowArea);

    const hijosArea = document.createElement('div');
    hijosArea.className = 'tree-children' + (state[colKey] ? ' collapsed' : '');
    nombresSec.forEach((sector, secIdx) => {
      const visible = capaEncendida && !sectorOculto_(area, sector);
      const nodoSec = document.createElement('div'); nodoSec.className = 'tree-node sector';
      const rowSec = document.createElement('div'); rowSec.className = 'tree-row';
      rowSec.innerHTML =
        '<span class="tree-caret leaf">▼</span>' +
        '<span class="tree-check ' + (visible ? 'on' : '') + '" data-arbol-area-idx="' + areaIdx + '" data-arbol-sec-idx="' + secIdx + '"></span>' +
        '<span class="tree-label">' + escapeHtml_(sector) + '</span>' +
        '<span class="tree-count">' + sectores[sector].length + '</span>';
      nodoSec.appendChild(rowSec);
      hijosArea.appendChild(nodoSec);
    });
    nodoArea.appendChild(hijosArea);
    hijosRaiz.appendChild(nodoArea);

    // Caret del área (colapsar sus sectores)
    rowArea.querySelector('.tree-caret').addEventListener('click', () => {
      state[colKey] = !state[colKey];
      hijosArea.classList.toggle('collapsed', state[colKey]);
      rowArea.querySelector('.tree-caret').classList.toggle('collapsed', state[colKey]);
    });
    // Check del área: mostrar SOLO esa área. Lee el área por ÍNDICE (robusto).
    rowArea.querySelector('[data-arbol-area-idx]').addEventListener('click', () => {
      if (!map.hasLayer(areaRelacionamientoLayer)) areaRelacionamientoLayer.addTo(map);
      const areaSel = areas[areaIdx]; // nombre real desde el array, sin escape
      Object.keys(arbol).forEach(a => {
        const ocultar = (a !== areaSel);
        Object.keys(arbol[a]).forEach(s => setSectorOculto_(a, s, ocultar));
      });
      aplicarVisibilidadAreaRel_();
      hacerZoomArea_(areaSel);
      renderTab('capas');
    });
  });

  raiz.appendChild(hijosRaiz);

  // Caret raíz
  rowRaiz.querySelector('.tree-caret').addEventListener('click', () => {
    state.arbolAreaRelColapsado = !state.arbolAreaRelColapsado;
    hijosRaiz.classList.toggle('collapsed', state.arbolAreaRelColapsado);
    rowRaiz.querySelector('.tree-caret').classList.toggle('collapsed', state.arbolAreaRelColapsado);
  });
  // Check raíz: enciende/apaga toda la capa
  rowRaiz.querySelector('[data-arbol-raiz]').addEventListener('click', () => {
    if (map.hasLayer(areaRelacionamientoLayer)) {
      map.removeLayer(areaRelacionamientoLayer);
    } else {
      areaRelacionamientoLayer.addTo(map);
      // Al encender, mostrar todos los sectores
      Object.keys(arbol).forEach(a => Object.keys(arbol[a]).forEach(s => setSectorOculto_(a, s, false)));
      aplicarVisibilidadAreaRel_();
    }
    renderTab('capas');
  });

  // Delegación para checks de sector: alterna ese sector individual (mostrar/ocultar)
  hijosRaiz.querySelectorAll('[data-arbol-sec-idx]').forEach(chk => {
    chk.addEventListener('click', () => {
      if (!map.hasLayer(areaRelacionamientoLayer)) areaRelacionamientoLayer.addTo(map);
      const areaSel = areas[parseInt(chk.dataset.arbolAreaIdx, 10)];
      const nombresSec = Object.keys(arbol[areaSel]).sort();
      const sectorSel = nombresSec[parseInt(chk.dataset.arbolSecIdx, 10)];
      setSectorOculto_(areaSel, sectorSel, !sectorOculto_(areaSel, sectorSel));
      aplicarVisibilidadAreaRel_();
      renderTab('capas');
    });
  });

  return raiz;
}

function renderTab(tab) {
  try {
    renderTabInterno_(tab);

  } catch (e) {
    console.error('renderTab', tab, e);
    const c = document.getElementById('sidebar-content');
    if (c) c.innerHTML = '<div class="layer-empty-msg">Error al cargar: ' + (e && e.message ? escapeHtml_(e.message) : '?') + '</div>';
  }
}
function renderTabInterno_(tab) {
  state.activeTab = tab;
  document.getElementById('tab-title').textContent = tabMeta[tab].title;
  document.getElementById('tab-sub').textContent = tabMeta[tab].sub;
  const c = document.getElementById('sidebar-content');
  c.innerHTML = '';

  if (tab === 'capas') {
    if (!window.limitesPorComuna) window.limitesPorComuna = {};
    if (!window.arbolFundos) window.arbolFundos = {};
    if (!window.arbolFundosArauco) window.arbolFundosArauco = {};
    if (!window.comitesPorId) window.comitesPorId = {};
    // Límite comunal: si el usuario tiene VARIAS comunas -> árbol (una por comuna,
    // la activa resaltada). Si tiene una -> check simple.
    const idsMulti = tieneVariasComunas_() ? idsComunasMulti_() : [];
    if (idsMulti.length >= 2) {
      const cont = document.createElement('div');
      const comunasMulti = idsMulti.map(id => state.comunas.find(cm => cm.id === id)).filter(Boolean).sort((a, b) => a.comuna.localeCompare(b.comuna));
      const visibles = comunasMulti.filter(cm => window.limitesPorComuna[cm.id] && limitesMultiLayer.hasLayer(window.limitesPorComuna[cm.id])).length;
      // Arranca plegado: con varias comunas la lista ocupaba media pantalla.
      if (state.arbolLimitesColapsado === undefined) state.arbolLimitesColapsado = true;
      const raiz = document.createElement('div'); raiz.className = 'tree-node';
      const rowRaiz = document.createElement('div'); rowRaiz.className = 'tree-row';
      rowRaiz.innerHTML =
        '<span class="tree-caret ' + (state.arbolLimitesColapsado ? 'collapsed' : '') + '">▼</span>' +
        '<span class="tree-check ' + (visibles === comunasMulti.length ? 'on' : visibles > 0 ? 'partial' : '') + '" id="chk-limites-raiz"></span>' +
        '<span class="tree-label">Límites comunales</span>' +
        '<span class="tree-count">' + visibles + ' / ' + comunasMulti.length + '</span>';
      raiz.appendChild(rowRaiz);
      const hijos = document.createElement('div'); hijos.className = 'tree-children' + (state.arbolLimitesColapsado ? ' collapsed' : '');
      comunasMulti.forEach(cm => {
        const capa = window.limitesPorComuna[cm.id];
        const vis = capa && limitesMultiLayer.hasLayer(capa);
        const activa = cm.id === state.activeComunaId;
        const nodo = document.createElement('div'); nodo.className = 'tree-node sector';
        const row = document.createElement('div'); row.className = 'tree-row';
        row.innerHTML =
          '<span class="tree-caret leaf">▼</span>' +
          '<span class="tree-check ' + (vis ? 'on' : '') + '" data-lim="' + cm.id + '"></span>' +
          '<span class="tree-label" style="' + (activa ? 'color:var(--cobalt);font-weight:800;' : '') + '">' + (activa ? '● ' : '') + escapeHtml_(cm.comuna) + '</span>' +
          (activa ? '<span class="tree-count" style="color:var(--cobalt);">activa</span>' : '<button class="popup-btn" data-ir="' + cm.id + '" style="padding:2px 7px;font-size:9.5px;">ir</button>');
        nodo.appendChild(row); hijos.appendChild(nodo);
      });
      raiz.appendChild(hijos); cont.appendChild(raiz); c.appendChild(cont);
      rowRaiz.querySelector('.tree-caret').addEventListener('click', () => { state.arbolLimitesColapsado = !state.arbolLimitesColapsado; hijos.classList.toggle('collapsed', state.arbolLimitesColapsado); rowRaiz.querySelector('.tree-caret').classList.toggle('collapsed', state.arbolLimitesColapsado); });
      rowRaiz.querySelector('#chk-limites-raiz').addEventListener('click', () => {
        const todosVisibles = visibles === comunasMulti.length;
        comunasMulti.forEach(cm => { const capa = window.limitesPorComuna[cm.id]; if (!capa) return;
          if (todosVisibles) { limitesMultiLayer.removeLayer(capa); state.limitesOcultos[cm.id] = true; }
          else { if (!limitesMultiLayer.hasLayer(capa)) limitesMultiLayer.addLayer(capa); state.limitesOcultos[cm.id] = false; } });
        if (!map.hasLayer(limitesMultiLayer)) limitesMultiLayer.addTo(map);
        refrescarEstiloLimites_(); renderTab('capas');
      });
      hijos.querySelectorAll('[data-lim]').forEach(chk => chk.addEventListener('click', () => {
        const id = chk.dataset.lim; const capa = window.limitesPorComuna[id]; if (!capa) return;
        if (limitesMultiLayer.hasLayer(capa)) { limitesMultiLayer.removeLayer(capa); state.limitesOcultos[id] = true; }
        else { limitesMultiLayer.addLayer(capa); state.limitesOcultos[id] = false; }
        if (!map.hasLayer(limitesMultiLayer)) limitesMultiLayer.addTo(map);
        refrescarEstiloLimites_(); renderTab('capas');
      }));
      hijos.querySelectorAll('[data-ir]').forEach(b => b.addEventListener('click', () => seleccionarComuna_(b.dataset.ir)));
    } else {
      const limiteVisible = map.hasLayer(limiteLayer);
      state.limiteComunalOn = limiteVisible;
      const rowLimite = document.createElement('div'); rowLimite.className = 'layer-row';
      rowLimite.innerHTML =
        '<div class="layer-left"><span class="flame-dot" style="background:#0F172A"></span>' +
        '<div><div class="layer-name">Límite Comunal</div><div class="layer-count">' +
        (state.comunaActivaNombre ? escapeHtml_(state.comunaActivaNombre) : 'Comuna activa') + '</div></div></div>' +
        '<div class="toggle ' + (limiteVisible ? 'on' : '') + '" id="toggle-limite-comunal"></div>';
      c.appendChild(rowLimite);
      const tgLim = c.querySelector('#toggle-limite-comunal');
      if (tgLim) tgLim.addEventListener('click', () => {
        state.limiteComunalOn = !state.limiteComunalOn;
        tgLim.classList.toggle('on', state.limiteComunalOn);
        if (state.limiteComunalOn) { if (!map.hasLayer(limiteLayer)) limiteLayer.addTo(map); enviarLimiteAlFondo_(); }
        else { map.removeLayer(limiteLayer); }
      });
    }

    // "Asignación de Patrullaje" se quitó de las capas (11-10-2026): las rutas se
    // asignan desde el módulo 🚓 Patrullajes.

    const labelAP = document.createElement('div'); labelAP.className = 'layer-row';
    labelAP.innerHTML =
      '<div class="layer-left"><span class="flame-dot" style="background:#7C3AED"></span>' +
      '<div><div class="layer-name">Áreas Pobladas</div><div class="layer-count">Capa de referencia</div></div></div>' +
      '<div class="toggle ' + (map.hasLayer(areasPobladasLayer) ? 'on' : '') + '" data-layer="__areasPobladas"></div>';
    c.appendChild(labelAP);
    if (state.areasPobladasInfo.ok && !state.areasPobladasInfo.matched) {
      const msg = document.createElement('div'); msg.className = 'layer-empty-msg';
      msg.textContent = 'Sin áreas pobladas registradas para esta comuna.';
      c.appendChild(msg);
    }

    // Red Vial de Chile (MOP): misma lógica de encendido que las demás; se
    // carga recién al encenderla y solo para la comuna/área activa (+10 km).
    {
      const info = state.redVialInfo || { ok: true, count: 0 };
      const conteo = !state.redVialOn ? (state.areaActiva ? 'Área activa + 10 km' : 'Comuna + 10 km')
        : (!info.cargado ? 'Cargando…' : info.ok ? info.count + ' tramo(s)' : 'Error');
      const rowRV = document.createElement('div'); rowRV.className = 'layer-row';
      rowRV.innerHTML =
        '<div class="toggle ' + (state.redVialOn ? 'on' : '') + '" id="toggle-red-vial"></div>' +
        '<div class="layer-left"><span class="flame-dot" style="background:#F29E4C"></span>' +
        '<div><div class="layer-name">Red Vial (MOP)</div><div class="layer-count">' + conteo + '</div></div></div>' +
        '<button id="btn-etiq-red-vial" class="icon-btn' + (state.mostrarEtiquetasRedVial ? ' active' : '') + '" title="Mostrar/ocultar rol de los caminos" style="width:26px;height:26px;font-size:12px;flex-shrink:0;">🏷️</button>';
      c.appendChild(rowRV);
      c.querySelector('#toggle-red-vial').addEventListener('click', toggleRedVial_);
      c.querySelector('#btn-etiq-red-vial').addEventListener('click', toggleEtiquetasRedVial_);
      if (state.redVialOn) {
        const ley = document.createElement('div'); ley.className = 'rv-leyenda';
        ley.innerHTML = Object.keys(RED_VIAL_CATEGORIAS).map(k => {
          const cfg = RED_VIAL_CATEGORIAS[k];
          return '<span><i style="background:' + cfg.fill + ';border:1.5px ' + (cfg.dash ? 'dashed' : 'solid') + ' ' + cfg.casing + ';"></i>' + cfg.nombre + '</span>';
        }).join('');
        c.appendChild(ley);
      }
      if (info.ok === false && info.error) {
        const msg = document.createElement('div'); msg.className = 'layer-empty-msg';
        msg.textContent = info.error;
        c.appendChild(msg);
      }
    }

    // Zonas de alerta CMPC (SQL 126): 17 polígonos; la zona de cada recurso se calcula por su punto
    {
      const zi = state.zonasAlertaInfo;
      const rowZA = document.createElement('div'); rowZA.className = 'layer-row';
      rowZA.innerHTML =
        '<div class="toggle ' + (state.zonasAlertaOn ? 'on' : '') + '" id="toggle-zonas-alerta"></div>' +
        '<div class="layer-left"><span class="flame-dot" style="background:#CA8A04"></span>' +
        '<div><div class="layer-name">Zonas de alerta CMPC</div><div class="layer-count">' +
          (!zi.cargado ? 'Costa · Valle · Precordillera' : zi.ok ? zi.count + ' zona(s)' : 'Error') + '</div></div></div>';
      c.appendChild(rowZA);
      c.querySelector('#toggle-zonas-alerta').addEventListener('click', toggleZonasAlerta_);
      if (state.zonasAlertaOn) {
        const ley = document.createElement('div'); ley.className = 'rv-leyenda za-leyenda';
        ley.innerHTML = [['COSTA', 'Costa'], ['VALLE', 'Valle'], ['PRECORDILLERA', 'Precordillera'], ['NORTE', 'Zona 6']].map(([k, t]) =>
          '<span><i style="background:' + ZONA_ALERTA_COLOR[k] + '22;border:1.5px dashed ' + ZONA_ALERTA_COLOR[k] + ';"></i>' + t + '</span>').join('');
        c.appendChild(ley);
      }
      if (zi.ok === false && zi.error) {
        const msg = document.createElement('div'); msg.className = 'layer-empty-msg';
        msg.textContent = zi.error;
        c.appendChild(msg);
      }
    }

    const rolCalificaZonas = state.perfil.perfil === 'Administrador' || state.perfil.perfil === 'Jefe de Área Relacionamiento';
    if (rolCalificaZonas) {
      const labelZonas = document.createElement('p'); labelZonas.className = 'section-label'; labelZonas.style.marginTop = '14px';
      labelZonas.textContent = 'Capas por zona de relacionamiento';
      c.appendChild(labelZonas);

      // Fundos CMPC: fila simple con check (el botón de etiquetas al lado)
      const rowFundos = document.createElement('div'); rowFundos.className = 'layer-row';
      rowFundos.innerHTML =
        '<div class="toggle ' + (map.hasLayer(fundosCmpcLayer) ? 'on' : '') + '" data-arealayer="fundosCmpc"></div>' +
        '<div class="layer-left"><span class="flame-dot" style="background:#059669"></span>' +
        '<div><div class="layer-name">Fundos CMPC</div><div class="layer-count">' + (state.fundosCmpcInfo.ok ? state.fundosCmpcInfo.count + ' fundo(s)' : 'Cargando…') + '</div></div></div>' +
        '<button id="btn-toggle-etiquetas-fundos" class="icon-btn' + (state.mostrarEtiquetasFundos ? ' active' : '') + '" title="Mostrar/ocultar nombres de fundo" style="width:26px;height:26px;font-size:12px;flex-shrink:0;">🏷️</button>';
      c.appendChild(rowFundos);
      c.querySelector('#btn-toggle-etiquetas-fundos').addEventListener('click', toggleEtiquetasFundos_);
      if (state.fundosCmpcInfo.ok === false && state.fundosCmpcInfo.error) {
        const msg = document.createElement('div'); msg.className = 'layer-empty-msg';
        msg.textContent = state.fundosCmpcInfo.error;
        c.appendChild(msg);
      }

      // Fundos Arauco (solo Admin/Jefe de Área; apagada por defecto)
      const infoFA = state.fundosAraucoInfo || { ok: false, count: 0 };
      const rowFA = document.createElement('div'); rowFA.className = 'layer-row';
      rowFA.innerHTML =
        '<div class="toggle ' + (map.hasLayer(fundosAraucoLayer) ? 'on' : '') + '" id="toggle-fundos-arauco"></div>' +
        '<div class="layer-left"><span class="flame-dot" style="background:#6D28D9"></span>' +
        '<div><div class="layer-name">Fundos Arauco</div><div class="layer-count">' + (infoFA.ok ? infoFA.count + ' fundo(s)' : 'Cargando…') + '</div></div></div>' +
        '<button id="btn-etiq-fundos-arauco" class="icon-btn' + (state.mostrarEtiquetasFundosArauco ? ' active' : '') + '" title="Mostrar/ocultar nombres" style="width:26px;height:26px;font-size:12px;flex-shrink:0;">🏷️</button>';
      c.appendChild(rowFA);
      c.querySelector('#toggle-fundos-arauco').addEventListener('click', () => {
        const visible = map.hasLayer(fundosAraucoLayer);
        if (visible) map.removeLayer(fundosAraucoLayer); else fundosAraucoLayer.addTo(map);
        c.querySelector('#toggle-fundos-arauco').classList.toggle('on', !visible);
      });
      c.querySelector('#btn-etiq-fundos-arauco').addEventListener('click', () => {
        state.mostrarEtiquetasFundosArauco = !state.mostrarEtiquetasFundosArauco;
        loadFundosAraucoLayer_().then(() => { if (map.hasLayer(fundosAraucoLayer)) { map.removeLayer(fundosAraucoLayer); fundosAraucoLayer.addTo(map); } renderTab('capas'); });
      });

      // Red Vial CMPC (solo Admin y Jefe de Área): 3 categorías por tipo de carpeta, sin etiquetas.
      if (puedeVerRedVialCmpc_()) {
        const inf = state.redVialCmpcInfo || { ok: true, count: 0 };
        const detalle = textoDetalleRedVialCmpc_();
        const nodo = document.createElement('div'); nodo.className = 'tree-node';
        nodo.innerHTML =
          '<div class="layer-row" style="border-bottom:none;">' +
            '<div class="toggle ' + (state.redVialCmpcOn ? 'on' : '') + '" id="toggle-red-vial-cmpc"></div>' +
            '<div class="layer-left"><span class="flame-dot" style="background:#D32F2F"></span>' +
            '<div><div class="layer-name">Red Vial CMPC</div><div class="layer-count" id="rv-cmpc-detalle">' + detalle + '</div></div></div>' +
          '</div>' +
          (state.redVialCmpcOn
            ? '<div class="tree-children">' + Object.keys(RED_VIAL_CMPC_CATEGORIAS).map(k => {
                const cfg = RED_VIAL_CMPC_CATEGORIAS[k];
                const n = redVialCmpcTramos_.filter(t => t.cat === k).length;
                const muestra = '<svg width="22" height="8" style="flex-shrink:0;"><line x1="1" y1="4" x2="21" y2="4" stroke="' + cfg.color +
                  '" stroke-width="' + Math.min(4, cfg.w) + '"' + (cfg.dash ? ' stroke-dasharray="4,3"' : ' stroke-linecap="round"') + '/></svg>';
                return '<div class="tree-node sector"><div class="tree-row">' +
                  '<span class="tree-caret leaf">▼</span>' +
                  '<span class="tree-check ' + (state.redVialCmpcCatOculta[k] ? '' : 'on') + '" data-cmpc-cat="' + k + '"></span>' +
                  muestra +
                  '<span class="tree-label" title="N_ID_TIPO_CARPETA ' + cfg.codigos + '">' + cfg.nombre + '</span>' +
                  '<span class="tree-count" data-cmpc-n="' + k + '">' + n.toLocaleString('es-CL') + '</span>' +
                '</div></div>';
              }).join('') + '</div>'
            : '');
        c.appendChild(nodo);
        nodo.querySelector('#toggle-red-vial-cmpc').addEventListener('click', toggleRedVialCmpc_);
        nodo.querySelectorAll('[data-cmpc-cat]').forEach(chk =>
          chk.addEventListener('click', () => toggleCategoriaRedVialCmpc_(chk.dataset.cmpcCat)));
        if (state.redVialCmpcOn && inf.ok === false && inf.error) {
          const msg = document.createElement('div'); msg.className = 'layer-empty-msg';
          msg.textContent = inf.error;
          c.appendChild(msg);
        }
      }


      // Áreas de Relacionamiento: ÁRBOL jerárquico (Área → Sector)
      c.appendChild(construirArbolAreaRel_());
      if (state.areaRelacionamientoInfo.ok === false && state.areaRelacionamientoInfo.error) {
        const msg = document.createElement('div'); msg.className = 'layer-empty-msg';
        msg.textContent = state.areaRelacionamientoInfo.error;
        c.appendChild(msg);
      }

      // ── Recursos Disponibles: ÁRBOL jerárquico (Recursos → Tipos) ──
      {
        const infoRD = state.recursosDisponiblesInfo || { ok: false, count: 0 };
        renderArbolTiposRecurso_(c, {
          titulo: 'Recursos Disponibles',
          dotColor: '#0F172A',
          colapsoKey: 'colapsoRecDisp',
          layerGroup: recursosDisponiblesAreaLayer,
          featureLayers: recursosDisponiblesFeatureLayers,
          infoCount: infoRD.ok ? infoRD.count : null,
          btnEtiqId: 'btn-toggle-etiquetas-recursos-area',
          etiqActiva: state.mostrarEtiquetasRecursosArea,
          onToggleEtiq: toggleEtiquetasRecursosArea_,
          onToggleCapa: async () => {
            if (map.hasLayer(recursosDisponiblesAreaLayer)) {
              map.removeLayer(recursosDisponiblesAreaLayer);
              state.areasLayersOn.recursosDisponibles = false;
            } else {
              recursosDisponiblesAreaLayer.addTo(map);
              state.areasLayersOn.recursosDisponibles = true;
            }
          }
        });
        // Toggle "Solo turno de hoy" (si la capa está activa)
        if (map.hasLayer(recursosDisponiblesAreaLayer)) {
          const rowTurno = document.createElement('div');
          rowTurno.style.cssText = 'display:flex;align-items:center;gap:8px;padding:6px 8px 6px 24px;font-size:11.5px;';
          rowTurno.innerHTML =
            '<div class="toggle ' + (state.soloTurnoHoy ? 'on' : '') + '" id="toggle-turno-hoy" style="transform:scale(0.85);"></div>' +
            '<span style="color:var(--text-secondary);">📅 Solo recursos en turno hoy</span>';
          c.appendChild(rowTurno);
          rowTurno.querySelector('#toggle-turno-hoy').addEventListener('click', async () => {
            state.soloTurnoHoy = !state.soloTurnoHoy;
            if (state.soloTurnoHoy) await cargarRecursosActivosHoy_();
            aplicarVisibilidadTiposRecurso_(recursosDisponiblesAreaLayer);
            renderTab(state.activeTab || 'capas');
          });
        }
      }

      // ── CAPA ADMIN: Recursos filtrados por comuna (solo Administrador) ──
      if (esAdminOJefe_()) {   // 17-10-2026: también Jefe de Área
        const infoRCA = state.recursosComunaAdminInfo || { ok: false, count: 0 };
        renderArbolTiposRecurso_(c, {
          titulo: '📍 Recursos de la Comuna',
          dotColor: '#2563EB',
          colapsoKey: 'colapsoRecComuna',
          layerGroup: recursosComunaAdminLayer,
          featureLayers: recursosComunaAdminFeatureLayers,
          infoCount: infoRCA.ok ? infoRCA.count : null,
          btnEtiqId: 'btn-etiq-recursos-comuna-admin',
          etiqActiva: state.mostrarEtiquetasRecursosComunaAdmin,
          onToggleEtiq: toggleEtiquetasRecursosComunaAdmin_,
          onToggleCapa: async () => {
            if (map.hasLayer(recursosComunaAdminLayer)) {
              map.removeLayer(recursosComunaAdminLayer);
              state.recursosComunaAdminOn = false;
            } else {
              await loadRecursosComunaAdmin_();
              recursosComunaAdminLayer.addTo(map);
              state.recursosComunaAdminOn = true;
            }
          }
        });
      }

      c.querySelectorAll('[data-arealayer]').forEach(tg => {
        tg.addEventListener('click', () => {
          const clave = tg.dataset.arealayer;
          const layer = clave === 'fundosCmpc' ? fundosCmpcLayer : clave === 'areaRelacionamiento' ? areaRelacionamientoLayer : recursosDisponiblesAreaLayer;
          const visible = map.hasLayer(layer);
          if (visible) { map.removeLayer(layer); state.areasLayersOn[clave] = false; }
          else { layer.addTo(map); state.areasLayersOn[clave] = true; }
          tg.classList.toggle('on', !visible);
          // Re-render para mostrar/ocultar el árbol de tipos de recurso
          if (clave === 'recursosDisponibles') renderTab(state.activeTab || 'capas');
        });
      });
    }

    // ---- Categoría PATRULLAJE (visible para todos; contenido filtrado por perfil) ----
    const labelPatrullaje = document.createElement('p'); labelPatrullaje.className = 'section-label'; labelPatrullaje.style.marginTop = '14px';
    labelPatrullaje.textContent = 'Patrullaje';
    c.appendChild(labelPatrullaje);

    const infoPat = state.patrullajeInfo || { ok: false, count: 0, cargado: false };
    const arbolPat = window.arbolPatrullaje || {};

    if (Object.keys(arbolPat).length > 0) {
      // Árbol Área → Sector, igual que Áreas de Relacionamiento.
      c.appendChild(construirArbolGenerico_({
        titulo: 'Rutas de Patrullaje',
        arbol: arbolPat,
        layerGroup: patrullajeLayer,
        ocultosKey: 'patrullajeSectoresOcultos',
        colorDot: '#DC2626',
        colapsoKey: 'colapsoPatrullaje',
        conZoom: true,
      }));
    } else {
      const rowPatrullaje = document.createElement('div'); rowPatrullaje.className = 'layer-row';
      rowPatrullaje.innerHTML =
        '<div class="layer-left"><span class="flame-dot" style="background:#DC2626"></span>' +
        '<div><div class="layer-name">Rutas de Patrullaje</div><div class="layer-count">' +
        (infoPat.cargado ? (infoPat.ok ? infoPat.count + ' ruta(s)' : 'No disponible') : 'Cargando…') +
        '</div></div></div>' +
        '<div class="toggle ' + (map.hasLayer(patrullajeLayer) ? 'on' : '') + '" id="toggle-patrullaje"></div>';
      c.appendChild(rowPatrullaje);
      const tgPat = c.querySelector('#toggle-patrullaje');
      if (tgPat) tgPat.addEventListener('click', () => {
        state.patrullajeLayerOn = !state.patrullajeLayerOn;
        tgPat.classList.toggle('on', state.patrullajeLayerOn);
        if (state.patrullajeLayerOn) patrullajeLayer.addTo(map); else map.removeLayer(patrullajeLayer);
      });
    }
    if (infoPat.ok === false && infoPat.error) {
      const msg = document.createElement('div'); msg.className = 'layer-empty-msg';
      msg.textContent = infoPat.error;
      c.appendChild(msg);
    }

    // ── CAPA ADMIN: Rutas filtradas por comuna (solo Administrador) ──
    if (esAdminOJefe_()) {   // 17-10-2026: también Jefe de Área
      const infoRCU = state.rutasComunaAdminInfo || { ok: false, count: 0 };
      const arbolRC = window.arbolRutasComuna || {};

      if (Object.keys(arbolRC).length > 0) {
        // Mismo árbol Área → Sector que las rutas de patrullaje.
        c.appendChild(construirArbolGenerico_({
          titulo: '📍 Rutas de la Comuna',
          arbol: arbolRC,
          layerGroup: rutasComunaAdminLayer,
          ocultosKey: 'rutasComunaSectoresOcultos',
          colorDot: '#2563EB',
          colapsoKey: 'colapsoRutasComuna',
          conZoom: true,
        }));
      } else {
        const rowRCU = document.createElement('div'); rowRCU.className = 'layer-row';
        rowRCU.innerHTML =
          '<div class="layer-left"><span class="flame-dot" style="background:#2563EB"></span>' +
          '<div><div class="layer-name">📍 Rutas de la Comuna</div><div class="layer-count">' + (infoRCU.ok ? infoRCU.count + ' ruta(s) · comuna activa' : 'Cargando…') + '</div></div></div>' +
          '<div class="toggle ' + (map.hasLayer(rutasComunaAdminLayer) ? 'on' : '') + '" id="toggle-rutas-comuna-admin"></div>';
        c.appendChild(rowRCU);
        c.querySelector('#toggle-rutas-comuna-admin').addEventListener('click', async (ev) => {
          const tg = ev.currentTarget;
          if (map.hasLayer(rutasComunaAdminLayer)) {
            map.removeLayer(rutasComunaAdminLayer); state.rutasComunaAdminOn = false; tg.classList.remove('on');
          } else {
            await loadRutasComunaAdmin_();
            rutasComunaAdminLayer.addTo(map); state.rutasComunaAdminOn = true; tg.classList.add('on');
            renderTab(state.activeTab || 'capas');
          }
        });
      }
    }

    // ── App Móvil: posiciones en tiempo real ─────────────────────────────────
    {
      const labelApp = document.createElement('p'); labelApp.className = 'section-label';
      labelApp.style.marginTop = '14px'; labelApp.textContent = 'App Móvil — Patrulleros';
      c.appendChild(labelApp);
      const rowApp = document.createElement('div'); rowApp.className = 'layer-row';
      const tgApp = document.createElement('div');
      tgApp.className = 'toggle' + (state.appGpsActivo ? ' on' : '');
      const leftApp = document.createElement('div'); leftApp.className = 'layer-left';
      leftApp.innerHTML = '<span class="flame-dot" style="background:#2563EB"></span>' +
        '<div><div class="layer-name">📱 Patrulleros App (en vivo)</div>' +
        '<div class="layer-count" id="app-gps-count">Cargando…</div></div>';
      rowApp.appendChild(tgApp); rowApp.appendChild(leftApp);
      c.appendChild(rowApp);
      tgApp.addEventListener('click', () => {
        state.appGpsActivo = !state.appGpsActivo;
        tgApp.classList.toggle('on', state.appGpsActivo);
        if (state.appGpsActivo) cargarPosicionesApp_(); else limpiarPosicionesApp_();
      });
      if (state.appGpsActivo) cargarPosicionesApp_();
    }

    // Red de Prevención Comunitaria — visible para TODOS los perfiles
    {
      const infoCo = state.comiteInfo || { ok: false, count: 0 };
      const labelCo = document.createElement('p'); labelCo.className = 'section-label';
      labelCo.style.marginTop = '14px'; labelCo.textContent = 'Red de Prevención Comunitaria';
      c.appendChild(labelCo);
      const rowCo = document.createElement('div'); rowCo.className = 'layer-row';
      const tgComite = document.createElement('div');
      tgComite.className = 'toggle' + (map.hasLayer(comitePuntosLayer) ? ' on' : '');
      const leftComite = document.createElement('div'); leftComite.className = 'layer-left';
      leftComite.innerHTML = '<span class="flame-dot" style="background:#EA580C"></span>' +
        '<div><div class="layer-name">🖐️ Red de Prevención (Comités)</div><div class="layer-count">' + (infoCo.ok ? infoCo.count + ' comité(s) en la comuna' : 'Cargando…') + '</div></div>';
      rowCo.appendChild(tgComite);
      rowCo.appendChild(leftComite);
      c.appendChild(rowCo);
      tgComite.addEventListener('click', () => {
        const visible = map.hasLayer(comitePuntosLayer);
        if (visible) { map.removeLayer(comitePuntosLayer); map.removeLayer(comiteAreasLayer); }
        else { comiteAreasLayer.addTo(map); comitePuntosLayer.addTo(map); }
        tgComite.classList.toggle('on', !visible);
      });
    }

    const puedeVerAlertas = ['GRD','Administrador','Jefe de Área Relacionamiento'].includes(state.perfil.perfil);
    if (puedeVerAlertas) {
      const labelAlertas = document.createElement('p'); labelAlertas.className = 'section-label'; labelAlertas.style.marginTop = '14px';
      labelAlertas.textContent = 'Alertas Territoriales (Planificación Previa)';
      c.appendChild(labelAlertas);

      // ── Las tres alertas, cada una con su control de opacidad integrado ──
      // Antes la opacidad iba en un bloque aparte y no se veía a qué capa
      // correspondía cada deslizador.
      [
        { k: 'verde',    nombre: 'Normal',          color: '#16A34A', capa: capaAlertaVerdeLayer },
        { k: 'amarilla', nombre: 'Alerta Amarilla', color: '#F59E0B', capa: capaAlertaAmarillaLayer },
        { k: 'roja',     nombre: 'Alerta Roja',     color: '#EF4444', capa: capaAlertaRojaLayer },
      ].forEach(a => {
        const bloque = document.createElement('div');
        bloque.className = 'alerta-bloque';

        const opac = (state.opacidadAlerta && state.opacidadAlerta[a.k] != null) ? state.opacidadAlerta[a.k] : 50;
        const etiquetaOn = state.mostrarEtiquetasAlerta && state.mostrarEtiquetasAlerta[a.k];

        bloque.innerHTML =
          '<div class="layer-row" style="border-bottom:none;padding-bottom:2px;">' +
            '<div class="toggle ' + (map.hasLayer(a.capa) ? 'on' : '') + '" data-alertalayer="' + a.k + '"></div>' +
            '<div class="layer-left"><span class="flame-dot" style="background:' + a.color + '"></span>' +
            '<div><div class="layer-name">' + a.nombre + '</div>' +
            '<div class="layer-count">Comunas con plan activo</div></div></div>' +
            '<button id="btn-etiq-' + a.k + '" class="icon-btn' + (etiquetaOn ? ' active' : '') +
              '" title="Mostrar/ocultar etiquetas" style="width:26px;height:26px;font-size:12px;flex-shrink:0;">🏷️</button>' +
          '</div>' +
          '<div class="alerta-opacidad">' +
            '<span class="ao-icono">◐</span>' +
            '<input type="range" min="0" max="100" step="1" value="' + opac + '" ' +
              'data-opac-alerta="' + a.k + '" style="flex:1;accent-color:' + a.color + ';cursor:pointer;">' +
            '<span id="opac-val-' + a.k + '" class="ao-valor">' + opac + '%</span>' +
          '</div>';

        c.appendChild(bloque);
        bloque.querySelector('#btn-etiq-' + a.k).addEventListener('click', () => toggleEtiquetasAlerta_(a.k));
        bloque.querySelector('[data-opac-alerta]').addEventListener('input', (ev) =>
          setOpacidadAlerta_(a.k, ev.target.value));
      });

      // El copamiento por institución vive ahora en el panel flotante de
      // Simbología, con el mismo estado compartido. Se quitó de aquí para
      // no duplicar el mismo control en dos lugares.

      c.querySelectorAll('[data-alertalayer]').forEach(tg => {
        tg.addEventListener('click', () => {
          const clave = tg.dataset.alertalayer;
          const layerComuna = clave === 'verde' ? capaAlertaVerdeLayer : clave === 'amarilla' ? capaAlertaAmarillaLayer : capaAlertaRojaLayer;
          const layerRecursos = clave === 'verde' ? planificacionRecursosVerdeLayer : clave === 'amarilla' ? planificacionRecursosAmarillaLayer : planificacionRecursosRojaLayer;
          const visible = map.hasLayer(layerComuna);
          if (visible) { map.removeLayer(layerComuna); map.removeLayer(layerRecursos); state.alertaLayersOn[clave] = false; }
          else { layerComuna.addTo(map); layerRecursos.addTo(map); state.alertaLayersOn[clave] = true; reaplicarFiltrosAlerta_(); }
          tg.classList.toggle('on', !visible);
        });
      });
    }

    const label = document.createElement('p'); label.className = 'section-label'; label.style.marginTop = '14px';
    label.textContent = 'Incendios (SIDCO)' + (state.incendiosAmpliado ? ' · ' + (state.areaActiva ? 'área' : 'comuna') + ' + 10 km' : '');
    c.appendChild(label);

    const temporadas = state.temporadasDetectadas || [];
    if (temporadas.length === 0) {
      const msg = document.createElement('div'); msg.className = 'layer-empty-msg';
      msg.textContent = state.incendiosMatched === false ? 'Sin incendios registrados para esta comuna.' : 'No se detectaron incendios clasificados.';
      c.appendChild(msg);
    } else {
      // Agrupadas bajo un nodo raíz colapsable "Temporadas"
      if (state.incendiosColapsado === undefined) state.incendiosColapsado = false;
      const totalFocos = temporadas.reduce((n, t) => n + (fireHeatLayers[t] ? fireHeatLayers[t].count : 0), 0);
      const algunaVisible = temporadas.some(t => fireHeatLayers[t] && incendiosContainerLayer.hasLayer(fireHeatLayers[t].layer));

      const nodoRaiz = document.createElement('div'); nodoRaiz.className = 'tree-node';
      const rowRaiz = document.createElement('div'); rowRaiz.className = 'tree-row';
      rowRaiz.innerHTML =
        '<span class="tree-caret ' + (state.incendiosColapsado ? 'collapsed' : '') + '">▼</span>' +
        '<span class="tree-check ' + (algunaVisible ? 'on' : '') + '" id="chk-incendios-raiz"></span>' +
        '<span class="tree-label">Temporadas</span>' +
        '<span class="tree-count">' + temporadas.length + ' · ' + totalFocos.toLocaleString('es-CL') + ' focos</span>';
      nodoRaiz.appendChild(rowRaiz);
      const hijos = document.createElement('div');
      hijos.className = 'tree-children' + (state.incendiosColapsado ? ' collapsed' : '');

      temporadas.forEach(nombre => {
        const entry = fireHeatLayers[nombre];
        const visible = entry && incendiosContainerLayer.hasLayer(entry.layer);
        const nodo = document.createElement('div'); nodo.className = 'tree-node';
        const row = document.createElement('div'); row.className = 'tree-row';
        row.innerHTML =
          '<span class="tree-caret leaf">▼</span>' +
          '<span class="tree-check ' + (visible ? 'on' : '') + '" data-temp="' + escapeHtml_(nombre) + '"></span>' +
          '<span class="tree-label">' + escapeHtml_(nombre) + '</span>' +
          '<span class="tree-count">' + entry.count.toLocaleString('es-CL') + '</span>';
        nodo.appendChild(row);
        hijos.appendChild(nodo);
      });
      // ── Amebas de incendios: zona de ocurrencia histórica ──
      // Van dentro del mismo árbol, debajo de las temporadas, porque se
      // calculan a partir de ellas.
      const sepAmeba = document.createElement('div');
      sepAmeba.style.cssText = 'padding:6px 0 3px 22px;font-size:9.5px;letter-spacing:.04em;text-transform:uppercase;opacity:.55;';
      sepAmeba.textContent = 'Zona de ocurrencia (ameba)';
      hijos.appendChild(sepAmeba);

      NIVELES_AMEBA.forEach(cfg => {
        const hayTemporadas = temporadasOrdenadas_().length > 0;
        const visible = !!state.amebaVisible[cfg.id];
        const d = state.amebaDatos[cfg.id];
        const kpi = state.amebaKpi[cfg.id] || [];
        const roja = kpi.find(k => k.escenario === 'Roja');

        const nodo = document.createElement('div');
        nodo.className = 'tree-node sector';
        const row = document.createElement('div');
        row.className = 'tree-row';
        row.style.opacity = hayTemporadas ? '1' : '.45';
        const tempsUsadas = (d && d.temporadas && d.temporadas.length)
          ? d.temporadas.join(', ')
          : temporadasOrdenadas_().slice(0, cfg.temporadas).join(', ');
        row.title = cfg.etiqueta +
          (tempsUsadas ? '\n' + tempsUsadas : '') +
          (d && d.focos ? '\n' + d.focos + ' focos · ' + d.area_km2 + ' km²' : '') +
          (roja ? '\nCopado en Roja: ' + roja.pct_ameba + '%' : '');
        row.style.cursor = hayTemporadas ? 'pointer' : 'not-allowed';
        row.innerHTML =
          '<span class="tree-caret leaf">▼</span>' +
          '<span class="tree-check ' + (visible ? 'on' : '') + '" data-ameba="' + cfg.id + '"></span>' +
          '<span class="flame-dot" style="background:' + cfg.color + ';margin-right:2px;"></span>' +
          '<span class="tree-label">' + escapeHtml_(cfg.etiqueta) + '</span>' +
          '<span class="tree-count">' +
            (state.amebaCargando[cfg.id]
              ? 'calculando…'
              : (d && d.focos > 0
                  ? d.area_km2 + ' km²' + (roja ? ' · ' + roja.pct_ameba + '%' : '')
                  : (hayTemporadas ? '—' : 'sin datos'))) +
          '</span>';
        nodo.appendChild(row);
        hijos.appendChild(nodo);

        // Toda la fila responde al clic, no solo la casilla de 13 píxeles.
        row.addEventListener('click', () => {
          if (!hayTemporadas) { mostrarToast_('⚠️ No hay temporadas de incendios cargadas en esta comuna.'); return; }
          toggleAmeba_(cfg.id);
        });
      });

      nodoRaiz.appendChild(hijos);
      c.appendChild(nodoRaiz);

      // Caret raíz (colapsar)
      rowRaiz.querySelector('.tree-caret').addEventListener('click', () => {
        state.incendiosColapsado = !state.incendiosColapsado;
        hijos.classList.toggle('collapsed', state.incendiosColapsado);
        rowRaiz.querySelector('.tree-caret').classList.toggle('collapsed', state.incendiosColapsado);
      });
      // Check raíz: encender/apagar todas las temporadas
      rowRaiz.querySelector('#chk-incendios-raiz').addEventListener('click', () => {
        const hayVisible = temporadas.some(t => fireHeatLayers[t] && incendiosContainerLayer.hasLayer(fireHeatLayers[t].layer));
        temporadas.forEach(t => {
          const e = fireHeatLayers[t]; if (!e) return;
          if (hayVisible) { incendiosContainerLayer.removeLayer(e.layer); state.layersOn[t] = false; }
          else { incendiosContainerLayer.addLayer(e.layer); state.layersOn[t] = true; }
        });
        renderTab('capas');
      });
      // Checks de cada temporada
      hijos.querySelectorAll('[data-temp]').forEach(chk => {
        chk.addEventListener('click', () => {
          const nombre = chk.dataset.temp;
          const e = fireHeatLayers[nombre]; if (!e) return;
          const visible = incendiosContainerLayer.hasLayer(e.layer);
          if (visible) { incendiosContainerLayer.removeLayer(e.layer); state.layersOn[nombre] = false; }
          else { incendiosContainerLayer.addLayer(e.layer); state.layersOn[nombre] = true; }
          chk.classList.toggle('on', !visible);
        });
      });
    }

    // Áreas Pobladas usa data-layer='__areasPobladas' con su propio listener
    c.querySelectorAll('.toggle[data-layer="__areasPobladas"]').forEach(tg => {
      tg.addEventListener('click', () => {
        const visible = map.hasLayer(areasPobladasLayer);
        if (visible) { map.removeLayer(areasPobladasLayer); state.layersOn.__areasPobladas = false; }
        else { areasPobladasLayer.addTo(map); state.layersOn.__areasPobladas = true; }
        tg.classList.toggle('on', !visible);
      });
    });
    aplicarPermisosCapas_(c);   // capas que el Administrador ocultó a este usuario (SQL 83)
  }

  if (tab === 'copamiento') {
    if (window.__DEBUG__) console.log('[DEBUG] renderTab(copamiento) — state.activeComunaId:', state.activeComunaId, '| state.periodos:', state.periodos.length, '| state.recursos:', state.recursos.length);
    const puedeEditar = ['GRD','Administrador','Jefe de Área Relacionamiento'].includes(state.perfil.perfil) && puedeEditarModulo_('periodo_critico');
    if (state.perfil.perfil === 'Visor' || !puedeEditar) {
      const note = document.createElement('div'); note.className = 'viewer-note';
      note.textContent = state.perfil.perfil === 'Visor'
        ? 'Tu perfil es Visor: puedes consultar los periodos y recursos, pero no crear ni editar.'
        : 'Tu usuario puede consultar los periodos críticos, pero no crearlos ni editarlos.';
      c.appendChild(note);
    } else {
      const note = document.createElement('div'); note.className = 'editor-note';
      note.textContent = 'Crea el periodo con 🔥 Crear Periodo Crítico. Para agregar recursos al periodo activo usa ✏️ (arriba) ▸ Editar Periodo Crítico y haz clic en el mapa; cada recurso se edita desde su popup.';
      c.appendChild(note);
    }

    // El periodo se crea con el botón 🔥 Crear Periodo Crítico del mapa (Modo Emergencia).

    if (state.periodos.length === 0) {
      const msg = document.createElement('div'); msg.className = 'layer-empty-msg';
      msg.textContent = 'Esta comuna todavía no tiene periodos críticos registrados.';
      c.appendChild(msg);
    }

    const esAdmin = state.perfil.perfil === 'Administrador';
    const periodosActivos = state.periodos.filter(p => p.estado_periodo === 'activo');
    const periodosCerrados = state.periodos.filter(p => p.estado_periodo === 'cerrado');

    function renderGrupoPeriodo_(p) {
      const cantidad = state.recursos.filter(r => r.id_periodo === p.id).length;
      const puedeEliminarEste = p.estado_periodo === 'activo' ? (p.creado_por === state.user.id || esAdminOJefe_()) : esAdminOJefe_();
      const grupo = document.createElement('div'); grupo.className = 'periodo-group';
      grupo.innerHTML =
        '<div class="periodo-head">' +
        '<div class="ph-left"><div><div class="ph-name">' + escapeHtml_(p.nombre_plan) + ' <span class="periodo-badge ' + p.estado_periodo + '">' + p.estado_periodo + '</span></div>' +
        '<div class="ph-fechas">' + (p.fecha_inicio || '—') + ' → ' + (p.fecha_fin || 'indefinido') + ' · Creado por ' + p.creador_nombre + '</div></div></div>' +
        '<button class="icon-btn btn-etiq-periodo' + (state.mostrarEtiquetasPeriodo && state.mostrarEtiquetasPeriodo[p.id] ? ' active' : '') + '" data-pid="' + p.id + '" title="Mostrar/ocultar etiquetas" style="width:24px;height:24px;font-size:11px;flex-shrink:0;">🏷️</button>' +
        '<div class="toggle ' + ((periodoLayers[p.id] && map.hasLayer(periodoLayers[p.id])) ? 'on' : '') + '" data-periodo="' + p.id + '"></div>' +
        '</div>' +
        (p.conclusion ? '<div class="periodo-body" style="display:block;border-top:1px solid #F1F5F9;"><span class="periodo-count" style="display:block;margin-bottom:2px;font-weight:700;">Conclusión:</span><span class="periodo-count">' + escapeHtml_(p.conclusion) + '</span></div>' : '') +
        '<div class="periodo-body"><span class="periodo-count">' + cantidad + ' recurso(s)</span>' +
        '<div class="periodo-actions-row">' +
        '<button class="btn-resumen-periodo" data-accion="resumen" data-id="' + p.id + '">📊 Resumen</button>' +
        (puedeEditar && p.estado_periodo === 'activo' ? '<button class="popup-btn" data-accion="cerrar" data-id="' + p.id + '">Cerrar</button>' : '') +
        (puedeEliminarEste ? '<button class="popup-btn" data-accion="eliminar-periodo" data-id="' + p.id + '" style="color:#DC2626;">Eliminar</button>' : '') +
        '</div></div>';
      grupo.querySelector('.toggle').addEventListener('click', (ev) => {
        if (!periodoLayers[p.id]) return;
        const visible = map.hasLayer(periodoLayers[p.id]);
        if (visible) { map.removeLayer(periodoLayers[p.id]); state.periodoLayersOn[p.id] = false; }
        else { periodoLayers[p.id].addTo(map); state.periodoLayersOn[p.id] = true; }
        ev.currentTarget.classList.toggle('on', !visible);
      });
      const btnEtiqPer = grupo.querySelector('.btn-etiq-periodo');
      if (btnEtiqPer) btnEtiqPer.addEventListener('click', (e) => { e.stopPropagation(); toggleEtiquetasPeriodo_(p.id, btnEtiqPer); });
      grupo.querySelector('[data-accion="resumen"]').addEventListener('click', () => abrirResumenPeriodo_(p.id));
      const btnCerrar = grupo.querySelector('[data-accion="cerrar"]');
      if (btnCerrar) btnCerrar.addEventListener('click', () => abrirModalCerrarPeriodo_(p.id, p.nombre_plan));
      const btnEliminarPeriodo = grupo.querySelector('[data-accion="eliminar-periodo"]');
      if (btnEliminarPeriodo) btnEliminarPeriodo.addEventListener('click', () => eliminarPeriodo_(p.id, p.nombre_plan, cantidad));
      return grupo;
    }

    if (periodosActivos.length > 0) {
      const label = document.createElement('p'); label.className = 'section-label'; label.style.marginTop = '4px';
      label.textContent = 'Periodos Activos';
      c.appendChild(label);
      periodosActivos.forEach(p => c.appendChild(renderGrupoPeriodo_(p)));
    }

    if (periodosCerrados.length > 0) {
      const label = document.createElement('p'); label.className = 'section-label'; label.style.marginTop = '16px';
      label.textContent = 'Historial de Periodos (cerrados)';
      c.appendChild(label);
      periodosCerrados.forEach(p => c.appendChild(renderGrupoPeriodo_(p)));
    }

    const cantidadSinPeriodo = state.recursos.filter(r => !r.id_periodo).length;
    if (cantidadSinPeriodo > 0) {
      const label = document.createElement('p'); label.className = 'section-label'; label.style.marginTop = '16px';
      label.textContent = 'Sin periodo asignado (histórico)';
      c.appendChild(label);
      const grupo = document.createElement('div'); grupo.className = 'periodo-group';
      grupo.innerHTML =
        '<div class="periodo-head"><div class="ph-left"><div><div class="ph-name">Sin periodo asignado</div>' +
        '<div class="ph-fechas">Recursos de periodos ya eliminados</div></div></div>' +
        '<div class="toggle ' + ((periodoLayers.sin_periodo && map.hasLayer(periodoLayers.sin_periodo)) ? 'on' : '') + '" data-periodo="sin_periodo"></div></div>' +
        '<div class="periodo-body"><span class="periodo-count">' + cantidadSinPeriodo + ' recurso(s)</span></div>';
      grupo.querySelector('.toggle').addEventListener('click', (ev) => {
        if (!periodoLayers.sin_periodo) return;
        const visible = map.hasLayer(periodoLayers.sin_periodo);
        if (visible) { map.removeLayer(periodoLayers.sin_periodo); state.periodoLayersOn.sin_periodo = false; }
        else { periodoLayers.sin_periodo.addTo(map); state.periodoLayersOn.sin_periodo = true; }
        ev.currentTarget.classList.toggle('on', !visible);
      });
      c.appendChild(grupo);
    }
  }

  if (tab === 'informe') {
    renderTabInforme_(c);
    return;
  }
  if (tab === 'usuarios') {
    // Este tab ya no se usa directamente: el botón del riel abre el
    // panel de usuarios en un modal grande (abrirPanelUsuarios_), pensado
    // para escalar cuando haya muchos usuarios (buscador incluido).
  }
}

