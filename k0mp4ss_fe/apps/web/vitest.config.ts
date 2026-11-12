import path from "node:path"
import { defineConfig } from "vitest/config"

const nextRoot = path.resolve(__dirname, "../../node_modules/next")

export default defineConfig({
  resolve: {
    alias: [
      { find: "@", replacement: path.resolve(__dirname, ".") },
      {
        find: "@workspace/ui",
        replacement: path.resolve(__dirname, "../../packages/ui/src"),
      },
      { find: /^next\/server$/, replacement: path.join(nextRoot, "server.js") },
      {
        find: /^next\/server\.js$/,
        replacement: path.join(nextRoot, "server.js"),
      },
      {
        find: /^next\/headers$/,
        replacement: path.join(nextRoot, "headers.js"),
      },
      {
        find: /^next\/headers\.js$/,
        replacement: path.join(nextRoot, "headers.js"),
      },
      {
        find: /^next\/navigation$/,
        replacement: path.join(
          nextRoot,
          "dist/client/components/navigation.js"
        ),
      },
    ],
  },
  test: {
    environment: "jsdom",
    globals: false,
    // El default de Vitest son 5 s por test. La suite completa corre 265 archivos
    // con `--maxWorkers=2`, base SQLite real y jsdom, y con ese techo un componente
    // que tarda 5,1 s por competencia de CPU rompe la corrida entera. Pasó cuatro
    // veces en un día, siempre en un test de componente distinto y siempre verde al
    // correr solo (los 50 archivos de `test/componentes` dan 294/294 con dos
    // workers). No es lógica: es presupuesto de tiempo, así que se le da margen.
    // No debilita ninguna aserción: un test que cuelga de verdad tarda 15 s en
    // fallar en vez de 5, pero falla igual.
    testTimeout: 15_000,
    // La base de la suite (change `test-db-descartable`): el setup resuelve la base
    // descartable (`prisma/perf-test.db`) y aborta si el destino fuera `prisma/dev.db`;
    // el globalSetup la recrea y la migra de cero antes del primer archivo de test.
    setupFiles: ["./test/db-descartable.setup.ts", "./test/setup.ts"],
    globalSetup: ["./test/db-descartable-global.setup.ts"],
    include: ["lib/**/*.test.{ts,tsx}", "test/**/*.test.{ts,tsx}"],
    server: {
      deps: {
        inline: [/next-auth/, /@auth\/core/],
      },
    },
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary", "json", "html"],
      include: [
        "lib/store.ts",
        "lib/store/**/*.ts",
        "lib/date-utils.ts",
        "lib/id-utils.ts",
        "lib/env-guard.ts",
        "lib/logger.ts",
        "lib/authz.ts",
        // T4 cobro-gastos-comunes-parametrico: el resolver de la versión
        // vigente es el núcleo del cobro declarado, así que el ratchet lo mide.
        "lib/reglamento.ts",
        // Higiene (unidad de loaders): estos dos módulos estaban fuera porque sus
        // cargadores Prisma (`cargarResumenMensual` y `totalesDelPeriodo`) no
        // tenían prueba; con `test/api/cargadores-aviso.test.ts` midiendo la
        // traducción comunidad → filas contra la base, entran al ratchet.
        "lib/resumen-mensual.ts",
        "lib/aviso-cobro.ts",
        "lib/schemas.ts",
        "app/api/**/route.ts",
      ],
      reportsDirectory: "./coverage",
      // Ratchet por área (change ci-verde-ratchet-cobertura, 2026-10-12).
      // Historia: el 90/75 se fijó en Fase A midiendo SOLO lib/store.ts
      // (96.57/83.26/89.65/96.57). Cuando el include se extendió a
      // app/api/**/route.ts (126 handlers) y store.ts siguió creciendo, ese
      // global dejó de ser alcanzable: medido 83.79/73.18/88.65/83.79 el
      // 2026-10-12 con los 967 tests verdes. El job de CI quedó rojo un mes
      // sin un solo test roto (ruido que tapaba fallas reales).
      // Piso = medido − 1 pt (margen por drift de Node/V8). Solo sube: si la
      // cobertura mejora, se re-baselinea en un commit explícito.
      thresholds: {
        // Re-baseline 2026-10-16 (SERIE-NOCHE-3 P9, cierre: fase 2 de
        // `store-cobertura-fase-b` — 14 tests legacy RE/FI/PE + la tabla de
        // guardas de las 97 acciones): 91.09/81.40/91.94/91.09 → piso =
        // medido − 1 pt. Nunca se baja.
        // Re-baseline 2026-10-17 (SERIE-DEUDA-1 P5, change `store-cobertura-fase-c`):
        // medido 93.70/84.77/93.28/93.70 (el global subió con las fases API de P3/P4
        // y la fase C del store) → piso = medido − 1 pt. Nunca se baja.
        // Re-baseline 2026-10-18 (SERIE-DEUDA-2 D5, change `store-cobertura-fase-e`):
        // medido 94.32/85.70/93.77/94.32 con la suite verde (1299 tests en 126
        // archivos). La fase D dejó el global en 94/85.03 y la fase E (remanente del
        // store) terminó de subirlo → piso = medido − 1 pt. Nunca se baja.
        // Re-baseline 2026-10-31 (F22a, retiro del store legacy del navegador):
        // se borraron ~4.300 statements y ~4.000 ramas que estaban casi al 100%
        // (lib/store.ts + los 7 slices). El agregado deja de estar dominado por
        // ese módulo y pasa a medir el resto del código tal como está: medido
        // 90.25/77.11/92.07/90.25 -> piso = medido - 1 pt. No es una regresión de
        // cobertura: es que antes el store tapaba el promedio. Los dos huecos que
        // quedan a la vista (lib/schemas.ts al 69% de funciones y las ramas de
        // app/api/**) son trabajo aparte, anotados en PENDIENTES-FUNCIONALIDAD.
        // Re-baseline 2026-10-31 (F23, cobertura de rutas API y schemas):
        // medido 90.95/78.73/94.88/90.95 -> piso = medido - 1 pt. Sube ramas y
        // funciones; ningun piso baja.
        statements: 89,
        branches: 77,
        functions: 93,
        lines: 89,
        // Núcleo: los 7 archivos desde SERIE-PRODUCCION P4 + el interior de
        // `lib/store/**` (slices + helpers + `lib/store.ts` legacy). Re-baseline
        // 2026-10-16 (P9): 97.63/91.11/99.44/97.63, con `lib/store.ts` en 96.06
        // (venía de 87.11 al abrir la serie) → piso = medido − 1 pt. Nunca se baja.
        // Re-baseline 2026-10-17 (SERIE-DEUDA-1 P5): medido 98.39/92.19/99.43/98.39,
        // con `lib/store.ts` en 97.39, `lib/store/helpers.ts` y los 7 slices en
        // 100 % de statements → piso = medido − 1 pt. Nunca se baja.
        // Re-baseline 2026-10-18 (SERIE-DEUDA-2 D5, cierre de las fases C/D/E del
        // store): medido 99.63/94.03/99.44/99.63, con `lib/store.ts` en 99.95 y solo
        // dos statements inalcanzables por la API pública (`:4321` declarado en D4 y
        // `:5127` declarado en D5) → piso = medido − 1 pt. Nunca se baja.
        // Re-baseline 2026-10-31 (F22a): sin los slices al 100%, lib/** mide
        // 98.44/90.59/89.47/98.44 -> piso = medido - 1 pt. El arrastre de funciones
        // es lib/schemas.ts (69.23%).
        // Re-baseline 2026-10-31 (F23): medido 99.09/91.89/100.00/99.09 -> piso =
        // medido - 1 pt. `lib/schemas.ts` pasa de 69.23% a 100% de funciones.
        "lib/**": { statements: 98, branches: 90, functions: 99, lines: 98 },
        // Superficie API: 126 route handlers (smoke de guardias + fases).
        // Re-baseline 2026-10-16 (SERIE-DEUDA-1 P3, change `api-cobertura-fase3`):
        // medido 83.69/68.70/86.99/83.69 → 85.75/71.50/88.48/85.75 con las 3
        // carpetas más bajas de la medición cubiertas — `qa-roadmap`
        // (62.5 → 91.67 st, retirada después con el módulo QA/dev, F9),
        // `emisiones-gc` (66.89 → 94.26) y `vinculos`
        // (69.2 → 94.93) → piso = medido − 1 pt. Nunca se baja.
        // Re-baseline 2026-10-16 (SERIE-DEUDA-1 P4, change `api-cobertura-fase4`):
        // medido 85.75/71.50/88.48/85.75 → 88.39/75.83/89.22/88.39 con las 3
        // carpetas más bajas de la medición cubiertas — `fondos-fi`
        // (71.16 → 89.66 st), `personas` (72.82 → 93.45) y `cobros-fi`
        // (74.43 → 91.48) → piso = medido − 1 pt. Nunca se baja.
        // Re-baseline 2026-10-31 (F22a): medido 88.60/76.39/92.35/88.60 -> piso =
        // medido - 1 pt (suben ramas y funciones).
        // Re-baseline 2026-10-31 (F23): medido 89.31/77.98/94.33/89.31 -> piso =
        // medido - 1 pt. 13 rutas pasaron de 0-33% a 75-100% de ramas, incluida
        // liquidaciones/adelantos/[id], que no tenia ningun test.
        "app/api/**": {
          statements: 88,
          branches: 76,
          functions: 93,
          lines: 88,
        },
      },
    },
  },
})
