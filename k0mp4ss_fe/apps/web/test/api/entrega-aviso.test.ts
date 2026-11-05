/**
 * @vitest-environment node
 *
 * T6 aviso-de-cobro (S3) — la entrega del aviso y su registro. BD real.
 *
 * S3 pide dos cosas que no se pueden separar: el aviso SHALL quedar disponible
 * al residente en el VISOR y SHALL registrarse su entrega. La tercera pieza es
 * la que protege la honestidad del registro: sin emisor SMTP (F4) el correo
 * queda en cola y NUNCA se reporta como enviado. Este archivo fija el contrato
 * observable de `POST/GET /api/avisos-cobro/[id]/entrega`:
 *
 *   1. entregar crea la notificación que el residente ve (folio + período) Y el
 *      registro de entrega: el visor queda `entregado` porque esa fila existe;
 *   2. el destinatario es el propietario VIGENTE de la unidad; una unidad sin
 *      propietario vigente se rechaza nombrando la unidad y no escribe nada (ni
 *      siquiera una entrega vacía);
 *   3. el correo queda `pendiente` con el motivo (sin SMTP) y nunca
 *      `entregado`/`enviado`;
 *   4. re-entregar el mismo aviso a la misma persona y canal no duplica;
 *   5. el reenvío explícito agrega UN registro nuevo y queda auditado;
 *   6. el aviso de otra comunidad no se entrega ni se lee (404);
 *   7. sesión y permiso: 401 sin sesión, 403 del comité al entregar, lectura
 *      del historial permitida a quien audita.
 *
 * La entrega es una ACCIÓN EXPLÍCITA y no un efecto de la emisión: el papel se
 * emite una vez (T4) y puede entregarse, reenviarse o quedar sin entrega sin
 * reescribirlo. Ver `lib/entrega-aviso.ts`.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest"
import { NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"
import { hoyISO } from "@/lib/date-utils"

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

const COM_A = "ent-aviso-com-a"
const COM_B = "ent-aviso-com-b"
const PERIODO = "2026-09"

const FONDO_A = "ent-fondo-gc-a"
const FONDO_B = "ent-fondo-gc-b"

const U1 = "ent-u-1"
const U2 = "ent-u-2"
const U3 = "ent-u-3"
const UB = "ent-b-u-1"

const EMAIL_ADMIN = "ent-admin@test.cl"
const EMAIL_COMITE = "ent-comite@test.cl"
const EMAIL_ADMIN_B = "ent-admin-b@test.cl"

/** Propietario vigente de U1 (el que debe recibir el aviso). */
const PROPIETARIO_U1 = "ent-p-1"
/** Propietario anterior de U1: su vínculo está cerrado, no recibe. */
const PROPIETARIO_U1_ANTERIOR = "ent-p-0"
/** Ocupante de U2: arrendatario, no propietario. */
const ARRENDATARIO_U2 = "ent-p-2"
/** Propietario de U3 con vínculo CERRADO: la unidad quedó sin dueño vigente. */
const PROPIETARIO_U3 = "ent-p-3"

type Json = Record<string, unknown>
type Aviso = { id: string; folio: string; periodo: string; unidadId: string }

