# Tasks: e2e-higiene-determinismo

- [x] Change `e2e-higiene-determinismo` (proposal + design + tasks + deltas ST/DEV)
- [x] Fix `scripts/seed-authz.mjs`: pasada `createdAt` determinista admin-a última + comentario
- [x] Alinear espejo `lib/seed-authz.ts`: mismo orden + arrendatario + pasada `createdAt`
- [x] Test vitest anti-regresión del orden canónico (sin BD)
- [x] Scripts `e2e:nongated` / `e2e:gated` / `e2e:full-orden` en `package.json`
- [x] Verificar restore P3 + 2 seeds → scope admin = comunidad-a sin receta manual
- [x] Verificar `finally` de `admin-configuracion` sigue compatible con la estrategia
- [x] Verde: `e2e/auth` + `tsc` + lint + `openspec validate e2e-higiene-determinismo`
- [x] Commit (conventional español) + fila P1 y Bitácora en `00-plan.md` de la serie
  (fila P1 con `7ba3247`; entrada de Bitácora del 2026-09-27 ya existente. El archive de este
  change sigue **deferido** por decisión de serie: checklist §4 del owner + migración del
  poblamiento QA-Lab a API REST primero — ver Bitácora del plan)
