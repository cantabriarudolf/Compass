/**
 * @vitest-environment node
 *
 * Visita técnica → avance de la próxima fecha de la mantención (BD real).
 *
 * El defecto que este archivo impide volver a introducir: registrar la visita
 * AVANZABA la `proximaFecha` desde el NAVEGADOR con un
 * `PUT /api/pe/mantenciones/[id]` cuyo resultado nadie miraba. Cuando
 * `pe:mantenciones` pasó a ser de solo lectura para conserjería y mantención
 * (`f7959cd`), ese PUT empezó a responder 403 y la fecha dejó de avanzar EN
 * SILENCIO: la mantención seguía con la fecha vieja y el panel de alertas no la
 * anunciaba a tiempo.
 *
 * La decisión (owner): el hecho de que la visita ocurrió es lo que mueve la
 * próxima fecha, así que el avance vive en `POST /api/pe/visitas-tecnicas` y ya
 * no depende de un permiso sobre el maestro de mantenciones.
 *
 * Reglas cubiertas:
 *   1. conserjería y administrador obtienen el MISMO resultado: la fecha avanza
 *      exactamente `periodicidadMeses` desde la fecha de la VISITA (no desde
 *      «hoy»), lo que además hace correcta la carga de una visita atrasada;
 *   2. la visita se registra igual cuando la mantención no se puede avanzar
 *      (sin vínculo, id desconocido, otra comunidad, sin periodicidad usable) y
 *      el motivo queda REPORTADO en la respuesta y en el log, nunca tragado;
 *   3. el permiso no se abrió: el PUT viejo del navegador sigue siendo 403 para
 *      conserjería (es la prueba de que el camino anterior no podía funcionar);
 *   4. el contrato previo del POST (upsert idempotente por id) no cambia.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest"
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

/** Registro estructurado espía: el aviso tiene que quedar en el log, no en el aire. */
const spiesLog = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
}))
vi.mock("@/lib/logger", () => ({
  logger: spiesLog,
  NIVEL_SILENCIO: "silent",
  crearLogger: () => spiesLog,
  SERVICE: "compass",
}))

const AUTH_SECRET = "test-secret-12345678"

const SUFIJO = Date.now()
const COMUNIDAD = `com-vt-${SUFIJO}`
const OTRA_COMUNIDAD = `com-vt-otra-${SUFIJO}`
const EMAIL_ADMIN = `vt-admin-${SUFIJO}@test.cl`
const EMAIL_CONSERJE = `vt-conserje-${SUFIJO}@test.cl`
const ID_ADMIN = `vt-admin-${SUFIJO}`
const ID_CONSERJE = `vt-conserje-${SUFIJO}`
const PROVEEDOR = `vt-prov-${SUFIJO}`

/** Fecha de la visita deliberadamente lejana: si el avance se anclara en «hoy»,
 * el resultado esperado (visita + periodicidad) no coincidiría. */
const FECHA_VISITA = "2026-02-20"

const cargaModulos = async () => ({
  visitasTec: await import("@/app/api/pe/visitas-tecnicas/route"),
  mantencionItem: await import("@/app/api/pe/mantenciones/[id]/route"),
})

type Handler = (req: Request) => Promise<Response>
type HandlerItem = (
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) => Promise<Response>

interface Aviso {
  estado: string
  mantencionId?: string
  proximaFecha?: string
  mensaje?: string
}

interface CuerpoVisita extends Record<string, unknown> {
  id?: string
  comunidadId?: string
  mantencionId?: string
  proximaFecha?: string
  avanceProximaFecha?: Aviso
  error?: string
}

async function conSesion(email: string, fn: () => Promise<void>): Promise<void> {
  const usuario = await prisma.usuario.findUnique({ where: { email } })
  if (!usuario) throw new Error(`usuario no encontrado: ${email}`)
  const { cookieSesionAuthjs } = await import("../helpers/sesion-authjs")
  state.cookie = await cookieSesionAuthjs({ sub: usuario.id, email: usuario.email })
  try {
    await fn()
  } finally {
    state.cookie = ""
  }
}

