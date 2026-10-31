## Why

El módulo IN del NSGC registra las faltas al Reglamento de Copropiedad y aplica sus sanciones económicas, cerrando el ciclo de convivencia que CO abrió con el buzón ciudadano. Es el segundo cambio de la Sesión 3; su vínculo/cargo a Finanzas (FI) usa el patrón referencia pendiente hasta la Ventana 6.

## What Changes

- Nueva capability **IN-infracciones-multas**: catálogo parametrizable de tipos de infracción (leve/grave/gravísima con sanción monto fijo o % del gasto común), registro operativo de eventos con evidencias, cobros directos por daños y reparaciones, apelaciones con descargos, panel de supervisión de la directiva con comentarios internos y respaldo previo a multas graves.
- Colecciones nuevas en ST: `tiposInfraccionIN` (nombre, categoría, tipoSancion monto_fijo|porcentaje_gc, valor) e `infraccionesIN` (folio IN-*, tipo del catálogo o cobro directo por daños, unidad infractora, fecha/hora del suceso, antecedentes, evidencias D1, estado en_revision|apelada|aplicada|desestimada, comentarios internos directiva, respaldos, multa aplicada).
- Acciones repository: `saveTipoInfraccionIN`, `removeTipoInfraccionIN`, `saveInfraccionIN`, `apelarInfraccionIN`, `comentarInfraccionIN`, `respaldarInfraccionIN`, `aplicarInfraccionIN`, `desestimarInfraccionIN`, `removeInfraccionIN`; todas retornan `StoreResult`.
- Vinculación con CO: una infracción puede nacer de un mensaje del buzón (`mensajeBuzonId` FK validada) arrastrando asunto/evidencia — convierte reclamo verídico en Infracción en Revisión.
- Multas grave/gravísima: aplicar exige al menos un respaldo de miembro de directiva vigente (voto/validación antes de cargar al Gasto Común).
- Eventos AM: `IN_REG_EVENT`, `IN_APPLY_FINE`, `IN_APELACION`. Data cuantificable: montos totales multados, cantidad por categoría, % de apelaciones.
- El vínculo/cargo a FI usa patrón referencia pendiente: campo `cargoFIReferencia:"pendiente"` al aplicar (carga al Gasto Común del periodo) hasta la Ventana 6.
- Bump `STORE_VERSION` 16 → 17 con migrate aditivo (incluye seed del catálogo con faltas de ejemplo NSGC).
- UI `/finanzas/multas` (ruta ya enlazada en sidebar como "Multas"): pestañas Catálogo / Registro / Panel Directiva.

## Capabilities

### New Capabilities
- `IN-infracciones-multas`: Catálogo de faltas parametrizable, registro de infracciones con evidencias, apelaciones y panel de supervisión directiva.

### Modified Capabilities
(ninguna)

## Impact

- Código: `k0mp4ss_fe/apps/web/lib/store.ts` (+2 colecciones, +9 acciones, migrate v17), `k0mp4ss_fe/apps/web/lib/schemas.ts` (+5 esquemas), `k0mp4ss_fe/apps/web/app/finanzas/multas/page.tsx` (nueva), `k0mp4ss_fe/apps/web/app/admin/qa-lab/page.tsx` (fase nueva).
- Specs: nueva carpeta `openspec/specs/IN-infracciones-multas/`.
- Depende de: MP/VU (unidad infractora y reportantes), CO (`mensajesBuzonCO` opcional), GD (miembros directiva para respaldos), PI (`notify()`). Cargo FI es referencia pendiente documentada.
