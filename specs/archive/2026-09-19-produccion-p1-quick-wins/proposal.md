# Change: produccion-p1-quick-wins

## Why

Ventana P1 de la serie SERIE-PRODUCCION (quick wins mecánicos). Estado previo: la función de fecha `hoyISO()` está duplicada en 5 puntos de `lib/` (finanzas-utils `hoyISO`, pl-utils `hoyISOPL`, personal-utils `hoyISOPE`, reporteria-utils `hoyISORE`, más variantes inline en `app/`), y el patrón de generación de IDs `` `${prefijo}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` `` se repite 30 veces en `lib/store.ts` pese a que `lib/id-utils.ts` ya expone `generarId()` desde SERIE-REVISION. Además quedan 12 lint warnings heredados de la ventana de estabilización. El objetivo es deduplicación mecánica con cero cambio de comportamiento y cero riesgo de regresión.

## What Changes

- **Nuevo `lib/date-utils.ts`**: única fuente de verdad de helpers de fecha: `hoyISO()` (YYYY-MM-DD), `ahoraISO()` (ISO completo), `inicioMesISO(mes?, anio?)` y `finMesISO(mes?, anio?)` (mes 1-12, con validación RangeError fuera de rango).
- **Deduplicación en `lib/`**: `finanzas-utils.ts` reexporta `hoyISO` desde `date-utils` (compat con `app/finanzas/gastos-comunes/page.tsx`); se eliminan las funciones muertas `hoyISOPE` (personal-utils) y `hoyISORE` (reporteria-utils, sin usos); se elimina `hoyISOPL` (pl-utils) y `store.ts` pasa a importar `hoyISO`/`ahoraISO` desde `date-utils`.
- **Adopción de `generarId()`**: las ~30 repeticiones del patrón de ID en `lib/store.ts` pasan a `generarId(prefijo)` / `generarId(prefijo, idx)` de `lib/id-utils.ts`. El `codigoVerificacion` de CT (no es un ID) no se toca.
- **Lint**: se corrige el warning editable en `test/qa-roadmap.test.ts` (parámetro rest sin uso en el mock de `readFileSync`). Los 11 warnings restantes viven en `proxy.ts`, `e2e/crud/punto-cero.spec.ts` y `scripts/fix-rut-seeds.cjs` — fuera de las superficies autorizadas de esta delegación; se escalan al owner.
- **Sin cambios de esquema**: STORE_VERSION permanece en 27 (no hay migración).

## Capabilities

### New Capabilities

(ninguna)

### Modified Capabilities

(ninguna — refactor mecánico interno, cero cambios de comportamiento de producto)

## Impact

- **Código:** `lib/date-utils.ts` (nuevo), `lib/id-utils.ts` (solo comentario de adopción, si aplica), `lib/store.ts`, `lib/finanzas-utils.ts`, `lib/personal-utils.ts`, `lib/pl-utils.ts`, `lib/reporteria-utils.ts`, `test/date-utils.test.ts` (nuevo), `test/id-utils.test.ts` (nuevo), `test/qa-roadmap.test.ts`.
- **Tests:** suite completa debe seguir verde (517 unit); se añaden tests de date-utils e id-utils.
- **Riesgos:** bajo — el formato de ID generado por `generarId()` es idéntico al patrón reemplazado (`prefijo-stamp-rnd`); el caso `bono` con idx cambia el slice del sufijo aleatorio de (2,6) a (2,8) sin pérdida de unicidad.
- **Dependencias:** ninguna.
- **Fuera de alcance (escala al owner):** los duplicados `hoyISO()` locales en `app/operaciones/{bitacora,paqueteria,accesos,proveedores}/page.tsx` y el patrón de ID en `app/operaciones/{reservas,proveedores}/page.tsx` (superficies no autorizadas en esta delegación).
