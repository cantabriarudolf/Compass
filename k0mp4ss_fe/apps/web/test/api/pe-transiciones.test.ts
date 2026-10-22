/**
 * @vitest-environment node
 *
 * Transiciones de Personal (PE) — SERIE-FASE2 §V2.
 *
 * Las cinco acciones que la página `app/personas/personal/page.tsx` ejecutaba
 * contra el store legacy ahora tienen ruta propia, contra BD real (base
 * descartable de la suite):
 *
 * - `POST /api/pe/turnos/iniciar` + `GET /api/pe/turnos` (inicio de turno)
 * - `POST /api/pe/personas/[id]/horas-extras`
 * - `POST /api/pe/personas/[id]/evaluaciones`  (histórica e inmutable)
 * - `POST /api/pe/tareas-monitoreo/[id]/completar`
 * - `POST /api/pe/proyecciones/enviar`         (aviso: NO crea EgresoFI)
 *
 * Guardias: 401 sin sesión, 403 con rol sin permiso (incluida la evaluación,
 * que es solo del administrador), 404 cross-comunidad, idempotencia/cierre de
 * la tarea y la inmutabilidad de la evaluación.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest"
import { NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"
import { costoProyeccionPE } from "@/lib/personal-utils"

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

const comunidad = "pe-trans-comunidad"
const otraComunidad = "pe-trans-otra-comunidad"
const emailAdmin = "pe-trans-admin@test.cl"
const emailConserjeria = "pe-trans-conserjeria@test.cl"
const emailMantencion = "pe-trans-mantencion@test.cl"
const emailComite = "pe-trans-comite@test.cl"
const emailResidente = "pe-trans-residente@test.cl"
const emailAdminOtra = "pe-trans-admin-otra@test.cl"

const emailToId = (email: string): string => email.split("@")[0] ?? email

const hoy = (): string => new Date().toISOString().slice(0, 10)

const nuevoId = (prefijo: string): string =>
  `${prefijo}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`

const cargaModulos = async () => ({
  iniciarTurno: await import("@/app/api/pe/turnos/iniciar/route"),
  turnos: await import("@/app/api/pe/turnos/route"),
  horasExtras: await import("@/app/api/pe/personas/[id]/horas-extras/route"),
  evaluaciones: await import("@/app/api/pe/personas/[id]/evaluaciones/route"),
  completar: await import("@/app/api/pe/tareas-monitoreo/[id]/completar/route"),
  enviarProyeccion: await import("@/app/api/pe/proyecciones/enviar/route"),
})

/** Ficha laboral mínima: lo que `leerDatosLaborales` exige (objeto no vacío). */
const fichaLaboral = (extra: Record<string, unknown> = {}) => ({
  id: nuevoId("lab"),
  cargo: "Conserje",
  afp: "AFP Modelo",
  prevision: "Fonasa",
  fechaIngreso: "2025-01-02",
  ...extra,
})

async function crearPersona(
  overrides: Partial<{
    id: string
    comunidadId: string
    nombres: string
    apellidos: string
    datosLaborales: unknown
    estadoCuenta: string
  }> = {}
): Promise<string> {
  const id = overrides.id ?? nuevoId("pe-p")
  const nombres = overrides.nombres ?? "Ana"
  const apellidos = overrides.apellidos ?? "Pérez"
  await prisma.persona.create({
    data: {
      id,
      comunidadId: overrides.comunidadId ?? comunidad,
      rut: `${Math.floor(Math.random() * 20_000_000) + 5_000_000}-1`,
      nombreCompleto: `${nombres} ${apellidos}`,
      nombres,
      apellidos,
      email: `${id}@test.cl`,
      telefonoMovil: "+56911111111",
      estadoCuenta: overrides.estadoCuenta ?? "activa",
      condicionesEspecialesIds: [],
      roles: ["personal"],
      ...(overrides.datosLaborales !== undefined
        ? { datosLaborales: overrides.datosLaborales as never }
        : {}),
    },
  })
  return id
}

