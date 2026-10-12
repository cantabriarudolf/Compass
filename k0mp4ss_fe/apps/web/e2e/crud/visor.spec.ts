import { expect, test } from "@playwright/test"

test.use({ actionTimeout: 30_000 })

test.describe("CRUD — Comunidad/Visor", () => {
  test("crear aviso borrador, publicar y verificar en visor público", async ({ page }) => {
    const errores: string[] = []
    page.on("pageerror", (err) => errores.push(err.message))

    const ts = Date.now()
    const titulo = `QA Aviso ${ts}`

    await page.goto("/comunidad/visor")
    await expect(page.getByRole("heading", { name: /Visor de Mensajes/ })).toBeVisible({ timeout: 15_000 })

    // Asegurar tab Avisos activo (default)
    const tabAvisos = page.getByRole("tab", { name: "Avisos" })
    if (await tabAvisos.isVisible().catch(() => false)) {
      await tabAvisos.click({ force: true, noWaitAfter: true })
      await page.waitForTimeout(300)
    }

    const btnNuevo = page.getByRole("button", { name: "Nuevo aviso" })
    await expect(btnNuevo).toBeVisible({ timeout: 15_000 })
    await btnNuevo.click({ force: true, noWaitAfter: true })

    const dialog = page.getByRole("dialog")
    await expect(dialog.getByRole("heading", { name: /Nuevo aviso/ })).toBeVisible({ timeout: 10_000 })

    // Título *
    const labelTitulo = dialog.getByText("Título *", { exact: true }).first()
    let inputTitulo = dialog.getByPlaceholder("Ej: Corte de agua programado")
    if (!(await inputTitulo.isVisible().catch(() => false)) && (await labelTitulo.isVisible().catch(() => false))) {
      const cand = labelTitulo.locator("..").locator("input").first()
      if (await cand.isVisible().catch(() => false)) inputTitulo = cand
      else {
        const c = dialog.locator("div").filter({ has: labelTitulo }).first()
        inputTitulo = c.locator("input").first()
      }
    }
    // Fallback primer input si no se encontró
    if (!(await inputTitulo.isVisible().catch(() => false))) {
      inputTitulo = dialog.locator("input").first()
    }
    await expect(inputTitulo).toBeVisible({ timeout: 10_000 })
    await inputTitulo.fill(titulo)

    // Cuerpo * — textarea
    const labelCuerpo = dialog.getByText("Cuerpo *", { exact: true }).first()
    let textareaCuerpo = dialog.locator("textarea").first()
    if (await labelCuerpo.isVisible().catch(() => false)) {
      const c = dialog.locator("div").filter({ has: labelCuerpo }).first()
      const ta = c.locator("textarea").first()
      if (await ta.isVisible().catch(() => false)) textareaCuerpo = ta
    }
    await expect(textareaCuerpo).toBeVisible({ timeout: 10_000 })
    await textareaCuerpo.fill(`QA Cuerpo ${ts} — aviso de prueba para carrusel público`)

    // Tipología * — default info, pero asegurar selección info
    const labelTipologia = dialog.getByText("Tipología *", { exact: true }).first()
    if (await labelTipologia.isVisible().catch(() => false)) {
      let trigger = labelTipologia.locator("..").getByRole("combobox").first()
      if (!(await trigger.isVisible().catch(() => false))) {
        const c = dialog.locator("div").filter({ has: labelTipologia }).first()
        trigger = c.getByRole("combobox").first()
      }
      if (await trigger.isVisible().catch(() => false)) {
        const cur = (await trigger.textContent())?.trim() ?? ""
        if (!cur.includes("Información")) {
          await trigger.click({ force: true, noWaitAfter: true })
          await page.waitForTimeout(350)
          const optInfo = page.getByRole("option", { name: "Información" })
          if (await optInfo.isVisible().catch(() => false)) await optInfo.click({ force: true, noWaitAfter: true })
          else await page.getByRole("option").first().click({ force: true, noWaitAfter: true }).catch(() => {})
          await page.waitForTimeout(300)
        }
      }
    }

    // Duración en pantalla (segundos) * — input type number
    const labelDuracion = dialog.getByText(/Duración en pantalla/, { exact: false }).first()
    let inputDuracion = dialog.locator('input[type="number"]').first()
    // Si hay varios numbers, buscar el de duración
    if (await labelDuracion.isVisible().catch(() => false)) {
      const cand = labelDuracion.locator("..").locator("input").first()
      if (await cand.isVisible().catch(() => false)) inputDuracion = cand
      else {
        const c = dialog.locator("div").filter({ has: labelDuracion }).first()
        const inp = c.locator("input").first()
        if (await inp.isVisible().catch(() => false)) inputDuracion = inp
      }
    }
    await expect(inputDuracion).toBeVisible({ timeout: 10_000 })
    await inputDuracion.fill("8")

    // Guardar borrador — single-shot idempotente: un solo submit basta. Reenviar
    // mientras el diálogo sigue visible genera avisos DUPLICADOS en la BD.
    const btnGuardar = dialog.getByRole("button", { name: "Guardar borrador" })
    await expect(btnGuardar).toBeVisible({ timeout: 10_000 })
    await btnGuardar.scrollIntoViewIfNeeded().catch(() => {})
    try {
      await btnGuardar.click({ force: true, noWaitAfter: true, timeout: 5_000 })
    } catch {
      await dialog.locator("form").evaluate((f) => (f as HTMLFormElement).requestSubmit()).catch(() => {})
    }
    // 1) Esperar el cierre del diálogo (confirmación del guardado).
    await expect(dialog).toBeHidden({ timeout: 15_000 }).catch(() => {})
    // 2) Solo si SIGUE visible: reintentar UNA vez si aún no hay fila; nunca
    //    reenviar cuando la fila ya existe (evita el duplicado).
    if (await dialog.isVisible().catch(() => false)) {
      const filasExistentes = await page.getByRole("row").filter({ hasText: titulo }).count()
      if (filasExistentes === 0) {
        await dialog.locator("form").evaluate((f) => (f as HTMLFormElement).requestSubmit()).catch(() => {})
        await expect(dialog).toBeHidden({ timeout: 15_000 })
      }
    }

    // Fila en gestor de avisos con el título — exactamente una (sin duplicados)
    await expect(page.getByRole("row").filter({ hasText: titulo })).toHaveCount(1, {
      timeout: 15_000,
    })
    const row = page.getByRole("row").filter({ hasText: titulo }).first()
    await expect(row).toBeVisible({ timeout: 15_000 })
    // Estado borrador inicialmente
    await expect(row.getByText("borrador").first()).toBeVisible({ timeout: 10_000 })

    // Publicar
    const btnPublicar = row.getByRole("button", { name: "Publicar" })
    await expect(btnPublicar).toBeVisible({ timeout: 10_000 })
    await btnPublicar.click({ force: true, noWaitAfter: true })
    await page.waitForTimeout(800)

    // Afirmar estado publicado en la Table
    await expect(row.getByText("publicado").first()).toBeVisible({ timeout: 15_000 })

    // Ir al visor público y afirmar que el título aparece en el carrusel
    await page.goto("/visor-mensajes")
    // El visor es fullscreen con h1 gigante — esperar título
    await expect(page.getByText(titulo).first()).toBeVisible({ timeout: 20_000 })

    expect(errores, "Excepciones no capturadas en comunidad/visor").toEqual([])
  })
})
