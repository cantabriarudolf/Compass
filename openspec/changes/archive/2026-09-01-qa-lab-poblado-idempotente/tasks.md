## 1. Implementación QA Lab — guard → confirmación

- [x] 1.1 Modificar `k0mp4ss_fe/apps/web/app/admin/qa-lab/page.tsx`: importar `DialogFooter` si no existe, añadir estados `confirmOpen`/`pendingFase`/`isCleaningPoblando`, reemplazar early-return del guard `tieneDatosTest` por apertura de `Dialog` con texto "Existen datos TEST-* — ¿Limpiar y poblar de una vez?" y botones "Cancelar" y "Limpiar y poblar"
- [x] 1.2 Implementar handler confirmar: `setConfirmOpen(false)` → `await limpiar()` (esperando implícitamente el flujo que deja "TEST-* limpio correctamente") → `await runFase("todo")`, reutilizando funciones existentes sin tocar `lib/store.ts` ni `STORE_VERSION`; cancelar solo cierra dialog sin mutar
- [x] 1.3 Verificar que sin datos TEST-* el flujo sigue directo a `runFase` sin dialog (no regresión para `poblamiento.spec.ts`/`ciclo.spec.ts`)

## 2. E2E idempotencia

- [x] 2.1 Crear `k0mp4ss_fe/apps/web/e2e/crud/poblado-idempotente.spec.ts` con `test.setTimeout(300_000)` y `test.use({ actionTimeout: 30_000 })`, helpers `clickPoblar`/`clickBorrar` con `evaluate` fallback, patrón de `ciclo.spec.ts`
- [x] 2.2 Caso feliz idempotente: limpiar → poblar → esperar "Carga completa OK" → poblar de nuevo → expect dialog visible ("Existen datos TEST-*") → confirmar "Limpiar y poblar" → esperar "TEST-* limpio correctamente" (si aparece) y luego "Carga completa OK" → afirmar `[id^="mod-"]` 22 con `🟢 Listo` y 0 `🔴 Con error` → `expect(errores).toEqual([])`
- [x] 2.3 Caso cancelar: repetir setup poblado → poblar de nuevo → dialog → "Cancelar" → dialog cerrado y reporte permanece 22/22 🟢 sin errores, sin mutación
- [x] 2.4 Caso sin datos: opcional sanity que pobla directo sin dialog cuando store limpio (o cubierto por no regresión de ciclo)

## 3. Validación

- [x] 3.1 `npx tsc --noEmit` (0 errores) y `npm run lint` (0 errores) en `k0mp4ss_fe/apps/web`
- [x] 3.2 `npx vitest run` completo con número real (≈425) — sin tocar store, debe permanecer verde
- [x] 3.3 `npx playwright test e2e/crud/poblado-idempotente.spec.ts e2e/flujo/ciclo.spec.ts` verde (timeouts generosos)
- [x] 3.4 `openspec validate --all` y luego `openspec validate --all --strict` sin errores
