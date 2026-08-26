# AM-auditoria-metricas Specification

## Purpose
Centralizar el registro de acciones significativas del sistema, permitir la generación de reportes, KPIs de gestión y trazabilidad completa de la operación. Fuente de verdad: `Data/NSGC/docs/especificaciones/AM - Auditoria y Metricas.md`.

## Requirements

### Requirement: Registro Universal de Eventos
Every action triggered by a user or by the system automatically MUST generate an immutable audit event.

#### Scenario: Event Structure
- **WHEN** an auditable action occurs
- **THEN** the system MUST record:
  - `timestamp`: exact date and time
  - `usuario`: who performed the action (Admin, Conserje, Residente, Sistema)
  - `categoria`: module identifier (FI, PE, CO, EF, etc.)
  - `tipoAccion`: specific action (Emisión, Pago, Notificación, Registro, Eliminación)
  - `referenciaId`: link to the affected object
  - `descripcion`: human-readable detail
  - `valorCuantificable`: numeric value when applicable

### Requirement: Event Catalog
The system MUST emit domain-specific events for each module.

#### Scenario: Financial Events
- **WHEN** a common expense is emitted or a payment is registered
- **THEN** events `FI_EMISION_GC` and `FI_PAGO_RECIBIDO` MUST be logged.

#### Scenario: Operational Events
- **WHEN** a visit, package, reservation or supply request is recorded
- **THEN** events such as `OP_VISITA_REGISTRADA`, `OP_ENCOMIENDA_RECIBIDA`, `RA_RESERVA_CONFIRMADA`, `IR_INSUMO_SOLICITADO` MUST be logged.

#### Scenario: Master Data Events
- **WHEN** a master record is created, updated or deleted
- **THEN** events `MA_MAESTRO_CREATE`, `MA_MAESTRO_UPDATE`, `MA_MAESTRO_DELETE` MUST be logged.

#### Scenario: Configuration Events
- **WHEN** global configuration changes
- **THEN** event `CF_UPDATE_PARAM` MUST be logged, including old and new values.

#### Scenario: Access Control Events
- **WHEN** a role is assigned/revoked or a permission is denied
- **THEN** events `RP_ROLE_ASSIGNED`, `RP_ROLE_REVOKED`, `RP_PERMISSION_DENIED` MUST be logged.

### Requirement: Panel de Incumplimientos y Tareas Huérfanas
The system MUST actively monitor temporary states that do not reach their final state within the expected time.

#### Scenario: Unclosed Shifts
- **WHEN** a shift ends without a Cierre de Turno
- **THEN** a critical alert "Operación No Reportada" MUST be raised.

#### Scenario: Ghost Visits
- **WHEN** a visit or contractor was scheduled but never marked as entered/cancelled
- **THEN** the task MUST be flagged as orphaned.

#### Scenario: Stalled Requests
- **WHEN** a supply request or support ticket exceeds its SLA without resolution
- **THEN** the system MUST highlight it as stalled.

### Requirement: Métricas y KPIs
The system MUST calculate and display key performance indicators derived from events and orphaned tasks.

#### Scenario: Operational Efficiency
- **WHEN** the user opens the Auditoría dashboard
- **THEN** they MUST see:
  - Tasa de Eficiencia Operativa
  - Productivity counts
  - Amenity usage and revenue
  - Service level response times
  - Collection velocity curve

### Requirement: Logs de Auditoría
The system MUST provide a dedicated view to browse, filter and export audit logs.

#### Scenario: Log Viewer
- **WHEN** the user navigates to `/admin/logs`
- **THEN** they MUST see a searchable and filterable list of audit events
- **AND** logs MUST be sorted by timestamp descending.

#### Scenario: Log Immutability
- **WHEN** an audit log is created
- **THEN** it MUST NOT be editable or deletable by any user, including administrators.

#### Scenario: Retention
- **WHEN** audit logs are stored
- **THEN** they MUST be retained for a minimum of 5 years.