describe("/api/avisos-cobro/[id]/entrega — visor con prueba, correo en cola (S3)", () => {
  const cookies = new Map<string, string>()
  let avisoU1: Aviso
  let avisoU2: Aviso
  let avisoU3: Aviso
  let avisoB: Aviso

  async function como(
    email: string,
    fn: () => Promise<{ status: number; json: Json }>
  ): Promise<{ status: number; json: Json }> {
    const cookie = cookies.get(email)
    if (!cookie) throw new Error(`sin cookie de sesión para ${email}`)
    state.cookie = cookie
    try {
      return await fn()
    } finally {
      state.cookie = ""
    }
  }

  /** POST de entrega del aviso (la acción explícita de S3). */
  async function entregar(
    id: string,
    body: unknown = {}
  ): Promise<{ status: number; json: Json }> {
    const { POST } = await import("@/app/api/avisos-cobro/[id]/entrega/route")
    const res = await POST(
      new NextRequest(`http://localhost/api/avisos-cobro/${id}/entrega`, {
        method: "POST",
        body: JSON.stringify(body),
        headers: { "content-type": "application/json" },
      }),
      { params: Promise.resolve({ id }) }
    )
    return {
      status: res.status,
      json: (await res.json().catch(() => ({}))) as Json,
    }
  }

  /** GET del historial de entregas del aviso. */
  async function historial(id: string): Promise<{ status: number; json: Json }> {
    const { GET } = await import("@/app/api/avisos-cobro/[id]/entrega/route")
    const res = await GET(
      new NextRequest(`http://localhost/api/avisos-cobro/${id}/entrega`),
      { params: Promise.resolve({ id }) }
    )
    return {
      status: res.status,
      json: (await res.json().catch(() => ({}))) as Json,
    }
  }

  /** Emite el aviso por la ruta real: el folio y el período son los del papel. */
  async function emitir(
    email: string,
    body: { periodo: string; unidadId: string }
  ): Promise<Aviso> {
    const { status, json } = await como(email, async () => {
      const { POST } = await import("@/app/api/avisos-cobro/route")
      const res = await POST(
        new NextRequest("http://localhost/api/avisos-cobro", {
          method: "POST",
          body: JSON.stringify(body),
          headers: { "content-type": "application/json" },
        })
      )
      return {
        status: res.status,
        json: (await res.json().catch(() => ({}))) as Json,
      }
    })
    if (status !== 201) {
      throw new Error(`emisión de aviso falló (${status}): ${JSON.stringify(json)}`)
    }
    const avisos = json.avisos as Aviso[]
    const aviso = avisos[0]
    if (!aviso) throw new Error("la emisión no devolvió ningún aviso")
    return aviso
  }

  async function entregasDe(avisoId: string) {
    return prisma.envioAvisoCobro.findMany({
      where: { avisoId },
      orderBy: [{ canal: "asc" }],
    })
  }

  async function notificacionesDe(avisoId: string): Promise<number> {
    const aviso = await prisma.avisoCobro.findUnique({
      where: { id: avisoId },
      select: { folio: true },
    })
    return prisma.notificacion.count({
      where: { comunidadId: COM_A, asunto: { contains: aviso?.folio ?? avisoId } },
    })
  }

  async function limpiar(): Promise<void> {
    const comunidades = [COM_A, COM_B]
    await prisma.envioAvisoCobro.deleteMany({
      where: { comunidadId: { in: comunidades } },
    })
    await prisma.notificacion.deleteMany({
      where: { comunidadId: { in: comunidades } },
    })
    await prisma.eventoAuditoria.deleteMany({
      where: { comunidadId: { in: comunidades } },
    })
    await prisma.avisoCobro.deleteMany({
      where: { comunidadId: { in: comunidades } },
    })
    await prisma.cobroFI.deleteMany({ where: { comunidadId: { in: comunidades } } })
    await prisma.emisionGC.deleteMany({ where: { comunidadId: { in: comunidades } } })
    await prisma.fondoFI.deleteMany({ where: { comunidadId: { in: comunidades } } })
    await prisma.vinculoUnidad.deleteMany({
      where: { comunidadId: { in: comunidades } },
    })
    await prisma.unidad.deleteMany({ where: { comunidadId: { in: comunidades } } })
  }

  beforeAll(async () => {
    process.env.AUTH_SECRET = AUTH_SECRET
    process.env.NEXT_PUBLIC_APP_ENV = "development"
    vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 })

    for (const c of [
      { id: COM_A, nombre: "Comunidad Entrega A", slug: "ent-aviso-com-a" },
      { id: COM_B, nombre: "Comunidad Entrega B", slug: "ent-aviso-com-b" },
    ]) {
      await prisma.comunidad.upsert({ where: { id: c.id }, update: {}, create: c })
    }
    for (const u of [
      { id: "ent-user-admin", email: EMAIL_ADMIN },
      { id: "ent-user-comite", email: EMAIL_COMITE },
      { id: "ent-user-admin-b", email: EMAIL_ADMIN_B },
    ]) {
      await prisma.usuario.upsert({
        where: { email: u.email },
        update: { activo: true },
        create: { ...u, activo: true },
      })
    }
    const membresias = [
      { usuarioId: "ent-user-admin", comunidadId: COM_A, rol: "administrador" },
      { usuarioId: "ent-user-comite", comunidadId: COM_A, rol: "comite" },
      { usuarioId: "ent-user-admin-b", comunidadId: COM_B, rol: "administrador" },
    ]
    await prisma.membresia.deleteMany({
      where: { usuarioId: { in: membresias.map((m) => m.usuarioId) } },
    })
    for (const m of membresias) await prisma.membresia.create({ data: m })

    await limpiar()

    await prisma.fondoFI.create({
      data: {
        id: FONDO_A,
        comunidadId: COM_A,
        nombre: "Fondo Gasto Común Entrega",
        tipo: "gasto_comun",
        activo: true,
        saldoInicial: 100_000,
      },
    })
    await prisma.fondoFI.create({
      data: {
        id: FONDO_B,
        comunidadId: COM_B,
        nombre: "Fondo Gasto Común Entrega B",
        tipo: "gasto_comun",
        activo: true,
        saldoInicial: 0,
      },
    })

    for (const u of [
      { id: U1, comunidadId: COM_A, numero: "101", etiqueta: "Depto 101" },
      { id: U2, comunidadId: COM_A, numero: "102", etiqueta: "Depto 102" },
      { id: U3, comunidadId: COM_A, numero: "103", etiqueta: "Depto 103" },
      { id: UB, comunidadId: COM_B, numero: "201", etiqueta: "Depto 201" },
    ]) {
      await prisma.unidad.create({
        data: {
          ...u,
          microSectorId: "ent-ms-1",
          tipoUnidadId: "ent-tu-1",
          metraje: 60,
          prorrateo: 0.5,
          rolSii: `9999-${u.numero}`,
          estadoId: "ent-est-1",
          servicios: {},
        },
      })
    }

    // Dueño de registro: el propietario con `fechaFin` null. El vínculo anterior
    // de U1 está cerrado a propósito: no debe recibir el aviso nuevo.
    const vinculos = [
      {
        id: "ent-v-1-ant",
        comunidadId: COM_A,
        personaId: PROPIETARIO_U1_ANTERIOR,
        unidadId: U1,
        rol: "propietario",
        fechaInicio: "2024-01-01",
        fechaFin: "2026-01-31",
      },
      {
        id: "ent-v-1",
        comunidadId: COM_A,
        personaId: PROPIETARIO_U1,
        unidadId: U1,
        rol: "propietario",
        fechaInicio: "2026-02-01",
        fechaFin: null,
      },
      {
        id: "ent-v-2",
        comunidadId: COM_A,
        personaId: ARRENDATARIO_U2,
        unidadId: U2,
        rol: "arrendatario",
        fechaInicio: "2026-02-01",
        fechaFin: null,
      },
      {
        id: "ent-v-3",
        comunidadId: COM_A,
        personaId: PROPIETARIO_U3,
        unidadId: U3,
        rol: "propietario",
        fechaInicio: "2024-01-01",
        fechaFin: "2026-08-31",
      },
      {
        id: "ent-v-b",
        comunidadId: COM_B,
        personaId: "ent-b-p-1",
        unidadId: UB,
        rol: "propietario",
        fechaInicio: "2024-01-01",
        fechaFin: null,
      },
    ]
    for (const v of vinculos) {
      await prisma.vinculoUnidad.create({
        data: { ...v, permiteVerFinanzas: false },
      })
    }

    for (const e of [
      { id: "ent-egc-a", comunidadId: COM_A },
      { id: "ent-egc-b", comunidadId: COM_B },
    ]) {
      await prisma.emisionGC.create({
        data: {
          ...e,
          periodo: PERIODO,
          modo: "fijo",
          gastoTotal: 100_000,
          lineas: [],
          fechaEmision: `${PERIODO}-01`,
        },
      })
    }

    const cobros = [
      { id: "ent-cob-1", comunidadId: COM_A, unidadId: U1, fondoId: FONDO_A, montoBase: 60_000 },
      { id: "ent-cob-2", comunidadId: COM_A, unidadId: U2, fondoId: FONDO_A, montoBase: 30_000 },
      { id: "ent-cob-3", comunidadId: COM_A, unidadId: U3, fondoId: FONDO_A, montoBase: 20_000 },
      { id: "ent-cob-b", comunidadId: COM_B, unidadId: UB, fondoId: FONDO_B, montoBase: 50_000 },
    ]
    for (const c of cobros) {
      await prisma.cobroFI.create({
        data: {
          id: c.id,
          comunidadId: c.comunidadId,
          unidadId: c.unidadId,
          periodo: PERIODO,
          concepto: "gasto_comun",
          origenModulo: "FI",
          fondoId: c.fondoId,
          descripcion: `Gasto Común ${PERIODO}`,
          montoBase: c.montoBase,
          lineas: [
            { concepto: "gasto_comun", monto: c.montoBase, fondoId: c.fondoId },
          ],
          fechaCargo: `${PERIODO}-01`,
          moras: [],
          pagos: [],
          diferencias: [],
        },
      })
    }

    const { cookieSesionAuthjs } = await import("../helpers/sesion-authjs")
    for (const u of [
      { id: "ent-user-admin", email: EMAIL_ADMIN },
      { id: "ent-user-comite", email: EMAIL_COMITE },
      { id: "ent-user-admin-b", email: EMAIL_ADMIN_B },
    ]) {
      cookies.set(u.email, await cookieSesionAuthjs({ sub: u.id, email: u.email }))
    }

    // Los avisos se emiten por la ruta real: folio, período y unidad son los
    // del documento congelado que después se entrega.
    avisoU1 = await emitir(EMAIL_ADMIN, { periodo: PERIODO, unidadId: U1 })
    avisoU2 = await emitir(EMAIL_ADMIN, { periodo: PERIODO, unidadId: U2 })
    avisoU3 = await emitir(EMAIL_ADMIN, { periodo: PERIODO, unidadId: U3 })
    avisoB = await emitir(EMAIL_ADMIN_B, { periodo: PERIODO, unidadId: UB })
  }, 120_000)

  afterAll(async () => {
    try {
      state.cookie = ""
      await limpiar()
      await prisma.membresia.deleteMany({
        where: {
          usuarioId: {
            in: ["ent-user-admin", "ent-user-comite", "ent-user-admin-b"],
          },
        },
      })
      await prisma.usuario.deleteMany({
        where: {
          id: { in: ["ent-user-admin", "ent-user-comite", "ent-user-admin-b"] },
        },
      })
      await prisma.comunidad.deleteMany({ where: { id: { in: [COM_A, COM_B] } } })
    } catch {
      // intencional: best-effort
    }
  }, 60_000)

  it("entrega por el visor: crea la notificación que el residente ve y registra la entrega", async () => {
    const { status, json } = await como(EMAIL_ADMIN, () => entregar(avisoU1.id))

    expect(status).toBe(200)
    expect(json.ok).toBe(true)
    expect(json.folio).toBe(avisoU1.folio)
    expect(json.periodo).toBe(PERIODO)
    expect(json.destinatarioPersonaId).toBe(PROPIETARIO_U1)
    expect(json.idempotente).toBe(false)

    const canales = json.canales as { visor: Json; email: Json }
    expect(canales.visor.estado).toBe("entregado")
    expect(canales.email.estado).toBe("pendiente")

    const entregas = await entregasDe(avisoU1.id)
    expect(entregas).toHaveLength(2)

    const visor = entregas.find((e) => e.canal === "visor")
    expect(visor).toBeDefined()
    expect(visor?.estado).toBe("entregado")
    expect(visor?.personaId).toBe(PROPIETARIO_U1)
    expect(visor?.fecha).toBe(hoyISO())
    expect(visor?.notificacionId).not.toBeNull()

    // El registro es la prueba: la notificación existe, es del dueño vigente y
    // referencia el aviso (folio y período), no un texto genérico.
    const notificacion = await prisma.notificacion.findUnique({
      where: { id: visor?.notificacionId ?? "" },
    })
    expect(notificacion).not.toBeNull()
    expect(notificacion?.destinatarioPersonaId).toBe(PROPIETARIO_U1)
    expect(notificacion?.destinatarioPersonaId).not.toBe(PROPIETARIO_U1_ANTERIOR)
    expect(notificacion?.unidadId).toBe(U1)
    expect(notificacion?.asunto).toContain(avisoU1.folio)
    expect(notificacion?.cuerpo).toContain(avisoU1.folio)
    expect(notificacion?.cuerpo).toContain(PERIODO)
    expect(notificacion?.moduloOrigen).toBe("FI")
    expect(json.notificacionId).toBe(notificacion?.id)
  })

  it("el correo queda pendiente con su motivo y nunca se reporta como entregado ni enviado", async () => {
    const entregas = await entregasDe(avisoU1.id)
    const email = entregas.find((e) => e.canal === "email")

    expect(email).toBeDefined()
    expect(email?.estado).toBe("pendiente")
    expect(email?.motivo).toMatch(/SMTP/)
    expect(email?.motivo).toMatch(/cola de salida|outbox/)
    // Sin SMTP no hay notificación de correo: la fila pendiente no prueba envío.
    expect(email?.notificacionId).toBeNull()

    const { json } = await como(EMAIL_ADMIN, () => historial(avisoU1.id))
    const envios = json.envios as Array<Json>
    const emailJson = envios.find((e) => e.canal === "email")
    expect(emailJson?.estado).toBe("pendiente")
    // Ningún estado del contrato dice "enviado": el vocabulario es
    // entregado | pendiente | fallido.
    expect(envios.map((e) => e.estado)).not.toContain("enviado")
    expect(emailJson?.estado).not.toBe("entregado")
  })

  it("sin propietario vigente la entrega se rechaza nombrando la unidad y no escribe nada", async () => {
    for (const { aviso, numero } of [
      { aviso: avisoU2, numero: "102" },
      { aviso: avisoU3, numero: "103" },
    ]) {
      const antes = await prisma.notificacion.count({ where: { comunidadId: COM_A } })
      const { status, json } = await como(EMAIL_ADMIN, () => entregar(aviso.id))

      expect(status).toBe(400)
      expect(String(json.error)).toContain(numero)
      expect(String(json.error)).toContain(aviso.folio)

      // Nada escrito: ni registro de entrega ni notificación "al vacío".
      expect(await entregasDe(aviso.id)).toHaveLength(0)
      const despues = await prisma.notificacion.count({ where: { comunidadId: COM_A } })
      expect(despues).toBe(antes)
      const auditoria = await prisma.eventoAuditoria.count({
        where: { referenciaId: aviso.id },
      })
      expect(auditoria).toBe(0)
    }
  })

  it("re-entregar el mismo aviso a la misma persona y canal no duplica", async () => {
    const antes = await entregasDe(avisoU1.id)
    const notificacionesAntes = await notificacionesDe(avisoU1.id)

    const { status, json } = await como(EMAIL_ADMIN, () => entregar(avisoU1.id))

    expect(status).toBe(200)
    expect(json.idempotente).toBe(true)
    const canales = json.canales as { visor: Json; email: Json }
    expect(canales.visor.estado).toBe("duplicado")
    expect(canales.email.estado).toBe("duplicado")
    expect(canales.visor.envioId).toBe(
      antes.find((e) => e.canal === "visor")?.id
    )

    const despues = await entregasDe(avisoU1.id)
    expect(despues).toHaveLength(antes.length)
    expect(await notificacionesDe(avisoU1.id)).toBe(notificacionesAntes)
  })

  it("el reenvío explícito agrega un registro nuevo por canal y queda auditado", async () => {
    const antes = await entregasDe(avisoU1.id)

    const { status, json } = await como(EMAIL_ADMIN, () =>
      entregar(avisoU1.id, { reenviar: true })
    )

    expect(status).toBe(200)
    expect(json.reenvio).toBe(true)
    expect(json.idempotente).toBe(false)

    const despues = await entregasDe(avisoU1.id)
    expect(despues).toHaveLength(antes.length + 2)
    const nuevos = despues.filter(
      (e) => !antes.some((previo) => previo.id === e.id)
    )
    expect(nuevos).toHaveLength(2)
    expect(nuevos.every((e) => e.reenvio)).toBe(true)
    // El reenvío respeta el mismo contrato de estados por canal.
    expect(nuevos.find((e) => e.canal === "visor")?.estado).toBe("entregado")
    expect(nuevos.find((e) => e.canal === "email")?.estado).toBe("pendiente")
    // Reenviar el visor entrega OTRA notificación (el residente la vuelve a ver).
    expect(nuevos.find((e) => e.canal === "visor")?.notificacionId).not.toBe(
      antes.find((e) => e.canal === "visor")?.notificacionId
    )

    const evento = await prisma.eventoAuditoria.findFirst({
      where: { referenciaId: avisoU1.id, tipoAccion: "FI_AVISO_ENTREGA_RESENT" },
    })
    expect(evento).not.toBeNull()
    expect(evento?.categoria).toBe("FI")
    expect(evento?.descripcion).toContain(avisoU1.folio)

    // La primera entrega también dejó su propio evento (no se pierde el hecho).
    const original = await prisma.eventoAuditoria.findFirst({
      where: { referenciaId: avisoU1.id, tipoAccion: "FI_AVISO_ENTREGADO" },
    })
    expect(original).not.toBeNull()
  })

  it("el aviso de otra comunidad no se entrega ni se lee (404)", async () => {
    const { status: statusEntrega, json: jsonEntrega } = await como(
      EMAIL_ADMIN,
      () => entregar(avisoB.id)
    )
    expect(statusEntrega).toBe(404)
    expect(jsonEntrega.error).toBe("Registro no encontrado.")

    const { status: statusHistorial } = await como(EMAIL_ADMIN, () =>
      historial(avisoB.id)
    )
    expect(statusHistorial).toBe(404)

    expect(await entregasDe(avisoB.id)).toHaveLength(0)
  })

  it("sesión y permiso: 401 sin sesión, 403 del comité al entregar, lectura para auditoría", async () => {
    state.cookie = ""
    const sinSesion = await entregar(avisoU1.id)
    expect(sinSesion.status).toBe(401)

    const comite = await como(EMAIL_COMITE, () => entregar(avisoU1.id))
    expect(comite.status).toBe(403)
    expect(comite.json.error).toBe("Permiso denegado.")

    // El comité AUDITA: lee el historial de entregas del aviso.
    const lectura = await como(EMAIL_COMITE, () => historial(avisoU1.id))
    expect(lectura.status).toBe(200)
    expect(lectura.json.folio).toBe(avisoU1.folio)
    const envios = lectura.json.envios as Array<Json>
    expect(envios.length).toBeGreaterThanOrEqual(2)
    expect([...new Set(envios.map((e) => e.canal))].sort()).toEqual([
      "email",
      "visor",
    ])
  })

  it("un cuerpo inválido no entrega nada", async () => {
    const antes = await entregasDe(avisoU1.id)
    const { status, json } = await como(EMAIL_ADMIN, () =>
      entregar(avisoU1.id, { reenviar: "sí" })
    )
    expect(status).toBe(400)
    expect(json.error).toBe("Datos de la entrega inválidos.")
    expect(await entregasDe(avisoU1.id)).toHaveLength(antes.length)
  })
})
