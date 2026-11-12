/**
 * @vitest-environment node
 *
 * Folio de InfraccionIN — `IN-####` único POR COMUNIDAD (IN, deuda del módulo).
 *
 * El folio se dicta y se cita: dos sanciones con el mismo número quedan
 * inidentificables. El contador (`siguienteFolio`, `max + 1`) no alcanza solo,
 * porque dos aplicaciones concurrentes leen el mismo máximo y escriben el mismo
 * folio. La garantía dura es el índice único `(comunidadId, folio)` de la base;
 * el reintento acotado del handler es lo que convierte esa colisión en el folio
 * siguiente en vez de un 500.
 *
 * La carrera real no se puede forzar sobre SQLite (serializa las escrituras), así
 * que el segundo caso la simula en el único punto donde existe: la lectura. La
 * primera transacción ve la instantánea vieja de folios (sin el `IN-0001` que ya
 * sembró otra aplicación), choca contra el índice al escribir y reintenta; el
 * segundo intento lee la base real y termina con `IN-0002`.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest"
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

const COMUNIDAD = "vigfolio-comunidad-a"
const COMUNIDAD_B = "vigfolio-comunidad-b"
const EMAIL_ADMIN = "vigfolio-admin@test.cl"
const USER_ADMIN = "vigfolio-user-admin"

const U_MULTA = "vigfolio-u-multa"
const U_SEMILLA = "vigfolio-u-semilla"

const ACUERDO =
  "Acta de Comité ordinaria N° 21 de 2026, acuerdo 2: aplicar la multa por el Registro no actualizado."
const MENSAJE_SIN_FOLIO =
  "Conflicto: no se pudo asignar un folio único a la infracción, reintentá la aplicación de la multa."

type Ctx = { params: Promise<{ id: string }> }

const resolver = (id: string, cuerpo: unknown): Promise<Response> =>
  import("@/app/api/vigencia-registro/multa/[id]/aplicar/route").then(({ POST }) =>
    POST(
      new Request(`http://localhost/api/vigencia-registro/multa/${id}/aplicar`, {
        method: "POST",
        body: JSON.stringify(cuerpo),
      }),
      { params: Promise.resolve({ id }) } as Ctx
    )
  )

/** Fila mínima de InfraccionIN: lo que el índice único necesita para chocar. */
function infraccion(id: string, comunidadId: string, unidadId: string, folio: string) {
  return {
    id,
    comunidadId,
    folio,
    unidadId,
    fechaSuceso: "2026-11-04",
    horaSuceso: "22:15",
    antecedentes: "Ruido excesivo después del horario de descanso del reglamento.",
    evidencias: [],
    estado: "aplicada",
    fechaRegistro: "2026-11-05",
    comentariosDirectiva: [],
    respaldosDirectiva: [],
  }
}

/** Una propuesta por caso: el ciclo (`requerimientoEn`) es su clave única. */
async function crearPropuesta(
  id: string,
  unidadId: string,
  diasAtras: number
): Promise<string> {
  const requerimientoEn = new Date(Date.now() - diasAtras * 24 * 60 * 60 * 1000)
  await prisma.propuestaMultaVigencia.create({
    data: {
      id,
      comunidadId: COMUNIDAD,
      unidadId,
      monto: 35_000,
      requerimientoEn,
      propuestaPor: USER_ADMIN,
      estado: "propuesta",
    },
  })
  return id
}

/**
 * Simula la carrera sin tocar la base: el primer intento de transacción recibe un
 * `tx` cuya lectura de folios devuelve la instantánea vieja (vacía). El resto de
 * los intentos lee la base real, que es exactamente lo que pasa cuando otra
 * aplicación gana la carrera entre la lectura y la escritura.
 */
function simularInstantaneaVieja(siempreVieja = false): () => number {
  /* eslint-disable @typescript-eslint/no-explicit-any -- arnés de la carrera */
  const clave = "$transaction" as const
  const original = (prisma as any)[clave]
  let intentos = 0

  const envolverLectura = (tx: any): any =>
    new Proxy(tx, {
      get(destino: any, prop: string | symbol) {
        const valor = Reflect.get(destino, prop, destino)
        if (prop !== "infraccionIN") return valor
        return new Proxy(valor, {
          get(delegate: any, campo: string | symbol) {
            if (campo === "findMany") return async () => []
            const metodo = Reflect.get(delegate, campo, delegate)
            return typeof metodo === "function" ? metodo.bind(delegate) : metodo
          },
        })
      },
    })

  ;(prisma as any)[clave] = async (fn: any) => {
    intentos += 1
    const instantaneaVieja = siempreVieja || intentos === 1
    return original.call(prisma, async (tx: any) =>
      fn(instantaneaVieja ? envolverLectura(tx) : tx)
    )
  }
  /* eslint-enable @typescript-eslint/no-explicit-any */

  // El tope del reintento es lo que se mide: cuántas transacciones se intentaron.
  return () => intentos
}

function restaurarTransaccion(): void {
  // Borra la propiedad propia que dejó el espía y vuelve al método del cliente.
  delete (prisma as unknown as Record<string, unknown>)["$transaction"]
}

