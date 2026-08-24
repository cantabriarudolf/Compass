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

### Requirement: Asignación de Roles Específicos
The system SHALL require exactly one Role assignment for every created Link (Propietario, Arrendatario, Copropietario/Familiar, Ocupante).

#### Scenario: Valid Role Selection
- **WHEN** linking a unit
- **THEN** the Administrator must select one valid role from the predefined list

### Requirement: Privacidad Financiera Delegada
The system SHALL allow only the 'Propietario' role to define whether their financial data (Gastos Comunes) can be viewed by residents of the unit.

#### Scenario: Setting Privacy as Propietario
- **WHEN** the role "Propietario" is selected
- **THEN** the "Permite Ver Finanzas" toggle becomes visible and editable

#### Scenario: Privacy Hidden for Non-Owners
- **WHEN** the role is NOT "Propietario"
- **THEN** the "Permite Ver Finanzas" toggle is hidden

### Requirement: Trigger Inmobiliario
The system SHALL allow only the 'Propietario' role to define the Real Estate status of the unit.

#### Scenario: Setting Real Estate Status
- **WHEN** the role "Propietario" is selected
- **THEN** a dropdown appears to select "Estado Ocupación Propiedad" (habitada, proxima_vacancia, en_arriendo, arrendada, en_venta)
