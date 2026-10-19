# Proposal: ci-db-descartable — alinear el CI con la base descartable (ventana E4 de SERIE-DEUDA-3)

## Contexto

La ventana **D1** de SERIE-DEUDA-2 hizo que la suite de Vitest use una **base descartable**
(`prisma/perf-test.db`, recreada y migrada de cero por `test/db-descartable-global.setup.ts`) y
agregó una **guarda dura** en `test/db-descartable.setup.ts`: si el destino resuelve a `dev.db`,
la suite **aborta**.

Pero `.github/workflows/ci.yml` no estaba entre los archivos de esa ventana y exporta
`DATABASE_URL: file:./dev.db` en **3 jobs**, así que D1 tuvo que dejar una **excepción**: en un
runner efímero (`CI`/`GITHUB_ACTIONS` verdadero) la guarda **redirige con aviso** a la base
descartable en vez de abortar. Esa excepción es la deuda de esta ventana: mientras exista, la
guarda **no es absoluta** y el workflow sigue nombrando una base que la política del repo dice no
usar (el `dev.db` de cada checkout es desechable, pero el nombre es el mismo que el de la base de
desarrollo del owner, así que un copiar/pegar del workflow a un entorno local rompe la garantía).

## Estado antes/después (los 3 valores)

| Job | Línea (pre-cambio) | Antes | Después | ¿Migra su base antes de usarla? |
| --- | --- | --- | --- | --- |
| `unit` (Unit + integración, Vitest) | 32 | `DATABASE_URL: file:./dev.db` | `DATABASE_URL: file:./perf-test.db` | ✅ `npx prisma migrate deploy --schema=prisma/schema.sqlite.prisma` (línea 52), antes de `npx tsc --noEmit` y `npm test` |
| `e2e` (E2E Playwright, build producción) | 112 | `DATABASE_URL: file:./dev.db` | `DATABASE_URL: file:./perf-test.db` | ✅ paso "BD desde cero + seed completo": `npx prisma migrate deploy --schema=prisma/schema.sqlite.prisma` + `npm run e2e:reseed-base`, antes de `npm run build` y `npx playwright test` |
| `e2e-rate-limit` (E2E rate-limit aislado) | 166 | `DATABASE_URL: file:./dev.db` | `DATABASE_URL: file:./perf-test.db` | ✅ paso "BD desde cero + seed usuarios TEST": `npx prisma migrate deploy --schema=prisma/schema.sqlite.prisma` + `npm run seed:authz`, antes de `npm run build` y `npx playwright test e2e/auth/rate-limit.spec.ts` |

- El job **`unit-pg`** exporta una URL `postgresql://…` (service container): **no se toca**.
- **Nada depende del nombre** `dev.db`: el workflow solo lo usa como `DATABASE_URL` (Prisma CLI y
  cliente, los seeds y el `webServer` de Playwright lo leen del entorno) y no hay ningún
  `rm`/`cp`/ruta literal sobre ese archivo en `.github/`, `e2e/` ni `scripts/` de la app.
- El nombre nuevo es el **mismo** que el de la base de la suite, así que el `migrate deploy` del
  job y el `globalSetup` de Vitest operan sobre el mismo archivo (en el job `unit` el setup lo
  recrea igual: es idempotente y ya era así cuando el nombre coincidía con el default).

## Objetivo

1. Que el workflow deje de nombrar `dev.db`.
2. Que la guarda de la suite vuelva a ser **absoluta**: aborto ante `dev.db` **siempre**, sin
   importar `CI`/`GITHUB_ACTIONS`.
3. Demostrar el aborto con evidencia (exit 1 + banner + `mtime` de `prisma/dev.db` intacto).

## Decisión

- **Alinear, no renombrar la base descartable**: `perf-test.db` es el nombre que ya usa la suite y
  está gitignored (`*.db` en `k0mp4ss_fe/.gitignore`). Cambiar el nombre de la base de la suite
  habría tocado `vitest.config.ts`, el `globalSetup` y los avances de D1 sin necesidad.
- **Quitar la excepción entera**, no dejarla apagada por una env var: `esEntornoEfimero`,
  `avisoRedireccion`, el origen `"redirigido"` y `resolverDestinoSuite` (que quedaba siendo la
  identidad de la resolución cruda) se **eliminan**. La guarda queda con una sola regla: si
  `esDevDb`, `mensajeDeAborto` no es `null` y `aplicarDestinoBaseDescartable` **lanza**.
- **Actualizar el contrato de test** `test/db-descartable.test.ts`, que fijaba la excepción: pasa a
  fijar el **aborto absoluto**, incluido el caso `{ DATABASE_URL: "file:./dev.db", CI: "true" }`
  (mismo conteo: 12 tests). Sin esta actualización el archivo no compilaría (importaba las
  funciones eliminadas).
- **No tocar `unit-pg`** ni los jobs que no exportan `DATABASE_URL: file:`.

## Alcance

1. `.github/workflows/ci.yml`: los 3 valores + comentario que explica por qué el nombre debe
   coincidir con la base descartable.
2. `k0mp4ss_fe/apps/web/test/db-descartable.setup.ts`: guarda absoluta.
3. `k0mp4ss_fe/apps/web/test/db-descartable.test.ts`: contrato del aborto absoluto.
4. Change openspec `ci-db-descartable` con `skip_specs: true` justificado.
5. Avance NSGC con los 3 valores antes/después, la excepción quitada y la evidencia de la guarda.

## Fuera de alcance

- `vitest.config.ts` y sus pisos (93/84/92/93 · `lib/**` 98/93/98/98 · `app/api/**` 87/74/88/87).
- `scripts/e2e-fresh.mjs` y su guarda (ya era absoluta).
- `STORE_VERSION = 28` congelado; `prisma/dev.db` y `Data/NSGC/backups/` intocados.
- El PR, el push y el archive: los hace el orquestador (esta ventana cierra **sin pushear**).

## Riesgo declarado y su control

Esto toca **config de CI (delivery)**: un error puede romper el CI en vez de mejorarlo. Control:
se leyó **job por job** y se confirmó que **cada job migra su base antes de usarla**; el único job
que no exportaba `file:` (`unit-pg`) quedó intacto. Si algún job hubiera dependido del nombre
viejo o no migrara, se dejaba como estaba y se documentaba (no fue el caso).

## Criterios de aceptación

- `DATABASE_URL="file:./dev.db" npx vitest run test/health.test.ts` → **exit 1** con el banner de
  aborto, y `prisma/dev.db` con el **mismo `mtime`**.
- `npx tsc --noEmit` → 0 · `npm run lint` → 0 problemas · `npm test` verde con los pisos vigentes.
- `openspec validate --all` sin fallos · `check-delta-coverage ci-db-descartable` sin nada que
  rompería el archive (con `skip_specs: true`).
