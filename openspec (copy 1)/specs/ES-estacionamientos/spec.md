# ES-estacionamientos Specification

## Purpose
Gestionar el inventario de plazas de parking, su ubicación técnica y su vinculación jerárquica con las unidades habitacionales o comerciales.

## Requirements

### Requirement: Hierarchical Linking (Granularidad)
The system MUST provide a granular selector to link a parking spot with a specific unit.
- **Scenario**: Cascading Selection
  - **WHEN** linking a unit
  - **THEN** the user MUST select Macro-Sector -> Micro-Sector -> Unit in sequence.

### Requirement: Location Detail
The system MUST allow a free-text field for detailed location descriptions.
- **Scenario**: Specificity
  - **THEN** the admin MUST be able to write descriptions like "Sub-1, near Pillar 15".

### Requirement: Status Tracking
The system MUST display the status (Occupied/Free) based on whether a unit is linked.

### Requirement: High Density Visualization
The inventory MUST be displayed in a searchable and filterable table to handle large quantities of records.
- **Scenario**: Advanced Filtering
  - **THEN** the user MUST be able to filter by Macro-Sector ID and Status.
