/**
 * @vitest-environment node
 *
 * Reproducción del defecto de scope de `lib/api/put-merge.ts` (SERIE-DEUDA-1 P2):
 * el `PUT` parcial de `/api/mt/trabajos/[id]` responde 404 "Registro no encontrado."
 * aunque la fila exista y pertenezca a la comunidad de la sesión.
 *
 * Prisma real contra la BD de test, sin mocks de Prisma.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest"
import { NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"
import { puede } from "@/lib/authz"

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

const comunidad = "putmerge-propia"
const comunidadAjena = "putmerge-ajena"
const emailAdmin = "putmerge-admin@test.cl"
const emailResidente = "putmerge-residente@test.cl"

type Handler = (
  req: NextRequest,
  ctx?: { params: Promise<{ id: string }> }
) => Promise<Response>

describe("put-merge — scope de comunidad (SERIE-DEUDA-1 P2)", () => {
  beforeAll(async () => {
    process.env.AUTH_SECRET = AUTH_SECRET
    for (const c of [
      { id: comunidad, nombre: "Comunidad PutMerge", slug: "putmerge-propia" },
      { id: comunidadAjena, nombre: "Comunidad Ajena", slug: "putmerge-ajena" },
    ]) {
      await prisma.comunidad.upsert({ where: { id: c.id }, update: {}, create: c })
    }
    await prisma.usuario.upsert({
      where: { email: emailAdmin },
      update: {},
      create: { id: "putmerge-admin", email: emailAdmin, activo: true },
    })
    await prisma.usuario.upsert({
      where: { email: emailResidente },
      update: {},
      create: { id: "putmerge-residente", email: emailResidente, activo: true },
    })
    await prisma.membresia.deleteMany({
      where: { usuarioId: { in: ["putmerge-admin", "putmerge-residente"] } },
    })
    await prisma.membresia.create({
      data: { usuarioId: "putmerge-admin", comunidadId: comunidad, rol: "administrador" },
    })
    // Rol sin `mt:editar` (matriz RP): la guardia de authz debe seguir dando 403.
    await prisma.membresia.create({
      data: { usuarioId: "putmerge-residente", comunidadId: comunidad, rol: "residente" },
    })
    await prisma.trabajoMT.deleteMany({
      where: { comunidadId: { in: [comunidad, comunidadAjena] } },
    })
  }, 30_000)

  afterAll(async () => {
    try {
      state.cookie = ""
      await prisma.trabajoMT.deleteMany({
        where: { comunidadId: { in: [comunidad, comunidadAjena] } },
      })
      await prisma.membresia.deleteMany({
        where: { usuarioId: { in: ["putmerge-admin", "putmerge-residente"] } },
      })
      for (const id of ["putmerge-admin", "putmerge-residente"]) {
        await prisma.usuario.delete({ where: { id } }).catch(() => {})
      }
      for (const id of [comunidad, comunidadAjena]) {
        await prisma.comunidad.delete({ where: { id } }).catch(() => {})
      }
    } catch {
      // intencional: limpieza best-effort
    }
  })

  async function conSesion(
    fn: () => Promise<void>,
    email: string = emailAdmin
  ): Promise<void> {
    const user = await prisma.usuario.findUnique({ where: { email } })
    if (!user) throw new Error(`usuario no encontrado: ${email}`)
    const { cookieSesionAuthjs } = await import("../helpers/sesion-authjs")
    state.cookie = await cookieSesionAuthjs({ sub: user.id, email: user.email })
    try {
      await fn()
    } finally {
      state.cookie = ""
    }
  }

  /** Fila mínima válida de TrabajoMT (espejo del payload de la página MT). */
  function filaTrabajo(id: string, comunidadId: string, overrides: Record<string, unknown> = {}) {
    return {
      id,
      comunidadId,
      folio: `MT-${id}`,
      titulo: "Reparación bomba hidropack",
      descripcion: "Cambio de sello mecánico y revisión del tablero de control",
      prioridad: "alta",
      estado: "planificado",
      costoTotal: 250000,
      origenFondos: "gasto_comun",
      estadoPago: "pendiente",
      alertaGarantiaEnviada: false,
      evidencias: [],
      ...overrides,
    }
  }

  async function put(id: string, body: Record<string, unknown>): Promise<Response> {
    const mod = (await import("@/app/api/mt/trabajos/[id]/route")) as unknown as {
      PUT: Handler
    }
    const req = new NextRequest(`http://localhost/api/mt/trabajos/${id}`, {
      method: "PUT",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
    })
    return mod.PUT(req, { params: Promise.resolve({ id }) })
  }

  it("PUT parcial sobre una fila PROPIA existente → 200 (el defecto era 404)", async () => {
    await prisma.trabajoMT.create({ data: filaTrabajo("pmt-1", comunidad) })
    await conSesion(async () => {
      const res = await put("pmt-1", { estado: "en_curso", fechaInicio: "2026-03-11" })
      expect(res.status).toBe(200)
      const enBd = await prisma.trabajoMT.findUnique({ where: { id: "pmt-1" } })
      expect(enBd?.estado).toBe("en_curso")
      expect(enBd?.fechaInicio).toBe("2026-03-11")
    })
  }, 30_000)

  it("PUT sobre una fila de OTRA comunidad → 404 (sin filtrar existencia)", async () => {
    await prisma.trabajoMT.create({ data: filaTrabajo("pmt-ajena", comunidadAjena) })
    await conSesion(async () => {
      const res = await put("pmt-ajena", { estado: "en_curso" })
      expect(res.status).toBe(404)
      expect(await res.json()).toEqual({ error: "Registro no encontrado." })
      const enBd = await prisma.trabajoMT.findUnique({ where: { id: "pmt-ajena" } })
      expect(enBd?.estado).toBe("planificado")
    })
  }, 30_000)

  it("PUT sobre una fila PROPIA con rol sin `mt:editar` → 403 (la guardia de authz sigue viva)", async () => {
    expect(puede("residente", "editar", "mt")).toBe(false)
    await prisma.trabajoMT.create({ data: filaTrabajo("pmt-rol", comunidad) })
    await conSesion(async () => {
      const res = await put("pmt-rol", { estado: "en_curso" })
      expect(res.status).toBe(403)
      expect(await res.json()).toEqual({ error: "Permiso denegado." })
      const enBd = await prisma.trabajoMT.findUnique({ where: { id: "pmt-rol" } })
      expect(enBd?.estado).toBe("planificado")
    }, emailResidente)
  }, 30_000)

  it("PUT sobre un id inexistente → 404", async () => {
    await conSesion(async () => {
      const res = await put("pmt-no-existe", { estado: "en_curso" })
      expect(res.status).toBe(404)
      expect(await res.json()).toEqual({ error: "Registro no encontrado." })
    })
  }, 30_000)
})
