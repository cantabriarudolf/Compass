/**
 * @vitest-environment node
 *
 * F29 · S3 — el convenio de pago vigente consta en el aviso de cobro (emisión
 * real, BD de dev).
 *
 * El copropietario que firmó un convenio tiene derecho a que el papel que recibe
 * no le cobre como si no existiera: el aviso declara el acuerdo del Comité que
 * lo autorizó, la cuota que va (M de N) y su monto con su vencimiento. La
 * referencia es el folio del ACUERDO —`ConvenioPago` no tiene folio propio y no
 * se inventa un correlativo nuevo—. Lo que estos tests fijan sobre las rutas
 * reales (suscripción, emisión y anulación), todo observable por la API:
 *
 *   1. el aviso de una unidad con convenio `vigente` lleva la declaración
 *      congelada en su `contenido`, con la línea que imprime el papel;
 *   2. el aviso YA EMITIDO no cambia cuando el convenio se anula después: el
 *      cuerpo completo del detalle GET es byte a byte el mismo (el contenido
 *      congelado conserva lo que decía, con el acuerdo y la cuota que llevaba);
 *   3. el aviso de una unidad cuyo convenio se anuló ANTES de emitir no lo
 *      declara;
 *   4. el aviso de una unidad sin convenio no menciona convenio: ni el campo,
 *      ni la palabra, ni un hueco vacío (las claves del contenido son las de
 *      siempre).
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

const COM = "avcn-com-con"
const PERIODO = "2026-09"

const U1 = "avcn-u-1" // convenio `vigente` al emitir → declarado; anulado después → congelado
const U2 = "avcn-u-2" // convenio anulado ANTES de emitir → no declarado
const UB = "avcn-u-b" // sin convenio nunca → ni la palabra

const P1 = "avcn-p-1"
const P2 = "avcn-p-2"
const FONDO_GC = "avcn-fondo-gc"
const ACUERDO_1 = "avcn-acuerdo-1" // folio AD-2026-9001
const ACUERDO_2 = "avcn-acuerdo-2" // folio AD-2026-9002

const EMAIL_ADMIN = "avcn-admin@test.cl"
const ADMIN_ID = "avcn-user-admin"

type Aviso = {
  id: string
  folio: string
  contenido: Record<string, unknown>
}

function datosPersona(
  id: string,
  comunidadId: string,
  rut: string,
  nombre: string,
  email: string
) {
  return {
    id,
    comunidadId,
    rut,
    nombreCompleto: nombre,
    nombres: nombre.split(" ")[0]!,
    apellidos: nombre.split(" ").slice(1).join(" "),
    email,
    telefonoMovil: "+56900000000",
    estadoCuenta: "activa",
    condicionesEspecialesIds: [],
    roles: ["propietario"],
  }
}

function datosUnidad(id: string, numero: string) {
  return {
    id,
    comunidadId: COM,
    microSectorId: `avcn-ms-${numero}`,
    numero,
    etiqueta: "Depto",
    tipoUnidadId: "avcn-tu-1",
    metraje: 50,
    prorrateo: 10,
    rolSii: `avcn-${numero}`,
    estadoId: "habitada",
    servicios: {},
  }
}

/** Cargo de gasto común del período, para que la unidad tenga cobro avisable. */
async function crearCargo(unidadId: string, id: string): Promise<void> {
  await prisma.cobroFI.create({
    data: {
      id,
      comunidadId: COM,
      unidadId,
      periodo: PERIODO,
      concepto: "gasto_comun",
      origenModulo: "FI",
      fondoId: FONDO_GC,
      descripcion: `Gasto Común ${PERIODO}`,
      montoBase: 45_000,
      lineas: [{ concepto: "gasto_comun", monto: 45_000, fondoId: FONDO_GC }],
      fechaCargo: `${PERIODO}-01`,
      fechaVencimiento: `${PERIODO}-10`,
      moras: [],
      pagos: [],
      diferencias: [],
    },
  })
}

