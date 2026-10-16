> **Este archivo ES tu prompt.** Ventana P6 de la serie deuda-1.
> Léelo completo (incluido `openspec/SERIE-DEUDA-1/00-plan.md`) y ejecutá sus bloques en orden.

## Contexto común (válido para TODA la serie deuda-1)

Proyecto Compass: Next 16 + TypeScript estricto + Prisma, monorepo `k0mp4ss_fe/` (app en
`k0mp4ss_fe/apps/web`). Tests: Vitest (`test/`, 1078 verdes con pisos por área) + Playwright
(`e2e/`, lanes crud/flujo/smoke/auth/a11y). Estado de partida: rama `serie/deuda-1` cortada del
tip de SERIE-NOCHE-3 (`1b23219`): store de 5.219 líneas con 7 slices, `STORE_VERSION = 28`,
pisos global 90/80/90/90 · `lib/**` 96/90/98/96 · `app/api/**` 82/67/85/82.
Node: `export PATH="$HOME/.nvm/versions/node/v24.21.0/bin:$PATH"`.

Método del proyecto: todo cambio → change openspec (propose → apply → archive). Antes de escribir
cualquier delta: leer `openspec/CONVENCION-DELTAS.md` y correr
`node openspec/scripts/check-delta-coverage.mjs <change>` hasta que dé `0 que romperían el archive`.
Commits convencionales en español, un commit por work-unit, automáticos al cerrar cada trabajo,
commiteando SOLO los archivos del cambio. Skill `nsgc-prepush` obligatoria antes de cada push
(avance en `Data/NSGC/docs/avances/`; manual de módulo si cambia comportamiento o estructura;
Trazabilidad si cambia un estado).

Reglas duras: `STORE_VERSION = 28` congelado; nunca tocar `prisma/dev.db` ni `Data/NSGC/backups/`
(las corridas e2e usan bases descartables `prisma/perf*.db`); nunca secretos en código ni docs; el
término oficial es **comunidad** ("condominio" no se usa nunca, RG §4); **no le pidas
confirmaciones al owner** (si un gate falla dos veces: ventana BLOQUEADO con evidencia exacta y
seguir).

Verificación por ventana: `cd k0mp4ss_fe/apps/web && npx tsc --noEmit && npm run lint && npm test`
(pisos por área) + `openspec validate --all` sin fallos + `check-delta-coverage` del change tocado.
e2e con paridad CI: `npm run e2e:fresh` (lo crea la ventana 1 de la serie; imprime el comando
Playwright exacto) y **nunca** correr el spec de rate-limit antes de la lane (bloquea la IP 15 min
y aborta `auth.setup`).

## Arranque: verificación de la ventana anterior (antes de tu alcance)

1. `git status` limpio y `git status -sb` **sin "ahead"** (todo pusheado) + `git log --oneline -8`.
2. **Fingerprint de base**: pisos `lib/**` 96/90/98/96 y global 90/80/90/90 en
   `vitest.config.ts`, 7 slices en `lib/store/slices/` y suite ≥ 1078. Si falta, pará y reportá qué
   base encontraste (no improvises un rebase).
3. **CI del push anterior**: `gh run list --branch serie/deuda-1 --limit 3` → el run del commit de
   P5 debe figurar `success` (deploy `skipped` es esperado). Si figura `failure`/`cancelled`:
   diagnosticá la causa, arreglala (commit `fix(...)` + test) y anotalo en la Bitácora **antes** de
   tu alcance. Si la API de GitHub no responde, reintentá una vez; si sigue caída, dejá constancia
   en la Bitácora y seguí (no bloquea tu alcance).
4. **Archives pendientes**: archivá `store-cobertura-fase-c` con CI verde observada
   (`check-delta-coverage` → `openspec archive store-cobertura-fase-c --yes` → `openspec validate
   --all` → commit `docs(openspec): archiva store-cobertura-fase-c (CI verde <run>)` + push).
   **Nunca archives sin CI verde observada**; si quedó incompleto, no lo archives: declaralo como
   deuda con su estado.
