## ADDED Requirements

### Requirement: Dependencias de Carga y Seed (ST) - AM Sumidero Rank 99

`AM` es sumidero `rank 99` depende de todos, no bloquea carga. `AM` SHALL registrar eventos de carga `ST_SEED_STARTED`, `ST_SEED_COLLECTION_LOADED {coleccion, count, rank, duration}`, `ST_SEED_VALIDATION_FAILED {errores}`, `ST_MIGRATE_APPLIED {fromVersion, toVersion}` además del catálogo por módulo `AM-auditoria-metricas:22` (`FI_EMISION_GC`, `MA_MAESTRO_CREATE`, `CF_UPDATE_PARAM`, `RP_ROLE_ASSIGNED`, etc). Logs `AM:80` son inmutables y retención 5 años. `AM` SHALL exponer métrica `tasa huérfanos = registros con FK dangling / total` (0 esperado post-carga) y dashboard `AM:60` con eficiencia operativa.

#### Scenario: Tasa huérfanos post-bulk
- **WHEN** `seedBulkLoad` termina con `errores[]` no vacío
- **THEN** `AM` métrica `tasa huérfanos >0` y `ST_SEED_VALIDATION_FAILED` queda registrado.

#### Scenario: Bulk sin auditoría es incompleto
- **WHEN** carga bulk no emite `ST_SEED_COLLECTION_LOADED`
- **THEN** se considera incumplida `RG-reglas-generales:7` trazabilidad universal.

### Requirement: Panel de Incumplimientos como validador post-carga

`AM` panel `AM-auditoria-metricas:45` SHALL usar `tasa huérfanos` y estados huérfanos (visitas ghost, turnos no cerrados `AM:47`) como validación post-carga QA.

#### Scenario: Validación post-carga QA
- **WHEN** QA pulsa `Validar` tras `Cargar Todo`
- **THEN** `AM` lista `huérfanos` y `tareas ghost` si los hay.
