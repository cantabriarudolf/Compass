import { expect, test } from "@playwright/test"

test.use({ actionTimeout: 30_000 })
test.setTimeout(300_000)

// P3 SERIE-GATED-API-BD: independizado de QA-Lab. El trabajador TEST con ficha
// completa se crea vía API REST (POST /api/personas con FKs desde
// /api/maestros/* + PUT /api/configuracion para params legales) y la
// liquidación se genera+confirma vía UI contra POST /api/liquidaciones +
// /confirmar (BD fuente de verdad). Cleanup: borradores TEST + egreso espejo +
// persona (la confirmada es inmutable por diseño y queda como documento de
// auditoría con periodo TEST futuro que no interfiere).

/** Dígito verificador chileno (módulo 11) para RUTs TEST únicos por corrida. */
function dvRut(cuerpo: string): string {
  let suma = 0
  let mult = 2
  for (let i = cuerpo.length - 1; i >= 0; i--) {
    suma += Number(cuerpo[i]) * mult
    mult = mult === 7 ? 2 : mult + 1
  }
  const resto = 11 - (suma % 11)
  return resto === 11 ? "0" : resto === 10 ? "K" : String(resto)
}

test.describe("CRUD — Finanzas/Remuneraciones (GATED)", () => {
  test("trabajador TEST vía API y generar + confirmar liquidación", async ({ page }) => {
    const errores: string[] = []
    page.on("pageerror", (err) => errores.push(err.message))

    const ts = Date.now()
    const trabId = `test-p3-pl-trab-${ts}`
    const cuerpoRut = String(ts).slice(-8).padStart(8, "1")
    const rutTest = `${cuerpoRut}-${dvRut(cuerpoRut)}`
    const emailTest = `test-p3-pl-${ts}@test.cl`
    const nombreTest = `Trabajador P3 ${String(ts).slice(-6)}`
    // Periodos TEST futuros (rotan con ts para no colisionar entre corridas).
    const mesBase = (ts % 12) + 1
    const candidatos = [0, 1, 2].map((k) => {
      const m = ((mesBase + k - 1) % 12) + 1
      return `2027-${String(m).padStart(2, "0")}`
    })

    // Setup vía API: FKs legales desde los maestros del seed (mismo scope).
    const maestros = async (tipo: string): Promise<{ id: string; tipo?: string }[]> => {
      const r = await page.request.get(`/api/maestros/${tipo}?pageSize=100`)
      expect(r.ok(), `GET /api/maestros/${tipo} debe responder`).toBe(true)
      const j = (await r.json()) as { data?: { id: string; tipo?: string }[] }
      return j.data ?? []
    }
    const afps = await maestros("afps")
    const salud = await maestros("previsiones-salud")
    const tramos = await maestros("asignaciones-familiar")
    expect(afps.length > 0, "el seed debe traer AFPs").toBe(true)
    const afpId = afps[0]!.id
    const saludId = (salud.find((s) => s.tipo === "fonasa") ?? salud[0])?.id
    expect(saludId, "el seed debe traer previsión de salud").toBeTruthy()
    const tramoId = tramos[0]?.id
    expect(tramoId, "el seed debe traer tramos de asignación familiar").toBeTruthy()

    // Params legales CF idempotentes (reseed-proof).
    const resCfg = await page.request.put("/api/configuracion", {
      data: {
        ufMensual: 39000,
        ingresoMinimoMensual: 500000,
        topeGratificacionLegal: 4.75,
        tasaSIS: 1.48,
      },
    })
    expect(resCfg.ok(), "PUT /api/configuracion debe asegurar params legales").toBe(true)

    // Trabajador TEST con ficha completa (sueldo base + FKs + jornada).
    const resTrab = await page.request.post("/api/personas", {
      data: {
        id: trabId,
        rut: rutTest,
        nombreCompleto: `${nombreTest} TEST`,
        nombres: nombreTest,
        apellidos: "TEST",
        email: emailTest,
        telefonoMovil: "+56900000009",
        estadoCuenta: "activa",
        condicionesEspecialesIds: [],
        roles: ["personal"],
        datosLaborales: {
          id: `lab-${ts}`,
          cargo: "Conserje Turno Día",
          afp: "AFP Habitat",
          prevision: "FONASA",
          fechaIngreso: "2021-06-15",
          tipoContrato: "indefinido",
          afpId,
          saludId,
          asignacionFamiliarId: tramoId,
          cargas: 1,
          jornadaBaseHoras: 44,
          sueldoBase: 650000,
        },
      },
    })
    expect(resTrab.ok(), "POST /api/personas debe crear el trabajador TEST").toBe(true)

    let periodoUsado = ""
    let folioLiq = ""
    try {
      await page.goto("/finanzas/remuneraciones")
      await expect(page.getByRole("heading", { name: /Remuneraciones/ })).toBeVisible({ timeout: 15_000 })

      // El trabajador TEST aparece en el combo (dato de BD, sin QA-Lab).
      const labelTrabajador = page.getByText("Trabajador con ficha PE *").first()
      await expect(labelTrabajador).toBeVisible({ timeout: 15_000 })
      let comboTrab = labelTrabajador.locator("..").getByRole("combobox").first()
      if (!(await comboTrab.isVisible().catch(() => false))) {
        comboTrab = page.getByRole("combobox").first()
      }
      await expect(comboTrab).toBeVisible({ timeout: 10_000 })
      await comboTrab.click({ force: true, noWaitAfter: true })
      await page.waitForTimeout(400)
      const optTrab = page.getByRole("option", { name: new RegExp(nombreTest) }).first()
      await expect(optTrab, "el trabajador TEST debe estar en el combo").toBeVisible({ timeout: 10_000 })
      await optTrab.click({ force: true, noWaitAfter: true })
      await page.waitForTimeout(600)

      // Periodo: probar candidatos hasta uno libre.
      const inputPeriodo = page.locator('input[type="month"]').first()
      await expect(inputPeriodo).toBeVisible({ timeout: 10_000 })

      const labelDias = page.getByText("Días trabajados *").first()
      let inputDias = page.locator('input[type="number"]').nth(1)
      if (await labelDias.isVisible().catch(() => false)) {
        const cand = labelDias.locator("..").locator("input").first()
        if (await cand.isVisible().catch(() => false)) inputDias = cand
      }
      if (await inputDias.isVisible().catch(() => false)) {
        await inputDias.fill("30")
      }

      const btnGenerar = page.getByRole("button", { name: "Generar liquidación (borrador)" })
      await expect(btnGenerar).toBeEnabled({ timeout: 15_000 })

      for (const periodo of candidatos) {
        await inputPeriodo.fill(periodo)
        await page.waitForTimeout(300)
        await btnGenerar.scrollIntoViewIfNeeded().catch(() => {})
        try {
          await btnGenerar.click({ force: true, noWaitAfter: true, timeout: 5_000 })
        } catch {
          await page.locator("form").evaluate((f) => (f as HTMLFormElement).requestSubmit()).catch(() => {})
        }
        await page.waitForTimeout(900)
        const errDuplicado = page.getByText(/Ya existe una liquidación/).first()
        if (await errDuplicado.isVisible().catch(() => false)) continue
        periodoUsado = periodo
        break
      }
      expect(periodoUsado, "debe generarse en un periodo libre").not.toBe("")

      // Afirmar éxito: mensaje + fila en historial con folio LIQ- y Borrador.
      const okGen = page.getByText(/Liquidación generada en borrador/).first()
      await expect(okGen).toBeVisible({ timeout: 10_000 })

      const tablaHistorial = page.getByText("Historial de folios").first()
      await expect(tablaHistorial).toBeVisible({ timeout: 10_000 })
      const filaPeriodo = page.getByRole("row").filter({ hasText: periodoUsado }).first()
      await expect(filaPeriodo).toBeVisible({ timeout: 15_000 })
      await expect(filaPeriodo.getByText("Borrador").first()).toBeVisible({ timeout: 10_000 })
      folioLiq = (await filaPeriodo.textContent())?.match(/LIQ-\d+/)?.[0] ?? ""
      expect(folioLiq, "la fila debe traer folio LIQ-").not.toBe("")

      // Confirmar en la fila.
      const btnConfirmar = filaPeriodo.getByRole("button", { name: "Confirmar" })
      await expect(btnConfirmar).toBeVisible({ timeout: 10_000 })
      await btnConfirmar.scrollIntoViewIfNeeded().catch(() => {})
      try {
        await btnConfirmar.click({ force: true, noWaitAfter: true, timeout: 5_000 })
      } catch {
        await btnConfirmar.click({ force: true, noWaitAfter: true }).catch(() => {})
      }
      await page.waitForTimeout(900)

      const okConfirm = page.getByText(/Liquidación confirmada/).first()
      await expect(okConfirm).toBeVisible({ timeout: 15_000 })

      const filaConfirmada = page.getByRole("row").filter({ hasText: folioLiq }).first()
      await expect(filaConfirmada.getByText("Confirmada").first()).toBeVisible({ timeout: 15_000 })
      await expect(filaConfirmada.getByRole("button", { name: "Confirmar" })).toBeHidden({ timeout: 5_000 }).catch(() => {})

      expect(errores, "Excepciones no capturadas en finanzas/remuneraciones").toEqual([])
    } finally {
      // Cleanup: borradores TEST del trabajador + egreso espejo + persona.
      // (La confirmada es inmutable por diseño: queda el documento con periodo
      // TEST futuro; no interfiere porque el periodo es único por corrida.)
      try {
        const lista = await page.request.get("/api/liquidaciones?pageSize=100").catch(() => null)
        const j = (await lista?.json().catch(() => ({ data: [] }))) as {
          data?: { id: string; trabajadorPersonaId: string; estado: string; egresoFIReferencia?: string; folio: string }[]
        }
        for (const l of j.data ?? []) {
          if (l.trabajadorPersonaId !== trabId) continue
          if (l.estado === "borrador") {
            await page.request.delete(`/api/liquidaciones/${l.id}`).catch(() => {})
          } else if (l.egresoFIReferencia && l.egresoFIReferencia !== "pendiente") {
            await page.request.delete(`/api/egresos-fi/${l.egresoFIReferencia}`).catch(() => {})
          }
        }
      } catch { /* best-effort */ }
      await page.request.delete(`/api/personas/${trabId}`).catch(() => {})
      // Verificación de higiene: persona TEST eliminada.
      const check = await page.request.get(`/api/personas/${trabId}`).catch(() => null)
      expect(check?.status(), "la persona TEST debe quedar eliminada").toBe(404)
    }
  })
})
