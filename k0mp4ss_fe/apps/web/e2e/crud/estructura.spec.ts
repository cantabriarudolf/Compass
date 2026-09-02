import { expect, test } from "@playwright/test"

test.use({ actionTimeout: 30_000 })

test.describe("CRUD — Inventario/Estructura", () => {
  test("crear nueva unidad y verificar fila con número en la Table Unidades", async ({ page }) => {
    const errores: string[] = []
    page.on("pageerror", (err) => errores.push(err.message))

    const titulo = `QA-9999`

    await page.goto("/inventario/estructura")
    await expect(page.getByRole("heading", { name: "Estructura Física" })).toBeVisible({ timeout: 15_000 })

    // La página parte en "Vista Global" — el FormularioUnidad recibe macroSectorId="todos" inicialmente
    // Necesitamos abrir el dialog "Nueva Unidad" y elegir dentro del propio diálogo
    const btnNueva = page.getByRole("button", { name: "Nueva Unidad" })
    await expect(btnNueva.first()).toBeVisible({ timeout: 15_000 })
    await btnNueva.first().click({ force: true, noWaitAfter: true })

    const dialog = page.getByRole("dialog")
    await expect(dialog.getByRole("heading", { name: /Alta de Nueva Unidad/ })).toBeVisible({ timeout: 10_000 })

    // Helper para picks de selects por label
    async function pickByLabel(labelText: string) {
      const label = dialog.getByText(labelText, { exact: true }).first()
      // Intentar localizar combobox cercano
      let trigger = label.locator("..").getByRole("combobox").first()
      const vis = await trigger.isVisible().catch(() => false)
      if (!vis) {
        const container = dialog.locator("div").filter({ has: label }).first()
        trigger = container.getByRole("combobox").first()
      }
      await expect(trigger).toBeVisible({ timeout: 10_000 })
      await trigger.click({ force: true, noWaitAfter: true })
      await page.waitForTimeout(350)
      const opts = page.getByRole("option")
      await expect(opts.first()).toBeVisible({ timeout: 10_000 })
      // Filtrar placeholder si corresponde (e.g. "Seleccione...")
      for (let i = 0; i < (await opts.count()); i++) {
        const txt = (await opts.nth(i).textContent())?.trim() ?? ""
        if (!txt || txt.includes("Seleccione")) continue
        await opts.nth(i).click({ force: true, noWaitAfter: true })
        await page.waitForTimeout(250)
        return true
      }
      await opts.first().click({ force: true, noWaitAfter: true })
      await page.waitForTimeout(250)
      return true
    }

    // Seleccionar Macro-Sector (primer del seed)
    await pickByLabel("Macro-Sector")

    // Seleccionar Sub-Sector (primer del macro elegido)
    // Esperar un poco a que el micro se cargue
    await page.waitForTimeout(300)
    await pickByLabel("Sub-Sector")

    // Seleccionar Categoría Física (Plantilla) — primer tipo activo
    await pickByLabel("Categoría Física (Plantilla)")

    // Llenar Número / Identificador con valor único
    const inputNumero = dialog.locator('input[name="numero"]')
    await expect(inputNumero).toBeVisible({ timeout: 10_000 })
    await inputNumero.fill(titulo)

    // Verificar que el botón Registrar Unidad esté habilitado (requiere microId && tipoId)
    const btnRegistrar = dialog.getByRole("button", { name: "Registrar Unidad" })
    await expect(btnRegistrar).toBeEnabled({ timeout: 10_000 })
    await btnRegistrar.scrollIntoViewIfNeeded().catch(() => {})

    const form = dialog.locator("form")
    try {
      await btnRegistrar.click({ force: true, noWaitAfter: true, timeout: 5_000 })
    } catch {
      await form.evaluate((f) => (f as HTMLFormElement).requestSubmit())
    }
    await page.waitForTimeout(400)
    if (await dialog.isVisible().catch(() => false)) {
      await form.evaluate((f) => (f as HTMLFormElement).requestSubmit())
    }

    await expect(dialog).toBeHidden({ timeout: 10_000 })

    // Afirmar fila QA-9999 en la Table "Unidades"
    await expect(page.getByRole("cell", { name: titulo }).first()).toBeVisible({ timeout: 15_000 })

    expect(errores, "Excepciones no capturadas en inventario/estructura").toEqual([])
  })
})
