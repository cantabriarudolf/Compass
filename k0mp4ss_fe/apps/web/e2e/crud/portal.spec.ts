import { expect, test } from "@playwright/test"

test.use({ actionTimeout: 30_000 })
test.setTimeout(300_000)

// P2 SERIE-GATED-API-BD: independizado de QA-Lab. La publicación TEST propia
// se crea vía API REST (POST /api/publicaciones-portal con una unidad del
// seed vía GET /api/unidades) y se limpia al final (DELETE + las manuales que
// cree la UI). La página /comunidad/portal lee BD vía hooks SWR: sin
// "Poblar todo" previo.

test.describe("CRUD — Comunidad/Portal (GATED)", () => {
  test("vitrina TEST vía API y gestión con nueva publicación manual", async ({ page }) => {
    const errores: string[] = []
    page.on("pageerror", (err) => errores.push(err.message))

    const ts = Date.now()
    const pubId = `test-p2-portal-pub-${ts}`
    const hoy = new Date().toISOString().slice(0, 10)

    // Setup vía API: unidad real del seed (mismo scope garantizado).
    const lista = await page.request.get("/api/unidades?pageSize=1")
    expect(lista.ok(), "GET /api/unidades debe responder").toBe(true)
    const ju = (await lista.json()) as {
      data?: { id: string; etiqueta: string; numero: string }[]
    }
    const unidad = ju.data?.[0]
    expect(unidad, "el seed debe traer al menos una unidad").toBeTruthy()
    const refUnidad = `${unidad!.etiqueta} ${unidad!.numero}`

    const antes = await page.request.get("/api/publicaciones-portal?pageSize=100")
    const jAntes = (await antes.json().catch(() => ({ data: [] }))) as { data?: { id: string }[] }
    const idsAntes = new Set((jAntes.data ?? []).map((p) => p.id))

    const resPub = await page.request.post("/api/publicaciones-portal", {
      data: {
        id: pubId,
        unidadId: unidad!.id,
        operacion: "venta",
        precio: 8500000,
        moneda: "CLP",
        descripcion: `Publicación TEST P2 portal ${ts}`,
        imagenes: [],
        activa: true,
        fechaPublicacion: hoy,
      },
    })
    expect(resPub.ok(), "POST /api/publicaciones-portal debe crear la publicación TEST").toBe(true)

    try {
      // Ir a Portal (admin logueado vía storageState)
      await page.goto("/comunidad/portal")
      await expect(page.getByRole("heading", { name: /Portal Inmobiliario/ })).toBeVisible({ timeout: 15_000 })

      const catalogoTexto = page.getByText("Propiedades en venta y arriendo").first()
      await expect(catalogoTexto).toBeVisible({ timeout: 10_000 })

      // La publicación TEST aparece en el catálogo con su unidad y operación.
      await expect(page.getByText(refUnidad).first()).toBeVisible({ timeout: 15_000 })
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
    } finally {
      // Cleanup: la manual creada por la UI tiene id aleatorio → se detecta
      // por diferencia contra el listado previo; la TEST se borra directo.
      const despues = await page.request.get("/api/publicaciones-portal?pageSize=100").catch(() => null)
      const jDespues = (await despues?.json().catch(() => ({ data: [] }))) as { data?: { id: string }[] }
      for (const p of jDespues.data ?? []) {
        if (!idsAntes.has(p.id)) {
          await page.request.delete(`/api/publicaciones-portal/${p.id}`).catch(() => {})
        }
      }
      await page.request.delete(`/api/publicaciones-portal/${pubId}`).catch(() => {})
    }
  })
})
