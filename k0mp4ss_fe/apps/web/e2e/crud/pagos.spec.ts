import { expect, test } from "@playwright/test"
import {
  crearCobroTEST,
  crearUnidadTEST,
  limpiarCobroTEST,
  limpiarUnidadTEST,
} from "../helpers/datos-test"

test.use({ actionTimeout: 30_000 })
test.setTimeout(300_000)

// P1 SERIE-E2E-SIN-GATED: setup vía helper compartido `e2e/helpers/datos-test`.
// El dato TEST propio se crea vía API REST y se limpia al final (PUT reset de
// pagos + DELETE, la unidad TEST no deja residuos).
// La página /finanzas/pagos lee BD vía useCobrosFI: sin "Poblar todo" previo.

test.describe("CRUD — Finanzas/Pagos", () => {
  test("cobro pendiente TEST vía API y registrar pago", async ({ page }) => {
    const errores: string[] = []
    page.on("pageerror", (err) => errores.push(err.message))

    const ts = Date.now()
    const unidad = await crearUnidadTEST(page.request, "p1-pagos", ts)
    const unidadId = unidad.id
    const cobro = await crearCobroTEST(page.request, unidadId, "p1-pagos", ts)
    const cobroId = cobro.id
    const descripcion = cobro.descripcion

    try {
      // Ir a Recaudación
      await page.goto("/finanzas/pagos")
      await expect(page.getByRole("heading", { name: /Recaudación/ })).toBeVisible({ timeout: 15_000 })

      // Asegurar tab Libro de cobros activo (default cobros)
      const tabCobros = page.getByRole("tab", { name: "Libro de cobros" })
      if (await tabCobros.isVisible().catch(() => false)) {
        await tabCobros.click({ force: true, noWaitAfter: true })
        await page.waitForTimeout(300)
      }

      // Fila propia: la descripción TEST es única por corrida.
      const fila = page.getByRole("row").filter({ hasText: descripcion }).first()
      await expect(fila).toBeVisible({ timeout: 30_000 })

      const btnRegistrarPago = fila.getByRole("button", { name: "Registrar pago" })
      await expect(btnRegistrarPago).toBeVisible({ timeout: 10_000 })
      await btnRegistrarPago.click({ force: true, noWaitAfter: true })

      const dialog = page.getByRole("dialog")
      await expect(dialog.getByRole("heading", { name: /Registrar pago/ })).toBeVisible({ timeout: 10_000 })

      // Monto: el dialog pre-rellena el exigible; solo completar si quedó vacío.
      const inputMonto = dialog.locator("#pago-monto")
      if (await inputMonto.isVisible().catch(() => false)) {
        const cur = await inputMonto.inputValue().catch(() => "")
        if (!cur || cur.trim() === "" || cur.trim() === "0") {
          await inputMonto.fill("120000")
        }
      }

      // Medio — input id pago-medio, debe ser transferencia.
      const inputMedio = dialog.locator("#pago-medio")
      if (await inputMedio.isVisible().catch(() => false)) {
        const curMedio = await inputMedio.inputValue().catch(() => "")
        if (curMedio !== "transferencia") {
          await inputMedio.fill("transferencia")
        }
      }

      const btnProcesar = dialog.getByRole("button", { name: "Procesar pago" })
      await expect(btnProcesar).toBeVisible({ timeout: 10_000 })
      await btnProcesar.scrollIntoViewIfNeeded().catch(() => {})
      await btnProcesar.click({ timeout: 15_000 })
      // Señal de éxito: el banner (el PUT es ruta fría en dev y puede tardar).
      await expect(page.getByText(/Pago registrado por/).first()).toBeVisible({ timeout: 60_000 })
      await expect(dialog).toBeHidden({ timeout: 15_000 })

      // Recargar para estado persistido y afirmar la fila propia como pagada.
      await page.reload()
      await expect(page.getByRole("heading", { name: /Recaudación/ })).toBeVisible({ timeout: 15_000 })
      const tabDespues = page.getByRole("tab", { name: "Libro de cobros" })
      if (await tabDespues.isVisible().catch(() => false)) {
        await tabDespues.click({ force: true, noWaitAfter: true })
        await page.waitForTimeout(300)
      }
      await expect(
        page.getByRole("row").filter({ hasText: descripcion }).filter({ hasText: "pagado" }).first(),
      ).toBeVisible({ timeout: 30_000 })

      expect(errores, "Excepciones no capturadas en finanzas/pagos").toEqual([])
    } finally {
      // Cleanup idempotente vía helper (reset vía PUT si tiene pagos + DELETEs).
      await limpiarCobroTEST(page.request, cobroId)
      await limpiarUnidadTEST(page.request, unidadId)
    }
  })
})
