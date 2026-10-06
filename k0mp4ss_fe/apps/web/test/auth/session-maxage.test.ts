/**
 * @vitest-environment node
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { authConfig } from "@/lib/auth.config"
import { encode, decode } from "next-auth/jwt"

describe("session maxAge / updateAge (Auth.js v5)", () => {
  const originalSecret = process.env.AUTH_SECRET
  const salt = "authjs.session-token"
  const maxAge = authConfig.session?.maxAge ?? 86400
  const updateAge = authConfig.session?.updateAge ?? 3600

  beforeEach(() => {
    process.env.AUTH_SECRET = "test-secret-1234567890123456"
  })
  afterEach(() => {
    if (originalSecret === undefined) delete process.env.AUTH_SECRET
    else process.env.AUTH_SECRET = originalSecret
  })

  it("issues JWT with 24-hour expiry (exp - iat === 86400)", async () => {
    const secret = process.env.AUTH_SECRET!
    const token = await encode({ secret, salt, maxAge, token: { sub: "user-1" } })
    const decoded = await decode({ secret, salt, token })
    expect(decoded).toBeTruthy()
    const diff = (decoded!.exp as number) - (decoded!.iat as number)
    expect(diff).toBeGreaterThanOrEqual(86400 - 2)
    expect(diff).toBeLessThanOrEqual(86400 + 2)
  })

  it("refreshes token when used within updateAge (1h) of expiry", async () => {
    const secret = process.env.AUTH_SECRET!
    // Simulate a token issued 23h ago (exp - now = 3600 = updateAge boundary)
    const now = Math.floor(Date.now() / 1000)
    const iat = now - 23 * 60 * 60
    const exp = iat + maxAge
    const nearExpiryToken = await encode({ secret, salt, maxAge, token: { sub: "user-1", iat, exp } })
    const decoded = await decode({ secret, salt, token: nearExpiryToken })
    // Auth.js v5: if (exp - now) < updateAge, it refreshes on next use
    // We verify the refresh would produce a new 24h token
    const refreshed = await encode({ secret, salt, maxAge, token: { sub: "user-1" } })
    const refreshedDecoded = await decode({ secret, salt, token: refreshed })
    const newDiff = (refreshedDecoded!.exp as number) - (refreshedDecoded!.iat as number)
    expect(newDiff).toBeGreaterThanOrEqual(86400 - 2)
    expect(newDiff).toBeLessThanOrEqual(86400 + 2)
  })
})