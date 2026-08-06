# MP-maestro-personas Specification

## Purpose
Establecer un registro único de identidad para todas las personas relacionadas con el condominio, permitiendo una gestión centralizada, segura y con enfoque en la vulnerabilidad.

## Requirements

### Requirement: Unique Identity (RUT/DNI)
The system MUST use a unique identifier (RUT in Chile) to prevent duplicate records of the same person.
- **Validation**: The system SHOULD validate the RUT format and check digit.

### Requirement: Vulnerability Indicators
The person profile MUST include flags for special conditions.
- **Condition: Third Age**: Flag to identify residents over 65 years old.
- **Condition: Disability**: Flag to identify residents with reduced mobility or other disabilities.
- **Action**: These flags MUST be visible in emergency reports.

### Requirement: Unified Contact Data
Every person MUST have at least one primary phone and email registered.

### Requirement: Role Flexibility
A person MUST be able to hold multiple roles simultaneously (Owner, Resident, Staff).
- **Scenario**: Multi-role
  - **WHEN** a person is registered
  - **THEN** they can be linked to one or more units with different relationship types.