describe("/api/avisos-cobro — la declaración del convenio vigente (F29 · S3)", () => {
  const cookies = new Map<string, string>()

  async function como<T>(
    email: string,
    fn: () => Promise<T>
  ): Promise<T> {
    const cookie = cookies.get(email)
    if (!cookie) throw new Error(`sin cookie de sesión para ${email}`)
    state.cookie = cookie
    try {
      return await fn()
    } finally {
      state.cookie = ""
    }
  }

  async function postAviso(body: unknown): Promise<{ status: number; json: Record<string, unknown> }> {
    const { POST } = await import("@/app/api/avisos-cobro/route")
    const res = await POST(
      new NextRequest("http://localhost/api/avisos-cobro", {
        method: "POST",
        body: JSON.stringify(body),
        headers: { "content-type": "application/json" },
      })
    )
    return { status: res.status, json: (await res.json().catch(() => ({}))) as Record<string, unknown> }
  }

  async function postConvenio(body: unknown): Promise<{ status: number; json: Record<string, unknown> }> {
    const { POST } = await import("@/app/api/convenios/route")
    const res = await POST(
      new NextRequest("http://localhost/api/convenios", {
        method: "POST",
        body: JSON.stringify(body),
        headers: { "content-type": "application/json" },
      })
    )
    return { status: res.status, json: (await res.json().catch(() => ({}))) as Record<string, unknown> }
  }

  async function postAnular(body: unknown): Promise<{ status: number; json: Record<string, unknown> }> {
    const { POST } = await import("@/app/api/convenios/anular/route")
    const res = await POST(
      new NextRequest("http://localhost/api/convenios/anular", {
        method: "POST",
        body: JSON.stringify(body),
        headers: { "content-type": "application/json" },
      })
    )
    return { status: res.status, json: (await res.json().catch(() => ({}))) as Record<string, unknown> }
  }

  /** El detalle del aviso tal como lo sirve la API: texto crudo del cuerpo. */
  async function getAvisoCrudo(id: string): Promise<string> {
    const { GET } = await import("@/app/api/avisos-cobro/[id]/route")
    const res = await GET(new NextRequest(`http://localhost/api/avisos-cobro/${id}`), {
      params: Promise.resolve({ id }),
    })
    return await res.text()
  }

  async function limpiar(): Promise<void> {
    await prisma.avisoCobro.deleteMany({ where: { comunidadId: COM } })
    await prisma.cobroFI.deleteMany({ where: { comunidadId: COM } })
    await prisma.cuotaConvenio.deleteMany({ where: { comunidadId: COM } })
    await prisma.convenioPago.deleteMany({ where: { comunidadId: COM } })
    await prisma.votoAcuerdo.deleteMany({ where: { comunidadId: COM } })
    await prisma.acuerdo.deleteMany({ where: { comunidadId: COM } })
    await prisma.vinculoUnidad.deleteMany({ where: { comunidadId: COM } })
    await prisma.emisionGC.deleteMany({ where: { comunidadId: COM } })
    await prisma.fondoFI.deleteMany({ where: { comunidadId: COM } })
    await prisma.unidad.deleteMany({ where: { comunidadId: COM } })
    await prisma.persona.deleteMany({ where: { comunidadId: COM } })
  }

  beforeAll(async () => {
    process.env.AUTH_SECRET = AUTH_SECRET
    process.env.NEXT_PUBLIC_APP_ENV = "development"
    vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 })

    await limpiar()
    await prisma.membresia.deleteMany({ where: { usuarioId: ADMIN_ID } })
    await prisma.usuario.deleteMany({ where: { id: ADMIN_ID } })
    await prisma.comunidad.deleteMany({ where: { id: COM } })

    await prisma.comunidad.create({
      data: { id: COM, nombre: "Comunidad Aviso Convenio", slug: "avcn-con" },
    })
    await prisma.usuario.create({
      data: { id: ADMIN_ID, email: EMAIL_ADMIN, activo: true },
    })
    await prisma.membresia.create({
      data: { usuarioId: ADMIN_ID, comunidadId: COM, rol: "administrador" },
    })

    // El fondo de gasto común activo que la suscripción del convenio exige para
    // imputar sus cuotas y el aviso necesita para computar los totales del mes.
    await prisma.fondoFI.create({
      data: {
        id: FONDO_GC,
        comunidadId: COM,
        nombre: "Fondo Gasto Común",
        tipo: "gasto_comun",
        activo: true,
        saldoInicial: 100_000,
      },
    })
    for (const unidad of [datosUnidad(U1, "101"), datosUnidad(U2, "102"), datosUnidad(UB, "201")]) {
      await prisma.unidad.create({ data: unidad })
    }
    await prisma.emisionGC.create({
      data: {
        id: "avcn-egc",
        comunidadId: COM,
        periodo: PERIODO,
        modo: "fijo",
        gastoTotal: 135_000,
        lineas: [],
        fechaEmision: `${PERIODO}-01`,
      },
    })
    await crearCargo(U1, "avcn-cob-1")
    await crearCargo(U2, "avcn-cob-2")
    await crearCargo(UB, "avcn-cob-b")

    // Los deudores son los propietarios vigentes de sus unidades, el mismo
    // criterio del alta (`esPropietarioVigenteDeUnidad`).
    await prisma.persona.create({ data: datosPersona(P1, COM, "19111111-1", "Deudor Uno", "avcn-p1@test.cl") })
    await prisma.persona.create({ data: datosPersona(P2, COM, "19222222-2", "Deudor Dos", "avcn-p2@test.cl") })
    await prisma.vinculoUnidad.create({
      data: {
        id: "avcn-v-p1-u1",
        comunidadId: COM,
        personaId: P1,
        unidadId: U1,
        rol: "propietario",
        fechaInicio: "2024-01-01",
        fechaFin: null,
        permiteVerFinanzas: true,
      },
    })
    await prisma.vinculoUnidad.create({
      data: {
        id: "avcn-v-p2-u2",
        comunidadId: COM,
        personaId: P2,
        unidadId: U2,
        rol: "propietario",
        fechaInicio: "2024-01-01",
        fechaFin: null,
        permiteVerFinanzas: true,
      },
    })

    // Acuerdos del Comité que autorizan los convenios: la referencia legal que
    // el aviso declara es SU folio, no un correlativo del convenio.
    for (const acuerdo of [
      {
        id: ACUERDO_1,
        comunidadId: COM,
        cuerpo: "comite",
        materia: "Convenio de pago de la unidad 101 (Ley 21.442 art. 6)",
        folio: "AD-2026-9001",
        estado: "aprobado",
        quorumRequerido: "un_voto_por_miembro",
        resueltoEn: new Date("2026-08-01T12:00:00.000Z"),
        creadoPor: ADMIN_ID,
      },
      {
        id: ACUERDO_2,
        comunidadId: COM,
        cuerpo: "comite",
        materia: "Convenio de pago de la unidad 102 (Ley 21.442 art. 6)",
        folio: "AD-2026-9002",
        estado: "aprobado",
        quorumRequerido: "un_voto_por_miembro",
        resueltoEn: new Date("2026-08-01T12:00:00.000Z"),
        creadoPor: ADMIN_ID,
      },
    ]) {
      await prisma.acuerdo.create({ data: acuerdo })
    }

    const { cookieSesionAuthjs } = await import("../helpers/sesion-authjs")
    cookies.set(EMAIL_ADMIN, await cookieSesionAuthjs({ sub: ADMIN_ID, email: EMAIL_ADMIN }))
  }, 60_000)

  afterAll(async () => {
    try {
      state.cookie = ""
      await limpiar()
      await prisma.membresia.deleteMany({ where: { usuarioId: ADMIN_ID } })
      await prisma.usuario.deleteMany({ where: { id: ADMIN_ID } })
      await prisma.comunidad.deleteMany({ where: { id: COM } })
    } catch {
      // intencional: limpieza best-effort, la base de la suite es descartable
    }
  }, 60_000)

  it("el aviso declara el convenio vigente: el acuerdo que lo autoriza, la cuota que va (M de N), su monto y su vencimiento", async () => {
    // La suscripción es REAL: la fecha de suscripción la decide el servidor y
    // las cuotas 1..3 quedan pendientes con sus vencimientos mensuales.
    const suscrito = await como(EMAIL_ADMIN, () =>
      postConvenio({
        unidadId: U1,
        personaId: P1,
        acuerdoId: ACUERDO_1,
        montoTotal: 1_000_000,
        numeroCuotas: 3,
        primeraCuota: 250_000,
      })
    )
    expect(suscrito.status).toBe(201)
    const convenioId = suscrito.json.id as string

    // La cuota que va se lee de la base al emitir: la primera impaga por número.
    const cuotas = await prisma.cuotaConvenio.findMany({
      where: { convenioId },
      orderBy: { numero: "asc" },
    })
    const impaga = cuotas.find((c) => c.estado === "pendiente")!
    expect(impaga.numero).toBe(1)
    const acuerdo = await prisma.acuerdo.findUniqueOrThrow({ where: { id: ACUERDO_1 } })

    const res = await como(EMAIL_ADMIN, () => postAviso({ periodo: PERIODO, unidadId: U1 }))
    expect(res.status).toBe(201)
    const aviso = (res.json.avisos as Aviso[])[0]!
    const declaracion = aviso.contenido.convenio as Record<string, unknown>
    expect(declaracion).toBeDefined()
    expect(declaracion.acuerdoFolio).toBe(acuerdo.folio)
    expect(declaracion.cuota).toEqual({
      numero: impaga.numero,
      de: 3,
      monto: impaga.monto,
      vencimiento: impaga.venceEn.toISOString().slice(0, 10),
    })
    // La línea que imprime el papel lleva los mismos datos congelados.
    const texto = declaracion.texto as string
    expect(texto).toContain(acuerdo.folio)
    expect(texto).toContain(`${impaga.numero} de 3`)
    expect(texto).toContain("$250.000")
    expect(texto).toContain(impaga.venceEn.toISOString().slice(0, 10))

    // El papel emitido se congela byte a byte ANTES de la anulación: la
    // comparación del cuerpo completo del detalle deja cualquier reescritura a
    // la vista, incluida la deuda anterior que la anulación recalcularía distinta.
    const textoAntes = await como(EMAIL_ADMIN, async () => getAvisoCrudo(aviso.id))

    // La anulación llega DESPUÉS de la emisión: el papel ya está emitido.
    const anulacion = await como(EMAIL_ADMIN, () =>
      postAnular({
        convenioId,
        motivo: "El copropietario dejó de pagar las cuotas acordadas.",
      })
    )
    expect(anulacion.status).toBe(200)

    const textoDespues = await como(EMAIL_ADMIN, async () => getAvisoCrudo(aviso.id))
    expect(textoDespues).toBe(textoAntes)
    // Y el contenido congelado conserva lo que dijo del convenio.
    const filaDespues = JSON.parse(textoDespues) as { contenido: Record<string, unknown> }
    const congelado = filaDespues.contenido.convenio as Record<string, unknown>
    expect(congelado.acuerdoFolio).toBe(acuerdo.folio)
    expect((congelado.cuota as Record<string, unknown>).numero).toBe(impaga.numero)
    expect(congelado.texto).toBe(texto)
  })

  it("un convenio anulado antes de emitir no se declara", async () => {
    const suscrito = await como(EMAIL_ADMIN, () =>
      postConvenio({
        unidadId: U2,
        personaId: P2,
        acuerdoId: ACUERDO_2,
        montoTotal: 600_000,
        numeroCuotas: 2,
        primeraCuota: 200_000,
      })
    )
    expect(suscrito.status).toBe(201)
    const convenioId = suscrito.json.id as string

    // La anulación ANTES de la emisión: cuando el papel se arma, el convenio ya
    // no rige y el aviso no lo declara.
    const anulacion = await como(EMAIL_ADMIN, () =>
      postAnular({ convenioId, motivo: "Incumplimiento desde la primera cuota." })
    )
    expect(anulacion.status).toBe(200)

    const res = await como(EMAIL_ADMIN, () => postAviso({ periodo: PERIODO, unidadId: U2 }))
    expect(res.status).toBe(201)
    const aviso = (res.json.avisos as Aviso[])[0]!
    expect("convenio" in aviso.contenido).toBe(false)
    // Ni la palabra en ningún campo del documento congelado.
    expect(JSON.stringify(aviso.contenido).toLowerCase()).not.toContain("convenio")
  })

  it("sin convenio el aviso no menciona convenio ni reserva un hueco vacío", async () => {
    const res = await como(EMAIL_ADMIN, () => postAviso({ periodo: PERIODO, unidadId: UB }))
    expect(res.status).toBe(201)
    const aviso = (res.json.avisos as Aviso[])[0]!
    expect("convenio" in aviso.contenido).toBe(false)
    // Pin de bytes: sin convenio el contenido lleva exactamente las claves de
    // siempre —el aviso de una unidad sin convenio queda como siempre fue—.
    expect(Object.keys(aviso.contenido).sort()).toEqual([
      "cargos",
      "detalle",
      "deudaAnterior",
      "fechaEmision",
      "montos",
      "noComputables",
      "participacion",
      "periodo",
      "reglamento",
      "resumenComunidad",
      "unidad",
      "version",
    ])
    expect(JSON.stringify(aviso.contenido).toLowerCase()).not.toContain("convenio")
  })
})
