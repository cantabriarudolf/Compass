# VU-vinculacion-unidades Specification

## Purpose
Gestionar la relación entre las Unidades y las Personas (Maestro de Personas), incluyendo la lógica de responsabilidad de cobro, el censo demográfico de cada unidad, el control de arriendos y contratos, y el historial de propiedad. Fuente de verdad: `Data/NSGC/docs/especificaciones/VU - Vinculacion Unidades.md`.

## Requirements

### Requirement: Payment Responsibility (Responsable de Cobro)
Every unit MUST have a responsible subject for billing (Propietario or Residente). It is indifferent to the system who assumes the financial obligation, as long as a linked responsible exists.

#### Scenario: Responsible Assignment
- **WHEN** a unit has no linked responsible subject
- **THEN** the system MUST require assigning a Propietario or Residente as Responsable de Cobro

### Requirement: Unit Link CRUD
The system SHALL allow an Administrator to create, view, edit, and delete links (vínculos) between a Person and a Physical Unit from within the Person's profile.

#### Scenario: Creating a new link
- **WHEN** the Administrator clicks "Vincular Unidad" in the "Unidades Vinculadas" tab
- **THEN** a form opens requesting the target Unit, Role, Start Date, and conditional privacy/real estate settings

#### Scenario: Deleting a link
- **WHEN** the Administrator removes a linked unit from a Person's profile
- **THEN** the system immediately removes the link from the view and marks it as inactive or deletes it from the person's active linkages

### Requirement: Duplicate Link Prevention
The system SHALL prevent linking the same Person to the same Physical Unit more than once concurrently.

#### Scenario: Attempting duplicate link
- **WHEN** the Administrator attempts to link a Person to a Unit they are already linked to
- **THEN** the system rejects the operation and displays an error message

### Requirement: Specific Role Assignment
The system SHALL require exactly one Role assignment for every created Link (Propietario, Arrendatario, Copropietario/Familiar, Ocupante).

#### Scenario: Valid Role Selection
- **WHEN** linking a unit
- **THEN** the Administrator must select one valid role from the predefined list

### Requirement: Self-Service Census (Censo Demográfico)
The system MUST register who inhabits each unit beyond who pays, for security and evacuation purposes.

#### Scenario: Census Data
- **WHEN** a resident updates their unit census
- **THEN** the system MUST record total occupants, number of children, and number/type of pets

#### Scenario: Census Obsolescence Alert
- **WHEN** a resident is new, or the census was last updated more than 1 year ago
- **THEN** the system MUST raise an alert on the admin dashboard and notify the resident to revalidate their data

#### Scenario: Residence Certification
- **WHEN** the census data is validated
- **THEN** it MUST enable automatic generation of the official certificate through the Certificados (CT) module

### Requirement: Rental and Contract Control
The system MUST support rental management with contract dates and documentation.

#### Scenario: Contract Lifecycle
- **WHEN** managing a rental
- **THEN** the system MUST record start and end dates of the lease, digital contract and salvoconducto uploads, and physical move-in/move-out dates

#### Scenario: Contract Overlap Prevention
- **WHEN** a new rental contract overlaps with an existing one on the same unit
- **THEN** the system MUST prevent the overlap

### Requirement: Owner-Exclusive Real Estate Data
Real estate information destined for the Portal Inmobiliario (PI) MUST be exclusive to the Propietario role.

#### Scenario: Owner Access Only
- **WHEN** a user without the Propietario role on the unit attempts to edit real estate data
- **THEN** the system MUST block access
- **AND** a resident gains access only if they also hold Propietario quality on the unit

#### Scenario: Real Estate Status Setting
- **WHEN** the role "Propietario" is selected
- **THEN** a dropdown MUST appear to select "Estado Ocupación Propiedad"
- **AND** the options MUST come from the `estadosInmobiliarios` collection managed by MA (habitada, proxima_vacancia, en_arriendo, arrendada, en_venta seeded by default), never from a hardcoded UI list

### Requirement: Delegated Financial Privacy
The system SHALL allow only the 'Propietario' role to define whether their financial data (Gastos Comunes) can be viewed by residents of the unit.

#### Scenario: Setting Privacy as Propietario
- **WHEN** the role "Propietario" is selected
- **THEN** the "Permite Ver Finanzas" toggle becomes visible and editable

