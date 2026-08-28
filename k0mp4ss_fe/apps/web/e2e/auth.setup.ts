// Login real contra /ingresar (NextAuth credentials) y guardado de sesión
// como storageState. Los proyectos con dependencia [setup] reutilizan la cookie.
import { expect, test as setup } from "@playwright/test"

const ARCHIVO_SESION = "e2e/.auth/admin.json"

setup("autenticar admin@test.cl", async ({ page }) => {
  await page.goto("/ingresar")
  await page.getByLabel("Correo electrónico").fill("admin@test.cl")
  await page.getByLabel("Contraseña").fill("test1234")
  await page.getByRole("button", { name: "Ingresar" }).click()
  await expect(page).toHaveURL(/\/admin/)
  await page.context().storageState({ path: ARCHIVO_SESION })
})
