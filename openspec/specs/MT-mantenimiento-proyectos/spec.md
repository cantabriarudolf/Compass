# MT-mantenimiento-proyectos Specification

## Purpose
Registro de trabajos y obras con garantías y pagos, mantención preventiva con generación automática de ciclos, tablero de próximos vencimientos y proyectos de largo plazo con cuota sugerida. Fuente de verdad: `Data/NSGC/docs/especificaciones/MT - Mantenimiento y Proyectos.md`.

## Requirements

### Requirement: Registro de Trabajos y Obras con Ubicación EF
El sistema MUST documentar intervenciones técnicas y mejoras mediante `saveTrabajoMT` retornando `StoreResult`, con descripción técnica detallada, vinculación directa con la infraestructura (unidad del maestro EF, micro sector o activo del catálogo IR como Hidropack/ascensores), responsable (empresa externa proveedora o personal interno MP), estado (Planificado, En Curso, Finalizado, Cancelado), prioridad (Baja, Media, Alta, Emergencia/Crítico) y repositorio de evidencia (fotos antes/después, presupuestos y facturas digitalizadas) como metadatos D1. Todo trabajo nuevo audita `MT_WORK_CREATED`; el histórico de mantenimiento por cada zona o equipo crítico MUST ser derivable filtrando por unidad/micro sector/activo.

#### Scenario: Trabajo sobre equipo crítico
- **WHEN** se registra un trabajo sobre el Hidropack referenciando su activo IR
- **THEN** persiste con folio MT-* único, ubicación EF y evento `MT_WORK_CREATED`

#### Scenario: Evidencia digitalizada por referencia
- **WHEN** se adjunta factura del contratista y fotos antes/después
- **THEN** se guardan como metadatos D1 (nombre/tipoMime/tamañoKB/URL) tipados por tipo de evidencia

#### Scenario: Trabajo sin ubicación rechazado
- **WHEN** falta unidad y micro sector de referencia
- **THEN** retorna `{ok:false}` exigiendo la ubicación

### Requirement: Garantías y Seguimiento a Proveedores
Los trabajos de terceros MUST poder registrar vigencia de garantía (fecha inicio y término). El sistema MUST detectar mediante `verificarGarantiasMT` las garantías próximas a expirar (≤30 días) o vencidas, notificando a la administración antes del vencimiento para realizar inspecciones finales y auditando `MT_GUARANTEE_EXPIRED` una sola vez por trabajo (idempotente).

#### Scenario: Alerta previa a expiración
- **WHEN** una impermeabilización finaliza su garantía en 15 días y se verifica
- **THEN** la administración recibe notificación email_simulado y se marca la alerta como enviada

#### Scenario: Verificación idempotente
- **WHEN** se vuelve a verificar un trabajo cuya alerta ya fue enviada
- **THEN** no duplica notificación ni evento

### Requirement: Gestión Financiera de Obras Declarativa
Cada trabajo MUST registrar Costo Total (incluyendo insumos e impuestos), Origen de Fondos (Gasto Común ordinario, Fondo de Reserva legal o Fondo Especial específico) y Estado de Pago (Pendiente, Parcial, Pagado) actualizable con `actualizarPagoTrabajoMT`. Hasta implementar Finanzas, todo cargo usa el patrón referencia pendiente (`cargoFIReferencia:"pendiente"`).

#### Scenario: Pago parcial luego total
- **WHEN** se marca un trabajo como Parcial y luego Pagado
- **THEN** las transiciones quedan registradas sin permitir saltos inversos inválidos

#### Scenario: Origen fondo especial documentado
- **WHEN** un trabajo se financia con Fondo Especial "Pintura de fachada"
- **THEN** el origen queda registrado y la referencia a FI marcada pendiente

### Requirement: Mantenimiento Preventivo con Generación Automática de Ciclos
El sistema MUST permitir configurar la periodicidad de mantención de equipos críticos (ej. Hidropack mensual; CCTV/Cerco Eléctrico semestral; Ascensores mensual). Al finalizar un trabajo preventivo (`finalizarTrabajoMT`), el sistema MUST crear automáticamente el próximo registro de mantenimiento Planificado basado en el intervalo definido, auditando `MT_WORK_FINISHED` y `MT_PREVENTIVE_GENERATED`.

#### Scenario: Finalización genera siguiente ciclo
- **WHEN** se finaliza la mantención mensual del Hidropack
- **THEN** nace automáticamente la mantención del mes siguiente en estado Planificado con su fecha programada

#### Scenario: Correctivo no genera ciclo
- **WHEN** se finaliza un trabajo correctivo sin configuración preventiva
- **THEN** no se genera ningún registro adicional

### Requirement: Tablero de Próximos Vencimientos
El sistema MUST presentar un tablero donde la administración visualice las mantenciones obligatorias próximas (ordenadas por fecha programada ascendente, distinguindo vencidas), permitiendo planificar el mes/trimestre.

#### Scenario: Vencimientos del periodo
- **WHEN** la administración abre el tablero de prevención
- **THEN** ve los trabajos preventivos planificados ordenados por fecha con los vencidos destacados

### Requirement: Proyectos y Proyecciones a Largo Plazo
El sistema MUST mantener planes de trabajo futuros mediante `saveProyectoMT`/`removeProyectoMT` retornando `StoreResult`, con presupuesto estimado y plazo (meses/años); el sistema MUST derivar el monto sugerido de cuota extraordinaria o incremento de fondo de reserva (presupuesto/plazo) sin cálculos externos, y la fecha objetivo alimenta las alarmas por vida útil de componentes. Un proyecto MAY declarar el fondo FI que lo financia (`fondoFinanciamientoId`): al guardarlo, el sistema MUST validar que el fondo exista, esté activo y disponga de saldo suficiente (≥ presupuesto estimado) según el libro de Finanzas.

#### Scenario: Cuota sugerida derivable
- **WHEN** se crea "Mantención de techos" con $12.000.000 a 120 meses
- **THEN** la UI/reportería puede derivar una cuota sugerida de $100.000 mensuales

#### Scenario: Proyecto con fondos insuficientes rechazado
- **WHEN** se crea un proyecto de $5.000.000 declarando un fondo con saldo $2.000.000
- **THEN** `saveProyectoMT` retorna `{ok:false}` por saldo insuficiente sin crear el proyecto

#### Scenario: Proyecto con trabajos no eliminable en uso real
- **WHEN** se descarta un proyecto aún sin ejecución
- **THEN** el cambio de estado queda registrado sin afectar trabajos históricos

### Requirement: Integración con Auditoría y Métricas (AM)
El módulo SHALL emitir `MT_WORK_CREATED`, `MT_WORK_FINISHED`, `MT_GUARANTEE_EXPIRED` y `MT_PREVENTIVE_GENERATED` como eventos inmutables con data cuantificable: costo total de obras por periodo, cantidad de mantenciones preventivas ejecutadas vs programadas y desviación presupuestaria derivable.

#### Scenario: Auditoría completa
- **WHEN** ocurre creación, término, alerta de garantía o generación preventiva
- **THEN** el evento registra folio, título y descripción legible sin mutar colecciones históricas
