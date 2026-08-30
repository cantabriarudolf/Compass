import { expect, test } from "@playwright/test"

test.use({ actionTimeout: 30_000 })

test.describe("CRUD — Inventario/Tipos", () => {
  test("crear nuevo tipo de unidad y verificar fila en Plantillas Técnicas", async ({ page }) => {
    const errores: string[] = []
    page.on("pageerror", (err) => errores.push(err.message))

    const ts = Date.now()
    const titulo = `QA-Loft-${ts}`

    await page.goto("/inventario/tipos")
    // Esperar heading
    await expect(page.getByRole("heading", { name: "Tipos de Unidad" })).toBeVisible({ timeout: 15_000 })

    // Click "Nuevo Tipo"
    const btnNuevo = page.getByRole("button", { name: "Nuevo Tipo" })
    await expect(btnNuevo).toBeVisible({ timeout: 10_000 })
    await btnNuevo.click({ force: true, noWaitAfter: true })

    const dialog = page.getByRole("dialog")
    await expect(dialog.getByRole("heading", { name: /Nuevo Tipo de Unidad/ })).toBeVisible({ timeout: 10_000 })

    // Llenar Nombre del Tipo (input name=nombre)
    const inputNombre = dialog.locator('input[name="nombre"]')
    await expect(inputNombre).toBeVisible({ timeout: 10_000 })
    await inputNombre.fill(titulo)

    // Seleccionar Categoría (primer opción del maestro) — Select con label "Categoría"
    // El Select no tiene htmlFor, usamos Label + combobox vecino
    const labelCategoria = dialog.getByText("Categoría", { exact: true }).first()
    let triggerCategoria = labelCategoria.locator("..").getByRole("combobox").first()
    let visCat = await triggerCategoria.isVisible().catch(() => false)
    if (!visCat) {
      const container = dialog.locator("div").filter({ has: labelCategoria }).first()
      triggerCategoria = container.getByRole("combobox").first()
    }
    await expect(triggerCategoria).toBeVisible({ timeout: 10_000 })
    await triggerCategoria.click({ force: true, noWaitAfter: true })
    await page.waitForTimeout(350)
    const optsCat = page.getByRole("option")
    await expect(optsCat.first()).toBeVisible({ timeout: 10_000 })
    // Elegir primera opción real
    await optsCat.first().click({ force: true, noWaitAfter: true })
    await page.waitForTimeout(250)

    // Llenar Metraje (m²) 55 y Monto Base GC 99999
    const inputMetraje = dialog.locator('input[name="metraje"]')
    await expect(inputMetraje).toBeVisible({ timeout: 10_000 })
    await inputMetraje.fill("55")

    // Monto Base GC usa value controlado (montoSimulado)
    const inputMonto = dialog.locator('input[name="montoBaseGc"]')
    await expect(inputMonto).toBeVisible({ timeout: 10_000 })
    // Limpiar valor previo (0) y poner 99999
    await inputMonto.click({ force: true })
    await inputMonto.fill("99999")
    // alternativamente select all + type
    await page.waitForTimeout(200)

    // Fecha de Vigencia ya tiene default today, no tocar
    // Opcional: asegurar input date visible
    const inputFecha = dialog.locator('input[name="fechaVigencia"]')
    await expect(inputFecha).toBeVisible({ timeout: 10_000 })

    // Submit "Actualizar Tarifario" — puede quedar fuera de viewport en dialog
    const form = dialog.locator("form")
    const btnSubmit = dialog.getByRole("button", { name: "Actualizar Tarifario" })
    await expect(btnSubmit).toBeVisible({ timeout: 10_000 })
    await btnSubmit.scrollIntoViewIfNeeded().catch(() => {})
    try {
      await btnSubmit.click({ force: true, noWaitAfter: true, timeout: 5_000 })
    } catch {
      await form.evaluate((f) => (f as HTMLFormElement).requestSubmit())
    }
    await page.waitForTimeout(400)
    if (await dialog.isVisible().catch(() => false)) {
      await form.evaluate((f) => (f as HTMLFormElement).requestSubmit())
    }

    await expect(dialog).toBeHidden({ timeout: 10_000 })

    // Afirmar fila con el nombre en la Table "Plantillas Técnicas"
    // Tabla header "Tipo", "Metraje Base" etc.
    await expect(page.getByRole("cell", { name: titulo }).first()).toBeVisible({ timeout: 15_000 })

    // Verificar badge categoría visible en la fila (opcional)
    const row = page.getByRole("row").filter({ hasText: titulo })
    await expect(row).toBeVisible({ timeout: 10_000 })

    expect(errores, "Excepciones no capturadas en inventario/tipos").toEqual([])
  })
})
