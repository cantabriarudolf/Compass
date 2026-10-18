/**
 * @vitest-environment node
 * Unit test: Header selection logic (CSP_ENFORCEMENT env var)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { NextRequest } from "next/server"

/** Invoca el middleware por defecto de `@/proxy` con la petición mínima del test. */
async function pedirProxy(): Promise<Response> {
  const proxy = (await import("@/proxy")).default
  return proxy(
    new NextRequest("http://localhost/", {
      headers: { "x-forwarded-proto": "http" },
    })
  )
}

describe("proxy: CSP header selection via CSP_ENFORCEMENT", () => {
  const originalEnforcement = process.env.CSP_ENFORCEMENT

  beforeEach(() => {
    vi.resetModules()
    delete process.env.CSP_ENFORCEMENT
  })

  afterEach(() => {
    if (originalEnforcement === undefined) delete process.env.CSP_ENFORCEMENT
    else process.env.CSP_ENFORCEMENT = originalEnforcement
    vi.resetModules()
  })

  it("emits Content-Security-Policy when CSP_ENFORCEMENT=true", async () => {
    process.env.CSP_ENFORCEMENT = "true"
    vi.resetModules()

    const r = await pedirProxy()

    const enforceHeader = r.headers.get("content-security-policy")
    const reportOnlyHeader = r.headers.get("content-security-policy-report-only")

    expect(enforceHeader).toBeDefined()
    expect(enforceHeader).toContain("default-src 'self'")
    expect(reportOnlyHeader).toBeNull()
  })

  it("emits Content-Security-Policy-Report-Only when CSP_ENFORCEMENT=false", async () => {
    process.env.CSP_ENFORCEMENT = "false"
    vi.resetModules()

    const r = await pedirProxy()

    const enforceHeader = r.headers.get("content-security-policy")
    const reportOnlyHeader = r.headers.get("content-security-policy-report-only")

    expect(reportOnlyHeader).toBeDefined()
    expect(reportOnlyHeader).toContain("default-src 'self'")
    expect(enforceHeader).toBeNull()
  })

  it("defaults to Report-Only when CSP_ENFORCEMENT is unset", async () => {
    // Ensure it's unset
    delete process.env.CSP_ENFORCEMENT
    vi.resetModules()

    const r = await pedirProxy()

    const enforceHeader = r.headers.get("content-security-policy")
    const reportOnlyHeader = r.headers.get("content-security-policy-report-only")

    expect(reportOnlyHeader).toBeDefined()
    expect(reportOnlyHeader).toContain("default-src 'self'")
    expect(enforceHeader).toBeNull()
  })

  it("does not emit both headers simultaneously", async () => {
    process.env.CSP_ENFORCEMENT = "true"
    vi.resetModules()

    const r = await pedirProxy()

    const enforceHeader = r.headers.get("content-security-policy")
    const reportOnlyHeader = r.headers.get("content-security-policy-report-only")

    expect(enforceHeader).not.toBeNull()
    expect(reportOnlyHeader).toBeNull()

    // Switch to false
    process.env.CSP_ENFORCEMENT = "false"
    vi.resetModules()
    const r2 = await pedirProxy()

    const enforceHeader2 = r2.headers.get("content-security-policy")
    const reportOnlyHeader2 = r2.headers.get("content-security-policy-report-only")

    expect(enforceHeader2).toBeNull()
    expect(reportOnlyHeader2).not.toBeNull()
  })

  it("preserves all CSP directives, nonce, and strict-dynamic in both modes", async () => {
    // Test enforcement mode
    process.env.CSP_ENFORCEMENT = "true"
    vi.resetModules()
    const r1 = await pedirProxy()

    const csp1 = r1.headers.get("content-security-policy") ?? ""
    const nonce1 = r1.headers.get("x-nonce")

    // Test report-only mode
    process.env.CSP_ENFORCEMENT = "false"
    vi.resetModules()
    const r2 = await pedirProxy()

    const csp2 = r2.headers.get("content-security-policy-report-only") ?? ""
    const nonce2 = r2.headers.get("x-nonce")

    // Both should have nonce
    expect(nonce1).toBeDefined()
    expect(nonce2).toBeDefined()
    expect(csp1).toContain(`'nonce-${nonce1}'`)
    expect(csp2).toContain(`'nonce-${nonce2}'`)

    // Both should have strict-dynamic
    expect(csp1).toContain("'strict-dynamic'")
    expect(csp2).toContain("'strict-dynamic'")

    // Directive structure should be identical (only nonce value differs)
    const normalized1 = csp1.replace(`'nonce-${nonce1}'`, "'nonce-PLACEHOLDER'")
    const normalized2 = csp2.replace(`'nonce-${nonce2}'`, "'nonce-PLACEHOLDER'")
    expect(normalized1).toBe(normalized2)

    // Both should expose nonce via headers
    expect(r1.headers.get("x-nonce")).toBe(nonce1)
    expect(r1.headers.get("x-csp-nonce")).toBe(nonce1)
    expect(r2.headers.get("x-nonce")).toBe(nonce2)
    expect(r2.headers.get("x-csp-nonce")).toBe(nonce2)
  })
})