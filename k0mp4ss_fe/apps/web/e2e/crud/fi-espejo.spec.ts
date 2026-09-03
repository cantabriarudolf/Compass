import { expect, test } from "@playwright/test"

test.use({ actionTimeout: 30_000 })

/**
 * fi-sync-bd — Espejo BD de Finanzas (read-oriented, cuenta admin).
 * El cliente fi-sync (debounce 2s) envía el espejo de fondosFI/egresosFI/ingresosFI
 * a POST /api/fi/sync tras la hidratación del store. Este spec verifica que:
 * 1. El sync ocurre (poll hasta que BD refleja ≥182 egresos y ≥44 ingresos del punto cero).
 * 2. El panel "Espejo BD (ST)" en /finanzas muestra totales BD cuadrados con el store.
 * 3. La página no lanza pageerror.
 */
test.describe("FI Espejo BD — sync store→Prisma y panel read-only", () => {
  test("sync dispara al hidratar y el panel /finanzas cuadra BD vs store", async ({ page }) => {
    const errores: string[] = []
    page.on("pageerror", (err) => errores.push(err.message))

    await page.goto("/finanzas")
    await expect(page.getByRole("heading", { name: "Finanzas" })).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText("Espejo BD (ST)")).toBeVisible({ timeout: 15_000 })

    // Poll: refrescar el panel hasta que el sync (debounce 2s post-hidratación) haya
    // espejado el punto cero COMPLETO en BD. Nota: el espejo es append-only — en BD
    // compartida puede haber egresos TEST de otros specs (BD ≥ store), por eso se
    // afirma la fila con BD ≥ 182 y store = 182, y el badge sin valor específico.
    // TODO el bloque vive dentro del poll: un GET a mitad del sync deja egresos
    // completos pero ingresos parciales (upsert secuencial por colección).
    const refrescar = page.getByRole("button", { name: "Refrescar" })
    await expect(async () => {
      await refrescar.click()
      const fila = page.getByTestId("fi-espejo-fila-fondo-cc-punto-cero")
      await expect(fila).toBeVisible({ timeout: 5_000 })
      const texto = await fila.innerText()
      const m = texto.match(/(\d+)\/(\d+)/)
      expect(m, `fila CC con conteos BD/Store: ${texto}`).not.toBeNull()
      expect(Number(m![1])).toBeGreaterThanOrEqual(182)
      expect(Number(m![2])).toBe(182)
      // Monto de egresos del libro (≥ $62.491.011 del punto cero, dos dígitos de millón)
      await expect(fila.getByText(/\$\d{2}\.\d{3}\.\d{3}/).first()).toBeVisible()
      // El monto de ingresos BD debe ser el completo del punto cero (o mayor con TEST)
      expect(texto.includes("$45.408.317") || /(\$4[5-9]\.\d{3}\.\d{3}|\$\d{3}\.\d{3}\.\d{3})/.test(texto), `montos ingresos completos: ${texto}`).toBeTruthy()
      // Badge de estado presente (Cuadrado en BD limpia; Pendiente/Divergente si BD compartida)
      await expect(fila.getByText(/Cuadrado|Pendiente\/Divergente/)).toBeVisible()
    }).toPass({ timeout: 60_000 })

    const filaCC = page.getByTestId("fi-espejo-fila-fondo-cc-punto-cero")
    await expect(filaCC).toContainText("Cuenta Corriente")

    // Validación reforzada vía BD (API autenticada desde el contexto del navegador)
    await expect(async () => {
      const api = await page.evaluate(async () => {
        const res = await fetch("/api/fi?pageSize=1")
        if (!res.ok) return null
        return (await res.json()) as {
          egresos: { total: number }
          ingresos: { total: number }
          totalesPorFondo: { fondoId: string; saldo: number }[]
        }
      })
      expect(api, "GET /api/fi debe responder desde el contexto admin").not.toBeNull()
      expect(api!.egresos.total).toBeGreaterThanOrEqual(182)
      expect(api!.ingresos.total).toBeGreaterThanOrEqual(44)
      const ccBD = api!.totalesPorFondo.find((t) => t.fondoId === "fondo-cc-punto-cero")
      expect(ccBD, "fondo CC espejado en BD").toBeTruthy()
      // Con BD limpia (CI), el punto cero cuadra exactamente: saldo CC = 0
      if (api!.egresos.total === 182 && api!.ingresos.total === 44) {
        expect(Math.round(ccBD!.saldo)).toBe(0)
      }
    }).toPass({ timeout: 30_000 })

    expect(errores, "Excepciones no capturadas en /finanzas (espejo BD)").toEqual([])
  })

  test("panel sin mutaciones: 0 botones que alteren datos", async ({ page }) => {
    const errores: string[] = []
    page.on("pageerror", (err) => errores.push(err.message))

    await page.goto("/finanzas")
    await expect(page.getByText("Espejo BD (ST)")).toBeVisible({ timeout: 15_000 })

    // Solo "Refrescar" está permitido; ningún botón con verbos de mutación
    const botones = await page.getByRole("button").allInnerTexts()
    const verbosProhibidos = /guardar|eliminar|borrar|crear|registrar|editar|actualizar fondo|poblar/i
    const mutaciones = botones.filter((b) => verbosProhibidos.test(b) && !/refrescar/i.test(b))
    expect(mutaciones, `panel espejo debe ser read-only: ${JSON.stringify(botones)}`).toEqual([])

    expect(errores, "Excepciones no capturadas en /finanzas (read-only)").toEqual([])
  })
})
