import { expect, test } from "@playwright/test"

test.use({ actionTimeout: 30_000 })

test.describe("CRUD — Operaciones/Bitacora", () => {
  test("registrar visita pre-agendada y marcar ingresada", async ({ page }) => {
    const errores: string[] = []
    page.on("pageerror", (err) => errores.push(err.message))

    const ts = Date.now()
    const nombreVisita = `QA Visita ${ts}`

    await page.goto("/operaciones/bitacora")
    await expect(page.getByRole("heading", { name: /Bitácora Digital/ })).toBeVisible({ timeout: 15_000 })

    // Tab Visitas
    const tabVisitas = page.getByRole("tab", { name: "Visitas" })
    await expect(tabVisitas).toBeVisible({ timeout: 10_000 })
    await tabVisitas.click({ force: true, noWaitAfter: true })
    await page.waitForTimeout(400)

    // Form inline Visitas — Nombre * y DNI *
    const inputNombre = page.getByLabel("Nombre *")
    await expect(inputNombre).toBeVisible({ timeout: 10_000 })
    await inputNombre.fill(nombreVisita)

    const inputDni = page.getByLabel("DNI *")
    await expect(inputDni).toBeVisible({ timeout: 10_000 })
    // RUT válido con DV 0 para 16444555
    await inputDni.fill("16.444.555-0")

    // Unidad destino — combobox buscable (F6): el término viaja a GET /api/unidades?q= y las
    // opciones salen de toda la comunidad, no de las primeras 100 montadas por el store.
    const unidad = page.getByLabel("Unidad destino")
    await expect(unidad).toBeVisible({ timeout: 10_000 })
    await unidad.fill("101")
    const resultadosUnidad = page.getByRole("listbox", { name: /Resultados de Unidad destino/ })
    const primeraUnidad = resultadosUnidad.getByRole("option").first()
    await expect(primeraUnidad).toBeVisible({ timeout: 15_000 })
    // Hay cinco «Depto 101» (torres A–E en el seed): el rol SII es lo que las desambigua.
    await expect(primeraUnidad).toContainText(/Depto 101/)
    await expect(primeraUnidad).toContainText(/123-/)
    const etiquetaUnidad = ((await primeraUnidad.textContent()) ?? "").trim()
    await primeraUnidad.click()
    // La selección queda a la vista en el control: nunca se muestra el id crudo.
    await expect(page.getByText(etiquetaUnidad, { exact: true }).first()).toBeVisible({
      timeout: 10_000,
    })

    // Pre-agendada switch ON — para que estado sea agendada y luego marcar ingresada
    const switchPre = page.getByRole("switch").first()
    // Si no está checked, click
    const isChecked = await switchPre.isChecked().catch(() => false)
    if (!isChecked) {
      await switchPre.click({ force: true, noWaitAfter: true })
      await page.waitForTimeout(300)
    }

    // Registrar visita
    const btnRegistrar = page.getByRole("button", { name: "Registrar visita" })
    await expect(btnRegistrar).toBeVisible({ timeout: 10_000 })
    await btnRegistrar.click({ force: true, noWaitAfter: true })
    await page.waitForTimeout(800)

    // Afirmar fila en tabla del día
    const row = page.getByRole("row").filter({ hasText: nombreVisita })
    await expect(row).toBeVisible({ timeout: 15_000 })
    // Debe contener DNI
    await expect(row.getByText("16.444.555-0")).toBeVisible({ timeout: 10_000 })
    // Y la unidad destino con la etiqueta que se eligió, no su id
    await expect(row.getByText(etiquetaUnidad, { exact: true })).toBeVisible({ timeout: 10_000 })
    // Estado Agendada
    await expect(row.getByText("Agendada")).toBeVisible({ timeout: 10_000 })

    // Click Marcar Ingresada
    const btnMarcar = row.getByRole("button", { name: "Marcar Ingresada" })
    await expect(btnMarcar).toBeVisible({ timeout: 10_000 })
    await btnMarcar.click({ force: true, noWaitAfter: true })
    await page.waitForTimeout(800)

    // Afirmar estado ingresada
    await expect(row.getByText("Ingresada")).toBeVisible({ timeout: 10_000 })

    expect(errores, "Excepciones no capturadas en operaciones/bitacora").toEqual([])
  })
})
