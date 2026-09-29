import { expect, test } from "@playwright/test"

// Mini-prueba aislada del manual "05 - Maestro de Personas":
// un usuario admin crea una nueva identidad en el directorio
// y verifica que aparece en la grilla.
//
// P3 E2E-FULL-VERDE: el botón abridor se renombró a "Crear Nueva Persona"
// (el spec buscaba "Nuevo Registro" y expiraba); además email único por
// corrida + cleanup vía API (el email fijo colisionaba en reejecuciones).

test.use({ actionTimeout: 30_000 })

// Genera un RUT chileno con dígito verificador válido (el formulario valida el DV),
// derivado del timestamp para que cada corrida sea única.
function rutUnico(): string {
  const numero = 20_000_000 + (Date.now() % 9_000_000)
  const cuerpo = numero.toString()
  let suma = 0
  let mult = 2
  for (let i = cuerpo.length - 1; i >= 0; i--) {
    suma += Number(cuerpo[i]) * mult
    mult = mult === 7 ? 2 : mult + 1
  }
  const resto = 11 - (suma % 11)
  const dv = resto === 11 ? "0" : resto === 10 ? "K" : String(resto)
  return `${cuerpo}-${dv}`
}

test.describe("Mini flujo — Maestro de Personas (MP)", () => {
  test("crear una nueva persona desde el directorio", async ({ page }) => {
    const errores: string[] = []
    page.on("pageerror", (err) => errores.push(err.message))

    const RUT = rutUnico()
    const email = `ana.bodeguera.${Date.now()}@test.cl`
    let creadaId: string | null = null
    try {
      await page.goto("/comunidad/personas")

      // Abre el diálogo "Nueva Identidad"
      await page
        .getByRole("button", { name: /Crear Nueva Persona/ })
        .click({ force: true, noWaitAfter: true })

      // El formulario expone labels accesibles
      await page.getByLabel("RUT o Pasaporte *").fill(RUT)
      await page.getByLabel("Nombres *").fill("Ana")
      await page.getByLabel("Apellidos *").fill("Bodeguera")
      await page.getByLabel("Correo Electrónico *").fill(email)
      await page.getByLabel("Teléfono Móvil *").fill("+56 9 1111 2222")

      // El botón "Crear Persona" queda fuera del viewport dentro del diálogo,
      // así que enviamos el formulario vía requestSubmit (dispara el onSubmit).
      await page.locator('[role="dialog"] form').evaluate(
        (f) => (f as HTMLFormElement).requestSubmit(),
      )

      // La persona debe aparecer en la grilla del directorio.
      // La UI formatea el RUT con puntos de miles (22.740.655-0).
      const [cuerpoRut, dvRut] = RUT.split("-")
      const rutFormateado = cuerpoRut!.replace(/\B(?=(\d{3})+(?!\d))/g, ".") + `-${dvRut}`
      await expect(page.getByText(rutFormateado).first()).toBeVisible({ timeout: 15_000 })

      // Resolver el id para el cleanup (la grilla no lo expone).
      const res = await page.request.get(
        `/api/personas?q=${encodeURIComponent(RUT)}&pageSize=5`,
      )
      if (res.ok()) {
        const j = (await res.json()) as { data?: { id: string }[] }
        creadaId = j.data?.[0]?.id ?? null
      }

      expect(errores, "Excepciones no capturadas en Maestro de Personas").toEqual([])
    } finally {
      // Cleanup: la convención TEST exige no dejar residuos entre corridas.
      if (creadaId) {
        await page.request.delete(`/api/personas/${creadaId}`).catch(() => {})
      }
    }
  })
})
