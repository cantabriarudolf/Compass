# PL-liquidaciones-remuneraciones Tasks

## 1. Store (ST) y esquemas

- [x] 1.1 Schemas: `LiquidacionPLSchema` (snapshot de líneas: sueldo base, horas extra con valor hora calculado, gratificación legal, bonos, asignaciones no imponibles, asignación familiar, descuentos AFP/salud/SIS/cesantía/APV, anticipos, totales), `AdelantoPLSchema` (monto, glosa obligatoria, estado Pendiente/Descontado, folio ADE); `sueldoBase` opcional en `ExtensionLaboralSchema`; parámetros legales opcionales en `ConfiguracionGlobalSchema` (`ufMensual`, `ingresoMinimoMensual`, `topeGratificacionLegal`, `tasaSIS`)
- [x] 1.2 Helpers puros `lib/pl-utils.ts`: `valorHoraExtra` (§1.1: diario=base/días mes comercial CF → semanal → hora ordinaria=jornada semanal → recargo 50%), `gratificacionLegal` (25% imponible con tope factor×IMM/12), `descuentoAFP`, `descuentoSalud` (Fonasa 7% / Isapre UF o %), `asignacionFamiliarMonto` (tramo MA × cargas), `calcularLiquidacion` (totales de control)
- [x] 1.3 Colecciones PL en store (rank 6) + acciones repository con `StoreResult`: `generarLiquidacionPL` (FK trabajador+ficha+afpId/saludId; exige parámetros CF cargados; snapshot inmutable; materializa `liquidacionPLReferencia` en proyeccionesPE del periodo), `confirmarLiquidacionPL` (egreso FI categoría sueldos + adelantos→Descontado), `removeLiquidacionPL` (solo borrador sin egreso), `saveAdelantoPL`/`removeAdelantoPL`
- [x] 1.4 Auditoría `CF_UPDATE_PARAM` al cambiar parámetros legales en `saveConfiguracion`; bloqueo inverso `removeMaestro` ya cubierto por fichas PE
- [x] 1.5 Eventos AM: `PL_GENERATE_PAYSLIP`, `PL_ADD_ADVANCE`, `PL_DELETE_PAYSLIP`, `PL_EXPENSE_SYNC` con data cuantificable
- [x] 1.6 Bump `STORE_VERSION` 22→23 con migrate aditivo (colecciones vacías)
- [x] 1.7 Instalar `pdfmake` en `k0mp4ss_fe/apps/web`; `lib/pdf-utils.ts` con carga dinámica client-side (vfs fonts) y embebido runtime de la firma desde `firmaDigitalizadaUrl` (dataURL solo en memoria del documento, nunca en el store)

## 2. UI

- [x] 2.1 `/finanzas/remuneraciones/page.tsx`: pestañas Liquidaciones (selector trabajador con ficha PE, días trabajados, bonos/asignaciones manuales, vista previa de cálculo, confirmar → egreso FI, PDF firmado), Adelantos (registro con glosa, comprobante ADE, ciclo Pendiente→Descontado), Parámetros Legales (edición restringida admin de ufMensual/IMM/tope gratificación/tasa SIS)
- [x] 2.2 PDF liquidación estándar chileno vía pdfmake con firma embebida y folio

## 3. QA Lab

- [x] 3.1 Seeds TEST: parámetros legales CF vigentes, liquidación TEST con cálculo completo verificado (hora extra §1.1, gratificación tope, AFP/salud/familiar, anticipo descontado), confirmación → egreso FI sueldos materializado; limpieza inversa

## 4. Validación

- [x] 4.1 tsc + eslint 0 errores + suite vitest verde completa
- [x] 4.2 openspec validate --all sin errores
