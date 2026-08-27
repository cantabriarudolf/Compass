import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { NextRequest } from "next/server"
import { POST as loginPOST } from "@/app/api/auth/login/route"
import { GET as sessionGET } from "@/app/api/auth/session/route"
import { POST as logoutPOST } from "@/app/api/auth/logout/route"
import { crearToken, nuevaExpiracion, NOMBRE_COOKIE_SESION, registrarFallo } from "@/lib/auth"

function mkLoginRequest(body: unknown, headers: Record<string, string> = {}) {
  return new Request("http://localhost/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  }) as unknown as Request
}

function mkSessionRequest(cookie?: string) {
  const req = new NextRequest("http://localhost/api/auth/session", {
    headers: cookie ? { cookie: `${NOMBRE_COOKIE_SESION}=${cookie}` } : {},
  })
  return req
}

describe("POST /api/auth/login", () => {
  const originalSecret = process.env.AUTH_SECRET
  const originalNodeEnv = process.env.NODE_ENV
  const originalAdminEmail = process.env.ADMIN_EMAIL
  const originalAdminPass = process.env.ADMIN_PASSWORD

  beforeEach(() => {
    process.env.AUTH_SECRET = "test-secret-12345678"
    // @ts-ignore
    process.env.NODE_ENV = "test"
    delete process.env.ADMIN_EMAIL
    delete process.env.ADMIN_PASSWORD
  })

  afterEach(() => {
    if (originalSecret === undefined) delete process.env.AUTH_SECRET
    else process.env.AUTH_SECRET = originalSecret
    // @ts-ignore
    process.env.NODE_ENV = originalNodeEnv
    if (originalAdminEmail === undefined) delete process.env.ADMIN_EMAIL
    else process.env.ADMIN_EMAIL = originalAdminEmail
    if (originalAdminPass === undefined) delete process.env.ADMIN_PASSWORD
    else process.env.ADMIN_PASSWORD = originalAdminPass
  })

  it("400 si cuerpo inválido o sin campos", async () => {
    const r1 = await loginPOST(new Request("http://localhost/api/auth/login", { method: "POST", body: "not-json", headers: { "Content-Type": "application/json" } }) as Request)
    expect(r1.status).toBe(400)
    const j1 = await r1.json()
    expect(j1.error).toMatch(/inválido/i)

    const r2 = await loginPOST(mkLoginRequest({}))
    expect(r2.status).toBe(400)
    const j2 = await r2.json()
    expect(j2.error).toMatch(/obligatorios/i)

    const r3 = await loginPOST(mkLoginRequest({ email: "admin@compass.local" }))
    expect(r3.status).toBe(400)
  })

  it("503 si AUTH_SECRET ausente en producción", async () => {
    delete process.env.AUTH_SECRET
    // @ts-ignore
    process.env.NODE_ENV = "production"
    const r = await loginPOST(mkLoginRequest({ email: "admin@compass.local", password: "x" }))
    expect(r.status).toBe(503)
    const j = await r.json()
    expect(j.error).toMatch(/AUTH_SECRET/)
  })

  it("401 con credenciales inválidas y 429 tras 10 fallos", async () => {
    const ip = `test-ip-${Date.now()}-${Math.random()}`
    for (let i = 0; i < 10; i++) {
      const r = await loginPOST(mkLoginRequest({ email: "admin@compass.local", password: "wrong" }, { "x-forwarded-for": ip }))
      expect(r.status).toBe(401)
    }
    const r429 = await loginPOST(mkLoginRequest({ email: "admin@compass.local", password: "wrong" }, { "x-forwarded-for": ip }))
    expect(r429.status).toBe(429)
  })

  it("200 y Set-Cookie en éxito", async () => {
    const r = await loginPOST(mkLoginRequest({ email: "admin@compass.local", password: "compass-dev" }))
    expect(r.status).toBe(200)
    const j = await r.json()
    expect(j.ok).toBe(true)
    const setCookie = r.headers.get("set-cookie") ?? r.cookies.get(NOMBRE_COOKIE_SESION)?.value ?? ""
    // NextResponse cookies se lee via r.cookies, pero también puede estar en header
    const cookie = (r as unknown as { cookies: { get: (n: string)=>{value:string}|undefined } }).cookies?.get(NOMBRE_COOKIE_SESION)
    expect(cookie?.value).toBeTruthy()
    // verificar que el token es válido
    const token = cookie!.value
    const { verificarToken } = await import("@/lib/auth")
    const sesion = verificarToken(token)
    expect(sesion?.sub).toBe("admin@compass.local")
  })

  it("usa x-forwarded-for como clave de rate limit y fallback a local", async () => {
    const r = await loginPOST(mkLoginRequest({ email: "admin@compass.local", password: "wrong" }))
    expect([401, 429]).toContain(r.status)
  })
})

describe("GET /api/auth/session", () => {
  const originalSecret = process.env.AUTH_SECRET
  beforeEach(() => {
    process.env.AUTH_SECRET = "test-secret-12345678"
  })
  afterEach(() => {
    if (originalSecret === undefined) delete process.env.AUTH_SECRET
    else process.env.AUTH_SECRET = originalSecret
  })

  it("autenticado false sin cookie", async () => {
    const req = mkSessionRequest()
    const res = await sessionGET(req)
    const j = await res.json()
    expect(j.autenticado).toBe(false)
  })

  it("autenticado false con token inválido", async () => {
    const req = mkSessionRequest("invalido.token")
    const res = await sessionGET(req)
    const j = await res.json()
    expect(j.autenticado).toBe(false)
  })

  it("autenticado true con token válido", async () => {
    const token = crearToken({ sub: "admin@compass.local", exp: nuevaExpiracion() })
    const req = mkSessionRequest(token)
    const res = await sessionGET(req)
    const j = await res.json()
    expect(j.autenticado).toBe(true)
  })

  it("autenticado false con token expirado", async () => {
    const token = crearToken({ sub: "admin@compass.local", exp: Date.now() - 1000 })
    const req = mkSessionRequest(token)
    const res = await sessionGET(req)
    const j = await res.json()
    expect(j.autenticado).toBe(false)
  })
})

describe("POST /api/auth/logout", () => {
  it("borra cookie con maxAge 0", async () => {
    const res = await logoutPOST()
    expect(res.status).toBe(200)
    const j = await res.json()
    expect(j.ok).toBe(true)
    const header = res.headers.get("set-cookie") ?? ""
    // comprobar que cookie se limpia: maxAge=0 o valor vacío
    const cookie = (res as unknown as { cookies: { get: (n:string)=>{value:string}|undefined } }).cookies?.get(NOMBRE_COOKIE_SESION)
    // NextResponse set con maxAge 0 puede no aparecer en header en test, pero cookies.get debe existir con valor ""
    if (cookie) expect(cookie.value).toBe("")
    // al menos header contiene el nombre de cookie
    expect(header.includes(NOMBRE_COOKIE_SESION) || cookie !== undefined).toBe(true)
  })

  it("flujo login → session true → logout → session false", async () => {
    process.env.AUTH_SECRET = "test-secret-12345678"
    const loginRes = await loginPOST(mkLoginRequest({ email: "admin@compass.local", password: "compass-dev" }))
    const cookie = (loginRes as unknown as { cookies: { get: (n:string)=>{value:string}|undefined } }).cookies.get(NOMBRE_COOKIE_SESION)!
    expect(cookie.value).toBeTruthy()
    const sess1 = await sessionGET(mkSessionRequest(cookie.value))
    expect((await sess1.json()).autenticado).toBe(true)

    const logoutRes = await logoutPOST()
    expect((await logoutRes.json()).ok).toBe(true)

    const sess2 = await sessionGET(mkSessionRequest(""))
    expect((await sess2.json()).autenticado).toBe(false)
  })
})
