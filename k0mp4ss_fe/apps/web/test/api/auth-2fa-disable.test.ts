/**
 * @vitest-environment node
 *
 * `/api/auth/2fa/disable` — baja de 2FA con contraseña (P3).
 *
 * Ramas que no cubre `test/auth/two-factor.test.ts`: falta de sesión, cuerpo
 * inválido, usuario inactivo o sin passwordHash, 2FA no activo y contraseña
 * incorrecta (que no debe tocar nada). El happy path se re-verifica porque es el
 * que confirma que la baja limpia secreto/códigos e invalida sesiones.
 *
 * F24: la baja también limita los intentos (mismo criterio que verify-setup:
 * `MAX_INTENTOS` fallos por usuario en la ventana de 15 min). Se fija que el
 * umbral corta antes de comparar la contraseña y que el éxito limpia el contador.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest"
import { NextRequest } from "next/server"
import bcrypt from "bcryptjs"
import { prismaCifrado as prisma } from "@/lib/prisma-cifrado"
import { prisma as prismaPlano } from "@/lib/prisma"
import { MAX_INTENTOS, limpiarIntentos } from "@/lib/rate-limit"
import {
  generarBackupCodes,
  generarSecreto2FA,
  hashearBackupCodes,
  parsearBackupCodes,
} from "@/lib/two-factor"

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
const PASSWORD = "Secret123"

const emailActiva = "dis-activa@test.cl"
const emailSin2FA = "dis-sin-2fa@test.cl"
const emailInactivo = "dis-inactivo@test.cl"
const emailSinHash = "dis-sin-hash@test.cl"

const CUENTAS = [emailActiva, emailSin2FA, emailInactivo, emailSinHash]

const idDe = (email: string): string => email.split("@")[0] ?? email

/** Clave de rate limit de la baja: espeja `2fa-disable:<usuarioId>` de la ruta. */
const claveDe = (id: string): string => `2fa-disable:${id}`

/** Backup codes reales en la fixture: la baja debe borrar códigos, no un array vacío. */
const BACKUP_CODES_FIXTURE = 3

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
  const { POST: handler } = await import("@/app/api/auth/2fa/disable/route")
  return handler(
    new NextRequest("http://localhost/api/auth/2fa/disable", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
    })
  )
}

