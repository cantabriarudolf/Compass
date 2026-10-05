# Laboratorio de Mejoras QA Specification

## Purpose

Backlog de la Fase 5 - Laboratorio y Automatizacion: mejoras del lab QA como vinculos externos, screenshots automatizados y previews, sin bloquear el flujo del core.
## Requirements
### Requirement: Fase 5 Laboratorio y Automatización

El sistema SHALL exponer la fase `Fase 5 - Laboratorio y Automatización` en `k0mp4ss_fe/apps/web/lib/dev-dashboard.ts:66` (`PHASES`/`PHASE_ORDER`), `Data/NSGC/docs/manuales/01 - Plan de Avance.md` y `03 - Mapa` como contenedor de mejoras del lab. La capability `LAB-mejoras` SHALL vivir en esta fase.

#### Scenario: Dashboard muestra Fase 5
- **WHEN** se abre `/admin/dev-dashboard`
- **THEN** aparece la columna `Fase 5` con `LAB - Mejoras Lab` en estado `Pendiente` o `En Proceso` según el change activo.

### Requirement: Vínculos en nueva ventana desde Cómo va quedando

Cada fila de `Cómo va quedando` en `k0mp4ss_fe/apps/web/app/admin/qa-lab/page.tsx:1` SHALL tener botón `Abrir dónde verlo →` que navega a la ruta real del módulo (`/admin/maestros`, `/inventario/tipos`, `/comunidad/personas`, `/inventario/estructura`, `/comunidad/personas/[id]`) con `target="_blank"` sin perder el estado del lab.

#### Scenario: Click sin perder lab
- **WHEN** el usuario pulsa `Abrir dónde verlo →` en `1. Diccionario`
- **THEN** se abre `/admin/maestros` en pestaña nueva y el lab queda intacto.

### Requirement: Screenshots automatizados (futuro)

El sistema SHOULD automatizar la captura de pantallas de cada opción del lab mediante Playwright + GitHub Actions: al guardar `Data/NSGC/backups/compass-seed-report-*.json`, una Action levanta `pnpm dev`, captura `/admin/maestros`, `/inventario/tipos`, `/inventario/estructura`, `/comunidad/personas`, `/comunidad/personas/[id]` y deja las imágenes en `Data/NSGC/backups/screenshots/` para mostrar miniatura en el lab y ampliar al pinchar. Este requisito es futuro y SHALL quedar como `SHOULD` hasta implementarse.

#### Scenario: Report con screenshots
- **WHEN** existe `Data/NSGC/backups/screenshots/maestros-*.png`
- **THEN** el lab muestra miniatura junto al vínculo y al pinchar abre la imagen grande.

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

