# Tasks: fix-put-merge-scope

Ventana P2 de SERIE-DEUDA-1. Mandato: reproducir el 404 declarado con un test RED antes de tocar
código, diagnosticar el scope (comunidad/param/fila) y corregir el punto correcto con el cambio
mínimo. Resultado: **el 404 no se reproduce**; la causa real del rojo es un timeout del spec e2e
(fuera de alcance). Detalle en `design.md`.

- [x] **Reproducir primero (RED)**: `test/api/put-merge-scope.test.ts` con el escenario declarado
  (fila PROPIA existente + sesión de esa comunidad) con Prisma real, corriendo **antes** de tocar
  código de producto.
  Evidencia del primer intento (test RED **no** observado):
  ```
  $ npx vitest run test/api/put-merge-scope.test.ts
  ✓ test/api/put-merge-scope.test.ts (3 tests) 5319ms
  Test Files  1 passed (1)      Tests  3 passed (3)
  ```
  El test pasó verde desde el arranque ⇒ el defecto documentado **no existe en el estado actual**.
  (Se conservó el test como contrato; ver tarea 3.)
- [x] **Diagnóstico de la causa exacta** (comunidad / param / fila) con verificación de las 3
  hipótesis: `existente.comunidadId` y `scope.comunidadId` coinciden para una fila propia (200); el
  `param` de la ruta se resuelve contra la PK (`id String @id`); y los **24** modelos de las 24
  routes que usan `createPutMerge` declaran `id` + `comunidadId` (script de verificación sobre
  `prisma/schema.prisma`, 24/24 `OK`). Ninguna hipótesis explica un 404 con la fila existente.
- [x] **Causa real identificada y documentada**: timeout de test de 30 s
  (`playwright.config.ts`: `timeout: CI ? 30_000 : 120_000` con `CI=1` en `e2e:fresh`) agotado
  rellenando/guardando el formulario, **antes** del paso "Iniciar". Evidencia textual en
  `design.md` (misma línea 115 en los 3 intentos de la corrida 3 y en las corridas 1-2).
- [x] **Cambio mínimo en `lib/api/put-merge.ts`: ninguno.** El guard de scope es correcto y
  necesario (multi-tenant); "arreglarlo" degradaría el aislamiento. Decisión y justificación en
  `design.md` § Decisión.
- [x] **Tests de contrato** (`test/api/put-merge-scope.test.ts`, 4 casos, Prisma real):
  fila propia → **200** + fila mutada en BD · fila de **otra comunidad** → **404** con el mismo
  mensaje que un id inexistente y sin mutar · fila propia con rol sin `mt:editar` (residente) →
  **403** sin mutar · id inexistente → **404**.
  Resultado: `npx vitest run test/api/put-merge-scope.test.ts` → **4/4 verdes**.
- [x] **Change openspec `fix-put-merge-scope`** (propose) con `.openspec.yaml` `skip_specs: true`
  justificado: ninguna spec viva describe la regla de scope de los PUT parciales (la de MT describe
  la transición de UI vía PUT REST, que **no cambia**). `check-delta-coverage` conforme.
- [x] **Lane e2e dirigida con paridad CI** (`npm run e2e:fresh -- --no-build -- e2e/crud/proyectos.spec.ts`,
  base descartable `prisma/perf-e2e.db`, `CI=1`): **ROJO por timeout de test**, no por el `PUT`.
  3 corridas: la 1 pasa el spec en el reintento (7/7 en JUnit, `.last-run.json` `passed`, 1
  reintento); la 2 y la 3 fallan los 3 intentos con el error idéntico
  `Test timeout of 30000ms exceeded` en `e2e/crud/proyectos.spec.ts:115`. El `page snapshot` del
  fallo muestra el trabajo creado y "Planificado" con "Iniciar" disponible ⇒ el test no llega al
  `PUT`. Gate **NO cumplido** por causa fuera del alcance de archivos de P2 (ver Desviación).
- [x] **Gates de código**: `npx tsc --noEmit` **0** · `npm run lint` **0 errores** (10 493
  warnings preexistentes) · `npm test` **1079/1079** (108 archivos, 1078 + el nuevo) con los pisos
  vigentes · `openspec validate --all` sin fallos · `check-delta-coverage fix-put-merge-scope` ok.
- [x] **Avance NSGC** + fila de la tabla y entrada de Bitácora en `openspec/SERIE-DEUDA-1/00-plan.md`.
- [x] **Commit** (sin push: el orquestador pushea).

## Desviación declarada (P2)

1. **RED no observado**: el test del escenario declarado nace verde ⇒ no hay "antes/después" de
   código que exhibir. Se entrega la evidencia del intento (GREEN) y el diagnóstico de por qué no
   hay defecto.
2. **`lib/api/put-merge.ts` sin cambios**: el "fix mínimo" correcto es no tocar un guard correcto.
3. **Gate e2e no cumplido**: `e2e/crud/proyectos.spec.ts` es rojo por el timeout de 30 s del test
   (preexistente, reproducible 3/3, idéntico al rojo que originó la deuda de NOCHE-3 P2). El
   archivo a corregir (`e2e/**` o `playwright.config.ts`) está fuera del alcance de archivos de P2,
   así que se documenta y se reasigna:

   > **Deuda reasignada (P7 / tooling e2e)**: en `e2e/crud/proyectos.spec.ts` agregar
   > `test.use({ timeout: 120_000 })` (o subir el `timeout` de CI en `playwright.config.ts`) —
   > el spec hace ~40 interacciones y no entra en 30 s de paridad CI.
