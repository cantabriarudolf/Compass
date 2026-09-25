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

const comunidadA = "fase4-ge-a"
const comunidadB = "fase4-ge-b"
const emailAdminA = "f4-ge-admin-a@test.cl"
const emailAdminB = "f4-ge-admin-b@test.cl"

const cargaModulos = async () => ({
  solicitudes: await import("@/app/api/ge/solicitudes/route"),
  solicitudItem: await import("@/app/api/ge/solicitudes/[id]/route"),
})

type Handler = (
  req: NextRequest,
  ctx?: { params: Promise<{ id: string }> }
) => Promise<Response>

function solicitudValida(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "ge-sol-1",
    folio: "GE-0001",
    tipo: "buzon",
    titulo: "Filtración subterráneo",
    descripcion: "Agua acumulada en el nivel -1",
    estado: "nuevo",
    fechaCreacion: "2026-03-07",
    comentarios: [],
    mensajeBuzonId: "co-buz-1",
    historialEstados: [{ a: "nuevo", fecha: "2026-03-07T10:00:00.000Z" }],
    ...overrides,
  }
}

describe("/api GE — solicitudes con BD real (Fase 4)", () => {
  beforeAll(async () => {
    process.env.AUTH_SECRET = AUTH_SECRET
    for (const [cid, slug] of [[comunidadA, "fase4-ge-a"], [comunidadB, "fase4-ge-b"]] as const) {
      await prisma.comunidad.upsert({
        where: { id: cid },
        update: {},
        create: { id: cid, nombre: `Comunidad ${slug}`, slug },
      })
    }
    for (const u of [
      { id: "f4-ge-admin-a", email: emailAdminA, activo: true },
      { id: "f4-ge-admin-b", email: emailAdminB, activo: true },
    ]) {
      await prisma.usuario.upsert({ where: { email: u.email }, update: {}, create: u })
    }
    await prisma.membresia.deleteMany({
      where: { usuarioId: { in: ["f4-ge-admin-a", "f4-ge-admin-b"] } },
    })
    await prisma.membresia.create({
      data: { usuarioId: "f4-ge-admin-a", comunidadId: comunidadA, rol: "administrador" },
    })
    await prisma.membresia.create({
      data: { usuarioId: "f4-ge-admin-b", comunidadId: comunidadB, rol: "administrador" },
    })
    await prisma.solicitudGE.deleteMany({ where: { comunidadId: { in: [comunidadA, comunidadB] } } })
  }, 30_000)

  afterAll(async () => {
    try {
      state.cookie = ""
      await prisma.solicitudGE.deleteMany({ where: { comunidadId: { in: [comunidadA, comunidadB] } } })
      await prisma.membresia.deleteMany({
        where: { usuarioId: { in: ["f4-ge-admin-a", "f4-ge-admin-b"] } },
      })
      for (const id of ["f4-ge-admin-a", "f4-ge-admin-b"]) {
        await prisma.usuario.delete({ where: { id } }).catch(() => {})
      }
      for (const cid of [comunidadA, comunidadB]) {
        await prisma.comunidad.delete({ where: { id: cid } }).catch(() => {})
      }
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
    const { solicitudes } = await cargaModulos()
    state.cookie = ""
    const get = await solicitudes.GET(new NextRequest("http://localhost/api/ge/solicitudes"))
    expect(get.status).toBe(401)
  })

  it("admin crea solicitud → 201 y queda en la BD", async () => {
    const { solicitudes } = await cargaModulos()
    await conSesion(emailAdminA, async () => {
      const res = await llamar(Promise.resolve(solicitudes), "POST", "ge/solicitudes", solicitudValida())
      expect(res.status).toBe(201)
      const enBd = await prisma.solicitudGE.findUnique({ where: { id: "ge-sol-1" } })
      expect(enBd?.comunidadId).toBe(comunidadA)
      expect(enBd?.tipo).toBe("buzon")
    })
  })

  it("PUT avanza estado con historial y GET_ONE lo refleja", async () => {
    const { solicitudItem } = await cargaModulos()
    await conSesion(emailAdminA, async () => {
      const put = await llamar(Promise.resolve(solicitudItem), "PUT", "ge/solicitudes/ge-sol-1", {
        estado: "en_revision",
        historialEstados: [
          { a: "nuevo", fecha: "2026-03-07T10:00:00.000Z" },
          { de: "nuevo", a: "en_revision", fecha: "2026-03-08T09:00:00.000Z" },
        ],
      })
      expect(put.status).toBe(200)
      const uno = await llamar(Promise.resolve(solicitudItem), "GET", "ge/solicitudes/ge-sol-1")
      expect(((await uno.json()) as { estado: string }).estado).toBe("en_revision")
    })
  })

  it("otra comunidad no ve el registro → 404 (sin filtrar existencia)", async () => {
    const { solicitudItem, solicitudes } = await cargaModulos()
    await conSesion(emailAdminB, async () => {
      const uno = await llamar(Promise.resolve(solicitudItem), "GET", "ge/solicitudes/ge-sol-1")
      expect(uno.status).toBe(404)
      const lista = await llamar(Promise.resolve(solicitudes), "GET", "ge/solicitudes")
      expect(((await lista.json()) as { total: number }).total).toBe(0)
      const upsertAjeno = await llamar(Promise.resolve(solicitudes), "POST", "ge/solicitudes", solicitudValida({ titulo: "Intento ajeno" }))
      expect(upsertAjeno.status).toBe(404)
    })
  })

  it("DELETE → 200 y desaparece de la BD", async () => {
    const { solicitudItem } = await cargaModulos()
    await conSesion(emailAdminA, async () => {
      const del = await llamar(Promise.resolve(solicitudItem), "DELETE", "ge/solicitudes/ge-sol-1")
      expect(del.status).toBe(200)
      expect(await prisma.solicitudGE.findUnique({ where: { id: "ge-sol-1" } })).toBeNull()
    })
  })
})
