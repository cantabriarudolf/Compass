import { expect, test } from "@playwright/test"
import AxeBuilder from "@axe-core/playwright"

/**
 * Escaneo de accesibilidad (axe-core) sobre módulos principales, cuenta admin.
 * Umbral: SIN violaciones `critical`/`serious` NUEVAS — las preexistentes están
 * en DEUDA_CONOCIDA (por ruta y rule-id) y quedan documentadas como deuda en el
 * avance de la tanda de tipos de prueba. Si axe encuentra un rule-id grave que
 * NO está en la lista, el test falla (gate contra regresiones nuevas).
 */
const DEUDA_CONOCIDA: Record<string, string[]> = {
  "/comunidad/personas": ["aria-valid-attr-value", "button-name", "color-contrast"],
  "/operaciones/bitacora": ["color-contrast"],
  "/inventario/recursos": ["button-name"],
  "/admin/logs": ["scrollable-region-focusable"],
}

test.describe("Accesibilidad (axe-core) — módulos principales", () => {
  const rutas = [
    "/admin",
    "/dashboard",
    "/comunidad/personas",
    "/finanzas/gastos-comunes",
    "/operaciones/reservas",
    "/operaciones/bitacora",
    "/inventario/recursos",
    "/admin/logs",
  ]

  for (const ruta of rutas) {
    test(`a11y: ${ruta} sin violaciones críticas/serias nuevas`, async ({ page }) => {
      await page.goto(ruta)
      // Layouts anidan <main> (strict mode) — espera el heading de página.
      await expect(page.locator("h1").first()).toBeVisible({ timeout: 30_000 })

      const resultados = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze()

      const graves = resultados.violations.filter(
        (v) => v.impact === "critical" || v.impact === "serious",
      )
      const deuda = DEUDA_CONOCIDA[ruta] ?? []
      const nuevas = graves.filter((v) => !deuda.includes(v.id))

      if (graves.length > 0) {
        console.log(
          `[axe] ${ruta}: graves →`,
          graves.map((v) => `${v.id} (${v.impact}, ${v.nodes.length} nodos)`).join(", "),
        )
      }
      const moderadas = resultados.violations.filter(
        (v) => v.impact === "moderate" || v.impact === "minor",
      )
      if (moderadas.length > 0) {
        console.log(
          `[axe] ${ruta}: moderadas/menores (deuda conocida) →`,
          moderadas.map((v) => `${v.id}×${v.nodes.length}`).join(", "),
        )
      }

      expect(
        nuevas.map((v) => `${v.id} (${v.impact})`),
        `${ruta}: violaciones de accesibilidad graves NUEVAS (no en deuda conocida)`,
      ).toEqual([])
    })
  }
})
