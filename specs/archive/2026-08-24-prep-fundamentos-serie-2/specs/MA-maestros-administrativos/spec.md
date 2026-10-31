## ADDED Requirements

### Requirement: Maestros Previsionales y Legales (PL)
Los Maestros Administrativos MUST gestionar las colecciones `afp` (nombre, tasa), `salud` (Fonasa tasa fija / Isapre con valor UF o %) y `asignacionFamiliar` (tramos por carga), con patrón repository (`saveMaestroLegal`/`removeMaestroLegal` retornando `StoreResult`), validación referencial al eliminar y seed por defecto cargable.

#### Scenario: CRUD con Patrón Repository
- **WHEN** la administración crea, edita o elimina un registro de AFP, salud o tramo de asignación familiar
- **THEN** la operación pasa por acciones del store con validación referencial
- **AND** las fichas de trabajadores (PE) referencian estas colecciones por id, nunca por texto libre

#### Scenario: Seed Inicial
- **WHEN** se ejecuta la carga técnica de seeds ordenada por Rank
- **THEN** las tres colecciones se siembran con registros por defecto (AFP principales, Fonasa/Isapre genérica, tramos vigentes de asignación familiar)
- **AND** su carga genera eventos AM conforme al orden canónico definido en ST
