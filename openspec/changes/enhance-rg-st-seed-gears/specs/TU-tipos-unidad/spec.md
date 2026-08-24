## ADDED Requirements

### Requirement: Dependencias de Carga y Seed (ST) - TU Rank 1

Entidad `CompassData.tiposUnidad` `k0mp4ss_fe/apps/web/lib/store.ts:77`, seed `data/inventario/estructura.ts:50 tiposUnidad` (5 registros: tipo-a..tipo-es-1). `Depende de: [MA.categoriasUnidad]` `k0mp4ss_fe/apps/web/data/maestros.ts:25`. `Rank 1` (paralelo a `MP`). Tipo `categoriasUnidad: {id,nombre}` es FK lógica `tiposUnidad.categoria -> categoriasUnidad.nombre` y `tiposUnidad.activo` soft delete. `saveTipoUnidad` SHALL validar `categoria exists en maestros.categoriasUnidad` (cuando se añada validación `ST`). `removeTipoUnidad:189` ya valida inverso `unidades.tipoUnidadId`.

#### Scenario: Categoria huérfana en seed
- **WHEN** `tiposUnidad[0].categoria` no existe en `maestros.categoriasUnidad` del seed
- **THEN** `validateSeedOrder` retorna `error: categoria no existe` y bulk aborta `tiposUnidad`.

#### Scenario: Carga bulk ordenada
- **WHEN** `seedBulkLoad` ejecuta rank 0 MA luego rank 1 TU
- **THEN** selector `Categoría` en `TU` muestra categorías de `MA` sin hardcode.

### Requirement: Eventos AM de Carga TU

`seedBulkLoad` de `tiposUnidad` SHALL emitir `TU_SEED_LOADED` y mutaciones posteriores `TU_CREATE/TU_UPDATE_VALUE` `openspec/specs/TU-tipos-unidad/spec.md:58`.

#### Scenario: Bulk TU auditado
- **WHEN** se cargan 5 tipos
- **THEN** `AM` registra `valorCuantificable:5` y `métrica: recaudación teórica = sum(montoBase)`.
