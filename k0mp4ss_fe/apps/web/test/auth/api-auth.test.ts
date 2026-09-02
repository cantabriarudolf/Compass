/* eslint-disable @typescript-eslint/no-explicit-any -- fakes de NextAuth para probar authorize */
/**
 * @vitest-environment node
 *
 * Integración real contra los handlers de Auth.js (app/api/auth/[...nextauth]):
 * danza CSRF + login credentials + sesión + rate limit D-v persistente.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { prisma } from "@/lib/prisma"
import bcrypt from "bcryptjs"

const BASE = "http://localhost"
const PASSWORD_VALIDA = "secret123"

const emailOk = `authjs-ok-${Date.now()}@test.cl`
const emailInactivo = `authjs-inactivo-${Date.now()}@test.cl`
const emailMalaPass = `authjs-bad-${Date.now()}@test.cl`
const claveRate = `ip-rate-${Date.now()}`

async function handlers() {
  return await import("@/app/api/auth/[...nextauth]/route")
}

async function obtenerCsrf(): Promise<{ csrfToken: string; cookie: string }> {
  const { GET } = await handlers()
  const res = await (GET as any)(new Request(`${BASE}/api/auth/csrf`, { headers: { "x-forwarded-proto": "http" } }))
  const datos = (await res.json()) as { csrfToken: string }
  const setCookies = res.headers.getSetCookie().map((c: string) => c.split(";")[0]!)
  return { csrfToken: datos.csrfToken, cookie: setCookies.join("; ") }
}

async function login(email: string, password: string, extraCookie?: string, ip?: string) {
  const { GET, POST } = await handlers()
  const csrf = await (GET as any)(new Request(`${BASE}/api/auth/csrf`, { headers: { "x-forwarded-proto": "http" } }))
  const { csrfToken } = (await csrf.json()) as { csrfToken: string }
  const cookies = [
    ...csrf.headers.getSetCookie().map((c: string) => c.split(";")[0]!),
    ...(extraCookie ? [extraCookie] : []),
  ].join("; ")
  return (POST as any)(
    new Request(`${BASE}/api/auth/callback/credentials`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "x-forwarded-proto": "http",
        "X-Auth-Return-Redirect": "1",
        cookie: cookies,
        ...(ip ? { "x-forwarded-for": ip } : {}),
      },
      body: new URLSearchParams({ csrfToken, email, password, callbackUrl: `${BASE}/admin` }),
    })
  )
}

async function pedirSesion(cookie?: string) {
  const { GET } = await handlers()
  return (GET as any)(
    new Request(`${BASE}/api/auth/session`, {
      headers: { "x-forwarded-proto": "http", ...(cookie ? { cookie } : {}) },
    })
  )
}

function codigoDesdeUrl(datos: { url?: string }): { error: string | null; code: string | null } {
  if (!datos.url) return { error: null, code: null }
  const url = new URL(datos.url)
  return { error: url.searchParams.get("error"), code: url.searchParams.get("code") }
}

describe("Auth.js — /api/auth/* (login credentials + sesión + D-v)", () => {
  beforeAll(async () => {
    const passwordHash = await bcrypt.hash(PASSWORD_VALIDA, 10)
    for (const u of [
      { email: emailOk, activo: true, passwordHash },
      { email: emailInactivo, activo: false, passwordHash },
      { email: emailMalaPass, activo: true, passwordHash },
    ]) {
      await prisma.usuario.upsert({ where: { email: u.email }, update: u, create: { id: `uid-${u.email}`, ...u } })
    }
  }, 30_000)

  afterAll(async () => {
    try {
      await prisma.usuario.deleteMany({ where: { email: { in: [emailOk, emailInactivo, emailMalaPass] } } })
      await prisma.rateLimitAttempt.deleteMany({ where: { clave: claveRate } })
        // intencional: bloque vacío por diseño
    } catch {
      // intencional: el fallo ya se verifica arriba
    }
  })

  it("csrf entrega token y cookie de doble submit", async () => {
    const { csrfToken, cookie } = await obtenerCsrf()
    expect(csrfToken).toBeTruthy()
    expect(cookie).toContain("authjs.csrf-token=")
  })

  it("login exitoso setea cookie de sesión y session.user.id = Usuario.id (sub)", async () => {
    const res = await login(emailOk, PASSWORD_VALIDA)
    expect(res.status).toBe(200)
    const datos = (await res.json()) as { url: string }
    const { error } = codigoDesdeUrl(datos)
    expect(error).toBeNull()
    expect(datos.url).toContain("/admin")

    const setCookies = res.headers.getSetCookie().map((c: string) => c.split(";")[0]!)
    const sesionCookie = setCookies.find((c: string) => c.startsWith("authjs.session-token="))
    expect(sesionCookie).toBeTruthy()

    const usuario = await prisma.usuario.findUnique({ where: { email: emailOk } })
    const sesionRes = await pedirSesion(sesionCookie!)
    const sesion = (await sesionRes.json()) as { user?: { id?: string; email?: string } }
    expect(sesion.user?.id).toBe(usuario!.id)
    expect(sesion.user?.email).toBe(emailOk)
  })

  it("login sin sesión previa: /api/auth/session responde null", async () => {
    const res = await pedirSesion()
    expect(res.status).toBe(200)
    expect(await res.json()).toBeNull()
  })

  it("credenciales inválidas → error=CredentialsSignin&code=credentials y fallo persistido", async () => {
    const ip = `ip-fallo-${Date.now()}`
    const res = await login(emailMalaPass, "password-erronea", undefined, ip)
    expect(res.status).toBe(200) // X-Auth-Return-Redirect: error como JSON {url}
    const datos = (await res.json()) as { url: string }
    const { error, code } = codigoDesdeUrl(datos)
    expect(error).toBe("CredentialsSignin")
    expect(code).toBe("credentials")

    const persistido = await prisma.rateLimitAttempt.count({ where: { clave: ip } })
    expect(persistido).toBe(1)
    await prisma.rateLimitAttempt.deleteMany({ where: { clave: ip } })
  })

  it("usuario inactivo → mismo code=credentials (sin enumeración)", async () => {
    const res = await login(emailInactivo, PASSWORD_VALIDA)
    const datos = (await res.json()) as { url: string }
    const { error, code } = codigoDesdeUrl(datos)
    expect(error).toBe("CredentialsSignin")
    expect(code).toBe("credentials")
  })

  it("sin csrf token → rechazado (MissingCSRF, no llega a authorize)", async () => {
    const { POST } = await handlers()
    const res = await (POST as any)(
      new Request(`${BASE}/api/auth/callback/credentials`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "x-forwarded-proto": "http",
          "X-Auth-Return-Redirect": "1",
        },
        body: new URLSearchParams({ email: emailOk, password: PASSWORD_VALIDA, callbackUrl: `${BASE}/admin` }),
      })
    )
    const datos = (await res.json()) as { url: string }
    const { error } = codigoDesdeUrl(datos)
    expect(error).toBeTruthy()
  })

  it("D-v: 10 fallos previos en BD → code=rate_limited sin verificar credenciales", async () => {
    // Siembra 10 fallos persistidos para la clave IP (ventana 15 min)
    for (let i = 0; i < 10; i++) {
      await prisma.rateLimitAttempt.create({ data: { clave: claveRate } })
    }
    // Aunque las credenciales son CORRECTAS, el límite aplica primero (fail-closed)
    const res = await login(emailOk, PASSWORD_VALIDA, undefined, claveRate)
    const datos = (await res.json()) as { url: string }
    const { error, code } = codigoDesdeUrl(datos)
    expect(error).toBe("CredentialsSignin")
    expect(code).toBe("rate_limited")
    // no setea cookie de sesión
    const setCookies = res.headers.getSetCookie().map((c: string) => c.split(";")[0]!)
    expect(setCookies.find((c: string) => c.startsWith("authjs.session-token="))).toBeFalsy()
  })

  it("D-iv SEC-011: rotar x-forwarded-for NO evade el rate limit (clave por email)", async () => {
    const emailVictima = `rate-email-${Date.now()}@test.cl`
    const ips: string[] = []
    // 10 fallos contra la MISMA cuenta con IPs rotativas (spoof de XFF)
    for (let i = 0; i < 10; i++) {
      const ip = `spoof-${Date.now()}-${i}`
      ips.push(ip)
      const res = await login(emailVictima, "password-erronea", undefined, ip)
      const datos = (await res.json()) as { url: string }
      expect(codigoDesdeUrl(datos).code).toBe("credentials")
    }
    // El contador de la clave email: acumuló los 10 fallos pese a IPs distintas
    const porEmail = await prisma.rateLimitAttempt.count({ where: { clave: `email:${emailVictima}` } })
    expect(porEmail).toBe(10)

    // 11º intento con credenciales CORRECTAS (usuario creado ahora) e IP nueva → rate_limited
    const passwordHash = await bcrypt.hash(PASSWORD_VALIDA, 10)
    await prisma.usuario.upsert({
      where: { email: emailVictima },
      update: {},
      create: { id: `uid-${emailVictima}`, email: emailVictima, activo: true, passwordHash },
    })
    const res = await login(emailVictima, PASSWORD_VALIDA, undefined, `ip-final-${Date.now()}`)
    const datos = (await res.json()) as { url: string }
    const { error, code } = codigoDesdeUrl(datos)
    expect(error).toBe("CredentialsSignin")
    expect(code).toBe("rate_limited")
    // no setea cookie de sesión
    const setCookies = res.headers.getSetCookie().map((c: string) => c.split(";")[0]!)
    expect(setCookies.find((c: string) => c.startsWith("authjs.session-token="))).toBeFalsy()

    await prisma.usuario.deleteMany({ where: { email: emailVictima } })
    await prisma.rateLimitAttempt.deleteMany({
      where: { clave: { in: [...ips, `email:${emailVictima}`] } },
    })
  }, 30_000)

  it("D-iv SEC-012: usuario inexistente → mismo error y fallos persistidos en ambas claves", async () => {
    const emailFantasma = `fantasma-${Date.now()}@test.cl`
    const ip = `ip-fantasma-${Date.now()}`
    const res = await login(emailFantasma, "lo-que-sea", undefined, ip)
    const datos = (await res.json()) as { url: string }
    const { error, code } = codigoDesdeUrl(datos)
    // mismo code que password errónea (sin enumeración por mensaje ni por timing de branch)
    expect(error).toBe("CredentialsSignin")
    expect(code).toBe("credentials")
    // fallo registrado en clave IP y clave email
    expect(await prisma.rateLimitAttempt.count({ where: { clave: ip } })).toBe(1)
    expect(await prisma.rateLimitAttempt.count({ where: { clave: `email:${emailFantasma}` } })).toBe(1)
    await prisma.rateLimitAttempt.deleteMany({
      where: { clave: { in: [ip, `email:${emailFantasma}`] } },
    })
  })

  it("login exitoso limpia los intentos de la clave (ventana reinicia)", async () => {
    const ip = `ip-limpia-${Date.now()}`
    await prisma.rateLimitAttempt.create({ data: { clave: ip } })
    const res = await login(emailOk, PASSWORD_VALIDA, undefined, ip)
    const datos = (await res.json()) as { url: string }
    expect(codigoDesdeUrl(datos).error).toBeNull()
    const restantes = await prisma.rateLimitAttempt.count({ where: { clave: ip } })
    expect(restantes).toBe(0)
  })

  it("signout invalida la cookie de sesión", async () => {
    const { POST } = await handlers()
    const loginRes = await login(emailOk, PASSWORD_VALIDA)
    const sesionCookie = loginRes.headers
      .getSetCookie()
      .map((c: string) => c.split(";")[0]!)
      .find((c: string) => c.startsWith("authjs.session-token="))

    const csrfRes = await pedirCsrfBruto()
    const cookies = [sesionCookie!, ...csrfRes.cookies].join("; ")
    const res = await (POST as any)(
      new Request(`${BASE}/api/auth/signout`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "x-forwarded-proto": "http",
          "X-Auth-Return-Redirect": "1",
          cookie: cookies,
        },
        body: new URLSearchParams({ csrfToken: csrfRes.csrfToken, callbackUrl: `${BASE}/` }),
      })
    )
    expect(res.status).toBe(200)
    const rawCookies = res.headers.getSetCookie()
    const limpiada = rawCookies
      .map((c: string) => c.split(";")[0]!)
      .find((c: string) => c.startsWith("authjs.session-token="))
    // Auth.js invalida con valor vacío/expirado (JWT: stateless, limpia cookie)
    expect(limpiada !== undefined).toBe(true)
    // la cookie limpiada debe tener valor vacío o estar expirada
    const valorLimpio = limpiada!.split("=")[1] ?? ""
    const esVacia = valorLimpio === "" || rawCookies.some((c: string) => c.includes("Max-Age=0") || c.includes("Expires=Thu, 01 Jan 1970"))
    expect(esVacia).toBe(true)
    // sin cookie no hay sesión
    const sesionResVacia = await pedirSesion()
    expect(await sesionResVacia.json()).toBeNull()
  })
})

async function pedirCsrfBruto(): Promise<{ csrfToken: string; cookies: string[] }> {
  const { GET } = await handlers()
  const res = await (GET as any)(new Request(`${BASE}/api/auth/csrf`, { headers: { "x-forwarded-proto": "http" } }))
  const { csrfToken } = (await res.json()) as { csrfToken: string }
  return { csrfToken, cookies: res.headers.getSetCookie().map((c: string) => c.split(";")[0]!) }
}
