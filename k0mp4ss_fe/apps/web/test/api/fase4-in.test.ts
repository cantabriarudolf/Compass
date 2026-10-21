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

const comunidad = "fase4-in"
const emailAdmin = "f4-in-admin@test.cl"
const emailResidente = "f4-in-residente@test.cl"
const emailComite = "f4-in-comite@test.cl"
const emailConserjeria = "f4-in-conserjeria@test.cl"
const idsUsuarios = ["f4-in-admin", "f4-in-residente", "f4-in-comite", "f4-in-conserjeria"]

const cargaModulos = async () => ({
  tipos: await import("@/app/api/in/tipos/route"),
  infracciones: await import("@/app/api/in/infracciones/route"),
  infraccionItem: await import("@/app/api/in/infracciones/[id]/route"),
})

type Handler = (
  req: NextRequest,
  ctx?: { params: Promise<{ id: string }> }
) => Promise<Response>

describe("/api IN — infracciones y multas con BD real (Fase 4)", () => {
  beforeAll(async () => {
    process.env.AUTH_SECRET = AUTH_SECRET
    await prisma.comunidad.upsert({
      where: { id: comunidad },
      update: {},
      create: { id: comunidad, nombre: "Comunidad F4 IN", slug: "fase4-in" },
    })
    for (const u of [
      { id: "f4-in-admin", email: emailAdmin, activo: true },
      { id: "f4-in-residente", email: emailResidente, activo: true },
      { id: "f4-in-comite", email: emailComite, activo: true },
      { id: "f4-in-conserjeria", email: emailConserjeria, activo: true },
    ]) {
      await prisma.usuario.upsert({ where: { email: u.email }, update: {}, create: u })
    }
    await prisma.membresia.deleteMany({
      where: { usuarioId: { in: idsUsuarios } },
    })
    await prisma.membresia.create({
      data: { usuarioId: "f4-in-admin", comunidadId: comunidad, rol: "administrador" },
    })
    await prisma.membresia.create({
      data: { usuarioId: "f4-in-residente", comunidadId: comunidad, rol: "residente" },
    })
    await prisma.membresia.create({
      data: { usuarioId: "f4-in-comite", comunidadId: comunidad, rol: "comite" },
    })
    await prisma.membresia.create({
      data: { usuarioId: "f4-in-conserjeria", comunidadId: comunidad, rol: "conserjeria" },
    })
    await prisma.infraccionIN.deleteMany({ where: { comunidadId: comunidad } })
    await prisma.tipoInfraccionIN.deleteMany({ where: { comunidadId: comunidad } })
  }, 30_000)

  afterAll(async () => {
    try {
      state.cookie = ""
      await prisma.infraccionIN.deleteMany({ where: { comunidadId: comunidad } })
      await prisma.tipoInfraccionIN.deleteMany({ where: { comunidadId: comunidad } })
      await prisma.membresia.deleteMany({
        where: { usuarioId: { in: idsUsuarios } },
      })
      for (const id of idsUsuarios) {
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
    const { tipos } = await cargaModulos()
    state.cookie = ""
    const get = await tipos.GET(new NextRequest("http://localhost/api/in/tipos"))
    expect(get.status).toBe(401)
  })

  it("tipo + infracción → 201 y quedan en la BD", async () => {
    const { tipos, infracciones } = await cargaModulos()
    await conSesion(emailAdmin, async () => {
      const t = await llamar(Promise.resolve(tipos), "POST", "in/tipos", {
        id: "in-tipo-1", nombre: "Ruido nocturno", categoria: "grave", tipoSancion: "monto_fijo", valor: 50000,
      })
      expect(t.status).toBe(201)
      const i = await llamar(Promise.resolve(infracciones), "POST", "in/infracciones", {
        id: "in-inf-1", folio: "IN-0001", tipoInfraccionId: "in-tipo-1", unidadId: "in-u-101",
        fechaSuceso: "2026-03-09", horaSuceso: "23:30",
        antecedentes: "Música a alto volumen pasada la medianoche en el departamento",
        evidencias: [], estado: "en_revision", fechaRegistro: "2026-03-10",
        comentariosDirectiva: [], respaldosDirectiva: [],
      })
      expect(i.status).toBe(201)
      const enBd = await prisma.infraccionIN.findUnique({ where: { id: "in-inf-1" } })
      expect(enBd?.comunidadId).toBe(comunidad)
      expect(enBd?.folio).toBe("IN-0001")
    })
  })

  it("PUT aplica multa (estado + monto) y GET lista", async () => {
    const { infraccionItem, infracciones } = await cargaModulos()
    await conSesion(emailAdmin, async () => {
      const put = await llamar(Promise.resolve(infraccionItem), "PUT", "in/infracciones/in-inf-1", { estado: "aplicada", montoAplicado: 50000 })
      expect(put.status).toBe(200)
      const enBd = await prisma.infraccionIN.findUnique({ where: { id: "in-inf-1" } })
      expect(enBd?.estado).toBe("aplicada")
      expect(enBd?.montoAplicado).toBe(50000)
      const lista = await llamar(Promise.resolve(infracciones), "GET", "in/infracciones")
      expect(((await lista.json()) as { total: number }).total).toBeGreaterThanOrEqual(1)
    })
  })

  it("residente sin recurso in en matriz → 403 en tipos (solo apela las propias: in:apelar)", async () => {
    const { tipos } = await cargaModulos()
    await conSesion(emailResidente, async () => {
      const post = await llamar(Promise.resolve(tipos), "POST", "in/tipos", {
        id: "in-tipo-r", nombre: "X", categoria: "leve", tipoSancion: "monto_fijo", valor: 1000,
      })
      expect(post.status).toBe(403)
    })
  })

  // Decisión owner 2026-10-21 (V3b de SERIE-DEUDA-6): el comité gestiona el expediente
  // (ve/crea/edita) y la conserjería reporta (ve/crea); el residente solo apela lo propio.
  it("comité y conserjería leen el expediente IN → 200 (antes 403 por matriz incompleta)", async () => {
    const { infracciones } = await cargaModulos()
    for (const email of [emailComite, emailConserjeria]) {
      await conSesion(email, async () => {
        const res = await llamar(Promise.resolve(infracciones), "GET", "in/infracciones")
        expect(res.status).toBe(200)
        expect(((await res.json()) as { total: number }).total).toBeGreaterThanOrEqual(1)
      })
    }
  })

  it("comité edita la infracción (200) y conserjería no (403: solo ve/crea)", async () => {
    const { infraccionItem } = await cargaModulos()
    await conSesion(emailComite, async () => {
      const put = await llamar(Promise.resolve(infraccionItem), "PUT", "in/infracciones/in-inf-1", {
        comentariosDirectiva: [],
      })
      expect(put.status).toBe(200)
    })
    await conSesion(emailConserjeria, async () => {
      const put = await llamar(Promise.resolve(infraccionItem), "PUT", "in/infracciones/in-inf-1", {
        comentariosDirectiva: [],
      })
      expect(put.status).toBe(403)
    })
  })

  it("conserjería reporta una infracción nueva → 201; residente no puede reportar → 403", async () => {
    const { infracciones } = await cargaModulos()
    const nueva = (id: string, unidadId: string) => ({
      id, folio: `IN-${id}`, tipoInfraccionId: "in-tipo-1", unidadId,
      fechaSuceso: "2026-03-11", horaSuceso: "08:15",
      antecedentes: "Ruido de equipos de construcción fuera del horario permitido.",
      evidencias: [], estado: "en_revision", fechaRegistro: "2026-03-11",
      comentariosDirectiva: [], respaldosDirectiva: [],
    })
    await conSesion(emailConserjeria, async () => {
      const post = await llamar(Promise.resolve(infracciones), "POST", "in/infracciones", nueva("in-inf-conserjeria", "in-u-102"))
      expect(post.status).toBe(201)
    })
    await conSesion(emailResidente, async () => {
      const post = await llamar(Promise.resolve(infracciones), "POST", "in/infracciones", nueva("in-inf-residente", "in-u-101"))
      expect(post.status).toBe(403)
      expect(await prisma.infraccionIN.findUnique({ where: { id: "in-inf-residente" } })).toBeNull()
    })
  })
})
