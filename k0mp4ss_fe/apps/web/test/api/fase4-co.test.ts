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

const comunidad = "fase4-co"
const emailAdmin = "f4-co-admin@test.cl"
const emailResidente = "f4-co-residente@test.cl"

const cargaModulos = async () => ({
  plantillas: await import("@/app/api/co/plantillas/route"),
  envios: await import("@/app/api/co/envios/route"),
  mensajes: await import("@/app/api/co/mensajes-buzon/route"),
  mensajeItem: await import("@/app/api/co/mensajes-buzon/[id]/route"),
  documentos: await import("@/app/api/co/documentos/route"),
})

type Handler = (
  req: NextRequest,
  ctx?: { params: Promise<{ id: string }> }
) => Promise<Response>

describe("/api CO — comunicación con vecinos con BD real (Fase 4)", () => {
  beforeAll(async () => {
    process.env.AUTH_SECRET = AUTH_SECRET
    await prisma.comunidad.upsert({
      where: { id: comunidad },
      update: {},
      create: { id: comunidad, nombre: "Comunidad F4 CO", slug: "fase4-co" },
    })
    for (const u of [
      { id: "f4-co-admin", email: emailAdmin, activo: true },
      { id: "f4-co-residente", email: emailResidente, activo: true },
    ]) {
      await prisma.usuario.upsert({ where: { email: u.email }, update: {}, create: u })
    }
    await prisma.membresia.deleteMany({
      where: { usuarioId: { in: ["f4-co-admin", "f4-co-residente"] } },
    })
    await prisma.membresia.create({
      data: { usuarioId: "f4-co-admin", comunidadId: comunidad, rol: "administrador" },
    })
    await prisma.membresia.create({
      data: { usuarioId: "f4-co-residente", comunidadId: comunidad, rol: "residente" },
    })
    await prisma.plantillaCO.deleteMany({ where: { comunidadId: comunidad } })
    await prisma.envioCO.deleteMany({ where: { comunidadId: comunidad } })
    await prisma.mensajeBuzonCO.deleteMany({ where: { comunidadId: comunidad } })
    await prisma.documentoCO.deleteMany({ where: { comunidadId: comunidad } })
  }, 30_000)

  afterAll(async () => {
    try {
      state.cookie = ""
      await prisma.plantillaCO.deleteMany({ where: { comunidadId: comunidad } })
      await prisma.envioCO.deleteMany({ where: { comunidadId: comunidad } })
      await prisma.mensajeBuzonCO.deleteMany({ where: { comunidadId: comunidad } })
      await prisma.documentoCO.deleteMany({ where: { comunidadId: comunidad } })
      await prisma.membresia.deleteMany({
        where: { usuarioId: { in: ["f4-co-admin", "f4-co-residente"] } },
      })
      for (const id of ["f4-co-admin", "f4-co-residente"]) {
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
    const { plantillas } = await cargaModulos()
    state.cookie = ""
    const get = await plantillas.GET(new NextRequest("http://localhost/api/co/plantillas"))
    expect(get.status).toBe(401)
  })

  it("las 4 entidades CO persisten en la BD", async () => {
    const { plantillas, envios, mensajes, documentos } = await cargaModulos()
    await conSesion(emailAdmin, async () => {
      const p = await llamar(Promise.resolve(plantillas), "POST", "co/plantillas", {
        id: "co-pl-1", nombre: "Aviso cobranza", categoria: "cobranza", asunto: "Cuota impaga", cuerpo: "Estimado [Nombre_Usuario]",
      })
      expect(p.status).toBe(201)
      const e = await llamar(Promise.resolve(envios), "POST", "co/envios", {
        id: "co-env-1", asunto: "Cuota impaga", cuerpo: "Regularice su situación", plantillaId: "co-pl-1",
        destinatarios: [{ personaId: "co-pers-1" }], fechaEnvio: "2026-03-05", lecturas: [],
      })
      expect(e.status).toBe(201)
      expect((await prisma.envioCO.findUnique({ where: { id: "co-env-1" } }))?.comunidadId).toBe(comunidad)
      const m = await llamar(Promise.resolve(mensajes), "POST", "co/mensajes-buzon", {
        id: "co-buz-1", folio: "BZ-0001", clasificacion: "reclamo", reportanteNombre: "Vecino Uno",
        asunto: "Ruido nocturno", cuerpo: "Música fuerte después de las 23 hrs", visibilidadComite: false,
        fechaIngreso: "2026-03-05", estado: "recibido", respuestas: [],
      })
      expect(m.status).toBe(201)
      const d = await llamar(Promise.resolve(documentos), "POST", "co/documentos", {
        id: "co-doc-1", nombre: "Reglamento", tipoMime: "application/pdf", tamanoKB: 120, url: "https://example.com/reglamento.pdf", categoria: "reglamentos",
      })
      expect(d.status).toBe(201)
      expect((await prisma.documentoCO.findUnique({ where: { id: "co-doc-1" } }))?.categoria).toBe("reglamentos")
    })
  })

  it("envío sin destinatarios → 400 y GET envíos paginado", async () => {
    const { envios } = await cargaModulos()
    await conSesion(emailAdmin, async () => {
      const malo = await llamar(Promise.resolve(envios), "POST", "co/envios", {
        id: "co-env-bad", asunto: "X", cuerpo: "Y", destinatarios: [], fechaEnvio: "2026-03-05", lecturas: [],
      })
      expect(malo.status).toBe(400)
      const lista = await llamar(Promise.resolve(envios), "GET", "co/envios?pageSize=5")
      const j = (await lista.json()) as { data: unknown[]; total: number; pageSize: number }
      expect(lista.status).toBe(200)
      expect(j.total).toBeGreaterThanOrEqual(1)
      expect(j.data.length).toBeLessThanOrEqual(5)
    })
  })

  it("residente crea mensaje en el buzón (co ver/crear) y PUT avanza estado", async () => {
    const { mensajes, mensajeItem } = await cargaModulos()
    await conSesion(emailResidente, async () => {
      const c = await llamar(Promise.resolve(mensajes), "POST", "co/mensajes-buzon", {
        id: "co-buz-2", folio: "BZ-0002", clasificacion: "sugerencia", reportanteNombre: "Vecina Dos",
        asunto: "Banca plaza", cuerpo: "Reponer banca rota de la plaza", visibilidadComite: true,
        fechaIngreso: "2026-03-06", estado: "recibido", respuestas: [],
      })
      expect(c.status).toBe(201)
    })
    await conSesion(emailAdmin, async () => {
      const put = await llamar(Promise.resolve(mensajeItem), "PUT", "co/mensajes-buzon/co-buz-2", { estado: "en_gestion" })
      expect(put.status).toBe(200)
      expect((await prisma.mensajeBuzonCO.findUnique({ where: { id: "co-buz-2" } }))?.estado).toBe("en_gestion")
    })
  })
})
