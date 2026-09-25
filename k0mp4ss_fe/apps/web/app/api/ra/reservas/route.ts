/**
 * /api/ra/reservas — reservas de amenities RA (BD-FUENTE-VERDAD Fase 4).
 *
 * GET paginado vía factory. POST con prevención de race condition: la reserva
 * se crea dentro de una transacción que verifica que no exista otra reserva
 * del mismo elemento/fecha con tramo solapado y estado distinto de
 * "cancelada". Sin índice único posible (el solapamiento es un rango), la
 * transacción serializa las escrituras concurrentes en SQLite/PostgreSQL.
 *
 * El POST conserva la semántica upsert por id de la serie: si el id ya existe
 * en la comunidad, se revalida el solapamiento excluyendo el propio registro
 * y se actualiza; si no, se crea (201).
 */
import { ReservaRASchema } from "@/lib/schemas"
import { puede } from "@/lib/authz"
import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import { createCrudHandlers, delegado } from "@/lib/api/crud-factory"
import {
  jsonError,
  withComunidadScope,
} from "@/lib/api/with-comunidad-scope"
import { errorGenerico } from "@/app/api/personas/route"

const handlers = createCrudHandlers({
  model: delegado(prisma.reservaRA),
  schema: ReservaRASchema,
  authzCheck: (rol, accion) => puede(rol, accion, "ra"),
})

export const GET = handlers.GET

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

  const parsed = ReservaRASchema.safeParse(body)
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
      const choque = vecinas.some((v) =>
        tramosSolapan(datos.horaInicio, datos.horaFin, v.horaInicio, v.horaFin)
      )
      if (choque && datos.estado !== "cancelada") {
        throw new ReservaRechazada(
          409,
          "El tramo ya está reservado para ese elemento y fecha."
        )
      }

      const { id, ...resto } = datos
      if (existente) {
        return {
          record: await tx.reservaRA.update({ where: { id }, data: resto }),
          creada: false,
        }
      }
      return {
        record: await tx.reservaRA.create({
          data: { ...resto, id, comunidadId: scope.comunidadId },
        }),
        creada: true,
      }
    })
    return Response.json(record.record, { status: record.creada ? 201 : 200 })
  } catch (e) {
    if (e instanceof ReservaRechazada) {
      return jsonError(e.status, e.message)
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
