/**
 * @vitest-environment node
 *
 * `/api/ir/solicitudes-insumo/[id]` — detalle/parcial/baja de solicitudes de
 * insumo IR.
 *
 * Recurso `ir:mantenimiento`: todos los roles leen, conserjería y mantención
 * editan, solo admin borra. El residente ya no crea solicitudes (decisión owner
 * 2026-10-21), así que sus negativas se fijan en PUT/DELETE.
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

const comunidad = "irsin-comunidad-a"
const otraComunidad = "irsin-comunidad-b"
const emailAdmin = "irsin-admin@test.cl"
const emailConserje = "irsin-conserje@test.cl"
const emailComite = "irsin-comite@test.cl"
const emailResidente = "irsin-residente@test.cl"
const emailAdminOtra = "irsin-admin-b@test.cl"

const idDe = (email: string): string => email.split("@")[0] ?? email

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

function pedir(metodo: "GET" | "PUT" | "DELETE", id: string, body?: unknown): NextRequest {
  return new NextRequest(`http://localhost/api/ir/solicitudes-insumo/${id}`, {
    method: metodo,
    ...(body !== undefined
      ? { body: JSON.stringify(body), headers: { "content-type": "application/json" } }
      : {}),
  })
}

async function invocar(metodo: "GET" | "PUT" | "DELETE", id: string, body?: unknown): Promise<Response> {
  const modulo = (await import("@/app/api/ir/solicitudes-insumo/[id]/route")) as unknown as Record<
    string,
    (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => Promise<Response>
  >
  return modulo[metodo]!(pedir(metodo, id, body), { params: Promise.resolve({ id }) })
}

const sembrarSolicitud = (id: string, comunidadId: string): Promise<unknown> =>
  prisma.solicitudInsumoIR.create({
    data: {
      id,
      comunidadId,
      folio: `SOL-${id}`,
      solicitantePersonaId: `irsin-persona-${id}`,
      estadoComodin: "no_comodin",
      cantidad: 2,
      areaDestino: "Bodega",
      estado: "pendiente",
      fechaSolicitud: "2026-06-01",
    },
  })

describe("/api/ir/solicitudes-insumo/[id] — detalle/parcial/baja scoped", () => {
  beforeAll(async () => {
    process.env.AUTH_SECRET = AUTH_SECRET
    for (const [id, slug] of [
      [comunidad, "irsin-a"],
      [otraComunidad, "irsin-b"],
    ] as const) {
      await prisma.comunidad.upsert({
        where: { id },
        update: {},
        create: { id, nombre: `Comunidad ${id}`, slug },
      })
    }
    const usuarios: Array<[string, string, string]> = [
      [emailAdmin, "administrador", comunidad],
      [emailConserje, "conserjeria", comunidad],
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
      await prisma.membresia.create({ data: { usuarioId: idDe(email), comunidadId, rol } })
    }
  }, 30_000)

  beforeEach(async () => {
    state.cookie = ""
    await prisma.solicitudInsumoIR.deleteMany({
      where: { comunidadId: { in: [comunidad, otraComunidad] } },
    })
    await sembrarSolicitud("irsin-1", comunidad)
    await sembrarSolicitud("irsin-b", otraComunidad)
  })

  afterAll(async () => {
    try {
      state.cookie = ""
      await prisma.solicitudInsumoIR.deleteMany({
        where: { comunidadId: { in: [comunidad, otraComunidad] } },
      })
      for (const email of [emailAdmin, emailConserje, emailComite, emailResidente, emailAdminOtra]) {
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
    expect((await invocar("GET", "irsin-1")).status).toBe(401)
  })

  it("GET propio → 200 para admin, conserjería y residente (`ir:mantenimiento` ver)", async () => {
    await conSesion(emailAdmin, async () => {
      const res = await invocar("GET", "irsin-1")
      expect(res.status).toBe(200)
      expect(((await res.json()) as { id: string }).id).toBe("irsin-1")
    })
    for (const email of [emailConserje, emailResidente]) {
      await conSesion(email, async () => {
        expect((await invocar("GET", "irsin-1")).status).toBe(200)
      })
    }
  })

  it("GET inexistente o de otra comunidad → 404", async () => {
    await conSesion(emailAdmin, async () => {
      expect((await invocar("GET", "irsin-no-existe")).status).toBe(404)
      expect((await invocar("GET", "irsin-b")).status).toBe(404)
    })
  })

  it("PUT parcial de área destino → 200 con el resto intacto y comunidadId descartado", async () => {
    await conSesion(emailConserje, async () => {
      const res = await invocar("PUT", "irsin-1", {
        areaDestino: "Hall principal",
        comunidadId: otraComunidad,
      })
      expect(res.status).toBe(200)
      const enBd = await prisma.solicitudInsumoIR.findUnique({ where: { id: "irsin-1" } })
      expect(enBd?.areaDestino).toBe("Hall principal")
      expect(enBd?.cantidad).toBe(2)
      expect(enBd?.comunidadId).toBe(comunidad)
    })
  })

  it("PUT con cantidad 0 → 400 sin escribir", async () => {
    await conSesion(emailAdmin, async () => {
      const res = await invocar("PUT", "irsin-1", { cantidad: 0 })
      expect(res.status).toBe(400)
      expect(((await res.json()) as { error: string }).error).toBe("Datos inválidos.")
      const enBd = await prisma.solicitudInsumoIR.findUnique({ where: { id: "irsin-1" } })
      expect(enBd?.cantidad).toBe(2)
    })
  })

  it("PUT de otra comunidad → 404 y no toca la fila ajena", async () => {
    await conSesion(emailAdmin, async () => {
      expect((await invocar("PUT", "irsin-b", { areaDestino: "Intento ajeno" })).status).toBe(404)
      const ajena = await prisma.solicitudInsumoIR.findUnique({ where: { id: "irsin-b" } })
      expect(ajena?.areaDestino).toBe("Bodega")
    })
  })

  it("PUT comité (solo `ir:mantenimiento` ver) → 403", async () => {
    await conSesion(emailComite, async () => {
      const res = await invocar("PUT", "irsin-1", { areaDestino: "Hall" })
      expect(res.status).toBe(403)
      expect(await res.json()).toEqual({ error: "Permiso denegado." })
    })
  })

  it("DELETE admin → 200 y la solicitud desaparece", async () => {
    await conSesion(emailAdmin, async () => {
      expect((await invocar("DELETE", "irsin-1")).status).toBe(200)
      expect(await prisma.solicitudInsumoIR.findUnique({ where: { id: "irsin-1" } })).toBeNull()
    })
  })

  it("DELETE residente (sin `ir:mantenimiento` eliminar) → 403 y permanece", async () => {
    await conSesion(emailResidente, async () => {
      expect((await invocar("DELETE", "irsin-1")).status).toBe(403)
      expect(await prisma.solicitudInsumoIR.findUnique({ where: { id: "irsin-1" } })).not.toBeNull()
    })
  })

  it("DELETE de otra comunidad → 404", async () => {
    await conSesion(emailAdmin, async () => {
      expect((await invocar("DELETE", "irsin-b")).status).toBe(404)
      expect(await prisma.solicitudInsumoIR.findUnique({ where: { id: "irsin-b" } })).not.toBeNull()
    })
  })
})
