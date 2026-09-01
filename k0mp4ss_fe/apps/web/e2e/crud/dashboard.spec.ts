import { expect, test } from "@playwright/test"

test.use({ actionTimeout: 30_000 })

test.describe("Dashboard — Resumen en /dashboard", () => {
  test("vista read-only: heading, ≥4 KPI cards con datos del seed, links rápidos y 0 pageerror", async ({ page }) => {
    const errores: string[] = []
    page.on("pageerror", (err) => errores.push(err.message))

    await page.goto("/dashboard")

    // 1) Heading Resumen
    await expect(page.getByRole("heading", { name: /Resumen/ })).toBeVisible({ timeout: 30_000 })
    await expect(page.getByText("Vista gerencial")).toBeVisible()

    // 2) Al menos 4 KPI cards con números no vacíos (valores del seed >0)
    // Las cards contienen label arriba y valor numérico grande
    // Afirmar que hay al menos 4 valores numéricos visibles en la grilla de KPIs
    const kpiGrid = page.locator("text=Unidades totales").first()
    await expect(kpiGrid).toBeVisible({ timeout: 15_000 })

    // Contar KPI cards por sus labels conocidos
    const labels = [
      "Unidades totales",
      "Personas registradas",
      "Residentes vigentes",
      "Tipos de unidad",
      "Sectores",
      "Estados ocupación",
      "Fondos FI",
    ]
    let visibleKpis = 0
    for (const label of labels) {
      const el = page.getByText(label, { exact: true }).first()
      if (await el.isVisible().catch(() => false)) visibleKpis++
    }
    expect(visibleKpis).toBeGreaterThanOrEqual(4)

    // Cada KPI visible debe tener un número (no vacío) cercano
    // Verificar que la página contiene al menos 4 números de 1-3 dígitos en cards
    const numericCards = page.locator(".text-2xl.font-black")
    const countNumeric = await numericCards.count()
    expect(countNumeric).toBeGreaterThanOrEqual(4)
    for (let i = 0; i < Math.min(countNumeric, 4); i++) {
      const txt = (await numericCards.nth(i).textContent())?.trim() ?? ""
      expect(txt).toMatch(/\d+/)
      expect(txt.length).toBeGreaterThan(0)
    }

    // 3) Links rápidos presentes (≥4 links a módulos)
    await expect(page.getByText("Accesos rápidos", { exact: true }).first()).toBeVisible({ timeout: 15_000 })
    const quickLinks = [
      "Estructura Física",
      "Residentes",
      "Bitácora Diaria",
      "Finanzas",
      "Métricas",
      "Personas",
    ]
    let quickVisible = 0
    for (const title of quickLinks) {
      const el = page.getByText(title, { exact: true }).first()
      if (await el.isVisible().catch(() => false)) quickVisible++
    }
    expect(quickVisible).toBeGreaterThanOrEqual(4)

    // Verificar que los quick links son navegables (href existe)
    const links = page.getByRole("link")
    const linkCount = await links.count()
    expect(linkCount).toBeGreaterThanOrEqual(4)
    // Al menos un link apunta a /inventario/estructura y otro a /personas/residentes
    await expect(page.getByRole("link", { name: /Estructura Física/i }).first()).toBeVisible()
    // El href de KPI también cuenta — verificar que hay links a módulos fuente
    const hrefs = await links.evaluateAll((els) => els.map((e) => (e as HTMLAnchorElement).href))
    const hasEstructura = hrefs.some((h) => h.includes("/inventario/estructura"))
    const hasResidentes = hrefs.some((h) => h.includes("/personas/residentes"))
    expect(hasEstructura).toBeTruthy()
    expect(hasResidentes).toBeTruthy()

    // 4) Solo lectura: sin botones de mutación
    await expect(page.getByRole("button", { name: /eliminar|borrar|crear|guardar/i })).toHaveCount(0)

    // 5) Ruta distinta de / (home)
    // Home tiene "Bienvenido a GECOS", dashboard tiene "Resumen"
    await expect(page.getByText("Bienvenido a GECOS")).toHaveCount(0)

    expect(errores, "Excepciones no capturadas en /dashboard").toEqual([])
  })
})
