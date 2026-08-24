## Why

El contrato `enhance-rg-st-seed-gears` deja el Rank y la validación en specs, pero no hay UI para ejecutarlo. El admin necesita un botón que poble en orden `MA/CF → TU/MP → EF → VU` y vea `🟢 OK` por módulo, detalle por módulo y un JSON en `Data/NSGC/backups/`, además de ver cómo avanza la `Historia de Poblamiento` `Data/NSGC/docs/manuales/34 - Historia de Poblamiento - Relato de Uso.md:1`.

## What Changes

- Nueva ruta `k0mp4ss_fe/apps/web/app/admin/qa-lab/page.tsx` bajo `Desarrollo AI` `k0mp4ss_fe/apps/web/components/app-sidebar.tsx:125` (solo `NODE_ENV !== production` o rol `admin`).
- Tab `Carga Técnica` con botones `Cargar FASE 0..3` / `Cargar Todo` / `Limpiar TEST-*` / `Validar` / `Exportar`, grid por Rank con `Badge` estado y botón `Detalle` (`SeedValidationReport` + diff), guardado `Data/NSGC/backups/compass-seed-report-*.json` vía `POST /api/backup` `k0mp4ss_fe/apps/web/app/admin/dev-dashboard/page.tsx:219`.
- Tab `Historia Viva` que ilumina capítulos de `34 - Historia` a medida que cada Rank se carga (Prólogo MA/CF → Cap1 TU/EF → Cap2 MP/VU → Cap3 PE/IR/CO → Epílogo AM).
- Helpers `validateSeedOrder`/`seedBulkLoad`/`SeedValidationReport` en `k0mp4ss_fe/apps/web/lib/store.ts:57` (o locales al lab si no se tocan specs) que usan `saveMaestro/saveTipo/saveMacro/saveMicro/saveUnidad/savePersona/saveVinculo` y reportan sin silenciar.

## Capabilities

### New Capabilities
- `DEV-qa-lab`: Laboratorio QA de carga ordenada con Historia Viva y backups auditables

### Modified Capabilities
- `ST-capa-datos-persistente`: exponer helpers de validación/carga bulk usados por qa-lab (si se implementa en store)
- `AM-auditoria-metricas`: registrar `ST_SEED_*` desde qa-lab (reusa `AM-auditoria-metricas/spec.md:7`)

## Impact

- `k0mp4ss_fe/apps/web/app/admin/qa-lab/page.tsx` nueva, `k0mp4ss_fe/apps/web/components/app-sidebar.tsx` entrada `Laboratorio QA`, `k0mp4ss_fe/apps/web/lib/store.ts` helpers opcionales, `Data/NSGC/backups/*` nuevos JSON, `openspec/specs/DEV-qa-lab/spec.md` al archivar.
