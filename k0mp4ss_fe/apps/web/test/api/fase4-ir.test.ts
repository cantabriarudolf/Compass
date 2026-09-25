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

const comunidad = "fase4-ir"
const emailAdmin = "f4-ir-admin@test.cl"

const cargaModulos = async () => ({
  recursos: await import("@/app/api/ir/recursos/route"),
  recursoItem: await import("@/app/api/ir/recursos/[id]/route"),
  solicitudes: await import("@/app/api/ir/solicitudes-insumo/route"),
  entregas: await import("@/app/api/ir/entregas-epp/route"),
})

type Handler = (
  req: NextRequest,
  ctx?: { params: Promise<{ id: string }> }
) => Promise<Response>

describe("/api IR — inventario y recursos con BD real (Fase 4)", () => {
  beforeAll(async () => {
    process.env.AUTH_SECRET = AUTH_SECRET
    await prisma.comunidad.upsert({
      where: { id: comunidad },
      update: {},
      create: { id: comunidad, nombre: "Comunidad F4 IR", slug: "fase4-ir" },
    })
    await prisma.usuario.upsert({ where: { email: emailAdmin }, update: {}, create: { id: "f4-ir-admin", email: emailAdmin, activo: true } })
    await prisma.membresia.deleteMany({ where: { usuarioId: "f4-ir-admin" } })
    await prisma.membresia.create({
      data: { usuarioId: "f4-ir-admin", comunidadId: comunidad, rol: "administrador" },
    })
    await prisma.recursoIR.deleteMany({ where: { comunidadId: comunidad } })
    await prisma.solicitudInsumoIR.deleteMany({ where: { comunidadId: comunidad } })
    await prisma.entregaEPP.deleteMany({ where: { comunidadId: comunidad } })
  }, 30_000)

  afterAll(async () => {
    try {
      state.cookie = ""
      await prisma.recursoIR.deleteMany({ where: { comunidadId: comunidad } })
      await prisma.solicitudInsumoIR.deleteMany({ where: { comunidadId: comunidad } })
      await prisma.entregaEPP.deleteMany({ where: { comunidadId: comunidad } })
      await prisma.membresia.deleteMany({ where: { usuarioId: "f4-ir-admin" } })
      await prisma.usuario.delete({ where: { id: "f4-ir-admin" } }).catch(() => {})
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
    const { recursos } = await cargaModulos()
    state.cookie = ""
    const get = await recursos.GET(new NextRequest("http://localhost/api/ir/recursos"))
    expect(get.status).toBe(401)
  })

  it("recurso de insumo con stock → 201 y queda en la BD", async () => {
    const { recursos } = await cargaModulos()
    await conSesion(emailAdmin, async () => {
      const res = await llamar(Promise.resolve(recursos), "POST", "ir/recursos", {
        id: "ir-rec-1", codigo: "IR-A-0001", nombre: "Ampolleta LED E27", categoria: "insumo",
        estadoActivo: "disponible", stock: 48, esCritico: true, umbralCritico: 10,
      })
      expect(res.status).toBe(201)
      const enBd = await prisma.recursoIR.findUnique({ where: { id: "ir-rec-1" } })
      expect(enBd?.comunidadId).toBe(comunidad)
      expect(enBd?.stock).toBe(48)
    })
  })

  it("solicitud de insumo → 201 y entrega EPP → 201", async () => {
    const { solicitudes, entregas } = await cargaModulos()
    await conSesion(emailAdmin, async () => {
      const s = await llamar(Promise.resolve(solicitudes), "POST", "ir/solicitudes-insumo", {
        id: "ir-sol-1", folio: "IR-0001", solicitantePersonaId: "ir-pers-1", recursoInsumoId: "ir-rec-1",
        estadoComodin: "no_comodin", cantidad: 6, areaDestino: "Escala B", estado: "pendiente", fechaSolicitud: "2026-03-08",
      })
      expect(s.status).toBe(201)
      expect((await prisma.solicitudInsumoIR.findUnique({ where: { id: "ir-sol-1" } }))?.comunidadId).toBe(comunidad)
      const e = await llamar(Promise.resolve(entregas), "POST", "ir/entregas-epp", {
        id: "ir-epp-1", recursoId: "ir-rec-1", personaId: "ir-pers-1", fechaEntrega: "2026-03-08", estado: "nuevo",
      })
      expect(e.status).toBe(201)
      expect((await prisma.entregaEPP.findUnique({ where: { id: "ir-epp-1" } }))?.estado).toBe("nuevo")
    })
  })

  it("PUT parcial actualiza stock y GET lista las 3 colecciones", async () => {
    const { recursoItem, recursos, solicitudes, entregas } = await cargaModulos()
    await conSesion(emailAdmin, async () => {
      const put = await llamar(Promise.resolve(recursoItem), "PUT", "ir/recursos/ir-rec-1", { stock: 42 })
      expect(put.status).toBe(200)
      expect((await prisma.recursoIR.findUnique({ where: { id: "ir-rec-1" } }))?.stock).toBe(42)
      for (const [mod, path] of [[Promise.resolve(recursos), "ir/recursos"], [Promise.resolve(solicitudes), "ir/solicitudes-insumo"], [Promise.resolve(entregas), "ir/entregas-epp"]] as const) {
        const lista = await llamar(mod, "GET", path)
        expect(lista.status).toBe(200)
        expect(((await lista.json()) as { total: number }).total).toBeGreaterThanOrEqual(1)
      }
    })
  })
})
