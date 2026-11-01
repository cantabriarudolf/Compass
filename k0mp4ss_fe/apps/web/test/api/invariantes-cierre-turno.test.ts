/**
 * @vitest-environment node
 *
 * INV-02 — "un cierre de turno por trabajador, fecha y jornada" (docs/INVARIANTES.md).
 *
 * Decisión del owner: una persona cierra UN turno por fecha+jornada. Dos
 * trabajadores pueden llamarse igual; lo que los distingue es el RUT (identidad
 * de MP), no el nombre. Por eso la regla se ancla en `trabajadorPersonaId` —que
 * es la ficha con RUT único por comunidad— y nunca en `nombreCompleto`.
 *
 * Antes la regla vivía sólo en la pantalla de bitácora
 * (`app/operaciones/bitacora/page.tsx:182`): por API se podían cargar dos
 * cierres del mismo trabajador, la misma fecha y la misma jornada.
 *
 * Dos pruebas por regla (pedido del owner):
 *   1. el caso que tiene que pasar  → dos personas homónimas, RUT distinto, 2 cierres;
 *   2. el que tiene que FALLAR      → misma persona+fecha+jornada, 409 y no escribe.
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
const COMUNIDAD_ID = `com-inv02-${SUFIJO}`
const EMAIL_ADMIN = `inv02-admin-${SUFIJO}@test.cl`
const USUARIO_ID = `inv02-user-${SUFIJO}`
const JORNADA = `inv02-jornada-${SUFIJO}`
const FECHA = "2026-05-11"

/** Dos fichas homónimas: el nombre no identifica, el RUT sí. */
const PERSONA_A = `inv02-pa-${SUFIJO}`
const PERSONA_B = `inv02-pb-${SUFIJO}`
const NOMBRE_HOMONIMO = "Juan Pérez González"

async function sesionCookie(uid: string, email: string): Promise<string> {
  const { cookieSesionAuthjs } = await import("../helpers/sesion-authjs")
  return cookieSesionAuthjs({ sub: uid, email })
}

function cuerpo(id: string, trabajadorPersonaId: string): Record<string, unknown> {
  return {
    id,
    fecha: FECHA,
    hora: "20:00",
    jornadaReportadaId: JORNADA,
    trabajadorPersonaId,
    novedadesGenerales: "Turno sin novedades",
    incidencias: { hubo: false },
    checklistInstalaciones: [{ item: "Portón principal", ok: true }],
    checklistEquipamiento: [{ item: "Celular de ronda", ok: true }],
    historialCambios: [{ fecha: FECHA, resumen: "Cierre enviado por el trabajador" }],
    notificadoAAdmin: true,
  }
}

async function post(body: Record<string, unknown>, cookie: string): Promise<Response> {
  state.cookie = cookie
  const { POST } = await import("@/app/api/pe/cierres-turno/route")
  const req = new NextRequest("http://localhost/api/pe/cierres-turno", {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify(body),
  })
  const res = await POST(req)
  state.cookie = ""
  return res
}