async function crearJornada(overrides: Partial<{ id: string; nombre: string }> = {}): Promise<string> {
  const id = overrides.id ?? nuevoId("pe-jor")
  await prisma.jornada.create({
    data: {
      id,
      comunidadId: comunidad,
      nombre: overrides.nombre ?? "Turno día",
    },
  })
  return id
}

async function crearFeriado(fecha: string, irrenunciable = true): Promise<string> {
  const id = nuevoId("pe-fer")
  await prisma.feriado.create({
    data: { id, comunidadId: comunidad, fecha, nombre: "Fiestas Patrias", irrenunciable },
  })
  return id
}

async function crearTrabajo(overrides: Partial<{ id: string; estado: string; fechaTermino: string }> = {}): Promise<string> {
  const id = overrides.id ?? nuevoId("pe-mt")
  await prisma.trabajoMT.create({
    data: {
      id,
      comunidadId: comunidad,
      folio: `MT-${Math.floor(Math.random() * 9000) + 1000}`,
      titulo: "Cambio de ampolleta pasillo",
      descripcion: "Tarea asignada a conserjería",
      prioridad: "media",
      estado: overrides.estado ?? "planificado",
      ...(overrides.fechaTermino ? { fechaTermino: overrides.fechaTermino } : {}),
      costoTotal: 0,
      origenFondos: "fondo_comun",
      estadoPago: "pendiente",
      alertaGarantiaEnviada: false,
      evidencias: [],
    },
  })
  return id
}

async function sembrarUsuarios(): Promise<void> {
  const roles: Array<[string, string, string]> = [
    [emailAdmin, "administrador", comunidad],
    [emailConserjeria, "conserjeria", comunidad],
    [emailMantencion, "mantencion", comunidad],
    [emailComite, "comite", comunidad],
    [emailResidente, "residente", comunidad],
    [emailAdminOtra, "administrador", otraComunidad],
  ]
  await prisma.membresia.deleteMany({
    where: { usuarioId: { in: roles.map(([email]) => emailToId(email)) } },
  })
  for (const [email, rol, comunidadId] of roles) {
    await prisma.usuario.upsert({
      where: { email },
      update: {},
      create: { id: emailToId(email), email, activo: true },
    })
    await prisma.membresia.create({
      data: { usuarioId: emailToId(email), comunidadId, rol },
    })
  }
}

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

/**
 * Invoca el `POST` de una ruta de acción ya importada.
 *
 * Las rutas exponen firmas distintas (con `ctx.params` o sin él), así que el
 * helper recibe el módulo como `unknown` y adapta la firma en UN solo lugar: el
 * cast solo borra la diferencia de firma, nunca cambia valores.
 */
const postJson = async (
  modulo: unknown,
  url: string,
  body?: unknown,
  params?: Record<string, string>
): Promise<Response> => {
  const { POST } = modulo as {
    POST: (req: Request, ctx?: { params: Promise<Record<string, string>> }) => Promise<Response>
  }
  return POST(
    new NextRequest(`http://localhost${url}`, {
      method: "POST",
      ...(body !== undefined
        ? { body: JSON.stringify(body), headers: { "content-type": "application/json" } }
        : {}),
    }),
    params ? { params: Promise.resolve(params) } : undefined
  )
}

const rutaIniciarTurno = async () => (await cargaModulos()).iniciarTurno
const rutaHorasExtras = async () => (await cargaModulos()).horasExtras
const rutaEvaluaciones = async () => (await cargaModulos()).evaluaciones
const rutaCompletar = async () => (await cargaModulos()).completar
const rutaProyeccion = async () => (await cargaModulos()).enviarProyeccion

const datosLaboralesDe = async (personaId: string) =>
  (await prisma.persona.findUnique({ where: { id: personaId } }))?.datosLaborales as
    | { horasExtras?: Array<Record<string, unknown>>; evaluaciones?: Array<Record<string, unknown>> }
    | null
    | undefined

