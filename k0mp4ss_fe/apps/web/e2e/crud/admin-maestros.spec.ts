import { expect, test } from "@playwright/test"

test.use({ actionTimeout: 30_000 })

test.describe("CRUD — Admin/Maestros", () => {
  test("crear un nuevo maestro en Estados de Ocupacion y verificar fila en Table", async ({ page }) => {
    const errores: string[] = []
    page.on("pageerror", (err) => errores.push(err.message))

    const titulo = `QA-EdO-${Date.now()}`

    try {
      await page.goto("/admin/maestros")

    // Seleccionar sub-tab "Estados de Ocupación" del panel izquierdo (inventario)
    await page.getByRole("button", { name: "Estados de Ocupación" }).click({ force: true, noWaitAfter: true })

    // El botón header "Nuevo Registro" debe habilitarse tras elegir sub-tab
    const btnNuevo = page.getByRole("button", { name: /Nuevo Registro/ })
    await expect(btnNuevo).toBeEnabled({ timeout: 10_000 })
    await btnNuevo.click({ force: true, noWaitAfter: true })

    // Dialog "Añadir Nuevo Maestro"
    const dialog = page.getByRole("dialog")
    await expect(dialog.getByRole("heading", { name: /Añadir Nuevo Maestro/ })).toBeVisible({ timeout: 10_000 })

    // Llenar "Nombre / Categoría" con valor único (input name=nombre)
    await dialog.locator('input[name="nombre"]').fill(titulo)

    // Submit "Guardar": UN solo envío (click o requestSubmit) + espera real al
    // cierre del dialog. Sin re-submit ciego: si el envío no pasó, el dialog
    // sigue visible y el test falla con causa real en vez de duplicar la fila.
    // (P2 E2E-SIN-GATED: independizado — el re-submit a los 400ms duplicaba la
    // fila cuando el servidor tardaba y la aserción estricta fallaba.)
    const form = dialog.locator("form")
    const btnGuardar = dialog.getByRole("button", { name: "Guardar" })
    try {
      await btnGuardar.click({ force: true, noWaitAfter: true, timeout: 5_000 })
    } catch {
      await form.evaluate((f) => (f as HTMLFormElement).requestSubmit())
    }
    await expect(dialog).toBeHidden({ timeout: 15_000 })

    // Afirmar fila nueva en la Table del sub-tab — hay 2 celdas con mismo nombre (Nombre + Badge) → usar first()
    await expect(page.getByRole("cell", { name: titulo }).first()).toBeVisible({ timeout: 15_000 })

    // Desviación check: editar opcional pencil -> "Editar Maestro"
    // No bloqueante, solo verifica que el lápiz abre edición
    const row = page.getByRole("row").filter({ hasText: titulo })
    await expect(row).toBeVisible()
    const editBtn = row.getByRole("button").first()
    await editBtn.click({ force: true, noWaitAfter: true })
    await expect(page.getByRole("heading", { name: /Editar Maestro/ })).toBeVisible({ timeout: 5_000 })
    await page.keyboard.press("Escape")
    await expect(dialog).toBeHidden({ timeout: 5_000 })

    expect(errores, "Excepciones no capturadas en admin/maestros").toEqual([])
    } finally {
      // Cleanup propio vía API (P2 E2E-SIN-GATED): borra TODAS las filas con
      // el título exacto (cubre el doble-creado histórico) + es idempotente.
      // Sin esto los QA-EdO-* se acumulaban entre corridas.
      try {
        const lista = await page.request
          .get("/api/maestros/estados-ocupacion?pageSize=100")
          .catch(() => null)
        const j = (await lista?.json().catch(() => ({ data: [] }))) as {
          data?: { id: string; nombre?: string }[]
        }
        for (const m of j.data ?? []) {
          if (m.nombre === titulo) {
            await page.request
              .delete(`/api/maestros/estados-ocupacion/${m.id}`)
              .catch(() => {})
          }
        }
      } catch {
        /* best-effort */
      }
    }
  })
})
