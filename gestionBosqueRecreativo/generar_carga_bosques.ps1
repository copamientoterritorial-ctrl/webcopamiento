# ════════════════════════════════════════════════════════════════
# generar_carga_bosques.ps1 (16-10-2026)
# Genera sql/pendientes/110_bosque_recreativo_carga.sql desde BG_Bosque_Recreativo.xlsx:
#   · Maestro_bosque_recreativo   → bosques_recreativos (coordenadas UTM 18S → lat/lng en PostGIS)
#   · estado_actual               → br_revisiones (checklist de terreno; clave = «Código»)
#   · registros_visitas_AAAA-AAAA → br_visitas (fecha serial de Excel → fecha; duplicados se suman)
# Uso (desde la carpeta del proyecto):
#   powershell -ExecutionPolicy Bypass -File gestionBosqueRecreativo\generar_carga_bosques.ps1
# El SQL generado es idempotente (ON CONFLICT): se puede volver a ejecutar tras actualizar el Excel.
# No pisa lo editado en el sistema (administración, acceso, proyectos): solo completa lo vacío.
# ════════════════════════════════════════════════════════════════
param(
  [string]$Excel = (Join-Path $PSScriptRoot 'BG_Bosque_Recreativo.xlsx'),
  [string]$Salida = (Join-Path $PSScriptRoot '..\sql\pendientes\110_bosque_recreativo_carga.sql')
)
$ErrorActionPreference = 'Stop'
$tmp = Join-Path $env:TEMP ('br_xlsx_' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Force $tmp | Out-Null
Copy-Item $Excel (Join-Path $tmp 'libro.zip')
Expand-Archive (Join-Path $tmp 'libro.zip') -DestinationPath (Join-Path $tmp 'x') -Force
$dir = Join-Path $tmp 'x'

# ── Lectura de hojas
[xml]$ss = Get-Content (Join-Path $dir 'xl\sharedStrings.xml') -Raw -Encoding UTF8
$strings = New-Object System.Collections.Generic.List[string]
foreach ($si in $ss.sst.si) {
  if ($si.t -ne $null) { if ($si.t -is [string]) { $strings.Add($si.t) } else { $strings.Add($si.t.'#text') } }
  else { $strings.Add((($si.r | ForEach-Object { if ($_.t -is [string]) { $_.t } else { $_.t.'#text' } }) -join '')) }
}
[xml]$wb = Get-Content (Join-Path $dir 'xl\workbook.xml') -Raw -Encoding UTF8
[xml]$rels = Get-Content (Join-Path $dir 'xl\_rels\workbook.xml.rels') -Raw -Encoding UTF8
function ColIdx($ref) { $l = ($ref -replace '\d', ''); $n = 0; foreach ($ch in $l.ToCharArray()) { $n = $n * 26 + ([int]$ch - 64) }; return $n - 1 }
function LeerHoja($nombre) {
  $sh = $wb.workbook.sheets.sheet | Where-Object { $_.name -eq $nombre }
  if (-not $sh) { throw "No existe la hoja $nombre" }
  $rid = $sh.GetAttribute('id', 'http://schemas.openxmlformats.org/officeDocument/2006/relationships')
  $target = ($rels.Relationships.Relationship | Where-Object { $_.Id -eq $rid }).Target
  [xml]$ws = Get-Content (Join-Path $dir ('xl\' + $target)) -Raw -Encoding UTF8
  $filas = New-Object System.Collections.Generic.List[object]
  foreach ($row in $ws.worksheet.sheetData.row) {
    $vals = @{}; $max = -1
    foreach ($c in $row.c) {
      $i = ColIdx $c.r; if ($i -gt $max) { $max = $i }
      $v = $c.v
      if ($c.t -eq 's') { $v = $strings[[int]$v] } elseif ($c.t -eq 'inlineStr') { $v = $c.is.t }
      $vals[$i] = [string]$v
    }
    $arr = for ($k = 0; $k -le $max; $k++) { $vals[$k] }
    $filas.Add(@($arr))
  }
  return $filas
}
$hojas = @($wb.workbook.sheets.sheet | ForEach-Object { $_.name })

# ── Formato SQL
function Q($s) { if ($null -eq $s) { return 'NULL' }; $t = ([string]$s).Trim(); if ($t -eq '') { return 'NULL' }; return "'" + $t.Replace("'", "''") + "'" }
function N($s) { $t = ([string]$s).Trim() -replace ',', '.'; if ($t -match '^-?\d+(\.\d+)?$') { return $t }; return 'NULL' }
function I($s) { $t = ([string]$s).Trim(); if ($t -match '^\d+$') { return [string][int64]$t }; return 'NULL' }   # «00», «0000000» → 0; «-» → NULL
function FechaDMY($s) { $t = ([string]$s).Trim(); if ($t -match '^(\d{1,2})/(\d{1,2})/(\d{4})') { return "'" + $Matches[3] + '-' + $Matches[2].PadLeft(2, '0') + '-' + $Matches[1].PadLeft(2, '0') + "'" }; return 'NULL' }
$sb = New-Object System.Text.StringBuilder
function W($t) { [void]$sb.AppendLine($t) }

W '-- ════════════════════════════════════════════════════════════════'
W ('-- 110_bosque_recreativo_carga.sql — IDEMPOTENTE · GENERADO ' + (Get-Date -Format 'dd-MM-yyyy HH:mm') + ' por gestionBosqueRecreativo/generar_carga_bosques.ps1')
W '-- Fuente: gestionBosqueRecreativo/BG_Bosque_Recreativo.xlsx. NO editar a mano: regenerar.'
W '-- Requiere 109_bosque_recreativo_estructura.sql. No pisa lo editado en el sistema (solo completa vacíos).'
W '-- ════════════════════════════════════════════════════════════════'
W ''

# ── 1. Maestro
$m = LeerHoja 'Maestro_bosque_recreativo'
$h = $m[0]; $ix = @{}; for ($k = 0; $k -lt $h.Count; $k++) { if ($h[$k]) { $ix[$h[$k].Trim()] = $k } }
$maestro = @($m | Select-Object -Skip 1 | Where-Object { $_[$ix['ID_BR']] })
W ('-- 1. Maestro: ' + $maestro.Count + ' bosques')
W 'INSERT INTO public.bosques_recreativos (id_br, nombre, anio_implementacion, estado, id_subgerencia, subgerencia, id_area, area, fundo, id_sector, sector, id_comuna, comuna, id_region, region, provincia, utm_x, utm_y, geom, en_maestro) VALUES'
$vals = foreach ($r in $maestro) {
  $x = N $r[$ix['POINT_X']]; $y = N $r[$ix['POINT_Y']]
  $geom = if ($x -ne 'NULL' -and $y -ne 'NULL') { "ST_Transform(ST_SetSRID(ST_MakePoint($x, $y), 32718), 4326)" } else { 'NULL' }
  '(' + ((Q $r[$ix['ID_BR']]), (Q $r[$ix['NOMBRE_BR']]), (I $r[$ix['ANIO']]), (Q ([string]$r[$ix['estado_br']]).ToUpper()),
    (I $r[$ix['ID_SUBG']]), (Q $r[$ix['SUBG_RELACIONAMIENTO']]), (I $r[$ix['ID_AREA']]), (Q $r[$ix['AREA_RELACIONAMIENTO']]),
    (Q $r[$ix['FUNDO_ASOCIADO']]), (I $r[$ix['id_sector']]), (Q $r[$ix['SECTOR']]), (I $r[$ix['ID_COMUNA']]), (Q $r[$ix['COMUNA']]),
    (I $r[$ix['id_region']]), (Q $r[$ix['region']]), (Q $r[$ix['provincia']]), $x, $y, $geom, 'true' -join ', ') + ')'
}
W (($vals -join ",`n") + "`nON CONFLICT (id_br) DO UPDATE SET")
W '  nombre = EXCLUDED.nombre, anio_implementacion = EXCLUDED.anio_implementacion, estado = EXCLUDED.estado,'
W '  id_subgerencia = EXCLUDED.id_subgerencia, subgerencia = EXCLUDED.subgerencia, id_area = EXCLUDED.id_area, area = EXCLUDED.area,'
W '  fundo = EXCLUDED.fundo, id_sector = EXCLUDED.id_sector, sector = EXCLUDED.sector, id_comuna = EXCLUDED.id_comuna, comuna = EXCLUDED.comuna,'
W '  id_region = EXCLUDED.id_region, region = EXCLUDED.region, provincia = EXCLUDED.provincia,'
W '  utm_x = EXCLUDED.utm_x, utm_y = EXCLUDED.utm_y, geom = EXCLUDED.geom, en_maestro = true;'
W ''

# ── 2. Revisiones (estado_actual: fila 1 = grupos, fila 2 = encabezados)
$e = LeerHoja 'estado_actual'
$h = $e[1]; $ie = @{}; for ($k = 0; $k -lt $h.Count; $k++) { $n = ([string]$h[$k]).Trim(); if ($n -and -not $ie.ContainsKey($n)) { $ie[$n] = $k } }
$revs = @($e | Select-Object -Skip 2 | Where-Object { $_[$ie['id_br']] })
$maeIds = @($maestro | ForEach-Object { $_[$ix['ID_BR']].Trim() })
# Bosques que están en revisiones/visitas pero NO en el maestro: se crean marcados en_maestro = false
$faltan = @{}
foreach ($r in $revs) {
  $id = $r[$ie['id_br']].Trim()
  if ($maeIds -notcontains $id -and -not $faltan.ContainsKey($id)) { $faltan[$id] = $r }
}
if ($faltan.Count) {
  W ('-- 2a. Bosques con revisión pero fuera del maestro (completar en el maestro): ' + (($faltan.Keys | Sort-Object) -join ', '))
  foreach ($id in ($faltan.Keys | Sort-Object)) {
    $r = $faltan[$id]
    $ll = ([string]$r[$ie['UBICACIÓN']]).Trim() -split ','
    $geom = if ($ll.Count -eq 2 -and (N $ll[0]) -ne 'NULL') { 'ST_SetSRID(ST_MakePoint(' + (N $ll[1]) + ', ' + (N $ll[0]) + '), 4326)' } else { 'NULL' }
    $area = Q $r[$ie['AREA RELACIONAMIENTO']]
    W ('INSERT INTO public.bosques_recreativos (id_br, nombre, anio_implementacion, estado, area, subgerencia, id_subgerencia, fundo, geom, en_maestro)')
    W ('SELECT ' + (Q $id) + ', ' + (Q $r[$ie['NOMBRE BOSQUE RECREATIVO']]) + ', ' + (I $r[$ie['AÑO IMPLEMENTACIÓN']]) + ", 'EJECUTADO', " + $area + ',')
    W ('  (SELECT b.subgerencia FROM public.bosques_recreativos b WHERE public.br_clave_area_(b.area) = public.br_clave_area_(' + $area + ') AND b.subgerencia IS NOT NULL LIMIT 1),')
    W ('  (SELECT b.id_subgerencia FROM public.bosques_recreativos b WHERE public.br_clave_area_(b.area) = public.br_clave_area_(' + $area + ') AND b.subgerencia IS NOT NULL LIMIT 1),')
    W ('  ' + (Q $r[$ie['FUNDO']]) + ', ' + $geom + ', false')
    W 'ON CONFLICT (id_br) DO NOTHING;'
  }
  W ''
}
W ('-- 2b. Revisiones de terreno: ' + $revs.Count)
W 'INSERT INTO public.br_revisiones (codigo, id_br, fecha, sitio, autor, unidad, macroproceso, area_texto, fundo_texto, mesas_total, mesas_danadas, mesas_nuevas, fogones_total, fogones_danados, fogones_nuevos, letreros_total, letreros_danados, letreros_danados_grandes, letreros_nuevos, letreros_nuevos_grandes, administracion, vecino_cercano, lat, lng, observaciones, condicion_acceso) VALUES'
$vals = foreach ($r in $revs) {
  $ll = ([string]$r[$ie['UBICACIÓN']]).Trim() -split ','
  $lat = if ($ll.Count -eq 2) { N $ll[0] } else { 'NULL' }; $lng = if ($ll.Count -eq 2) { N $ll[1] } else { 'NULL' }
  '(' + ((Q $r[$ie['Código']]), (Q $r[$ie['id_br']]), (FechaDMY $r[$ie['FECHA']]), (Q $r[$ie['NOMBRE BOSQUE RECREATIVO']]), (Q $r[$ie['Autor']]),
    (Q $r[$ie['Unidad']]), (Q $r[$ie['MACROPROCESO']]), (Q $r[$ie['AREA RELACIONAMIENTO']]), (Q $r[$ie['FUNDO']]),
    (I $r[$ie['TOTAL MESAS']]), (I $r[$ie['TOTAL MESAS DAÑADAS']]), (I $r[$ie['AGREGAR MESAS NUEVAS']]),
    (I $r[$ie['TOTAL FOGONES']]), (I $r[$ie['TOTAL FOGONES DAÑADOS']]), (I $r[$ie['AGREGAR FOGONES NUEVOS']]),
    (I $r[$ie['TOTAL LETREROS']]), (I $r[$ie['TOTAL LETREROS DAÑADOS']]), (I $r[$ie['TOTAL LETREROS DAÑADOS GRANDE']]),
    (I $r[$ie['AGREGAR LETREROS NUEVOS']]), (I $r[$ie['AGREGAR LETREROS NUEVO GRANDE']]),
    (Q $r[$ie['ADMINISTRACIÓN LOCAL']]), (Q $r[$ie['VECINO CERCANO']]), $lat, $lng, (Q $r[$ie['OBSERVACIONES']]), (Q $r[$ie['CONDICIÓN DE ACCESO']]) -join ', ') + ')'
}
W (($vals -join ",`n") + "`nON CONFLICT (codigo) DO UPDATE SET")
W '  id_br = EXCLUDED.id_br, fecha = EXCLUDED.fecha, sitio = EXCLUDED.sitio, autor = EXCLUDED.autor, unidad = EXCLUDED.unidad,'
W '  macroproceso = EXCLUDED.macroproceso, area_texto = EXCLUDED.area_texto, fundo_texto = EXCLUDED.fundo_texto,'
W '  mesas_total = EXCLUDED.mesas_total, mesas_danadas = EXCLUDED.mesas_danadas, mesas_nuevas = EXCLUDED.mesas_nuevas,'
W '  fogones_total = EXCLUDED.fogones_total, fogones_danados = EXCLUDED.fogones_danados, fogones_nuevos = EXCLUDED.fogones_nuevos,'
W '  letreros_total = EXCLUDED.letreros_total, letreros_danados = EXCLUDED.letreros_danados, letreros_danados_grandes = EXCLUDED.letreros_danados_grandes,'
W '  letreros_nuevos = EXCLUDED.letreros_nuevos, letreros_nuevos_grandes = EXCLUDED.letreros_nuevos_grandes,'
W '  administracion = EXCLUDED.administracion, vecino_cercano = EXCLUDED.vecino_cercano, lat = EXCLUDED.lat, lng = EXCLUDED.lng,'
W '  observaciones = EXCLUDED.observaciones, condicion_acceso = EXCLUDED.condicion_acceso;'
W ''
W '-- 2c. Administración, vecino y acceso del bosque = los de su última revisión (solo si están vacíos: no pisa lo editado)'
W 'UPDATE public.bosques_recreativos b SET'
W '  administracion   = coalesce(b.administracion, u.administracion),'
W '  vecino_cercano   = coalesce(b.vecino_cercano, u.vecino_cercano),'
W '  condicion_acceso = coalesce(b.condicion_acceso, u.condicion_acceso)'
W '  FROM (SELECT DISTINCT ON (id_br) id_br, administracion, vecino_cercano, condicion_acceso'
W '          FROM public.br_revisiones ORDER BY id_br, fecha DESC NULLS LAST, creado_en DESC) u'
W ' WHERE u.id_br = b.id_br AND (b.administracion IS NULL OR b.vecino_cercano IS NULL OR b.condicion_acceso IS NULL);'
W ''

# ── 3. Visitas (todas las hojas registros_visitas_*)
$totVis = 0
foreach ($hoja in ($hojas | Where-Object { $_ -like 'registros_visitas*' })) {
  $v = LeerHoja $hoja
  $suma = [ordered]@{}
  foreach ($r in ($v | Select-Object -Skip 1)) {
    $id = ([string]$r[0]).Trim(); $f = ([string]$r[1]).Trim(); $p = ([string]$r[2]).Trim()
    if (-not $id -or $f -notmatch '^\d+(\.\d+)?$') { continue }
    $fecha = [datetime]::FromOADate([double]$f).ToString('yyyy-MM-dd')
    $k = $id + '|' + $fecha
    $n = 0; if ($p -match '^\d+(\.\d+)?$') { $n = [int][double]$p }
    if ($suma.Contains($k)) { $suma[$k] += $n } else { $suma[$k] = $n }
  }
  $claves = @($suma.Keys); $totVis += $claves.Count
  W ('-- 3. Visitas «' + $hoja + '»: ' + $claves.Count + ' días con registro')
  # Bosques de las visitas que no existen (no deberían): se crean marcados para completar
  $idsV = @($claves | ForEach-Object { ($_ -split '\|')[0] } | Sort-Object -Unique)
  W ('INSERT INTO public.bosques_recreativos (id_br, nombre, en_maestro) SELECT x, x, false FROM unnest(ARRAY[' + (($idsV | ForEach-Object { Q $_ }) -join ', ') + ']) x ON CONFLICT (id_br) DO NOTHING;')
  for ($i = 0; $i -lt $claves.Count; $i += 500) {
    $lote = $claves[$i..([Math]::Min($i + 499, $claves.Count - 1))]
    W 'INSERT INTO public.br_visitas (id_br, fecha, personas) VALUES'
    W ((($lote | ForEach-Object { $p = $_ -split '\|'; '(' + (Q $p[0]) + ", '" + $p[1] + "', " + $suma[$_] + ')' }) -join ",`n") + "`nON CONFLICT (id_br, fecha) DO UPDATE SET personas = EXCLUDED.personas;")
  }
  W ''
}

W 'NOTIFY pgrst, ''reload schema'';'
W ''
W '-- ── Verificación'
W 'SELECT'
W ('  (SELECT count(*) FROM public.bosques_recreativos WHERE en_maestro) AS bosques_maestro,               -- ' + $maestro.Count)
W ('  (SELECT count(*) FROM public.bosques_recreativos WHERE NOT en_maestro) AS bosques_fuera_maestro,     -- ' + $faltan.Count + ' (' + (($faltan.Keys | Sort-Object) -join ', ') + ')')
W  '  (SELECT count(*) FROM public.bosques_recreativos WHERE geom IS NULL) AS sin_ubicacion,                 -- 0'
W ('  (SELECT count(*) FROM public.br_revisiones) AS revisiones,                                         -- ' + $revs.Count)
W ('  (SELECT count(*) FROM public.br_visitas) AS dias_visita,                                           -- ' + $totVis)
W  '  (SELECT json_object_agg(temporada, n) FROM (SELECT temporada, sum(personas) AS n FROM public.br_visitas GROUP BY temporada ORDER BY 1) t) AS personas_por_temporada,'
W  '  (SELECT json_object_agg(coalesce(administracion, ''(sin dato)''), n) FROM (SELECT administracion, count(*) AS n FROM public.bosques_recreativos GROUP BY 1) a) AS administracion,'
W  '  (SELECT round(min(ST_Y(geom))::numeric, 2) || '' .. '' || round(max(ST_Y(geom))::numeric, 2) FROM public.bosques_recreativos) AS rango_latitud;   -- ~ -38.7 .. -35.3'

[IO.File]::WriteAllText([IO.Path]::GetFullPath($Salida), $sb.ToString(), (New-Object Text.UTF8Encoding $false))
Remove-Item $tmp -Recurse -Force
Write-Output ('OK → ' + [IO.Path]::GetFullPath($Salida) + ' · ' + $maestro.Count + ' bosques, ' + $revs.Count + ' revisiones, ' + $totVis + ' días de visita, fuera del maestro: ' + (($faltan.Keys | Sort-Object) -join ', '))
