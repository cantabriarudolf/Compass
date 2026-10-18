# Proposal: test-db-descartable

## Contexto

`k0mp4ss_fe/apps/web/test/setup.ts` resuelve la base de datos de la suite así:

```ts
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = `file:${path.resolve(__dirname, "../prisma/dev.db")}`;
}
```

Cuando nadie exporta `DATABASE_URL` (el caso normal: `npm test`), **la suite completa escribe la
base de desarrollo del owner**. Los 43 archivos de `test/api/**` usan Prisma real (51 archivos de
test importan `@/lib/prisma`), así que cualquier test que no limpie ensucia datos reales — y las
reglas duras de la serie prohíben tocar `prisma/dev.db`. Verificado con evidencia en esta ventana:
`mtime` antes/después de `npm test` (ver `tasks.md`).

El proyecto ya tiene el patrón correcto para bases descartables: `scripts/e2e-fresh.mjs` prepara
`prisma/perf-e2e.db` (recreada + `prisma migrate deploy --schema=prisma/schema.sqlite.prisma`) con
**guarda dura** contra `dev.db`. El job `unit` de CI hace el equivalente (base efímera del runner +
`migrate deploy`), por eso CI nunca notó el defecto: en CI el `dev.db` es desechable.

## Objetivo

1. Que `npm test` (y cualquier `npx vitest run`) use por defecto una **base descartable**
   (`prisma/perf-test.db`), recreada y migrada de cero antes de la corrida.
2. Que una `DATABASE_URL` del entorno se respete.
3. Que si el destino resuelve a `prisma/dev.db` **por cualquier vía**, el setup **aborte** con
   mensaje explícito (mismo criterio que la guarda de `e2e-fresh.mjs`).
4. Un test que fije el contrato de la resolución (default, entorno, rutas relativas y guarda).

## Alcance

1. `k0mp4ss_fe/apps/web/test/db-descartable.setup.ts` (nuevo): resolución pura + guarda dura +
   fijado de `DATABASE_URL`; registrado como primer `setupFiles` de `vitest.config.ts`.
2. `k0mp4ss_fe/apps/web/test/db-descartable-global.setup.ts` (nuevo) como `globalSetup`: recrea y
   migra la base descartable de cero antes de que corra cualquier archivo de test.
3. `k0mp4ss_fe/apps/web/test/setup.ts`: se retira la caída a `prisma/dev.db` (B3) y se apunta al
   nuevo setup.
4. `k0mp4ss_fe/apps/web/vitest.config.ts`: sólo `setupFiles`/`globalSetup`(claves de `test`), sin
   tocar `thresholds`.
5. `k0mp4ss_fe/apps/web/test/db-descartable.test.ts` (nuevo): contrato de la resolución.
6. `Data/NSGC/docs/avances/**`: avance de la ventana con los `mtime` de `prisma/dev.db`.

## No-alcance

- Cambiar los pisos de cobertura, `STORE_VERSION = 28`, la app, el store o los tests existentes
  (salvo el ajuste mínimo si un test resultara dependiente de datos de `dev.db`).
- Cambiar `.github/workflows/ci.yml` (fuera de los archivos de la ventana; el orquestador es dueño
  del CI). Ver "Riesgos" y la excepción documentada de la guarda.
- Tocar `prisma/dev.db` o `Data/NSGC/backups/`, ni correr la lane e2e (no aplica a este tooling).

## Riesgos y decisión

- **Paridad CI**: el job `unit` exporta `DATABASE_URL: file:./dev.db` sobre un checkout efímero.
  Una guarda sin excepción abortaría ese job y dejaría el CI rojo (bloquea el archive del change).
  Decisión: la guarda aborta en cualquier entorno local y **sólo** se convierte en aviso en un
  runner efímero de CI (`CI`/`GITHUB_ACTIONS`), donde `prisma/dev.db` no es la base del owner sino
  un archivo desechable. Queda declarado como deuda para la ventana de CI: cambiar el job `unit` a
  la base descartable y borrar la excepción.
- **Tests dependientes de datos**: si alguno dependía de filas que hoy existen en `dev.db`, se
  corrige sembrando lo que necesita (el test ya era frágil); no se vuelve a `dev.db`.
