# Tasks: e2e-fresh

- [x] Crear `k0mp4ss_fe/apps/web/scripts/e2e-fresh.mjs` (Node ESM, cero dependencias nuevas):
  - `DATABASE_URL="file:./perf-e2e.db"` por defecto, `--db <archivo>` para cambiarla,
    **aborta** si el destino es `prisma/dev.db` (o cualquier nombre con `dev.db`).
  - `--keep-db` para reusar la base existente (por defecto la base se recrea: "fresh").
  - Saneo del puerto 3000: si hay un `next-server` huérfano lo termina (incidente P4 NOCHE-3);
    si lo ocupó otro proceso, avisa y sigue.
  - `npx prisma migrate deploy --schema=prisma/schema.sqlite.prisma` →
    `npm run e2e:reseed-base` → `npm run build` (salteable con `--no-build`).
  - Banner final: base usada + comando Playwright exacto (`CI=1 npx playwright test <specs>`)
    + aviso de no correr el spec de rate-limit antes de la lane.
  - **La corrida real se hace con `CI=1`** en el entorno del hijo (si no, Playwright usa
    `next dev`, `reuseExistingServer: true` y Chrome del sistema → no hay paridad CI).
  - Sin argumentos tras `--`: imprime los specs canónicos de la serie (`e2e/smoke` + los 9 crud
    de NOCHE-3). Con `--`: corre ese comando tal cual.
- [x] Agregar `"e2e:fresh": "node scripts/e2e-fresh.mjs"` a `k0mp4ss_fe/apps/web/package.json`.
- [x] Subir la espera de la purga en el caso "cancelar" de
  `e2e/crud/poblado-idempotente.spec.ts` de 30 s a **120 s** (el caso hermano ya usa 120 s).
- [ ] Verificación real: `npm run e2e:fresh` completo con `e2e/crud/poblado-idempotente.spec.ts`
  y `e2e/smoke` sobre base descartable, dejando el X/X registrado.
- [ ] Gates: `npx tsc --noEmit` 0 · `npm run lint` 0 · `npm test` verde con los pisos vigentes ·
  `openspec validate --all` sin fallos · `check-delta-coverage e2e-fresh` ok.
- [ ] Avance NSGC de la ventana (no hay manual de módulo: no cambia comportamiento ni estructura).
- [ ] Commit + push con `nsgc-prepush`; fila **P1 HECHA** + entrada en la Bitácora del `00-plan.md`.
