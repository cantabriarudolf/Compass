# Design: test-db-descartable

## Problema

`test/setup.ts` resolvía la base de la suite a `prisma/dev.db` (absoluta) cuando `DATABASE_URL`
no venía del entorno. Resultado: `npm test` escribía la base de desarrollo del owner.

## Mecánica de la solución

```text
npm test / npx vitest run
   │
   ├─ globalSetup  test/db-descartable-global.setup.ts   (1 vez, proceso principal)
   │     ├─ importa test/db-descartable.setup.ts → guarda dura + fija DATABASE_URL
   │     ├─ si el destino es `file:` → rm base + rm -journal/-wal/-shm
   │     └─ npx prisma migrate deploy --schema=prisma/schema.sqlite.prisma   (base migrada de cero)
   │
   └─ setupFiles   test/db-descartable.setup.ts (1º)  →  test/setup.ts (MSW, AUTH_SECRET, …)
         └─ cada worker vuelve a fijar DATABASE_URL (y a correr la guarda)
```

El `globalSetup` es lo que hace que la base quede **migrada antes** de que corran los 43 archivos
de `test/api/**` que usan Prisma real: sin eso, la suite iría contra un archivo vacío y los tests
morirían con `no such table`. Es el mismo par de pasos que el job `unit` de CI (`migrate deploy` +
`npm test`) y el mismo comando que `scripts/e2e-fresh.mjs`.

## Resolución del destino (pura y testeable)

`resolverDestinoBaseDescartable(env, { appDir })` devuelve
`{ url, archivo, origen, esDevDb }`:

| Entrada `DATABASE_URL`           | Resultado                                                        |
| -------------------------------- | ---------------------------------------------------------------- |
| ausente / vacía                  | `file:<appDir>/prisma/perf-test.db`, `origen: "default"`         |
| `file:./perf-test.db`            | respetada; se resuelve a `prisma/perf-test.db` (base del schema) |
| `file:/abs/perf-x.db`            | respetada tal cual                                               |
| `postgresql://…` (job `unit-pg`) | respetada; **sin** preparación (no es una base `file:`)          |
| cualquier ruta con `dev.db`      | `esDevDb: true` → aborta (salvo runner efímero, ver abajo)       |

La resolución de rutas relativas usa el directorio de `prisma/` porque así lo hace Prisma
(CLI y cliente resuelven `file:` relativo contra el directorio del schema).

## Guarda dura

`mensajeDeAborto(destino, env)` devuelve `null` o el texto del aborto. Se aplica en el
`globalSetup` (antes de tocar cualquier archivo) y en cada worker (setupFile):

```text
test-db-descartable — ABORTADO: la suite resolvería a la base de desarrollo ...
```

Criterio de `dev.db`: `path.basename(archivo).includes("dev.db")`, idéntico al de
`scripts/e2e-fresh.mjs` (`dev.db.backup-*` también queda cubierto).

**Excepción única y documentada**: el job `unit` de `ci.yml` exporta
`DATABASE_URL: file:./dev.db` sobre un checkout efímero. Ahí `prisma/dev.db` no es la base del
owner. En ese entorno (`CI`/`GITHUB_ACTIONS` verdadero) la guarda imprime un aviso en vez de
abortar. Fuera de un runner efímero, cualquier vía que resuelva a `dev.db` aborta.

## Contrato fijado por test

`test/db-descartable.test.ts` fija: default descartable · entorno respetado · rutas relativas y
absolutas resueltas · `dev.db` (incluida `.../prisma/../prisma/dev.db`) detectado y abortado ·
la excepción sólo aplica en entorno efímero.

## Alternativas descartadas

- **Script en `package.json`** (`test: node scripts/test-db-fresh.mjs && vitest …`): no cubre
  `npx vitest run <archivo>` (el bucle real de iteración) ni `npm run test:watch`.
- **Sólo `setupFiles`**: el archivo de base se migraría una vez por worker (lentísimo) o correría
  contra una base sin migrar (rojo masivo).
- **Borrar `DATABASE_URL` del job `unit`**: dejaría al CI sin base (`migrate deploy` falla);
  además `ci.yml` está fuera del alcance de esta ventana.
