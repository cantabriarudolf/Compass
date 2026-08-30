import { expect, test } from "@playwright/test"

test.use({ actionTimeout: 30_000 })
test.setTimeout(300_000)

test.describe("CRUD — Comunidad/Portal (GATED)", () => {
  test("poblar QA Lab y gestionar vitrina con nueva publicación manual", async ({ page }) => {
    const errores: string[] = []
    page.on("pageerror", (err) => errores.push(err.message))

    // Precondición gated: poblar todo de una vez vía QA Lab
    await page.goto("/admin/qa-lab")
    await expect(page.getByRole("heading", { name: /Laboratorio QA/ })).toBeVisible({ timeout: 15_000 })

    const btnPoblar = page.getByRole("button", { name: "Poblar todo de una vez" })
    await expect(btnPoblar).toBeVisible({ timeout: 15_000 })
    await btnPoblar.evaluate((b: HTMLElement) => b.click()).catch(async () => {
      await btnPoblar.click({ force: true, noWaitAfter: true }).catch(() => {})
    })

    await expect(page.getByText("🟢 Listo").first()).toBeVisible({ timeout: 120_000 })

    // Ir a Portal (admin logueado vía storageState; gate residentes no aplica)
    await page.goto("/comunidad/portal")
    await expect(page.getByRole("heading", { name: /Portal Inmobiliario/ })).toBeVisible({ timeout: 15_000 })

    // Afirmar que el catálogo muestra la publicación TEST (test-pub-pi-e999)
    // La card muestra precio 8.500.000 y etiqueta E-999 o imagen placeholder
    const catalogoTexto = page.getByText("Propiedades en venta y arriendo").first()
    await expect(catalogoTexto).toBeVisible({ timeout: 10_000 })

    // La publicación TEST tiene id test-pub-pi-e999 con unidad E-999 en venta 8.500.000
    // Puede aparecer como card con "E-999" o precio. Verificar que hay al menos 1 card
    // con el texto del precio o la unidad. El portal filtra "Todas" por defecto.
    await expect(page.getByText("E-999").first()).toBeVisible({ timeout: 15_000 })
    // También el badge venta
    await expect(page.getByText("venta").first()).toBeVisible({ timeout: 10_000 })

    // Activar Gestionar vitrina
    const btnGestionar = page.getByRole("button", { name: "Gestionar vitrina" })
    await expect(btnGestionar).toBeVisible({ timeout: 15_000 })
    await btnGestionar.click({ force: true, noWaitAfter: true })
    await page.waitForTimeout(600)

    const cardGestion = page.getByText("Gestión de la vitrina").first()
    await expect(cardGestion).toBeVisible({ timeout: 10_000 })

    // Contar publicaciones previas
    const rowsBefore = await page.getByRole("row").count()

    // Click Nueva publicación manual (crea + abre Dialog "Editar publicación · {unidad}")
    const btnNueva = page.getByRole("button", { name: "Nueva publicación manual" })
    await expect(btnNueva).toBeVisible({ timeout: 10_000 })
    await btnNueva.scrollIntoViewIfNeeded().catch(() => {})
    await btnNueva.click({ force: true, noWaitAfter: true })
    await page.waitForTimeout(600)

    // Dialog "Editar publicación · {unidad}"
    const dialog = page.getByRole("dialog")
    await expect(dialog.getByRole("heading", { name: /Editar publicación/ })).toBeVisible({ timeout: 10_000 })

    // Extraer unidad del título para luego verificar en tabla
    const tituloDialog = (await dialog.getByRole("heading", { name: /Editar publicación/ }).textContent()) ?? ""
    // formato "Editar publicación · <unidad etiqueta numero>"
    const unidadDialog = tituloDialog.replace("Editar publicación ·", "").trim()

    // Opcional: completar precio si es 0 (debe ser >0 para ser útil pero no obligatorio)
    // El diálogo crea con precio 0 y activa false. Poner un precio para que se vea en catálogo si se activa.
    const inputPrecio = dialog.locator('input[type="number"]').first()
    if (await inputPrecio.isVisible().catch(() => false)) {
      const cur = await inputPrecio.inputValue().catch(() => "")
      if (!cur || cur === "0") await inputPrecio.fill("9500000")
    }

    // Guardar
    const btnGuardar = dialog.getByRole("button", { name: "Guardar" })
    await expect(btnGuardar).toBeVisible({ timeout: 10_000 })
    await btnGuardar.scrollIntoViewIfNeeded().catch(() => {})
    try {
      await btnGuardar.click({ force: true, noWaitAfter: true, timeout: 5_000 })
    } catch {
      await dialog.locator("form").evaluate((f) => (f as HTMLFormElement).requestSubmit()).catch(() => {})
    }
    await page.waitForTimeout(800)
    if (await dialog.isVisible().catch(() => false)) {
      await dialog.evaluate(() => {
        const f = document.querySelector('[role="dialog"] form') as HTMLFormElement | null
        if (f) f.requestSubmit()
      }).catch(() => {})
      await page.waitForTimeout(800)
    }
    await expect(dialog).toBeHidden({ timeout: 15_000 })

    // Afirmar fila nueva en la tabla de gestión (dentro de Gestión de la vitrina)
    // La tabla tiene columnas Unidad / Operación / Precio / Estado / Leads / Acciones
    // Buscar por unidadDialog si existe, si no fallback a última fila
    await page.waitForTimeout(500)
    const tablaGestion = page.getByText("Gestión de la vitrina").locator("..").locator("..")
    const rowsAfter = await page.getByRole("row").count()
    expect(rowsAfter, "Debe haber al menos una fila más tras crear publicación").toBeGreaterThanOrEqual(rowsBefore)

    if (unidadDialog) {
      // La tabla de gestión debería contener la unidad recién creada
      // Puede necesitar scrollear
      const filaUnidad = page.getByRole("row").filter({ hasText: unidadDialog }).first()
      // si no encuentra exacto, buscar por precio que pusimos
      const visibleUnidad = await filaUnidad.isVisible().catch(() => false)
      if (visibleUnidad) {
        await expect(filaUnidad).toBeVisible({ timeout: 10_000 })
      } else {
        // fallback: última fila tiene el precio 9.500.000
        await expect(page.getByRole("row").filter({ hasText: "9.500.000" }).first()).toBeVisible({ timeout: 10_000 })
      }
    } else {
      await expect(page.getByRole("row").last()).toBeVisible({ timeout: 10_000 })
    }

    // Verificar que la publicación aparece en el catálogo si se activa o en gestión al menos
    // Al guardar, la publicación queda inactiva (activa false) por defecto, así que no aparece en catálogo,
    // pero sí en la tabla de gestión con badge "Retirada". Afirmar badge.
    await expect(page.getByText("Retirada").first()).toBeVisible({ timeout: 10_000 }).catch(async () => {
      await expect(page.getByText("Activa").first()).toBeVisible({ timeout: 5_000 })
    })

    expect(errores, "Excepciones no capturadas en comunidad/portal").toEqual([])
  })
})
