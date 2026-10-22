/**
 * /api/liquidaciones/adelantos — adelantos PL con DOS naturalezas (SERIE-FASE2 §V4).
 *
 * Doctrina de la Dirección del Trabajo ya verificada (DT ORD 2676/140), no
 * reinterpretar:
 * - `anticipo_regular`: pago anticipado de lo devengado. Se descuenta 100% en la
 *   liquidación siguiente y NO es descuento del art. 58 (sin tope 15%).
 * - `prestamo`: exige acuerdo escrito adjunto (400 si falta) y topa 15% mensual
 *   de la remuneración bruta, con tope conjunto 45% (art. 58 inc. 3 y 4).
 * - Si el líquido no alcanza, el saldo ARRASTRA al período siguiente con alerta
 *   (el cálculo vive en `./_calculo.ts`, puro y testeado).
 *
 * Authz (decisión del plan): administrador crea y gestiona; comité solo `ver`
 * (recurso `pl:adelantos`); no hay auto-servicio del trabajador. El listado es
 * de solo lectura para el comité: no filtra por persona, igual que el resto de
 * la API de administración.
 */
import { randomUUID } from "node:crypto"
import { z } from "zod"
import {
  AdelantoPLSchema,
  FechaISOSchema,
  IdEntidadSchema,
  PactoAdelantoPLSchema,
  type DeduccionAdelantoPL,
  type ExtensionLaboral,
} from "@/lib/schemas"
import { puede } from "@/lib/authz"
import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import { generarId } from "@/lib/id-utils"
import { createCrudHandlers, delegado } from "@/lib/api/crud-factory"
import {
  jsonError,
  withComunidadScope,
  type ComunidadScope,
} from "@/lib/api/with-comunidad-scope"
import {
  adelantoImputableAlPeriodo,
  pactoDeAdelanto,
  saldoVivoAdelanto,
  topePrestamoDelPeriodo,
  validarTopeAdelanto,
} from "./_calculo"

/** Recurso RBAC de los adelantos: admin gestiona, comité lee. */
export const RECURSO_ADELANTOS_PL = "pl:adelantos"

/** Listado paginado (admin y comité) reutilizando el contrato REST estándar. */
const handlers = createCrudHandlers({
  model: delegado(prisma.adelantoPL),
  schema: AdelantoPLSchema,
  authzCheck: (rol, accion) => puede(rol, accion, RECURSO_ADELANTOS_PL),
})

export const GET = handlers.GET

/** Entrada del alta: el folio, el saldo y el estado los decide el servidor. */
export const CrearAdelantoPLSchema = z.object({
  id: IdEntidadSchema.optional(),
  trabajadorPersonaId: IdEntidadSchema,
  monto: z
    .number({ required_error: "El monto es obligatorio." })
    .positive("El monto del adelanto debe ser mayor a cero."),
  glosa: z
    .string({ required_error: "La glosa explicativa es obligatoria." })
    .min(5, "Debe describir el motivo del adelanto (mínimo 5 caracteres)."),
  pacto: PactoAdelantoPLSchema.default("anticipo_regular"),
  fecha: FechaISOSchema.optional(),
  periodoImputacion: z
    .string()
    .regex(/^\d{4}-\d{2}$/, "El período de imputación debe ser AAAA-MM.")
    .optional(),
  acuerdoEscritoRef: z
    .string()
    .trim()
    .min(3, "La referencia del acuerdo escrito es demasiado corta.")
    .optional(),
})

function hoyISO(): string {
  return new Date().toISOString().slice(0, 10)
}

/** Mes siguiente al de la fecha de entrega (`2026-05-20` → `2026-06`). */
export function periodoSiguiente(fechaISO: string): string {
  const anio = Number.parseInt(fechaISO.slice(0, 4), 10)
  const mes = Number.parseInt(fechaISO.slice(5, 7), 10)
  if (!Number.isFinite(anio) || !Number.isFinite(mes)) return ""
  const total = anio * 12 + (mes - 1) + 1
  const nuevoAnio = Math.floor(total / 12)
  const nuevoMes = (total % 12) + 1
  return `${nuevoAnio}-${String(nuevoMes).padStart(2, "0")}`
}

