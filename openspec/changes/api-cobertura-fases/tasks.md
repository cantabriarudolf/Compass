# Tasks: api-cobertura-fases

## Fase 1 (SERIE-NOCHE-3 P6) — carpetas más bajas + piso `app/api/**`

- [x] 1.1 Medir de verdad: `npm test -- --coverage` sobre la suite 936/936 (2026-10-15,
      commit `283dddc`) → `app/api/**` **79.45/64.31/83.64/79.45** (1.588 statements sin
      cubrir); ranking por carpeta en `design.md § D1`.
- [ ] 1.2 Tests reales `app/api/dev-dashboard` (guard 404 prod, 401, GET/POST/PUT/PATCH
      caminos felices y 400; sandbox de `readProjectFile`; `toggleTask` sobre change
      temporal limpiado).
- [ ] 1.3 Tests reales `app/api/qa-estado` (guard, 401, GET, POST `nota` y `recalibrar`
      con `qa-estado.json` respaldado y restaurado).
- [ ] 1.4 Tests reales `app/api/admin` (`PATCH /api/admin/usuarios` completo +
      `POST seed-authz` con guard real y helper mockeado).
- [ ] 1.5 Re-medir y subir el piso `app/api/**` en `vitest.config.ts` (medido − 1 pt,
      nunca baja); gate `tsc` + `npm test` con los pisos nuevos.
- [ ] 1.6 Spec viva del ratchet (`DEV-qa-lab` ADDED) + avance NSGC con cobertura
      antes/después, tests agregados y pisos nuevos.
- [ ] 1.7 `check-delta-coverage` + `openspec validate --all` + cierre de la ventana
      (fila P6 HECHA en el plan + Bitácora).

## Fase 2 (declarada — ventana P7 de la serie)

- [ ] 2.1 Re-medir `app/api/**` y elegir las próximas carpetas más bajas
      (candidatas de hoy: `micro-sectores` 58.44%, `ingresos-fi` 54.07%,
      `egresos-fi` 57.81%, `emisiones-gc` 66.89%, `vinculos` 69.20%).
- [ ] 2.2 Tests reales por carpeta elegida (mismo molde que la fase 1).
- [ ] 2.3 Segundo re-baseline del piso `app/api/**` + avance NSGC.
- [ ] 2.4 Cierre del change (archive con CI verde observada) o fase 3 si el salto no
      alcanza el objetivo de la serie.
