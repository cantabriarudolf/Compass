import { expect, test } from "@playwright/test"
import { guardarDialogo } from "../helpers/form-dialog"

test.use({ actionTimeout: 30_000 })

test.describe("CRUD — Finanzas/Gastos Comunes", () => {
  test("crear fondo y registrar egreso imputado y verificar en tablas", async ({ page }) => {
    const errores: string[] = []
    page.on("pageerror", (err) => errores.push(err.message))

    const ts = Date.now()
    const nombreFondo = `QA-Fondo-${ts}`
    const descEgreso = `QA Egreso ${ts}`
    const hoy = new Date().toISOString().slice(0, 10)

    await page.goto("/finanzas/gastos-comunes")
    await expect(page.getByRole("heading", { name: /Gastos Comunes y Fondos/ })).toBeVisible({ timeout: 15_000 })

    // Tab Fondos (default) → Nuevo Fondo
    const tabFondos = page.getByRole("tab", { name: "Fondos" })
    if (await tabFondos.isVisible().catch(() => false)) {
      await tabFondos.click({ force: true, noWaitAfter: true })
      await page.waitForTimeout(300)
    }

    const btnNuevoFondo = page.getByRole("button", { name: "Nuevo Fondo" })
    await expect(btnNuevoFondo).toBeVisible({ timeout: 15_000 })
    await btnNuevoFondo.click({ force: true, noWaitAfter: true })

    const dialogFondo = page.getByRole("dialog")
    await expect(dialogFondo.getByRole("heading", { name: /Nuevo fondo/ })).toBeVisible({ timeout: 10_000 })

    // Nombre — id fondo-nombre
    const inputNombre = dialogFondo.locator("#fondo-nombre")
    if (await inputNombre.isVisible().catch(() => false)) {
      await inputNombre.fill(nombreFondo)
    } else {
      // Fallback label vecino
      const labelNombre = dialogFondo.getByText("Nombre", { exact: true }).first()
      let inp = dialogFondo.locator("input").first()
      if (await labelNombre.isVisible().catch(() => false)) {
        const cand = labelNombre.locator("..").locator("input").first()
        if (await cand.isVisible().catch(() => false)) inp = cand
        else {
          const c = dialogFondo.locator("div").filter({ has: labelNombre }).first()
          inp = c.locator("input").first()
        }
      }
      await expect(inp).toBeVisible({ timeout: 10_000 })
      await inp.fill(nombreFondo)
    }

    // Tipo — Select con Label "Tipo"
    const labelTipo = dialogFondo.getByText("Tipo", { exact: true }).first()
    let triggerTipo = dialogFondo.getByRole("combobox").first()
    if (await labelTipo.isVisible().catch(() => false)) {
      const cand = labelTipo.locator("..").getByRole("combobox").first()
      if (await cand.isVisible().catch(() => false)) triggerTipo = cand
      else {
        const c = dialogFondo.locator("div").filter({ has: labelTipo }).first()
        const t = c.getByRole("combobox").first()
        if (await t.isVisible().catch(() => false)) triggerTipo = t
      }
    }
    await expect(triggerTipo).toBeVisible({ timeout: 10_000 })
    await triggerTipo.click({ force: true, noWaitAfter: true })
    await page.waitForTimeout(350)
    // Elegir Gasto Común o Especial — cualquiera visible
    const optTipo = page.getByRole("option", { name: "Gasto Común" })
    if (await optTipo.isVisible().catch(() => false)) {
      await optTipo.click({ force: true, noWaitAfter: true })
    } else {
      // fallback primera opción que no sea placeholder
      const opts = page.getByRole("option")
      const count = await opts.count()
      let clicked = false
      for (let i = 0; i < count; i++) {
        const o = opts.nth(i)
        const txt = (await o.textContent())?.trim() ?? ""
        if (txt && !txt.includes("Selecciona")) {
          await o.click({ force: true, noWaitAfter: true }).catch(() => {})
          clicked = true
          break
        }
      }
      if (!clicked) await page.keyboard.press("Escape")
    }
    await page.waitForTimeout(300)

    // Fondo activo — Switch id fondo-activo debe estar on
    const switchActivo = dialogFondo.locator("#fondo-activo")
    if (await switchActivo.isVisible().catch(() => false)) {
      const aria = await switchActivo.getAttribute("aria-checked")
      if (aria !== "true") {
        await switchActivo.click({ force: true, noWaitAfter: true })
        await page.waitForTimeout(300)
      }
    } else {
      const sw = dialogFondo.getByRole("switch").first()
      if (await sw.isVisible().catch(() => false)) {
        const aria = await sw.getAttribute("aria-checked")
        if (aria !== "true") await sw.click({ force: true, noWaitAfter: true })
      }
    }

    const btnGuardarFondo = dialogFondo.getByRole("button", { name: "Guardar" })
    await expect(btnGuardarFondo).toBeVisible({ timeout: 10_000 })
    // Single-shot idempotente (helper form-dialog): UN envío; sin `fila` (la
    // card del fondo se afirma por texto más abajo) no se reenvía a ciegas.
    await guardarDialogo(page, { boton: btnGuardarFondo, dialogo: dialogFondo })

    // Afirmar card del fondo visible (CardTitle)
    await expect(page.getByText(nombreFondo).first()).toBeVisible({ timeout: 15_000 })

    // Tab Egresos → Registrar Gasto
    const tabEgresos = page.getByRole("tab", { name: "Egresos" })
    await expect(tabEgresos).toBeVisible({ timeout: 10_000 })
    await tabEgresos.click({ force: true, noWaitAfter: true })
    await page.waitForTimeout(400)

    const btnRegistrarGasto = page.getByRole("button", { name: "Registrar Gasto" })
    await expect(btnRegistrarGasto).toBeEnabled({ timeout: 10_000 })
    await expect(btnRegistrarGasto).toBeVisible({ timeout: 10_000 })
    await btnRegistrarGasto.click({ force: true, noWaitAfter: true })

    const dialogEgreso = page.getByRole("dialog")
    await expect(dialogEgreso.getByRole("heading", { name: /Registrar gasto/ })).toBeVisible({ timeout: 10_000 })

    // Fecha hoy
    const inputFecha = dialogEgreso.locator("#egr-fecha")
    if (await inputFecha.isVisible().catch(() => false)) {
      await inputFecha.fill(hoy)
    } else {
      const labelFecha = dialogEgreso.getByText("Fecha", { exact: true }).first()
      let inp = dialogEgreso.locator('input[type="date"]').first()
      if (await labelFecha.isVisible().catch(() => false)) {
        const cand = labelFecha.locator("..").locator("input").first()
        if (await cand.isVisible().catch(() => false)) inp = cand
      }
      await inp.fill(hoy)
    }

    // Monto ($) — id egr-monto
    const inputMonto = dialogEgreso.locator("#egr-monto")
    if (await inputMonto.isVisible().catch(() => false)) {
      await inputMonto.fill("15000")
    } else {
      const labelMonto = dialogEgreso.getByText(/Monto/, { exact: false }).first()
      let inp = dialogEgreso.locator("input").nth(1)
      if (await labelMonto.isVisible().catch(() => false)) {
        const cand = labelMonto.locator("..").locator("input").first()
        if (await cand.isVisible().catch(() => false)) inp = cand
      }
      await inp.fill("15000")
    }

    // Descripción — id egr-desc
    const inputDesc = dialogEgreso.locator("#egr-desc")
    if (await inputDesc.isVisible().catch(() => false)) {
      await inputDesc.fill(descEgreso)
    } else {
      const labelDesc = dialogEgreso.getByText("Descripción", { exact: true }).first()
      let inp = dialogEgreso.locator("input").first()
      if (await labelDesc.isVisible().catch(() => false)) {
        const cand = labelDesc.locator("..").locator("input").first()
        if (await cand.isVisible().catch(() => false)) inp = cand
        else {
          const c = dialogEgreso.locator("div").filter({ has: labelDesc }).first()
          inp = c.locator("input").first()
        }
      }
      await inp.fill(descEgreso)
    }

    // Categoría — Select bajo label "Categoría"
    const labelCat = dialogEgreso.getByText("Categoría", { exact: true }).first()
    let triggerCat = dialogEgreso.getByRole("combobox").first()
    if (await labelCat.isVisible().catch(() => false)) {
      const cand = labelCat.locator("..").getByRole("combobox").first()
      if (await cand.isVisible().catch(() => false)) triggerCat = cand
      else {
        const c = dialogEgreso.locator("div").filter({ has: labelCat }).first()
        const t = c.getByRole("combobox").first()
        if (await t.isVisible().catch(() => false)) triggerCat = t
      }
    } else {
      // fallback second combobox (first is categoria if fondos not counted? actually egr has 2 selects)
      const combos = dialogEgreso.getByRole("combobox")
      if ((await combos.count()) >= 1) triggerCat = combos.first()
    }
    if (await triggerCat.isVisible().catch(() => false)) {
      await triggerCat.click({ force: true, noWaitAfter: true })
      await page.waitForTimeout(350)
      // pick any valid option (Sueldos/Mantención etc) — take Mantención if exists else first
      const optMant = page.getByRole("option", { name: "Mantención" })
      if (await optMant.isVisible().catch(() => false)) await optMant.click({ force: true, noWaitAfter: true })
      else {
        const opt = page.getByRole("option").first()
        if (await opt.isVisible().catch(() => false)) await opt.click({ force: true, noWaitAfter: true })
        else await page.keyboard.press("Escape")
      }
      await page.waitForTimeout(300)
    }

    // Fondo de imputación — debe seleccionar fondo-gc (seed) si existe; si no, el creado
    const labelFondo = dialogEgreso.getByText("Fondo de imputación", { exact: true }).first()
    let triggerFondo = dialogEgreso.getByRole("combobox").last()
    if (await labelFondo.isVisible().catch(() => false)) {
      const cand = labelFondo.locator("..").getByRole("combobox").first()
      if (await cand.isVisible().catch(() => false)) triggerFondo = cand
      else {
        const c = dialogEgreso.locator("div").filter({ has: labelFondo }).first()
        const t = c.getByRole("combobox").first()
        if (await t.isVisible().catch(() => false)) triggerFondo = t
      }
    }
    if (await triggerFondo.isVisible().catch(() => false)) {
      await triggerFondo.click({ force: true, noWaitAfter: true })
      await page.waitForTimeout(350)
      // Intentar fondo-gc que es "Fondo de Gasto Común"
      const optGC = page.getByRole("option", { name: "Fondo de Gasto Común" })
      if (await optGC.isVisible().catch(() => false)) {
        await optGC.click({ force: true, noWaitAfter: true })
      } else {
        const optQA = page.getByRole("option", { name: nombreFondo })
        if (await optQA.isVisible().catch(() => false)) await optQA.click({ force: true, noWaitAfter: true })
        else {
          // primera opción válida que no sea placeholder
          const opts = page.getByRole("option")
          const n = await opts.count()
          for (let i = 0; i < n; i++) {
            const o = opts.nth(i)
            const txt = (await o.textContent())?.trim() ?? ""
            if (txt && txt !== "Selecciona…") {
              await o.click({ force: true, noWaitAfter: true }).catch(() => {})
              break
            }
          }
        }
      }
      await page.waitForTimeout(300)
    }

    const btnRegistrar = dialogEgreso.getByRole("button", { name: "Registrar gasto" })
    await expect(btnRegistrar).toBeVisible({ timeout: 10_000 })
    // Single-shot idempotente (helper form-dialog): UN envío + unicidad de la
    // fila de egresos (descEgreso lleva timestamp: 1 fila = sin duplicado).
    await guardarDialogo(page, {
      boton: btnRegistrar,
      dialogo: dialogEgreso,
      fila: page.getByRole("row").filter({ hasText: descEgreso }),
    })

    // Afirmar fila en Table de egresos con descripción y monto y folio FE-
    const row = page.getByRole("row").filter({ hasText: descEgreso })
    await expect(row).toBeVisible({ timeout: 15_000 })
    await expect(row.getByText("FE-").first()).toBeVisible({ timeout: 10_000 })
    await expect(row.getByText(/15\.?000/).first()).toBeVisible({ timeout: 10_000 })

    expect(errores, "Excepciones no capturadas en finanzas/gastos-comunes").toEqual([])
  })
})
