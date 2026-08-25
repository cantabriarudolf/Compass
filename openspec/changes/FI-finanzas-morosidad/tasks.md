# FI-finanzas-morosidad Tasks

## 1. Store (ST)

- [x] 1.1 Declarar esquemas/tipos `FondoFI`, `EgresoFI`, `EmisionGC`, `CobroFI` en schemas.ts; evolucionar `cargoFIReferencia` (IN/RA/MT) de literal a string opcional; agregar `fondoFinanciamientoId?` a ProyectoMT; colecciones `fondosFI` (seed NSGC 3 fondos), `egresosFI`, `emisionesGC`, `cobrosFI`; bump `STORE_VERSION` 20→21 con migrate aditivo
- [x] 1.2 Implementar `saveFondoFI`/`removeFondoFI` (bloqueado con egresos/cobros/emisiones asociadas) y helpers puros en `lib/finanzas-utils.ts` (`exigibleDeCobro`, `estadoDeCobro`, `saldoFondo`, `morosidadPorUnidad`, `unidadesParaCorteServicios`, `montoMoraPropuesta`)
- [x] 1.3 Implementar `saveEgresoFI`/`removeEgresoFI`: FK fondo activo, comprobante D1 sin base64/Blob, microSectores válidos para gastos diferenciados, folio FE-*, evento `FI_EGRESS_CREATED`
- [x] 1.4 Implementar `emitirGastoComun`: gate "CF no cargado" si `modoCalculoGC` undefined, periodo único, responsable de cobro por unidad, modo fijo (`montoBaseGc`) vs prorrateo (`gastoTotal × coeficiente/100`), vencimiento desde `diaCortePago`, aporte % al fondo de reserva, notificación opt-in CF, evento `FI_EMISION_GC`
- [x] 1.5 Implementar morosidad: `aplicarMoraFI` (idempotente por día, tasa parametrizable default 1% mensual pro-rata), panel derivable corte de servicios con `limiteMesesAvisoCorte`, `enviarCobranzaFI` con `notify()` y evento `FI_COBRANZA_SENT`
- [x] 1.6 Implementar pagos: `registrarPagoFI` con exigible = base + moras − pagos previos; ajuste manual exige justificación y appendea diferencia inmutable; eventos `FI_RECEIVE_PAYMENT`/`FI_MANUAL_DISCOUNT`
- [x] 1.7 Implementar `retirarFondoFI`: fondo reserva exige acta GD publicada como aprobación y saldo suficiente; genera egreso `uso_de_fondo` auditado `FI_FUND_WITHDRAWN`
- [x] 1.8 Conexión IN: `aplicarInfraccionIN` crea cobro `multa_in` (resolviendo % GC contra el último GC emitido de la unidad) y materializa `cargoFIReferencia` con el id del cobro
- [x] 1.9 Conexión MT: `saveProyectoMT` valida `fondoFinanciamientoId` (FK, activo, saldo ≥ presupuesto)
- [x] 1.10 Conexión RA: cobros reales en fondo amenities para tarifa/penalización/garantía retenida con `cargoFIReferencia` materializado; gate de morosidad activo vía `getDeudaVigenteFI(get, personaId)`
- [x] 1.11 Tests `store-finanzas.test.ts` (fondos, egresos D1, emisión GC ambos modos + duplicado + sin responsable + gate CF, mora idempotente, corte servicios, pago exacto/con ajuste/rechazo sin justificación, retiro con acta) y actualizar aserciones IN/RA de `"pendiente"` a id materializado

## 2. UI

- [x] 2.1 Crear `/finanzas/gastos-comunes/page.tsx`: pestañas Fondos / Egresos / Emisión GC / Morosidad con skeleton + rehydrated
- [x] 2.2 Fondos: CRUD con tipo y % aporte; Egresos: form con categoría, recurrente, comprobante URL, gastos diferenciados; Emisión: wizard periodo + gastoTotal (si prorrateo) con vista previa de líneas
- [x] 2.3 Morosidad: tabla unidades atrasadas con mora propuesta aplicable, panel corte de servicios destacado y botón gestión de cobranza
- [x] 2.4 Crear `/finanzas/pagos/page.tsx` (Recaudación): libro de cobros filtrable por concepto/estado con detalle (moras, pagos, diferencias), registrar pago con ajuste manual justificado e informe de diferencia inmutable visible

## 3. QA Lab

- [x] 3.1 Fase 14 FI con seeds TEST: fondos TEST, egreso recurrente con comprobante, emisión GC variable sobre unidades TEST con aporte reserva, pagos (exacto y ajustado), mora sobre vencido, multa→cobro materializado (conexión IN), tarifa quincho→cobro amenities (conexión RA), proyecto MT sin saldo→rechazado (conexión MT); limpieza inversa extendida

## 4. Validación

- [x] 4.1 Lint + typecheck + suite verde completa
- [x] 4.2 openspec validate --all sin errores
