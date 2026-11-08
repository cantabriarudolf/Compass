/**
 * @vitest-environment node
 *
 * «El residente ve su propia deuda» — `GET /api/cobros-fi/mi-estado-cuenta`.
 *
 * Decisión del owner (2026-11-08): el residente ve su deuda SIEMPRE y SOLO la
 * suya. Por eso la bandera `residenteVeMorosidad` no se cablea (queda como
 * columna `@deprecated`): lo que garantiza el «solo la suya» no es un switch,
 * es el filtro por fila de esta ruta.
 *
 * La ruta es auto-acotada: las unidades salen de los vínculos VIGENTES de la
 * persona del usuario en la base (`unidadesVinculadasDb` +
 * `personaIdDelUsuarioDb`), nunca de un id del cliente. Este archivo fija el
 * contrato observable, con el mismo patrón de F27 (`/api/avisos-cobro`) y T10
 * (`/api/liquidaciones`): sin vínculo la respuesta es 200 con lista vacía, no
 * 403 —un 403 confirmaría que existe deuda de una unidad que no es la propia—.
 *
 * Casos:
 *   1. propia → 200 con sus cobros, su saldo (cargo + moras − pagos, calculado
 *      con `saldoPendiente`) y el `avisoId` del período que tiene papel;
 *   2. el cobro de OTRA unidad de la misma comunidad no aparece, y una unidad
 *      con vínculo CERRADO tampoco (solo vínculos vigentes);
 *   3. el cobro de OTRA comunidad no aparece, ni siquiera cuando la fila apunta
 *      a una unidad propia: el `comunidadId` del scope es parte del `where`;
 *   4. sin vínculo → 200 con lista vacía y saldo 0;
 *   5. sin sesión → 401 y sin membresía → 403 (el scope de comunidad manda);
 *   6. el comité NO entra (la compuerta es la clave del residente,
 *      `fi:aviso:propio` ver) y el administrador sin persona ve SU estado de
 *      cuenta vacío, no la deuda de la comunidad: «mi» nunca significa «todas»;
 *   7. no viaja ningún id de persona: el json no contiene el `personaId` del
 *      dueño ni ids de personas ajenas.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest"
import { NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"
import { cookieDeUsuario } from "../helpers/api-sesion"

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

const COM_A = "mec-com-a"
const COM_B = "mec-com-b"

const FONDO_A = "mec-fondo-a"
const FONDO_B = "mec-fondo-b"

/** Unidad propia (vínculo vigente). */
const U1 = "mec-u-1"
/** Unidad con vínculo CERRADO del residente: no es «lo suyo» hoy. */
const U2 = "mec-u-2"
/** Unidad de otra persona de la misma comunidad. */
const U3 = "mec-u-3"
/** Unidad de la comunidad B. */
const U_B = "mec-u-b"

const P_RES = "mec-persona-res"
const P_VECINO = "mec-persona-vecino"
const P_SIN = "mec-persona-sin-vinculo"
const P_AJENA = "mec-persona-ajena"

const EMAIL_RESIDENTE = "mec-residente@test.cl"
const EMAIL_SIN_VINCULO = "mec-sin-vinculo@test.cl"
const EMAIL_ADMIN = "mec-admin@test.cl"
const EMAIL_COMITE = "mec-comite@test.cl"
const EMAIL_SIN_MEMBRESIA = "mec-sin-membresia@test.cl"

const COBRO_U1_SEP = "mec-cob-u1-2026-09"
const COBRO_U1_AGO = "mec-cob-u1-2026-08"
const COBRO_U2_SEP = "mec-cob-u2-2026-09"
const COBRO_U3_SEP = "mec-cob-u3-2026-09"
const COBRO_B = "mec-cob-b-2026-09"
/** Fila de la comunidad B que apunta a la MISMA unidad del residente. */
const COBRO_B_U1 = "mec-cob-b-u1-2026-09"

const AVISO_U1_SEP = "mec-avi-u1-2026-09"

