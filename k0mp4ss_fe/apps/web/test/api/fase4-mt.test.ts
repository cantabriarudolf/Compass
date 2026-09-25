/**
 * @vitest-environment node
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

const AUTH_SECRET = "test-secret-12345678"

const comunidad = "fase4-mt"
const emailAdmin = "f4-mt-admin@test.cl"
const emailMantencion = "f4-mt-tecnico@test.cl"

const cargaModulos = async () => ({
  trabajos: await import("@/app/api/mt/trabajos/route"),
  trabajoItem: await import("@/app/api/mt/trabajos/[id]/route"),
  proyectos: await import("@/app/api/mt/proyectos/route"),
  proyectoItem: await import("@/app/api/mt/proyectos/[id]/route"),
})

type Handler = (
  req: NextRequest,
  ctx?: { params: Promise<{ id: string }> }
) => Promise<Response>

function trabajoValido(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "mt-tr-1",
    folio: "MT-0001",
    titulo: "Reparación bomba hidropack",
    descripcion: "Cambio de sello mecánico y revisión del tablero de control",
    prioridad: "alta",
    estado: "planificado",
    costoTotal: 350000,
    origenFondos: "gasto_comun",
    estadoPago: "pendiente",
    alertaGarantiaEnviada: false,
    evidencias: [],
    ...overrides,
  }
}

describe("/api MT — mantenimiento y proyectos con BD real (Fase 4)", () => {
  beforeAll(async () => {
    process.env.AUTH_SECRET = AUTH_SECRET
    await prisma.comunidad.upsert({
      where: { id: comunidad },
      update: {},
      create: { id: comunidad, nombre: "Comunidad F4 MT", slug: "fase4-mt" },
    })
    for (const u of [
      { id: "f4-mt-admin", email: emailAdmin, activo: true },
      { id: "f4-mt-tecnico", email: emailMantencion, activo: true },
    ]) {
      await prisma.usuario.upsert({ where: { email: u.email }, update: {}, create: u })
    }
    await prisma.membresia.deleteMany({
      where: { usuarioId: { in: ["f4-mt-admin", "f4-mt-tecnico"] } },
    })
    await prisma.membresia.create({
      data: { usuarioId: "f4-mt-admin", comunidadId: comunidad, rol: "administrador" },
    })
    await prisma.membresia.create({
      data: { usuarioId: "f4-mt-tecnico", comunidadId: comunidad, rol: "mantencion" },
    })
    await prisma.trabajoMT.deleteMany({ where: { comunidadId: comunidad } })
    await prisma.proyectoMT.deleteMany({ where: { comunidadId: comunidad } })
  }, 30_000)

  afterAll(async () => {
    try {
      state.cookie = ""
      await prisma.trabajoMT.deleteMany({ where: { comunidadId: comunidad } })
      await prisma.proyectoMT.deleteMany({ where: { comunidadId: comunidad } })
      await prisma.membresia.deleteMany({
        where: { usuarioId: { in: ["f4-mt-admin", "f4-mt-tecnico"] } },
      })
      for (const id of ["f4-mt-admin", "f4-mt-tecnico"]) {
        await prisma.usuario.delete({ where: { id } }).catch(() => {})
      }
      await prisma.comunidad.delete({ where: { id: comunidad } }).catch(() => {})
    } catch {
      // intencional: limpieza best-effort
    }
  })

  async function conSesion(email: string, fn: () => Promise<void>): Promise<void> {
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

  async function llamar(
    modulo: Promise<unknown>,
    metodo: "POST" | "GET" | "PUT" | "DELETE",
    path: string,
    body?: unknown
  ): Promise<Response> {
    // SAFETY: los módulos de route exportan handlers (req, ctx?) compatibles con Handler;
    // el cast solo adapta el tipo del import dinámico, nunca cambia valores.
    const m = (await modulo) as unknown as Record<string, Handler>
    // SAFETY: el path es interno del test (colección de 2 segmentos o ítem de 3, con query opcional).
    const limpio = path.split("?")[0] ?? path
    const partes = limpio.split("/")
    const id = partes[partes.length - 1] ?? ""
    const fn = m[metodo]
    if (!fn) throw new Error(`handler no encontrado: ${metodo} ${path}`)
    const esItem = metodo !== "POST" && partes.length > 2
    const req = new NextRequest(`http://localhost/api/${path}`, {
      method: metodo,
      ...(body !== undefined
        ? { body: JSON.stringify(body), headers: { "content-type": "application/json" } }
        : {}),
    })
    if (esItem) return fn(req, { params: Promise.resolve({ id }) })
    return fn(req)
  }

  it("401 sin sesión", async () => {
    const { trabajos } = await cargaModulos()
    state.cookie = ""
    const get = await trabajos.GET(new NextRequest("http://localhost/api/mt/trabajos"))
    expect(get.status).toBe(401)
  })

  it("admin crea trabajo → 201 y queda en la BD", async () => {
    const { trabajos } = await cargaModulos()
    await conSesion(emailAdmin, async () => {
      const res = await llamar(Promise.resolve(trabajos), "POST", "mt/trabajos", trabajoValido())
      expect(res.status).toBe(201)
      const enBd = await prisma.trabajoMT.findUnique({ where: { id: "mt-tr-1" } })
      expect(enBd?.comunidadId).toBe(comunidad)
      expect(enBd?.folio).toBe("MT-0001")
    })
  })

  it("personal de mantención crea trabajo (recurso mt ver/crear/editar/ejecutar)", async () => {
    const { trabajos } = await cargaModulos()
    await conSesion(emailMantencion, async () => {
      const res = await llamar(Promise.resolve(trabajos), "POST", "mt/trabajos", trabajoValido({ id: "mt-tr-2", folio: "MT-0002" }))
      expect(res.status).toBe(201)
    })
  })

  it("PUT avanza a en_curso y proyecto se crea/lista/borra", async () => {
    const { trabajoItem, proyectos, proyectoItem } = await cargaModulos()
    await conSesion(emailAdmin, async () => {
      const put = await llamar(Promise.resolve(trabajoItem), "PUT", "mt/trabajos/mt-tr-1", { estado: "en_curso", fechaInicio: "2026-03-11" })
      expect(put.status).toBe(200)
      expect((await prisma.trabajoMT.findUnique({ where: { id: "mt-tr-1" } }))?.estado).toBe("en_curso")
      const c = await llamar(Promise.resolve(proyectos), "POST", "mt/proyectos", {
        id: "mt-py-1", nombre: "Recambio CCTV", presupuestoEstimado: 8000000, plazoMeses: 6, estado: "planificado",
      })
      expect(c.status).toBe(201)
      const lista = await llamar(Promise.resolve(proyectos), "GET", "mt/proyectos")
      expect(((await lista.json()) as { total: number }).total).toBeGreaterThanOrEqual(1)
      const del = await llamar(Promise.resolve(proyectoItem), "DELETE", "mt/proyectos/mt-py-1")
      expect(del.status).toBe(200)
      expect(await prisma.proyectoMT.findUnique({ where: { id: "mt-py-1" } })).toBeNull()
    })
  })
})
