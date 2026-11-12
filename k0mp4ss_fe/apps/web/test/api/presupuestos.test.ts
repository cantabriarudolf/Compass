/**
 * @vitest-environment node
 *
 * F31 — presupuesto por partidas aprobado por el cuerpo que el reglamento defina
 * (Ley 21.442 arts. 15 y 17).
 *
 * La ley faculta al COMITÉ a aprobar presupuestos estimativos de gastos comunes
 * (art. 17) y reserva materias a la ASAMBLEA (art. 15); cuál de los dos aprueba el
 * presupuesto de partidas lo define el reglamento de cada comunidad. El sistema no
 * elige: registra el cuerpo del acuerdo que lo aprobó. Lo que se fija acá, todo
 * observable por la API y por la base:
 *
 *   1. sin sesión no se toca nada (401) y un rol sin `fi:gasto_comun` no crea ni
 *      lee presupuestos (403, cero filas);
 *   2. sin un acuerdo APROBADO —inexistente, abierto o de otra comunidad— el alta
 *      responde 400 con su motivo y no deja ninguna fila;
 *   3. un cuerpo fuera de comité/asamblea no se asume (400);
 *   4. con el acuerdo aprobado el alta responde 201, copia el cuerpo del acuerdo
 *      (asamblea o comité, el que sea) y persiste el total como la suma EXACTA de
 *      las partidas, con la auditoría `FI_PRESUPUESTO_CREADO`;
 *   5. un segundo presupuesto del mismo período es la versión 2 y el anterior
 *      queda `reemplazado`: nunca conviven dos vigentes;
 *   6. partidas vacías o con monto negativo no constituyen presupuesto (400);
 *   7. la lectura devuelve las versiones con sus partidas y su total, acotada a la
 *      comunidad de la sesión.
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

const COM_A = "pre-com-a"
const COM_B = "pre-com-b"

/** Acuerdo de la asamblea que aprueba el presupuesto 2026 (v1). */
const ACUERDO_ASAMBLEA = "pre-ac-asamblea"
/** Acuerdo del comité que aprueba el presupuesto 2026 (v2: reemplazo). */
const ACUERDO_COMITE = "pre-ac-comite"
/** Acuerdo del comité que aprueba el presupuesto de otro período. */
const ACUERDO_COMITE_2027 = "pre-ac-comite-2027"
const ACUERDO_ABIERTO = "pre-ac-abierto"
const ACUERDO_CUERPO_RARO = "pre-ac-raro"
const ACUERDO_OTRA_COMUNIDAD = "pre-ac-b"

const EMAIL_ADMIN = "pre-admin@test.cl"
const EMAIL_COMITE = "pre-comite@test.cl"
const EMAIL_RESIDENTE = "pre-residente@test.cl"

/** Presupuesto de la OTRA comunidad: la lectura del scope no puede verlo. */
const PRESUPUESTO_B = "pre-pres-b"

/** Forma de la vista que devuelven el alta y la lectura. */
interface VistaPresupuesto {
  id: string
  periodo: string
  cuerpo: string
  acuerdoId: string
  acuerdoFolio: string | null
  version: number
  estado: string
  total: number
  creadoPor: string
  createdAt: string
  partidas: Array<{
    id: string
    nombre: string
    categoria: string
    monto: number
    orden: number
  }>
}

/** Centavos enteros: el dinero se compara sin floats sueltos. */
const centavos = (monto: number): number => Math.round(monto * 100)

/** Tres partidas que suman exactamente $1.000.000 (dos tercios no lo harían). */
const PARTIDAS_BASE = [
  { nombre: "Sueldos", categoria: "sueldos", monto: 333_333.33 },
  { nombre: "Aseo", categoria: "servicios", monto: 333_333.33 },
  { nombre: "Administración", categoria: "administracion", monto: 333_333.34 },
]