/** Fila de la respuesta, con el contrato que la pantalla consume. */
interface FilaEstadoCuenta {
  id: string
  unidadId: string
  unidadNumero: string | null
  unidadEtiqueta: string | null
  periodo: string
  concepto: string
  montoCargo: number
  pagado: number
  moras: number
  saldoPendiente: number
  estado: string
  fechaVencimiento: string | null
  avisoId: string | null
}

interface RespuestaEstadoCuenta {
  data: FilaEstadoCuenta[]
  saldoTotal: number
}

const pago = (id: string, monto: number) => ({
  id,
  monto,
  fecha: "2026-08-20",
  medio: "transferencia",
})

const mora = (id: string, monto: number) => ({
  id,
  monto,
  diasAtraso: 40,
  tasaMensualPct: 1.5,
  fecha: "2026-08-10",
})

interface CobroSemilla {
  id: string
  comunidadId?: string
  unidadId: string
  periodo: string
  montoBase: number
  pagos?: ReturnType<typeof pago>[]
  moras?: ReturnType<typeof mora>[]
  /** Vencimiento futuro por defecto: el estado no depende del reloj de la corrida. */
  fechaVencimiento?: string
}

function cobroSemilla(c: CobroSemilla) {
  return {
    id: c.id,
    comunidadId: c.comunidadId ?? COM_A,
    unidadId: c.unidadId,
    periodo: c.periodo,
    concepto: "gasto_comun",
    origenModulo: "FI",
    fondoId: c.comunidadId === COM_B ? FONDO_B : FONDO_A,
    descripcion: `Gasto común ${c.periodo}`,
    montoBase: c.montoBase,
    fechaCargo: `${c.periodo}-01`,
    fechaVencimiento: c.fechaVencimiento ?? "2099-01-15",
    moras: c.moras ?? [],
    pagos: c.pagos ?? [],
    diferencias: [],
  }
}

