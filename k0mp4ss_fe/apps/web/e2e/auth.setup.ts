// Login real contra /ingresar (NextAuth credentials) — multi-cuenta P2.
// Para cada una de las 6 cuentas del seed (PASSWORD_TEST=Test1234!) guarda
// e2e/.auth/<rol>.json via test.use({ storageState }) por spec.
// Si la sesión previa sigue vigente, /ingresar redirige a /dashboard → se guarda
// el storageState existente sin reloggear. Patrón sin 5 proyectos en config.
import { expect, test as setup } from "@playwright/test"
import {
  CLAVE_ACUSE_PRIVACIDAD,
  VERSION_POLITICA_PRIVACIDAD,
} from "../lib/politica-privacidad"

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
  // El aviso de privacidad es fijo abajo y tapa botones del viewport: se deja el
  // acuse ya registrado antes de navegar, así no aparece en ninguna página ni en
  // el storageState que heredan los specs. Antes esto se hacía con clicks en
  // «Aceptar»; ese botón ya no existe (F16: el banner informa con versión y
  // fecha) y el bucle de reintentos se comía el timeout de los seis setups.
  await page.addInitScript(
    ([clave, acuse]) => window.localStorage.setItem(clave, acuse),
    [
      CLAVE_ACUSE_PRIVACIDAD,
      JSON.stringify({
        version: VERSION_POLITICA_PRIVACIDAD,
        fecha: new Date().toISOString(),
      }),
    ] as [string, string]
  )
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
  await page.context().storageState({ path: archivo })
}

for (const { email, archivo } of CUENTAS) {
  setup(`autenticar ${email}`, async ({ page }) => {
    await crearSesion(page, email, archivo)
  })
}
