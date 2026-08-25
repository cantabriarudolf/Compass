# ST-capa-datos-persistente (delta del change FI-finanzas-morosidad)

## ADDED Requirements

### Requirement: Colecciones financieras de FI en el store

El sistema SHALL incluir en `CompassData` las colecciones `fondosFI` (maestro de fondos con tipo y porcentajeAporte, sembrado con los 3 fondos NSGC), `egresosFI`, `emisionesGC` y `cobrosFI` (libro unificado de cargos con moras[], pagos[] y diferencias[] inmutables), gestionadas mediante acciones repository que retornan `StoreResult`. FI ocupa rank 4 del manifest canónico (`4=FI/PE/IR/IN`) dependiendo de CF/MA (0), TU/MP (1), EF (2) y VU (3). El bump de versión SHALL ser 20 → 21 con migrate aditivo que siembre `fondosFI` si está ausente.

#### Scenario: Store persistido v20 migra a v21

- **WHEN** un usuario con estado persistido en versión 20 abre la aplicación
- **THEN** las colecciones financieras aparecen disponibles (`fondosFI` sembrado) sin pérdida de datos previos

#### Scenario: Integridad referencial financiera

- **WHEN** se intenta eliminar un fondo con egresos o cobros imputados
- **THEN** la acción retorna `{ok:false}` y el fondo permanece
