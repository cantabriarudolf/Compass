import { expect, test } from "@playwright/test"

test.use({ actionTimeout: 30_000 })

test.describe("CRUD — Operaciones/Accesos", () => {
  test("vista read-only: heading + paneles de visitas/contratistas y 0 pageerror", async ({ page }) => {
    const errores: string[] = []
    page.on("pageerror", (err) => errores.push(err.message))

    await page.goto("/operaciones/accesos")
    await expect(page.getByRole("heading", { name: /Accesos y Visitas/ })).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText("Control de visitas y contratistas")).toBeVisible({ timeout: 10_000 })

    // Panel Visitas: label Nombre * y botón Registrar visita
    await expect(page.getByLabel("Nombre *").first()).toBeVisible({ timeout: 10_000 })
    await expect(page.getByLabel("DNI *").first()).toBeVisible({ timeout: 10_000 })
    await expect(page.getByRole("button", { name: "Registrar visita" }).first()).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText("Registro de visita").first()).toBeVisible({ timeout: 10_000 })

    // Panel Contratistas: label Motivo específico y botón Agendar ingreso
    await expect(page.getByLabel("Motivo específico del ingreso *").first()).toBeVisible({ timeout: 10_000 })
    await expect(page.getByRole("button", { name: "Agendar ingreso" }).first()).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText("Agendamiento de contratista").first()).toBeVisible({ timeout: 10_000 })

    // Selector de día visible
    await expect(page.getByLabel("Día consultado")).toBeVisible({ timeout: 10_000 })

    // Tablas del día
    await expect(page.getByText("Control del día seleccionado").first()).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText("Ingresos del día").first()).toBeVisible({ timeout: 10_000 })

    expect(errores, "Excepciones no capturadas en operaciones/accesos").toEqual([])
  })
})
