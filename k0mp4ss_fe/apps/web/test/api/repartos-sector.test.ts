/**
 * @vitest-environment node
 *
 * F32 — gasto por sector repartido en proporción al avalúo fiscal.
 *
 * El reglamento de la comunidad manda que el gasto de un bien o servicio que sirve
 * a UN solo sector se cargue sólo a ese sector, en proporción al avalúo fiscal de
 * sus unidades. Lo que se fija acá, todo observable por la API y por la base:
 *
 *   1. sin sesión no se emite ni se lee nada (401) y un rol sin `fi:gasto_comun`
 *      crear no emite (403, cero filas);
 *   2. un sector que no es de la comunidad de la sesión no existe para esta ruta
 *      (400 y cero filas);
 *   3. un sector sin NINGUNA unidad con avalúo declarado no se reparte: 400 con su
 *      motivo y cero filas — no se reparte en partes iguales para compensar;
 *   4. con dos avalúos desiguales las cuotas son proporcionales y su suma es
 *      EXACTAMENTE el monto total (en centavos enteros);
 *   5. la unidad sin avalúo no aparece en las cuotas: no se le asigna 0;
 *   6. cuando el reparto deja un centavo suelto, lo absorbe la unidad de MAYOR
 *      avalúo, y la suma sigue cerrando exacta;
 *   7. el reparto se persiste como documento emitido —monto total, avalúo total y
 *      cuotas con el avalúo congelado— con la auditoría `FI_REPARTO_SECTOR_EMITIDO`;
 *   8. la lectura devuelve los repartos de la comunidad de la sesión con sus
 *      cuotas, y NUNCA los de otra comunidad;
 *   9. **el reparto es DEUDA, no sólo documento (S7)**: cada unidad incluida queda
 *      con su `CobroFI` del período, por el monto de su cuota, imputado al fondo de
 *      gasto común ACTIVO de la comunidad y con `origenRef` al reparto; la suma de
 *      las deudas es el monto total del reparto, al centavo;
 *  10. la unidad EXCLUIDA por falta de avalúo no recibe deuda de ese reparto: la
 *      lista de excluidas no es un adorno, es a quién NO se le cobra;
 *  11. sin un fondo de gasto común activo la emisión es 400 con su motivo literal y
 *      no queda ni el reparto, ni sus cuotas, ni las deudas, ni la auditoría;
 *  12. si la escritura de las deudas falla dentro de la transacción no sobrevive
 *      NADA del reparto: o el documento con todas sus deudas, o nada;
 *  13. emitir dos veces el mismo reparto no cobra dos veces (409 y cero deuda
 *      nueva), y otro CONCEPTO del mismo sector y período sí se emite.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest"
import { NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"
import { generarId } from "@/lib/id-utils"

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

const COM_A = "rf-com-a"
const COM_B = "rf-com-b"

/** Sector con dos avalúos desiguales y una unidad sin avalúo declarado. */
const SECTOR_A1 = "rf-ms-a1"
/** Sector con avalúos que dejan residuo de redondeo (2/3 y 1/3). */
const SECTOR_A2 = "rf-ms-a2"
/** Sector con una unidad con avalúo y otra en CERO: la lista de excluidas se congela. */
const SECTOR_A3 = "rf-ms-a3"
/** Sector donde NINGUNA unidad declaró avalúo (null y 0). */
const SECTOR_SIN_AVALUO = "rf-ms-sin"
/** Sector sin unidades: no hay entre quiénes repartir. */
const SECTOR_VACIO = "rf-ms-vacio"
/** Sector de la OTRA comunidad. */
const SECTOR_B = "rf-ms-b"

const UNIDAD_A1_101 = "rf-u-a1-101"
const UNIDAD_A1_102 = "rf-u-a1-102"
const UNIDAD_A1_SIN = "rf-u-a1-sin"
const UNIDAD_A2_201 = "rf-u-a2-201"
const UNIDAD_A2_202 = "rf-u-a2-202"
const UNIDAD_A3_401 = "rf-u-a3-401"
const UNIDAD_A3_402 = "rf-u-a3-402"
/** Alta DESPUÉS de emitir el reparto: no existía cuando se congeló la exclusión. */
const UNIDAD_A3_403 = "rf-u-a3-403"
const UNIDAD_SIN_AVALUO_1 = "rf-u-sin-1"
const UNIDAD_SIN_AVALUO_2 = "rf-u-sin-2"
const UNIDAD_B = "rf-u-b-1"

/** Reparto ya emitido de la otra comunidad: esta lectura no puede verlo. */
const REPARTO_B = "rf-reparto-b"

const EMAIL_ADMIN = "rf-admin@test.cl"
const EMAIL_COMITE = "rf-comite@test.cl"
const EMAIL_RESIDENTE = "rf-residente@test.cl"

const USUARIO_ADMIN = "rf-usuario-admin"

/** Fondo de gasto común ACTIVO de la comunidad A: donde se imputa la deuda. */
const FONDO_GC = "rf-fondo-gc"
/** Fondo de RESERVA activo: está activo, pero no es de gasto común y no se usa. */
const FONDO_RESERVA = "rf-fondo-reserva"

/** Mensajes literales de las dos compuertas nuevas (S7). */
const MENSAJE_SIN_FONDO =
  "No se puede emitir el reparto: la comunidad no tiene un fondo de gasto común activo donde imputar las cuotas."
const MENSAJE_YA_EMITIDO =
  "Ya se emitió un reparto de este gasto en este sector para el período: emitirlo otra vez cobraría dos veces la misma cuota."

/** Unidad creada por el alta existente (`POST /api/unidades`) en el caso PRESERVE. */
const UNIDAD_NUEVA = "rf-u-a1-104"
const TIPO_UNIDAD = "rf-tu-1"
const ESTADO_OCUPACION = "habitada"

