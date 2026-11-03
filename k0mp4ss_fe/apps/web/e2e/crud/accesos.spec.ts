// Puerta única de accesos (commit 931753c, "una sola puerta para registrar accesos").
//
// La pantalla ya no son tres paneles apilados con pestañas: arriba hay un selector
// («¿A qué viene?») que abre SOLO el panel de la respuesta elegida, y abajo la lista
// consolidada del día (visitas + encomiendas + trabajos), de solo lectura. Este spec
// afirma esa estructura y, sobre todo, que la lista no ofrece ninguna acción: registrar
// y corregir vive en la puerta de arriba.
import { expect, test } from "@playwright/test"

test.use({ actionTimeout: 30_000 })

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
})