beforeAll(async () => {
  process.env.AUTH_SECRET = AUTH_SECRET
  await prisma.comunidad.upsert({
    where: { id: comunidad },
    update: {},
    create: { id: comunidad, nombre: "Comunidad PE Transiciones", slug: "pe-trans-comunidad" },
  })
  await prisma.comunidad.upsert({
    where: { id: otraComunidad },
    update: {},
    create: { id: otraComunidad, nombre: "Comunidad PE Otra", slug: "pe-trans-otra" },
  })
  await sembrarUsuarios()
  // Los módulos de ruta importan el stack de Auth.js: se cargan acá (con el
  // timeout largo del `beforeAll`) para que el primer test no pague ese costo.
  await cargaModulos()
}, 60_000)

beforeEach(async () => {
  state.cookie = ""
  await prisma.eventoAuditoria.deleteMany({
    where: {
      comunidadId: { in: [comunidad, otraComunidad] },
      categoria: "PE",
      tipoAccion: {
        in: [
          "PE_START_SHIFT",
          "PE_HORA_EXTRA_REGISTRADA",
          "PE_EVALUACION_REGISTRADA",
          "PE_TASK_DONE",
          "PE_PROYECCION_ENVIADA",
        ],
      },
    },
  })
  await prisma.notificacion.deleteMany({
    where: { comunidadId: { in: [comunidad, otraComunidad] }, moduloOrigen: "PE" },
  })
  await prisma.proyeccionPE.deleteMany({
    where: { comunidadId: { in: [comunidad, otraComunidad] } },
  })
  await prisma.trabajoMT.deleteMany({ where: { comunidadId: { in: [comunidad, otraComunidad] } } })
  await prisma.persona.deleteMany({ where: { comunidadId: { in: [comunidad, otraComunidad] } } })
  await prisma.jornada.deleteMany({ where: { comunidadId: { in: [comunidad, otraComunidad] } } })
  await prisma.feriado.deleteMany({ where: { comunidadId: { in: [comunidad, otraComunidad] } } })
})

afterAll(async () => {
  try {
    state.cookie = ""
    await prisma.eventoAuditoria.deleteMany({
      where: { comunidadId: { in: [comunidad, otraComunidad] } },
    })
    await prisma.notificacion.deleteMany({
      where: { comunidadId: { in: [comunidad, otraComunidad] } },
    })
    await prisma.proyeccionPE.deleteMany({
      where: { comunidadId: { in: [comunidad, otraComunidad] } },
    })
    await prisma.trabajoMT.deleteMany({ where: { comunidadId: { in: [comunidad, otraComunidad] } } })
    await prisma.persona.deleteMany({ where: { comunidadId: { in: [comunidad, otraComunidad] } } })
    await prisma.jornada.deleteMany({ where: { comunidadId: { in: [comunidad, otraComunidad] } } })
    await prisma.feriado.deleteMany({ where: { comunidadId: { in: [comunidad, otraComunidad] } } })
    const ids = [
      emailAdmin,
      emailConserjeria,
      emailMantencion,
      emailComite,
      emailResidente,
      emailAdminOtra,
    ].map(emailToId)
    await prisma.membresia.deleteMany({ where: { usuarioId: { in: ids } } })
    for (const id of ids) {
      await prisma.usuario.delete({ where: { id } }).catch(() => {})
    }
    await prisma.comunidad.delete({ where: { id: otraComunidad } }).catch(() => {})
    await prisma.comunidad.delete({ where: { id: comunidad } }).catch(() => {})
  } catch {
    // limpieza best-effort
  }
})

// --- 1. Inicio de turno -----------------------------------------------------

