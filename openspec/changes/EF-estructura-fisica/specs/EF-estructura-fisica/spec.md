## ADDED Requirements

### Requirement: Sector Assignment on Unit Creation
When creating or editing a unit, the system MUST require explicit assignment to a valid Macro-Sector and Micro-Sector.

#### Scenario: New Unit from Any View
- **WHEN** an administrator creates a new unit
- **THEN** the unit form MUST display selectors for Macro-Sector and Micro-Sector
- **THEN** the system MUST prevent saving until a valid Micro-Sector is selected
- **THEN** the saved unit MUST be associated with the selected Micro-Sector (and therefore its Macro-Sector).

#### Scenario: Reassign Existing Unit
- **WHEN** an administrator edits an existing unit
- **THEN** the form MUST allow changing the Macro-Sector and Micro-Sector
- **THEN** the updated unit MUST reflect the new sector assignment.

### Requirement: Clear Separation Between Sector Labels and Actual Sectors
The UI MUST distinguish the labels configured in Maestros Administrativos (e.g., "Torre", "Piso") from the actual sector instances created in Estructura Física (e.g., "Torre A", "Piso 1").

#### Scenario: Creating a Sector Label
- **WHEN** an administrator adds a Macro or Micro label in Maestros Administrativos
- **THEN** the system MUST make clear that this is only a label to be used later when creating real sectors in Estructura Física.

#### Scenario: Creating a Unit Without Sectors
- **WHEN** there are no actual Macro-Sectors or Micro-Sectors in Estructura Física
- **THEN** the system MUST display guidance to create the real sectors first
- **THEN** the unit creation form MUST disable sector selection and explain why.
