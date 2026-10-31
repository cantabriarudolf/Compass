> **Este archivo ES tu prompt.** Ventana P1 de la serie noche-2.
> Leélo completo (incluido `openspec/SERIE-NOCHE-2/00-plan.md`) y ejecutá sus bloques en orden.
> Modo noche: **no pidas confirmaciones al owner**. Si un gate falla dos veces, marcá la ventana
> BLOQUEADO en la tabla del plan con la evidencia y seguí (o cerrá la serie si sos la última).

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

## Arranque (P1 — abre la serie)
1. `git status -sb` (tree limpio y `main` sincronizado con `origin/main`) + `git log --oneline -6`.
2. `openspec validate --all` → sin fallos.
3. Crear y cambiar a la rama de la serie: `git switch -c noche/serie-noche-2`.
4. `cd k0mp4ss_fe/apps/web && npm test` → 967/967 verdes (si algo falla, ARREGLALO primero con un
   commit `fix(...)` y anotalo en la Bitácora).
5. Marcar tu fila P1 como `EN CURSO` en `openspec/SERIE-NOCHE-2/00-plan.md` (commit aparte o en el
   primer commit de la ventana).

## Alcance de P1 — `qlab-purga-bulk`
**Problema (medido)**: la purga del QA-Lab (`app/admin/qa-lab/page.tsx` → `limpiar()`) borra cada
entidad TEST con **una request HTTP propia**. Tras un poblamiento completo (cientos de entidades:
cobros FI, emisiones, reservas RA, trabajos MT, unidades, vínculos, maestros) la operación
excede los 120 s en el runner de CI (5-11 s local con la misma secuencia). Por eso la limpieza de
**cola** de `e2e/crud/poblado-idempotente.spec.ts` y `e2e/flujo/ciclo.spec.ts` quedó best-effort
documentada (espera 90 s y acepta seguir en curso). Evidencia: `design.md` del change archivado
`openspec/changes/archive/2026-10-12-ci-verde-ratchet-cobertura/design.md` (§ D6 punto 6) y las
filas de `openspec/BACKLOG-100.md`.

**Objetivo**: que la purga sea O(1) requests desde el cliente y que las dos limpiezas de cola
vuelvan a ser estrictas.

**Tareas**:
1. Change openspec `qlab-purga-bulk` (propose → apply): proposal, tasks, design y delta de spec en
   la capability existente `LAB-mejoras` (leer `openspec/CONVENCION-DELTAS.md` ANTES de escribir el
   delta; correr `node openspec/scripts/check-delta-coverage.mjs qlab-purga-bulk` hasta que dé ok).
2. Implementar un endpoint server-side de purga TEST por comunidad, p. ej.
   `POST /api/qa-lab/purga-test` (ruta nueva, runtime Node), que:
   - respete el guard de entorno (`lib/env-guard.ts`, `isWriteApiEnabled()` → 404 fuera de dev/test);
   - exija sesión y permiso de administración de la comunidad (mismo patrón que
     `app/api/qa-lab/qa-estado` / `withComunidadScope`);
   - borre **solo** ids con prefijo `test-` (nunca datos reales), en orden hijos→padres
     (cobros/emisiones → fondos/egresos → reservas/elementos → trabajos/proyectos → unidades/
     vínculos → personas → maestros), por comunidad;
   - devuelva `{ borrados: Record<string, number>, bloqueos: string[] }` con los 409/conflictos
     reales (no inventar: si una entidad no se puede borrar, va a `bloqueos` con su motivo);
   - sea idempotente (segunda corrida = 0 borrados, sin errores).
3. En `limpiar()` (`app/admin/qa-lab/page.tsx`), usar ese endpoint como camino principal y dejar el
   bucle por entidad actual **solo como fallback** si el endpoint responde error (documentado).
   Mantener intactos: el mensaje verde `TEST-* limpio correctamente`, el mensaje rojo
   `Limpieza con N bloqueos (dependencias): …` y la semántica de `errores`.
4. Tests (TDD: primero el test rojo): `test/api/qa-lab-purga.test.ts` con BD real —
   401 sin sesión, 404 con el guard apagado, 403 sin permiso, 200 con conteos correctos,
   idempotencia (2ª corrida = 0 borrados) y que **no borre** una entidad sin prefijo `test-`.
5. Re-endurecer las dos limpiezas de cola: en `e2e/crud/poblado-idempotente.spec.ts` y
   `e2e/flujo/ciclo.spec.ts` volver a `await expect(page.getByText(/TEST-\* limpio correctamente/))
   .toBeVisible({ timeout: 120_000 })` (quitar el best-effort y su comentario de deuda).

**Gate de la ventana**:
- `npx tsc --noEmit` 0 errores; `npm test` 967+ verdes (sumá los tests nuevos) con pisos por área;
  `openspec validate --all` sin fallos; `check-delta-coverage` ok para `qlab-purga-bulk`.
- e2e dirigida con paridad CI sobre base descartable fresca:
  `prisma migrate deploy --schema=prisma/schema.sqlite.prisma` + `npm run e2e:reseed-base` sobre
  `DATABASE_URL=file:./perf-noche.db`, build de producción
  (`DATABASE_URL=file:./perf-noche.db AUTH_SECRET=ci-e2e-secret-no-produccion NEXT_PUBLIC_APP_ENV=development GOOGLE_CLIENT_ID=ci-dummy GOOGLE_CLIENT_SECRET=ci-dummy npm run build`)
  y `CI=1 … npx playwright test e2e/crud/poblado-idempotente.spec.ts e2e/flujo/ciclo.spec.ts e2e/flujo/poblamiento.spec.ts --reporter=list`
  → **todo verde sin flaky**.
- Medir y reportar el tiempo de purga antes/después (script Playwright ad-hoc fuera del repo o
  contando requests): el número es la evidencia de que el bulk funcionó.

## Cierre de la ventana
- `nsgc-prepush`: avance en `Data/NSGC/docs/avances/avance - <fecha> <hh-mm>.md` + manual
  `Data/NSGC/docs/manuales/34 - Historia de Poblamiento - Relato de Uso.md` (sección de purga) +
  Trazabilidad si cambia un estado.
- Commits (uno por work-unit) y push de la rama: `git push -u origin noche/serie-noche-2`.
- Actualizar la fila P1 del plan a `HECHA` + Bitácora, y commitear ese cambio.
- Actualizar `openspec/BACKLOG-100.md`: la fila de `qlab-purga-bulk` pasa a ✅ HECHA.

## Reporte final estandarizado (OBLIGATORIO — lo copia el orquestador)
1. Ventana y estado (HECHA/PARCIAL/BLOQUEADO + motivo). 2. Commits (hash + subject) y push sí/no.
3. Specs/changes creados, archivados o modificados. 4. Números: tests X/Y, tsc OK, tiempo de
purga antes/después, requests de la purga antes/después. 5. Desviaciones vs este prompt.
6. Pendientes heredados a la próxima ventana. 7. Última línea exacta:
`BITACORA_ENTRY: <resumen 2-3 líneas>`
