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
 *      cuotas, y NUNCA los de otra comunidad.
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

const COM_A = "rf-com-a"
const COM_B = "rf-com-b"

/** Sector con dos avalúos desiguales y una unidad sin avalúo declarado. */
const SECTOR_A1 = "rf-ms-a1"
/** Sector con avalúos que dejan residuo de redondeo (2/3 y 1/3). */
const SECTOR_A2 = "rf-ms-a2"
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
const UNIDAD_SIN_AVALUO_1 = "rf-u-sin-1"
const UNIDAD_SIN_AVALUO_2 = "rf-u-sin-2"
const UNIDAD_B = "rf-u-b-1"

/** Reparto ya emitido de la otra comunidad: esta lectura no puede verlo. */
const REPARTO_B = "rf-reparto-b"

const EMAIL_ADMIN = "rf-admin@test.cl"
const EMAIL_COMITE = "rf-comite@test.cl"
const EMAIL_RESIDENTE = "rf-residente@test.cl"

const USUARIO_ADMIN = "rf-usuario-admin"

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
      },
      {
        id: expect.any(String),
        unidadId: UNIDAD_A1_102,
        unidadNumero: "102",
        avaluoUsado: 40_000_000,
        monto: 400_000,
      },
    ])
    // La unidad 103 NO tiene avalúo: no aparece en las cuotas (ni con $0).
    expect(reparto.cuotas.some((cuota) => cuota.unidadId === UNIDAD_A1_SIN)).toBe(false)
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
    expect(reparto.cuotas.map((cuota) => cuota.monto)).toEqual([
      666_666.67, // mayor avalúo (48M): absorbe el centavo del redondeo
      333_333.33,
    ])
    expect(sumaEnCentavos(reparto.cuotas)).toBe(centavos(1_000_000))
    expect(
      reparto.cuotas.reduce((acumulado, cuota) => acumulado + centavos(cuota.monto), 0)
    ).toBe(centavos(reparto.montoTotal))
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
})
