/**
 * @playwright-test
 * E2E: CSP Enforcement mode verification
 */
import { test, expect } from "@playwright/test"

test.describe("CSP Enforcement mode (CSP_ENFORCEMENT=true)", () => {
  test.use({
    launchOptions: {
      env: {
        ...process.env,
        CSP_ENFORCEMENT: "true",
      },
    },
  })

  test("emits Content-Security-Policy header", async ({ page }) => {
    const response = await page.goto("/")
    expect(response?.status()).toBe(200)

    const enforceHeader = response?.headers()["content-security-policy"]
    const reportOnlyHeader = response?.headers()["content-security-policy-report-only"]

    expect(enforceHeader).toBeDefined()
    expect(enforceHeader).toContain("default-src 'self'")
    expect(reportOnlyHeader).toBeUndefined()
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
    const cspHeader = response?.headers()["content-security-policy"]

    expect(cspHeader).toContain("'strict-dynamic'")
  })

  test("includes youtube.com and youtube-nocookie.com in frame-src", async ({ page }) => {
    const response = await page.goto("/")
    const cspHeader = response?.headers()["content-security-policy"]

    expect(cspHeader).toContain("https://www.youtube.com")
    expect(cspHeader).toContain("https://www.youtube-nocookie.com")
  })

  test("includes all 13 CSP directives", async ({ page }) => {
    const response = await page.goto("/")
    const cspHeader = response?.headers()["content-security-policy"]

    const directives = cspHeader?.split("; ").map((d) => d.trim()) ?? []
    expect(directives).toHaveLength(13)

    expect(cspHeader).toContain("default-src 'self'")
    expect(cspHeader).toContain("script-src")
    expect(cspHeader).toContain("style-src")
    expect(cspHeader).toContain("font-src")
    expect(cspHeader).toContain("img-src")
    expect(cspHeader).toContain("connect-src")
    expect(cspHeader).toContain("frame-src")
    expect(cspHeader).toContain("media-src")
    expect(cspHeader).toContain("object-src 'none'")
    expect(cspHeader).toContain("base-uri 'self'")
    expect(cspHeader).toContain("form-action 'self'")
    expect(cspHeader).toContain("frame-ancestors 'none'")
    expect(cspHeader).toContain("report-uri /api/csp-report")
  })
})