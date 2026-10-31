/**
 * @vitest-environment node
 *
 * `/api/in/tipos/[id]` — detalle/parcial/baja del catálogo de infracciones IN.
 *
 * Recursos: `in` ver/crear/editar (comité) y eliminar solo admin; conserjería
 * reporta pero no edita; el residente ni siquiera ve el expediente. Se fija el
 * 401, los 403 por acción, el 400 de validación, el 404 cross-comunidad y que
 * `comunidadId` del body nunca se persiste.
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

const comunidad = "intip-comunidad-a"
const otraComunidad = "intip-comunidad-b"
const emailAdmin = "intip-admin@test.cl"
const emailConserje = "intip-conserje@test.cl"
const emailComite = "intip-comite@test.cl"
const emailResidente = "intip-residente@test.cl"
const emailAdminOtra = "intip-admin-b@test.cl"

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
  return new NextRequest(`http://localhost/api/in/tipos/${id}`, {
    method: metodo,
    ...(body !== undefined
      ? { body: JSON.stringify(body), headers: { "content-type": "application/json" } }
      : {}),
  })
}

async function invocar(metodo: "GET" | "PUT" | "DELETE", id: string, body?: unknown): Promise<Response> {
  const modulo = (await import("@/app/api/in/tipos/[id]/route")) as unknown as Record<
    string,
    (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => Promise<Response>
  >
  return modulo[metodo]!(pedir(metodo, id, body), { params: Promise.resolve({ id }) })
}

const sembrarTipo = (id: string, comunidadId: string): Promise<unknown> =>
  prisma.tipoInfraccionIN.create({
    data: {
      id,
      comunidadId,
      nombre: `Infracción ${id}`,
      categoria: "leve",
      tipoSancion: "monto_fijo",
      valor: 10_000,
    },
  })

describe("/api/in/tipos/[id] — detalle/parcial/baja scoped", () => {
  beforeAll(async () => {
    process.env.AUTH_SECRET = AUTH_SECRET
    for (const [id, slug] of [
      [comunidad, "intip-a"],
      [otraComunidad, "intip-b"],
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
    await prisma.tipoInfraccionIN.deleteMany({
      where: { comunidadId: { in: [comunidad, otraComunidad] } },
    })
    await sembrarTipo("intip-1", comunidad)
    await sembrarTipo("intip-b", otraComunidad)
  })

  afterAll(async () => {
    try {
      state.cookie = ""
      await prisma.tipoInfraccionIN.deleteMany({
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
    expect((await invocar("GET", "intip-1")).status).toBe(401)
  })

  it("GET residente (sin `in`) → 403", async () => {
    await conSesion(emailResidente, async () => {
      const res = await invocar("GET", "intip-1")
      expect(res.status).toBe(403)
      expect(await res.json()).toEqual({ error: "Permiso denegado." })
    })
  })

  it("GET propio → 200 para admin, comité y conserjería (`in` ver)", async () => {
    await conSesion(emailAdmin, async () => {
      const res = await invocar("GET", "intip-1")
      expect(res.status).toBe(200)
      expect(((await res.json()) as { id: string }).id).toBe("intip-1")
    })
    for (const email of [emailComite, emailConserje]) {
      await conSesion(email, async () => {
        expect((await invocar("GET", "intip-1")).status).toBe(200)
      })
    }
  })

  it("GET inexistente o de otra comunidad → 404", async () => {
    await conSesion(emailAdmin, async () => {
      expect((await invocar("GET", "intip-no-existe")).status).toBe(404)
      expect((await invocar("GET", "intip-b")).status).toBe(404)
    })
  })

  it("PUT parcial → 200, persiste el cambio y descarta comunidadId del body", async () => {
    await conSesion(emailAdmin, async () => {
      const res = await invocar("PUT", "intip-1", {
        valor: 15_000,
        comunidadId: otraComunidad,
      })
      expect(res.status).toBe(200)
      const enBd = await prisma.tipoInfraccionIN.findUnique({ where: { id: "intip-1" } })
      expect(enBd?.valor).toBe(15_000)
      expect(enBd?.nombre).toBe("Infracción intip-1")
      expect(enBd?.comunidadId).toBe(comunidad)
    })
  })

  it("PUT con valor negativo → 400 sin escribir", async () => {
    await conSesion(emailAdmin, async () => {
      const res = await invocar("PUT", "intip-1", { valor: -1 })
      expect(res.status).toBe(400)
      expect(((await res.json()) as { error: string }).error).toBe("Datos inválidos.")
      const enBd = await prisma.tipoInfraccionIN.findUnique({ where: { id: "intip-1" } })
      expect(enBd?.valor).toBe(10_000)
    })
  })

  it("PUT de otra comunidad → 404 y no toca la fila ajena", async () => {
    await conSesion(emailAdmin, async () => {
      expect((await invocar("PUT", "intip-b", { valor: 1 })).status).toBe(404)
      const ajena = await prisma.tipoInfraccionIN.findUnique({ where: { id: "intip-b" } })
      expect(ajena?.valor).toBe(10_000)
    })
  })

  it("PUT conserjería (in crear, sin editar) → 403", async () => {
    await conSesion(emailConserje, async () => {
      const res = await invocar("PUT", "intip-1", { valor: 1 })
      expect(res.status).toBe(403)
      expect(await res.json()).toEqual({ error: "Permiso denegado." })
    })
  })

  it("DELETE admin → 200 y el tipo desaparece", async () => {
    await conSesion(emailAdmin, async () => {
      expect((await invocar("DELETE", "intip-1")).status).toBe(200)
      expect(await prisma.tipoInfraccionIN.findUnique({ where: { id: "intip-1" } })).toBeNull()
    })
  })

  it("DELETE comité (in sin eliminar) → 403 y permanece", async () => {
    await conSesion(emailComite, async () => {
      expect((await invocar("DELETE", "intip-1")).status).toBe(403)
      expect(await prisma.tipoInfraccionIN.findUnique({ where: { id: "intip-1" } })).not.toBeNull()
    })
  })

  it("DELETE de otra comunidad → 404", async () => {
    await conSesion(emailAdmin, async () => {
      expect((await invocar("DELETE", "intip-b")).status).toBe(404)
      expect(await prisma.tipoInfraccionIN.findUnique({ where: { id: "intip-b" } })).not.toBeNull()
    })
  })
})
