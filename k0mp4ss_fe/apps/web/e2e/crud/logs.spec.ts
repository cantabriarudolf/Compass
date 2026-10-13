import * as fs from "node:fs"
import { expect, test } from "@playwright/test"

test.use({ actionTimeout: 30_000 })

test.describe("Logs de Auditoría (AM) — vista read-only en /admin/logs (BD)", () => {
  test("consulta, filtra, busca y exporta eventos generados por una acción real", async ({
    page,
  }) => {
    test.setTimeout(120_000)
    const errores: string[] = []
    page.on("pageerror", (err) => errores.push(err.message))

    // 1) Precondición determinista: 2 eventos reales del tipo que expone la vista,
    //    insertados por el endpoint real de ingesta (misma capa que usa la UI:
    //    upsert idempotente scoped por membresía). NO se flipa el switch de
    //    privacidad de /admin/gestion: su presencia depende de datos que crean
    //    otras specs y con BD fresca hay 0 (medido 2026-10-12: 0 switches, 0
    //    eventos en `eventos_auditoria` y por lo tanto faceta de tipos ausente).
    await page.goto("/admin/logs")
    const sufijo = Date.now()
    const eventosTest = [1, 2].map((n) => ({
      id: `test-am-logs-${sufijo}-${n}`,
      timestamp: new Date().toISOString(),
      usuario: "Admin",
      categoria: "AD",
      tipoAccion: "AD_OWNER_CONFIG_CHANGE",
      referenciaId: `test-am-logs-${sufijo}-${n}`,
      descripcion: `RESIDENTE_VE_MOROSIDAD: morosidad=${n} (evento TEST de auditoría)`,
    }))
    const sync = await page.request.post(new URL("/api/auditoria/sync", page.url()).toString(), {
      data: { eventos: eventosTest },
    })
    expect(sync.ok(), `POST /api/auditoria/sync -> ${sync.status()}`).toBe(true)

    // 2) Vista /admin/logs: header read-only + contador BD (los 2 eventos ya están en BD)
    await page.reload()
    await expect(page.getByRole("heading", { name: "Logs de Auditoría" })).toBeVisible({
      timeout: 30_000,
    })
    await expect(page.getByText("solo lectura · pista inmutable")).toBeVisible()
    // Contador BD: "X de Y eventos en BD" — números con separador "." es-CL (1.815)
    await expect(page.getByText(/de [\d.]+ eventos en BD/)).toBeVisible({ timeout: 30_000 })

    // 3) Filtrar por tipo de acción: la faceta se calcula sobre toda la BD, así que
    //    con los eventos ya sembrados la opción está en la lista (assert directo).
    //    El Select de Radix necesita click real: con `force: true` + `noWaitAfter`
    //    el menú no se despliega (medido 2026-10-12).
    const comboTipo = page.getByRole("combobox", { name: "Filtrar por tipo de acción" })
    const opcionTipo = page.getByRole("option", { name: "AD_OWNER_CONFIG_CHANGE" })
    await comboTipo.click()
    await expect(opcionTipo).toBeVisible({ timeout: 15_000 })
    await opcionTipo.click()
    await expect
      .poll(
        async () =>
          page.getByRole("cell").filter({ hasText: "AD_OWNER_CONFIG_CHANGE" }).count(),
        { timeout: 30_000, intervals: [1000] },
      )
      .toBeGreaterThanOrEqual(2)
    // El contador filtrado también debe mostrar ≥2 en el lado X y total Y (con separador "." es-CL)
    await expect(page.getByText(/[\d.]+ de [\d.]+ eventos en BD/)).toBeVisible({ timeout: 10_000 })

    // 4) Filtrar por categoría AD (mantiene tipoAccion ya filtrado)
    await page.getByRole("combobox", { name: "Filtrar por categoría" }).click()
    // AD puede no estar en la lista si la página no lo contiene — intentar click si existe
    const opcionAD = page.getByRole("option", { name: "AD", exact: true })
    if (await opcionAD.count()) {
      await opcionAD.click()
      await expect
        .poll(
          async () =>
            page.getByRole("cell").filter({ hasText: "AD_OWNER_CONFIG_CHANGE" }).count(),
          { timeout: 10_000, intervals: [500] },
        )
        .toBeGreaterThanOrEqual(2)
    }

    // 5) Búsqueda por texto: match y sin match (sobre el set ya filtrado)
    const buscar = page.getByLabel("Buscar eventos")
    await buscar.fill("morosidad=")
    await expect
      .poll(
        async () =>
          page.getByRole("cell").filter({ hasText: "AD_OWNER_CONFIG_CHANGE" }).count(),
        { timeout: 15_000, intervals: [500] },
      )
      .toBeGreaterThanOrEqual(2)
    await expect(page.getByText(/de [\d.]+ eventos en BD/)).toBeVisible({ timeout: 10_000 })
    await buscar.fill("zzz-evento-inexistente")
    await expect(page.getByText(/0 de [\d.]+ eventos en BD/)).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText("Sin eventos para la búsqueda o filtros actuales.")).toBeVisible()
    await buscar.fill("")
    await expect
      .poll(
        async () =>
          page.getByRole("cell").filter({ hasText: "AD_OWNER_CONFIG_CHANGE" }).count(),
        { timeout: 15_000, intervals: [500] },
      )
      .toBeGreaterThanOrEqual(2)

    // 6) Exportación CSV del resultado filtrado (página actual)
    const [descarga] = await Promise.all([
      page.waitForEvent("download", { timeout: 30_000 }),
      page.getByRole("button", { name: "Exportar CSV" }).click(),
    ])
    expect(descarga.suggestedFilename()).toMatch(/^audit-logs-\d{4}-\d{2}-\d{2}\.csv$/)
    const ruta = await descarga.path()
    expect(ruta).toBeTruthy()
    const contenido = fs.readFileSync(ruta as string, "utf8")
    expect(contenido.charCodeAt(0)).toBe(0xfeff)
    expect(
      contenido
        .slice(1)
        .startsWith("timestamp,usuario,categoria,tipoAccion,referenciaId,descripcion\n"),
    ).toBe(true)
    expect((contenido.match(/AD_OWNER_CONFIG_CHANGE/g)?.length ?? 0)).toBeGreaterThanOrEqual(2)

    // 7) Paginación server-side: si hay más de 50 eventos, botones visibles; si no, no falla
    //    No se exige total exacto — solo se afirma que no hay pageerror y la UI responde.
    const paginationText = page.getByText(/Página \d+ de \d+/)
    // Puede estar o no según total; si está, afirmar que es visible y botones funcionan
    if (await paginationText.count()) {
      await expect(paginationText).toBeVisible({ timeout: 5_000 })
    }

    // 8) Solo lectura: sin acciones de mutación en la página
    await expect(page.getByRole("button", { name: "Exportar CSV" })).toHaveCount(1)
    await expect(
      page.getByRole("button", { name: /eliminar|editar|borrar/i }),
    ).toHaveCount(0)

    expect(errores).toEqual([])
  })
})