describe("POST /api/pe/turnos/iniciar", () => {
  it("401 sin sesión", async () => {
    const personaId = await crearPersona({ datosLaborales: fichaLaboral() })
    const jornadaId = await crearJornada()
    state.cookie = ""
    const res = await postJson(await rutaIniciarTurno(), "/api/pe/turnos/iniciar", {
      personaId,
      jornadaId,
    })
    expect(res.status).toBe(401)
    expect(
      await prisma.eventoAuditoria.count({
        where: { comunidadId: comunidad, tipoAccion: "PE_START_SHIFT" },
      })
    ).toBe(0)
  })

  it("403 para mantención y residente (`pe:cierre_turno` es de conserjería)", async () => {
    const personaId = await crearPersona({ datosLaborales: fichaLaboral() })
    const jornadaId = await crearJornada()
    for (const email of [emailMantencion, emailResidente, emailComite]) {
      await conSesion(email, async () => {
        const res = await postJson(await rutaIniciarTurno(), "/api/pe/turnos/iniciar", {
          personaId,
          jornadaId,
        })
        expect(res.status).toBe(403)
        expect(await res.json()).toEqual({ error: "Permiso denegado." })
      })
    }
  })

  it("conserjería inicia el turno y el panel lo lista en el día", async () => {
    const personaId = await crearPersona({
      nombres: "Ana",
      apellidos: "Pérez",
      datosLaborales: fichaLaboral(),
    })
    const jornadaId = await crearJornada({ nombre: "Turno noche" })

    await conSesion(emailConserjeria, async () => {
      const res = await postJson(await rutaIniciarTurno(), "/api/pe/turnos/iniciar", {
        personaId,
        jornadaId,
      })
      expect(res.status).toBe(200)
      expect((await res.json()).ok).toBe(true)

      const evento = await prisma.eventoAuditoria.findFirst({
        where: { comunidadId: comunidad, tipoAccion: "PE_START_SHIFT" },
      })
      expect(evento?.referenciaId).toBe(personaId)
      expect(evento?.descripcion).toBe("Ana Pérez inicia turno (Turno noche).")

      const { turnos } = await cargaModulos()
      const listado = await turnos.GET(
        new NextRequest("http://localhost/api/pe/turnos?pageSize=100", { method: "GET" })
      )
      expect(listado.status).toBe(200)
      const cuerpo = (await listado.json()) as {
        data: Array<{ descripcion: string; referenciaId: string }>
        total: number
      }
      expect(cuerpo.total).toBe(1)
      expect(cuerpo.data[0]?.referenciaId).toBe(personaId)
      // La página muestra `descripcion.split(" inicia")[0]`.
      expect(cuerpo.data[0]?.descripcion.split(" inicia")[0]).toBe("Ana Pérez")
    })
  })

  it("400 si el trabajador no tiene ficha laboral (mensaje del legacy)", async () => {
    const personaId = await crearPersona()
    const jornadaId = await crearJornada()
    await conSesion(emailConserjeria, async () => {
      const res = await postJson(await rutaIniciarTurno(), "/api/pe/turnos/iniciar", {
        personaId,
        jornadaId,
      })
      expect(res.status).toBe(400)
      expect(await res.json()).toEqual({ error: "La persona no tiene ficha laboral de PE." })
    })
  })

  it("404 si el trabajador es de otra comunidad", async () => {
    const personaId = await crearPersona({
      comunidadId: otraComunidad,
      datosLaborales: fichaLaboral(),
    })
    const jornadaId = await crearJornada()
    await conSesion(emailAdmin, async () => {
      const res = await postJson(await rutaIniciarTurno(), "/api/pe/turnos/iniciar", {
        personaId,
        jornadaId,
      })
      expect(res.status).toBe(404)
      expect(await res.json()).toEqual({
        error: "El trabajador no existe en el Maestro de Personas.",
      })
    })
  })
})

// --- 2. Hora extra ----------------------------------------------------------

