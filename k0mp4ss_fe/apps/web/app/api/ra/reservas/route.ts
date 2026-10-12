/**
 * /api/ra/reservas — reservas de amenities RA (BD-FUENTE-VERDAD Fase 4).
 *
 * GET paginado vía factory. POST con prevención de race condition: la reserva
 * se crea dentro de una transacción que verifica que no existan otras reservas
 * vivas del mismo elemento/fecha con tramo solapado hasta agotar la capacidad
 * (`stock`, espejo de `saveReservaRA`). Sin índice único posible (el
 * solapamiento es un rango), la transacción serializa las escrituras
 * concurrentes en SQLite/PostgreSQL.
 *
 * Reglas de paridad con el store legacy en el alta:
 * - folio `RA-####` correlativo por comunidad cuando el cliente no lo provee;
 * - snapshot de `montoTarifa` / `montoGarantia` desde el elemento;
 * - materialización transaccional del cargo al Fondo de Amenities
 *   (`concepto: "reserva_ra"`, `origenRef` = id de la reserva) cuando la
 *   tarifa es mayor a cero y existe fondo activo + unidad de cobro;
 * - UN evento de auditoría `RA_BOOKING_CREATED` solo en el alta.
 *
 * El POST conserva la semántica upsert por id de la serie: si el id ya existe
 * en la comunidad, se revalida el solapamiento excluyendo el propio registro
 * y se actualiza (sin volver a materializar el cobro); si no, se crea (201).
 */
import { z } from "zod"
import { ReservaRASchema } from "@/lib/schemas"
import { puede } from "@/lib/authz"
import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import { hoyISO } from "@/lib/date-utils"
import { createCrudHandlers, delegado } from "@/lib/api/crud-factory"
import {
  jsonError,
  withComunidadScope,
} from "@/lib/api/with-comunidad-scope"
import { errorGenerico } from "@/app/api/personas/route"
import {
  construirCobro,
  fondoAmenities,
  materializarCobro,
  nombreSolicitante,
  RechazoRA,
  registrarEventoRA,
  siguienteFolioRA,
  unidadDeCobro,
} from "../_acciones"

const handlers = createCrudHandlers({
  model: delegado(prisma.reservaRA),
  schema: ReservaRASchema,
  authzCheck: (rol, accion) => puede(rol, accion, "ra"),
})

export const GET = handlers.GET

/**
 * Entrada del POST: el folio y los montos son derivados del servidor en el
 * alta (el cliente puede omitirlos); `cargoFIReferencia` NO se acepta porque es
 * un campo materializado por el servidor.
 */
const ReservaEntradaSchema = ReservaRASchema.extend({
  folio: z.string().optional(),
  montoTarifa: z.number().min(0, "La tarifa no puede ser negativa.").optional(),
  montoGarantia: z.number().min(0, "La garantía no puede ser negativa.").optional(),
}).omit({ cargoFIReferencia: true })

/** Tramos [inicio, fin) en "HH:MM": comparan lexicográficamente. */
function tramosSolapan(aIni: string, aFin: string, bIni: string, bFin: string): boolean {
  return aIni < bFin && bIni < aFin
}

class ReservaRechazada extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message)
  }
}

