/**
 * @vitest-environment node
 *
 * Guarda de servidor del borrado (T6, S3) — los cinco endpoints que hasta ahora
 * borraban aunque un registro los referenciara **por texto**.
 *
 * `prisma/schema.prisma` no tiene una sola FK hacia estas entidades (todas las
 * referencias hijo→padre son `String`), así que el `DELETE` de Prisma nunca falla
 * por `Restrict`: dejaba huérfanos en silencio. Cada caso fija el contrato en el
 * servidor: 409 con el motivo literal y **ninguna** fila borrada cuando hay
 * dependientes, y el 200 de siempre cuando no los hay.
 *
 * El caso «sin dependientes» (y los estados que se excluyen del conteo) es el que
 * impide que la guarda se pase de celosa y niegue una baja legítima (riesgo
 * item 1). Qué dependiente cuenta y qué no, con su evidencia path:line, está
 * comentado en cada `beforeDelete` de las rutas.
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
const COMUNIDAD = "bgs-comunidad"
const USUARIO = {
  id: "bgs-admin",
  email: "bgs-admin@test.cl",
  rol: "administrador",
} as const

type Handler = (
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) => Promise<Response>

const ID = {
  // Proveedores PE: uno por cada dependiente, uno libre y el sostén de la
  // mantención descartable (que nunca se borra).
  proveedorConMantencion: "bgs-proveedor-con-mantencion",
  proveedorConVisita: "bgs-proveedor-con-visita",
  proveedorSosten: "bgs-proveedor-sosten",
  proveedorLibre: "bgs-proveedor-libre",
  mantencion: "bgs-mantencion",
  mantencionLibre: "bgs-mantencion-libre",
  visita: "bgs-visita",
  // Plantillas CO.
  plantilla: "bgs-plantilla",
  plantillaLibre: "bgs-plantilla-libre",
  envio: "bgs-envio",
  // Tipos de infracción IN.
  tipoConInfraccion: "bgs-tipo-con-infraccion",
  tipoConInfraccionDesestimada: "bgs-tipo-con-infraccion-desestimada",
  tipoConPropuesta: "bgs-tipo-con-propuesta",
  tipoSoloDesestimada: "bgs-tipo-solo-desestimada",
  tipoLibre: "bgs-tipo-libre",
  infraccion: "bgs-infraccion",
  infraccionDesestimada: "bgs-infraccion-desestimada",
  propuesta: "bgs-propuesta",
  propuestaDesestimada: "bgs-propuesta-desestimada",
  // Elementos RA.
  elemento: "bgs-elemento",
  elementoConCancelada: "bgs-elemento-con-cancelada",
  elementoLibre: "bgs-elemento-libre",
  reserva: "bgs-reserva",
  reservaCancelada: "bgs-reserva-cancelada",
} as const

let eliminarProveedor: Handler
let eliminarMantencion: Handler
let eliminarPlantilla: Handler
let eliminarTipo: Handler
let eliminarElemento: Handler

function pedir(id: string): NextRequest {
  return new NextRequest(`http://localhost/api/x/${id}`, { method: "DELETE" })
}

/** Invoca el DELETE del endpoint bajo la sesión del administrador. */
function borrar(handler: Handler, id: string): Promise<Response> {
  state.cookie = cookieAdmin
  return handler(pedir(id), { params: Promise.resolve({ id }) })
}

let cookieAdmin = ""

async function limpiar(): Promise<void> {
  await prisma.reservaRA.deleteMany({ where: { comunidadId: COMUNIDAD } })
  await prisma.elementoRA.deleteMany({ where: { comunidadId: COMUNIDAD } })
  await prisma.propuestaMultaVigencia.deleteMany({ where: { comunidadId: COMUNIDAD } })
  await prisma.infraccionIN.deleteMany({ where: { comunidadId: COMUNIDAD } })
  await prisma.tipoInfraccionIN.deleteMany({ where: { comunidadId: COMUNIDAD } })
  await prisma.envioCO.deleteMany({ where: { comunidadId: COMUNIDAD } })
  await prisma.plantillaCO.deleteMany({ where: { comunidadId: COMUNIDAD } })
  await prisma.visitaTecnicaPE.deleteMany({ where: { comunidadId: COMUNIDAD } })
  await prisma.mantencionPreventivaPE.deleteMany({ where: { comunidadId: COMUNIDAD } })
  await prisma.proveedorPE.deleteMany({ where: { comunidadId: COMUNIDAD } })
}

