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

const comunidad = "ef-comunidad-a"
const emailAdmin = "ef-admin@test.cl"
const emailResidente = "ef-residente@test.cl"

const cargaModulos = async () => ({
  tipos: await import("@/app/api/tipos-unidad/route"),
  tipoItem: await import("@/app/api/tipos-unidad/[id]/route"),
  macros: await import("@/app/api/macro-sectores/route"),
  macroItem: await import("@/app/api/macro-sectores/[id]/route"),
  micros: await import("@/app/api/micro-sectores/route"),
  microItem: await import("@/app/api/micro-sectores/[id]/route"),
  unidades: await import("@/app/api/unidades/route"),
  unidadItem: await import("@/app/api/unidades/[id]/route"),
})

async function llamar(
  modulo: Promise<unknown>,
  metodo: "POST" | "GET" | "PUT" | "DELETE",
  path: string,
  body?: unknown
): Promise<Response> {
  const m = (await modulo) as unknown as Record<
    string,
    (req: NextRequest, ctx?: { params: Promise<{ id: string }> }) => Promise<Response>
  >
  // SAFETY: el path es interno del test (colección o colección/id).
  const id = (path.split("?")[0] ?? path).split("/").pop() ?? ""
  const colecciones = ["tipos-unidad", "macro-sectores", "micro-sectores", "unidades"]
  const req = new NextRequest(`http://localhost/api/${path}`, {
    method: metodo,
    ...(body !== undefined
      ? { body: JSON.stringify(body), headers: { "content-type": "application/json" } }
      : {}),
  })
  if (!colecciones.includes(id)) {
    const fn = m[metodo]
    if (!fn) throw new Error(`handler no encontrado: ${metodo} ${path}`)
    return fn(req, { params: Promise.resolve({ id }) })
  }
  const col = m[metodo] as ((req: NextRequest) => Promise<Response>) | undefined
  if (!col) throw new Error(`handler no encontrado: ${metodo} ${path}`)
  return col(req)
}

