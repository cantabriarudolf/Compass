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

const comunidad = "fase4-cv"
const emailAdmin = "f4-cv-admin@test.cl"
const emailResidente = "f4-cv-residente@test.cl"

const cargaModulos = async () => ({
  avisos: await import("@/app/api/cv/avisos/route"),
  avisoItem: await import("@/app/api/cv/avisos/[id]/route"),
  plantillas: await import("@/app/api/cv/plantillas/route"),
})

type Handler = (
  req: NextRequest,
  ctx?: { params: Promise<{ id: string }> }
) => Promise<Response>

function avisoValido(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "cv-av-1",
    titulo: "Corte de agua",
    cuerpo: "Mañana de 10 a 12 hrs.",
    tipologia: "advertencia",
    duracionSegundos: 15,
    pantallaCompleta: false,
    tags: ["mantencion"],
    estado: "publicado",
    requiereVistoBueno: false,
    origen: "manual",
    fechaCreacion: "2026-03-01",
    ...overrides,
  }
}

describe("/api CV — visor de mensajes con BD real (Fase 4)", () => {
  beforeAll(async () => {
    process.env.AUTH_SECRET = AUTH_SECRET
    await prisma.comunidad.upsert({
      where: { id: comunidad },
      update: {},
      create: { id: comunidad, nombre: "Comunidad F4 CV", slug: "fase4-cv" },
    })
    for (const u of [
      { id: "f4-cv-admin", email: emailAdmin, activo: true },
      { id: "f4-cv-residente", email: emailResidente, activo: true },
    ]) {
      await prisma.usuario.upsert({ where: { email: u.email }, update: {}, create: u })
    }
    await prisma.membresia.deleteMany({
      where: { usuarioId: { in: ["f4-cv-admin", "f4-cv-residente"] } },
    })
    await prisma.membresia.create({
      data: { usuarioId: "f4-cv-admin", comunidadId: comunidad, rol: "administrador" },
    })
    await prisma.membresia.create({
      data: { usuarioId: "f4-cv-residente", comunidadId: comunidad, rol: "residente" },
    })
    await prisma.avisoCV.deleteMany({ where: { comunidadId: comunidad } })
    await prisma.plantillaCV.deleteMany({ where: { comunidadId: comunidad } })
  }, 30_000)

  afterAll(async () => {
    try {
      state.cookie = ""
      await prisma.avisoCV.deleteMany({ where: { comunidadId: comunidad } })
      await prisma.plantillaCV.deleteMany({ where: { comunidadId: comunidad } })
      await prisma.membresia.deleteMany({
        where: { usuarioId: { in: ["f4-cv-admin", "f4-cv-residente"] } },
      })
      for (const id of ["f4-cv-admin", "f4-cv-residente"]) {
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
    const { avisos } = await cargaModulos()
    state.cookie = ""
    const get = await avisos.GET(new NextRequest("http://localhost/api/cv/avisos"))
    expect(get.status).toBe(401)
  })

  it("admin crea aviso → 201 y queda en la BD", async () => {
    const { avisos } = await cargaModulos()
    await conSesion(emailAdmin, async () => {
      const res = await llamar(Promise.resolve(avisos), "POST", "cv/avisos", avisoValido())
      expect(res.status).toBe(201)
      const enBd = await prisma.avisoCV.findUnique({ where: { id: "cv-av-1" } })
      expect(enBd?.comunidadId).toBe(comunidad)
      expect(enBd?.titulo).toBe("Corte de agua")
    })
  })

  it("aviso con imagen y video a la vez → 400 (multimedia excluyente)", async () => {
    const { avisos } = await cargaModulos()
    await conSesion(emailAdmin, async () => {
      const res = await llamar(Promise.resolve(avisos), "POST", "cv/avisos", avisoValido({
        id: "cv-av-bad",
        imagenUrl: "https://example.com/a.jpg",
        videoUrl: "https://example.com/v.mp4",
      }))
      expect(res.status).toBe(400)
      expect(await prisma.avisoCV.findUnique({ where: { id: "cv-av-bad" } })).toBeNull()
    })
  })

  it("PUT parcial que rompería el refine → 400 (put-merge valida completo)", async () => {
    const { avisoItem } = await cargaModulos()
    await conSesion(emailAdmin, async () => {
      const conImagen = await llamar(Promise.resolve(avisoItem), "PUT", "cv/avisos/cv-av-1", { imagenUrl: "https://example.com/a.jpg" })
      expect(conImagen.status).toBe(200)
      const roto = await llamar(Promise.resolve(avisoItem), "PUT", "cv/avisos/cv-av-1", { videoUrl: "https://example.com/v.mp4" })
      expect(roto.status).toBe(400)
      const enBd = await prisma.avisoCV.findUnique({ where: { id: "cv-av-1" } })
      expect(enBd?.videoUrl).toBeNull()
    })
  })

  it("plantilla se crea y lista; DELETE aviso → 200", async () => {
    const { plantillas, avisos, avisoItem } = await cargaModulos()
    await conSesion(emailAdmin, async () => {
      const c = await llamar(Promise.resolve(plantillas), "POST", "cv/plantillas", {
        id: "cv-pl-1",
        titulo: "Aviso tipo",
        cuerpo: "Contenido base",
        tipologia: "info",
        duracionSegundosSugerida: 10,
        pantallaCompleta: false,
        tags: [],
        activa: true,
      })
      expect(c.status).toBe(201)
      const lista = await llamar(Promise.resolve(plantillas), "GET", "cv/plantillas")
      expect(((await lista.json()) as { total: number }).total).toBeGreaterThanOrEqual(1)
      const del = await llamar(Promise.resolve(avisoItem), "DELETE", "cv/avisos/cv-av-1")
      expect(del.status).toBe(200)
      expect(await prisma.avisoCV.findUnique({ where: { id: "cv-av-1" } })).toBeNull()
      expect(await llamar(Promise.resolve(avisos), "GET", "cv/avisos/cv-av-1")).toBeTruthy()
    })
  })

  it("residente sin recurso cv en matriz → 403 (desvío: solo admin hasta RP)", async () => {
    const { avisos } = await cargaModulos()
    await conSesion(emailResidente, async () => {
      const post = await llamar(Promise.resolve(avisos), "POST", "cv/avisos", avisoValido({ id: "cv-av-r" }))
      expect(post.status).toBe(403)
      const get = await llamar(Promise.resolve(avisos), "GET", "cv/avisos")
      expect(get.status).toBe(403)
    })
  })
})
