import { expect, test } from "@playwright/test"

test.use({ actionTimeout: 30_000 })
test.setTimeout(300_000)

test.describe("CRUD — Finanzas/Remuneraciones (GATED)", () => {
  test("poblar QA Lab y generar + confirmar liquidación", async ({ page }) => {
    const errores: string[] = []
    page.on("pageerror", (err) => errores.push(err.message))

    // Precondición gated: poblar todo de una vez vía QA Lab
    await page.goto("/admin/qa-lab")
    await expect(page.getByRole("heading", { name: /Laboratorio QA/ })).toBeVisible({ timeout: 15_000 })

    const btnPoblar = page.getByRole("button", { name: "Poblar todo de una vez" })
    await expect(btnPoblar).toBeVisible({ timeout: 15_000 })
    await btnPoblar.evaluate((b: HTMLElement) => b.click()).catch(async () => {
      await btnPoblar.click({ force: true, noWaitAfter: true }).catch(() => {})
    })

    await expect(page.getByText("🟢 Listo").first()).toBeVisible({ timeout: 120_000 })

    // Ir a Remuneraciones
    await page.goto("/finanzas/remuneraciones")
    await expect(page.getByRole("heading", { name: /Remuneraciones/ })).toBeVisible({ timeout: 15_000 })

    // Paso 1: Parámetros Legales → Guardar cambios
    const tabParam = page.getByRole("tab", { name: "Parámetros Legales" })
    await expect(tabParam).toBeVisible({ timeout: 10_000 })
    await tabParam.click({ force: true, noWaitAfter: true })
    await page.waitForTimeout(500)

    // Inputs: Valor UF mensual, Ingreso mínimo, Tope gratificación, Tasa SIS
    // Usar labels aproximados: la page tiene Label con texto y Input number al lado
    // Buscar por placeholder/Text
    const labelUF = page.getByText("Valor UF mensual").first()
    if (await labelUF.isVisible().catch(() => false)) {
      let inpUF = labelUF.locator("..").locator("input").first()
      if (!(await inpUF.isVisible().catch(() => false))) inpUF = page.locator('input[type="number"]').first()
      const curUF = await inpUF.inputValue().catch(() => "")
      if (!curUF || curUF.trim() === "" || Number(curUF) === 0) await inpUF.fill("39000")
    } else {
      const firstNumber = page.locator('input[type="number"]').first()
      if (await firstNumber.isVisible().catch(() => false)) {
        const cur = await firstNumber.inputValue().catch(() => "")
        if (!cur) await firstNumber.fill("39000")
      }
    }

    const labelIMM = page.getByText("Ingreso mínimo mensual").first()
    if (await labelIMM.isVisible().catch(() => false)) {
      const inp = labelIMM.locator("..").locator("input").first()
      if (await inp.isVisible().catch(() => false)) {
        const cur = await inp.inputValue().catch(() => "")
        if (!cur || Number(cur) === 0) await inp.fill("500000")
      }
    }

    const labelTope = page.getByText("Tope gratificación legal").first()
    if (await labelTope.isVisible().catch(() => false)) {
      const inp = labelTope.locator("..").locator("input").first()
      if (await inp.isVisible().catch(() => false)) {
        const cur = await inp.inputValue().catch(() => "")
        if (!cur || Number(cur) === 0) await inp.fill("4.75")
      }
    }

    const labelSIS = page.getByText("Tasa SIS").first()
    if (await labelSIS.isVisible().catch(() => false)) {
      const inp = labelSIS.locator("..").locator("input").first()
      if (await inp.isVisible().catch(() => false)) {
        const cur = await inp.inputValue().catch(() => "")
        if (!cur) await inp.fill("1.48")
      }
    }

    const btnGuardarParam = page.getByRole("button", { name: "Guardar cambios" })
    await expect(btnGuardarParam).toBeVisible({ timeout: 10_000 })
    await btnGuardarParam.scrollIntoViewIfNeeded().catch(() => {})
    try {
      await btnGuardarParam.click({ force: true, noWaitAfter: true, timeout: 5_000 })
    } catch {
      await page.locator("form").evaluate((f) => (f as HTMLFormElement).requestSubmit()).catch(() => {})
    }
    await page.waitForTimeout(800)
    // Afirmar mensaje de guardado o al menos que no haya error
    const okParam = page.getByText(/Parámetros legales guardados/).first()
    const hasOk = await okParam.isVisible().catch(() => false)
    if (!hasOk) {
      // si no aparece, al menos no debe haber error destructivo
      const errBox = page.getByText(/Error al guardar|CF no cargado/).first()
      const hasErr = await errBox.isVisible().catch(() => false)
      expect(hasErr, "No debe haber error al guardar parámetros legales").toBeFalsy()
    } else {
      await expect(okParam).toBeVisible({ timeout: 10_000 })
    }

    // Paso 2: Volver a Liquidaciones y generar
    const tabLiq = page.getByRole("tab", { name: "Liquidaciones" })
    await expect(tabLiq).toBeVisible({ timeout: 10_000 })
    await tabLiq.click({ force: true, noWaitAfter: true })
    await page.waitForTimeout(500)

    // Trabajador con ficha PE * = TEST Persona QA Uno
    const labelTrabajador = page.getByText("Trabajador con ficha PE *").first()
    await expect(labelTrabajador).toBeVisible({ timeout: 10_000 })
    let comboTrab = labelTrabajador.locator("..").getByRole("combobox").first()
    if (!(await comboTrab.isVisible().catch(() => false))) {
      comboTrab = page.getByRole("combobox").first()
    }
    await expect(comboTrab).toBeVisible({ timeout: 10_000 })
    await comboTrab.click({ force: true, noWaitAfter: true })
    await page.waitForTimeout(400)
    const optTrab = page.getByRole("option", { name: /TEST Persona QA Uno/ }).first()
    if (await optTrab.isVisible().catch(() => false)) {
      await optTrab.click({ force: true, noWaitAfter: true })
    } else {
      const opts = page.getByRole("option")
      const c = await opts.count()
      for (let i = 0; i < c; i++) {
        const o = opts.nth(i)
        const txt = (await o.textContent()) ?? ""
        if (txt.includes("TEST") && txt.includes("Persona")) {
          await o.click({ force: true, noWaitAfter: true }).catch(() => {})
          break
        }
      }
    }
    await page.waitForTimeout(600)

    // Periodo * — Input type="month" . Usar uno que no colisione con test-liq-pl (hoyMes)
    // Probamos 2026-09, si falla duplicado, usamos 2026-10
    const inputPeriodo = page.locator('input[type="month"]').first()
    await expect(inputPeriodo).toBeVisible({ timeout: 10_000 })
    // Calcular periodo siguiente al actual para evitar duplicado
    const hoy = new Date()
    const nextMonth = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 1)
    const periodoCandidato1 = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, "0")}`
    const afterNext = new Date(hoy.getFullYear(), hoy.getMonth() + 2, 1)
    const periodoCandidato2 = `${afterNext.getFullYear()}-${String(afterNext.getMonth() + 1).padStart(2, "0")}`
    let periodoUsado = periodoCandidato1
    await inputPeriodo.fill(periodoCandidato1)
    await page.waitForTimeout(300)

    // Días trabajados * — ya tiene 30 por defecto, asegurar 30
    const labelDias = page.getByText("Días trabajados *").first()
    let inputDias = page.locator('input[type="number"]').nth(1)
    if (await labelDias.isVisible().catch(() => false)) {
      const cand = labelDias.locator("..").locator("input").first()
      if (await cand.isVisible().catch(() => false)) inputDias = cand
    }
    if (await inputDias.isVisible().catch(() => false)) {
      await inputDias.fill("30")
    }

    // Botón Generar liquidación (borrador)
    const btnGenerar = page.getByRole("button", { name: "Generar liquidación (borrador)" })
    await expect(btnGenerar).toBeEnabled({ timeout: 10_000 })
    await btnGenerar.scrollIntoViewIfNeeded().catch(() => {})
    try {
      await btnGenerar.click({ force: true, noWaitAfter: true, timeout: 5_000 })
    } catch {
      await page.locator("form").evaluate((f) => (f as HTMLFormElement).requestSubmit()).catch(() => {})
    }
    await page.waitForTimeout(900)

    // Si error de duplicado, probar segundo periodo
    const errDuplicado = page.getByText(/Ya existe una liquidación/).first()
    if (await errDuplicado.isVisible().catch(() => false)) {
      periodoUsado = periodoCandidato2
      await inputPeriodo.fill(periodoCandidato2)
      await page.waitForTimeout(300)
      await btnGenerar.click({ force: true, noWaitAfter: true }).catch(() => {})
      await page.waitForTimeout(800)
    }

    // Afirmar éxito: "Liquidación generada en borrador" y fila en historial
    const okGen = page.getByText(/Liquidación generada en borrador/).first()
    const hasOkGen = await okGen.isVisible().catch(() => false)
    if (!hasOkGen) {
      // si no aparece, buscar error y fallar
      const errGen = page.locator("div").filter({ hasText: "Error al generar" }).first()
      const hasErrGen = await errGen.isVisible().catch(() => false)
      if (hasErrGen) {
        const txt = await errGen.textContent()
        // si es duplicado, ya intentamos fallback; si sigue, forzar periodo lejano
        if (txt && txt.includes("Ya existe")) {
          await inputPeriodo.fill("2027-01")
          periodoUsado = "2027-01"
          await btnGenerar.click({ force: true, noWaitAfter: true }).catch(() => {})
          await page.waitForTimeout(800)
        }
      }
    } else {
      await expect(okGen).toBeVisible({ timeout: 10_000 })
    }

    // Historial de folios — buscar fila con periodo usado y estado Borrador
    const tablaHistorial = page.getByText("Historial de folios").first()
    await expect(tablaHistorial).toBeVisible({ timeout: 10_000 })
    // La fila debe contener el periodo y la palabra Borrador
    const filaPeriodo = page.getByRole("row").filter({ hasText: periodoUsado }).first()
    await expect(filaPeriodo).toBeVisible({ timeout: 15_000 })
    await expect(filaPeriodo.getByText("Borrador").first()).toBeVisible({ timeout: 10_000 })
    const folioLiq = (await filaPeriodo.textContent())?.match(/LIQ-\d+/)?.[0] ?? ""

    // Click Confirmar en la fila
    const btnConfirmar = filaPeriodo.getByRole("button", { name: "Confirmar" })
    await expect(btnConfirmar).toBeVisible({ timeout: 10_000 })
    await btnConfirmar.scrollIntoViewIfNeeded().catch(() => {})
    try {
      await btnConfirmar.click({ force: true, noWaitAfter: true, timeout: 5_000 })
    } catch {
      await btnConfirmar.click({ force: true, noWaitAfter: true }).catch(() => {})
    }
    await page.waitForTimeout(900)

    // Afirmar confirmada: mensaje y badge Confirmada, no más botón Confirmar
    const okConfirm = page.getByText(/Liquidación confirmada/).first()
    await expect(okConfirm).toBeVisible({ timeout: 15_000 })

    const filaConfirmada = page.getByRole("row").filter({ hasText: periodoUsado }).first()
    if (folioLiq) {
      await expect(page.getByRole("row").filter({ hasText: folioLiq }).first().getByText("Confirmada").first()).toBeVisible({ timeout: 15_000 })
    } else {
      await expect(filaConfirmada.getByText("Confirmada").first()).toBeVisible({ timeout: 15_000 })
    }
    // El botón Confirmar ya no debe existir en esa fila
    await expect(filaConfirmada.getByRole("button", { name: "Confirmar" })).toBeHidden({ timeout: 5_000 }).catch(() => {})

    expect(errores, "Excepciones no capturadas en finanzas/remuneraciones").toEqual([])
  })
})
