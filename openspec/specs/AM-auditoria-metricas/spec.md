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
- **AND** the list MUST support text search over `descripcion`, `referenciaId` and `tipoAccion`.
- **AND** the list MUST support filtering by `categoria` (module code) and by `tipoAccion`.

#### Scenario: Log Export
- **WHEN** the user applies a filter or search and requests the export
- **THEN** the system MUST download a CSV containing the filtered result set
- **AND** the CSV MUST include one header row with the fields
  `timestamp, usuario, categoria, tipoAccion, referenciaId, descripcion`.

#### Scenario: Log Immutability
- **WHEN** an audit log is created
- **THEN** it MUST NOT be editable or deletable by any user, including administrators.
- **AND** the `/admin/logs` view MUST NOT offer edit or delete actions for any event.

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

### Requirement: Eventos de Remuneraciones (PL)
El catálogo de eventos MUST incluir los eventos del módulo PL: `PL_GENERATE_PAYSLIP` (liquidación generada en borrador), `PL_ADD_ADVANCE` (adelanto registrado con folio ADE), `PL_DELETE_PAYSLIP` (liquidación borrador eliminada) y `PL_EXPENSE_SYNC` (confirmación sincronizada como egreso FI categoría sueldos). Cada evento SHALL registrar data cuantificable cuando aplique (monto total, monto del adelanto, horas extra liquidadas) y alimentar las métricas derivables: gasto mensual total en remuneraciones, volumen de adelantos por trabajador, desviación presupuestaria vs proyección PE y tasa de retenciones previsionales.

#### Scenario: Ciclo de pago auditado
- **WHEN** se registra un adelanto, se genera la liquidación y se confirma
- **THEN** los tres eventos quedan registrados como inmutables con su data cuantificable y el egreso FI referenciado

### Requirement: Eventos de Certificados (CT)
El catálogo de eventos MUST incluir los eventos del módulo CT: `CT_GENERATE_RESIDENCE`, `CT_GENERATE_FINANCIAL` (incluye estado de cuenta y al día con su data), `CT_GENERATE_PAYROLL` y `CT_GENERATE_AL_DIA`. Cada evento SHALL registrar data cuantificable (tipología emitida, unidad/persona destino) y alimentar las métricas derivables: cantidad de certificados por tipo, unidades con mayor demanda y trazabilidad por código de verificación.

#### Scenario: Emisión auditada por tipología
- **WHEN** se emiten certificados de las cuatro tipologías
- **THEN** cada emisión queda registrada como evento inmutable con su referencia al registro CT

### Requirement: Eventos de Reportería (RE)
El catálogo de eventos MUST incluir los eventos del módulo RE: `RE_DASHBOARD_VIEW` (acceso a cada vista del mando), `RE_REPORT_GENERATED` (reporte creado con bloques) y `RE_REPORT_DISTRIBUTED` (distribución con alcance). Cada evento SHALL registrar data cuantificable (vista consultada, bloques incluidos, cantidad de destinatarios) y alimentar las métricas derivables: tasa de consumo de reportes por rol, frecuencia de acceso por perfil y exactitud de la segmentación.

#### Scenario: Ciclo reportería auditado
- **WHEN** se abre el mando, se genera un reporte segmentado y se distribuye
- **THEN** los tres eventos quedan registrados como inmutables con su data cuantificable

### Requirement: Sincronización de eventos a la capa de datos
El sistema SHALL persistir los eventos de auditoría generados en el cliente hacia la base de datos de forma idempotente y SHALL exponer una API de consulta paginada y filtrada, ambas con scoping multi-tenant por comunidad y sin operaciones de borrado o edición (inmutabilidad).

#### Scenario: Ingesta batch idempotente
- **WHEN** el cliente envía `POST /api/auditoria/sync` con `{ eventos: EventoAuditoria[] }` (máx ~500) autenticado y con membresía en la comunidad
- **THEN** el servidor SHALL hacer `upsert` por `id` para cada evento asignando `comunidadId` de la membresía del usuario autenticado y SHALL responder `{ ok: true, recibidos, persistidos }` sin duplicar filas al reenviar el mismo `id`.

#### Scenario: Consulta paginada con filtros server-side
- **WHEN** un usuario autenticado con membresía hace `GET /api/auditoria?categoria=&tipoAccion=&q=&page=&pageSize=`
- **THEN** el servidor SHALL responder `{ total, page, pageSize, eventos }` con eventos de su comunidad ordenados `timestamp` desc, aplicando filtros opcionales `categoria` exacto, `tipoAccion` exacto y `q` por substring case-insensitive sobre `descripcion`, `tipoAccion` y `referenciaId`, con paginación server-side.

#### Scenario: Aislamiento multi-tenant
- **WHEN** un usuario con membresía solo en comunidad A consulta o sincroniza eventos
- **THEN** el sistema SHALL exponer/afectar únicamente eventos de la comunidad A y SHALL no filtrar ni escribir eventos de otras comunidades.

#### Scenario: Autenticación y autorización
- **WHEN** una petición a `/api/auditoria/*` llega sin sesión válida
- **THEN** el servidor SHALL responder 401; y si el usuario no tiene membresía en la comunidad derivada, SHALL responder 403.

#### Scenario: Cliente sync con debounce
- **WHEN** el store de auditoría (`eventos`) cambia en el cliente con sesión activa
- **THEN** el cliente SHALL acumular solo el delta no persistido (Set de ids ya enviados en memoria del módulo) y SHALL hacer `POST /api/auditoria/sync` con el delta a los 2s del último cambio (debounce), sin bloquear la UI; si el POST responde 401 SHALL marcar los ids del batch como fallidos sin reintento en loop y esperar el próximo cambio.

#### Scenario: Inmutabilidad
- **WHEN** un evento ha sido persistido
- **THEN** el sistema SHALL no exponer ni ejecutar operaciones de borrado o edición sobre `EventoAuditoria` (solo upsert idempotente y lectura).

