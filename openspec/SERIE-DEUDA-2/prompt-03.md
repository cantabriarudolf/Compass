> **Este archivo ES tu prompt.** Ventana D3 de la serie deuda-2.
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

## Alcance de D3 — `am-emisores-2`: los tres emisores restantes

Continúa D2 con el mismo patrón (leé `openspec/SERIE-DEUDA-1/00-plan.md` § Cierre de la serie para
el contexto de la deuda y copiá el molde de las rutas que ya emiten, p. ej.
`app/api/fondos-fi/[id]/retirar/route.ts`).

**Tareas** (un emisor por vez, con su test y su commit):

1. **`IR_ASSET_REPAIR`** en la ruta de recursos de inventario
   (`k0mp4ss_fe/apps/web/app/api/ir/recursos/**`) — la reparación de un activo IR.
2. **`CO_DOC_DOWNLOAD`** en la ruta de documentos de comunicación
   (`k0mp4ss_fe/apps/web/app/api/co/documentos/**`) — la descarga de un documento.
3. **`PE_CIERRE_EDITADO`** en la ruta de cierres de turno
   (`k0mp4ss_fe/apps/web/app/api/pe/cierres-turno/**`) — la edición de un cierre ya registrado.

Ojo: los nombres de carpeta son **candidatos**, no verdad revelada. Verificá con `grep`/`find` cuál
es la ruta real que corresponde a la acción antes de tocar nada, y si no existe una ruta donde el
evento tenga sentido, **pará esa tarea** y declaralo en el reporte (no inventes una ruta nueva).

Además: revisá si las specs vivas describen estos tres eventos de forma consistente con lo que
implementaste; si hay que corregir prosa, hacelo con un delta `MODIFIED` en el mismo change.

**Gate**: `npx tsc --noEmit` 0 · `npm run lint` 0 · `npm test` verde con los pisos vigentes ·
`openspec validate --all` sin fallos · `check-delta-coverage` del change.

**Archivos que podés tocar**: las tres rutas que identifiques,
`k0mp4ss_fe/apps/web/test/api/**`, `openspec/changes/am-emisores-2/**`, `openspec/specs/**` (solo
con delta), `Data/NSGC/docs/avances/**`, `openspec/SERIE-DEUDA-2/00-plan.md`.

## Reporte final estandarizado (OBLIGATORIO — el owner lo copia al chat orquestador)

1. Ventana y estado (HECHA / PARCIAL / BLOQUEADO + motivo).
2. Commits (hash + subject) y confirmación de que **NO** pusheaste.
3. Specs creadas/modificadas + changes propuestos.
4. Números: tests X/Y, tsc/eslint OK, y las métricas propias de la ventana.
5. Desviaciones vs este prompt.
6. Pendientes heredados a la(s) ventana(s) siguiente(s).
7. Última línea exacta: `BITACORA_ENTRY: <resumen 2-3 líneas>`