/** Forma de la cuota en la respuesta de las rutas. */
interface CuotaVista {
  id: string
  unidadId: string
  unidadNumero: string | null
  avaluoUsado: number
  monto: number
  /** `CobroFI` que esta cuota produjo; `null` si la cuota quedó en cero. */
  cobroId: string | null
}

/** Una unidad que quedó FUERA del reparto por no tener avalúo fiscal declarado. */
interface UnidadExcluidaVista {
  unidadId: string
  unidadNumero: string
}

/** Forma del reparto en el alta y en la lectura. */
interface RepartoVista {
  id: string
  microSectorId: string
  microSectorNombre: string | null
  periodo: string
  concepto: string
  montoTotal: number
  avaluoTotal: number
  estado: string
  creadoPor: string
  createdAt: string
  cuotas: CuotaVista[]
  unidadesExcluidas: UnidadExcluidaVista[]
}

interface ListadoRepartos {
  data: RepartoVista[]
  total: number
  mostrados: number
}

/** Centavos enteros: el dinero se compara sin floats sueltos. */
const centavos = (monto: number): number => Math.round(monto * 100)

/** Suma de las cuotas en centavos enteros. */
const sumaEnCentavos = (cuotas: readonly { monto: number }[]): number =>
  cuotas.reduce((total, cuota) => total + centavos(cuota.monto), 0)

