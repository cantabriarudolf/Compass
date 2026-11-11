/**
 * @vitest-environment node
 *
 * Vigencia del Registro de Copropietarios (S2, S5, S6).
 *
 * Lo que se prueba acá es lo que la base aporta y el calendario puro no puede:
 * que el listado derive el estado de cada unidad desde hechos guardados, que el
 * acto de requerir congele la evidencia con su vencimiento, que un segundo
 * requerimiento sin declaración previa no abra un plazo paralelo, y que
 * revalidar sin cambios cierre el ciclo (S3) dejando su propia evidencia.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest"
import { prisma } from "@/lib/prisma"
import { estadoDelCaso } from "@/lib/vigencia-registro"

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

/**
 * S3 — revalidar sin cambios es cumplir.
 *
 * El caso que este bloque cuida es el que hoy castiga al que está al día: la
 * unidad no cambió nada, el sistema igual la requiere y, sin una segunda forma
 * de cumplir, los 60 días vencen y la multa se habilita sola.
 */
describe("vigencia del registro — revalidación sin cambios (S3)", () => {
  const COMUNIDAD_R = "vig-rev-comunidad-a"
  const COMUNIDAD_R_B = "vig-rev-comunidad-b"
  const EMAIL_ADMIN_R = "vig-rev-admin@test.cl"
  const EMAIL_RESIDENTE_R = "vig-rev-residente@test.cl"
  const USER_ADMIN_R = "vig-rev-user-admin"
  const USER_RESIDENTE_R = "vig-rev-user-residente"

  // Unidad con el ciclo abierto: es la que hoy llega al mes 14 y se multa.
  const U_REQUERIDA_R = "vig-rev-u-requerida"
  // Unidad sin caso de vigencia alguno: la primera revalidación crea el caso ya al día.
  const U_NUEVA_R = "vig-rev-u-nueva"
  // Reservadas para los rechazos: nunca deben quedar con rastro.
  const U_INVALIDA_R = "vig-rev-u-invalida"
  const U_OTRA_COMUNIDAD_R = "vig-rev-u-otra"

  const DETALLE_VALIDO =
    "Se revisó el registro con el propietario: los datos siguen sin cambios."

  // Fechas del seed fijadas UNA vez: recalcular `hace(10)` en la aserción falla
  // por milisegundos y el test terminaría midiendo el reloj, no la evidencia.
  const REQUERIDO_EN = hace(10)
  const VENCE_EN = new Date(REQUERIDO_EN.getTime() + 60 * DIA)

  const moduloRevalidacion = () =>
    import("@/app/api/vigencia-registro/revalidacion/route")

  function revalidar(unidadId: string, detalle: string): Promise<Response> {
    return moduloRevalidacion().then(({ POST }) =>
      POST(
        new Request("http://localhost/api/vigencia-registro/revalidacion", {
          method: "POST",
          body: JSON.stringify({ unidadId, detalle }),
        })
      )
    )
  }

  const revalidaciones = (unidadId: string) =>
    prisma.revalidacionVigencia.findMany({
      where: { comunidadId: COMUNIDAD_R, unidadId },
    })

  const caso = (unidadId: string) =>
    prisma.vigenciaRegistroUnidad.findUnique({
      where: {
        comunidadId_unidadId: { comunidadId: COMUNIDAD_R, unidadId },
      },
    })

  const eventos = (unidadId: string) =>
    prisma.eventoAuditoria.count({
      where: {
        comunidadId: COMUNIDAD_R,
        referenciaId: unidadId,
        tipoAccion: "AD_VIGENCIA_REVALIDACION",
      },
    })

  async function conSesionR(
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

  // Este bloque no hereda el fixture del anterior (sus hooks son de su propio
  // describe y su afterAll borra comunidad, usuarios y unidades), así que arma
  // el suyo con ids propios para no interferir.
  beforeAll(async () => {
    process.env.AUTH_SECRET ||= AUTH_SECRET

    for (const [id, nombre, slug] of [
      [COMUNIDAD_R, "Comunidad Revalidación", "vig-rev-comunidad-a"],
      [COMUNIDAD_R_B, "Comunidad Revalidación B", "vig-rev-comunidad-b"],
    ] as const) {
      await prisma.comunidad.upsert({
        where: { id },
        update: {},
        create: { id, nombre, slug },
      })
    }

    await prisma.usuario.upsert({
      where: { email: EMAIL_ADMIN_R },
      update: {},
      create: { id: USER_ADMIN_R, email: EMAIL_ADMIN_R, activo: true },
    })
    await prisma.usuario.upsert({
      where: { email: EMAIL_RESIDENTE_R },
      update: {},
      create: { id: USER_RESIDENTE_R, email: EMAIL_RESIDENTE_R, activo: true },
    })

    await prisma.membresia.deleteMany({
      where: { usuarioId: { in: [USER_ADMIN_R, USER_RESIDENTE_R] } },
    })
    await prisma.membresia.create({
      data: {
        usuarioId: USER_ADMIN_R,
        comunidadId: COMUNIDAD_R,
        rol: "administrador",
      },
    })
    await prisma.membresia.create({
      data: {
        usuarioId: USER_RESIDENTE_R,
        comunidadId: COMUNIDAD_R,
        rol: "residente",
      },
    })

    await prisma.revalidacionVigencia.deleteMany({
      where: { comunidadId: { in: [COMUNIDAD_R, COMUNIDAD_R_B] } },
    })
    await prisma.vigenciaRegistroUnidad.deleteMany({
      where: { comunidadId: { in: [COMUNIDAD_R, COMUNIDAD_R_B] } },
    })
    await prisma.requerimientoVigencia.deleteMany({
      where: { comunidadId: { in: [COMUNIDAD_R, COMUNIDAD_R_B] } },
    })
    await prisma.eventoAuditoria.deleteMany({
      where: { comunidadId: { in: [COMUNIDAD_R, COMUNIDAD_R_B] } },
    })
    await prisma.unidad.deleteMany({
      where: { comunidadId: { in: [COMUNIDAD_R, COMUNIDAD_R_B] } },
    })

    await crearUnidad(U_REQUERIDA_R, "501", COMUNIDAD_R)
    await crearUnidad(U_NUEVA_R, "502", COMUNIDAD_R)
    await crearUnidad(U_INVALIDA_R, "503", COMUNIDAD_R)
    await crearUnidad(U_OTRA_COMUNIDAD_R, "601", COMUNIDAD_R_B)

    // Ciclo abierto con su evidencia: el requerimiento se hizo hace 10 días.
    await prisma.vigenciaRegistroUnidad.create({
      data: {
        comunidadId: COMUNIDAD_R,
        unidadId: U_REQUERIDA_R,
        ultimaActualizacion: null,
        requerimientoEn: REQUERIDO_EN,
      },
    })
    await prisma.requerimientoVigencia.create({
      data: {
        comunidadId: COMUNIDAD_R,
        unidadId: U_REQUERIDA_R,
        fecha: REQUERIDO_EN,
        venceEn: VENCE_EN,
        registradoPor: USER_ADMIN_R,
        fundamento:
          "Actualizar el registro de copropietarios de la unidad 501.",
      },
    })
  }, 30_000)

  afterAll(async () => {
    try {
      await prisma.revalidacionVigencia.deleteMany({
        where: { comunidadId: { in: [COMUNIDAD_R, COMUNIDAD_R_B] } },
      })
      await prisma.vigenciaRegistroUnidad.deleteMany({
        where: { comunidadId: { in: [COMUNIDAD_R, COMUNIDAD_R_B] } },
      })
      await prisma.requerimientoVigencia.deleteMany({
        where: { comunidadId: { in: [COMUNIDAD_R, COMUNIDAD_R_B] } },
      })
      await prisma.eventoAuditoria.deleteMany({
        where: { comunidadId: { in: [COMUNIDAD_R, COMUNIDAD_R_B] } },
      })
      await prisma.unidad.deleteMany({
        where: { comunidadId: { in: [COMUNIDAD_R, COMUNIDAD_R_B] } },
      })
      await prisma.membresia.deleteMany({
        where: { usuarioId: { in: [USER_ADMIN_R, USER_RESIDENTE_R] } },
      })
      await prisma.usuario.deleteMany({
        where: { id: { in: [USER_ADMIN_R, USER_RESIDENTE_R] } },
      })
      await prisma.comunidad.deleteMany({
        where: { id: { in: [COMUNIDAD_R, COMUNIDAD_R_B] } },
      })
    } catch {
      // limpieza best-effort
    }
  })

  it("sin sesión responde 401", async () => {
    const { POST } = await moduloRevalidacion()
    const respuesta = await POST(
      new Request("http://localhost/api/vigencia-registro/revalidacion", {
        method: "POST",
        body: JSON.stringify({ unidadId: U_INVALIDA_R, detalle: DETALLE_VALIDO }),
      })
    )
    expect(respuesta.status).toBe(401)
    expect(await revalidaciones(U_INVALIDA_R)).toHaveLength(0)
  })

  it("el residente no puede revalidar: 403 y nada escrito", async () => {
    await conSesionR(EMAIL_RESIDENTE_R, async () => {
      const respuesta = await revalidar(U_INVALIDA_R, DETALLE_VALIDO)
      expect(respuesta.status).toBe(403)
      expect(await revalidaciones(U_INVALIDA_R)).toHaveLength(0)
      expect(await caso(U_INVALIDA_R)).toBeNull()
    })
  })

  it("un detalle corto no dice qué se confirmó: 400 y nada escrito", async () => {
    await conSesionR(EMAIL_ADMIN_R, async () => {
      const respuesta = await revalidar(U_INVALIDA_R, "igual")
      expect(respuesta.status).toBe(400)
      const cuerpo = await respuesta.json()
      expect(cuerpo.error).toBeTruthy()
      expect(Array.isArray(cuerpo.detalles)).toBe(true)
      expect(cuerpo.detalles.join(" ")).toContain("detalle")
      expect(await revalidaciones(U_INVALIDA_R)).toHaveLength(0)
      expect(await caso(U_INVALIDA_R)).toBeNull()
    })
  })

  it("una unidad de otra comunidad responde 404 y no deja rastro en ninguna de las dos", async () => {
    await conSesionR(EMAIL_ADMIN_R, async () => {
      const respuesta = await revalidar(U_OTRA_COMUNIDAD_R, DETALLE_VALIDO)
      expect(respuesta.status).toBe(404)
      expect(await revalidaciones(U_OTRA_COMUNIDAD_R)).toHaveLength(0)
      expect(await caso(U_OTRA_COMUNIDAD_R)).toBeNull()
      expect(
        await prisma.vigenciaRegistroUnidad.findMany({
          where: { unidadId: U_OTRA_COMUNIDAD_R },
        })
      ).toHaveLength(0)
      expect(await eventos(U_OTRA_COMUNIDAD_R)).toBe(0)
    })
  })

  it("revalidar cierra el ciclo abierto y deja el caso al día sin borrar el requerimiento", async () => {
    const evidenciaPrevia = await prisma.requerimientoVigencia.count({
      where: { comunidadId: COMUNIDAD_R, unidadId: U_REQUERIDA_R },
    })
    expect(evidenciaPrevia).toBe(1)

    await conSesionR(EMAIL_ADMIN_R, async () => {
      const respuesta = await revalidar(U_REQUERIDA_R, DETALLE_VALIDO)
      expect(respuesta.status).toBe(200)
      const cuerpo = await respuesta.json()
      expect(cuerpo.ok).toBe(true)
      expect(cuerpo.unidadId).toBe(U_REQUERIDA_R)
      expect(cuerpo.estado).toBe("al_dia")
      expect(typeof cuerpo.ultimaActualizacion).toBe("string")

      const casoRevalidado = await caso(U_REQUERIDA_R)
      // La revalidación es una forma de cumplir: el caso queda con fecha y el
      // cursor del ciclo abierto se limpia (S3).
      expect(casoRevalidado?.ultimaActualizacion).not.toBeNull()
      expect(casoRevalidado?.requerimientoEn).toBeNull()

      const propias = await revalidaciones(U_REQUERIDA_R)
      expect(propias).toHaveLength(1)
      expect(propias[0]?.revalidadoPor).toBe(USER_ADMIN_R)
      expect(propias[0]?.detalle).toBe(DETALLE_VALIDO)

      // S6: la evidencia del requerimiento anterior sigue existiendo intacta.
      const evidencia = await prisma.requerimientoVigencia.findMany({
        where: { comunidadId: COMUNIDAD_R, unidadId: U_REQUERIDA_R },
      })
      expect(evidencia).toHaveLength(evidenciaPrevia)
      expect(evidencia[0]?.venceEn.getTime()).toBe(VENCE_EN.getTime())
    })
  })

  it("revalidar una unidad sin caso lo crea ya al día", async () => {
    expect(await caso(U_NUEVA_R)).toBeNull()

    await conSesionR(EMAIL_ADMIN_R, async () => {
      const respuesta = await revalidar(U_NUEVA_R, DETALLE_VALIDO)
      expect(respuesta.status).toBe(200)
      const cuerpo = await respuesta.json()
      expect(cuerpo.estado).toBe("al_dia")

      const casoCreado = await caso(U_NUEVA_R)
      expect(casoCreado?.ultimaActualizacion).not.toBeNull()
      expect(casoCreado?.requerimientoEn).toBeNull()
      expect(await revalidaciones(U_NUEVA_R)).toHaveLength(1)
    })
  })

  it("cada revalidación deja un evento de auditoría y solo uno", async () => {
    expect(await eventos(U_REQUERIDA_R)).toBe(1)
    expect(await eventos(U_NUEVA_R)).toBe(1)
    // Los rechazos (401, 403, 400 y 404) no auditan nada.
    expect(await eventos(U_INVALIDA_R)).toBe(0)
    expect(await eventos(U_OTRA_COMUNIDAD_R)).toBe(0)

    const [evento] = await prisma.eventoAuditoria.findMany({
      where: {
        comunidadId: COMUNIDAD_R,
        referenciaId: U_REQUERIDA_R,
        tipoAccion: "AD_VIGENCIA_REVALIDACION",
      },
    })
    expect(evento?.categoria).toBe("AD")
    expect(evento?.usuario).toBe(USER_ADMIN_R)
    expect(evento?.descripcion).toContain("501")
  })

  it("un 400 sobre una unidad con caso abierto no le toca el caso", async () => {
    // El caso de rechazo se arma acá y no se hereda de otro test: el fixture
    // previo cierra el ciclo de U_REQUERIDA_R, así que depender de su estado
    // haría que este test midiera el orden de ejecución.
    const unidad = "vig-rev-u-caso-previo"
    const abierto = hace(20)
    await crearUnidad(unidad, "504", COMUNIDAD_R)
    await prisma.vigenciaRegistroUnidad.create({
      data: {
        comunidadId: COMUNIDAD_R,
        unidadId: unidad,
        ultimaActualizacion: null,
        requerimientoEn: abierto,
      },
    })

    await conSesionR(EMAIL_ADMIN_R, async () => {
      const respuesta = await revalidar(unidad, "corto")
      expect(respuesta.status).toBe(400)
    })

    const despues = await caso(unidad)
    // Un rechazo no puede cerrar el ciclo por accidente: la fecha del
    // requerimiento sigue siendo exactamente la misma.
    expect(despues?.requerimientoEn?.getTime()).toBe(abierto.getTime())
    expect(await revalidaciones(unidad)).toHaveLength(0)
    expect(await eventos(unidad)).toBe(0)
  })

  it("revalidar una unidad con el plazo vencido la deja al día sin borrar la evidencia", async () => {
    // El caso más adversarial: ya venció el plazo, así que la multa estaba
    // habilitada. Revalidar después no puede hacer desaparecer la prueba de que
    // el plazo corrió y no se respondió (S6).
    const unidad = "vig-rev-u-vencida"
    const requeridoHace = hace(100)
    const vencioHace = hace(40)
    await crearUnidad(unidad, "505", COMUNIDAD_R)
    await prisma.vigenciaRegistroUnidad.create({
      data: {
        comunidadId: COMUNIDAD_R,
        unidadId: unidad,
        ultimaActualizacion: null,
        requerimientoEn: requeridoHace,
      },
    })
    await prisma.requerimientoVigencia.create({
      data: {
        comunidadId: COMUNIDAD_R,
        unidadId: unidad,
        fecha: requeridoHace,
        venceEn: vencioHace,
        registradoPor: USER_ADMIN_R,
        fundamento: "Requerimiento del ciclo vencido.",
      },
    })

    await conSesionR(EMAIL_ADMIN_R, async () => {
      const respuesta = await revalidar(unidad, DETALLE_VALIDO)
      expect(respuesta.status).toBe(200)
      const cuerpo = await respuesta.json()
      expect(cuerpo.estado).toBe("al_dia")
    })

    const evidencia = await prisma.requerimientoVigencia.findMany({
      where: { comunidadId: COMUNIDAD_R, unidadId: unidad },
    })
    expect(evidencia).toHaveLength(1)
    expect(evidencia[0]?.venceEn.getTime()).toBe(vencioHace.getTime())

    const despues = await caso(unidad)
    expect(despues?.requerimientoEn).toBeNull()
    expect(despues?.ultimaActualizacion).not.toBeNull()
    expect(await revalidaciones(unidad)).toHaveLength(1)
  })
})

/**
 * S8 — administrador y Comité se enteran siempre.
 *
 * El aviso no puede depender de que alguien se acuerde: la administración corre
 * un barrido explícito, `POST /api/vigencia-registro/avisos`, y el barrido es
 * idempotente. Este bloque prueba las dos mitades de esa frase: lo que el
 * barrido escribe en la primera corrida (la notificación y su constancia) y que
 * la segunda no escribe nada, ni siquiera cuando el destinatario es un rol sin
 * persona. También prueba el caso que S8 nombra como incidente: una unidad sin
 * propietario vigente, que se notifica a la administración y al Comité y nunca
 * al vacío.
 *
 * Fixture propio (`vig-avi-*`): el `afterAll` de los bloques anteriores borra su
 * comunidad, sus usuarios y sus unidades.
 */
describe("vigencia del registro — avisos al propietario, administrador y Comité (S8)", () => {
  const COMUNIDAD_V = "vig-avi-comunidad-a"
  const COMUNIDAD_V_B = "vig-avi-comunidad-b"
  const EMAIL_ADMIN_V = "vig-avi-admin@test.cl"
  const EMAIL_RESIDENTE_V = "vig-avi-residente@test.cl"
  const USER_ADMIN_V = "vig-avi-user-admin"
  const USER_RESIDENTE_V = "vig-avi-user-residente"

  // Unidad en el mes 10.5: «por vencer», con propietario vigente.
  const U_POR_VENCER_V = "vig-avi-u-por-vencer"
  // Unidad sin declaración y sin propietario vigente: incidente de datos.
  const U_SIN_DUENO_V = "vig-avi-u-sin-dueno"
  // La unidad de la otra comunidad no participa del barrido.
  const U_OTRA_V = "vig-avi-u-otra"

  const PERSONA_PROPIETARIO = "vig-avi-persona-propietario"
  // Dueño anterior: su vínculo está cerrado, así que NO es el propietario vigente.
  const PERSONA_ANTERIOR = "vig-avi-persona-anterior"

  // 320 días: más de 10 meses (aviso) y menos de 12 (requerimiento anual).
  const ULTIMA_POR_VENCER = hace(320)

  const moduloAvisos = () =>
    import("@/app/api/vigencia-registro/avisos/route")

  function emitirAvisos(): Promise<Response> {
    return moduloAvisos().then(({ POST }) =>
      POST(
        new Request("http://localhost/api/vigencia-registro/avisos", {
          method: "POST",
        })
      )
    )
  }

  const notificaciones = (unidadId: string) =>
    prisma.notificacion.findMany({
      where: { comunidadId: COMUNIDAD_V, unidadId },
      orderBy: { asunto: "asc" },
    })

  const constancias = (unidadId: string) =>
    prisma.avisoVigencia.findMany({
      where: { comunidadId: COMUNIDAD_V, unidadId },
      orderBy: [{ tipo: "asc" }, { destinatario: "asc" }],
    })

  const eventos = () =>
    prisma.eventoAuditoria.findMany({
      where: {
        comunidadId: COMUNIDAD_V,
        tipoAccion: "AD_VIGENCIA_AVISOS",
      },
    })

  async function conSesionV(
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

  beforeAll(async () => {
    process.env.AUTH_SECRET ||= AUTH_SECRET

    for (const [id, nombre, slug] of [
      [COMUNIDAD_V, "Comunidad Avisos", "vig-avi-comunidad-a"],
      [COMUNIDAD_V_B, "Comunidad Avisos B", "vig-avi-comunidad-b"],
    ] as const) {
      await prisma.comunidad.upsert({
        where: { id },
        update: {},
        create: { id, nombre, slug },
      })
    }

    await prisma.usuario.upsert({
      where: { email: EMAIL_ADMIN_V },
      update: {},
      create: { id: USER_ADMIN_V, email: EMAIL_ADMIN_V, activo: true },
    })
    await prisma.usuario.upsert({
      where: { email: EMAIL_RESIDENTE_V },
      update: {},
      create: { id: USER_RESIDENTE_V, email: EMAIL_RESIDENTE_V, activo: true },
    })

    await prisma.membresia.deleteMany({
      where: { usuarioId: { in: [USER_ADMIN_V, USER_RESIDENTE_V] } },
    })
    await prisma.membresia.create({
      data: {
        usuarioId: USER_ADMIN_V,
        comunidadId: COMUNIDAD_V,
        rol: "administrador",
      },
    })
    await prisma.membresia.create({
      data: {
        usuarioId: USER_RESIDENTE_V,
        comunidadId: COMUNIDAD_V,
        rol: "residente",
      },
    })

    await prisma.avisoVigencia.deleteMany({
      where: { comunidadId: { in: [COMUNIDAD_V, COMUNIDAD_V_B] } },
    })
    await prisma.notificacion.deleteMany({
      where: { comunidadId: { in: [COMUNIDAD_V, COMUNIDAD_V_B] } },
    })
    await prisma.vigenciaRegistroUnidad.deleteMany({
      where: { comunidadId: { in: [COMUNIDAD_V, COMUNIDAD_V_B] } },
    })
    await prisma.requerimientoVigencia.deleteMany({
      where: { comunidadId: { in: [COMUNIDAD_V, COMUNIDAD_V_B] } },
    })
    await prisma.eventoAuditoria.deleteMany({
      where: { comunidadId: { in: [COMUNIDAD_V, COMUNIDAD_V_B] } },
    })
    await prisma.vinculoUnidad.deleteMany({
      where: { comunidadId: { in: [COMUNIDAD_V, COMUNIDAD_V_B] } },
    })
    await prisma.unidad.deleteMany({
      where: { comunidadId: { in: [COMUNIDAD_V, COMUNIDAD_V_B] } },
    })

    await crearUnidad(U_POR_VENCER_V, "1402", COMUNIDAD_V)
    await crearUnidad(U_SIN_DUENO_V, "1403", COMUNIDAD_V)
    await crearUnidad(U_OTRA_V, "1404", COMUNIDAD_V_B)

    await prisma.vigenciaRegistroUnidad.create({
      data: {
        comunidadId: COMUNIDAD_V,
        unidadId: U_POR_VENCER_V,
        ultimaActualizacion: ULTIMA_POR_VENCER,
      },
    })

    await prisma.vinculoUnidad.create({
      data: {
        id: "vig-avi-vinculo-vigente",
        comunidadId: COMUNIDAD_V,
        personaId: PERSONA_PROPIETARIO,
        unidadId: U_POR_VENCER_V,
        rol: "propietario",
        fechaInicio: "2020-01-01",
        fechaFin: null,
        permiteVerFinanzas: false,
      },
    })
    // Dueño cerrado de la unidad sin dueño vigente: tener un vínculo histórico
    // no la salva del incidente.
    await prisma.vinculoUnidad.create({
      data: {
        id: "vig-avi-vinculo-anterior",
        comunidadId: COMUNIDAD_V,
        personaId: PERSONA_ANTERIOR,
        unidadId: U_SIN_DUENO_V,
        rol: "propietario",
        fechaInicio: "2015-01-01",
        fechaFin: "2024-12-31",
        permiteVerFinanzas: false,
      },
    })
  }, 30_000)

  afterAll(async () => {
    try {
      await prisma.avisoVigencia.deleteMany({
        where: { comunidadId: { in: [COMUNIDAD_V, COMUNIDAD_V_B] } },
      })
      await prisma.notificacion.deleteMany({
        where: { comunidadId: { in: [COMUNIDAD_V, COMUNIDAD_V_B] } },
      })
      await prisma.vigenciaRegistroUnidad.deleteMany({
        where: { comunidadId: { in: [COMUNIDAD_V, COMUNIDAD_V_B] } },
      })
      await prisma.requerimientoVigencia.deleteMany({
        where: { comunidadId: { in: [COMUNIDAD_V, COMUNIDAD_V_B] } },
      })
      await prisma.eventoAuditoria.deleteMany({
        where: { comunidadId: { in: [COMUNIDAD_V, COMUNIDAD_V_B] } },
      })
      await prisma.vinculoUnidad.deleteMany({
        where: { comunidadId: { in: [COMUNIDAD_V, COMUNIDAD_V_B] } },
      })
      await prisma.unidad.deleteMany({
        where: { comunidadId: { in: [COMUNIDAD_V, COMUNIDAD_V_B] } },
      })
      await prisma.membresia.deleteMany({
        where: { usuarioId: { in: [USER_ADMIN_V, USER_RESIDENTE_V] } },
      })
      await prisma.usuario.deleteMany({
        where: { id: { in: [USER_ADMIN_V, USER_RESIDENTE_V] } },
      })
      await prisma.comunidad.deleteMany({
        where: { id: { in: [COMUNIDAD_V, COMUNIDAD_V_B] } },
      })
    } catch {
      // limpieza best-effort
    }
  })

  it("sin sesión responde 401 y no escribe avisos ni notificaciones", async () => {
    const respuesta = await emitirAvisos()
    expect(respuesta.status).toBe(401)
    expect(await prisma.avisoVigencia.count({ where: { comunidadId: COMUNIDAD_V } })).toBe(0)
    expect(await prisma.notificacion.count({ where: { comunidadId: COMUNIDAD_V } })).toBe(0)
    expect(await eventos()).toHaveLength(0)
  })

  it("el residente no puede emitir los avisos: 403 y nada escrito", async () => {
    await conSesionV(EMAIL_RESIDENTE_V, async () => {
      const respuesta = await emitirAvisos()
      expect(respuesta.status).toBe(403)
    })
    expect(await prisma.avisoVigencia.count({ where: { comunidadId: COMUNIDAD_V } })).toBe(0)
    expect(await prisma.notificacion.count({ where: { comunidadId: COMUNIDAD_V } })).toBe(0)
    expect(await eventos()).toHaveLength(0)
  })

  it("emite el aviso de por vencer al propietario vigente con su constancia y el incidente de la unidad sin dueño", async () => {
    await conSesionV(EMAIL_ADMIN_V, async () => {
      const respuesta = await emitirAvisos()
      expect(respuesta.status).toBe(200)
      const cuerpo = await respuesta.json()
      expect(cuerpo).toEqual({ ok: true, emitidos: 3, omitidos: 0 })
    })

    // El hito esperado sale del mismo veredicto que la ruta deriva de la fila:
    // el requerimiento anual de la unidad, no una fecha del reloj del test.
    const caso = await prisma.vigenciaRegistroUnidad.findUnique({
      where: {
        comunidadId_unidadId: {
          comunidadId: COMUNIDAD_V,
          unidadId: U_POR_VENCER_V,
        },
      },
    })
    const veredicto = estadoDelCaso(
      {
        ultimaActualizacion: caso?.ultimaActualizacion ?? null,
        requerimientoEn: caso?.requerimientoEn ?? null,
      },
      new Date()
    )
    expect(veredicto.estado).toBe("por_vencer")
    const hito = veredicto.cambiaEl
    if (!hito) throw new Error("el veredicto por vencer no trae hito")

    const delPropietario = await notificaciones(U_POR_VENCER_V)
    expect(delPropietario).toHaveLength(1)
    expect(delPropietario[0]).toMatchObject({
      destinatarioRol: "propietario",
      destinatarioPersonaId: PERSONA_PROPIETARIO,
      canal: "email_simulado",
      moduloOrigen: "AD_VIGENCIA",
      leida: false,
    })
    expect(delPropietario[0]?.asunto).toContain("1402")
    expect(delPropietario[0]?.asunto).toContain(hito)
    expect(delPropietario[0]?.cuerpo).toContain("1402")
    expect(delPropietario[0]?.cuerpo).toContain(hito)

    const constancia = await constancias(U_POR_VENCER_V)
    expect(constancia).toHaveLength(1)
    expect(constancia[0]).toMatchObject({
      tipo: "por_vencer",
      destinatario: "propietario",
      hito,
      notificacionId: delPropietario[0]?.id,
    })

    const delIncidente = await constancias(U_SIN_DUENO_V)
    expect(delIncidente.map((fila) => fila.destinatario)).toEqual([
      "administrador",
      "comite",
    ])
    expect(delIncidente.every((fila) => fila.tipo === "sin_propietario")).toBe(true)

    // La unidad de la otra comunidad no se barrió.
    expect(await prisma.avisoVigencia.count({ where: { unidadId: U_OTRA_V } })).toBe(0)
  })

  it("una segunda corrida del mismo barrido no duplica avisos ni notificaciones", async () => {
    await conSesionV(EMAIL_ADMIN_V, async () => {
      const respuesta = await emitirAvisos()
      expect(respuesta.status).toBe(200)
      const cuerpo = await respuesta.json()
      expect(cuerpo).toEqual({ ok: true, emitidos: 0, omitidos: 3 })
    })

    expect(await notificaciones(U_POR_VENCER_V)).toHaveLength(1)
    expect(await constancias(U_POR_VENCER_V)).toHaveLength(1)
    expect(
      await prisma.notificacion.count({ where: { comunidadId: COMUNIDAD_V } })
    ).toBe(3)
    expect(
      await prisma.avisoVigencia.count({ where: { comunidadId: COMUNIDAD_V } })
    ).toBe(3)
  })

  it("la unidad sin propietario vigente no recibe aviso al propietario: el incidente va al administrador y al Comité", async () => {
    const avisos = await prisma.notificacion.findMany({
      where: { comunidadId: COMUNIDAD_V, unidadId: U_SIN_DUENO_V },
    })
    expect(avisos.map((fila) => fila.destinatarioRol).sort()).toEqual([
      "administrador",
      "comite",
    ])
    // Ni el dueño histórico ni un destinatario vacío reciben el incidente.
    expect(
      await prisma.notificacion.count({
        where: {
          comunidadId: COMUNIDAD_V,
          unidadId: U_SIN_DUENO_V,
          destinatarioPersonaId: { in: [PERSONA_ANTERIOR, PERSONA_PROPIETARIO] },
        },
      })
    ).toBe(0)
    expect(
      await prisma.avisoVigencia.count({
        where: {
          comunidadId: COMUNIDAD_V,
          unidadId: U_SIN_DUENO_V,
          destinatario: "propietario",
        },
      })
    ).toBe(0)
  })

  it("cada corrida deja exactamente un evento de auditoría con lo emitido y lo omitido", async () => {
    const propios = await eventos()
    // Dos corridas exitosas; las rechazadas (401 y 403) no auditaron nada.
    expect(propios).toHaveLength(2)
    for (const evento of propios) {
      expect(evento.categoria).toBe("AD")
      expect(evento.usuario).toBe(USER_ADMIN_V)
      expect(evento.referenciaId).toBe(COMUNIDAD_V)
    }
    const descripciones = propios.map((evento) => evento.descripcion).sort()
    expect(descripciones[0]).toContain("0 emitido(s)")
    expect(descripciones[0]).toContain("3 omitido(s)")
    expect(descripciones[1]).toContain("3 emitido(s)")
    expect(descripciones[1]).toContain("0 omitido(s)")
  })
})

/**
 * S5 — el arrendatario declara sólo si el propietario lo habilita, y toda
 * declaración guarda quién la hizo.
 *
 * El obligado por el art. 9 es el propietario; el dato lo tiene quien vive la
 * unidad. Este bloque prueba las dos mitades de esa frase: que el permiso es un
 * acto del dueño (por vínculo, `default false`, nadie lo gana por omisión) y que
 * la declaración guarda su procedencia —`propietario` o `arrendatario`— sacada
 * del vínculo de la sesión, nunca del cuerpo del request. También prueba lo que
 * NO se abre: la cuenta del arrendatario no ve ni declara la unidad de otro, y
 * sin permiso no escribe ni una fila de evidencia.
 *
 * Fixture propio (`vig-dec-*`): el `afterAll` de los bloques anteriores borra su
 * comunidad, sus usuarios y sus unidades.
 */
describe("vigencia del registro — permiso del arrendatario y procedencia de la declaración (S5)", () => {
  const COMUNIDAD_D = "vig-dec-comunidad-a"
  const COMUNIDAD_D_B = "vig-dec-comunidad-b"

  const EMAIL_SIN_PERSONA_D = "vig-dec-sin-persona@test.cl"
  const EMAIL_SIN_VINCULO_D = "vig-dec-sin-vinculo@test.cl"
  const EMAIL_PROPIETARIO_D = "vig-dec-propietario@test.cl"
  const EMAIL_ARRENDATARIO_D = "vig-dec-arrendatario@test.cl"
  const EMAIL_ADMIN_D = "vig-dec-admin@test.cl"

  const USER_SIN_PERSONA_D = "vig-dec-user-sin-persona"
  const USER_SIN_VINCULO_D = "vig-dec-user-sin-vinculo"
  const USER_PROPIETARIO_D = "vig-dec-user-propietario"
  const USER_ARRENDATARIO_D = "vig-dec-user-arrendatario"
  const USER_ADMIN_D = "vig-dec-user-admin"

  const PERSONA_PROPIETARIO_D = "vig-dec-persona-propietario"
  const PERSONA_SIN_VINCULO_D = "vig-dec-persona-sin-vinculo"
  const PERSONA_ARRENDATARIO_D = "vig-dec-persona-arrendatario"

  // Unidades del dueño: una con el plazo vencido y otra sin declaración alguna.
  const U_PROPIETARIO_D = "vig-dec-u-propietario"
  const U_PROPIETARIO_DOS_D = "vig-dec-u-propietario-dos"
  // La unidad que vive el arrendatario: empieza SIN el permiso del propietario.
  const U_ARRENDATARIO_D = "vig-dec-u-arrendatario"
  // Misma comunidad, sin vínculo con el arrendatario: no debe existir para él.
  const U_AJENA_D = "vig-dec-u-ajena"
  // Camino administrativo (PRESERVE del acto de revalidar).
  const U_ADMIN_D = "vig-dec-u-admin"
  // Otra comunidad: el cambio de id no cruza el tenant.
  const U_OTRA_COMUNIDAD_D = "vig-dec-u-otra"

  const DETALLE_VALIDO =
    "El arrendatario confirma que los datos del registro de la unidad siguen iguales."

  // Fechas fijadas UNA vez: recalcularlas en la aserción mediría el reloj.
  const DECLARADO_HACE_30 = hace(30)
  const ULTIMA_ACTUALIZACION_PROPIETARIO = hace(400)
  const REQUERIDO_HACE = hace(100)

  const moduloMiUnidad = () =>
    import("@/app/api/vigencia-registro/mi-unidad/route")
  const moduloMiDeclaracion = () =>
    import("@/app/api/vigencia-registro/mi-declaracion/route")
  const moduloRevalidacionAdmin = () =>
    import("@/app/api/vigencia-registro/revalidacion/route")

  function miUnidad(): Promise<Response> {
    return moduloMiUnidad().then(({ GET }) => GET())
  }

  function declarar(unidadId: string, detalle: string): Promise<Response> {
    return moduloMiDeclaracion().then(({ POST }) =>
      POST(
        new Request("http://localhost/api/vigencia-registro/mi-declaracion", {
          method: "POST",
          body: JSON.stringify({ unidadId, detalle }),
        })
      )
    )
  }

  const declaraciones = (unidadId: string) =>
    prisma.revalidacionVigencia.findMany({
      where: { comunidadId: COMUNIDAD_D, unidadId },
      orderBy: { fecha: "asc" },
    })

  const eventos = (unidadId: string) =>
    prisma.eventoAuditoria.count({
      where: {
        comunidadId: COMUNIDAD_D,
        referenciaId: unidadId,
        tipoAccion: "AD_VIGENCIA_DECLARACION_PROPIA",
      },
    })

  const caso = (unidadId: string) =>
    prisma.vigenciaRegistroUnidad.findUnique({
      where: {
        comunidadId_unidadId: { comunidadId: COMUNIDAD_D, unidadId },
      },
    })

  async function conSesionD(
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

  beforeAll(async () => {
    process.env.AUTH_SECRET ||= AUTH_SECRET

    for (const [id, nombre, slug] of [
      [COMUNIDAD_D, "Comunidad Declaración", "vig-dec-comunidad-a"],
      [COMUNIDAD_D_B, "Comunidad Declaración B", "vig-dec-comunidad-b"],
    ] as const) {
      await prisma.comunidad.upsert({
        where: { id },
        update: {},
        create: { id, nombre, slug },
      })
    }

    const usuarios = [
      { id: USER_SIN_PERSONA_D, email: EMAIL_SIN_PERSONA_D, personaId: null },
      { id: USER_SIN_VINCULO_D, email: EMAIL_SIN_VINCULO_D, personaId: PERSONA_SIN_VINCULO_D },
      { id: USER_PROPIETARIO_D, email: EMAIL_PROPIETARIO_D, personaId: PERSONA_PROPIETARIO_D },
      { id: USER_ARRENDATARIO_D, email: EMAIL_ARRENDATARIO_D, personaId: PERSONA_ARRENDATARIO_D },
      { id: USER_ADMIN_D, email: EMAIL_ADMIN_D, personaId: null },
    ]
    for (const u of usuarios) {
      await prisma.usuario.upsert({
        where: { email: u.email },
        update: { personaId: u.personaId },
        create: { id: u.id, email: u.email, activo: true, personaId: u.personaId },
      })
    }

    const idsUsuarios = usuarios.map((u) => u.id)
    await prisma.membresia.deleteMany({
      where: { usuarioId: { in: idsUsuarios } },
    })
    for (const u of usuarios) {
      await prisma.membresia.create({
        data: {
          usuarioId: u.id,
          comunidadId: COMUNIDAD_D,
          // El arrendatario tiene su cuenta propia y acotada (S5): rol residente.
          rol: u.id === USER_ADMIN_D ? "administrador" : "residente",
        },
      })
    }

    await prisma.revalidacionVigencia.deleteMany({
      where: { comunidadId: { in: [COMUNIDAD_D, COMUNIDAD_D_B] } },
    })
    await prisma.vigenciaRegistroUnidad.deleteMany({
      where: { comunidadId: { in: [COMUNIDAD_D, COMUNIDAD_D_B] } },
    })
    await prisma.requerimientoVigencia.deleteMany({
      where: { comunidadId: { in: [COMUNIDAD_D, COMUNIDAD_D_B] } },
    })
    await prisma.eventoAuditoria.deleteMany({
      where: { comunidadId: { in: [COMUNIDAD_D, COMUNIDAD_D_B] } },
    })
    await prisma.vinculoUnidad.deleteMany({
      where: { comunidadId: { in: [COMUNIDAD_D, COMUNIDAD_D_B] } },
    })
    await prisma.unidad.deleteMany({
      where: { comunidadId: { in: [COMUNIDAD_D, COMUNIDAD_D_B] } },
    })
    await prisma.persona.deleteMany({
      where: { comunidadId: { in: [COMUNIDAD_D, COMUNIDAD_D_B] } },
    })

    for (const [id, nombre] of [
      [PERSONA_PROPIETARIO_D, "Dueña Vigente"],
      [PERSONA_SIN_VINCULO_D, "Sin Vínculo"],
      [PERSONA_ARRENDATARIO_D, "Arrendatario Vigente"],
    ] as const) {
      await prisma.persona.create({
        data: {
          id,
          comunidadId: COMUNIDAD_D,
          rut: `dec-${id}`,
          nombreCompleto: nombre,
          nombres: nombre.split(" ")[0] ?? nombre,
          apellidos: "Declaración",
          email: `${id}@test.cl`,
          telefonoMovil: "+56900000000",
          estadoCuenta: "activa",
          condicionesEspecialesIds: [],
          roles: [],
        },
      })
    }

    await crearUnidad(U_PROPIETARIO_D, "1701", COMUNIDAD_D)
    await crearUnidad(U_PROPIETARIO_DOS_D, "1704", COMUNIDAD_D)
    await crearUnidad(U_ARRENDATARIO_D, "1702", COMUNIDAD_D)
    await crearUnidad(U_AJENA_D, "1703", COMUNIDAD_D)
    await crearUnidad(U_ADMIN_D, "1705", COMUNIDAD_D)
    await crearUnidad(U_OTRA_COMUNIDAD_D, "1801", COMUNIDAD_D_B)

    await prisma.vinculoUnidad.create({
      data: {
        id: "vig-dec-vinculo-propietario",
        comunidadId: COMUNIDAD_D,
        personaId: PERSONA_PROPIETARIO_D,
        unidadId: U_PROPIETARIO_D,
        rol: "propietario",
        fechaInicio: "2021-01-01",
        fechaFin: null,
        permiteVerFinanzas: true,
      },
    })
    await prisma.vinculoUnidad.create({
      data: {
        id: "vig-dec-vinculo-propietario-dos",
        comunidadId: COMUNIDAD_D,
        personaId: PERSONA_PROPIETARIO_D,
        unidadId: U_PROPIETARIO_DOS_D,
        rol: "propietario",
        fechaInicio: "2022-01-01",
        fechaFin: null,
        permiteVerFinanzas: false,
      },
    })
    await prisma.vinculoUnidad.create({
      data: {
        id: "vig-dec-vinculo-arrendatario",
        comunidadId: COMUNIDAD_D,
        personaId: PERSONA_ARRENDATARIO_D,
        unidadId: U_ARRENDATARIO_D,
        rol: "arrendatario",
        fechaInicio: "2025-03-01",
        fechaFin: null,
        permiteVerFinanzas: false,
        // default false: nadie hereda el permiso, lo da el propietario.
        puedeDeclararRegistro: false,
      },
    })

    await prisma.vigenciaRegistroUnidad.create({
      data: {
        comunidadId: COMUNIDAD_D,
        unidadId: U_PROPIETARIO_D,
        ultimaActualizacion: ULTIMA_ACTUALIZACION_PROPIETARIO,
        requerimientoEn: REQUERIDO_HACE,
      },
    })
    await prisma.requerimientoVigencia.create({
      data: {
        comunidadId: COMUNIDAD_D,
        unidadId: U_PROPIETARIO_D,
        fecha: REQUERIDO_HACE,
        venceEn: new Date(REQUERIDO_HACE.getTime() + 60 * DIA),
        registradoPor: USER_ADMIN_D,
        fundamento: "Requerimiento anual del Registro de la unidad 1701.",
      },
    })
    await prisma.vigenciaRegistroUnidad.create({
      data: {
        comunidadId: COMUNIDAD_D,
        unidadId: U_ARRENDATARIO_D,
        ultimaActualizacion: DECLARADO_HACE_30,
      },
    })
    await prisma.vigenciaRegistroUnidad.create({
      data: {
        comunidadId: COMUNIDAD_D,
        unidadId: U_ADMIN_D,
        ultimaActualizacion: null,
        requerimientoEn: REQUERIDO_HACE,
      },
    })
  }, 30_000)

  afterAll(async () => {
    try {
      await prisma.revalidacionVigencia.deleteMany({
        where: { comunidadId: { in: [COMUNIDAD_D, COMUNIDAD_D_B] } },
      })
      await prisma.vigenciaRegistroUnidad.deleteMany({
        where: { comunidadId: { in: [COMUNIDAD_D, COMUNIDAD_D_B] } },
      })
      await prisma.requerimientoVigencia.deleteMany({
        where: { comunidadId: { in: [COMUNIDAD_D, COMUNIDAD_D_B] } },
      })
      await prisma.eventoAuditoria.deleteMany({
        where: { comunidadId: { in: [COMUNIDAD_D, COMUNIDAD_D_B] } },
      })
      await prisma.vinculoUnidad.deleteMany({
        where: { comunidadId: { in: [COMUNIDAD_D, COMUNIDAD_D_B] } },
      })
      await prisma.unidad.deleteMany({
        where: { comunidadId: { in: [COMUNIDAD_D, COMUNIDAD_D_B] } },
      })
      await prisma.membresia.deleteMany({
        where: {
          usuarioId: {
            in: [
              USER_SIN_PERSONA_D,
              USER_SIN_VINCULO_D,
              USER_PROPIETARIO_D,
              USER_ARRENDATARIO_D,
              USER_ADMIN_D,
            ],
          },
        },
      })
      await prisma.usuario.deleteMany({
        where: {
          id: {
            in: [
              USER_SIN_PERSONA_D,
              USER_SIN_VINCULO_D,
              USER_PROPIETARIO_D,
              USER_ARRENDATARIO_D,
              USER_ADMIN_D,
            ],
          },
        },
      })
      await prisma.persona.deleteMany({
        where: { comunidadId: { in: [COMUNIDAD_D, COMUNIDAD_D_B] } },
      })
      await prisma.comunidad.deleteMany({
        where: { id: { in: [COMUNIDAD_D, COMUNIDAD_D_B] } },
      })
    } catch {
      // limpieza best-effort
    }
  })

  it("sin sesión responde 401 en las dos rutas y no escribe nada", async () => {
    const lista = await miUnidad()
    expect(lista.status).toBe(401)

    const declaracion = await declarar(U_ARRENDATARIO_D, DETALLE_VALIDO)
    expect(declaracion.status).toBe(401)

    expect(await declaraciones(U_ARRENDATARIO_D)).toHaveLength(0)
    expect(await eventos(U_ARRENDATARIO_D)).toBe(0)
  })

  it("sin persona o sin vínculo recibe la lista vacía y un 404, nunca la unidad ajena", async () => {
    // Sin ficha en el Maestro de Personas: no hay «lo propio» que resolver.
    await conSesionD(EMAIL_SIN_PERSONA_D, async () => {
      const lista = await miUnidad()
      expect(lista.status).toBe(200)
      expect(await lista.json()).toMatchObject({ data: [], total: 0 })

      const declaracion = await declarar(U_ARRENDATARIO_D, DETALLE_VALIDO)
      expect(declaracion.status).toBe(404)
    })

    // Con ficha pero sin ningún vínculo vigente: el mismo resultado.
    await conSesionD(EMAIL_SIN_VINCULO_D, async () => {
      const lista = await miUnidad()
      expect(lista.status).toBe(200)
      expect(await lista.json()).toMatchObject({ data: [], total: 0 })

      const declaracion = await declarar(U_ARRENDATARIO_D, DETALLE_VALIDO)
      expect(declaracion.status).toBe(404)
    })

    // Un 404 no puede escribir: ni caso, ni evidencia, ni evento, ni auditoría.
    expect(await declaraciones(U_ARRENDATARIO_D)).toHaveLength(0)
    expect(await eventos(U_ARRENDATARIO_D)).toBe(0)
    expect((await caso(U_ARRENDATARIO_D))?.ultimaActualizacion?.getTime()).toBe(
      DECLARADO_HACE_30.getTime()
    )
  })

  it("el propietario vigente declara y la fila guarda origen propietario", async () => {
    await conSesionD(EMAIL_PROPIETARIO_D, async () => {
      const respuesta = await declarar(U_PROPIETARIO_D, DETALLE_VALIDO)
      expect(respuesta.status).toBe(200)
      expect(await respuesta.json()).toEqual({
        ok: true,
        unidadId: U_PROPIETARIO_D,
        estado: "al_dia",
      })
    })

    const firmadas = await declaraciones(U_PROPIETARIO_D)
    expect(firmadas).toHaveLength(1)
    expect(firmadas[0]).toMatchObject({
      revalidadoPor: USER_PROPIETARIO_D,
      detalle: DETALLE_VALIDO,
      origen: "propietario",
    })

    const despues = await caso(U_PROPIETARIO_D)
    expect(despues?.ultimaActualizacion).not.toBeNull()
    expect(despues?.requerimientoEn).toBeNull()

    // S6: la evidencia del requerimiento anterior no se toca al declarar.
    const evidencia = await prisma.requerimientoVigencia.findMany({
      where: { comunidadId: COMUNIDAD_D, unidadId: U_PROPIETARIO_D },
    })
    expect(evidencia).toHaveLength(1)
    expect(evidencia[0]?.fecha.getTime()).toBe(REQUERIDO_HACE.getTime())

    expect(await eventos(U_PROPIETARIO_D)).toBe(1)
    const [evento] = await prisma.eventoAuditoria.findMany({
      where: {
        comunidadId: COMUNIDAD_D,
        referenciaId: U_PROPIETARIO_D,
        tipoAccion: "AD_VIGENCIA_DECLARACION_PROPIA",
      },
    })
    expect(evento?.categoria).toBe("AD")
    expect(evento?.usuario).toBe(USER_PROPIETARIO_D)
    expect(evento?.descripcion).toContain("1701")
    expect(evento?.descripcion).toContain("propietario")
  })

  it("el arrendatario sin el permiso del propietario no declara: 403 y nada escrito", async () => {
    const antes = await caso(U_ARRENDATARIO_D)

    await conSesionD(EMAIL_ARRENDATARIO_D, async () => {
      const respuesta = await declarar(U_ARRENDATARIO_D, DETALLE_VALIDO)
      expect(respuesta.status).toBe(403)
      const cuerpo = await respuesta.json()
      // El mensaje dice que falta el permiso del dueño, no un «permiso denegado» genérico.
      expect(String(cuerpo.error)).toMatch(/propietario/i)
      expect(String(cuerpo.error)).toMatch(/habilit/i)
    })

    expect(await declaraciones(U_ARRENDATARIO_D)).toHaveLength(0)
    expect(await eventos(U_ARRENDATARIO_D)).toBe(0)
    const despues = await caso(U_ARRENDATARIO_D)
    expect(despues?.ultimaActualizacion?.getTime()).toBe(
      antes?.ultimaActualizacion?.getTime()
    )
    expect(despues?.requerimientoEn).toBeNull()
  })

  it("cuando el propietario habilita al arrendatario, la declaración guarda origen arrendatario", async () => {
    // El acto es del dueño y por vínculo: se enciende el permiso de ESE arrendatario.
    await prisma.vinculoUnidad.update({
      where: { id: "vig-dec-vinculo-arrendatario" },
      data: { puedeDeclararRegistro: true },
    })

    await conSesionD(EMAIL_ARRENDATARIO_D, async () => {
      const respuesta = await declarar(U_ARRENDATARIO_D, DETALLE_VALIDO)
      expect(respuesta.status).toBe(200)
      expect(await respuesta.json()).toEqual({
        ok: true,
        unidadId: U_ARRENDATARIO_D,
        estado: "al_dia",
      })
    })

    const firmadas = await declaraciones(U_ARRENDATARIO_D)
    expect(firmadas).toHaveLength(1)
    expect(firmadas[0]).toMatchObject({
      revalidadoPor: USER_ARRENDATARIO_D,
      origen: "arrendatario",
      detalle: DETALLE_VALIDO,
    })

    const [evento] = await prisma.eventoAuditoria.findMany({
      where: {
        comunidadId: COMUNIDAD_D,
        referenciaId: U_ARRENDATARIO_D,
        tipoAccion: "AD_VIGENCIA_DECLARACION_PROPIA",
      },
    })
    expect(evento?.usuario).toBe(USER_ARRENDATARIO_D)
    expect(evento?.descripcion).toContain("1702")
    expect(evento?.descripcion).toContain("arrendatario")
  })

  it("el arrendatario de una unidad no declara la de otro: 404 y nada escrito", async () => {
    // El permiso ya está encendido: lo que frena acá es el alcance, no el flag.
    await conSesionD(EMAIL_ARRENDATARIO_D, async () => {
      const ajena = await declarar(U_AJENA_D, DETALLE_VALIDO)
      expect(ajena.status).toBe(404)
      // El mismo 404 para una unidad de otra comunidad: el id no cruza el tenant.
      const otraComunidad = await declarar(U_OTRA_COMUNIDAD_D, DETALLE_VALIDO)
      expect(otraComunidad.status).toBe(404)
    })

    expect(await declaraciones(U_AJENA_D)).toHaveLength(0)
    expect(
      await prisma.revalidacionVigencia.count({
        where: { unidadId: U_OTRA_COMUNIDAD_D },
      })
    ).toBe(0)
    expect(
      await prisma.vigenciaRegistroUnidad.count({
        where: { unidadId: { in: [U_AJENA_D, U_OTRA_COMUNIDAD_D] } },
      })
    ).toBe(0)
    expect(await eventos(U_AJENA_D)).toBe(0)
  })

  it("mi-unidad devuelve sólo los vínculos propios con el estado derivado y el permiso", async () => {
    // El estado esperado sale del mismo veredicto que la ruta deriva de la fila:
    // si el test recalculara el calendario por su cuenta mediría el reloj, no el
    // hecho guardado.
    async function esperado(unidadId: string) {
      const fila = await caso(unidadId)
      return estadoDelCaso(
        {
          ultimaActualizacion: fila?.ultimaActualizacion ?? null,
          requerimientoEn: fila?.requerimientoEn ?? null,
        },
        new Date()
      ).estado
    }

    await conSesionD(EMAIL_PROPIETARIO_D, async () => {
      const respuesta = await miUnidad()
      expect(respuesta.status).toBe(200)
      const cuerpo = await respuesta.json()
      const porUnidad = new Map(
        cuerpo.data.map((f: { unidadId: string }) => [f.unidadId, f])
      )
      // Sólo las unidades con vínculo de ESTA persona: ni la del arrendatario ni
      // la unidad ajena aparecen.
      expect(cuerpo.total).toBe(2)
      expect(porUnidad.has(U_ARRENDATARIO_D)).toBe(false)
      expect(porUnidad.has(U_AJENA_D)).toBe(false)

      const propia = porUnidad.get(U_PROPIETARIO_D) as Record<string, unknown>
      expect(propia).toMatchObject({
        numero: "1701",
        etiqueta: "Unidad 1701",
        rol: "propietario",
        // Nadie hereda el permiso: el dueño no lo tiene sobre sí mismo.
        puedeDeclararRegistro: false,
        estado: await esperado(U_PROPIETARIO_D),
      })
      // La ruta devuelve los mismos campos que el listado administrativo.
      expect(propia).toHaveProperty("descripcion")
      expect(propia).toHaveProperty("ultimaActualizacion")
      expect(propia).toHaveProperty("requerimientoEn")

      // Unidad sin caso: sin declaración, y eso se ve como tal.
      const sinCaso = porUnidad.get(U_PROPIETARIO_DOS_D) as Record<string, unknown>
      expect(sinCaso).toMatchObject({
        numero: "1704",
        estado: "sin_declaracion",
        ultimaActualizacion: null,
        requerimientoEn: null,
      })
    })

    await conSesionD(EMAIL_ARRENDATARIO_D, async () => {
      const respuesta = await miUnidad()
      expect(respuesta.status).toBe(200)
      const cuerpo = await respuesta.json()
      expect(cuerpo.total).toBe(1)
      expect(cuerpo.data[0]).toMatchObject({
        unidadId: U_ARRENDATARIO_D,
        numero: "1702",
        rol: "arrendatario",
        // El permiso encendido por el dueño se refleja en la vista acotada.
        puedeDeclararRegistro: true,
        estado: await esperado(U_ARRENDATARIO_D),
      })
    })
  })

  it("PRESERVE: la revalidación administrativa sigue guardando su evidencia como del administrador", async () => {
    await conSesionD(EMAIL_ADMIN_D, async () => {
      const { POST } = await moduloRevalidacionAdmin()
      const respuesta = await POST(
        new Request("http://localhost/api/vigencia-registro/revalidacion", {
          method: "POST",
          body: JSON.stringify({ unidadId: U_ADMIN_D, detalle: DETALLE_VALIDO }),
        })
      )
      expect(respuesta.status).toBe(200)
      const cuerpo = await respuesta.json()
      expect(cuerpo.ok).toBe(true)
      expect(cuerpo.estado).toBe("al_dia")
    })

    const firmadas = await declaraciones(U_ADMIN_D)
    expect(firmadas).toHaveLength(1)
    // La columna nueva no cambia el acto administrativo: su default la rotula.
    expect(firmadas[0]).toMatchObject({
      revalidadoPor: USER_ADMIN_D,
      origen: "administrador",
    })
    expect((await caso(U_ADMIN_D))?.requerimientoEn).toBeNull()
    expect(await eventos(U_ADMIN_D)).toBe(0)
  })
})
