---
description: "Valida que un módulo llevado a OpenSpec respete la capa de datos ST (store, seed, acciones CRUD, versión/migración, backup y terminología)"
---

Valida que el módulo [MÓDULO] respete la convención de la capa de datos persistente (ST) al ir a OpenSpec. NO implementes el módulo; valida y corrige solo lo que esté claramente dentro de la validación.

Contexto: existe una capa de datos persistente (ST) — store Zustand+persist en `apps/web/lib/store.ts` (key `compass-store`, versión `STORE_VERSION`, `hasHydrated`). Regla de la casa declarada en RG y `openspec/specs/project.md`: TODO módulo lee/escribe datos vía `useCompassStore` y sus acciones CRUD; las páginas NUNCA usan `useState` sembrado de mocks, imports estáticos de `data/` para entidades (solo `import type` para tipos), ni mutan el store directo. El seed vive en `apps/web/data/` y solo lo importa `lib/store.ts`. Desde v8, `ES - Estacionamientos` está absorbido como unidades (`tipo: Estacionamiento`) en `EF`, no como colección separada.

Módulo a validar: [MÓDULO] (doc fuente: `Data/NSGC/docs/especificaciones/[MÓDULO].md`, change: `openspec/changes/[AA]-[modulo]/`).

## 0) Modos de ejecución (sin cerrar)

Este comando soporta validación **incremental sin archivar** para avanzar con otras specs en paralelo (tu flujo actual con `enhance-rg-st-seed-gears` abierto):

- **Modo 1 - Un módulo:** `/valida-datos MP-maestro-personas` o `/valida-datos TU-tipos-unidad` → valida solo ese change/modulo y reporta checklist 1..7, sin exigir `cierra-modulo`.
- **Modo 2 - Todos activos:** `/valida-datos --all-active` → itera `openspec list --json` activos (`openspec/changes/*` no archivado) y ejecuta puntos 1..7 por cada uno + chequeo global de `Rank` DAG `ST:9` (detecta ciclos/FK a rank mayor entre changes activos). Ideal para `enhance-rg-st-seed-gears` + `FI` + `PE` en paralelo.
- **Flag `--partial` / `--sin-cerrar`:** equivale a no ejecutar FASE 5 Archivado de `cierra-modulo`; solo valida y corrige lo dentro de `valida-datos`, deja el change abierto por si queda algo en el tintero. Ej: `/valida-datos --all-active --partial`.

En ambos modos NO se mueve nada a `openspec/changes/archive/` y NO se exige `proposal/design/tasks` completos para validar contrato de datos (solo se advierte si faltan artefactos).

## 1) Artefactos OpenSpec
- Existe `proposal.md`, `design.md` (con Goals/Non-Goals reales), `spec.md` y `tasks.md`.
- El spec cubre las reglas de negocio del `.md` de NSGC (fuente de verdad de dominio) sin omitir ni inventar reglas.
- `design.md` declara explícitamente: entidades en el store, acciones CRUD nuevas (`saveX`/`removeX`), validaciones al eliminar (integridad referencial) y reglas de negocio validadas en las acciones (no solo en la UI).
- **Plantilla Penta `RG-reglas-generales:7`:** la spec incluye sección `Dependencias de Carga y Seed (ST)` entre Reglas y AM con `Entidades ST | Depende de | Rank | Seed Manifest | Validación | Bulk | Migración` (Prisma extendida de 3 a 5 bloques).

## 2) Contrato de datos en el spec
- Las entidades del módulo quedan en `CompassData`/`MaestroCollections` del store (o se declara su incorporación al estado ST) con `Rank 0..99` canónico `ST-capa-datos-persistente:9` (`0=CF/MA` → `1=TU/MP` → `2=EF` → `3=VU` → `99=AM`) y `Depende de` explícito (DAG acíclico).
- Las acciones CRUD del módulo se especifican como funciones del store (patrón repository), NO como lógica de página; `save*` especifica validación FK antes de `upsert` devolviendo `StoreResult {ok:false}` `RG-reglas-generales:7`, no solo `remove*`.
- Toda referencia entre módulos usa ids existentes (ej: `unidadId` → `unidades`, `personaId` → `personas`) y el spec nombra de dónde sale cada id.
- Se especifica el seed: qué mock de `data/` siembra el estado inicial (o se declara que no hay seed) con `Seed Manifest` (`colección -> seedFile -> tipo colección|singleton|vistaDerivada -> dependsOn -> rank -> count` `ST:9`) y `Bulk Seed idempotente` via `upsert`/`mergeById` con `SeedValidationReport {ok, errores[]}`. Vista derivada `PI` no tiene seed propio.

