import { expect, test } from "@playwright/test"

test.use({ actionTimeout: 30_000 })

test.describe("CRUD — Admin/Configuracion", () => {
  test("editar Nombre de la Comunidad, guardar (alert nativo) y verificar persistencia", async ({ page }) => {
    const errores: string[] = []
    page.on("pageerror", (err) => errores.push(err.message))
    // alert() nativo al guardar — registrar antes
    page.on("dialog", async (d) => await d.accept())

    const nuevoNombre = `QA-Comunidad-${Date.now()}`

    await page.goto("/admin/configuracion")

    // Localizar input "Nombre de la Comunidad *"
    // El Label no tiene htmlFor, así que getByLabel falla → usar texto + textbox vecino (ver snapshot error-context)
    const inputNombre = page.getByText("Nombre de la Comunidad *").locator("..").getByRole("textbox").first()
    // Fallback: primer textbox de Identidad Legal si el anterior no se resuelve
    const targetInput = (await inputNombre.count()) > 0 ? inputNombre : page.getByRole("textbox").first()
    await expect(targetInput).toBeVisible({ timeout: 15_000 })
    await targetInput.fill(nuevoNombre)

    // Click header "Guardar Cambios" (fuera del form, asociado a form#config-form)
    const btnGuardar = page.getByRole("button", { name: "Guardar Cambios" })
    await expect(btnGuardar).toBeVisible({ timeout: 10_000 })
    await btnGuardar.click({ force: true, noWaitAfter: true })

    // Tras alert aceptado, navegar de nuevo dentro del mismo test y afirmar persistencia
    // Esperar un tick para que el store persista en localStorage
    await page.waitForTimeout(800)
    await page.goto("/admin/configuracion")
    const inputRecheck = page.getByText("Nombre de la Comunidad *").locator("..").getByRole("textbox").first()
    const recheckTarget = (await inputRecheck.count()) > 0 ? inputRecheck : page.getByRole("textbox").first()
    await expect(recheckTarget).toHaveValue(nuevoNombre, { timeout: 10_000 })

    expect(errores, "Excepciones no capturadas en admin/configuracion").toEqual([])
  })
})
