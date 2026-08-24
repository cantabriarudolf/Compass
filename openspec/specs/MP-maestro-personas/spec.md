# MP-maestro-personas Specification

## Purpose
Establecer un registro único de identidad para todas las personas relacionadas con la comunidad, permitiendo una gestión centralizada, segura y con enfoque en la vulnerabilidad.

## Requirements

### Requirement: Unique Identity (RUT/DNI)
The system MUST use a unique identifier (RUT in Chile) to prevent duplicate records of the same person.
- **Validation**: The system SHOULD validate the RUT format and check digit.

#### Scenario: Duplicate Prevention
- **WHEN** an administrator tries to register a person with a RUT already existing
- **THEN** the system MUST reject the duplicate and show the existing record

### Requirement: Vulnerability Indicators
The person profile MUST include flags for special conditions.
- **Condition: Third Age**: Flag to identify residents over 65 years old.
- **Condition: Disability**: Flag to identify residents with reduced mobility or other disabilities.
- **Action**: These flags MUST be visible in emergency reports.

#### Scenario: Emergency Visibility
- **WHEN** a person has a vulnerability flag
- **THEN** the flag MUST be visible as an icon in listings and as a banner in the detail sheet

### Requirement: Unified Contact Data
Every person MUST have at least one primary phone and email registered.

#### Scenario: Contact Required
- **WHEN** saving a person without phone or email
- **THEN** the system MUST reject the save and highlight the missing contact field

### Requirement: Role Flexibility
A person MUST be able to hold multiple roles simultaneously (Owner, Resident, Staff).

#### Scenario: Multi-role
- **WHEN** a person is registered
- **THEN** they can be linked to one or more units with different relationship types
- **AND** each role MUST enable its specific extension panel (e.g., Datos Laborales for Staff)
