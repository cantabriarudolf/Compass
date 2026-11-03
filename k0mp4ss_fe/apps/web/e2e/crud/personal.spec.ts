import { expect, test } from "@playwright/test"
import { crearPersonaTEST, limpiarPersonaTEST } from "../helpers/datos-test"

test.use({ actionTimeout: 30_000 })

test.describe("CRUD — Personas/Personal", () => {
  test("crear/editar ficha integral con FKs y verificar cargo visible en la card", async ({ page, request }) => {
    const errores: string[] = []
    page.on("pageerror", (err) => errores.push(err.message))

    const ts = Date.now()
    const cargoUnico = `QA-Cargo-${ts}`
    // `aTituloCaso` (lib/normalizacion.ts) baja el cargo a «Qa-cargo-…» antes de
    // persistirlo, así que el texto que se espera en la card es el normalizado.
    const cargoNormalizado = `Qa-cargo-${ts}`
    const medicamentosUnicos = `Ibuprofeno ${ts} mg`
    const fechaIngreso = new Date().toISOString().slice(0, 10)

    // El spec es dueño del dato que edita: crea su propia persona con marcador
    // TEST- (id `test-personal-p-<ts>`, que `e2e:limpiar` reclama con su regla
    // `personas.id LIKE 'test-%'`) y la borra al final.
    //
    // Antes editaba la PRIMERA card del listado (orden createdAt desc), que es una
    // fila del seed (`p-trab-aseo`). El cargo QA- y el consentimiento de datos
    // sensibles quedaban escritos en una fila que la purga protege por allowlist
    // dura, así que eran permanentes: a partir de la segunda corrida la ficha
    // abría con consentimiento YA otorgado y la rama «arranca sin tildar» se
    // volvía inalcanzable. Con persona propia, cada corrida parte de cero.
    //
    // Sin `datosLaborales`: la card ofrece «Crear ficha», así que el caso cubre el
    // alta completa de la ficha integral (FKs desde vacío) y no sólo la edición.
    const persona = await crearPersonaTEST(request, "personal", ts, {
      roles: ["personal"],
      nombreCompleto: `TEST Personal E2E ${ts}`,
      nombres: "TEST Personal",
      apellidos: `E2E ${String(ts).slice(-6)}`,
      email: `personal.e2e.${ts}@test.cl`,
    })

    try {
      await page.goto("/personas/personal")

      // Card de la persona recién creada: las cards son hijos directos del grid de
      // contenido y el nombre es único por corrida, así que el filtro resuelve
      // exactamente una (el listado ordena por createdAt desc: primera página).
      // No se ancla al label del botón porque cambia con el guardado
      // («Crear ficha» → «Editar»).
      const card = page
        .locator('div[data-slot="card-content"] > div')
        .filter({ hasText: persona.nombreCompleto })
      await expect(card).toHaveCount(1, { timeout: 30_000 })
      const btnCrearFicha = card.getByRole("button", { name: "Crear ficha" })
      await expect(btnCrearFicha).toBeVisible({ timeout: 30_000 })
      await btnCrearFicha.click({ force: true, noWaitAfter: true })

      // Dialog "Ficha Integral — {nombre}"
      const dialog = page.getByRole("dialog")
      await expect(dialog.getByRole("heading", { name: /Ficha Integral —/ })).toBeVisible({ timeout: 15_000 })
      await expect(dialog).toContainText(persona.nombreCompleto)

      // F18: el consentimiento expreso es lo que habilita la ficha médica. La ficha
      // es NUEVA y propia, así que el estado de partida es determinista: sin tildar.
      const consentimiento = dialog.locator("#f-consentimiento-sensible")
      const medicamentos = dialog.getByRole("textbox", { name: "Medicamentos" })
      await expect(consentimiento).toHaveAttribute("data-state", "unchecked", { timeout: 10_000 })
      await expect(medicamentos).toBeDisabled()

      // Otorgar → los campos sensibles se habilitan.
      await consentimiento.click()
      await expect(consentimiento).toHaveAttribute("data-state", "checked", { timeout: 10_000 })
      await expect(medicamentos).toBeEnabled()

      // Revocar → se vuelven a deshabilitar (el servidor borra los datos al guardar).
      await consentimiento.click()
      await expect(consentimiento).toHaveAttribute("data-state", "unchecked", { timeout: 10_000 })
      await expect(medicamentos).toBeDisabled()

      // Se deja otorgado para guardar la ficha integral (con consentimiento las FKs
      // previsionales y bancarias son obligatorias).
      await consentimiento.click()
      await expect(consentimiento).toHaveAttribute("data-state", "checked", { timeout: 10_000 })
      await expect(medicamentos).toBeEnabled()

      // Llenar "Cargo *", "Fecha ingreso *" y un dato sensible (prueba el efecto del consentimiento).
      const inputCargo = dialog.getByLabel("Cargo *")
      await expect(inputCargo).toBeVisible({ timeout: 10_000 })
      await inputCargo.fill(cargoUnico)

      const inputFecha = dialog.getByLabel("Fecha ingreso *")
      await expect(inputFecha).toBeVisible({ timeout: 10_000 })
      await inputFecha.fill(fechaIngreso)

      await medicamentos.fill(medicamentosUnicos)

      // Helpers para selects con FKs obligatorias (maestros seed)
      // getByLabel no aplica a Selects → localizar vía Label vecino + combobox hermano
      async function pickSelectByLabel(labelText: string) {
        const label = dialog.getByText(labelText, { exact: true }).first()
        // La combobox está en el mismo contenedor padre que el Label
        let trigger = label.locator("..").getByRole("combobox").first()
        let visible = await trigger.isVisible().catch(() => false)
        if (!visible) {
          // Fallback: buscar el div que contiene el label como hijo directo
          const container = dialog.locator("div").filter({ has: label }).first()
          trigger = container.getByRole("combobox").first()
          visible = await trigger.isVisible().catch(() => false)
          if (!visible) return false
        }
        await trigger.click({ force: true, noWaitAfter: true })
        await page.waitForTimeout(350)
        const options = page.getByRole("option")
        const count = await options.count()
        if (count === 0) {
          await page.keyboard.press("Escape")
          return false
        }
        // Elegir primera opción real (saltar "Sin especificar" / "Sin cargas" / placeholder)
        for (let i = 0; i < count; i++) {
          const txt = (await options.nth(i).textContent())?.trim() ?? ""
          if (!txt) continue
          if (txt === "Sin especificar" || txt === "Sin cargas" || txt === "Seleccionar") continue
          await options.nth(i).click({ force: true, noWaitAfter: true })
          await page.waitForTimeout(200)
          return true
        }
        await options.first().click({ force: true, noWaitAfter: true })
        await page.waitForTimeout(200)
        return true
      }

      // Seleccionar AFP / salud / mutualidad / banco (FKs obligatorias; usa maestros seed)
      // AFP es obligatorio, salud (Fonasa/Isapre) obligatorio, banco obligatorio; mutualidad opcional pero la intentamos
      await pickSelectByLabel("AFP")
      await pickSelectByLabel("Fonasa / Isapre")
      // Mutualidad / Caja es opcional — intentar sin fallar si no hay
      await pickSelectByLabel("Mutualidad / Caja").catch(() => false)
      await pickSelectByLabel("Banco (maestro)")

      // Submit "Guardar ficha" — botón dentro de DialogFooter, puede estar fuera de viewport (ScrollArea)
      // Nota: guardarFicha en el código NO cierra el dialog (mantiene editandoId) — solo muestra okMsg y persiste.
      // Por eso tras guardar esperamos el mensaje y cerramos manualmente con Cancelar.
      const btnGuardar = dialog.getByRole("button", { name: "Guardar ficha" })
      await expect(btnGuardar).toBeVisible({ timeout: 10_000 })
      // Asegurar que el botón esté en viewport dentro del dialog scroll
      await btnGuardar.scrollIntoViewIfNeeded().catch(() => {})
      await btnGuardar.click({ force: true, noWaitAfter: true })
      await page.waitForTimeout(800)
      // Si sigue abierto, intentar de nuevo (quirúrgico)
      if (await dialog.isVisible().catch(() => false)) {
        await btnGuardar.scrollIntoViewIfNeeded().catch(() => {})
        await btnGuardar.click({ force: true, noWaitAfter: true }).catch(() => {})
        await page.waitForTimeout(800)
      }

      // Afirmar que la ficha se guardó: aparece okMsg "Ficha de ... guardada." (fuera del dialog) o el store se actualizó
      // El dialog permanece abierto según implementación, así que verificamos el mensaje
      await expect(page.getByText(/Ficha de .* guardada/)).toBeVisible({ timeout: 10_000 })

      // Cerrar el dialog manualmente para ver la card actualizada
      const btnCancelar = dialog.getByRole("button", { name: "Cancelar" })
      if (await btnCancelar.isVisible().catch(() => false)) {
        await btnCancelar.click({ force: true, noWaitAfter: true })
      } else {
        await page.keyboard.press("Escape")
      }
      await expect(dialog).toBeHidden({ timeout: 10_000 })

      // Afirmar que la card de ESTA persona muestra el cargo y la fecha, y que las
      // FKs quedaron resueltas contra los maestros (antes de guardar la card decía
      // «Sin ficha laboral» y «AFP: —»).
      await expect(card.getByRole("button", { name: "Editar" })).toBeVisible({ timeout: 15_000 })
      await expect(card).toContainText(cargoNormalizado, { timeout: 15_000 })
      await expect(card).toContainText(`desde ${fechaIngreso}`)
      await expect(card).not.toContainText("AFP: —")

      // El consentimiento no es sólo UI: quedó persistido y con él los datos
      // sensibles y las FKs previsionales/bancarias.
      const respuesta = await request.get(`/api/personas/${persona.id}`)
      expect(respuesta.ok(), "GET /api/personas/[id] debe devolver la ficha guardada").toBe(true)
      const guardada = (await respuesta.json()) as {
        datosLaborales?: {
          cargo?: string
          afpId?: string
          saludId?: string
          bancoId?: string
          consentimientoDatosSensibles?: { otorgado?: boolean }
          fichaMedica?: { medicamentos?: string }
        }
      }
      expect(guardada.datosLaborales?.cargo).toBe(cargoNormalizado)
      expect(guardada.datosLaborales?.consentimientoDatosSensibles?.otorgado).toBe(true)
      expect(guardada.datosLaborales?.fichaMedica?.medicamentos).toContain(String(ts))
      expect(guardada.datosLaborales?.afpId).toBeTruthy()
      expect(guardada.datosLaborales?.saludId).toBeTruthy()
      expect(guardada.datosLaborales?.bancoId).toBeTruthy()

      expect(errores, "Excepciones no capturadas en personas/personal").toEqual([])
    } finally {
      // La fila TEST no sobrevive a la corrida: el listado vuelve al estado del seed
      // y ninguna corrida posterior hereda consentimiento ni cargo de ésta.
      await limpiarPersonaTEST(request, persona.id)
    }
  })
})
