import { expect, test } from "@playwright/test"

test.use({ actionTimeout: 30_000 })

test.describe("CRUD — Admin/Reporteria", () => {
  test("generar reporte con snapshot y distribuir, verificar historial", async ({ page }) => {
    const errores: string[] = []
    page.on("pageerror", (err) => errores.push(err.message))

    const titulo = `QA-Reporte-${Date.now()}`

    await page.goto("/admin/reporteria")

    // Tab "Reportes y Segmentación"
    await page.getByRole("tab", { name: "Reportes y Segmentación" }).click({ force: true, noWaitAfter: true })

    // Llenar "Título del reporte *" — el Input usa placeholder sin htmlFor (ver snapshot)
    const inputTitulo = page.getByPlaceholder("Ej. Fallas en ascensores Torre A")
    await expect(inputTitulo).toBeVisible({ timeout: 15_000 })
    await inputTitulo.fill(titulo)

    // Marcar ≥1 checkbox de "Bloques de información *"
    // Primer bloque: "Resumen de Gastos del Mes"
    const bloqueCheckbox = page.getByRole("checkbox").first()
    await expect(bloqueCheckbox).toBeVisible({ timeout: 10_000 })
    await bloqueCheckbox.click({ force: true, noWaitAfter: true })

    // Seleccionar al menos un perfil para que la segmentación resuelva destinatarios (evita error "La segmentación no resolvió…")
    // Ver lib/reporteria-utils.ts resolverSegmentacionRE requiere perfiles o EF/Tenencia
    const perfilBtn = page.getByRole("button", { name: "Propietarios" }).first()
    // Si no hay "Propietarios", usar "Administración/Directiva"
    const perfilVisible = await perfilBtn.isVisible().catch(() => false)
    if (perfilVisible) {
      await perfilBtn.click({ force: true, noWaitAfter: true })
    } else {
      await page.getByRole("button", { name: "Administración/Directiva" }).first().click({ force: true, noWaitAfter: true })
    }

    // Verificar que al menos uno quedó marcado (el botón Generar se habilita)
    const btnGenerar = page.getByRole("button", { name: "Generar reporte (snapshot)" })
    await expect(btnGenerar).toBeEnabled({ timeout: 10_000 })
    // P2 E2E-FULL-VERDE: el click Playwright force a veces no completa el
    // ciclo mousedown/mouseup en el mismo nodo (re-render bajo carga dev) y
    // React no dispara el handler → click programático atómico + verificación.
    let generado = false
    for (let intento = 0; intento < 3 && !generado; intento++) {
      await page.evaluate(() => {
        const b = Array.from(document.querySelectorAll("button")).find((x) => x.textContent?.includes("Generar reporte (snapshot)"))
        ;(b as HTMLElement)?.click()
      })
      await page.waitForTimeout(1500)
      generado = await page.getByText("Reporte generado con snapshot inmutable").first().isVisible().catch(() => false)
    }

    // Afirmar card con el título en "Historial de reportes" — el heading es CardTitle (div), no role heading → usar getByText
    const historialHeading = page.getByText("Historial de reportes").first()
    await expect(historialHeading).toBeVisible({ timeout: 10_000 })
    const cardTitulo = page.getByText(titulo).first()
    await expect(cardTitulo).toBeVisible({ timeout: 15_000 })

    // Card contenedora: buscar la fila que contiene el título
    const card = page.locator("div").filter({ hasText: titulo }).filter({ has: page.getByRole("button", { name: "Distribuir" }) }).first()
    // Fallback: si no filtra, usar la card genérica del historial
    const distribuirBtn = card.getByRole("button", { name: "Distribuir" })
    const visibleDistribuir = await distribuirBtn.isVisible().catch(() => false)
    if (visibleDistribuir) {
      await distribuirBtn.click({ force: true, noWaitAfter: true })
    } else {
      // buscar cualquier Distribuir visible en el historial y asumir es el del título recién creado (último reporte es el primero en lista)
      await page.getByRole("button", { name: "Distribuir" }).first().click({ force: true, noWaitAfter: true })
    }

    // Afirmar mensaje de distribución enviada
    await expect(page.getByText("Distribución enviada a la bandeja simulada")).toBeVisible({ timeout: 10_000 })
    // O badge con destinatario(s)
    await expect(page.getByText(/destinatario\(s\)/)).toBeVisible({ timeout: 10_000 })

    expect(errores, "Excepciones no capturadas en admin/reporteria").toEqual([])
  })
})
