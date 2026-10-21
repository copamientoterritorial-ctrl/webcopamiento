/* ============ INFORME EN PDF ============
 * Se dibuja con jsPDF directamente, sin capturar la pantalla. Así el texto
 * queda seleccionable, las tablas nítidas a cualquier zoom y el archivo
 * pesa una fracción de lo que pesaría una captura.
 */
function descargarInformePdf_() {
  const inf = informeFiltrado_();
  if (!inf) return;

  const { jsPDF } = window.jspdf || {};
  if (!jsPDF) { mostrarToast_('No se pudo cargar el generador de PDF.'); return; }

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const ANCHO = 297, ALTO = 210, M = 12;
  const COL = { Verde: [22, 163, 74], Amarilla: [245, 158, 11], Roja: [239, 68, 68] };
  let y = 0;

  const nuevaPagina = (titulo) => {
    doc.addPage();
    y = M;
    if (titulo) seccion(titulo);
  };
  const espacio = (n) => { if (y + n > ALTO - M) nuevaPagina(); };

  // ---- Cabecera ----
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, ANCHO, 26, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(15);
  doc.text('Informe de nivel de copamiento', M, 12);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5);
  doc.setTextColor(190, 200, 215);
  const sup = inf.superficie;
  const lugar = sup ? [sup.comuna, sup.provincia, sup.region].filter(Boolean).join('  ·  ') : inf.comuna;
  doc.text(lugar + '     ' + inf.generado.toLocaleDateString('es-CL') + ' ' +
    inf.generado.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }) +
    '     Influencia ' + inf.bufferInfluencia + ' m', M, 19);
  y = 34;

  const seccion = (t) => {
    espacio(14);
    doc.setFillColor(37, 99, 235);
    doc.rect(M, y - 4, 1.2, 5.5, 'F');
    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5);
    doc.text(t, M + 4, y);
    y += 7;
  };

  const nota = (t) => {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.splitTextToSize(t, ANCHO - M * 2).forEach(l => { espacio(5); doc.text(l, M, y); y += 3.6; });
    y += 2;
  };

  /** Tabla simple con anchos proporcionales. */
  const tabla = (cabeceras, filas, anchos, alineaDer) => {
    const total = anchos.reduce((a, b) => a + b, 0);
    const disp = ANCHO - M * 2;
    const w = anchos.map(a => (a / total) * disp);

    const pintarCabecera = () => {
      espacio(10);
      doc.setFillColor(241, 245, 249);
      doc.rect(M, y - 3.8, disp, 6, 'F');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(7);
      doc.setTextColor(71, 85, 105);
      let x = M + 1.5;
      cabeceras.forEach((c, i) => {
        const der = alineaDer && alineaDer.indexOf(i) !== -1;
        doc.text(String(c), der ? x + w[i] - 3 : x, y, { align: der ? 'right' : 'left' });
        x += w[i];
      });
      y += 5;
    };

    pintarCabecera();
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5);

    filas.forEach((fila, n) => {
      if (y + 6 > ALTO - M) { nuevaPagina(); pintarCabecera(); doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); }
      if (n % 2 === 1) { doc.setFillColor(250, 252, 254); doc.rect(M, y - 3.6, disp, 5.4, 'F'); }
      doc.setTextColor(30, 41, 59);
      let x = M + 1.5;
      fila.forEach((celda, i) => {
        const der = alineaDer && alineaDer.indexOf(i) !== -1;
        const txt = String(celda == null ? '—' : celda);
        doc.text(txt.length > 46 ? txt.slice(0, 45) + '…' : txt,
          der ? x + w[i] - 3 : x, y, { align: der ? 'right' : 'left' });
        x += w[i];
      });
      y += 5.4;
    });
    y += 5;
  };

  const escenarios = ['Verde', 'Amarilla', 'Roja'];

  // ---- Datos del territorio y copamiento por alerta ----
  seccion('1. Nivel de copamiento — territorio comunal');
  const anchoCaja = (ANCHO - M * 2 - 12) / 3;
  escenarios.forEach((esc, i) => {
    const filas = inf.instituciones.filter(f => f.escenario === esc);
    const pct = filas.reduce((n, f) => n + (Number(f.pct_comuna) || 0), 0);
    const km = filas.reduce((n, f) => n + (Number(f.area_km2) || 0), 0);
    const rec = filas.reduce((n, f) => n + (Number(f.entidades) || 0), 0);
    const x = M + i * (anchoCaja + 6);

    doc.setDrawColor(226, 232, 240); doc.setFillColor(255, 255, 255);
    doc.roundedRect(x, y, anchoCaja, 20, 2, 2, 'FD');
    doc.setFillColor(COL[esc][0], COL[esc][1], COL[esc][2]);
    doc.roundedRect(x, y, 1.6, 20, 0.8, 0.8, 'F');

    doc.setTextColor(100, 116, 139); doc.setFont('helvetica', 'bold'); doc.setFontSize(7);
    doc.text(nombreEscenario_(esc).toUpperCase(), x + 5, y + 6);
    doc.setTextColor(15, 23, 42); doc.setFontSize(15);
    doc.text(pct.toFixed(1) + ' %', x + 5, y + 14);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7);
    doc.setTextColor(100, 116, 139);
    doc.text(rec + ' recursos  ·  ' + km.toFixed(1) + ' km²', x + 5, y + 18);
  });
  y += 27;

  if (sup) {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
    doc.setTextColor(71, 85, 105);
    doc.text('Superficie comunal: ' + (sup.area_km2 != null ? Number(sup.area_km2).toLocaleString('es-CL') + ' km²' : '—') +
      '     Perímetro: ' + (sup.perimetro_km != null ? Number(sup.perimetro_km).toLocaleString('es-CL') + ' km' : '—'), M, y);
    y += 9;
  }

  // ---- Nivel de copamiento sobre incendios, por ventana histórica ----
  const nombreVentanaPdf = { 1: 'Última temporada', 3: 'Últimas 3 temporadas', 5: 'Últimas 5 temporadas' };
  const hayIncPdf = NIVELES_AMEBA.some(cfg => (inf.incendios[cfg.id] || []).length > 0);

  if (hayIncPdf) {
    espacio(16);
    seccion('1. Nivel de copamiento — ocurrencia de incendios');
    nota('Porcentaje de la zona donde históricamente se producen incendios cubierto por los recursos. ' +
         'Considera todos los recursos del escenario, sin filtro por institución.');

    NIVELES_AMEBA.forEach(cfg => {
      const filas = inf.incendios[cfg.id] || [];
      if (filas.length === 0) return;
      espacio(30);

      doc.setFont('helvetica', 'bold'); doc.setFontSize(8);
      doc.setTextColor(30, 41, 59);
      doc.text(nombreVentanaPdf[cfg.temporadas] || (cfg.temporadas + ' temporadas'), M, y);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7);
      doc.setTextColor(100, 116, 139);
      doc.text('Zona de ocurrencia: ' + filas[0].ameba_km2 + ' km²', M + 55, y);
      y += 4;

      escenarios.forEach((esc, i) => {
        const f = filas.find(x => x.escenario === esc);
        const pct = f && f.pct_ameba != null ? Number(f.pct_ameba) : 0;
        const x = M + i * (anchoCaja + 6);

        doc.setDrawColor(226, 232, 240); doc.setFillColor(255, 255, 255);
        doc.roundedRect(x, y, anchoCaja, 17, 2, 2, 'FD');
        doc.setFillColor(COL[esc][0], COL[esc][1], COL[esc][2]);
        doc.roundedRect(x, y, 1.6, 17, 0.8, 0.8, 'F');

        // Barra de avance dentro de la caja.
        const bx = x + 5, bw = anchoCaja - 10;
        doc.setFillColor(237, 242, 247);
        doc.roundedRect(bx, y + 11, bw, 2.6, 1.3, 1.3, 'F');
        if (pct > 0) {
          doc.setFillColor(COL[esc][0], COL[esc][1], COL[esc][2]);
          doc.roundedRect(bx, y + 11, Math.max(2, bw * (pct / 100)), 2.6, 1.3, 1.3, 'F');
        }

        doc.setTextColor(100, 116, 139); doc.setFont('helvetica', 'bold'); doc.setFontSize(6.5);
        doc.text(nombreEscenario_(esc).toUpperCase(), bx, y + 5);
        doc.setTextColor(15, 23, 42); doc.setFontSize(11);
        doc.text(pct.toFixed(1) + ' %', bx + bw, y + 5.5, { align: 'right' });
        doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5);
        doc.setTextColor(100, 116, 139);
        doc.text((f ? f.copado_km2 : 0) + ' km² cubiertos', bx, y + 9);
      });
      y += 23;
    });
  }

  // ---- 1. Por institución ----
  seccion('2. Detalle por institución');
  escenarios.forEach(esc => {
    const filas = inf.instituciones.filter(f => f.escenario === esc);
    if (filas.length === 0) return;
    espacio(12);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5);
    doc.setTextColor(COL[esc][0], COL[esc][1], COL[esc][2]);
    doc.text(nombreEscenario_(esc), M, y); y += 5;

    tabla(
      ['Institución', 'Recursos', 'Recursos fijos / Punto de control', 'Rutas de patrullaje',
       'Área de influencia', 'Copamiento km²', '% comuna'],
      filas.map(f => [aTitulo_(f.institucion), f.entidades, f.puntos, f.lineas, f.areas,
                      f.area_km2, f.pct_comuna != null ? f.pct_comuna + '%' : '—']),
      [30, 12, 26, 18, 18, 16, 12], [1, 2, 3, 4, 5, 6]
    );
  });

  // ---- 2. Por tipo de recurso ----
  if (inf.porTipo && inf.porTipo.length > 0) {
    nuevaPagina();
    seccion('3. Tipos de recurso del área y su cobertura');
    escenarios.forEach(esc => {
      const filas = inf.porTipo.filter(f => f.escenario === esc);
      if (filas.length === 0) return;
      espacio(12);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5);
      doc.setTextColor(COL[esc][0], COL[esc][1], COL[esc][2]);
      doc.text(nombreEscenario_(esc), M, y); y += 5;

      tabla(
        ['Tipo de recurso', 'Pertenencia', 'Institución', 'Recursos',
         'Rutas de patrullaje', 'Área de influencia', 'Cobertura km²', '% comuna'],
        filas.map(f => [aTitulo_(f.tipo_recurso), f.pertenencia, aTitulo_(f.institucion),
                        f.entidades, f.lineas, f.areas, f.area_km2,
                        f.pct_comuna != null ? f.pct_comuna + '%' : '—']),
        [28, 20, 24, 12, 18, 18, 16, 12], [3, 4, 5, 6, 7]
      );
    });
  }

  // ---- 3. Sobre incendios ----
  espacio(40);
  seccion((inf.porTipo && inf.porTipo.length > 0 ? '4' : '3') + '. Detalle del copamiento sobre incendios');
  nota('Zona de ocurrencia: unión de círculos de ' + inf.bufferAmeba +
       ' m alrededor de cada foco histórico. Este bloque considera todos los recursos del escenario.');

  const filasInc = [];
  NIVELES_AMEBA.forEach(cfg => {
    const filas = inf.incendios[cfg.id] || [];
    const base = filas.length > 0 ? filas[0].ameba_km2 : '—';
    const fila = [cfg.temporadas + ' temporada' + (cfg.temporadas > 1 ? 's' : ''), base];
    escenarios.forEach(esc => {
      const f = filas.find(x => x.escenario === esc);
      fila.push(f ? f.copado_km2 : '—');
      fila.push(f && f.pct_ameba != null ? f.pct_ameba + '%' : '—');
    });
    filasInc.push(fila);
  });
  tabla(['Ventana histórica', 'Zona km²', 'Normal km²', 'Normal %', 'Amarilla km²', 'Amarilla %',
         'Roja km²', 'Roja %'], filasInc, [28, 16, 16, 12, 18, 14, 16, 12], [1, 2, 3, 4, 5, 6, 7]);

  // ---- Pie en todas las páginas ----
  const total = doc.internal.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setDrawColor(226, 232, 240);
    doc.line(M, ALTO - 9, ANCHO - M, ALTO - 9);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5);
    doc.setTextColor(148, 163, 184);
    doc.text('SIG Copamiento Territorial  ·  ' + inf.comuna +
      (inf.filtrado ? '  ·  Filtrado por institución' : ''), M, ALTO - 5);
    doc.text('Página ' + i + ' de ' + total, ANCHO - M, ALTO - 5, { align: 'right' });
  }

  doc.save(nombreArchivoInforme_('pdf'));
  mostrarToast_('📕 PDF descargado.');
}

