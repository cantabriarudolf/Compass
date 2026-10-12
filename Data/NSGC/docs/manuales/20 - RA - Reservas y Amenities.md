# 📅 20 - RA - Reservas y Amenities

El agendamiento de la copropiedad: quinchos, piscinas, canchas y equipos compartidos con control anti-overbooking, tarifas por uso, garantías por daños y centro de costos propio (Fondo de Amenities).

## 🚀 Funcionalidad Principal

Dos pilares: el **Maestro de Elementos** define qué se puede reservar (espacio físico o activo mobiliario) con su franja horaria, tarifa ($0 = gratis), garantía requerida, aforo/stock y reglas especiales; el **Motor de Calendario** confirma reservas `RA-####` bloqueando automáticamente los tramos ocupados según el stock concurrente del elemento.

## 🛠️ Secciones

- **Calendario**: grilla cronológica de reservas confirmadas/canceladas; alta guiada (elemento → solicitante MP → fecha → tramo según bloques); acciones Cancelar y Retener garantía (con motivo). Cada reserva guarda snapshot de tarifa y garantía vigentes al confirmar.
- **Elementos**: CRUD del maestro — tipo (Espacio Físico / Activo Mobiliario), ubicación EF (sub-sector) o IR (activo del catálogo), franja bloques_horas|dia_completo con duración, tarifa, garantía, aforo (piscina) o stock (2 quinchos idénticos → 2), anticipación mínima, ventana de cancelación tardía y penalización.

## 🔌 Ciclo de vida en la capa de datos (API)

La reserva y sus cobros se materializan en el servidor, dentro de la misma transacción:

- **Alta (`POST /api/ra/reservas`)**: deriva el folio `RA-####` cuando no viene, congela el snapshot de tarifa y garantía del elemento, valida el solape respetando el **stock** (capacidad) y crea el cargo `reserva_ra` al Fondo de Amenities cuando la tarifa es > 0 (idempotente por procedencia, `origenRef` = id de la reserva). Un `RA_BOOKING_CREATED` solo en el alta.
- **Cancelar (`POST …/[id]/cancelar`)**: solo Confirmada; si faltan ≤ `cancelacionTardiaDias`, la cancelación es tardía y cobra `penalizacion_ra`, liberando el cupo. Exactly-once (`RA_BOOKING_CANCELLED`).
- **Retener (`POST …/[id]/retener`)**: solo Confirmada y sin retención previa; el monto es siempre `montoGarantia` de la reserva y se materializa como `garantia_ra` una sola vez (`RA_WARRANTY_RETAINED`).

**Declarado y no portado**: el gate de morosidad FI y `anticipacionMinimaDias` (inactivos en el laboratorio) y la notificación de la retención.

## 💡 Tips de Oro

- **Overbooking imposible**: dos tramos se solapan si `inicioA < finB && inicioB < finA`; día completo ocupa 00:00–23:59. Con stock N caben N reservas paralelas; la N+1 es rechazada con "Conflicto horario".
- **Cancelación tardía con diente**: si faltan ≤ cancelacionTardiaDias días, la cancelación marca `tardia` y deriva la penalización como cobro real al Fondo de Amenities en FI.
- **Garantía retenida = evento**: al devolver un activo dañado, retén la garantía con motivo — notifica a administración (`RA_WARRANTY_RETAINED`) y genera un cobro del fondo de amenities.
- **Cobros vivos en FI**: tarifas, penalizaciones y garantías retenidas se materializan como cobros del Fondo de Amenities y `cargoFIReferencia` guarda el id del cobro (conexión FI, Sesión 5); el gate de morosidad está activo: quien arrastra deuda vencida no puede reservar.
- **Auditoría**: `RA_BOOKING_CREATED`, `RA_BOOKING_CANCELLED`, `RA_WARRANTY_RETAINED`.

## 🔗 Dependencias

- Sub-sectores de **EF** y activos del catálogo de **IR** como ubicación del elemento.
- Solicitantes activos del **MP**.
- Notificaciones con `notify()` (**ST**, D3).
- El carrusel de **CV - Visor de Mensajes** muestra las reservas confirmadas de los próximos 7 días.
