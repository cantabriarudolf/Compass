# Tasks: test-db-descartable

- [ ] Reproducir el defecto con evidencia: `mtime` de `prisma/dev.db` antes / después de `npm test`
- [ ] `test/db-descartable.setup.ts`: resolución pura + guarda dura + `DATABASE_URL`
- [ ] `test/db-descartable-global.setup.ts`: recrear + `migrate deploy` la base descartable
- [ ] `vitest.config.ts`: `setupFiles` + `globalSetup` (sin tocar `thresholds`)
- [ ] `test/setup.ts`: retirar la caída a `prisma/dev.db` (B3)
- [ ] `test/db-descartable.test.ts`: contrato de la resolución
- [ ] Demostrar la guarda: aborto con mensaje explícito y `dev.db` intacta
- [ ] Gate: `npx tsc --noEmit` · `npm run lint` · `npm test` (piso vigente) · `mtime` sin cambios
- [ ] `openspec validate --all` + `check-delta-coverage test-db-descartable`
- [ ] Avance NSGC + fila/bitácora de `openspec/SERIE-DEUDA-2/00-plan.md`