## 3) Implementación contra antipatrones históricos
- Ninguna página/componente importa **valores/entidades** desde `@/data/...` (solo `lib/store.ts` importa mocks; formularios reutilizados leen del store). Se permite `import type { Unidad, TipoUnidad, Persona }` solo para tipos, nunca `import { unidades, personas, seed* }` ni datos runtime.
- Ningún `useState` sembrado desde mocks para datos de dominio (estado local solo para UI efímera: inputs, diálogos, filtros).
- No hay colecciones estáticas (`CATEGORIAS_*`, `ESTADOS_*`, `UBICACIONES_*`, listas hardcodeadas) que debieran vivir en el store; si el módulo necesita una nueva colección, va a `MaestroCollections` con su `migrate` si aplica.
- **Maestros de referencia administrables (categorías, etiquetas, estados, tipos de propiedad):** ningún formulario/select repite opciones hardcodeadas en la UI. Las opciones administrables viven en `MaestroCollections` gestionadas por el módulo MA en `/admin/maestros` (patrón `saveMaestro`/`removeMaestro`) y los módulos consumidores (TU, EF, VU, etc. — ES absorbido en EF) las leen del store. Si el módulo requiere una etiqueta nueva, debe declararse en la especificación MA (`Data/NSGC/docs/especificaciones/MA - Maestros Administrativos.md`) y agregarse a la colección correspondiente del store, subiendo `STORE_VERSION` con su `migrate` si el estado persistido anterior no la incluye. Los badges de estado usan la paleta canónica `BADGE_OPTIONS` + `normalizeBadgeColor` + `hexDesdeId` (no clases Tailwind a mano).
- Las páginas llaman `useStoreRehydrated` y respetan `hasHydrated` (no mutar antes de hidratar). Además renderizan un skeleton mientras `hasHydrated` es `false` y montan el contenido real solo tras la hidratación (regla "Hidratación segura en renderizado SSR" del spec ST), evitando mismatch SSR/cliente.
- Eliminaciones validadas por dependencias (la acción devuelve `StoreResult` con error; la UI lo muestra). `removeMaestro` también valida que ningún `unidad.estadoId` / `unidad.etiqueta` / `vinculo.estadoOcupacionPropiedad` referencie el id a borrar.
- Los ids nuevos siguen el patrón existente del módulo (ej: `v-`, `u-`, `t-`, `est-`) y no colisionan con el seed.
- **Terminología RG §4:** el diff del módulo NO introduce "condominio" (término en desuso); el oficial es "comunidad". Verificar con `git diff HEAD -- . | rg -n "condominio"`.

## 4) Integración entre módulos
- Si el módulo lee de otros (ej: FI usa `tiposUnidad`, `unidades`, `personas`), el spec lo declara y la implementación lee del store (no de imports).
- Si el módulo modifica entidades de otro módulo, usa las acciones de ese módulo, no mutación directa.
- **Coherencia ES→EF (desde v8):** `ES-estacionamientos` ya no es colección propia; los estacionamientos son `unidades` con `tipoUnidadId: tipo-es-1` y microsectores `est-*` en `EF`. Si el change toca estacionamientos, validar que no reintroduzca `estacionamientos`/`ubicacionesEstacionamiento` en store/specs/docs y que `project.md` lo marque como absorbido.

## 5) Contrato técnico ST (versión, persistencia y backup)
- `STORE_VERSION` en `lib/store.ts` se bumppea si hay nueva colección/campo y `migrate` cubre el upgrade (mergeById, limpieza de keys legacy, no pisar personalizaciones). `partialize` persiste exactamente `CompassData` (sin `hasHydrated`).
- `validateStoreBackup` en `lib/store-backup.ts` está alineado con `CompassData` actual (sin `estacionamientos` legacy) y se ejecuta sin errores; además `validateSeedOrder` verifica DAG y `seedBulkLoad` es idempotente por `rank asc` `ST:9`.
- Los backups `Data/NSGC/Pruebas/*.json` no quedan con `estacionamientos` huérfanos; los de v7 previos se documentan como migrados.
- `Data/NSGC/backups/compass-seed-report-*.json` (generado por `qa-lab` `/admin/qa-lab`) existe si el módulo tocó seeds y contiene `SeedValidationReport + historia {capitulo, relato, estado, rank, count}` con `tasa huérfanos == 0`; `AM` registra `ST_SEED_*`/`ST_MIGRATE_APPLIED` inmutables `AM:80`.

## 6) Verificación
- `npx tsc --noEmit` y `npx turbo lint` (0 errores).
- `git diff HEAD -- . | rg -n "condominio" || echo "OK"` (0 hits en el diff del módulo).
- `rg -n "from.*@/data" apps/web/app apps/web/components --include="*.ts" --include="*.tsx"` solo con `import type` (sin imports de valores).
- `Data/NSGC/docs/manuales/34 - Historia de Poblamiento - Relato de Uso.md` actualizado si el módulo afecta el orden de poblamiento (relato doble columna `Relato | Gear | Verificación` mantiene paridad con `Rank`).

## 7) Carga ordenada y relato (nuevo con enhance-rg-st-seed-gears)

- La spec del módulo declara `Dependencias de Carga y Seed (ST)` con los 7 campos y `Rank` coherente con manifest canónico `ST:9`. Si `Rank` rompe DAG o FK apunta a `rank` mayor, `validateSeedOrder` lo reporta.
- `save*` valida FKs antes de `upsert` y `seedBulkLoad` reporta `SeedValidationReport` sin silenciamiento; `/admin/qa-lab` marca `🟢 OK` por módulo y `Detalle` muestra `errores[]`.
- La historia paralela queda trazada: `34 - Historia de Poblamiento` refleja el poblamiento del módulo y `qa-lab` tab `Historia Viva` lo ilumina por capítulo.

## Entregable
Informe en chileno con (a) hallazgos por severidad (crítica/media/baja) con archivo+línea y regla violada, (b) correcciones aplicadas con justificación, (c) checklist explícito de los 7 puntos marcando ✅/❌ (artefactos, contrato datos, antipatrones, integración, contrato técnico ST, verificación, carga ordenada y relato) **por módulo** si es `--all-active`, más tabla global de `Rank` DAG. Si todo está conforme, decláralo explícitamente y sugiere siguiente spec. No commitear.

## Uso rápido

```bash
# Valida un módulo sin cerrar (tu caso: seguir con FI sin archivar enhance-rg-st-seed-gears)
/valida-datos TU-tipos-unidad --partial

# Valida todo lo activo en paralelo (enhance-rg-st-seed-gears + futuros)
/valida-datos --all-active --partial

# Equivalente manual (sin slash):
openspec validate --all --strict
npx tsc --noEmit --project k0mp4ss_fe/apps/web/tsconfig.json
```
