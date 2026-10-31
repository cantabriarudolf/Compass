/**
 * @vitest-environment node
 *
 * `/api/auth/2fa/verify-setup` — confirmación del enrolamiento 2FA (P3).
 *
 * Cubre las ramas que no toca `test/auth/two-factor.test.ts`: falta de sesión,
 * cuerpo inválido, rate limit por usuario (10 intentos/15 min), usuario
 * inactivo/inexistente, 2FA ya activo, enrolamiento sin secreto pendiente y el
 * camino de código inválido → fallo registrado. El happy path se re-verifica acá
 * porque es el que confirma que el éxito limpia los intentos fallidos.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest"
import { NextRequest } from "next/server"
import speakeasy from "speakeasy"
import { prismaCifrado as prisma } from "@/lib/prisma-cifrado"
import { prisma as prismaPlano } from "@/lib/prisma"
import { MAX_INTENTOS, limpiarIntentos } from "@/lib/rate-limit"
import { generarSecreto2FA, parsearBackupCodes } from "@/lib/two-factor"

const state = vi.hoisted(() => ({ cookie: "" }))
vi.mock("next/headers", () => ({
  headers: () =>
    Promise.resolve(
      new Headers(
        state.cookie
          ? { cookie: state.cookie, "x-forwarded-proto": "http" }
          : { "x-forwarded-proto": "http" }
      )
    ),
}))

const AUTH_SECRET = "test-secret-12345678"

const emailPendiente = "vs-pendiente@test.cl"
const emailActivo = "vs-activo@test.cl"
const emailSinSecreto = "vs-sin-secreto@test.cl"
const emailInactivo = "vs-inactivo@test.cl"

const idDe = (email: string): string => email.split("@")[0] ?? email

const secreto = new Map<string, string>()
const claveDe = (id: string): string => `2fa-setup:${id}`

/**
 * Reloj congelado: el TOTP se deriva del reloj y la ruta lo verifica unos ms
 * después, así que con reloj real el test dependía de no cruzar un paso de 30 s
 * (ventana ±1 de `verificarCodigo2FA`) entre generar y verificar.
 * Se congela solo `Date` (los temporizadores de bcrypt/Prisma siguen reales) y se
 * captura el instante real al cargar el archivo: `registrarFallo` limpia con
 * `Date.now()` los intentos fuera de la ventana de 15 min, así que una fecha
 * absoluta en el pasado borraría los intentos de las suites que comparten la base.
 */
const HORA_FIJA = new Date()

function tokenActual(secretoBase32: string): string {
  return speakeasy.totp({ secret: secretoBase32, encoding: "base32" })
}

async function conSesion(usuarioId: string, email: string, fn: () => Promise<void>): Promise<void> {
  const { cookieSesionAuthjs } = await import("../helpers/sesion-authjs")
  state.cookie = await cookieSesionAuthjs({ sub: usuarioId, email })
  try {
    await fn()
  } finally {
    state.cookie = ""
  }
}

async function POST(body: unknown): Promise<Response> {
  const { POST: handler } = await import("@/app/api/auth/2fa/verify-setup/route")
  return handler(
    new NextRequest("http://localhost/api/auth/2fa/verify-setup", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
    })
  )
}