describe("POST /api/pe/personas/[id]/horas-extras", () => {
  it("401 sin sesión", async () => {
    const personaId = await crearPersona({ datosLaborales: fichaLaboral() })
    state.cookie = ""
    const res = await postJson(await rutaHorasExtras(), `/api/pe/personas/${personaId}/horas-extras`, {
      fecha: hoy(),
      horas: 2,
      motivo: "Reemplazo de turno",
    }, { id: personaId })
    expect(res.status).toBe(401)
    expect((await datosLaboralesDe(personaId))?.horasExtras ?? []).toHaveLength(0)
  })

  it("403 para residente y comité (`pe` editar es de conserjería/mantención/admin)", async () => {
    const personaId = await crearPersona({ datosLaborales: fichaLaboral() })
    for (const email of [emailResidente, emailComite]) {
      await conSesion(email, async () => {
        const res = await postJson(await rutaHorasExtras(), `/api/pe/personas/${personaId}/horas-extras`, {
          fecha: hoy(),
          horas: 2,
          motivo: "Reemplazo de turno",
        }, { id: personaId })
        expect(res.status).toBe(403)
      })
    }
    expect((await datosLaboralesDe(personaId))?.horasExtras ?? []).toHaveLength(0)
  })

  it("conserjería y mantención registran la hora extra con su evento", async () => {
    for (const email of [emailConserjeria, emailMantencion]) {
      const personaId = await crearPersona({ datosLaborales: fichaLaboral() })
      await conSesion(email, async () => {
        const res = await postJson(await rutaHorasExtras(), `/api/pe/personas/${personaId}/horas-extras`, {
          fecha: hoy(),
          horas: 3.5,
          motivo: "Cobertura de feriado",
        }, { id: personaId })
        expect(res.status).toBe(200)
        expect((await res.json()).ok).toBe(true)
      })
      const datos = await datosLaboralesDe(personaId)
      expect(datos?.horasExtras).toHaveLength(1)
      expect(datos?.horasExtras?.[0]).toMatchObject({
        fecha: hoy(),
        horas: 3.5,
        motivo: "Cobertura de feriado",
      })
      expect(
        await prisma.eventoAuditoria.count({
          where: {
            comunidadId: comunidad,
            tipoAccion: "PE_HORA_EXTRA_REGISTRADA",
            referenciaId: personaId,
          },
        })
      ).toBe(1)
    }
  })

  it("400 si las horas no son positivas (schema, mensaje del maestro)", async () => {
    const personaId = await crearPersona({ datosLaborales: fichaLaboral() })
    await conSesion(emailAdmin, async () => {
      const res = await postJson(await rutaHorasExtras(), `/api/pe/personas/${personaId}/horas-extras`, {
        fecha: hoy(),
        horas: 0,
        motivo: "Sin horas",
      }, { id: personaId })
      expect(res.status).toBe(400)
      expect(await res.json()).toEqual({ error: "Las horas extra deben ser mayores a cero." })
    })
    expect((await datosLaboralesDe(personaId))?.horasExtras ?? []).toHaveLength(0)
  })
})

// --- 3. Evaluación (histórica e inmutable) ----------------------------------

