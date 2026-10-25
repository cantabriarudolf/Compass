/**
 * @vitest-environment node
 *
 * Baja protegida de la bitácora (F15, criterio del owner: la bitácora es un
 * registro y no se limpia).
 *
 * El store legacy ya impedía eliminar una visita ingresada, una encomienda
 * retirada y un contratista ingresado. Al migrar los paneles a la API esos
 * guards se quedaron atrás (la UI esconde el botón, pero el servidor aceptaba el
 * DELETE de cualquier fila). Estos casos fijan el contrato en el servidor: 409
 * con el mismo mensaje para el registro auditable, 200 para el que todavía no
 * ocurrió, y la fila intacta en la base cuando se rechaza.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
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
const COMUNIDAD = "pe-baja-comunidad"

const CUENTAS = {
  administrador: { id: "pe-baja-user-admin", email: "pe-baja-admin@test.cl", rol: "administrador" },
  conserjeria: { id: "pe-baja-user-conserjeria", email: "pe-baja-conserjeria@test.cl", rol: "conserjeria" },
} as const

const JORNADA = "pe-baja-jornada"
const COURIER = "pe-baja-courier"
const CONTRATISTA = "pe-baja-contratista"

/** Visitas: una ingresada (auditable) y una agendada (todavía se puede borrar). */
const VISITAS = [
  {
    id: "pe-baja-vis-ingresada",
    fecha: "2026-10-25",
    nombre: "Visita Ya Entró",
    dni: "16.444.555-0",
    jornadaId: JORNADA,
    origenAgenda: "sin_aviso",
    estado: "ingresada",
    horaIngreso: "09:15",
  },
  {
    id: "pe-baja-vis-agendada",
    fecha: "2026-10-25",
    nombre: "Visita Agendada",
    dni: "16.444.555-0",
    jornadaId: JORNADA,
    origenAgenda: "pre_agendada",
    estado: "agendada",
  },
]

const ENCOMIENDAS = [
  {
    id: "pe-baja-enc-retirada",
    courierId: COURIER,
    fechaRecepcion: "2026-10-25",
    estado: "retirada",
    retiro: { retiradoPor: "María Retiro", fechaRetiro: "2026-10-25" },
  },
  {
    id: "pe-baja-enc-recibida",
    courierId: COURIER,
    fechaRecepcion: "2026-10-25",
    estado: "recibida",
  },
]

const INGRESOS = [
  {
    id: "pe-baja-con-ingresado",
    contratistaId: CONTRATISTA,
    motivo: "Instalación de cámara en acceso norte",
    fecha: "2026-10-25",
    jornadaId: JORNADA,
    agendadoPor: "administracion",
    estado: "ingresado",
    horaIngreso: "10:30",
  },
  {
    id: "pe-baja-con-agendado",
    contratistaId: CONTRATISTA,
    motivo: "Revisión de ascensor",
    fecha: "2026-10-25",
    jornadaId: JORNADA,
    agendadoPor: "administracion",
    estado: "agendado",
  },
]

