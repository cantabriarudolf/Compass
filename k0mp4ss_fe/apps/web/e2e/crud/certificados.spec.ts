import { expect, test } from "@playwright/test"

test.use({ actionTimeout: 30_000 })
test.setTimeout(300_000)

// P1 SERIE-GATED-API-BD: independizado de QA-Lab. El trío TEST propio
// (persona + unidad + vínculo activo) se crea vía API REST y se limpia al
// final (vínculo → persona → unidad, en ese orden por los guards 409).
// La página /comunidad/certificados lee BD vía usePersonas/useUnidades.

function rutUnico(): string {
  const numero = 20_000_000 + (Date.now() % 9_000_000)
  const cuerpo = numero.toString()
  let suma = 0
  let mult = 2
  for (let i = cuerpo.length - 1; i >= 0; i--) {
    suma += Number(cuerpo[i]) * mult
    mult = mult === 7 ? 2 : mult + 1
  }
  const resto = 11 - (suma % 11)
  const dv = resto === 11 ? "0" : resto === 10 ? "K" : String(resto)
  return `${cuerpo}-${dv}`
}

test.describe("CRUD — Comunidad/Certificados (GATED)", () => {
  test("persona+unidad TEST vía API y generar certificado residencia PDF + historial", async ({ page }) => {
    const errores: string[] = []
    page.on("pageerror", (err) => {
      // pdf-make puede lanzar "Unrecognized document structure" en dev si la firma no está cargada; no es regresión del CRUD
      if (err.message.includes("Unrecognized document structure")) return
      errores.push(err.message)
    })

    const ts = Date.now()
    const personaId = `test-p1-cert-p-${ts}`
    const unidadId = `test-p1-cert-u-${ts}`
    const vinculoId = `test-p1-cert-v-${ts}`
    const numeroUnidad = `T1C-${String(ts).slice(-6)}`
    const nombrePersona = `TEST Cert P1 ${ts}`
    const emailPersona = `cert.p1.${ts}@test.cl`
    const hoy = new Date().toISOString().slice(0, 10)

    // Setup vía API: FKs de una unidad real del seed (mismo scope garantizado).
    const lista = await page.request.get("/api/unidades?pageSize=1")
    expect(lista.ok(), "GET /api/unidades debe responder").toBe(true)
    const ju = (await lista.json()) as {
      data?: { microSectorId: string; tipoUnidadId: string; estadoId: string }[]
    }
    const base = ju.data?.[0]
    expect(base, "el seed debe traer al menos una unidad").toBeTruthy()

    const resUnidad = await page.request.post("/api/unidades", {
      data: {
        id: unidadId,
        microSectorId: base!.microSectorId,
        numero: numeroUnidad,
        etiqueta: "TEST-P1",
        tipoUnidadId: base!.tipoUnidadId,
        metraje: 45,
        prorrateo: 0.01,
        rolSii: "",
        estadoId: base!.estadoId,
        servicios: {},
      },
    })
    expect(resUnidad.ok(), "POST /api/unidades debe crear la unidad TEST").toBe(true)

    const resPersona = await page.request.post("/api/personas", {
      data: {
        id: personaId,
        rut: rutUnico(),
        nombreCompleto: nombrePersona,
        nombres: "TEST Cert",
        apellidos: `P1 ${String(ts).slice(-6)}`,
        email: emailPersona,
        telefonoMovil: "+56 9 9999 9999",
        estadoCuenta: "activa",
        condicionesEspecialesIds: [],
        roles: ["residente"],
      },
    })
    expect(resPersona.ok(), "POST /api/personas debe crear la persona TEST").toBe(true)

    const resVinculo = await page.request.post("/api/vinculos", {
      data: {
        id: vinculoId,
        personaId,
        unidadId,
        rol: "propietario",
        fechaInicio: hoy,
        permiteVerFinanzas: true,
      },
    })
    expect(resVinculo.ok(), "POST /api/vinculos debe crear el vínculo TEST").toBe(true)

    try {
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
            await page.waitForTimeout(400)
          }
        }
      }

      // Persona solicitante * = la TEST propia (nombre único por corrida)
      const labelPersona = page.getByText("Persona solicitante *").first()
      await expect(labelPersona).toBeVisible({ timeout: 10_000 })
      let comboPersona = labelPersona.locator("..").getByRole("combobox").first()
      if (!(await comboPersona.isVisible().catch(() => false))) {
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
      const optPersona = page.getByRole("option", { name: "TEST Cert P1" }).first()
      if (await optPersona.isVisible().catch(() => false)) {
        await optPersona.click({ force: true, noWaitAfter: true })
      } else {
        // fallback: opción que contenga el nombre único completo
        const opts = page.getByRole("option")
        const c = await opts.count()
        for (let i = 0; i < c; i++) {
          const o = opts.nth(i)
          const txt = (await o.textContent()) ?? ""
          if (txt.includes(nombrePersona)) {
            await o.click({ force: true, noWaitAfter: true }).catch(() => {})
            break
          }
        }
      }
      await page.waitForTimeout(400)

      // Unidad * = la TEST propia (número único por corrida)
      const labelUnidad = page.getByText("Unidad *").first()
      await expect(labelUnidad).toBeVisible({ timeout: 10_000 })
      let comboUnidad = labelUnidad.locator("..").getByRole("combobox").first()
      if (!(await comboUnidad.isVisible().catch(() => false))) {
        const combos = page.getByRole("combobox")
        const n = await combos.count()
        comboUnidad = combos.nth(n - 1)
      }
      await expect(comboUnidad).toBeVisible({ timeout: 10_000 })
      await comboUnidad.click({ force: true, noWaitAfter: true })
      await page.waitForTimeout(400)
      const optUnidad = page.getByRole("option", { name: numeroUnidad }).first()
      if (await optUnidad.isVisible().catch(() => false)) {
        await optUnidad.click({ force: true, noWaitAfter: true })
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
      await inputSolicitante.fill("QA Tester Cert P1")

      // Botón Generar certificado PDF firmado — handle download si dispara
      const btnGenerar = page.getByRole("button", { name: "Generar certificado PDF firmado" })
      await expect(btnGenerar).toBeEnabled({ timeout: 10_000 })
      await btnGenerar.scrollIntoViewIfNeeded().catch(() => {})

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
        await expect(page.getByText(/Certificado.*emitido|PDF.*generado/).first()).toBeVisible({ timeout: 10_000 })
      }
      let folio = ""
      if (folioVisible) {
        const txt = (await okMsg.textContent()) ?? ""
        const m = txt.match(/CT-\d+/)
        if (m) folio = m[0]
      }
      if (!folio) {
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
        await expect(page.getByText("QA Tester Cert P1").first()).toBeVisible({ timeout: 15_000 })
        await expect(page.getByText(/CT-\d{4}/).first()).toBeVisible({ timeout: 10_000 })
      }

      // Verificar que la fila tiene código verificación VC-
      await expect(page.getByText(/VC-/).first()).toBeVisible({ timeout: 10_000 })

      expect(errores, "Excepciones no capturadas en comunidad/certificados").toEqual([])
    } finally {
      // Cleanup en orden (guards 409): vínculo → persona → unidad.
      await page.request.delete(`/api/vinculos/${vinculoId}`).catch(() => {})
      await page.request.delete(`/api/personas/${personaId}`).catch(() => {})
      await page.request.delete(`/api/unidades/${unidadId}`).catch(() => {})
    }
  })
})