### Requirement: Value Aesthetics
The system MUST display proactive value indicators to make administrative effort visible.

#### Scenario: Automated Work Counter
- **WHEN** the dashboard loads
- **THEN** it SHOULD show quantified automation (e.g., "83 properties audited", "100 parking spots monitored").

#### Scenario: Economic Impact
- **WHEN** the admin changes a price or fee parameter
- **THEN** the system SHOULD project the impact on expected revenue.

### Requirement: Dependencias de Carga y Seed (ST) - AM Sumidero Rank 99

`AM` es sumidero `rank 99` depende de todos, no bloquea carga. `AM` SHALL registrar eventos de carga `ST_SEED_STARTED`, `ST_SEED_COLLECTION_LOADED {coleccion, count, rank, duration}`, `ST_SEED_VALIDATION_FAILED {errores}`, `ST_MIGRATE_APPLIED {fromVersion, toVersion}` además del catálogo por módulo `AM-auditoria-metricas:22` (`FI_EMISION_GC`, `MA_MAESTRO_CREATE`, `CF_UPDATE_PARAM`, `RP_ROLE_ASSIGNED`, etc). Logs `AM:80` son inmutables y retención 5 años. `AM` SHALL exponer métrica `tasa huérfanos = registros con FK dangling / total` (0 esperado post-carga) y dashboard `AM:60` con eficiencia operativa.

#### Scenario: Tasa huérfanos post-bulk
- **WHEN** `seedBulkLoad` termina con `errores[]` no vacío
- **THEN** `AM` métrica `tasa huérfanos >0` y `ST_SEED_VALIDATION_FAILED` queda registrado.

#### Scenario: Bulk sin auditoría es incompleto
- **WHEN** carga bulk no emite `ST_SEED_COLLECTION_LOADED`
- **THEN** se considera incumplida `RG-reglas-generales:7` trazabilidad universal.

### Requirement: Panel de Incumplimientos como validador post-carga

`AM` panel `AM-auditoria-metricas:45` SHALL usar `tasa huérfanos` y estados huérfanos (visitas ghost, turnos no cerrados `AM:47`) como validación post-carga QA.

#### Scenario: Validación post-carga QA
- **WHEN** QA pulsa `Validar` tras `Cargar Todo`
- **THEN** `AM` lista `huérfanos` y `tareas ghost` si los hay.

### Requirement: Eventos Operativos de Personal (PE)
El catálogo de eventos MUST incluir los eventos operativos del módulo PE: `PE_START_SHIFT` (inicio de turno), `PE_TASK_DONE` (tarea completada desde el panel de monitoreo), `PE_VISITA_TECNICA` (visita técnica registrada), `PE_ENCOMIENDA_RECIBIDA` (encomienda recibida en conserjería), `PE_FICHA_SAVED`, `PE_VISITA_INGRESADA`, `PE_CONTRATISTA_INGRESADO`, `PE_CIERRE_TURNO`, `PE_CIERRE_EDITADO` y `PE_PROYECCION_ENVIADA`. Cada evento SHALL registrar data cuantificable cuando aplique (horas extra, cantidad de tareas, costo proyectado) y alimentar las métricas derivables: porcentaje de cumplimiento del plan de mantenimiento preventivo y volumen de encomiendas gestionadas por turno. Los cierres pendientes alimentan el escenario "Unclosed Shifts" (Operación No Reportada).

#### Scenario: Jornada operativa auditada
- **WHEN** un trabajador inicia turno, recibe una encomienda, registra una visita técnica y cierra su turno
- **THEN** los cuatro eventos quedan registrados como inmutables con su data cuantificable

#### Scenario: Turno no cerrado visible para AM
- **WHEN** una jornada termina sin cierre de turno registrado para esa fecha
- **THEN** la tarjeta correspondiente del reporte diario queda No Informado y el caso es detectable por el panel de incumplimientos
