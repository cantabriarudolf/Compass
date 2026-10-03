import { expect, test } from "@playwright/test"
import {
  crearTrabajadorTEST,
  limpiarTrabajadorTEST,
} from "../helpers/datos-test"

test.use({ actionTimeout: 30_000 })
test.setTimeout(300_000)

// P1 SERIE-E2E-SIN-GATED: setup vía helper compartido `e2e/helpers/datos-test`.
// El trabajador TEST con ficha completa se crea vía API REST y la liquidación
// se genera+confirma vía UI contra POST /api/liquidaciones + /confirmar (BD
// fuente de verdad). Cleanup: borradores TEST + egreso espejo + persona (la
// confirmada es inmutable por diseño y queda como documento de auditoría con
// periodo TEST futuro que no interfiere).

test.describe("CRUD — Finanzas/Remuneraciones (GATED)", () => {
  test("trabajador TEST vía API y generar + confirmar liquidación", async ({ page }) => {
    const errores: string[] = []
    page.on("pageerror", (err) => errores.push(err.message))

    const ts = Date.now()
    // Setup vía helper: maestros + params legales + trabajador con ficha.
    const trab = await crearTrabajadorTEST(page.request, "p3-pl", ts)
    const trabId = trab.id
    const nombreTest = trab.nombre
    // Periodos TEST futuros (rotan con ts para no colisionar entre corridas).
    const mesBase = (ts % 12) + 1
    const candidatos = [0, 1, 2].map((k) => {
      const m = ((mesBase + k - 1) % 12) + 1
      return `2027-${String(m).padStart(2, "0")}`
    })

    // (Setup ya hecho vía helper: trabajador con ficha completa.)

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
      // Cleanup vía helper: borradores TEST + egreso espejo + persona.
      // (La confirmada es inmutable por diseño: queda el documento con periodo
      // TEST futuro; no interfiere porque el periodo es único por corrida.)
      await limpiarTrabajadorTEST(page.request, trabId)
      // Verificación de higiene: persona TEST eliminada.
      const check = await page.request.get(`/api/personas/${trabId}`).catch(() => null)
      expect(check?.status(), "la persona TEST debe quedar eliminada").toBe(404)
    }
  })
})
