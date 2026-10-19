/**
 * /api/liquidaciones — colección de liquidaciones PL (SERIE-GATED-API-BD P3).
 *
 * GET paginado vía factory (solo administración: sueldos sensibles).
 * POST custom "generar": valida trabajador con ficha y sueldo base (404 si no
 * existe / cross-comunidad, 400 sin ficha o sin sueldo), FKs legales MA (400),
 * parámetros CF (400 "CF no cargado"), duplicado trabajador+periodo (409);
 * calcula server-side vía `pl-utils` (puro), folio LIQ- correlativo, vínculo a
 * la proyección PE del periodo si existe y evento `PL_GENERATE_PAYSLIP`.
 * El cliente nunca envía totales: el servidor recalcula y manda.
 * Authz: `puede(rol, accion, "pl")` (solo administración; la page ya es
 * `roles: ["administrador"]` en el sidebar).
 */
import { randomUUID } from "node:crypto"
import { z } from "zod"
import {
  IdEntidadSchema,
  LiquidacionPLSchema,
  type ExtensionLaboral,
} from "@/lib/schemas"
import { puede } from "@/lib/authz"
import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import { calcularLiquidacion } from "@/lib/pl-utils"
import { createCrudHandlers, type CrudDelegate } from "@/lib/api/crud-factory"
import {
  jsonError,
  withComunidadScope,
} from "@/lib/api/with-comunidad-scope"

function delegado(modelo: unknown): CrudDelegate {
  return modelo as CrudDelegate
}

/** Guard de borrado: solo borrador sin egreso sincronizado (paridad store). */
async function guardBorrador(record: unknown): Promise<Response | null> {
  const liq = record as {
    estado?: string
    egresoFIReferencia?: string | null
  }
  if (
    liq.estado !== "borrador" ||
    (liq.egresoFIReferencia && liq.egresoFIReferencia !== "pendiente")
  ) {
    return jsonError(
      409,
      "Solo una liquidación en borrador sin egreso sincronizado puede eliminarse."
    )
  }
  return null
}

export const liquidacionesHandlers = createCrudHandlers({
  model: delegado(prisma.liquidacionPL),
  schema: LiquidacionPLSchema,
  authzCheck: (rol, accion) => puede(rol, accion, "pl"),
  beforeDelete: guardBorrador,
})

export const GET = liquidacionesHandlers.GET

const BonoInputSchema = z.object({
  glosa: z.string().min(1, "La glosa del bono es obligatoria."),
  monto: z.number().min(0, "El monto no puede ser negativo."),
  imponible: z.boolean(),
})

/** Entrada de generación: solo parámetros de negocio, jamás totales. */
export const GenerarLiquidacionSchema = z.object({
  id: IdEntidadSchema.optional(),
  trabajadorPersonaId: IdEntidadSchema,
  periodo: z
    .string()
    .regex(/^\d{4}-\d{2}$/, "El periodo debe tener formato AAAA-MM."),
  diasTrabajados: z
    .number()
    .int()
    .min(0, "Los días trabajados no pueden ser negativos.")
    .max(31, "Los días trabajados no pueden superar 31."),
  asignacionMovilizacion: z.number().min(0).optional(),
  asignacionColacion: z.number().min(0).optional(),
  montoAPV: z.number().min(0).optional(),
  saludPorcentaje: z.number().min(0).optional(),
  saludValorUF: z.number().min(0).optional(),
  bonos: z.array(BonoInputSchema).optional(),
})

function hoyISO(): string {
  return new Date().toISOString().slice(0, 10)
}

async function siguienteFolioLIQ(comunidadId: string): Promise<string> {
  const filas = await prisma.liquidacionPL.findMany({
    where: { comunidadId },
    select: { folio: true },
  })
  const numeros = filas
    .map((f) => Number.parseInt((f.folio ?? "").replace(/^LIQ-/, ""), 10))
    .filter((n) => Number.isFinite(n))
  return `LIQ-${String((numeros.length > 0 ? Math.max(...numeros) : 0) + 1).padStart(4, "0")}`
}

