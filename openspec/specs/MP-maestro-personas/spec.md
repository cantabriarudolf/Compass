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

### Requirement: Dependencias de Carga y Seed (ST) - MP Rank 1 paralelo a TU

Entidad `CompassData.personas` `k0mp4ss_fe/apps/web/lib/store.ts:81`, seed `data/comunidad/personas.ts:50 personas` (54 registros). `Depende de: [MA.condicionesEspeciales]` `k0mp4ss_fe/apps/web/data/admin/maestros.ts:159` (5 condiciones). Campo `persona.condicionesEspecialesIds?: string[]` es FK array subset de `maestros.condicionesEspeciales.id`. `Rank 1` paralelo a `TU` (ambos rank 1, sin orden entre ellos, pero ambos antes de `EF:2` y `VU:3`). `savePersona:259` SHALL validar `condicionesEspecialesIds` subset. `removePersona:264` ya valida inverso `vinculos.personaId`.

#### Scenario: Condición huérfana
- **WHEN** `savePersona({condicionesEspecialesIds:["no-existe"]})`
- **THEN** retorna `{ok:false, error:"condicionEspecial no existe"}`.

#### Scenario: Carga MP sin MA
- **WHEN** bulk carga `personas` antes que `maestros.condicionesEspeciales`
- **THEN** `validateSeedOrder` reporta FK array dangling.

### Requirement: Extensiones por Rol y FK a MA/RP

`Persona` base `MP-maestro-personas:22` se extiende por rol `PE(personal): MA.afps/previsiones/mutuales/bancos + CF.jornada` y `GD(directiva)`. Seed `personas` incluye `roles` enum FK blanda a `RP-roles-permisos:22`. Carga de extensiones SHALL esperar `MP` cargada.

#### Scenario: Persona con extensión laboral
- **WHEN** `persona.roles incluye personal` y falta `MA.afps`
- **THEN** validación de extensión laboral falla hasta cargar `MA`.

### Requirement: Eventos AM de Carga MP

Bulk `personas` SHALL emitir `MP_SEED_LOADED` y mutaciones `MP_CREATE/MP_UPDATE_DATA` `Data/NSGC/docs/especificaciones/MP - Maestro de Personas.md:74`.

#### Scenario: Bulk MP auditado
- **WHEN** se cargan 54 personas
- **THEN** `AM` registra `valorCuantificable:54`.
