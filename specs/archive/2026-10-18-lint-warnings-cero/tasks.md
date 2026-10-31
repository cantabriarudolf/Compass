# Tasks: lint-warnings-cero

Ventana **E1** de SERIE-DEUDA-3 (rama `serie/deuda-1`). Objetivo declarado: `npm run lint` de la app
en **0 errores y 0 warnings**, cerrando las **3 causas raíz** de los 35 warnings sin `eslint-disable`
nuevos y sin cambiar comportamiento observable.

Medición de apertura (app, `cd k0mp4ss_fe/apps/web && npx eslint`): **35 problems (0 errors, 35
warnings)**, `exit 0`.

- [x] **Causa 1 — `turbo/no-undeclared-env-vars` (21)**: declarar `CSP_ENFORCEMENT`, `SQLITE_URL`,
  `POSTGRES_URL`, `DATABASE_URL_POSTGRES`, `COMUNIDAD_ID` y `SKIP_DATOS` en `globalEnv` de
  `k0mp4ss_fe/turbo.json` (mismo lugar que `DATABASE_URL`, `AUTH_SECRET` y el resto de las envs de
  app ya declaradas; es el patrón del fix A5). Verificación de que `turbo` sigue funcionando con el
  `env` ampliado: `npx turbo run lint --force` (2/2 tasks, ejecutó, sin warnings),
  `npx turbo run typecheck` (2/2) y `npx turbo run build` (en verde).
- [x] **Causa 2 — 13 warnings en `scripts/*.mjs`**: bloque `globals.node` **acotado a
  `files: ["**/*.mjs"]`** en `apps/web/eslint.config.js` (11 `no-undef` de `process` en `clear-pg`,
  `sync-schema` y `migrate-sqlite-to-postgres`). Consecuencia obligatoria del bloque acotado: retirar
  las directivas por archivo que quedan redundantes —`/* global process[, console|, Buffer] */` en
  `restore-db`, `cifrar-datos-existentes`, `e2e-fresh` (el `console` de ese comentario era el
  `no-redeclare`), `higiene-qa-test`, `security-recheck`, `check-headers`, `backup-db`, `seed-authz`,
  y `eslint-disable no-undef` en `deploy-vercel` y `deploy-migrar-datos`— más el `eslint-disable
  no-undef` de `next.config.mjs`, que pasa a "Unused eslint-disable directive" por el mismo motivo.
- [x] **Causa 2 — triviales**: `catch (err)` → `catch` en `migrate-sqlite-to-postgres.mjs`
  (`no-unused-vars`; el fallback reporta `err2` fila por fila).
- [x] **Causa 3 — `react-hooks/exhaustive-deps` (1)**: `caducarAvisosCV` pasa a un `React.useRef` y
  el `useEffect` la invoca por `ref.current` con deps `[]`. Los `setInterval` de caducidad (1 s del
  reloj y 30 s de sincronización) siguen montándose una sola vez y se limpian igual al desmontar.
  **Fijado con test** (`test/componentes/visor-mensajes-caducidad.test.tsx`, timers falsos): 1 llamada
  al montar, +1 a los 30 s, +1 a los 60 s, 0 después de desmontar. No se usó `eslint-disable`.
- [x] **Change openspec** con `skip_specs: true` y justificación (ninguna capacidad viva declara la
  higiene del linter ni la forma de una dependencia de hook) + **avance NSGC** con la tabla
  warnings antes/después por regla y archivo.
- [x] **Gate**: `npx eslint` → `exit 0`, `0 problems` · `npx tsc --noEmit` 0 · `npm test` verde con
  los pisos vigentes · `openspec validate --all` sin fallos · `check-delta-coverage
  lint-warnings-cero` sin nada que rompería el archive.

## Declarado y NO forzado (fuera de la ventana)

- `packages/ui/src/hooks/use-mobile.ts:14` → **1** warning `react-hooks/set-state-in-effect` en
  `@workspace/ui`. Está fuera de `apps/web` (no formaba parte de los 35 medidos) y su arreglo cambia
  comportamiento observable: se declara en el avance, no se toca.
- Avisos de análisis estático en scripts preexistentes (llamadas sin `try/catch`: `JSON.parse` en
  `restore-db.mjs:84`, `execSync` en `deploy-migrar-datos.mjs:64`, `new URL(...)` en
  `security-recheck.mjs:21` y `check-headers.mjs:14`): anteriores a esta ventana; arreglarlos cambia
  comportamiento de CLIs de migración/backup y excede el alcance cerrado de E1.
