> **Este archivo ES tu prompt.** Ventana 5 de la serie revision.
> Léelo completo (incluido `00-plan.md` de la serie) y ejecuta sus bloques en orden.

## Contexto común (válido para TODA la serie revision)

Project: Compass (Next.js 16 + TypeScript + Prisma + SQLite + Auth.js + Zustand persist).
Método del proyecto: por cada cambio → openspec-propose → implementar con openspec-apply-change
→ validar → commitear (conventional español) → sincronizar specs mains y archivar con
openspec-archive-change → skill nsgc-prepush antes de cualquier push.
Reglas permanentes: dato de dominio solo vía acciones del store (repository + StoreResult);
mocks de data/ son solo seed; D1 media por referencia (sin base64/Blob); secretos jamás en
localStorage ni código; cada cambio de esquema del store = bump STORE_VERSION + migrate + test.
Verificación por ventana: cd k0mp4ss_fe/apps/web && npx tsc --noEmit && npm run lint (0 errores)
&& npm test (suite completa verde) + openspec validate --all sin fallos.
`next build` puede fallar por red (Google Fonts): ignóralo salvo ventana de deploy.
No commitear Untitled.md. Si tu contexto se agota: cierra la tarea en curso + commit + deja
el estado exacto en openspec/SERIE-REVISION/00-plan.md.

Estado previo: STORE_VERSION = 27, tests 515/516 pasan (1 roto en RA), e2e 86/88 pasan,
build limpio, tsc limpio, lint 43 warnings (0 errores), último commit 7108e1c.

## Arranque: verificación de la ventana anterior (antes de tu alcance)

1. `git status` (tree limpio) y `git status -sb` (sin "ahead": todo pusheado) y `git log --oneline -8`.
2. `openspec validate --all` → sin fallos.
3. `cd k0mp4ss_fe/apps/web && npm test` → suite completa verde.
4. Contrasta con `openspec/SERIE-REVISION/00-plan.md`:
   - Filas P1–P4 HECHAS y todo OK → marca tu fila EN CURSO y continúa.
   - HECHA pero algo falla → ARREGLA primero, anótalo en la Bitácora, y solo después empieza.
   - PARCIAL o repo a medias → completa ESE alcance antes del tuyo.
5. Nunca marques tu fila EN CURSO si lo anterior no está cerrado.

## Alcance de esta ventana (P5 — Tests, Cobertura, Documentación y Cierre)

Objetivo: Analizar cobertura, identificar gaps, estabilizar tests, y cerrar la serie con
archivo openspec consolidado.

### Tarea 5.1 — Análisis de cobertura

- Correr `cd k0mp4ss_fe/apps/web && npx vitest run --coverage`
- Identificar archivos con cobertura < 50% que sean críticos (lib/store.ts, lib/authz.ts,
  lib/schemas.ts, middleware, route handlers)
- Identificar funciones/módulos SIN tests (¿sync FI→BD? ¿ABAC contextual? ¿CSP middleware?)
- Documentar top 10 archivos que más necesitan tests

### Tarea 5.2 — Estabilización de tests flaky

- Revisar tests que usan `Date.now()` o `Math.random()` sin mock:
  - `lib/store.ts` tiene `registrarEvaluacionPE` con `Date.now()` y `Math.random()`
  - Buscar otros casos similares
- Revisar tests async con timeouts ajustados (pe-panels usa `testTimeout: 20_000`)
- Verificar que los stubs de jsdom (ResizeObserver, scrollIntoView, etc.) están en todos
  los tests que necesitan Radix
- Si hay tests inestables: aplicar mocks determinísticos o aumentar timeouts con justificación

### Tarea 5.3 — Documentación de hallazgos de toda la serie

- Crear `openspec/changes/revision-integraal/` (o similar) como change openspec que consolide
  los hallazgos de P2, P3, P4:
  - `findings.md`: todos los hallazgos de seguridad + arquitectura + tests
  - `tasks.md`: tareas derivadas priorizadas (Critical/High → hacer primero; Medium → backlog;
    Low → nice to have)
  - `security-report.md`: resumen ejecutivo de seguridad para el owner
- Si el change no toca código (solo documentación), puede archivarse inmediatamente.

### Tarea 5.4 — Actualización de BACKLOG-100.md

- Leer `openspec/BACKLOG-100.md`
- Si la serie descubrió nuevos ítems de frontera o deuda técnica, añadirlos en sección
  "Hallazgos de la Revisión 2026-09"
- No modificar C1-C4 existentes (están cerrados), pero sí añadir referencias cruzadas

### Tarea 5.5 — Cierre de serie

- Actualizar `openspec/SERIE-REVISION/00-plan.md`: marcar P5 HECHA, añadir bitácora con
  fecha y resumen
- Verificar que no queden changes activos sin archivar en `openspec/changes/`
- `git status` limpio, todo commiteado
- Opcional: si el owner aprueba, ejecutar `skill nsgc-prepush` y push

## Verificación obligatoria antes de reportar

```bash
cd k0mp4ss_fe/apps/web
npx tsc --noEmit
npm run lint
npm test
npx vitest run --coverage  # reportar coverage summary
openspec validate --all
```

## Reporte final estandarizado (OBLIGATORIO)

1. Ventana y estado (HECHA/PARCIAL + motivo).
2. Commits (hash + subject) y push sí/no.
3. Specs creadas/modificadas + changes archivados.
4. Números: STORE_VERSION, tests X/Y, tsc/eslint OK, coverage %, hallazgos totales.
5. Desviaciones vs el prompt.
6. Pendientes heredados post-serie (qué queda para el owner decidir).
7. Última línea exacta: `BITACORA_ENTRY: <resumen 2-3 líneas>`.
