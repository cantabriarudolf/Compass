## MODIFIED Requirements

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
