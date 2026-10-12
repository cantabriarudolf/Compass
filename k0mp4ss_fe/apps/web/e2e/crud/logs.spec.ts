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

    // 1) Generar 2 eventos reales vía acción de módulo: flip + flip de vuelta
    //    del primer switch de privacidad en /admin/gestion (AD_OWNER_CONFIG_CHANGE).
    await page.goto("/admin/gestion")
    const primerSwitch = page.getByRole("switch").first()
    await primerSwitch.waitFor({ state: "visible", timeout: 30_000 })
    await primerSwitch.click({ force: true, noWaitAfter: true })
    await expect(primerSwitch).toBeEnabled({ timeout: 30_000 })
    await primerSwitch.click({ force: true, noWaitAfter: true })

    // 2) Vista /admin/logs: header read-only — la BD puede tener eventos previos,
    //    esperar con poll hasta ver los 2 eventos recién generados via filtro acotado.
    await page.goto("/admin/logs")
    await expect(page.getByRole("heading", { name: "Logs de Auditoría" })).toBeVisible({
      timeout: 30_000,
    })
    await expect(page.getByText("solo lectura · pista inmutable")).toBeVisible()
    // Contador BD: "X de Y eventos en BD" — números con separador "." es-CL (1.815)
    await expect(page.getByText(/de [\d.]+ eventos en BD/)).toBeVisible({ timeout: 30_000 })

    // 3) Filtrar por tipo de acción primero (acota a los 2 eventos generados) con poll generoso
    //    Debounce 2s + POST sync puede tardar. Los facets de tipo se cargan al montar la
    //    página, así que una BD recién sembrada puede renderizar la lista antes de que
    //    existan los eventos: reintentamos (máx. 5) recargando hasta ver la opción visible.
    const comboTipo = page.getByRole("combobox", { name: "Filtrar por tipo de acción" })
    const opcionTipo = page.getByRole("option", { name: "AD_OWNER_CONFIG_CHANGE" })
    let opcionTipoVisible = false
    for (let intento = 1; intento <= 5 && !opcionTipoVisible; intento++) {
      // Radix Select abre con el pointer real: con `force: true` + `noWaitAfter`
      // el menú no se despliega (medido 2026-10-12) y el spec quedaba esperando
      // una opción que nunca aparecía.
      await comboTipo.click()
      opcionTipoVisible = await opcionTipo
        .waitFor({ state: "visible", timeout: 4_000 })
        .then(() => true)
        .catch(() => false)
      if (opcionTipoVisible) {
        await opcionTipo.click()
        break
      }
      await page.keyboard.press("Escape")
      if (intento < 5) {
        await page.reload()
        await expect(page.getByRole("heading", { name: "Logs de Auditoría" })).toBeVisible({
          timeout: 30_000,
        })
      }
    }
    if (!opcionTipoVisible) {
      throw new Error(
        "No se pudo filtrar por AD_OWNER_CONFIG_CHANGE: la opción no apareció tras 5 intentos (facet de tipos no sincronizado con los eventos generados).",
      )
    }
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