describe("POST /api/pe/personas/[id]/evaluaciones", () => {
  const evaluacion = (id?: string) => ({
    ...(id ? { id } : {}),
    fecha: hoy(),
    puntaje: 6,
    comentarios: "Buen desempeño",
  })

  it("401 sin sesión", async () => {
    const personaId = await crearPersona({ datosLaborales: fichaLaboral() })
    state.cookie = ""
    const res = await postJson(await rutaEvaluaciones(), `/api/pe/personas/${personaId}/evaluaciones`, evaluacion(), { id: personaId })
    expect(res.status).toBe(401)
  })

  it("403 para todo rol que no sea administrador (incluida conserjería y comité)", async () => {
    const personaId = await crearPersona({ datosLaborales: fichaLaboral() })
    for (const email of [emailConserjeria, emailMantencion, emailComite, emailResidente]) {
      await conSesion(email, async () => {
        const res = await postJson(await rutaEvaluaciones(), `/api/pe/personas/${personaId}/evaluaciones`, evaluacion(), { id: personaId })
        expect(res.status).toBe(403)
        expect(await res.json()).toEqual({ error: "Permiso denegado." })
      })
    }
    expect((await datosLaboralesDe(personaId))?.evaluaciones ?? []).toHaveLength(0)
  })

  it("el administrador registra la evaluación (append + evento)", async () => {
    const personaId = await crearPersona({ nombres: "Ana", apellidos: "Pérez", datosLaborales: fichaLaboral() })
    await conSesion(emailAdmin, async () => {
      const res = await postJson(await rutaEvaluaciones(), `/api/pe/personas/${personaId}/evaluaciones`, evaluacion(), { id: personaId })
      expect(res.status).toBe(200)
      expect((await res.json()).ok).toBe(true)
    })
    const datos = await datosLaboralesDe(personaId)
    expect(datos?.evaluaciones).toHaveLength(1)
    expect(datos?.evaluaciones?.[0]).toMatchObject({ puntaje: 6, comentarios: "Buen desempeño" })
    const evento = await prisma.eventoAuditoria.findFirst({
      where: { comunidadId: comunidad, tipoAccion: "PE_EVALUACION_REGISTRADA" },
    })
    expect(evento?.descripcion).toBe("Evaluación de desempeño (6/7) registrada para Ana Pérez.")
  })

  it("INMUTABLE: un segundo intento sobre la misma evaluación no la modifica (409)", async () => {
    const personaId = await crearPersona({ datosLaborales: fichaLaboral() })
    const id = nuevoId("ev-fija")

    await conSesion(emailAdmin, async () => {
      const primera = await postJson(await rutaEvaluaciones(), `/api/pe/personas/${personaId}/evaluaciones`, evaluacion(id), { id: personaId })
      expect(primera.status).toBe(200)

      // Segundo intento: mismo id, otro puntaje → rechazo y NADA cambia.
      const segunda = await postJson(await rutaEvaluaciones(), `/api/pe/personas/${personaId}/evaluaciones`, { ...evaluacion(id), puntaje: 1, comentarios: "Reescrita" }, { id: personaId })
      expect(segunda.status).toBe(409)
      expect(await segunda.json()).toEqual({
        error: "La evaluación ya fue registrada y no se puede modificar; registre una nueva.",
      })

      // Agregar OTRA (sin id) sí se permite: el historial solo crece.
      const tercera = await postJson(await rutaEvaluaciones(), `/api/pe/personas/${personaId}/evaluaciones`, evaluacion(), { id: personaId })
      expect(tercera.status).toBe(200)
    })

    const datos = await datosLaboralesDe(personaId)
    expect(datos?.evaluaciones).toHaveLength(2)
    expect(datos?.evaluaciones?.filter((e) => e.id === id)).toHaveLength(1)
    expect(datos?.evaluaciones?.find((e) => e.id === id)).toMatchObject({
      puntaje: 6,
      comentarios: "Buen desempeño",
    })
    // Una sola auditoría por evaluación registrada (la reescritura no dejó rastro).
    expect(
      await prisma.eventoAuditoria.count({
        where: { comunidadId: comunidad, tipoAccion: "PE_EVALUACION_REGISTRADA" },
      })
    ).toBe(2)
  })

  it("400 puntaje fuera de 1..7", async () => {
    const personaId = await crearPersona({ datosLaborales: fichaLaboral() })
    await conSesion(emailAdmin, async () => {
      const res = await postJson(await rutaEvaluaciones(), `/api/pe/personas/${personaId}/evaluaciones`, { fecha: hoy(), puntaje: 9 }, { id: personaId })
      expect(res.status).toBe(400)
      expect(await res.json()).toEqual({ error: "El puntaje va de 1 a 7." })
    })
  })
})

// --- 4. Completar tarea de monitoreo ---------------------------------------

