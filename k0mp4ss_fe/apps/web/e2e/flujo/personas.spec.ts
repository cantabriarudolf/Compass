import { expect, test } from "@playwright/test"

// Mini-prueba aislada del manual "05 - Maestro de Personas":
// un usuario admin crea una nueva identidad en el directorio
// y verifica que aparece en la grilla.

test.use({ actionTimeout: 30_000 })

test.describe("Mini flujo — Maestro de Personas (MP)", () => {
  // Genera un RUT chileno con dígito verificador válido (el formulario valida el DV).
  const numero = 20_000_000 + Math.floor(Math.random() * 9_000_000)
  const cuerpo = numero.toString()
  let suma = 0
  let mult = 2
  for (let i = cuerpo.length - 1; i >= 0; i--) {
    suma += Number(cuerpo[i]) * mult
    mult = mult === 7 ? 2 : mult + 1
  }
  const resto = 11 - (suma % 11)
  const dv = resto === 11 ? "0" : resto === 10 ? "K" : String(resto)
  const RUT = `${cuerpo}-${dv}`

  test("crear una nueva persona desde el directorio", async ({ page }) => {
    const errores: string[] = []
    page.on("pageerror", (err) => errores.push(err.message))

    await page.goto("/comunidad/personas")

    // Abre el diálogo "Nueva Identidad"
    await page
      .getByRole("button", { name: /Nuevo Registro/ })
      .click({ force: true, noWaitAfter: true })

    // El formulario expone labels accesibles
    await page.getByLabel("RUT o Pasaporte *").fill(RUT)
    await page.getByLabel("Nombres *").fill("Ana")
    await page.getByLabel("Apellidos *").fill("Bodeguera")
    await page.getByLabel("Correo Electrónico *").fill("ana.bodeguera@test.cl")
    await page.getByLabel("Teléfono Móvil *").fill("+56 9 1111 2222")

    // El botón "Crear Persona" queda fuera del viewport dentro del diálogo,
    // así que enviamos el formulario vía requestSubmit (dispara el onSubmit).
    await page.locator('[role="dialog"] form').evaluate(
      (f) => (f as HTMLFormElement).requestSubmit(),
    )

    // La persona debe aparecer en la grilla del directorio
    await expect(page.getByText(RUT)).toBeVisible({ timeout: 15_000 })

    expect(errores, "Excepciones no capturadas en Maestro de Personas").toEqual([])
  })
})
