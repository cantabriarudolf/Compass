/**
 * /api/ir/solicitudes-insumo/[id]/entregar — entrega una solicitud de insumo y
 * descuenta el stock en la MISMA transacción.
 *
 * POST custom (edición sobre "ir:mantenimiento"): paridad server-side con
 * `entregarSolicitudInsumoIR` legacy, con la decisión owner 2026-10-21 — "se
 * están pasando insumos básicos, no es controlar el stock de uranio": marcar la
 * entrega es el único acto, sin segunda aprobación.
 *
 * Garantías:
 * - Atómico: estado `entregada` + `entregaFecha` + `stock -= cantidad` en una
 *   sola `$transaction`; si el stock no alcanza se lanza `RechazoIR` y Prisma
 *   revierte TODO (la solicitud NO queda entregada sin descontar).
 * - Idempotente: el update condicional (`estado: "pendiente"`) es el candado.
 *   Entregar dos veces no descuenta dos veces: la segunda responde
 *   `200 { ok: true, yaEntregada: true }` sin tocar el stock ni repetir eventos.
 * - Stock: el guard `stock >= cantidad` vive en el `updateMany` (comparación y
 *   decremento en la misma sentencia), así dos entregas concurrentes nunca
 *   pueden dejar el stock negativo.
 * - Scoping: la solicitud y el recurso se validan contra la comunidad de la
 *   sesión; una solicitud de otra comunidad es 404 (sin filtrar existencia).
 */
import { hoyISO } from "@/lib/date-utils"
import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import { jsonError } from "@/lib/api/with-comunidad-scope"
import {
  cargarRecursoIR,
  cargarSolicitudInsumo,
  contextoAccionIR,
  registrarAlarmaStockBajo,
  registrarEventoIR,
  RechazoIR,
} from "../../../_acciones"

type Ctx = { params: Promise<{ id: string }> }

/** Resultado interno de la transacción (se traduce a HTTP fuera de ella). */
type ResultadoEntrega =
  | { tipo: "no_existe" }
  | { tipo: "ya_entregada" }
  | { tipo: "no_pendiente" }
  | { tipo: "sin_recurso" }
  | { tipo: "recurso_perdido" }
  | { tipo: "ok"; stockNuevo: number }

/** POST marca la solicitud como entregada y descuenta el stock del insumo. */
export async function POST(_req: Request, ctx: Ctx): Promise<Response> {
  const contexto = await contextoAccionIR()
  if (!contexto.ok) return contexto.response
  const { scope } = contexto
  const { id } = await ctx.params

  try {
    const resultado = await prisma.$transaction(async (tx): Promise<ResultadoEntrega> => {
      const solicitud = await cargarSolicitudInsumo(id, scope, tx)
      if (!solicitud) return { tipo: "no_existe" }
      // Idempotencia: re-entregar una solicitud ya entregada no vuelve a descontar.
      if (solicitud.estado === "entregada") return { tipo: "ya_entregada" }
      if (solicitud.estado !== "pendiente") return { tipo: "no_pendiente" }
      if (!solicitud.recursoInsumoId) return { tipo: "sin_recurso" }

      const recurso = await cargarRecursoIR(solicitud.recursoInsumoId, scope, tx)
      if (!recurso) return { tipo: "recurso_perdido" }

      // Candado de estado: si otra entrega ganó la carrera, count === 0 y esta
      // corrida no descuenta nada (exactly-once de la entrega y del evento).
      const marca = await tx.solicitudInsumoIR.updateMany({
        where: { id, comunidadId: scope.comunidadId, estado: "pendiente" },
        data: { estado: "entregada", entregaFecha: hoyISO() },
      })
      if (marca.count === 0) return { tipo: "ya_entregada" }

      // Guard + decremento en una sola sentencia: nunca deja stock negativo.
      const descuento = await tx.recursoIR.updateMany({
        where: {
          id: recurso.id,
          comunidadId: scope.comunidadId,
          stock: { gte: solicitud.cantidad },
        },
        data: { stock: { decrement: solicitud.cantidad } },
      })
      if (descuento.count === 0) {
        // Revierte el estado marcado arriba: no hay entrega sin stock.
        throw new RechazoIR(
          400,
          `Stock insuficiente: quedan ${recurso.stock} unidad(es) y se solicitaron ${solicitud.cantidad}.`
        )
      }

      const stockNuevo = recurso.stock - solicitud.cantidad

      await registrarEventoIR(
        scope,
        "IR_SOLICITUD_ENTREGADA",
        id,
        `Solicitud ${solicitud.folio} ENTREGADA: ${recurso.nombre} ×${solicitud.cantidad} para ${solicitud.areaDestino} (stock ${recurso.stock} → ${stockNuevo}).`,
        tx
      )

      // Alarma de reposición automática al cruzar el umbral crítico (paridad
      // `entregarSolicitudInsumoIR`: solo en la transición, no en cada entrega).
      await registrarAlarmaStockBajo(scope, recurso, recurso.stock, stockNuevo, tx)

      return { tipo: "ok", stockNuevo }
    })

    switch (resultado.tipo) {
      case "no_existe":
        return jsonError(404, "No se puede entregar: la solicitud no existe.")
      case "ya_entregada":
        return Response.json({ ok: true, yaEntregada: true })
      case "no_pendiente":
        return jsonError(400, "Solo una solicitud Pendiente puede entregarse.")
      case "sin_recurso":
        return jsonError(
          400,
          "No se puede entregar: el comodín aún no tiene artículo asociado (resuélvelo primero)."
        )
      case "recurso_perdido":
        return jsonError(
          400,
          "No se puede entregar: el artículo del catálogo ya no existe."
        )
      case "ok":
        return Response.json({ ok: true, stockNuevo: resultado.stockNuevo })
    }
  } catch (e) {
    if (e instanceof RechazoIR) return jsonError(e.status, e.message)
    logger.error({ err: e }, "[api/ir/solicitudes-insumo/entregar] error inesperado")
    return jsonError(500, "Error interno del servidor.")
  }
}
