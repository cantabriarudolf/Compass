/**
 * @vitest-environment node
 *
 * `in` — apelación propia del residente (V3b de SERIE-DEUDA-6).
 *
 * Decisión owner 2026-10-21: el residente no ve ni edita el expediente IN; solo
 * presenta los descargos de SU propia infracción (`in:apelar`), y la ruta valida
 * la pertenencia server-side (unidad vinculada vigente). La administración
 * (administrador) sigue registrando descargos sin restricción de unidad.
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

const comunidad = "in-apelacion-comunidad"
const unidadA = "in-apelacion-u-a"
const unidadB = "in-apelacion-u-b"

const personaA = "in-apelacion-p-a"
const personaB = "in-apelacion-p-b"

const usuarios = {
  admin: { id: "in-ap-admin", email: "in-ap-admin@test.cl", rol: "administrador" },
  comite: { id: "in-ap-comite", email: "in-ap-comite@test.cl", rol: "comite" },
  conserjeria: { id: "in-ap-conserjeria", email: "in-ap-conserjeria@test.cl", rol: "conserjeria" },
  residenteA: { id: "in-ap-res-a", email: "in-ap-res-a@test.cl", rol: "residente", personaId: personaA },
  residenteB: { id: "in-ap-res-b", email: "in-ap-res-b@test.cl", rol: "residente", personaId: personaB },
} as const

const CARGA = async () => ({
  apelar: await import("@/app/api/in/infracciones/[id]/apelar/route"),
})

type Ctx = { params: Promise<{ id: string }> }

function pedir(id: string, descargos: string): NextRequest {
  return new NextRequest(`http://localhost/api/in/infracciones/${id}/apelar`, {
    method: "POST",
    body: JSON.stringify({ descargos }),
    headers: { "content-type": "application/json" },
  })
}

function ctx(id: string): Ctx {
  return { params: Promise.resolve({ id }) }
}

async function nuevaInfraccion(id: string, unidadId: string): Promise<void> {
  await prisma.infraccionIN.create({
    data: {
      id,
      comunidadId: comunidad,
      folio: `IN-${id}`,
      tipoInfraccionId: null,
      danoDirecto: null as never,
      unidadId,
      fechaSuceso: "2026-10-20",
      horaSuceso: "21:30",
      antecedentes: "Basura depositada fuera de horario en el contenedor central.",
      evidencias: [],
      estado: "en_revision",
      fechaRegistro: "2026-10-21",
      comentariosDirectiva: [],
      respaldosDirectiva: [],
    },
  })
}

const DESCARGO =
  "Los desechos provenían del servicio de mudanza que contrató el vecino del 302."

describe("/api/in/infracciones/[id]/apelar — solo la propia (V3b)", () => {
  beforeAll(async () => {
    process.env.AUTH_SECRET = AUTH_SECRET
    await prisma.comunidad.upsert({
      where: { id: comunidad },
      update: {},
      create: { id: comunidad, nombre: "Comunidad Apelación IN", slug: "in-apelacion-comunidad" },
    })

    const ids = Object.values(usuarios).map((u) => u.id)
    await prisma.membresia.deleteMany({ where: { usuarioId: { in: ids } } })
    for (const u of Object.values(usuarios)) {
      const personaId = "personaId" in u ? u.personaId : null
      await prisma.usuario.upsert({
        where: { email: u.email },
        update: { personaId },
        create: { id: u.id, email: u.email, activo: true, personaId },
      })
      await prisma.membresia.create({
        data: { usuarioId: u.id, comunidadId: comunidad, rol: u.rol },
      })
    }

    // Vínculos vigentes: A → unidad A, B → unidad B.
    await prisma.vinculoUnidad.deleteMany({ where: { comunidadId: comunidad } })
    for (const [personaId, unidadId] of [
      [personaA, unidadA],
      [personaB, unidadB],
    ] as const) {
      await prisma.vinculoUnidad.create({
        data: {
          id: `in-ap-vinculo-${unidadId}`,
          comunidadId: comunidad,
          personaId,
          unidadId,
          rol: "propietario",
          fechaInicio: "2025-01-01",
          permiteVerFinanzas: true,
        },
      })
    }

    await prisma.eventoAuditoria.deleteMany({ where: { comunidadId: comunidad } })
    await prisma.infraccionIN.deleteMany({ where: { comunidadId: comunidad } })
    await nuevaInfraccion("in-ap-propia-a", unidadA)
    await nuevaInfraccion("in-ap-ajena-b", unidadB)
  }, 60_000)

  afterAll(async () => {
    try {
      state.cookie = ""
      await prisma.eventoAuditoria.deleteMany({ where: { comunidadId: comunidad } })
      await prisma.infraccionIN.deleteMany({ where: { comunidadId: comunidad } })
      await prisma.vinculoUnidad.deleteMany({ where: { comunidadId: comunidad } })
      const ids = Object.values(usuarios).map((u) => u.id)
      await prisma.membresia.deleteMany({ where: { usuarioId: { in: ids } } })
      for (const id of ids) {
        await prisma.usuario.delete({ where: { id } }).catch(() => {})
      }
      await prisma.comunidad.delete({ where: { id: comunidad } }).catch(() => {})
    } catch {
      // limpieza best-effort
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

  function contarEventos(referenciaId: string): Promise<number> {
    return prisma.eventoAuditoria.count({
      where: { comunidadId: comunidad, referenciaId, tipoAccion: "IN_APELACION" },
    })
  }

  async function estado(id: string): Promise<string | undefined> {
    const inf = await prisma.infraccionIN.findUnique({ where: { id } })
    return inf?.estado
  }

  it("401 sin sesión", async () => {
    const { apelar } = await CARGA()
    state.cookie = ""
    const res = await apelar.POST(pedir("in-ap-propia-a", DESCARGO), ctx("in-ap-propia-a"))
    expect(res.status).toBe(401)
  })

  it("residente apela SU infracción → 200, estado apelada y un evento IN_APELACION", async () => {
    const { apelar } = await CARGA()
    await conSesion(usuarios.residenteA.email, async () => {
      const res = await apelar.POST(pedir("in-ap-propia-a", DESCARGO), ctx("in-ap-propia-a"))
      expect(res.status).toBe(200)
      expect((await res.json()) as { ok: boolean }).toEqual({ ok: true })
      expect(await estado("in-ap-propia-a")).toBe("apelada")
      expect(await contarEventos("in-ap-propia-a")).toBe(1)
    })
  })

  it("residente apela la infracción de otro vecino → 404 sin tocar estado ni auditoría", async () => {
    const { apelar } = await CARGA()
    await conSesion(usuarios.residenteA.email, async () => {
      const res = await apelar.POST(pedir("in-ap-ajena-b", DESCARGO), ctx("in-ap-ajena-b"))
      expect(res.status).toBe(404)
      expect(await estado("in-ap-ajena-b")).toBe("en_revision")
      expect(await contarEventos("in-ap-ajena-b")).toBe(0)
    })
  })

  it("comité y conserjería no apelan (la apelación es acto propio del residente) → 403", async () => {
    const { apelar } = await CARGA()
    for (const u of [usuarios.comite, usuarios.conserjeria]) {
      await conSesion(u.email, async () => {
        const res = await apelar.POST(pedir("in-ap-ajena-b", DESCARGO), ctx("in-ap-ajena-b"))
        expect(res.status).toBe(403)
      })
    }
    expect(await estado("in-ap-ajena-b")).toBe("en_revision")
    expect(await contarEventos("in-ap-ajena-b")).toBe(0)
  })

  it("administrador registra descargos en cualquier unidad → 200 (vía administración)", async () => {
    const { apelar } = await CARGA()
    await conSesion(usuarios.admin.email, async () => {
      const res = await apelar.POST(pedir("in-ap-ajena-b", DESCARGO), ctx("in-ap-ajena-b"))
      expect(res.status).toBe(200)
      expect(await estado("in-ap-ajena-b")).toBe("apelada")
    })
  })

  it("residente con descargos cortos en su propia infracción → 400 (validación intacta)", async () => {
    const { apelar } = await CARGA()
    await nuevaInfraccion("in-ap-corto-a", unidadA)
    await conSesion(usuarios.residenteA.email, async () => {
      const res = await apelar.POST(pedir("in-ap-corto-a", "no fue"), ctx("in-ap-corto-a"))
      expect(res.status).toBe(400)
      expect(await estado("in-ap-corto-a")).toBe("en_revision")
      expect(await contarEventos("in-ap-corto-a")).toBe(0)
    })
  })

  it("cuerpo sin `descargos` string → 400 y sin efecto", async () => {
    const { apelar } = await CARGA()
    await nuevaInfraccion("in-ap-sin-campo", unidadA)
    await conSesion(usuarios.residenteA.email, async () => {
      const res = await apelar.POST(
        new NextRequest("http://localhost/api/in/infracciones/in-ap-sin-campo/apelar", {
          method: "POST",
          body: JSON.stringify({ motivo: "no es el campo esperado" }),
          headers: { "content-type": "application/json" },
        }),
        ctx("in-ap-sin-campo")
      )
      expect(res.status).toBe(400)
      expect(await estado("in-ap-sin-campo")).toBe("en_revision")
    })
  })

  it("cuerpo que no es JSON → 400", async () => {
    const { apelar } = await CARGA()
    await nuevaInfraccion("in-ap-json-roto", unidadA)
    await conSesion(usuarios.residenteA.email, async () => {
      const res = await apelar.POST(
        new NextRequest("http://localhost/api/in/infracciones/in-ap-json-roto/apelar", {
          method: "POST",
          body: "{descargos: sin comillas}",
          headers: { "content-type": "application/json" },
        }),
        ctx("in-ap-json-roto")
      )
      expect(res.status).toBe(400)
      expect(await estado("in-ap-json-roto")).toBe("en_revision")
    })
  })

  it("residente sin vínculo vigente a ninguna unidad → 404 en la apelación", async () => {
    const { apelar } = await CARGA()
    await nuevaInfraccion("in-ap-sin-vinculo", unidadA)
    await prisma.vinculoUnidad.updateMany({
      where: { personaId: personaB },
      data: { fechaFin: "2026-01-01" },
    })
    try {
      await conSesion(usuarios.residenteB.email, async () => {
        const res = await apelar.POST(pedir("in-ap-sin-vinculo", DESCARGO), ctx("in-ap-sin-vinculo"))
        expect(res.status).toBe(404)
      })
    } finally {
      await prisma.vinculoUnidad.updateMany({
        where: { personaId: personaB },
        data: { fechaFin: null },
      })
    }
  })

  it("fallo de BD al cargar la infracción → 500 sin exponer detalles", async () => {
    const { apelar } = await CARGA()
    const espia = vi
      .spyOn(prisma.infraccionIN, "findUnique")
      .mockRejectedValueOnce(new Error("SQLITE_IOERR: disco lleno"))
    try {
      await conSesion(usuarios.residenteA.email, async () => {
        const res = await apelar.POST(pedir("in-ap-propia-a", DESCARGO), ctx("in-ap-propia-a"))
        expect(res.status).toBe(500)
        expect(((await res.json()) as { error: string }).error).toBe(
          "Error interno del servidor."
        )
      })
    } finally {
      espia.mockRestore()
    }
  })
})
