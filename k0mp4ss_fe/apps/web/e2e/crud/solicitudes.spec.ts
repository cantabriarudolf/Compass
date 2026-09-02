import { expect, test } from "@playwright/test"

test.use({ actionTimeout: 30_000 })

test.describe("CRUD — Operaciones/Solicitudes", () => {
  test("crear solicitud de insumos y verificar transición a En Revisión", async ({ page }) => {
    const errores: string[] = []
    page.on("pageerror", (err) => errores.push(err.message))

    const ts = Date.now()
    const titulo = `QA-Insumo-${ts}`

    await page.goto("/operaciones/solicitudes")
    await expect(page.getByRole("heading", { name: "Solicitudes" })).toBeVisible({ timeout: 15_000 })

    const btnEnviar = page.getByRole("button", { name: "Enviar Solicitud" })
    await expect(btnEnviar).toBeVisible({ timeout: 10_000 })
    await btnEnviar.click({ force: true, noWaitAfter: true })

    const dialog = page.getByRole("dialog")
    await expect(dialog.getByRole("heading", { name: /Nueva solicitud/ })).toBeVisible({ timeout: 10_000 })

    // Tipo de gestión = Insumos y Materiales
    const labelTipo = dialog.getByText("Tipo de gestión", { exact: true }).first()
    let triggerTipo = labelTipo.locator("..").getByRole("combobox").first()
    const visTipo = await triggerTipo.isVisible().catch(() => false)
    if (!visTipo) {
      const c = dialog.locator("div").filter({ has: labelTipo }).first()
      triggerTipo = c.getByRole("combobox").first()
    }
    await expect(triggerTipo).toBeVisible({ timeout: 10_000 })
    await triggerTipo.click({ force: true, noWaitAfter: true })
    await page.waitForTimeout(350)
    const optInsumos = page.getByRole("option", { name: "Insumos y Materiales" })
    await expect(optInsumos).toBeVisible({ timeout: 10_000 })
    await optInsumos.click({ force: true, noWaitAfter: true })
    await page.waitForTimeout(400)

    // Título
    const inputTitulo = dialog.getByPlaceholder("Resume la solicitud")
    if (await inputTitulo.isVisible().catch(() => false)) {
      await inputTitulo.fill(titulo)
    } else {
      // fallback por label
      const labelTit = dialog.getByText("Título", { exact: true }).first()
      let inp = labelTit.locator("..").locator("input").first()
      if (!(await inp.isVisible().catch(() => false))) {
        const c = dialog.locator("div").filter({ has: labelTit }).first()
        inp = c.locator("input").first()
      }
      await inp.fill(titulo)
    }

    // Descripción textarea - primer textarea del dialogo
    let area = dialog.locator("textarea").first()
    // El dialog tiene otro textarea condicional arriba? Para insumos, título + descripción son los dos primeros campos no-buzón
    // Asegurar que sea el de descripción (segundo)
    const areas = dialog.locator("textarea")
    const cntAreas = await areas.count()
    // Descripción es la que está sin label de justificación extendida. Tomar la primera visible corta (rows=2)
    if (cntAreas >= 1) {
      area = areas.first()
      await expect(area).toBeVisible({ timeout: 10_000 })
      await area.fill(`Solicitud de insumos QA generada en ${ts} para validar flujo CRUD.`)
    }

    // Campos condicionales insumos: Área de destino * y Material solicitado *
    const inputAreaDestino = dialog.getByPlaceholder("Ej: Conserjería Torre A")
    if (await inputAreaDestino.isVisible().catch(() => false)) {
      await inputAreaDestino.fill("Conserjería Torre A")
    } else {
      const labelAD = dialog.getByText("Área de destino *", { exact: true }).first()
      let inp = labelAD.locator("..").locator("input").first()
      if (!(await inp.isVisible().catch(() => false))) {
        const c = dialog.locator("div").filter({ has: labelAD }).first()
        inp = c.locator("input").first()
      }
      await inp.fill("Conserjería Torre A")
    }

    const inputMaterial = dialog.getByPlaceholder("Ej: Guantes nitrilo caja x100")
    if (await inputMaterial.isVisible().catch(() => false)) {
      await inputMaterial.fill(`Guantes nitrilo QA-${ts}`)
    } else {
      const labelMat = dialog.getByText(/Material solicitado/, { exact: false }).first()
      let inp = labelMat.locator("..").locator("input").first()
      if (!(await inp.isVisible().catch(() => false))) {
        const c = dialog.locator("div").filter({ has: labelMat }).first()
        inp = c.locator("input").first()
      }
      await inp.fill(`Guantes nitrilo QA-${ts}`)
    }

    // Submit Enviar Solicitud (footer)
    const btnSubmit = dialog.getByRole("button", { name: "Enviar Solicitud" })
    await expect(btnSubmit).toBeVisible({ timeout: 10_000 })
    await btnSubmit.scrollIntoViewIfNeeded().catch(() => {})
    await btnSubmit.click({ force: true, noWaitAfter: true })
    await page.waitForTimeout(800)
    if (await dialog.isVisible().catch(() => false)) {
      await btnSubmit.click({ force: true, noWaitAfter: true }).catch(() => {})
      await page.waitForTimeout(800)
    }
    await expect(dialog).toBeHidden({ timeout: 10_000 })

    // Afirmar fila nueva en la Bandeja (muestra las 10 más recientes)
    // La tabla muestra Tipo "Insumos y Materiales" y título no visible en lista, pero verificamos por Tipo y folios recientes
    // Mejor buscar row que contenga "Insumos" y luego abrir detalle para transición
    // Como el título no se muestra en la tabla de bandeja, verificamos que existe una fila con el Tipo y estado Nuevo y luego la abrimos
    const tbody = page.locator("table").first()
    await expect(tbody).toBeVisible({ timeout: 10_000 })
    // Buscar la fila más reciente: primera fila después del header que tenga Insumos
    // Click Ver de la primera fila que corresponde a insumos (la más reciente es nuestro ticket)
    // La bandeja muestra reversa 10 recientes, así que nuestro ticket está primero si filtramos por insumos
    // Usamos el botón Ver del primer row
    const btnVer = page.getByRole("button", { name: "Ver" }).first()
    await expect(btnVer).toBeVisible({ timeout: 10_000 })
    // Antes de abrir, asegurar que la fila contiene Insumos
    await expect(page.getByRole("cell", { name: "Insumos y Materiales" }).first()).toBeVisible({ timeout: 15_000 })

    // Abrir detalle — transición automática a En Revisión (store actualiza, detalle local queda en Nuevo)
    await btnVer.click({ force: true, noWaitAfter: true })
    const dialogDetalle = page.getByRole("dialog")
    await expect(dialogDetalle).toBeVisible({ timeout: 10_000 })
    // El título debe ser nuestro (detalle muestra el ticket recién creado)
    await expect(dialogDetalle.getByText(titulo).first()).toBeVisible({ timeout: 10_000 })
    // Cerrar detalle: la transición se refleja en la tabla, no en el detalle stale
    await page.keyboard.press("Escape")
    await expect(dialogDetalle).toBeHidden({ timeout: 10_000 })
    await page.waitForTimeout(500)

    // Verificar que en la tabla el estado ya es En Revisión
    await expect(page.getByText("En Revisión").first()).toBeVisible({ timeout: 15_000 })

    expect(errores, "Excepciones no capturadas en operaciones/solicitudes").toEqual([])
  })
})
