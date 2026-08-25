# 📅 20 - RA - Reservas y Amenities

El agendamiento de la copropiedad: quinchos, piscinas, canchas y equipos compartidos con control anti-overbooking, tarifas por uso, garantías por daños y centro de costos propio (Fondo de Amenities).

## 🚀 Funcionalidad Principal

Dos pilares: el **Maestro de Elementos** define qué se puede reservar (espacio físico o activo mobiliario) con su franja horaria, tarifa ($0 = gratis), garantía requerida, aforo/stock y reglas especiales; el **Motor de Calendario** confirma reservas `RA-####` bloqueando automáticamente los tramos ocupados según el stock concurrente del elemento.

## 🛠️ Secciones

- **Calendario**: grilla cronológica de reservas confirmadas/canceladas; alta guiada (elemento → solicitante MP → fecha → tramo según bloques); acciones Cancelar y Retener garantía (con motivo). Cada reserva guarda snapshot de tarifa y garantía vigentes al confirmar.
- **Elementos**: CRUD del maestro — tipo (Espacio Físico / Activo Mobiliario), ubicación EF (sub-sector) o IR (activo del catálogo), franja bloques_horas|dia_completo con duración, tarifa, garantía, aforo (piscina) o stock (2 quinchos idénticos → 2), anticipación mínima, ventana de cancelación tardía y penalización.

## 💡 Tips de Oro

- **Overbooking imposible**: dos tramos se solapan si `inicioA < finB && inicioB < finA`; día completo ocupa 00:00–23:59. Con stock N caben N reservas paralelas; la N+1 es rechazada con "Conflicto horario".
- **Cancelación tardía con diente**: si faltan ≤ cancelacionTardiaDias días, la cancelación marca `tardia` y deriva la penalización como cargo FI pendiente.
- **Garantía retenida = evento**: al devolver un activo dañado, retén la garantía con motivo — notifica a administración (`RA_WARRANTY_RETAINED`) y queda pendiente para el fondo de amenities.
- **Todo cobro espera FI**: tarifas, penalizaciones y garantías retenidas viajan como `cargoFIReferencia:"pendiente"` hasta conectar Finanzas (Ventana 6); el gate de morosidad también se activa ahí.
- **Auditoría**: `RA_BOOKING_CREATED`, `RA_BOOKING_CANCELLED`, `RA_WARRANTY_RETAINED`.

## 🔗 Dependencias

- Sub-sectores de **EF** y activos del catálogo de **IR** como ubicación del elemento.
- Solicitantes activos del **MP**.
- Notificaciones con `notify()` (**ST**, D3).
- El carrusel de **CV - Visor de Mensajes** muestra las reservas confirmadas de los próximos 7 días.
