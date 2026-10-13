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

> Estado 2026-10-13 (NOCHE-2 P4): **sigue activo — implementado pero no archivable.**
> Evidencia de implementación en repo: `scripts/seed-authz.mjs` con la pasada `createdAt`
> escalonada (admin-a última, líneas 81-95), espejo `lib/seed-authz.ts` alineado,
> `test/seed-authz-orden.test.ts` (6/6 en la suite de esta rama) y script `e2e:higiene`.
> Qué falta: (1) el delta `DEV-qa-lab` "Specs GATED al final de la corrida + re-seed"
> quedó **obsoleto** — SERIE-E2E-SIN-GATED (`b7e88a8`) eliminó el tag GATED y los scripts
> `e2e:nongated` / `e2e:gated` / `e2e:full-orden` del `package.json` (hoy no existen) y el
> CI corre `npx playwright test` en corrida única; archivar hoy escribiría esa estrategia
> muerta en la spec viva. (2) El delta `ST-capa-datos-persistente` (seed determinista)
> todavía no está en la spec viva. Próximo paso: refrescar el delta DEV contra el diseño
> de corrida única actual, aplicar ambos deltas y recién entonces `openspec archive`.
