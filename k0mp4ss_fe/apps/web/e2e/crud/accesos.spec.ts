// Puerta única de accesos (commit 931753c, "una sola puerta para registrar accesos").
//
// La pantalla ya no son tres paneles apilados con pestañas: arriba hay un selector
// («¿A qué viene?») que abre SOLO el panel de la respuesta elegida, y abajo la lista
// consolidada del día (visitas + encomiendas + trabajos), de solo lectura. Este spec
// afirma esa estructura y, sobre todo, que la lista no ofrece ninguna acción: registrar
// y corregir vive en la puerta de arriba.
//
// Además absorbe lo que probaban los specs retirados `e2e/crud/bitacora.spec.ts` y
// `e2e/crud/paqueteria.spec.ts`: sus journeys de escritura se hacen ahora por la misma
// puerta (visita pre-agendada → «Marcar Ingresada»; recepción de encomienda → «Recibida»)
// y las dos rutas viejas quedan solo como redirect del servidor a esta pantalla.
import { expect, test, type Page } from "@playwright/test"

test.use({ actionTimeout: 30_000 })

/** Tabla del panel de visitas: la única del día con columna «Jornada» (la consolidada tiene otras). */
function tablaVisitas(page: Page) {
  return page
    .locator("table")
    .filter({ has: page.getByRole("columnheader", { name: "Jornada" }) })
}

/** Tabla del panel de encomiendas: la única con columna «Courier». */
function tablaEncomiendas(page: Page) {
  return page
    .locator("table")
    .filter({ has: page.getByRole("columnheader", { name: "Courier" }) })
}

/** Lista consolidada del día (solo lectura): la única con la columna «Quién llega». */
function listaConsolidada(page: Page) {
  return page
    .locator("table")
    .filter({ has: page.getByRole("columnheader", { name: "Quién llega" }) })
}

