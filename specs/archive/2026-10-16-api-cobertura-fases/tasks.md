# Tasks: api-cobertura-fases

## Fase 1 (SERIE-NOCHE-3 P6) — carpetas más bajas + piso `app/api/**`

- [x] 1.1 Medir de verdad: `npm test -- --coverage` sobre la suite 936/936 (2026-10-15,
      commit `283dddc`) → `app/api/**` **79.45/64.31/83.64/79.45** (1.588 statements sin
      cubrir); ranking por carpeta en `design.md § D1`.
- [x] 1.2 Tests reales `app/api/dev-dashboard` (guard 404 prod, 401, GET/POST/PUT/PATCH
      caminos felices y 400; sandbox de `readProjectFile`; `toggleTask` sobre change
      temporal limpiado).
- [x] 1.3 Tests reales `app/api/qa-estado` (guard, 401, GET, POST `nota` y `recalibrar`
      con `qa-estado.json` respaldado y restaurado).
- [x] 1.4 Tests reales `app/api/admin` (`PATCH /api/admin/usuarios` completo +
      `POST seed-authz` con guard real y helper mockeado).
- [x] 1.5 Re-medir y subir el piso `app/api/**` en `vitest.config.ts` (medido − 1 pt,
      nunca baja); gate `tsc` + `npm test` con los pisos nuevos.
- [x] 1.6 Spec viva del ratchet (`DEV-qa-lab` ADDED) + avance NSGC con cobertura
      antes/después, tests agregados y pisos nuevos.
- [x] 1.7 `check-delta-coverage` + `openspec validate --all` + cierre de la ventana
      (fila P6 HECHA en el plan + Bitácora).

## Fase 2 (SERIE-NOCHE-3 P7) — segundo re-baseline

- [x] 2.1 Re-medir `app/api/**` (81.53 tras la fase 1) y elegir las 3 carpetas más bajas:
      `ingresos-fi` 54.07%, `egresos-fi` 57.81% y `micro-sectores` 58.44%.
- [x] 2.2 Tests reales por carpeta (3 archivos nuevos, 51 tests, mismo molde que la fase 1:
      camino feliz, 400 de validación, 401/403 por rol y 404 de scope, Prisma real sin mocks).
- [x] 2.3 Segundo re-baseline del piso `app/api/**`: medido 83.69/68.70/86.99/83.69 → piso
      **82/67/85/82**; avance NSGC con la cobertura antes/después.
- [ ] 2.4 Cierre del change: **no hace falta fase 3** (el objetivo de la serie se cumple con las
      fases 1–2); lo archiva el ARRANQUE de P8 con la CI verde **observada** del push de P7.
