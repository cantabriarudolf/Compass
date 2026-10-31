/**
 * @vitest-environment node
 *
 * `/api/cv/plantillas/[id]` — detalle/parcial/baja de plantillas CV.
 *
 * `PlantillaCVSchema` es un ZodEffects (refine multimedia), así que el PUT usa
 * put-merge: fusiona el parche con la fila y valida el objeto completo. Se fija
 * el 400 del refine/validación, el 403 del rol que solo lee `cv` (conserjería,
 * que sí puede leerlo: sin ese GET el 403 no probaría «lee pero no edita»),
 * el 404 cross-comunidad y que `comunidadId` del body nunca se persiste.
 * El comité (también con `cv` ver/editar) no está sembrado en este archivo.
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

const comunidad = "cvpla-comunidad-a"
const otraComunidad = "cvpla-comunidad-b"
const emailAdmin = "cvpla-admin@test.cl"
const emailConserje = "cvpla-conserje@test.cl"
const emailResidente = "cvpla-residente@test.cl"
const emailAdminOtra = "cvpla-admin-b@test.cl"

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
  return new NextRequest(`http://localhost/api/cv/plantillas/${id}`, {
    method: metodo,
    ...(body !== undefined
      ? { body: JSON.stringify(body), headers: { "content-type": "application/json" } }
      : {}),
  })
}

async function invocar(metodo: "GET" | "PUT" | "DELETE", id: string, body?: unknown): Promise<Response> {
  const modulo = (await import("@/app/api/cv/plantillas/[id]/route")) as unknown as Record<
    string,
    (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => Promise<Response>
  >
  return modulo[metodo]!(pedir(metodo, id, body), { params: Promise.resolve({ id }) })
}

const sembrarPlantilla = (id: string, comunidadId: string): Promise<unknown> =>
  prisma.plantillaCV.create({
    data: {
      id,
      comunidadId,
      titulo: `Plantilla ${id}`,
      cuerpo: "Comunicado de prueba",
      tipologia: "info",
      duracionSegundosSugerida: 10,
      pantallaCompleta: false,
      tags: [],
      activa: true,
    },
  })

describe("/api/cv/plantillas/[id] — detalle/parcial/baja scoped", () => {
  beforeAll(async () => {
    process.env.AUTH_SECRET = AUTH_SECRET
    for (const [id, slug] of [
      [comunidad, "cvpla-a"],
      [otraComunidad, "cvpla-b"],
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
    await prisma.plantillaCV.deleteMany({
      where: { comunidadId: { in: [comunidad, otraComunidad] } },
    })
    await sembrarPlantilla("cvpla-1", comunidad)
    await sembrarPlantilla("cvpla-b", otraComunidad)
  })

  afterAll(async () => {
    try {
      state.cookie = ""
      await prisma.plantillaCV.deleteMany({
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
    expect((await invocar("GET", "cvpla-1")).status).toBe(401)
  })

  it("GET propio → 200 para los roles con `cv` ver (admin, conserjería, residente)", async () => {
    await conSesion(emailAdmin, async () => {
      const res = await invocar("GET", "cvpla-1")
      expect(res.status).toBe(200)
      expect(((await res.json()) as { id: string }).id).toBe("cvpla-1")
    })
    // Conserjería y residente tienen `cv` ver sin `editar`: son los roles que le
    // dan sentido al 403 del PUT de más abajo.
    for (const email of [emailConserje, emailResidente]) {
      await conSesion(email, async () => {
        expect((await invocar("GET", "cvpla-1")).status).toBe(200)
      })
    }
  })

  it("GET inexistente o de otra comunidad → 404", async () => {
    await conSesion(emailAdmin, async () => {
      expect((await invocar("GET", "cvpla-no-existe")).status).toBe(404)
      expect((await invocar("GET", "cvpla-b")).status).toBe(404)
    })
  })

  it("PUT parcial → 200 con el objeto completo revalidado y comunidadId descartado", async () => {
    await conSesion(emailAdmin, async () => {
      const res = await invocar("PUT", "cvpla-1", {
        titulo: "Plantilla actualizada",
        comunidadId: otraComunidad,
      })
      expect(res.status).toBe(200)
      const enBd = await prisma.plantillaCV.findUnique({ where: { id: "cvpla-1" } })
      expect(enBd?.titulo).toBe("Plantilla actualizada")
      expect(enBd?.duracionSegundosSugerida).toBe(10)
      expect(enBd?.comunidadId).toBe(comunidad)
    })
  })

  it("PUT con título vacío → 400 y no escribe", async () => {
    await conSesion(emailAdmin, async () => {
      const res = await invocar("PUT", "cvpla-1", { titulo: "" })
      expect(res.status).toBe(400)
      expect(((await res.json()) as { error: string }).error).toBe("Datos inválidos.")
      const enBd = await prisma.plantillaCV.findUnique({ where: { id: "cvpla-1" } })
      expect(enBd?.titulo).toBe("Plantilla cvpla-1")
    })
  })

  it("PUT que deja imagen y video juntos → 400 del refine multimedia y no escribe", async () => {
    // put-merge valida el objeto mergeado: la fila ya trae imagen y el parche
    // agrega video, así que tiene que cortar el refine del ZodEffects.
    await prisma.plantillaCV.update({
      where: { id: "cvpla-1" },
      data: { imagenUrl: "https://cdn.test.cl/plantilla.png" },
    })
    await conSesion(emailAdmin, async () => {
      const res = await invocar("PUT", "cvpla-1", {
        videoUrl: "https://youtu.be/abc12345678",
      })
      expect(res.status).toBe(400)
      const json = (await res.json()) as {
        error: string
        detalles: { formErrors: string[] }
      }
      expect(json.error).toBe("Datos inválidos.")
      expect(json.detalles.formErrors).toContain(
        "Multimedia excluyente: la plantilla admite imagen o video, no ambos."
      )
      const enBd = await prisma.plantillaCV.findUnique({ where: { id: "cvpla-1" } })
      expect(enBd?.imagenUrl).toBe("https://cdn.test.cl/plantilla.png")
      expect(enBd?.videoUrl).toBeNull()
    })
  })

  it("PUT de otra comunidad → 404 y no toca la fila ajena", async () => {
    await conSesion(emailAdmin, async () => {
      expect((await invocar("PUT", "cvpla-b", { titulo: "Intento ajeno" })).status).toBe(404)
      const ajena = await prisma.plantillaCV.findUnique({ where: { id: "cvpla-b" } })
      expect(ajena?.titulo).toBe("Plantilla cvpla-b")
    })
  })

  it("PUT con rol sin `cv` editar (conserjería) → 403", async () => {
    await conSesion(emailConserje, async () => {
      const res = await invocar("PUT", "cvpla-1", { titulo: "Cualquiera" })
      expect(res.status).toBe(403)
      expect(await res.json()).toEqual({ error: "Permiso denegado." })
    })
  })

  it("DELETE admin → 200 y la plantilla desaparece", async () => {
    await conSesion(emailAdmin, async () => {
      expect((await invocar("DELETE", "cvpla-1")).status).toBe(200)
      expect(await prisma.plantillaCV.findUnique({ where: { id: "cvpla-1" } })).toBeNull()
    })
  })

  it("DELETE residente (sin `cv` eliminar) → 403 y permanece", async () => {
    await conSesion(emailResidente, async () => {
      expect((await invocar("DELETE", "cvpla-1")).status).toBe(403)
      expect(await prisma.plantillaCV.findUnique({ where: { id: "cvpla-1" } })).not.toBeNull()
    })
  })

  it("DELETE de otra comunidad → 404", async () => {
    await conSesion(emailAdmin, async () => {
      expect((await invocar("DELETE", "cvpla-b")).status).toBe(404)
      expect(await prisma.plantillaCV.findUnique({ where: { id: "cvpla-b" } })).not.toBeNull()
    })
  })
})
