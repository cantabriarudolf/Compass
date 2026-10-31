# Tasks: test-db-descartable

- [x] Reproducir el defecto con evidencia: `mtime` de `prisma/dev.db` antes / después de `npm test`
      → 20:37:08 (1792280228) → 22:55:36 (1792288536), tamaño 9.777.152 → 9.781.248 B
- [x] `test/db-descartable.setup.ts`: resolución pura + guarda dura + `DATABASE_URL`
- [x] `test/db-descartable-global.setup.ts`: recrear + `migrate deploy` la base descartable
- [x] `vitest.config.ts`: `setupFiles` + `globalSetup` (sin tocar `thresholds`)
- [x] `test/setup.ts`: retirar la caída a `prisma/dev.db` (B3)
- [x] `test/db-descartable.test.ts`: contrato de la resolución (12 tests)
- [x] Demostrar la guarda: `DATABASE_URL="file:./dev.db" npx vitest run test/health.test.ts` →
      `exit=1` con el banner `ABORTADO` y `prisma/dev.db` con el `mtime` sin cambios
- [x] Gate: `npx tsc --noEmit` 0 · `npm run lint` 0 errores · `npm test` **1220/1220** (117 archivos)
      con los pisos vigentes · `mtime` de `prisma/dev.db` **sin cambios** (1792288536 antes y después)
- [x] `openspec validate --all` 40 passed / 0 failed + `check-delta-coverage test-db-descartable`
      (1 ok · 0 que romperían el archive)
- [x] Avance NSGC (`Data/NSGC/docs/avances/avance - 2026-10-17 23-22.md`) + fila/bitácora de
      `openspec/SERIE-DEUDA-2/00-plan.md`

## Nota de alcance (desvío declarado)

La guarda dura vive en el mismo módulo que la resolución de la base
(`test/db-descartable.setup.ts`), así que el commit de la base descartable y el de la guarda son uno
solo (`6eff24f`): separarlos dejaría un estado intermedio sin protección. La única excepción de la
guarda (runner efímero de CI → redirección avisada en vez de aborto) está justificada en
`design.md` § Guarda dura: `ci.yml` exporta `DATABASE_URL: file:./dev.db` en el job `unit` y ese
archivo está fuera de los archivos de la ventana.