test.describe("CRUD — Operaciones/Accesos", () => {
  test("vista read-only: día, puerta única y lista consolidada sin acciones ni pageerror", async ({ page }) => {
    const errores: string[] = []
    page.on("pageerror", (err) => errores.push(err.message))

    await page.goto("/operaciones/accesos")
    await expect(page.getByRole("heading", { name: /Accesos y Visitas/ })).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText("Control de visitas y contratistas")).toBeVisible({ timeout: 10_000 })

    // Selector de día: gobierna tanto la puerta de registro como la lista del día.
    const dia = page.getByLabel("Día consultado")
    await expect(dia).toBeVisible({ timeout: 10_000 })
    await expect(dia).toHaveAttribute("type", "date")

    // Puerta única: el conserje elige qué viene a hacer la persona, no una pestaña.
    // (CardTitle es un div, no un heading: se afirma por el texto de la tarjeta.)
    await expect(page.getByText("¿A qué viene?").first()).toBeVisible({ timeout: 10_000 })
    await expect(page.getByRole("button", { name: /Viene a ver a alguien/ })).toBeVisible()
    await expect(page.getByRole("button", { name: /Trae o retira algo/ })).toBeVisible()
    await expect(page.getByRole("button", { name: /Viene a trabajar/ })).toBeVisible()

    // Ningún formulario arranca abierto: el panel aparece recién al elegir la respuesta.
    await expect(page.getByLabel("Nombre *")).toHaveCount(0)
    await expect(page.getByLabel("DNI *")).toHaveCount(0)
    await expect(page.getByText("Registro de visita")).toHaveCount(0)
    await expect(page.getByRole("button", { name: "Registrar visita" })).toHaveCount(0)

    // Lista consolidada del día (visitas + encomiendas + trabajos).
    await expect(page.getByText(/Accesos del día \(/).first()).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText(/Visitas, encomiendas y trabajos en una sola lista/).first()).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText(/Es de solo lectura/).first()).toBeVisible({ timeout: 10_000 })
    await expect(page.getByRole("combobox", { name: "Filtrar por tipo" })).toBeVisible({ timeout: 10_000 })
    // La lista del día o muestra la tabla consolidada, o su estado vacío explícito:
    // en ningún caso inventa filas ni esconde el hecho de que el día está sin accesos.
    await expect(
      page
        .getByRole("columnheader", { name: "Quién llega" })
        .or(page.getByText("No hay accesos registrados para este día."))
    ).toBeVisible({ timeout: 10_000 })

    // Garantía read-only: la lista no expone crear, corregir ni transicionar estados.
    await expect(
      page.getByRole("button", { name: /Registrar visita|Agendar ingreso|Marcar Ingresada|Retirar|Eliminar/ })
    ).toHaveCount(0)
    // Ni siquiera dentro de la tabla: sin botones por fila (la tabla puede no existir
    // si el día no tiene accesos; en ese caso no hay nada que afirmar y el conteo es 0).
    await expect(page.locator("table").getByRole("button")).toHaveCount(0)

    expect(errores, "Excepciones no capturadas en operaciones/accesos").toEqual([])
  })

  test("la puerta única abre el panel de la respuesta elegida y vuelve al selector", async ({ page }) => {
    const errores: string[] = []
    page.on("pageerror", (err) => errores.push(err.message))

    await page.goto("/operaciones/accesos")
    await expect(page.getByText("¿A qué viene?").first()).toBeVisible({ timeout: 15_000 })

    // «Viene a ver a alguien» → panel de visitas completo, con su tabla del día.
    await page.getByRole("button", { name: /Viene a ver a alguien/ }).click()
    await expect(page.getByText("Registro de visita").first()).toBeVisible({ timeout: 10_000 })
    await expect(page.getByLabel("Nombre *")).toBeVisible({ timeout: 10_000 })
    await expect(page.getByLabel("DNI *")).toBeVisible({ timeout: 10_000 })
    await expect(page.getByLabel("Unidad destino")).toBeVisible({ timeout: 10_000 })
    await expect(page.getByRole("button", { name: "Registrar visita" })).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText(/Control del día seleccionado/).first()).toBeVisible({ timeout: 10_000 })

    // «Cambiar» cierra el panel y devuelve al selector: una sola puerta, sin pestañas.
    await page.getByRole("button", { name: "Cambiar: no es una visita" }).click()
    await expect(page.getByText("¿A qué viene?").first()).toBeVisible({ timeout: 10_000 })
    await expect(page.getByLabel("Nombre *")).toHaveCount(0)
    await expect(page.getByRole("button", { name: "Registrar visita" })).toHaveCount(0)

    // El trabajo pregunta primero el alcance (edificio o departamento) antes del panel.
    await page.getByRole("button", { name: /Viene a trabajar/ }).click()
    await expect(
      page.getByText(/¿El trabajo es para el edificio o para un departamento\?/).first()
    ).toBeVisible({ timeout: 10_000 })
    await expect(page.getByRole("button", { name: /Para el edificio/ })).toBeVisible()
    await expect(page.getByRole("button", { name: /Para un departamento/ })).toBeVisible()

    expect(errores, "Excepciones no capturadas en operaciones/accesos").toEqual([])
  })

  // Journey portado de `e2e/crud/bitacora.spec.ts` (pestaña Visitas de la ruta retirada):
  // registrar una visita anunciada por la puerta deja la fila en el panel y la sella al
  // llegar. Lo que se pierde al retirar la ruta es el pase de estado «Agendada» →
  // «Ingresada», así que se conserva acá, ejercitado por el mismo panel que antes vivía
  // en la pestaña.
  test("visita pre-agendada por la puerta: fila en el panel del día y sello de ingreso", async ({ page }) => {
    const errores: string[] = []
    page.on("pageerror", (err) => errores.push(err.message))

    const ts = Date.now()
    const nombreVisita = `QA Visita ${ts}`

    await page.goto("/operaciones/accesos")
    await expect(page.getByText("¿A qué viene?").first()).toBeVisible({ timeout: 15_000 })

    // Paso 1 de la puerta: una visita a un residente. Recién acá existen los campos.
    await page.getByRole("button", { name: /Viene a ver a alguien/ }).click()

    const inputNombre = page.getByLabel("Nombre *")
    await expect(inputNombre).toBeVisible({ timeout: 10_000 })
    await inputNombre.fill(nombreVisita)

    await expect(page.getByLabel("DNI *")).toBeVisible({ timeout: 10_000 })
    // RUT válido con DV 0 para 16444555.
    await page.getByLabel("DNI *").fill("16.444.555-0")

    // Unidad destino — combobox buscable (F6): el término viaja a GET /api/unidades?q= y las
    // opciones salen de toda la comunidad, no de las primeras 100 montadas.
    const unidad = page.getByLabel("Unidad destino")
    await expect(unidad).toBeVisible({ timeout: 10_000 })
    await unidad.fill("101")
    const resultadosUnidad = page.getByRole("listbox", { name: /Resultados de Unidad destino/ })
    const primeraUnidad = resultadosUnidad.getByRole("option").first()
    await expect(primeraUnidad).toBeVisible({ timeout: 15_000 })
    // Hay cinco «Depto 101» (torres A–E en el seed): el rol SII es lo que las desambigua.
    await expect(primeraUnidad).toContainText(/Depto 101/)
    await expect(primeraUnidad).toContainText(/123-/)
    const etiquetaUnidad = ((await primeraUnidad.textContent()) ?? "").trim()
    await primeraUnidad.click()
    // La selección queda a la vista en el control: nunca se muestra el id crudo.
    await expect(page.getByText(etiquetaUnidad, { exact: true }).first()).toBeVisible({ timeout: 10_000 })

    // Pre-agendada ON — la visita nace «Agendada» (espera el sello de ingreso).
    const switchPre = page.getByRole("switch").first()
    if (!(await switchPre.isChecked().catch(() => false))) {
      await switchPre.click({ force: true, noWaitAfter: true })
    }
    await expect(switchPre).toBeChecked({ timeout: 5_000 })

    // El campo normaliza a Título Caso al salir (onBlur): la fila se busca por el texto
    // que quedó realmente en el input, no por el literal escrito.
    const nombreGuardado = await inputNombre.inputValue()

    await page.getByRole("button", { name: "Registrar visita" }).click({ force: true, noWaitAfter: true })

    // Fila en la tabla del panel de la puerta: nombre, DNI, etiqueta de unidad (no su id)
    // y estado «Agendada».
    const filaVisita = tablaVisitas(page).getByRole("row").filter({ hasText: nombreGuardado })
    await expect(filaVisita).toBeVisible({ timeout: 15_000 })
    await expect(filaVisita.getByText("16.444.555-0")).toBeVisible({ timeout: 10_000 })
    await expect(filaVisita.getByText(etiquetaUnidad, { exact: true })).toBeVisible({ timeout: 10_000 })
    await expect(filaVisita.getByText("Agendada")).toBeVisible({ timeout: 10_000 })

    // Sello de ingreso: el botón existe solo mientras está agendada y la transiciona.
    const btnMarcar = filaVisita.getByRole("button", { name: "Marcar Ingresada" })
    await expect(btnMarcar).toBeVisible({ timeout: 10_000 })
    await btnMarcar.click({ force: true, noWaitAfter: true })
    await expect(
      tablaVisitas(page).getByRole("row").filter({ hasText: nombreGuardado }).getByText(/Ingresada/)
    ).toBeVisible({ timeout: 15_000 })

    // La lista consolidada del día repite el mismo registro: una puerta, dos lecturas.
    const filaConsolidada = listaConsolidada(page)
      .getByRole("row")
      .filter({ hasText: nombreGuardado })
      .first()
    await expect(filaConsolidada).toBeVisible({ timeout: 15_000 })
    await expect(filaConsolidada.getByText("Visita", { exact: true })).toBeVisible({ timeout: 10_000 })
    await expect(filaConsolidada.getByText("Ingresada")).toBeVisible({ timeout: 10_000 })

    expect(errores, "Excepciones no capturadas en operaciones/accesos").toEqual([])
  })

  // Journey portado de `e2e/crud/paqueteria.spec.ts` (ruta retirada): la recepción de una
  // encomienda es la respuesta «Trae o retira algo» de la misma puerta, con el mismo panel
  // y los mismos labels. Es el único lugar de la suite que ejercita el alta de encomiendas
  // por UI, así que se conserva acá antes de retirar la página dedicada.
  test("encomienda recibida por la puerta: fila en el panel del día y en la lista consolidada", async ({ page }) => {
    const errores: string[] = []
    page.on("pageerror", (err) => errores.push(err.message))

    const ts = Date.now()
    const descPaquete = `TEST-${ts}`

    await page.goto("/operaciones/accesos")
    await expect(page.getByText("¿A qué viene?").first()).toBeVisible({ timeout: 15_000 })

    // Paso 1 de la puerta: la persona trae o retira algo → panel de encomiendas.
    await page.getByRole("button", { name: /Trae o retira algo/ }).click()

    // Panel Encomiendas: labels reales del componente.
    await expect(page.getByText("Recepción de encomienda / delivery").first()).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText("Courier / App *").first()).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText("Destinatario").first()).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText("Unidad", { exact: true }).first()).toBeVisible({ timeout: 10_000 })
    await expect(page.getByLabel("Descripción del paquete").first()).toBeVisible({ timeout: 10_000 })
    await expect(page.getByRole("button", { name: "Registrar recepción" }).first()).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText(/Encomiendas del día/).first()).toBeVisible({ timeout: 10_000 })
    await expect(page.getByLabel("Día consultado")).toBeVisible({ timeout: 10_000 })

    // --- Flujo real: recibir una encomienda TEST-* nueva ---
    // Seleccionar Courier / App *
    const labelCourier = page.getByText("Courier / App *", { exact: true }).first()
    await expect(labelCourier).toBeVisible({ timeout: 10_000 })
    let triggerCourier = labelCourier.locator("..").getByRole("combobox").first()
    const visC = await triggerCourier.isVisible().catch(() => false)
    if (!visC) {
      const c = page.locator("div").filter({ has: labelCourier }).first()
      triggerCourier = c.getByRole("combobox").first()
    }
    await expect(triggerCourier).toBeVisible({ timeout: 10_000 })
    await triggerCourier.click({ force: true, noWaitAfter: true })
    await page.waitForTimeout(350)
    const optsCourier = page.getByRole("option")
    await expect(optsCourier.first()).toBeVisible({ timeout: 10_000 })
    let pickedCourier = false
    const cntC = await optsCourier.count()
    for (let i = 0; i < cntC; i++) {
      const txt = (await optsCourier.nth(i).textContent())?.trim() ?? ""
      if (!txt || txt === "Seleccionar") continue
      await optsCourier.nth(i).click({ force: true, noWaitAfter: true })
      pickedCourier = true
      break
    }
    if (!pickedCourier) await optsCourier.first().click({ force: true, noWaitAfter: true })
    await page.waitForTimeout(300)

    // Seleccionar Destinatario (preferido) — si no hay, usar Unidad
    let pickedDestino = false
    const labelDest = page.getByText("Destinatario", { exact: true }).first()
    let triggerDest = labelDest.locator("..").getByRole("combobox").first()
    const visD = await triggerDest.isVisible().catch(() => false)
    if (!visD) {
      const c = page.locator("div").filter({ has: labelDest }).first()
      triggerDest = c.getByRole("combobox").first()
    }
    if (await triggerDest.isVisible().catch(() => false)) {
      await triggerDest.click({ force: true, noWaitAfter: true })
      await page.waitForTimeout(350)
      const optsDest = page.getByRole("option")
      const cntD = await optsDest.count()
      if (cntD > 0) {
        await expect(optsDest.first()).toBeVisible({ timeout: 10_000 })
        for (let i = 0; i < cntD; i++) {
          const txt = (await optsDest.nth(i).textContent())?.trim() ?? ""
          if (!txt || txt === "Sin destinatario") continue
          await optsDest.nth(i).click({ force: true, noWaitAfter: true })
          pickedDestino = true
          break
        }
        if (!pickedDestino) {
          // cerrar popover sin elegir (ESC) e intentar Unidad
          await page.keyboard.press("Escape")
          await page.waitForTimeout(200)
        } else {
          await page.waitForTimeout(300)
        }
      }
    }

    if (!pickedDestino) {
      const labelUnidad = page.getByText("Unidad", { exact: true }).first()
      let triggerUnidad = labelUnidad.locator("..").getByRole("combobox").first()
      const visU = await triggerUnidad.isVisible().catch(() => false)
      if (!visU) {
        const c = page.locator("div").filter({ has: labelUnidad }).first()
        triggerUnidad = c.getByRole("combobox").first()
      }
      await expect(triggerUnidad).toBeVisible({ timeout: 10_000 })
      await triggerUnidad.click({ force: true, noWaitAfter: true })
      await page.waitForTimeout(350)
      const optsU = page.getByRole("option")
      await expect(optsU.first()).toBeVisible({ timeout: 10_000 })
      const cntU = await optsU.count()
      for (let i = 0; i < cntU; i++) {
        const txt = (await optsU.nth(i).textContent())?.trim() ?? ""
        if (!txt || txt === "Sin unidad") continue
        await optsU.nth(i).click({ force: true, noWaitAfter: true })
        break
      }
      await page.waitForTimeout(300)
    }

    // Descripción del paquete TEST-*
    const inputDesc = page.getByLabel("Descripción del paquete")
    await expect(inputDesc).toBeVisible({ timeout: 10_000 })
    await inputDesc.fill(descPaquete)

    // Registrar recepción
    await page.getByRole("button", { name: "Registrar recepción" }).click({ force: true, noWaitAfter: true })

    // Fila en la tabla del panel con el TEST-* y estado «Recibida».
    const filaEncomienda = tablaEncomiendas(page).getByRole("row").filter({ hasText: descPaquete })
    await expect(filaEncomienda).toBeVisible({ timeout: 15_000 })
    await expect(filaEncomienda.getByText("Recibida")).toBeVisible({ timeout: 10_000 })

    // La lista consolidada del día la cuenta como encomienda (dato de otra tabla, misma
    // pantalla): si la consolidación se rompe, esto falla.
    await expect(
      listaConsolidada(page).getByRole("row").filter({ hasText: "Encomienda" }).first()
    ).toBeVisible({ timeout: 15_000 })

    expect(errores, "Excepciones no capturadas en operaciones/accesos").toEqual([])
  })
})

