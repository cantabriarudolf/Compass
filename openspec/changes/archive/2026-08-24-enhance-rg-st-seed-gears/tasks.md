## 1. Engranes Transversales (RG + ST)

- [x] 1.1 Actualizar delta spec `RG-reglas-generales`: añadir Requirement `Plantilla Penta (Prisma extendida)` con sección obligatoria `Dependencias de Carga y Seed (ST)` entre Reglas y AM.
- [x] 1.2 Añadir a `RG` Requirement `Validación Referencial en Escritura` (todo `save*` SHALL validar FKs y devolver `StoreResult` con error).
- [x] 1.3 Añadir a `RG` Requirement `Carga Ordenada y No Silenciosa` (proveer `validateSeedOrder` + `seedBulkLoad` que verifica DAG acíclico y rank).
- [x] 1.4 Actualizar delta spec `ST-capa-datos-persistente`: añadir Requirement `Manifest de Seeds y Orden Canónico` con tabla Rank 0..99 y `SeedValidationReport`.
- [x] 1.5 Añadir a `ST` Requirement `Validación FK en Save (no solo Remove)` (listar checks para `saveUnidad/savePersona/saveMicro/saveTipo` etc.).
- [x] 1.6 Añadir a `ST` Requirement `Bulk Seed Transaccional e Idempotente` (upsert/mergeById, re-ejecutable, reporte por colección).
- [x] 1.7 Añadir a `ST` Requirement `Evolución Versionada y Limpieza Legacy` (bump `STORE_VERSION` + `migrate mergeById`, ejemplo v8).
- [x] 1.8 Añadir a `ST` Requirement `Auditoría de Carga (AM)` (eventos `ST_SEED_*`, `ST_MIGRATE_APPLIED`).

## 2. Engranes por Dominio (sección Dependencias en cada spec existente)

- [x] 2.1 Delta `MA-maestros-administrativos`: declarar `rank 0 raíz`, dual seed `data/maestros.ts` + `data/admin/maestros.ts` + `vinculos.ts:ESTADOS_INMOBILIARIOS`, tipo `MaestroCollections`, eventos `MA_SEED_LOADED`.
- [x] 2.2 Delta `CF-configuracion-global`: declarar `rank 0 singleton` `data/admin/configuracion.ts:49`, sin dependsOn, FK blanda para FI/PE, evento `CF_SEED_LOADED`.
- [x] 2.3 Delta `TU-tipos-unidad`: `dependsOn: MA.categoriasUnidad`, `rank 1`, seed `data/inventario/estructura.ts:tiposUnidad (5)`, validación FK `categoria exists`.
- [x] 2.4 Delta `EF-estructura-fisica`: orden interno `macro -> micro -> unidad`, `rank 2`, `dependsOn: MA.categoriasMacro/Micro + TU + estadosOcupacion`, seed counts 7/23/166, validación `microSectorId/tipoUnidadId/estadoId`.
- [x] 2.5 Delta `MP-maestro-personas`: `dependsOn: MA.condicionesEspeciales`, `rank 1` paralelo a TU, FK array `condicionesEspecialesIds subset`, seed `data/comunidad/personas.ts (54)`.
- [x] 2.6 Delta `VU-vinculacion-unidades`: `dependsOn: MP + EF.unidades + MA.estadosInmobiliarios`, `rank 3`, seed `data/comunidad/vinculos.ts (55)`, regla `cerrarAnterior`, validación `persona exists + activa + no duplicado + no solape arriendo`.
- [x] 2.7 Delta `AM-auditoria-metricas`: `rank 99 sumidero`, depende de todos, no bloquea carga, registra `ST_SEED_*`, métrica `tasa huérfanos`.

## 3. Documentación Narrativa (Historia Paralela Humana)

- [x] 3.1 Crear `Data/NSGC/docs/manuales/34 - Historia de Poblamiento - Relato de Uso.md` con estructura doble columna `Relato humano | Gear técnico | Verificación cruzada`, capítulos 0..6 narrando arrival de actores y paralelos (PE/IR/CO).
- [x] 3.2 Actualizar `Data/NSGC/docs/manuales/00-index.md` con entrada al nuevo manual 34.
- [x] 3.3 Actualizar `Data/NSGC/docs/manuales/03 - Mapa de Desarrollo y Trazabilidad.md` con estado de esta fase.

## 4. Validación

- [x] 4.1 `openspec validate --change enhance-rg-st-seed-gears --strict` sin errores.
- [x] 4.2 `grep -rn "condominio" openspec/changes/enhance-rg-st-seed-gears` solo en RG spec explicativo (norma RG §4 comunidad - uso permitido para nombrar término en desuso), 0 en código/manual nuevo.
