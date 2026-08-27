import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { NextRequest } from "next/server"
import proxy from "@/proxy"
import { crearToken, nuevaExpiracion } from "@/lib/auth"

function mkReq(pathname: string, cookie?: string) {
  const url = `http://localhost${pathname}`
  const headers: Record<string, string> = {}
  if (cookie) headers["cookie"] = cookie
  const req = new NextRequest(url, { headers })
  // NextRequest cookies API reads from header, ok
  return req
}

describe("proxy (middleware)", () => {
  const originalSecret = process.env.AUTH_SECRET
  beforeEach(() => {
    process.env.AUTH_SECRET = "test-secret-12345678"
  })
  afterEach(() => {
    if (originalSecret === undefined) delete process.env.AUTH_SECRET
    else process.env.AUTH_SECRET = originalSecret
  })

  it("permite rutas públicas /ingresar y /api/auth sin sesión", () => {
    const r1 = proxy(mkReq("/ingresar"))
    expect(r1.headers.get("x-middleware-next")).not.toBeNull // NextResponse.next() marker, or status 200
    // alternativa: proxy no redirige
    expect(r1.status).not.toBe(401)
    expect(r1.status).not.toBe(307)

    const r2 = proxy(mkReq("/api/auth/login"))
    expect(r2.status).not.toBe(401)

    const r3 = proxy(mkReq("/api/auth/session"))
    expect(r3.status).not.toBe(401)
  })

  it("permite ruta no protegida sin sesión", () => {
    const r = proxy(mkReq("/"))
    expect(r.status).not.toBe(401)
    // NextResponse.next() returns 200-ish with header
    expect([200, 307, 308].includes(r.status) || r.headers.get("x-middleware-next") !== null).toBeTruthy()
  })

  it("bloquea /admin sin sesión con redirect a /ingresar?next=", () => {
    const r = proxy(mkReq("/admin/qa-lab"))
    expect([307, 308].includes(r.status)).toBe(true)
    const loc = r.headers.get("location") ?? ""
    expect(loc).toContain("/ingresar")
    expect(loc).toContain(encodeURIComponent("/admin/qa-lab"))
  })

  it("bloquea /api/* sin sesión con 401 JSON", async () => {
    const r = proxy(mkReq("/api/whatever"))
    expect(r.status).toBe(401)
    const j = await r.json()
    expect(j.error).toMatch(/No autenticado/i)
  })

  it("permite /admin con sesión válida", () => {
    const token = crearToken({ sub: "admin@compass.local", exp: nuevaExpiracion() })
    const r = proxy(mkReq("/admin/configuracion", `compass_session=${token}`))
    // should be NextResponse.next() (not redirect nor 401)
    expect(r.status).not.toBe(401)
    expect([200].includes(r.status) || r.headers.get("x-middleware-next") !== null).toBeTruthy()
  })

  it("permite /api con sesión válida", () => {
    const token = crearToken({ sub: "a", exp: nuevaExpiracion() })
    const r = proxy(mkReq("/api/backup", `compass_session=${token}`))
    expect(r.status).not.toBe(401)
  })

  it("rechaza token expirado como no autenticado", () => {
    const token = crearToken({ sub: "a", exp: Date.now() - 1000 })
    const r = proxy(mkReq("/admin", `compass_session=${token}`))
    expect([307, 308].includes(r.status)).toBe(true)
  })
})
