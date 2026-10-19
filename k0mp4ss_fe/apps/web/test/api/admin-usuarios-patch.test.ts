/**
 * @vitest-environment node
 *
 * api-cobertura-fases fase 1 — /api/admin/usuarios PATCH + /api/admin/seed-authz
 * (carpeta app/api/admin: 45.96% → medido).
 *
 * El GET de `usuarios` ya tenía tests (test/api-admin-usuarios.test.ts); lo que
 * faltaba era el PATCH completo (rol / activo / invalidación de sesión por
 * tokenVersion / 400 / 403 / 404) y el guard real de `seed-authz`. Para el
 * camino feliz del seed se mockea SOLO `seedUsuariosMembresias()` (el helper
 * tiene su propio test en test/seed-authz-orden.test.ts y ejecutarlo de verdad
 * ensuciaría la BD compartida con el seed estándar). Prisma no se mockea.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest"
import { NextRequest } from "next/server"
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

const seedMock = vi.hoisted(() => vi.fn())
vi.mock("@/lib/seed-authz", () => ({ seedUsuariosMembresias: seedMock }))

const AUTH_SECRET = "test-secret-12345678"

describe("/api/admin — PATCH usuarios y POST seed-authz", () => {
  const comunidadA = "admin-patch-comunidad-a"
  const emailAdmin = "admin-patch-admin@test.cl"
  const emailResidente = "admin-patch-residente@test.cl"
  const emailInactivo = "admin-patch-inactivo@test.cl"

  beforeAll(async () => {
    process.env.AUTH_SECRET = AUTH_SECRET
    process.env.NEXT_PUBLIC_APP_ENV = "development"
    await prisma.comunidad.upsert({
      where: { id: comunidadA },
      update: {},
      create: { id: comunidadA, nombre: "Comunidad Admin Patch", slug: "admin-patch-a" },
    })
    for (const u of [
      { id: "admin-patch-user-admin", email: emailAdmin, activo: true },
      { id: "admin-patch-user-residente", email: emailResidente, activo: true },
      { id: "admin-patch-user-inactivo", email: emailInactivo, activo: false },
    ]) {
      await prisma.usuario.upsert({
        where: { email: u.email },
        update: { activo: u.activo },
        create: u,
      })
    }
    await prisma.membresia.deleteMany({
      where: { usuarioId: { in: ["admin-patch-user-admin", "admin-patch-user-residente"] } },
    })
    await prisma.membresia.create({
      data: { usuarioId: "admin-patch-user-admin", comunidadId: comunidadA, rol: "administrador" },
    })
    await prisma.membresia.create({
      data: { usuarioId: "admin-patch-user-residente", comunidadId: comunidadA, rol: "residente" },
    })
  }, 30_000)

  afterAll(async () => {
    state.cookie = ""
    delete process.env.NEXT_PUBLIC_APP_ENV
    try {
      await prisma.membresia.deleteMany({
        where: { usuarioId: { in: ["admin-patch-user-admin", "admin-patch-user-residente"] } },
      })
      for (const id of ["admin-patch-user-admin", "admin-patch-user-residente", "admin-patch-user-inactivo"]) {
        await prisma.usuario.delete({ where: { id } }).catch(() => {})
      }
      await prisma.comunidad.delete({ where: { id: comunidadA } }).catch(() => {})
    } catch {
      // intencional: limpieza best-effort
    }
  })

  async function conSesion(email: string): Promise<void> {
    const user = await prisma.usuario.findUnique({ where: { email } })
    if (!user) throw new Error(`usuario no encontrado: ${email}`)
    const { cookieSesionAuthjs } = await import("../helpers/sesion-authjs")
    state.cookie = await cookieSesionAuthjs({ sub: user.id, email: user.email })
  }

  async function PATCH(body: unknown, opts: { comunidadId?: string; raw?: string } = {}): Promise<Response> {
    const { PATCH: handler } = await import("@/app/api/admin/usuarios/route")
    const url = `http://localhost/api/admin/usuarios${opts.comunidadId === undefined ? "" : `?comunidadId=${opts.comunidadId}`}`
    const payload = opts.raw ?? JSON.stringify(body)
    const req = new NextRequest(url, {
      method: "PATCH",
      body: payload,
      headers: {
        cookie: state.cookie,
        "x-forwarded-proto": "http",
        "content-type": "application/json",
      },
    })
    return handler(req)
  }

  describe("PATCH /api/admin/usuarios", () => {
    it("401 sin sesión", async () => {
      state.cookie = ""
      const res = await PATCH({ usuarioId: "x" }, { comunidadId: comunidadA })
      expect(res.status).toBe(401)
    })

    it("sin membresía en la comunidad → 403 (aunque la cookie sea de un usuario inactivo)", async () => {
      // Hallazgo documentado (api-cobertura-fases D3): a diferencia de GET, el
      // PATCH NO re-valida `Usuario.activo` del solicitante; el corte real viene
      // de la membership/permiso. Se asserta el contrato observado en el código.
      await conSesion(emailInactivo)
      const res = await PATCH({ usuarioId: "x" }, { comunidadId: comunidadA })
      expect(res.status).toBe(403)
    })

    it("400 sin comunidadId", async () => {
      await conSesion(emailAdmin)
      const res = await PATCH({ usuarioId: "x" })
      expect(res.status).toBe(400)
      const j = (await res.json()) as { error: string }
      expect(j.error).toBe("comunidadId requerido")
    })

    it("403 con rol sin permiso (residente)", async () => {
      await conSesion(emailResidente)
      const res = await PATCH({ usuarioId: "x" }, { comunidadId: comunidadA })
      expect(res.status).toBe(403)
    })

    it("400 con cuerpo malformado y con usuarioId ausente", async () => {
      await conSesion(emailAdmin)
      const malformado = await PATCH(null, { comunidadId: comunidadA, raw: "{no-es-json" })
      expect(malformado.status).toBe(400)
      const sinUsuario = await PATCH({}, { comunidadId: comunidadA })
      expect(sinUsuario.status).toBe(400)
      const j = (await sinUsuario.json()) as { error: string }
      expect(j.error).toBe("usuarioId requerido")
    })

    it("404 cuando el usuario no pertenece a la comunidad", async () => {
      await conSesion(emailAdmin)
      const res = await PATCH({ usuarioId: "admin-patch-user-inactivo" }, { comunidadId: comunidadA })
      expect(res.status).toBe(404)
      const j = (await res.json()) as { error: string }
      expect(j.error).toBe("Usuario no pertenece a la comunidad")
    })

    it("cambio de rol → 200, actualiza la membresía y sube tokenVersion", async () => {
      const antes = await prisma.usuario.findUnique({ where: { id: "admin-patch-user-residente" } })
      await conSesion(emailAdmin)
      const res = await PATCH(
        { usuarioId: "admin-patch-user-residente", rol: "comite" },
        { comunidadId: comunidadA }
      )
      expect(res.status).toBe(200)
      const j = (await res.json()) as { ok: boolean; cambios: { rol: boolean; activo: boolean } }
      expect(j.ok).toBe(true)
      expect(j.cambios).toEqual({ rol: true, activo: false })

      const membresia = await prisma.membresia.findFirst({
        where: { usuarioId: "admin-patch-user-residente", comunidadId: comunidadA },
      })
      expect(membresia?.rol).toBe("comite")
      const despues = await prisma.usuario.findUnique({ where: { id: "admin-patch-user-residente" } })
      expect(despues?.tokenVersion).toBe((antes?.tokenVersion ?? 0) + 1)
    })

    it("cambio de activo a false → 200, desactiva el usuario y vuelve a subir tokenVersion", async () => {
      const antes = await prisma.usuario.findUnique({ where: { id: "admin-patch-user-residente" } })
      await conSesion(emailAdmin)
      const res = await PATCH(
        { usuarioId: "admin-patch-user-residente", activo: false },
        { comunidadId: comunidadA }
      )
      expect(res.status).toBe(200)
      const j = (await res.json()) as { ok: boolean; cambios: { rol: boolean; activo: boolean } }
      // `cambios` refleja QUÉ cambió la request: `activo: true` = el patch sí lo tocó.
      try {
        expect(j.cambios).toEqual({ rol: false, activo: true })
        const despues = await prisma.usuario.findUnique({ where: { id: "admin-patch-user-residente" } })
        expect(despues?.activo).toBe(false)
        expect(despues?.tokenVersion).toBe((antes?.tokenVersion ?? 0) + 1)
      } finally {
        // Restaura el estado para el resto de la suite (el usuario es de prueba).
        await prisma.usuario.update({
          where: { id: "admin-patch-user-residente" },
          data: { activo: true },
        })
      }
    })
  })

  describe("POST /api/admin/seed-authz", () => {
    async function POST(): Promise<Response> {
      const { POST: handler } = await import("@/app/api/admin/seed-authz/route")
      return handler()
    }

    it("guard de entorno: NEXT_PUBLIC_APP_ENV=production → 404 antes de auth", async () => {
      process.env.NEXT_PUBLIC_APP_ENV = "production"
      try {
        const res = await POST()
        expect(res.status).toBe(404)
        expect(seedMock).not.toHaveBeenCalled()
      } finally {
        process.env.NEXT_PUBLIC_APP_ENV = "development"
      }
    })

    it("401 sin sesión y 401 con usuario inactivo", async () => {
      state.cookie = ""
      const sinSesion = await POST()
      expect(sinSesion.status).toBe(401)

      await conSesion(emailInactivo)
      const inactivo = await POST()
      expect(inactivo.status).toBe(401)
    })

    it("403 con rol sin permiso (residente)", async () => {
      await conSesion(emailResidente)
      const res = await POST()
      expect(res.status).toBe(403)
      expect(seedMock).not.toHaveBeenCalled()
    })

    it("camino feliz: admin recibe el resultado del seed (helper mockeado)", async () => {
      const resultado = {
        ok: true,
        comunidades: [{ id: "comunidad-a", nombre: "Comunidad Los Aromos TEST", slug: "los-aromos-test" }],
        usuarios: [{ email: "admin@test.cl", rol: "administrador", comunidadId: "comunidad-a" }],
        counts: { comunidades: 2, usuarios: 6, membresias: 7 },
      }
      seedMock.mockResolvedValueOnce(resultado)
      await conSesion(emailAdmin)
      const res = await POST()
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual(resultado)
      expect(seedMock).toHaveBeenCalledTimes(1)
    })

    it("500 cuando el seed falla", async () => {
      seedMock.mockRejectedValueOnce(new Error("boom"))
      await conSesion(emailAdmin)
      const res = await POST()
      expect(res.status).toBe(500)
      const j = (await res.json()) as { error: string }
      expect(j.error).toBe("No se pudo crear seed")
    })
  })
})
