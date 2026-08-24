## Why

El sistema ya tiene un DAG real de dependencias `Data/NSGC/docs/especificaciones/ST - Capa de Datos Persistente.md:40` y `k0mp4ss_fe/apps/web/lib/store.ts:57` (`MA/CF -> TU/MP -> EF -> VU -> FI/PE/IR... -> CT/RE`), pero ninguna spec lo declara. `RG-reglas-generales/spec.md:27` define plantilla Prisma de 3 secciones sin cláusula `Dependencias de Carga` y `ST-capa-datos-persistente/spec.md:58` solo valida al borrar, no al guardar. Eso permite que la hoja de ruta de carga (`MA -> TU -> EF -> MP -> VU`) falle silenciosa si se invierte el orden (FK dangling, dona gris, `saveVinculo` falla sin causa raíz visible).

Falta además el relato humano que explica el poblamiento como historia paralela de actores (admin funda, comunidad llega, conserje/bodeguero/vecino operan en paralelo con dependencias de `Maestros`). Esa documentación es la fuente de verdad para quien usa el programa, no para la IA.

## What Changes

* **Engranes transversales:** Extender `RG` (plantilla Prisma -> Penta + validación referencial en escritura + carga ordenada no silenciosa) y `ST` (manifest de seeds, orden canónico por `rank`, validación FK en `save*`, bulk seed transaccional idempotente, migración versionada, auditoría de carga).
* **Engranes por dominio:** Añadir sección `Dependencias de Carga y Seed (ST)` a `MA`, `TU`, `EF`, `MP`, `VU`, `CF`, `AM` con `Entidades ST`, `Depende de`, `Load Order Rank`, `Seed Manifest`, `Validación Referencial` y `Eventos AM de Carga`.
* **Documentación narrativa:** Crear `Data/NSGC/docs/manuales/34 - Historia de Poblamiento - Relato de Uso.md` con doble columna `Relato humano | Gear técnico | Verificación cruzada`, narrando arrival de actores en paralelo y dependencias de `Maestros`.

## Capabilities

### Modified Capabilities
- `RG-reglas-generales`: plantilla Penta, declaración obligatoria de dependencias, validación referencial en escritura, carga ordenada no silenciosa
- `ST-capa-datos-persistente`: manifest de seeds, orden canónico por rank, validación FK en save, bulk seed transaccional idempotente, migración y auditoría de carga
- `MA-maestros-administrativos`: declarar rank 0 y seed files duales, dep de nada, eventos de carga
- `TU-tipos-unidad`: declarar depende de MA.categoriasUnidad rank 1
- `EF-estructura-fisica`: orden interno macro->micro->unidad, depende de MA+TU, rank 2, validación FK
- `MP-maestro-personas`: depende de MA.condicionesEspeciales rank 1 paralelo a TU, FK array
- `VU-vinculacion-unidades`: depende de MP+EF+MA.estadosInmobiliarios rank 3, cierre automático tramo
- `CF-configuracion-global`: singleton rank 0, FK blanda para FI/PE
- `AM-auditoria-metricas`: sumidero rank 99, eventos ST_SEED_* y tasa huérfanos

## Impact

* `openspec/specs/RG-reglas-generales/spec.md` y `openspec/specs/ST-capa-datos-persistente/spec.md` - nuevos requirements canónicos
* `openspec/specs/MA-maestros-administrativos/spec.md`, `TU-tipos-unidad/spec.md`, `EF-estructura-fisica/spec.md`, `MP-maestro-personas/spec.md`, `VU-vinculacion-unidades/spec.md`, `CF-configuracion-global/spec.md`, `AM-auditoria-metricas/spec.md` - sección Dependencias
* `Data/NSGC/docs/manuales/34 - Historia de Poblamiento - Relato de Uso.md` - nuevo manual narrativo
* `Data/NSGC/docs/manuales/00-index.md` y `Data/NSGC/docs/manuales/03 - Mapa de Desarrollo y Trazabilidad.md` - índice/trazabilidad
* Futuro: `k0mp4ss_fe/apps/web/lib/store.ts` expondrá `validateSeedOrder`/`seedBulkLoad`/`SeedValidationReport` y `save*` validarán FKs (implementación en change siguiente `qa-lab`)
