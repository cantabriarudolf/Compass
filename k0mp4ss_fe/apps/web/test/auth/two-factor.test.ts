/**
 * @vitest-environment node
 *
 * SERIE-PRODUCCION-FASE2 P3 — 2FA/TOTP: libs puras + las 6 rutas
 * (setup, verify-setup, disable, challenge, verify, backup).
 * Sesión simulada con el patrón repo (next/headers mockeado + JWE real).
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest"
import { NextRequest } from "next/server"
import speakeasy from "speakeasy"
import bcrypt from "bcryptjs"
import { decode } from "next-auth/jwt"
import { prisma } from "@/lib/prisma"
import {
  generarSecreto2FA,
  verificarCodigo2FA,
  generarBackupCodes,
  hashearBackupCodes,
  parsearBackupCodes,
  consumirBackupCode,
} from "@/lib/two-factor"
import { crearDesafio2FA, verificarDesafio2FA } from "@/lib/two-factor-token"

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

const PASSWORD = "Secret123" // cumple policy P2
const SUFIJO = Date.now()
const EMAIL_SIN_2FA = `2fa-sin-${SUFIJO}@test.cl`
const EMAIL_CON_2FA = `2fa-con-${SUFIJO}@test.cl`
const EMAIL_SETUP = `2fa-setup-${SUFIJO}@test.cl`
const EMAIL_DISABLE = `2fa-disable-${SUFIJO}@test.cl`
const EMAILS = [EMAIL_SIN_2FA, EMAIL_CON_2FA, EMAIL_SETUP, EMAIL_DISABLE]

let ipN = 0
function ipUnica(): string {
  ipN += 1
  return `10.99.${Math.floor(ipN / 250)}.${ipN % 250}`
}

function tokenActual(secretoBase32: string): string {
  return speakeasy.totp({ secret: secretoBase32, encoding: "base32" })
}

async function sesionCookie(usuarioId: string, email: string): Promise<string> {
  const { cookieSesionAuthjs } = await import("../helpers/sesion-authjs")
  return cookieSesionAuthjs({ sub: usuarioId, email })
}

async function call(
  ruta: string,
  metodo: { POST: (req: NextRequest) => Promise<Response> },
  body: unknown,
  opts?: { cookie?: string; ip?: string }
): Promise<Response> {
  state.cookie = opts?.cookie ?? ""
  const req = new NextRequest(`http://localhost${ruta}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-forwarded-proto": "http",
      "x-forwarded-for": opts?.ip ?? ipUnica(),
      ...(state.cookie ? { cookie: state.cookie } : {}),
    },
    body: JSON.stringify(body),
  })
  const res = await metodo.POST(req)
  state.cookie = ""
  return res
}

function extraerTokenSesion(res: Response): string | null {
  const setCookie = res.headers.get("set-cookie")
  if (!setCookie) return null
  const m = setCookie.match(/(?:__Secure-)?authjs\.session-token=([^;]+)/)
  return m?.[1] ?? null
}

describe("P3 — TOTP (lib/two-factor)", () => {
  it("genera secreto base32 + otpauthUrl Compass + QR data URL", async () => {
    const s = await generarSecreto2FA("alguien@test.cl")
    expect(s.secretoBase32).toMatch(/^[A-Z2-7]+$/)
    expect(s.otpauthUrl).toContain("otpauth://totp/Compass")
    expect(s.otpauthUrl).toContain(`secret=${s.secretoBase32}`)
    expect(s.qrDataUrl.startsWith("data:image/png;base64,")).toBe(true)
  })

  it("roundtrip: token generado se verifica OK", async () => {
    const s = await generarSecreto2FA("alguien@test.cl")
    expect(verificarCodigo2FA(s.secretoBase32, tokenActual(s.secretoBase32))).toBe(true)
  })

  it("rechaza código erróneo y formato inválido", async () => {
    const s = await generarSecreto2FA("alguien@test.cl")
    const valido = tokenActual(s.secretoBase32)
    const distinto = valido === "000000" ? "000001" : "000000"
    expect(verificarCodigo2FA(s.secretoBase32, distinto)).toBe(false)
    expect(verificarCodigo2FA(s.secretoBase32, "12345")).toBe(false)
    expect(verificarCodigo2FA(s.secretoBase32, "abcdef")).toBe(false)
    expect(verificarCodigo2FA(s.secretoBase32, "")).toBe(false)
  })
})

describe("P3 — backup codes (lib/two-factor)", () => {
  it("genera 10 únicos de 8 caracteres sin ambigüedad", () => {
    const c = generarBackupCodes()
    expect(c).toHaveLength(10)
    expect(new Set(c).size).toBe(10)
    for (const codigo of c) {
      expect(codigo).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/)
    }
  })

  it("consume un código válido una sola vez", async () => {
    const planos = generarBackupCodes()
    const json = await hashearBackupCodes(planos)
    const primero = await consumirBackupCode(json, planos[0]!)
    expect(primero.valido).toBe(true)
    expect(parsearBackupCodes(primero.restantesJson)).toHaveLength(9)
    const reuso = await consumirBackupCode(primero.restantesJson, planos[0]!)
    expect(reuso.valido).toBe(false)
    expect(parsearBackupCodes(reuso.restantesJson)).toHaveLength(9)
  }, 30_000)

  it("rechaza código inválido sin consumir y tolera JSON corrupto", async () => {
    const json = await hashearBackupCodes(generarBackupCodes())
    const r = await consumirBackupCode(json, "ZZZZZZZZ")
    expect(r.valido).toBe(false)
    expect(parsearBackupCodes(r.restantesJson)).toHaveLength(10)
    expect(parsearBackupCodes(null)).toEqual([])
    expect(parsearBackupCodes("no-json")).toEqual([])
    expect(parsearBackupCodes(JSON.stringify({ a: 1 }))).toEqual([])
  }, 30_000)
})

describe("P3 — token de desafío (lib/two-factor-token)", () => {
  it("roundtrip válido y rechazo de token manipulado", async () => {
    const t = await crearDesafio2FA("usuario-1")
    expect(await verificarDesafio2FA(t)).toBe("usuario-1")
    expect(await verificarDesafio2FA(`${t}manipulado`)).toBeNull()
    expect(await verificarDesafio2FA("basura")).toBeNull()
  })
})

describe("P3 — login con 2FA (rutas challenge/verify/backup)", () => {
  let secretoCon2FA = ""

  beforeAll(async () => {
    const hash = await bcrypt.hash(PASSWORD, 10)
    await prisma.usuario.create({
      data: { email: EMAIL_SIN_2FA, passwordHash: hash, activo: true },
    })
    const s = await generarSecreto2FA(EMAIL_CON_2FA)
    secretoCon2FA = s.secretoBase32
    const backup = await hashearBackupCodes(generarBackupCodes())
    await prisma.usuario.create({
      data: {
        email: EMAIL_CON_2FA,
        passwordHash: hash,
        activo: true,
        twoFactorSecret: secretoCon2FA,
        twoFactorEnabled: true,
        twoFactorBackupCodes: backup,
      },
    })
  }, 30_000)

  afterAll(async () => {
    try {
      await prisma.usuario.deleteMany({ where: { email: { in: EMAILS } } })
      await prisma.rateLimitAttempt.deleteMany({ where: { clave: { startsWith: "2fa-" } } })
    } catch {
      // intencional: vacío por diseño
    }
  })

  it("challenge sin 2FA → requires2FA false (sigue login normal)", async () => {
    const { POST } = await import("@/app/api/auth/2fa/challenge/route")
    const res = await call("/api/auth/2fa/challenge", { POST }, { email: EMAIL_SIN_2FA, password: PASSWORD })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ requires2FA: false })
  })

  it("challenge con 2FA → tempToken válido de 5 min", async () => {
    const { POST } = await import("@/app/api/auth/2fa/challenge/route")
    const res = await call("/api/auth/2fa/challenge", { POST }, { email: EMAIL_CON_2FA, password: PASSWORD })
    expect(res.status).toBe(200)
    const j = (await res.json()) as { requires2FA: boolean; tempToken: string }
    expect(j.requires2FA).toBe(true)
    const usuario = await prisma.usuario.findUnique({ where: { email: EMAIL_CON_2FA } })
    expect(await verificarDesafio2FA(j.tempToken)).toBe(usuario!.id)
  })

  it("challenge con credenciales erróneas → 401 genérico", async () => {
    const { POST } = await import("@/app/api/auth/2fa/challenge/route")
    const res = await call("/api/auth/2fa/challenge", { POST }, { email: EMAIL_CON_2FA, password: "WrongPass123!" })
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: "Credenciales inválidas." })
  })

  it("verify roundtrip → 200 + cookie de sesión Auth.js real", async () => {
    const { POST: challenge } = await import("@/app/api/auth/2fa/challenge/route")
    const { POST } = await import("@/app/api/auth/2fa/verify/route")
    const ch = await call("/api/auth/2fa/challenge", { POST: challenge }, { email: EMAIL_CON_2FA, password: PASSWORD })
    const { tempToken } = (await ch.json()) as { tempToken: string }
    const res = await call("/api/auth/2fa/verify", { POST }, { tempToken, codigo: tokenActual(secretoCon2FA) })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    const token = extraerTokenSesion(res)
    expect(token).toBeTruthy()
    const decoded = (await decode({
      secret: process.env.AUTH_SECRET!,
      salt: "authjs.session-token",
      token: token!,
    })) as unknown as { sub: string }
    const usuario = await prisma.usuario.findUnique({ where: { email: EMAIL_CON_2FA } })
    expect(decoded.sub).toBe(usuario!.id)
  })

  it("verify con código erróneo → 401 sin cookie", async () => {
    const { POST: challenge } = await import("@/app/api/auth/2fa/challenge/route")
    const { POST } = await import("@/app/api/auth/2fa/verify/route")
    const ch = await call("/api/auth/2fa/challenge", { POST: challenge }, { email: EMAIL_CON_2FA, password: PASSWORD })
    const { tempToken } = (await ch.json()) as { tempToken: string }
    const valido = tokenActual(secretoCon2FA)
    const res = await call(
      "/api/auth/2fa/verify",
      { POST },
      { tempToken, codigo: valido === "000000" ? "000001" : "000000" }
    )
    expect(res.status).toBe(401)
    expect(extraerTokenSesion(res)).toBeNull()
  })

  it("verify con desafío manipulado → 401", async () => {
    const { POST } = await import("@/app/api/auth/2fa/verify/route")
    const res = await call(
      "/api/auth/2fa/verify",
      { POST },
      { tempToken: "manipulado", codigo: tokenActual(secretoCon2FA) }
    )
    expect(res.status).toBe(401)
  })

  it("backup roundtrip → 200 + consume el código (un solo uso)", async () => {
    const { POST: challenge } = await import("@/app/api/auth/2fa/challenge/route")
    const { POST } = await import("@/app/api/auth/2fa/backup/route")
    // Código fresco: regenero backup del usuario para no depender de otros tests
    const planos = generarBackupCodes()
    await prisma.usuario.update({
      where: { email: EMAIL_CON_2FA },
      data: { twoFactorBackupCodes: await hashearBackupCodes(planos) },
    })
    const ch = await call("/api/auth/2fa/challenge", { POST: challenge }, { email: EMAIL_CON_2FA, password: PASSWORD })
    const { tempToken } = (await ch.json()) as { tempToken: string }
    const res = await call("/api/auth/2fa/backup", { POST }, { tempToken, codigo: planos[0]! })
    expect(res.status).toBe(200)
    const j = (await res.json()) as { ok: boolean; codigosRestantes: number; advertencia: null }
    expect(j.ok).toBe(true)
    expect(j.codigosRestantes).toBe(9)
    expect(j.advertencia).toBeNull()
    expect(extraerTokenSesion(res)).toBeTruthy()
    // Reúso del mismo código → 401
    const ch2 = await call("/api/auth/2fa/challenge", { POST: challenge }, { email: EMAIL_CON_2FA, password: PASSWORD })
    const { tempToken: t2 } = (await ch2.json()) as { tempToken: string }
    const reuso = await call("/api/auth/2fa/backup", { POST }, { tempToken: t2, codigo: planos[0]! })
    expect(reuso.status).toBe(401)
  }, 30_000)

  it("backup advierte cuando quedan menos de 3 códigos", async () => {
    const { POST: challenge } = await import("@/app/api/auth/2fa/challenge/route")
    const { POST } = await import("@/app/api/auth/2fa/backup/route")
    const planos = generarBackupCodes(2)
    await prisma.usuario.update({
      where: { email: EMAIL_CON_2FA },
      data: { twoFactorBackupCodes: await hashearBackupCodes(planos) },
    })
    const ch = await call("/api/auth/2fa/challenge", { POST: challenge }, { email: EMAIL_CON_2FA, password: PASSWORD })
    const { tempToken } = (await ch.json()) as { tempToken: string }
    const res = await call("/api/auth/2fa/backup", { POST }, { tempToken, codigo: planos[0]! })
    expect(res.status).toBe(200)
    const j = (await res.json()) as { codigosRestantes: number; advertencia: string | null }
    expect(j.codigosRestantes).toBe(1)
    expect(j.advertencia).toMatch(/pocos códigos/i)
  })
})

describe("P3 — enrolamiento y baja (rutas setup/verify-setup/disable)", () => {
  let usuarioId = ""

  beforeAll(async () => {
    const u = await prisma.usuario.create({
      data: { email: EMAIL_SETUP, passwordHash: await bcrypt.hash(PASSWORD, 10), activo: true },
    })
    usuarioId = u.id
    await prisma.usuario.create({
      data: {
        email: EMAIL_DISABLE,
        passwordHash: await bcrypt.hash(PASSWORD, 10),
        activo: true,
        twoFactorSecret: (await generarSecreto2FA(EMAIL_DISABLE)).secretoBase32,
        twoFactorEnabled: true,
        twoFactorBackupCodes: await hashearBackupCodes(generarBackupCodes()),
      },
    })
  }, 30_000)

  it("setup genera secreto pendiente y retorna QR (sin activar)", async () => {
    const { POST } = await import("@/app/api/auth/2fa/setup/route")
    const cookie = await sesionCookie(usuarioId, EMAIL_SETUP)
    const res = await call("/api/auth/2fa/setup", { POST }, {}, { cookie })
    expect(res.status).toBe(200)
    const j = (await res.json()) as { otpauthUrl: string; qrDataUrl: string }
    expect(j.otpauthUrl).toContain("otpauth://totp/Compass")
    expect(j.qrDataUrl.startsWith("data:image/png;base64,")).toBe(true)
    const u = await prisma.usuario.findUnique({ where: { id: usuarioId } })
    expect(u!.twoFactorEnabled).toBe(false)
    expect(u!.twoFactorSecret).toBeTruthy()
  })

  it("setup sin sesión → 401", async () => {
    const { POST } = await import("@/app/api/auth/2fa/setup/route")
    const res = await call("/api/auth/2fa/setup", { POST }, {})
    expect(res.status).toBe(401)
  })

  it("verify-setup con código válido activa 2FA y retorna backup codes", async () => {
    const { POST } = await import("@/app/api/auth/2fa/verify-setup/route")
    const cookie = await sesionCookie(usuarioId, EMAIL_SETUP)
    const u = await prisma.usuario.findUnique({ where: { id: usuarioId } })
    const res = await call(
      "/api/auth/2fa/verify-setup",
      { POST },
      { codigo: tokenActual(u!.twoFactorSecret!) },
      { cookie }
    )
    expect(res.status).toBe(200)
    const j = (await res.json()) as { ok: boolean; backupCodes: string[] }
    expect(j.ok).toBe(true)
    expect(j.backupCodes).toHaveLength(10)
    const actualizado = await prisma.usuario.findUnique({ where: { id: usuarioId } })
    expect(actualizado!.twoFactorEnabled).toBe(true)
    expect(parsearBackupCodes(actualizado!.twoFactorBackupCodes)).toHaveLength(10)
  }, 30_000)

  it("verify-setup con código inválido → 401 y no activa", async () => {
    const email = `2fa-setup-mal-${SUFIJO}@test.cl`
    const creado = await prisma.usuario.create({
      data: {
        email,
        passwordHash: await bcrypt.hash(PASSWORD, 10),
        activo: true,
        twoFactorSecret: (await generarSecreto2FA(email)).secretoBase32,
      },
    })
    try {
      const { POST } = await import("@/app/api/auth/2fa/verify-setup/route")
      const cookie = await sesionCookie(creado.id, email)
      const valido = tokenActual(creado.twoFactorSecret!)
      const distinto = valido === "000000" ? "000001" : "000000"
      const res = await call("/api/auth/2fa/verify-setup", { POST }, { codigo: distinto }, { cookie, ip: "10.99.9.9" })
      expect(res.status).toBe(401)
      const u = await prisma.usuario.findUnique({ where: { id: creado.id } })
      expect(u!.twoFactorEnabled).toBe(false)
    } finally {
      await prisma.usuario.delete({ where: { id: creado.id } }).catch(() => {})
    }
  })

  it("setup con 2FA activo → 409", async () => {
    const { POST } = await import("@/app/api/auth/2fa/setup/route")
    const cookie = await sesionCookie(usuarioId, EMAIL_SETUP)
    const res = await call("/api/auth/2fa/setup", { POST }, {}, { cookie })
    expect(res.status).toBe(409)
  })

  it("disable con contraseña errónea → 401 y sigue activo", async () => {
    const u = await prisma.usuario.findUnique({ where: { email: EMAIL_DISABLE } })
    const { POST } = await import("@/app/api/auth/2fa/disable/route")
    const cookie = await sesionCookie(u!.id, EMAIL_DISABLE)
    const res = await call("/api/auth/2fa/disable", { POST }, { password: "WrongPass123!" }, { cookie })
    expect(res.status).toBe(401)
    const sigue = await prisma.usuario.findUnique({ where: { id: u!.id } })
    expect(sigue!.twoFactorEnabled).toBe(true)
  })

  it("disable OK limpia secreto/códigos e invalida sesiones", async () => {
    const u = await prisma.usuario.findUnique({ where: { email: EMAIL_DISABLE } })
    const versionAntes = u!.tokenVersion
    const { POST } = await import("@/app/api/auth/2fa/disable/route")
    const cookie = await sesionCookie(u!.id, EMAIL_DISABLE)
    const res = await call("/api/auth/2fa/disable", { POST }, { password: PASSWORD }, { cookie })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, sesionesInvalidadas: true })
    const limpio = await prisma.usuario.findUnique({ where: { id: u!.id } })
    expect(limpio!.twoFactorEnabled).toBe(false)
    expect(limpio!.twoFactorSecret).toBeNull()
    expect(limpio!.twoFactorBackupCodes).toBeNull()
    expect(limpio!.tokenVersion).toBe(versionAntes + 1)
  })
})