async function postVisita(body: Record<string, unknown>): Promise<Response> {
  const { visitasTec } = await cargaModulos()
  const { POST } = visitasTec as unknown as { POST: Handler }
  return POST(
    new NextRequest("http://localhost/api/pe/visitas-tecnicas", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
    })
  )
}

async function putMantencion(id: string, body: Record<string, unknown>): Promise<Response> {
  const { mantencionItem } = await cargaModulos()
  const { PUT } = mantencionItem as unknown as { PUT: HandlerItem }
  return PUT(
    new NextRequest(`http://localhost/api/pe/mantenciones/${id}`, {
      method: "PUT",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
    }),
    { params: Promise.resolve({ id }) }
  )
}

function visita(campos: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    proveedorId: PROVEEDOR,
    tecnicoNombre: "Técnico de prueba",
    fecha: FECHA_VISITA,
    trabajoRealizado: "Revisión completa del sistema",
    ...campos,
  }
}

async function crearMantencion(campos: Record<string, unknown> = {}): Promise<string> {
  const id = `vt-mant-${Math.random().toString(36).slice(2, 10)}`
  await prisma.mantencionPreventivaPE.create({
    data: {
      id,
      comunidadId: COMUNIDAD,
      proveedorId: PROVEEDOR,
      descripcion: "Mantención del ascensor",
      periodicidadMeses: 3,
      proximaFecha: "2026-01-15",
      alertaDiasAntes: 7,
      activo: true,
      ...campos,
    },
  })
  return id
}

async function proximaFechaDe(id: string): Promise<string | null> {
  const fila = await prisma.mantencionPreventivaPE.findUnique({ where: { id } })
  return fila?.proximaFecha ?? null
}

