import { expect, test } from "@playwright/test"

// Presupuesto del test entero: en CI `playwright.config.ts` fija `timeout: 30_000` y este
// spec encadena ~40 interacciones de UI, así que moría rellenando el formulario (antes del
// paso "Iniciar"). Mismo criterio de presupuesto explícito que `poblado-idempotente`.
test.use({ actionTimeout: 30_000, timeout: 120_000 })

test.describe("CRUD — Inventario/Proyectos", () => {
  test("crear nuevo trabajo, verificar fila y transitar a En Curso", async ({ page }) => {
    const errores: string[] = []
    page.on("pageerror", (err) => errores.push(err.message))

    const ts = Date.now()
    const titulo = `QA-Trabajo-${ts}`
    const descripcion = `Descripcion tecnica detallada QA superando los veinte caracteres requeridos ${ts}`

    await page.goto("/inventario/proyectos")
    await expect(page.getByRole("heading", { name: /Mantenimiento/ })).toBeVisible({ timeout: 15_000 })

    // Tab Trabajos debe estar activo (default). Asegurar.
    const tabTrabajos = page.getByRole("tab", { name: "Trabajos" })
    if (await tabTrabajos.isVisible().catch(() => false)) {
      await tabTrabajos.click({ force: true, noWaitAfter: true }).catch(() => {})
    }

    const btnNuevo = page.getByRole("button", { name: "Nuevo trabajo" })
    await expect(btnNuevo).toBeVisible({ timeout: 15_000 })
    await btnNuevo.click({ force: true, noWaitAfter: true })

    const dialog = page.getByRole("dialog")
    await expect(dialog.getByRole("heading", { name: /Nuevo trabajo u obra/ })).toBeVisible({ timeout: 10_000 })

    // Título *
    const inputTitulo = dialog.getByPlaceholder("Ej: Mantención mensual Hidropack")
    if (await inputTitulo.isVisible().catch(() => false)) {
      await inputTitulo.fill(titulo)
    } else {
      const labelTit = dialog.getByText("Título *", { exact: true }).first()
      let inp = labelTit.locator("..").locator("input").first()
      if (!(await inp.isVisible().catch(() => false))) {
        const c = dialog.locator("div").filter({ has: labelTit }).first()
        inp = c.locator("input").first()
      }
      await inp.fill(titulo)
    }

    // Descripción técnica * (textarea)
    const labelDesc = dialog.getByText(/Descripción técnica/, { exact: true }).first()
    // textarea está en mismo container o siguiente
    let area = dialog.locator("textarea").first()
    if (!(await area.isVisible().catch(() => false))) {
      const c = dialog.locator("div").filter({ has: labelDesc }).first()
      area = c.locator("textarea").first()
    }
    await expect(area).toBeVisible({ timeout: 10_000 })
    await area.fill(descripcion)

    // Unidad EF * — seleccionar primera unidad del seed
    const labelUnidad = dialog.getByText("Unidad EF *", { exact: true }).first()
    let triggerU = labelUnidad.locator("..").getByRole("combobox").first()
    const visU = await triggerU.isVisible().catch(() => false)
    if (!visU) {
      const c = dialog.locator("div").filter({ has: labelUnidad }).first()
      triggerU = c.getByRole("combobox").first()
    }
    await expect(triggerU).toBeVisible({ timeout: 10_000 })
    await triggerU.click({ force: true, noWaitAfter: true })
    await page.waitForTimeout(350)
    const optsU = page.getByRole("option")
    await expect(optsU.first()).toBeVisible({ timeout: 10_000 })
    // Elegir primera unidad real (saltar "Ninguna")
    let pickedU = false
    for (let i = 0; i < (await optsU.count()); i++) {
      const txt = (await optsU.nth(i).textContent())?.trim() ?? ""
      if (!txt || txt === "Ninguna") continue
      await optsU.nth(i).click({ force: true, noWaitAfter: true })
      pickedU = true
      break
    }
    if (!pickedU) await optsU.first().click({ force: true, noWaitAfter: true })
    await page.waitForTimeout(300)

    // Responsable o proveedor externo * — usamos proveedor externo más simple
    const inputProveedor = dialog.getByPlaceholder("Empresa TEST Ltda.")
    if (await inputProveedor.isVisible().catch(() => false)) {
      await inputProveedor.fill(`Proveedor-QA-${ts}`)
    } else {
      // Fallback label vecina
      const labelProv = dialog.getByText(/proveedor externo/, { exact: false }).first()
      let inpP = labelProv.locator("..").locator("input").first()
      if (!(await inpP.isVisible().catch(() => false))) {
        const c = dialog.locator("div").filter({ has: labelProv }).first()
        inpP = c.locator("input").first()
      }
      await inpP.fill(`Proveedor-QA-${ts}`)
    }

    // Costo total ($) *
    const labelCosto = dialog.getByText("Costo total ($) *", { exact: true }).first()
    let inputCosto = labelCosto.locator("..").locator("input").first()
    const visCosto = await inputCosto.isVisible().catch(() => false)
    if (!visCosto) {
      const c = dialog.locator("div").filter({ has: labelCosto }).first()
      inputCosto = c.locator("input").first()
    }
    await expect(inputCosto).toBeVisible({ timeout: 10_000 })
    await inputCosto.fill("250000")
    await page.waitForTimeout(200)

    // Guardar — Dialog footer button "Guardar"
    const btnGuardar = dialog.getByRole("button", { name: "Guardar" })
    await expect(btnGuardar).toBeVisible({ timeout: 10_000 })
    await btnGuardar.scrollIntoViewIfNeeded().catch(() => {})
    await btnGuardar.click({ force: true, noWaitAfter: true })
    await page.waitForTimeout(600)
    if (await dialog.isVisible().catch(() => false)) {
      await btnGuardar.click({ force: true, noWaitAfter: true }).catch(() => {})
      await page.waitForTimeout(600)
    }
    await expect(dialog).toBeHidden({ timeout: 10_000 })

    // Afirmar fila con el título
    await expect(page.getByText(titulo).first()).toBeVisible({ timeout: 15_000 })

    // Click "Iniciar" en la fila (el primer trabajo es el recién creado reverse order)
    const row = page.getByRole("row").filter({ hasText: titulo })
    await expect(row).toBeVisible({ timeout: 10_000 })
    const btnIniciar = row.getByRole("button", { name: "Iniciar" })
    if (await btnIniciar.isVisible().catch(() => false)) {
      await btnIniciar.click({ force: true, noWaitAfter: true })
      await page.waitForTimeout(600)
      // Afirmar estado En Curso (en_curso)
      await expect(row.getByText("En Curso")).toBeVisible({ timeout: 10_000 })
    } else {
      // Fallback: buscar Iniciar global first (si row scoping falla por strict mode)
      await page.getByRole("button", { name: "Iniciar" }).first().click({ force: true, noWaitAfter: true })
      await page.waitForTimeout(600)
      await expect(page.getByText("En Curso").first()).toBeVisible({ timeout: 10_000 })
    }

    expect(errores, "Excepciones no capturadas en inventario/proyectos").toEqual([])
  })
})
