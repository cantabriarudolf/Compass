/**
 * @vitest-environment node
 *
 * Vigencia del Registro de Copropietarios (S2, S5, S6).
 *
 * Lo que se prueba acá es lo que la base aporta y el calendario puro no puede:
 * que el listado derive el estado de cada unidad desde hechos guardados, que el
 * acto de requerir congele la evidencia con su vencimiento, y que un segundo
 * requerimiento sin declaración previa no abra un plazo paralelo.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest"
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

const COMUNIDAD = "vig-comunidad-a"
const COMUNIDAD_B = "vig-comunidad-b"
const EMAIL_ADMIN = "vig-admin@test.cl"
const EMAIL_RESIDENTE = "vig-residente@test.cl"
const USER_ADMIN = "vig-user-admin"
const USER_RESIDENTE = "vig-user-residente"

const U_AL_DIA = "vig-u-al-dia"
const U_SIN_CASO = "vig-u-sin-caso"
const U_VENCIDA = "vig-u-vencida"
const U_REQUERIDA = "vig-u-requerida"
const U_OTRA_COMUNIDAD = "vig-u-otra"

const DIA = 24 * 60 * 60 * 1000
const hace = (dias: number) => new Date(Date.now() - dias * DIA)

const nuevasUnidades = [
  { id: U_AL_DIA, numero: "101" },
  { id: U_SIN_CASO, numero: "102" },
  { id: U_VENCIDA, numero: "103" },
  { id: U_REQUERIDA, numero: "104" },
]

async function crearUnidad(
  id: string,
  numero: string,
  comunidadId: string
): Promise<void> {
  await prisma.unidad.create({
    data: {
      id,
      comunidadId,
      microSectorId: `micro-${id}`,
      numero,
      etiqueta: `Unidad ${numero}`,
      tipoUnidadId: `tipo-${id}`,
      metraje: 50,
      prorrateo: 1,
      rolSii: `rol-${id}`,
      estadoId: "habitada",
      servicios: {},
    },
  })
}

describe("vigencia del registro — API", () => {
  const moduloGet = () => import("@/app/api/vigencia-registro/route")
  const moduloPost = () =>
    import("@/app/api/vigencia-registro/requerimiento/route")

  beforeAll(async () => {
    process.env.AUTH_SECRET ||= AUTH_SECRET

    for (const [id, nombre, slug] of [
      [COMUNIDAD, "Comunidad Vigencia", "vig-comunidad-a"],
      [COMUNIDAD_B, "Comunidad Vigencia B", "vig-comunidad-b"],
    ] as const) {
      await prisma.comunidad.upsert({
        where: { id },
        update: {},
        create: { id, nombre, slug },
      })
    }

    await prisma.usuario.upsert({
      where: { email: EMAIL_ADMIN },
      update: {},
      create: { id: USER_ADMIN, email: EMAIL_ADMIN, activo: true },
    })
    await prisma.usuario.upsert({
      where: { email: EMAIL_RESIDENTE },
      update: {},
      create: { id: USER_RESIDENTE, email: EMAIL_RESIDENTE, activo: true },
    })

    await prisma.membresia.deleteMany({
      where: { usuarioId: { in: [USER_ADMIN, USER_RESIDENTE] } },
    })
    await prisma.membresia.create({
      data: { usuarioId: USER_ADMIN, comunidadId: COMUNIDAD, rol: "administrador" },
    })
    await prisma.membresia.create({
      data: { usuarioId: USER_RESIDENTE, comunidadId: COMUNIDAD, rol: "residente" },
    })

    await prisma.vigenciaRegistroUnidad.deleteMany({
      where: { comunidadId: { in: [COMUNIDAD, COMUNIDAD_B] } },
    })
    await prisma.requerimientoVigencia.deleteMany({
      where: { comunidadId: { in: [COMUNIDAD, COMUNIDAD_B] } },
    })
    await prisma.eventoAuditoria.deleteMany({
      where: { comunidadId: { in: [COMUNIDAD, COMUNIDAD_B] } },
    })
    await prisma.unidad.deleteMany({
      where: { comunidadId: { in: [COMUNIDAD, COMUNIDAD_B] } },
    })

    for (const u of nuevasUnidades) {
      await crearUnidad(u.id, u.numero, COMUNIDAD)
    }
    await crearUnidad(U_OTRA_COMUNIDAD, "201", COMUNIDAD_B)

    await prisma.vigenciaRegistroUnidad.createMany({
      data: [
        {
          comunidadId: COMUNIDAD,
          unidadId: U_AL_DIA,
          ultimaActualizacion: hace(30),
        },
        {
          comunidadId: COMUNIDAD,
          unidadId: U_VENCIDA,
          ultimaActualizacion: hace(400),
          requerimientoEn: hace(100),
        },
        {
          comunidadId: COMUNIDAD,
          unidadId: U_REQUERIDA,
          ultimaActualizacion: null,
          requerimientoEn: hace(10),
        },
      ],
    })
  }, 30_000)

  afterAll(async () => {
    try {
      await prisma.vigenciaRegistroUnidad.deleteMany({
        where: { comunidadId: { in: [COMUNIDAD, COMUNIDAD_B] } },
      })
      await prisma.requerimientoVigencia.deleteMany({
        where: { comunidadId: { in: [COMUNIDAD, COMUNIDAD_B] } },
      })
      await prisma.eventoAuditoria.deleteMany({
        where: { comunidadId: { in: [COMUNIDAD, COMUNIDAD_B] } },
      })
      await prisma.unidad.deleteMany({
        where: { comunidadId: { in: [COMUNIDAD, COMUNIDAD_B] } },
      })
      await prisma.membresia.deleteMany({
        where: { usuarioId: { in: [USER_ADMIN, USER_RESIDENTE] } },
      })
      await prisma.usuario.deleteMany({
        where: { id: { in: [USER_ADMIN, USER_RESIDENTE] } },
      })
      await prisma.comunidad.deleteMany({
        where: { id: { in: [COMUNIDAD, COMUNIDAD_B] } },
      })
    } catch {
      // limpieza best-effort
    }
  })

  async function conSesion(
    email: string,
    fn: () => Promise<void>
  ): Promise<void> {
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

  function evidencia(unidadId: string) {
    return prisma.requerimientoVigencia.findMany({
      where: { comunidadId: COMUNIDAD, unidadId },
    })
  }

  function contarEventos(referenciaId: string): Promise<number> {
    return prisma.eventoAuditoria.count({
      where: {
        comunidadId: COMUNIDAD,
        referenciaId,
        tipoAccion: "AD_VIGENCIA_REQUERIMIENTO",
      },
    })
  }

  it("sin sesión responde 401", async () => {
    const { GET } = await moduloGet()
    const respuesta = await GET()
    expect(respuesta.status).toBe(401)
  })

  it("el residente no ve el registro de todas las unidades (S5): 403", async () => {
    await conSesion(EMAIL_RESIDENTE, async () => {
      const { GET } = await moduloGet()
      const respuesta = await GET()
      expect(respuesta.status).toBe(403)
    })
  })

  it("el administrador ve cada unidad con su estado derivado y el resumen", async () => {
    await conSesion(EMAIL_ADMIN, async () => {
      const { GET } = await moduloGet()
      const respuesta = await GET()
      expect(respuesta.status).toBe(200)
      const cuerpo = await respuesta.json()

      const porId = new Map(
        cuerpo.data.map((f: { unidadId: string }) => [f.unidadId, f])
      )
      expect(cuerpo.total).toBe(4)
      expect(porId.get(U_AL_DIA)).toMatchObject({ estado: "al_dia" })
      expect(porId.get(U_SIN_CASO)).toMatchObject({ estado: "sin_declaracion" })
      expect(porId.get(U_VENCIDA)).toMatchObject({
        estado: "habilitado_para_multa",
      })
      expect(porId.get(U_REQUERIDA)).toMatchObject({ estado: "requerido" })
      // La unidad de la otra comunidad nunca aparece.
      expect(porId.has(U_OTRA_COMUNIDAD)).toBe(false)
      expect(cuerpo.resumen).toEqual({
        al_dia: 1,
        sin_declaracion: 1,
        requerido: 1,
        habilitado_para_multa: 1,
      })
    })
  })

  it("un fundamento vacío no se acepta: 400 y nada escrito", async () => {
    await conSesion(EMAIL_ADMIN, async () => {
      const { POST } = await moduloPost()
      const respuesta = await POST(
        new Request("http://localhost/api/vigencia-registro/requerimiento", {
          method: "POST",
          body: JSON.stringify({ unidadId: U_SIN_CASO, fundamento: "corto" }),
        })
      )
      expect(respuesta.status).toBe(400)
      expect(await evidencia(U_SIN_CASO)).toHaveLength(0)
    })
  })

  it("una unidad de otra comunidad responde 404 y no deja caso", async () => {
    await conSesion(EMAIL_ADMIN, async () => {
      const { POST } = await moduloPost()
      const respuesta = await POST(
        new Request("http://localhost/api/vigencia-registro/requerimiento", {
          method: "POST",
          body: JSON.stringify({
            unidadId: U_OTRA_COMUNIDAD,
            fundamento: "Actualizar el registro de copropietarios de la unidad.",
          }),
        })
      )
      expect(respuesta.status).toBe(404)
      expect(
        await prisma.vigenciaRegistroUnidad.findMany({
          where: { unidadId: U_OTRA_COMUNIDAD },
        })
      ).toHaveLength(0)
    })
  })

  it("requerir congela la evidencia con su vencimiento y audita el acto", async () => {
    await conSesion(EMAIL_ADMIN, async () => {
      const { POST } = await moduloPost()
      const respuesta = await POST(
        new Request("http://localhost/api/vigencia-registro/requerimiento", {
          method: "POST",
          body: JSON.stringify({
            unidadId: U_SIN_CASO,
            fundamento:
              "Actualizar el registro de copropietarios: no consta declaración de la unidad.",
          }),
        })
      )
      expect(respuesta.status).toBe(200)
      const cuerpo = await respuesta.json()
      expect(cuerpo.ok).toBe(true)

      const [registro] = await evidencia(U_SIN_CASO)
      if (!registro) {
        throw new Error("no se escribió la evidencia del requerimiento")
      }
      expect(registro.registradoPor).toBe(USER_ADMIN)
      expect(registro.fundamento).toContain("no consta declaración")
      // S6: el vencimiento queda congelado a 60 días corridos del acto.
      expect(
        (registro.venceEn.getTime() - registro.fecha.getTime()) / DIA
      ).toBe(60)

      const caso = await prisma.vigenciaRegistroUnidad.findUnique({
        where: {
          comunidadId_unidadId: { comunidadId: COMUNIDAD, unidadId: U_SIN_CASO },
        },
      })
      // No se inventa una declaración: el caso arranca sin fecha de actualización.
      expect(caso?.ultimaActualizacion).toBeNull()
      expect(caso?.requerimientoEn).not.toBeNull()

      expect(await contarEventos(U_SIN_CASO)).toBe(1)
    })
  })

  it("un segundo requerimiento sin declaración responde 409 y no duplica evidencia", async () => {
    await conSesion(EMAIL_ADMIN, async () => {
      const { POST } = await moduloPost()
      const respuesta = await POST(
        new Request("http://localhost/api/vigencia-registro/requerimiento", {
          method: "POST",
          body: JSON.stringify({
            unidadId: U_SIN_CASO,
            fundamento: "Segundo requerimiento sobre el mismo ciclo abierto.",
          }),
        })
      )
      expect(respuesta.status).toBe(409)
      expect(await evidencia(U_SIN_CASO)).toHaveLength(1)
      expect(await contarEventos(U_SIN_CASO)).toBe(1)
    })
  })
})
