> **Este archivo ES tu prompt.** Ventana E3 de la serie deuda-3.
> Léelo completo (incluido `openspec/SERIE-DEUDA-3/00-plan.md`) y ejecutá sus bloques en orden.

## Contexto común (válido para TODA la serie deuda-3)

Proyecto Compass: Next 16 + TypeScript estricto + Prisma, monorepo `k0mp4ss_fe/` (app en
`k0mp4ss_fe/apps/web`). Tests: Vitest (`test/`, **1299 verdes** en 126 archivos con pisos por área) +
Playwright (`e2e/`). Estado de partida: tip de SERIE-DEUDA-2 (`0740da9`, apilado sobre
`noche/serie-noche-3` `1b23219` y SERIE-DEUDA-1): 7 slices, `STORE_VERSION = 28`, pisos global
**93/84/92/93** · `lib/**` **98/93/98/98** · `app/api/**` **87/74/88/87**. `npm run lint` sale
**exit 0 con 35 warnings**. La suite usa la base descartable `prisma/perf-test.db` (globalSetup de
la serie anterior). Tooling e2e: `npm run e2e:fresh`.
Node: `export PATH="$HOME/.nvm/versions/node/v24.21.0/bin:$PATH"`.

Método del proyecto: todo cambio → change openspec (propose → apply → archive). Antes de escribir
cualquier delta: leer `openspec/CONVENCION-DELTAS.md` y correr
`node openspec/scripts/check-delta-coverage.mjs <change>` hasta que dé `0 que romperían el archive`.
Commits convencionales en español, un commit por work-unit, automáticos al cerrar cada trabajo,
commiteando SOLO los archivos del cambio. Skill `nsgc-prepush` obligatoria antes de cada push
(avance en `Data/NSGC/docs/avances/`).

Reglas duras: `STORE_VERSION = 28` congelado; **nunca** tocar `prisma/dev.db` ni
`Data/NSGC/backups/`; nunca secretos en código ni docs; el término oficial es **comunidad**
("condominio" no se usa nunca, RG §4); **no le pidas confirmaciones al owner** (si un gate falla
dos veces: ventana BLOQUEADO con evidencia exacta y seguir).

**NO corras `git push` ni `gh pr edit`**: el harness les pide aprobación interactiva que no podés
contestar (así se colgaron 30 minutos varios ejecutores). Cerrá con todo commiteado y reportá
"sin pushear": el orquestador pushea, archiva y observa el CI.
**Commiteá por unidad**, no al final: si te cortás, el trabajo ya commiteado sobrevive (pasó 5 veces
en las dos series anteriores).
Sé económico en turnos; las corridas largas van con
`nohup bash -lc '<cmd>' > /tmp/serie-deuda3-e<n>-<nombre>.log 2>&1 &` + PID, esperando en bloques de
2-5 min. **Nunca bloquees un solo bash más de ~10 minutos** y no poll-ees nada turno a turno.

Verificación por ventana: `cd k0mp4ss_fe/apps/web && npx tsc --noEmit && npm run lint && npm test`
(pisos por área) + `openspec validate --all` sin fallos + `check-delta-coverage` del change tocado.
e2e con paridad CI: `npm run e2e:fresh -- --no-build -- <specs>` y **nunca** corras el spec de
rate-limit antes de la lane (bloquea la IP 15 min y aborta `auth.setup`).

## Arranque: verificación de la ventana anterior (antes de tu alcance)

1. `git status` limpio y `git status -sb` sin "ahead" (todo pusheado) + `git log --oneline -8`.
2. **Fingerprint**: 7 slices, `STORE_VERSION = 28`, pisos global 93/84/92/93 · `lib/**` 98/93/98/98 ·
   `app/api/**` 87/74/88/87, suite ≥ 1299. Si falta, pará y reportá qué base encontraste.
3. **CI, archives y push los maneja el orquestador**: no poll-ees `gh`, no archives, no pushees.
4. `openspec validate --all` → sin fallos.
5. Contrastá con `openspec/SERIE-DEUDA-3/00-plan.md`: fila anterior `HECHA` → marcá la tuya
   `EN CURSO`; `PARCIAL`/`BLOQUEADO` → completá o documentá ese alcance antes del tuyo.
6. La suite completa se corre **una sola vez**, como gate al final.

## Alcance de E3 — `flaky-pe-panels`: el test de retiro de encomienda

Contexto: `test/componentes/pe-panels.test.tsx > retiro de encomienda` es **flaky preexistente**
(observado en D1 y D4): falla por **timeout de 30 s** cuando la máquina está cargada y pasa en
aislamiento y en re-corridas. Es exactamente la misma familia de defecto que ya se corrigió dos
veces en esta rama: el timeout del test en `e2e/crud/poblado-idempotente.spec.ts` (P1) y en
`e2e/crud/proyectos.spec.ts` (P7) — **presupuesto insuficiente bajo carga, no comportamiento**.

**Tareas**:

1. **Reproducí primero**: corré el archivo solo (`npx vitest run test/componentes/pe-panels.test.tsx`)
   y registrá el tiempo real del caso. Después corré el archivo **bajo carga** (por ejemplo con otra
   corrida de la suite en paralelo o con `stress-ng`/`yes > /dev/null &` si está disponible) para
   provocar el rojo y dejar la evidencia textual del timeout.
2. **Aplicá el presupuesto explícito** al caso (y a sus hermanos del mismo archivo si comparten la
   exposición): `test.setTimeout(...)` dentro del test, o el objeto de opciones
   (`it("...", { timeout: 120_000 }, ...)`), **no** un `test.use({ timeout })` — ese no es un fixture
   válido de Playwright/Vitest y se ignora en silencio (lección de P7).
   El archivo **ya usa** `{ timeout: 20_000 }` en un test hermano: alineá el criterio.
3. **Verificá** con 3 corridas del archivo (y una bajo carga) que el caso pasa siempre; registrá los
   tiempos.
4. **Nota esperada**: el caso tarda por re-render del panel con la lista de unidades, no por un
   problema del componente. Si al investigar encontrás un **defecto real** (no de presupuesto), PARÁ
   y declaralo: esta ventana es de presupuesto, no de arreglar el componente.
5. Change openspec `flaky-pe-panels` (propose → apply) con `skip_specs: true` justificado.
6. Avance NSGC con el tiempo medido y la evidencia antes/después.

**Gate**: `npx tsc --noEmit` 0 · `npm run lint` 0 errores · `npm test` verde con los pisos vigentes ·
`openspec validate --all` sin fallos · `check-delta-coverage` ok · y las **3 corridas** del archivo
con su tiempo.

**Archivos que podés tocar**: `k0mp4ss_fe/apps/web/test/componentes/pe-panels.test.tsx`,
`openspec/changes/flaky-pe-panels/**`, `Data/NSGC/docs/avances/**`,
`openspec/SERIE-DEUDA-3/00-plan.md`. **No** toques el componente ni `vitest.config.ts`.

## Reporte final estandarizado (OBLIGATORIO — el owner lo copia al chat orquestador)

1. Ventana y estado (HECHA / PARCIAL / BLOQUEADO + motivo).
2. Commits (hash + subject) y confirmación de que **NO** pusheaste.
3. Specs creadas/modificadas + changes propuestos.
4. Números: tests X/Y, tsc/eslint OK, y las métricas propias de la ventana.
5. Desviaciones vs este prompt.
6. Pendientes heredados a la(s) ventana(s) siguiente(s).
7. Última línea exacta: `BITACORA_ENTRY: <resumen 2-3 líneas>`