function nombreArchivoInforme_(ext) {
  const inf = state.informe;
  const f = inf ? inf.generado : new Date();
  const fecha = f.toISOString().slice(0, 10);
  const comuna = (inf ? inf.comuna : 'comuna').replace(/[^A-Za-zÁÉÍÓÚÑáéíóúñ0-9]+/g, '_');
  return 'copamiento_' + comuna + '_' + fecha + '.' + ext;
}

function descargarArchivo_(contenido, nombre, tipo) {
  const blob = new Blob([contenido], { type: tipo });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function descargarInformeHtml_() {
  const inf = informeFiltrado_();
  if (!inf) return;

  const doc =
'<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">' +
'<title>Informe de copamiento — ' + escapeHtml_(inf.comuna) + '</title>' +
'<style>' +
'body{font-family:Inter,Segoe UI,sans-serif;color:#0F172A;line-height:1.45;margin:0;padding:34px 24px 40px;' +
'background:#F7FAFD;background-image:radial-gradient(circle at 1px 1px, rgba(37,99,235,0.055) 1px, transparent 0);background-size:18px 18px;}' +
'.hoja{max-width:900px;margin:0 auto;background:#fff;border:1px solid #E2E8F0;border-radius:14px;padding:30px 34px 36px;box-shadow:0 2px 10px rgba(15,23,42,0.06);}' +
'h1{font-size:21px;margin:0 0 3px;letter-spacing:-.2px;}' +
'h2{font-size:12.5px;font-weight:400;color:#64748B;margin:0 0 24px;}' +
'footer{margin-top:32px;font-size:10.5px;color:#94A3B8;border-top:1px solid #E2E8F0;padding-top:10px;line-height:1.6;}' +
'@media print{body{margin:0;} h3{page-break-after:avoid;} table,.grafico{page-break-inside:avoid;}}' +
'</style>' + estilosInforme_('') + '</head><body><div class="hoja">' +
'<h1>Informe de nivel de copamiento</h1>' +
'<h2>' + escapeHtml_(inf.comuna) + ' · generado el ' +
  inf.generado.toLocaleDateString('es-CL') + ' a las ' +
  inf.generado.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }) + '</h2>' +
