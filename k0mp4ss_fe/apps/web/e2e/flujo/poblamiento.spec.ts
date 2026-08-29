import { expect, test } from "@playwright/test"

// Flujo maestro: recorre la "Historia de Poblamiento" documentada en
// Data/NSGC/docs/manuales/34 - Historia de Poblamiento - Relato de Uso.md
// usando el Laboratorio QA (/admin/qa-lab), que automatiza todas las fases
// (MA/CF -> TU/MP -> EF -> VU -> PE/IR/CO -> FI/RA/MT -> CT/PL -> AM/RE).
// Verifica al final que la tasa de huérfanos sea 0 (coherencia cross-módulo).

test.use({ actionTimeout: 30_000 })

test.describe("Flujo de poblamiento (Historia de Poblamiento)", () => {
  test("puebla la comunidad de prueba y valida coherencia sin huérfanos", async ({ page }) => {
    const errores: string[] = []
    page.on("pageerror", (err) => errores.push(err.message))

    await page.goto("/admin/qa-lab")

    // 0) Limpiar cualquier residuo de prueba previo para dejar estado determinista
    await page
      .getByRole("button", { name: /Borrar todo lo de prueba/ })
      .click({ force: true, noWaitAfter: true })
    await expect(page.getByText(/TEST-\* limpio correctamente/)).toBeVisible({ timeout: 30_000 })

    // 1) Poblar todo de una vez (todas las fases del relato).
    // force + noWaitAfter porque el poblamiento corre un loop pesado que
    // bloquea el hilo y hace que Playwright falle el chequeo de "settle" del click.
    await page
      .getByRole("button", { name: /Poblar todo de una vez/ })
      .click({ force: true, noWaitAfter: true, timeout: 90_000 })

    // El Laboratorio QA marca cada fase con 🟢 Listo al completarse la carga.
    const tarjetasListas = page.getByText("🟢 Listo")
    await expect(tarjetasListas.first()).toBeVisible({ timeout: 90_000 })
    expect(await tarjetasListas.count()).toBeGreaterThan(0)

    // 2) Revisar que nada quedó suelto -> validación de FKs (tasa huérfanos = 0)
    await page
      .getByRole("button", { name: /Revisar que nada quedó suelto/ })
      .click({ force: true, noWaitAfter: true })
    await expect(
      page.getByText("Validación OK — tasa huérfanos 0, TEST-* coherente"),
    ).toBeVisible({ timeout: 30_000 })

    expect(errores, "Excepciones no capturadas en QA Lab").toEqual([])
  })

  test("la persona semilla del relato aparece en el directorio (MP)", async ({ page }) => {
    // El relato registra a Carlos con RUT 99.999.999-9 en Maestro de Personas.
    // Primero poblamos para asegurar que el dato exista en este contexto.
    await page.goto("/admin/qa-lab")
    await page
      .getByRole("button", { name: /Poblar todo de una vez/ })
      .click({ force: true, noWaitAfter: true, timeout: 90_000 })
    await expect(page.getByText("🟢 Listo").first()).toBeVisible({ timeout: 90_000 })

    await page.goto("/comunidad/personas")
    await expect(page.getByText("99.999.999-9")).toBeVisible({ timeout: 30_000 })
  })

  test("el depto 999 del relato aparece en la estructura física (EF)", async ({ page }) => {
    // El relato levanta la Torre SectorTEST -> Piso99-TEST -> Depto 999.
    await page.goto("/admin/qa-lab")
    await page
      .getByRole("button", { name: /Poblar todo de una vez/ })
      .click({ force: true, noWaitAfter: true, timeout: 90_000 })
    await expect(page.getByText("🟢 Listo").first()).toBeVisible({ timeout: 90_000 })

    await page.goto("/inventario/estructura")
    await expect(page.getByText("TEST-CATU-LoftQA 999")).toBeVisible({ timeout: 30_000 })
  })
})
