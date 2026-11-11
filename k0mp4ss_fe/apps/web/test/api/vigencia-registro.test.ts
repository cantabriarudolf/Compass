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
})
