/**
 * @vitest-environment node
 *
 * F29 — convenio de pago de la deuda de gastos comunes (Ley 21.442 art. 6).
 *
 * El convenio no es un acuerdo entre partes que el sistema pueda inventar: el
 * administrador lo celebra, pero la ley exige ACUERDO DEL COMITÉ y el pago de la
 * PRIMERA CUOTA al suscribir. Lo que se fija acá, todo observable por la API y
 * por la base:
 *
 *   1. sin sesión no se toca nada (401) y un rol sin `fi:cobranza` no suscribe
 *      convenios ni registra pagos (403, cero filas);
 *   2. sin un acuerdo APROBADO del Comité —abierto, de asamblea o inexistente—
 *      el alta responde 400 con su motivo y no deja ninguna fila;
 *   3. con el acuerdo del Comité el alta responde 201, la primera cuota nace
 *      PAGADA en la fecha de suscripción y las N cuotas del saldo suman exacto;
 *   4. una unidad no puede tener dos convenios vigentes (409 y una sola fila);
 *   5. al pagar todas las cuotas el convenio queda `saldado`, y una cuota pagada
 *      no se vuelve a pagar (409) sin tocar la fila;
 *   6. la lectura devuelve los convenios con sus cuotas y los totales pagado y
 *      pendiente, acotada a la comunidad de la sesión.
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

const COM_A = "conv-com-a"
const COM_B = "conv-com-b"

const U1 = "conv-u-1"
const U2 = "conv-u-2"
const U_OTRA = "conv-u-otra"
const U_OTRA_PAGO = "conv-u-otra-pago"

const P1 = "conv-p-1"
const P2 = "conv-p-2"
const P_OTRA = "conv-p-otra"

/** Acuerdo del Comité que autoriza el convenio de la unidad U1. */
const ACUERDO_OK = "conv-ac-ok"
const ACUERDO_ABIERTO = "conv-ac-abierto"
const ACUERDO_ASAMBLEA = "conv-ac-asamblea"
const ACUERDO_OTRA_COMUNIDAD = "conv-ac-b"
const ACUERDO_OK_U2 = "conv-ac-ok-u2"

const EMAIL_ADMIN = "conv-admin@test.cl"
const EMAIL_COMITE = "conv-comite@test.cl"
const EMAIL_RESIDENTE = "conv-residente@test.cl"

/** Convenio de la OTRA comunidad: la lectura del scope no puede verlo. */
const CONVENIO_COM_B = "conv-convenio-b"

/** Forma de la vista que devuelven las tres rutas (altas y lectura). */
interface VistaConvenio {
  id: string
  unidadId: string
  personaId: string
  acuerdoId: string
  montoTotal: number
  numeroCuotas: number
  primeraCuota: number
  estado: string
  cuotas: Array<{
    numero: number
    monto: number
    estado: string
    venceEn: string
    pagadaEn: string | null
    registradaPor: string | null
  }>
  totales: { pagado: number; pendiente: number }
}

/** Centavos enteros: el dinero se compara sin floats sueltos. */
const centavos = (monto: number): number => Math.round(monto * 100)

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

function datosUnidad(id: string, comunidadId: string, numero: string) {
  return {
    id,
    comunidadId,
    microSectorId: `conv-ms-${numero}`,
    numero,
    etiqueta: "Depto",
    tipoUnidadId: "conv-tu-1",
    metraje: 50,
    prorrateo: 10,
    rolSii: `conv-${numero}`,
    estadoId: "habitada",
    servicios: {},
  }
}

