# Proposal: lint-warnings-cero — los 35 warnings de ESLint a cero (ventana E1 de SERIE-DEUDA-3)

## Contexto

`npm run lint` en `k0mp4ss_fe/apps/web` salía **exit 0** (el config compartido monta
`eslint-plugin-only-warn`, así que todo se degrada a warning) con **35 warnings** preexistentes,
clasificados al cerrar SERIE-DEUDA-2 en **3 causas raíz** medidas, no estimadas:

| Warnings | Regla | Zona |
| --- | --- | --- |
| **21** | `turbo/no-undeclared-env-vars` | 11 en `test/proxy.header-selection.test.ts`, 8 en `scripts/`, 1 en `e2e/csp-modos.spec.ts`, 1 en `proxy.ts` |
| **13** | `scripts/*.mjs` | 11 `no-undef` (`process` en scripts de Node), 1 `no-redeclare` (`console` en `e2e-fresh.mjs`), 1 `@typescript-eslint/no-unused-vars` (`err`) |
| **1** | `react-hooks/exhaustive-deps` | `app/visor-mensajes/page.tsx` (`caducarAvisosCV`) |

Dos intentos quedaron documentados como trampa en el plan de la serie: D6 probó dar globales de Node
**al config global** y el resultado fue **peor** (8 `no-redeclare` nuevos —uno por cada
`/* global process */` del repo— más 2 directivas `eslint-disable no-undef` que pasaban a ser
obsoletas) y se revirtió; y el arreglo del `exhaustive-deps` "silenciando" o cambiando deps del
`useEffect` cambia el ciclo de vida de los dos `setInterval` de caducidad del visor.

## Objetivo

`npm run lint` de la app en **0 errores y 0 warnings**, cerrando las 3 causas raíz sin
`eslint-disable` nuevos y **sin cambiar comportamiento observable**.

## Alcance

1. **`turbo.json`**: declarar las 6 env vars reclamadas — `CSP_ENFORCEMENT`, `SQLITE_URL`,
   `POSTGRES_URL`, `DATABASE_URL_POSTGRES`, `COMUNIDAD_ID` y `SKIP_DATOS` — en `globalEnv`, el mismo
   lugar donde ya viven `DATABASE_URL`, `AUTH_SECRET`, `E2E_RATE_LIMIT` y el resto de las envs de app
   (patrón con el que el repo ya cerró el mismo warning en el fix A5). Mata los 21 de una.
2. **Config de ESLint** (`k0mp4ss_fe/apps/web/eslint.config.js`): bloque `globals.node` **acotado a
   `files: ["**/*.mjs"]`** (tooling de Node: scripts de migración/seed, orquestación de la lane e2e,
   `next.config.mjs`, `postcss.config.mjs`). Con los globales cubiertos por config, las directivas
   por archivo quedan redundantes y se retiran: `/* global process[, console|, Buffer] */` en 8
   scripts `.mjs`, `eslint-disable no-undef` en `deploy-vercel.mjs` y `deploy-migrar-datos.mjs`, y el
   `eslint-disable no-undef` de `next.config.mjs` (que de otro modo pasaría a "Unused
   eslint-disable directive").
3. **`scripts/migrate-sqlite-to-postgres.mjs`**: `catch (err)` → `catch`, porque `err` no se usaba
   (el fallback reporta `err2` por fila).
4. **`app/visor-mensajes/page.tsx`**: la acción `caducarAvisosCV` del store se guarda en un `ref` y
   el `useEffect` de caducidad la llama por `ref.current` con deps `[]`, de modo que los dos
   `setInterval` (reloj de 1 s y caducidad de 30 s) siguen montándose **una sola vez**. Sin
   `eslint-disable` y sin tocar el ciclo observable.
5. **Test de fijación** (`test/componentes/visor-mensajes-caducidad.test.tsx`) con timers falsos:
   caduca 1 vez al montar, +1 cada 30 s, y corta el ciclo al desmontar.
6. **Change openspec** con `skip_specs: true` justificado + **avance NSGC** con la tabla
   warnings antes/después por regla y archivo.

## Fuera de alcance

- **Comportamiento**: ningún cambio de ciclo, de datos ni de UI; `STORE_VERSION = 28` congelado.
- `vitest.config.ts` (ni `thresholds` ni nada) y `test/**` salvo el test nuevo de fijación.
- Los files del ecosistema e2e/CI ajenos al linter (la alineación de `DATABASE_URL` en `ci.yml` es la
  ventana E4 de la serie).
- El único warning que queda en el monorepo, `react-hooks/set-state-in-effect` en
  `packages/ui/src/hooks/use-mobile.ts:14`: es de otro paquete, **no** formaba parte de los 35
  medidos en la app y su arreglo cambia comportamiento. Se declara en el avance, no se fuerza.
- Los avisos de análisis estático (llamadas sin `try/catch`: `JSON.parse`, `execSync`, `new URL`)
  reportados en scripts preexistentes: son anteriores a esta ventana y arreglarlos cambiaría
  comportamiento de CLIs de migración/backup.

## Criterios de aceptación

- `cd k0mp4ss_fe/apps/web && npx eslint` → **exit 0**, `0 problems` (0 errores, 0 warnings).
- `npx tsc --noEmit` → 0 errores · `npm test` → verde con los pisos vigentes (≥ 1299).
- `turbo` sigue funcionando con el `env` ampliado: `npx turbo run lint --force` y
  `npx turbo run typecheck` en verde + `turbo run build` en verde.
- `openspec validate --all` sin fallos · `check-delta-coverage lint-warnings-cero` sin nada que rompa
  el archive (con `skip_specs: true`).
