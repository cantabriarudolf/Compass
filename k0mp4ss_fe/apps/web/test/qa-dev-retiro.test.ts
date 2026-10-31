/**
 * @vitest-environment node
 *
 * Candado del retiro del módulo QA/dev (F9) — mismo criterio que `test/audit-store.test.ts`:
 * lo que se retira no puede volver a aparecer.
 *
 * Por qué existe: el QA-Lab escribía datos de dominio en el navegador y ejecutaba purgas
 * destructivas de datos TEST; se retiró junto con sus rutas dev (`/api/qa-estado`,
 * `/api/qa-roadmap`, `/api/qa-lab/**`, `/api/dev-dashboard`) y sus pantallas. Este test falla
 * si cualquiera de esas superficies reaparece sin una decisión explícita (nueva ventana
 * openspec), y fija lo que SÍ sobrevive: `esCobroTest` sigue siendo la regla de producción de
 * `app/api/cobros-fi/[id]` y el reporter de Playwright sigue teniendo su fuente de etapas.
 */
import { describe, expect, it } from "vitest"
import { existsSync, readFileSync } from "node:fs"
import path from "node:path"

const RAIZ = path.resolve(__dirname, "..")

const SUPERFICIES_RETIRADAS = [
  "app/admin/qa-lab",
  "app/admin/qa-dashboard",
  "app/admin/dev-dashboard",
  "app/admin/mantenimiento",
  "app/api/qa-lab",
  "app/api/qa-estado",
  "app/api/qa-roadmap",
  "app/api/dev-dashboard",
  "app/admin/_qa-dev-guard.tsx",
  "lib/qa-dev-acceso.ts",
]

/** Rutas dev retiradas: URL pública → segmento de `app/` que la servía. */
const RUTAS_RETIRADAS = ["/api/qa-estado", "/api/qa-roadmap", "/api/qa-lab/purga-test", "/api/dev-dashboard"]

describe("F9 — el módulo QA/dev quedó retirado", () => {
  it.each(SUPERFICIES_RETIRADAS)("%s ya no existe", (relativa) => {
    expect(existsSync(path.join(RAIZ, relativa)), `${relativa} volvió al árbol`).toBe(false)
  })

  it.each(RUTAS_RETIRADAS)("%s no tiene handler en app/", (url) => {
    const segmento = url.replace(/^\/api\//, "").split("/")[0]!
    const dir = path.join(RAIZ, "app", "api", segmento)
    expect(existsSync(dir), `${url} volvió a tener handler`).toBe(false)
  })

  it("el sidebar no ofrece entradas del módulo retirado", () => {
    const sidebar = readFileSync(path.join(RAIZ, "components", "app-sidebar.tsx"), "utf8")
    for (const url of ["/admin/qa-lab", "/admin/qa-dashboard", "/admin/dev-dashboard", "/admin/mantenimiento"]) {
      expect(sidebar, `app-sidebar.tsx todavía enlaza ${url}`).not.toContain(url)
    }
    expect(sidebar).not.toContain("Desarrollo AI")
  })

  it("permisos ya no enlaza al Laboratorio QA como creador de usuarios TEST", () => {
    const pagina = readFileSync(path.join(RAIZ, "app", "admin", "permisos", "page.tsx"), "utf8")
    expect(pagina).not.toContain("/admin/qa-lab")
  })
})

describe("PRESERVE — lo que sobrevive al retiro sigue en pie", () => {
  it("esCobroTest sigue exportado y clasifica igual que antes del retiro", async () => {
    const { esCobroTest } = await import("@/lib/qa-lab-helpers")

    expect(esCobroTest({ id: "cob-1", unidadId: "u-real", origenRef: "test-ra-rs-1" })).toBe(true)
    expect(esCobroTest({ id: "cob-1", unidadId: "test-u-999", origenRef: undefined })).toBe(true)
    expect(esCobroTest({ id: "test-cob-1", unidadId: "u-real", origenRef: undefined })).toBe(true)
    expect(esCobroTest({ id: "cob-1", unidadId: "u-real", origenRef: "infra-real" })).toBe(false)
  })

  it("/api/cobros-fi/[id] sigue apoyándose en esCobroTest", () => {
    const handler = readFileSync(path.join(RAIZ, "app", "api", "cobros-fi", "[id]", "route.ts"), "utf8")
    expect(handler).toContain('from "@/lib/qa-lab-helpers"')
    expect(handler).toContain("esCobroTest")
  })

  it("el reporter de Playwright conserva su fuente de etapas y su registro", () => {
    const reporter = readFileSync(path.join(RAIZ, "e2e", "reporters", "roadmap-reporter.ts"), "utf8")
    expect(reporter).toContain("ROADMAP_ETAPAS")

    const playwright = readFileSync(path.join(RAIZ, "playwright.config.ts"), "utf8")
    expect(playwright).toContain("./e2e/reporters/roadmap-reporter.ts")
  })
})
