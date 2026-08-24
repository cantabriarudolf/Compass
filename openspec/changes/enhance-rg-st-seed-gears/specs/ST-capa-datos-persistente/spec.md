## ADDED Requirements

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

### Requirement: Validación FK en Save (no solo Remove)

Cada `save*` SHALL validar FKs antes de `upsert`, complementando `remove*` que ya valida inverso `ST-capa-datos-persistente:58`:

- `saveMicroSector` SHALL validar `macroSectorId exists`
- `saveUnidad` SHALL validar `microSectorId exists && tipoUnidadId exists && estadoId exists en maestros.estadosOcupacion`
- `savePersona` SHALL validar `condicionesEspecialesIds subset de maestros.condicionesEspeciales`
- `saveVinculo` ya valida `ST-capa-datos-persistente:80` (persona exists, activa, no duplicado, no solape arriendo) y SHALL mantener `cerrarAnterior` para `propietario/arrendatario`
- Futuras `saveCargo/saveReserva/saveInsumo...` SHALL seguir mismo patrón

#### Scenario: saveUnidad con micro huérfano
- **WHEN** `saveUnidad({microSectorId:"no-existe"})`
- **THEN** retorna `{ok:false, error:"microSectorId no existe"}` y no muta `unidades`.

### Requirement: Bulk Seed Transaccional e Idempotente

`seedBulkLoad(manifest)` SHALL cargar por rank asc usando `upsert:115`/`mergeById:464`, ser re-ejecutable sin duplicar y acumular `errores[]` por colección. SHALL abortar el rank con error pero no corromper ranks previos. SHALL emitir eventos por colección.

#### Scenario: Re-ejecución idempotente
- **WHEN** `seedBulkLoad` se ejecuta dos veces con el mismo manifest
- **THEN** el segundo run no duplica registros y retorna `ok:true` con `count` igual.

### Requirement: Evolución Versionada y Limpieza Legacy

Cada spec que agrega colección SHALL exigir bump de `STORE_VERSION` y `migrate` que haga `mergeById` del seed nuevo y limpie keys legacy. Ejemplo canónico `migrate v8:462` que limpia `estacionamientos` y `ubicacionesEstacionamiento` legacy `k0mp4ss_fe/apps/web/lib/store.ts:485`.

#### Scenario: Nueva colección sin migrate
- **WHEN** `CompassData` crece sin bump `STORE_VERSION` ni `migrate`
- **THEN** usuarios con persist previo quedan sin la colección hasta limpiar `localStorage`.

### Requirement: Hidratación Segura como Precondición de Carga UI

Toda página que dispare `save*` en bulk SHALL esperar `hasHydrated:true` `k0mp4ss_fe/apps/web/lib/store.ts:176` via `useStoreRehydrated()`. `seedBulkLoad` invocado desde UI SHALL no-op si `hasHydrated==false`.

#### Scenario: Bulk desde UI sin hidratar
- **WHEN** QA pulsa `Cargar Todo` antes de `hasHydrated`
- **THEN** la carga se pospone y avisa `Almacenamiento aún hidratando`.

### Requirement: Auditoría de Carga (AM)

`AM` SHALL registrar `ST_SEED_STARTED`, `ST_SEED_COLLECTION_LOADED {coleccion, count, rank, duration}`, `ST_SEED_VALIDATION_FAILED {errores}`, `ST_MIGRATE_APPLIED {fromVersion, toVersion}` como eventos inmutables. `RE` SHALL mostrar `tasa huérfanos = dangling FK / total` (0 esperado post-carga).

#### Scenario: Carga bulk auditada
- **WHEN** `seedBulkLoad` termina
- **THEN** `AM` contiene un evento por colección cargada con `valorCuantificable:count`.
