/**
 * @vitest-environment node
 *
 * `/api/ir/entregas-epp/[id]` — detalle/parcial/baja de entregas EPP.
 *
 * Recurso `ir:mantenimiento`: todos los roles lo leen, conserjería y mantención
 * lo editan, y solo el administrador borra. No hay rol sin `ver` que pueda
 * ejercitar un 403 en GET, así que las negativas se fijan en PUT y DELETE.
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

const comunidad = "irepp-comunidad-a"
const otraComunidad = "irepp-comunidad-b"
const emailAdmin = "irepp-admin@test.cl"
const emailConserje = "irepp-conserje@test.cl"
const emailComite = "irepp-comite@test.cl"
const emailResidente = "irepp-residente@test.cl"
const emailAdminOtra = "irepp-admin-b@test.cl"

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
  return new NextRequest(`http://localhost/api/ir/entregas-epp/${id}`, {
    method: metodo,
    ...(body !== undefined
      ? { body: JSON.stringify(body), headers: { "content-type": "application/json" } }
      : {}),
  })
}

async function invocar(metodo: "GET" | "PUT" | "DELETE", id: string, body?: unknown): Promise<Response> {
  const modulo = (await import("@/app/api/ir/entregas-epp/[id]/route")) as unknown as Record<
    string,
    (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => Promise<Response>
  >
  return modulo[metodo]!(pedir(metodo, id, body), { params: Promise.resolve({ id }) })
}

const sembrarEntrega = (id: string, comunidadId: string): Promise<unknown> =>
  prisma.entregaEPP.create({
    data: {
      id,
      comunidadId,
      recursoId: `irepp-recurso-${id}`,
      personaId: `irepp-persona-${id}`,
      fechaEntrega: "2026-06-01",
      estado: "nuevo",
    },
  })

describe("/api/ir/entregas-epp/[id] — detalle/parcial/baja scoped", () => {
  beforeAll(async () => {
    process.env.AUTH_SECRET = AUTH_SECRET
    for (const [id, slug] of [
      [comunidad, "irepp-a"],
      [otraComunidad, "irepp-b"],
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
    await prisma.entregaEPP.deleteMany({
      where: { comunidadId: { in: [comunidad, otraComunidad] } },
    })
    await sembrarEntrega("irepp-1", comunidad)
    await sembrarEntrega("irepp-b", otraComunidad)
  })

  afterAll(async () => {
    try {
      state.cookie = ""
      await prisma.entregaEPP.deleteMany({
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
    expect((await invocar("GET", "irepp-1")).status).toBe(401)
  })

  it("GET propio → 200 para admin, conserjería y residente (`ir:mantenimiento` ver)", async () => {
    await conSesion(emailAdmin, async () => {
      const res = await invocar("GET", "irepp-1")
      expect(res.status).toBe(200)
      expect(((await res.json()) as { id: string }).id).toBe("irepp-1")
    })
    for (const email of [emailConserje, emailResidente]) {
      await conSesion(email, async () => {
        expect((await invocar("GET", "irepp-1")).status).toBe(200)
      })
    }
  })

  it("GET inexistente o de otra comunidad → 404", async () => {
    await conSesion(emailAdmin, async () => {
      expect((await invocar("GET", "irepp-no-existe")).status).toBe(404)
      expect((await invocar("GET", "irepp-b")).status).toBe(404)
    })
  })

  it("PUT parcial de talla → 200 con el resto intacto y comunidadId descartado", async () => {
    await conSesion(emailConserje, async () => {
      const res = await invocar("PUT", "irepp-1", {
        talla: "M",
        comunidadId: otraComunidad,
      })
      expect(res.status).toBe(200)
      const enBd = await prisma.entregaEPP.findUnique({ where: { id: "irepp-1" } })
      expect(enBd?.talla).toBe("M")
      expect(enBd?.estado).toBe("nuevo")
      expect(enBd?.comunidadId).toBe(comunidad)
    })
  })

  it("PUT con estado fuera del enum → 400 sin escribir", async () => {
    await conSesion(emailAdmin, async () => {
      const res = await invocar("PUT", "irepp-1", { estado: "roto" })
      expect(res.status).toBe(400)
      expect(((await res.json()) as { error: string }).error).toBe("Datos inválidos.")
      const enBd = await prisma.entregaEPP.findUnique({ where: { id: "irepp-1" } })
      expect(enBd?.estado).toBe("nuevo")
    })
  })

  it("PUT de otra comunidad → 404 y no toca la fila ajena", async () => {
    await conSesion(emailAdmin, async () => {
      expect((await invocar("PUT", "irepp-b", { talla: "L" })).status).toBe(404)
      const ajena = await prisma.entregaEPP.findUnique({ where: { id: "irepp-b" } })
      expect(ajena?.talla).toBeNull()
    })
  })

  it("PUT comité (solo `ir:mantenimiento` ver) → 403", async () => {
    await conSesion(emailComite, async () => {
      const res = await invocar("PUT", "irepp-1", { talla: "L" })
      expect(res.status).toBe(403)
      expect(await res.json()).toEqual({ error: "Permiso denegado." })
    })
  })

  it("DELETE admin → 200 y la entrega desaparece", async () => {
    await conSesion(emailAdmin, async () => {
      expect((await invocar("DELETE", "irepp-1")).status).toBe(200)
      expect(await prisma.entregaEPP.findUnique({ where: { id: "irepp-1" } })).toBeNull()
    })
  })

  it("DELETE residente (sin `ir:mantenimiento` eliminar) → 403 y permanece", async () => {
    await conSesion(emailResidente, async () => {
      expect((await invocar("DELETE", "irepp-1")).status).toBe(403)
      expect(await prisma.entregaEPP.findUnique({ where: { id: "irepp-1" } })).not.toBeNull()
    })
  })

  it("DELETE de otra comunidad → 404", async () => {
    await conSesion(emailAdmin, async () => {
      expect((await invocar("DELETE", "irepp-b")).status).toBe(404)
      expect(await prisma.entregaEPP.findUnique({ where: { id: "irepp-b" } })).not.toBeNull()
    })
  })
})
