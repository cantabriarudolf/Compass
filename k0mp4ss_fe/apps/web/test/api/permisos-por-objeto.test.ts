/**
 * @vitest-environment node
 *
 * Serie «Permisos por objeto» · T2 (el arnés) + T3 (lectura por relación).
 *
 * La matriz de permisos dice «este rol entra a esta ruta»; esta prueba dice qué
 * FILA ve. El arnés es propio y no depende del seed: dos comunidades (A y B),
 * dos unidades por comunidad, una persona por unidad con su vínculo vigente y
 * cuatro sesiones — administrador de A, residente de A-unidad-1, residente de
 * A-unidad-2 y residente de B-unidad-1.
 *
 * Los veredictos NO se copian acá: salen del mapa de T1
 * (`odd/tasks/permisos-por-objeto.md`, «Mapa de T1») y de los helpers de alcance
 * que ya implementan la regla (`filtroNotificaciones`, `whereEnvios`,
 * `whereEnvioDetalle`, `personaIdDelUsuario`). Cada aserción cita el `path:line`
 * del filtro que fija: si ese filtro se borra, la aserción falla.
 *
 * Recursos del primer lote: `personas`, `notificaciones`, `co/envios`.
 * Recursos del segundo lote: `controles-propiedad`, `cobros-fi/canales`,
 * `co/mensajes-buzon`, `vinculos` (límite documentado) y `liquidaciones`
 * (T6: el trabajador lee la suya; el defecto de `pl:propia` sin usar queda
 * cerrado por la ruta, y este arnés fija la regla por fila).
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest"
import { prisma } from "@/lib/prisma"
import { cookieDeUsuario, cuerpoJson, invocarApi } from "../helpers/api-sesion"

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

// ── Arnes: dos comunidades, dos unidades y una persona por unidad ────────────
const COM_A = "ppo-com-a"
const COM_B = "ppo-com-b"

const U_A1 = "ppo-u-a1"
const U_A2 = "ppo-u-a2"
const U_B1 = "ppo-u-b1"
const U_B2 = "ppo-u-b2"

const P_A1 = "ppo-p-a1"
const P_A2 = "ppo-p-a2"
const P_B1 = "ppo-p-b1"
const P_B2 = "ppo-p-b2"

const EMAIL = {
  adminA: "ppo-admin-a@test.cl",
  resA1: "ppo-res-a1@test.cl",
  resA2: "ppo-res-a2@test.cl",
  resB1: "ppo-res-b1@test.cl",
  conserjeA: "ppo-conserje-a@test.cl",
  trabajadorA: "ppo-trabajador-a@test.cl",
}

// Notificaciones de la comunidad A.
const NOTI_A1 = "ppo-noti-a1" // puntual a A-1
const NOTI_A2 = "ppo-noti-a2" // puntual a A-2 (otra unidad)
const NOTI_DIFUSION_ROL = "ppo-noti-difusion-rol" // difusión al rol sin unidad
const NOTI_DIFUSION_U_A2 = "ppo-noti-difusion-ua2" // difusión al rol, unidad de A-2

// Envíos CO de la comunidad A.
const ENV_COMPARTIDO = "ppo-env-compartido" // destinatarios: A-1 y A-2
const ENV_SOLO_A2 = "ppo-env-solo-a2" // destinatario: solo A-2

// Controles de propiedad (AD): uno por unidad de la comunidad A.
const CONTROL_A1 = "ppo-ctrl-a1" // unidad A-1
const CONTROL_A2 = "ppo-ctrl-a2" // unidad A-2 (otra unidad)

// Buzón CO de la comunidad A: el reportante es la pertenencia.
const MSG_A1 = "ppo-msg-a1" // reportado por A-1
const MSG_A2 = "ppo-msg-a2" // reportado por A-2

// Liquidaciones PL: la pertenencia es `trabajadorPersonaId`. Dos trabajadores en
// la comunidad A (para distinguir «la mía» de «otra persona de mi comunidad») y
// una en la comunidad B (para el 404 cross-comunidad).
const LIQ_A = "ppo-liq-a" // comunidad A, trabajador A-1
const LIQ_A2 = "ppo-liq-a2" // comunidad A, trabajador A-2 (misma comunidad, otro trabajador)
const LIQ_B = "ppo-liq-b" // comunidad B, trabajador B-1

// Vínculos vigentes creados por el arnés (uno por persona/unidad).
const V_A1 = `ppo-v-${P_A1}`
const V_A2 = `ppo-v-${P_A2}`
const V_B1 = `ppo-v-${P_B1}`

type Envelope<T> = { data: T[]; page: number; pageSize: number; total: number }

async function conSesion<T>(email: string, fn: () => Promise<T>): Promise<T> {
  state.cookie = await cookieDeUsuario(email)
  try {
    return await fn()
  } finally {
    state.cookie = ""
  }
}

const moduloPersonas = () => import("@/app/api/personas/route")
const moduloPersona = () => import("@/app/api/personas/[id]/route")
const moduloNotificaciones = () => import("@/app/api/notificaciones/route")
const moduloNotificacion = () => import("@/app/api/notificaciones/[id]/route")
const moduloNotificacionLeer = () => import("@/app/api/notificaciones/[id]/leer/route")
const moduloEnvio = () => import("@/app/api/co/envios/[id]/route")
const moduloEnvioLecturas = () => import("@/app/api/co/envios/[id]/lecturas/route")
const moduloControlesPropiedad = () => import("@/app/api/controles-propiedad/route")
const moduloControlPropiedad = () => import("@/app/api/controles-propiedad/[id]/route")
const moduloCanalesCobranza = () => import("@/app/api/cobros-fi/canales/route")
const moduloMensajesBuzon = () => import("@/app/api/co/mensajes-buzon/route")
const moduloMensajeBuzon = () => import("@/app/api/co/mensajes-buzon/[id]/route")
const moduloVinculo = () => import("@/app/api/vinculos/[id]/route")
const moduloLiquidaciones = () => import("@/app/api/liquidaciones/route")
const moduloLiquidacion = () => import("@/app/api/liquidaciones/[id]/route")

async function limpiar(): Promise<void> {
  await prisma.controlPropiedadArchivada.deleteMany({
    where: { comunidadId: { in: [COM_A, COM_B] } },
  })
  await prisma.controlPropiedad.deleteMany({ where: { comunidadId: { in: [COM_A, COM_B] } } })
  await prisma.mensajeBuzonCO.deleteMany({ where: { comunidadId: { in: [COM_A, COM_B] } } })
  await prisma.liquidacionPL.deleteMany({ where: { comunidadId: { in: [COM_A, COM_B] } } })
  await prisma.preferenciaCanalCobranzaFI.deleteMany({
    where: { comunidadId: { in: [COM_A, COM_B] } },
  })
  await prisma.envioCO.deleteMany({ where: { comunidadId: { in: [COM_A, COM_B] } } })
  await prisma.notificacion.deleteMany({ where: { comunidadId: { in: [COM_A, COM_B] } } })
  await prisma.eventoAuditoria.deleteMany({ where: { comunidadId: { in: [COM_A, COM_B] } } })
  await prisma.vinculoUnidad.deleteMany({ where: { comunidadId: { in: [COM_A, COM_B] } } })
  await prisma.persona.deleteMany({ where: { comunidadId: { in: [COM_A, COM_B] } } })
  await prisma.unidad.deleteMany({ where: { comunidadId: { in: [COM_A, COM_B] } } })
}

beforeAll(async () => {
  for (const [id, nombre, slug] of [
    [COM_A, "Comunidad Permisos Por Objeto A", "ppo-a"],
    [COM_B, "Comunidad Permisos Por Objeto B", "ppo-b"],
  ] as const) {
    await prisma.comunidad.upsert({ where: { id }, update: {}, create: { id, nombre, slug } })
  }
  await limpiar()

  // Unidades: no tienen FK a los catálogos (micro-sector/tipo/estado son ids sueltos).
  for (const [id, comunidadId, numero, prorrateo] of [
    [U_A1, COM_A, "101", 0.3],
    [U_A2, COM_A, "102", 0.2],
    [U_B1, COM_B, "201", 0.4],
    [U_B2, COM_B, "202", 0.1],
  ] as const) {
    await prisma.unidad.create({
      data: {
        id,
        comunidadId,
        microSectorId: `ppo-ms-${comunidadId}`,
        numero,
        etiqueta: `Depto ${numero}`,
        tipoUnidadId: `ppo-tu-${comunidadId}`,
        metraje: 55,
        prorrateo,
        rolSii: `7000-${numero}`,
        estadoId: `ppo-est-${comunidadId}`,
        servicios: {},
      },
    })
  }

  // Una persona por unidad, y cada una con su vínculo vigente (fechaFin null).
  for (const [id, comunidadId, unidadId, nombre, rut] of [
    [P_A1, COM_A, U_A1, "Ana Auno", "70000001-1"],
    [P_A2, COM_A, U_A2, "Beto Ados", "70000002-2"],
    [P_B1, COM_B, U_B1, "Caro Buno", "70000003-3"],
    [P_B2, COM_B, U_B2, "Dani Bdos", "70000004-4"],
  ] as const) {
    const [nombres, apellidos] = nombre.split(" ") as [string, string]
    await prisma.persona.create({
      data: {
        id,
        comunidadId,
        rut,
        nombreCompleto: nombre,
        nombres,
        apellidos,
        email: `${id}@ppo.test.cl`,
        telefonoMovil: "+56911111111",
        estadoCuenta: "activa",
        condicionesEspecialesIds: [],
        roles: ["propietario"],
      },
    })
    await prisma.vinculoUnidad.create({
      data: {
        id: `ppo-v-${id}`,
        comunidadId,
        personaId: id,
        unidadId,
        rol: "propietario",
        fechaInicio: "2026-01-01",
        fechaFin: null,
        permiteVerFinanzas: true,
      },
    })
  }

  // Sesiones: el rol sale de la membresía, la identidad MP de `Usuario.personaId`.
  for (const u of [
    { email: EMAIL.adminA, comunidadId: COM_A, rol: "administrador", personaId: null },
    { email: EMAIL.resA1, comunidadId: COM_A, rol: "residente", personaId: P_A1 },
    { email: EMAIL.resA2, comunidadId: COM_A, rol: "residente", personaId: P_A2 },
    { email: EMAIL.resB1, comunidadId: COM_B, rol: "residente", personaId: P_B1 },
    // Conserjería sin ficha MP: tiene `pl:propia` ver pero ninguna identidad que
    // pueda ser dueña de una liquidación, así que no hay fila que devolver.
    { email: EMAIL.conserjeA, comunidadId: COM_A, rol: "conserjeria", personaId: null },
    // El trabajador (rol conserjería) con su identidad MP: es el dueño de LIQ_A.
    { email: EMAIL.trabajadorA, comunidadId: COM_A, rol: "conserjeria", personaId: P_A1 },
  ]) {
    const usuario = await prisma.usuario.upsert({
      where: { email: u.email },
      update: { personaId: u.personaId },
      create: { email: u.email, personaId: u.personaId, activo: true },
    })
    await prisma.membresia.deleteMany({ where: { usuarioId: usuario.id } })
    await prisma.membresia.create({
      data: { usuarioId: usuario.id, comunidadId: u.comunidadId, rol: u.rol },
    })
  }

  const notificacion = (id: string, overrides: Record<string, unknown>) => ({
    id,
    comunidadId: COM_A,
    destinatarioRol: "residente",
    asunto: "Aviso de la comunidad",
    cuerpo: "Contenido del aviso.",
    moduloOrigen: "MP",
    fecha: "2026-11-05",
    ...overrides,
  })
  await prisma.notificacion.createMany({
    data: [
      notificacion(NOTI_A1, { destinatarioPersonaId: P_A1, unidadId: U_A1 }),
      notificacion(NOTI_A2, { destinatarioPersonaId: P_A2, unidadId: U_A2 }),
      notificacion(NOTI_DIFUSION_ROL, { destinatarioPersonaId: null, unidadId: null }),
      notificacion(NOTI_DIFUSION_U_A2, { destinatarioPersonaId: null, unidadId: U_A2 }),
    ],
  })

  // Envíos CO: la pertenencia vive en `EnvioDestinatarioCO` (la tabla es la
  // fuente de verdad, `proyeccion-envio.ts:20-23`), no en el JSON `destinatarios`.
  await prisma.envioCO.createMany({
    data: [
      {
        id: ENV_COMPARTIDO,
        comunidadId: COM_A,
        asunto: "Citación asamblea",
        cuerpo: "Se cita a asamblea el 05-11-2026.",
        fechaEnvio: "2026-11-05",
        destinatarios: [
          { personaId: P_A1, unidadId: U_A1 },
          { personaId: P_A2, unidadId: U_A2 },
        ],
        lecturas: [],
      },
      {
        id: ENV_SOLO_A2,
        comunidadId: COM_A,
        asunto: "Comunicación a la unidad 102",
        cuerpo: "Mensaje solo para la unidad de A-2.",
        fechaEnvio: "2026-11-05",
        destinatarios: [{ personaId: P_A2, unidadId: U_A2 }],
        lecturas: [],
      },
    ],
  })
  await prisma.envioDestinatarioCO.createMany({
    data: [
      { id: "ppo-ed-a1", envioId: ENV_COMPARTIDO, personaId: P_A1, unidadId: U_A1 },
      { id: "ppo-ed-a2", envioId: ENV_COMPARTIDO, personaId: P_A2, unidadId: U_A2 },
      { id: "ppo-ed-a2-solo", envioId: ENV_SOLO_A2, personaId: P_A2, unidadId: U_A2 },
    ],
  })

  // Controles de propiedad: una fila por unidad, con flags distintos para que
  // «la fila ajena queda intacta» se pueda comparar de verdad.
  await prisma.controlPropiedad.createMany({
    data: [
      {
        id: CONTROL_A1,
        comunidadId: COM_A,
        unidadId: U_A1,
        residenteVeMorosidad: false,
        residenteVeActas: true,
        alertasResidentesActivas: true,
        estado: "vigente",
      },
      {
        id: CONTROL_A2,
        comunidadId: COM_A,
        unidadId: U_A2,
        residenteVeMorosidad: true,
        residenteVeActas: false,
        alertasResidentesActivas: false,
        estado: "vigente",
      },
    ],
  })

  // Preferencia de canal de cobranza: una fila por persona, con valores opuestos
  // (un `update` ajeno se vería en la relectura).
  await prisma.preferenciaCanalCobranzaFI.createMany({
    data: [
      { id: "ppo-pref-a1", comunidadId: COM_A, personaId: P_A1, canalVisor: true, canalEmail: false },
      { id: "ppo-pref-a2", comunidadId: COM_A, personaId: P_A2, canalVisor: false, canalEmail: true },
    ],
  })

  // Buzón CO: el reportante es la pertenencia de la fila.
  for (const [id, reportantePersonaId, nombre] of [
    [MSG_A1, P_A1, "Ana Auno"],
    [MSG_A2, P_A2, "Beto Ados"],
  ] as const) {
    await prisma.mensajeBuzonCO.create({
      data: {
        id,
        comunidadId: COM_A,
        folio: `BZ-${id}`,
        clasificacion: "reclamo",
        reportantePersonaId,
        reportanteNombre: nombre,
        asunto: `Asunto ${id}`,
        cuerpo: `Cuerpo ${id}`,
        visibilidadComite: true,
        fechaIngreso: "2026-11-05",
        estado: "recibido",
        respuestas: [],
      },
    })
  }

  // Liquidaciones PL: los totales no importan acá — la prueba es de alcance, no
  // de cálculo — pero la fila exige todos los campos.
  const liquidacion = (
    id: string,
    comunidadId: string,
    trabajadorPersonaId: string,
    folio: string,
    liquido = 650000
  ) => ({
    id,
    comunidadId,
    folio,
    trabajadorPersonaId,
    periodo: "2026-10",
    fechaGeneracion: "2026-10-30",
    diasTrabajados: 30,
    sueldoBaseContrato: 650000,
    diasMesComercial: 30,
    jornadaSemanal: 44,
    sueldoBaseProporcional: liquido,
    horasExtrasHoras: 0,
    valorHoraOrdinaria: 0,
    montoHorasExtras: 0,
    bonos: [],
    gratificacionLegal: 0,
    totalImponible: liquido,
    asignacionMovilizacion: 0,
    asignacionColacion: 0,
    cargas: 0,
    montoAsignacionFamiliar: 0,
    totalHaberes: liquido,
    nombreAfp: "AFP Habitat",
    tasaAFP: 10.58,
    montoAFP: 0,
    nombreSalud: "FONASA",
    saludTipo: "fonasa",
    montoSalud: 0,
    tasaSIS: 1.48,
    montoSIS: 0,
    montoSeguroCesantia: 0,
    montoAPV: 0,
    totalDescuentos: 0,
    descuentoAnticipos: 0,
    adelantosIds: [],
    alcanceLiquido: liquido,
    liquidoAPagar: liquido,
    estado: "borrador",
    egresoFIReferencia: "pendiente",
  })
  for (const fila of [
    liquidacion(LIQ_A, COM_A, P_A1, "LIQ-0001"),
    // Otro trabajador, misma comunidad: el líquido distinto hace visible que el
    // alcance del trabajador no trae montos ajenos.
    liquidacion(LIQ_A2, COM_A, P_A2, "LIQ-0003", 910000),
    liquidacion(LIQ_B, COM_B, P_B1, "LIQ-0002"),
  ]) {
    await prisma.liquidacionPL.create({ data: fila as never })
  }
}, 30_000)

afterAll(async () => {
  try {
    state.cookie = ""
    await limpiar()
    const emails = Object.values(EMAIL)
    await prisma.membresia.deleteMany({ where: { usuario: { email: { in: emails } } } })
    await prisma.usuario.deleteMany({ where: { email: { in: emails } } })
    await prisma.comunidad.deleteMany({ where: { id: { in: [COM_A, COM_B] } } })
  } catch {
    // intencional: limpieza best-effort (la base es descartable)
  }
})

describe("personas — propio, otra unidad, otra comunidad (T3)", () => {
  it("control: el administrador de A sí ve las dos fichas de A (y no la de B)", async () => {
    await conSesion(EMAIL.adminA, async () => {
      const res = await invocarApi(moduloPersonas(), "GET", "personas?pageSize=100")
      expect(res.status).toBe(200)
      const j = await cuerpoJson<Envelope<{ id: string }>>(res)
      // app/api/personas/route.ts:496 — el `where` base de la factory es la comunidad:
      // las dos fichas de A existen y son legibles; lo que las oculta a A-1 es el ABAC.
      expect(new Set(j.data.map((p) => p.id))).toEqual(new Set([P_A1, P_A2]))
    })
  })

  it("residente A-1: la colección devuelve solo su propia ficha", async () => {
    await conSesion(EMAIL.resA1, async () => {
      const res = await invocarApi(moduloPersonas(), "GET", "personas?pageSize=100")
      expect(res.status).toBe(200)
      const j = await cuerpoJson<Envelope<{ id: string }>>(res)
      // app/api/personas/route.ts:499 — `where.id = personaIdDelUsuario(...)`: sin
      // ese filtro entran las de A-2 y las de B (el `where` base es solo comunidad).
      expect(j.data.map((p) => p.id)).toEqual([P_A1])
      // app/api/personas/route.ts:496 — el alcance de comunidad tampoco alcanza solo.
      expect(j.data.map((p) => p.id)).not.toContain(P_A2)
    })
  })

  it("residente A-1: GET de su propia ficha → 200", async () => {
    await conSesion(EMAIL.resA1, async () => {
      const res = await invocarApi(moduloPersona(), "GET", "personas/[id]", {
        params: { id: P_A1 },
      })
      expect(res.status).toBe(200)
      // app/api/personas/[id]/route.ts:49 — el ABAC deja pasar el id propio (control
      // negativo: sin esto un 403 general pasaría por «protección»).
      expect((await cuerpoJson<{ id: string }>(res)).id).toBe(P_A1)
    })
  })

  it("residente A-1: GET de la ficha de A-2 → 403 y ningún dato de la fila", async () => {
    await conSesion(EMAIL.resA1, async () => {
      const res = await invocarApi(moduloPersona(), "GET", "personas/[id]", {
        params: { id: P_A2 },
      })
      // hallazgo (mapa T1, fila `personas`): app/api/personas/[id]/route.ts:47-51
      // responde 403 —que el mapa documenta como «confirma existencia»— mientras el
      // resto del repo usa 404 (`:57-60`) para no filtrar existencia. Se fija el
      // contrato de HOY; unificar es decisión de contrato, no de este test.
      // El 403 es una comparación pura `id !== personaId` ANTES de leer la fila
      // (`:48`), así que en esta rama el 403 NO distingue existente de inexistente.
      expect(res.status).toBe(403)
      // app/api/personas/[id]/route.ts:50 — el cuerpo es solo el error: ninguna
      // columna de la persona ajena viaja en la respuesta.
      expect(await cuerpoJson<{ error: string }>(res)).toEqual({
        error: "Permiso denegado: solo puedes acceder a tu propia ficha.",
      })
    })
  })

  it("residente A-1: GET de una ficha de otra comunidad → 403 idéntico al de un id inexistente", async () => {
    await conSesion(EMAIL.resA1, async () => {
      const ajeno = await invocarApi(moduloPersona(), "GET", "personas/[id]", {
        params: { id: P_B1 },
      })
      const fantasma = await invocarApi(moduloPersona(), "GET", "personas/[id]", {
        params: { id: "ppo-p-no-existe" },
      })
      // app/api/personas/[id]/route.ts:49 — el ABAC de identidad corta antes del 404
      // cross-comunidad de `:57-60`: para un residente la otra comunidad nunca llega
      // a distinguirse (mapa T1: lectura ajena = 403, sin caso aparte).
      expect(ajeno.status).toBe(403)
      // app/api/personas/[id]/route.ts:47-51 — el 403 sale de comparar el id pedido
      // con el `personaId` de la sesión, sin leer la fila: «existe pero es de otro» y
      // «no existe» son indistinguibles. El «403 confirma existencia» del mapa no se
      // cumple en esta rama (hallazgo, no defecto: no se filtra ningún dato).
      expect(fantasma.status).toBe(403)
      expect(await cuerpoJson<{ error: string }>(fantasma)).toEqual(
        await cuerpoJson<{ error: string }>(ajeno)
      )
    })
  })

  it("residente A-1: PUT de su propia ficha → 200 (control negativo del ABAC de escritura)", async () => {
    await conSesion(EMAIL.resA1, async () => {
      const res = await invocarApi(moduloPersona(), "PUT", "personas/[id]", {
        params: { id: P_A1 },
        body: { nombreCompleto: "Ana Auno Actualizada" },
      })
      // app/api/personas/[id]/route.ts:78 — el residente SÍ escribe su propia ficha:
      // sin esta cara del predicado, «403 a todo» pasaría por protección correcta.
      expect(res.status).toBe(200)
      // app/api/personas/[id]/route.ts:78 — la escritura propia se persiste de verdad.
      expect((await prisma.persona.findUnique({ where: { id: P_A1 } }))?.nombreCompleto).toBe(
        "Ana Auno Actualizada"
      )
    })
  })

  it("residente A-1: PUT de la ficha de A-2 → 403 y la fila queda intacta", async () => {
    await conSesion(EMAIL.resA1, async () => {
      const antes = await prisma.persona.findUnique({ where: { id: P_A2 } })
      const res = await invocarApi(moduloPersona(), "PUT", "personas/[id]", {
        params: { id: P_A2 },
        body: { nombreCompleto: "Nombre Intruso" },
      })
      // app/api/personas/[id]/route.ts:76-80 — el residente solo escribe si
      // `personaIdDelUsuario === id`; la comparación ocurre antes de tocar la fila.
      expect(res.status).toBe(403)
      // app/api/personas/[id]/route.ts:80 — el 403 corta antes de cualquier escritura:
      // se relee la fila ajena y tiene que ser la misma (T4: la escritura ajena no pasa).
      expect(await prisma.persona.findUnique({ where: { id: P_A2 } })).toEqual(antes)
    })
  })
})

describe("notificaciones — propio, otra unidad (T3)", () => {
  it("control: el administrador de A ve las cuatro notificaciones de su comunidad", async () => {
    await conSesion(EMAIL.adminA, async () => {
      const res = await invocarApi(moduloNotificaciones(), "GET", "notificaciones?pageSize=100")
      expect(res.status).toBe(200)
      const j = await cuerpoJson<Envelope<{ id: string }>>(res)
      // lib/api/notificaciones-scope.ts:84 — administrador y comité ven toda la comunidad:
      // las cuatro filas existen y son legibles, incluida la de la unidad de A-2.
      expect(new Set(j.data.map((n) => n.id))).toEqual(
        new Set([NOTI_A1, NOTI_A2, NOTI_DIFUSION_ROL, NOTI_DIFUSION_U_A2])
      )
    })
  })

  it("residente A-1: la bandeja devuelve solo lo suyo (puntual y difusión de rol sin unidad)", async () => {
    await conSesion(EMAIL.resA1, async () => {
      const res = await invocarApi(moduloNotificaciones(), "GET", "notificaciones?pageSize=100")
      expect(res.status).toBe(200)
      const j = await cuerpoJson<Envelope<{ id: string }>>(res)
      // lib/api/notificaciones-scope.ts:108-117 — el `where` de alcance: puntual a mi
      // persona + difusión a mi rol sin unidad. Sin él la bandeja trae las dos de A-2.
      expect(new Set(j.data.map((n) => n.id))).toEqual(new Set([NOTI_A1, NOTI_DIFUSION_ROL]))
      // lib/api/notificaciones-scope.ts:61 — `unidadId: null` en la difusión de rol:
      // sin ese acote, la difusión dirigida a la unidad de A-2 se cuela en la bandeja.
      expect(j.data.map((n) => n.id)).not.toContain(NOTI_DIFUSION_U_A2)
      // lib/api/notificaciones-scope.ts:112 — la pertenencia puntual es por persona:
      // la notificación de A-2 no aparece aunque comparta comunidad y rol.
      expect(j.data.map((n) => n.id)).not.toContain(NOTI_A2)
      // app/api/notificaciones/route.ts:82 — el `total` usa el MISMO `where` acotado.
      expect(j.total).toBe(2)
    })
  })

  it("residente A-1: GET de una notificación de A-2 → 404 (no filtra existencia)", async () => {
    await conSesion(EMAIL.resA1, async () => {
      const res = await invocarApi(moduloNotificacion(), "GET", "notificaciones/[id]", {
        params: { id: NOTI_A2 },
      })
      // app/api/notificaciones/[id]/route.ts:46-49 — `findFirst` con el `where` de
      // alcance: la ajena no se encuentra y responde el mismo 404 que un id inventado.
      expect(res.status).toBe(404)
      // app/api/notificaciones/[id]/route.ts:49 — el cuerpo es el error genérico, sin
      // asunto ni cuerpo de la notificación ajena.
      expect(await cuerpoJson<{ error: string }>(res)).toEqual({
        error: "Registro no encontrado.",
      })
    })
  })

  it("residente A-1: POST [id]/leer de una notificación de A-2 → 404 y `leida` sigue false", async () => {
    await conSesion(EMAIL.resA1, async () => {
      const res = await invocarApi(moduloNotificacionLeer(), "POST", "notificaciones/[id]/leer", {
        params: { id: NOTI_A2 },
      })
      // app/api/notificaciones/[id]/leer/route.ts:63-65 — `esDestinatarioDeNotificacion`:
      // el destinatario puntual es A-2, así que la lectura ajena no se firma.
      expect(res.status).toBe(404)
      const fila = await prisma.notificacion.findUnique({ where: { id: NOTI_A2 } })
      // app/api/notificaciones/[id]/leer/route.ts:65 — el 404 corta antes del `update`:
      // la fila de A-2 conserva `leida` y `fechaLectura` como estaban.
      expect(fila?.leida).toBe(false)
      expect(fila?.fechaLectura).toBeNull()
    })
  })

  it("residente A-1: POST [id]/leer de una DIFUSIÓN a la unidad de A-2 → 404 y `leida` sigue false", async () => {
    // Regresión observada: la fila NO es legible para A-1 (difusión al rol
    // `residente` con `destinatarioPersonaId: null` y `unidadId` de A-2) y aun así
    // era firmable. Escritura ⊆ lectura: si el GET la esconde, el POST no la firma.
    await conSesion(EMAIL.resA1, async () => {
      const lectura = await invocarApi(moduloNotificacion(), "GET", "notificaciones/[id]", {
        params: { id: NOTI_DIFUSION_U_A2 },
      })
      // lib/api/notificaciones-scope.ts:61 — la difusión de rol se acota a
      // `unidadId: null` y, con vínculos (F5), a las unidades propias.
      expect(lectura.status).toBe(404)

      const res = await invocarApi(moduloNotificacionLeer(), "POST", "notificaciones/[id]/leer", {
        params: { id: NOTI_DIFUSION_U_A2 },
      })
      // app/api/notificaciones/[id]/leer/route.ts — el `where` de la escritura es el
      // MISMO `filtroNotificaciones` del GET por id: la difusión de la unidad de A-2
      // no se encuentra, así que responde el 404 genérico y no filtra existencia.
      expect(res.status).toBe(404)
      expect(await cuerpoJson<{ error: string }>(res)).toEqual({
        error: "Registro no encontrado.",
      })

      const fila = await prisma.notificacion.findUnique({ where: { id: NOTI_DIFUSION_U_A2 } })
      // El 404 corta antes del `update`: la fila de la unidad de A-2 queda como estaba
      // (sin `leida` ni `fechaLectura`), así la métrica de apertura no cuenta a A-1.
      expect(fila?.leida).toBe(false)
      expect(fila?.fechaLectura).toBeNull()
    })
  })

  it("residente A-2: POST [id]/leer de la difusión a SU unidad → 200 e idempotente (control negativo)", async () => {
    // Sin esta cara, «404 a toda difusión con unidad» pasaría por arreglo: el
    // destinatario de la unidad correcta SÍ firma, y la fecha no se recalcula.
    await conSesion(EMAIL.resA2, async () => {
      const res = await invocarApi(moduloNotificacionLeer(), "POST", "notificaciones/[id]/leer", {
        params: { id: NOTI_DIFUSION_U_A2 },
      })
      expect(res.status).toBe(200)
      const cuerpo = await cuerpoJson<{ ok: boolean; fechaLectura?: string }>(res)
      // Mismo contrato de respuesta que antes del arreglo: `{ ok, fechaLectura }`.
      expect(cuerpo.ok).toBe(true)
      expect(cuerpo.fechaLectura).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      const enBd = await prisma.notificacion.findUnique({ where: { id: NOTI_DIFUSION_U_A2 } })
      expect(enBd?.leida).toBe(true)
      expect(enBd?.fechaLectura).toBe(cuerpo.fechaLectura)

      // Idempotencia intacta: la segunda lectura responde 200 y no mueve la fecha.
      const otra = await invocarApi(moduloNotificacionLeer(), "POST", "notificaciones/[id]/leer", {
        params: { id: NOTI_DIFUSION_U_A2 },
      })
      expect(otra.status).toBe(200)
      expect((await cuerpoJson<{ fechaLectura?: string }>(otra)).fechaLectura).toBe(
        cuerpo.fechaLectura
      )
    })
  })

  it("residente A-1: POST [id]/leer de su propia notificación → 200 (control negativo)", async () => {
    await conSesion(EMAIL.resA1, async () => {
      const res = await invocarApi(moduloNotificacionLeer(), "POST", "notificaciones/[id]/leer", {
        params: { id: NOTI_A1 },
      })
      // app/api/notificaciones/[id]/leer/route.ts:63 — el predicado discrimina: la
      // propia sí se firma. Sin este control, un «404 a todo» pasaría por correcto.
      expect(res.status).toBe(200)
      // app/api/notificaciones/[id]/leer/route.ts:70-73 — la escritura es sobre la propia.
      expect((await prisma.notificacion.findUnique({ where: { id: NOTI_A1 } }))?.leida).toBe(true)
    })
  })
})

describe("co/envios — pertenencia por destinatario (T3)", () => {
  it("control: el administrador de A abre el envío que es solo de A-2", async () => {
    await conSesion(EMAIL.adminA, async () => {
      const res = await invocarApi(moduloEnvio(), "GET", "co/envios/[id]", {
        params: { id: ENV_SOLO_A2 },
      })
      expect(res.status).toBe(200)
      // app/api/co/_lib/proyeccion-envio.ts:60 — fuera del residente el `where` es la
      // comunidad: el envío existe y es legible, así que el 404 de A-1 es alcance, no ausencia.
      expect((await cuerpoJson<{ id: string }>(res)).id).toBe(ENV_SOLO_A2)
    })
  })

  it("residente A-1: GET del envío compartido (A-1 y A-2) → 200 sin la nómina de terceros", async () => {
    await conSesion(EMAIL.resA1, async () => {
      const res = await invocarApi(moduloEnvio(), "GET", "co/envios/[id]", {
        params: { id: ENV_COMPARTIDO },
      })
      // app/api/co/_lib/proyeccion-envio.ts:62 — `destinatariosCO: { some: { personaId } }`:
      // la pertenencia es ser destinatario, no ser el único destinatario.
      expect(res.status).toBe(200)
      const envio = await cuerpoJson<Record<string, unknown>>(res)
      expect(envio.id).toBe(ENV_COMPARTIDO)
      // app/api/co/_lib/proyeccion-envio.ts:144-152 — la proyección del residente no
      // incluye `destinatarios` ni `lecturas`: el envío compartido no revela a quién más llegó.
      expect(envio).not.toHaveProperty("destinatarios")
      expect(envio).not.toHaveProperty("lecturas")
    })
  })

  it("residente A-1: GET de un envío que no es suyo (solo A-2) → 404", async () => {
    await conSesion(EMAIL.resA1, async () => {
      const res = await invocarApi(moduloEnvio(), "GET", "co/envios/[id]", {
        params: { id: ENV_SOLO_A2 },
      })
      // app/api/co/envios/[id]/route.ts:53-56 — `whereEnvioDetalle(...)` + `if (!fila)`:
      // un envío ajeno responde igual que un id inexistente (S3, sin filtrar existencia).
      expect(res.status).toBe(404)
      // app/api/co/_lib/proyeccion-envio.ts:72 — el detalle hereda el `where` de la
      // colección; sin `destinatariosCO.some` el 404 se vuelve 200 con el envío de A-2.
      expect(await cuerpoJson<{ error: string }>(res)).toEqual({
        error: "Registro no encontrado.",
      })
    })
  })

  it("residente A-1: GET [id]/lecturas → 403 (co:lecturas vacía para residente)", async () => {
    await conSesion(EMAIL.resA1, async () => {
      const res = await invocarApi(moduloEnvioLecturas(), "GET", "co/envios/[id]/lecturas", {
        params: { id: ENV_COMPARTIDO },
      })
      // app/api/co/envios/[id]/lecturas/route.ts:31 + lib/authz.ts:274 — el desglose
      // nominativo es solo del administrador; el residente no tiene `co:lecturas`.
      expect(res.status).toBe(403)
      // app/api/co/envios/[id]/lecturas/route.ts:36 — la respuesta es el error, no la
      // lista de `personaId`/`leidoEn` de los vecinos.
      expect(await cuerpoJson<{ error: string }>(res)).toEqual({ error: "Permiso denegado." })
    })
  })
})

describe("controles-propiedad — propio, otra unidad (T3/T4)", () => {
  it("control: el administrador de A ve los dos controles de su comunidad", async () => {
    await conSesion(EMAIL.adminA, async () => {
      const res = await invocarApi(
        moduloControlesPropiedad(),
        "GET",
        "controles-propiedad?pageSize=100"
      )
      expect(res.status).toBe(200)
      const j = await cuerpoJson<Envelope<{ id: string }>>(res)
      // app/api/controles-propiedad/route.ts:65 — `unidadesVisibles` devuelve "todas"
      // para gestión: las dos filas existen y son legibles, así que lo que le oculta
      // la de A-2 al residente es el filtro por unidad, no la ausencia de la fila.
      expect(new Set(j.data.map((c) => c.id))).toEqual(new Set([CONTROL_A1, CONTROL_A2]))
    })
  })

  it("residente A-1: la colección trae solo el control de su unidad", async () => {
    await conSesion(EMAIL.resA1, async () => {
      const res = await invocarApi(
        moduloControlesPropiedad(),
        "GET",
        "controles-propiedad?pageSize=100"
      )
      expect(res.status).toBe(200)
      const j = await cuerpoJson<Envelope<{ id: string; unidadId: string }>>(res)
      // app/api/controles-propiedad/route.ts:100 — `where.unidadId = { in: visibles }`
      // con `unidadesVinculadasDb(personaId, comunidadId)`: sin ese filtro la
      // colección trae el control de A-2 (el `where` base es solo la comunidad).
      expect(j.data.map((c) => c.id)).toEqual([CONTROL_A1])
      expect(j.data.map((c) => c.unidadId)).toEqual([U_A1])
      // app/api/controles-propiedad/route.ts:110 — el `total` usa el MISMO `where`:
      // no delata la fila de la unidad vecina.
      expect(j.total).toBe(1)
    })
  })

  it("residente A-1: GET de su control → 200; GET del control de A-2 → 403 sin flags", async () => {
    await conSesion(EMAIL.resA1, async () => {
      const propio = await invocarApi(
        moduloControlPropiedad(),
        "GET",
        "controles-propiedad/[id]",
        { params: { id: CONTROL_A1 } }
      )
      // app/api/controles-propiedad/[id]/route.ts:62 — el ABAC de pertenencia deja
      // pasar la unidad propia (control negativo del 403 de abajo).
      expect(propio.status).toBe(200)
      expect((await cuerpoJson<{ id: string }>(propio)).id).toBe(CONTROL_A1)

      const ajeno = await invocarApi(
        moduloControlPropiedad(),
        "GET",
        "controles-propiedad/[id]",
        { params: { id: CONTROL_A2 } }
      )
      // app/api/controles-propiedad/[id]/route.ts:62 — `!unidades.includes(record.unidadId)`:
      // 403, que es lo que el mapa declara para este recurso (a diferencia del 404 de
      // `notificaciones`/`co/envios`). El 404 cross-comunidad es de `:54`.
      expect(ajeno.status).toBe(403)
      // La respuesta es solo el error: ningún flag de privacidad de la unidad vecina.
      expect(await cuerpoJson<{ error: string }>(ajeno)).toEqual({
        error: "Permiso denegado: solo ves los controles de tu unidad.",
      })
    })
  })

  it("residente A-1: PUT y DELETE del control de A-2 → 403 y la fila queda intacta", async () => {
    await conSesion(EMAIL.resA1, async () => {
      const antes = await prisma.controlPropiedad.findUnique({ where: { id: CONTROL_A2 } })
      const put = await invocarApi(
        moduloControlPropiedad(),
        "PUT",
        "controles-propiedad/[id]",
        { params: { id: CONTROL_A2 }, body: { residenteVeMorosidad: true, residenteVeActas: false } }
      )
      // app/api/controles-propiedad/[id]/route.ts:92 — la escritura exige
      // `puedeGestionarControles(rol, "editar")` (`ad` editar, que el residente no
      // tiene): el 403 es por CLAVE, no por fila. La fila ajena igual queda intacta.
      expect(put.status).toBe(403)
      expect(await cuerpoJson<{ error: string }>(put)).toEqual({ error: "Permiso denegado." })
      expect(await prisma.controlPropiedad.findUnique({ where: { id: CONTROL_A2 } })).toEqual(antes)

      const del = await invocarApi(
        moduloControlPropiedad(),
        "DELETE",
        "controles-propiedad/[id]",
        { params: { id: CONTROL_A2 } }
      )
      // app/api/controles-propiedad/[id]/route.ts:169-170 — el DELETE corta con
      // "denegado" dentro de la transacción, antes de archivar y de marcar
      // `desestimada`: no hay borrado lógico de la fila ajena.
      expect(del.status).toBe(403)
      expect(await prisma.controlPropiedad.findUnique({ where: { id: CONTROL_A2 } })).toEqual(antes)
      expect(await prisma.controlPropiedadArchivada.count({ where: { id: CONTROL_A2 } })).toBe(0)
    })
  })
})

describe("cobros-fi/canales — preferencia por persona (T3/T4)", () => {
  it("control: el administrador de A ve las dos preferencias de la comunidad", async () => {
    await conSesion(EMAIL.adminA, async () => {
      const res = await invocarApi(moduloCanalesCobranza(), "GET", "cobros-fi/canales")
      expect(res.status).toBe(200)
      const j = await cuerpoJson<{ personas: { personaId: string }[]; propio: unknown }>(res)
      // app/api/cobros-fi/canales/route.ts:67-78 — `veTodas` (`fi:cobranza` ver, solo
      // admin y comité) lista todas las preferencias de la comunidad.
      expect(new Set(j.personas.map((p) => p.personaId))).toEqual(new Set([P_A1, P_A2]))
      expect(j.propio).toBeNull()
    })
  })

  it("residente A-1: GET → 200 con la colección filtrada (no 403) y solo su preferencia", async () => {
    await conSesion(EMAIL.resA1, async () => {
      const fila = await prisma.preferenciaCanalCobranzaFI.findUnique({
        where: { comunidadId_personaId: { comunidadId: COM_A, personaId: P_A1 } },
      })
      const res = await invocarApi(moduloCanalesCobranza(), "GET", "cobros-fi/canales")
      // Respuesta de HOY, fijada tal cual: el residente no tiene `fi:cobranza` ver, así
      // que la lectura ajena NO es un 403 — es una colección vacía (`personas: []`)
      // más su propia preferencia en `propio`
      // (app/api/cobros-fi/canales/route.ts:87-91). La fila de A-2 no viaja.
      expect(res.status).toBe(200)
      const j = await cuerpoJson<{
        personas: unknown[]
        propio: { personaId: string; visor: boolean; email: boolean } | null
      }>(res)
      expect(j.personas).toEqual([])
      // app/api/cobros-fi/canales/route.ts:62 — `propio` sale de
      // `personaIdDelUsuarioDb(scope.usuarioId)`, nunca del cliente.
      expect(j.propio).toEqual({ personaId: P_A1, visor: fila?.canalVisor, email: fila?.canalEmail })
      expect(JSON.stringify(j)).not.toContain(P_A2)
    })
  })

  it("residente A-1: PUT de su propia preferencia → 200 y se persiste (control negativo)", async () => {
    await conSesion(EMAIL.resA1, async () => {
      const antes = await prisma.preferenciaCanalCobranzaFI.findUnique({
        where: { comunidadId_personaId: { comunidadId: COM_A, personaId: P_A1 } },
      })
      const res = await invocarApi(moduloCanalesCobranza(), "PUT", "cobros-fi/canales", {
        body: { personaId: P_A1, canalVisor: !antes?.canalVisor, canalEmail: !antes?.canalEmail },
      })
      // app/api/cobros-fi/canales/route.ts:148-153 — `fi:cobranza:propia` editar +
      // ABAC de pertenencia: la persona del body es la de la sesión, así que pasa.
      // Sin esta cara, «403 a todo PUT» pasaría por protección correcta.
      expect(res.status).toBe(200)
      expect(await cuerpoJson<{ ok: boolean; personaId: string }>(res)).toMatchObject({
        ok: true,
        personaId: P_A1,
      })
      const despues = await prisma.preferenciaCanalCobranzaFI.findUnique({
        where: { comunidadId_personaId: { comunidadId: COM_A, personaId: P_A1 } },
      })
      expect(despues?.canalVisor).toBe(!antes?.canalVisor)
      expect(despues?.canalEmail).toBe(!antes?.canalEmail)
    })
  })

  it("residente A-1: PUT de la preferencia de A-2 → 403 y la fila de A-2 intacta", async () => {
    await conSesion(EMAIL.resA1, async () => {
      const antes = await prisma.preferenciaCanalCobranzaFI.findUnique({
        where: { comunidadId_personaId: { comunidadId: COM_A, personaId: P_A2 } },
      })
      const res = await invocarApi(moduloCanalesCobranza(), "PUT", "cobros-fi/canales", {
        body: { personaId: P_A2, canalVisor: true, canalEmail: true },
      })
      // app/api/cobros-fi/canales/route.ts:153-154 — `propia !== personaId`: el
      // cliente no decide de quién es la preferencia; el 403 sale antes de leer la
      // persona del body (así que tampoco confirma existencia).
      expect(res.status).toBe(403)
      expect(await cuerpoJson<{ error: string }>(res)).toEqual({ error: "Permiso denegado." })
      expect(
        await prisma.preferenciaCanalCobranzaFI.findUnique({
          where: { comunidadId_personaId: { comunidadId: COM_A, personaId: P_A2 } },
        })
      ).toEqual(antes)
    })
  })
})

describe("co/mensajes-buzon — pertenencia por reportante (T3/T4)", () => {
  it("control: el administrador de A ve los dos mensajes del buzón", async () => {
    await conSesion(EMAIL.adminA, async () => {
      const res = await invocarApi(moduloMensajesBuzon(), "GET", "co/mensajes-buzon?pageSize=100")
      expect(res.status).toBe(200)
      const j = await cuerpoJson<Envelope<{ id: string }>>(res)
      // app/api/co/_lib/buzon-alcance.ts:32 — para el administrador el alcance es `{}`
      // (toda la comunidad): las dos filas existen y son legibles.
      expect(new Set(j.data.map((m) => m.id))).toEqual(new Set([MSG_A1, MSG_A2]))
    })
  })

  it("residente A-1: la colección trae solo el mensaje que reportó él", async () => {
    await conSesion(EMAIL.resA1, async () => {
      const res = await invocarApi(moduloMensajesBuzon(), "GET", "co/mensajes-buzon?pageSize=100")
      expect(res.status).toBe(200)
      const j = await cuerpoJson<Envelope<{ id: string }>>(res)
      // app/api/co/_lib/buzon-alcance.ts:35 — `{ reportantePersonaId: personaId }`:
      // sin ese filtro la bandeja del residente trae el reclamo del vecino.
      expect(j.data.map((m) => m.id)).toEqual([MSG_A1])
      // app/api/co/mensajes-buzon/route.ts:44 — el `total` usa el MISMO `where`.
      expect(j.total).toBe(1)
    })
  })

  it("residente A-1: GET de su mensaje → 200; GET del reportado por A-2 → 404", async () => {
    await conSesion(EMAIL.resA1, async () => {
      const propio = await invocarApi(moduloMensajeBuzon(), "GET", "co/mensajes-buzon/[id]", {
        params: { id: MSG_A1 },
      })
      // app/api/co/mensajes-buzon/[id]/route.ts:40 — `whereMensajeBuzon` conserva el
      // alcance: el reportante sí lee su propio mensaje (control negativo).
      expect(propio.status).toBe(200)
      expect((await cuerpoJson<{ id: string }>(propio)).id).toBe(MSG_A1)

      const ajeno = await invocarApi(moduloMensajeBuzon(), "GET", "co/mensajes-buzon/[id]", {
        params: { id: MSG_A2 },
      })
      // app/api/co/mensajes-buzon/[id]/route.ts:41-43 — el `findFirst` con el alcance
      // no encuentra la fila ajena y responde el mismo 404 que un id inventado.
      expect(ajeno.status).toBe(404)
      expect(await cuerpoJson<{ error: string }>(ajeno)).toEqual({
        error: "Registro no encontrado.",
      })
    })
  })

  it("residente A-1: PUT del mensaje de A-2 → 403 y la fila queda intacta", async () => {
    await conSesion(EMAIL.resA1, async () => {
      const antes = await prisma.mensajeBuzonCO.findUnique({ where: { id: MSG_A2 } })
      const ajeno = await invocarApi(moduloMensajeBuzon(), "PUT", "co/mensajes-buzon/[id]", {
        params: { id: MSG_A2 },
        body: { asunto: "Asunto intruso" },
      })
      // lib/api/put-merge.ts:79-80 — `authzCheck(rol, "editar")` sobre `co:buzon`:
      // el residente solo tiene ver+crear (`lib/authz.ts:273`), así que el 403 es por
      // CLAVE y no por fila. Se fija el contrato real: la fila ajena no se escribe.
      expect(ajeno.status).toBe(403)
      const cuerpoAjeno = await cuerpoJson<{ error: string }>(ajeno)
      expect(cuerpoAjeno).toEqual({ error: "Permiso denegado." })

      // Control que documenta el límite: el MISMO 403 sale para el mensaje propio,
      // así que la regla por fila en escritura no es ejercitable en este recurso (el
      // residente nunca edita). La lectura sí discrimina (ver los dos casos de arriba).
      const propio = await invocarApi(moduloMensajeBuzon(), "PUT", "co/mensajes-buzon/[id]", {
        params: { id: MSG_A1 },
        body: { asunto: "Asunto propio" },
      })
      expect(propio.status).toBe(403)
      expect(await cuerpoJson<{ error: string }>(propio)).toEqual(cuerpoAjeno)

      expect(await prisma.mensajeBuzonCO.findUnique({ where: { id: MSG_A2 } })).toEqual(antes)
    })
  })
})

describe("vinculos — límite documentado, no caso por fila (T3)", () => {
  it("el residente recibe 403 antes de cualquier filtro; el admin sí discrimina comunidad", async () => {
    await conSesion(EMAIL.resA1, async () => {
      const propio = await invocarApi(moduloVinculo(), "GET", "vinculos/[id]", {
        params: { id: V_A1 },
      })
      const ajeno = await invocarApi(moduloVinculo(), "GET", "vinculos/[id]", {
        params: { id: V_A2 },
      })
      // app/api/vinculos/[id]/route.ts:23 — el gate es `puede(rol, "ver", "mp")` y el
      // residente no lo tiene (`lib/authz.ts`): el 403 sale ANTES de leer la fila, con
      // el vínculo propio y con el ajeno por igual. Por eso este recurso NO tiene caso
      // por relación: la regla de fila no se puede ejercitar.
      expect(propio.status).toBe(403)
      expect(ajeno.status).toBe(403)
      expect(await cuerpoJson<{ error: string }>(ajeno)).toEqual(
        await cuerpoJson<{ error: string }>(propio)
      )
      // Mismo límite que `e2e/crud/arrendatario-limite.spec.ts:60` fija para
      // `/api/vinculos` (403 del residente por diseño); no se cambia acá.
    })

    await conSesion(EMAIL.adminA, async () => {
      const propio = await invocarApi(moduloVinculo(), "GET", "vinculos/[id]", {
        params: { id: V_A1 },
      })
      // Control: para un lector `mp` la ruta sí sirve la fila de su comunidad.
      expect(propio.status).toBe(200)
      expect((await cuerpoJson<{ id: string }>(propio)).id).toBe(V_A1)

      const ajeno = await invocarApi(moduloVinculo(), "GET", "vinculos/[id]", {
        params: { id: V_B1 },
      })
      // app/api/vinculos/[id]/route.ts:28-29 — 404 cross-comunidad por
      // `findUnique` + comparación, sin confirmar existencia.
      expect(ajeno.status).toBe(404)
      expect(await cuerpoJson<{ error: string }>(ajeno)).toEqual({
        error: "Registro no encontrado.",
      })
    })
  })
})

describe("liquidaciones — defecto declarado: `pl:propia` sin usar (T3) → cerrado en T6", () => {
  const ids = (cuerpo: Envelope<{ id: string }>) => cuerpo.data.map((fila) => fila.id).sort()

  it("el trabajador A-1 lee SU liquidación (200) y la fila es la suya", async () => {
    await conSesion(EMAIL.trabajadorA, async () => {
      const res = await invocarApi(moduloLiquidacion(), "GET", "liquidaciones/[id]", {
        params: { id: LIQ_A },
      })
      // app/api/liquidaciones/[id]/route.ts:15 → `liquidacionGetPorId`
      // (app/api/liquidaciones/route.ts:178-206): con `pl:propia` ver la lectura
      // se acota a `trabajadorPersonaId === personaId` de la sesión.
      expect(res.status).toBe(200)
      const fila = await cuerpoJson<{
        id: string
        trabajadorPersonaId: string
        liquidoAPagar: number
      }>(res)
      expect(fila.id).toBe(LIQ_A)
      expect(fila.trabajadorPersonaId).toBe(P_A1)
      expect(fila.liquidoAPagar).toBe(650000)
    })
  })

  it("el trabajador A-1: la liquidación de otro trabajador de su comunidad → 404", async () => {
    await conSesion(EMAIL.trabajadorA, async () => {
      const res = await invocarApi(moduloLiquidacion(), "GET", "liquidaciones/[id]", {
        params: { id: LIQ_A2 },
      })
      // Respuesta no filtrante del repo: el 404 no confirma que la fila exista, y
      // el líquido ajeno (LIQ_A2 = 910000) no viaja en el cuerpo.
      expect(res.status).toBe(404)
      const cuerpo = await cuerpoJson<{ error: string }>(res)
      expect(cuerpo).toEqual({ error: "Registro no encontrado." })
      expect(JSON.stringify(cuerpo)).not.toContain("910000")
    })
  })

  it("el trabajador A-1: la liquidación de otra comunidad → 404", async () => {
    await conSesion(EMAIL.trabajadorA, async () => {
      const res = await invocarApi(moduloLiquidacion(), "GET", "liquidaciones/[id]", {
        params: { id: LIQ_B },
      })
      expect(res.status).toBe(404)
      expect(await cuerpoJson<{ error: string }>(res)).toEqual({
        error: "Registro no encontrado.",
      })
    })
  })

  it("el trabajador A-1: la colección trae solo lo suyo", async () => {
    await conSesion(EMAIL.trabajadorA, async () => {
      const res = await invocarApi(moduloLiquidaciones(), "GET", "liquidaciones?pageSize=50")
      expect(res.status).toBe(200)
      const cuerpo = await cuerpoJson<
        Envelope<{ id: string; trabajadorPersonaId: string; liquidoAPagar: number }>
      >(res)
      // app/api/liquidaciones/route.ts:124-169 → `GET` (rama `pl:propia`): el
      // `where` lleva `trabajadorPersonaId` de la sesión (`:150-153`); las filas
      // ajenas no se cuentan.
      expect(ids(cuerpo)).toEqual([LIQ_A])
      expect(cuerpo.total).toBe(1)
      expect(cuerpo.data.map((fila) => fila.trabajadorPersonaId)).toEqual([P_A1])
      // El líquido de LIQ_A2 (910000, otro trabajador) no aparece en ninguna fila.
      expect(cuerpo.data.every((fila) => fila.liquidoAPagar === 650000)).toBe(true)
    })
  })

  it("control: el administrador de A ve todas las liquidaciones de su comunidad", async () => {
    await conSesion(EMAIL.adminA, async () => {
      const coleccion = await invocarApi(
        moduloLiquidaciones(),
        "GET",
        "liquidaciones?pageSize=50"
      )
      expect(coleccion.status).toBe(200)
      const cuerpo = await cuerpoJson<
        Envelope<{ id: string; liquidoAPagar: number }>
      >(coleccion)
      // app/api/liquidaciones/route.ts:130 delega en la factory cuando el rol
      // tiene `pl` ver: el comportamiento administrativo no cambia.
      expect(ids(cuerpo)).toEqual([LIQ_A, LIQ_A2])
      expect(cuerpo.total).toBe(2)
      expect(cuerpo.data.find((fila) => fila.id === LIQ_A2)?.liquidoAPagar).toBe(910000)

      const detalle = await invocarApi(moduloLiquidacion(), "GET", "liquidaciones/[id]", {
        params: { id: LIQ_A2 },
      })
      expect(detalle.status).toBe(200)
      expect((await cuerpoJson<{ id: string }>(detalle)).id).toBe(LIQ_A2)
    })
  })

  it("control: el administrador de A sigue recibiendo 404 cross-comunidad", async () => {
    await conSesion(EMAIL.adminA, async () => {
      const res = await invocarApi(moduloLiquidacion(), "GET", "liquidaciones/[id]", {
        params: { id: LIQ_B },
      })
      // lib/api/crud-factory.ts:335-337 — `findUnique` + `comunidadId !== scope`:
      // la fila de la otra comunidad responde igual que un id inexistente.
      expect(res.status).toBe(404)
      expect(await cuerpoJson<{ error: string }>(res)).toEqual({
        error: "Registro no encontrado.",
      })
    })
  })

  it("el trabajador no ensancha el alcance con personaId/trabajadorPersonaId del cliente", async () => {
    await conSesion(EMAIL.trabajadorA, async () => {
      const alcanceAjeno = `personaId=${P_A2}&trabajadorPersonaId=${P_A2}`
      // Query de la colección: se ignora, la identidad sale de la membresía.
      const coleccion = await invocarApi(
        moduloLiquidaciones(),
        "GET",
        `liquidaciones?pageSize=50&${alcanceAjeno}`
      )
      expect(coleccion.status).toBe(200)
      expect(ids(await cuerpoJson<Envelope<{ id: string }>>(coleccion))).toEqual([LIQ_A])

      // Query del detalle: el `[id]` ajeno sigue siendo 404.
      const detalle = await invocarApi(
        moduloLiquidacion(),
        "GET",
        `liquidaciones/[id]?${alcanceAjeno}`,
        { params: { id: LIQ_A2 } }
      )
      expect(detalle.status).toBe(404)

      // Body: la ruta [id] no tiene PUT (el snapshot es inmutable) y el único
      // canal con body es `POST /api/liquidaciones` (generar). El
      // `trabajadorPersonaId` del body no abre nada: el rol decide antes.
      const alta = await invocarApi(moduloLiquidaciones(), "POST", "liquidaciones", {
        body: { trabajadorPersonaId: P_A2, periodo: "2026-11", diasTrabajados: 30 },
      })
      expect(alta.status).toBe(403)
      expect(await cuerpoJson<{ error: string }>(alta)).toEqual({
        error: "Permiso denegado.",
      })
      // Solo la fila del arnés (LIQ_A2): no se generó una nueva con el body.
      const ajenas = await prisma.liquidacionPL.count({
        where: { comunidadId: COM_A, trabajadorPersonaId: P_A2 },
      })
      expect(ajenas).toBe(1)
      const enBd = await prisma.liquidacionPL.findUnique({ where: { id: LIQ_A } })
      expect(enBd?.trabajadorPersonaId).toBe(P_A1)
    })
  })

  it("conserjería sin identidad MP: no tiene filas que leer (colección vacía, 404 por id)", async () => {
    await conSesion(EMAIL.conserjeA, async () => {
      const coleccion = await invocarApi(moduloLiquidaciones(), "GET", "liquidaciones?pageSize=50")
      expect(coleccion.status).toBe(200)
      const cuerpo = await cuerpoJson<Envelope<{ id: string }>>(coleccion)
      expect(cuerpo.data).toEqual([])
      expect(cuerpo.total).toBe(0)
      const detalle = await invocarApi(moduloLiquidacion(), "GET", "liquidaciones/[id]", {
        params: { id: LIQ_A },
      })
      expect(detalle.status).toBe(404)
    })
  })

  it("preserva la matriz: el residente dueño de la misma persona no entra por `pl:propia`", async () => {
    await conSesion(EMAIL.resA1, async () => {
      // `P_A1` es la persona de las dos sesiones (residente y trabajador), pero la
      // clave gobierna, no la persona: el residente no tiene `pl:propia`.
      const coleccion = await invocarApi(moduloLiquidaciones(), "GET", "liquidaciones?pageSize=50")
      expect(coleccion.status).toBe(403)
      expect(await cuerpoJson<{ error: string }>(coleccion)).toEqual({
        error: "Permiso denegado.",
      })
      const detalle = await invocarApi(moduloLiquidacion(), "GET", "liquidaciones/[id]", {
        params: { id: LIQ_A },
      })
      expect(detalle.status).toBe(403)
    })
  })
})