5. `openspec validate --all` → sin fallos.
6. `cd k0mp4ss_fe/apps/web && npm test` → suite verde con los pisos vigentes.
7. Contrastá con `openspec/SERIE-DEUDA-1/00-plan.md`: fila P5 `HECHA` → marcá la tuya `EN CURSO`;
   `HECHA` pero con algo roto → arreglalo primero; `PARCIAL`/`BLOQUEADO` → completá o documentá ese
   alcance antes del tuyo.

## Alcance de P6 — `higiene-prosa-store-cleanup`: prosa de specs/manuales y `CF_UPDATE_PARAM`

Contexto: `store-cleanup` (P1 de noche-3) podó 28 acciones del store, pero quedaron **11 specs
vivas** y **4 manuales NSGC** que las nombran, y el evento **`CF_UPDATE_PARAM` quedó sin emisor**
(gap preexistente de la migración CF→API). Es deuda **documental**: sin cambios de comportamiento.

**Tareas**:

1. **Diagnóstico primero (evidencia en la Bitácora/avance)**: listar con `rg` las specs vivas
   (`openspec/specs/**`) y los manuales (`Data/NSGC/docs/manuales/**`) que nombran acciones podadas
   (usar la lista del censo de `store-cleanup`: las 28 acciones podadas). Confirmar la lista real,
   no la declarada.
2. Change openspec `higiene-prosa-store-cleanup` (propose → apply) — o más de uno si el diagnóstico
   lo justifica; cada delta `MODIFIED` debe llevar **todos** los escenarios existentes con sus
   nombres exactos (trampa 1 de `CONVENCION-DELTAS.md`) y `check-delta-coverage` debe dar `0 que
   romperían el archive`. Prosa factual: la spec viva describe el estado actual, sin notas
   históricas en el cuerpo.
3. **`CF_UPDATE_PARAM`**: documentar el estado real del gap donde corresponda (spec/design del
   dominio). **No inventes** comportamiento nuevo: si ya existe una ruta/acción que debería emitir
   el evento, cableala con su test; si no existe, dejalo declarado como deuda con la referencia
   exacta y su verificación pendiente.
4. **Manuales NSGC (4)**: actualizarlos con `nsgc-prepush` (prosa; sin cambiar comportamiento ni
   estructura). Trazabilidad (`03 - Mapa de Desarrollo y Trazabilidad.md`) si cambia un estado.
5. `openspec validate --all` sin fallos + `check-delta-coverage` de cada change + suite verde
   (no debería cambiar la cobertura: si cambia, no toques los pisos de cobertura en esta ventana;
   explain el motivo en el avance).
6. Cerrar: commit(s) + push (con `nsgc-prepush`), fila **P6 HECHA** con el commit y entrada en la
   Bitácora.

**Gate de la ventana**: diagnóstico con la lista real · `validate --all` sin fallos ·
`check-delta-coverage` ok · `npx tsc --noEmit` 0 · `npm run lint` 0 · `npm test` verde.
e2e no aplica: sin cambios de runtime.

**Archivos que podés tocar**: `openspec/specs/**`, `openspec/changes/higiene-prosa-store-cleanup/**`,
`Data/NSGC/docs/manuales/**`, `Data/NSGC/docs/avances/**`, `openspec/SERIE-DEUDA-1/00-plan.md`.
Si el diagnóstico exigiera tocar código para emitir `CF_UPDATE_PARAM`, sumá solo los archivos de
ese cambio mínimo (con su test) — nunca refactors ni comportamiento nuevo no pedido.

## Reporte final estandarizado (OBLIGATORIO — el owner lo copia al chat orquestador)

1. Ventana y estado (HECHA / PARCIAL / BLOQUEADO + motivo).
2. Commits (hash + subject) y push sí/no.
3. Specs creadas/modificadas y manuales actualizados + changes propuestos/archivados.
4. Números: tests X/Y, tsc/eslint OK, y las métricas propias de esta ventana: cantidad de specs
   corregidas, manuales actualizados y estado final de `CF_UPDATE_PARAM` (cableado o deuda
   declarada con referencia).
5. Desviaciones vs este prompt.
6. Pendientes heredados a la(s) ventana(s) siguiente(s).
7. Última línea exacta: `BITACORA_ENTRY: <resumen 2-3 líneas>`
