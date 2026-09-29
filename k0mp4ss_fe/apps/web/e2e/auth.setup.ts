// Login real contra /ingresar (NextAuth credentials) — multi-cuenta P2.
// Para cada una de las 6 cuentas del seed (PASSWORD_TEST=Test1234!) guarda
// e2e/.auth/<rol>.json via test.use({ storageState }) por spec.
// Si la sesión previa sigue vigente, /ingresar redirige a /dashboard → se guarda
// el storageState existente sin reloggear. Patrón sin 5 proyectos en config.
import { expect, test as setup } from "@playwright/test"

const PASSWORD_TEST = "Test1234!"

type Cuenta = { email: string; archivo: string }

const CUENTAS: Cuenta[] = [
  { email: "admin@test.cl", archivo: "e2e/.auth/admin.json" },
  { email: "comite@test.cl", archivo: "e2e/.auth/comite.json" },
  { email: "conserjeria@test.cl", archivo: "e2e/.auth/conserjeria.json" },
  { email: "residente@test.cl", archivo: "e2e/.auth/residente.json" },
  { email: "mantencion@test.cl", archivo: "e2e/.auth/mantencion.json" },
  { email: "arrendatario@test.cl", archivo: "e2e/.auth/arrendatario.json" },
]

async function correoOFormulario(
  page: import("@playwright/test").Page
): Promise<boolean> {
  // 30s: con dev server frío (turbopack compila /ingresar al primer uso) bajo carga,
  // 10s se quedaba corto y el setup tomaba la rama "sin formulario" flakeando (fi-sync-bd P4).
  return page
    .getByLabel("Correo electrónico")
    .waitFor({ state: "visible", timeout: 30_000 })
    .then(() => true)
    .catch(() => false)
}

async function crearSesion(
  page: import("@playwright/test").Page,
  email: string,
  archivo: string
) {
  await page.goto("/ingresar")
  const hayFormulario = await correoOFormulario(page)
  if (hayFormulario) {
    await page.getByLabel("Correo electrónico").fill(email)
    await page.getByLabel("Contraseña").fill(PASSWORD_TEST)
      await page.getByRole("button", { name: "Ingresar" }).click()
        await expect(page).toHaveURL(/\/dashboard/, { timeout: 60_000 })
      } else {
        await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 })
      }
  // El banner de cookies (fijo abajo) tapa botones al fondo del viewport e
  // intercepta los clics: se acepta una vez al final (ya hidratado) para que
  // el consentimiento quede en localStorage y se persista en el
  // storageState que heredan los specs.
  // P3 E2E-FULL-VERDE: el click pre-hidratación se pierde (sin listener) y el
  // flag no persistía (verificado: admin.json sin la clave) → reintentar con
  // verificación del flag (máx 3), esperando hidratación entre intentos.
  const CLAVE = "compass-consentimiento-privacidad"
  for (let intento = 0; intento < 3; intento++) {
    const flag = await page
      .evaluate((k) => window.localStorage.getItem(k), CLAVE)
      .catch(() => null)
    if (flag === "aceptado") break
    // Espera hidratación: el botón Aceptar debe estar operativo.
    await page
      .getByRole("button", { name: "Aceptar" })
      .first()
      .waitFor({ state: "visible", timeout: 10_000 })
      .catch(() => {})
    const bannerCookies = page
      .locator("div")
      .filter({ hasText: "Utilizamos cookies" })
      .first()
    if (await bannerCookies.isVisible().catch(() => false)) {
      try {
        await bannerCookies
          .getByRole("button", { name: "Aceptar" })
          .click({ timeout: 10_000 })
      } catch {
        // Reintenta en la siguiente vuelta (post-hidratación).
      }
    }
    await page.waitForTimeout(500)
  }
  await page.context().storageState({ path: archivo })
}

for (const { email, archivo } of CUENTAS) {
  setup(`autenticar ${email}`, async ({ page }) => {
    await crearSesion(page, email, archivo)
  })
}
