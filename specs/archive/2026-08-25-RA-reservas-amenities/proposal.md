## Why

El módulo RA del NSGC es el motor de agendamiento de espacios comunes y activos compartidos: evita overbooking con prevención de conflictos horarios, cobra tarifas de uso y gestiona garantías por daños. Cada elemento reservable funciona como centro de costos propio (Fondo de Amenities), cuyo movimiento financiero real llega con FI en la Ventana 6 (patrón referencia pendiente). Es el primer cambio de la Sesión 4.

## What Changes

- Nueva capability **RA-reservas-amenities**: maestro de elementos reservables, motor de calendario con prevención de overbooking, cancelaciones con penalización tardía y retención de garantías.
- Colecciones nuevas en ST: `elementosRA` (tipo espacio_fisico|activo_mobiliario, ubicación EF vía microSectorId o IR vía activoIRId, franja bloques_horas|dia_completo con duración de bloque, tarifa de uso ($0 = gratis), garantía requerida, aforo o stock de unidades idénticas, reglas especiales: anticipación mínima y penalización por cancelación tardía) y `reservasRA` (folio RA-*, elemento, solicitante MP, fecha + horaInicio/horaFin, estado confirmada|cancelada, snapshot de tarifa y garantía, cancelación tardía flag con penalización, retención de garantía con motivo, cargoFIReferencia pendiente).
- Acciones repository: `saveElementoRA`, `removeElementoRA` (bloqueado con reservas vigentes), `saveReservaRA` (valida FKs, anticipación mínima y conflicto horario respetando stock concurrente), `cancelarReservaRA` (detecta cancelación tardía según regla del elemento) y `retenerGarantiaRA`; todas retornan `StoreResult`.
- Validación de morosidad FI: el gate queda definido en la especificación y se activará al conectar Finanzas (Ventana 6); hoy no existe fuente de deuda en el store.
- Eventos AM: `RA_BOOKING_CREATED`, `RA_BOOKING_CANCELLED`, `RA_WARRANTY_RETAINED`. Data cuantificable: reservas por amenity, ingresos por tarifas, garantías retenidas, cancelaciones tardías.
- Bump `STORE_VERSION` 18 → 19 con migrate aditivo.
- UI `/operaciones/reservas` (ruta ya enlazada en sidebar como "Reservas"): pestañas Calendario / Elementos.

## Capabilities

### New Capabilities
- `RA-reservas-amenities`: Maestro de elementos reservables con tarifas/garantías y motor de calendario sin overbooking, integrado a AM.

### Modified Capabilities
(ninguna)

## Impact

- Código: `k0mp4ss_fe/apps/web/lib/store.ts` (+2 colecciones, +5 acciones, migrate v19), `k0mp4ss_fe/apps/web/lib/schemas.ts` (+3 esquemas), `k0mp4ss_fe/apps/web/app/operaciones/reservas/page.tsx` (nueva).
- Specs: nueva carpeta `openspec/specs/RA-reservas-amenities/`.
- Depende de: EF (micro sectores como ubicación), MP (solicitantes), IR (activos mobiliarios opcionales), PI (`notify()`). Cobros al Fondo de Amenidades quedan como `cargoFIReferencia:"pendiente"` hasta Ventana 6.
- Consumidor futuro: CV integra las reservas confirmadas de los próximos 7 días en su carrusel.
