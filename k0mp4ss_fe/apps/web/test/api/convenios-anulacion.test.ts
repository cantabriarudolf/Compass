/**
 * @vitest-environment node
 *
 * F29 · S1 — la anulación del convenio de pago ANULA, no borra.
 *
 * El convenio se anula con `fi:cobranza` editar y un motivo obligatorio, y el
 * acto no se repite: es un estado del convenio, no un borrado. Las reglas que se
 * fijan acá, todo observable por la API y por la base:
 *
 *   1. sin sesión no se toca nada (401) y un rol sin `fi:cobranza` editar no
 *      anula (403, cero filas);
 *   2. el convenio de OTRA comunidad no existe (404) —y el 404 corre ANTES del
 *      409 por estado y del 400 por motivo: mirar el id ajeno no revela ni su
 *      estado ni si el pedido tenía motivo;
 *   3. un convenio `saldado` no se anula: 409, es historia (la plata entró); un
 *      convenio ya anulado tampoco (409);
 *   4. sin motivo no se anula: 400 con su mensaje literal, y la base no cambia;
 *   5. la anulación que sí aplica: el convenio queda `anulado`, las cuotas
 *      IMPAGAS pasan a `anulada` (no se borran), las PAGADAS quedan pagadas
 *      (esa plata entró), los cargos FI de las cuotas anuladas quedan en el
 *      libro con su marca `anuladoEn` —los pagados sin ella— y el evento
 *      `FI_CONVENIO_ANULADO` guarda el motivo y el conteo de cuotas anuladas.
 *
 * Todo en UNA transacción como el pago (`/api/convenios/pago`, el molde): la
 * vista que responde la ruta se rearma desde la base dentro de ella.
 *
 * Cada caso crea su convenio en SU unidad —el alta exige «un solo convenio
 * vigente por unidad» y así ningún caso depende de que el anterior lo haya
 * saldado o anulado.
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

const COM_A = "anul-com-a"
const COM_B = "anul-com-b"

/** Una unidad por caso: el alta no permite dos convenios vigentes por unidad. */
const U1 = "anul-u-1"
const U2 = "anul-u-2"
const U3 = "anul-u-3"
const U4 = "anul-u-4"
const U5 = "anul-u-5"
const U_OTRA = "anul-u-otra"

/** P1 es el propietario vigente de las cinco unidades de los casos. */
const P1 = "anul-p-1"
const P_OTRA = "anul-p-otra"

const FONDO_A = "anul-fondo-gc-a"
const FONDO_B = "anul-fondo-gc-b"

/** Acuerdo del Comité que autoriza los convenios de A. */
const ACUERDO_A = "anul-ac-a"
/** Acuerdo del Comité de B, para el convenio ajeno que se planta en la base. */
const ACUERDO_B = "anul-ac-b"

const EMAIL_ADMIN = "anul-admin@test.cl"
const EMAIL_ADMIN_B = "anul-admin-b@test.cl"
const EMAIL_RESIDENTE = "anul-residente@test.cl"

/**
 * Convenio de la comunidad B con estado `saldado`, escrito DIRECTO en la base
 * (mismo criterio del arnés de `convenios.test.ts`): ninguna sesión de A puede
 * verlo, y su estado saldado sirve para probar que el 404 de la comunidad ajena
 * corre ANTES del 409 —si el orden fuera al revés, el id ajeno revelaría «este
 * convenio está saldado» en lugar de «no existe acá».
 */
const CONVENIO_SALDADO_B = "anul-convenio-b-saldado"

/** Mensajes LITERALES de la ruta: el contrato exacto de cada compuerta. */
const MENSAJE_SALDADO = "El convenio está saldado: su historia no se anula."
const MENSAJE_YA_ANULADO = "El convenio ya está anulado."
const MENSAJE_SIN_MOTIVO = "El motivo de la anulación es obligatorio."

function datosPersona(
  id: string,
  comunidadId: string,
  rut: string,
  nombre: string,
  email: string,
  roles: string[] = ["propietario"]
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
    roles,
  }
}

function datosUnidad(id: string, comunidadId: string, numero: string) {
  return {
    id,
    comunidadId,
    microSectorId: `anul-ms-${numero}`,
    numero,
    etiqueta: "Depto",
    tipoUnidadId: "anul-tu-1",
    metraje: 50,
    prorrateo: 10,
    rolSii: `anul-${numero}`,
    estadoId: "habitada",
    servicios: {},
  }
}

