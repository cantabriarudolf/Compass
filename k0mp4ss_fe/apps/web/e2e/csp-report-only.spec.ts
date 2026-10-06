/**
 * @playwright-test
 * E2E: CSP Report-Only mode verification
 */
import { test, expect } from "@playwright/test"

test.describe("CSP Report-Only mode (CSP_ENFORCEMENT=false)", () => {
  test.use({
    // Override env for this test suite
    launchOptions: {
      env: {
        ...process.env,
        CSP_ENFORCEMENT: "false",
      },
    },
  })

  test("emits Content-Security-Policy-Report-Only header", async ({ page }) => {
    const response = await page.goto("/")
    expect(response?.status()).toBe(200)

    const cspHeader = response?.headers()["content-security-policy-report-only"]
    const enforceHeader = response?.headers()["content-security-policy"]

    expect(cspHeader).toBeDefined()
    expect(cspHeader).toContain("default-src 'self'")
    expect(enforceHeader).toBeUndefined()
  })

  test("exposes nonce via x-nonce and x-csp-nonce headers", async ({ page }) => {
    const response = await page.goto("/")

    const xNonce = response?.headers()["x-nonce"]
    const xCspNonce = response?.headers()["x-csp-nonce"]

    expect(xNonce).toBeDefined()
    expect(xCspNonce).toBeDefined()
    expect(xNonce).toBe(xCspNonce)
    expect(xNonce).toMatch(/^[A-Za-z0-9_-]+$/)
  })

  test("includes strict-dynamic in script-src", async ({ page }) => {
    const response = await page.goto("/")
    const cspHeader = response?.headers()["content-security-policy-report-only"]

    expect(cspHeader).toContain("'strict-dynamic'")
  })

  test("includes youtube.com and youtube-nocookie.com in frame-src", async ({ page }) => {
    const response = await page.goto("/")
    const cspHeader = response?.headers()["content-security-policy-report-only"]

    expect(cspHeader).toContain("https://www.youtube.com")
    expect(cspHeader).toContain("https://www.youtube-nocookie.com")
  })
})