## ADDED Requirements

### Requirement: Dependencias de Carga y Seed (ST) - EF Rank 2 con orden interno

Entidades `CompassData.macroSectores, microSectores, unidades` `k0mp4ss_fe/apps/web/lib/store.ts:78`. Seed `data/inventario/estructura.ts:107 macroSectores (7), :117 microSectores (23), :135 unidades (166 inc 83 u-E-* + 3 u-LC-*)`. `Depende de: [MA.categoriasMacro, MA.categoriasMicro, MA.estadosOcupacion, TU.tiposUnidad]`. `Rank 2`. Orden interno obligatorio: `macroSectores -> microSectores -> unidades`. `unidades` depende de `microSectores.id`, `tiposUnidadId`, `maestros.estadosOcupacion.id`. `saveMacroSector:202`, `saveMicroSector:221`, `saveUnidad:241` SHALL validar FKs respectivas antes de upsert. `remove*` ya valida inverso `ST:60`.

#### Scenario: Micro con macro huérfano
- **WHEN** `saveMicroSector({macroSectorId:"no-existe"})`
- **THEN** retorna `{ok:false, error:"macroSectorId no existe"}`.

#### Scenario: Unidad con tipo huérfano
- **WHEN** `saveUnidad({tipoUnidadId:"no-existe"})`
- **THEN** retorna `{ok:false}` y no se persiste.

#### Scenario: Carga bulk respeta orden interno
- **WHEN** `seedBulkLoad` carga EF
- **THEN** itera `macroSectores` antes que `microSectores` antes que `unidades`; si invierte, `validateSeedOrder` reporta rank interno violation.

### Requirement: Dona de distribución y color desde MA

`estadosOcupacion.hex` `data/maestros.ts:36` SHALL alimentar `EF` dona `Data/NSGC/docs/manuales/02 - Estructura Física.md:32`. Estado nuevo creado en `MA` SHALL renderizar con color, no gris `ST-capa-datos-persistente:42`.

#### Scenario: Estado nuevo con hex
- **WHEN** QA crea `TEST-EdO-EnLimpieza` en `MA` con `hex:#ef4444`
- **THEN** dona de `EF` muestra segmento rojo sin cambio de código.

### Requirement: Eventos AM de Carga EF

Bulk de `macroSectores/microSectores/unidades` SHALL emitir `EF_SEED_LOADED` y mutaciones `EF_CREATE_UNIT` etc `Data/NSGC/docs/especificaciones/EF - Estructura Fisica.md:53`.

#### Scenario: Bulk EF auditado
- **WHEN** se cargan 166 unidades
- **THEN** `AM` registra `valorCuantificable:166` y `métrica: ratio ocupación = ocupadas/total`.
