> **Este archivo ES tu prompt.** Ventana P6 de la serie noche-3.
> Leélo completo (incluido `openspec/SERIE-NOCHE-3/00-plan.md`) y ejecutá sus bloques en orden.
> Modo noche: **no le pidas confirmaciones al owner**. Si un gate falla dos veces, marcá la ventana
> BLOQUEADO en la tabla del plan con la evidencia y seguí.

## Contexto común (válido para TODA la serie noche-3)
Proyecto Compass: Next 16 + TypeScript estricto + Prisma, monorepo `k0mp4ss_fe/` (app en
`k0mp4ss_fe/apps/web`, UI en `packages/ui`). Tests: Vitest (`test/`, 993 verdes con pisos de
cobertura por área) + Playwright (`e2e/`, lanes crud/flujo/smoke/auth/a11y). Estado de partida:
rama `noche/serie-noche-3` (creada desde `main` `846e3e4`); PR #1 (`noche/serie-noche-2`, draft,
CI verde) es del ciclo anterior y **no se toca**; censo del store y deuda viva en
`openspec/BACKLOG-100.md` + memoria Engram obs. 205.
Node: `export PATH="$HOME/.nvm/versions/node/v24.21.0/bin:$PATH"`.
Método del proyecto: todo cambio → change openspec (propose → apply → archive). Antes de escribir
cualquier delta: leer `openspec/CONVENCION-DELTAS.md` y correr
`node openspec/scripts/check-delta-coverage.mjs <change>` hasta que dé
`0 que romperían el archive`. Commits convencionales en español, un commit por work-unit,
automáticos al cerrar cada trabajo, commiteando SOLO los archivos del cambio. Skill `nsgc-prepush`
obligatoria antes de cada push (avance en `Data/NSGC/docs/avances/`, manual de módulo si cambia
comportamiento o estructura, Trazabilidad si cambia un estado).
Reglas duras: `STORE_VERSION = 28` congelado (no se toca el shape persistido; si algo lo exigiera
se marca BLOQUEADO, no se improvisa); nunca tocar `prisma/dev.db` ni `Data/NSGC/backups/` (las
corridas usan bases descartables `prisma/perf*.db`); nunca secretos en código ni docs; el término
oficial es **comunidad** ("condominio" no se usa nunca, RG §4); **modo noche: no le pidas
confirmaciones al owner**.
Verificación por ventana: `cd k0mp4ss_fe/apps/web && npx tsc --noEmit && npm test` (pisos por área)
+ `openspec validate --all` sin fallos + `check-delta-coverage` del change que toques.
e2e con paridad CI: `npm run e2e:fresh` (crea base descartable, siembra e imprime el comando
Playwright exacto) y **nunca** correr el spec de rate-limit antes de la lane (bloquea la IP 15 min
y aborta `auth.setup`).

## Arranque: verificación de la ventana anterior (antes de tu alcance)
1. `git status` limpio y `git status -sb` **sin "ahead"** (todo pusheado) + `git log --oneline -8`.
2. **CI del push anterior**: `gh run list --branch noche/serie-noche-3 --limit 3` → el run del
   commit de P5 debe figurar `success` (el job de deploy puede figurar `skipped`). Si figura
   `failure`/`cancelled`: diagnosticá la causa, arreglala (commit `fix(...)` + test) y anotalo en
   la Bitácora **antes** de tu alcance. Si la API de GitHub no responde, reintentá una vez; si
   sigue caída, dejá constancia en la Bitácora y seguí (no bloquea tu alcance).
3. **Archives pendientes (obligatorio en esta ventana si el CI está verde)**:
   `store-cleanup` (P1) y `st-split-fase2` (P5, ya 19/19) — por cada uno:
   `node openspec/scripts/check-delta-coverage.mjs <change>` → `openspec archive <change> --yes` →
   `openspec validate --all` → commit `docs(openspec): archiva <change> (CI verde <run>)` + push.
   **Nunca archives sin CI verde observada** (si el run anterior está rojo, arreglalo primero).
