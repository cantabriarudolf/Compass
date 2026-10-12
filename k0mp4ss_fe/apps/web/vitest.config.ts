import path from "node:path"
import { defineConfig } from "vitest/config"

const nextRoot = path.resolve(__dirname, "../../node_modules/next")

export default defineConfig({
  resolve: {
    alias: [
      { find: "@", replacement: path.resolve(__dirname, ".") },
      { find: "@workspace/ui", replacement: path.resolve(__dirname, "../../packages/ui/src") },
      { find: /^next\/server$/, replacement: path.join(nextRoot, "server.js") },
      { find: /^next\/server\.js$/, replacement: path.join(nextRoot, "server.js") },
      { find: /^next\/headers$/, replacement: path.join(nextRoot, "headers.js") },
      { find: /^next\/headers\.js$/, replacement: path.join(nextRoot, "headers.js") },
      { find: /^next\/navigation$/, replacement: path.join(nextRoot, "dist/client/components/navigation.js") },
    ],
  },
  test: {
    environment: "jsdom",
    globals: false,
    setupFiles: ["./test/setup.ts"],
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
        statements: 82,
        branches: 72,
        functions: 87,
        lines: 82,
        // Núcleo: los 7 archivos medidos desde SERIE-PRODUCCION P4.
        "lib/**": { statements: 86, branches: 78, functions: 94, lines: 86 },
        // Superficie API: 126 route handlers (smoke de guardias + fases).
        "app/api/**": { statements: 78, branches: 63, functions: 82, lines: 78 },
      },
    },
  },
})
