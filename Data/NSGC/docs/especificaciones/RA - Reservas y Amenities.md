# RA - Reservas y Amenities

Este módulo gestiona el motor de agendamiento para espacios comunes y activos compartidos de la comunidad, evitando conflictos de uso y controlando la rentabilidad de cada elemento.

## 1. Maestro de Elementos Reservables

Permite a la administración crear y configurar qué cosas se pueden reservar, ya sean espacios físicos o equipos.

### Atributos de Configuración:
- **Tipo:** Espacio Físico (Quincho, Piscina, Cancha) o Activo Mobiliario (Hidrolavadora, Taladro, Bicicleta).
- **Ubicación:** Vínculo a `EF` (Estructura Física) o `IR` (Inventario) para saber dónde está.
- **Franjas Horarias:** Lógica de uso (Ej: Bloques de 3 horas, o día completo).
- **Tarifa de Uso:** Costo por bloque o por día. Puede ser $0 (gratis).
- **Garantía Requerida:** Monto en dinero que se retiene o cobra temporalmente (clave para equipos como la hidrolavadora que pueden sufrir daños).
- **Aforo / Stock:** Capacidad máxima (para la piscina) o cantidad disponible (si hay 2 quinchos idénticos).
- **Reglas Especiales:** Tiempo de anticipación mínima para reservar, o penalización por cancelación tardía.

## 2. Motor de Calendario y Conflictos

El núcleo operativo que ve el residente y el administrador.
- **Prevención de Overbooking:** Calendario en tiempo real que bloquea automáticamente un horario o activo una vez confirmado.
- **Lista de Espera:** (Opcional) Si un residente cancela, el sistema avisa al siguiente interesado.
- **Validación de Morosidad:** El sistema bloquea automáticamente la posibilidad de reservar a los residentes que mantengan deuda en `FI` (Finanzas).

## 3. Integración Financiera y Mantenimiento (Centro de Costos)

Cada elemento reservable funciona como una unidad de negocio independiente dentro del condominio para medir su sostenibilidad.

- **Fondo Específico de Amenities:** A diferencia del Gasto Común ordinario, los movimientos financieros de este módulo se inyectan en un "cajón" o fondo específico (ej: Fondo de Mantención de Amenities) dentro del [Maestro de Fondos (FI)](<FI - Finanzas y Morosidad.md>#1-gestion-de-gastos-egresos).
- **Ingresos por Uso:** Todo cobro por tarifa de uso se suma a este fondo específico.
- **Egresos por Reparación:** Las reparaciones o insumos (ej: carbón para quinchos, filtros para piscina) se descuentan de este fondo, permitiendo una trazabilidad real de su rentabilidad.
- **Gestión de Garantías:** El sistema alerta a conserjería al momento de devolver el activo. Si el activo está dañado, el administrador puede retener la garantía para cubrir la reparación, alimentando el flujo de este centro de costos.

## 4. Integración con Auditoría y Métricas (AM)

Integración directa con los tableros de `RE` y `AM` para demostrar valor:
- **Evento:** `RA_BOOKING_CREATED`, `RA_BOOKING_CANCELLED`, `RA_WARRANTY_RETAINED`.
- **Data Cuantificable:** Número de reservas por amenity, ingresos por tarifas de uso, garantías retenidas por daños, cancelaciones tardías.
- **Métrica:** Tasa de uso (% de tiempo reservado), rentabilidad del activo (ingresos vs gastos de mantenimiento), ranking de demanda de amenities.
