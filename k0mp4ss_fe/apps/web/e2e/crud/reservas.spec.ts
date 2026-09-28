import { expect, test } from "@playwright/test"

test.use({ actionTimeout: 30_000 })

test.describe("CRUD — Operaciones/Reservas", () => {
  test("crear elemento reservable y confirmar reserva en calendario", async ({ page }) => {
    const errores: string[] = []
    page.on("pageerror", (err) => errores.push(err.message))

    const ts = Date.now()
    const tituloElemento = `QA-Sala-${ts}`
    const manana = new Date(Date.now() + 86400000).toISOString().slice(0, 10)

    await page.goto("/operaciones/reservas")
    await expect(page.getByRole("heading", { name: /Reservas y Amenities/ })).toBeVisible({ timeout: 15_000 })

    // Tab Elementos
    const tabElementos = page.getByRole("tab", { name: "Elementos" })
    await expect(tabElementos).toBeVisible({ timeout: 10_000 })
    await tabElementos.click({ force: true, noWaitAfter: true })
    await page.waitForTimeout(400)

    // Nuevo elemento reservable
    const btnNuevoElemento = page.getByRole("button", { name: "Nuevo elemento reservable" })
    await expect(btnNuevoElemento).toBeVisible({ timeout: 10_000 })
    await btnNuevoElemento.click({ force: true, noWaitAfter: true })

    const dialogEl = page.getByRole("dialog")
    await expect(dialogEl.getByRole("heading", { name: /Nuevo elemento reservable/ })).toBeVisible({ timeout: 10_000 })

    // Nombre * — placeholder "Ej: Quincho central"
    const inputNombre = dialogEl.getByPlaceholder("Ej: Quincho central")
    if (await inputNombre.isVisible().catch(() => false)) {
      await inputNombre.fill(tituloElemento)
    } else {
      const label = dialogEl.getByText("Nombre *", { exact: true }).first()
      let inp = label.locator("..").locator("input").first()
      if (!(await inp.isVisible().catch(() => false))) {
        const c = dialogEl.locator("div").filter({ has: label }).first()
        inp = c.locator("input").first()
      }
      await inp.fill(tituloElemento)
    }

    // Sub-sector EF * — obligatorio ubicación (microSector o activo IR). Elegir primer microSector real
    {
      const labelMicro = dialogEl.getByText("Sub-sector EF", { exact: true }).first()
      let triggerMicro = labelMicro.locator("..").getByRole("combobox").first()
      const visMicro = await triggerMicro.isVisible().catch(() => false)
      if (!visMicro) {
        const c = dialogEl.locator("div").filter({ has: labelMicro }).first()
        triggerMicro = c.getByRole("combobox").first()
      }
      await expect(triggerMicro).toBeVisible({ timeout: 10_000 })
      await triggerMicro.click({ force: true, noWaitAfter: true })
      await page.waitForTimeout(350)
      const opts = page.getByRole("option")
      await expect(opts.first()).toBeVisible({ timeout: 10_000 })
      let picked = false
      const cnt = await opts.count()
      for (let i = 0; i < cnt; i++) {
        const txt = (await opts.nth(i).textContent())?.trim() ?? ""
        if (!txt || txt === "Ninguno") continue
        await opts.nth(i).click({ force: true, noWaitAfter: true })
        picked = true
        break
      }
      if (!picked) await opts.first().click({ force: true, noWaitAfter: true })
      await page.waitForTimeout(300)
    }

    // Tarifas default 0 — asegurar que tarifaUso sea 0 (input type number con label Tarif)
    // No tocar, pero verificar visible para quirúrgico
    // Submit Guardar — quirúrgico: dialog scrollable puede ocultar footer
    const btnGuardarEl = dialogEl.getByRole("button", { name: "Guardar" })
    await expect(btnGuardarEl).toBeVisible({ timeout: 10_000 })
    await btnGuardarEl.scrollIntoViewIfNeeded().catch(() => {})
    await page.waitForTimeout(300)
    // Click con fallback evaluate (sin form, requestSubmit no aplica)
    try {
      await btnGuardarEl.click({ force: true, noWaitAfter: true, timeout: 5_000 })
    } catch {
      await btnGuardarEl.evaluate((el) => (el as HTMLElement).click()).catch(() => {})
    }
    await page.waitForTimeout(800)
    if (await dialogEl.isVisible().catch(() => false)) {
      // Reintento evaluate + verificar error visible arriba de la página
      const err = page.locator("p.text-destructive").first()
      if (await err.isVisible().catch(() => false)) {
        const txt = await err.textContent().catch(() => "")
        console.log("[reservas] error tras Guardar:", txt)
      }
      await btnGuardarEl.evaluate((el) => (el as HTMLElement).click()).catch(() => {})
      await page.waitForTimeout(800)
      if (await dialogEl.isVisible().catch(() => false)) {
        // último fallback: click via page
        await page.evaluate(() => {
          const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.includes('Guardar'))
          if (btn) (btn as HTMLElement).click()
        })
        await page.waitForTimeout(800)
      }
    }
    await expect(dialogEl).toBeHidden({ timeout: 10_000 })

    // Verificar fila en tabla de elementos
    await expect(page.getByRole("cell", { name: tituloElemento }).first()).toBeVisible({ timeout: 15_000 })

    // Volver a Calendario y crear reserva
    const tabCalendario = page.getByRole("tab", { name: "Calendario" })
    await expect(tabCalendario).toBeVisible({ timeout: 10_000 })
    await tabCalendario.click({ force: true, noWaitAfter: true })
    await page.waitForTimeout(300)

    const btnNuevaReserva = page.getByRole("button", { name: "Nueva reserva" })
    await expect(btnNuevaReserva).toBeVisible({ timeout: 10_000 })
    await btnNuevaReserva.click({ force: true, noWaitAfter: true })

    const dialogRes = page.getByRole("dialog")
    await expect(dialogRes.getByRole("heading", { name: /Nueva reserva/ })).toBeVisible({ timeout: 10_000 })

    // Helper para picks de Select via label vecino
    async function pickByLabel(dialog: import("@playwright/test").Locator, labelExact: string, optionName?: RegExp | string) {
      const label = dialog.getByText(labelExact, { exact: true }).first()
    // P2 E2E-FULL-VERDE: click atómico (el force a veces no completa el
    // handler bajo carga dev). Un solo click + espera larga: re-clicar hace
    // toggle y cierra el popper.
    const opts = page.getByRole("option")
    const localizarTrigger = async () => {
      let t = label.locator("..").getByRole("combobox").first()
      if (!await t.isVisible().catch(() => false)) {
        t = dialog.locator("div").filter({ has: label }).first().getByRole("combobox").first()
      }
      return t
    }
    await expect(await localizarTrigger()).toBeVisible({ timeout: 10_000 })
    await (await localizarTrigger()).evaluate((el) => (el as HTMLElement).click()).catch(() => {})
    try {
      await expect(opts.first()).toBeVisible({ timeout: 10_000 })
    } catch {
      // Solo si sigue sin options (popper no abrió): reintentar una vez.
      await (await localizarTrigger()).evaluate((el) => (el as HTMLElement).click()).catch(() => {})
      await expect(opts.first()).toBeVisible({ timeout: 10_000 })
    }
      if (optionName) {
        // P2: clicar por texto + verificar que el trigger tomó el valor
        // (el click a veces no completa bajo carga dev) → reintentar.
        const patron = optionName instanceof RegExp ? optionName : new RegExp(optionName as string)
        let elegido = false
        for (let r = 0; r < 3 && !elegido; r++) {
          const cnt = await opts.count()
          for (let i = 0; i < cnt; i++) {
            const txt = (await opts.nth(i).textContent())?.trim() ?? ""
            if (!patron.test(txt)) continue
            await opts.nth(i).evaluate((el) => (el as HTMLElement).click()).catch(() => {})
            await page.waitForTimeout(500)
            break
          }
          const trigTxt = ((await (await localizarTrigger()).textContent().catch(() => "")) ?? "").trim()
          elegido = patron.test(trigTxt)
          if (!elegido) {
            await (await localizarTrigger()).evaluate((el) => (el as HTMLElement).click()).catch(() => {})
            await page.waitForTimeout(600)
          }
        }
      } else {
        // Primera opción real saltando placeholder + verificación (misma race).
        const esPlaceholder = (t: string) => !t || t === "Selecciona…" || t === "—" || t === "Ninguna" || t === "Ninguno"
        let elegido = false
        for (let r = 0; r < 3 && !elegido; r++) {
          const cnt = await opts.count()
          for (let i = 0; i < cnt; i++) {
            const txt = (await opts.nth(i).textContent())?.trim() ?? ""
            if (esPlaceholder(txt)) continue
            await opts.nth(i).evaluate((el) => (el as HTMLElement).click()).catch(() => {})
            await page.waitForTimeout(500)
            break
          }
          const trigTxt = ((await (await localizarTrigger()).textContent().catch(() => "")) ?? "").trim()
          elegido = !esPlaceholder(trigTxt)
          if (!elegido) {
            await (await localizarTrigger()).evaluate((el) => (el as HTMLElement).click()).catch(() => {})
            await page.waitForTimeout(600)
          }
        }
      }
      await page.waitForTimeout(300)
    }

    // Elemento reservable * = el creado (regex insensible a caso: el trigger
    // muestra el nombre normalizado a Título Caso, no el QA-SALA original).
    await pickByLabel(dialogRes, "Elemento reservable *", new RegExp(tituloElemento, "i"))

    // Solicitante (MP) * = primera persona activa
    await pickByLabel(dialogRes, "Solicitante (MP) *")

    // Fecha * — input type date
    const inputFecha = dialogRes.locator('input[type="date"]').first()
    await expect(inputFecha).toBeVisible({ timeout: 10_000 })
    await inputFecha.fill(manana)
    await page.waitForTimeout(200)

    // Tramo horario * — pick primer slot disponible
    await pickByLabel(dialogRes, "Tramo horario *")

    // Submit Confirmar disponibilidad y reservar
    const btnConfirmar = dialogRes.getByRole("button", { name: "Confirmar disponibilidad y reservar" })
    await expect(btnConfirmar).toBeVisible({ timeout: 10_000 })
    await btnConfirmar.scrollIntoViewIfNeeded().catch(() => {})
    await btnConfirmar.click({ force: true, noWaitAfter: true })
    await page.waitForTimeout(800)

    // Fallback si sigue visible (posible error de validación)
    if (await dialogRes.isVisible().catch(() => false)) {
      await btnConfirmar.click({ force: true, noWaitAfter: true }).catch(() => {})
      await page.waitForTimeout(600)
    }
    await expect(dialogRes).toBeHidden({ timeout: 10_000 })

    // Afirmar fila en calendario con el elemento y estado confirmada
    // Volver a asegurar Calendario visible
    await expect(page.getByRole("cell", { name: tituloElemento }).first()).toBeVisible({ timeout: 15_000 })
    const row = page.getByRole("row").filter({ hasText: tituloElemento })
    await expect(row).toBeVisible({ timeout: 10_000 })
    await expect(row.getByText("Confirmada")).toBeVisible({ timeout: 10_000 })

    expect(errores, "Excepciones no capturadas en operaciones/reservas").toEqual([])
  })
})
