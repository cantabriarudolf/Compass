# Tasks: produccion-p1-quick-wins

## 1. Tarea 1 — `lib/date-utils.ts` y unificación `hoyISO*()`

- [x] 1.1 Crear `lib/date-utils.ts` con `hoyISO()`, `ahoraISO()`, `inicioMesISO(mes?, anio?)`, `finMesISO(mes?, anio?)` (mes 1-12 validado).
- [x] 1.2 `finanzas-utils.ts`: eliminar la definición local de `hoyISO()` y reexportar desde `date-utils` (compat con `app/finanzas/gastos-comunes/page.tsx`).
- [x] 1.3 `personal-utils.ts`: eliminar `hoyISOPE()` (sin usos en todo el repo).
- [x] 1.4 `reporteria-utils.ts`: eliminar `hoyISORE()` (sin usos en todo el repo).
- [x] 1.5 `pl-utils.ts`: eliminar `hoyISOPL()`; `store.ts` usa `hoyISO()` de `date-utils`.
- [x] 1.6 `store.ts`: importar `hoyISO`/`ahoraISO` desde `@/lib/date-utils`; eliminar los imports de `hoyISO` (finanzas-utils) y `hoyISOPL` (pl-utils); reemplazar `new Date().toISOString()` del store por `ahoraISO()` donde corresponda.
- [x] 1.7 Añadir `test/date-utils.test.ts` (≥4 casos, incluidos bisiesto y mes inválido).

## 2. Tarea 2 — Adoptar `generarId()` en `lib/store.ts`

- [x] 2.1 Verificar API de `lib/id-utils.ts`: `generarId(prefijo, idx?)`.
- [x] 2.2 Reemplazar las 27 repeticiones exactas `` `${p}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` `` por `generarId("p")` en `lib/store.ts`.
- [x] 2.3 Reemplazar el bloque con `stamp` compartido (emisión GC: `egc`/`cob` con idx) por `generarId("egc")` / `generarId("cob", idx)`.
- [x] 2.4 Reemplazar `bono-${Date.now()}-${idx}-...` por `generarId("bono", idx)`.
- [x] 2.5 Importar `generarId` en `store.ts`; verificar que no queden ocurrencias del patrón salvo el `codigoVerificacion` CT (no es ID).
- [ ] 2.6 Reemplazar el patrón en `app/operaciones/{reservas,proveedores}/page.tsx` — BLOQUEADO: fuera de las superficies de edición autorizadas; escalado al owner.

## 3. Tarea 3 — Lint warnings

- [x] 3.1 `test/qa-roadmap.test.ts`: eliminar `...rest` sin uso del mock de `readFileSync`.
- [ ] 3.2 Los 11 warnings restantes (`proxy.ts` ×8, `e2e/crud/punto-cero.spec.ts` ×1, `scripts/fix-rut-seeds.cjs` ×2) — BLOQUEADO: archivos fuera de las superficies autorizadas; escalado al owner.

## 4. Tarea 4 — Validación final

- [x] 4.1 `npx tsc --noEmit` → 0 errores.
- [x] 4.2 `npm test` → suite unit completa verde (517 previos + nuevos).
- [ ] 4.3 `npm run lint` → 0 warnings (parcial: 11 warnings fuera de superficie pendientes de decisión del owner).
- [x] 4.4 `openspec validate --all` → sin fallos.