describe("/api/repartos-sector — gasto por sector con avalúo fiscal (F32)", () => {
  const cargaModulos = async () => ({
    coleccion: await import("@/app/api/repartos-sector/route"),
  })

  beforeAll(async () => {
    process.env.AUTH_SECRET = AUTH_SECRET

    for (const c of [
      { id: COM_A, nombre: "Comunidad Repartos A", slug: "rf-com-a" },
      { id: COM_B, nombre: "Comunidad Repartos B", slug: "rf-com-b" },
    ]) {
      await prisma.comunidad.upsert({ where: { id: c.id }, update: {}, create: c })
    }

    for (const sector of [
      { id: SECTOR_A1, comunidadId: COM_A, macroSectorId: "rf-macro-a", nombre: "Torre A", etiqueta: "Edificio" },
      { id: SECTOR_A2, comunidadId: COM_A, macroSectorId: "rf-macro-a", nombre: "Torre B", etiqueta: "Edificio" },
      { id: SECTOR_A3, comunidadId: COM_A, macroSectorId: "rf-macro-a", nombre: "Torre E", etiqueta: "Edificio" },
      { id: SECTOR_SIN_AVALUO, comunidadId: COM_A, macroSectorId: "rf-macro-a", nombre: "Torre C", etiqueta: "Edificio" },
      { id: SECTOR_VACIO, comunidadId: COM_A, macroSectorId: "rf-macro-a", nombre: "Torre D", etiqueta: "Edificio" },
      { id: SECTOR_B, comunidadId: COM_B, macroSectorId: "rf-macro-b", nombre: "Torre Ajena", etiqueta: "Edificio" },
    ]) {
      await prisma.microSector.upsert({
        where: { id: sector.id },
        update: {},
        create: sector,
      })
    }

    // Los avalúos son HECHOS de la unidad: se escriben en la base, porque el cuerpo
    // de la petición no los declara (mandarlos sería moverle la carga al vecino).
    for (const unidad of [
      { id: UNIDAD_A1_101, microSectorId: SECTOR_A1, numero: "101", avaluoFiscal: 60_000_000 },
      { id: UNIDAD_A1_102, microSectorId: SECTOR_A1, numero: "102", avaluoFiscal: 40_000_000 },
      { id: UNIDAD_A1_SIN, microSectorId: SECTOR_A1, numero: "103", avaluoFiscal: null },
      { id: UNIDAD_A2_201, microSectorId: SECTOR_A2, numero: "201", avaluoFiscal: 48_000_000 },
      { id: UNIDAD_A2_202, microSectorId: SECTOR_A2, numero: "202", avaluoFiscal: 24_000_000 },
      // La 402 declara avalúo CERO: tampoco entra al reparto, y queda registrada.
      { id: UNIDAD_A3_401, microSectorId: SECTOR_A3, numero: "401", avaluoFiscal: 30_000_000 },
      { id: UNIDAD_A3_402, microSectorId: SECTOR_A3, numero: "402", avaluoFiscal: 0 },
      { id: UNIDAD_SIN_AVALUO_1, microSectorId: SECTOR_SIN_AVALUO, numero: "301", avaluoFiscal: null },
      { id: UNIDAD_SIN_AVALUO_2, microSectorId: SECTOR_SIN_AVALUO, numero: "302", avaluoFiscal: 0 },
    ]) {
      await prisma.unidad.upsert({
        where: { id: unidad.id },
        update: { avaluoFiscal: unidad.avaluoFiscal },
        create: {
          id: unidad.id,
          comunidadId: COM_A,
          microSectorId: unidad.microSectorId,
          numero: unidad.numero,
          etiqueta: "Depto",
          tipoUnidadId: "rf-tu-1",
          metraje: 50,
          prorrateo: 10,
          rolSii: `rf-rol-${unidad.numero}`,
          estadoId: "habitada",
          servicios: {},
          avaluoFiscal: unidad.avaluoFiscal,
        },
      })
    }

    await prisma.unidad.upsert({
      where: { id: UNIDAD_B },
      update: {},
      create: {
        id: UNIDAD_B,
        comunidadId: COM_B,
        microSectorId: SECTOR_B,
        numero: "901",
        etiqueta: "Depto",
        tipoUnidadId: "rf-tu-1",
        metraje: 50,
        prorrateo: 10,
        rolSii: "rf-rol-b",
        estadoId: "habitada",
        servicios: {},
        avaluoFiscal: 50_000_000,
      },
    })

    // El maestro mínimo que exige el alta existente de unidades: el caso PRESERVE
    // crea una unidad por esa ruta, que comparte el modelo `Unidad` con la columna
    // aditiva `avaluoFiscal`.
    await prisma.tipoUnidad.upsert({
      where: { id: TIPO_UNIDAD },
      update: {},
      create: {
        id: TIPO_UNIDAD,
        comunidadId: COM_A,
        nombre: "Depto estándar RF",
        categoria: "Departamento",
        metraje: 50,
        montoBaseGc: 80_000,
        activo: true,
        historialTarifas: [],
      },
    })
    await prisma.estadoOcupacion.upsert({
      where: { id: ESTADO_OCUPACION },
      update: {},
      create: {
        id: ESTADO_OCUPACION,
        comunidadId: COM_A,
        nombre: "Habitada",
        color: "verde",
      },
    })

    // El fondo de imputación de la deuda (S7). Van DOS: el de gasto común activo y
    // uno de reserva que también está activo, para probar que la ruta elige por
    // TIPO y no por el primero que encuentra.
    for (const fondo of [
      { id: FONDO_GC, nombre: "Fondo de gasto común RF", tipo: "gasto_comun" },
      { id: FONDO_RESERVA, nombre: "Fondo de reserva RF", tipo: "reserva" },
    ]) {
      await prisma.fondoFI.upsert({
        where: { id: fondo.id },
        update: { activo: true },
        create: {
          id: fondo.id,
          comunidadId: COM_A,
          nombre: fondo.nombre,
          tipo: fondo.tipo,
          activo: true,
        },
      })
    }

    // Reparto ya emitido de la comunidad B, escrito directo en la base: ningún
    // scope de la sesión (que es de A) puede leerlo por la API.
    await prisma.cuotaRepartoSector.deleteMany({ where: { repartoSectorId: REPARTO_B } })
    await prisma.repartoSector.deleteMany({ where: { id: REPARTO_B } })
    await prisma.repartoSector.create({
      data: {
        id: REPARTO_B,
        comunidadId: COM_B,
        microSectorId: SECTOR_B,
        periodo: "2026-03",
        concepto: "Gasto del sector de la otra comunidad",
        montoTotal: 700_000,
        avaluoTotal: 50_000_000,
        estado: "emitido",
        creadoPor: "rf-usuario-ajeno",
        cuotas: {
          create: [
            {
              id: "rf-cuota-b-1",
              comunidadId: COM_B,
              unidadId: UNIDAD_B,
              avaluoUsado: 50_000_000,
              monto: 700_000,
            },
          ],
        },
      },
    })

    const usuarios = [
      { id: USUARIO_ADMIN, email: EMAIL_ADMIN, comunidadId: COM_A, rol: "administrador" },
      { id: "rf-usuario-comite", email: EMAIL_COMITE, comunidadId: COM_A, rol: "comite" },
      { id: "rf-usuario-residente", email: EMAIL_RESIDENTE, comunidadId: COM_A, rol: "residente" },
    ]
    for (const u of usuarios) {
      await prisma.usuario.upsert({
        where: { email: u.email },
        update: {},
        create: { id: u.id, email: u.email, activo: true, personaId: null },
      })
    }
    await prisma.membresia.deleteMany({
      where: { usuarioId: { in: usuarios.map((u) => u.id) } },
    })
    for (const u of usuarios) {
      await prisma.membresia.create({
        data: { usuarioId: u.id, comunidadId: u.comunidadId, rol: u.rol },
      })
    }
  }, 30_000)

  afterAll(async () => {
    try {
      state.cookie = ""
      await prisma.cobroFI.deleteMany({
        where: { comunidadId: { in: [COM_A, COM_B] } },
      })
      await prisma.cuotaRepartoSector.deleteMany({
        where: { comunidadId: { in: [COM_A, COM_B] } },
      })
      await prisma.repartoSector.deleteMany({
        where: { comunidadId: { in: [COM_A, COM_B] } },
      })
      await prisma.unidad.deleteMany({
        where: { comunidadId: { in: [COM_A, COM_B] } },
      })
      await prisma.microSector.deleteMany({
        where: { comunidadId: { in: [COM_A, COM_B] } },
      })
      await prisma.tipoUnidad.deleteMany({
        where: { comunidadId: { in: [COM_A, COM_B] } },
      })
      await prisma.estadoOcupacion.deleteMany({
        where: { comunidadId: { in: [COM_A, COM_B] } },
      })
      await prisma.fondoFI.deleteMany({
        where: { comunidadId: { in: [COM_A, COM_B] } },
      })
      await prisma.membresia.deleteMany({
        where: { comunidadId: { in: [COM_A, COM_B] } },
      })
      await prisma.usuario.deleteMany({
        where: { email: { in: [EMAIL_ADMIN, EMAIL_COMITE, EMAIL_RESIDENTE] } },
      })
      for (const id of [COM_A, COM_B]) {
        await prisma.comunidad.delete({ where: { id } }).catch(() => {})
      }
    } catch {
      // intencional: limpieza best-effort, la base de la suite es descartable
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

  async function POST_REPARTO(body: unknown): Promise<Response> {
    const { coleccion } = await cargaModulos()
    return coleccion.POST(
      new NextRequest("http://localhost/api/repartos-sector", {
        method: "POST",
        body: JSON.stringify(body),
        headers: { "content-type": "application/json" },
      })
    )
  }

  async function GET_REPARTOS(
    url = "http://localhost/api/repartos-sector"
  ): Promise<Response> {
    const { coleccion } = await cargaModulos()
    return coleccion.GET(new NextRequest(url, { method: "GET" }))
  }

  const alta = (extra: Record<string, unknown> = {}) => ({
    microSectorId: SECTOR_A1,
    periodo: "2026-03",
    concepto: "Ascensor de la Torre A",
    montoTotal: 1_000_000,
    ...extra,
  })

  /** Emisión por la API con la sesión de la administración. */
  async function emitirReparto(body: Record<string, unknown>): Promise<RepartoVista> {
    let creado: RepartoVista | null = null
    await conSesion(EMAIL_ADMIN, async () => {
      const res = await POST_REPARTO(body)
      expect(res.status).toBe(201)
      creado = (await res.json()) as RepartoVista
    })
    if (!creado) throw new Error("no se pudo emitir el reparto de prueba")
    return creado
  }

  /** Filas del sector en la base: un rechazo no gana nada. */
  async function filasDelSector(microSectorId: string) {
    const repartos = await prisma.repartoSector.findMany({
      where: { comunidadId: COM_A, microSectorId },
      select: { id: true },
    })
    return {
      repartos: repartos.length,
      cuotas: await prisma.cuotaRepartoSector.count({
        where: { repartoSectorId: { in: repartos.map((r) => r.id) } },
      }),
    }
  }

  /**
   * Las CUATRO tablas que una emisión toca, contadas de una vez. Un rechazo no deja
   * ninguna fila de ninguna: la comparación es del retrato completo, no de la tabla
   * que a uno se le ocurre mirar.
   */
  async function conteosDeComunidad() {
    return {
      repartos: await prisma.repartoSector.count({ where: { comunidadId: COM_A } }),
      cuotas: await prisma.cuotaRepartoSector.count({ where: { comunidadId: COM_A } }),
      cobros: await prisma.cobroFI.count({ where: { comunidadId: COM_A } }),
      eventos: await prisma.eventoAuditoria.count({ where: { comunidadId: COM_A } }),
    }
  }

  /** Los `CobroFI` que el reparto produjo: la deuda, leída por su `origenRef`. */
  async function cobrosDelReparto(repartoId: string) {
    return prisma.cobroFI.findMany({
      where: { comunidadId: COM_A, origenRef: repartoId },
      orderBy: { unidadId: "asc" },
    })
  }

  it("401 sin sesión en las dos rutas", async () => {
    state.cookie = ""
    expect((await POST_REPARTO(alta())).status).toBe(401)
    expect((await GET_REPARTOS()).status).toBe(401)
  })

  it("un rol sin `fi:gasto_comun` crear no emite ni lee → 403 y cero filas", async () => {
    await conSesion(EMAIL_RESIDENTE, async () => {
      expect((await POST_REPARTO(alta())).status).toBe(403)
      expect((await GET_REPARTOS()).status).toBe(403)
    })
    expect(await filasDelSector(SECTOR_A1)).toEqual({ repartos: 0, cuotas: 0 })
  })

  it("el comité no emite (sólo audita): 403 sin dejar filas, y su lectura es 200", async () => {
    await conSesion(EMAIL_COMITE, async () => {
      expect((await POST_REPARTO(alta())).status).toBe(403)
      expect((await GET_REPARTOS()).status).toBe(200)
    })
    expect(await filasDelSector(SECTOR_A1)).toEqual({ repartos: 0, cuotas: 0 })
  })

  it("un sector de otra comunidad no existe para esta ruta: 400 y cero filas", async () => {
    await conSesion(EMAIL_ADMIN, async () => {
      const ajeno = await POST_REPARTO(alta({ microSectorId: SECTOR_B }))
      expect(ajeno.status).toBe(400)
      expect(((await ajeno.json()) as { error: string }).error).toBe(
        "No se puede emitir el reparto: el sector no existe en esta comunidad."
      )

      const fantasma = await POST_REPARTO(alta({ microSectorId: "rf-ms-fantasma" }))
      expect(fantasma.status).toBe(400)
    })
    expect(await filasDelSector(SECTOR_B)).toEqual({ repartos: 0, cuotas: 0 })
  })

  it("sin ningún avalúo declarado no se reparte: 400 con su motivo y cero filas", async () => {
    await conSesion(EMAIL_ADMIN, async () => {
      const sinAvaluo = await POST_REPARTO(
        alta({ microSectorId: SECTOR_SIN_AVALUO })
      )
      expect(sinAvaluo.status).toBe(400)
      expect(((await sinAvaluo.json()) as { error: string }).error).toBe(
        "No se puede emitir el reparto: el sector no tiene unidades con avalúo fiscal declarado, y sin avalúo no se reparte entre las unidades del sector."
      )

      // Un sector sin unidades no tiene entre quiénes repartir.
      const vacio = await POST_REPARTO(alta({ microSectorId: SECTOR_VACIO }))
      expect(vacio.status).toBe(400)
    })
    expect(await filasDelSector(SECTOR_SIN_AVALUO)).toEqual({ repartos: 0, cuotas: 0 })
    expect(await filasDelSector(SECTOR_VACIO)).toEqual({ repartos: 0, cuotas: 0 })
  })

  it("un monto total que no llega a un centavo no es un gasto repartible: 400 y cero filas", async () => {
    await conSesion(EMAIL_ADMIN, async () => {
      for (const montoTotal of [0, -1000, 0.001]) {
        const res = await POST_REPARTO(alta({ montoTotal }))
        expect(res.status).toBe(400)
        expect(((await res.json()) as { error: string }).error).toBe("Datos inválidos.")
      }
    })
    expect(await filasDelSector(SECTOR_A1)).toEqual({ repartos: 0, cuotas: 0 })
  })

  it("dos avalúos desiguales: cuotas proporcionales, suma exacta y la unidad sin avalúo fuera", async () => {
    const reparto = await emitirReparto(alta())

    expect(reparto.microSectorId).toBe(SECTOR_A1)
    expect(reparto.microSectorNombre).toBe("Torre A")
    expect(reparto.periodo).toBe("2026-03")
    expect(reparto.concepto).toBe("Ascensor de la Torre A")
    expect(reparto.montoTotal).toBe(1_000_000)
    expect(reparto.avaluoTotal).toBe(100_000_000) // 60M + 40M: la unidad sin avalúo no suma
    expect(reparto.estado).toBe("emitido")
    expect(reparto.creadoPor).toBe(USUARIO_ADMIN)

    // 60/100 y 40/100 del monto: proporcional al avalúo.
    expect(reparto.cuotas).toEqual([
      {
        id: expect.any(String),
        unidadId: UNIDAD_A1_101,
        unidadNumero: "101",
        avaluoUsado: 60_000_000,
        monto: 600_000,
        cobroId: expect.any(String),
      },
      {
        id: expect.any(String),
        unidadId: UNIDAD_A1_102,
        unidadNumero: "102",
        avaluoUsado: 40_000_000,
        monto: 400_000,
        cobroId: expect.any(String),
      },
    ])
    // La unidad 103 NO tiene avalúo: no aparece en las cuotas (ni con $0).
    expect(reparto.cuotas.some((cuota) => cuota.unidadId === UNIDAD_A1_SIN)).toBe(false)
    // Y la unidad sin avalúo SÍ queda registrada como excluida: es el dato que
    // permite detectar el avalúo que nadie cargó.
    expect(reparto.unidadesExcluidas).toEqual([
      { unidadId: UNIDAD_A1_SIN, unidadNumero: "103" },
    ])
    // La suma de las cuotas es EXACTAMENTE el monto total, en centavos enteros.
    expect(sumaEnCentavos(reparto.cuotas)).toBe(centavos(1_000_000))

    // Persistido como documento emitido: monto total, avalúo total y cuotas
    // congeladas con el avalúo que se usó.
    const fila = await prisma.repartoSector.findUnique({
      where: { id: reparto.id },
      include: { cuotas: { orderBy: { monto: "desc" } } },
    })
    expect(fila).not.toBeNull()
    expect(fila?.comunidadId).toBe(COM_A)
    expect(fila?.montoTotal).toBe(1_000_000)
    expect(fila?.avaluoTotal).toBe(100_000_000)
    expect(fila?.cuotas.map((cuota) => cuota.avaluoUsado)).toEqual([
      60_000_000, 40_000_000,
    ])
    // La exclusión vive en la FILA del reparto, no se deduce de las cuotas.
    expect(fila?.unidadesExcluidas).toEqual([
      { unidadId: UNIDAD_A1_SIN, unidadNumero: "103" },
    ])

    // Auditoría en la misma transacción.
    const evento = await prisma.eventoAuditoria.findFirst({
      where: {
        comunidadId: COM_A,
        tipoAccion: "FI_REPARTO_SECTOR_EMITIDO",
        referenciaId: reparto.id,
      },
    })
    expect(evento).not.toBeNull()
    expect(evento?.categoria).toBe("FI")
    expect(evento?.usuario).toBe(USUARIO_ADMIN)

    // La lectura devuelve el reparto con sus cuotas.
    await conSesion(EMAIL_ADMIN, async () => {
      const res = await GET_REPARTOS()
      expect(res.status).toBe(200)
      const listado = (await res.json()) as ListadoRepartos
      const encontrado = listado.data.find((fila) => fila.id === reparto.id)
      expect(encontrado).toBeDefined()
      expect(encontrado?.cuotas.map((cuota) => cuota.monto)).toEqual([600_000, 400_000])
      expect(encontrado?.unidadesExcluidas).toEqual([
        { unidadId: UNIDAD_A1_SIN, unidadNumero: "103" },
      ])
      expect(listado.mostrados).toBe(listado.data.length)
    })
  })

  it("el centavo del redondeo lo absorbe la unidad de mayor avalúo y la suma cierra exacta", async () => {
    // 2/3 y 1/3 del monto: $666.666,66… y $333.333,33… El piso deja un centavo
    // suelto que va al mayor avalúo, así que la suma da el monto exacto.
    const reparto = await emitirReparto(
      alta({
        microSectorId: SECTOR_A2,
        concepto: "Pintura del hall de la Torre B",
        montoTotal: 1_000_000,
      })
    )

    expect(reparto.avaluoTotal).toBe(72_000_000)
    // Ninguna unidad del sector quedó fuera: la lista llega vacía, no ausente.
    expect(reparto.unidadesExcluidas).toEqual([])
    expect(reparto.cuotas.map((cuota) => cuota.monto)).toEqual([
      666_666.67, // mayor avalúo (48M): absorbe el centavo del redondeo
      333_333.33,
    ])
    expect(sumaEnCentavos(reparto.cuotas)).toBe(centavos(1_000_000))
    expect(
      reparto.cuotas.reduce((acumulado, cuota) => acumulado + centavos(cuota.monto), 0)
    ).toBe(centavos(reparto.montoTotal))
  })

  it("la lista de unidades excluidas se CONGELA al emitir: una unidad dada de alta después no aparece", async () => {
    // Emisión con la 401 (avalúo declarado) y la 402 (avalúo CERO): la 402 no paga
    // y queda registrada como excluida.
    const primero = await emitirReparto(
      alta({
        microSectorId: SECTOR_A3,
        concepto: "Pintura de la escalera de la Torre E",
        montoTotal: 300_000,
      })
    )
    expect(primero.cuotas.map((cuota) => cuota.unidadId)).toEqual([UNIDAD_A3_401])
    expect(primero.unidadesExcluidas).toEqual([
      { unidadId: UNIDAD_A3_402, unidadNumero: "402" },
    ])

    // Una unidad NUEVA en el mismo sector, sin avalúo, DESPUÉS de la emisión. No
    // existía cuando el reparto se emitió, así que no puede figurar como excluida.
    await prisma.unidad.create({
      data: {
        id: UNIDAD_A3_403,
        comunidadId: COM_A,
        microSectorId: SECTOR_A3,
        numero: "403",
        etiqueta: "Depto",
        tipoUnidadId: "rf-tu-1",
        metraje: 50,
        prorrateo: 10,
        rolSii: "rf-rol-403",
        estadoId: "habitada",
        servicios: {},
        avaluoFiscal: null,
      },
    })
    expect(
      await prisma.unidad.count({
        where: { comunidadId: COM_A, microSectorId: SECTOR_A3 },
      })
    ).toBe(3)

    // La lectura devuelve el snapshot PERSISTIDO: la 402, no la 403. Si la vista
    // derivara la lista del padrón de hoy, la 403 aparecería acá.
    await conSesion(EMAIL_ADMIN, async () => {
      const res = await GET_REPARTOS()
      expect(res.status).toBe(200)
      const listado = (await res.json()) as ListadoRepartos
      const encontrado = listado.data.find((fila) => fila.id === primero.id)
      expect(encontrado?.unidadesExcluidas).toEqual([
        { unidadId: UNIDAD_A3_402, unidadNumero: "402" },
      ])
    })

    // La prueba de que era snapshot y no derivación: un reparto NUEVO del mismo
    // sector sí ve las dos unidades sin avalúo. Dos repartos del mismo sector,
    // dos listas distintas, cada una congelada en su emisión.
    const segundo = await emitirReparto(
      alta({
        microSectorId: SECTOR_A3,
        concepto: "Pintura de la escalera de la Torre E, segunda emisión",
        montoTotal: 300_000,
      })
    )
    expect(segundo.unidadesExcluidas).toEqual([
      { unidadId: UNIDAD_A3_402, unidadNumero: "402" },
      { unidadId: UNIDAD_A3_403, unidadNumero: "403" },
    ])

    const filaPrimero = await prisma.repartoSector.findUnique({
      where: { id: primero.id },
    })
    expect(filaPrimero?.unidadesExcluidas).toEqual([
      { unidadId: UNIDAD_A3_402, unidadNumero: "402" },
    ])
  })

  it("la lectura nunca devuelve un reparto de otra comunidad, ni con `?comunidadId=`", async () => {
    await conSesion(EMAIL_ADMIN, async () => {
      const res = await GET_REPARTOS(
        `http://localhost/api/repartos-sector?comunidadId=${COM_B}`
      )
      expect(res.status).toBe(200)
      const listado = (await res.json()) as ListadoRepartos
      expect(listado.data.some((fila) => fila.id === REPARTO_B)).toBe(false)
      expect(listado.data.every((fila) => fila.microSectorId !== SECTOR_B)).toBe(true)
      // Y la comunidad B sigue siendo dueña de su reparto: el scope no lo tocó.
      const ajeno = await prisma.repartoSector.findUnique({
        where: { id: REPARTO_B },
        include: { cuotas: true },
      })
      expect(ajeno?.comunidadId).toBe(COM_B)
      expect(ajeno?.cuotas).toHaveLength(1)
    })
  })

  it("PRESERVE: el alta de unidades sigue igual y la unidad nueva, sin avalúo, queda fuera del reparto", async () => {
    // `POST /api/unidades` no forma parte de esta unidad, pero COMPARTE el modelo
    // `Unidad`, que ganó la columna aditiva `avaluoFiscal`. Lo que se fija es que su
    // comportamiento anterior sigue entero: crea la unidad con la lista blanca de
    // campos de siempre y el avalúo queda NULL —«no declarado»—, así que el reparto
    // del sector no la incluye.
    const { POST: POST_UNIDAD } = await import("@/app/api/unidades/route")

    await conSesion(EMAIL_ADMIN, async () => {
      const res = await POST_UNIDAD(
        new NextRequest("http://localhost/api/unidades", {
          method: "POST",
          body: JSON.stringify({
            id: UNIDAD_NUEVA,
            microSectorId: SECTOR_A1,
            numero: "104",
            etiqueta: "Depto",
            tipoUnidadId: TIPO_UNIDAD,
            metraje: 55,
            prorrateo: 10,
            rolSii: "rf-rol-104",
            estadoId: ESTADO_OCUPACION,
            servicios: {},
          }),
          headers: { "content-type": "application/json" },
        })
      )
      expect(res.status).toBe(201)
      const creada = (await res.json()) as { id: string; avaluoFiscal: number | null }
      expect(creada.id).toBe(UNIDAD_NUEVA)
      expect(creada.avaluoFiscal).toBeNull()
    })

    // Y el reparto del sector sigue cerrando exacto con las dos unidades que SÍ
    // tienen avalúo: la recién creada no entra ni con $0.
    const reparto = await emitirReparto(alta({ concepto: "Ascensor de la Torre A, marzo" }))
    expect(reparto.cuotas.map((cuota) => cuota.unidadId)).toEqual([
      UNIDAD_A1_101,
      UNIDAD_A1_102,
    ])
    expect(sumaEnCentavos(reparto.cuotas)).toBe(centavos(1_000_000))
  })

  // ─────────────────────────────────────────────────────────────────────────────
  // S7 — el reparto deja de ser un documento y pasa a ser deuda cobrable.
  // ─────────────────────────────────────────────────────────────────────────────

  it("cada unidad incluida queda con su deuda del período: un `CobroFI` por cuota, al centavo", async () => {
    const reparto = await emitirReparto(
      alta({ periodo: "2026-04", concepto: "Ascensor de la Torre A, abril" })
    )

    const cargos = await cobrosDelReparto(reparto.id)
    // Una deuda por unidad INCLUIDA, no una por unidad del sector: la 103 (sin
    // avalúo) y la 104 (creada después, también sin avalúo) no tienen cargo.
    expect(cargos).toHaveLength(reparto.cuotas.length)
    expect(cargos).toHaveLength(2)

    const porUnidad = new Map(cargos.map((cargo) => [cargo.unidadId, cargo]))
    for (const cuota of reparto.cuotas) {
      const cargo = porUnidad.get(cuota.unidadId)
      expect(cargo).toBeDefined()
      // El monto de la deuda es el de la cuota, no el total del reparto.
      expect(cargo?.montoBase).toBe(cuota.monto)
      // …y es del período del reparto, con el concepto FI del catálogo (el mismo
      // que usa la emisión de gasto común) y el fondo de gasto común ACTIVO.
      expect(cargo?.periodo).toBe("2026-04")
      expect(cargo?.concepto).toBe("gasto_comun")
      expect(cargo?.origenModulo).toBe("FI")
      expect(cargo?.fondoId).toBe(FONDO_GC)
      expect(cargo?.fondoId).not.toBe(FONDO_RESERVA)
      expect(cargo?.montoBase).toBeGreaterThan(0)
      // El detalle del cobro cierra contra su monto base (S5).
      expect(cargo?.lineas).toEqual([
        { concepto: "gasto_comun", monto: cuota.monto, fondoId: FONDO_GC },
      ])
      // El vencimiento sale del día de corte de la comunidad, no de un reloj
      // inventado: período 2026-04 → el 5 del mes siguiente.
      expect(cargo?.fechaVencimiento).toBe("2026-05-05")
      expect(cargo?.fechaCargo).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      // La deuda dice de qué documento viene (la descripción lo nombra).
      expect(cargo?.descripcion).toContain("Torre A")
      // El vínculo, al revés: la cuota declara el cobro que produjo.
      expect(cuota.cobroId).toBe(cargo?.id)
    }

    // La suma de las deudas es EXACTAMENTE el monto total del reparto, al centavo.
    expect(cargos.reduce((total, cargo) => total + centavos(cargo.montoBase), 0)).toBe(
      centavos(reparto.montoTotal)
    )

    // El vínculo también está en la fila de la cuota, no sólo en la respuesta.
    const cuotasEnBd = await prisma.cuotaRepartoSector.findMany({
      where: { repartoSectorId: reparto.id },
      select: { unidadId: true, cobroId: true },
    })
    expect(cuotasEnBd.every((cuota) => typeof cuota.cobroId === "string")).toBe(true)
    expect(cuotasEnBd.map((cuota) => cuota.cobroId).sort()).toEqual(
      cargos.map((cargo) => cargo.id).sort()
    )

    // Y la lectura devuelve el vínculo: cada cuota dice qué cobro produjo.
    await conSesion(EMAIL_ADMIN, async () => {
      const res = await GET_REPARTOS()
      expect(res.status).toBe(200)
      const listado = (await res.json()) as ListadoRepartos
      const encontrado = listado.data.find((fila) => fila.id === reparto.id)
      expect(encontrado?.cuotas.every((cuota) => typeof cuota.cobroId === "string")).toBe(
        true
      )
    })
  })

  it("la cuota que se queda en cero no inventa una deuda de $0 y la suma sigue cerrando", async () => {
    // Un centavo repartido 2/3 y 1/3: el piso deja las dos cuotas en cero y el
    // residuo de un centavo va al mayor avalúo. La cuota de la otra unidad queda en
    // CERO —el reparto documenta que le tocó esa parte— y no produce cobro: un cargo
    // con monto base cero no pasa el contrato FI y no es algo que se cobre.
    const reparto = await emitirReparto(
      alta({
        microSectorId: SECTOR_A2,
        periodo: "2026-07",
        concepto: "Gasto mínimo de la Torre B",
        montoTotal: 0.01,
      })
    )

    expect(reparto.cuotas.map((cuota) => cuota.monto)).toEqual([0.01, 0])
    const cargos = await cobrosDelReparto(reparto.id)
    expect(cargos.map((cargo) => cargo.unidadId)).toEqual([UNIDAD_A2_201])
    expect(cargos[0]?.montoBase).toBe(0.01)
    // La cuota en cero no declara un cobro que no existe.
    expect(reparto.cuotas.find((cuota) => cuota.monto === 0)?.cobroId).toBeNull()
    // Y la suma de las deudas sigue siendo el monto total del reparto, al centavo.
    expect(cargos.reduce((total, cargo) => total + centavos(cargo.montoBase), 0)).toBe(
      centavos(reparto.montoTotal)
    )
  })

  it("la unidad excluida por falta de avalúo no recibe NINGUNA deuda de ese reparto", async () => {
    const reparto = await emitirReparto(
      alta({
        microSectorId: SECTOR_A3,
        periodo: "2026-04",
        concepto: "Pintura de la escalera, abril",
        montoTotal: 300_000,
      })
    )

    // La 402 sigue declarando avalúo CERO: quedó fuera y así se registró. La 403
    // —alta posterior a la primera emisión del sector y también sin avalúo— está en
    // el padrón de HOY, así que este reparto nuevo sí la ve y también la excluye.
    expect(reparto.unidadesExcluidas).toEqual([
      { unidadId: UNIDAD_A3_402, unidadNumero: "402" },
      { unidadId: UNIDAD_A3_403, unidadNumero: "403" },
    ])

    const cargos = await cobrosDelReparto(reparto.id)
    // Paga la que entró, y el monto es el total (era la única incluida).
    expect(cargos.map((cargo) => cargo.unidadId)).toEqual([UNIDAD_A3_401])
    expect(cargos[0]?.montoBase).toBe(300_000)
    // Y la excluida no tiene deuda de este reparto —ni una de $0, que no existe:
    // un cobro con monto base cero no pasa el contrato FI—.
    expect(await prisma.cobroFI.count({
      where: { comunidadId: COM_A, unidadId: UNIDAD_A3_402 },
    })).toBe(0)
    // Tampoco la 403, que se dio de alta después y sin avalúo: no estaba cuando se
    // emitió y no se le cobra por un reparto que no la declaró.
    expect(await prisma.cobroFI.count({
      where: { comunidadId: COM_A, unidadId: UNIDAD_A3_403 },
    })).toBe(0)
  })

  it("sin fondo de gasto común activo la emisión es 400 literal y no escribe NADA", async () => {
    const antes = await conteosDeComunidad()
    // El fondo existe pero está INACTIVO, y el de RESERVA sigue activo: la ruta no
    // se inventa un fondo ni usa el de reserva para imputar gasto común.
    await prisma.fondoFI.update({
      where: { id: FONDO_GC },
      data: { activo: false },
    })
    try {
      await conSesion(EMAIL_ADMIN, async () => {
        const res = await POST_REPARTO(
          alta({
            microSectorId: SECTOR_A2,
            periodo: "2026-04",
            concepto: "Pintura del hall, abril",
          })
        )
        expect(res.status).toBe(400)
        expect(((await res.json()) as { error: string }).error).toBe(MENSAJE_SIN_FONDO)
      })

      // Ni el reparto, ni sus cuotas, ni el cobro, ni la auditoría: el fondo se
      // resuelve ANTES de la transacción que escribe.
      expect(await conteosDeComunidad()).toEqual(antes)
      expect(
        await prisma.repartoSector.count({
          where: { comunidadId: COM_A, concepto: "Pintura del hall, abril" },
        })
      ).toBe(0)
    } finally {
      await prisma.fondoFI.update({
        where: { id: FONDO_GC },
        data: { activo: true },
      })
    }
  })

  it("si la escritura de las deudas falla dentro de la transacción no queda NADA del reparto", async () => {
    // El reloj y el azar fijados hacen determinísticos los ids de la ruta; se fija
    // la hora ACTUAL (no una del pasado) para que la cookie de sesión siga vigente.
    const ahoraFijo = Date.now()
    const reloj = vi.spyOn(Date, "now").mockReturnValue(ahoraFijo)
    const azar = vi.spyOn(Math, "random").mockReturnValue(0.5)
    // Los ids son determinísticos con el reloj y el azar fijados: el de la SEGUNDA
    // cuota del reparto se planta antes, así que la escritura de las deudas choca
    // contra la clave primaria cuando el reparto y sus cuotas YA están escritos.
    const idEnConflicto = generarId("cob", 1)
    const repartoId = generarId("rse")
    try {
      await prisma.cobroFI.create({
        data: {
          id: idEnConflicto,
          comunidadId: COM_A,
          unidadId: UNIDAD_A1_102,
          periodo: "2026-05",
          concepto: "gasto_comun",
          origenModulo: "FI",
          fondoId: FONDO_GC,
          descripcion: "Cargo plantado para forzar la colisión de clave",
          montoBase: 1,
          fechaCargo: "2026-05-01",
          moras: [],
          pagos: [],
          diferencias: [],
        },
      })

      await conSesion(EMAIL_ADMIN, async () => {
        const res = await POST_REPARTO(
          alta({ periodo: "2026-05", concepto: "Falla forzada de la Torre A" })
        )
        expect(res.status).toBe(500)
        expect(((await res.json()) as { error: string }).error).toBe(
          "Error interno del servidor."
        )
      })

      // Si la transacción no fuera atómica, el documento y sus cuotas seguirían acá:
      // se escriben ANTES que las deudas.
      expect(await prisma.repartoSector.findUnique({ where: { id: repartoId } })).toBeNull()
      expect(
        await prisma.repartoSector.count({
          where: { comunidadId: COM_A, concepto: "Falla forzada de la Torre A" },
        })
      ).toBe(0)
      expect(
        await prisma.cuotaRepartoSector.count({ where: { repartoSectorId: repartoId } })
      ).toBe(0)
      expect(
        await prisma.cobroFI.count({ where: { comunidadId: COM_A, origenRef: repartoId } })
      ).toBe(0)
      expect(
        await prisma.eventoAuditoria.count({
          where: { comunidadId: COM_A, referenciaId: repartoId },
        })
      ).toBe(0)
    } finally {
      azar.mockRestore()
      reloj.mockRestore()
      await prisma.cobroFI.deleteMany({ where: { id: idEnConflicto } })
    }
  })

  it("emitir dos veces el mismo reparto no cobra dos veces: 409 y cero deuda nueva", async () => {
    const cuerpo = alta({ periodo: "2026-06", concepto: "Repetición de la Torre A" })
    const primero = await emitirReparto(cuerpo)
    const deudasDelPrimero = await cobrosDelReparto(primero.id)
    expect(deudasDelPrimero).toHaveLength(2)

    // La segunda emisión del MISMO gasto del MISMO sector y período es un cobro
    // doble, así que se rechaza: corregir un reparto es emitir otro con su propio
    // concepto, no reemitir el mismo.
    await conSesion(EMAIL_ADMIN, async () => {
      const res = await POST_REPARTO(cuerpo)
      expect(res.status).toBe(409)
      expect(((await res.json()) as { error: string }).error).toBe(MENSAJE_YA_EMITIDO)
    })

    expect(
      await prisma.repartoSector.count({
        where: {
          comunidadId: COM_A,
          microSectorId: SECTOR_A1,
          periodo: "2026-06",
          concepto: "Repetición de la Torre A",
        },
      })
    ).toBe(1)
    // Una sola deuda por unidad: el intento rechazado no escribió ningún cobro.
    expect(await cobrosDelReparto(primero.id)).toEqual(deudasDelPrimero)
    expect(
      await prisma.cobroFI.count({
        where: {
          comunidadId: COM_A,
          periodo: "2026-06",
          unidadId: { in: [UNIDAD_A1_101, UNIDAD_A1_102] },
        },
      })
    ).toBe(2)

    // El guard no sobre-bloquea: otro CONCEPTO del mismo sector y período es otro
    // gasto, se emite y tiene su propia deuda.
    const otro = await emitirReparto({
      ...cuerpo,
      concepto: "Repetición de la Torre A, otro gasto",
    })
    expect(otro.id).not.toBe(primero.id)
    expect(await cobrosDelReparto(otro.id)).toHaveLength(2)
  })
})
