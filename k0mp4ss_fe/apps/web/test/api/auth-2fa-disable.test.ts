/**
 * @vitest-environment node
 *
 * `/api/auth/2fa/disable` — baja de 2FA con contraseña (P3).
 *
 * Ramas que no cubre `test/auth/two-factor.test.ts`: falta de sesión, cuerpo
 * inválido, usuario inactivo o sin passwordHash, 2FA no activo y contraseña
 * incorrecta (que no debe tocar nada). El happy path se re-verifica porque es el
 * que confirma que la baja limpia secreto/códigos e invalida sesiones.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest"
import { NextRequest } from "next/server"
import bcrypt from "bcryptjs"
import { prismaCifrado as prisma } from "@/lib/prisma-cifrado"
import { prisma as prismaPlano } from "@/lib/prisma"
import { generarBackupCodes, generarSecreto2FA } from "@/lib/two-factor"

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

const idDe = (email: string): string => email.split("@")[0] ?? email

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
    // La cuenta con 2FA activo se restaura para cada test (el happy path la baja).
    const secreto = (await generarSecreto2FA(emailActiva)).secretoBase32
    const passwordHash = await bcrypt.hash(PASSWORD, 10)
    await prisma.usuario.upsert({
      where: { email: emailActiva },
      update: {
        activo: true,
        passwordHash,
        twoFactorEnabled: true,
        twoFactorSecret: secreto,
        twoFactorBackupCodes: JSON.stringify([]),
      },
      create: {
        id: idDe(emailActiva),
        email: emailActiva,
        activo: true,
        passwordHash,
        twoFactorEnabled: true,
        twoFactorSecret: secreto,
        twoFactorBackupCodes: JSON.stringify([]),
      },
    })
  })

  afterAll(async () => {
    try {
      state.cookie = ""
      for (const email of [emailActiva, emailSin2FA, emailInactivo, emailSinHash]) {
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

  it("contraseña incorrecta → 401 y sigue activo", async () => {
    const antes = await prisma.usuario.findUnique({ where: { id: idDe(emailActiva) } })
    await conSesion(idDe(emailActiva), emailActiva, async () => {
      const res = await POST({ password: "WrongPass123!" })
      expect(res.status).toBe(401)
      expect(await res.json()).toEqual({ error: "Contraseña incorrecta." })
      const enBd = await prisma.usuario.findUnique({ where: { id: idDe(emailActiva) } })
      expect(enBd?.twoFactorEnabled).toBe(true)
      expect(enBd?.tokenVersion).toBe(antes?.tokenVersion)
    })
  })

  it("contraseña correcta → 200, limpia 2FA e invalida sesiones (tokenVersion++)", async () => {
    const antes = await prisma.usuario.findUnique({ where: { id: idDe(emailActiva) } })
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
