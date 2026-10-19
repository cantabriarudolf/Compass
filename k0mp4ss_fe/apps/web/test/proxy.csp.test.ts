/**
 * @vitest-environment node
 * Unit test: cspEnforce(nonce) directive string
 */
import { describe, it, expect } from "vitest"
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

describe("proxy: cspEnforce(nonce) directive string", () => {
  it("returns full CSP directive string with all 13 directives", async () => {

    const r = await pedirProxy()

    const csp = r.headers.get("content-security-policy-report-only") ?? ""
    const directives = csp.split("; ").map((d: string) => d.trim())

    expect(directives).toHaveLength(13)

    // Verify each directive is present
    expect(csp).toContain("default-src 'self'")
    expect(csp).toContain("script-src")
    expect(csp).toContain("style-src")
    expect(csp).toContain("font-src")
    expect(csp).toContain("img-src")
    expect(csp).toContain("connect-src")
    expect(csp).toContain("frame-src")
    expect(csp).toContain("media-src")
    expect(csp).toContain("object-src 'none'")
    expect(csp).toContain("base-uri 'self'")
    expect(csp).toContain("form-action 'self'")
    expect(csp).toContain("frame-ancestors 'none'")
    expect(csp).toContain("report-uri /api/csp-report")
  })

  it("interpolates nonce correctly in script-src", async () => {

    const r = await pedirProxy()

    const csp = r.headers.get("content-security-policy-report-only") ?? ""
    const nonce = r.headers.get("x-nonce")

    expect(csp).toContain(`'nonce-${nonce}'`)
    expect(csp).toContain(`script-src 'self' 'nonce-${nonce}' 'strict-dynamic' 'unsafe-inline' 'unsafe-eval' https:`)
  })

  it("includes strict-dynamic in script-src", async () => {

    const r = await pedirProxy()

    const csp = r.headers.get("content-security-policy-report-only") ?? ""
    expect(csp).toContain("'strict-dynamic'")
  })

  it("includes unsafe-inline and unsafe-eval in script-src (Next.js compat)", async () => {
    const r2 = await pedirProxy()

    const csp = r2.headers.get("content-security-policy-report-only") ?? ""
    expect(csp).toContain("'unsafe-inline'")
    expect(csp).toContain("'unsafe-eval'")
  })

  it("includes youtube.com and youtube-nocookie.com in frame-src", async () => {

    const r = await pedirProxy()

    const csp = r.headers.get("content-security-policy-report-only") ?? ""
    expect(csp).toContain("https://www.youtube.com")
    expect(csp).toContain("https://www.youtube-nocookie.com")
  })

  it("includes fonts.googleapis.com and fonts.gstatic.com in style-src and font-src", async () => {

    const r = await pedirProxy()

    const csp = r.headers.get("content-security-policy-report-only") ?? ""
    expect(csp).toContain("https://fonts.googleapis.com")
    expect(csp).toContain("https://fonts.gstatic.com")
  })

  it("includes https: in img-src for remote logos/avisos", async () => {

    const r = await pedirProxy()

    const csp = r.headers.get("content-security-policy-report-only") ?? ""
    expect(csp).toContain("img-src 'self' data: blob: https:")
  })

  it("produces identical directive string across requests (only nonce differs)", async () => {

    const r1 = await pedirProxy()
    const r2 = await pedirProxy()

    const csp1 = r1.headers.get("content-security-policy-report-only") ?? ""
    const csp2 = r2.headers.get("content-security-policy-report-only") ?? ""
    const nonce1 = r1.headers.get("x-nonce") ?? ""
    const nonce2 = r2.headers.get("x-nonce") ?? ""

    // Replace nonces with placeholder to compare directive structure
    const normalized1 = csp1.replace(`'nonce-${nonce1}'`, "'nonce-PLACEHOLDER'")
    const normalized2 = csp2.replace(`'nonce-${nonce2}'`, "'nonce-PLACEHOLDER'")

    expect(normalized1).toBe(normalized2)
  })
})