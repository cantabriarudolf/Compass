> **Este archivo ES tu prompt.** Ventana P2 de la serie noche-2.
> Leélo completo (incluido `openspec/SERIE-NOCHE-2/00-plan.md`) y ejecutá sus bloques en orden.
> Modo noche: **no pidas confirmaciones al owner**. Si un gate falla dos veces, marcá la ventana
> BLOQUEADO en la tabla del plan con la evidencia y seguí.

## Contexto común (válido para TODA la serie noche-2)
Proyecto Compass: Next 16 + TypeScript estricto + Prisma en el monorepo `k0mp4ss_fe/` (app en
`k0mp4ss_fe/apps/web`, UI en `packages/ui`). Tests: Vitest (`test/`, 967 verdes con pisos de
cobertura por área) + Playwright (`e2e/`). Estado de partida: CI verde completo en el run
`38330292787` (HEAD `ba40be2`); changes `qlab-poblamiento-api-rest` y `ci-verde-ratchet-cobertura`
archivados; deuda viva en `openspec/BACKLOG-100.md` y en el avance
`Data/NSGC/docs/avances/avance - 2026-10-12 14-15.md`.
Node: `.nvmrc` = 24, `engines.node` = `>=24`, local 24.21.0 →
`export PATH="$HOME/.nvm/versions/node/v24.21.0/bin:$PATH"`.
Reglas permanentes del proyecto: toda feature/fix → change openspec (propose → apply → archive);
terminología RG §4 (el término oficial es **comunidad**, "condominio" no se usa nunca); commits
convencionales en español, automáticos al cerrar cada trabajo, commiteando solo los archivos del
cambio; skill `nsgc-prepush` obligatoria antes de cualquier push; nunca tocar
`prisma/dev.db` ni `Data/NSGC/backups/`; nunca secretos en código ni docs.
Verificación por ventana: `cd k0mp4ss_fe/apps/web && npx tsc --noEmit && npm test` +
`openspec validate --all` + `node openspec/scripts/check-delta-coverage.mjs`.
Regla de la lane e2e: base fresca y **nunca** correr el spec de rate-limit antes de la lane.
Comando e2e con paridad CI (base descartable fresca + build de producción):
`CI=1 DATABASE_URL=file:./perf-noche.db AUTH_SECRET=ci-e2e-secret-no-produccion NEXT_PUBLIC_APP_ENV=development GOOGLE_CLIENT_ID=ci-dummy GOOGLE_CLIENT_SECRET=ci-dummy npx playwright test <specs> --reporter=list`

## Arranque (verificación de la ventana anterior)
1. `git status` (tree limpio), `git status -sb` (sin "ahead": todo pusheado) y `git log --oneline -8`.
2. `openspec validate --all` → sin fallos.
3. `cd k0mp4ss_fe/apps/web && npm test` → suite completa verde.
4. Contrastá con `openspec/SERIE-NOCHE-2/00-plan.md`:
   - P1 HECHA y todo OK → marcá tu fila EN CURSO y continuá.
   - P1 HECHA pero algo falla → ARREGLALO primero (commit `fix(...)` + test) y anotalo.
   - P1 PARCIAL o BLOQUEADO → completá ese alcance antes del tuyo (derivá de la Bitácora y del
     prompt-01.md, que es autocontenido).
5. Nunca marques tu fila EN CURSO si lo anterior no está cerrado.

## Alcance de P2 — helper compartido de guardado en diálogos (e2e)
**Problema (medido)**: varios specs CRUD guardan con un patrón repetido a mano — click a
"Guardar/Publicar", y si el diálogo sigue visible, `requestSubmit()` **otra vez** (hasta 3 veces).
Eso **duplica filas**: se verificó en la base `avisos_cv` con DOS filas del mismo título
(`cv-1791834049113-67sra2` y `cv-1791834049909-v10a6b`) y `crud/proyectos` reventó con
`strict mode violation: resolved to 2 elements`. El spec `e2e/crud/visor.spec.ts` ya se arregló
a mano (single-shot + `toHaveCount(1)`); el resto puede tener el mismo defecto dormido.
Evidencia: fila de `openspec/BACKLOG-100.md` ("Barrido del patrón re-submit…") y `design.md` del
change archivado `openspec/changes/archive/2026-10-12-ci-verde-ratchet-cobertura/design.md` (§ D6).

**Tareas**:
1. Inventariar el patrón: `grep -rn "requestSubmit" k0mp4ss_fe/apps/web/e2e/` y listar los specs
   afectados (excluí `logs.spec.ts`, que ya usa el endpoint de ingesta, y `visor.spec.ts`, que ya
   está arreglado — si querés, migralo también al helper para homogeneizar).
2. Crear `k0mp4ss_fe/apps/web/e2e/helpers/form-dialog.ts` con un contrato **single-shot
   idempotente** y tipado, por ejemplo:
   `export async function guardarDialogo(page, { boton, fila?, timeoutMs? }): Promise<void>` que
   (a) clickea el botón una vez (si el click falla → `requestSubmit()` una sola vez),
   (b) espera `dialog` oculto, (c) **solo si sigue visible y la fila todavía no existe** hace un
   único submit más, y (d) cuando recibe `fila`, asserta `toHaveCount(1)` para que un duplicado
   falle ruidoso. Documentá en el archivo, en español, por qué es single-shot.
3. Migrar los specs afectados, uno por vez y del más chico al más grande, corriendo cada uno
   después de migrarlo.
4. Si algún spec revela un duplicado real en BD, **no lo tapes**: anotá el hallazgo (tabla + id) en
   la Bitácora y dejá la aserción de unicidad puesta.

**Gate de la ventana**:
- `npx tsc --noEmit` 0 errores y `npm test` verde (no debería cambiar la suite).
- Todos los specs migrados verdes con paridad CI sobre base descartable fresca
  (`npx prisma migrate deploy --schema=prisma/schema.sqlite.prisma` + `npm run e2e:reseed-base`
  + build de producción + `npx playwright test <specs migrados> --reporter=list`).
- Chequeo de duplicados al terminar (read-only con better-sqlite3, sin escribir en el repo):
  `SELECT titulo, COUNT(*) c FROM avisos_cv GROUP BY titulo HAVING c > 1` (y equivalentes de las
  tablas que toquen los specs migrados) → sin filas.

## Cierre de la ventana
- `nsgc-prepush`: avance de la serie (mismo archivo si ya existe uno de la noche; si no, creá
  `Data/NSGC/docs/avances/avance - <fecha> <hh-mm>.md`) + nota breve en
  `k0mp4ss_fe/apps/web/docs/runbook-operaciones.md` si agregás comandos nuevos.
- Commits (uno por work-unit: helper, migraciones por grupo de specs) y push de la rama.
- Actualizar la fila P2 del plan a `HECHA` + Bitácora, y commitear ese cambio.

## Reporte final estandarizado (OBLIGATORIO)
1. Ventana y estado (HECHA/PARCIAL/BLOQUEADO + motivo). 2. Commits (hash + subject) y push sí/no.
3. Specs migrados (lista) y helper creado. 4. Números: specs verdes X/Y, tsc OK, duplicados
encontrados (tabla + id) o "ninguno". 5. Desviaciones vs este prompt.
6. Pendientes heredados a la próxima ventana. 7. Última línea exacta:
`BITACORA_ENTRY: <resumen 2-3 líneas>`
