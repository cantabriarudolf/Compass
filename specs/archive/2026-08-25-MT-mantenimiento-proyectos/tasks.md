## 1. Store (ST)

- [x] 1.1 Declarar esquemas/tipos `EvidenciaMT`, `PreventivoConfig`, `TrabajoMT`, `ProyectoMT` en schemas.ts y colecciones `trabajosMT`, `proyectosMT` en `CompassData`; bump `STORE_VERSION` 17→18 con migrate aditivo
- [x] 1.2 Implementar `saveTrabajoMT` (folio MT-*, ubicación obligatoria unidad/microSector, FKs activoIR/responsable, evidencias D1 tipadas, garantía fechas coherentes, `MT_WORK_CREATED`) y `removeTrabajoMT`
- [x] 1.3 Implementar `iniciarTrabajoMT`, `finalizarTrabajoMT` (`MT_WORK_FINISHED` + generación automática del próximo preventivo `MT_PREVENTIVE_GENERATED`) y `cancelarTrabajoMT`
- [x] 1.4 Implementar `actualizarPagoTrabajoMT` (pendiente→parcial→pagado sin saltos inválidos) y `verificarGarantiasMT` (≤30 días o vencidas; notify + `MT_GUARANTEE_EXPIRED` idempotente)
- [x] 1.5 Implementar `saveProyectoMT` y `removeProyectoMT`
- [x] 1.6 Tests de store MT (registro con ubicaciones/FKs/evidencias, ciclo preventivo completo con generación encadenada, correctivo sin ciclo, pagos transiciones, garantías idempotentes, proyectos cuota derivable, integridad al eliminar)

## 2. UI

- [x] 2.1 Crear `/inventario/proyectos/page.tsx`: pestañas Trabajos / Prevención / Proyectos + skeleton + rehydrated
- [x] 2.2 Trabajos: grilla con filtros estado/prioridad/ubicación, form alta/edición (EF/IR, proveedor vs interno, origen fondos, estado pago, evidencias D1), flujo iniciar/finalizar/cancelar
- [x] 2.3 Prevención: tablero próximos vencimientos ordenado con vencidos destacados + botón verificar garantías
- [x] 2.4 Proyectos: grilla con presupuesto/plazo y cuota sugerida calculada en vista

## 3. Validación

- [x] 3.1 Lint + typecheck + suite verde completa
- [x] 3.2 openspec validate --changes sin errores
