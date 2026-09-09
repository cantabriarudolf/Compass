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
      // C5: baseline estable post Fase A (96.57/83.26/89.65/96.57).
      thresholds: { statements: 90, branches: 75, functions: 85, lines: 90 },
    },
  },
})