describe("POST /api/auth/2fa/disable — baja con contraseña", () => {
  beforeAll(async () => {
    process.env.AUTH_SECRET = AUTH_SECRET
    const passwordHash = await bcrypt.hash(PASSWORD, 10)
    const secreto = (await generarSecreto2FA(emailActiva)).secretoBase32
    await prisma.usuario.upsert({
      where: { email: emailSin2FA },
      update: { activo: true, passwordHash, twoFactorEnabled: false },
      create: {
        id: idDe(emailSin2FA),
        email: emailSin2FA,
        activo: true,
        passwordHash,
        twoFactorEnabled: false,
      },
    })
    await prisma.usuario.upsert({
      where: { email: emailInactivo },
      update: { activo: false, passwordHash, twoFactorEnabled: true, twoFactorSecret: secreto },
      create: {
        id: idDe(emailInactivo),
        email: emailInactivo,
        activo: false,
        passwordHash,
        twoFactorEnabled: true,
        twoFactorSecret: secreto,
      },
    })
    await prisma.usuario.upsert({
      where: { email: emailSinHash },
      update: { activo: true, passwordHash: null, twoFactorEnabled: true },
      create: {
        id: idDe(emailSinHash),
        email: emailSinHash,
        activo: true,
        passwordHash: null,
        twoFactorEnabled: true,
      },
    })
  }, 60_000)

  beforeEach(async () => {
    state.cookie = ""
    // El contador de intentos es global por clave: cada test arranca sin fallos.
    for (const email of CUENTAS) await limpiarIntentos(claveDe(idDe(email)))
    // La cuenta con 2FA activo se restaura para cada test (el happy path la baja).
    const secreto = (await generarSecreto2FA(emailActiva)).secretoBase32
    const passwordHash = await bcrypt.hash(PASSWORD, 10)
    const backupCodes = await hashearBackupCodes(generarBackupCodes(BACKUP_CODES_FIXTURE))
    await prisma.usuario.upsert({
      where: { email: emailActiva },
      update: {
        activo: true,
        passwordHash,
        twoFactorEnabled: true,
        twoFactorSecret: secreto,
        twoFactorBackupCodes: backupCodes,
      },
      create: {
        id: idDe(emailActiva),
        email: emailActiva,
        activo: true,
        passwordHash,
        twoFactorEnabled: true,
        twoFactorSecret: secreto,
        twoFactorBackupCodes: backupCodes,
      },
    })
  }, 60_000)

  afterAll(async () => {
    try {
      state.cookie = ""
      for (const email of CUENTAS) {
        await limpiarIntentos(claveDe(idDe(email)))
        await prismaPlano.usuario.delete({ where: { id: idDe(email) } }).catch(() => {})
      }
    } catch {
      // limpieza best-effort
    }
  })

  it("sin sesión → 401", async () => {
    state.cookie = ""
    const res = await POST({ password: PASSWORD })
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: "No autenticado." })
  })

  it("sin contraseña → 400", async () => {
    await conSesion(idDe(emailActiva), emailActiva, async () => {
      for (const body of [{}, { password: "" }, { password: 12345 }]) {
        const res = await POST(body)
        expect(res.status).toBe(400)
        expect(await res.json()).toEqual({ error: "La contraseña es obligatoria." })
      }
    })
  })

  it("usuario inactivo → 401 y no toca el secreto", async () => {
    await conSesion(idDe(emailInactivo), emailInactivo, async () => {
      const res = await POST({ password: PASSWORD })
      expect(res.status).toBe(401)
      expect(await res.json()).toEqual({ error: "Usuario no encontrado o inactivo." })
      const enBd = await prisma.usuario.findUnique({ where: { id: idDe(emailInactivo) } })
      expect(enBd?.twoFactorEnabled).toBe(true)
      expect(enBd?.twoFactorSecret).toBeTruthy()
    })
  })

  it("usuario sin passwordHash → 401", async () => {
    await conSesion(idDe(emailSinHash), emailSinHash, async () => {
      const res = await POST({ password: PASSWORD })
      expect(res.status).toBe(401)
      expect(await res.json()).toEqual({ error: "Usuario no encontrado o inactivo." })
    })
  })

  it("2FA no activo → 409", async () => {
    await conSesion(idDe(emailSin2FA), emailSin2FA, async () => {
      const res = await POST({ password: PASSWORD })
      expect(res.status).toBe(409)
      expect(await res.json()).toEqual({ error: "2FA no está activo." })
    })
  })

  it("contraseña incorrecta → 401, registra un intento y sigue activo", async () => {
    const id = idDe(emailActiva)
    const antes = await prisma.usuario.findUnique({ where: { id } })
    expect(parsearBackupCodes(antes?.twoFactorBackupCodes)).toHaveLength(BACKUP_CODES_FIXTURE)
    await conSesion(id, emailActiva, async () => {
      const res = await POST({ password: "WrongPass123!" })
      expect(res.status).toBe(401)
      expect(await res.json()).toEqual({ error: "Contraseña incorrecta." })
      const enBd = await prisma.usuario.findUnique({ where: { id } })
      expect(enBd?.twoFactorEnabled).toBe(true)
      expect(enBd?.tokenVersion).toBe(antes?.tokenVersion)
      // Los códigos de respaldo siguen intactos tras un fallo.
      expect(parsearBackupCodes(enBd?.twoFactorBackupCodes)).toHaveLength(BACKUP_CODES_FIXTURE)
      expect(await prismaPlano.rateLimitAttempt.count({ where: { clave: claveDe(id) } })).toBe(1)
    })
  })

  it(`con ${MAX_INTENTOS} fallos previos → 429 antes de comparar la contraseña y sin tocar el 2FA`, async () => {
    const id = idDe(emailActiva)
    const antes = await prisma.usuario.findUnique({ where: { id } })
    await prismaPlano.rateLimitAttempt.createMany({
      data: Array.from({ length: MAX_INTENTOS }, () => ({ clave: claveDe(id) })),
    })
    await conSesion(id, emailActiva, async () => {
      // La contraseña es la correcta: si bcrypt llegara a correr, la baja ocurriría.
      const res = await POST({ password: PASSWORD })
      expect(res.status).toBe(429)
      expect(await res.json()).toEqual({
        error: "Demasiados intentos. Espere unos minutos.",
      })
      const enBd = await prisma.usuario.findUnique({ where: { id } })
      expect(enBd?.twoFactorEnabled).toBe(true)
      expect(enBd?.twoFactorSecret).toBe(antes?.twoFactorSecret)
      expect(enBd?.tokenVersion).toBe(antes?.tokenVersion)
      // Cortó antes de bcrypt: no suma un fallo nuevo ni limpia la ventana.
      expect(await prismaPlano.rateLimitAttempt.count({ where: { clave: claveDe(id) } })).toBe(
        MAX_INTENTOS
      )
    })
  })

  it("la contraseña correcta limpia el contador de intentos fallidos", async () => {
    const id = idDe(emailActiva)
    await conSesion(id, emailActiva, async () => {
      expect((await POST({ password: "WrongPass123!" })).status).toBe(401)
      expect(await prismaPlano.rateLimitAttempt.count({ where: { clave: claveDe(id) } })).toBe(1)

      const res = await POST({ password: PASSWORD })
      expect(res.status).toBe(200)
      expect(await prismaPlano.rateLimitAttempt.count({ where: { clave: claveDe(id) } })).toBe(0)
    })
  }, 30_000)

  it("contraseña correcta → 200, limpia secreto/códigos e invalida sesiones (tokenVersion++)", async () => {
    const antes = await prisma.usuario.findUnique({ where: { id: idDe(emailActiva) } })
    expect(parsearBackupCodes(antes?.twoFactorBackupCodes)).toHaveLength(BACKUP_CODES_FIXTURE)
    await conSesion(idDe(emailActiva), emailActiva, async () => {
      const res = await POST({ password: PASSWORD })
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ ok: true, sesionesInvalidadas: true })
      const enBd = await prisma.usuario.findUnique({ where: { id: idDe(emailActiva) } })
      expect(enBd?.twoFactorEnabled).toBe(false)
      expect(enBd?.twoFactorSecret).toBeNull()
      expect(enBd?.twoFactorBackupCodes).toBeNull()
      expect(enBd?.tokenVersion).toBe((antes?.tokenVersion ?? 0) + 1)
    })
  }, 30_000)
})