describe("POST /api/pe/tareas-monitoreo/[id]/completar", () => {
  it("401 sin sesión", async () => {
    const tareaId = await crearTrabajo()
    state.cookie = ""
    const res = await postJson(await rutaCompletar(), `/api/pe/tareas-monitoreo/${tareaId}/completar`, {}, { id: tareaId })
    expect(res.status).toBe(401)
    expect((await prisma.trabajoMT.findUnique({ where: { id: tareaId } }))?.estado).toBe("planificado")
  })

  it("403 para residente y comité", async () => {
    const tareaId = await crearTrabajo()
    for (const email of [emailResidente, emailComite]) {
      await conSesion(email, async () => {
        const res = await postJson(await rutaCompletar(), `/api/pe/tareas-monitoreo/${tareaId}/completar`, {}, { id: tareaId })
        expect(res.status).toBe(403)
      })
    }
    expect((await prisma.trabajoMT.findUnique({ where: { id: tareaId } }))?.estado).toBe("planificado")
  })

  it("conserjería completa la tarea: Finalizado + fechaTermino + PE_TASK_DONE", async () => {
    const tareaId = await crearTrabajo()
    await conSesion(emailConserjeria, async () => {
      const res = await postJson(await rutaCompletar(), `/api/pe/tareas-monitoreo/${tareaId}/completar`, {}, { id: tareaId })
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ ok: true })
    })
    const trabajo = await prisma.trabajoMT.findUnique({ where: { id: tareaId } })
    expect(trabajo?.estado).toBe("finalizado")
    expect(trabajo?.fechaTermino).toBe(hoy())
    const evento = await prisma.eventoAuditoria.findFirst({
      where: { comunidadId: comunidad, tipoAccion: "PE_TASK_DONE", referenciaId: tareaId },
    })
    expect(evento?.descripcion).toBe(
      'Tarea "Cambio de ampolleta pasillo" completada desde el panel de monitoreo de PE.'
    )
  })

  it("una segunda pasada devuelve 400 y no repite el evento (exactly-once)", async () => {
    const tareaId = await crearTrabajo()
    await conSesion(emailMantencion, async () => {
      const primera = await postJson(await rutaCompletar(), `/api/pe/tareas-monitoreo/${tareaId}/completar`, {}, { id: tareaId })
      expect(primera.status).toBe(200)
      const segunda = await postJson(await rutaCompletar(), `/api/pe/tareas-monitoreo/${tareaId}/completar`, {}, { id: tareaId })
      expect(segunda.status).toBe(400)
      expect(await segunda.json()).toEqual({ error: "La tarea ya se encuentra cerrada." })
    })
    expect(
      await prisma.eventoAuditoria.count({
        where: { comunidadId: comunidad, tipoAccion: "PE_TASK_DONE", referenciaId: tareaId },
      })
    ).toBe(1)
  })

  it("404 si la tarea es de otra comunidad", async () => {
    const tareaId = nuevoId("pe-mt-otra")
    await prisma.trabajoMT.create({
      data: {
        id: tareaId,
        comunidadId: otraComunidad,
        folio: "MT-9999",
        titulo: "Tarea ajena",
        descripcion: "Otra comunidad",
        prioridad: "baja",
        estado: "planificado",
        costoTotal: 0,
        origenFondos: "fondo_comun",
        estadoPago: "pendiente",
        alertaGarantiaEnviada: false,
        evidencias: [],
      },
    })
    await conSesion(emailAdmin, async () => {
      const res = await postJson(await rutaCompletar(), `/api/pe/tareas-monitoreo/${tareaId}/completar`, {}, { id: tareaId })
      expect(res.status).toBe(404)
      expect(await res.json()).toEqual({
        error: "La tarea indicada no existe en Mantenimiento.",
      })
    })
  })
})

// --- 5. Proyección de costo (aviso, NO egreso FI) ---------------------------

