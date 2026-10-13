import { expect, test } from "@playwright/test"
import { guardarDialogo } from "../helpers/form-dialog"

test.use({ actionTimeout: 30_000 })

test.describe("CRUD — Admin/Gestion", () => {
  test("toggle privacidad morosidad visible y flujo opcional Cargar firma", async ({ page }) => {
    const errores: string[] = []
    page.on("pageerror", (err) => errores.push(err.message))

    await page.goto("/admin/gestion")
    await expect(page.getByRole("heading", { name: /Gestión Administrativa/ })).toBeVisible({ timeout: 15_000 })

    // Asegurar tab Propietarios activo (default)
    const tabPropietarios = page.getByRole("tab", { name: /Propietarios/ }).first()
    if (await tabPropietarios.isVisible().catch(() => false)) {
      await tabPropietarios.click({ force: true, noWaitAfter: true })
      await page.waitForTimeout(300)
    }

    // Localizar primer switch de privacidad con aria-label "Morosidad visible en"
    const switchMorosidad = page.getByRole("switch", { name: /Morosidad visible en/ }).first()
    await expect(switchMorosidad).toBeVisible({ timeout: 15_000 })

    const ariaBefore = await switchMorosidad.getAttribute("aria-checked")
    const checkedBefore = ariaBefore === "true"

    await switchMorosidad.click({ force: true, noWaitAfter: true })
    await page.waitForTimeout(600)

    const ariaAfter = await switchMorosidad.getAttribute("aria-checked")
    const checkedAfter = ariaAfter === "true"

    expect(checkedAfter, "El switch de morosidad debe haber flippeado aria-checked tras click").not.toBe(checkedBefore)

    // Verificar persistencia recargando
    await page.reload()
    await expect(page.getByRole("heading", { name: /Gestión Administrativa/ })).toBeVisible({ timeout: 15_000 })
    const switchRecheck = page.getByRole("switch", { name: /Morosidad visible en/ }).first()
    await expect(switchRecheck).toBeVisible({ timeout: 15_000 })
    const ariaRecheck = await switchRecheck.getAttribute("aria-checked")
    expect(ariaRecheck === "true").toBe(checkedAfter)

    // Opcional: Cargar firma — ir a tab Directiva
    const tabDirectiva = page.getByRole("tab", { name: /Directiva/ }).first()
    if (await tabDirectiva.isVisible().catch(() => false)) {
      await tabDirectiva.click({ force: true, noWaitAfter: true })
      await page.waitForTimeout(400)

      const btnFirma = page.getByRole("button", { name: /Cargar firma|Reemplazar firma/ }).first()
      if (await btnFirma.isVisible().catch(() => false)) {
        await btnFirma.click({ force: true, noWaitAfter: true })
        const dialog = page.getByRole("dialog")
        await expect(dialog.getByRole("heading", { name: /Firma digitalizada/ })).toBeVisible({ timeout: 10_000 })

        const inputUrl = dialog.getByPlaceholder("https://…/firma.png")
        let targetInput = inputUrl
        if (!(await inputUrl.isVisible().catch(() => false))) {
          targetInput = dialog.getByRole("textbox").first()
          // fallback: label URL de la imagen de firma
          const labelUrl = dialog.getByText(/URL de la imagen de firma/).first()
          if (await labelUrl.isVisible().catch(() => false)) {
            const cand = labelUrl.locator("..").locator("input").first()
            if (await cand.isVisible().catch(() => false)) targetInput = cand
          }
        }
        await expect(targetInput).toBeVisible({ timeout: 10_000 })
        await targetInput.fill("https://placeholder.supabase.co/qa-firma.png")

        const btnGuardar = dialog.getByRole("button", { name: "Guardar" })
        await expect(btnGuardar).toBeVisible({ timeout: 10_000 })
        // Single-shot idempotente (helper form-dialog): UN envío; sin `fila`
        // (es la URL de una firma, ya existente) no se reenvía a ciegas.
        await guardarDialogo(page, { boton: btnGuardar, dialogo: dialog, timeoutMs: 10_000 })

        // Afirmar que la URL aparece en la card de directiva
        await expect(page.getByText("https://placeholder.supabase.co/qa-firma.png").first()).toBeVisible({ timeout: 10_000 })
      }
    }

    expect(errores, "Excepciones no capturadas en admin/gestion").toEqual([])
  })
})
