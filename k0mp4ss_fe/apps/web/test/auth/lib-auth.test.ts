import { describe, it, expect } from "vitest"
import { authConfig } from "@/lib/auth.config"

describe("lib/auth.config — Auth.js P5", () => {
  it("usa estrategia JWT con maxAge 30 días y trustHost", () => {
    expect(authConfig.session?.strategy).toBe("jwt")
    expect(authConfig.session?.maxAge).toBe(30 * 24 * 60 * 60)
    expect(authConfig.trustHost).toBe(true)
  })

  it("apunta signIn y error a /ingresar", () => {
    expect(authConfig.pages?.signIn).toBe("/ingresar")
    expect(authConfig.pages?.error).toBe("/ingresar")
  })

  it("no incluye providers en la config edge-safe", () => {
    expect(authConfig.providers).toEqual([])
  })

  it("callback session expone user.id = token.sub", () => {
    const cb = authConfig.callbacks?.session
    expect(cb).toBeDefined()
    const session = { user: { name: null, email: "a@b.cl", image: null }, expires: new Date().toISOString() } as any
    const token = { sub: "usuario-123", email: "nuevo@b.cl" } as any
    const out = (cb as any)({ session, token, user: undefined })
    expect(out.user.id).toBe("usuario-123")
    expect(out.user.email).toBe("nuevo@b.cl")
  })

  it("callback session con token sin sub deja id vacío", () => {
    const cb = authConfig.callbacks?.session as any
    const session = { user: { email: "a@b.cl" }, expires: "" } as any
    const token = {} as any
    const out = cb({ session, token })
    expect(out.user.id).toBe("")
  })
})

describe("lib/auth — superficie Auth.js", () => {
  it("exporta handlers, auth, signIn, signOut", async () => {
    const mod = await import("@/lib/auth")
    expect(mod.handlers).toBeDefined()
    expect(typeof mod.handlers.GET).toBe("function")
    expect(typeof mod.handlers.POST).toBe("function")
    expect(typeof mod.auth).toBe("function")
    expect(typeof mod.signIn).toBe("function")
    expect(typeof mod.signOut).toBe("function")
  })

  it("exporta clases de error con code", async () => {
    const { CredencialesInvalidas, LimiteIntentos } = await import("@/lib/auth")
    const c = new CredencialesInvalidas()
    const l = new LimiteIntentos()
    expect(c.code).toBe("credentials")
    expect(l.code).toBe("rate_limited")
    // subclases de CredentialsSignin (AuthError)
    expect(c.type).toBe("CredentialsSignin")
    expect(l.type).toBe("CredentialsSignin")
  })

  it("no exporta secretos ni credenciales hardcodeadas", async () => {
    const mod = await import("@/lib/auth")
    // @ts-ignore
    expect(mod.crearToken).toBeUndefined()
    // @ts-ignore
    expect(mod.verificarToken).toBeUndefined()
    // @ts-ignore
    expect(mod.credencialesValidas).toBeUndefined()

    // D-iv SEC-013: seed-authz solo POST (sin side effects en GET)
    const ruta = await import("@/app/api/admin/seed-authz/route")
    expect(typeof ruta.POST).toBe("function")
    expect((ruta as Record<string, unknown>).GET).toBeUndefined()
    // @ts-ignore
    expect(mod.ADMIN_EMAIL).toBeUndefined()
  })
})