describe("POST /api/pe/proyecciones/enviar", () => {
  const mesAnio = "2026-09"

  it("401 sin sesión", async () => {
    state.cookie = ""
    const res = await postJson(await rutaProyeccion(), "/api/pe/proyecciones/enviar", {
      mesAnio,
      costoParche: 35_000,
      costoDiaExtra: 28_000,
    })
    expect(res.status).toBe(401)
  })

  it("403 para residente y comité", async () => {
    await crearFeriado(`${mesAnio}-18`)
    for (const email of [emailResidente, emailComite]) {
      await conSesion(email, async () => {
        const res = await postJson(await rutaProyeccion(), "/api/pe/proyecciones/enviar", {
          mesAnio,
          costoParche: 35_000,
          costoDiaExtra: 28_000,
        })
        expect(res.status).toBe(403)
      })
    }
    expect(await prisma.proyeccionPE.count({ where: { comunidadId: comunidad } })).toBe(0)
  })

  it("registra la proyección y NO crea ningún egreso FI (es aviso/métrica)", async () => {
    await crearFeriado(`${mesAnio}-18`, true)
    await crearFeriado(`${mesAnio}-19`, true)
    // Personal de planta: dos fichas activas + una inactiva (no cuenta).
    await crearPersona({ datosLaborales: fichaLaboral(), estadoCuenta: "activa" })
    await crearPersona({ datosLaborales: fichaLaboral(), estadoCuenta: "activa" })
    await crearPersona({ datosLaborales: fichaLaboral(), estadoCuenta: "inactiva" })

    const egresosAntes = await prisma.egresoFI.count({ where: { comunidadId: comunidad } })

    await conSesion(emailConserjeria, async () => {
      const res = await postJson(await rutaProyeccion(), "/api/pe/proyecciones/enviar", {
        mesAnio,
        costoParche: 35_000,
        costoDiaExtra: 28_000,
      })
      expect(res.status).toBe(200)
      const cuerpo = (await res.json()) as { ok: boolean; id: string; costoEstimado: number }
      expect(cuerpo.ok).toBe(true)

      const proyeccion = await prisma.proyeccionPE.findUnique({ where: { id: cuerpo.id } })
      expect(proyeccion?.mesAnio).toBe(mesAnio)
      expect(proyeccion?.diasFeriados).toBe(2)
      // 2 feriados irrenunciables × 2 jornadas = 4 reemplazos.
      expect(proyeccion?.reemplazosNecesarios).toBe(4)
      expect(proyeccion?.enviadoAFI).toBe(true)
      expect(proyeccion?.liquidacionPLReferencia).toBe("pendiente")
      // El costo lo calcula el SERVIDOR con la función pura (misma que la UI).
      expect(proyeccion?.costoEstimado).toBe(costoProyeccionPE(4, 2, 35_000, 28_000))
      expect(cuerpo.costoEstimado).toBe(proyeccion?.costoEstimado)
    })

    // La proyección es un aviso: FI no se mueve ni un peso.
    expect(await prisma.egresoFI.count({ where: { comunidadId: comunidad } })).toBe(egresosAntes)
    expect(await prisma.egresoFI.count({ where: { comunidadId: comunidad } })).toBe(0)

    // Aviso a administración + evento de auditoría.
    const notificacion = await prisma.notificacion.findFirst({
      where: { comunidadId: comunidad, moduloOrigen: "PE" },
    })
    expect(notificacion?.destinatarioRol).toBe("administracion")
    expect(notificacion?.asunto).toContain("2 feriado(s)")
    expect(
      await prisma.eventoAuditoria.count({
        where: { comunidadId: comunidad, tipoAccion: "PE_PROYECCION_ENVIADA" },
      })
    ).toBe(1)
  })

  it("400 si el mes no tiene feriados cargados (mensaje del legacy)", async () => {
    await conSesion(emailAdmin, async () => {
      const res = await postJson(await rutaProyeccion(), "/api/pe/proyecciones/enviar", {
        mesAnio: "2026-02",
        costoParche: 35_000,
        costoDiaExtra: 28_000,
      })
      expect(res.status).toBe(400)
      expect(await res.json()).toEqual({
        error:
          "No hay feriados registrados para 2026-02; cargue el calendario antes de proyectar.",
      })
    })
  })

  it("400 con formato de mes inválido o costos negativos", async () => {
    await crearFeriado(`${mesAnio}-18`)
    await conSesion(emailAdmin, async () => {
      const malMes = await postJson(await rutaProyeccion(), "/api/pe/proyecciones/enviar", {
        mesAnio: "2026/09",
        costoParche: 1,
        costoDiaExtra: 1,
      })
      expect(malMes.status).toBe(400)
      expect(await malMes.json()).toEqual({ error: "El mes debe tener formato AAAA-MM." })

      const negativo = await postJson(await rutaProyeccion(), "/api/pe/proyecciones/enviar", {
        mesAnio,
        costoParche: -1,
        costoDiaExtra: 1,
      })
      expect(negativo.status).toBe(400)
      expect(await negativo.json()).toEqual({
        error: "Los costos de parche y día extra no pueden ser negativos.",
      })
    })
  })
})