async function siguienteFolioADE(comunidadId: string): Promise<string> {
  const filas = await prisma.adelantoPL.findMany({
    where: { comunidadId },
    select: { folio: true },
  })
  const numeros = filas
    .map((f) => Number.parseInt((f.folio ?? "").replace(/^ADE-/, ""), 10))
    .filter((n) => Number.isFinite(n))
  const siguiente = (numeros.length > 0 ? Math.max(...numeros) : 0) + 1
  return `ADE-${String(siguiente).padStart(4, "0")}`
}

/**
 * Remuneración bruta del período de imputación y deducciones ya registradas.
 *
 * Decisión propia (declarada): si el período ya tiene liquidación, la bruta es
 * su `totalHaberes` y las deducciones registradas son sus descuentos legales +
 * anticipos; si todavía no hay liquidación, la bruta se estima con el sueldo
 * base contractual de la ficha PE y no hay deducciones registradas. El tope
 * DEFINITIVO se recalcula al generar la liquidación, cuando los montos son exactos.
 */
async function remuneracionDelPeriodo(
  scope: ComunidadScope,
  trabajadorPersonaId: string,
  periodo: string,
  sueldoBaseFicha: number
): Promise<{ bruta: number; deduccionesRegistradas: number; fuente: string }> {
  const liquidacion = await prisma.liquidacionPL.findFirst({
    where: {
      comunidadId: scope.comunidadId,
      trabajadorPersonaId,
      periodo,
    },
    orderBy: { createdAt: "desc" },
  })
  if (liquidacion) {
    return {
      bruta: liquidacion.totalHaberes,
      deduccionesRegistradas:
        liquidacion.totalDescuentos + liquidacion.descuentoAnticipos,
      fuente: `liquidación ${liquidacion.folio}`,
    }
  }
  return {
    bruta: sueldoBaseFicha,
    deduccionesRegistradas: 0,
    fuente: "sueldo base de la ficha PE (sin liquidación del período)",
  }
}

