# ST-capa-datos-persistente (delta del change RE-reporteria-dashboards)

## MODIFIED Requirements

### Requirement: Manifest de Seeds y Orden Canónico por Rank

El sistema SHALL mantener un manifest de seeds que declare para cada colección `colección ST -> seedFile -> tipo (colección|singleton|vistaDerivada) -> dependsOn -> loadOrder Rank -> count`. El orden canónico es `0=CF/MA`, `1=TU/MP`, `2=EF(macro->micro->unidad)`, `3=VU`, `4=FI/PE/IR/IN`, `5=RA/GE/MT`, `6=CT/PL`, `99=RE/AM`. Toda página que cargue bulk SHALL iterar por rank asc. `reportesRE` ocupa el rank 99 como sumidero reportería junto a AM.

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

## ADDED Requirements

### Requirement: Colección de reportería RE en el store

El sistema SHALL incluir en `CompassData` la colección `reportesRE` (título, bloques snapshot inmutables, segmento declarado EF+MP+tenencia, destinatarios resueltos y contador de distribución), gestionada mediante acciones repository que retornan `StoreResult`. RE ocupa el rank 99 del manifest canónico (`99=RE/AM`) como sumidero dependiente de todos los módulos. El bump de versión SHALL ser 24 → 25 con migrate aditivo (colección vacía).

#### Scenario: Escritura valida segmento

- **WHEN** `generarReporteRE` recibe un segmento con macro/micro/unidad inexistente
- **THEN** retorna `{ok:false}` citando la FK huérfana y no muta `reportesRE`

#### Scenario: Rehidratación v24→v25

- **WHEN** un store persistido en versión 24 se rehidrata
- **THEN** `reportesRE` queda disponible vacía y ningún dato previo cambia
