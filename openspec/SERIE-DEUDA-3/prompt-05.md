> **Este archivo ES tu prompt.** Ventana E5 de la serie deuda-3.
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

## Alcance de E5 — cierre de la serie deuda-3

**Tareas**:

1. **Terminar lo pendiente** de E1–E4 si alguna ventana dejó fase abierta (mismo estándar).
2. **Gates completos**: `npx tsc --noEmit` 0 · `npm run lint` **0 errores y el número final de
   warnings** (el objetivo de la serie es 0) · `npm test` verde con los pisos finales (tests X/Y y
   cobertura por área) · `openspec validate --all` sin fallos.
3. **e2e de la serie** con `npm run e2e:fresh -- --no-build -- e2e/smoke e2e/crud/poblado-idempotente.spec.ts`:
   dejá el JUnit (`test-results/junit.xml`) y `.last-run.json` como evidencia (X/X verdes).
4. **Auditoría integral desde el repo**: `git log --oneline -40` vs las filas del plan (hashes
   reales); confirmá `STORE_VERSION = 28`, 7 slices, `prisma/dev.db` y `Data/NSGC/backups/` intactos,
   y que **no quede ningún change de esta serie activo**.
5. **Cierre documental**: sección **"Cierre de la serie deuda-3"** en `openspec/SERIE-DEUDA-3/00-plan.md`
   (estado por ventana con commits, números finales, evidencia de los archives y **deuda post-serie**);
   avance NSGC de cierre; `mem_save` en Engram (tipo `decision`, `topic_key: compass/serie-deuda-3`).
   Fila **E5 HECHA**.
6. **PR**: **no lo crees ni lo edites**. Dejá en el avance el **texto propuesto** para actualizar la
   descripción del **PR draft #3** con lo que cambió deuda-3, los números finales, qué queda fuera y
   la nota de que el merge es decisión del owner.

**Deuda que hay que declarar acá (lo que sobreviva)**:
- Los warnings de lint que no se hayan podido cerrar sin cambiar comportamiento (con su causa).
- El techo de cobertura del store por API pública (**99.95 %**, por las 2 ramas defensivas
  documentadas en E2).
- Cualquier cosa que una ventana haya revertido por riesgo (E4 toca CI).

**Gate**: todos los gates del punto 2 en verde + la evidencia e2e + plan y avance escritos.

**Archivos que podés tocar**: `test/**`, `vitest.config.ts` (solo `thresholds`), `openspec/**`,
`Data/NSGC/docs/avances/**`.

## Reporte final estandarizado (OBLIGATORIO — el owner lo copia al chat orquestador)

1. Ventana y estado (HECHA / PARCIAL / BLOQUEADO + motivo).
2. Commits (hash + subject) y confirmación de que **NO** pusheaste.
3. Specs creadas/modificadas + changes propuestos.
4. Números: tests X/Y, tsc/eslint OK, y las métricas propias de la ventana.
5. Desviaciones vs este prompt.
6. Pendientes heredados a la(s) ventana(s) siguiente(s).
7. Última línea exacta: `BITACORA_ENTRY: <resumen 2-3 líneas>`