/** POST alta de adelanto (solo administración). */
export async function POST(req: Request): Promise<Response> {
  const resultado = await withComunidadScope()
  if (!resultado.ok) return resultado.response
  const scope = resultado.scope
  if (!puede(scope.rol, "crear", RECURSO_ADELANTOS_PL)) {
    return jsonError(403, "Permiso denegado.")
  }

  const body: unknown = await req.json().catch(() => null)
  if (body === null) return jsonError(400, "Cuerpo JSON inválido.")
  const parsed = CrearAdelantoPLSchema.safeParse(body)
  if (!parsed.success) {
    return jsonError(400, "Datos inválidos.", {
      detalles: parsed.error.flatten(),
    })
  }
  const input = parsed.data
  const pacto = pactoDeAdelanto(input.pacto)
  const fecha = input.fecha ?? hoyISO()
  const periodoImputacion = input.periodoImputacion ?? periodoSiguiente(fecha)

  try {
    const trabajador = await prisma.persona.findFirst({
      where: {
        comunidadId: scope.comunidadId,
        id: input.trabajadorPersonaId,
      },
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

    // El préstamo exige acuerdo escrito adjunto (anticipo NO lo requiere).
    if (pacto === "prestamo" && !input.acuerdoEscritoRef) {
      return jsonError(
        400,
        "El préstamo exige acuerdo escrito adjunto: registra la referencia del documento firmado (acuerdoEscritoRef)."
      )
    }

    const { bruta, deduccionesRegistradas, fuente } =
      await remuneracionDelPeriodo(
        scope,
        input.trabajadorPersonaId,
        periodoImputacion,
        dl.sueldoBase ?? 0
      )

    // Cuotas de los otros préstamos vigentes que caen en el mismo período.
    const otrosPrestamos = await prisma.adelantoPL.findMany({
      where: {
        comunidadId: scope.comunidadId,
        trabajadorPersonaId: input.trabajadorPersonaId,
        estado: { in: ["pendiente", "descontado_parcial"] },
      },
      select: {
        id: true,
        monto: true,
        saldo: true,
        estado: true,
        pacto: true,
        periodoImputacion: true,
      },
    })
    const topePrestamo = topePrestamoDelPeriodo(bruta)
    const cuotasPrestamoDelPeriodo = otrosPrestamos
      .filter(
        (a) =>
          pactoDeAdelanto(a.pacto) === "prestamo" &&
          adelantoImputableAlPeriodo(a, periodoImputacion)
      )
      .reduce(
        (acc, a) => acc + Math.min(saldoVivoAdelanto(a), topePrestamo),
        0
      )

    const validacion = validarTopeAdelanto({
      pacto,
      monto: input.monto,
      remuneracionBruta: bruta,
      deduccionesRegistradas,
      cuotasPrestamoDelPeriodo,
    })
    if (!validacion.ok) return jsonError(validacion.status, validacion.error)

    const id = input.id ?? `pl-ade-${randomUUID().slice(0, 8)}`
    const existente = await prisma.adelantoPL.findUnique({ where: { id } })
    if (existente) {
      if (existente.comunidadId !== scope.comunidadId) {
        return jsonError(404, "Registro no encontrado.")
      }
      return jsonError(409, "Conflicto: registro duplicado.")
    }
    const folio = await siguienteFolioADE(scope.comunidadId)
    const monto = Math.round(input.monto)

    // SAFETY: el objeto se valida con AdelantoPLSchema antes de persistir; el
    // cast `as never` solo adapta Json/tipos Prisma sin cambiar valores.
    const candidato = {
      id,
      folio,
      trabajadorPersonaId: input.trabajadorPersonaId,
      fecha,
      monto,
      glosa: input.glosa,
      estado: "pendiente" as const,
      pacto,
      // El saldo vivo nace por el monto completo: es lo que se va a descontar.
      saldo: monto,
      periodoImputacion,
      acuerdoEscritoRef: input.acuerdoEscritoRef,
      creadoPor: scope.usuarioId,
      comprobante: folio,
      deducciones: [] as DeduccionAdelantoPL[],
    }
    const validacionRegistro = AdelantoPLSchema.safeParse(candidato)
    if (!validacionRegistro.success) {
      return jsonError(400, "Datos inválidos.", {
        detalles: validacionRegistro.error.flatten(),
      })
    }

    const record = await prisma.$transaction(async (tx) => {
      const creado = await tx.adelantoPL.create({
        data: { ...candidato, comunidadId: scope.comunidadId } as never,
      })
      await tx.eventoAuditoria.create({
        data: {
          id: generarId("ev"),
          comunidadId: scope.comunidadId,
          timestamp: new Date().toISOString(),
          usuario: scope.usuarioId,
          categoria: "PL",
          tipoAccion: "PL_ADD_ADVANCE",
          referenciaId: id,
          descripcion: `Adelanto ${folio} (${pacto}) de $${monto.toLocaleString("es-CL")} entregado a ${trabajador.nombres} ${trabajador.apellidos}: ${input.glosa}. Imputación ${periodoImputacion}; bruta de referencia $${Math.round(bruta).toLocaleString("es-CL")} (${fuente}).${input.acuerdoEscritoRef ? ` Acuerdo escrito: ${input.acuerdoEscritoRef}.` : ""}`,
        },
      })
      await tx.notificacion.create({
        data: {
          id: generarId("not"),
          comunidadId: scope.comunidadId,
          destinatarioRol: "personal",
          destinatarioPersonaId: trabajador.id,
          asunto: `Comprobante de adelanto ${folio}`,
          cuerpo: `Se registró ${pacto === "prestamo" ? "un préstamo" : "un anticipo"} de $${monto.toLocaleString("es-CL")} (${input.glosa}). Será descontado en la liquidación de ${periodoImputacion}.`,
          canal: "email_simulado",
          moduloOrigen: "PL",
          fecha,
          leida: false,
        },
      })
      return creado
    })

    return Response.json(record, { status: 201 })
  } catch (e) {
    logger.error({ err: e }, "[api/liquidaciones/adelantos] error inesperado")
    return jsonError(500, "Error interno del servidor.")
  }
}
