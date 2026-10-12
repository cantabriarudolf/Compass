/**
 * @playwright-test
 * E2E: /api/csp-report recibe y registra violaciones CSP.
 * El sink es independiente del modo (enforcement o report-only), así que este
 * spec no fija `CSP_ENFORCEMENT` ni toca `launchOptions`.
 */
import { test, expect } from "@playwright/test"

test.describe("endpoint /api/csp-report", () => {
  test("GET de salud responde ok con la nota del sink CSP", async ({ request }) => {
    const response = await request.get("/api/csp-report")
    expect(response.status()).toBe(200)

    const body = await response.json()
    expect(body.ok).toBe(true)
    expect(body.note).toContain("CSP report sink")
  })

  test("POST de un reporte csp-report bien formado responde 204", async ({ request }) => {
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

  test("POST con body malformado responde 204, nunca 500", async ({ request }) => {
    const response = await request.post("/api/csp-report", {
      data: "not valid json",
      headers: { "Content-Type": "application/json" },
    })

    expect(response.status()).toBe(204)
  })

  test("POST sin el campo csp-report responde 204 (fail-safe)", async ({ request }) => {
    const response = await request.post("/api/csp-report", {
      data: { other: "field" },
      headers: { "Content-Type": "application/json" },
    })

    expect(response.status()).toBe(204)
  })
})
