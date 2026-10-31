> **Este archivo ES tu prompt.** Ventana 1 de la serie **frontera**.

## Contexto común (válido para TODA la serie)

- Proyecto Compass. Front: `k0mp4ss_fe/apps/web`. Estado: Vitest 425/425, e2e crud 28 specs,
  CI 3/3 verde, repo limpio en main. Lee SIEMPRE `openspec/SERIE-FRONTERA/00-plan.md`
  (decisiones de diseño, roadmap, bitácora) y `openspec/BACKLOG-100.md` (contexto C1-C4).
- Método por ventana: openspec change completo (propose → apply → validate) → commit
  conventional español → nsgc-prepush → push → archive (git status LIMPIO tras archive) →
  fila HECHA + Bitácora con hash. Validación: tsc 0 · lint 0 errores · Vitest completo con
  número REAL · e2e de la ventana · `openspec validate --all`.
- Confía en el CÓDIGO sobre el plan si un label difiere; anota desviaciones en la Bitácora.
- Si el contexto se agota: cierra la tarea en curso, commitea y deja el estado exacto en 00-plan.md.
- Reporta al final: cambios, verificaciones con NÚMEROS REALES, commits con hash, pendientes.

## Arranque (Ventana 1: lectura inicial)

1. Lee `openspec/SERIE-FRONTERA/00-plan.md` completo y `openspec/BACKLOG-100.md` §C2.
2. Verifica repo: `git status` limpio y pusheado, `git log --oneline -5`, Vitest 425/425.
3. Marca tu fila P1 como EN CURSO en 00-plan.md.

## Alcance P1 — C2: guard QA Lab → confirmación "Limpiar y poblar de una vez"

**Objetivo:** que "Poblar todo de una vez" sea idempotente desde la UI: si hay datos TEST-*,
en vez de bloquear, ofrece confirmación para limpiar y poblar automáticamente.

1. **openspec-propose** `qa-lab-poblado-idempotente`: capability `DEV-qa-lab` (delta ADDED
   requirement "Poblado idempotente": WHEN existen datos TEST-* AND el usuario confirma la
   acción THEN el sistema ejecuta limpiar() seguido del poblado completo sin intervención
   adicional AND el resultado final es "Carga completa OK" con 22/22 fases; WHEN cancela
   THEN no se muta nada). ADDED (lección rp-permisos-visor: ADDED si el requirement no existe).
2. **Implementar** en `app/admin/qa-lab/page.tsx`:
   - El guard de `runFase` (búsqueda: "Existen datos TEST-*") deja de retornar error: abre un
     Dialog de confirmación "Existen datos TEST-* — ¿Limpiar y poblar de una vez?" con
     botones "Limpiar y poblar" (destructive/primary) y "Cancelar" (no muta nada).
   - Al confirmar: ejecutar la MISMA secuencia de `limpiar()` (incluido esperar
     "TEST-* limpio correctamente" con su mensaje) y luego `runFase("todo")`. Reutiliza las
     funciones existentes; NO toques `lib/store.ts` ni STORE_VERSION.
   - Sin datos TEST-*: comportamiento actual intacto (pobla directo).
3. **e2e** `e2e/crud/poblado-idempotente.spec.ts`:
   - Poblar → esperar "Carga completa OK" (patrón `e2e/flujo/poblamiento.spec.ts`, timeout
     generoso, click con evaluate si force falla).
   - Poblar de NUEVO → aparece el Dialog de confirmación → confirmar → limpiar+poblar →
     "Carga completa OK" de nuevo → `validar()`... no: afirmar vía la UI del lab que las
     22 tarjetas están 🟢 Listo (`[id^="mod-"]` como el ciclo.spec.ts) y 0 🔴 Con error.
   - Cancelar en el dialog → no cambia nada (mensaje del guard previo ya no aplica; afirma
     que las tarjetas siguen 🟢 y sin errores).
   - `expect(errores).toEqual([])` al cierre.
4. **No romper**: la suite existente `e2e/flujo/` (poblamiento/ciclo) usa el flujo limpiar→
   poblar explícito — sigue válida porque sin datos TEST el guard no interviene. Corre
   `e2e/flujo/ciclo.spec.ts` como parte de la verificación.

## Verificación

`npx tsc --noEmit` (0) · `npm run lint` (0 errores) · `npx vitest run` (425/425 REAL) ·
`npx playwright test e2e/crud/poblado-idempotente.spec.ts e2e/flujo/ciclo.spec.ts` verde ·
`openspec validate --all` · commit · nsgc-prepush · push · archive (git status limpio) ·
Bitácora P1 HECHA con hash.