// Las dos páginas viejas ya no existen como pantallas: sobreviven solo como enlaces
// viejos. El redirect tiene que ser del servidor (307 con Location) y no un
// `router.replace` del cliente, que pintaría la página retirada antes de corregirse.
test.describe("CRUD — Operaciones/Accesos: rutas retiradas redirigen a la puerta única", () => {
  const RUTAS_RETIRADAS = [
    { ruta: "/operaciones/bitacora", pantallaRetirada: /Bitácora Digital/ },
    { ruta: "/operaciones/paqueteria", pantallaRetirada: /Recepción y retiro de encomiendas/ },
  ] as const

  for (const { ruta, pantallaRetirada } of RUTAS_RETIRADAS) {
    test(`${ruta} responde con redirect del servidor y aterriza en la puerta única`, async ({ page }) => {
      // Sin seguir el redirect: la respuesta del documento es un 3xx con Location.
      const respuesta = await page.request.get(ruta, { maxRedirects: 0 })
      expect(
        respuesta.status(),
        `${ruta} debe responder con un redirect del servidor, no con un 200`
      ).toBe(307)
      expect(respuesta.headers()["location"]).toContain("/operaciones/accesos")

      const errores: string[] = []
      page.on("pageerror", (err) => errores.push(err.message))

      await page.goto(ruta)
      await expect(page).toHaveURL(/\/operaciones\/accesos$/)
      await expect(page.getByRole("heading", { name: /Accesos y Visitas/ })).toBeVisible({ timeout: 15_000 })
      await expect(page.getByText("¿A qué viene?").first()).toBeVisible({ timeout: 10_000 })
      // Nada de la pantalla retirada llega a pintarse.
      await expect(page.getByText(pantallaRetirada)).toHaveCount(0)

      expect(errores, `Excepciones no capturadas al redirigir ${ruta}`).toEqual([])
    })
  }
})
