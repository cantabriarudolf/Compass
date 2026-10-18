> **Este archivo ES tu prompt.** Ventana D6 de la serie deuda-2.
> Léelo completo (incluido `openspec/SERIE-DEUDA-2/00-plan.md`) y ejecutá sus bloques en orden.

## Contexto común (válido para TODA la serie deuda-2)

Proyecto Compass: Next 16 + TypeScript estricto + Prisma, monorepo `k0mp4ss_fe/` (app en
`k0mp4ss_fe/apps/web`). Tests: Vitest (`test/`, 1208 verdes con pisos por área) + Playwright
(`e2e/`, lanes crud/flujo/smoke/auth/a11y). Estado de partida: tip de SERIE-DEUDA-1 (`afe142a`,
apilado sobre `noche/serie-noche-3` `1b23219`): store con 7 slices, `STORE_VERSION = 28`, pisos
global **92/83/92/92** · `lib/**` **97/91/98/97** · `app/api/**` **87/74/88/87**. Tooling e2e ya
materializado por la serie anterior: `npm run e2e:fresh` (base descartable, paridad CI).
Node: `export PATH="$HOME/.nvm/versions/node/v24.21.0/bin:$PATH"`.

Método del proyecto: todo cambio → change openspec (propose → apply → archive). Antes de escribir
cualquier delta: leer `openspec/CONVENCION-DELTAS.md` y correr
`node openspec/scripts/check-delta-coverage.mjs <change>` hasta que dé `0 que romperían el archive`.
Commits convencionales en español, un commit por work-unit, automáticos al cerrar cada trabajo,
commiteando SOLO los archivos del cambio. Skill `nsgc-prepush` obligatoria antes de cada push
(avance en `Data/NSGC/docs/avances/`; manual de módulo si cambia comportamiento o estructura;
Trazabilidad si cambia un estado).

Reglas duras: `STORE_VERSION = 28` congelado; **nunca** tocar `prisma/dev.db` ni
`Data/NSGC/backups/`; nunca secretos en código ni docs; el término oficial es **comunidad**
("condominio" no se usa nunca, RG §4); **no le pidas confirmaciones al owner** (si un gate falla
dos veces: ventana BLOQUEADO con evidencia exacta y seguir).

**NO corras `git push` ni `gh pr edit`**: el harness les pide aprobación interactiva que no podés
contestar (así se colgaron 30 minutos ejecutores anteriores). Cerrá con todo commiteado y reportá
"sin pushear": el orquestador pushea, archiva y observa el CI.
**Commiteá por unidad**, no al final: si te cortás, el trabajo ya commiteado sobrevive.
Sé económico en turnos; las corridas largas van con
`nohup bash -lc '<cmd>' > /tmp/serie-deuda2-<n>-<nombre>.log 2>&1 &` + PID, esperando dentro del
mismo comando en bloques de 2-5 min. **Nunca bloquees un solo bash más de ~10 minutos** y no
poll-ees nada turno a turno.

Verificación por ventana: `cd k0mp4ss_fe/apps/web && npx tsc --noEmit && npm run lint && npm test`
(pisos por área) + `openspec validate --all` sin fallos + `check-delta-coverage` del change tocado.
e2e con paridad CI: `npm run e2e:fresh -- --no-build -- <specs>` y **nunca** corras el spec de
rate-limit antes de la lane (bloquea la IP 15 min y aborta `auth.setup`).

## Arranque: verificación de la ventana anterior (antes de tu alcance)

1. `git status` limpio y `git status -sb` sin "ahead" (todo pusheado) + `git log --oneline -8`.
2. **Fingerprint**: 7 slices en `lib/store/slices/`, `STORE_VERSION = 28`, pisos vigentes en
   `vitest.config.ts` (global 92/83/92/92 · `lib/**` 97/91/98/97 · `app/api/**` 87/74/88/87) y suite
   ≥ 1208 tests. Si falta, pará y reportá qué base encontraste.
3. **CI, archives y push los maneja el orquestador**: no poll-ees `gh`, no archives, no pushees.
4. `openspec validate --all` → sin fallos.
5. Contrastá con `openspec/SERIE-DEUDA-2/00-plan.md`: fila anterior `HECHA` → marcá la tuya
   `EN CURSO`; `PARCIAL`/`BLOQUEADO` → completá o documentá ese alcance antes del tuyo.
6. La suite completa se corre **una sola vez**, como gate al final (no al arranque).

## Alcance de D6 — `lint-higiene`: bajar los warnings de ESLint

Contexto: `npm run lint` sale con **exit 0** pero arrastra ~6.700 warnings preexistentes (eran
10.494 antes; bajaron solos al limpiarse artefactos). La mayoría son `@typescript-eslint/no-explicit-any`
en tests y en artefactos generados.

**Tareas**:

1. **Medí y clasificá primero** (no arrases con `--fix` a ciegas): `npm run lint` y agrupá los
   warnings por **regla** y por **zona** (tests · artefactos generados tipo `.vercel/` · código de
   `app/`/`lib/`). Registrá la tabla en el avance.
2. Arreglá en este orden de valor:
   - **Artefactos generados que no deberían lintarse** (`.vercel/`, `.next/`, `coverage/`): si no
     están en el ignore de ESLint, agregalos ahí. Es la corrección de mayor valor y menor riesgo.
   - **Warnings reales en código de producto** (`app/`, `lib/`, `packages/`): tipá bien, sin `any`
     cuando se pueda hacer con un tipo honesto, **sin cambiar comportamiento**. Cada archivo que
     toques lleva su verificación.
   - **Warnings en tests**: acá `any` a veces es legítimo (fixtures, casts `as never`). **No los
     fuerces**: si el `any` es la herramienta correcta del test, dejalo y documentá por qué.
3. **No cambies los `thresholds`** de cobertura ni el comportamiento observable: si un cambio de
   tipos alterara comportamiento, revertí ese archivo y declaralo.
4. Change openspec `lint-higiene` (propose → apply) con `skip_specs: true` y su justificación, o con
   delta si tocás alguna spec.
5. Avance NSGC con la tabla de warnings antes/después por regla y zona.

**Gate**: `npx tsc --noEmit` 0 · `npm run lint` 0 **errores** y con los warnings **medidos y
declarados** (el número final va en el avance) · `npm test` verde con los pisos vigentes ·
`openspec validate --all` sin fallos · `check-delta-coverage` ok.

**Archivos que podés tocar**: `k0mp4ss_fe/apps/web/eslint.config.*` (o el config de ESLint que
corresponda), archivos de `k0mp4ss_fe/apps/web/{app,lib,test,components}/**` donde arregles un
warning real, `openspec/changes/lint-higiene/**`, `Data/NSGC/docs/avances/**`,
`openspec/SERIE-DEUDA-2/00-plan.md`. **No** toques `vitest.config.ts`.

## Reporte final estandarizado (OBLIGATORIO — el owner lo copia al chat orquestador)

1. Ventana y estado (HECHA / PARCIAL / BLOQUEADO + motivo).
2. Commits (hash + subject) y confirmación de que **NO** pusheaste.
3. Specs creadas/modificadas + changes propuestos.
4. Números: tests X/Y, tsc/eslint OK, y las métricas propias de la ventana.
5. Desviaciones vs este prompt.
6. Pendientes heredados a la(s) ventana(s) siguiente(s).
7. Última línea exacta: `BITACORA_ENTRY: <resumen 2-3 líneas>`
