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
  // Serializado a propósito. Toda la suite corre contra UNA base SQLite
  // (`prisma/dev.db`) y comparte estado real (no mocks), así que dos workers
  // pueden pisar la misma fila: el teardown de un spec borra el registro que
  // otro todavía está leyendo. Caso medido: `remuneraciones.spec.ts` borraba su
  // persona TEST (`test-p3-pl-trab-…`) en su `finally` mientras
  // `reservas-admin.spec.ts` —que toma `personas[0]` del padrón compartido—
  // seguía reservando con ella, y el panel mostraba el id crudo en vez del
  // nombre (`Solicitante: test-p3-pl-trab-…`).
  //
  // Costo medido en esta máquina: `--workers=1` sobre la suite completa da
  // 10m39s, ~1,04× el paralelo. Se paga sin discusión por tener una suite
  // determinista: una corrida que falla a veces no se puede usar como prueba.
  //
  // La primera corrida serial expuso además que el paralelismo TAPABA una
  // falla: `roles-accesos.spec.ts` esperaba oculto el grupo Comunidad, que
  // `components/app-sidebar.tsx` abre a conserjería y mantención por el
  // Directorio de Emergencias, y su locator sin scope reventaba por strict mode
  // al aparecer el texto dos veces en el DOM. Con dos workers resolvía a un
  // nodo y pasaba por casualidad. Ambas cosas ya están corregidas en el spec.
  //
  // Lo que sigue pendiente y NO se resuelve serializando: varios specs leen
  // `personas[0]`/`unidades[0]` del padrón compartido en vez de crear sus
  // propios datos. Eso hay que arreglarlo spec por spec; nunca recortando
  // asserts para que la suite pase.
  workers: 1,
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
  // Limpieza previa: la lane `e2e/crud` crea filas TEST/QA y no siempre las borra, así que
  // cada corrida arrancaba de un estado distinto (mismas fallas, distinto conteo).
  // `scripts/limpiar-e2e.mjs` purga esas filas con reglas explícitas y una allowlist dura,
  // y sólo opera sobre SQLite local: si DATABASE_URL no es `file:…`, aborta y la suite no
  // arranca sobre una base que no puede limpiar. El detalle (y la omisión en CI) vive en
  // `scripts/limpiar-e2e-global-setup.mjs`.
  globalSetup: "./scripts/limpiar-e2e-global-setup.mjs",
  webServer: {
    // CI: servidor de producción (next start tras npm run build).
    // Local: next dev con reuseExistingServer para iterar rápido.
    command: process.env.CI ? "npm run start" : "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
})
