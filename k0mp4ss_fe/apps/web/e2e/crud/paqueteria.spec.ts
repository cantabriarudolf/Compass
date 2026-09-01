import { expect, test } from "@playwright/test"

test.use({ actionTimeout: 30_000 })

test.describe("CRUD — Operaciones/Paqueteria", () => {
  test("vista dedicada: heading + panel encomiendas y flujo recepción TEST-*", async ({ page }) => {
    const errores: string[] = []
    page.on("pageerror", (err) => errores.push(err.message))

    const ts = Date.now()
    const descPaquete = `TEST-${ts}`

    await page.goto("/operaciones/paqueteria")
    await expect(page.getByRole("heading", { name: /Encomiendas/ })).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText("Recepción y retiro de encomiendas")).toBeVisible({ timeout: 10_000 })

    // Panel Encomiendas: labels reales del componente
    await expect(page.getByText("Recepción de encomienda / delivery").first()).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText("Courier / App *").first()).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText("Destinatario").first()).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText("Unidad", { exact: true }).first()).toBeVisible({ timeout: 10_000 })
    await expect(page.getByLabel("Descripción del paquete").first()).toBeVisible({ timeout: 10_000 })
    await expect(page.getByRole("button", { name: "Registrar recepción" }).first()).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText(/Encomiendas del día/).first()).toBeVisible({ timeout: 10_000 })
    await expect(page.getByLabel("Día consultado")).toBeVisible({ timeout: 10_000 })

    // --- Flujo real: recibir encomienda TEST-* nueva ---
    // Seleccionar Courier / App *
    const labelCourier = page.getByText("Courier / App *", { exact: true }).first()
    await expect(labelCourier).toBeVisible({ timeout: 10_000 })
    let triggerCourier = labelCourier.locator("..").getByRole("combobox").first()
    let visC = await triggerCourier.isVisible().catch(() => false)
    if (!visC) {
      const c = page.locator("div").filter({ has: labelCourier }).first()
      triggerCourier = c.getByRole("combobox").first()
    }
    await expect(triggerCourier).toBeVisible({ timeout: 10_000 })
    await triggerCourier.click({ force: true, noWaitAfter: true })
    await page.waitForTimeout(350)
    const optsCourier = page.getByRole("option")
    await expect(optsCourier.first()).toBeVisible({ timeout: 10_000 })
    let pickedCourier = false
    const cntC = await optsCourier.count()
    for (let i = 0; i < cntC; i++) {
      const txt = (await optsCourier.nth(i).textContent())?.trim() ?? ""
      if (!txt || txt === "Seleccionar") continue
      await optsCourier.nth(i).click({ force: true, noWaitAfter: true })
      pickedCourier = true
      break
    }
    if (!pickedCourier) await optsCourier.first().click({ force: true, noWaitAfter: true })
    await page.waitForTimeout(300)

    // Seleccionar Destinatario (preferido) — si no hay, usar Unidad
    let pickedDestino = false
    const labelDest = page.getByText("Destinatario", { exact: true }).first()
    let triggerDest = labelDest.locator("..").getByRole("combobox").first()
    let visD = await triggerDest.isVisible().catch(() => false)
    if (!visD) {
      const c = page.locator("div").filter({ has: labelDest }).first()
      triggerDest = c.getByRole("combobox").first()
    }
    if (await triggerDest.isVisible().catch(() => false)) {
      await triggerDest.click({ force: true, noWaitAfter: true })
      await page.waitForTimeout(350)
      const optsDest = page.getByRole("option")
      const cntD = await optsDest.count()
      if (cntD > 0) {
        await expect(optsDest.first()).toBeVisible({ timeout: 10_000 })
        for (let i = 0; i < cntD; i++) {
          const txt = (await optsDest.nth(i).textContent())?.trim() ?? ""
          if (!txt || txt === "Sin destinatario") continue
          await optsDest.nth(i).click({ force: true, noWaitAfter: true })
          pickedDestino = true
          break
        }
        if (!pickedDestino) {
          // cerrar popover sin elegir (ESC) e intentar Unidad
          await page.keyboard.press("Escape")
          await page.waitForTimeout(200)
        } else {
          await page.waitForTimeout(300)
        }
      }
    }

    if (!pickedDestino) {
      const labelUnidad = page.getByText("Unidad", { exact: true }).first()
      let triggerUnidad = labelUnidad.locator("..").getByRole("combobox").first()
      let visU = await triggerUnidad.isVisible().catch(() => false)
      if (!visU) {
        const c = page.locator("div").filter({ has: labelUnidad }).first()
        triggerUnidad = c.getByRole("combobox").first()
      }
      await expect(triggerUnidad).toBeVisible({ timeout: 10_000 })
      await triggerUnidad.click({ force: true, noWaitAfter: true })
      await page.waitForTimeout(350)
      const optsU = page.getByRole("option")
      await expect(optsU.first()).toBeVisible({ timeout: 10_000 })
      const cntU = await optsU.count()
      for (let i = 0; i < cntU; i++) {
        const txt = (await optsU.nth(i).textContent())?.trim() ?? ""
        if (!txt || txt === "Sin unidad") continue
        await optsU.nth(i).click({ force: true, noWaitAfter: true })
        break
      }
      await page.waitForTimeout(300)
    }

    // Descripción del paquete TEST-*
    const inputDesc = page.getByLabel("Descripción del paquete")
    await expect(inputDesc).toBeVisible({ timeout: 10_000 })
    await inputDesc.fill(descPaquete)

    // Registrar recepción
    const btnRegistrar = page.getByRole("button", { name: "Registrar recepción" })
    await expect(btnRegistrar).toBeVisible({ timeout: 10_000 })
    await btnRegistrar.click({ force: true, noWaitAfter: true })
    await page.waitForTimeout(800)

    // Afirmar fila en tabla del día con TEST-* y estado Recibida
    const row = page.getByRole("row").filter({ hasText: descPaquete })
    await expect(row).toBeVisible({ timeout: 15_000 })
    await expect(row.getByText("Recibida")).toBeVisible({ timeout: 10_000 })

    expect(errores, "Excepciones no capturadas en operaciones/paqueteria").toEqual([])
  })
})
