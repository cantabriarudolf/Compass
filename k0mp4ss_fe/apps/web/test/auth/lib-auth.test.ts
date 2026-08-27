import { describe, it, expect, beforeEach, vi, afterEach } from "vitest"
import {
  crearToken,
  verificarToken,
  credencialesValidas,
  excedeIntentos,
  registrarFallo,
  cookieSesion,
  nuevaExpiracion,
  NOMBRE_COOKIE_SESION,
} from "@/lib/auth"

const ORIGINAL_ENV = { ...process.env }

describe("lib/auth — verificarToken", () => {
  const originalSecret = process.env.AUTH_SECRET
  const originalNodeEnv = process.env.NODE_ENV

  beforeEach(() => {
    vi.useFakeTimers()
    // asegurar secreto dev disponible
    process.env.AUTH_SECRET = "test-secret-12345678"
    // @ts-ignore
    process.env.NODE_ENV = "test"
  })

  afterEach(() => {
    vi.useRealTimers()
    if (originalSecret === undefined) delete process.env.AUTH_SECRET
    else process.env.AUTH_SECRET = originalSecret
    // @ts-ignore
    process.env.NODE_ENV = originalNodeEnv
  })

  it("roundtrip válido", () => {
    const exp = Date.now() + 60_000
    const token = crearToken({ sub: "admin@compass.local", exp })
    const sesion = verificarToken(token)
    expect(sesion).toEqual({ sub: "admin@compass.local", exp })
  })

  it("retorna null si expirado", () => {
    const exp = Date.now() - 1000
    const token = crearToken({ sub: "admin@compass.local", exp })
    expect(verificarToken(token)).toBeNull()
  })

  it("retorna null si firma inválida (carga alterada)", () => {
    const exp = Date.now() + 60_000
    const token = crearToken({ sub: "admin@compass.local", exp })
    const [carga, firma] = token.split(".")
    const cargaAlterada = Buffer.from(JSON.stringify({ sub: "otro@evil.cl", exp })).toString("base64url")
    expect(verificarToken(`${cargaAlterada}.${firma}`)).toBeNull()
    // también firma alterada
    expect(verificarToken(`${carga}.firma_invalida`)).toBeNull()
  })

  it("retorna null si payload no es JSON o sin sub/exp", async () => {
    // token con carga no JSON
    const cargaInvalida = Buffer.from("no-json").toString("base64url")
    const tokenInvalido = `${cargaInvalida}.firma`
    // debe fallar por firma primero
    expect(verificarToken(tokenInvalido)).toBeNull()
    // token con exp no number
    const carga2 = Buffer.from(JSON.stringify({ sub: "a", exp: "no-number" })).toString("base64url")
    // creamos token manualmente con carga inválida pero firmada con secreto real
    // para que pase firma, necesitamos firmar carga2 con el mismo secreto
    const { createHmac } = await import("node:crypto")
    const secret = process.env.AUTH_SECRET!
    const firmaValida = createHmac("sha256", secret).update(carga2).digest("base64url")
    expect(verificarToken(`${carga2}.${firmaValida}`)).toBeNull()
  })

  it("retorna null si token nulo o sin punto", () => {
    expect(verificarToken(null)).toBeNull()
    expect(verificarToken(undefined)).toBeNull()
    expect(verificarToken("")).toBeNull()
    expect(verificarToken("sinpunto")).toBeNull()
  })

  it("retorna null en producción sin AUTH_SECRET", async () => {
    // preservar
    const savedSecret = process.env.AUTH_SECRET
    const savedNode = process.env.NODE_ENV
    delete process.env.AUTH_SECRET
    // @ts-ignore
    process.env.NODE_ENV = "production"
    // limpiar cache de secreto? secreto() lee env cada vez, no cacheado
    const token = "abc.def"
    expect(verificarToken(token)).toBeNull()
    // restaurar
    if (savedSecret !== undefined) process.env.AUTH_SECRET = savedSecret
    // @ts-ignore
    process.env.NODE_ENV = savedNode
  })

  it("crea cookie con atributos esperados", () => {
    const token = crearToken({ sub: "a", exp: Date.now() + 1000 })
    const cookie = cookieSesion(token)
    expect(cookie.name).toBe(NOMBRE_COOKIE_SESION)
    expect(cookie.value).toBe(token)
    expect(cookie.httpOnly).toBe(true)
    expect(cookie.sameSite).toBe("lax")
    expect(cookie.path).toBe("/")
    expect(cookie.maxAge).toBe(30 * 24 * 60 * 60)
  })

  it("nuevaExpiracion es ~30 días en futuro", () => {
    const antes = Date.now()
    const exp = nuevaExpiracion()
    const despues = Date.now()
    const treintaDias = 30 * 24 * 60 * 60 * 1000
    expect(exp).toBeGreaterThanOrEqual(antes + treintaDias - 1000)
    expect(exp).toBeLessThanOrEqual(despues + treintaDias + 1000)
  })
})

