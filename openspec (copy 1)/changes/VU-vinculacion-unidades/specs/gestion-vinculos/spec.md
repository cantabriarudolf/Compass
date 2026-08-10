## ADDED Requirements

### Requirement: CRUD de Vínculos de Unidad
The system SHALL allow an Administrator to create, view, edit, and delete links (vínculos) between a Person and a Physical Unit from within the Person's profile.

#### Scenario: Creating a new link
- **WHEN** the Administrator clicks "Vincular Unidad" in the "Unidades Vinculadas" tab
- **THEN** a form opens requesting the target Unit, Role, Start Date, and conditional privacy/real estate settings

#### Scenario: Deleting a link
- **WHEN** the Administrator removes a linked unit from a Person's profile
- **THEN** the system immediately removes the link from the view and marks it as inactive or deletes it from the person's active linkages

### Requirement: Prevención de Vínculos Duplicados
The system SHALL prevent linking the same Person to the same Physical Unit more than once concurrently.

#### Scenario: Attempting duplicate link
- **WHEN** the Administrator attempts to link a Person to a Unit they are already linked to
- **THEN** the system rejects the operation and displays an error message