async function sembrar(): Promise<void> {
  await prisma.proveedorPE.createMany({
    data: [
      {
        id: ID.proveedorConMantencion,
        comunidadId: COMUNIDAD,
        rut: "11111111-1",
        nombre: "Ascensores Andes",
        rubro: "ascensores",
        activo: true,
      },
      {
        id: ID.proveedorConVisita,
        comunidadId: COMUNIDAD,
        rut: "22222222-2",
        nombre: "Clima Sur",
        rubro: "climatizacion",
        activo: true,
      },
      {
        id: ID.proveedorSosten,
        comunidadId: COMUNIDAD,
        rut: "33333333-3",
        nombre: "Jardines Verdes",
        rubro: "jardineria",
        activo: true,
      },
      {
        id: ID.proveedorLibre,
        comunidadId: COMUNIDAD,
        rut: "44444444-4",
        nombre: "Pinturas del Valle",
        rubro: "pintura",
        activo: false,
      },
    ],
  })
  await prisma.mantencionPreventivaPE.createMany({
    data: [
      {
        id: ID.mantencion,
        comunidadId: COMUNIDAD,
        proveedorId: ID.proveedorConMantencion,
        descripcion: "Mantención mensual de ascensores",
        periodicidadMeses: 1,
        proximaFecha: "2026-12-01",
        alertaDiasAntes: 7,
        activo: true,
      },
      {
        id: ID.mantencionLibre,
        comunidadId: COMUNIDAD,
        proveedorId: ID.proveedorSosten,
        descripcion: "Poda trimestral de áreas verdes",
        periodicidadMeses: 3,
        proximaFecha: "2026-12-15",
        alertaDiasAntes: 5,
        activo: false,
      },
    ],
  })
  await prisma.visitaTecnicaPE.create({
    data: {
      id: ID.visita,
      comunidadId: COMUNIDAD,
      proveedorId: ID.proveedorConVisita,
      mantencionId: ID.mantencion,
      tecnicoNombre: "Juan Técnico",
      fecha: "2026-11-20",
      trabajoRealizado: "Revisión de la caldera",
    },
  })

  await prisma.plantillaCO.createMany({
    data: [
      {
        id: ID.plantilla,
        comunidadId: COMUNIDAD,
        nombre: "Citación a asamblea",
        categoria: "comunidad",
        asunto: "Citación a asamblea extraordinaria",
        cuerpo: "Estimado [Nombre_Usuario], ...",
      },
      {
        id: ID.plantillaLibre,
        comunidadId: COMUNIDAD,
        nombre: "Aviso de corte de agua",
        categoria: "mantencion",
        asunto: "Corte programado de agua",
        cuerpo: "Estimado [Nombre_Usuario], ...",
      },
    ],
  })
  await prisma.envioCO.create({
    data: {
      id: ID.envio,
      comunidadId: COMUNIDAD,
      asunto: "Citación a asamblea extraordinaria",
      cuerpo: "Estimado vecino, ...",
      plantillaId: ID.plantilla,
      destinatarios: [{ personaId: "bgs-persona", unidadId: "bgs-unidad" }],
      fechaEnvio: "2026-11-10",
      lecturas: [],
    },
  })

  await prisma.tipoInfraccionIN.createMany({
    data: [
      {
        id: ID.tipoConInfraccion,
        comunidadId: COMUNIDAD,
        nombre: "Ruido molesto",
        categoria: "leve",
        tipoSancion: "monto_fijo",
        valor: 10_000,
      },
      {
        id: ID.tipoConInfraccionDesestimada,
        comunidadId: COMUNIDAD,
        nombre: "Uso indebido de áreas comunes",
        categoria: "leve",
        tipoSancion: "monto_fijo",
        valor: 12_000,
      },
      {
        id: ID.tipoConPropuesta,
        comunidadId: COMUNIDAD,
        nombre: "Registro de copropietarios no actualizado",
        categoria: "grave",
        tipoSancion: "monto_fijo",
        valor: 30_000,
        referenciaLegal: "Artículo 12 del reglamento",
      },
      {
        id: ID.tipoSoloDesestimada,
        comunidadId: COMUNIDAD,
        nombre: "Mascota sin registro",
        categoria: "leve",
        tipoSancion: "monto_fijo",
        valor: 8_000,
      },
      {
        id: ID.tipoLibre,
        comunidadId: COMUNIDAD,
        nombre: "Estacionamiento en zona de carga",
        categoria: "grave",
        tipoSancion: "monto_fijo",
        valor: 20_000,
      },
    ],
  })
  const infraccion = {
    comunidadId: COMUNIDAD,
    unidadId: "bgs-unidad",
    fechaSuceso: "2026-11-01",
    horaSuceso: "10:00",
    antecedentes: "Ruido molesto en el pasillo del piso 4",
    evidencias: [],
    fechaRegistro: "2026-11-01",
    comentariosDirectiva: [],
    respaldosDirectiva: [],
  }
  await prisma.infraccionIN.createMany({
    data: [
      {
        id: ID.infraccion,
        folio: "IN-0001",
        tipoInfraccionId: ID.tipoConInfraccion,
        estado: "en_revision",
        ...infraccion,
      },
      {
        id: ID.infraccionDesestimada,
        folio: "IN-0002",
        tipoInfraccionId: ID.tipoConInfraccionDesestimada,
        estado: "desestimada",
        desestimacionJustificacion: "El descargo del residente acreditó el hecho.",
        ...infraccion,
      },
    ],
  })
  await prisma.propuestaMultaVigencia.createMany({
    data: [
      {
        id: ID.propuesta,
        comunidadId: COMUNIDAD,
        unidadId: "bgs-unidad",
        monto: 30_000,
        referenciaLegal: "Artículo 12 del reglamento",
        tipoInfraccionId: ID.tipoConPropuesta,
        estado: "propuesta",
        requerimientoEn: new Date("2026-01-01T12:00:00.000Z"),
        propuestaPor: USUARIO.id,
      },
      {
        id: ID.propuestaDesestimada,
        comunidadId: COMUNIDAD,
        unidadId: "bgs-unidad",
        monto: 8_000,
        tipoInfraccionId: ID.tipoSoloDesestimada,
        estado: "desestimada",
        requerimientoEn: new Date("2026-02-01T12:00:00.000Z"),
        propuestaPor: USUARIO.id,
        motivoDesestimacion: "La unidad acreditó el registro antes de la resolución.",
      },
    ],
  })

  await prisma.elementoRA.createMany({
    data: [
      {
        id: ID.elemento,
        comunidadId: COMUNIDAD,
        nombre: "Quincho",
        tipo: "espacio_fisico",
        franja: "dia_completo",
        tarifaUso: 20_000,
        garantiaRequerida: 50_000,
        activo: true,
      },
      {
        id: ID.elementoConCancelada,
        comunidadId: COMUNIDAD,
        nombre: "Piscina",
        tipo: "espacio_fisico",
        franja: "dia_completo",
        tarifaUso: 25_000,
        garantiaRequerida: 0,
        activo: true,
      },
      {
        id: ID.elementoLibre,
        comunidadId: COMUNIDAD,
        nombre: "Sala multiuso",
        tipo: "espacio_fisico",
        franja: "dia_completo",
        tarifaUso: 15_000,
        garantiaRequerida: 0,
        activo: true,
      },
    ],
  })
  const reserva = {
    comunidadId: COMUNIDAD,
    elementoId: ID.elemento,
    solicitantePersonaId: "bgs-persona",
    unidadId: "bgs-unidad",
    fecha: "2026-12-05",
    horaInicio: "10:00",
    horaFin: "18:00",
    montoTarifa: 20_000,
    montoGarantia: 50_000,
  }
  await prisma.reservaRA.createMany({
    data: [
      {
        id: ID.reserva,
        folio: "RA-0001",
        estado: "confirmada",
        ...reserva,
      },
      {
        id: ID.reservaCancelada,
        folio: "RA-0002",
        estado: "cancelada",
        ...reserva,
        fecha: "2026-12-06",
        elementoId: ID.elementoConCancelada,
      },
    ],
  })
}

