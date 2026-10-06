/**
 * @playwright-test
 * E2E: Nonce uniqueness per request in both modes
 */
import { test, expect } from "@playwright/test"

async function fetchNonces(page: any, url: string) {
  const response1 = await page.goto(url)
  const nonce1 = response1?.headers()["x-nonce"]
  const cspNonce1 = response1?.headers()["x-csp-nonce"]

  const response2 = await page.goto(url)
  const nonce2 = response2?.headers()["x-nonce"]
  const cspNonce2 = response2?.headers()["x-csp-nonce"]

  return { nonce1, cspNonce1, nonce2, cspNonce2 }
}

test.describe("Nonce uniqueness per request - Report-Only mode", () => {
  test.use({
    launchOptions: {
      env: {
        ...process.env,
        CSP_ENFORCEMENT: "false",
      },
    },
  })

  test("generates different nonce values for consecutive requests", async ({ page }) => {
    const { nonce1, cspNonce1, nonce2, cspNonce2 } = await fetchNonces(page, "/")

    expect(nonce1).toBeDefined()
    expect(cspNonce1).toBeDefined()
    expect(nonce2).toBeDefined()
    expect(cspNonce2).toBeDefined()

    expect(nonce1).toBe(cspNonce1)
    expect(nonce2).toBe(cspNonce2)
    expect(nonce1).not.toBe(nonce2)
  })

  test("both x-nonce and x-csp-nonce headers present and match per request", async ({ page }) => {
    const { nonce1, cspNonce1, nonce2, cspNonce2 } = await fetchNonces(page, "/")

    expect(nonce1).toBe(cspNonce1)
    expect(nonce2).toBe(cspNonce2)
  })
})

test.describe("Nonce uniqueness per request - Enforcement mode", () => {
  test.use({
    launchOptions: {
      env: {
        ...process.env,
        CSP_ENFORCEMENT: "true",
      },
    },
  })

  test("generates different nonce values for consecutive requests", async ({ page }) => {
    const { nonce1, cspNonce1, nonce2, cspNonce2 } = await fetchNonces(page, "/")

    expect(nonce1).toBeDefined()
    expect(cspNonce1).toBeDefined()
    expect(nonce2).toBeDefined()
    expect(cspNonce2).toBeDefined()

    expect(nonce1).toBe(cspNonce1)
    expect(nonce2).toBe(cspNonce2)
    expect(nonce1).not.toBe(nonce2)
  })

  test("both x-nonce and x-csp-nonce headers present and match per request", async ({ page }) => {
    const { nonce1, cspNonce1, nonce2, cspNonce2 } = await fetchNonces(page, "/")

    expect(nonce1).toBe(cspNonce1)
    expect(nonce2).toBe(cspNonce2)
  })
})