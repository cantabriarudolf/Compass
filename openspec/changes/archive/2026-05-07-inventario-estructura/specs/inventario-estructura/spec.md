## ADDED Requirements

### Requirement: Flexible Hierarchy
The system MUST support a 3-level hierarchy (Macro-Sector > Micro-Sector > Unit) where the Micro-Sector level MUST be optional.

#### Scenario: Vertical Condo
- **WHEN** the admin configures a "Torre"
- **THEN** they MUST be able to add "Pisos" and then "Deptos".

#### Scenario: Horizontal Condo
- **WHEN** the admin configures a "Manzana"
- **THEN** they MUST be able to add "Casas" directly, skipping the "Piso" level.

### Requirement: Customizable Labels
The UI MUST display labels according to the configuration of each Macro-Sector.

#### Scenario: Display Labels
- **WHEN** viewing a unit in "Torre A"
- **THEN** the labels "Torre", "Piso" and "Depto" MUST be used in the forms and headers.

### Requirement: Unit Integrity
The combination of Macro-Sector, Micro-Sector, and Unit Number MUST be unique.

#### Scenario: Duplicate Prevention
- **WHEN** trying to create "Depto 101" in "Piso 1" of "Torre A" which already exists
- **THEN** the system MUST prevent the creation and show an error.

### Requirement: Mandatory Template Association
Every Unit MUST be associated with a "Tipo de Unidad" (TU) template before creation.

#### Scenario: Template Selection
- **WHEN** creating a Unit
- **THEN** the system MUST allow the user to select a pre-defined template to inherit basic attributes (m2, monto GC).

### Requirement: Scalable Macro-Sector Navigation
The UI MUST handle an arbitrary number of Macro-Sectors without breaking the layout.

#### Scenario: Many Towers Navigation
- **WHEN** there are more towers than the screen width can display
- **THEN** the navigation tabs MUST be scrollable or use a selector that prevents horizontal overflow.
