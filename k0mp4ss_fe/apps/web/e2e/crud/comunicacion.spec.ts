import { expect, test } from "@playwright/test"
import { guardarDialogo } from "../helpers/form-dialog"

test.use({ actionTimeout: 30_000 })

test.describe("CRUD — Comunidad/Comunicacion", () => {
  test("crear plantilla via Nueva plantilla → Guardar y verificar card", async ({ page }) => {
    const errores: string[] = []
    page.on("pageerror", (err) => errores.push(err.message))

    const ts = Date.now()
    const nombre = `QA Plantilla ${ts}`
    const asunto = `QA Asunto ${ts}`
    const cuerpo = `QA Cuerpo ${ts} — variables [Nombre_Usuario]`

    await page.goto("/comunidad/comunicacion")
    await expect(page.getByRole("heading", { name: /Comunicación/ })).toBeVisible({ timeout: 15_000 })

    // Asegurar vista Administración (default) — si está en otra vista, cambiar a Administración
    const vistaTrigger = page.getByRole("combobox").first()
    if (await vistaTrigger.isVisible().catch(() => false)) {
      const txt = (await vistaTrigger.textContent())?.trim() ?? ""
      if (!txt.includes("Administración")) {
        await vistaTrigger.click({ force: true, noWaitAfter: true })
        await page.waitForTimeout(300)
        const optAdmin = page.getByRole("option", { name: "Administración" })
        if (await optAdmin.isVisible().catch(() => false)) {
          await optAdmin.click({ force: true, noWaitAfter: true })
          await page.waitForTimeout(400)
        }
      }
    }

    // Tab Plantillas
    const tabPlantillas = page.getByRole("tab", { name: /Plantillas/ })
    await expect(tabPlantillas).toBeVisible({ timeout: 10_000 })
    await tabPlantillas.click({ force: true, noWaitAfter: true })
    await page.waitForTimeout(400)

    const btnNueva = page.getByRole("button", { name: "Nueva plantilla" })
    await expect(btnNueva).toBeVisible({ timeout: 10_000 })
    await btnNueva.click({ force: true, noWaitAfter: true })

    const dialog = page.getByRole("dialog")
    await expect(dialog.getByRole("heading", { name: /Nueva plantilla/ })).toBeVisible({ timeout: 10_000 })

    // Nombre — primer input del dialog
    const inputNombre = dialog.getByRole("textbox").first()
    // Si el primero no es nombre, localizar por label
    const labelNombre = dialog.getByText("Nombre", { exact: true }).first()
    let targetNombre = inputNombre
    if (await labelNombre.isVisible().catch(() => false)) {
      const cand = labelNombre.locator("..").locator("input").first()
      if (await cand.isVisible().catch(() => false)) targetNombre = cand
      else {
        const c = dialog.locator("div").filter({ has: labelNombre }).first()
        const inp = c.locator("input").first()
        if (await inp.isVisible().catch(() => false)) targetNombre = inp
      }
    }
    await expect(targetNombre).toBeVisible({ timeout: 10_000 })
    await targetNombre.fill(nombre)

    // Asunto — input con label Asunto
    const labelAsunto = dialog.getByText("Asunto", { exact: true }).first()
    let inputAsunto = dialog.locator('input').nth(1)
    if (await labelAsunto.isVisible().catch(() => false)) {
      const cand = labelAsunto.locator("..").locator("input").first()
      if (await cand.isVisible().catch(() => false)) inputAsunto = cand
      else {
        const c = dialog.locator("div").filter({ has: labelAsunto }).first()
        const inp = c.locator("input").first()
        if (await inp.isVisible().catch(() => false)) inputAsunto = inp
      }
    }
    // Fallback: buscar directamente textbox que no sea nombre
    if (!(await inputAsunto.isVisible().catch(() => false))) {
      inputAsunto = dialog.getByRole("textbox").nth(1)
    }
    await expect(inputAsunto).toBeVisible({ timeout: 10_000 })
    await inputAsunto.fill(asunto)

    // Cuerpo — textarea
    const textarea = dialog.locator("textarea").first()
    await expect(textarea).toBeVisible({ timeout: 10_000 })
    await textarea.fill(cuerpo)

    // Guardar — single-shot idempotente (helper form-dialog): UN envío; sin
    // `fila` (la card se afirma más abajo con getByText) no se reenvía a ciegas.
    const btnGuardar = dialog.getByRole("button", { name: "Guardar" })
    await expect(btnGuardar).toBeVisible({ timeout: 10_000 })
    await guardarDialogo(page, { boton: btnGuardar, dialogo: dialog, timeoutMs: 10_000 })

    // Afirmar card de plantilla visible — el nombre aparece como CardTitle
    await expect(page.getByText(nombre).first()).toBeVisible({ timeout: 15_000 })
    // También asunto visible en la card
    await expect(page.getByText(asunto).first()).toBeVisible({ timeout: 10_000 })

    expect(errores, "Excepciones no capturadas en comunidad/comunicacion").toEqual([])
  })
})
