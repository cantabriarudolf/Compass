import { expect, test } from "@playwright/test"
import { guardarDialogo } from "../helpers/form-dialog"

test.use({ actionTimeout: 30_000 })

test.describe("CRUD — Finanzas/Multas", () => {
  test("registrar infracción desde catálogo y verificar en registro", async ({ page }) => {
    const errores: string[] = []
    page.on("pageerror", (err) => errores.push(err.message))

    const ts = Date.now()
    const antecedentes = `QA ${ts} — antecedentes de prueba suficientes para superar 20 chars`

    await page.goto("/finanzas/multas")
    await expect(page.getByRole("heading", { name: /Infracciones y Multas/ })).toBeVisible({ timeout: 15_000 })

    const tabRegistro = page.getByRole("tab", { name: "Registro" })
    if (await tabRegistro.isVisible().catch(() => false)) {
      await tabRegistro.click({ force: true, noWaitAfter: true })
      await page.waitForTimeout(300)
    }

    const btnRegistrar = page.getByRole("button", { name: "Registrar infracción" })
    await expect(btnRegistrar).toBeVisible({ timeout: 15_000 })
    await btnRegistrar.click({ force: true, noWaitAfter: true })

    const dialog = page.getByRole("dialog")
    await expect(dialog.getByRole("heading", { name: /Registrar infracción/ })).toBeVisible({ timeout: 10_000 })

    // Origen * — Select value "catalogo" vs "dano" — asegurar catalogo
    const labelOrigen = dialog.getByText("Origen *", { exact: true }).first()
    let triggerOrigen = dialog.getByRole("combobox").first()
    if (await labelOrigen.isVisible().catch(() => false)) {
      const cand = labelOrigen.locator("..").getByRole("combobox").first()
      if (await cand.isVisible().catch(() => false)) triggerOrigen = cand
      else {
        const c = dialog.locator("div").filter({ has: labelOrigen }).first()
        const t = c.getByRole("combobox").first()
        if (await t.isVisible().catch(() => false)) triggerOrigen = t
      }
    }
    if (await triggerOrigen.isVisible().catch(() => false)) {
      const cur = (await triggerOrigen.textContent())?.trim() ?? ""
      // Si ya contiene catálogo, dejar; si no, abrir y elegir catálogo
      if (!cur.toLowerCase().includes("catálogo") && !cur.toLowerCase().includes("catalogo")) {
        await triggerOrigen.click({ force: true, noWaitAfter: true })
        await page.waitForTimeout(350)
        const optCat = page.getByRole("option", { name: /Falta del catálogo/ })
        if (await optCat.isVisible().catch(() => false)) await optCat.click({ force: true, noWaitAfter: true })
        else {
          const first = page.getByRole("option").first()
          if (await first.isVisible().catch(() => false)) await first.click({ force: true, noWaitAfter: true }).catch(() => {})
        }
        await page.waitForTimeout(300)
      }
    }

    // Tipo de infracción * — seleccionar primer tipo del catálogo seed
    const labelTipo = dialog.getByText("Tipo de infracción *", { exact: true }).first()
    let triggerTipo = dialog.getByRole("combobox").nth(1)
    // si solo hay count 2, etc, buscar vecino del label
    if (await labelTipo.isVisible().catch(() => false)) {
      const cand = labelTipo.locator("..").getByRole("combobox").first()
      if (await cand.isVisible().catch(() => false)) triggerTipo = cand
      else {
        const c = dialog.locator("div").filter({ has: labelTipo }).first()
        const t = c.getByRole("combobox").first()
        if (await t.isVisible().catch(() => false)) triggerTipo = t
      }
    } else {
      // fallback: segundo combobox asumiendo origen es primero
      const combos = dialog.getByRole("combobox")
      if ((await combos.count()) >= 2) triggerTipo = combos.nth(1)
    }
    if (await triggerTipo.isVisible().catch(() => false)) {
      await triggerTipo.click({ force: true, noWaitAfter: true })
      await page.waitForTimeout(400)
      const options = page.getByRole("option")
      const n = await options.count()
      let picked = false
      for (let i = 0; i < n; i++) {
        const o = options.nth(i)
        const txt = (await o.textContent())?.trim() ?? ""
        if (txt && !txt.includes("Selecciona")) {
          await o.click({ force: true, noWaitAfter: true }).catch(() => {})
          picked = true
          break
        }
      }
      if (!picked) await page.keyboard.press("Escape")
      await page.waitForTimeout(300)
    }

    // Unidad infractora * — seleccionar primera unidad real (saltar placeholder)
    const labelUnidad = dialog.getByText("Unidad infractora *", { exact: true }).first()
    let triggerUnidad = dialog.getByRole("combobox").nth(2)
    if (await labelUnidad.isVisible().catch(() => false)) {
      const cand = labelUnidad.locator("..").getByRole("combobox").first()
      if (await cand.isVisible().catch(() => false)) triggerUnidad = cand
      else {
        const c = dialog.locator("div").filter({ has: labelUnidad }).first()
        const t = c.getByRole("combobox").first()
        if (await t.isVisible().catch(() => false)) triggerUnidad = t
      }
    } else {
      // fallback: buscar combobox con placeholder Selecciona
      const combos = dialog.getByRole("combobox")
      // try to find one that currently shows Selecciona…
      for (let i = 0; i < (await combos.count()); i++) {
        const cb = combos.nth(i)
        const txt = (await cb.textContent())?.trim() ?? ""
        if (txt.includes("Selecciona")) {
          triggerUnidad = cb
          break
        }
      }
    }
    if (await triggerUnidad.isVisible().catch(() => false)) {
      await triggerUnidad.click({ force: true, noWaitAfter: true })
      await page.waitForTimeout(400)
      const opts = page.getByRole("option")
      const n = await opts.count()
      let done = false
      for (let i = 0; i < n; i++) {
        const o = opts.nth(i)
        const isHidden = await o.isHidden().catch(() => false)
        if (isHidden) continue
        const txt = (await o.textContent())?.trim() ?? ""
        if (txt && !txt.includes("Selecciona") && txt !== "") {
          await o.click({ force: true, noWaitAfter: true }).catch(() => {})
          done = true
          break
        }
      }
      if (!done) {
        // fallback first visible
        const first = page.getByRole("option").first()
        if (await first.isVisible().catch(() => false)) await first.click({ force: true, noWaitAfter: true }).catch(() => {})
      }
      await page.waitForTimeout(300)
    }

    // Fecha del suceso * — input type date
    const fechaInput = dialog.locator('input[type="date"]').first()
    // Si hay dos dates? solo hay una para catalogo origen; fill hoy
    const hoy = new Date().toISOString().slice(0, 10)
    if (await fechaInput.isVisible().catch(() => false)) {
      await fechaInput.fill(hoy)
    } else {
      const labelFecha = dialog.getByText("Fecha del suceso *", { exact: true }).first()
      let inp = dialog.locator('input[type="date"]').first()
      if (await labelFecha.isVisible().catch(() => false)) {
        const cand = labelFecha.locator("..").locator("input").first()
        if (await cand.isVisible().catch(() => false)) inp = cand
      }
      await inp.fill(hoy)
    }

    // Hora del suceso * — input type time
    const horaInput = dialog.locator('input[type="time"]').first()
    if (await horaInput.isVisible().catch(() => false)) {
      await horaInput.fill("14:30")
    } else {
      const labelHora = dialog.getByText("Hora del suceso *", { exact: true }).first()
      let inp = dialog.locator('input[type="time"]').first()
      if (await labelHora.isVisible().catch(() => false)) {
        const cand = labelHora.locator("..").locator("input").first()
        if (await cand.isVisible().catch(() => false)) inp = cand
      }
      await inp.fill("14:30")
    }

    // Antecedentes * — textarea con placeholder Descripción detallada...
    let textarea = dialog.locator("textarea").first()
    if (!(await textarea.isVisible().catch(() => false))) {
      const labelAnt = dialog.getByText(/Antecedentes \*/, { exact: false }).first()
      if (await labelAnt.isVisible().catch(() => false)) {
        const c = dialog.locator("div").filter({ has: labelAnt }).first()
        const ta = c.locator("textarea").first()
        if (await ta.isVisible().catch(() => false)) textarea = ta
        else textarea = dialog.locator("textarea").first()
      }
    }
    await expect(textarea).toBeVisible({ timeout: 10_000 })
    await textarea.fill(antecedentes)

    // Submit Registrar — single-shot idempotente (helper form-dialog): UN
    // envío; sin `fila` (la tabla se afirma por fecha con .first() más abajo)
    // no se reenvía a ciegas.
    const btnSubmit = dialog.getByRole("button", { name: "Registrar" })
    await expect(btnSubmit).toBeVisible({ timeout: 10_000 })
    await guardarDialogo(page, { boton: btnSubmit, dialogo: dialog })

    // Afirmar fila en registro (Table) — buscar row con antecedentes texto corto o unidad?
    // La tabla muestra Folio, Falta/Daño, Unidad, Fecha suceso, Estado, Monto
    // Filtrar por antecedentes fragmento no esta en tabla; usamos unidad y estado En Revisión
    // Buscar primera fila con En Revisión y verificar que existe
    // Para ser determinístico, buscar row que contenga la fecha de hoy
    const row = page.getByRole("row").filter({ hasText: hoy })
    await expect(row.first()).toBeVisible({ timeout: 15_000 })
    await expect(row.first().getByText("En Revisión").first()).toBeVisible({ timeout: 10_000 })

    expect(errores, "Excepciones no capturadas en finanzas/multas").toEqual([])
  })
})