describe("POST /api/auth/2fa/verify-setup — ramas del enrolamiento", () => {
  beforeAll(async () => {
    process.env.AUTH_SECRET = AUTH_SECRET
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(HORA_FIJA)
    const definiciones: Array<{
      email: string
      activo: boolean
      enabled: boolean
      conSecreto: boolean
    }> = [
      { email: emailPendiente, activo: true, enabled: false, conSecreto: true },
      { email: emailActivo, activo: true, enabled: true, conSecreto: true },
      { email: emailSinSecreto, activo: true, enabled: false, conSecreto: false },
      { email: emailInactivo, activo: false, enabled: false, conSecreto: true },
    ]
    for (const def of definiciones) {
      const s = def.conSecreto ? (await generarSecreto2FA(def.email)).secretoBase32 : null
      if (s) secreto.set(def.email, s)
      await prisma.usuario.upsert({
        where: { email: def.email },
        update: {
          activo: def.activo,
          twoFactorEnabled: def.enabled,
          twoFactorSecret: s,
          twoFactorBackupCodes: null,
        },
        create: {
          id: idDe(def.email),
          email: def.email,
          activo: def.activo,
          twoFactorEnabled: def.enabled,
          twoFactorSecret: s,
        },
      })
    }
  }, 60_000)

  beforeEach(async () => {
    state.cookie = ""
    for (const email of [emailPendiente, emailActivo, emailSinSecreto, emailInactivo]) {
      await limpiarIntentos(claveDe(idDe(email)))
    }
    // El usuario pendiente vuelve a su estado base para el siguiente test.
    await prisma.usuario.update({
      where: { id: idDe(emailPendiente) },
      data: {
        activo: true,
        twoFactorEnabled: false,
        twoFactorSecret: secreto.get(emailPendiente) ?? null,
        twoFactorBackupCodes: null,
      },
    })
  })

  afterAll(async () => {
    try {
      state.cookie = ""
      for (const email of [emailPendiente, emailActivo, emailSinSecreto, emailInactivo]) {
        await limpiarIntentos(claveDe(idDe(email)))
        await prismaPlano.usuario.delete({ where: { id: idDe(email) } }).catch(() => {})
      }
    } catch {
      // limpieza best-effort
    } finally {
      vi.useRealTimers()
    }
  })

  it("sin sesión → 401", async () => {
    state.cookie = ""
    const res = await POST({ codigo: "123456" })
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: "No autenticado." })
  })

  it("sin código → 400", async () => {
    await conSesion(idDe(emailPendiente), emailPendiente, async () => {
      const res = await POST({})
      expect(res.status).toBe(400)
      expect(await res.json()).toEqual({ error: "El código es obligatorio." })
    })
  })

  it("código en blanco o de tipo incorrecto → 400 sin tocar la BD", async () => {
    await conSesion(idDe(emailPendiente), emailPendiente, async () => {
      for (const body of [{ codigo: "   " }, { codigo: 123456 }]) {
        const res = await POST(body)
        expect(res.status).toBe(400)
        expect(await res.json()).toEqual({ error: "El código es obligatorio." })
      }
      const enBd = await prisma.usuario.findUnique({ where: { id: idDe(emailPendiente) } })
      expect(enBd?.twoFactorEnabled).toBe(false)
    })
  })

  it(`con ${MAX_INTENTOS} fallos previos del usuario → 429 sin verificar el código`, async () => {
    const id = idDe(emailPendiente)
    // `createdAt` explícito dentro de la ventana congelada: el default `now()`
    // lo resuelve el motor de Prisma, que no ve el reloj falseado.
    const reciente = new Date(HORA_FIJA.getTime() - 60_000)
    await prismaPlano.rateLimitAttempt.createMany({
      data: Array.from({ length: MAX_INTENTOS }, () => ({
        clave: claveDe(id),
        createdAt: reciente,
      })),
    })
    await conSesion(id, emailPendiente, async () => {
      const res = await POST({ codigo: tokenActual(secreto.get(emailPendiente)!) })
      expect(res.status).toBe(429)
      expect(await res.json()).toEqual({
        error: "Demasiados intentos. Espere unos minutos.",
      })
      const enBd = await prisma.usuario.findUnique({ where: { id } })
      expect(enBd?.twoFactorEnabled).toBe(false)
    })
  })

  it("usuario inactivo → 401", async () => {
    await conSesion(idDe(emailInactivo), emailInactivo, async () => {
      const res = await POST({ codigo: tokenActual(secreto.get(emailInactivo)!) })
      expect(res.status).toBe(401)
      expect(await res.json()).toEqual({ error: "Usuario no encontrado o inactivo." })
    })
  })

  it("cookie de una sesión cuyo usuario ya no existe → 401", async () => {
    await conSesion("vs-usuario-fantasma", "fantasma@test.cl", async () => {
      const res = await POST({ codigo: "123456" })
      expect(res.status).toBe(401)
      expect(await res.json()).toEqual({ error: "Usuario no encontrado o inactivo." })
    })
  })

  it("2FA ya activo → 409", async () => {
    await conSesion(idDe(emailActivo), emailActivo, async () => {
      const res = await POST({ codigo: "123456" })
      expect(res.status).toBe(409)
      expect(await res.json()).toEqual({ error: "2FA ya está activo." })
    })
  })

  it("sin secreto pendiente → 400", async () => {
    await conSesion(idDe(emailSinSecreto), emailSinSecreto, async () => {
      const res = await POST({ codigo: "123456" })
      expect(res.status).toBe(400)
      expect(await res.json()).toEqual({
        error: "Sin enrolamiento pendiente. Genere un secreto primero.",
      })
    })
  })

  it("código inválido → 401, registra el fallo y no activa", async () => {
    const id = idDe(emailPendiente)
    await conSesion(id, emailPendiente, async () => {
      const valido = tokenActual(secreto.get(emailPendiente)!)
      const distinto = valido === "000000" ? "000001" : "000000"
      const res = await POST({ codigo: distinto })
      expect(res.status).toBe(401)
      expect(await res.json()).toEqual({ error: "Código inválido." })
      const enBd = await prisma.usuario.findUnique({ where: { id } })
      expect(enBd?.twoFactorEnabled).toBe(false)
      expect(
        await prismaPlano.rateLimitAttempt.count({ where: { clave: claveDe(id) } })
      ).toBe(1)
    })
  })

  it("código válido → 200 con 10 backup codes y limpia los intentos fallidos", async () => {
    const id = idDe(emailPendiente)
    await conSesion(id, emailPendiente, async () => {
      const valido = tokenActual(secreto.get(emailPendiente)!)
      // Un fallo previo: el éxito debe limpiar la ventana de intentos.
      await POST({ codigo: valido === "000000" ? "000001" : "000000" })
      expect(await prismaPlano.rateLimitAttempt.count({ where: { clave: claveDe(id) } })).toBe(1)
      const res = await POST({ codigo: valido })
      expect(res.status).toBe(200)
      const json = (await res.json()) as { ok: boolean; backupCodes: string[] }
      expect(json.ok).toBe(true)
      expect(json.backupCodes).toHaveLength(10)

      const enBd = await prisma.usuario.findUnique({ where: { id } })
      expect(enBd?.twoFactorEnabled).toBe(true)
      expect(parsearBackupCodes(enBd?.twoFactorBackupCodes)).toHaveLength(10)
      expect(
        await prismaPlano.rateLimitAttempt.count({ where: { clave: claveDe(id) } })
      ).toBe(0)
    })
  }, 30_000)
})
