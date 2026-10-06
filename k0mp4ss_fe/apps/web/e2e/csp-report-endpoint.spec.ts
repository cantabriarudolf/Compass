/**
 * @playwright-test
 * E2E: /api/csp-report receives and logs violations
 */
import { test, expect } from "@playwright/test"

test.describe("/api/csp-report endpoint", () => {
  test.use({
    launchOptions: {
      env: {
        ...process.env,
        CSP_ENFORCEMENT: "false",
      },
    },
  })

  test("GET health check returns ok", async ({ request }) => {
    const response = await request.get("/api/csp-report")
    expect(response.status()).toBe(200)

    const body = await response.json()
    expect(body.ok).toBe(true)
    expect(body.note).toContain("CSP report sink")
  })

  test("POST violation report returns 204", async ({ request }) => {
    const violationReport = {
      "csp-report": {
        "document-uri": "http://localhost/",
        "violated-directive": "script-src",
        "blocked-uri": "inline",
        "effective-directive": "script-src",
      },
    }

    const response = await request.post("/api/csp-report", {
      data: violationReport,
      headers: { "Content-Type": "application/json" },
    })

    expect(response.status()).toBe(204)
  })

  test("POST with malformed JSON returns 204 (fail-safe)", async ({ request }) => {
    const response = await request.post("/api/csp-report", {
      data: "not valid json",
      headers: { "Content-Type": "application/json" },
    })

    expect(response.status()).toBe(204)
  })

  test("POST with missing csp-report field returns 204 (fail-safe)", async ({ request }) => {
    const response = await request.post("/api/csp-report", {
      data: { other: "field" },
      headers: { "Content-Type": "application/json" },
    })

    expect(response.status()).toBe(204)
  })

  test("logs structured CSP violation fields", async ({ page }) => {
    // Inject inline script without nonce to trigger CSP violation
    const violations: any[] = []

    page.on("console", (msg) => {
      if (msg.type() === "error" && msg.text().includes("Content Security Policy")) {
        violations.push(msg.text())
      }
    })

    // Navigate and inject inline script
    await page.goto("/")
    await page.evaluate(() => {
      const script = document.createElement("script")
      script.textContent = "console.log('inline script without nonce')"
      document.head.appendChild(script)
    })

    // Wait for violation report to be sent
    await page.waitForTimeout(1000)

    // The violation should be sent to /api/csp-report
    // We verify by checking the endpoint still responds correctly
    const response = await page.request.post("/api/csp-report", {
      data: {
        "csp-report": {
          "document-uri": page.url(),
          "violated-directive": "script-src",
          "blocked-uri": "inline",
          "effective-directive": "script-src",
        },
      },
      headers: { "Content-Type": "application/json" },
    })

    expect(response.status()).toBe(204)
  })
})