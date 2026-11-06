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
 * Recursos de este lote: `personas`, `notificaciones`, `co/envios`.
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
}

// Notificaciones de la comunidad A.
const NOTI_A1 = "ppo-noti-a1" // puntual a A-1
const NOTI_A2 = "ppo-noti-a2" // puntual a A-2 (otra unidad)
const NOTI_DIFUSION_ROL = "ppo-noti-difusion-rol" // difusión al rol sin unidad
const NOTI_DIFUSION_U_A2 = "ppo-noti-difusion-ua2" // difusión al rol, unidad de A-2

// Envíos CO de la comunidad A.
const ENV_COMPARTIDO = "ppo-env-compartido" // destinatarios: A-1 y A-2
const ENV_SOLO_A2 = "ppo-env-solo-a2" // destinatario: solo A-2

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

async function limpiar(): Promise<void> {
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

