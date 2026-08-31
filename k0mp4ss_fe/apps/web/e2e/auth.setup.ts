// Login real contra /ingresar (NextAuth credentials) y guardado de sesión
// como storageState. Los proyectos con dependencia [setup] reutilizan la cookie.
// Si la sesión previa sigue vigente, /ingresar redirige a /admin → se guarda
// el storageState existente sin reloggear.
import { expect, test as setup } from "@playwright/test"

const ARCHIVO_SESION = "e2e/.auth/admin.json"

setup("autenticar admin@test.cl", async ({ page }) => {
  await page.goto("/ingresar")
  const correo = page.getByLabel("Correo electrónico")
  if (await correo.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await correo.fill("admin@test.cl")
    await page.getByLabel("Contraseña").fill("test1234")
    await page.getByRole("button", { name: "Ingresar" }).click()
    await expect(page).toHaveURL(/\/admin/)
  } else {
    await expect(page).toHaveURL(/\/admin/, { timeout: 30_000 })
  }
  await page.context().storageState({ path: ARCHIVO_SESION })
})
