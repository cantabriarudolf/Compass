## ADDED Requirements

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