describe("DELETE de la bitácora PE — lo auditable no se borra (F15)", () => {
  let eliminarVisita: (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response>
  let eliminarEncomienda: (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response>
  let eliminarIngreso: (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response>
  const cookies: Record<keyof typeof CUENTAS, string> = { administrador: "", conserjeria: "" }

  beforeAll(async () => {
    process.env.AUTH_SECRET = AUTH_SECRET

    await prisma.comunidad.upsert({
      where: { id: COMUNIDAD },
      update: {},
      create: { id: COMUNIDAD, nombre: "Comunidad baja PE", slug: COMUNIDAD },
    })

    const { cookieSesionAuthjs } = await import("../helpers/sesion-authjs")
    for (const [clave, cuenta] of Object.entries(CUENTAS)) {
      await prisma.usuario.upsert({
        where: { email: cuenta.email },
        update: {},
        create: { id: cuenta.id, email: cuenta.email, activo: true },
      })
      await prisma.membresia.deleteMany({ where: { usuarioId: cuenta.id } })
      await prisma.membresia.create({
        data: { usuarioId: cuenta.id, comunidadId: COMUNIDAD, rol: cuenta.rol },
      })
      cookies[clave as keyof typeof CUENTAS] = await cookieSesionAuthjs({
        sub: cuenta.id,
        email: cuenta.email,
      })
    }

    await prisma.jornada.upsert({
      where: { id: JORNADA },
      update: {},
      create: { id: JORNADA, comunidadId: COMUNIDAD, nombre: "Jornada baja" },
    })
    await prisma.courier.upsert({
      where: { id: COURIER },
      update: {},
      create: { id: COURIER, comunidadId: COMUNIDAD, nombre: "Courier baja" },
    })
    await prisma.contratista.upsert({
      where: { id: CONTRATISTA },
      update: {},
      create: { id: CONTRATISTA, comunidadId: COMUNIDAD, nombre: "Contratista baja" },
    })

    await prisma.bitacoraVisitaPE.deleteMany({ where: { comunidadId: COMUNIDAD } })
    await prisma.encomiendaPE.deleteMany({ where: { comunidadId: COMUNIDAD } })
    await prisma.ingresoContratistaPE.deleteMany({ where: { comunidadId: COMUNIDAD } })
    await prisma.bitacoraVisitaPE.createMany({
      data: VISITAS.map((v) => ({ ...v, comunidadId: COMUNIDAD })),
    })
    await prisma.encomiendaPE.createMany({
      data: ENCOMIENDAS.map((e) => ({ ...e, comunidadId: COMUNIDAD })),
    })
    await prisma.ingresoContratistaPE.createMany({
      data: INGRESOS.map((i) => ({ ...i, comunidadId: COMUNIDAD })),
    })

    eliminarVisita = (await import("@/app/api/pe/bitacora-visitas/[id]/route")).DELETE
    eliminarEncomienda = (await import("@/app/api/pe/encomiendas/[id]/route")).DELETE
    eliminarIngreso = (await import("@/app/api/pe/ingresos-contratistas/[id]/route")).DELETE
  }, 30_000)

  afterAll(async () => {
    state.cookie = ""
    try {
      const ids = Object.values(CUENTAS).map((c) => c.id)
      await prisma.bitacoraVisitaPE.deleteMany({ where: { comunidadId: COMUNIDAD } })
      await prisma.encomiendaPE.deleteMany({ where: { comunidadId: COMUNIDAD } })
      await prisma.ingresoContratistaPE.deleteMany({ where: { comunidadId: COMUNIDAD } })
      await prisma.jornada.deleteMany({ where: { id: JORNADA } })
      await prisma.courier.deleteMany({ where: { id: COURIER } })
      await prisma.contratista.deleteMany({ where: { id: CONTRATISTA } })
      await prisma.membresia.deleteMany({ where: { usuarioId: { in: ids } } })
      await prisma.usuario.deleteMany({ where: { id: { in: ids } } })
      await prisma.comunidad.deleteMany({ where: { id: COMUNIDAD } })
    } catch {
      // intencional: limpieza best-effort
    }
  })

  function borrar(
    handler: (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response>,
    id: string,
    rol: keyof typeof CUENTAS | "sin-sesion" = "administrador"
  ): Promise<Response> {
    state.cookie = rol === "sin-sesion" ? "" : cookies[rol]
    return handler(new NextRequest(`http://localhost/api/pe/x/${id}`, { method: "DELETE" }), {
      params: Promise.resolve({ id }),
    })
  }

  it("una visita ya ingresada responde 409 y sigue en la base", async () => {
    const res = await borrar(eliminarVisita, "pe-baja-vis-ingresada")

    expect(res.status).toBe(409)
    await expect(res.json()).resolves.toMatchObject({
      error: "No se puede eliminar una visita ya ingresada (registro auditable).",
    })
    expect(
      await prisma.bitacoraVisitaPE.findUnique({ where: { id: "pe-baja-vis-ingresada" } })
    ).not.toBeNull()
  })

  it("una visita agendada sí se borra (todavía no ocurrió)", async () => {
    const res = await borrar(eliminarVisita, "pe-baja-vis-agendada")

    expect(res.status).toBe(200)
    expect(
      await prisma.bitacoraVisitaPE.findUnique({ where: { id: "pe-baja-vis-agendada" } })
    ).toBeNull()
  })

  it("una encomienda ya retirada responde 409 y sigue en la base", async () => {
    const res = await borrar(eliminarEncomienda, "pe-baja-enc-retirada")

    expect(res.status).toBe(409)
    await expect(res.json()).resolves.toMatchObject({
      error: "No se puede eliminar una encomienda retirada (registro auditable).",
    })
    expect(
      await prisma.encomiendaPE.findUnique({ where: { id: "pe-baja-enc-retirada" } })
    ).not.toBeNull()
  })

  it("una encomienda recibida sí se borra (sin retiro registrado)", async () => {
    const res = await borrar(eliminarEncomienda, "pe-baja-enc-recibida")

    expect(res.status).toBe(200)
    expect(
      await prisma.encomiendaPE.findUnique({ where: { id: "pe-baja-enc-recibida" } })
    ).toBeNull()
  })

  it("un contratista ya ingresado responde 409 y sigue en la base", async () => {
    const res = await borrar(eliminarIngreso, "pe-baja-con-ingresado")

    expect(res.status).toBe(409)
    await expect(res.json()).resolves.toMatchObject({
      error: "No se puede eliminar un contratista ya ingresado (registro auditable).",
    })
    expect(
      await prisma.ingresoContratistaPE.findUnique({ where: { id: "pe-baja-con-ingresado" } })
    ).not.toBeNull()
  })

  it("conserjería tampoco puede borrar un ingreso ya sellado", async () => {
    const res = await borrar(eliminarIngreso, "pe-baja-con-ingresado", "conserjeria")

    // conserjería no tiene `eliminar` sobre `pe`: 403 antes de mirar el estado.
    expect([403, 409]).toContain(res.status)
    expect(
      await prisma.ingresoContratistaPE.findUnique({ where: { id: "pe-baja-con-ingresado" } })
    ).not.toBeNull()
  })
})
