## ADDED Requirements

### Requirement: Dependencias de Carga y Seed (ST) - MA como raíz Rank 0

MA es raíz `rank 0` sin `dependsOn`. Entidades `MaestroCollections` `k0mp4ss_fe/apps/web/lib/store.ts:57` viven en `0=MA`: `maestros.*` (14 colecciones). Seed dual: `data/maestros.ts:6` (`categoriasMacro/Micro/Unidad`, `estadosOcupacion`) + `data/admin/maestros.ts:12` (`afps, previsionesSalud, mutualesCajas, feriados, bancos, indicesAjuste, cajasFondos, categoriasInsumos, unidadesMedida, contactosEmergencia, condicionesEspeciales`) + `data/comunidad/vinculos.ts:7` (`estadosInmobiliarios`). `saveMaestro/removeMaestro` `k0mp4ss_fe/apps/web/lib/store.ts:342` son único mutador. `removeMaestro` ya valida inverso por `ST:64`; `saveMaestro` SHALL ser idempotente via `upsert`.

#### Scenario: Seed MA incompleto
- **WHEN** `MaestroCollections` gana nueva colección sin seed ni bump `STORE_VERSION`
- **THEN** `validateSeedOrder` falla y `migrate` debe hacer `mergeById`.

#### Scenario: Carga TU/EF sin MA previa
- **WHEN** QA intenta cargar `tiposUnidad` antes que `maestros.categoriasUnidad`
- **THEN** `saveTipo` debe fallar si se añade validación FK, o al menos `validateSeedOrder` lo reporta.

### Requirement: Eventos AM de Carga de Maestros

Cada `saveMaestro/removeMaestro` SHALL emitir `MA_MAESTRO_CREATE/UPDATE/DELETE` `openspec/specs/AM-auditoria-metricas/spec.md:33` y la carga bulk SHALL emitir `MA_SEED_LOADED {coleccion, count}`.

#### Scenario: Bulk MA auditado
- **WHEN** `seedBulkLoad` carga `maestros.estadosOcupacion` (5 registros)
- **THEN** `AM` registra `MA_SEED_LOADED` con `valorCuantificable:5`.
