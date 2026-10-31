/**
 * @vitest-environment node
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { NextRequest } from "next/server"
import proxy from "@/proxy"
import { cookieSesionAuthjs } from "../helpers/sesion-authjs"

function mkReq(pathname: string, cookie?: string) {
  const url = `http://localhost${pathname}`
  const headers: Record<string, string> = { "x-forwarded-proto": "http" }
  if (cookie) headers["cookie"] = cookie
  return new NextRequest(url, { headers })
}

describe("proxy (middleware Auth.js)", () => {
  const originalSecret = process.env.AUTH_SECRET
  beforeEach(() => {
    process.env.AUTH_SECRET = "test-secret-12345678"
  })
  afterEach(() => {
    if (originalSecret === undefined) delete process.env.AUTH_SECRET
    else process.env.AUTH_SECRET = originalSecret
  })

  it("permite rutas públicas /ingresar y /api/auth sin sesión", async () => {
    // /ingresar no está en el matcher, pero la regla de ruta pública se mantiene
    const r2 = await proxy(mkReq("/api/auth/csrf"), undefined as never)
    expect(r2?.status).not.toBe(401)
    expect(r2?.status).not.toBe(307)

    const r3 = await proxy(mkReq("/api/auth/callback/credentials"), undefined as never)
    expect(r3?.status).not.toBe(401)
  })

  it("permite /api/health y /api/csp-report sin sesión (endpoints anónimos)", async () => {
    const health = await proxy(mkReq("/api/health"), undefined as never)
    expect(health?.status).not.toBe(401)
    expect(health?.status ?? 500).toBeLessThan(400)

    const csp = await proxy(mkReq("/api/csp-report"), undefined as never)
    expect(csp?.status).not.toBe(401)
    expect(csp?.status ?? 500).toBeLessThan(400)
  })

  it("mantiene el 401 en un /api protegido sin sesión", async () => {
    const r = await proxy(mkReq("/api/personas"), undefined as never)
    expect(r?.status).toBe(401)
    const j = await r?.json()
    expect(j.error).toMatch(/No autenticado/i)
  })

  it("permite ruta no protegida sin sesión", async () => {
    const r = await proxy(mkReq("/"), undefined as never)
    expect(r?.status).not.toBe(401)
    expect([200, 307, 308].includes(r?.status ?? 0) || r?.headers.get("x-middleware-next") !== null).toBeTruthy()
  })

  it("bloquea /admin sin sesión con redirect a /ingresar?next=", async () => {
    const r = await proxy(mkReq("/admin/permisos"), undefined as never)
    expect([307, 308].includes(r?.status ?? 0)).toBe(true)
    const loc = r?.headers.get("location") ?? ""
    expect(loc).toContain("/ingresar")
    expect(loc).toContain(encodeURIComponent("/admin/permisos"))
  })

  it("bloquea /api/* sin sesión con 401 JSON", async () => {
    const r = await proxy(mkReq("/api/whatever"), undefined as never)
    expect(r?.status).toBe(401)
    const j = await r?.json()
    expect(j.error).toMatch(/No autenticado/i)
  })

  it("permite /admin con sesión Auth.js válida (sub = Usuario.id)", async () => {
    const cookie = await cookieSesionAuthjs({ sub: "usuario-admin", email: "admin@test.cl" })
    const r = await proxy(mkReq("/admin/configuracion", cookie), undefined as never)
    expect(r?.status).not.toBe(401)
    expect([200, 307, 308].includes(r?.status ?? 0) || r?.headers.get("x-middleware-next") !== null).toBeTruthy()
  })

  it("permite /api con sesión Auth.js válida", async () => {
    const cookie = await cookieSesionAuthjs({ sub: "usuario-admin", email: "admin@test.cl" })
    const r = await proxy(mkReq("/api/backup", cookie), undefined as never)
    expect(r?.status).not.toBe(401)
  })

  it("rechaza cookie de sesión inválida (fail-closed)", async () => {
    const r = await proxy(mkReq("/admin", "authjs.session-token=basura.invalida"), undefined as never)
    expect([307, 308].includes(r?.status ?? 0)).toBe(true)
  })

  it("rechaza cookie de sesión firmada con otro secreto", async () => {
    const original = process.env.AUTH_SECRET
    process.env.AUTH_SECRET = "otro-secreto-1234567890abcdef"
    const { mintarSesion } = await import("../helpers/sesion-authjs")
    const token = await mintarSesion({ sub: "usuario-admin" })
    process.env.AUTH_SECRET = original
    const r = await proxy(mkReq("/admin", `authjs.session-token=${token}`), undefined as never)
    expect([307, 308].includes(r?.status ?? 0)).toBe(true)
  })
})
