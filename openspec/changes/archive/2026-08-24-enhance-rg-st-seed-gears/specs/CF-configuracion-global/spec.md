## ADDED Requirements

### Requirement: Dependencias de Carga y Seed (ST) - CF Singleton Rank 0

Entidad `CompassData.configuracion` singleton `k0mp4ss_fe/apps/web/lib/store.ts:83`, seed `data/admin/configuracion.ts:49 configuracionDefault` (1 registro). `Rank 0` raíz sin `dependsOn` (paralelo a `MA`). `saveConfiguracion:397` persiste `ConfiguracionGlobal` y SHALL validar rangos `diaCortePago 1-31`, `diasMesComercial 28-31`, `jornadaSemanalEstandar 35-48` `CF-configuracion-global:41,81`. `configuracion` es FK blanda para `FI.modoCalculoGC` (`fijo|variable`) y `PE.jornada/CF.claveEliminacionMaestro`.

#### Scenario: CF sin carga bloquea FI/PE
- **WHEN** `FI` intenta `emisión GC` con `configuracion.modoCalculoGC` undefined
- **THEN** validación `ST` reporta `CF no cargado` y `FI_SEED_VALIDATION_FAILED`.

#### Scenario: Validación rangos en save
- **WHEN** `saveConfiguracion({diaCortePago:99})`
- **THEN** retorna validación `rango 1-31`.

### Requirement: Eventos AM de Carga CF

Bulk/singleton `configuracion` SHALL emitir `CF_SEED_LOADED` y mutaciones `CF_UPDATE_PARAM` con old/new `CF-configuracion-global:100`.

#### Scenario: Bulk CF auditado
- **WHEN** se siembra `configuracion`
- **THEN** `AM` registra `CF_SEED_LOADED` con `valorCuantificable:1`.
