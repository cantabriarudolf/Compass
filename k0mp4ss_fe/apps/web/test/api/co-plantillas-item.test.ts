/**
 * @vitest-environment node
 *
 * `/api/co/plantillas/[id]` — detalle/parcial/baja de plantillas CO.
 *
 * GET_ONE y DELETE vía factory, PUT vía put-merge, todos con authz `co` y
 * scoping obligatorio. Se fija: 401 sin sesión, 403 sin el permiso (conserjería
 * no tiene `co`; el residente lee pero no borra), 404 cross-comunidad y que el
 * `comunidadId` del body se descarta.
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

const comunidad = "copla-comunidad-a"
const otraComunidad = "copla-comunidad-b"
const emailAdmin = "copla-admin@test.cl"
const emailConserje = "copla-conserje@test.cl"
const emailResidente = "copla-residente@test.cl"
const emailAdminOtra = "copla-admin-b@test.cl"

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
  return new NextRequest(`http://localhost/api/co/plantillas/${id}`, {
    method: metodo,
    ...(body !== undefined
      ? { body: JSON.stringify(body), headers: { "content-type": "application/json" } }
      : {}),
  })
}

async function invocar(metodo: "GET" | "PUT" | "DELETE", id: string, body?: unknown): Promise<Response> {
  const modulo = (await import("@/app/api/co/plantillas/[id]/route")) as unknown as Record<
    string,
    (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => Promise<Response>
  >
  return modulo[metodo]!(pedir(metodo, id, body), { params: Promise.resolve({ id }) })
}

const sembrarPlantilla = (id: string, comunidadId: string): Promise<unknown> =>
  prisma.plantillaCO.create({
    data: {
      id,
      comunidadId,
      nombre: `Plantilla ${id}`,
      categoria: "comunidad",
      asunto: "Citación a asamblea",
      cuerpo: "Estimado [Nombre_Usuario], ...",
    },
  })

describe("/api/co/plantillas/[id] — detalle/parcial/baja scoped", () => {
  beforeAll(async () => {
    process.env.AUTH_SECRET = AUTH_SECRET
    for (const [id, slug] of [
      [comunidad, "copla-a"],
      [otraComunidad, "copla-b"],
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
    await prisma.plantillaCO.deleteMany({
      where: { comunidadId: { in: [comunidad, otraComunidad] } },
    })
    await sembrarPlantilla("copla-1", comunidad)
    await sembrarPlantilla("copla-b", otraComunidad)
  })

  afterAll(async () => {
    try {
      state.cookie = ""
      await prisma.plantillaCO.deleteMany({
        where: { comunidadId: { in: [comunidad, otraComunidad] } },
      })
      for (const email of [emailAdmin, emailConserje, emailResidente, emailAdminOtra]) {
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
    expect((await invocar("GET", "copla-1")).status).toBe(401)
  })

  it("GET con rol sin `co` ver (conserjería) → 403", async () => {
    await conSesion(emailConserje, async () => {
      const res = await invocar("GET", "copla-1")
      expect(res.status).toBe(403)
      expect(await res.json()).toEqual({ error: "Permiso denegado." })
    })
  })

  it("GET propio → 200 (admin y residente con `co` ver)", async () => {
    await conSesion(emailAdmin, async () => {
      const res = await invocar("GET", "copla-1")
      expect(res.status).toBe(200)
      expect(((await res.json()) as { id: string }).id).toBe("copla-1")
    })
    await conSesion(emailResidente, async () => {
      expect((await invocar("GET", "copla-1")).status).toBe(200)
    })
  })

  it("GET inexistente o de otra comunidad → 404", async () => {
    await conSesion(emailAdmin, async () => {
      expect((await invocar("GET", "copla-no-existe")).status).toBe(404)
      expect((await invocar("GET", "copla-b")).status).toBe(404)
    })
  })

  it("PUT parcial → 200, persiste el cambio y descarta comunidadId del body", async () => {
    await conSesion(emailAdmin, async () => {
      const res = await invocar("PUT", "copla-1", {
        nombre: "Plantilla renombrada",
        comunidadId: otraComunidad,
      })
      expect(res.status).toBe(200)
      const enBd = await prisma.plantillaCO.findUnique({ where: { id: "copla-1" } })
      expect(enBd?.nombre).toBe("Plantilla renombrada")
      expect(enBd?.asunto).toBe("Citación a asamblea")
      expect(enBd?.comunidadId).toBe(comunidad)
    })
  })

  it("PUT con nombre vacío → 400 sin escribir", async () => {
    await conSesion(emailAdmin, async () => {
      const res = await invocar("PUT", "copla-1", { nombre: "" })
      expect(res.status).toBe(400)
      expect(((await res.json()) as { error: string }).error).toBe("Datos inválidos.")
      const enBd = await prisma.plantillaCO.findUnique({ where: { id: "copla-1" } })
      expect(enBd?.nombre).toBe("Plantilla copla-1")
    })
  })

  it("PUT de otra comunidad → 404 y no toca la fila ajena", async () => {
    await conSesion(emailAdmin, async () => {
      expect((await invocar("PUT", "copla-b", { nombre: "Intento ajeno" })).status).toBe(404)
      const ajena = await prisma.plantillaCO.findUnique({ where: { id: "copla-b" } })
      expect(ajena?.nombre).toBe("Plantilla copla-b")
    })
  })

  it("PUT con rol sin `co` editar (conserjería) → 403", async () => {
    await conSesion(emailConserje, async () => {
      const res = await invocar("PUT", "copla-1", { nombre: "Cualquiera" })
      expect(res.status).toBe(403)
      expect(await res.json()).toEqual({ error: "Permiso denegado." })
    })
  })

  it("DELETE admin → 200 y la plantilla desaparece", async () => {
    await conSesion(emailAdmin, async () => {
      const res = await invocar("DELETE", "copla-1")
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ ok: true })
      expect(await prisma.plantillaCO.findUnique({ where: { id: "copla-1" } })).toBeNull()
    })
  })

  it("DELETE residente (sin `co` eliminar) → 403 y permanece", async () => {
    await conSesion(emailResidente, async () => {
      expect((await invocar("DELETE", "copla-1")).status).toBe(403)
      expect(await prisma.plantillaCO.findUnique({ where: { id: "copla-1" } })).not.toBeNull()
    })
  })

  it("DELETE de otra comunidad → 404", async () => {
    await conSesion(emailAdmin, async () => {
      expect((await invocar("DELETE", "copla-b")).status).toBe(404)
      expect(await prisma.plantillaCO.findUnique({ where: { id: "copla-b" } })).not.toBeNull()
    })
  })
})