graficosInforme_() +
tablasInforme_() +
'<footer>SIG Copamiento Territorial · Influencia de recursos ' + inf.bufferInfluencia +
' m · Zona de ocurrencia ' + inf.bufferAmeba + ' m · Las superficies descuentan los solapes entre recursos.</footer>' +
'</div></body></html>';

  descargarArchivo_(doc, nombreArchivoInforme_('html'), 'text/html;charset=utf-8');
  mostrarToast_('⬇️ Informe descargado.');
}

function descargarInformeCsv_() {
  const inf = informeFiltrado_();
  if (!inf) return;

  const esc = (v) => {
    const t = (v === null || v === undefined) ? '' : String(v);
    return /[";\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t;
  };

  const lineas = [];
  lineas.push(esc('Informe de nivel de copamiento'));
  lineas.push(esc('Comuna') + ';' + esc(inf.comuna));
  lineas.push(esc('Generado') + ';' + esc(inf.generado.toLocaleString('es-CL')));
  if (inf.superficie) {
    lineas.push(esc('Superficie comunal km2') + ';' + esc(inf.superficie.area_km2));
    lineas.push(esc('Perímetro km') + ';' + esc(inf.superficie.perimetro_km));
    lineas.push(esc('Región') + ';' + esc(inf.superficie.region));
    lineas.push(esc('Provincia') + ';' + esc(inf.superficie.provincia));
  }
  lineas.push('');

  lineas.push(esc('2. Detalle por institución'));
  lineas.push(['Escenario', 'Institución', 'Recursos', 'Recursos fijos / Punto de control',
               'Rutas de patrullaje', 'Área de influencia', 'Copamiento km2', '% comuna'].map(esc).join(';'));
  inf.instituciones.forEach(f => {
    lineas.push([f.escenario, aTitulo_(f.institucion), f.entidades, f.puntos, f.lineas, f.areas,
                 f.area_km2, f.pct_comuna != null ? f.pct_comuna : ''].map(esc).join(';'));
  });
  lineas.push('');

  if (inf.porTipo && inf.porTipo.length > 0) {
    lineas.push(esc('3. Tipos de recurso del área y su cobertura'));
    lineas.push(['Escenario', 'Tipo de recurso', 'Pertenencia', 'Institución', 'Recursos',
                 'Recursos fijos / Punto de control', 'Rutas de patrullaje', 'Área de influencia',
                 'Cobertura km2', '% comuna'].map(esc).join(';'));
    inf.porTipo.forEach(f => {
      lineas.push([f.escenario, aTitulo_(f.tipo_recurso), f.pertenencia, aTitulo_(f.institucion),
                   f.entidades, f.puntos, f.lineas, f.areas, f.area_km2,
                   f.pct_comuna != null ? f.pct_comuna : ''].map(esc).join(';'));
    });
    lineas.push('');
  }

  lineas.push(esc('4. Detalle del copamiento sobre incendios'));
  lineas.push(['Ventana (temporadas)', 'Escenario', 'Zona km2', 'Copado km2', 'Sin cubrir km2', '% zona'].map(esc).join(';'));
  NIVELES_AMEBA.forEach(cfg => {
    (inf.incendios[cfg.id] || []).forEach(f => {
      lineas.push([cfg.temporadas, f.escenario, f.ameba_km2, f.copado_km2,
                   f.sin_cubrir_km2, f.pct_ameba != null ? f.pct_ameba : ''].map(esc).join(';'));
    });
  });

  // BOM para que Excel reconozca los acentos.
  descargarArchivo_('\ufeff' + lineas.join('\n'), nombreArchivoInforme_('csv'), 'text/csv;charset=utf-8');
  mostrarToast_('📄 CSV descargado.');
}

function flameRowIcon_(color) {
  return '<svg width="18" height="18" viewBox="0 0 24 24" style="flex-shrink:0;"><path fill="' + color + '" d="M12 2c1 3-2 4-2 7a4 4 0 0 0 8 0c0-2-1-3-1-3s2 1 2 5a7 7 0 0 1-14 0c0-6 5-6 7-9Z"/></svg>';
}

/* ============ ÁRBOL GENÉRICO Área → Sector (reutilizable) ============
 * cfg = { titulo, arbol, layerGroup, ocultosKey, colorDot, colapsoKey, conZoom }
 * arbol = { area: { sector: [capas Leaflet] } }
 * ocultosKey = nombre del objeto en state con "area||sector" -> true si oculto */
function sectorOcultoGen_(ocultosKey, area, sector) {
  return !!(state[ocultosKey] || {})[area + '||' + sector];
}
function setSectorOcultoGen_(ocultosKey, area, sector, oculto) {
  if (!state[ocultosKey]) state[ocultosKey] = {};
  state[ocultosKey][area + '||' + sector] = oculto;
}
function estadoAreaGen_(ocultosKey, area, sectores) {
  const nombres = Object.keys(sectores);
  const visibles = nombres.filter(s => !sectorOcultoGen_(ocultosKey, area, s)).length;
  if (visibles === 0) return 'off';
  if (visibles === nombres.length) return 'on';
  return 'partial';
}
function aplicarVisibilidadGen_(arbol, layerGroup, ocultosKey) {
  const encendida = map.hasLayer(layerGroup);
  Object.keys(arbol).forEach(area => {
    Object.keys(arbol[area]).forEach(sector => {
      const oculto = !encendida || sectorOcultoGen_(ocultosKey, area, sector);
      arbol[area][sector].forEach(capa => {
        const enGrupo = layerGroup.hasLayer(capa);
        if (oculto && enGrupo) layerGroup.removeLayer(capa);
        else if (!oculto && !enGrupo) layerGroup.addLayer(capa);
      });
    });
  });
}
function zoomAreaGen_(arbol, area) {
  if (!arbol[area]) return;
  let bounds = null;
  Object.keys(arbol[area]).forEach(sector => {
    arbol[area][sector].forEach(capa => {
      try { const b = capa.getBounds && capa.getBounds(); if (b && b.isValid()) bounds = bounds ? bounds.extend(b) : L.latLngBounds(b.getSouthWest(), b.getNorthEast()); } catch (e) {}
    });
  });
  if (bounds && bounds.isValid()) map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
}
function construirArbolGenerico_(cfg) {
  const { titulo, arbol, layerGroup, ocultosKey, colorDot, colapsoKey, conZoom } = cfg;
  const cont = document.createElement('div');
  const areas = Object.keys(arbol).sort();
  const encendida = map.hasLayer(layerGroup);
  const totalSec = areas.reduce((n, a) => n + Object.keys(arbol[a]).length, 0);

  const raiz = document.createElement('div'); raiz.className = 'tree-node';
  const rowRaiz = document.createElement('div'); rowRaiz.className = 'tree-row';
  if (state[colapsoKey] === undefined) state[colapsoKey] = true;
  rowRaiz.innerHTML =
    '<span class="tree-caret ' + (state[colapsoKey] ? 'collapsed' : '') + '">▼</span>' +
    '<span class="tree-check ' + (encendida ? 'on' : '') + '" data-raiz="1"></span>' +
    '<span class="tree-label">' + escapeHtml_(titulo) + '</span>' +
    '<span class="tree-count">' + areas.length + ' · ' + totalSec + '</span>';
  raiz.appendChild(rowRaiz);

  const hijosRaiz = document.createElement('div');
  hijosRaiz.className = 'tree-children' + (state[colapsoKey] ? ' collapsed' : '');

  areas.forEach((area, areaIdx) => {
    const sectores = arbol[area];
    const nombresSec = Object.keys(sectores).sort();
    const nodoArea = document.createElement('div'); nodoArea.className = 'tree-node';
    const estadoArea = encendida ? estadoAreaGen_(ocultosKey, area, sectores) : 'off';
    const colKey = colapsoKey + '_col_' + area;
    if (state[colKey] === undefined) state[colKey] = true;
    const rowArea = document.createElement('div'); rowArea.className = 'tree-row';
    rowArea.innerHTML =
      '<span class="tree-caret ' + (state[colKey] ? 'collapsed' : '') + '">▼</span>' +
      '<span class="tree-check ' + (estadoArea === 'on' ? 'on' : estadoArea === 'partial' ? 'partial' : '') + '" data-area-idx="' + areaIdx + '"></span>' +
      '<span class="tree-label">' + escapeHtml_(area) + '</span>' +
      '<span class="tree-count">' + nombresSec.length + '</span>';
    nodoArea.appendChild(rowArea);

    const hijosArea = document.createElement('div');
    hijosArea.className = 'tree-children' + (state[colKey] ? ' collapsed' : '');
    nombresSec.forEach((sector, secIdx) => {
      const visible = encendida && !sectorOcultoGen_(ocultosKey, area, sector);
      const nodoSec = document.createElement('div'); nodoSec.className = 'tree-node sector';
      const rowSec = document.createElement('div'); rowSec.className = 'tree-row';
      rowSec.innerHTML =
        '<span class="tree-caret leaf">▼</span>' +
        '<span class="tree-check ' + (visible ? 'on' : '') + '" data-area-idx="' + areaIdx + '" data-sec-idx="' + secIdx + '"></span>' +
        '<span class="tree-label">' + escapeHtml_(sector) + '</span>' +
        '<span class="tree-count">' + sectores[sector].length + '</span>';
      nodoSec.appendChild(rowSec);
      hijosArea.appendChild(nodoSec);
    });
    nodoArea.appendChild(hijosArea);
    hijosRaiz.appendChild(nodoArea);

    rowArea.querySelector('.tree-caret').addEventListener('click', () => {
      state[colKey] = !state[colKey];
      hijosArea.classList.toggle('collapsed', state[colKey]);
      rowArea.querySelector('.tree-caret').classList.toggle('collapsed', state[colKey]);
    });
    rowArea.querySelector('[data-area-idx]').addEventListener('click', () => {
      if (!map.hasLayer(layerGroup)) layerGroup.addTo(map);
      const areaSel = areas[areaIdx];
      Object.keys(arbol).forEach(a => { const oc = (a !== areaSel); Object.keys(arbol[a]).forEach(s => setSectorOcultoGen_(ocultosKey, a, s, oc)); });
      aplicarVisibilidadGen_(arbol, layerGroup, ocultosKey);
      if (conZoom) zoomAreaGen_(arbol, areaSel);
      renderTab('capas');
    });
  });

  raiz.appendChild(hijosRaiz);

  rowRaiz.querySelector('.tree-caret').addEventListener('click', () => {
    state[colapsoKey] = !state[colapsoKey];
    hijosRaiz.classList.toggle('collapsed', state[colapsoKey]);
    rowRaiz.querySelector('.tree-caret').classList.toggle('collapsed', state[colapsoKey]);
  });
  rowRaiz.querySelector('[data-raiz]').addEventListener('click', () => {
    if (map.hasLayer(layerGroup)) { map.removeLayer(layerGroup); }
    else {
      layerGroup.addTo(map);
      Object.keys(arbol).forEach(a => Object.keys(arbol[a]).forEach(s => setSectorOcultoGen_(ocultosKey, a, s, false)));
      aplicarVisibilidadGen_(arbol, layerGroup, ocultosKey);
    }
    renderTab('capas');
  });
  hijosRaiz.querySelectorAll('[data-sec-idx]').forEach(chk => {
    chk.addEventListener('click', () => {
      if (!map.hasLayer(layerGroup)) layerGroup.addTo(map);
      const areaSel = areas[parseInt(chk.dataset.areaIdx, 10)];
      const nombresSec = Object.keys(arbol[areaSel]).sort();
      const sectorSel = nombresSec[parseInt(chk.dataset.secIdx, 10)];
      setSectorOcultoGen_(ocultosKey, areaSel, sectorSel, !sectorOcultoGen_(ocultosKey, areaSel, sectorSel));
      aplicarVisibilidadGen_(arbol, layerGroup, ocultosKey);
      renderTab('capas');
    });
  });

  return raiz;
}

