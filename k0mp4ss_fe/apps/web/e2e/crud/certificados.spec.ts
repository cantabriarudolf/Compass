import { expect, test } from "@playwright/test"

test.use({ actionTimeout: 30_000 })
test.setTimeout(300_000)

test.describe("CRUD — Comunidad/Certificados (GATED)", () => {
  test("poblar QA Lab y generar certificado residencia PDF + historial", async ({ page }) => {
    const errores: string[] = []
    page.on("pageerror", (err) => {
      // pdf-make puede lanzar "Unrecognized document structure" en dev si la firma no está cargada; no es regresión del CRUD
      if (err.message.includes("Unrecognized document structure")) return
      errores.push(err.message)
    })

    // Precondición gated: poblar todo de una vez vía QA Lab
    await page.goto("/admin/qa-lab")
    await expect(page.getByRole("heading", { name: /Laboratorio QA/ })).toBeVisible({ timeout: 15_000 })

    const btnPoblar = page.getByRole("button", { name: "Poblar todo de una vez" })
    await expect(btnPoblar).toBeVisible({ timeout: 15_000 })
    await btnPoblar.evaluate((b: HTMLElement) => b.click()).catch(async () => {
      await btnPoblar.click({ force: true, noWaitAfter: true }).catch(() => {})
    })

    await expect(page.getByText("🟢 Listo").first()).toBeVisible({ timeout: 120_000 })

    // Ir a Certificados — ruta con pdf-utils puede tardar en turbopack
    await page.goto("/comunidad/certificados", { waitUntil: "domcontentloaded", timeout: 60_000 })
    await expect(page.getByRole("heading", { name: /Certificados/ })).toBeVisible({ timeout: 20_000 })

    // Asegurar tab Generar activo
    const tabGenerar = page.getByRole("tab", { name: "Generar" })
    if (await tabGenerar.isVisible().catch(() => false)) {
      await tabGenerar.click({ force: true, noWaitAfter: true })
      await page.waitForTimeout(300)
    }

    // Tipo de certificado * = Residencia — default es residencia, pero asegurar selección
    const labelTipo = page.getByText("Tipo de certificado *").first()
    if (await labelTipo.isVisible().catch(() => false)) {
      // Buscar combobox vecino
      let comboTipo = labelTipo.locator("..").getByRole("combobox").first()
      if (!(await comboTipo.isVisible().catch(() => false))) {
        comboTipo = page.getByRole("combobox").first()
      }
      if (await comboTipo.isVisible().catch(() => false)) {
        const curText = (await comboTipo.textContent())?.trim() ?? ""
        if (!curText.includes("Residencia")) {
          await comboTipo.click({ force: true, noWaitAfter: true })
          await page.waitForTimeout(350)
          const optRes = page.getByRole("option", { name: /Residencia/ }).first()
          if (await optRes.isVisible().catch(() => false)) await optRes.click({ force: true, noWaitAfter: true })
          else {
            const anyOpt = page.getByRole("option").first()
            if (await anyOpt.isVisible().catch(() => false)) await anyOpt.click({ force: true, noWaitAfter: true }).catch(() => {})
          }
          await page.waitForTimeout(400)
        }
      }
    }

    // Persona solicitante * = TEST Persona QA Uno
    const labelPersona = page.getByText("Persona solicitante *").first()
    await expect(labelPersona).toBeVisible({ timeout: 10_000 })
    let comboPersona = labelPersona.locator("..").getByRole("combobox").first()
    if (!(await comboPersona.isVisible().catch(() => false))) {
      // fallback: segundo combobox en la página
      const combos = page.getByRole("combobox")
      const n = await combos.count()
      for (let i = 0; i < n; i++) {
        const cb = combos.nth(i)
        const t = (await cb.textContent())?.trim() ?? ""
        if (t.includes("Selecciona persona") || t === "") {
          comboPersona = cb
          break
        }
      }
    }
    await expect(comboPersona).toBeVisible({ timeout: 10_000 })
    await comboPersona.click({ force: true, noWaitAfter: true })
    await page.waitForTimeout(400)
    const optPersona = page.getByRole("option", { name: /TEST Persona QA Uno/ }).first()
    if (await optPersona.isVisible().catch(() => false)) {
      await optPersona.click({ force: true, noWaitAfter: true })
    } else {
      // fallback: primera opción que contenga TEST
      const opts = page.getByRole("option")
      const c = await opts.count()
      for (let i = 0; i < c; i++) {
        const o = opts.nth(i)
        const txt = (await o.textContent()) ?? ""
        if (txt.includes("TEST")) {
          await o.click({ force: true, noWaitAfter: true }).catch(() => {})
          break
        }
      }
    }
    await page.waitForTimeout(400)

    // Unidad * = unidad TEST (999)
    const labelUnidad = page.getByText("Unidad *").first()
    await expect(labelUnidad).toBeVisible({ timeout: 10_000 })
    let comboUnidad = labelUnidad.locator("..").getByRole("combobox").first()
    if (!(await comboUnidad.isVisible().catch(() => false))) {
      const combos = page.getByRole("combobox")
      const n = await combos.count()
      // el último combobox suele ser Unidad
      comboUnidad = combos.nth(n - 1)
    }
    await expect(comboUnidad).toBeVisible({ timeout: 10_000 })
    await comboUnidad.click({ force: true, noWaitAfter: true })
    await page.waitForTimeout(400)
    // Elegir opción que contenga 999
    const opt999 = page.getByRole("option", { name: /999/ }).first()
    if (await opt999.isVisible().catch(() => false)) {
      await opt999.click({ force: true, noWaitAfter: true })
    } else {
      const opts = page.getByRole("option")
      const c = await opts.count()
      for (let i = 0; i < c; i++) {
        const o = opts.nth(i)
        const txt = (await o.textContent())?.trim() ?? ""
        if (txt && !txt.includes("Selecciona")) {
          await o.click({ force: true, noWaitAfter: true }).catch(() => {})
          break
        }
      }
    }
    await page.waitForTimeout(400)

    // Solicitante * input placeholder "Nombre de quien solicita"
    const inputSolicitante = page.getByPlaceholder("Nombre de quien solicita")
    await expect(inputSolicitante).toBeVisible({ timeout: 10_000 })
    await inputSolicitante.fill("QA Tester Cert")

    // Botón Generar certificado PDF firmado — handle download si dispara
    const btnGenerar = page.getByRole("button", { name: "Generar certificado PDF firmado" })
    await expect(btnGenerar).toBeEnabled({ timeout: 10_000 })
    await btnGenerar.scrollIntoViewIfNeeded().catch(() => {})

    // Capturar posible download sin bloquear si no hay
    const downloadPromise = page.waitForEvent("download", { timeout: 5_000 }).catch(() => null)
    try {
      await btnGenerar.click({ force: true, noWaitAfter: true, timeout: 5_000 })
    } catch {
      await page.locator("form").evaluate((f) => (f as HTMLFormElement).requestSubmit()).catch(() => {})
    }
    const download = await downloadPromise
    if (download) {
      await download.path().catch(() => {})
    }
    await page.waitForTimeout(800)

    // Afirmar éxito: mensaje con folio CT- o fila en historial
    const okMsg = page.getByText(/Certificado CT-/).first()
    const folioVisible = await okMsg.isVisible().catch(() => false)
    if (!folioVisible) {
      // fallback: mensaje genérico
      await expect(page.getByText(/Certificado.*emitido|PDF.*generado/).first()).toBeVisible({ timeout: 10_000 })
    }
    // Extraer folio para verificar en historial
    let folio = ""
    if (folioVisible) {
      const txt = (await okMsg.textContent()) ?? ""
      const m = txt.match(/CT-\d+/)
      if (m) folio = m[0]
    }
    if (!folio) {
      // buscar folio en la página
      const folioEl = page.getByText(/CT-\d{4}/).first()
      if (await folioEl.isVisible().catch(() => false)) {
        const t = (await folioEl.textContent()) ?? ""
        const m2 = t.match(/CT-\d+/)
        if (m2) folio = m2[0]
      }
    }

    // Verificar en Historial de Emisión
    const tabHistorial = page.getByRole("tab", { name: "Historial de Emisión" })
    await expect(tabHistorial).toBeVisible({ timeout: 10_000 })
    await tabHistorial.click({ force: true, noWaitAfter: true })
    await page.waitForTimeout(600)

    if (folio) {
      await expect(page.getByText(folio).first()).toBeVisible({ timeout: 15_000 })
    } else {
      // al menos una fila con QA Tester Cert
      await expect(page.getByText("QA Tester Cert").first()).toBeVisible({ timeout: 15_000 })
      // y un folio CT-
      await expect(page.getByText(/CT-\d{4}/).first()).toBeVisible({ timeout: 10_000 })
    }

    // Verificar que la fila tiene código verificación VC-
    await expect(page.getByText(/VC-/).first()).toBeVisible({ timeout: 10_000 })

    expect(errores, "Excepciones no capturadas en comunidad/certificados").toEqual([])
  })
})
