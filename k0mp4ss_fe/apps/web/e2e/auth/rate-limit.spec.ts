// SG D-v: rate limit persistente (10 fallos / 15 min por IP).
// Contamina el contador por IP → el bloqueo dejaría a la IP sin login 15 min
// y rompería el resto de la suite. Solo corre con E2E_RATE_LIMIT=1 (ideal: CI
// aislado o al final de la noche). Igual que test/auth/rate-limit.test.ts.
import { expect, test } from "@playwright/test"

const CORREO_DESCONOCIDO = "rate-limit-e2e@noexiste.cl"
// Debe pasar la política de password (mayúscula + número): si no, el flujo
// corta en `PasswordDebil` ANTES del rate limit y no registra ningún intento
// (bug detectado 2026-10-12: con "incorrecta" el spec no podía pasar nunca).
const PASSWORD_INCORRECTA_VALIDA = "Incorrecta1!"

test.use({ storageState: { cookies: [], origins: [] } })

test("bloquea la IP tras MAX_INTENTOS intentos fallidos", async ({ page }) => {
  test.skip(process.env.E2E_RATE_LIMIT !== "1", "Correr solo con E2E_RATE_LIMIT=1 (contamina rate-limit por IP)")

  await page.goto("/ingresar")
  const alerta = page.locator("form").getByRole("alert")
  for (let i = 0; i < 10; i++) {
    await page.getByLabel("Correo electrónico").fill(CORREO_DESCONOCIDO)
    await page.getByLabel("Contraseña").fill(PASSWORD_INCORRECTA_VALIDA)
    await page.getByRole("button", { name: "Ingresar" }).click()
    await expect(alerta).toBeVisible()
  }

  await page.getByLabel("Correo electrónico").fill("rate-limit-e2e@noexiste.cl")
  await page.getByLabel("Contraseña").fill(PASSWORD_INCORRECTA_VALIDA)
  await page.getByRole("button", { name: "Ingresar" }).click()
  await expect(alerta).toContainText("Demasiados intentos")
})
