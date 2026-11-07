// Smoke E2E: sesión admin real, navega cada módulo y verifica que renderiza
// contenido y no lanza excepciones JS no capturadas (pageerror).
import { expect, test } from "@playwright/test"

const MODULOS = [
  "/admin",
  "/comunidad/personas",
  "/comunidad/comunicacion",
  // La pestaña «Biblioteca» de Comunicación se retiró (F35 serie A, T11): el
  // Archivo de Documentos es la única lista y se humea por su propia ruta.
  "/comunidad/archivo",
  // F27: el aviso de cobro del residente. La ruta se humea acá porque la
  // pantalla abre con el portón de la matriz (`fi:gasto_comun` ver para
  // administración y comité, `fi:aviso:propio` ver para el residente) y lee la
  // colección real: si el gate o la lectura se rompen, este módulo lo dice.
  "/comunidad/avisos-cobro",
  // T10 de la serie «Permisos por objeto»: la liquidación de sueldo del
  // trabajador. Se humea acá porque la pantalla abre con el portón de la matriz
  // (`pl:propia` ver para el trabajador, `pl` ver para la administración) y lee
  // la colección real: si el gate o la lectura se rompen, este módulo lo dice.
  "/comunidad/mis-liquidaciones",
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