describe("/api/cobros-fi/mi-estado-cuenta — la deuda propia y solo la propia", () => {
  const cookies = new Map<string, string>()

  async function como<T>(email: string, fn: () => Promise<T>): Promise<T> {
    const cookie = cookies.get(email)
    if (!cookie) throw new Error(`sin cookie de sesión para ${email}`)
    state.cookie = cookie
    try {
      return await fn()
    } finally {
      state.cookie = ""
    }
  }

  async function getEstadoCuenta(
    query = ""
  ): Promise<{ status: number; json: RespuestaEstadoCuenta & { error?: string } }> {
    const { GET } = await import("@/app/api/cobros-fi/mi-estado-cuenta/route")
    const res = await GET(
      new NextRequest(`http://localhost/api/cobros-fi/mi-estado-cuenta${query}`)
    )
    return {
      status: res.status,
      json: (await res.json().catch(() => ({}))) as RespuestaEstadoCuenta & {
        error?: string
      },
    }
  }

  async function limpiar(): Promise<void> {
    const comunidades = [COM_A, COM_B]
    await prisma.avisoCobro.deleteMany({ where: { comunidadId: { in: comunidades } } })
    await prisma.cobroFI.deleteMany({ where: { comunidadId: { in: comunidades } } })
    await prisma.vinculoUnidad.deleteMany({ where: { comunidadId: { in: comunidades } } })
    await prisma.persona.deleteMany({ where: { comunidadId: { in: comunidades } } })
    await prisma.fondoFI.deleteMany({ where: { comunidadId: { in: comunidades } } })
    await prisma.unidad.deleteMany({ where: { comunidadId: { in: comunidades } } })
  }

  beforeAll(async () => {
    process.env.AUTH_SECRET = AUTH_SECRET
    process.env.NEXT_PUBLIC_APP_ENV = "development"
    vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 })

    for (const c of [
      { id: COM_A, nombre: "Comunidad Estado de Cuenta A", slug: "mec-com-a" },
      { id: COM_B, nombre: "Comunidad Estado de Cuenta B", slug: "mec-com-b" },
    ]) {
      await prisma.comunidad.upsert({ where: { id: c.id }, update: {}, create: c })
    }

    for (const u of [
      { id: "mec-user-residente", email: EMAIL_RESIDENTE, personaId: P_RES },
      { id: "mec-user-sin-vinculo", email: EMAIL_SIN_VINCULO, personaId: P_SIN },
      // El administrador no tiene ficha en el Maestro de Personas: no hay «lo
      // propio» que resolver, y eso NO le abre la deuda de la comunidad.
      { id: "mec-user-admin", email: EMAIL_ADMIN, personaId: undefined },
      { id: "mec-user-comite", email: EMAIL_COMITE, personaId: undefined },
      { id: "mec-user-sin-membresia", email: EMAIL_SIN_MEMBRESIA, personaId: undefined },
    ]) {
      await prisma.usuario.upsert({
        where: { email: u.email },
        update: { activo: true, personaId: u.personaId },
        create: { id: u.id, email: u.email, personaId: u.personaId, activo: true },
      })
    }

    const membresias = [
      { usuarioId: "mec-user-residente", comunidadId: COM_A, rol: "residente" },
      { usuarioId: "mec-user-sin-vinculo", comunidadId: COM_A, rol: "residente" },
      { usuarioId: "mec-user-admin", comunidadId: COM_A, rol: "administrador" },
      { usuarioId: "mec-user-comite", comunidadId: COM_A, rol: "comite" },
    ]
    await prisma.membresia.deleteMany({
      where: {
        usuarioId: {
          in: [
            ...membresias.map((m) => m.usuarioId),
            "mec-user-sin-membresia",
          ],
        },
      },
    })
    for (const m of membresias) await prisma.membresia.create({ data: m })

    await limpiar()

    for (const f of [
      { id: FONDO_A, comunidadId: COM_A, nombre: "Fondo Estado de Cuenta A" },
      { id: FONDO_B, comunidadId: COM_B, nombre: "Fondo Estado de Cuenta B" },
    ]) {
      await prisma.fondoFI.create({
        data: { ...f, tipo: "gasto_comun", activo: true, saldoInicial: 0 },
      })
    }

    for (const p of [
      { id: P_RES, comunidadId: COM_A, nombre: "Rosa Residente" },
      { id: P_VECINO, comunidadId: COM_A, nombre: "Víctor Vecino" },
      { id: P_SIN, comunidadId: COM_A, nombre: "Sofía Sin Vínculo" },
      { id: P_AJENA, comunidadId: COM_B, nombre: "Ana Ajena" },
    ]) {
      await prisma.persona.create({
        data: {
          id: p.id,
          comunidadId: p.comunidadId,
          rut: `mec-${p.id}`,
          nombreCompleto: p.nombre,
          nombres: p.nombre.split(" ")[0] as string,
          apellidos: p.nombre.split(" ")[1] as string,
          email: `${p.id}@test.cl`,
          telefonoMovil: "+56911110000",
          estadoCuenta: "activa",
          condicionesEspecialesIds: [],
          roles: ["propietario"],
        },
      })
    }

    for (const u of [
      { id: U1, comunidadId: COM_A, numero: "101", etiqueta: "Depto A" },
      { id: U2, comunidadId: COM_A, numero: "102", etiqueta: "Depto A" },
      { id: U3, comunidadId: COM_A, numero: "103", etiqueta: "Depto A" },
      { id: U_B, comunidadId: COM_B, numero: "B-101", etiqueta: "Depto B" },
    ]) {
      await prisma.unidad.create({
        data: {
          ...u,
          microSectorId: "mec-ms",
          tipoUnidadId: "mec-tu",
          metraje: 60,
          prorrateo: 1,
          rolSii: `mec-rol-${u.id}`,
          estadoId: "mec-est",
          servicios: {},
        },
      })
    }

    // El residente es dueño VIGENTE de U1 y tuvo U2 hasta 2025: solo U1 es suyo.
    await prisma.vinculoUnidad.create({
      data: {
        id: "mec-v-1",
        comunidadId: COM_A,
        personaId: P_RES,
        unidadId: U1,
        rol: "propietario",
        fechaInicio: "2025-01-01",
        fechaFin: null,
        permiteVerFinanzas: true,
      },
    })
    await prisma.vinculoUnidad.create({
      data: {
        id: "mec-v-2",
        comunidadId: COM_A,
        personaId: P_RES,
        unidadId: U2,
        rol: "propietario",
        fechaInicio: "2020-01-01",
        fechaFin: "2025-12-31",
        permiteVerFinanzas: true,
      },
    })
    await prisma.vinculoUnidad.create({
      data: {
        id: "mec-v-3",
        comunidadId: COM_A,
        personaId: P_VECINO,
        unidadId: U3,
        rol: "propietario",
        fechaInicio: "2025-01-01",
        fechaFin: null,
        permiteVerFinanzas: true,
      },
    })

    // Cobros: dos de SU unidad (uno con pago parcial y mora), uno de la unidad
    // cerrada, uno del vecino, uno de la comunidad B y uno de B que apunta a SU
    // unidad —el caso que solo el `comunidadId` del scope puede dejar afuera—.
    await prisma.cobroFI.create({
      data: cobroSemilla({
        id: COBRO_U1_SEP,
        unidadId: U1,
        periodo: "2026-09",
        montoBase: 100_000,
      }),
    })
    await prisma.cobroFI.create({
      data: cobroSemilla({
        id: COBRO_U1_AGO,
        unidadId: U1,
        periodo: "2026-08",
        montoBase: 80_000,
        pagos: [pago("mec-pago-1", 30_000)],
        moras: [mora("mec-mora-1", 5_000)],
      }),
    })
    await prisma.cobroFI.create({
      data: cobroSemilla({
        id: COBRO_U2_SEP,
        unidadId: U2,
        periodo: "2026-09",
        montoBase: 90_000,
      }),
    })
    await prisma.cobroFI.create({
      data: cobroSemilla({
        id: COBRO_U3_SEP,
        unidadId: U3,
        periodo: "2026-09",
        montoBase: 70_000,
      }),
    })
    await prisma.cobroFI.create({
      data: cobroSemilla({
        id: COBRO_B,
        comunidadId: COM_B,
        unidadId: U_B,
        periodo: "2026-09",
        montoBase: 60_000,
      }),
    })
    await prisma.cobroFI.create({
      data: cobroSemilla({
        id: COBRO_B_U1,
        comunidadId: COM_B,
        unidadId: U1,
        periodo: "2026-09",
        montoBase: 50_000,
      }),
    })

    // El papel del período: la fila enlaza SU aviso por período.
    await prisma.avisoCobro.create({
      data: {
        id: AVISO_U1_SEP,
        comunidadId: COM_A,
        unidadId: U1,
        periodo: "2026-09",
        folio: "AC-0001",
        codigoVerificacion: "VC-MEC0001",
        fechaEmision: "2026-09-05",
        vencimiento: "2099-09-15",
        contenido: {},
        totalesComunidad: {},
      },
    })

    for (const usuario of [
      { email: EMAIL_RESIDENTE },
      { email: EMAIL_SIN_VINCULO },
      { email: EMAIL_ADMIN },
      { email: EMAIL_COMITE },
      { email: EMAIL_SIN_MEMBRESIA },
    ]) {
      cookies.set(usuario.email, await cookieDeUsuario(usuario.email))
    }
  }, 60_000)

  afterAll(async () => {
    state.cookie = ""
    delete process.env.NEXT_PUBLIC_APP_ENV
    await limpiar()
    await prisma.membresia.deleteMany({
      where: { usuarioId: { startsWith: "mec-user-" } },
    })
    await prisma.usuario.deleteMany({ where: { email: { startsWith: "mec-" } } })
    await prisma.comunidad.deleteMany({ where: { id: { in: [COM_A, COM_B] } } })
  })

  it("devuelve los cobros de las unidades vigentes, con su saldo y su aviso", async () => {
    const { status, json } = await como(EMAIL_RESIDENTE, () => getEstadoCuenta())

    expect(status).toBe(200)
    // Orden: período descendente (el más reciente primero).
    expect(json.data.map((f) => f.periodo)).toEqual(["2026-09", "2026-08"])
    expect(json.data.map((f) => f.unidadId)).toEqual([U1, U1])
    expect(json.saldoTotal).toBe(155_000)

    const [sep, ago] = json.data as [FilaEstadoCuenta, FilaEstadoCuenta]
    expect(sep).toMatchObject({
      id: COBRO_U1_SEP,
      unidadNumero: "101",
      unidadEtiqueta: "Depto A",
      concepto: "gasto_comun",
      montoCargo: 100_000,
      pagado: 0,
      moras: 0,
      // saldoPendiente = cargo + moras − pagos (`lib/finanzas-utils.ts`).
      saldoPendiente: 100_000,
      estado: "pendiente",
      avisoId: AVISO_U1_SEP,
    })
    expect(ago).toMatchObject({
      id: COBRO_U1_AGO,
      montoCargo: 80_000,
      pagado: 30_000,
      moras: 5_000,
      saldoPendiente: 55_000,
      estado: "parcial",
      // Sin aviso emitido del período: `null`, no un id inventado.
      avisoId: null,
    })
  })

  it("la unidad ajena y la de vínculo cerrado no aparecen", async () => {
    const { status, json } = await como(EMAIL_RESIDENTE, () => getEstadoCuenta())

    expect(status).toBe(200)
    const ids = json.data.map((f) => f.id)
    expect(ids).not.toContain(COBRO_U2_SEP)
    expect(ids).not.toContain(COBRO_U3_SEP)
  })

  it("el cobro de otra comunidad no aparece, ni apuntando a una unidad propia", async () => {
    const { status, json } = await como(EMAIL_RESIDENTE, () => getEstadoCuenta())

    expect(status).toBe(200)
    const ids = json.data.map((f) => f.id)
    expect(ids).not.toContain(COBRO_B)
    // La fila de B apunta a U1: solo el `comunidadId` del scope la deja afuera.
    expect(ids).not.toContain(COBRO_B_U1)
  })

  it("un id de unidad en el query no amplía el alcance", async () => {
    // El cliente no elige de quién es la deuda: `?unidadId=` no es un parámetro
    // de esta ruta y pedirlo no cambia nada.
    const { status, json } = await como(EMAIL_RESIDENTE, () =>
      getEstadoCuenta(`?unidadId=${U2}`)
    )

    expect(status).toBe(200)
    expect(json.data.map((f) => f.id)).toEqual([COBRO_U1_SEP, COBRO_U1_AGO])
  })

  it("sin vínculo vigente responde 200 con lista vacía, no 403", async () => {
    const { status, json } = await como(EMAIL_SIN_VINCULO, () => getEstadoCuenta())

    expect(status).toBe(200)
    expect(json).toEqual({ data: [], saldoTotal: 0 })
  })

  it("sin sesión responde 401", async () => {
    state.cookie = ""
    const { status, json } = await getEstadoCuenta()

    expect(status).toBe(401)
    expect(json.error).toBe("No autenticado.")
  })

  it("un usuario sin membresía de comunidad responde 403", async () => {
    const { status, json } = await como(EMAIL_SIN_MEMBRESIA, () => getEstadoCuenta())

    expect(status).toBe(403)
    expect(json.error).toBe("Sin comunidad asignada.")
  })

  it("el comité no entra: la compuerta es la clave del residente", async () => {
    const { status, json } = await como(EMAIL_COMITE, () => getEstadoCuenta())

    expect(status).toBe(403)
    expect(json.error).toBe("Permiso denegado.")
  })

  it("el administrador sin persona ve SU estado de cuenta vacío, no la deuda de la comunidad", async () => {
    const { status, json } = await como(EMAIL_ADMIN, () => getEstadoCuenta())

    expect(status).toBe(200)
    expect(json).toEqual({ data: [], saldoTotal: 0 })
  })

  it("no expone ids de personas", async () => {
    const { json } = await como(EMAIL_RESIDENTE, () => getEstadoCuenta())
    const serializado = JSON.stringify(json)

    for (const personaId of [P_RES, P_VECINO, P_SIN, P_AJENA]) {
      expect(serializado).not.toContain(personaId)
    }
  })
})
