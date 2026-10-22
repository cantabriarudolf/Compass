/**
 * /api/ir/solicitudes-insumo/[id]/resolver-comodin — resuelve en un click el
 * comodín (artículo fuera de catálogo) de una solicitud de insumo.
 *
 * POST custom (edición sobre "ir:mantenimiento"): paridad server-side con
 * `resolverComodinIR` legacy, con la decisión owner 2026-10-21 — el comodín se
 * resuelve amigablemente, sin flujo de aprobación adicional:
 *
 * - `sustituir` → asigna el artículo similar del catálogo Y lo ENTREGA en la
 *   misma transacción (solicitud `entregada` + `entregaFecha` + stock del
 *   sustituto descontado). Un click cierra el ciclo completo.
 * - `rechazar` → cierra la solicitud sin descontar stock; la justificación es
 *   obligatoria (mensaje legacy).
 * - `aprobar_crear` → alta automática del artículo al catálogo (`stock 0`) y
 *   asociación a la solicitud, para futuras solicitudes.
 *
 * Garantías:
 * - Atómico: cada decisión corre en una `$transaction`; `RechazoIR` la revierte
 *   (una sustitución sin stock no deja la solicitud entregada ni el alta creada).
 * - Idempotente: el candado es el update condicional sobre `estadoComodin:
 *   "pendiente"`; resolver dos veces responde 400 sin duplicar stock ni eventos.
 * - Scoping: la solicitud y el sustituto se validan contra la comunidad de la
 *   sesión; solicitud o sustituto de otra comunidad → 404 / 400 sin filtrar
 *   existencia.
 */
import { hoyISO } from "@/lib/date-utils"
import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import { generarId } from "@/lib/id-utils"
import { ResolverComodinIRSchema } from "@/lib/schemas"
import { jsonError } from "@/lib/api/with-comunidad-scope"
import {
  cargarRecursoIR,
  cargarSolicitudInsumo,
  contextoAccionIR,
  registrarAlarmaStockBajo,
  registrarEventoIR,
  RechazoIR,
  siguienteCodigoIR,
} from "../../../_acciones"

type Ctx = { params: Promise<{ id: string }> }

/** Resultado interno de la transacción (se traduce a HTTP fuera de ella). */
type ResultadoComodin =
  | { tipo: "no_existe" }
  | { tipo: "no_pendiente" }
  | { tipo: "ok"; recursoCreadoId?: string; stockNuevo?: number }

