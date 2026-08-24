## Context

Estado actual: `STORE_VERSION=8` `k0mp4ss_fe/apps/web/lib/store.ts:55`, persist `compass-store`, `migrate` con `mergeById` y limpieza legacy `k0mp4ss_fe/apps/web/lib/store.ts:462`. Datos vivos: `CompassData {tiposUnidad, macroSectores, microSectores, unidades, personas, vinculos, configuracion, maestros(14)}` sembrado desde `k0mp4ss_fe/apps/web/data/inventario/estructura.ts:50`, `k0mp4ss_fe/apps/web/data/comunidad/personas.ts:50`, `k0mp4ss_fe/apps/web/data/maestros.ts:6`, `k0mp4ss_fe/apps/web/data/admin/maestros.ts:12`. Validación solo en `remove*` y `saveVinculo` `k0mp4ss_fe/apps/web/lib/store.ts:279`. Sin manifest, sin rank, sin validación FK en `saveUnidad/savePersona/saveMicro`. Docs `Data/NSGC/docs/especificaciones/ST - Capa de Datos Persistente.md:18` y `RG - Reglas Generales.md:27` no exigen declarar dependencias. Dev-dashboard `k0mp4ss_fe/apps/web/app/admin/dev-dashboard/page.tsx:128` ya permite export/import pero sin orden.

## Goals / Non-Goals

**Goals:**
- Toda spec existente y futura declare `Entidades ST | Depende de | Rank | Seed Manifest | Validación | Eventos AM` como contrato auditable.
- Carga ordenada falle loud con `SeedValidationReport`, no silenciosa.
- Relato humano de poblamiento quede como fuente de verdad paralela al DAG.

**Non-Goals:**
- Implementar `FI/PE/IR/RA` collections ahora (solo dejar el patrón list para que futuras specs lo copien).
- Implementar UI del Laboratorio QA (`/admin/qa-lab`) en este change (siguiente change `qa-lab`).

## Decisions

- **Rank fijo 0..99:** `0=CF/MA`, `1=TU/MP`, `2=EF(macro->micro->unidad)`, `3=VU`, `4=FI/PE/IR/IN`, `5=RA/GE/MT`, `6=CT/PL`, `99=RE/AM`. Elegido porque refleja `migrate v8:462` y evita ciclo. Alternativa de usar `dependsOn` libre sin rank fue descartada por difícil validación.
- **Validación FK en `save*`:** Reusar patrón `saveVinculo:280` para todos los `save*`. Retorna `StoreResult {ok:false, error}`. No lanzar excepción. Mantiene compat con `ST:58` que ya valida `remove`.
- **Bulk seed idempotente via `upsert:115`/`mergeById:464`:** No introducir nueva librería. Seed re-ejecutable no duplica.
- **Narrativa en manual, no en spec:** `Data/NSGC/docs/manuales/34 - Historia...` es para humanos; specs siguen siendo contrato máquina. Doble columna `Relato | Gear | Verificación` mantiene trazabilidad sin contaminar spec con prosa.
- **Vista derivada PI:** `PI` no tiene colección ST, es `VU.estadoOcupacionPropiedad IN (en_arriendo,en_venta)` sobre `EF` - se documenta como `tipo: vistaDerivada` para no inventar seed.

## Risks / Trade-offs

- **Bump STORE_VERSION:** Cada spec nueva que añade colección debe bump + migrate. Riesgo olvido -> se mitiga exigiendo `Migrate` en plantilla RG y validando en `openspec validate`.
- **FK valida en save rompe seeds legacy huérfanos:** Si seed actual tiene FK dangling, `validateSeedOrder` lo reportará. Mitigación: corregir seed en mismo change.
- **Narrativa desincronizada con DAG:** Mitigación: narrativa referencia `rank` y `Depende de` explícito, no copia valores.
