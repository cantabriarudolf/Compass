# Tasks: flaky-pe-panels

Ventana **E3** de SERIE-DEUDA-3 (rama `serie/deuda-1`). Objetivo declarado: dar presupuesto explícito
al test flaky de retiro de encomienda. Esta ventana es de **presupuesto, no de arreglar el
componente**: el componente y `vitest.config.ts` **no se tocan**.

- [x] **Reproducir en aislamiento**: `npx vitest run test/componentes/pe-panels.test.tsx` (log
      `/tmp/serie-deuda3-e3-aislado.log`) → **7/7 verdes**, duración del archivo 34.77 s y caso de
      retiro **4.90 s**. Muy por debajo de los 30 s del default: el defecto necesita carga.
- [x] **Provocar el rojo bajo carga**: el mismo comando con `for i in $(seq 1 16); do yes > /dev/null & done`
      (2 núcleos, 16× oversubscription; log `/tmp/serie-deuda3-e3-carga2.log`) → `EXIT=1`, **5 fallos**,
      entre ellos el objetivo:
      `FAIL test/componentes/pe-panels.test.tsx > EncomiendasPanel (componente, RTL) > retiro de encomienda: dialog exige retiradoPor y marca Retirada` /
      `Error: Test timed out in 30000ms.` (31.09 s). Carga media (2× `yes`) ya lo dejaba en **26.81 s**,
      al filo del default.
- [x] **Ningún defecto real**: los 5 rojos de la corrida bajo carga son presupuesto (4 timers + 1
      `TestingLibraryElementError` de cascada por la corrida previa ahogada). No se toca ningún
      componente ni panel. La tarea 4 del prompt ("si hay defecto real, PARÁ") no se activa.
- [x] **Presupuesto explícito aplicado** en `test/componentes/pe-panels.test.tsx`: constante
      `PRESUPUESTO_CARGA = 120_000` documentada (por qué 120 s, y por qué **no** `test.use({ timeout })`)
      y objeto de opciones `{ timeout: PRESUPUESTO_CARGA }` en los **7** casos del archivo —el
      hermano que tenía `{ timeout: 20_000 }` pasa a la misma constante, así que el criterio y el
      valor quedan alineados.
- [x] **3 corridas de verificación** del archivo, todas **7/7 verdes**:

      | Corrida | Condición | Caso de retiro | Archivo |
      | --- | --- | --- | --- |
      | R1 | aislado | **5.25 s** ✓ | 46.45 s |
      | R2 | carga alta (16× `yes`, la que fallaba) | **67.67 s** ✓ | 380.51 s |
      | R3 | aislado | **4.97 s** ✓ | 36.59 s |

- [x] **Change openspec** con `skip_specs: true` y justificación: ninguna capacidad viva declara el
      presupuesto de un test de componente; no hay comportamiento observable nuevo.
- [x] **Sin procesos huérfanos**: los `yes` de carga se matan al terminar cada corrida
      (`pgrep -c -x yes` → **0**).
- [x] **`vitest.config.ts` y los componentes sin tocar**: pisos 93/84/92/93 · `lib/**` 98/93/98/98 ·
      `app/api/**` 87/74/88/87 y los 7 slices quedan igual; `STORE_VERSION = 28` congelado.
- [x] **Avance NSGC** con el tiempo medido y la evidencia antes/después.
- [x] **Gate**: `npx tsc --noEmit` 0 · `npm run lint` 0 problemas · `npm test` verde con los pisos
      vigentes · `openspec validate --all` sin fallos · `check-delta-coverage flaky-pe-panels` sin nada
      que rompería el archive.

## Declarado y NO forzado (fuera de la ventana)

- El archivo conserva `vi.setConfig({ testTimeout: 30_000 })` como default global: el presupuesto por
  caso lo sobrescribe y moverlo habría cambiado el criterio de los 7 casos a la vez desde un lugar
  menos visible.
- El caso sigue tardando ~5 s en aislamiento (los comboboxes Radix en jsdom son caros). No se
  optimiza: eso sería cambiar el componente/el harness, fuera del alcance de E3.
