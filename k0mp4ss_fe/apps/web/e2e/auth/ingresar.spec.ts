// Flujo de autenticación real contra /ingresar (sin sesión preexistente).
import { expect, test } from "@playwright/test"

test.use({ storageState: { cookies: [], origins: [] } })

test.describe("Ingresar", () => {
  test("credenciales inválidas muestran error", async ({ page }) => {
    await page.goto("/ingresar")
    await page.getByLabel("Correo electrónico").fill("admin@test.cl")
    await page.getByLabel("Contraseña").fill("password-equivocada")
    await page.getByRole("button", { name: "Ingresar" }).click()
    // Scoping al form: el route announcer de Next (#__next-route-announcer__)
    // también expone role=alert y provoca strict mode violation.
    await expect(page.locator("form").getByRole("alert")).toContainText(
      "Credenciales inválidas."
    )
  })

  test("login exitoso redirige a /dashboard", async ({ page }) => {
    await page.goto("/ingresar")
    await page.getByLabel("Correo electrónico").fill("admin@test.cl")
    await page.getByLabel("Contraseña").fill("Test1234!")
    await page.getByRole("button", { name: "Ingresar" }).click()
    await expect(page).toHaveURL(/\/dashboard/)
  })

  test("usuario sin sesión que visita /admin es redirigido a /ingresar", async ({
    page,
  }) => {
    await page.goto("/admin")
    await expect(page).toHaveURL(/\/ingresar/)
  })
})