describe("/api EF completo — estructura física con BD real (Fase 3)", () => {
  beforeAll(async () => {
    process.env.AUTH_SECRET = AUTH_SECRET
    await prisma.comunidad.upsert({
      where: { id: comunidad },
      update: {},
      create: { id: comunidad, nombre: "Comunidad A EF", slug: "ef-comunidad-a" },
    })
    for (const u of [
      { id: "ef-usuario-admin", email: emailAdmin, activo: true },
      { id: "ef-usuario-residente", email: emailResidente, activo: true },
    ]) {
      await prisma.usuario.upsert({ where: { email: u.email }, update: {}, create: u })
    }
    await prisma.membresia.deleteMany({
      where: { usuarioId: { in: ["ef-usuario-admin", "ef-usuario-residente"] } },
    })
    await prisma.membresia.create({
      data: { usuarioId: "ef-usuario-admin", comunidadId: comunidad, rol: "administrador" },
    })
    await prisma.membresia.create({
      data: { usuarioId: "ef-usuario-residente", comunidadId: comunidad, rol: "residente" },
    })
    await prisma.vinculoUnidad.deleteMany({ where: { comunidadId: comunidad } })
    await prisma.unidad.deleteMany({ where: { comunidadId: comunidad } })
    await prisma.microSector.deleteMany({ where: { comunidadId: comunidad } })
    await prisma.macroSector.deleteMany({ where: { comunidadId: comunidad } })
    await prisma.tipoUnidad.deleteMany({ where: { comunidadId: comunidad } })
    await prisma.estadoOcupacion.upsert({
      where: { id: "ef-estado-ocupado" },
      update: {},
      create: { id: "ef-estado-ocupado", comunidadId: comunidad, nombre: "Ocupado", color: "green" },
    })
  }, 30_000)

  afterAll(async () => {
    try {
      state.cookie = ""
      await prisma.vinculoUnidad.deleteMany({ where: { comunidadId: comunidad } })
      await prisma.unidad.deleteMany({ where: { comunidadId: comunidad } })
      await prisma.microSector.deleteMany({ where: { comunidadId: comunidad } })
      await prisma.macroSector.deleteMany({ where: { comunidadId: comunidad } })
      await prisma.tipoUnidad.deleteMany({ where: { comunidadId: comunidad } })
      await prisma.persona.deleteMany({ where: { comunidadId: comunidad } })
      await prisma.membresia.deleteMany({
        where: { usuarioId: { in: ["ef-usuario-admin", "ef-usuario-residente"] } },
      })
      for (const id of ["ef-usuario-admin", "ef-usuario-residente"]) {
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

  it("macro + micro + tipo + unidad: alta encadenada queda en la BD", async () => {
    const { macros, micros, tipos, unidades } = await cargaModulos()
    await conSesion(emailAdmin, async () => {
      const macro = await llamar(Promise.resolve(macros), "POST", "macro-sectores", {
        id: "ef-macro-1",
        nombre: "Torre A",
        etiqueta: "TA",
      })
      expect(macro.status).toBe(201)

      const micro = await llamar(Promise.resolve(micros), "POST", "micro-sectores", {
        id: "ef-micro-1",
        macroSectorId: "ef-macro-1",
        nombre: "Piso 1",
        etiqueta: "P1",
      })
      expect(micro.status).toBe(201)

      const tipo = await llamar(Promise.resolve(tipos), "POST", "tipos-unidad", {
        id: "ef-tipo-1",
        nombre: "Departamento",
        categoria: "habitacional",
        metraje: 60,
        montoBaseGc: 80000,
        activo: true,
        historialTarifas: [],
      })
      expect(tipo.status).toBe(201)

      const unidad = await llamar(Promise.resolve(unidades), "POST", "unidades", {
        id: "ef-u-101",
        microSectorId: "ef-micro-1",
        numero: "101",
        etiqueta: "Depto 101",
        tipoUnidadId: "ef-tipo-1",
        metraje: 60,
        prorrateo: 0.5,
        rolSii: "101-1",
        estadoId: "ef-estado-ocupado",
        servicios: {},
      })
      expect(unidad.status).toBe(201)
      const enBd = await prisma.unidad.findUnique({ where: { id: "ef-u-101" } })
      expect(enBd?.comunidadId).toBe(comunidad)
      expect(enBd?.numero).toBe("101")
    })
  })

  it("micro con macro inexistente → 400", async () => {
    const { micros } = await cargaModulos()
    await conSesion(emailAdmin, async () => {
      const res = await llamar(Promise.resolve(micros), "POST", "micro-sectores", {
        id: "ef-micro-x",
        macroSectorId: "no-existe",
        nombre: "Piso X",
        etiqueta: "PX",
      })
      expect(res.status).toBe(400)
      expect(await prisma.microSector.findUnique({ where: { id: "ef-micro-x" } })).toBeNull()
    })
  })

  it("unidad con tipo inexistente → 400", async () => {
    const { unidades } = await cargaModulos()
    await conSesion(emailAdmin, async () => {
      const res = await llamar(Promise.resolve(unidades), "POST", "unidades", {
        id: "ef-u-x",
        microSectorId: "ef-micro-1",
        numero: "999",
        etiqueta: "Depto 999",
        tipoUnidadId: "tipo-fantasma",
        metraje: 10,
        prorrateo: 0.1,
        rolSii: "999-9",
        estadoId: "ef-estado-ocupado",
        servicios: {},
      })
      expect(res.status).toBe(400)
      expect(await prisma.unidad.findUnique({ where: { id: "ef-u-x" } })).toBeNull()
    })
  })

  it("DELETE macro con micros → 409; DELETE micro con unidades → 409; DELETE tipo con unidades → 409", async () => {
    const { macroItem, microItem, tipoItem } = await cargaModulos()
    await conSesion(emailAdmin, async () => {
      const m1 = await llamar(Promise.resolve(macroItem), "DELETE", "macro-sectores/ef-macro-1")
      expect(m1.status).toBe(409)
      const m2 = await llamar(Promise.resolve(microItem), "DELETE", "micro-sectores/ef-micro-1")
      expect(m2.status).toBe(409)
      const m3 = await llamar(Promise.resolve(tipoItem), "DELETE", "tipos-unidad/ef-tipo-1")
      expect(m3.status).toBe(409)
      expect(await prisma.macroSector.findUnique({ where: { id: "ef-macro-1" } })).not.toBeNull()
    })
  })

  it("DELETE unidad con vínculo → 409", async () => {
    const { unidadItem } = await cargaModulos()
    await prisma.persona.upsert({
      where: { id: "ef-pers-1" },
      update: {},
      create: {
        id: "ef-pers-1",
        comunidadId: comunidad,
        rut: "33333333-3",
        nombreCompleto: "Dueña Una",
        nombres: "Dueña",
        apellidos: "Una",
        email: "ef-duena@test.cl",
        telefonoMovil: "+56900000000",
        estadoCuenta: "activa",
        condicionesEspecialesIds: [],
        roles: [],
      },
    })
    await prisma.vinculoUnidad.upsert({
      where: { id: "ef-vinc-1" },
      update: {},
      create: {
        id: "ef-vinc-1",
        comunidadId: comunidad,
        personaId: "ef-pers-1",
        unidadId: "ef-u-101",
        rol: "propietario",
        fechaInicio: "2026-01-01",
        permiteVerFinanzas: true,
      },
    })
    await conSesion(emailAdmin, async () => {
      const res = await llamar(Promise.resolve(unidadItem), "DELETE", "unidades/ef-u-101")
      expect(res.status).toBe(409)
      expect(await prisma.unidad.findUnique({ where: { id: "ef-u-101" } })).not.toBeNull()
    })
  })

  it("residente: GET unidades → 403", async () => {
    const { unidades } = await cargaModulos()
    await conSesion(emailResidente, async () => {
      const res = await llamar(Promise.resolve(unidades), "GET", "unidades")
      expect(res.status).toBe(403)
    })
  })

  it("PUT parcial de unidad actualiza solo el parche", async () => {
    const { unidadItem } = await cargaModulos()
    await conSesion(emailAdmin, async () => {
      const res = await llamar(Promise.resolve(unidadItem), "PUT", "unidades/ef-u-101", {
        prorrateo: 0.75,
      })
      expect(res.status).toBe(200)
      const enBd = await prisma.unidad.findUnique({ where: { id: "ef-u-101" } })
      expect(enBd?.prorrateo).toBe(0.75)
      expect(enBd?.numero).toBe("101")
    })
  })
})
