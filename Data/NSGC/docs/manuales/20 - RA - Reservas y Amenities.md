# 📅 20 - RA - Reservas y Amenities

El agendamiento de la copropiedad: quinchos, piscinas, canchas y equipos compartidos con control anti-overbooking, tarifas por uso, garantías por daños y centro de costos propio (Fondo de Amenities).

## 🚀 Funcionalidad Principal

Dos pilares: el **Maestro de Elementos** define qué se puede reservar (espacio físico o activo mobiliario) con su franja horaria, tarifa ($0 = gratis), garantía requerida, aforo/stock, reglas especiales y si **exige autorización del administrador**; el **Motor de Calendario** confirma reservas `RA-####` bloqueando automáticamente los tramos ocupados según el stock concurrente del elemento. Cuando el elemento exige autorización, la reserva no nace confirmada: nace **`solicitada`** y espera la decisión del administrador en `/admin/reservas`.

## 🛠️ Secciones

- **Calendario**: grilla cronológica de reservas confirmadas/canceladas/solicitadas; alta guiada (elemento → solicitante MP → fecha → tramo según bloques); acciones Cancelar y Retener garantía (con motivo). Cada reserva guarda snapshot de tarifa y garantía vigentes al confirmar.
- **Elementos**: CRUD del maestro — tipo (Espacio Físico / Activo Mobiliario), ubicación EF (sub-sector) o IR (activo del catálogo), franja bloques_horas|dia_completo con duración, tarifa, garantía, aforo (piscina) o stock (2 quinchos idénticos → 2), anticipación mínima, ventana de cancelación tardía, penalización y el interruptor **«Requiere autorización del administrador»**.
  - Este catálogo también se administra desde **`/admin/elementos`** (`app/admin/elementos/panel-elementos.tsx`, commit `0d61a77`), entrada propia del menú del administrador; la pestaña «Elementos» de Operaciones sigue existiendo para la operación diaria. El panel muestra un **badge «Requiere autorización»** en cada elemento marcado y envía el campo en creación y en edición.
  - `requiereAutorizacion` es aditivo y por defecto `false`: los elementos existentes y los clientes que no mandan el campo siguen creando reservas `confirmada` igual que antes (commit `9cbebd0`).
- **Alerta de reservas (`/admin/reservas`)**: la cola de autorización del administrador (commit `37c64a1`).
  - Muestra **solo solicitudes pendientes** con quién pide, para qué unidad, qué elemento, cuándo, cuánto y las notas; búsqueda de solicitante y de unidad **resueltas en el servidor** (nombre/RUT/email y número/etiqueta/rol SII) y lista paginada de a diez, para acotar de verdad en vez de arrastrar una lista interminable.
  - **Autorizar** pasa la reserva a `confirmada` y **recién ahí materializa el cargo** de la tarifa al Fondo de Amenities (`RA_BOOKING_AUTHORIZED`). **Rechazar** exige **motivo** (mínimo 3 caracteres), pasa la reserva a `cancelada` con el motivo en `cancelacion` (`tardia: false`, sin penalización) y **no revierte ningún cobro**, porque la solicitud nunca generó deuda (`RA_BOOKING_REJECTED`).
  - La transición es **exactly-once**: el `update` va condicionado por `estado: "solicitada"`, así que dos autorizaciones o dos rechazos concurrentes no duplican ni el cambio, ni el cobro, ni el evento; el segundo recibe `409`.
  - **Portón en el servidor**: `app/admin/reservas/page.tsx` exige sesión y rol `administrador`; la API de la cola exige `editar` sobre `ra` (solo administración). El módulo RA le da a residente `ver/crear`, así que la matriz sola no mantenía a otro rol afuera de la pantalla.

## 🔌 Ciclo de vida en la capa de datos (API)

La reserva y sus cobros se materializan en el servidor, dentro de la misma transacción:

