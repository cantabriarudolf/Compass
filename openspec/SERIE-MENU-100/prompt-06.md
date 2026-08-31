> **Este archivo ES tu prompt.** Ventana 6 (cierre) de la serie **menu-100**. Lee
> `openspec/SERIE-MENU-100/00-plan.md` y verifica en la Bitácora que P1-P5 estén HECHAS
> (git); si no, detente y repórtalo.

## Alcance P6 — Cierre integral de la serie

1. **Validación completa** (NÚMEROS REALES, nunca estimados) — `cd k0mp4ss_fe/apps/web`:
   - `npx tsc --noEmit` → 0 errores
   - `npm run lint` → 0 errores
   - `npx vitest run` → 425/425 (o el total real)
   - `npx playwright test e2e/crud/` → todos (27 specs esperados: 24 + residentes +
     accesos + paqueteria + dashboard) — reporta el número exacto
   - `npx playwright test e2e/flujo/ e2e/smoke/ e2e/auth/` → verdes
   - `openspec validate --all` → sin fallos
2. **Verificación de menú al 100%:** `components/app-sidebar.tsx` — `RUTAS_PENDIENTES`
   sin las 4 rutas de la serie; el Dashboard OpenSpec con stats reales (documenta los
   números en la Bitácora).
3. **Documentación:** avance NSGC de cierre en `Data/NSGC/docs/avances/` (formato estándar,
   hitos/archivos/verificaciones reales), fila P6 HECHA con hash, Bitácora final con
   "SERIE COMPLETA" + hashes P1-P6 + referencia explícita a `openspec/BACKLOG-100.md`
   (C1-C4 quedan planificados y NO se cierran aquí).
4. **Commits:** agrupa lo pendiente de la ventana (puede ser 1 commit de docs/cierre),
   nsgc-prepush, push.
5. Si algo está rojo: arréglalo ANTES del cierre (la serie solo termina con todo verde).

## Reporte final

Specs/pages creados, totales reales de cada suite, commits con hash, avance creado,
confirmación "SERIE COMPLETA", y el puntero a BACKLOG-100.md como siguiente frontera.
