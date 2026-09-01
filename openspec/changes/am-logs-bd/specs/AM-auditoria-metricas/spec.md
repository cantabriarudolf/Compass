## MODIFIED Requirements

### Requirement: Logs de Auditoría

The system MUST provide a dedicated view to browse, filter and export audit logs backed by the persistent data layer (retención 5 años).

#### Scenario: Log Viewer
- **WHEN** the user navigates to `/admin/logs`
- **THEN** they MUST see a searchable and filterable list of audit events fetched from `GET /api/auditoria` (BD, orden `timestamp` desc, paginación server-side `page`/`pageSize`)
- **AND** the list MUST support text search over `descripcion`, `referenciaId` and `tipoAccion` via query param `q` (debounce 200 ms en la UI, substring en BD)
- **AND** the list MUST support filtering by `categoria` (module code) and by `tipoAccion` via query params `categoria`/`tipoAccion` (valores derivados de la página actual de resultados)
- **AND** the view MUST show pagination controls (anterior/siguiente) and a counter "X de Y eventos en BD" (Y = `total` del response)

#### Scenario: Log Export
- **WHEN** the user applies a filter or search and requests the export
- **THEN** the system MUST download a CSV containing the currently loaded page of the filtered result set (BOM UTF-8)
- **AND** the CSV MUST include one header row with the fields
  `timestamp, usuario, categoria, tipoAccion, referenciaId, descripcion`.

#### Scenario: Log Immutability
- **WHEN** an audit log is created
- **THEN** it MUST NOT be editable or deletable by any user, including administrators.
- **AND** the `/admin/logs` view MUST NOT offer edit or delete actions for any event.

#### Scenario: Retention
- **WHEN** audit logs are stored
- **THEN** they MUST be retained for a minimum of 5 years.