describe("visita técnica → próxima fecha de la mantención (servidor)", () => {
  beforeAll(async () => {
    process.env.AUTH_SECRET = AUTH_SECRET
    for (const comunidad of [
      { id: COMUNIDAD, nombre: "Comunidad VT", slug: `vt-${SUFIJO}` },
      { id: OTRA_COMUNIDAD, nombre: "Comunidad VT otra", slug: `vt-otra-${SUFIJO}` },
    ]) {
      await prisma.comunidad.upsert({ where: { id: comunidad.id }, update: {}, create: comunidad })
    }
    for (const usuario of [
      { id: ID_ADMIN, email: EMAIL_ADMIN },
      { id: ID_CONSERJE, email: EMAIL_CONSERJE },
    ]) {
      await prisma.usuario.upsert({
        where: { email: usuario.email },
        update: {},
        create: { ...usuario, activo: true },
      })
    }
    await prisma.membresia.deleteMany({ where: { usuarioId: { in: [ID_ADMIN, ID_CONSERJE] } } })
    await prisma.membresia.create({
      data: { usuarioId: ID_ADMIN, comunidadId: COMUNIDAD, rol: "administrador" },
    })
    await prisma.membresia.create({
      data: { usuarioId: ID_CONSERJE, comunidadId: COMUNIDAD, rol: "conserjeria" },
    })
  }, 30_000)

  beforeEach(() => {
    spiesLog.info.mockClear()
    spiesLog.warn.mockClear()
    spiesLog.error.mockClear()
  })

  afterAll(async () => {
    try {
      state.cookie = ""
      await prisma.visitaTecnicaPE.deleteMany({ where: { comunidadId: COMUNIDAD } })
      await prisma.mantencionPreventivaPE.deleteMany({
        where: { comunidadId: { in: [COMUNIDAD, OTRA_COMUNIDAD] } },
      })
      await prisma.membresia.deleteMany({ where: { usuarioId: { in: [ID_ADMIN, ID_CONSERJE] } } })
      for (const id of [ID_ADMIN, ID_CONSERJE]) {
        await prisma.usuario.delete({ where: { id } }).catch(() => {})
      }
      for (const id of [COMUNIDAD, OTRA_COMUNIDAD]) {
        await prisma.comunidad.delete({ where: { id } }).catch(() => {})
      }
    } catch {
      // limpieza best-effort
    }
  })

  it("conserjería: la próxima fecha avanza periodicidadMeses desde la fecha de la visita", async () => {
    const mantencionId = await crearMantencion({ periodicidadMeses: 3 })
    const antes = await proximaFechaDe(mantencionId)
    expect(antes).toBe("2026-01-15")

    await conSesion(EMAIL_CONSERJE, async () => {
      const res = await postVisita(visita({ id: `vt-vis-conserje-${SUFIJO}`, mantencionId }))
      expect(res.status).toBe(201)
      // El defecto era exactamente acá: la visita se guardaba y la fecha NO se movía.
      expect(await proximaFechaDe(mantencionId)).toBe("2026-05-20")
      const cuerpo = (await res.json()) as CuerpoVisita
      expect(cuerpo.avanceProximaFecha?.estado).toBe("avanzada")
      expect(cuerpo.avanceProximaFecha?.mantencionId).toBe(mantencionId)
      expect(cuerpo.avanceProximaFecha?.proximaFecha).toBe("2026-05-20")

      // La visita se guardó y conserva su vínculo con el ciclo.
      const guardada = await prisma.visitaTecnicaPE.findUnique({
        where: { id: `vt-vis-conserje-${SUFIJO}` },
      })
      expect(guardada?.mantencionId).toBe(mantencionId)
    })

    // Anclada en la FECHA DE LA VISITA (2026-02-20 + 3 meses), no en «hoy».
    expect(await proximaFechaDe(mantencionId)).toBe("2026-05-20")
    expect(spiesLog.info).toHaveBeenCalled()
  })

  it("administrador: el mismo journey produce el mismo resultado (no depende del rol)", async () => {
    const mantencionId = await crearMantencion({ periodicidadMeses: 3 })
    expect(await proximaFechaDe(mantencionId)).toBe("2026-01-15")

    await conSesion(EMAIL_ADMIN, async () => {
      const res = await postVisita(visita({ id: `vt-vis-admin-${SUFIJO}`, mantencionId }))
      expect(res.status).toBe(201)
      const cuerpo = (await res.json()) as CuerpoVisita
      expect(cuerpo.avanceProximaFecha?.estado).toBe("avanzada")
      expect(cuerpo.avanceProximaFecha?.proximaFecha).toBe("2026-05-20")
    })

    expect(await proximaFechaDe(mantencionId)).toBe("2026-05-20")
  })

  it("el PUT viejo del navegador sigue siendo 403 para conserjería (el camino anterior no podía funcionar)", async () => {
    const mantencionId = await crearMantencion()
    await conSesion(EMAIL_CONSERJE, async () => {
      const res = await putMantencion(mantencionId, { proximaFecha: "2026-05-20" })
      expect(res.status).toBe(403)
    })
    expect(await proximaFechaDe(mantencionId)).toBe("2026-01-15")
  })

  it("visita sin mantención vinculada: se registra y no toca ninguna mantención", async () => {
    const mantencionId = await crearMantencion()
    await conSesion(EMAIL_CONSERJE, async () => {
      const res = await postVisita(visita({ id: `vt-vis-puntual-${SUFIJO}` }))
      expect(res.status).toBe(201)
      const cuerpo = (await res.json()) as CuerpoVisita
      expect(cuerpo.avanceProximaFecha?.estado).toBe("sin_mantencion")
      expect(cuerpo.avanceProximaFecha?.mensaje).toBeUndefined()
    })
    expect(await proximaFechaDe(mantencionId)).toBe("2026-01-15")
    expect(
      await prisma.visitaTecnicaPE.count({ where: { id: `vt-vis-puntual-${SUFIJO}` } })
    ).toBe(1)
  })

  it("mantención inexistente: la visita se crea y el fallo queda reportado (respuesta + log)", async () => {
    const fantasma = `vt-mant-fantasma-${SUFIJO}`
    await conSesion(EMAIL_CONSERJE, async () => {
      const res = await postVisita(visita({ id: `vt-vis-fantasma-${SUFIJO}`, mantencionId: fantasma }))
      expect(res.status).toBe(201)
      const cuerpo = (await res.json()) as CuerpoVisita
      expect(cuerpo.avanceProximaFecha?.estado).toBe("mantencion_no_encontrada")
      expect(cuerpo.avanceProximaFecha?.mensaje).toBeTruthy()
    })
    expect(
      await prisma.visitaTecnicaPE.count({ where: { id: `vt-vis-fantasma-${SUFIJO}` } })
    ).toBe(1)
    expect(spiesLog.warn).toHaveBeenCalledWith(
      expect.objectContaining({ motivo: "mantencion_inexistente" }),
      expect.any(String)
    )
  })

  it("mantención de otra comunidad: no se toca y el aviso no filtra su existencia", async () => {
    const ajenaId = `vt-mant-ajena-${SUFIJO}`
    await prisma.mantencionPreventivaPE.create({
      data: {
        id: ajenaId,
        comunidadId: OTRA_COMUNIDAD,
        proveedorId: PROVEEDOR,
        descripcion: "Mantención de la otra comunidad",
        periodicidadMeses: 3,
        proximaFecha: "2026-01-15",
        alertaDiasAntes: 7,
        activo: true,
      },
    })
    let avisoAjeno: Aviso | undefined
    let avisoFantasma: Aviso | undefined

    await conSesion(EMAIL_CONSERJE, async () => {
      const res = await postVisita(visita({ id: `vt-vis-ajena-${SUFIJO}`, mantencionId: ajenaId }))
      expect(res.status).toBe(201)
      avisoAjeno = ((await res.json()) as CuerpoVisita).avanceProximaFecha

      const resFantasma = await postVisita(
        visita({ id: `vt-vis-otra-fantasma-${SUFIJO}`, mantencionId: `vt-mant-no-existe-${SUFIJO}` })
      )
      avisoFantasma = ((await resFantasma.json()) as CuerpoVisita).avanceProximaFecha
    })

    // La mantención de la otra comunidad queda intacta.
    expect(await proximaFechaDe(ajenaId)).toBe("2026-01-15")
    // Y desde la comunidad de la visita se ve igual que un id que no existe:
    // no se filtra la existencia de datos de otro edificio.
    expect(avisoAjeno?.estado).toBe("mantencion_no_encontrada")
    expect(avisoAjeno?.mensaje).toBe(avisoFantasma?.mensaje)
    expect(avisoAjeno?.proximaFecha).toBeUndefined()
    // En el log SÍ se distingue el motivo, para diagnóstico del operador.
    expect(spiesLog.warn).toHaveBeenCalledWith(
      expect.objectContaining({ motivo: "otra_comunidad" }),
      expect.any(String)
    )
  })

  it("mantención sin periodicidad usable (dato derivado): no se inventa fecha y queda reportado", async () => {
    const mantencionId = await crearMantencion({ periodicidadMeses: 0 })
    await conSesion(EMAIL_CONSERJE, async () => {
      const res = await postVisita(visita({ id: `vt-vis-sin-period-${SUFIJO}`, mantencionId }))
      expect(res.status).toBe(201)
      const cuerpo = (await res.json()) as CuerpoVisita
      expect(cuerpo.avanceProximaFecha?.estado).toBe("sin_periodicidad")
      expect(cuerpo.avanceProximaFecha?.mensaje).toBeTruthy()
    })
    expect(await proximaFechaDe(mantencionId)).toBe("2026-01-15")
    expect(spiesLog.warn).toHaveBeenCalledWith(
      expect.objectContaining({ motivo: "sin_periodicidad" }),
      expect.any(String)
    )
  })

  it("preserva el contrato previo del POST: mismo id → upsert 200 y una sola fila", async () => {
    const id = `vt-vis-upsert-${SUFIJO}`
    await conSesion(EMAIL_CONSERJE, async () => {
      const primera = await postVisita(visita({ id }))
      expect(primera.status).toBe(201)
      const segunda = await postVisita(
        visita({ id, trabajoRealizado: "Reparación de la bomba de agua" })
      )
      expect(segunda.status).toBe(200)
    })
    expect(await prisma.visitaTecnicaPE.count({ where: { id } })).toBe(1)
  })
})
