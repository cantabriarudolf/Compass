import { expect, test } from "@playwright/test"
import { guardarDialogo } from "../helpers/form-dialog"

test.use({ actionTimeout: 30_000 })

test.describe("CRUD — Comunidad/Directiva", () => {
  test("registrar nueva acta borrador y verificar monitor de firmas y Aprobar como", async ({ page }) => {
    const errores: string[] = []
    page.on("pageerror", (err) => errores.push(err.message))

    const ts = Date.now()

    await page.goto("/comunidad/directiva")
    await expect(page.getByRole("heading", { name: /Gestión de Directiva/ })).toBeVisible({ timeout: 15_000 })

    // Cambiar vista a Administrador/Directiva
    const vistaTrigger = page.getByRole("combobox").first()
    await expect(vistaTrigger).toBeVisible({ timeout: 10_000 })
    await vistaTrigger.click({ force: true, noWaitAfter: true })
    await page.waitForTimeout(350)
    const optAdmin = page.getByRole("option", { name: "Administrador/Directiva" })
    if (await optAdmin.isVisible().catch(() => false)) {
      await optAdmin.click({ force: true, noWaitAfter: true })
      await page.waitForTimeout(500)
    } else {
      // fallback: seleccionar primera opción que contenga Administrador
      const opt = page.getByRole("option").filter({ hasText: "Administrador" }).first()
      if (await opt.isVisible().catch(() => false)) await opt.click({ force: true, noWaitAfter: true })
    }

    const btnRegistrar = page.getByRole("button", { name: "Registrar reunión / nueva acta" })
    await expect(btnRegistrar).toBeVisible({ timeout: 15_000 })
    await btnRegistrar.click({ force: true, noWaitAfter: true })

    const dialog = page.getByRole("dialog")
    await expect(dialog.getByRole("heading", { name: /Nueva acta de reunión/ })).toBeVisible({ timeout: 10_000 })

    // Lugar — input con placeholder Sede comunitaria y label Lugar
    const labelLugar = dialog.getByText("Lugar", { exact: true }).first()
    let inputLugar = dialog.getByPlaceholder("Sede comunitaria")
    if (!(await inputLugar.isVisible().catch(() => false)) && (await labelLugar.isVisible().catch(() => false))) {
      const cand = labelLugar.locator("..").locator("input").first()
      if (await cand.isVisible().catch(() => false)) inputLugar = cand
      else {
        const c = dialog.locator("div").filter({ has: labelLugar }).first()
        inputLugar = c.locator("input").first()
      }
    }
    await expect(inputLugar).toBeVisible({ timeout: 10_000 })
    await inputLugar.fill("Sede QA")

    // Fecha y Hora ya tienen defaults — asegurar que no estén vacíos, si no rellenar
    const inputFecha = dialog.locator('input[type="date"]').first()
    if (await inputFecha.isVisible().catch(() => false)) {
      const val = await inputFecha.inputValue().catch(() => "")
      if (!val) await inputFecha.fill(new Date().toISOString().slice(0, 10))
    }
    const inputHora = dialog.locator('input[type="time"]').first()
    if (await inputHora.isVisible().catch(() => false)) {
      const val = await inputHora.inputValue().catch(() => "")
      if (!val) await inputHora.fill("19:00")
    }

    // Minuta — textarea con placeholder Acuerdos... y label Minuta
    const labelMinuta = dialog.getByText("Minuta", { exact: true }).first()
    let textareaMinuta = dialog.locator("textarea").first()
    if (await labelMinuta.isVisible().catch(() => false)) {
      const c = dialog.locator("div").filter({ has: labelMinuta }).first()
      const ta = c.locator("textarea").first()
      if (await ta.isVisible().catch(() => false)) textareaMinuta = ta
    }
    await expect(textareaMinuta).toBeVisible({ timeout: 10_000 })
    await textareaMinuta.fill(`QA Minuta ${ts} — acuerdos de prueba con quórum pendiente`)

    // Guardar borrador — single-shot idempotente (helper form-dialog): UN
    // envío; sin `fila` (no hay llave única de unicidad para el borrador)
    // no se reenvía a ciegas si el diálogo tarda en cerrar.
    const btnGuardar = dialog.getByRole("button", { name: "Guardar borrador" })
    await expect(btnGuardar).toBeVisible({ timeout: 10_000 })
    await guardarDialogo(page, { boton: btnGuardar, dialogo: dialog })

    // Afirmar card de borrador visible — badge Borrador de Directiva + lugar Sede QA
    await expect(page.getByText("Borrador de Directiva").first()).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText("Sede QA").first()).toBeVisible({ timeout: 10_000 })

    // Monitor de firmas — texto "Monitor de firmas"
    await expect(page.getByText(/Monitor de firmas/).first()).toBeVisible({ timeout: 10_000 })

    // Botones Aprobar como {cargo} — al menos uno visible si hay directiva vigente
    const btnAprobar = page.getByRole("button", { name: /Aprobar como/ }).first()
    await expect(btnAprobar).toBeVisible({ timeout: 15_000 })

    expect(errores, "Excepciones no capturadas en comunidad/directiva").toEqual([])
  })
})
