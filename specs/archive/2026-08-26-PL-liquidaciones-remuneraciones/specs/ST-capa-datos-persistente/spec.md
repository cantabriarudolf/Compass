# ST-capa-datos-persistente (delta del change PL-liquidaciones-remuneraciones)

## MODIFIED Requirements

### Requirement: Manifest de Seeds y Orden Canónico por Rank

El sistema SHALL mantener un manifest de seeds que declare para cada colección `colección ST -> seedFile -> tipo (colección|singleton|vistaDerivada) -> dependsOn -> loadOrder Rank -> count`. El orden canónico es `0=CF/MA`, `1=TU/MP`, `2=EF(macro->micro->unidad)`, `3=VU`, `4=FI/PE/IR/IN`, `5=RA/GE/MT`, `6=CT/PL`, `99=RE/AM`. Toda página que cargue bulk SHALL iterar por rank asc.

#### Scenario: Manifest completo para core

| Rank | Colección ST | Seed File | Depende de | Count |
|------|--------------|-----------|------------|-------|
| 0 | `configuracion` | `data/admin/configuracion.ts:49 configuracionDefault` | — | 1 singleton |
| 0 | `maestros.* (14)` | `data/maestros.ts` (categorias/estados) + `data/admin/maestros.ts` (10) + `data/comunidad/vinculos.ts:7 ESTADOS_INMOBILIARIOS` | — | 14 colecciones |
| 1 | `tiposUnidad` | `data/inventario/estructura.ts:50 tiposUnidad` | `maestros.categoriasUnidad` | 5 |
| 1 | `personas` | `data/comunidad/personas.ts:50 personas` | `maestros.condicionesEspeciales` | 54 |
| 2 | `macroSectores` | `data/inventario/estructura.ts:107 macroSectores` | `maestros.categoriasMacro` | 7 |
| 2 | `microSectores` | `data/inventario/estructura.ts:117 microSectores` | `macroSectores + maestros.categoriasMicro` | 23 |
| 2 | `unidades` | `data/inventario/estructura.ts:135 unidades` (83 `u-E-*` + 86 deptos/locales) | `microSectores + tiposUnidad + maestros.estadosOcupacion` | 166 |
| 3 | `vinculos` | `data/comunidad/vinculos.ts:30 vinculos` | `personas + unidades + maestros.estadosInmobiliarios` | 55 |

- **WHEN** `validateSeedOrder` recorre el manifest
- **THEN** verifica DAG acíclico y que cada FK target rank < source rank y que cada id FK existe en colección de rank menor
- **AND** retorna `SeedValidationReport`.

#### Scenario: Colección sin rank declarado
- **WHEN** una spec nueva añade `CompassData.nuevaColeccion` sin rank en manifest
- **THEN** la validación falla hasta asignar rank.

### Requirement: Evolución Versionada y Limpieza Legacy

Cada spec que agrega colección SHALL exigir bump de `STORE_VERSION` y `migrate` que haga `mergeById` del seed nuevo y limpie keys legacy. Ejemplo canónico `migrate v8:462` que limpia `estacionamientos` y `ubicacionesEstacionamiento` legacy `k0mp4ss_fe/apps/web/lib/store.ts:485`.

#### Scenario: Nueva colección sin migrate
- **WHEN** `CompassData` crece sin bump `STORE_VERSION` ni `migrate`
- **THEN** usuarios con persist previo quedan sin la colección hasta limpiar `localStorage`.

## ADDED Requirements

### Requirement: Colecciones de remuneraciones de PL en el store

El sistema SHALL incluir en `CompassData` las colecciones `liquidacionesPL` (snapshot inmutable de líneas calculadas, totales de control y referencias a FI/proyección PE) y `adelantosPL` (monto con glosa obligatoria, folio ADE, ciclo pendiente→descontado), gestionadas mediante acciones repository que retornan `StoreResult`. PL ocupa el rank 6 del manifest canónico (`6=CT/PL`) dependiendo de MP/PE (1/4), MA (0), CF (0) y FI (4). El bump de versión SHALL ser 22 → 23 con migrate aditivo (colecciones vacías). La extensión de `ExtensionLaboralSchema.sueldoBase` y los parámetros legales de CF SHALL ser opcionales para no invalidar stores persistidos.

#### Scenario: Escritura valida FKs del trabajador

- **WHEN** `generarLiquidacionPL` recibe un trabajador sin ficha laboral o con FK legal huérfana
- **THEN** retorna `{ok:false}` citando la causa y no muta `liquidacionesPL`

#### Scenario: Migración aditiva v22→v23

- **WHEN** un store persistido en versión 22 se rehidrata
- **THEN** `liquidacionesPL` y `adelantosPL` quedan disponibles vacías y ningún dato previo cambia

### Requirement: Auditoría CF_UPDATE_PARAM de parámetros legales

`saveConfiguracion` SHALL emitir el evento `CF_UPDATE_PARAM` cuando cambien los parámetros legales de remuneraciones (`ufMensual`, `ingresoMinimoMensual`, `topeGratificacionLegal`, `tasaSIS`), incluyendo old/new conforme a `CF-configuracion-global`.

#### Scenario: Cambio de UF mensual auditado

- **WHEN** la administración actualiza `ufMensual` y guarda la configuración
- **THEN** AM registra `CF_UPDATE_PARAM` con el valor anterior y nuevo
