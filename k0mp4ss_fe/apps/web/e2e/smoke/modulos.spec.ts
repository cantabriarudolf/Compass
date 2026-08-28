// Smoke E2E: sesión admin real, navega cada módulo y verifica que renderiza
// contenido y no lanza excepciones JS no capturadas (pageerror).
import { expect, test } from "@playwright/test"

const MODULOS = [
  "/admin",
  "/comunidad/personas",
  "/comunidad/comunicacion",
  "/finanzas/gastos-comunes",
  "/inventario/recursos",
  "/operaciones/reservas",
  "/personas/personal",
  "/visor-mensajes",
]

test.describe("Smoke de módulos", () => {
  for (const ruta of MODULOS) {
    test(`módulo ${ruta} renderiza sin errores`, async ({ page }) => {
      const errores: string[] = []
      page.on("pageerror", (err) => errores.push(err.message))

      await page.goto(ruta)

      expect(page.url()).not.toMatch(/\/ingresar/)
      await expect(page.locator("main").first()).toBeVisible()
      expect(errores, `Excepciones no capturadas en ${ruta}`).toEqual([])
    })
  }
})
