/**
 * @vitest-environment node
 *
 * T1c (odd/tasks/pe-paneles-bd.md) — auditoría de las escrituras REST de PE.
 *
 * Los tres paneles PE dejaron el store legacy y ahora escriben vía POST/PUT
 * contra `app/api/pe/{bitacora-visitas,encomiendas,ingresos-contratistas}`.
 * El store emitía eventos de auditoría al escribir (la bitácora del módulo PE
 * es auditable), así que la API los conserva con el hook post-escritura
 * `despuesDeEscribir` de crud-factory/put-merge cableado a `registrarEventoPE`
 * y los MISMOS textos del store:
 *
 * - Visita: `PE_VISITA_INGRESADA` solo si la fila queda `ingresada`
 *   (en PUT, además, solo si el previo no lo estaba ya).
 * - Encomienda: `PE_ENCOMIENDA_RECIBIDA` al POST (igual que el store, sin
 *   mirar estado) y `PE_ENCOMIENDA_RETIRADA` en la transición a `retirada`
 *   con `retiro` presente, sin duplicar en PUT repetidos.
 * - Contratista: `PE_CONTRATISTA_INGRESADO` en la transición a `ingresado`
 *   (el POST agendado no emitía en el store y tampoco emite acá).
 * - Contrato de la factory: una ruta configurada SIN hook (el POST de
 *   ingresos-contratistas) responde igual y escribe 0 eventos.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
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

const COMUNIDAD = "t1c-esc-comunidad"
const USER_ID = "t1c-esc-user-conserjeria"
const EMAIL = "t1c-esc-conserjeria@test.cl"

const FECHA = "2026-02-03"

const nuevoId = (prefijo: string): string =>
  `${prefijo}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`

const eventosDe = async (tipoAccion: string) =>
  prisma.eventoAuditoria.findMany({
    where: { comunidadId: COMUNIDAD, tipoAccion },
    orderBy: { timestamp: "asc" },
  })

const llamarPost = (
  handler: (req: Request) => Promise<Response>,
  url: string,
  body: unknown
): Promise<Response> =>
  handler(
    new NextRequest(`http://localhost${url}`, {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
    })
  )

const llamarPut = (
  handler: (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response>,
  url: string,
  body: unknown,
  id: string
): Promise<Response> =>
  handler(
    new NextRequest(`http://localhost${url}`, {
      method: "PUT",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
    }),
    { params: Promise.resolve({ id }) }
  )

interface Rutas {
  visitas: typeof import("@/app/api/pe/bitacora-visitas/route")
  visitaId: typeof import("@/app/api/pe/bitacora-visitas/[id]/route")
  encomiendas: typeof import("@/app/api/pe/encomiendas/route")
  encomiendaId: typeof import("@/app/api/pe/encomiendas/[id]/route")
  ingresos: typeof import("@/app/api/pe/ingresos-contratistas/route")
  ingresoId: typeof import("@/app/api/pe/ingresos-contratistas/[id]/route")
}

let rutas: Rutas

const visitaBase = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: nuevoId("t1c-vis"),
  fecha: FECHA,
  nombre: "Mario Pérez",
  dni: "12.345.678-9",
  jornadaId: "t1c-jornada-libre",
  origenAgenda: "sin_aviso",
  estado: "agendada",
  ...overrides,
})

const encomiendaBase = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: nuevoId("t1c-enc"),
  courierId: "t1c-courier",
  fechaRecepcion: FECHA,
  estado: "recibida",
  ...overrides,
})

beforeAll(async () => {
  process.env.AUTH_SECRET = AUTH_SECRET

  await prisma.comunidad.upsert({
    where: { id: COMUNIDAD },
    update: {},
    create: { id: COMUNIDAD, nombre: "Comunidad T1c Escrituras", slug: COMUNIDAD },
  })
  await prisma.usuario.upsert({
    where: { email: EMAIL },
    update: {},
    create: { id: USER_ID, email: EMAIL, activo: true },
  })
  await prisma.membresia.deleteMany({ where: { usuarioId: USER_ID } })
  await prisma.membresia.create({
    data: { usuarioId: USER_ID, comunidadId: COMUNIDAD, rol: "conserjeria" },
  })

  // Maestros que las descripciones resuelven por nombre (fallback: el id).
  await prisma.courier.upsert({
    where: { id: "t1c-courier" },
    update: {},
    create: { id: "t1c-courier", comunidadId: COMUNIDAD, nombre: "Chilexpress" },
  })
  await prisma.contratista.upsert({
    where: { id: "t1c-contratista" },
    update: {},
    create: { id: "t1c-contratista", comunidadId: COMUNIDAD, nombre: "Fuxia Servicios" },
  })

  // Módulos de ruta: se cargan acá (con el timeout largo del beforeAll) para
  // que el primer test no pague el costo del stack de Auth.js.
  rutas = {
    visitas: await import("@/app/api/pe/bitacora-visitas/route"),
    visitaId: await import("@/app/api/pe/bitacora-visitas/[id]/route"),
    encomiendas: await import("@/app/api/pe/encomiendas/route"),
    encomiendaId: await import("@/app/api/pe/encomiendas/[id]/route"),
    ingresos: await import("@/app/api/pe/ingresos-contratistas/route"),
    ingresoId: await import("@/app/api/pe/ingresos-contratistas/[id]/route"),
  }

  const { cookieSesionAuthjs } = await import("../helpers/sesion-authjs")
  state.cookie = await cookieSesionAuthjs({ sub: USER_ID, email: EMAIL })
}, 60_000)

beforeEach(async () => {
  await prisma.bitacoraVisitaPE.deleteMany({ where: { comunidadId: COMUNIDAD } })
  await prisma.encomiendaPE.deleteMany({ where: { comunidadId: COMUNIDAD } })
  await prisma.ingresoContratistaPE.deleteMany({ where: { comunidadId: COMUNIDAD } })
  await prisma.eventoAuditoria.deleteMany({ where: { comunidadId: COMUNIDAD } })
})

afterAll(async () => {
  try {
    state.cookie = ""
    await prisma.eventoAuditoria.deleteMany({ where: { comunidadId: COMUNIDAD } })
    await prisma.bitacoraVisitaPE.deleteMany({ where: { comunidadId: COMUNIDAD } })
    await prisma.encomiendaPE.deleteMany({ where: { comunidadId: COMUNIDAD } })
    await prisma.ingresoContratistaPE.deleteMany({ where: { comunidadId: COMUNIDAD } })
    await prisma.courier.deleteMany({ where: { comunidadId: COMUNIDAD } })
    await prisma.contratista.deleteMany({ where: { comunidadId: COMUNIDAD } })
    await prisma.membresia.deleteMany({ where: { usuarioId: USER_ID } })
    await prisma.usuario.delete({ where: { id: USER_ID } }).catch(() => {})
    await prisma.comunidad.delete({ where: { id: COMUNIDAD } }).catch(() => {})
  } catch {
    // limpieza best-effort
  }
})

// --- Bitácora de visitas -----------------------------------------------------

describe("POST /api/pe/bitacora-visitas — auditoría de visita", () => {
  it("estado ingresada → 1 evento PE_VISITA_INGRESADA con el texto del store", async () => {
    const id = nuevoId("t1c-vis")
    const res = await llamarPost(rutas.visitas.POST, "/api/pe/bitacora-visitas", {
      ...visitaBase({ id }),
      estado: "ingresada",
      horaIngreso: "14:30",
    })
    expect(res.status).toBe(201)

    const eventos = await eventosDe("PE_VISITA_INGRESADA")
    expect(eventos).toHaveLength(1)
    const evento = eventos[0]
    expect(evento?.referenciaId).toBe(id)
    expect(evento?.categoria).toBe("PE")
    expect(evento?.usuario).toBe(USER_ID)
    expect(evento?.descripcion).toBe(
      "Visita Mario Pérez ingresada (sin aviso) a las 14:30."
    )
  })

  it("estado agendada → 0 eventos", async () => {
    const res = await llamarPost(rutas.visitas.POST, "/api/pe/bitacora-visitas", visitaBase())
    expect(res.status).toBe(201)
    expect(await eventosDe("PE_VISITA_INGRESADA")).toHaveLength(0)
  })
})

describe("PUT /api/pe/bitacora-visitas/[id] — auditoría de ingreso de visita", () => {
  it("agendada → ingresada emite 1 evento; un segundo PUT idéntico no duplica", async () => {
    const id = nuevoId("t1c-vis")
    await llamarPost(rutas.visitas.POST, "/api/pe/bitacora-visitas", {
      ...visitaBase({ id, nombre: "Agendada Test", origenAgenda: "pre_agendada" }),
    })

    const parche = { estado: "ingresada", horaIngreso: "10:30" }
    const res = await llamarPut(
      rutas.visitaId.PUT,
      "/api/pe/bitacora-visitas/t1c",
      parche,
      id
    )
    expect(res.status).toBe(200)

    const eventos = await eventosDe("PE_VISITA_INGRESADA")
    expect(eventos).toHaveLength(1)
    expect(eventos[0]?.referenciaId).toBe(id)
    expect(eventos[0]?.descripcion).toBe(
      "Visita Agendada Test ingresada (agendada) a las 10:30."
    )

    const res2 = await llamarPut(
      rutas.visitaId.PUT,
      "/api/pe/bitacora-visitas/t1c",
      parche,
      id
    )
    expect(res2.status).toBe(200)
    expect(await eventosDe("PE_VISITA_INGRESADA")).toHaveLength(1)
  })

  it("PUT que no cambia el estado (sigue agendada) → 0 eventos", async () => {
    const id = nuevoId("t1c-vis")
    await llamarPost(rutas.visitas.POST, "/api/pe/bitacora-visitas", visitaBase({ id }))

    const res = await llamarPut(
      rutas.visitaId.PUT,
      "/api/pe/bitacora-visitas/t1c",
      { notas: "reprogramada" },
      id
    )
    expect(res.status).toBe(200)
    expect(await eventosDe("PE_VISITA_INGRESADA")).toHaveLength(0)
  })
})

// --- Encomiendas -------------------------------------------------------------

describe("POST /api/pe/encomiendas — auditoría de encomienda", () => {
  it("→ 1 evento PE_ENCOMIENDA_RECIBIDA con el nombre del courier", async () => {
    const id = nuevoId("t1c-enc")
    const res = await llamarPost(
      rutas.encomiendas.POST,
      "/api/pe/encomiendas",
      encomiendaBase({ id })
    )
    expect(res.status).toBe(201)

    const eventos = await eventosDe("PE_ENCOMIENDA_RECIBIDA")
    expect(eventos).toHaveLength(1)
    expect(eventos[0]?.referenciaId).toBe(id)
    expect(eventos[0]?.descripcion).toBe("Encomienda recibida de Chilexpress.")
  })
})

describe("PUT /api/pe/encomiendas/[id] — auditoría de retiro", () => {
  it("recibida → retirada con retiro emite 1 evento; segundo PUT idéntico no duplica", async () => {
    const id = nuevoId("t1c-enc")
    await llamarPost(rutas.encomiendas.POST, "/api/pe/encomiendas", encomiendaBase({ id }))

    const parche = {
      estado: "retirada",
      retiro: { retiradoPor: "María Soto", fechaRetiro: FECHA },
    }
    const res = await llamarPut(
      rutas.encomiendaId.PUT,
      "/api/pe/encomiendas/t1c",
      parche,
      id
    )
    expect(res.status).toBe(200)

    const eventos = await eventosDe("PE_ENCOMIENDA_RETIRADA")
    expect(eventos).toHaveLength(1)
    expect(eventos[0]?.referenciaId).toBe(id)
    expect(eventos[0]?.descripcion).toBe("Encomienda entregada a María Soto.")

    const res2 = await llamarPut(
      rutas.encomiendaId.PUT,
      "/api/pe/encomiendas/t1c",
      parche,
      id
    )
    expect(res2.status).toBe(200)
    expect(await eventosDe("PE_ENCOMIENDA_RETIRADA")).toHaveLength(1)
  })

  it("pasa a retirada sin retiro → 0 eventos", async () => {
    const id = nuevoId("t1c-enc")
    await llamarPost(rutas.encomiendas.POST, "/api/pe/encomiendas", encomiendaBase({ id }))

    const res = await llamarPut(
      rutas.encomiendaId.PUT,
      "/api/pe/encomiendas/t1c",
      { estado: "retirada" },
      id
    )
    expect(res.status).toBe(200)
    expect(await eventosDe("PE_ENCOMIENDA_RETIRADA")).toHaveLength(0)
  })
})

// --- Ingresos de contratistas ------------------------------------------------

describe("PUT /api/pe/ingresos-contratistas/[id] — auditoría de ingreso", () => {
  it("agendado → ingresado emite 1 evento con motivo truncado a 60", async () => {
    const id = nuevoId("t1c-ing")
    await prisma.ingresoContratistaPE.create({
      data: {
        id,
        comunidadId: COMUNIDAD,
        contratistaId: "t1c-contratista",
        motivo: "Instalación de cámara de seguridad en acceso peatonal norte",
        fecha: FECHA,
        jornadaId: "t1c-jornada-libre",
        agendadoPor: "administracion",
        estado: "agendado",
      },
    })

    const res = await llamarPut(
      rutas.ingresoId.PUT,
      "/api/pe/ingresos-contratistas/t1c",
      { estado: "ingresado", horaIngreso: "09:15" },
      id
    )
    expect(res.status).toBe(200)

    const eventos = await eventosDe("PE_CONTRATISTA_INGRESADO")
    expect(eventos).toHaveLength(1)
    expect(eventos[0]?.referenciaId).toBe(id)
    expect(eventos[0]?.descripcion).toBe(
      "Contratista Fuxia Servicios ingresó (Instalación de cámara de seguridad en acceso peatonal norte)."
    )
  })
})

// --- Contrato de la factory: ruta SIN hook -----------------------------------

describe("factory sin despuesDeEscribir (POST /api/pe/ingresos-contratistas)", () => {
  it("responde igual que siempre y escribe 0 eventos", async () => {
    const id = nuevoId("t1c-ing")
    const res = await llamarPost(rutas.ingresos.POST, "/api/pe/ingresos-contratistas", {
      id,
      contratistaId: "t1c-contratista",
      motivo: "Revisión semestral de portones automáticos del recinto",
      fecha: FECHA,
      jornadaId: "t1c-jornada-libre",
      agendadoPor: "residente",
      estado: "agendado",
    })
    expect(res.status).toBe(201)
    const body = (await res.json()) as { id?: string; estado?: string }
    expect(body.id).toBe(id)
    expect(body.estado).toBe("agendado")

    const fila = await prisma.ingresoContratistaPE.findUnique({ where: { id } })
    expect(fila?.estado).toBe("agendado")

    // Ni PE_VISITA_INGRESADA ni ningún otro evento PE para esta escritura.
    expect(await eventosDe("PE_CONTRATISTA_INGRESADO")).toHaveLength(0)
    expect(
      await prisma.eventoAuditoria.count({ where: { comunidadId: COMUNIDAD } })
    ).toBe(0)
  })
})
