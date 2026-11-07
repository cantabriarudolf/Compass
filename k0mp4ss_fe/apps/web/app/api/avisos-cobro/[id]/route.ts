/**
 * /api/avisos-cobro/[id] — detalle y baja (imposible) de un aviso emitido.
 *
 * GET_ONE vía factory (scoped por comunidad). La LECTURA tiene dos ramas desde
 * F27: gestión con `fi:gasto_comun` ver (como siempre) y el residente con
 * `fi:aviso:propio` ver, que solo alcanza las unidades donde tiene vínculo
 * VIGENTE. El fragmento sale de `alcanceAvisosCobro` (`_alcance.ts`), la misma
 * regla que usan la colección y el PDF; el aviso de una unidad ajena responde el
 * 404 genérico y no se carga. No hay PUT: un aviso emitido no se edita, es el
 * documento con el que se cobra (S7).
 *
 * DELETE responde SIEMPRE 409 (a quien tiene la clave de gestión). No es una
 * guarda de conveniencia: el aviso es el papel que funda el plazo de pago (Ley
 * 21.442 arts. 31, 32 y 7), así que borrarlo destruiría el título del cobro. Si
 * un aviso salió equivocado, la corrección es un documento posterior, no un
 * `DELETE`. El 404 de una fila de otra comunidad se resuelve ANTES del 409 para
 * no confirmar que existe.
 */
import { prisma } from "@/lib/prisma"
import { puede } from "@/lib/authz"
import { logger } from "@/lib/logger"
import { jsonError, withComunidadScope } from "@/lib/api/with-comunidad-scope"
import { avisosHandlers } from "../route"

type Ctx = { params: Promise<{ id: string }> }

export const GET = avisosHandlers.GET_ONE

export async function DELETE(_req: Request, ctx: Ctx): Promise<Response> {
  const resultado = await withComunidadScope()
  if (!resultado.ok) return resultado.response
  const scope = resultado.scope
  const { id } = await ctx.params

  try {
    const aviso = await prisma.avisoCobro.findUnique({
      where: { id },
      select: { id: true, comunidadId: true, folio: true, periodo: true },
    })
    if (!aviso || aviso.comunidadId !== scope.comunidadId) {
      return jsonError(404, "Registro no encontrado.")
    }
    if (!puede(scope.rol, "eliminar", "fi:gasto_comun")) {
      return jsonError(403, "Permiso denegado.")
    }
    return jsonError(
      409,
      `El aviso ${aviso.folio} del período ${aviso.periodo} no se puede eliminar: es el documento con el que se cobra y la ley no permite retirarlo una vez emitido. La corrección de un aviso equivocado se emite como documento posterior.`
    )
  } catch (e) {
    logger.error({ err: e }, "[api/avisos-cobro] error inesperado")
    return jsonError(500, "Error interno del servidor.")
  }
}