describe("lib/auth — credencialesValidas", () => {
  afterEach(() => {
    // restaurar env original
    for (const k of Object.keys(process.env)) {
      if (!(k in ORIGINAL_ENV)) delete process.env[k]
    }
    for (const [k, v] of Object.entries(ORIGINAL_ENV)) {
      if (v !== undefined) process.env[k] = v
    }
  })

  it("valida contra defaults en dev (admin@compass.local / compass-dev)", () => {
    delete process.env.ADMIN_EMAIL
    delete process.env.ADMIN_PASSWORD
    // @ts-ignore
    process.env.NODE_ENV = "test"
    expect(credencialesValidas("admin@compass.local", "compass-dev")).toBe(true)
    expect(credencialesValidas("admin@compass.local", "wrong")).toBe(false)
  })

  it("usa env ADMIN_EMAIL/ADMIN_PASSWORD cuando están definidos", () => {
    process.env.ADMIN_EMAIL = "owner@example.cl"
    process.env.ADMIN_PASSWORD = "s3cret!"
    expect(credencialesValidas("owner@example.cl", "s3cret!")).toBe(true)
    expect(credencialesValidas("owner@example.cl", "other")).toBe(false)
    expect(credencialesValidas("admin@compass.local", "s3cret!")).toBe(false)
  })

  it("en producción sin ADMIN_PASSWORD falla siempre (fail-closed)", () => {
    delete process.env.ADMIN_PASSWORD
    delete process.env.ADMIN_EMAIL
    // @ts-ignore
    process.env.NODE_ENV = "production"
    expect(credencialesValidas("admin@compass.local", "compass-dev")).toBe(false)
    expect(credencialesValidas("admin@compass.local", "")).toBe(false)
  })
})

describe("lib/auth — rate limit excedeIntentos", () => {
  it("permite hasta MAX y bloquea al 11", () => {
    const clave = `test-rate-${Date.now()}-${Math.random()}`
    expect(excedeIntentos(clave)).toBe(false)
    for (let i = 0; i < 10; i++) registrarFallo(clave)
    expect(excedeIntentos(clave)).toBe(true)
    // clave distinta no bloqueada
    expect(excedeIntentos(clave + "-otra")).toBe(false)
  })

  it("ventana expira después de 15 min", () => {
    vi.useFakeTimers()
    const clave = `test-ventana-${Date.now()}-${Math.random()}`
    for (let i = 0; i < 10; i++) registrarFallo(clave)
    expect(excedeIntentos(clave)).toBe(true)
    // avanzar 15min + 1ms
    vi.advanceTimersByTime(15 * 60 * 1000 + 1)
    expect(excedeIntentos(clave)).toBe(false)
    // registrar nuevo fallo reinicia ventana
    registrarFallo(clave)
    expect(excedeIntentos(clave)).toBe(false)
    vi.useRealTimers()
  })

  it("primer fallo crea registro con reset futuro", () => {
    const clave = `test-first-${Date.now()}-${Math.random()}`
    registrarFallo(clave)
    expect(excedeIntentos(clave)).toBe(false)
    for (let i = 1; i < 10; i++) registrarFallo(clave)
    expect(excedeIntentos(clave)).toBe(true)
  })
})
