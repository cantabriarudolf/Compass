/**
 * /api/egresos-fi/[id] — detalle/actualización parcial/baja de un egreso FI.
 *
 * GET_ONE y DELETE vía factory. PUT parcial: las FKs que vengan en el parche
 * se verifican contra la comunidad antes de persistir.
 */
import { EgresoFISchema } from "@/lib/schemas"
import { puede } from "@/lib/authz"
import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import {
  jsonError,
  withComunidadScope,
} from "@/lib/api/with-comunidad-scope"
import { errorGenerico } from "@/app/api/personas/route"
import {
  egresosHandlers,
  verificarReferenciasEgreso,
  type ReferenciasEgreso,
} from "../route"

type Ctx = { params: Promise<{ id: string }> }

export const GET = egresosHandlers.GET_ONE
export const DELETE = egresosHandlers.DELETE

/** PUT parcial con verificación de FKs sobre el registro mergeado. */
export async function PUT(req: Request, ctx: Ctx): Promise<Response> {
  const resultado = await withComunidadScope()
  if (!resultado.ok) return resultado.response
  const scope = resultado.scope
  const { id } = await ctx.params
  if (!puede(scope.rol, "editar", "fi")) {
    return jsonError(403, "Permiso denegado.")
  }

  const body: unknown = await req.json().catch(() => null)
  if (body === null) return jsonError(400, "Cuerpo JSON inválido.")
  const parcial = EgresoFISchema.partial().safeParse(body)
  if (!parcial.success) {
    return jsonError(400, "Datos inválidos.", {
      detalles: parcial.error.flatten(),
    })
  }

  try {
    const existente = await prisma.egresoFI.findUnique({ where: { id } })
    if (!existente || existente.comunidadId !== scope.comunidadId) {
      return jsonError(404, "Registro no encontrado.")
    }
    const datos = { ...(parcial.data as Record<string, unknown>) }
    delete datos.id
    delete datos.comunidadId
    // SAFETY: merge del registro Prisma (shape del modelo EgresoFI) con el parche ya validado por EgresoFISchema.partial; solo se lee para verificar FKs.
    const mergeado = {
      // SAFETY: existente viene de Prisma con el shape completo del modelo.
      ...(existente as unknown as Record<string, unknown>),
      ...datos,
    } as unknown as ReferenciasEgreso
    const corto = await verificarReferenciasEgreso(scope.comunidadId, mergeado)
    if (corto) return corto

    const record = await prisma.egresoFI.update({
      where: { id },
      data: datos as never,
    })
    return Response.json(record)
  } catch (e) {
    logger.error({ err: e }, "[api/egresos-fi] error inesperado")
    return errorGenerico(e)
  }
}
