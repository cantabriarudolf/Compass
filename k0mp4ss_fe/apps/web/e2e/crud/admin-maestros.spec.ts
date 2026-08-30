import { expect, test } from "@playwright/test"

test.use({ actionTimeout: 30_000 })

test.describe("CRUD — Admin/Maestros", () => {
  test("crear un nuevo maestro en Estados de Ocupacion y verificar fila en Table", async ({ page }) => {
    const errores: string[] = []
    page.on("pageerror", (err) => errores.push(err.message))

    const titulo = `QA-EdO-${Date.now()}`

    await page.goto("/admin/maestros")

    // Seleccionar sub-tab "Estados de Ocupación" del panel izquierdo (inventario)
    await page.getByRole("button", { name: "Estados de Ocupación" }).click({ force: true, noWaitAfter: true })

    // El botón header "Nuevo Registro" debe habilitarse tras elegir sub-tab
    const btnNuevo = page.getByRole("button", { name: /Nuevo Registro/ })
    await expect(btnNuevo).toBeEnabled({ timeout: 10_000 })
    await btnNuevo.click({ force: true, noWaitAfter: true })

    // Dialog "Añadir Nuevo Maestro"
    const dialog = page.getByRole("dialog")
    await expect(dialog.getByRole("heading", { name: /Añadir Nuevo Maestro/ })).toBeVisible({ timeout: 10_000 })

    // Llenar "Nombre / Categoría" con valor único (input name=nombre)
    await dialog.locator('input[name="nombre"]').fill(titulo)

    // Submit "Guardar" — usar requestSubmit por si queda fuera de viewport
    const form = dialog.locator("form")
    // Intento 1: click forzado
    const btnGuardar = dialog.getByRole("button", { name: "Guardar" })
    try {
      await btnGuardar.click({ force: true, noWaitAfter: true, timeout: 5_000 })
    } catch {
      await form.evaluate((f) => (f as HTMLFormElement).requestSubmit())
    }
    // Fallback requestSubmit si el dialog sigue abierto (quirúrgico)
    await page.waitForTimeout(400)
    if (await dialog.isVisible().catch(() => false)) {
      await form.evaluate((f) => (f as HTMLFormElement).requestSubmit())
    }

    // Afirmar fila nueva en la Table del sub-tab — hay 2 celdas con mismo nombre (Nombre + Badge) → usar first()
    await expect(dialog).toBeHidden({ timeout: 10_000 })
    await expect(page.getByRole("cell", { name: titulo }).first()).toBeVisible({ timeout: 15_000 })

    // Desviación check: editar opcional pencil -> "Editar Maestro"
    // No bloqueante, solo verifica que el lápiz abre edición
    const row = page.getByRole("row").filter({ hasText: titulo })
    await expect(row).toBeVisible()
    const editBtn = row.getByRole("button").first()
    await editBtn.click({ force: true, noWaitAfter: true })
    await expect(page.getByRole("heading", { name: /Editar Maestro/ })).toBeVisible({ timeout: 5_000 })
    await page.keyboard.press("Escape")
    await expect(dialog).toBeHidden({ timeout: 5_000 })

    expect(errores, "Excepciones no capturadas en admin/maestros").toEqual([])
  })
})
