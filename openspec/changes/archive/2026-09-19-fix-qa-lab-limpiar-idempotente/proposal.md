# Change: fix-qa-lab-limpiar-idempotente

## Why

La suite e2e completa del 2026-09-16 dio 78 passed / 8 failed / 2 skipped. Los 6 fallos de QA Lab (`crud/poblado-idempotente` ×2, `flujo/ciclo` ×3, `flujo/poblamiento` ×1) reproducen en aislado: regresión real, no contaminación de estado.

Causa raíz: el commit `5e9b689` (2026-09-14, validación inversa en `removeVinculo`) cambió borrar-inexistente de éxito silencioso a `{ok:false, "El vínculo a eliminar no existe."}`. El `limpiar()` de `app/admin/qa-lab/page.tsx` ("Borrar todo lo de prueba") cuenta cualquier `!ok` como bloqueo, entonces muestra `"Limpieza con N bloqueos"` en vez de `"TEST-* limpio correctamente"` aunque el id TEST simplemente ya no exista (evidencia en `test-results/.../error-context.md`).

## What Changes

- **`app/admin/qa-lab/page.tsx` (`limpiar`)**: guardas de existencia en los 7 loops de `remove*` (vínculos, unidades, micro/macro-sectores, personas, tipos de unidad, maestros): solo se reporta bloqueo si la entidad existe y el remove la rechaza (p. ej. FK inversa real). Patrón ya usado en el mismo `limpiar()` para IR (`if (!r.ok && s.activosIR.some(...))`).
- **Sin cambios de esquema**: STORE_VERSION no se toca. Sin cambios en `lib/store.ts`: la API estricta de `removeVinculo` (avisar al borrar inexistente) se conserva para UX normal.

## Capabilities

### New Capabilities

(ninguna)

### Modified Capabilities

(ninguna — fix de regresión, restaura comportamiento previo verificado por e2e)

## Impact

- **Código:** `k0mp4ss_fe/apps/web/app/admin/qa-lab/page.tsx` (solo `limpiar()`).
- **Tests:** los 6 specs de QA Lab deben volver a verde (re-corridos aislados); suite unit no afectada (sin cambios en `lib/`).
- **Riesgos:** bajo — la guarda solo ignora errores sobre entidades ya ausentes; bloqueos reales (FK inversa con entidad presente) se siguen reportando.
- **Fuera de alcance:** los 2 fallos a11y de HEAD (`aria-valid-attr-value` en personas, `color-contrast` en personas/bitácora) van por carril propio.
