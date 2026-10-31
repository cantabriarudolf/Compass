# RE-reporteria-dashboards Specification

## Purpose

Consolidar la información de todos los subsistemas (Finanzas, Operaciones, Estructura) para presentarla de forma digerible, permitiendo la toma de decisiones y la transparencia hacia la comunidad. Fuente de verdad: `Data/NSGC/docs/especificaciones/RE - Reporteria y Dashboards.md`.
## Requirements
### Requirement: Dashboards por Perfil
El sistema SHALL presentar vistas consolidadas según el rol del usuario:
- **Dashboard de Operaciones (Personal de Servicio)**: tarjetas de jornadas (Mañana/Tarde/Noche) con estados Informado/No Informado, historial y acceso al detalle del Cierre de Turno (ubicado en PE Reporte Diario).
- **Centro de Mando (Administración/Comité)** con métricas en tiempo real:
  - Demográficas: ratio de ocupación propietarios vs residentes arrendatarios; unidades con residentes con condiciones especiales.
  - Operativas: eficiencia de turnos ("X de Y turnos cerrados hoy"); control de accesos ("X de Y visitas pre-agendadas confirmadas").
  - Centro de Gestiones: embudo cuantitativo GE — total gestiones, tasa de resolución, nuevas/pendientes, en revisión, notificadas (en proceso), solucionadas y dadas en conocimiento.
  - Financieras: recaudación por fondo (GC/reserva/cuota extraordinaria) recaudado vs emitido, diferencia de caja (ingresos netos vs egresos) y termómetro de gastos fijos recurrentes verde/rojo.

#### Scenario: Embudo GE cuantitativo estricto
- **WHEN** la administración abre el Centro de Mando
- **THEN** cada etapa del embudo muestra el conteo exacto de tickets GE y la tasa de resolución global

#### Scenario: Termómetro de gastos fijos
- **WHEN** los egresos recurrentes proyectados superan la caja disponible proyectada
- **THEN** el termómetro se marca en rojo; en caso contrario en verde

### Requirement: Generador de Reportes Personalizados por Bloques
El sistema SHALL permitir construir un reporte seleccionando bloques de información — resumen de gastos del mes, historial de novedades de seguridad (bitácora), estado de morosidad general y consumo de insumos (IR) — generando un snapshot inmutable del contenido al momento de crearlo.

#### Scenario: Snapshot inmutable del bloque
- **WHEN** se genera un reporte con el bloque "Estado de Morosidad General"
- **THEN** el payload queda congelado en `reportesRE` aunque la mora cambie después

### Requirement: Segmentación Granular como Motor de Distribución
La segmentación SHALL resolver destinatarios con precisión combinando:
- **Estructura Física (EF)**: edificio completo, piso específico o unidad particular.
- **Perfil (MP/RP)**: administrador/directiva, trabajador de servicio, propietario, residente.
- **Tenencia (VU)**: solo propietarios o solo residentes arrendatarios.

Al distribuir, el sistema SHALL resolver los personaIds vigentes al momento (no los congelados), enviar por bandeja simulada (`notify()` D3, canal `email_simulado`, respetando el gate de alertas AD) y registrar el alcance.

#### Scenario: Torre A × Residentes + Propietarios
- **WHEN** se distribuye el reporte "Fallas en Ascensores de la Torre A" segmentado a `[Torre A] + [Residentes] + [Propietarios]`
- **THEN** reciben exactamente las personas con vínculo vigente de tenencia seleccionada en unidades de ese macro sector, sin duplicados

#### Scenario: Distribución idempotente
- **WHEN** se distribuye dos veces el mismo reporte ya distribuido
- **THEN** la segunda llamada retorna `{ok:false}` citando distribución previa

### Requirement: Auditoría de Acceso a Reportería
Todo acceso a dashboards SHALL auditarse: cada vista abierta emite `RE_DASHBOARD_VIEW` con el identificador de vista; generar y distribuir emiten `RE_REPORT_GENERATED` y `RE_REPORT_DISTRIBUTED` con alcance (cantidad de destinatarios).

#### Scenario: Vista auditada
- **WHEN** un usuario abre cualquier pestaña del Centro de Mando
- **THEN** AM registra `RE_DASHBOARD_VIEW` inmutable con la vista consultada

### Requirement: Dependencias de Carga y Seed (ST)
RE SHALL declarar sus entidades ST con el orden canónico de carga:

- **Entidades ST**: colección `reportesRE` en `CompassData`.
- **Depende de**: MP/VU/EF (demografía y segmentación), PE (turnos), GE (embudo), FI (caja/fondos/morosidad), IR (consumo), AM/ST (tasa huérfanos).
- **Load Order Rank**: 99 (`99=RE/AM`, sumidero).
- **Seed Manifest**: colección transaccional nace vacía; sin seeds estáticos.
- **Validación Referencial**: escritura valida que los ids del segmento existan (macro/micro/unidad); distribución resuelve contra estado vigente.
- **Carga Bulk**: iteración rank asc conforme al manifest canónico.
- **Migración**: bump 24→25 aditivo (colección vacía).

#### Scenario: Store persistido v24 migra a v25
- **WHEN** un usuario con estado persistido en versión 24 abre la aplicación
- **THEN** `reportesRE` queda disponible vacía sin pérdida de datos previos

### Requirement: Integración con Auditoría y Métricas (AM)
Todo acceso a información sensible y cada distribución SHALL quedar registrado:
- **Evento:** `RE_DASHBOARD_VIEW`, `RE_REPORT_GENERATED`, `RE_REPORT_DISTRIBUTED`
- **Data Cuantificable:** cantidad de reportes generados por periodo, alcance (audiencia) de cada distribución, frecuencia de acceso por perfil
- **Métrica:** tasa de consumo de reportes por rol, exactitud de la segmentación, tiempo de generación de reportes, tasa huérfanos visible en el mando (0 esperado post-carga)

#### Scenario: Ciclo de reportería trazado
- **WHEN** se abre el mando, se genera un reporte y se distribuye
- **THEN** los eventos `RE_DASHBOARD_VIEW`, `RE_REPORT_GENERATED` y `RE_REPORT_DISTRIBUTED` quedan registrados como inmutables con su data cuantificable

### Requirement: Historial de reportes con fuente BD
Generar SHALL persistir el reporte en BD (`POST /api/reportes-re`) y
distribuir SHALL espejar `fechaDistribucion`/`distribuidoA`/
`destinatariosPersonaId` (PUT): el historial lee de BD pero la generación
vivía solo en el store legacy y el título nunca aparecía.

#### Scenario: Generar, ver en historial y distribuir
- **WHEN** se genera un reporte y se distribuye en `/admin/reporteria`
- **THEN** la card con el título aparece en el historial y tras distribuir
  muestra el badge `N destinatario(s)`.

