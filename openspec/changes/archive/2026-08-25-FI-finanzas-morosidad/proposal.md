# FI-finanzas-morosidad

## Why

El módulo FI del NSGC centraliza la salud financiera de la comunidad: maestro de fondos con imputación, emisión del Gasto Común en modalidad fija o prorrateo usando `configuracion.modoCalculoGC` de CF, control de morosidad basado en `diaCortePago`/`limiteMesesAvisoCorte` y ajustes manuales con informe de diferencia inmutable. Además cierra las tres referencias pendientes inversas: IN (multa cerrada genera cobro real), MT (proyecto financiado por fondo FI valida saldo) y RA (reserva con cobro asociado materializado). Respeta el escenario de CF "CF sin carga bloquea FI". Es la ventana 6 (Sesión 5) de la serie NSGC.

## What Changes

- Nueva capability **FI-finanzas-morosidad**: maestro de fondos con imputación, egresos categorizados con comprobante D1 y gastos diferenciados por sectores, emisión GC fija vs prorrateo, fondo de reserva con aporte automático porcentual, retiros documentados, morosidad (mora propuesta + panel corte de servicios + gestiones de cobranza) y pagos con ajuste manual/informe de diferencia.
- Colecciones nuevas en ST: `fondosFI` (nombre, tipo gasto_comun|reserva|especial|amenities, porcentajeAporte para reserva), `egresosFI` (folio FE-*, categoría, monto, fondoId obligatorio, recurrente/fijo, comprobante D1, microSectores opcionales para gastos diferenciados, aprobación de acta GD para uso de fondo de reserva), `emisionesGC` (periodo AAAA-MM único, modo snapshot, gastoTotal, líneas por unidad con responsable y monto, aporte al fondo de reserva) y `cobrosFI` (libro unificado de cargos: concepto gc|cuota_extraordinaria|multa_in|consumo|reserva_ra|penalizacion_ra|garantia_ra, origenModulo/origenRef, fondoId, moras[], pagos[], diferencias[] inmutables).
- Acciones repository: `saveFondoFI`/`removeFondoFI`, `saveEgresoFI`/`removeEgresoFI`, `emitirGastoComun({periodo, gastoTotal?})`, `aplicarMoraFI(cobroId, tasa?)`, `registrarPagoFI(cobroId, pago)`, `enviarCobranzaFI(unidadId)`, `retirarFondoFI({fondoId, monto, aprobacionActaGDId})`; helpers derivables exportados (`exigibleDeCobro`, `saldoFondo`, `morosidadPorUnidad`, `unidadesParaCorteServicios`). Todas retornan `StoreResult`.
- Gate CF: `emitirGastoComun` rechaza si `configuracion.modoCalculoGC` es undefined ("CF no cargado"), honrando `CF-configuracion-global:108`.
- **Conexiones entrantes (patrón inverso)**:
  - **IN**: `aplicarInfraccionIN` ahora crea el cobro real en FI (concepto multa, fondo gasto común; sanción % GC resuelta contra el último GC emitido de la unidad) y materializa `cargoFIReferencia` con el id del cobro (antes literal `"pendiente"`).
  - **MT**: `ProyectoMT` incorpora `fondoFinanciamientoId?`; `saveProyectoMT` valida que el fondo exista, esté activo y tenga saldo disponible ≥ presupuesto estimado. `TrabajoMT.cargoFIReferencia` evoluciona a string opcional.
  - **RA**: `saveReservaRA` con tarifa > 0 crea el cobro en el fondo de amenities y materializa `cargoFIReferencia`; cancelación tardía y retención de garantía generan sus cobros. El gate de morosidad deja de ser inerte: bloquea solicitantes con deuda vencida en sus unidades vinculadas.
- Modificado **IN-infracciones-multas**, **MT-mantenimiento-proyectos** y **RA-reservas-amenities**: materialización de referencias FI y gate de morosidad activo (justificado en design.md).
- Eventos AM: `FI_EMISION_GC`, `FI_RECEIVE_PAYMENT`, `FI_MANUAL_DISCOUNT`, `FI_COBRANZA_SENT`, más `FI_EGRESS_CREATED`, `FI_MORA_APPLIED`, `FI_FUND_WITHDRAWN`.
- Bump `STORE_VERSION` 20 → 21 con migrate aditivo (seed de 3 fondos NSGC).
- UI: `/finanzas/gastos-comunes` (pestañas Fondos / Egresos / Emisión GC / Morosidad) y `/finanzas/pagos` (Recaudación: libro de cobros con pagos, mora e informes de diferencia); rutas ya enlazadas en sidebar.

## Capabilities

### New Capabilities
- `FI-finanzas-morosidad`: Fondos con imputación, emisión GC fija/prorrateo, morosidad con corte de servicios y pagos auditados con informe de diferencia inmutable.

### Modified Capabilities
- `IN-infracciones-multas`: aplicar una multa genera el cobro real en FI y materializa `cargoFIReferencia` (antes quedaba "pendiente" sin consumidor).
- `MT-mantenimiento-proyectos`: los proyectos pueden declarar fondo de financiamiento FI y se valida saldo disponible al guardarlos.
- `RA-reservas-amenities`: los cobros por tarifa/penalización/garantía se materializan como cobros reales en FI y el gate de morosidad pasa de inerte a bloqueante.

## Impact

- Código: `k0mp4ss_fe/apps/web/lib/store.ts` (+4 colecciones, +9 acciones, migrate v21), `k0mp4ss_fe/apps/web/lib/schemas.ts` (+4 esquemas, evolución `cargoFIReferencia` en IN/RA/MT, `fondoFinanciamientoId` en ProyectoMT), nuevo `k0mp4ss_fe/apps/web/lib/finanzas-utils.ts` (helpers puros), páginas nuevas `/finanzas/gastos-comunes` y `/finanzas/pagos`, qa-lab fase 14.
- Specs: nueva carpeta `openspec/specs/FI-finanzas-morosidad/`; deltas MODIFIED sobre IN/MT/RA; ADDED sobre ST (colecciones financieras rank 4).
- Depende de: CF (`modoCalculoGC`, `diaCortePago`, `limiteMesesAvisoCorte`, `notificarEmisionGC`), EF/TU (unidades, prorrateo, `montoBaseGc`), VU (responsable de cobro = propietario vigente), GD (actas publicadas como aprobación de retiros), PI (`notify()`).
- Tests afectados: `store-infracciones.test.ts` y `store-reservas.test.ts` actualizan aserciones de `"pendiente"` a id de cobro materializado; nueva suite `store-finanzas.test.ts`.