- **Alta (`POST /api/ra/reservas`)**: deriva el folio `RA-####` cuando no viene, congela el snapshot de tarifa y garantía del elemento, valida el solape respetando el **stock** (capacidad) y crea el cargo `reserva_ra` al Fondo de Amenities cuando la tarifa es > 0 (idempotente por procedencia, `origenRef` = id de la reserva). Un `RA_BOOKING_CREATED` solo en el alta.
  - **El estado inicial lo decide el elemento**: con `requiereAutorizacion = true` la reserva nace `solicitada` sin importar lo que declare el cliente; con el default `false` se conserva el estado que manda el cliente (hoy `confirmada`), exactamente como antes. Un `solicitada` autodeclarado sobre un elemento que no lo exige se rechaza con `400` («El elemento no requiere autorización: la reserva nace confirmada.»). En la edición (upsert por id) el estado se sigue escribiendo como vino.
  - **Una solicitud pendiente ocupa el tramo**: mientras el administrador decide, nadie más toma ese horario; y **no genera deuda** — el cargo de la tarifa se materializa al autorizar.
- **Cancelar (`POST …/[id]/cancelar`)**: solo Confirmada; si faltan ≤ `cancelacionTardiaDias`, la cancelación es tardía y cobra `penalizacion_ra`, liberando el cupo. Exactly-once (`RA_BOOKING_CANCELLED`).
- **Autorizar (`POST …/[id]/autorizar`)**: solo desde `solicitada`; pasa a `confirmada`, materializa el cargo `reserva_ra` que el alta no creó (idempotente por procedencia) y deja `cargoFIReferencia` con el id del cobro. Exactly-once por `update` condicional (`RA_BOOKING_AUTHORIZED`).
- **Rechazar (`POST …/[id]/rechazar`)**: solo desde `solicitada`; exige `motivo` y pasa a `cancelada` con ese motivo en `cancelacion` (`tardia: false`), sin cobro ni reversa (`RA_BOOKING_REJECTED`).
- **Retener (`POST …/[id]/retener`)**: solo Confirmada y sin retención previa; el monto es siempre `montoGarantia` de la reserva y se materializa como `garantia_ra` una sola vez (`RA_WARRANTY_RETAINED`). Una reserva `solicitada` no se puede cancelar ni retener: primero el administrador decide.

**Declarado y no portado**: el gate de morosidad FI y `anticipacionMinimaDias` (inactivos en el laboratorio) y la notificación de la retención.

## 💡 Tips de Oro

- **Overbooking imposible**: dos tramos se solapan si `inicioA < finB && inicioB < finA`; día completo ocupa 00:00–23:59. Con stock N caben N reservas paralelas; la N+1 es rechazada con "Conflicto horario".
- **Autorizar es decidir, no cobrar dos veces**: la tarifa nace al autorizar (o al confirmar el alta si el elemento no exige permiso). Si el administrador rechaza, el Fondo de Amenities queda como estaba.
- **Rechazo con razón**: el motivo es obligatorio; es lo único que el solicitante puede leer para entender por qué no le autorizaron el quincho.
- **Cancelación tardía con diente**: si faltan ≤ cancelacionTardiaDias días, la cancelación marca `tardia` y deriva la penalización como cobro real al Fondo de Amenities en FI.
- **Garantía retenida = evento**: al devolver un activo dañado, retén la garantía con motivo — notifica a administración (`RA_WARRANTY_RETAINED`) y genera un cobro del fondo de amenities.
- **Cobros vivos en FI**: tarifas, penalizaciones y garantías retenidas se materializan como cobros del Fondo de Amenities y `cargoFIReferencia` guarda el id del cobro (conexión FI, Sesión 5); el gate de morosidad está activo: quien arrastra deuda vencida no puede reservar.
- **Auditoría**: `RA_BOOKING_CREATED`, `RA_BOOKING_AUTHORIZED`, `RA_BOOKING_REJECTED`, `RA_BOOKING_CANCELLED`, `RA_WARRANTY_RETAINED`.

## 🔗 Dependencias

- Sub-sectores de **EF** y activos del catálogo de **IR** como ubicación del elemento.
- Solicitantes activos del **MP**.
- Notificaciones con `notify()` (**ST**, D3).
- El carrusel de **CV - Visor de Mensajes** muestra las reservas confirmadas de los próximos 7 días.
- **Migración** `20261103000000_add_requiere_autorizacion_ra`: columna `requiereAutorizacion` (`BOOLEAN NOT NULL DEFAULT false`) en `elementos_ra`. Es aditiva; los carriles que se construyen con `migrate deploy` la necesitan o la columna no existe.