/** POST resuelve el comodín: sustituir (entrega) / rechazar / aprobar y crear. */
export async function POST(req: Request, ctx: Ctx): Promise<Response> {
  const contexto = await contextoAccionIR()
  if (!contexto.ok) return contexto.response
  const { scope } = contexto
  const { id } = await ctx.params

  const body: unknown = await req.json().catch(() => null)
  if (body === null) return jsonError(400, "Cuerpo JSON inválido.")
  const parsed = ResolverComodinIRSchema.safeParse(body)
  if (!parsed.success) {
    return jsonError(400, "Datos inválidos.", {
      detalles: parsed.error.flatten(),
    })
  }
  const { accion, recursoSustitutoId, justificacion } = parsed.data

  try {
    const resultado = await prisma.$transaction(
      async (tx): Promise<ResultadoComodin> => {
        const solicitud = await cargarSolicitudInsumo(id, scope, tx)
        if (!solicitud) return { tipo: "no_existe" }
        if (solicitud.estadoComodin !== "pendiente" || !solicitud.comodin) {
          return { tipo: "no_pendiente" }
        }
        // SAFETY: comodin es Json con shape ComodinIRSchema validado al crear la solicitud.
        const comodin = solicitud.comodin as unknown as {
          descripcionArticulo: string
          justificacion: string
        }
        const candado = {
          id,
          comunidadId: scope.comunidadId,
          estadoComodin: "pendiente",
        }

        if (accion === "rechazar") {
          if (!justificacion) {
            throw new RechazoIR(400, "El rechazo exige justificación obligatoria.")
          }
          const cierre = await tx.solicitudInsumoIR.updateMany({
            where: candado,
            data: {
              estado: "rechazada",
              estadoComodin: "rechazada",
              rechazoJustificacion: justificacion,
            },
          })
          if (cierre.count === 0) return { tipo: "no_pendiente" }
          await registrarEventoIR(
            scope,
            "IR_COMODIN_RESUELTO",
            id,
            `Comodín ${solicitud.folio} rechazado: ${justificacion}`,
            tx
          )
          return { tipo: "ok" }
        }

        if (accion === "sustituir") {
          const sustituto = recursoSustitutoId
            ? await cargarRecursoIR(recursoSustitutoId, scope, tx)
            : null
          if (!sustituto || sustituto.categoria !== "insumo") {
            throw new RechazoIR(
              400,
              "La sustitución exige un artículo similar existente en el catálogo."
            )
          }
          const marca = await tx.solicitudInsumoIR.updateMany({
            where: candado,
            data: {
              recursoInsumoId: sustituto.id,
              recursoSustitutoId: sustituto.id,
              estadoComodin: "sustituida",
              estado: "entregada",
              entregaFecha: hoyISO(),
            },
          })
          if (marca.count === 0) return { tipo: "no_pendiente" }

          // Guard + decremento en una sola sentencia: nunca deja stock negativo.
          const descuento = await tx.recursoIR.updateMany({
            where: {
              id: sustituto.id,
              comunidadId: scope.comunidadId,
              stock: { gte: solicitud.cantidad },
            },
            data: { stock: { decrement: solicitud.cantidad } },
          })
          if (descuento.count === 0) {
            throw new RechazoIR(
              400,
              `Stock insuficiente: quedan ${sustituto.stock} unidad(es) y se solicitaron ${solicitud.cantidad}.`
            )
          }

          const stockNuevo = sustituto.stock - solicitud.cantidad
          await registrarEventoIR(
            scope,
            "IR_COMODIN_RESUELTO",
            id,
            `Comodín ${solicitud.folio} sustituido por ${sustituto.nombre} y entregado ×${solicitud.cantidad} (stock ${sustituto.stock} → ${stockNuevo}).`,
            tx
          )
          await registrarAlarmaStockBajo(
            scope,
            sustituto,
            sustituto.stock,
            stockNuevo,
            tx
          )
          return { tipo: "ok", stockNuevo }
        }

        // aprobar_crear: alta automática al catálogo para futuras solicitudes.
        const nombreArticulo = comodin.descripcionArticulo.trim()
        const codigo = await siguienteCodigoIR(scope.comunidadId, tx)
        const creado = await tx.recursoIR.create({
          data: {
            id: generarId("ir"),
            comunidadId: scope.comunidadId,
            codigo,
            nombre: nombreArticulo,
            categoria: "insumo",
            descripcion: `Creado automáticamente desde comodín ${solicitud.folio}: ${comodin.justificacion}`,
            estadoActivo: "disponible",
            stock: 0,
            esCritico: false,
          },
        })
        const marca = await tx.solicitudInsumoIR.updateMany({
          where: candado,
          data: {
            recursoInsumoId: creado.id,
            estadoComodin: "aprobada_creada",
          },
        })
        // Carrera perdida: se revierte el alta para no dejar un insumo huérfano.
        if (marca.count === 0) {
          throw new RechazoIR(
            400,
            "Solo una solicitud comodín pendiente puede resolverse."
          )
        }
        await registrarEventoIR(
          scope,
          "IR_COMODIN_RESUELTO",
          id,
          `Comodín ${solicitud.folio} aprobado: "${nombreArticulo}" añadido al catálogo (${codigo}).`,
          tx
        )
        return { tipo: "ok", recursoCreadoId: creado.id }
      }
    )

    if (resultado.tipo === "no_existe") {
      return jsonError(404, "No se puede resolver: la solicitud no existe.")
    }
    if (resultado.tipo === "no_pendiente") {
      return jsonError(
        400,
        "Solo una solicitud comodín pendiente puede resolverse."
      )
    }
    const cuerpo: Record<string, unknown> = { ok: true }
    if (resultado.recursoCreadoId) cuerpo.recursoCreadoId = resultado.recursoCreadoId
    if (resultado.stockNuevo !== undefined) cuerpo.stockNuevo = resultado.stockNuevo
    return Response.json(cuerpo)
  } catch (e) {
    if (e instanceof RechazoIR) return jsonError(e.status, e.message)
    logger.error(
      { err: e },
      "[api/ir/solicitudes-insumo/resolver-comodin] error inesperado"
    )
    return jsonError(500, "Error interno del servidor.")
  }
}
