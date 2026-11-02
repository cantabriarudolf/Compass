import { expect, test } from "@playwright/test"

test.use({ actionTimeout: 30_000 })

/**
 * /dashboard dejó de ser la portada de inventario (feature `dashboard-operativo`):
 * ahora es una portada operativa y financiera por perfil. Con la sesión de
 * `admin@test.cl` (storageState compartido) se renderiza el perfil de gestión.
 *
 * Spec: odd/tasks/dashboard-operativo.md, S1-S8.
 */
test.describe("Dashboard — portada por perfil", () => {
  test("perfil de gestión: foto del día, finanzas, deuda, provisión, nóminas, mantenciones y visitas", async ({
    page,
  }) => {
    const errores: string[] = []
    page.on("pageerror", (err) => errores.push(err.message))

    await page.goto("/dashboard")

    // S1/S8 — foto rápida del día del módulo Operaciones.
    await expect(page.getByText("Foto del día · Operaciones").first()).toBeVisible({ timeout: 30_000 })

    // S3 — bloque financiero con sus cuatro cifras.
    await expect(page.getByText("Finanzas de la comunidad").first()).toBeVisible({ timeout: 15_000 })
    for (const etiqueta of ["Ingresos", "Egresos", "Caja total", "Caja por fondos"]) {
      await expect(page.getByText(etiqueta, { exact: false }).first()).toBeVisible({ timeout: 15_000 })
    }

    // S4 — deuda de las unidades con desglose.
    await expect(page.getByText("Deuda de las unidades").first()).toBeVisible({ timeout: 15_000 })

    // S5 — provisión del mes.
    await expect(page.getByText("Provisión del mes").first()).toBeVisible({ timeout: 15_000 })

    // S6 — compromisos: nóminas por pagar y gastos mensuales estimados.
    await expect(page.getByText("Nóminas por pagar").first()).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText("Gastos mensuales estimados").first()).toBeVisible({ timeout: 15_000 })

    // S7 — mantenciones preventivas desde el maestro de proveedores.
    await expect(page.getByText("Mantenciones preventivas").first()).toBeVisible({ timeout: 15_000 })

    // S8 — visitas técnicas conviven con la foto del día.
    await expect(page.getByText("Visitas técnicas del período").first()).toBeVisible({ timeout: 15_000 })

    // D5 — ningún panel queda en un esqueleto infinito: hay cifras en pesos.
    const cifras = page.getByText(/\$\s?[\d.]+/)
    expect(await cifras.count()).toBeGreaterThan(0)

    // Portada de solo lectura: sin acciones de mutación.
    await expect(page.getByRole("button", { name: /eliminar|borrar|crear|guardar/i })).toHaveCount(0)

    // No es la portada del home.
    await expect(page.getByText("Bienvenido a GECOS")).toHaveCount(0)

    expect(errores, "Excepciones no capturadas en /dashboard").toEqual([])
  })
})
