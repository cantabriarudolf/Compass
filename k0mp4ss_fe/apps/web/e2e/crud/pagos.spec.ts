import { expect, test } from "@playwright/test"

test.use({ actionTimeout: 30_000 })
test.setTimeout(300_000)

// P1 SERIE-GATED-API-BD: independizado de QA-Lab. El dato TEST propio se crea
// vía API REST (POST /api/unidades + POST /api/cobros-fi, upsert por id) y se
// limpia al final (PUT reset de pagos + DELETE, la unidad TEST no deja residuos).
// La página /finanzas/pagos lee BD vía useCobrosFI: sin "Poblar todo" previo.

test.describe("CRUD — Finanzas/Pagos (GATED)", () => {
  test("cobro pendiente TEST vía API y registrar pago", async ({ page }) => {
    const errores: string[] = []
    page.on("pageerror", (err) => errores.push(err.message))

    const ts = Date.now()
    const unidadId = `test-p1-pagos-u-${ts}`
    const cobroId = `test-p1-pagos-c-${ts}`
    const numeroUnidad = `T1P-${String(ts).slice(-6)}`
    const descripcion = `TEST P1 pagos ${ts}`
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

    // Fondo: uno del seed vía GET (gasto_comun preferido).
    const resFondos = await page.request.get("/api/fondos-fi?pageSize=100")
    expect(resFondos.ok(), "GET /api/fondos-fi debe responder").toBe(true)
    const jf = (await resFondos.json()) as {
      data?: { id: string; tipo: string }[]
    }
    const fondos = jf.data ?? []
    expect(fondos.length > 0, "el seed debe traer al menos un fondo FI").toBe(true)
    const fondoId = fondos.find((f) => f.tipo === "gasto_comun")?.id ?? fondos[0]!.id

    const resCobro = await page.request.post("/api/cobros-fi", {
      data: {
        id: cobroId,
        unidadId,
        periodo: "2026-11",
        concepto: "gasto_comun",
        origenModulo: "FI",
        fondoId,
        descripcion,
        montoBase: 120000,
        fechaCargo: hoy,
        fechaVencimiento: "2026-12-10",
        moras: [],
        pagos: [],
        diferencias: [],
      },
    })
    expect(resCobro.ok(), "POST /api/cobros-fi debe crear el cobro TEST").toBe(true)

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
      // Cleanup: DELETE del cobro bloquea con pagos (409) → reset vía PUT y luego DELETE.
      await page.request.put(`/api/cobros-fi/${cobroId}`, {
        data: { pagos: [], moras: [], diferencias: [] },
      }).catch(() => {})
      await page.request.delete(`/api/cobros-fi/${cobroId}`).catch(() => {})
      await page.request.delete(`/api/unidades/${unidadId}`).catch(() => {})
    }
  })
})