describe("/api/convenios — convenio de pago con acuerdo del Comité (F29)", () => {
  const cargaModulos = async () => ({
    coleccion: await import("@/app/api/convenios/route"),
    pago: await import("@/app/api/convenios/pago/route"),
  })

  beforeAll(async () => {
    process.env.AUTH_SECRET = AUTH_SECRET

    for (const c of [
      { id: COM_A, nombre: "Comunidad Convenios A", slug: "conv-com-a" },
      { id: COM_B, nombre: "Comunidad Convenios B", slug: "conv-com-b" },
    ]) {
      await prisma.comunidad.upsert({ where: { id: c.id }, update: {}, create: c })
    }

    for (const p of [
      datosPersona(P1, COM_A, "19111111-1", "Deudor Uno", "conv-p1@test.cl"),
      datosPersona(P2, COM_A, "19222222-2", "Deudor Dos", "conv-p2@test.cl"),
      datosPersona(P_OTRA, COM_B, "19333333-3", "Deudor Ajeno", "conv-p-otra@test.cl"),
    ]) {
      await prisma.persona.upsert({ where: { id: p.id }, update: {}, create: p })
    }

    for (const u of [
      datosUnidad(U1, COM_A, "101"),
      datosUnidad(U2, COM_A, "102"),
      datosUnidad(U_OTRA, COM_B, "901"),
      datosUnidad(U_OTRA_PAGO, COM_B, "902"),
    ]) {
      await prisma.unidad.upsert({ where: { id: u.id }, update: {}, create: u })
    }

    const acuerdos = [
      {
        id: ACUERDO_OK,
        comunidadId: COM_A,
        cuerpo: "comite",
        materia: "Convenio de pago de la unidad 101 (Ley 21.442 art. 6)",
        folio: "AD-2026-8001",
        estado: "aprobado",
        quorumRequerido: "un_voto_por_miembro",
        resueltoEn: new Date("2026-02-10T12:00:00.000Z"),
        creadoPor: "conv-usuario-admin",
      },
      {
        id: ACUERDO_OK_U2,
        comunidadId: COM_A,
        cuerpo: "comite",
        materia: "Convenio de pago de la unidad 102 (Ley 21.442 art. 6)",
        folio: "AD-2026-8002",
        estado: "aprobado",
        quorumRequerido: "un_voto_por_miembro",
        resueltoEn: new Date("2026-02-10T12:00:00.000Z"),
        creadoPor: "conv-usuario-admin",
      },
      {
        id: ACUERDO_ABIERTO,
        comunidadId: COM_A,
        cuerpo: "comite",
        materia: "Convenio de pago que el comité todavía no votó",
        folio: "AD-2026-8003",
        estado: "abierto",
        quorumRequerido: "un_voto_por_miembro",
        creadoPor: "conv-usuario-admin",
      },
      {
        id: ACUERDO_ASAMBLEA,
        comunidadId: COM_A,
        cuerpo: "asamblea",
        materia: "Convenio aprobado por la asamblea y no por el comité",
        folio: "AD-2026-8004",
        estado: "aprobado",
        quorumRequerido: "mayoria_absoluta_derechos",
        resueltoEn: new Date("2026-02-10T12:00:00.000Z"),
        creadoPor: "conv-usuario-admin",
      },
      {
        id: ACUERDO_OTRA_COMUNIDAD,
        comunidadId: COM_B,
        cuerpo: "comite",
        materia: "Convenio de pago de la otra comunidad",
        folio: "AD-2026-8100",
        estado: "aprobado",
        quorumRequerido: "un_voto_por_miembro",
        resueltoEn: new Date("2026-02-10T12:00:00.000Z"),
        creadoPor: "conv-usuario-admin",
      },
    ]
    for (const a of acuerdos) {
      await prisma.acuerdo.upsert({
        where: { id: a.id },
        update: { estado: a.estado },
        create: a,
      })
    }

    // Convenio de la comunidad B, escrito directo en la base: ningún scope de la
    // sesión (que es de A) puede leerlo por la API.
    await prisma.convenioPago.upsert({
      where: { id: CONVENIO_COM_B },
      update: {},
      create: {
        id: CONVENIO_COM_B,
        comunidadId: COM_B,
        unidadId: U_OTRA_PAGO,
        personaId: P_OTRA,
        acuerdoId: ACUERDO_OTRA_COMUNIDAD,
        montoTotal: 500_000,
        numeroCuotas: 2,
        fechaSuscripcion: new Date("2026-02-15T12:00:00.000Z"),
        primeraCuota: 100_000,
        estado: "vigente",
        creadoPor: "conv-usuario-admin",
      },
    })

    const usuarios = [
      { id: "conv-usuario-admin", email: EMAIL_ADMIN, comunidadId: COM_A, rol: "administrador" },
      { id: "conv-usuario-comite", email: EMAIL_COMITE, comunidadId: COM_A, rol: "comite" },
      { id: "conv-usuario-residente", email: EMAIL_RESIDENTE, comunidadId: COM_A, rol: "residente" },
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
      await prisma.cuotaConvenio.deleteMany({
        where: { comunidadId: { in: [COM_A, COM_B] } },
      })
      await prisma.convenioPago.deleteMany({
        where: { comunidadId: { in: [COM_A, COM_B] } },
      })
      await prisma.votoAcuerdo.deleteMany({
        where: { comunidadId: { in: [COM_A, COM_B] } },
      })
      await prisma.acuerdo.deleteMany({
        where: { comunidadId: { in: [COM_A, COM_B] } },
      })
      await prisma.unidad.deleteMany({ where: { comunidadId: { in: [COM_A, COM_B] } } })
      await prisma.persona.deleteMany({ where: { comunidadId: { in: [COM_A, COM_B] } } })
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

  async function POST_CONVENIO(body: unknown): Promise<Response> {
    const { coleccion } = await cargaModulos()
    return coleccion.POST(
      new NextRequest("http://localhost/api/convenios", {
        method: "POST",
        body: JSON.stringify(body),
        headers: { "content-type": "application/json" },
      })
    )
  }

  async function POST_PAGO(body: unknown): Promise<Response> {
    const { pago } = await cargaModulos()
    return pago.POST(
      new NextRequest("http://localhost/api/convenios/pago", {
        method: "POST",
        body: JSON.stringify(body),
        headers: { "content-type": "application/json" },
      })
    )
  }

  async function GET_CONVENIOS(
    url = "http://localhost/api/convenios"
  ): Promise<Response> {
    const { coleccion } = await cargaModulos()
    return coleccion.GET(new NextRequest(url, { method: "GET" }))
  }

  const terminos = (extra: Record<string, unknown> = {}) => ({
    unidadId: U1,
    personaId: P1,
    acuerdoId: ACUERDO_OK,
    montoTotal: 1_000_000,
    numeroCuotas: 3,
    primeraCuota: 333_333,
    ...extra,
  })

  /** Alta de un convenio por la API con la sesión de la administración. */
  async function crearConvenio(body: Record<string, unknown>): Promise<VistaConvenio> {
    let creado: VistaConvenio | null = null
    await conSesion(EMAIL_ADMIN, async () => {
      const res = await POST_CONVENIO(body)
      expect(res.status).toBe(201)
      creado = (await res.json()) as VistaConvenio
    })
    if (!creado) throw new Error("no se pudo crear el convenio de prueba")
    return creado
  }

  it("401 sin sesión en las tres rutas", async () => {
    state.cookie = ""
    expect((await POST_CONVENIO(terminos())).status).toBe(401)
    expect((await POST_PAGO({ convenioId: "conv-inexistente", numero: 1 })).status).toBe(401)
    expect((await GET_CONVENIOS()).status).toBe(401)
  })

  it("un rol sin `fi:cobranza` no suscribe convenios ni registra pagos → 403 y cero filas", async () => {
    await conSesion(EMAIL_RESIDENTE, async () => {
      const alta = await POST_CONVENIO(terminos())
      expect(alta.status).toBe(403)
      const pago = await POST_PAGO({ convenioId: "conv-inexistente", numero: 1 })
      expect(pago.status).toBe(403)
      // La lectura tampoco: el residente no ve la deuda de las unidades ajenas.
      expect((await GET_CONVENIOS()).status).toBe(403)
    })
    expect(await prisma.convenioPago.count({ where: { comunidadId: COM_A } })).toBe(0)
    expect(await prisma.cuotaConvenio.count({ where: { comunidadId: COM_A } })).toBe(0)
  })

  it("sin acuerdo aprobado del Comité el alta es 400 con su motivo y no deja filas", async () => {
    await conSesion(EMAIL_ADMIN, async () => {
      const inexistente = await POST_CONVENIO(
        terminos({ acuerdoId: "conv-ac-fantasma" })
      )
      expect(inexistente.status).toBe(400)
      expect(((await inexistente.json()) as { error: string }).error).toBe(
        "No se puede suscribir el convenio: el acuerdo del Comité no existe en esta comunidad."
      )

      const abierto = await POST_CONVENIO(terminos({ acuerdoId: ACUERDO_ABIERTO }))
      expect(abierto.status).toBe(400)
      expect(((await abierto.json()) as { error: string }).error).toBe(
        "No se puede suscribir el convenio: el acuerdo no está aprobado."
      )

      // La ley pide acuerdo del COMITÉ: uno de asamblea no autoriza el convenio.
      const asamblea = await POST_CONVENIO(terminos({ acuerdoId: ACUERDO_ASAMBLEA }))
      expect(asamblea.status).toBe(400)
      expect(((await asamblea.json()) as { error: string }).error).toBe(
        "No se puede suscribir el convenio: el acuerdo no es del Comité."
      )

      // El acuerdo de otra comunidad no existe para este scope.
      const ajeno = await POST_CONVENIO(terminos({ acuerdoId: ACUERDO_OTRA_COMUNIDAD }))
      expect(ajeno.status).toBe(400)
      expect(((await ajeno.json()) as { error: string }).error).toBe(
        "No se puede suscribir el convenio: el acuerdo del Comité no existe en esta comunidad."
      )
    })
    expect(await prisma.convenioPago.count({ where: { comunidadId: COM_A } })).toBe(0)
    expect(await prisma.cuotaConvenio.count({ where: { comunidadId: COM_A } })).toBe(0)
  })

  it("la unidad y el deudor se resuelven en la comunidad: el ajeno es 404 y no persiste", async () => {
    await conSesion(EMAIL_ADMIN, async () => {
      const unidadAjena = await POST_CONVENIO(terminos({ unidadId: U_OTRA, personaId: P_OTRA }))
      expect(unidadAjena.status).toBe(404)
      expect(((await unidadAjena.json()) as { error: string }).error).toBe(
        "Unidad no encontrada."
      )

      const personaAjena = await POST_CONVENIO(terminos({ personaId: P_OTRA }))
      expect(personaAjena.status).toBe(404)
      expect(((await personaAjena.json()) as { error: string }).error).toBe(
        "Persona no encontrada."
      )
    })
    expect(await prisma.convenioPago.count({ where: { comunidadId: COM_A } })).toBe(0)
  })

  it("el alta exige los términos del convenio → 400 por zod sin escribir", async () => {
    await conSesion(EMAIL_ADMIN, async () => {
      const sinCuotas = await POST_CONVENIO(terminos({ numeroCuotas: 0 }))
      expect(sinCuotas.status).toBe(400)
      expect(((await sinCuotas.json()) as { error: string }).error).toBe(
        "Datos inválidos."
      )

      // La primera cuota se paga al suscribir: no puede superar la deuda.
      const primeraMayor = await POST_CONVENIO(terminos({ primeraCuota: 1_500_000 }))
      expect(primeraMayor.status).toBe(400)

      const primeraCero = await POST_CONVENIO(terminos({ primeraCuota: 0 }))
      expect(primeraCero.status).toBe(400)
    })
    expect(await prisma.convenioPago.count({ where: { comunidadId: COM_A } })).toBe(0)
  })

  it("con acuerdo aprobado del Comité el alta es 201: primera cuota pagada y N cuotas que suman el saldo", async () => {
    const creado = await crearConvenio(terminos())

    const enBd = await prisma.convenioPago.findUnique({
      where: { id: creado.id },
      include: { cuotas: { orderBy: { numero: "asc" } } },
    })
    expect(enBd).not.toBeNull()
    expect(enBd?.comunidadId).toBe(COM_A)
    expect(enBd?.unidadId).toBe(U1)
    expect(enBd?.personaId).toBe(P1)
    expect(enBd?.acuerdoId).toBe(ACUERDO_OK)
    expect(enBd?.estado).toBe("vigente")
    expect(enBd?.numeroCuotas).toBe(3)
    expect(enBd?.montoTotal).toBe(1_000_000)
    expect(enBd?.primeraCuota).toBe(333_333)
    expect(enBd?.creadoPor).toBe("conv-usuario-admin")

    const cuotas = enBd?.cuotas ?? []
    // Cuota 0 = el pago al suscribir, pagada el mismo día de la firma.
    expect(cuotas.map((cuota) => cuota.numero)).toEqual([0, 1, 2, 3])
    const primera = cuotas[0]!
    expect(primera.estado).toBe("pagada")
    expect(primera.monto).toBe(333_333)
    expect(primera.pagadaEn).not.toBeNull()
    expect(primera.registradaPor).toBe("conv-usuario-admin")
    expect(primera.venceEn.getTime()).toBe(enBd?.fechaSuscripcion.getTime())

    // Las cuotas del saldo nacen pendientes, con su vencimiento mensual creciente.
    const deuda = cuotas.slice(1)
    expect(deuda.map((cuota) => cuota.estado)).toEqual([
      "pendiente",
      "pendiente",
      "pendiente",
    ])
    expect(deuda.every((cuota) => cuota.pagadaEn === null)).toBe(true)
    for (let i = 1; i < deuda.length; i++) {
      expect(deuda[i]!.venceEn.getTime()).toBeGreaterThan(deuda[i - 1]!.venceEn.getTime())
    }

    // El saldo se reparte exacto al centavo (residuo en la última cuota).
    const saldo = deuda.reduce((suma, cuota) => suma + centavos(cuota.monto), 0)
    expect(saldo).toBe(centavos(1_000_000) - centavos(333_333))
    expect(deuda.map((cuota) => centavos(cuota.monto))).toEqual([
      22_222_233, 22_222_233, 22_222_234,
    ])

    // La respuesta trae la misma vista con los totales derivados.
    expect(creado.estado).toBe("vigente")
    expect(creado.cuotas.map((cuota) => cuota.numero)).toEqual([0, 1, 2, 3])
    expect(centavos(creado.totales.pagado)).toBe(centavos(333_333))
    expect(centavos(creado.totales.pendiente)).toBe(centavos(666_667))

    // El alta queda auditada con el monto y el folio del acuerdo que la autoriza.
    const evento = await prisma.eventoAuditoria.findFirst({
      where: {
        comunidadId: COM_A,
        tipoAccion: "FI_CONVENIO_CREADO",
        referenciaId: creado.id,
      },
    })
    expect(evento).not.toBeNull()
    expect(evento?.categoria).toBe("FI")
    expect(evento?.descripcion).toContain("AD-2026-8001")
    expect(evento?.descripcion).toContain("1.000.000")
  })

  it("una unidad no puede tener dos convenios vigentes: 409 y una sola fila", async () => {
    const antes = await prisma.convenioPago.count({ where: { comunidadId: COM_A, unidadId: U1 } })
    expect(antes).toBe(1)

    await conSesion(EMAIL_ADMIN, async () => {
      const res = await POST_CONVENIO(terminos({ montoTotal: 500_000, primeraCuota: 100_000 }))
      expect(res.status).toBe(409)
      expect(((await res.json()) as { error: string }).error).toBe(
        "La unidad ya tiene un convenio de pago vigente."
      )
    })

    expect(
      await prisma.convenioPago.count({ where: { comunidadId: COM_A, unidadId: U1 } })
    ).toBe(1)
    // El rechazo no dejó cuotas huérfanas.
    expect(await prisma.cuotaConvenio.count({ where: { comunidadId: COM_A } })).toBe(4)
  })

  it("pagar todas las cuotas deja el convenio saldado y audita cada pago", async () => {
    const convenio = await prisma.convenioPago.findFirst({ where: { comunidadId: COM_A } })
    expect(convenio).not.toBeNull()
    const convenioId = convenio!.id

    for (const numero of [1, 2, 3]) {
      await conSesion(EMAIL_ADMIN, async () => {
        const res = await POST_PAGO({ convenioId, numero })
        expect(res.status).toBe(200)
        const j = (await res.json()) as {
          cuotaPagada: number
          estado: string
          totales: { pagado: number; pendiente: number }
        }
        expect(j.cuotaPagada).toBe(numero)
        // Mientras queden cuotas pendientes el convenio sigue vigente.
        expect(j.estado).toBe(numero === 3 ? "saldado" : "vigente")
        if (numero === 3) expect(centavos(j.totales.pendiente)).toBe(0)
      })
    }

    const enBd = await prisma.convenioPago.findUnique({
      where: { id: convenioId },
      include: { cuotas: { orderBy: { numero: "asc" } } },
    })
    expect(enBd?.estado).toBe("saldado")
    const cuotas = enBd?.cuotas ?? []
    expect(cuotas.every((cuota) => cuota.estado === "pagada")).toBe(true)
    expect(cuotas.every((cuota) => cuota.pagadaEn !== null)).toBe(true)
    expect(cuotas.every((cuota) => cuota.registradaPor === "conv-usuario-admin")).toBe(true)
    const pagado = cuotas.reduce((suma, cuota) => suma + centavos(cuota.monto), 0)
    expect(pagado).toBe(centavos(1_000_000))

    const eventos = await prisma.eventoAuditoria.findMany({
      where: { comunidadId: COM_A, tipoAccion: "FI_CONVENIO_PAGO" },
    })
    expect(eventos).toHaveLength(3)
    expect(eventos.every((evento) => evento.referenciaId === convenioId)).toBe(true)
  })

  it("una cuota ya pagada no se vuelve a pagar: 409 sin tocar la fila", async () => {
    const convenio = await prisma.convenioPago.findFirst({ where: { comunidadId: COM_A } })
    const convenioId = convenio!.id
    const antes = await prisma.cuotaConvenio.findFirst({
      where: { convenioId, numero: 1 },
    })
    expect(antes?.estado).toBe("pagada")

    await conSesion(EMAIL_ADMIN, async () => {
      const res = await POST_PAGO({ convenioId, numero: 1 })
      expect(res.status).toBe(409)
      expect(((await res.json()) as { error: string }).error).toBe(
        "La cuota ya está pagada."
      )

      // La cuota 0 (el pago al suscribir) también nace pagada.
      const primera = await POST_PAGO({ convenioId, numero: 0 })
      expect(primera.status).toBe(409)
    })

    const despues = await prisma.cuotaConvenio.findFirst({
      where: { convenioId, numero: 1 },
    })
    expect(despues?.pagadaEn?.getTime()).toBe(antes?.pagadaEn?.getTime())
    expect(
      await prisma.eventoAuditoria.count({
        where: { comunidadId: COM_A, tipoAccion: "FI_CONVENIO_PAGO" },
      })
    ).toBe(3)
  })

  it("el pago de un convenio o una cuota ajenos es 404", async () => {
    await conSesion(EMAIL_ADMIN, async () => {
      const convenioAjeno = await POST_PAGO({ convenioId: "conv-inexistente", numero: 1 })
      expect(convenioAjeno.status).toBe(404)
      expect(((await convenioAjeno.json()) as { error: string }).error).toBe(
        "Convenio no encontrado."
      )

      const convenio = await prisma.convenioPago.findFirst({ where: { comunidadId: COM_A } })
      const cuotaAjena = await POST_PAGO({ convenioId: convenio!.id, numero: 99 })
      expect(cuotaAjena.status).toBe(404)
      expect(((await cuotaAjena.json()) as { error: string }).error).toBe(
        "Cuota no encontrada."
      )
    })
  })

  it("la lectura devuelve los convenios con sus cuotas y los totales pagado/pendiente", async () => {
    // Segundo convenio (otra unidad): queda vigente con deuda pendiente.
    const segundo = await crearConvenio(
      terminos({
        unidadId: U2,
        personaId: P2,
        acuerdoId: ACUERDO_OK_U2,
        montoTotal: 400_000,
        numeroCuotas: 2,
        primeraCuota: 100_000,
      })
    )

    await conSesion(EMAIL_COMITE, async () => {
      const res = await GET_CONVENIOS("http://localhost/api/convenios?comunidadId=conv-com-b")
      expect(res.status).toBe(200)
      const j = (await res.json()) as {
        data: Array<{
          id: string
          estado: string
          unidadId: string
          cuotas: Array<{ numero: number; estado: string }>
          totales: { pagado: number; pendiente: number }
        }>
        total: number
      }

      expect(j.total).toBe(await prisma.convenioPago.count({ where: { comunidadId: COM_A } }))
      expect(j.data).toHaveLength(j.total)
      // El `comunidadId` de la URL no mueve el alcance: es la comunidad de la sesión.
      expect(j.data.every((convenio) => [U1, U2].includes(convenio.unidadId))).toBe(true)
      // El convenio de la comunidad B no aparece, y su unidad tampoco.
      expect(j.data.map((convenio) => convenio.id)).not.toContain(CONVENIO_COM_B)
      expect(j.data.map((convenio) => convenio.unidadId)).not.toContain(U_OTRA_PAGO)

      const saldado = j.data.find((convenio) => convenio.unidadId === U1)
      expect(saldado?.estado).toBe("saldado")
      expect(centavos(saldado?.totales.pendiente ?? -1)).toBe(0)
      expect(centavos(saldado?.totales.pagado ?? -1)).toBe(centavos(1_000_000))
      expect(saldado?.cuotas).toHaveLength(4)

      const vigente = j.data.find((convenio) => convenio.id === segundo.id)
      expect(vigente?.estado).toBe("vigente")
      // La cuota 0 nace pagada: el primer pago del convenio ya está en la base.
      expect(centavos(vigente?.totales.pagado ?? -1)).toBe(centavos(100_000))
      expect(centavos(vigente?.totales.pendiente ?? -1)).toBe(centavos(300_000))
      expect(
        centavos((vigente?.totales.pagado ?? 0) + (vigente?.totales.pendiente ?? 0))
      ).toBe(centavos(400_000))
    })
  })
})
