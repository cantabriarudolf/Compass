import * as fs from "node:fs"
import { expect, test } from "@playwright/test"

test.use({ actionTimeout: 30_000 })

test.describe("Logs de Auditoría (AM) — vista read-only en /admin/logs", () => {
  test("consulta, filtra, busca y exporta eventos generados por una acción real", async ({
    page,
  }) => {
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

    // 2) Vista /admin/logs: header read-only + ambos eventos presentes
    await page.goto("/admin/logs")
    await expect(page.getByRole("heading", { name: "Logs de Auditoría" })).toBeVisible({
      timeout: 30_000,
    })
    await expect(page.getByText("solo lectura · pista inmutable")).toBeVisible()
    await expect(page.getByText("2 de 2 eventos")).toBeVisible({ timeout: 15_000 })

    // 3) Filtrar por categoría AD (única categoría presente)
    await page
      .getByRole("combobox", { name: "Filtrar por categoría" })
      .click({ force: true, noWaitAfter: true })
    await page.getByRole("option", { name: "AD", exact: true }).click()
    await expect(page.getByText("2 de 2 eventos")).toBeVisible()

    // 4) Filtrar por tipo de acción
    await page
      .getByRole("combobox", { name: "Filtrar por tipo de acción" })
      .click({ force: true, noWaitAfter: true })
    await page.getByRole("option", { name: "AD_OWNER_CONFIG_CHANGE" }).click()
    await expect(page.getByText("2 de 2 eventos")).toBeVisible()
    await expect(
      page.getByRole("cell").filter({ hasText: "AD_OWNER_CONFIG_CHANGE" }),
    ).toHaveCount(2)

    // 5) Búsqueda por texto: match y sin match
    const buscar = page.getByLabel("Buscar eventos")
    await buscar.fill("morosidad=")
    await expect(page.getByText("2 de 2 eventos")).toBeVisible({ timeout: 15_000 })
    await buscar.fill("zzz-evento-inexistente")
    await expect(page.getByText("0 de 2 eventos")).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText("Sin eventos para la búsqueda o filtros actuales.")).toBeVisible()
    await buscar.fill("")
    await expect(page.getByText("2 de 2 eventos")).toBeVisible({ timeout: 15_000 })

    // 6) Exportación CSV del resultado filtrado
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
    expect(contenido.match(/AD_OWNER_CONFIG_CHANGE/g)?.length).toBe(2)

    // 7) Solo lectura: sin acciones de mutación en la página
    await expect(page.getByRole("button", { name: "Exportar CSV" })).toHaveCount(1)
    await expect(
      page.getByRole("button", { name: /eliminar|editar|borrar/i }),
    ).toHaveCount(0)

    expect(errores).toEqual([])
  })
})
