# Tasks: store-cobertura-fase-b — cobertura real de `lib/store/**`

## Fase 1 (SERIE-NOCHE-3 P8) — medir, cubrir los slices y re-baselinear `lib/**` + global

- [x] 1.1 Extender `coverage.include` de `vitest.config.ts` a `lib/store/**` (slices +
      helpers) y **medir primero** la suite verde completa: números global y `lib/**`
      antes/después del include, y ranking por archivo de `lib/store/**` + `lib/store.ts`
      por statements sin cubrir.  →  Medición 2026-10-16 (suite 1024/1024 verdes + los
      nuevos, `coverage/coverage-final.json`):
      **antes** (include solo `lib/store.ts`) global **86.92/74.27/90.28/86.92**,
      `lib/**` **90.86/81.72/98.21/90.86** (7 archivos); **después** (include extendido)
      global **86.12/74.92/90.82/86.12**, `lib/**` **88.27/80.54/96.63/88.27**
      (15 archivos): slices **80.65/77.67/92.59/80.65** (444/2.295 statements sin cubrir),
      `helpers.ts` 96.03/81.82/100/96.03, `store.ts` 87.12/80.52/98.72/87.12.
      Ranking por statements sin cubrir: `store.ts` 549 · `ir-slice` 169 · `mt-slice` 73 ·
      `co-slice` 57 · `ad-slice` 45 · `ge-slice` 45 · `cv-slice` 31 · `pi-slice` 24 ·
      `helpers.ts` 5. **`lib/**` no cae bajo el piso 86** (88.27 medido), así que no se
      baja ningún piso.
- [x] 1.2 Tests comportamentales sobre la API pública (`useCompassStore`) para los archivos
      de `lib/store/**` con más statements sin cubrir, siguiendo el molde de
      `test/store-*.test.ts` (estado resultante, `StoreResult`, validaciones, errores);
      nunca detalles internos ni líneas.  →  `test/store-cobertura-fase-b.test.ts`
      (**39 tests**): guardas de hidratación de los 7 slices (tabla por slice, sin mutación),
      comodines IR (rechazo/sustitución/aprobación con alta en catálogo), entregas con stock
      y alarma crítica, EPP y accesos, MT (ubicaciones, folio, preventivo, pagos, garantías
      por vencer, fondos), CO (buzón, transiciones, envíos), AD (controles, quórum por
      período vigente, `publicarActaEnCV`), GE (abrir/responder/resolver/cerrar), CV
      (publicar, plantillas) y PI (reactivación de vitrina).
- [x] 1.3 Re-medir con la suite verde y re-baselinear los pisos `lib/**` y global en
      `vitest.config.ts` (medido − 1 pt, nunca bajar; fecha y commit documentados).  →
      Medición final 2026-10-16 (suite **1063/1063** verdes): `lib/**`
      **93.28/86.12/99.44/93.28** (slices 99.78/94.43/100/99.78) y global
      **88.78/78.18/91.94/88.78** → pisos **`lib/**` 92/85/98/92** y **global 87/77/90/87**
      (antes 86/78/94/86 y 82/72/87/82), con fecha y contexto en `vitest.config.ts`.
      `app/api/**` intacto. Ningún piso bajó; `lib/**` nunca midió bajo 86.
- [x] 1.4 Avance NSGC con cobertura `lib/**`/global antes/después, tests agregados y pisos
      nuevos; cierre de tasks.  →  `Data/NSGC/docs/avances/avance - 2026-10-16 04-57.md`.
- [x] 1.5 `check-delta-coverage` + `openspec validate --all` + gates de la ventana
      (`tsc --noEmit` + `npm test` con los pisos nuevos) + cierre de P8 en el plan.  →
      `check-delta-coverage` 1 ok · 0 que romperían el archive; `validate --all` 39/0;
      `tsc` 0, `eslint` 0, `npm test` 1063/1063 con los pisos nuevos.

## Fase 2 (P9 — cierre de la serie): cobertura del store legacy

- [x] 2.1 Tests reales sobre `lib/store.ts` (549 statements sin cubrir al cierre de P8).  →
      **14 tests comportamentales** (`test/store-cobertura-fase-b-legacy.test.ts`) sobre RE
      (`generarReporteRE`/`distribuirReporteRE`), FI (`saveEgresoFI`, `emitirGastoComun` fijo y
      variable, `aplicarMoraFI`, `registrarPagoFI`, `enviarCobranzaFI`, `retirarFondoFI`) y PE
      (`completarTareaMonitoreoPE`, ingresos de contratista, visitas, `cerrarTurnoPE`) +
      **tabla de guardas de hidratación de las 97 acciones legacy**
      (`test/store-cobertura-fase-b-guards.test.ts`): `lib/store.ts` 87.11 → **96.06**
      (549 → 168 statements sin cubrir), `lib/**` **97.63/91.11/99.44/97.63** y global
      **91.09/81.40/91.94/91.09** con la suite **1078/1078** verde.
- [x] 2.2 Redondear los 5 statements de `helpers.ts` (líneas 40, 98, 101-103) y los 5 de slices
      (`ad-slice` 332/357; `ge-slice` 162/234/318).  →  **Deuda post-serie declarada**: son ramas
      bordes de `resolverVariablesCO` (fallback sin macro sectores), `getDeudaVigenteFI` (mensaje
      con deuda vencida) y transiciones sin efecto de AD/GE; quedan registradas con su línea exacta
      para una fase posterior (junto con las **168 statements restantes de `lib/store.ts`**:
      ramas de validación puntuales de ~60 acciones legacy, arranque y migraciones).
- [x] 2.3 Re-baseline de los pisos `lib/**` y global con la misma regla del ratchet.  →  pisos
      finales **`lib/**` 96/90/98/96** y **global 90/80/90/90** (medido − 1 pt, fecha y contexto en
      `vitest.config.ts`); `app/api/**` intacto (82/67/85/82). `check-delta-coverage` + `validate
      --all` + gates corridos en el cierre (P9).
