# Tasks: ci-db-descartable

Ventana **E4** de SERIE-DEUDA-3 (rama `serie/deuda-1`). Objetivo declarado: alinear los 3
`DATABASE_URL: file:./dev.db` de `.github/workflows/ci.yml` a `file:./perf-test.db` y quitar la
excepción de la guarda dura de D1, para que abortar ante `dev.db` sea **absoluto**.

- [x] **Lectura job por job** del workflow antes de tocarlo (los 5 jobs):
      `unit` migra con `npx prisma migrate deploy --schema=prisma/schema.sqlite.prisma` antes de
      `npx tsc --noEmit` y `npm test`; `e2e` migra + `npm run e2e:reseed-base` en el paso "BD desde
      cero + seed completo" antes de `npm run build` y `npx playwright test`; `e2e-rate-limit` migra
      + `npm run seed:authz` en "BD desde cero + seed usuarios TEST" antes de build y Playwright;
      `unit-pg` usa PostgreSQL (`postgresql://…`, service container) → **no se toca**; `deploy` no
      exporta `DATABASE_URL`. **Ningún job depende del nombre `dev.db`** (grep de `dev.db` en
      `.github/`, `e2e/` y `scripts/`: solo el `DATABASE_URL` del workflow y textos de la guarda de
      `e2e-fresh.mjs`). Confirmado: **los 3 jobs que se tocan migran su base antes de usarla**, así
      que el nombre es intercambiable.
- [x] **Los 3 valores alineados** a `DATABASE_URL: file:./perf-test.db` (job `unit` línea 32, job
      `e2e` línea 112, job `e2e-rate-limit` línea 166 en el archivo previo), con un comentario que
      explica que el nombre es el de la base descartable de la suite. Commit `3b3147f`.
- [x] **Excepción quitada** de `test/db-descartable.setup.ts`: se eliminaron `esEntornoEfimero`,
      `avisoRedireccion`, el origen `"redirigido"` de `OrigenDestino` y `resolverDestinoSuite` (que
      quedaba como identidad de `resolverDestinoBaseDescartable`). `aplicarDestinoBaseDescartable`
      ahora resuelve directo y **lanza** si `mensajeDeAborto` no es `null`. Commit `2a8dcb0`.
- [x] **Contrato de test actualizado** (`test/db-descartable.test.ts`): el caso de la excepción
      ("sólo un runner efímero cambia el aborto por una redirección avisada") se reemplaza por
      **"un runner de CI tampoco puede apuntar a dev.db: la guarda es absoluta"**, que verifica
      `esDevDb`, `mensajeDeAborto` y que `aplicarDestinoBaseDescartable` **lanza** con `CI=true`
      sin mutar el entorno. **12 tests** (mismo conteo que antes). Commit `2a8dcb0`.
- [x] **Guarda verificada con evidencia**:

      ```text
      $ stat -c '%y' prisma/dev.db   → 2026-10-17 22:55:36.837707123 -0300
      $ DATABASE_URL="file:./dev.db" npx vitest run test/health.test.ts
      EXIT=1
      ============================================================================
       test-db-descartable — ABORTADO: la suite escribiría la base de desarrollo.
      ============================================================================
       DATABASE_URL : file:./dev.db
       archivo      : …/k0mp4ss_fe/apps/web/prisma/dev.db
      …
      Error: test-db-descartable: ABORTADO — la suite resolvería a …/prisma/dev.db
      $ stat -c '%y' prisma/dev.db   → 2026-10-17 22:55:36.837707123 -0300  (idéntico)
      ```

      El mismo comando **sin** la `DATABASE_URL` mala da `4 passed (4)` en `test/health.test.ts`, así
      que el exit 1 es del aborto y no de un archivo inexistente.
- [x] **Tests verdes sin la excepción**: `npx vitest run test/db-descartable.test.ts` → **12/12** y
      `npx vitest run test/health.test.ts` → **4/4**, ambos con la base descartable
      (`prisma/perf-test.db` recreada y migrada por el `globalSetup`).
- [x] **Change openspec** `ci-db-descartable` con `skip_specs: true` justificado (ninguna capacidad
      viva declara el `DATABASE_URL` del workflow ni la política de la guarda; las menciones a
      `dev.db` de `ST-capa-datos-persistente` y `SG-hardening-despliegue` son del setup local de
      Prisma, no del CI).
- [x] **Avance NSGC** con los 3 valores antes/después, la excepción quitada y la evidencia de la
      guarda (exit 1 + banner + `mtime`).
- [x] **Gate**: `npx tsc --noEmit` 0 · `npm run lint` 0 problemas · `npm test` verde con los pisos
      vigentes · `openspec validate --all` sin fallos · `check-delta-coverage ci-db-descartable` sin
      nada que rompería el archive · guarda absoluta demostrada con exit 1.

## Declarado y NO forzado (fuera de la ventana)

- **`test/db-descartable.test.ts` entra en el alcance** aunque el prompt nombraba solo el archivo de
  la guarda: es el contrato que fijaba la excepción y sin actualizarlo la suite no compila. Se
  declara como extensión mínima e imprescindible del mismo work-unit.
- **No se corre CI localmente** (no hay runner): la validación es estática (lectura job por job +
  YAML válido) y el orquestador observa el workflow real al pushear.
- **`unit-pg`** sigue con PostgreSQL: no participa de la base descartable ni de la guarda.
- El PR, el push y el archive los hace el orquestador: esta ventana cierra **sin pushear**.
