/**
 * @vitest-environment node
 *
 * PE-visitas — la autorización telefónica del residente no se reedita.
 *
 * Decisión del owner (2026-11-01): cuando la visita llega SIN aviso, el conserje
 * llama al residente y pide el OK por teléfono. Si lo recibe, registra la visita
 * marcando «autorización telefónica recibida» y se guarda la hora de la gestión.
 * Esa autorización es la constancia de quién dejó entrar a esa persona, así que
 * una vez guardada no se revoca ni se corrige.
 *
 * Se prueba por la ruta HTTP y no por la función de la guardia: el defecto real
 * que hay que impedir es que la guardia quede sin enchufar en el camino de
 * escritura (me pasó al escribirla: quedó en `createCrudHandlers` y no en
 * `createPutMerge`, que es el PUT real). Un test de la función suelta no ve eso.
 *
 * Reglas cubiertas:
 *   1. el caso que tiene que pasar  → se registra con autorización y hora, y
 *                                     editar `notas` después sigue permitido;
 *   2. el que tiene que FALLAR      → revocar la autorización (409) y reescribir
 *                                     la hora de la gestión (409), sin escribir;
 *   3. marcar la autorización sin hora de gestión (400).
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

const SUFIJO = Date.now()
const COMUNIDAD_ID = `com-aut-${SUFIJO}`
const EMAIL_ADMIN = `aut-admin-${SUFIJO}@test.cl`
const USUARIO_ID = `aut-user-${SUFIJO}`
const JORNADA = `aut-jornada-${SUFIJO}`
const FECHA = "2026-05-11"

async function sesionCookie(uid: string, email: string): Promise<string> {
  const { cookieSesionAuthjs } = await import("../helpers/sesion-authjs")
  return cookieSesionAuthjs({ sub: uid, email })
}

function cuerpo(id: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id,
    fecha: FECHA,
    nombre: "Visita Sin Aviso",
    dni: "13.444.555-6",
    jornadaId: JORNADA,
    origenAgenda: "sin_aviso",
    estado: "ingresada",
    horaIngreso: "10:35",
    ...extra,
  }
}

async function post(body: Record<string, unknown>, cookie: string): Promise<Response> {
  state.cookie = cookie
  const { POST } = await import("@/app/api/pe/bitacora-visitas/route")
  const req = new NextRequest("http://localhost/api/pe/bitacora-visitas", {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify(body),
  })
  const res = await POST(req)
  state.cookie = ""
  return res
}

async function put(
  id: string,
  body: Record<string, unknown>,
  cookie: string
): Promise<Response> {
  state.cookie = cookie
  const { PUT } = await import("@/app/api/pe/bitacora-visitas/[id]/route")
  const req = new NextRequest(`http://localhost/api/pe/bitacora-visitas/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify(body),
  })
  const res = await PUT(req, { params: Promise.resolve({ id }) })
  state.cookie = ""
  return res
}

describe("PE-visitas — la autorización telefónica no se reedita", () => {
  beforeAll(async () => {
    process.env.AUTH_SECRET = "test-secret-12345678"
    process.env.NEXT_PUBLIC_APP_ENV = "development"
    await prisma.comunidad.create({
      data: { id: COMUNIDAD_ID, nombre: "Comunidad AUT", slug: `aut-${SUFIJO}` },
    })
    await prisma.usuario.create({
      data: { id: USUARIO_ID, email: EMAIL_ADMIN, activo: true },
    })
    await prisma.membresia.create({
      data: { usuarioId: USUARIO_ID, comunidadId: COMUNIDAD_ID, rol: "administrador" },
    })
  }, 30_000)

  afterAll(async () => {
    try {
      await prisma.bitacoraVisitaPE.deleteMany({ where: { comunidadId: COMUNIDAD_ID } })
      await prisma.eventoAuditoria.deleteMany({ where: { referenciaId: USUARIO_ID } })
      await prisma.membresia.deleteMany({ where: { comunidadId: COMUNIDAD_ID } })
      await prisma.usuario.deleteMany({ where: { id: USUARIO_ID } })
      await prisma.comunidad.delete({ where: { id: COMUNIDAD_ID } }).catch(() => {})
    } catch {
      // intencional: limpieza best-effort
    }
  })

  it("registra la visita sin aviso con autorización y hora de la gestión", async () => {
    const cookie = await sesionCookie(USUARIO_ID, EMAIL_ADMIN)
    const id = `aut-vis-ok-${SUFIJO}`
    const res = await post(
      cuerpo(id, { autorizacionTelefonica: true, horaAutorizacion: "10:30" }),
      cookie
    )
    expect(res.status).toBe(201)

    const fila = await prisma.bitacoraVisitaPE.findUnique({ where: { id } })
    expect(fila?.autorizacionTelefonica).toBe(true)
    expect(fila?.horaAutorizacion).toBe("10:30")
  })

  it("permite editar las notas de una visita ya autorizada", async () => {
    const cookie = await sesionCookie(USUARIO_ID, EMAIL_ADMIN)
    const id = `aut-vis-notas-${SUFIJO}`
    await post(
      cuerpo(id, { autorizacionTelefonica: true, horaAutorizacion: "11:00" }),
      cookie
    )

    const res = await put(id, { notas: "Se le avisó también por citófono." }, cookie)
    expect(res.status).toBe(200)

    const fila = await prisma.bitacoraVisitaPE.findUnique({ where: { id } })
    expect(fila?.notas).toBe("Se le avisó también por citófono.")
    // La autorización sobrevive intacta a la edición.
    expect(fila?.autorizacionTelefonica).toBe(true)
    expect(fila?.horaAutorizacion).toBe("11:00")
  })

  it("rechaza revocar una autorización ya registrada y no escribe", async () => {
    const cookie = await sesionCookie(USUARIO_ID, EMAIL_ADMIN)
    const id = `aut-vis-revocar-${SUFIJO}`
    await post(
      cuerpo(id, { autorizacionTelefonica: true, horaAutorizacion: "12:00" }),
      cookie
    )

    const res = await put(id, { autorizacionTelefonica: false }, cookie)
    expect(res.status).toBe(409)
    expect(await res.text()).toContain("no se puede editar")

    const fila = await prisma.bitacoraVisitaPE.findUnique({ where: { id } })
    expect(fila?.autorizacionTelefonica).toBe(true)
  })

  it("rechaza reescribir la hora de la gestión y no escribe", async () => {
    const cookie = await sesionCookie(USUARIO_ID, EMAIL_ADMIN)
    const id = `aut-vis-hora-${SUFIJO}`
    await post(
      cuerpo(id, { autorizacionTelefonica: true, horaAutorizacion: "13:00" }),
      cookie
    )

    const res = await put(id, { horaAutorizacion: "09:00" }, cookie)
    expect(res.status).toBe(409)

    const fila = await prisma.bitacoraVisitaPE.findUnique({ where: { id } })
    expect(fila?.horaAutorizacion).toBe("13:00")
  })

  it("rechaza marcar la autorización sin la hora de la gestión", async () => {
    const cookie = await sesionCookie(USUARIO_ID, EMAIL_ADMIN)
    const id = `aut-vis-sinhora-${SUFIJO}`
    const res = await post(cuerpo(id, { autorizacionTelefonica: true }), cookie)
    expect(res.status).toBe(400)
    expect(await res.text()).toContain("hora de la gestión")

    const fila = await prisma.bitacoraVisitaPE.findUnique({ where: { id } })
    expect(fila).toBeNull()
  })
})
