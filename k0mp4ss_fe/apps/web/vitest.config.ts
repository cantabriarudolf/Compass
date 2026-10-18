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
        statements: 92,
        branches: 83,
        functions: 92,
        lines: 92,
        // Núcleo: los 7 archivos desde SERIE-PRODUCCION P4 + el interior de
        // `lib/store/**` (slices + helpers + `lib/store.ts` legacy). Re-baseline
        // 2026-10-16 (P9): 97.63/91.11/99.44/97.63, con `lib/store.ts` en 96.06
        // (venía de 87.11 al abrir la serie) → piso = medido − 1 pt. Nunca se baja.
        // Re-baseline 2026-10-17 (SERIE-DEUDA-1 P5): medido 98.39/92.19/99.43/98.39,
        // con `lib/store.ts` en 97.39, `lib/store/helpers.ts` y los 7 slices en
        // 100 % de statements → piso = medido − 1 pt. Nunca se baja.
        "lib/**": { statements: 97, branches: 91, functions: 98, lines: 97 },
        // Superficie API: 126 route handlers (smoke de guardias + fases).
        // Re-baseline 2026-10-16 (SERIE-DEUDA-1 P3, change `api-cobertura-fase3`):
        // medido 83.69/68.70/86.99/83.69 → 85.75/71.50/88.48/85.75 con las 3
        // carpetas más bajas de la medición cubiertas — `qa-roadmap`
        // (62.5 → 91.67 st), `emisiones-gc` (66.89 → 94.26) y `vinculos`
        // (69.2 → 94.93) → piso = medido − 1 pt. Nunca se baja.
        // Re-baseline 2026-10-16 (SERIE-DEUDA-1 P4, change `api-cobertura-fase4`):
        // medido 85.75/71.50/88.48/85.75 → 88.39/75.83/89.22/88.39 con las 3
        // carpetas más bajas de la medición cubiertas — `fondos-fi`
        // (71.16 → 89.66 st), `personas` (72.82 → 93.45) y `cobros-fi`
        // (74.43 → 91.48) → piso = medido − 1 pt. Nunca se baja.
        "app/api/**": {
          statements: 87,
          branches: 74,
          functions: 88,
          lines: 87,
        },
      },
    },
  },
})