#### Scenario: Privacy Hidden for Non-Owners
- **WHEN** the role is NOT "Propietario"
- **THEN** the "Permite Ver Finanzas" toggle is hidden

### Requirement: Inactive Person Restriction
A resident MUST NOT be linkable to a unit if they are marked as "Inactivo" in the Maestro de Personas.

#### Scenario: Inactive Resident
- **WHEN** an Administrator attempts to link an inactive person to a unit
- **THEN** the system MUST reject the link

### Requirement: Ownership History (Trazabilidad)
The system MUST guarantee the historical memory of each unit with an immutable record.

#### Scenario: Owner History
- **WHEN** querying a unit
- **THEN** the system MUST show previous and current owners

#### Scenario: Occupancy History
- **WHEN** querying a unit
- **THEN** the system MUST show a chronological record of all residents, including contract start and end dates, to trace incidents or historical debts

### Requirement: Audit Trail
Control of changes in legal and financial responsibility MUST be recorded in the Auditoría y Métricas (AM) module.

#### Scenario: Ownership Change Event
- **WHEN** the responsibility of a unit changes
- **THEN** the system MUST emit the event `VU_CHANGE_OWNER`

#### Scenario: New Tenant Event
- **WHEN** a new tenant is linked to a unit
- **THEN** the system MUST emit the event `VU_NEW_TENANT`

#### Scenario: Move Registration Event
- **WHEN** a move-in or move-out is registered
- **THEN** the system MUST emit the event `VU_MUDANZA_REG`
- **AND** metrics for tenant rotation rate and moves per month MUST feed the Operational Dashboard

### Requirement: Dependencias de Carga y Seed (ST) - VU Rank 3 último del core

Entidad `CompassData.vinculos` `k0mp4ss_fe/apps/web/lib/store.ts:82`, seed `data/comunidad/vinculos.ts:30 vinculos` (55 registros). `Depende de: [MP.personas, EF.unidades, MA.estadosInmobiliarios]` `k0mp4ss_fe/apps/web/lib/store.ts:57`. `Rank 3` último del core. Campos FK: `vinculo.personaId -> personas.id`, `unidadId -> unidades.id`, `estadoOcupacionPropiedad? -> maestros.estadosInmobiliarios.id` `VU-vinculacion-unidades:74`, `permiteVerFinanzas` solo visible si `rol==propietario` `VU:80`. `saveVinculo:278` ya valida `persona exists + activa + no duplicado + no solape arriendo` `ST:80`; además SHALL mantener `cerrarAnterior:310` (cierra tramo `propietario/arrendatario` previo con `fechaFin = fechaInicio-1`). `removeVinculo:335` sin validación inversa.

#### Scenario: Vinculo con persona inexistente
- **WHEN** `saveVinculo({personaId:"no-existe"})`
- **THEN** `{ok:false, error:"La persona no existe"}`.

#### Scenario: Solape arriendo en bulk
- **WHEN** seed `vinculos` contiene dos `arrendatario` solapados en misma `unidadId`
- **THEN** `seedBulkLoad` segundo registro retorna `ok:false: solapa contrato` y se reporta en `SeedValidationReport`.

#### Scenario: Cierre automático en bulk
- **WHEN** seed carga segundo `propietario` para misma `unidadId` sin `fechaFin` en el primero y con `cerrarAnterior!=false`
- **THEN** el primero se cierra con `fechaFin = nueva fechaInicio -1` `k0mp4ss_fe/apps/web/lib/store.ts:310`.

### Requirement: Carga Solo tras EF y MP Completos

`VU` SHALL cargarse tras `EF rank2` y `MP rank1`. `validateSeedOrder` SHALL fallar si `vinculo.unidadId` no existe en `unidades` rank2.

#### Scenario: VU antes que EF
- **WHEN** QA pulsa `Cargar VU` antes de `Cargar EF`
- **THEN** todos los `saveVinculo` fallan con `unidad no existe` y bulk reporta 55 errores.

### Requirement: Eventos AM de Carga VU

Bulk `vinculos` SHALL emitir `VU_SEED_LOADED` y mutaciones `VU_CHANGE_OWNER/VU_NEW_TENANT/VU_MUDANZA_REG` `VU-vinculacion-unidades:108`.

#### Scenario: Bulk VU auditado
- **WHEN** se cargan 55 vínculos
- **THEN** `AM` registra `valorCuantificable:55` y `métrica: rotación = mudanzas/mes`.
