## ADDED Requirements

### Requirement: Plantilla Penta con Dependencias de Carga y Seed (ST)

Toda spec nueva o modificada SHALL incluir, inmediatamente antes de la sección final `Integración con Auditoría y Métricas (AM)`, la sección `Dependencias de Carga y Seed (ST)` con los campos `Entidades ST`, `Depende de`, `Load Order Rank`, `Seed Manifest`, `Validación Referencial`, `Carga Bulk` y `Migración`. La plantilla Prisma pasa de 3 a 5 bloques obligatorios: `1. Contexto | 2. Funcionalidades | 3. Reglas de Negocio | 4. Dependencias de Carga y Seed (ST) | 5. Integración con Auditoría y Métricas (AM)`.

#### Scenario: Spec sin sección de Dependencias
- **WHEN** una spec se crea o modifica sin la sección `Dependencias de Carga y Seed (ST)` con los 7 campos
- **THEN** la spec se considera incompleta y debe completarse antes de aceptarse.

#### Scenario: Spec con Dependencias incompletas
- **WHEN** la sección `Dependencias` omite `Entidades ST`, `Depende de` o `Load Order Rank`
- **THEN** la validación `openspec validate` falla hasta completar los campos.

### Requirement: Validación Referencial en Escritura

Todo `save*` del store SHALL validar que sus FKs existan antes de hacer `upsert`, devolviendo `StoreResult { ok:false, error }` con mensaje específico si falta el destino. `remove*` ya valida al borrar `ST-capa-datos-persistente:58`; esta regla extiende el contrato a la escritura.

#### Scenario: Guardado con FK inexistente
- **WHEN** se invoca `saveUnidad` con `tipoUnidadId` que no existe en `tiposUnidad`
- **THEN** la operación es rechazada con `error: "tipoUnidadId no existe"`
- **AND** el estado no se muta.

#### Scenario: Guardado con FK array parcialmente huérfano
- **WHEN** se invoca `savePersona` con `condicionesEspecialesIds` que contiene un id no presente en `maestros.condicionesEspeciales`
- **THEN** la operación es rechazada indicando el id huérfano.

### Requirement: Carga Ordenada y No Silenciosa

El sistema SHALL proveer funciones `validateSeedOrder(manifest)` y `seedBulkLoad(manifest)` que verifiquen DAG acíclico, que cada FK apunte a un `rank` menor y que carguen por `rank asc` reportando `SeedValidationReport { ok, errores[]: {coleccion, id, campoFK, motivo} }`. La carga bulk SHALL ser transaccional por colección y SHALL abortar el rank con reporte si un FK falla, nunca silenciosa.

#### Scenario: Carga bulk con orden invertido
- **WHEN** el manifest declara `vinculos` rank 3 antes que `personas` rank 1
- **THEN** `validateSeedOrder` reporta ciclo/rank violation y `seedBulkLoad` no persiste vinculos huérfanos.

#### Scenario: Carga bulk con FK dangling
- **WHEN** un `unidad.tipoUnidadId` no existe en `tiposUnidad` del seed
- **THEN** `seedBulkLoad` retorna `ok:false` con `errores` detallando `coleccion:unidades, id, campoFK:tipoUnidadId`
- **AND** la colección queda sin mutar.

### Requirement: Terminología Comunidad (RG §4)

El término oficial es `comunidad`; `condominio` está en desuso y SHALL NOT introducirse en ningún artefacto nuevo (spec, proposal, design, tasks, manual, código, UI).

#### Scenario: Uso de término en desuso
- **WHEN** un artefacto del change contiene `condominio`
- **THEN** debe reemplazarse por `comunidad` antes de integrar.
