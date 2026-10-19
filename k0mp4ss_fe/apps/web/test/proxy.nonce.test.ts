/**
 * @vitest-environment node
 * Unit test: generarNonce() uniqueness per request
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

// Helper to create a mock crypto object
function createMockCrypto(overrides: Partial<Crypto> = {}): Crypto {
  const baseCrypto: Crypto = {
    randomUUID: () => "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    getRandomValues: (arr: Uint8Array) => {
      for (let i = 0; i < arr.length; i++) arr[i] = i + 1
      return arr
    },
    // Fixture: el mock no ejercita WebCrypto, pero el tipo `Crypto` exige la propiedad.
    subtle: undefined as unknown as SubtleCrypto,
  }
  return {
    ...baseCrypto,
    ...overrides,
  } as Crypto
}

describe("proxy: generarNonce() uniqueness", () => {
  let originalCryptoDescriptor: PropertyDescriptor | undefined

  beforeEach(() => {
    // Save the original descriptor
    originalCryptoDescriptor = Object.getOwnPropertyDescriptor(globalThis, "crypto")
  })

  afterEach(() => {
    // Restore original crypto
    if (originalCryptoDescriptor) {
      Object.defineProperty(globalThis, "crypto", originalCryptoDescriptor)
    }
    vi.restoreAllMocks()
  })

  function setMockCrypto(mockCrypto: Crypto) {
    Object.defineProperty(globalThis, "crypto", {
      value: mockCrypto,
      writable: true,
      configurable: true,
    })
  }

  it("generates unique nonce per request via proxy middleware", async () => {
    setMockCrypto(createMockCrypto())

    const r1 = await pedirProxy()
    const r2 = await pedirProxy()

    const nonce1 = r1.headers.get("x-nonce")
    const nonce2 = r2.headers.get("x-csp-nonce")

    expect(nonce1).toBeDefined()
    expect(nonce2).toBeDefined()
    expect(nonce1).toBe(nonce2) // same nonce in both headers for same request
    expect(nonce1).toMatch(/^[A-Za-z0-9_-]+$/) // base64url encoding (no +, /, =, -)
    expect(nonce1).not.toContain("+")
    expect(nonce1).not.toContain("/")
    expect(nonce1).not.toContain("=")
  })

  it("generates different nonces for consecutive requests", async () => {
    // Each call to randomUUID should return a different value
    let callCount = 0
    const randomUUIDMock = vi.fn((): string => {
      callCount++
      return `${callCount.toString().padStart(32, "0")}-bbbb-cccc-dddd-eeeeeeeeeeee`
    })
    setMockCrypto(createMockCrypto({ randomUUID: randomUUIDMock as () => `${string}-${string}-${string}-${string}-${string}` }))

    const r1 = await pedirProxy()
    const r2 = await pedirProxy()

    const nonce1 = r1.headers.get("x-nonce")
    const nonce2 = r2.headers.get("x-nonce")

    expect(nonce1).not.toBe(nonce2) // unique per request
  })

  it("uses crypto.randomUUID when available", async () => {
    const randomUUIDMock = vi.fn((): string => "12345678-1234-1234-1234-123456789012")
    setMockCrypto(createMockCrypto({ randomUUID: randomUUIDMock as () => `${string}-${string}-${string}-${string}-${string}` }))
    const r = await pedirProxy()

    expect(randomUUIDMock).toHaveBeenCalled()
    const nonce = r.headers.get("x-nonce")
    // UUID without hyphens and padding
    expect(nonce).toBe("12345678123412341234123456789012")
  })

  it("falls back to getRandomValues when randomUUID unavailable", async () => {
    const getRandomValuesMock = vi.fn((arr: Uint8Array) => {
      arr.fill(42)
      return arr
    })
    setMockCrypto(createMockCrypto({ randomUUID: undefined, getRandomValues: getRandomValuesMock }))
    const r = await pedirProxy()

    expect(getRandomValuesMock).toHaveBeenCalled()
    const nonce = r.headers.get("x-nonce")
    expect(nonce).toBeDefined()
    expect(nonce).toMatch(/^[A-Za-z0-9_-]+$/)
  })

  it("falls back to Math.random when no Web Crypto available", async () => {
    // Set crypto to an object without randomUUID or getRandomValues
    Object.defineProperty(globalThis, "crypto", {
      value: { subtle: undefined },
      writable: true,
      configurable: true,
    })
    const r = await pedirProxy()

    const nonce = r.headers.get("x-nonce")
    expect(nonce).toBeDefined()
    expect(nonce).toMatch(/^[A-Za-z0-9_-]+$/)
  })
})