describe("/api/presupuestos — presupuesto por partidas con el cuerpo del acuerdo (F31)", () => {
  const cargaModulos = async () => ({
    coleccion: await import("@/app/api/presupuestos/route"),
  })

  beforeAll(async () => {
    process.env.AUTH_SECRET = AUTH_SECRET

    for (const c of [
      { id: COM_A, nombre: "Comunidad Presupuestos A", slug: "pre-com-a" },
      { id: COM_B, nombre: "Comunidad Presupuestos B", slug: "pre-com-b" },
    ]) {
      await prisma.comunidad.upsert({ where: { id: c.id }, update: {}, create: c })
    }

    const acuerdos = [
      {
        id: ACUERDO_ASAMBLEA,
        comunidadId: COM_A,
        cuerpo: "asamblea",
        materia: "Presupuesto por partidas del período 2026",
        folio: "AD-2026-9001",
        estado: "aprobado",
        quorumRequerido: "mayoria_absoluta_derechos",
        resueltoEn: new Date("2026-01-20T12:00:00.000Z"),
        creadoPor: "pre-usuario-admin",
      },
      {
        id: ACUERDO_COMITE,
        comunidadId: COM_A,
        cuerpo: "comite",
        materia: "Presupuesto por partidas del período 2026, revisado",
        folio: "AD-2026-9002",
        estado: "aprobado",
        quorumRequerido: "un_voto_por_miembro",
        resueltoEn: new Date("2026-02-10T12:00:00.000Z"),
        creadoPor: "pre-usuario-admin",
      },
      {
        id: ACUERDO_COMITE_2027,
        comunidadId: COM_A,
        cuerpo: "comite",
        materia: "Presupuesto por partidas del período 2027",
        folio: "AD-2027-9003",
        estado: "aprobado",
        quorumRequerido: "un_voto_por_miembro",
        resueltoEn: new Date("2027-01-15T12:00:00.000Z"),
        creadoPor: "pre-usuario-admin",
      },
      {
        id: ACUERDO_ABIERTO,
        comunidadId: COM_A,
        cuerpo: "comite",
        materia: "Presupuesto que el comité todavía no votó",
        folio: "AD-2026-9004",
        estado: "abierto",
        quorumRequerido: "un_voto_por_miembro",
        creadoPor: "pre-usuario-admin",
      },
      {
        id: ACUERDO_CUERPO_RARO,
        comunidadId: COM_A,
        cuerpo: "consejo",
        materia: "Presupuesto de un cuerpo que la ley no faculta",
        folio: "AD-2026-9005",
        estado: "aprobado",
        quorumRequerido: "un_voto_por_miembro",
        resueltoEn: new Date("2026-02-10T12:00:00.000Z"),
        creadoPor: "pre-usuario-admin",
      },
      {
        id: ACUERDO_OTRA_COMUNIDAD,
        comunidadId: COM_B,
        cuerpo: "comite",
        materia: "Presupuesto de la otra comunidad",
        folio: "AD-2026-9100",
        estado: "aprobado",
        quorumRequerido: "un_voto_por_miembro",
        resueltoEn: new Date("2026-02-10T12:00:00.000Z"),
        creadoPor: "pre-usuario-admin",
      },
    ]
    for (const a of acuerdos) {
      await prisma.acuerdo.upsert({
        where: { id: a.id },
        update: { estado: a.estado },
        create: a,
      })
    }

    // Presupuesto de la comunidad B, escrito directo en la base: ningún scope de la
    // sesión (que es de A) puede leerlo por la API.
    await prisma.presupuesto.upsert({
      where: { id: PRESUPUESTO_B },
      update: {},
      create: {
        id: PRESUPUESTO_B,
        comunidadId: COM_B,
        periodo: "2026",
        cuerpo: "comite",
        acuerdoId: ACUERDO_OTRA_COMUNIDAD,
        version: 1,
        estado: "vigente",
        total: 700_000,
        creadoPor: "pre-usuario-admin",
      },
    })
    await prisma.partidaPresupuesto.deleteMany({
      where: { presupuestoId: PRESUPUESTO_B },
    })
    await prisma.partidaPresupuesto.create({
      data: {
        id: "pre-partida-b-1",
        comunidadId: COM_B,
        presupuestoId: PRESUPUESTO_B,
        nombre: "Gastos de la otra comunidad",
        categoria: "otro",
        monto: 700_000,
        orden: 1,
      },
    })

    const usuarios = [
      { id: "pre-usuario-admin", email: EMAIL_ADMIN, comunidadId: COM_A, rol: "administrador" },
      { id: "pre-usuario-comite", email: EMAIL_COMITE, comunidadId: COM_A, rol: "comite" },
      { id: "pre-usuario-residente", email: EMAIL_RESIDENTE, comunidadId: COM_A, rol: "residente" },
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
      await prisma.partidaPresupuesto.deleteMany({
        where: { comunidadId: { in: [COM_A, COM_B] } },
      })
      await prisma.presupuesto.deleteMany({
        where: { comunidadId: { in: [COM_A, COM_B] } },
      })
      await prisma.votoAcuerdo.deleteMany({
        where: { comunidadId: { in: [COM_A, COM_B] } },
      })
      await prisma.acuerdo.deleteMany({
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

  async function POST_PRESUPUESTO(body: unknown): Promise<Response> {
    const { coleccion } = await cargaModulos()
    return coleccion.POST(
      new NextRequest("http://localhost/api/presupuestos", {
        method: "POST",
        body: JSON.stringify(body),
        headers: { "content-type": "application/json" },
      })
    )
  }

  async function GET_PRESUPUESTOS(
    url = "http://localhost/api/presupuestos"
  ): Promise<Response> {
    const { coleccion } = await cargaModulos()
    return coleccion.GET(new NextRequest(url, { method: "GET" }))
  }

  const alta = (extra: Record<string, unknown> = {}) => ({
    periodo: "2026",
    acuerdoId: ACUERDO_ASAMBLEA,
    partidas: PARTIDAS_BASE,
    ...extra,
  })

  /** Alta de un presupuesto por la API con la sesión de la administración. */
  async function crearPresupuesto(
    body: Record<string, unknown>
  ): Promise<VistaPresupuesto> {
    let creado: VistaPresupuesto | null = null
    await conSesion(EMAIL_ADMIN, async () => {
      const res = await POST_PRESUPUESTO(body)
      expect(res.status).toBe(201)
      creado = (await res.json()) as VistaPresupuesto
    })
    if (!creado) throw new Error("no se pudo crear el presupuesto de prueba")
    return creado
  }

  /** Filas del período en la comunidad A: la base no gana nada con un rechazo. */
  async function filasDelPeriodo(periodo: string) {
    const presupuestos = await prisma.presupuesto.findMany({
      where: { comunidadId: COM_A, periodo },
      select: { id: true },
    })
    return {
      presupuestos: presupuestos.length,
      partidas: await prisma.partidaPresupuesto.count({
        where: { presupuestoId: { in: presupuestos.map((p) => p.id) } },
      }),
    }
  }

  it("401 sin sesión en las dos rutas", async () => {
    state.cookie = ""
    expect((await POST_PRESUPUESTO(alta())).status).toBe(401)
    expect((await GET_PRESUPUESTOS()).status).toBe(401)
  })

  it("un rol sin `fi:gasto_comun` no crea ni lee presupuestos → 403 y cero filas", async () => {
    await conSesion(EMAIL_RESIDENTE, async () => {
      expect((await POST_PRESUPUESTO(alta())).status).toBe(403)
      expect((await GET_PRESUPUESTOS()).status).toBe(403)
    })
    expect(await filasDelPeriodo("2026")).toEqual({ presupuestos: 0, partidas: 0 })
  })

  it("sin acuerdo aprobado no hay presupuesto: 400 con su motivo y cero filas", async () => {
    await conSesion(EMAIL_ADMIN, async () => {
      const inexistente = await POST_PRESUPUESTO(
        alta({ periodo: "2025", acuerdoId: "pre-ac-fantasma" })
      )
      expect(inexistente.status).toBe(400)
      expect(((await inexistente.json()) as { error: string }).error).toBe(
        "No se puede crear el presupuesto: el acuerdo no existe en esta comunidad."
      )

      const abierto = await POST_PRESUPUESTO(
        alta({ periodo: "2025", acuerdoId: ACUERDO_ABIERTO })
      )
      expect(abierto.status).toBe(400)
      expect(((await abierto.json()) as { error: string }).error).toBe(
        "No se puede crear el presupuesto: el acuerdo no está aprobado."
      )

      // El cuerpo lo define el reglamento, pero la ley sólo faculta a comité y
      // asamblea: un cuerpo desconocido no se asume.
      const raro = await POST_PRESUPUESTO(
        alta({ periodo: "2025", acuerdoId: ACUERDO_CUERPO_RARO })
      )
      expect(raro.status).toBe(400)
      expect(((await raro.json()) as { error: string }).error).toBe(
        "No se puede crear el presupuesto: el acuerdo no tiene un cuerpo que pueda aprobarlo (comité o asamblea)."
      )

      // El acuerdo de otra comunidad no existe para este scope.
      const ajeno = await POST_PRESUPUESTO(
        alta({ periodo: "2025", acuerdoId: ACUERDO_OTRA_COMUNIDAD })
      )
      expect(ajeno.status).toBe(400)
      expect(((await ajeno.json()) as { error: string }).error).toBe(
        "No se puede crear el presupuesto: el acuerdo no existe en esta comunidad."
      )
    })
    expect(await filasDelPeriodo("2025")).toEqual({ presupuestos: 0, partidas: 0 })
  })

  it("con acuerdo aprobado el alta es 201: cuerpo copiado del acuerdo y total exacto", async () => {
    const creado = await crearPresupuesto(alta())

    const enBd = await prisma.presupuesto.findUnique({
      where: { id: creado.id },
      include: { partidas: { orderBy: { orden: "asc" } } },
    })
    expect(enBd).not.toBeNull()
    expect(enBd?.comunidadId).toBe(COM_A)
    expect(enBd?.periodo).toBe("2026")
    // El cuerpo NO se asume: es el de la asamblea porque ese fue el acuerdo.
    expect(enBd?.cuerpo).toBe("asamblea")
    expect(enBd?.acuerdoId).toBe(ACUERDO_ASAMBLEA)
    expect(enBd?.version).toBe(1)
    expect(enBd?.estado).toBe("vigente")
    expect(enBd?.creadoPor).toBe("pre-usuario-admin")

    // El total es la suma EXACTA de las partidas y queda como snapshot.
    expect(centavos(enBd?.total ?? -1)).toBe(centavos(1_000_000))
    expect(enBd?.total).toBe(1_000_000)

    const partidas = enBd?.partidas ?? []
    expect(partidas.map((partida) => partida.orden)).toEqual([1, 2, 3])
    expect(partidas.map((partida) => partida.nombre)).toEqual([
      "Sueldos",
      "Aseo",
      "Administración",
    ])
    expect(partidas.map((partida) => partida.categoria)).toEqual([
      "sueldos",
      "servicios",
      "administracion",
    ])
    const suma = partidas.reduce((total, partida) => total + centavos(partida.monto), 0)
    expect(suma).toBe(centavos(1_000_000))

    // La respuesta trae la misma vista con el folio del acuerdo que la aprueba.
    expect(creado.cuerpo).toBe("asamblea")
    expect(creado.version).toBe(1)
    expect(creado.estado).toBe("vigente")
    expect(creado.acuerdoFolio).toBe("AD-2026-9001")
    expect(creado.total).toBe(1_000_000)
    expect(creado.partidas.map((partida) => partida.orden)).toEqual([1, 2, 3])

    // El alta queda auditada con el período, la versión, el cuerpo y el folio.
    const evento = await prisma.eventoAuditoria.findFirst({
      where: {
        comunidadId: COM_A,
        tipoAccion: "FI_PRESUPUESTO_CREADO",
        referenciaId: creado.id,
      },
    })
    expect(evento).not.toBeNull()
    expect(evento?.categoria).toBe("FI")
    expect(evento?.descripcion).toContain("AD-2026-9001")
    expect(evento?.descripcion).toContain("Asamblea")
    expect(evento?.descripcion).toContain("1.000.000")
  })

  it("el segundo presupuesto del período es la versión 2 y el anterior queda reemplazado", async () => {
    const primera = await prisma.presupuesto.findFirst({
      where: { comunidadId: COM_A, periodo: "2026" },
      orderBy: { version: "asc" },
    })
    expect(primera?.version).toBe(1)
    expect(primera?.estado).toBe("vigente")

    const segunda = await crearPresupuesto(
      alta({
        acuerdoId: ACUERDO_COMITE,
        partidas: [
          { nombre: "Sueldos", categoria: "sueldos", monto: 800_000 },
          { nombre: "Servicios", categoria: "servicios", monto: 200_000 },
        ],
      })
    )

    // La versión nueva es la 2 y el cuerpo se copia de SU acuerdo (comité).
    expect(segunda.version).toBe(2)
    expect(segunda.cuerpo).toBe("comite")
    expect(segunda.estado).toBe("vigente")
    expect(segunda.total).toBe(1_000_000)

    const enBd = await prisma.presupuesto.findMany({
      where: { comunidadId: COM_A, periodo: "2026" },
      orderBy: { version: "asc" },
    })
    expect(enBd.map((fila) => fila.version)).toEqual([1, 2])
    expect(enBd.map((fila) => fila.estado)).toEqual(["reemplazado", "vigente"])
    // Una sola versión vigente por período: la anterior no se borró ni convive.
    expect(enBd.filter((fila) => fila.estado === "vigente")).toHaveLength(1)

    // El reemplazo no toca las partidas de la versión anterior.
    const partidasPrimera = await prisma.partidaPresupuesto.count({
      where: { presupuestoId: primera!.id },
    })
    expect(partidasPrimera).toBe(3)
  })

  it("otro período empieza en la versión 1: la versión es por período", async () => {
    const otro = await crearPresupuesto(
      alta({ periodo: "2027", acuerdoId: ACUERDO_COMITE_2027 })
    )
    expect(otro.periodo).toBe("2027")
    expect(otro.version).toBe(1)
    expect(otro.estado).toBe("vigente")
    expect(otro.cuerpo).toBe("comite")
  })

  it("partidas vacías o con monto negativo no constituyen presupuesto → 400 sin filas", async () => {
    await conSesion(EMAIL_ADMIN, async () => {
      const vacias = await POST_PRESUPUESTO(
        alta({ periodo: "2028", partidas: [] })
      )
      expect(vacias.status).toBe(400)
      expect(((await vacias.json()) as { error: string }).error).toBe(
        "Datos inválidos."
      )

      const negativa = await POST_PRESUPUESTO(
        alta({
          periodo: "2028",
          partidas: [
            { nombre: "Sueldos", categoria: "sueldos", monto: 500_000 },
            { nombre: "Ajuste", categoria: "otro", monto: -1 },
          ],
        })
      )
      expect(negativa.status).toBe(400)
      expect(((await negativa.json()) as { error: string }).error).toBe(
        "Datos inválidos."
      )

      const sinPeriodo = await POST_PRESUPUESTO(
        alta({ periodo: "2026-01" })
      )
      expect(sinPeriodo.status).toBe(400)
      expect(((await sinPeriodo.json()) as { error: string }).error).toBe(
        "Datos inválidos."
      )
    })
    expect(await filasDelPeriodo("2028")).toEqual({ presupuestos: 0, partidas: 0 })
  })

  it("la lectura devuelve las versiones con sus partidas y su total, sin cruzar comunidades", async () => {
    await conSesion(EMAIL_COMITE, async () => {
      const res = await GET_PRESUPUESTOS(
        "http://localhost/api/presupuestos?comunidadId=pre-com-b"
      )
      expect(res.status).toBe(200)
      const j = (await res.json()) as {
        data: VistaPresupuesto[]
        total: number
        mostrados: number
      }

      expect(j.total).toBe(
        await prisma.presupuesto.count({ where: { comunidadId: COM_A } })
      )
      expect(j.data).toHaveLength(j.total)
      expect(j.mostrados).toBe(j.data.length)

      // El `comunidadId` de la URL no mueve el alcance: es la comunidad de la sesión.
      expect(j.data.map((fila) => fila.id)).not.toContain(PRESUPUESTO_B)
      expect(j.data.every((fila) => fila.acuerdoId !== ACUERDO_OTRA_COMUNIDAD)).toBe(
        true
      )

      // El período 2026 conserva su historia: v1 reemplazada y v2 vigente.
      const del2026 = j.data.filter((fila) => fila.periodo === "2026")
      expect(del2026.map((fila) => fila.version)).toEqual([2, 1])
      expect(del2026.map((fila) => fila.estado)).toEqual(["vigente", "reemplazado"])
      expect(del2026.map((fila) => fila.cuerpo)).toEqual(["comite", "asamblea"])
      expect(del2026.every((fila) => fila.acuerdoFolio !== null)).toBe(true)

      const vigente = del2026[0]!
      expect(vigente.partidas.map((partida) => partida.orden)).toEqual([1, 2])
      const suma = vigente.partidas.reduce(
        (total, partida) => total + centavos(partida.monto),
        0
      )
      expect(suma).toBe(centavos(vigente.total))
      expect(centavos(vigente.total)).toBe(centavos(1_000_000))

      const reemplazado = del2026[1]!
      expect(reemplazado.partidas).toHaveLength(3)
      expect(centavos(reemplazado.total)).toBe(centavos(1_000_000))
    })
  })
})
