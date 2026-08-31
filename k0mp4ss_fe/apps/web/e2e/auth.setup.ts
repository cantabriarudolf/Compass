// Login real contra /ingresar (NextAuth credentials) y guardado de sesión
// como storageState. Los proyectos con dependencia [setup] reutilizan la cookie.
// Si la sesión previa sigue vigente, /ingresar redirige a /admin → se guarda
// el storageState existente sin reloggear.
import { expect, test as setup } from "@playwright/test"

const ARCHIVO_SESION = "e2e/.auth/admin.json"

setup("autenticar admin@test.cl", async ({ page }) => {
  await page.goto("/ingresar")
  // waitFor SÍ espera (isVisible no: retorna al instante y en CI el form aún
  // no está hidratado). Si la sesión previa es válida, /ingresar redirige a
  // /admin y el form nunca aparece → se conserva el storageState sin reloggear.
  const hayFormulario = await correoOFormulario(page)
  if (hayFormulario) {
    await page.getByLabel("Correo electrónico").fill("admin@test.cl")
    await page.getByLabel("Contraseña").fill("test1234")
    await page.getByRole("button", { name: "Ingresar" }).click()
    // 60s: en dev frío el callback de NextAuth compila al primer uso.
    await expect(page).toHaveURL(/\/admin/, { timeout: 60_000 })
  } else {
    await expect(page).toHaveURL(/\/admin/, { timeout: 30_000 })
  }
  await page.context().storageState({ path: ARCHIVO_SESION })
})

async function correoOFormulario(page: import("@playwright/test").Page): Promise<boolean> {
  return page
    .getByLabel("Correo electrónico")
    .waitFor({ state: "visible", timeout: 10_000 })
    .then(() => true)
    .catch(() => false)
}
