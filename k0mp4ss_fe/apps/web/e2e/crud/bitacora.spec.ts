import { expect, test } from "@playwright/test"

test.use({ actionTimeout: 30_000 })

test.describe("CRUD — Operaciones/Bitacora", () => {
  test("registrar visita pre-agendada y marcar ingresada", async ({ page }) => {
    const errores: string[] = []
    page.on("pageerror", (err) => errores.push(err.message))

    const ts = Date.now()
    const nombreVisita = `QA Visita ${ts}`

    await page.goto("/operaciones/bitacora")
    await expect(page.getByRole("heading", { name: /Bitácora Digital/ })).toBeVisible({ timeout: 15_000 })

    // Tab Visitas
    const tabVisitas = page.getByRole("tab", { name: "Visitas" })
    await expect(tabVisitas).toBeVisible({ timeout: 10_000 })
    await tabVisitas.click({ force: true, noWaitAfter: true })
    await page.waitForTimeout(400)

    // Form inline Visitas — Nombre * y DNI *
    const inputNombre = page.getByLabel("Nombre *")
    await expect(inputNombre).toBeVisible({ timeout: 10_000 })
    await inputNombre.fill(nombreVisita)

    const inputDni = page.getByLabel("DNI *")
    await expect(inputDni).toBeVisible({ timeout: 10_000 })
    // RUT válido con DV 0 para 16444555
    await inputDni.fill("16.444.555-0")

    // Unidad destino — Select "Unidad destino"
    const labelUnidad = page.getByText("Unidad destino", { exact: true }).first()
    let triggerUnidad = labelUnidad.locator("..").getByRole("combobox").first()
    const visU = await triggerUnidad.isVisible().catch(() => false)
    if (!visU) {
      const c = page.locator("div").filter({ has: labelUnidad }).first()
      triggerUnidad = c.getByRole("combobox").first()
    }
    // El form de visita tiene dos selects (unidad y residente) — asegurar que es el primero
    await expect(triggerUnidad).toBeVisible({ timeout: 10_000 })
    await triggerUnidad.click({ force: true, noWaitAfter: true })
    await page.waitForTimeout(350)
    const optsU = page.getByRole("option")
    await expect(optsU.first()).toBeVisible({ timeout: 10_000 })
    let picked = false
    const cnt = await optsU.count()
    for (let i = 0; i < cnt; i++) {
      const txt = (await optsU.nth(i).textContent())?.trim() ?? ""
      if (!txt || txt === "Sin unidad") continue
      await optsU.nth(i).click({ force: true, noWaitAfter: true })
      picked = true
      break
    }
    if (!picked) await optsU.first().click({ force: true, noWaitAfter: true })
    await page.waitForTimeout(300)

    // Pre-agendada switch ON — para que estado sea agendada y luego marcar ingresada
    const switchPre = page.getByRole("switch").first()
    // Si no está checked, click
    const isChecked = await switchPre.isChecked().catch(() => false)
    if (!isChecked) {
      await switchPre.click({ force: true, noWaitAfter: true })
      await page.waitForTimeout(300)
    }

    // Registrar visita
    const btnRegistrar = page.getByRole("button", { name: "Registrar visita" })
    await expect(btnRegistrar).toBeVisible({ timeout: 10_000 })
    await btnRegistrar.click({ force: true, noWaitAfter: true })
    await page.waitForTimeout(800)

    // Afirmar fila en tabla del día
    const row = page.getByRole("row").filter({ hasText: nombreVisita })
    await expect(row).toBeVisible({ timeout: 15_000 })
    // Debe contener DNI
    await expect(row.getByText("16.444.555-0")).toBeVisible({ timeout: 10_000 })
    // Estado Agendada
    await expect(row.getByText("Agendada")).toBeVisible({ timeout: 10_000 })

    // Click Marcar Ingresada
    const btnMarcar = row.getByRole("button", { name: "Marcar Ingresada" })
    await expect(btnMarcar).toBeVisible({ timeout: 10_000 })
    await btnMarcar.click({ force: true, noWaitAfter: true })
    await page.waitForTimeout(800)

    // Afirmar estado ingresada
    await expect(row.getByText("Ingresada")).toBeVisible({ timeout: 10_000 })

    expect(errores, "Excepciones no capturadas en operaciones/bitacora").toEqual([])
  })
})
