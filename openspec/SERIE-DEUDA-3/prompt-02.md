> **Este archivo ES tu prompt.** Ventana E2 de la serie deuda-3.
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

## Alcance de E2 — `store-ramas-defensivas`: documentar el techo de cobertura del store

Contexto: `lib/store.ts` quedó en **99.95 % de statements**. Los **2** statements sin cubrir son los
`... : []` de dos `flatMap` filtrados:

- `lib/store.ts:4321` — fallback de la lista de **firmantes** del certificado CT.
- `lib/store.ts:5127` — fallback equivalente al armar el **período de directiva** inicial.

**Decisión ya tomada por el orquestador y el owner (NO la re-litigues)**: **no se borran**. Son
**defensa a propósito**: el filtro aguas arriba (`esMiembroDirectivaVigente` y sus equivalentes)
garantiza hoy que la lista nunca sale vacía, así que la rama es inalcanzable *con el invariante
actual*; borrarla ataría el código a ese invariante y perdería robustez ante un cambio futuro del
filtro. **No se gana nada borrando 2 statements y sí se pierde defensa.**

**Tareas**:

1. **Reproducí y confirmá** que efectivamente son inalcanzables por la API pública: un test que
   recorra el camino real (generar un certificado CT para un directivo con período vigente;
   construir el período inicial) y afirme que la lista de firmantes sale **poblada**. Ese test es el
   que **fija el invariante aguas arriba** y deja la rama como defensa documentada.
2. **Documentá en el código** cada uno de los dos fallbacks con un comentario breve que explique por
   qué está (invariante aguas arriba + defensa ante su cambio). Sin notas históricas largas.
3. **Declará el techo**: en el avance y en el cierre de la serie, dejar escrito que la cobertura del
   store **por API pública** tiene techo en **99.95 %** por diseño, con las 2 líneas y su causa.
4. Change openspec `store-ramas-defensivas` (propose → apply) con `skip_specs: true` justificado.
5. **No** toques `vitest.config.ts` en esta ventana (el ratchet no cambia: no se movió la cobertura).

**Gate**: `npx tsc --noEmit` 0 · `npm run lint` 0 errores · `npm test` verde con los pisos vigentes ·
`openspec validate --all` sin fallos · `check-delta-coverage` ok.

**Archivos que podés tocar**: `k0mp4ss_fe/apps/web/lib/store.ts` (SOLO los 2 comentarios),
`k0mp4ss_fe/apps/web/test/store-ramas-defensivas.test.ts` (nuevo),
`openspec/changes/store-ramas-defensivas/**`, `Data/NSGC/docs/avances/**`,
`openspec/SERIE-DEUDA-3/00-plan.md`. **No** toques `vitest.config.ts` ni ninguna otra parte del store.

## Reporte final estandarizado (OBLIGATORIO — el owner lo copia al chat orquestador)

1. Ventana y estado (HECHA / PARCIAL / BLOQUEADO + motivo).
2. Commits (hash + subject) y confirmación de que **NO** pusheaste.
3. Specs creadas/modificadas + changes propuestos.
4. Números: tests X/Y, tsc/eslint OK, y las métricas propias de la ventana.
5. Desviaciones vs este prompt.
6. Pendientes heredados a la(s) ventana(s) siguiente(s).
7. Última línea exacta: `BITACORA_ENTRY: <resumen 2-3 líneas>`
