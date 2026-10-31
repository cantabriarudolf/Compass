# RA-reservas-amenities Tasks

## 1. Store (ST)

- [x] 1.1 Declarar esquemas/tipos `ElementoRA`, `ReservaRA` (y enums de tipo/franja/estado) en schemas.ts; colecciones `elementosRA`, `reservasRA` en `CompassData`; bump `STORE_VERSION` 18→19 con migrate aditivo
- [x] 1.2 Implementar `saveElementoRA` (FK micro sector EF / activo IR, franja coherente, tarifa/garantía ≥ 0, stock/aforo) y `removeElementoRA` (bloqueado con reservas no canceladas)
- [x] 1.3 Implementar `saveReservaRA`: folio RA-* auto, FKs elemento vigente + solicitante MP activa, anticipación mínima, snapshot tarifa/garantía, prevención de overbooking por solapamiento con stock concurrente (`RA_BOOKING_CREATED`)
- [x] 1.4 Implementar `cancelarReservaRA` (solo confirmadas; detección tardía + penalización con cargo FI pendiente; `RA_BOOKING_CANCELLED`) y `retenerGarantiaRA` (motivo obligatorio, notify + `RA_WARRANTY_RETAINED`)
- [x] 1.5 Tests de store RA (maestro con FKs y bloqueos de borrado, conflictos horarios espacio/mobiliario con stock, anticipación mínima, cancelaciones normal/tardía, retención de garantía idempotente por reserva)

## 2. UI

- [x] 2.1 Crear `/operaciones/reservas/page.tsx`: pestañas Calendario / Elementos + skeleton + rehydrated
- [x] 2.2 Calendario: grilla cronológica confirmadas/canceladas, form alta (elemento → franja/tarifa/garantía, fecha, tramo horario según bloques o día completo, solicitante MP), acciones cancelar / retener garantía (dialog motivo)
- [x] 2.3 Elementos: grilla maestro con tipo/ubicación EF-IR/tarifa/garantía/stock/reglas, form alta-edición con toggle activo

## 3. Validación

- [x] 3.1 Lint + typecheck + suite verde completa
- [x] 3.2 openspec validate --all sin errores
