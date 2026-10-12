/**
 * @playwright-test
 * E2E: contrato del modo CSP que el SERVIDOR está ejecutando.
 *
 * El modo CSP es una variable de entorno del servidor: `proxy.ts` lee
 * `CSP_ENFORCEMENT` en cada request y elige el nombre de cabecera
 * (`Content-Security-Policy` cuando vale "true"; `Content-Security-Policy-Report-Only`
 * en cualquier otro caso). Por eso no es una opción del navegador y
 * `launchOptions.env` no puede cambiarlo.
 *
 * Este spec NO fija un modo: afirma el contrato del modo realmente activo,
 * calculado desde `process.env.CSP_ENFORCEMENT`. Premisa en una línea: el proceso
 * de Playwright hereda el mismo entorno que el comando `webServer`, así que ambos
 * leen el mismo valor (dev y CI).
 *
 * Para ejercitar el otro modo, arrancá/reiniciá el server con el env invertido:
 *   CSP_ENFORCEMENT=true npx playwright test e2e/csp-modos.spec.ts
 * (o `CSP_ENFORCEMENT=false ...` para volver a report-only).
 *
 * El contrato de flip/rollback en sí (la cabecera cambia con el env, sin
 * redeploy) está cubierto por los tests unitarios en
 * `test/proxy.header-selection.test.ts`; acá no se reimplementa.
 */
import { test, expect } from "@playwright/test"

// Modo según el env del proceso de Playwright (mismo entorno que hereda webServer).
const enforcement = process.env.CSP_ENFORCEMENT === "true"

const headerEsperado = enforcement
  ? "content-security-policy"
  : "content-security-policy-report-only"
const headerEspejo = enforcement
  ? "content-security-policy-report-only"
  : "content-security-policy"

test.describe(`Modo CSP activo del servidor (CSP_ENFORCEMENT=${String(enforcement)})`, () => {
  test("emite solo la cabecera del modo activo con default-src 'self'", async ({ page }) => {
    const response = await page.goto("/")
    expect(response?.status()).toBe(200)

    const headers = response?.headers() ?? {}
    expect(headers[headerEsperado]).toContain("default-src 'self'")
    expect(headers[headerEspejo]).toBeUndefined()
  })

  test("incluye las directivas auditadas y el nonce del request", async ({ page }) => {
    const response = await page.goto("/")
    const headers = response?.headers() ?? {}
    const csp = headers[headerEsperado]
    const nonce = headers["x-nonce"]

    expect(csp).toContain("'strict-dynamic'")
    expect(csp).toContain("object-src 'none'")
    expect(csp).toContain("frame-ancestors 'none'")
    expect(csp).toContain("report-uri /api/csp-report")
    expect(csp).toContain(`'nonce-${nonce}'`)
  })

  test("expone x-nonce y x-csp-nonce iguales y en base64url", async ({ page }) => {
    const response = await page.goto("/")
    const headers = response?.headers() ?? {}
    const nonce = headers["x-nonce"]
    const cspNonce = headers["x-csp-nonce"]

    expect(nonce).toEqual(expect.any(String))
    expect(cspNonce).toEqual(expect.any(String))
    expect(nonce).toBe(cspNonce)
    expect(nonce).toMatch(/^[A-Za-z0-9_-]+$/)
  })

  test("genera un nonce distinto en navegaciones consecutivas", async ({ page }) => {
    const primera = await page.goto("/")
    const segunda = await page.goto("/")

    const nonce1 = primera?.headers()["x-nonce"]
    const nonce2 = segunda?.headers()["x-nonce"]

    expect(nonce1).toEqual(expect.any(String))
    expect(nonce2).toEqual(expect.any(String))
    expect(nonce1).not.toBe(nonce2)
  })
})
