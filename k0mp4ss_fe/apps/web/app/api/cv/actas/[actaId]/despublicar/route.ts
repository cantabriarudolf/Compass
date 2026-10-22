/**
 * /api/cv/actas/[actaId]/despublicar — revierte la visibilidad de un acta en el
 * visor CV (SERIE-FASE2 §V6).
 *
 * POST (`cv` editar = administrador y comité): marca la referencia como
 * `despublicado` con actor y fecha, y emite `CV_ACTA_DESPUBLICADA`. El acta GD
 * NO se toca: sigue siendo el documento canónico del libro de actas; solo deja
 * de mostrarse en la vista general del visor.
 *
 * Segunda llamada sobre una publicación ya despublicada (o inexistente) → 404,
 * igual que un acta de otra comunidad: no hay transición que auditar.
 */
import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import { jsonError } from "@/lib/api/with-comunidad-scope"
import {
  ESTADO_ACTA_DESPUBLICADA,
  ESTADO_ACTA_PUBLICADA,
  contextoActasCV,
  registrarEventoCV,
  serializarPublicacion,
} from "../../../_actas"

type Ctx = { params: Promise<{ actaId: string }> }

export async function POST(_req: Request, ctx: Ctx): Promise<Response> {
  const contexto = await contextoActasCV("editar")
  if (!contexto.ok) return contexto.response
  const { scope } = contexto
  const { actaId } = await ctx.params

  try {
    const existente = await prisma.actaPublicadaCV.findUnique({
      where: {
        comunidadId_actaId: { comunidadId: scope.comunidadId, actaId },
      },
    })
    if (!existente || existente.estado !== ESTADO_ACTA_PUBLICADA) {
      return jsonError(404, "Publicación no encontrada.")
    }

    const publicacion = await prisma.actaPublicadaCV.update({
      where: {
        comunidadId_actaId: { comunidadId: scope.comunidadId, actaId },
      },
      data: {
        estado: ESTADO_ACTA_DESPUBLICADA,
        despublicadoEn: new Date(),
        despublicadoPorUsuarioId: scope.usuarioId,
      },
    })

    try {
      await registrarEventoCV(
        scope,
        "CV_ACTA_DESPUBLICADA",
        actaId,
        `Acta despublicada del visor (acta ${actaId}); el libro de actas sigue siendo el documento oficial.`
      )
    } catch (e) {
      logger.error(
        { err: e },
        "[api/cv/actas] no se pudo registrar CV_ACTA_DESPUBLICADA"
      )
    }

    return Response.json(serializarPublicacion(publicacion))
  } catch (e) {
    logger.error({ err: e }, "[api/cv/actas] error inesperado al despublicar")
    return jsonError(500, "Error interno del servidor.")
  }
}
