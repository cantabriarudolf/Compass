## ADDED Requirements

### Requirement: QA-Lab pobla Portal Inmobiliario vía API REST
El sistema SHALL poblar la fase PI del QA-Lab ("Poblar todo", Paso 8) vía API
REST en lugar del store: `POST /api/publicaciones-portal` (upsert idempotente
con una unidad del seed) y `POST /api/leads-portal` (upsert + notificación al
alta), con ids fijos `test-pub-pi-qa` / `test-lead-pi-qa`. El reporte de fase
mantiene 2 pasos y la publicación queda visible en `/comunidad/portal` (BD
fuente de verdad). "Borrar todo" elimina vía API (lead antes que publicación
por el guard 409) más las notificaciones PI TEST generadas.

#### Scenario: Poblar PI deja la vitrina visible
- **WHEN** se ejecuta "Poblar todo" y se abre `/comunidad/portal`
- **THEN** la publicación `test-pub-pi-qa` aparece en el catálogo con su lead.

#### Scenario: Repoblar PI es idempotente
- **WHEN** se ejecuta "Poblar todo" dos veces con limpieza intermedia
- **THEN** no hay duplicados (upsert por id) y la fase reporta ok.

### Requirement: QA-Lab pobla Remuneraciones vía API con adelanto legacy
El sistema SHALL poblar la fase PL del QA-Lab (Paso 20) vía API REST:
`PUT /api/configuracion` (parámetros legales CF idempotentes), `POST
/api/personas` (upsert del trabajador fijo `test-qa-pl-trab` con ficha y
sueldo base), `POST /api/liquidaciones` (generar en el primer periodo libre
rotativo 2027–2029) y `POST /api/liquidaciones/[id]/confirmar` (egreso FI
sueldos espejo en BD). La liquidación BD se refleja al store como espejo
transitorio (mismo id, trabajador `test-p-99`, egreso con `fondo-gc`) para los
consumidores legacy (dropdown en Certificados, paso CT-4, validación de
huérfanos). El adelanto `test-ade-1` sigue en store legacy documentado (sin
`/api/adelantos` por alcance; la pestaña Adelantos lo muestra). La liquidación
BD no descuenta anticipos (sin adelantos pendientes en BD por diseño).

#### Scenario: Poblar PL deja la liquidación visible y confirmada
- **WHEN** se ejecuta "Poblar todo" y se abre `/finanzas/remuneraciones`
- **THEN** la liquidación QA figura confirmada con folio LIQ- y su egreso
  espejo existe en BD.

#### Scenario: Residuo honesto de confirmada inmutable
- **WHEN** se ejecuta "Borrar todo lo de prueba"
- **THEN** los borradores QA, el egreso espejo y la persona QA se eliminan vía
  API, la confirmada QA persiste (inmutable por diseño) y la siguiente
  corrida usa otro periodo libre sin colisionar.

### Requirement: Guard clean-first e higiene en ambos mundos
El guard clean-first del QA-Lab (`tieneDatosTest`, `runFase`, "Borrar todo")
SHALL cubrir store + BD: `tieneDatosTest(state, bd?)` acepta el resumen BD
opcional (publicaciones, leads, personas y borradores TEST; las confirmadas
inmutables no bloquean por diseño) y `e2e:higiene` sigue purgando filas TEST
de BD (pub/lead/liq/adelanto/persona). Sin residuos `test-*` bloqueantes tras
"Borrar todo".

#### Scenario: Guard detecta dato TEST en BD
- **WHEN** hay una publicación `test-pub-pi-qa` en BD con el store limpio y se
  pulsa "Poblar"
- **THEN** se abre el diálogo "¿Limpiar y poblar de una vez?".
