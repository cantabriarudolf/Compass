import { expect, test } from "@playwright/test"

/**
 * Smoke en viewport móvil (390×844 — tamaño Pixel/smartphone estándar):
 * los módulos principales renderizan sin errores con la cuenta admin.
 * La sidebar se colapsa sola por CSS; no se afirma navegación, solo render.
 */
test.use({ viewport: { width: 390, height: 844 } })

test.describe("Smoke móvil — módulos renderizan en 390×844", () => {
  const rutas = [
    "/dashboard",
    "/admin",
    "/comunidad/personas",
    "/finanzas/gastos-comunes",
    "/operaciones/reservas",
    "/operaciones/bitacora",
    "/inventario/recursos",
    "/admin/logs",
  ]

  for (const ruta of rutas) {
    test(`móvil: ${ruta} renderiza sin errores`, async ({ page }) => {
      const errores: string[] = []
      page.on("pageerror", (err) => errores.push(err.message))

      await page.goto(ruta)
      await expect(page.locator("h1").first()).toBeVisible({ timeout: 30_000 })
      expect(errores, `${ruta} lanzó excepciones JS en viewport móvil`).toEqual([])
    })
  }
})
