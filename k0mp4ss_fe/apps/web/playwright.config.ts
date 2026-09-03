// E2E con navegador real (Playwright). Lane separada de Vitest/RTL:
// Vitest = unidad/integración (mocks), Playwright = flujos completos de usuario.
// Patrones según skill e2e-testing (webServer, storageState, trace/video on-failure).
import { defineConfig, devices, type ReporterDescription } from "@playwright/test"

const reportersBase: ReporterDescription[] = process.env.CI
  ? [["html", { open: "never" }], ["junit", { outputFile: "test-results/junit.xml" }]]
  : [["html", { open: "never" }], ["list"]]

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // next dev con turbopack compila rutas al primer uso (~7s por ruta fría):
  // el timeout de expect debe superar ese costo de primera compilación.
  expect: { timeout: 15_000 },
  workers: process.env.CI ? 1 : undefined,
  // Local: next dev compila cada ruta al primer uso (hasta ~60s de turbo).
  // CI: build de producción, rutas calientes.
  timeout: process.env.CI ? 30_000 : 120_000,
  // El roadmap-reporter escribe qa-roadmap-live.json (transitorio, gitignored);
  // su escritura es try/catch — jamás interfiere con html/junit/list.
  reporter: [["./e2e/reporters/roadmap-reporter.ts"], ...reportersBase],
  use: {
    baseURL: process.env.BASE_URL || "http://localhost:3000",
    // CI: chromium embebido de Playwright. Local: Chrome del sistema (cero descargas).
    channel: process.env.CI ? undefined : "chrome",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    actionTimeout: 10_000,
    navigationTimeout: 30_000,
  },
  projects: [
    // Proyecto 1: login real 1 vez → storageState compartido por los demás.
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], storageState: "e2e/.auth/admin.json" },
      dependencies: ["setup"],
    },
  ],
  webServer: {
    // CI: servidor de producción (next start tras npm run build).
    // Local: next dev con reuseExistingServer para iterar rápido.
    command: process.env.CI ? "npm run start" : "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
})
