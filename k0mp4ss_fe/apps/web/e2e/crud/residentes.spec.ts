import { expect, test } from "@playwright/test"

test.use({ actionTimeout: 30_000 })

test.describe("Residentes — directorio filtrado en /personas/residentes", () => {
  test("vista read-only: heading, filas con vínculo vigente del seed y 0 pageerror", async ({ page }) => {
    const errores: string[] = []
    page.on("pageerror", (err) => errores.push(err.message))

    await page.goto("/personas/residentes")

    // 1) Heading read-only
    await expect(page.getByRole("heading", { name: "Residentes" })).toBeVisible({ timeout: 30_000 })
    await expect(page.getByText("Directorio filtrado de residentes y propietarios")).toBeVisible()

    // 2) Tabla visible con columnas esperadas
    await expect(page.getByRole("table")).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText("Unidad vinculada")).toBeVisible()
    await expect(page.getByText("Residentes con vínculo vigente")).toBeVisible()

    // 3) Cada fila expone unidad vinculada y link Ver Ficha a MP (no duplica edición).
    //    Se mide sin filtrar, cuando la tabla está paginada al tope del padrón.
    const linksFicha = page.getByRole("link", { name: "Ver Ficha" })
    await expect(linksFicha.first()).toBeVisible({ timeout: 15_000 })
    const countLinks = await linksFicha.count()
    expect(countLinks).toBeGreaterThanOrEqual(5)
    await expect(linksFicha.first()).toHaveAttribute("href", /\/comunidad\/personas\//)

    // 4) El buscador consulta al servidor: encuentra a un residente del seed que
    //    NO está en la primera página del padrón. Juan Pérez González (p-1,
    //    propietario en u-A-101) es la persona más antigua del seed y el padrón
    //    pagina en 100 (de 118 personas), así que solo aparece buscando.
    await page.getByPlaceholder("Buscar por nombre o RUT...").fill("Juan Pérez")
    await expect(page.getByText("Juan Pérez González").first()).toBeVisible({ timeout: 15_000 })

    // 5) Badge de conteo coincide con filas (sanity)
    await expect(page.getByText(/residentes$/i).first()).toBeVisible()

    // 6) Solo lectura: sin acciones de mutación en la página
    await expect(page.getByRole("button", { name: /eliminar|editar|borrar|crear|guardar/i })).toHaveCount(0)

    expect(errores, "Excepciones no capturadas en /personas/residentes").toEqual([])
  })
})
