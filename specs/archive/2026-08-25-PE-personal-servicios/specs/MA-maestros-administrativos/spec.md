# MA-maestros-administrativos (delta del change PE-personal-servicios)

## MODIFIED Requirements

### Requirement: Maestros Previsionales y Legales (PL)
Los Maestros Administrativos MUST gestionar las colecciones `afp` (nombre, tasa), `salud` (Fonasa tasa fija / Isapre con valor UF o %) y `asignacionFamiliar` (tramos por carga con monto), con patrón repository (`saveMaestroLegal`/`removeMaestroLegal` retornando `StoreResult` o su equivalente `saveMaestro`/`removeMaestro` sobre esas claves), validación referencial al eliminar (bloqueadas mientras fichas PE las referencien) y seed por defecto cargable que incluye los tramos vigentes de asignación familiar.

#### Scenario: CRUD con Patrón Repository
- **WHEN** la administración crea, edita o elimina un registro de AFP, salud o tramo de asignación familiar
- **THEN** la operación pasa por acciones del store con validación referencial
- **AND** las fichas de trabajadores (PE) referencian estas colecciones por id, nunca por texto libre

#### Scenario: Seed Inicial
- **WHEN** se ejecuta la carga técnica de seeds ordenada por Rank
- **THEN** las tres colecciones se siembran con registros por defecto (AFP principales, Fonasa/Isapre genérica, tramos vigentes de asignación familiar)
- **AND** su carga genera eventos AM conforme al orden canónico definido en ST

#### Scenario: Tramo de asignación familiar en uso no eliminable
- **WHEN** se intenta eliminar un tramo referenciado por una ficha de trabajador con cargas
- **THEN** la acción retorna `{ok:false}` citando las fichas asociadas

## ADDED Requirements

### Requirement: Maestros Operativos de Personal (PE)
El sistema SHALL mantener los maestros operativos que normalizan la bitácora de conserjería: `jornadas` (Mañana/Tarde/Noche, usado por visitas, contratistas y cierre de turno), `couriers` (empresas de encomiendas/delivery para evitar escritura libre) y `contratistas` (empresas concurrentes o servicios autorizados), sembrados con los valores NSGC base, gestionados con el patrón repository existente (`saveMaestro`/`removeMaestro`) y consumidos por PE mediante id. `removeMaestro` SHALL bloquear la eliminación de jornadas, couriers o contratistas en uso por registros operativos.

#### Scenario: Courier normalizado en encomiendas
- **WHEN** se registra una encomienda seleccionando un courier del maestro
- **THEN** la encomienda guarda el id del maestro y el catálogo crece sin cambios de código

#### Scenario: Contratista en uso no eliminable
- **WHEN** se intenta eliminar un contratista con ingresos registrados en la bitácora
- **THEN** retorna `{ok:false}` citando los registros asociados

#### Scenario: Jornada del maestro en cierre de turno
- **WHEN** el conserje reporta el cierre indicando una jornada del maestro
- **THEN** el checklist de instalaciones se genera según esa jornada reportada
