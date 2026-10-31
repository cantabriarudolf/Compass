## MODIFIED Requirements

### Requirement: Acceso mediante acciones CRUD centralizadas
El sistema SHALL exponer acciones CRUD por entidad (crear, actualizar, eliminar, toggle de activo) como único mecanismo de mutación del estado. Las páginas NO SHALL mutar el estado directamente. Desde el change `store-cleanup` el store legacy `@deprecated` SHALL exponer únicamente los miembros con consumidores vivos (app, QA-Lab, otra acción del store o e2e): las acciones cuyo censo por miembro no registre ningún consumidor SHALL eliminarse de la interface `CompassStore` y de su implementación. La poda NO SHALL alterar el shape persistido: `STORE_VERSION` permanece en 28, los campos de `CompassData` no se tocan y `partialize`, `migrate` y `ESQUEMAS_COLECCION` quedan intactos.

#### Scenario: Edición de una entidad
- **WHEN** una página invoca la acción de actualizar una entidad
- **THEN** el estado global se actualiza y todas las vistas suscritas al store reflejan el cambio.

#### Scenario: Eliminación de una entidad sin vínculos
- **WHEN** se elimina una entidad sin dependencias asociadas
- **THEN** la entidad se remueve del estado y la persistencia se actualiza.

#### Scenario: Acción sin consumidores eliminada del store
- **WHEN** el censo por miembro de `CompassStore` no registra ningún consumidor (app, QA-Lab, otra acción del store ni e2e) para una acción `@deprecated`
- **THEN** la acción se elimina de la interface `CompassStore` y de su implementación, junto con sus tests dedicados
- **AND** `STORE_VERSION` permanece en 28 y ningún campo de `CompassData` cambia.

### Requirement: Colecciones de remuneraciones de PL en el store
El sistema SHALL incluir en `CompassData` las colecciones `liquidacionesPL` (snapshot inmutable de líneas calculadas, totales de control y referencias a FI/proyección PE) y `adelantosPL` (monto con glosa obligatoria, folio ADE, ciclo pendiente→descontado), gestionadas mediante acciones repository que retornan `StoreResult`. PL ocupa el rank 6 del manifest canónico (`6=CT/PL`) dependiendo de MP/PE (1/4), MA (0), CF (0) y FI (4). El bump de versión SHALL ser 22 → 23 con migrate aditivo (colecciones vacías). La extensión de `ExtensionLaboralSchema.sueldoBase` y los parámetros legales de CF SHALL ser opcionales para no invalidar stores persistidos. Desde el change `store-cleanup` la generación, confirmación y borrado de liquidaciones ya no viven en el store (sus acciones cliente se podaron por no tener consumidores): se ejecutan server-side en `app/api/liquidaciones/**`, que valida las mismas FKs legales del trabajador contra los maestros. El store conserva las colecciones y las acciones de `adelantosPL`.

#### Scenario: Escritura valida FKs del trabajador
- **WHEN** la escritura de una liquidación (`POST`/`PUT` en `app/api/liquidaciones/**`, con la regla espejo de la ex acción de store) recibe un trabajador sin ficha laboral o con FK legal huérfana
- **THEN** la operación retorna error citando la causa y no muta `liquidacionesPL`

#### Scenario: Migración aditiva v22→v23
- **WHEN** un store persistido en versión 22 se rehidrata
- **THEN** `liquidacionesPL` y `adelantosPL` quedan disponibles vacías y ningún dato previo cambia

### Requirement: Auditoría CF_UPDATE_PARAM de parámetros legales

El sistema SHALL emitir el evento `CF_UPDATE_PARAM` cuando cambien los parámetros legales de remuneraciones (`ufMensual`, `ingresoMinimoMensual`, `topeGratificacionLegal`, `tasaSIS`), incluyendo old/new conforme a `CF-configuracion-global`. Desde `store-cleanup` la acción cliente `saveConfiguracion` (único emisor) fue podada por no tener consumidores, y la ruta server-side `app/api/configuracion/route.ts` todavía NO emite el evento: la emisión queda pendiente del lado servidor y el gap está registrado en `openspec/BACKLOG-100.md`.

#### Scenario: Cambio de UF mensual auditado

- **WHEN** la administración actualiza `ufMensual` y guarda la configuración
- **THEN** AM registra `CF_UPDATE_PARAM` con el valor anterior y nuevo
