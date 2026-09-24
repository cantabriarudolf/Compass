/**
 * @vitest-environment node
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest"
import { prisma } from "@/lib/prisma"

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

describe("withComunidadScope — scoping multi-tenant desde sesión (Fase 0)", () => {
  const comunidadA = "scope-comunidad-a"
  const comunidadB = "scope-comunidad-b"
  const emailMiembro = "scope-miembro@test.cl"
  const emailSinMembresia = "scope-sin-membresia@test.cl"
  const emailMulti = "scope-multi@test.cl"

  beforeAll(async () => {
    process.env.AUTH_SECRET = AUTH_SECRET
    for (const c of [
      { id: comunidadA, nombre: "Comunidad A Scope", slug: "scope-comunidad-a" },
      { id: comunidadB, nombre: "Comunidad B Scope", slug: "scope-comunidad-b" },
    ]) {
      await prisma.comunidad.upsert({ where: { id: c.id }, update: {}, create: c })
    }
    for (const u of [
      { id: "scope-usuario-miembro", email: emailMiembro, activo: true },
      { id: "scope-usuario-sin-membresia", email: emailSinMembresia, activo: true },
      { id: "scope-usuario-multi", email: emailMulti, activo: true },
    ]) {
      await prisma.usuario.upsert({ where: { email: u.email }, update: {}, create: u })
    }
    await prisma.membresia.deleteMany({
      where: { usuarioId: { in: ["scope-usuario-miembro", "scope-usuario-sin-membresia", "scope-usuario-multi"] } },
    })
    await prisma.membresia.create({
      data: {
        usuarioId: "scope-usuario-miembro",
        comunidadId: comunidadA,
        rol: "administrador",
        createdAt: new Date("2026-01-01T00:00:00Z"),
      },
    })
    // Dos membresías: la más reciente (comunidad B) debe ganar.
    await prisma.membresia.create({
      data: {
        usuarioId: "scope-usuario-multi",
        comunidadId: comunidadA,
        rol: "residente",
        createdAt: new Date("2026-01-01T00:00:00Z"),
      },
    })
    await prisma.membresia.create({
      data: {
        usuarioId: "scope-usuario-multi",
        comunidadId: comunidadB,
        rol: "administrador",
        createdAt: new Date("2026-02-01T00:00:00Z"),
      },
    })
  }, 30_000)

  afterAll(async () => {
    try {
      state.cookie = ""
      await prisma.membresia.deleteMany({
        where: { usuarioId: { in: ["scope-usuario-miembro", "scope-usuario-sin-membresia", "scope-usuario-multi"] } },
      })
      for (const id of ["scope-usuario-miembro", "scope-usuario-sin-membresia", "scope-usuario-multi"]) {
        await prisma.usuario.delete({ where: { id } }).catch(() => {})
      }
      await prisma.comunidad.delete({ where: { id: comunidadA } }).catch(() => {})
      await prisma.comunidad.delete({ where: { id: comunidadB } }).catch(() => {})
    } catch {
      // intencional: limpieza best-effort
    }
  })

  async function scopeConCookie(email?: string): Promise<{
    ok: boolean
    status: number
    body: unknown
  }> {
    const { withComunidadScope } = await import("@/lib/api/with-comunidad-scope")
    if (email) {
      const user = await prisma.usuario.findUnique({ where: { email } })
      if (!user) throw new Error(`usuario no encontrado: ${email}`)
      const { cookieSesionAuthjs } = await import("../helpers/sesion-authjs")
      state.cookie = await cookieSesionAuthjs({ sub: user.id, email: user.email })
    } else {
      state.cookie = ""
    }
    const resultado = await withComunidadScope()
    state.cookie = ""
    if (resultado.ok) {
      return { ok: true, status: 200, body: resultado.scope }
    }
    return { ok: false, status: resultado.response.status, body: await resultado.response.json() }
  }

  it("sin sesión → 401", async () => {
    const r = await scopeConCookie()
    expect(r.status).toBe(401)
    expect((r.body as { error: string }).error).toMatch(/autenticado/i)
  })

  it("autenticado sin membresía en BD → 403", async () => {
    const r = await scopeConCookie(emailSinMembresia)
    expect(r.status).toBe(403)
    expect((r.body as { error: string }).error).toMatch(/comunidad/i)
  })

  it("miembro de una comunidad → scope con comunidadId, usuarioId y rol", async () => {
    const r = await scopeConCookie(emailMiembro)
    expect(r.ok).toBe(true)
    const scope = r.body as { comunidadId: string; usuarioId: string; rol: string }
    expect(scope.comunidadId).toBe(comunidadA)
    expect(scope.usuarioId).toBe("scope-usuario-miembro")
    expect(scope.rol).toBe("administrador")
  })

  it("usuario con dos membresías → resuelve la más reciente (determinista)", async () => {
    const r = await scopeConCookie(emailMulti)
    expect(r.ok).toBe(true)
    const scope = r.body as { comunidadId: string; rol: string }
    expect(scope.comunidadId).toBe(comunidadB)
    expect(scope.rol).toBe("administrador")
  })
})
