import { expect, test } from "@playwright/test"
import { rutUnicoTEST } from "../helpers/datos-test"

test.use({ actionTimeout: 30_000 })

test.describe("CRUD — Operaciones/Proveedores", () => {
  test("crear nuevo proveedor y verificar fila en catálogo", async ({ page }) => {
    const errores: string[] = []
    page.on("pageerror", (err) => errores.push(err.message))

    const ts = Date.now()
    const nombreProveedor = `QA-Servicios-${ts}`
    // RUT único por corrida con DV válido: el fijo "76.543.210-3" colisionaba
    // con residuos de corridas previas (el spec no limpiaba) y el submit se
    // rechazaba dejando el dialog abierto. (P2 PG-FASE3: independizado.)
    const rutProveedor = rutUnicoTEST()
    // La UI formatea el RUT con puntos de miles: se afirma el valor formateado.
    const [cuerpoRut, dvRut] = rutProveedor.split("-")
    const rutFormateado = `${cuerpoRut!.replace(/\B(?=(\d{3})+(?!\d))/g, ".")}-${dvRut}`

    try {
    await page.goto("/operaciones/proveedores")
    await expect(page.getByRole("heading", { name: /Proveedores y Servicios/ })).toBeVisible({ timeout: 15_000 })

    // Tab Catálogo debe estar activo por defecto, pero asegurar
    const tabCatalogo = page.getByRole("tab", { name: /Catálogo/ })
    if (await tabCatalogo.isVisible().catch(() => false)) {
      await tabCatalogo.click({ force: true, noWaitAfter: true }).catch(() => {})
      await page.waitForTimeout(300)
    }

    const btnNuevo = page.getByRole("button", { name: "Nuevo" })
    await expect(btnNuevo).toBeVisible({ timeout: 10_000 })
    await btnNuevo.click({ force: true, noWaitAfter: true })

    const dialog = page.getByRole("dialog")
    await expect(dialog.getByRole("heading", { name: /Nuevo proveedor/ })).toBeVisible({ timeout: 10_000 })

    // RUT empresa * — id pv-rut
    const inputRut = dialog.getByLabel("RUT empresa *")
    await expect(inputRut).toBeVisible({ timeout: 10_000 })
    await inputRut.fill(rutProveedor)

    // Nombre *
    const inputNombre = dialog.getByLabel("Nombre *")
    await expect(inputNombre).toBeVisible({ timeout: 10_000 })
    await inputNombre.fill(nombreProveedor)

    // Rubro *
    const inputRubro = dialog.getByLabel("Rubro *")
    await expect(inputRubro).toBeVisible({ timeout: 10_000 })
    await inputRubro.fill("Ascensores")

    // Guardar
    const btnGuardar = dialog.getByRole("button", { name: "Guardar" })
    await expect(btnGuardar).toBeVisible({ timeout: 10_000 })
    await btnGuardar.scrollIntoViewIfNeeded().catch(() => {})
    await btnGuardar.click({ force: true, noWaitAfter: true })
    await page.waitForTimeout(800)
    if (await dialog.isVisible().catch(() => false)) {
      await btnGuardar.click({ force: true, noWaitAfter: true }).catch(() => {})
      await page.waitForTimeout(800)
    }
    await expect(dialog).toBeHidden({ timeout: 10_000 })

    // Afirmar fila en catálogo (Table Empresa/RUT/Rubro)
    await expect(page.getByRole("cell", { name: nombreProveedor }).first()).toBeVisible({ timeout: 15_000 })
    const row = page.getByRole("row").filter({ hasText: nombreProveedor })
    await expect(row).toBeVisible({ timeout: 10_000 })
    await expect(row.getByText(rutFormateado).first()).toBeVisible({ timeout: 10_000 })
    await expect(row.getByText("Ascensores")).toBeVisible({ timeout: 10_000 })

    expect(errores, "Excepciones no capturadas en operaciones/proveedores").toEqual([])
    } finally {
      // Cleanup propio vía API: borra las filas con el nombre exacto.
      try {
        const lista = await page.request
          .get("/api/pe/proveedores?pageSize=100")
          .catch(() => null)
        const j = (await lista?.json().catch(() => ({ data: [] }))) as {
          data?: { id: string; nombre?: string }[]
        }
        for (const p of j.data ?? []) {
          if (p.nombre === nombreProveedor) {
            await page.request.delete(`/api/pe/proveedores/${p.id}`).catch(() => {})
          }
        }
      } catch {
        /* best-effort */
      }
    }
  })
})
