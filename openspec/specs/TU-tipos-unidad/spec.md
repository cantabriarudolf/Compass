# TU-tipos-unidad Specification

## Purpose
Gestionar el maestro de tipos de unidad que estandariza las características de las unidades de la comunidad, permitiendo la creación masiva y asegurando la consistencia en los cobros. Fuente de verdad: `Data/NSGC/docs/especificaciones/TU - Tipos de Unidad.md`.

## Requirements

### Requirement: Type Attributes
Every "Tipo de Unidad" MUST define the base attributes of a unit model, including a descriptive name, metraje (m2), a base gasto común amount in pesos, and an optional description.

#### Scenario: Default Values
- **WHEN** a new type is created
- **THEN** the admin MUST provide Nombre del Tipo, Metraje (m2) and Monto Base Gasto Común
- **AND** the Descripción field MUST be optional

### Requirement: Category From MA Master
The "Categoría" of a "Tipo de Unidad" MUST be selected from the `categoriasUnidad` collection managed by the Maestros Administrativos (MA) module. The UI MUST NOT hardcode category options.

#### Scenario: Category Options
- **WHEN** the admin opens the create/edit form of a type
- **THEN** the Categoría selector MUST list the categories from `maestros.categoriasUnidad` of the store
- **AND** a category created in MA MUST appear in the selector without code changes

### Requirement: Value Inheritance
When a "Tipo de Unidad" is assigned to a physical unit, the unit MUST inherit the metraje and gasto común amount defined in the maestro.

#### Scenario: Metraje Protection
- **WHEN** viewing a unit assigned to a type
- **THEN** the metraje MUST be read-only and inherited from the type template

### Requirement: Retroactive Modification with Effective Date
If the "Monto Base" changes in the maestro, the admin MUST define an Effective Date, and the system MUST ask whether to propagate the value to all linked physical units.

#### Scenario: Update Propagation
- **WHEN** the admin changes the base amount and sets a vigencia date
- **THEN** the system MUST offer to update the value in all linked physical units
- **AND** the Finanzas (FI) module MUST apply the "Actualización de Deuda" logic so morosos who pay after the new tariff start date get their historical balances readjusted

#### Scenario: Impact Calculator
- **WHEN** the admin simulates a new amount before saving
- **THEN** the UI MUST show affected units, unitary variation, monthly total impact, and weighted annual projection

### Requirement: Deletion Restriction
A "Tipo de Unidad" MUST NOT be deletable if physical units are linked to it.

#### Scenario: Linked Units
- **WHEN** an admin attempts to delete a type that has linked units
- **THEN** the system MUST prevent the deletion

### Requirement: Logical Deactivation (Soft Delete)
Master data MUST NOT be permanently deleted.

#### Scenario: Toggle Status
- **WHEN** an admin wants to remove a type
- **THEN** they MUST toggle its status to "Inactive"
- **AND** inactive types MUST NOT appear in new registration forms

### Requirement: Audit Trail
Every administrative action in this module (especially base tariff changes) MUST be recorded in the Auditoría y Métricas (AM) module.

#### Scenario: Tariff Update Event
- **WHEN** the admin updates the base amount of a type
- **THEN** the system MUST emit the event `TU_UPDATE_VALUE` with the percentage variation

#### Scenario: Create Event
- **WHEN** a new type is created
- **THEN** the system MUST emit the event `TU_CREATE`
- **AND** the number of affected units and the total impact on theoretical collection MUST feed the Operational Dashboard