describe("INV-02 — un cierre por trabajador, fecha y jornada", () => {
  beforeAll(async () => {
    process.env.AUTH_SECRET = "test-secret-12345678"
    process.env.NEXT_PUBLIC_APP_ENV = "development"
    await prisma.comunidad.create({
      data: { id: COMUNIDAD_ID, nombre: "Comunidad INV02", slug: `inv02-${SUFIJO}` },
    })
    await prisma.usuario.create({
      data: { id: USUARIO_ID, email: EMAIL_ADMIN, activo: true },
    })
    await prisma.membresia.create({
      data: { usuarioId: USUARIO_ID, comunidadId: COMUNIDAD_ID, rol: "administrador" },
    })
    await prisma.persona.create({
      data: {
        id: PERSONA_A,
        comunidadId: COMUNIDAD_ID,
        rut: "9.111.111-1",
        nombreCompleto: NOMBRE_HOMONIMO,
        nombres: "Juan",
        apellidos: "Pérez González",
        email: `inv02-a-${SUFIJO}@test.cl`,
        telefonoMovil: "+56911111111",
        estadoCuenta: "activa",
        condicionesEspecialesIds: [],
        roles: [],
      },
    })
    await prisma.persona.create({
      data: {
        id: PERSONA_B,
        comunidadId: COMUNIDAD_ID,
        rut: "9.222.222-2",
        nombreCompleto: NOMBRE_HOMONIMO,
        nombres: "Juan",
        apellidos: "Pérez González",
        email: `inv02-b-${SUFIJO}@test.cl`,
        telefonoMovil: "+56922222222",
        estadoCuenta: "activa",
        condicionesEspecialesIds: [],
        roles: [],
      },
    })
  }, 30_000)

  afterAll(async () => {
    try {
      await prisma.cierreTurnoPE.deleteMany({ where: { comunidadId: COMUNIDAD_ID } })
      await prisma.eventoAuditoria.deleteMany({ where: { referenciaId: USUARIO_ID } })
      await prisma.membresia.deleteMany({ where: { comunidadId: COMUNIDAD_ID } })
      await prisma.usuario.deleteMany({ where: { id: USUARIO_ID } })
      await prisma.persona.deleteMany({ where: { id: { in: [PERSONA_A, PERSONA_B] } } })
      await prisma.comunidad.delete({ where: { id: COMUNIDAD_ID } }).catch(() => {})
    } catch {
      // intencional: limpieza best-effort
    }
  })

  it("acepta un cierre por cada persona homónima (RUT distinto)", async () => {
    const cookie = await sesionCookie(USUARIO_ID, EMAIL_ADMIN)

    const ra = await post(cuerpo(`inv02-cie-a-${SUFIJO}`, PERSONA_A), cookie)
    const rb = await post(cuerpo(`inv02-cie-b-${SUFIJO}`, PERSONA_B), cookie)

    expect(ra.status).toBe(201)
    expect(rb.status).toBe(201)

    const cierres = await prisma.cierreTurnoPE.findMany({
      where: { comunidadId: COMUNIDAD_ID, fecha: FECHA, jornadaReportadaId: JORNADA },
    })
    expect(cierres).toHaveLength(2)
    const ruts = await prisma.persona.findMany({
      where: { id: { in: [PERSONA_A, PERSONA_B] } },
      select: { id: true, nombreCompleto: true, rut: true },
    })
    expect(new Set(ruts.map((p) => p.nombreCompleto)).size).toBe(1)
    expect(new Set(ruts.map((p) => p.rut)).size).toBe(2)
  })

  it("RECHAZA un segundo cierre del mismo trabajador, fecha y jornada y no escribe nada", async () => {
    const cookie = await sesionCookie(USUARIO_ID, EMAIL_ADMIN)
    const antes = await prisma.cierreTurnoPE.count({ where: { comunidadId: COMUNIDAD_ID } })

    const res = await post(cuerpo(`inv02-cie-dup-${SUFIJO}`, PERSONA_A), cookie)

    expect(res.status).toBe(409)
    const j = (await res.json()) as { error: string }
    expect(j.error).toBe(
      "Conflicto: ese trabajador ya registró un cierre para esa fecha y jornada."
    )

    const despues = await prisma.cierreTurnoPE.count({ where: { comunidadId: COMUNIDAD_ID } })
    expect(despues).toBe(antes)
    const inexistente = await prisma.cierreTurnoPE.findUnique({
      where: { id: `inv02-cie-dup-${SUFIJO}` },
    })
    expect(inexistente).toBeNull()
  })

  it("RECHAZA mover por PUT un cierre sobre las claves de otro ya registrado", async () => {
    const cookie = await sesionCookie(USUARIO_ID, EMAIL_ADMIN)
    const otroId = `inv02-cie-otro-${SUFIJO}`
    const alta = await post(
      { ...cuerpo(otroId, PERSONA_B), fecha: "2026-05-12" },
      cookie
    )
    expect(alta.status).toBe(201)

    const { PUT } = await import("@/app/api/pe/cierres-turno/[id]/route")
    const req = new NextRequest(`http://localhost/api/pe/cierres-turno/${otroId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({ fecha: FECHA, trabajadorPersonaId: PERSONA_A }),
    })
    state.cookie = cookie
    const res = await PUT(req, { params: Promise.resolve({ id: otroId }) })
    state.cookie = ""

    // Ya existe un cierre de PERSONA_A con FECHA+JORNADA: el PUT no puede crearlo por la puerta de atrás.
    expect(res.status).toBe(409)
    const fila = await prisma.cierreTurnoPE.findUnique({ where: { id: otroId } })
    expect(fila?.fecha).toBe("2026-05-12")
    expect(fila?.trabajadorPersonaId).toBe(PERSONA_B)

    // Y editar el mismo cierre sin mover sus claves no se auto-bloquea.
    state.cookie = cookie
    const ok = await PUT(
      new NextRequest(`http://localhost/api/pe/cierres-turno/${otroId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", cookie },
        body: JSON.stringify({ novedadesGenerales: "Turno con una novedad" }),
      }),
      { params: Promise.resolve({ id: otroId }) }
    )
    state.cookie = ""
    expect(ok.status).toBe(200)
  })
})