export async function POST(req: Request): Promise<Response> {
  const resultado = await withComunidadScope()
  if (!resultado.ok) return resultado.response
  const scope = resultado.scope

  const body: unknown = await req.json().catch(() => null)
  if (body === null) return jsonError(400, "Cuerpo JSON inválido.")

  const parsed = ReservaEntradaSchema.safeParse(body)
  if (!parsed.success) {
    return jsonError(400, "Datos inválidos.", {
      detalles: parsed.error.flatten(),
    })
  }
  const datos = parsed.data

  try {
    const record = await prisma.$transaction(async (tx) => {
      const existente = await tx.reservaRA.findUnique({
        where: { id: datos.id },
      })
      if (existente && existente.comunidadId !== scope.comunidadId) {
        throw new ReservaRechazada(404, "Registro no encontrado.")
      }
      if (!puede(scope.rol, existente ? "editar" : "crear", "ra")) {
        throw new ReservaRechazada(403, "Permiso denegado.")
      }

      const elemento = await tx.elementoRA.findUnique({
        where: { id: datos.elementoId },
      })
      if (!elemento || elemento.comunidadId !== scope.comunidadId) {
        throw new ReservaRechazada(404, "Elemento no encontrado.")
      }
      if (!elemento.activo) {
        throw new ReservaRechazada(409, "El elemento no está activo para reservas.")
      }
      if (datos.horaInicio >= datos.horaFin) {
        throw new ReservaRechazada(
          400,
          "El tramo horario es inválido (inicio debe ser anterior al fin)."
        )
      }

      const vecinas = await tx.reservaRA.findMany({
        where: {
          comunidadId: scope.comunidadId,
          elementoId: datos.elementoId,
          fecha: datos.fecha,
          estado: { not: "cancelada" },
          ...(existente ? { id: { not: existente.id } } : {}),
        },
        select: { horaInicio: true, horaFin: true },
      })
      const solapadas = vecinas.filter((v) =>
        tramosSolapan(datos.horaInicio, datos.horaFin, v.horaInicio, v.horaFin)
      )
      // Capacidad por stock (espejo del store): día completo con stock 2 admite
      // dos reservas paralelas; la tercera agota el cupo.
      const capacidad = Math.max(1, elemento.stock ?? 1)
      if (datos.estado !== "cancelada" && solapadas.length >= capacidad) {
        const tramo = solapadas[0]
        throw new ReservaRechazada(
          409,
          `Conflicto horario: ${elemento.nombre} ya tiene ${solapadas.length} reserva(s) confirmada(s) que se solapan el ${datos.fecha} (${tramo?.horaInicio}–${tramo?.horaFin}).`
        )
      }

      if (existente) {
        // Upsert por id: se actualizan los campos de negocio del cliente, pero
        // NUNCA `folio` (correlativo del servidor) ni `cargoFIReferencia`
        // (materializado por el servidor, con procedencia `origenRef`).
        return {
          record: await tx.reservaRA.update({
            where: { id: datos.id },
            data: {
              elementoId: datos.elementoId,
              solicitantePersonaId: datos.solicitantePersonaId,
              ...(datos.unidadId ? { unidadId: datos.unidadId } : {}),
              fecha: datos.fecha,
              horaInicio: datos.horaInicio,
              horaFin: datos.horaFin,
              estado: datos.estado,
              ...(datos.montoTarifa !== undefined ? { montoTarifa: datos.montoTarifa } : {}),
              ...(datos.montoGarantia !== undefined ? { montoGarantia: datos.montoGarantia } : {}),
            },
          }),
          creada: false,
        }
      }

      const folio = (datos.folio ?? "").trim() || (await siguienteFolioRA(scope.comunidadId, tx))
      const montoTarifa = datos.montoTarifa ?? elemento.tarifaUso
      const montoGarantia = datos.montoGarantia ?? elemento.garantiaRequerida
      const hoyStr = hoyISO()

      // Cobro al Fondo de Amenities (espejo del store): solo con tarifa > 0,
      // fondo activo y unidad de cobro resolubles.
      let cargoFIReferencia: string | undefined
      if (datos.estado !== "cancelada" && elemento.tarifaUso > 0) {
        const fondo = await fondoAmenities(scope.comunidadId, tx)
        const unidadCobro = await unidadDeCobro(
          { unidadId: datos.unidadId ?? null, solicitantePersonaId: datos.solicitantePersonaId },
          scope.comunidadId,
          tx
        )
        if (fondo && unidadCobro) {
          const candidato = construirCobro({
            unidadId: unidadCobro,
            concepto: "reserva_ra",
            origenRef: datos.id,
            fondoId: fondo.id,
            descripcion: `Tarifa reserva ${elemento.nombre} (${datos.fecha})`,
            montoBase: elemento.tarifaUso,
            fechaCargo: hoyStr,
            fechaVencimiento: datos.fecha,
          })
          const cobro = await materializarCobro(tx, scope.comunidadId, candidato)
          cargoFIReferencia = cobro.id
        }
      }

      const creada = await tx.reservaRA.create({
        data: {
          id: datos.id,
          comunidadId: scope.comunidadId,
          folio,
          elementoId: datos.elementoId,
          solicitantePersonaId: datos.solicitantePersonaId,
          ...(datos.unidadId ? { unidadId: datos.unidadId } : {}),
          fecha: datos.fecha,
          horaInicio: datos.horaInicio,
          horaFin: datos.horaFin,
          estado: datos.estado,
          montoTarifa,
          montoGarantia,
          ...(cargoFIReferencia ? { cargoFIReferencia } : {}),
        },
      })

      const nombre = await nombreSolicitante(datos.solicitantePersonaId, tx)
      const detalleCargo =
        montoTarifa > 0
          ? `; cargo FI al fondo de amenities ${cargoFIReferencia ? `materializado (${cargoFIReferencia})` : "no materializado (sin fondo de amenities activo o sin unidad de cobro)"}`
          : ""
      await registrarEventoRA(
        scope,
        "RA_BOOKING_CREATED",
        datos.id,
        `Reserva ${folio} CONFIRMADA: ${elemento.nombre} el ${datos.fecha} ${datos.horaInicio}–${datos.horaFin} a nombre de ${nombre} (tarifa $${montoTarifa.toLocaleString("es-CL")})${detalleCargo}.`,
        tx
      )

      return { record: creada, creada: true }
    })
    return Response.json(record.record, { status: record.creada ? 201 : 200 })
  } catch (e) {
    if (e instanceof ReservaRechazada) {
      return jsonError(e.status, e.message)
    }
    if (e instanceof RechazoRA) {
      return jsonError(e.status, e.message, e.extra)
    }
    if (
      typeof e === "object" &&
      e !== null &&
      "code" in e &&
      (e as { code: string }).code === "P2002"
    ) {
      return jsonError(409, "Conflicto: registro duplicado.")
    }
    logger.error({ err: e }, "[api/ra/reservas] error inesperado")
    return errorGenerico(e)
  }
}
