import { expect, test } from "@playwright/test"
import { guardarDialogo } from "../helpers/form-dialog"

test.use({ actionTimeout: 30_000 })

test.describe("CRUD — Admin/Gestion", () => {
  test("toggle privacidad morosidad visible y flujo Cargar firma en ficha (Sheet)", async ({ page }) => {
    const errores: string[] = []
    page.on("pageerror", (err) => errores.push(err.message))

    await page.goto("/admin/gestion")
    await expect(page.getByRole("heading", { name: /Gestión Administrativa/ })).toBeVisible({ timeout: 15_000 })

    // La matriz de privacidad vive en la pestaña «Privacidad por unidad»
    // (la vista ya no tiene pestañas por rol).
    const tabPrivacidad = page.getByRole("tab", { name: /Privacidad por unidad/ })
    await expect(tabPrivacidad).toBeVisible({ timeout: 15_000 })
    await tabPrivacidad.click()

    // Primer switch con name accesible "Morosidad visible en <unidad>":
    // leer, flippear y afirmar el flip explícitamente. Sin guardas de
    // visibilidad: si la matriz no está, el test FALLA.
    const switchMorosidad = page.getByRole("switch", { name: /Morosidad visible en/ }).first()
    await expect(switchMorosidad).toBeVisible({ timeout: 15_000 })
    const checkedBefore = (await switchMorosidad.getAttribute("aria-checked")) === "true"
    const esperadoTrasClick = checkedBefore ? "false" : "true"
    await switchMorosidad.click()
    await expect(
      switchMorosidad,
      "El switch de morosidad debe flippear aria-checked tras click",
    ).toHaveAttribute("aria-checked", esperadoTrasClick, { timeout: 10_000 })
    const checkedAfter = esperadoTrasClick === "true"

    // Persistencia: recargar, volver a la pestaña y re-verificar el valor.
    await page.reload()
    await expect(page.getByRole("heading", { name: /Gestión Administrativa/ })).toBeVisible({ timeout: 15_000 })
    await tabPrivacidad.click()
    const switchRecheck = page.getByRole("switch", { name: /Morosidad visible en/ }).first()
    await expect(switchRecheck).toBeVisible({ timeout: 15_000 })
    const ariaRecheck = await switchRecheck.getAttribute("aria-checked")
    expect(ariaRecheck === "true").toBe(checkedAfter)

    // Firma digitalizada: vive ahora en la ficha (Sheet, panel lateral) abierta
    // desde el Directorio, no en un Dialog de la pestaña Directiva.
    await page.getByRole("tab", { name: /Directorio/ }).click()
    // El chip de rol filtra el directorio; el rol "directiva" se deriva de
    // datosGobernanza != null, así que TODAS las filas filtradas tienen los
    // datos de gobernanza necesarios para la firma.
    await page.getByRole("button", { name: /Directiva/ }).click()
    await page.getByRole("button", { name: "Ver ficha" }).first().click()

    const ficha = page.getByRole("dialog")
    await expect(ficha.getByText("Ficha de persona")).toBeVisible({ timeout: 10_000 })

    const btnFirma = ficha.getByRole("button", { name: /Cargar firma|Reemplazar firma/ })
    await expect(btnFirma).toBeVisible({ timeout: 10_000 })
    await btnFirma.click()

    const inputUrl = ficha.getByPlaceholder("https://…/firma.png")
    await expect(inputUrl).toBeVisible({ timeout: 10_000 })
    await inputUrl.fill("https://placeholder.supabase.co/qa-firma.png")

    // La previsualización (img con alt "Firma de <nombre>") confirma la URL.
    await expect(ficha.getByRole("img", { name: /Firma de/ })).toBeVisible({ timeout: 10_000 })

    const btnGuardar = ficha.getByRole("button", { name: "Guardar" })
    await expect(btnGuardar).toBeVisible({ timeout: 10_000 })
    // Single-shot idempotente (helper form-dialog): UN envío; sin `fila` (es la
    // URL de una firma ya existente) no se reenvía a ciegas. El Sheet se monta
    // sobre primitivos Radix Dialog, así que su contenido mantiene role="dialog"
    // y el contrato del helper (clic único + esperar el cierre real) aplica.
    await guardarDialogo(page, { boton: btnGuardar, dialogo: ficha, timeoutMs: 10_000 })

    // Reabrir la ficha: la firma persistida se muestra como imagen y el botón
    // ahora ofrece reemplazarla.
    await page.getByRole("button", { name: "Ver ficha" }).first().click()
    const fichaReabierta = page.getByRole("dialog")
    await expect(fichaReabierta.getByText("Ficha de persona")).toBeVisible({ timeout: 10_000 })
    await expect(
      fichaReabierta.getByRole("button", { name: /Reemplazar firma/ }),
      "Tras guardar, la ficha debe ofrecer Reemplazar firma (firmaDigital persistida)",
    ).toBeVisible({ timeout: 10_000 })
    await expect(fichaReabierta.getByRole("img", { name: /Firma de/ })).toBeVisible({ timeout: 10_000 })

    expect(errores, "Excepciones no capturadas en admin/gestion").toEqual([])
  })
})