/** POST generar liquidación en borrador (create-only, snapshot calculado). */
export async function POST(req: Request): Promise<Response> {
  const resultado = await withComunidadScope()
  if (!resultado.ok) return resultado.response
  const scope = resultado.scope
  if (!puede(scope.rol, "crear", "pl")) {
    return jsonError(403, "Permiso denegado.")
  }

  const body: unknown = await req.json().catch(() => null)
  if (body === null) return jsonError(400, "Cuerpo JSON inválido.")
  const parsed = GenerarLiquidacionSchema.safeParse(body)
  if (!parsed.success) {
    return jsonError(400, "Datos inválidos.", {
      detalles: parsed.error.flatten(),
    })
  }
  const input = parsed.data

  try {
    const trabajador = await prisma.persona.findFirst({
      where: { comunidadId: scope.comunidadId, id: input.trabajadorPersonaId },
    })
    if (!trabajador) {
      return jsonError(
        404,
        "El trabajador no existe en el Maestro de Personas."
      )
    }
    // SAFETY: datosLaborales es Json (ExtensionLaboral); el cast solo tipa la lectura.
    const dl = (trabajador.datosLaborales ?? null) as unknown as ExtensionLaboral | null
    if (!dl) {
      return jsonError(400, "La persona no tiene ficha laboral de PE.")
    }
    const sueldoBase = dl.sueldoBase ?? 0
    if (!(sueldoBase > 0)) {
      return jsonError(
        400,
        "La ficha del trabajador no registra sueldo base contractual (PE)."
      )
    }
    // FKs legales vigentes contra los maestros (RG escritura, paridad store).
    if (dl.afpId) {
      const afp = await prisma.afp.findFirst({
        where: { comunidadId: scope.comunidadId, id: dl.afpId },
      })
      if (!afp) {
        return jsonError(400, "afpId no existe en el maestro de AFPs.")
      }
    }
    if (dl.saludId) {
      const salud = await prisma.previsionSalud.findFirst({
        where: { comunidadId: scope.comunidadId, id: dl.saludId },
      })
      if (!salud) {
        return jsonError(
          400,
          "saludId no existe en el maestro de previsiones de salud."
        )
      }
    }
    if (dl.asignacionFamiliarId) {
      const tramo = await prisma.asignacionFamiliar.findFirst({
        where: { comunidadId: scope.comunidadId, id: dl.asignacionFamiliarId },
      })
      if (!tramo) {
        return jsonError(
          400,
          "asignacionFamiliarId no existe en el maestro de tramos legales."
        )
      }
    }
    const cfg = await prisma.configuracionGlobal.findUnique({
      where: { comunidadId: scope.comunidadId },
    })
    const diasMesComercial = cfg?.diasMesComercial ?? 30
    if (
      !cfg ||
      cfg.ufMensual === null ||
      cfg.ingresoMinimoMensual === null ||
      cfg.topeGratificacionLegal === null ||
      cfg.tasaSIS === null
    ) {
      return jsonError(
        400,
        "CF no cargado: faltan parámetros legales de remuneraciones (UF mensual, ingreso mínimo, tope gratificación o tasa SIS)."
      )
    }
    // Un solo documento por trabajador y periodo.
    const duplicado = await prisma.liquidacionPL.findFirst({
      where: {
        comunidadId: scope.comunidadId,
        trabajadorPersonaId: input.trabajadorPersonaId,
        periodo: input.periodo,
      },
      select: { id: true },
    })
    if (duplicado) {
      return jsonError(
        409,
        `Ya existe una liquidación ${input.periodo} para este trabajador.`
      )
    }

    const esHonorarios = dl.tipoContrato === "honorarios"
    const [afp, salud, tramo, anticiposPendientes] = await Promise.all([
      dl.afpId
        ? prisma.afp.findFirst({
            where: { comunidadId: scope.comunidadId, id: dl.afpId },
          })
        : Promise.resolve(null),
      dl.saludId
        ? prisma.previsionSalud.findFirst({
            where: { comunidadId: scope.comunidadId, id: dl.saludId },
          })
        : Promise.resolve(null),
      dl.asignacionFamiliarId
        ? prisma.asignacionFamiliar.findFirst({
            where: { comunidadId: scope.comunidadId, id: dl.asignacionFamiliarId },
          })
        : Promise.resolve(null),
      prisma.adelantoPL.findMany({
        where: {
          comunidadId: scope.comunidadId,
          trabajadorPersonaId: input.trabajadorPersonaId,
          estado: "pendiente",
        },
        select: { id: true, monto: true },
      }),
    ])

    const bonos = (input.bonos ?? []).map((b) => ({
      id: `bono-${randomUUID().slice(0, 8)}`,
      glosa: b.glosa,
      monto: b.monto,
      imponible: b.imponible,
    }))
    const horasExtrasHoras = (dl.horasExtras ?? [])
      .filter((h) => h.fecha.startsWith(`${input.periodo}-`))
      .reduce((acc, h) => acc + h.horas, 0)

    const calculo = calcularLiquidacion({
      sueldoBaseContrato: sueldoBase,
      diasTrabajados: input.diasTrabajados,
      diasMesComercial,
      jornadaSemanal: dl.jornadaBaseHoras ?? cfg.jornadaSemanalEstandar,
      horasExtrasHoras,
      bonos,
      asignacionMovilizacion: input.asignacionMovilizacion ?? 0,
      asignacionColacion: input.asignacionColacion ?? 0,
      montoAsignacionFamiliar: tramo
        ? tramo.monto * Math.max(0, dl.cargas ?? 0)
        : 0,
      tasaAFP: afp?.tasaCotizacion ?? 0,
      saludPlan: {
        tipo: (salud?.tipo ?? "fonasa") as "fonasa" | "isapre",
        porcentaje: input.saludPorcentaje,
        valorUF: input.saludValorUF,
        ufVigente: cfg.ufMensual,
      },
      ufVigente: cfg.ufMensual,
      ingresoMinimoMensual: cfg.ingresoMinimoMensual,
      topeGratificacionLegal: cfg.topeGratificacionLegal,
      tasaSIS: cfg.tasaSIS,
      tasaSeguroCesantia: 0.6,
      esHonorarios,
      montoAPV: input.montoAPV ?? 0,
      anticiposPendientes: anticiposPendientes.map((a) => ({
        id: a.id,
        monto: a.monto,
      })),
    })

    const folio = await siguienteFolioLIQ(scope.comunidadId)
    const proyeccion = await prisma.proyeccionPE.findFirst({
      where: { comunidadId: scope.comunidadId, mesAnio: input.periodo },
    })
    const id = input.id ?? `pl-liq-${randomUUID().slice(0, 8)}`
    const existente = await prisma.liquidacionPL.findUnique({ where: { id } })
    if (existente) {
      if (existente.comunidadId !== scope.comunidadId) {
        return jsonError(404, "Registro no encontrado.")
      }
      return jsonError(409, "Conflicto: registro duplicado.")
    }

    // SAFETY: el objeto se valida con LiquidacionPLSchema antes de persistir;
    // los casts `as never` solo adaptan Json/tipos Prisma sin cambiar valores.
    const candidato = {
      id,
      folio,
      trabajadorPersonaId: input.trabajadorPersonaId,
      periodo: input.periodo,
      fechaGeneracion: hoyISO(),
      diasTrabajados: input.diasTrabajados,
      sueldoBaseContrato: sueldoBase,
      diasMesComercial,
      jornadaSemanal: dl.jornadaBaseHoras ?? cfg.jornadaSemanalEstandar,
      sueldoBaseProporcional: calculo.sueldoBaseProporcional,
      horasExtrasHoras,
      valorHoraOrdinaria: calculo.valorHoraOrdinaria,
      montoHorasExtras: calculo.montoHorasExtras,
      bonos,
      gratificacionLegal: calculo.gratificacionLegal,
      totalImponible: calculo.totalImponible,
      asignacionMovilizacion: input.asignacionMovilizacion ?? 0,
      asignacionColacion: input.asignacionColacion ?? 0,
      asignacionFamiliarTramoId: dl.asignacionFamiliarId,
      cargas: Math.max(0, dl.cargas ?? 0),
      montoAsignacionFamiliar: tramo
        ? tramo.monto * Math.max(0, dl.cargas ?? 0)
        : 0,
      totalHaberes: calculo.totalHaberes,
      afpId: dl.afpId,
      nombreAfp: afp?.nombre ?? (esHonorarios ? "Boleta honorarios" : ""),
      tasaAFP: afp?.tasaCotizacion ?? 0,
      montoAFP: calculo.montoAFP,
      saludId: dl.saludId,
      nombreSalud: salud?.nombre ?? "",
      saludTipo: (salud?.tipo ?? "fonasa") as "fonasa" | "isapre",
      saludPorcentaje: input.saludPorcentaje,
      saludValorUF: input.saludValorUF,
      ufAplicada: cfg.ufMensual,
      montoSalud: calculo.montoSalud,
      tasaSIS: cfg.tasaSIS,
      montoSIS: calculo.montoSIS,
      montoSeguroCesantia: calculo.montoSeguroCesantia,
      montoAPV: input.montoAPV ?? 0,
      totalDescuentos: calculo.totalDescuentos,
      descuentoAnticipos: calculo.descuentoAnticipos,
      adelantosIds: calculo.adelantosIds,
      alcanceLiquido: calculo.alcanceLiquido,
      liquidoAPagar: calculo.liquidoAPagar,
      estado: "borrador",
      egresoFIReferencia: "pendiente",
      ...(proyeccion ? { proyeccionPEReferencia: proyeccion.id } : {}),
    }
    const validacion = LiquidacionPLSchema.safeParse(candidato)
    if (!validacion.success) {
      return jsonError(400, "Datos inválidos.", {
        detalles: validacion.error.flatten(),
      })
    }

    const record = await prisma.liquidacionPL.create({
      data: { ...candidato, comunidadId: scope.comunidadId } as never,
    })
    if (
      proyeccion &&
      (proyeccion.liquidacionPLReferencia === null ||
        proyeccion.liquidacionPLReferencia === "pendiente")
    ) {
      await prisma.proyeccionPE.update({
        where: { id: proyeccion.id },
        data: { liquidacionPLReferencia: id },
      })
    }
    await prisma.eventoAuditoria.create({
      data: {
        id: randomUUID(),
        comunidadId: scope.comunidadId,
        timestamp: new Date().toISOString(),
        usuario: scope.usuarioId,
        categoria: "PL",
        tipoAccion: "PL_GENERATE_PAYSLIP",
        referenciaId: id,
        descripcion: `Liquidación ${folio} generada para ${trabajador.nombres} ${trabajador.apellidos} (${input.periodo}): haberes $${calculo.totalHaberes.toLocaleString("es-CL")}, líquido a pagar $${calculo.liquidoAPagar.toLocaleString("es-CL")}.`,
      },
    })
    return Response.json(record, { status: 201 })
  } catch (e) {
    logger.error({ err: e }, "[api/liquidaciones] error inesperado")
    return jsonError(500, "Error interno del servidor.")
  }
}
