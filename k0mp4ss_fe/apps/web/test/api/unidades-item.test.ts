/**
 * @vitest-environment node
 *
 * `/api/unidades/[id]` — detalle, actualización parcial y baja de una unidad EF.
 *
 * La ruta mezcla factory (GET_ONE/DELETE) con un PUT propio que valida las FKs
 * sobre el registro mergeado. Se fija el contrato completo: authz `mp`, scoping
 * por comunidad (404 sin filtrar existencia), 400 de cuerpo/FKs, 409 de baja con
 * vínculos y que el `comunidadId` del body nunca se persiste.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest"
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

const comunidad = "uniitem-comunidad-a"
const otraComunidad = "uniitem-comunidad-b"
const emailAdmin = "uniitem-admin@test.cl"
const emailComite = "uniitem-comite@test.cl"
const emailResidente = "uniitem-residente@test.cl"
const emailAdminOtra = "uniitem-admin-b@test.cl"

const idDe = (email: string): string => email.split("@")[0] ?? email

const msA = "uniitem-ms-a"
const tuA = "uniitem-tu-a"
const eoA = "uniitem-eo-a"
const msB = "uniitem-ms-b"
const tuB = "uniitem-tu-b"
const eoB = "uniitem-eo-b"

interface Ctx {
  params: Promise<{ id: string }>
}

async function conSesion(email: string, fn: () => Promise<void>): Promise<void> {
  const usuario = await prisma.usuario.findUnique({ where: { email } })
  if (!usuario) throw new Error(`usuario no encontrado: ${email}`)
  const { cookieSesionAuthjs } = await import("../helpers/sesion-authjs")
  state.cookie = await cookieSesionAuthjs({ sub: usuario.id, email: usuario.email })
  try {
    await fn()
  } finally {
    state.cookie = ""
  }
}

function peticion(metodo: "GET" | "PUT" | "DELETE", id: string, body?: unknown): NextRequest {
  return new NextRequest(`http://localhost/api/unidades/${id}`, {
    method: metodo,
    ...(body !== undefined
      ? { body: JSON.stringify(body), headers: { "content-type": "application/json" } }
      : {}),
  })
}

async function GET(id: string): Promise<Response> {
  const { GET: handler } = await import("@/app/api/unidades/[id]/route")
  return handler(peticion("GET", id), { params: Promise.resolve({ id }) } as Ctx)
}

async function PUT(id: string, body?: unknown): Promise<Response> {
  const { PUT: handler } = await import("@/app/api/unidades/[id]/route")
  return handler(peticion("PUT", id, body), { params: Promise.resolve({ id }) } as Ctx)
}

async function DELETE(id: string): Promise<Response> {
  const { DELETE: handler } = await import("@/app/api/unidades/[id]/route")
  return handler(peticion("DELETE", id), { params: Promise.resolve({ id }) } as Ctx)
}

async function sembrarMaestros(
  cid: string,
  ms: string,
  tu: string,
  eo: string
): Promise<void> {
  await prisma.microSector.create({
    data: { id: ms, comunidadId: cid, macroSectorId: "uniitem-macro", nombre: `Micro ${ms}`, etiqueta: `MS ${ms}` },
  })
  await prisma.tipoUnidad.create({
    data: {
      id: tu,
      comunidadId: cid,
      nombre: `Tipo ${tu}`,
      categoria: "departamento",
      metraje: 60,
      montoBaseGc: 45_000,
      activo: true,
      historialTarifas: [],
    },
  })
  await prisma.estadoOcupacion.create({
    data: { id: eo, comunidadId: cid, nombre: `Estado ${eo}`, color: "bg-emerald-500 text-white" },
  })
}

const unidad = (
  id: string,
  comunidadId: string,
  ms: string,
  tu: string,
  eo: string,
  overrides: Record<string, unknown> = {}
): Promise<unknown> =>
  prisma.unidad.create({
    data: {
      id,
      comunidadId,
      microSectorId: ms,
      numero: id.endsWith("-b") ? "902" : "101",
      etiqueta: "Depto",
      tipoUnidadId: tu,
      metraje: 60,
      prorrateo: 1,
      rolSii: `rol-${id}`,
      estadoId: eo,
      servicios: {},
      ...overrides,
    },
  })

describe("/api/unidades/[id] — detalle/parcial/baja con FKs validadas", () => {
  beforeAll(async () => {
    process.env.AUTH_SECRET = AUTH_SECRET
    for (const [id, slug] of [
      [comunidad, "uniitem-a"],
      [otraComunidad, "uniitem-b"],
    ] as const) {
      await prisma.comunidad.upsert({
        where: { id },
        update: {},
        create: { id, nombre: `Comunidad ${id}`, slug },
      })
    }
    const usuarios: Array<[string, string, string]> = [
      [emailAdmin, "administrador", comunidad],
      [emailComite, "comite", comunidad],
      [emailResidente, "residente", comunidad],
      [emailAdminOtra, "administrador", otraComunidad],
    ]
    for (const [email, rol, comunidadId] of usuarios) {
      await prisma.usuario.upsert({
        where: { email },
        update: {},
        create: { id: idDe(email), email, activo: true },
      })
      await prisma.membresia.deleteMany({ where: { usuarioId: idDe(email) } })
      await prisma.membresia.create({
        data: { usuarioId: idDe(email), comunidadId, rol },
      })
    }
    await sembrarMaestros(comunidad, msA, tuA, eoA)
    await sembrarMaestros(otraComunidad, msB, tuB, eoB)
  }, 60_000)

  beforeEach(async () => {
    state.cookie = ""
    await prisma.vinculoUnidad.deleteMany({
      where: { comunidadId: { in: [comunidad, otraComunidad] } },
    })
    await prisma.unidad.deleteMany({
      where: { comunidadId: { in: [comunidad, otraComunidad] } },
    })
    await unidad("uniitem-unidad-1", comunidad, msA, tuA, eoA)
    await unidad("uniitem-unidad-b", otraComunidad, msB, tuB, eoB)
  })

  afterAll(async () => {
    try {
      state.cookie = ""
      await prisma.vinculoUnidad.deleteMany({
        where: { comunidadId: { in: [comunidad, otraComunidad] } },
      })
      await prisma.unidad.deleteMany({
        where: { comunidadId: { in: [comunidad, otraComunidad] } },
      })
      await prisma.microSector.deleteMany({ where: { id: { in: [msA, msB] } } })
      await prisma.tipoUnidad.deleteMany({ where: { id: { in: [tuA, tuB] } } })
      await prisma.estadoOcupacion.deleteMany({ where: { id: { in: [eoA, eoB] } } })
      for (const email of [emailAdmin, emailComite, emailResidente, emailAdminOtra]) {
        await prisma.membresia.deleteMany({ where: { usuarioId: idDe(email) } })
        await prisma.usuario.delete({ where: { id: idDe(email) } }).catch(() => {})
      }
      await prisma.comunidad.delete({ where: { id: otraComunidad } }).catch(() => {})
      await prisma.comunidad.delete({ where: { id: comunidad } }).catch(() => {})
    } catch {
      // limpieza best-effort
    }
  })

  it("GET sin sesión → 401", async () => {
    state.cookie = ""
    const res = await GET("uniitem-unidad-1")
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: "No autenticado." })
  })

  it("GET admin, comité y get por id propio → 200", async () => {
    await conSesion(emailAdmin, async () => {
      const res = await GET("uniitem-unidad-1")
      expect(res.status).toBe(200)
      const json = (await res.json()) as { id: string; comunidadId: string }
      expect(json.id).toBe("uniitem-unidad-1")
      expect(json.comunidadId).toBe(comunidad)
    })
    await conSesion(emailComite, async () => {
      expect((await GET("uniitem-unidad-1")).status).toBe(200)
    })
  })

  it("GET residente sin permiso `mp` ver → 403", async () => {
    await conSesion(emailResidente, async () => {
      const res = await GET("uniitem-unidad-1")
      expect(res.status).toBe(403)
      expect(await res.json()).toEqual({ error: "Permiso denegado." })
    })
  })

  it("GET unidad inexistente o de otra comunidad → 404", async () => {
    await conSesion(emailAdmin, async () => {
      const inexistente = await GET("uniitem-no-existe")
      expect(inexistente.status).toBe(404)
      expect(await inexistente.json()).toEqual({ error: "Registro no encontrado." })
      expect((await GET("uniitem-unidad-b")).status).toBe(404)
    })
  })

  it("DELETE sin vínculos → 200 y desaparece de la BD", async () => {
    await conSesion(emailAdmin, async () => {
      const res = await DELETE("uniitem-unidad-1")
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ ok: true })
      expect(await prisma.unidad.findUnique({ where: { id: "uniitem-unidad-1" } })).toBeNull()
    })
  })

  it("DELETE con vínculos asociados → 409 y la unidad permanece", async () => {
    await prisma.vinculoUnidad.create({
      data: {
        id: "uniitem-vinculo-1",
        comunidadId: comunidad,
        personaId: "uniitem-persona-1",
        unidadId: "uniitem-unidad-1",
        rol: "propietario",
        fechaInicio: "2025-01-01",
        permiteVerFinanzas: true,
      },
    })
    await conSesion(emailAdmin, async () => {
      const res = await DELETE("uniitem-unidad-1")
      expect(res.status).toBe(409)
      expect(await res.json()).toEqual({
        error: "No se puede eliminar la unidad: tiene vínculos asociados.",
      })
      expect(await prisma.unidad.findUnique({ where: { id: "uniitem-unidad-1" } })).not.toBeNull()
    })
  })

  it("DELETE comité (mp sin `eliminar`) → 403 y la unidad permanece", async () => {
    await conSesion(emailComite, async () => {
      const res = await DELETE("uniitem-unidad-1")
      expect(res.status).toBe(403)
      expect(await res.json()).toEqual({ error: "Permiso denegado." })
      expect(await prisma.unidad.findUnique({ where: { id: "uniitem-unidad-1" } })).not.toBeNull()
    })
  })

  it("DELETE unidad de otra comunidad → 404 y no la borra", async () => {
    await conSesion(emailAdmin, async () => {
      expect((await DELETE("uniitem-unidad-b")).status).toBe(404)
      expect(await prisma.unidad.findUnique({ where: { id: "uniitem-unidad-b" } })).not.toBeNull()
    })
  })

  it("PUT residente sin `mp` editar → 403", async () => {
    await conSesion(emailResidente, async () => {
      const res = await PUT("uniitem-unidad-1", { etiqueta: "Casa" })
      expect(res.status).toBe(403)
      expect(await res.json()).toEqual({ error: "Permiso denegado." })
    })
  })

  it("PUT sin cuerpo → 400 Cuerpo JSON inválido", async () => {
    await conSesion(emailAdmin, async () => {
      const res = await PUT("uniitem-unidad-1")
      expect(res.status).toBe(400)
      expect(await res.json()).toEqual({ error: "Cuerpo JSON inválido." })
    })
  })

  it("PUT con dato inválido (metraje negativo) → 400 con detalles", async () => {
    await conSesion(emailAdmin, async () => {
      const res = await PUT("uniitem-unidad-1", { metraje: -1 })
      expect(res.status).toBe(400)
      const json = (await res.json()) as { error: string; detalles?: unknown }
      expect(json.error).toBe("Datos inválidos.")
      expect(json.detalles).toBeTruthy()
      const enBd = await prisma.unidad.findUnique({ where: { id: "uniitem-unidad-1" } })
      expect(enBd?.metraje).toBe(60)
    })
  })

  it("PUT con FK que no existe en la comunidad → 400 con el mensaje de la FK", async () => {
    await conSesion(emailAdmin, async () => {
      const res = await PUT("uniitem-unidad-1", { microSectorId: msB })
      expect(res.status).toBe(400)
      expect(await res.json()).toEqual({
        error: "No se puede guardar la unidad: microSectorId no existe en microSectores.",
      })
      const enBd = await prisma.unidad.findUnique({ where: { id: "uniitem-unidad-1" } })
      expect(enBd?.microSectorId).toBe(msA)
    })
  })

  it("PUT parcial actualiza solo lo enviado y descarta comunidadId del body", async () => {
    await conSesion(emailAdmin, async () => {
      const res = await PUT("uniitem-unidad-1", {
        etiqueta: "Casa",
        numero: "101-B",
        comunidadId: otraComunidad,
      })
      expect(res.status).toBe(200)
      const enBd = await prisma.unidad.findUnique({ where: { id: "uniitem-unidad-1" } })
      expect(enBd?.etiqueta).toBe("Casa")
      expect(enBd?.numero).toBe("101-B")
      // El resto del registro no se toca en un PUT parcial.
      expect(enBd?.metraje).toBe(60)
      expect(enBd?.comunidadId).toBe(comunidad)
    })
  })

  it("PUT sobre unidad inexistente o de otra comunidad → 404", async () => {
    await conSesion(emailAdmin, async () => {
      expect((await PUT("uniitem-no-existe", { etiqueta: "Casa" })).status).toBe(404)
      expect((await PUT("uniitem-unidad-b", { etiqueta: "Casa" })).status).toBe(404)
      const ajena = await prisma.unidad.findUnique({ where: { id: "uniitem-unidad-b" } })
      expect(ajena?.etiqueta).toBe("Depto")
    })
  })

  it("PUT admin de la otra comunidad sobre la unidad ajena → 404", async () => {
    await conSesion(emailAdminOtra, async () => {
      expect((await PUT("uniitem-unidad-1", { etiqueta: "Casa" })).status).toBe(404)
      expect((await GET("uniitem-unidad-1")).status).toBe(404)
    })
  })
})
