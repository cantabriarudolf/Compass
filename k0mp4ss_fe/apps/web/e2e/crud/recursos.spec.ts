import { expect, test } from "@playwright/test"

test.use({ actionTimeout: 30_000 })

test.describe("CRUD — Inventario/Recursos", () => {
  test("crear nuevo recurso insumo con stock crítico y verificar fila en catálogo", async ({ page }) => {
    const errores: string[] = []
    page.on("pageerror", (err) => errores.push(err.message))

    const ts = Date.now()
    const titulo = `QA-Cloro-${ts}`

    await page.goto("/inventario/recursos")
    await expect(page.getByRole("heading", { name: /Recursos/ })).toBeVisible({ timeout: 15_000 })

    // Asegurar tab Catálogo activo (default)
    const tabCatalogo = page.getByRole("tab", { name: "Catálogo" })
    if (await tabCatalogo.isVisible().catch(() => false)) {
      await tabCatalogo.click({ force: true, noWaitAfter: true }).catch(() => {})
    }

    const btnNuevo = page.getByRole("button", { name: "Nuevo recurso" })
    await expect(btnNuevo).toBeVisible({ timeout: 15_000 })
    await btnNuevo.click({ force: true, noWaitAfter: true })

    const dialog = page.getByRole("dialog")
    await expect(dialog.getByRole("heading", { name: "Nuevo recurso" })).toBeVisible({ timeout: 10_000 })

    // Nombre * — placeholder "Ej: Cloro bidón 5L"
    const inputNombre = dialog.getByPlaceholder("Ej: Cloro bidón 5L")
    if (await inputNombre.isVisible().catch(() => false)) {
      await inputNombre.fill(titulo)
    } else {
      // Fallback: label vecino
      const labelNombre = dialog.getByText("Nombre *", { exact: true }).first()
      let inp = labelNombre.locator("..").locator("input").first()
      let vis = await inp.isVisible().catch(() => false)
      if (!vis) {
        const c = dialog.locator("div").filter({ has: labelNombre }).first()
        inp = c.locator("input").first()
      }
      await inp.fill(titulo)
    }

    // Naturaleza — seleccionar "Insumo / Consumible"
    const labelNat = dialog.getByText("Naturaleza", { exact: true }).first()
    let triggerNat = labelNat.locator("..").getByRole("combobox").first()
    let visNat = await triggerNat.isVisible().catch(() => false)
    if (!visNat) {
      const c = dialog.locator("div").filter({ has: labelNat }).first()
      triggerNat = c.getByRole("combobox").first()
    }
    await expect(triggerNat).toBeVisible({ timeout: 10_000 })
    await triggerNat.click({ force: true, noWaitAfter: true })
    await page.waitForTimeout(350)
    const optInsumo = page.getByRole("option", { name: "Insumo / Consumible" })
    if (await optInsumo.isVisible().catch(() => false)) {
      await optInsumo.click({ force: true, noWaitAfter: true })
    } else {
      await page.getByRole("option").first().click({ force: true, noWaitAfter: true })
    }
    await page.waitForTimeout(400)

    // Stock inicial * y esCritico solo visibles cuando categoria === insumo
    // Activar checkbox "Stock crítico"
    const labelCritico = dialog.getByText(/Stock crítico/).first()
    // El checkbox es input type checkbox hijo de label
    const cb = dialog.locator('input[type="checkbox"]').first()
    // Intentar localizar el correcto: hay uno de stock crítico
    // Si no está checked, click
    const isChecked = await cb.isChecked().catch(() => false)
    if (!isChecked) {
      await cb.click({ force: true, noWaitAfter: true })
      await page.waitForTimeout(300)
    } else {
      // Asegurar que el label corresponde
      if (await labelCritico.isVisible().catch(() => false)) {
        // ya está activo
      }
    }

    // Stock inicial * → input number min 0
    const labelStock = dialog.getByText("Stock inicial *", { exact: true }).first()
    let inputStock = labelStock.locator("..").locator("input").first()
    let visStock = await inputStock.isVisible().catch(() => false)
    if (!visStock) {
      const c = dialog.locator("div").filter({ has: labelStock }).first()
      inputStock = c.locator("input").first()
    }
    await expect(inputStock).toBeVisible({ timeout: 10_000 })
    await inputStock.fill("10")

    // Umbral crítico * → input con placeholder "Ej: 5"
    const inputUmbral = dialog.getByPlaceholder("Ej: 5")
    if (await inputUmbral.isVisible().catch(() => false)) {
      await inputUmbral.fill("2")
    } else {
      const labelUmbral = dialog.getByText("Umbral crítico *", { exact: true }).first()
      let inpU = labelUmbral.locator("..").locator("input").first()
      if (!(await inpU.isVisible().catch(() => false))) {
        const c = dialog.locator("div").filter({ has: labelUmbral }).first()
        inpU = c.locator("input").first()
      }
      await inpU.fill("2")
    }

    // Guardar
    const btnGuardar = dialog.getByRole("button", { name: "Guardar" })
    await expect(btnGuardar).toBeVisible({ timeout: 10_000 })
    await btnGuardar.scrollIntoViewIfNeeded().catch(() => {})
    await btnGuardar.click({ force: true, noWaitAfter: true })
    await page.waitForTimeout(600)
    // Fallback si dialog sigue
    if (await dialog.isVisible().catch(() => false)) {
      await btnGuardar.click({ force: true, noWaitAfter: true }).catch(() => {})
      await page.waitForTimeout(600)
    }
    await expect(dialog).toBeHidden({ timeout: 10_000 })

    // Afirmar fila en el catálogo (Table) con el nombre y stock 10
    await expect(page.getByRole("cell", { name: titulo }).first()).toBeVisible({ timeout: 15_000 })
    // stock aparece como "10 / umbral 2" en la celda de Stock
    // Buscar row que contiene titulo
    const row = page.getByRole("row").filter({ hasText: titulo })
    await expect(row).toBeVisible({ timeout: 10_000 })
    await expect(row.getByText(/10/).first()).toBeVisible({ timeout: 10_000 })

    expect(errores, "Excepciones no capturadas en inventario/recursos").toEqual([])
  })
})