4. `openspec validate --all` → sin fallos.
5. `cd k0mp4ss_fe/apps/web && npm test` → suite verde con los pisos por área.
6. Contrastá con `openspec/SERIE-NOCHE-3/00-plan.md`: fila P5 `HECHA` → marcá la tuya `EN CURSO`;
   `HECHA` pero con algo roto → arreglalo primero; `PARCIAL`/`BLOQUEADO` → completá o documentá ese
   alcance antes del tuyo.

## Alcance de P6 — `api-cobertura-fases`, fase 1 (subir la cobertura real de `app/api/**`)
Contexto: la superficie API quedó en **79.40%** de statements (2.114 sin cubrir) según
`openspec/changes/archive/2026-10-12-ci-verde-ratchet-cobertura/design.md` (§Deuda); las más bajas:
`app/api/personas` **70.54%**, `app/api/unidades`, `app/api/vinculos`. La deuda es del change
propio `api-cobertura-fases`: esta ventana lo **propone** y hace la primera fase.

**Tareas**:
1. Change openspec `api-cobertura-fases` (propose → apply) con delta `MODIFIED` en la capability
   viva donde vive el ratchet de cobertura (mirá el delta del change archivado
   `2026-10-12-ci-verde-ratchet-cobertura` y usá la misma capability y prosa base).
2. **Medir de verdad primero**: `cd k0mp4ss_fe/apps/web && npm test -- --coverage` (o el reporte
   `coverage/`) y listar las carpetas de `app/api/**` con menor cobertura de statements. Elegí las
   **3 más bajas** (si el conteo no coincide con el histórico, vale tu medición: anotala).
3. Escribir tests **reales** (no de líneas) para esas rutas, siguiendo el molde de `test/api/`
   (helpers y fixtures existentes; BD SQLite de test; sin mocks de Prisma): por cada handler cubrí
   camino feliz, validación (400) y guardias (401 sin sesión, 403 sin permiso, 404 por scope de
   comunidad). Los tests se hacen contra la interfaz pública (los handlers exportados), no contra
   detalles internos.
4. **Subir los pisos** en `k0mp4ss_fe/apps/web/vitest.config.ts` con la regla del ratchet
   (`app/api/**` = medido − 1 punto). **Nunca bajar** un piso existente; si tu medición quedara por
   debajo del piso vigente, investigá la causa (es un hallazgo, no un ajuste).
5. Anotar en el avance: cobertura antes/después por carpeta, tests agregados y pisos nuevos.
6. Actualizar `openspec/changes/api-cobertura-fases/tasks.md` (fase 1 completa; dejá declaradas las
   fases siguientes para P7).

**Gate de la ventana**:
- `npx tsc --noEmit` 0 errores · `npm test` verde **con los pisos nuevos** aplicados ·
  `openspec validate --all` sin fallos · `check-delta-coverage` ok para `api-cobertura-fases`.
- Evidencia numérica del salto: cobertura de `app/api/**` antes (del reporte) y después.

**Archivos que podés tocar**: `openspec/changes/api-cobertura-fases/**`,
`k0mp4ss_fe/apps/web/test/**` (tests nuevos y helpers si hace falta),
`k0mp4ss_fe/apps/web/vitest.config.ts` (solo el bloque `thresholds`),
`Data/NSGC/docs/avances/**`, `openspec/SERIE-NOCHE-3/00-plan.md`.

**Cierre de la ventana**: commit + push (con `nsgc-prepush` hecho), fila P6 → `HECHA` con el commit
final y entrada en la Bitácora (con los números de cobertura y el run de CI pendiente de verificar
por P7).

## Reporte final estandarizado (OBLIGATORIO — el owner lo copia al chat orquestador)
1. Ventana y estado (HECHA / PARCIAL / BLOQUEADO + motivo).
2. Commits (hash + subject) y push sí/no.
3. Specs creadas/modificadas + changes propuestos/archivados (incluye los archives que hayas hecho
   por P1/P5).
4. Números: `STORE_VERSION`, tests X/Y, tsc/eslint OK, cobertura `app/api/**` antes/después y por
   carpeta, pisos nuevos, e2e si aplica.
5. Desviaciones vs este prompt.
6. Pendientes heredados a la(s) ventana(s) siguiente(s).
7. Última línea exacta: `BITACORA_ENTRY: <resumen 2-3 líneas>`