describe("POST /api/convenios/anular — la anulación anula, no borra (F29 · S1)", () => {
  beforeAll(async () => {
    process.env.AUTH_SECRET = AUTH_SECRET

    for (const c of [
      { id: COM_A, nombre: "Comunidad Anulacion A", slug: "anul-com-a" },
      { id: COM_B, nombre: "Comunidad Anulacion B", slug: "anul-com-b" },
    ]) {
      await prisma.comunidad.upsert({ where: { id: c.id }, update: {}, create: c })
    }

    for (const fondo of [
      { id: FONDO_A, comunidadId: COM_A, nombre: "Fondo de Gasto Común", tipo: "gasto_comun", activo: true },
      { id: FONDO_B, comunidadId: COM_B, nombre: "Fondo de Gasto Común", tipo: "gasto_comun", activo: true },
    ]) {
      await prisma.fondoFI.upsert({ where: { id: fondo.id }, update: {}, create: fondo })
    }

    for (const p of [
      datosPersona(P1, COM_A, "19111111-1", "Deudor Anulable", "anul-p1@test.cl"),
      datosPersona(P_OTRA, COM_B, "19333333-3", "Deudor Ajeno", "anul-p-otra@test.cl"),
    ]) {
      await prisma.persona.upsert({ where: { id: p.id }, update: {}, create: p })
    }

    for (const u of [
      datosUnidad(U1, COM_A, "101"),
      datosUnidad(U2, COM_A, "102"),
      datosUnidad(U3, COM_A, "103"),
      datosUnidad(U4, COM_A, "104"),
      datosUnidad(U5, COM_A, "105"),
      datosUnidad(U_OTRA, COM_B, "901"),
    ]) {
      await prisma.unidad.upsert({ where: { id: u.id }, update: {}, create: u })
    }

    for (const v of [
      { id: "anul-v-p1-u1", unidadId: U1 },
      { id: "anul-v-p1-u2", unidadId: U2 },
      { id: "anul-v-p1-u3", unidadId: U3 },
      { id: "anul-v-p1-u4", unidadId: U4 },
      { id: "anul-v-p1-u5", unidadId: U5 },
      { id: "anul-v-otra", unidadId: U_OTRA, personaId: P_OTRA, comunidadId: COM_B },
    ].map((v) => ({
      id: v.id,
      comunidadId: v.comunidadId ?? COM_A,
      personaId: v.personaId ?? P1,
      unidadId: v.unidadId,
      rol: "propietario",
      fechaInicio: "2024-01-01",
      fechaFin: null,
    }))) {
      await prisma.vinculoUnidad.upsert({
        where: { id: v.id },
        update: {},
        create: { ...v, permiteVerFinanzas: true },
      })
    }

    for (const a of [
      {
        id: ACUERDO_A,
        comunidadId: COM_A,
        cuerpo: "comite",
        materia: "Convenio de pago de la unidad 101 (Ley 21.442 art. 6)",
        folio: "AD-2026-9001",
        estado: "aprobado",
        quorumRequerido: "un_voto_por_miembro",
        resueltoEn: new Date("2026-02-10T12:00:00.000Z"),
        creadoPor: "anul-usuario-admin",
      },
      {
        id: ACUERDO_B,
        comunidadId: COM_B,
        cuerpo: "comite",
        materia: "Convenio de pago de la otra comunidad",
        folio: "AD-2026-9100",
        estado: "aprobado",
        quorumRequerido: "un_voto_por_miembro",
        resueltoEn: new Date("2026-02-10T12:00:00.000Z"),
        creadoPor: "anul-usuario-admin-b",
      },
    ]) {
      await prisma.acuerdo.upsert({ where: { id: a.id }, update: {}, create: a })
    }

    // El convenio ajeno `saldado` de B, directo en la base.
    await prisma.convenioPago.upsert({
      where: { id: CONVENIO_SALDADO_B },
      update: { estado: "saldado" },
      create: {
        id: CONVENIO_SALDADO_B,
        comunidadId: COM_B,
        unidadId: U_OTRA,
        personaId: P_OTRA,
        acuerdoId: ACUERDO_B,
        montoTotal: 400_000,
        numeroCuotas: 2,
        fechaSuscripcion: new Date("2026-02-15T12:00:00.000Z"),
        primeraCuota: 100_000,
        estado: "saldado",
        creadoPor: "anul-usuario-admin-b",
      },
    })

    const usuarios = [
      { id: "anul-usuario-admin", email: EMAIL_ADMIN, comunidadId: COM_A, rol: "administrador" },
      { id: "anul-usuario-admin-b", email: EMAIL_ADMIN_B, comunidadId: COM_B, rol: "administrador" },
      { id: "anul-usuario-residente", email: EMAIL_RESIDENTE, comunidadId: COM_A, rol: "residente" },
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
      await prisma.cobroFI.deleteMany({ where: { comunidadId: { in: [COM_A, COM_B] } } })
      await prisma.cuotaConvenio.deleteMany({ where: { comunidadId: { in: [COM_A, COM_B] } } })
      await prisma.convenioPago.deleteMany({ where: { comunidadId: { in: [COM_A, COM_B] } } })
      await prisma.eventoAuditoria.deleteMany({ where: { comunidadId: { in: [COM_A, COM_B] } } })
      await prisma.acuerdo.deleteMany({ where: { comunidadId: { in: [COM_A, COM_B] } } })
      await prisma.vinculoUnidad.deleteMany({ where: { comunidadId: { in: [COM_A, COM_B] } } })
      await prisma.unidad.deleteMany({ where: { comunidadId: { in: [COM_A, COM_B] } } })
      await prisma.persona.deleteMany({ where: { comunidadId: { in: [COM_A, COM_B] } } })
      await prisma.fondoFI.deleteMany({ where: { comunidadId: { in: [COM_A, COM_B] } } })
      await prisma.membresia.deleteMany({ where: { comunidadId: { in: [COM_A, COM_B] } } })
      await prisma.usuario.deleteMany({
        where: { email: { in: [EMAIL_ADMIN, EMAIL_ADMIN_B, EMAIL_RESIDENTE] } },
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

  async function POST_ANULAR(body: unknown): Promise<Response> {
    const { POST } = await import("@/app/api/convenios/anular/route")
    return POST(
      new NextRequest("http://localhost/api/convenios/anular", {
        method: "POST",
        body: JSON.stringify(body),
        headers: { "content-type": "application/json" },
      })
    )
  }

  async function POST_CONVENIO(body: unknown): Promise<Response> {
    const { POST } = await import("@/app/api/convenios/route")
    return POST(
      new NextRequest("http://localhost/api/convenios", {
        method: "POST",
        body: JSON.stringify(body),
        headers: { "content-type": "application/json" },
      })
    )
  }

  async function POST_PAGO(body: unknown): Promise<Response> {
    const { POST } = await import("@/app/api/convenios/pago/route")
    return POST(
      new NextRequest("http://localhost/api/convenios/pago", {
        method: "POST",
        body: JSON.stringify(body),
        headers: { "content-type": "application/json" },
      })
    )
  }

  /** Alta del convenio de UNA unidad por la API (el trámite real, no a mano). */
  async function crearConvenio(unidadId: string): Promise<string> {
    let id: string | null = null
    await conSesion(EMAIL_ADMIN, async () => {
      const res = await POST_CONVENIO({
        unidadId,
        personaId: P1,
        acuerdoId: ACUERDO_A,
        montoTotal: 300_000,
        numeroCuotas: 3,
        primeraCuota: 100_000,
      })
      expect(res.status).toBe(201)
      id = ((await res.json()) as { id: string }).id
    })
    if (!id) throw new Error(`no se pudo crear el convenio de prueba de ${unidadId}`)
    return id
  }

  /** Paga UNA cuota por la ruta de pago (el mismo trámite de la pantalla). */
  async function pagarCuota(convenioId: string, numero: number): Promise<void> {
    await conSesion(EMAIL_ADMIN, async () => {
      const res = await POST_PAGO({ convenioId, numero })
      expect(res.status).toBe(200)
    })
  }

  it("401 sin sesión y 403 para un rol sin `fi:cobranza` editar (cero filas tocadas)", async () => {
    state.cookie = ""
    expect(
      (await POST_ANULAR({ convenioId: "anul-inexistente", motivo: "algun motivo" })).status
    ).toBe(401)

    const id = await crearConvenio(U1)
    await conSesion(EMAIL_RESIDENTE, async () => {
      const res = await POST_ANULAR({ convenioId: id, motivo: "no llegué a pagar" })
      expect(res.status).toBe(403)
      expect(((await res.json()) as { error: string }).error).toBe("Permiso denegado.")
    })

    // El rechazo no toca el convenio ni deja rastro de anulación.
    const despues = await prisma.convenioPago.findUnique({
      where: { id },
      select: { estado: true },
    })
    expect(despues?.estado).toBe("vigente")
    expect(
      await prisma.eventoAuditoria.count({
        where: { comunidadId: COM_A, tipoAccion: "FI_CONVENIO_ANULADO", referenciaId: id },
      })
    ).toBe(0)
  })

  it("el convenio de otra comunidad es 404 ANTES del 409 por estado y del 400 por motivo", async () => {
    // El convenio ajeno está SALDADO: si el 409 corriera antes, el id ajeno
    // revelaría su estado. Con motivo válido y sin motivo, la respuesta es 404.
    await conSesion(EMAIL_ADMIN, async () => {
      const conMotivo = await POST_ANULAR({
        convenioId: CONVENIO_SALDADO_B,
        motivo: "intentar anular lo ajeno",
      })
      expect(conMotivo.status).toBe(404)
      expect(((await conMotivo.json()) as { error: string }).error).toBe(
        "Convenio no encontrado."
      )

      const sinMotivo = await POST_ANULAR({ convenioId: CONVENIO_SALDADO_B })
      expect(sinMotivo.status).toBe(404)
    })

    // El convenio ajeno no cambió.
    const ajeno = await prisma.convenioPago.findUnique({
      where: { id: CONVENIO_SALDADO_B },
      select: { estado: true },
    })
    expect(ajeno?.estado).toBe("saldado")
  })

  it("anula el convenio vigente: impagas → anulada, pagadas quedan pagadas, cargos marcados y evento con el conteo", async () => {
    const id = await crearConvenio(U2)
    // La cuota 1 se paga POR LA RUTA DE PAGO (no a mano): quedan 2 impagas.
    await pagarCuota(id, 1)

    const cuotasAntes = await prisma.cuotaConvenio.findMany({
      where: { convenioId: id },
      orderBy: { numero: "asc" },
      select: { numero: true, estado: true },
    })
    expect(cuotasAntes.map((c) => c.estado)).toEqual([
      "pagada",
      "pagada",
      "pendiente",
      "pendiente",
    ])

    const motivo = "El deudor se mudó y dejó de cumplir el plan acordado"
    // El cuerpo de la respuesta se captura en un contenedor: la asignación
    // dentro de la sesión es asíncrona y a un `let` suelto el typechecker no
    // le ve la escritura.
    const respuestaLeida: { cuerpo: Record<string, unknown> | null } = { cuerpo: null }
    await conSesion(EMAIL_ADMIN, async () => {
      const res = await POST_ANULAR({ convenioId: id, motivo })
      expect(res.status).toBe(200)
      respuestaLeida.cuerpo = (await res.json()) as Record<string, unknown>
    })
    const respuesta = respuestaLeida.cuerpo
    if (!respuesta) throw new Error("la ruta de anulación no respondió")

    // La vista que responde la ruta se rearma desde la base.
    expect(respuesta.estado).toBe("anulado")
    expect(respuesta.cuotasAnuladas).toBe(2)

    const enBd = await prisma.convenioPago.findUnique({
      where: { id },
      include: { cuotas: { orderBy: { numero: "asc" } } },
    })
    expect(enBd?.estado).toBe("anulado")
    // La pagada QUEDA pagada (esa plata entró); las impagas pasan a `anulada`,
    // sin borrarse: el libro conserva la traza.
    expect(enBd?.cuotas.map((c) => `${c.numero}:${c.estado}`)).toEqual([
      "0:pagada",
      "1:pagada",
      "2:anulada",
      "3:anulada",
    ])
    expect(enBd?.cuotas.find((c) => c.numero === 1)?.pagadaEn).not.toBeNull()

    // Los cargos FI de las cuotas anuladas quedan en el libro con su marca
    // `anuladoEn`; el de la cuota pagada NO (su cargo sigue siendo un cobro válido).
    const cargos = await prisma.cobroFI.findMany({
      where: { comunidadId: COM_A, origenModulo: "FI", origenRef: id },
      orderBy: { periodo: "asc" },
      select: { periodo: true, anuladoEn: true, pagos: true },
    })
    expect(cargos).toHaveLength(3)
    const periodos = enBd?.cuotas
      .filter((c) => c.numero >= 1)
      .map((c) => c.venceEn.toISOString().slice(0, 7))
    expect(cargos.map((c) => c.periodo)).toEqual(periodos)
    expect(cargos[0]?.anuladoEn).toBeNull()
    expect(cargos[0]?.pagos).not.toEqual([])
    expect(cargos[1]?.anuladoEn).not.toBeNull()
    expect(cargos[2]?.anuladoEn).not.toBeNull()

    // El evento guarda el motivo y el conteo de cuotas anuladas.
    const evento = await prisma.eventoAuditoria.findFirst({
      where: { comunidadId: COM_A, tipoAccion: "FI_CONVENIO_ANULADO", referenciaId: id },
    })
    expect(evento).not.toBeNull()
    expect(evento?.categoria).toBe("FI")
    expect(evento?.usuario).toBe("anul-usuario-admin")
    expect(evento?.descripcion).toContain(motivo)
    expect(evento?.descripcion).toContain("2")
  })

  it("un convenio saldado no se anula: 409; y el ya anulado tampoco: 409", async () => {
    // Saldado POR LA RUTA DE PAGO: se pagan las tres cuotas del saldo.
    const saldoId = await crearConvenio(U3)
    for (const numero of [1, 2, 3]) {
      await pagarCuota(saldoId, numero)
    }
    const saldado = await prisma.convenioPago.findUnique({
      where: { id: saldoId },
      select: { estado: true },
    })
    expect(saldado?.estado).toBe("saldado")

    await conSesion(EMAIL_ADMIN, async () => {
      const res = await POST_ANULAR({
        convenioId: saldoId,
        motivo: "no corresponde: ya está saldado",
      })
      expect(res.status).toBe(409)
      expect(((await res.json()) as { error: string }).error).toBe(MENSAJE_SALDADO)
    })
    expect(
      await prisma.eventoAuditoria.count({
        where: { comunidadId: COM_A, tipoAccion: "FI_CONVENIO_ANULADO", referenciaId: saldoId },
      })
    ).toBe(0)

    // El ya anulado: este caso anula una vez (200) y lo intenta otra (409).
    const anulableId = await crearConvenio(U4)
    await conSesion(EMAIL_ADMIN, async () => {
      const primera = await POST_ANULAR({
        convenioId: anulableId,
        motivo: "primera anulación de la unidad 104",
      })
      expect(primera.status).toBe(200)

      const segunda = await POST_ANULAR({ convenioId: anulableId, motivo: "segunda vez" })
      expect(segunda.status).toBe(409)
      expect(((await segunda.json()) as { error: string }).error).toBe(MENSAJE_YA_ANULADO)
    })

    // La primera anulación dejó SU evento; el reintento no duplicó nada.
    expect(
      await prisma.eventoAuditoria.count({
        where: { comunidadId: COM_A, tipoAccion: "FI_CONVENIO_ANULADO", referenciaId: anulableId },
      })
    ).toBe(1)
  })

  it("sin motivo no se anula: 400 literal y la base no cambia", async () => {
    const id = await crearConvenio(U5)

    await conSesion(EMAIL_ADMIN, async () => {
      const ausente = await POST_ANULAR({ convenioId: id })
      expect(ausente.status).toBe(400)
      expect(((await ausente.json()) as { error: string }).error).toBe(MENSAJE_SIN_MOTIVO)

      const vacio = await POST_ANULAR({ convenioId: id, motivo: "   " })
      expect(vacio.status).toBe(400)
      expect(((await vacio.json()) as { error: string }).error).toBe(MENSAJE_SIN_MOTIVO)
    })

    // El rechazo no escribe nada: el convenio sigue vigente y sin evento.
    const convenio = await prisma.convenioPago.findUnique({
      where: { id },
      include: { cuotas: { select: { estado: true } } },
    })
    expect(convenio?.estado).toBe("vigente")
    expect(convenio?.cuotas.every((c) => c.estado !== "anulada")).toBe(true)
    expect(
      await prisma.eventoAuditoria.count({
        where: { comunidadId: COM_A, tipoAccion: "FI_CONVENIO_ANULADO", referenciaId: id },
      })
    ).toBe(0)
    expect(
      await prisma.cobroFI.count({
        where: { comunidadId: COM_A, origenRef: id, anuladoEn: { not: null } },
      })
    ).toBe(0)
  })
})
