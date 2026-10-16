# Tasks: store-cobertura-fase-b — cobertura real de `lib/store/**`

## Fase 1 (SERIE-NOCHE-3 P8) — medir, cubrir los slices y re-baselinear `lib/**` + global

- [ ] 1.1 Extender `coverage.include` de `vitest.config.ts` a `lib/store/**` (slices +
      helpers) y **medir primero** la suite verde completa: números global y `lib/**`
      antes/después del include, y ranking por archivo de `lib/store/**` + `lib/store.ts`
      por statements sin cubrir.
- [ ] 1.2 Tests comportamentales sobre la API pública (`useCompassStore`) para los archivos
      de `lib/store/**` con más statements sin cubrir, siguiendo el molde de
      `test/store-*.test.ts` (estado resultante, `StoreResult`, validaciones, errores);
      nunca detalles internos ni líneas.
- [ ] 1.3 Re-medir con la suite verde y re-baselinear los pisos `lib/**` y global en
      `vitest.config.ts` (medido − 1 pt, nunca bajar; fecha y commit documentados).
- [ ] 1.4 Avance NSGC con cobertura `lib/**`/global antes/después, tests agregados y pisos
      nuevos; cierre de tasks.
- [ ] 1.5 `check-delta-coverage` + `openspec validate --all` + gates de la ventana
      (`tsc --noEmit` + `npm test` con los pisos nuevos) + cierre de P8 en el plan.

## Fase siguiente (si el objetivo declarado no cabe en la ventana) — cierre P9

- [ ] 2.1 Dejar escrita en este `tasks.md` la fase siguiente concreta (archivos y acciones
      pendientes) para que el cierre (P9) la ejecute o la declare deuda post-serie.
      Prohibido comprimir la ventana.
