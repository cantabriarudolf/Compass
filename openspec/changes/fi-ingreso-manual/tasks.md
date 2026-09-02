## 1. Schemas y tipos

- [ ] 1.1 Añadir `IngresoFISchema` en `lib/schemas.ts` (id, fecha ISO, monto>0, concepto min1, fondoId, familia?) y extender `FondoFISchema` con `saldoInicial?: number` opcional; derivar `type IngresoFI`.
- [ ] 1.2 Verificar `lib/finanzas-utils.ts` no rompa tipos existentes.

## 2. Finanzas-utils: saldoFondo extendido

- [ ] 2.1 Extender `ContextoSaldoFondo` con `saldoInicialPorFondo?: Record<string,number>` y actualizar `saldoFondo()` sumando `(ctx.saldoInicialPorFondo?.[fondoId] ?? 0)` a `ingresosCobros+aportes-egresos`.
- [ ] 2.2 Actualizar call sites de `saldoFondo()` en `app/` pasando mapa desde store (fondos con saldoInicial).

## 3. Store: colección ingresosFI + acción + versión

- [ ] 3.1 Añadir `ingresosFI: IngresoFI[]` en `CompassData`, `FONDOS_FI_SEED` intacto, `seedData()` con `ingresosFI: []`, `ESQUEMAS_COLECCION`, `partialize`, y `sanitizarColecciones` si aplica.
- [ ] 3.2 Implementar `registrarIngresoFI(input): StoreResult` (valida zod, fondoId existe, id `fi-ing-*`, evento `FI_INGRESO_REGISTRADO` FI) y `removeIngresoFI` solo si hay paridad con `removeEgresoFI` (verificar).
- [ ] 3.3 Bump `STORE_VERSION 26→27` y migrate `if ((version??0)<27)` asegurando `ingresosFI: []` y preservando `saldoInicial` (idempotente, sin datos históricos).

## 4. UI FI

- [ ] 4.1 En `app/finanzas/gastos-comunes/page.tsx`: form "Registrar ingreso a fondo" (fecha, monto, concepto, fondo) + lista ingresos recientes; extender form de fondo con campo opcional "Saldo de apertura" que persiste `saldoInicial`; labels asociados y aria-label en selects.

## 5. Tests y migración

- [ ] 5.1 Crear `test/store-ingresos-fi.test.ts` (o ampliar `store-finanzas`): registrar OK + saldoFondo refleja, fondo inexistente→error, monto≤0→zod, evento, saldoInicial suma, migración v26→v27 idempotente.
- [ ] 5.2 Actualizar tests que fijan `STORE_VERSION 26 → 27` y verificar `saldoFondo` default 0 no cambia resultados.

## 6. Validación y cierre

- [ ] 6.1 `npx tsc --noEmit` 0, `npm run lint` 0 warnings, `npx vitest run` (462 + nuevos, número REAL), e2e `e2e/crud/gastos-comunes.spec.ts`, `openspec validate --all`.
- [ ] 6.2 Commit conventional español, `nsgc-prepush`, push, archive (git status limpio), Bitácora P1 HECHA.
