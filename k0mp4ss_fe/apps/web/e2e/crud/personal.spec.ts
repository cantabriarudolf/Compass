import { expect, test } from "@playwright/test"

test.use({ actionTimeout: 30_000 })

test.describe("CRUD — Personas/Personal", () => {
  test("crear/editar ficha integral con FKs y verificar cargo visible en la card", async ({ page }) => {
    const errores: string[] = []
    page.on("pageerror", (err) => errores.push(err.message))

    const cargoUnico = `QA-Cargo-${Date.now()}`
    const fechaIngreso = new Date().toISOString().slice(0, 10)

    await page.goto("/personas/personal")

    // Elegir una card de trabajador sin ficha (o con) → click "Crear ficha" / "Editar"
    // El listado está en el tab "Trabajadores" por defecto
    const tabTrabajadores = page.getByRole("tab", { name: /Trabajadores/ })
    // Puede ya estar activo, pero asegurar
    if (await tabTrabajadores.isVisible().catch(() => false)) {
      await tabTrabajadores.click({ force: true, noWaitAfter: true }).catch(() => {})
    }

    // Buscar botón Crear ficha primero, fallback a Editar
    let triggerBtn = page.getByRole("button", { name: "Crear ficha" }).first()
    let hasCrear = (await triggerBtn.count()) > 0 && (await triggerBtn.isVisible().catch(() => false))
    if (!hasCrear) {
      triggerBtn = page.getByRole("button", { name: "Editar" }).first()
    }
    await expect(triggerBtn).toBeVisible({ timeout: 15_000 })
    // Guardar nombre del trabajador para localizar el dialog
    const card = triggerBtn.locator("..").locator("..")
    // Click con quirúrgico pesado
    await triggerBtn.click({ force: true, noWaitAfter: true })

    // Dialog "Ficha Integral — {nombre}"
    const dialog = page.getByRole("dialog")
    await expect(dialog.getByRole("heading", { name: /Ficha Integral —/ })).toBeVisible({ timeout: 15_000 })

    // Llenar "Cargo *" y "Fecha ingreso *"
    const inputCargo = dialog.getByLabel("Cargo *")
    await expect(inputCargo).toBeVisible({ timeout: 10_000 })
    await inputCargo.fill(cargoUnico)

    const inputFecha = dialog.getByLabel("Fecha ingreso *")
    await expect(inputFecha).toBeVisible({ timeout: 10_000 })
    await inputFecha.fill(fechaIngreso)

    // Helpers para selects con FKs obligatorias (AFPs seed)
    // El snapshot muestra que cada campo es <div><Label>X</Label><Select><Trigger combobox>… :contentReference[oaicite:0]{index=0}
    // getByLabel no aplica a Selects → localizar vía Label vecino + combobox hermano
    async function pickSelectByLabel(labelText: string) {
      const label = dialog.getByText(labelText, { exact: true }).first()
      // La combobox está en el mismo contenedor padre que el Label
      let trigger = label.locator("..").getByRole("combobox").first()
      let visible = await trigger.isVisible().catch(() => false)
      if (!visible) {
        // Fallback: buscar el div que contiene el label como hijo directo
        const container = dialog.locator("div").filter({ has: label }).first()
        trigger = container.getByRole("combobox").first()
        visible = await trigger.isVisible().catch(() => false)
        if (!visible) return false
      }
      await trigger.click({ force: true, noWaitAfter: true })
      await page.waitForTimeout(350)
      const options = page.getByRole("option")
      const count = await options.count()
      if (count === 0) {
        await page.keyboard.press("Escape")
        return false
      }
      // Elegir primera opción real (saltar "Sin especificar" / "Sin cargas" / placeholder)
      for (let i = 0; i < count; i++) {
        const txt = (await options.nth(i).textContent())?.trim() ?? ""
        if (!txt) continue
        if (txt === "Sin especificar" || txt === "Sin cargas" || txt === "Seleccionar") continue
        await options.nth(i).click({ force: true, noWaitAfter: true })
        await page.waitForTimeout(200)
        return true
      }
      await options.first().click({ force: true, noWaitAfter: true })
      await page.waitForTimeout(200)
      return true
    }

    // Seleccionar AFP / salud / mutualidad / banco (FKs obligatorias; usa maestros seed)
    // AFP es obligatorio, salud (Fonasa/Isapre) obligatorio, banco obligatorio; mutualidad opcional pero la intentamos
    await pickSelectByLabel("AFP")
    await pickSelectByLabel("Fonasa / Isapre")
    // Mutualidad / Caja es opcional — intentar sin fallar si no hay
    await pickSelectByLabel("Mutualidad / Caja").catch(() => false)
    await pickSelectByLabel("Banco (maestro)")

    // Submit "Guardar ficha" — botón dentro de DialogFooter, puede estar fuera de viewport (ScrollArea)
    // Nota: guardarFicha en el código NO cierra el dialog (mantiene editandoId) — solo muestra okMsg y persiste en store.
    // Por eso tras guardar esperamos el mensaje y cerramos manualmente con Cancelar.
    const btnGuardar = dialog.getByRole("button", { name: "Guardar ficha" })
    await expect(btnGuardar).toBeVisible({ timeout: 10_000 })
    // Asegurar que el botón esté en viewport dentro del dialog scroll
    await btnGuardar.scrollIntoViewIfNeeded().catch(() => {})
    await btnGuardar.click({ force: true, noWaitAfter: true })
    await page.waitForTimeout(800)
    // Si sigue abierto, intentar de nuevo (quirúrgico)
    if (await dialog.isVisible().catch(() => false)) {
      await btnGuardar.scrollIntoViewIfNeeded().catch(() => {})
      await btnGuardar.click({ force: true, noWaitAfter: true }).catch(() => {})
      await page.waitForTimeout(800)
    }

    // Afirmar que la ficha se guardó: aparece okMsg "Ficha de ... guardada." (fuera del dialog) o el store se actualizó
    // El dialog permanece abierto según implementación, así que verificamos el mensaje
    await expect(page.getByText(/Ficha de .* guardada/)).toBeVisible({ timeout: 10_000 })

    // Cerrar el dialog manualmente para ver la card actualizada
    const btnCancelar = dialog.getByRole("button", { name: "Cancelar" })
    if (await btnCancelar.isVisible().catch(() => false)) {
      await btnCancelar.click({ force: true, noWaitAfter: true })
    } else {
      await page.keyboard.press("Escape")
    }
    await expect(dialog).toBeHidden({ timeout: 10_000 })

    // Afirmar que la card muestra el cargo (texto visible en Trabajadores)
    await expect(page.getByText(cargoUnico).first()).toBeVisible({ timeout: 15_000 })

    expect(errores, "Excepciones no capturadas en personas/personal").toEqual([])
  })
})