async function conSesion(fn: () => Promise<void>): Promise<void> {
  const usuario = await prisma.usuario.findUnique({ where: { email: EMAIL_ADMIN } })
  if (!usuario) throw new Error(`usuario no encontrado: ${EMAIL_ADMIN}`)
  const { cookieSesionAuthjs } = await import("../helpers/sesion-authjs")
  state.cookie = await cookieSesionAuthjs({ sub: usuario.id, email: usuario.email })
  try {
    await fn()
  } finally {
    state.cookie = ""
  }
}

describe("aplicar la multa de vigencia — el folio IN no se repite (IN)", () => {
  beforeAll(async () => {
    process.env.AUTH_SECRET = AUTH_SECRET
    for (const [id, nombre, slug] of [
      [COMUNIDAD, "Comunidad folio IN", "vigfolio-comunidad-a"],
      [COMUNIDAD_B, "Comunidad folio IN B", "vigfolio-comunidad-b"],
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
    await prisma.membresia.deleteMany({ where: { usuarioId: USER_ADMIN } })
    await prisma.membresia.create({
      data: { usuarioId: USER_ADMIN, comunidadId: COMUNIDAD, rol: "administrador" },
    })
    await prisma.unidad.deleteMany({ where: { id: { in: [U_MULTA, U_SEMILLA] } } })
    for (const [id, numero] of [
      [U_MULTA, "501"],
      [U_SEMILLA, "502"],
    ] as const) {
      await prisma.unidad.create({
        data: {
          id,
          comunidadId: COMUNIDAD,
          microSectorId: "vigfolio-micro",
          numero,
          etiqueta: `Unidad ${numero}`,
          tipoUnidadId: "vigfolio-tipo",
          metraje: 50,
          prorrateo: 1,
          rolSii: `rol-${numero}`,
          estadoId: "habitada",
          servicios: {},
        },
      })
    }
  }, 60_000)

  beforeEach(async () => {
    state.cookie = ""
    // Cada caso arranca con la comunidad sin folios emitidos: el contador es
    // `max + 1` sobre filas reales, así que una fila de más movería el número.
    await prisma.eventoAuditoria.deleteMany({
      where: { comunidadId: { in: [COMUNIDAD, COMUNIDAD_B] } },
    })
    await prisma.infraccionIN.deleteMany({
      where: { comunidadId: { in: [COMUNIDAD, COMUNIDAD_B] } },
    })
    await prisma.propuestaMultaVigencia.deleteMany({
      where: { comunidadId: { in: [COMUNIDAD, COMUNIDAD_B] } },
    })
  })

  afterAll(async () => {
    try {
      restaurarTransaccion()
      state.cookie = ""
      await prisma.eventoAuditoria.deleteMany({
        where: { comunidadId: { in: [COMUNIDAD, COMUNIDAD_B] } },
      })
      await prisma.infraccionIN.deleteMany({
        where: { comunidadId: { in: [COMUNIDAD, COMUNIDAD_B] } },
      })
      await prisma.propuestaMultaVigencia.deleteMany({
        where: { comunidadId: { in: [COMUNIDAD, COMUNIDAD_B] } },
      })
      await prisma.unidad.deleteMany({ where: { id: { in: [U_MULTA, U_SEMILLA] } } })
      await prisma.membresia.deleteMany({ where: { usuarioId: USER_ADMIN } })
      await prisma.usuario.delete({ where: { id: USER_ADMIN } }).catch(() => {})
      await prisma.comunidad.deleteMany({ where: { id: { in: [COMUNIDAD, COMUNIDAD_B] } } })
    } catch {
      // limpieza best-effort
    }
  })

  it("dos infracciones de la misma comunidad no pueden compartir folio", async () => {
    await prisma.infraccionIN.create({
      data: infraccion("vigfolio-in-semilla-1", COMUNIDAD, U_SEMILLA, "IN-0001"),
    })

    // La segunda alta con el mismo folio choca con el índice único: P2002.
    await expect(
      prisma.infraccionIN.create({
        data: infraccion("vigfolio-in-duplicada", COMUNIDAD, U_MULTA, "IN-0001"),
      })
    ).rejects.toMatchObject({ code: "P2002" })

    const mismaComunidad = await prisma.infraccionIN.findMany({
      where: { comunidadId: COMUNIDAD, folio: "IN-0001" },
    })
    expect(mismaComunidad).toHaveLength(1)
    expect(mismaComunidad[0]?.id).toBe("vigfolio-in-semilla-1")

    // La unicidad es POR COMUNIDAD: la otra comunidad puede tener su propio IN-0001.
    const otra = await prisma.infraccionIN.create({
      data: infraccion("vigfolio-in-otra", COMUNIDAD_B, "vigfolio-u-b", "IN-0001"),
    })
    expect(otra.folio).toBe("IN-0001")
  })

  it("si el folio choca, la ruta reintenta y termina creando IN-0002", async () => {
    // La otra aplicación ya dictó el IN-0001 antes de esta lectura.
    await prisma.infraccionIN.create({
      data: infraccion("vigfolio-in-semilla", COMUNIDAD, U_SEMILLA, "IN-0001"),
    })
    const propuestaId = await crearPropuesta("vigfolio-prop-retry", U_MULTA, 100)

    const intentosDeTransaccion = simularInstantaneaVieja()
    try {
      await conSesion(async () => {
        const res = await resolver(propuestaId, { acuerdoReferencia: ACUERDO })
        expect(res.status).toBe(200)
        const cuerpo = (await res.json()) as { estado: string; infraccionId: string }
        expect(cuerpo.estado).toBe("aplicada")
        expect(cuerpo.infraccionId).toBeTruthy()
      })
    } finally {
      restaurarTransaccion()
    }

    // Un reintento: el primer intento choca y el segundo escribe el folio libre.
    expect(intentosDeTransaccion()).toBe(2)

    const folios = await prisma.infraccionIN.findMany({
      where: { comunidadId: COMUNIDAD },
      orderBy: { folio: "asc" },
      select: { folio: true, id: true },
    })
    // Dos infracciones, dos folios distintos: el reintento no escribió un duplicado.
    expect(folios.map((f) => f.folio)).toEqual(["IN-0001", "IN-0002"])
    const creada = folios.find((f) => f.folio === "IN-0002")
    expect(creada).toBeDefined()

    const propuesta = await prisma.propuestaMultaVigencia.findUnique({
      where: { id: propuestaId },
    })
    expect(propuesta).toMatchObject({
      estado: "aplicada",
      infraccionId: creada?.id,
      acuerdoReferencia: ACUERDO,
    })
    // La semilla de la otra aplicación quedó intacta.
    const semilla = await prisma.infraccionIN.findUnique({
      where: { id: "vigfolio-in-semilla" },
    })
    expect(semilla?.folio).toBe("IN-0001")
    // El intento que chocó revirtió entero: un solo evento del acto que sí ocurrió.
    expect(
      await prisma.eventoAuditoria.count({
        where: {
          comunidadId: COMUNIDAD,
          referenciaId: U_MULTA,
          tipoAccion: "AD_VIGENCIA_MULTA_APLICADA",
        },
      })
    ).toBe(1)
  })

  it("sin colisión, aplicar la multa sigue creando IN-0001 con su evento", async () => {
    const propuestaId = await crearPropuesta("vigfolio-prop-normal", U_MULTA, 200)

    let infraccionId = ""
    await conSesion(async () => {
      const res = await resolver(propuestaId, { acuerdoReferencia: ACUERDO })
      expect(res.status).toBe(200)
      const cuerpo = (await res.json()) as {
        ok: boolean
        propuestaId: string
        estado: string
        infraccionId: string
      }
      expect(cuerpo.ok).toBe(true)
      expect(cuerpo.propuestaId).toBe(propuestaId)
      expect(cuerpo.estado).toBe("aplicada")
      infraccionId = cuerpo.infraccionId
    })

    const creada = await prisma.infraccionIN.findUnique({ where: { id: infraccionId } })
    expect(creada?.folio).toBe("IN-0001")
    expect(creada?.unidadId).toBe(U_MULTA)
    expect(creada?.estado).toBe("aplicada")
    expect(creada?.montoAplicado).toBe(35_000)
    expect(
      await prisma.eventoAuditoria.count({
        where: {
          comunidadId: COMUNIDAD,
          referenciaId: U_MULTA,
          tipoAccion: "AD_VIGENCIA_MULTA_APLICADA",
        },
      })
    ).toBe(1)
  })

  it("agotados los intentos responde 409 con el mensaje literal y no aplica la propuesta", async () => {
    // La colisión persiste (otra aplicación vuelve a dictar el mismo folio en
    // cada lectura): el reintento acotado se agota y el desenlace es un 409 de
    // conflicto, no un 500 ni una infracción con folio repetido.
    await prisma.infraccionIN.create({
      data: infraccion("vigfolio-in-semilla-2", COMUNIDAD, U_SEMILLA, "IN-0001"),
    })
    const propuestaId = await crearPropuesta("vigfolio-prop-agotada", U_MULTA, 300)

    const intentosDeTransaccion = simularInstantaneaVieja(true)
    try {
      await conSesion(async () => {
        const res = await resolver(propuestaId, { acuerdoReferencia: ACUERDO })
        expect(res.status).toBe(409)
        expect(await res.json()).toEqual({ error: MENSAJE_SIN_FOLIO })
      })
    } finally {
      restaurarTransaccion()
    }

    // El reintento es ACOTADO: se agota el tope y no se queda reintentando.
    expect(intentosDeTransaccion()).toBe(3)

    const propuesta = await prisma.propuestaMultaVigencia.findUnique({
      where: { id: propuestaId },
    })
    expect(propuesta).toMatchObject({ estado: "propuesta", infraccionId: null })
    expect(await prisma.infraccionIN.count({ where: { comunidadId: COMUNIDAD } })).toBe(1)
    expect(
      await prisma.eventoAuditoria.count({
        where: { comunidadId: COMUNIDAD, tipoAccion: "AD_VIGENCIA_MULTA_APLICADA" },
      })
    ).toBe(0)
  })
})