describe("DELETE con dependientes por texto — 409 literal y ninguna fila borrada (T6/S3)", () => {
  beforeAll(async () => {
    process.env.AUTH_SECRET = AUTH_SECRET

    await prisma.comunidad.upsert({
      where: { id: COMUNIDAD },
      update: {},
      create: { id: COMUNIDAD, nombre: "Comunidad guarda servidor", slug: COMUNIDAD },
    })
    await prisma.usuario.upsert({
      where: { email: USUARIO.email },
      update: {},
      create: { id: USUARIO.id, email: USUARIO.email, activo: true },
    })
    await prisma.membresia.deleteMany({ where: { usuarioId: USUARIO.id } })
    await prisma.membresia.create({
      data: { usuarioId: USUARIO.id, comunidadId: COMUNIDAD, rol: USUARIO.rol },
    })
    const { cookieSesionAuthjs } = await import("../helpers/sesion-authjs")
    cookieAdmin = await cookieSesionAuthjs({ sub: USUARIO.id, email: USUARIO.email })

    eliminarProveedor = (
      await import("@/app/api/pe/proveedores/[id]/route")
    ).DELETE as Handler
    eliminarMantencion = (
      await import("@/app/api/pe/mantenciones/[id]/route")
    ).DELETE as Handler
    eliminarPlantilla = (await import("@/app/api/co/plantillas/[id]/route"))
      .DELETE as Handler
    eliminarTipo = (await import("@/app/api/in/tipos/[id]/route")).DELETE as Handler
    eliminarElemento = (await import("@/app/api/ra/elementos/[id]/route"))
      .DELETE as Handler
  }, 30_000)

  beforeEach(async () => {
    state.cookie = ""
    await limpiar()
    await sembrar()
  })

  afterAll(async () => {
    state.cookie = ""
    try {
      await limpiar()
      await prisma.membresia.deleteMany({ where: { usuarioId: USUARIO.id } })
      await prisma.usuario.deleteMany({ where: { id: USUARIO.id } })
      await prisma.comunidad.deleteMany({ where: { id: COMUNIDAD } })
    } catch {
      // limpieza best-effort
    }
  })

  // --- Proveedores PE: mantención + visita técnica -------------------------

  it("proveedor con una mantención preventiva → 409 y no borra nada", async () => {
    const res = await borrar(eliminarProveedor, ID.proveedorConMantencion)

    expect(res.status).toBe(409)
    await expect(res.json()).resolves.toEqual({
      error:
        "No se puede eliminar el proveedor: tiene 1 mantención(es) preventiva(s) asociada(s).",
    })
    expect(
      await prisma.proveedorPE.findUnique({ where: { id: ID.proveedorConMantencion } })
    ).not.toBeNull()
    expect(
      await prisma.mantencionPreventivaPE.findUnique({ where: { id: ID.mantencion } })
    ).not.toBeNull()
  })

  it("proveedor con una sola mantención INACTIVA → 409 (la inactiva se sigue listando con su proveedor)", async () => {
    const res = await borrar(eliminarProveedor, ID.proveedorSosten)

    expect(res.status).toBe(409)
    await expect(res.json()).resolves.toEqual({
      error:
        "No se puede eliminar el proveedor: tiene 1 mantención(es) preventiva(s) asociada(s).",
    })
    expect(
      await prisma.proveedorPE.findUnique({ where: { id: ID.proveedorSosten } })
    ).not.toBeNull()
    expect(
      await prisma.mantencionPreventivaPE.findUnique({ where: { id: ID.mantencionLibre } })
    ).not.toBeNull()
  })

  it("proveedor con una visita técnica → 409 y no borra nada", async () => {
    const res = await borrar(eliminarProveedor, ID.proveedorConVisita)

    expect(res.status).toBe(409)
    await expect(res.json()).resolves.toEqual({
      error:
        "No se puede eliminar el proveedor: tiene 1 visita(s) técnica(s) asociada(s).",
    })
    expect(
      await prisma.proveedorPE.findUnique({ where: { id: ID.proveedorConVisita } })
    ).not.toBeNull()
    expect(
      await prisma.visitaTecnicaPE.findUnique({ where: { id: ID.visita } })
    ).not.toBeNull()
  })

  it("proveedor sin dependientes → 200 y la fila desaparece (baja legítima)", async () => {
    const res = await borrar(eliminarProveedor, ID.proveedorLibre)

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ ok: true })
    expect(
      await prisma.proveedorPE.findUnique({ where: { id: ID.proveedorLibre } })
    ).toBeNull()
  })

  // --- Mantenciones PE: visita técnica -------------------------------------

  it("mantención con una visita técnica → 409 y no borra nada", async () => {
    const res = await borrar(eliminarMantencion, ID.mantencion)

    expect(res.status).toBe(409)
    await expect(res.json()).resolves.toEqual({
      error:
        "No se puede eliminar la mantención: tiene 1 visita(s) técnica(s) asociada(s).",
    })
    expect(
      await prisma.mantencionPreventivaPE.findUnique({ where: { id: ID.mantencion } })
    ).not.toBeNull()
    expect(
      await prisma.visitaTecnicaPE.findUnique({ where: { id: ID.visita } })
    ).not.toBeNull()
  })

  it("mantención sin dependientes → 200 y la fila desaparece (baja legítima)", async () => {
    const res = await borrar(eliminarMantencion, ID.mantencionLibre)

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ ok: true })
    expect(
      await prisma.mantencionPreventivaPE.findUnique({ where: { id: ID.mantencionLibre } })
    ).toBeNull()
  })

  // --- Plantillas CO: envíos ------------------------------------------------

  it("plantilla usada por un envío → 409 y no borra nada", async () => {
    const res = await borrar(eliminarPlantilla, ID.plantilla)

    expect(res.status).toBe(409)
    await expect(res.json()).resolves.toEqual({
      error: "No se puede eliminar la plantilla: tiene 1 envío(s) asociado(s).",
    })
    expect(
      await prisma.plantillaCO.findUnique({ where: { id: ID.plantilla } })
    ).not.toBeNull()
    expect(await prisma.envioCO.findUnique({ where: { id: ID.envio } })).not.toBeNull()
  })

  it("plantilla sin envíos → 200 y la fila desaparece (baja legítima)", async () => {
    const res = await borrar(eliminarPlantilla, ID.plantillaLibre)

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ ok: true })
    expect(
      await prisma.plantillaCO.findUnique({ where: { id: ID.plantillaLibre } })
    ).toBeNull()
  })

  // --- Tipos de infracción IN: infracciones + propuestas de multa ----------

  it("tipo con una infracción → 409 y no borra nada", async () => {
    const res = await borrar(eliminarTipo, ID.tipoConInfraccion)

    expect(res.status).toBe(409)
    await expect(res.json()).resolves.toEqual({
      error:
        "No se puede eliminar el tipo de infracción: tiene 1 infracción(es) asociada(s).",
    })
    expect(
      await prisma.tipoInfraccionIN.findUnique({ where: { id: ID.tipoConInfraccion } })
    ).not.toBeNull()
    expect(
      await prisma.infraccionIN.findUnique({ where: { id: ID.infraccion } })
    ).not.toBeNull()
  })

  it("tipo con una infracción desestimada → 409 (la fila desestimada se sigue mostrando con su tipo)", async () => {
    const res = await borrar(eliminarTipo, ID.tipoConInfraccionDesestimada)

    expect(res.status).toBe(409)
    await expect(res.json()).resolves.toEqual({
      error:
        "No se puede eliminar el tipo de infracción: tiene 1 infracción(es) asociada(s).",
    })
    expect(
      await prisma.tipoInfraccionIN.findUnique({
        where: { id: ID.tipoConInfraccionDesestimada },
      })
    ).not.toBeNull()
    expect(
      await prisma.infraccionIN.findUnique({ where: { id: ID.infraccionDesestimada } })
    ).not.toBeNull()
  })

  it("tipo con una propuesta de multa pendiente → 409 y no borra nada", async () => {
    const res = await borrar(eliminarTipo, ID.tipoConPropuesta)

    expect(res.status).toBe(409)
    await expect(res.json()).resolves.toEqual({
      error:
        "No se puede eliminar el tipo de infracción: tiene 1 propuesta(s) de multa asociada(s).",
    })
    expect(
      await prisma.tipoInfraccionIN.findUnique({ where: { id: ID.tipoConPropuesta } })
    ).not.toBeNull()
    expect(
      await prisma.propuestaMultaVigencia.findUnique({ where: { id: ID.propuesta } })
    ).not.toBeNull()
  })

  it("tipo referenciado sólo por una propuesta desestimada → 200 y la fila desaparece", async () => {
    const res = await borrar(eliminarTipo, ID.tipoSoloDesestimada)

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ ok: true })
    expect(
      await prisma.tipoInfraccionIN.findUnique({ where: { id: ID.tipoSoloDesestimada } })
    ).toBeNull()
    // La propuesta desestimada sigue en la base: la baja del maestro no se lleva
    // el registro de la decisión, sólo deja de nombrarlo.
    expect(
      await prisma.propuestaMultaVigencia.findUnique({
        where: { id: ID.propuestaDesestimada },
      })
    ).not.toBeNull()
  })

  it("tipo sin dependientes → 200 y la fila desaparece (baja legítima)", async () => {
    const res = await borrar(eliminarTipo, ID.tipoLibre)

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ ok: true })
    expect(
      await prisma.tipoInfraccionIN.findUnique({ where: { id: ID.tipoLibre } })
    ).toBeNull()
  })

  // --- Elementos RA: reservas ----------------------------------------------

  it("elemento con una reserva confirmada → 409 y no borra nada", async () => {
    const res = await borrar(eliminarElemento, ID.elemento)

    expect(res.status).toBe(409)
    await expect(res.json()).resolves.toEqual({
      error: "No se puede eliminar el elemento: tiene 1 reserva(s) asociada(s).",
    })
    expect(
      await prisma.elementoRA.findUnique({ where: { id: ID.elemento } })
    ).not.toBeNull()
    expect(await prisma.reservaRA.findUnique({ where: { id: ID.reserva } })).not.toBeNull()
  })

  it("elemento con una reserva cancelada → 409 (la reserva cancelada se sigue mostrando con su elemento)", async () => {
    const res = await borrar(eliminarElemento, ID.elementoConCancelada)

    expect(res.status).toBe(409)
    await expect(res.json()).resolves.toEqual({
      error: "No se puede eliminar el elemento: tiene 1 reserva(s) asociada(s).",
    })
    expect(
      await prisma.elementoRA.findUnique({ where: { id: ID.elementoConCancelada } })
    ).not.toBeNull()
    expect(
      await prisma.reservaRA.findUnique({ where: { id: ID.reservaCancelada } })
    ).not.toBeNull()
  })

  it("elemento sin reservas → 200 y la fila desaparece (baja legítima)", async () => {
    const res = await borrar(eliminarElemento, ID.elementoLibre)

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ ok: true })
    expect(
      await prisma.elementoRA.findUnique({ where: { id: ID.elementoLibre } })
    ).toBeNull()
  })
})
