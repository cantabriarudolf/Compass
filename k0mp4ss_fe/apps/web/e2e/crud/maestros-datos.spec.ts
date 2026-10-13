// P2 (SERIE-VALIDACION-PERFILES) — admin recorre /admin/maestros con datos.
// Las 8 subtabs (estados, macros, micros, tipos, condiciones,
// estadosInmobiliarios, emergencias, bancos) muestran filas del seed;
// además crea 1 registro TEST-* y verifica su fila. Sin conteos frágiles.
import { expect, test } from "@playwright/test"
import { guardarDialogo } from "../helpers/form-dialog"

test.use({ actionTimeout: 30_000 })

const SUBTABS: Array<{ padre: string; sub: string }> = [
  { padre: "Estructura e Inventario", sub: "Estados de Ocupación" },
  { padre: "Estructura e Inventario", sub: "Categorías Macro Sectores" },
  { padre: "Estructura e Inventario", sub: "Categorías Micro Sectores" },
  { padre: "Estructura e Inventario", sub: "Categorías de Unidad" },
  { padre: "Personas y Comunidad", sub: "Condiciones Especiales" },
  { padre: "Personas y Comunidad", sub: "Estados Inmobiliarios" },
  { padre: "Personas y Comunidad", sub: "Directorio de Emergencia" },
  { padre: "Finanzas y RRHH", sub: "Instituciones Bancarias" },
] as const

test.describe("CRUD — Maestros con datos por perfil admin", () => {
  test.use({ storageState: "e2e/.auth/admin.json" })

  test("las 8 subtabs muestran datos + crea 1 TEST-*", async ({ page }) => {
    const errores: string[] = []
    page.on("pageerror", (err) => errores.push(err.message))

    await page.goto("/admin/maestros")
    await expect(
      page.getByRole("heading", { name: /Maestros Administrativos/ })
    ).toBeVisible({ timeout: 15_000 })

    for (const { padre, sub } of SUBTABS) {
      await page
        .getByRole("tab", { name: padre })
        .click({ force: true, noWaitAfter: true })
      await page.waitForTimeout(300)
      await page
        .getByRole("button", { name: sub })
        .click({ force: true, noWaitAfter: true })
      await page.waitForTimeout(500)
      // Al menos una fila de datos del seed (header + ≥1 fila ⇒ ≥2 rows).
      const filas = page.getByRole("row")
      await expect(filas.first()).toBeVisible({ timeout: 10_000 })
      expect(await filas.count()).toBeGreaterThanOrEqual(2)
    }

    // Crear 1 registro TEST-* en bancos (subtab simple: solo nombre).
    const titulo = `TEST-BANCO-${Date.now()}`
    await page
      .getByRole("tab", { name: "Finanzas y RRHH" })
      .click({ force: true, noWaitAfter: true })
    await page.waitForTimeout(300)
    await page
      .getByRole("button", { name: "Instituciones Bancarias" })
      .click({ force: true, noWaitAfter: true })
    await page.waitForTimeout(400)
    const btnNuevo = page.getByRole("button", { name: /Nuevo Registro/ })
    await expect(btnNuevo).toBeEnabled({ timeout: 10_000 })
    await btnNuevo.click({ force: true, noWaitAfter: true })

    const dialog = page.getByRole("dialog")
    await expect(
      dialog.getByRole("heading", { name: /Añadir Nuevo Maestro/ })
    ).toBeVisible({ timeout: 10_000 })
    await dialog.locator('input[name="nombre"]').fill(titulo)
    const btnGuardar = dialog.getByRole("button", { name: "Guardar" })
    // Single-shot idempotente (helper form-dialog): UN envío, y la fila
    // recién creada se afirma única (un duplicado falla ruidoso acá).
    await guardarDialogo(page, {
      boton: btnGuardar,
      dialogo: dialog,
      fila: page.getByRole("row").filter({ hasText: titulo }),
      timeoutMs: 10_000,
    })
    await expect(page.getByRole("cell", { name: titulo }).first()).toBeVisible({
      timeout: 15_000,
    })

    expect(errores, "Excepciones no capturadas en admin/maestros").toEqual([])
  })
})
