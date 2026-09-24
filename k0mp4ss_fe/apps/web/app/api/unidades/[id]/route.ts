/**
 * /api/unidades/[id] — detalle/actualización parcial/baja de una unidad EF.
 *
 * GET_ONE y DELETE vía factory. PUT parcial: las FKs del parche se verifican
 * sobre el registro mergeado antes de persistir.
 */
import { UnidadSchema } from "@/lib/schemas"
import { puede } from "@/lib/authz"
import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import {
  jsonError,
  withComunidadScope,
} from "@/lib/api/with-comunidad-scope"
import { errorGenerico } from "@/app/api/personas/route"
import {
  unidadesHandlers,
  verificarReferenciasUnidad,
  type ReferenciasUnidad,
} from "../route"

type Ctx = { params: Promise<{ id: string }> }

export async function GET(req: Request, ctx: Ctx): Promise<Response> {
  return unidadesHandlers.GET_ONE(req, ctx)
}

export async function DELETE(req: Request, ctx: Ctx): Promise<Response> {
  return unidadesHandlers.DELETE(req, ctx)
}

/** PUT parcial con verificación de FKs sobre el registro mergeado. */
export async function PUT(req: Request, ctx: Ctx): Promise<Response> {
  const resultado = await withComunidadScope()
  if (!resultado.ok) return resultado.response
  const scope = resultado.scope
  const { id } = await ctx.params
  if (!puede(scope.rol, "editar", "mp")) {
    return jsonError(403, "Permiso denegado.")
  }

  const body: unknown = await req.json().catch(() => null)
  if (body === null) return jsonError(400, "Cuerpo JSON inválido.")
  const parcial = UnidadSchema.partial().safeParse(body)
  if (!parcial.success) {
    return jsonError(400, "Datos inválidos.", {
      detalles: parcial.error.flatten(),
    })
  }

  try {
    const existente = await prisma.unidad.findUnique({ where: { id } })
    if (!existente || existente.comunidadId !== scope.comunidadId) {
      return jsonError(404, "Registro no encontrado.")
    }
    // SAFETY: parcial.data ya pasó UnidadSchema.partial().safeParse.
    const datos = { ...(parcial.data as Record<string, unknown>) }
    delete datos.id
    delete datos.comunidadId
    // SAFETY: merge del registro Prisma con el parche validado; solo FKs.
    const mergeado = {
      ...(existente as unknown as Record<string, unknown>),
      ...datos,
    } as unknown as ReferenciasUnidad
    const corto = await verificarReferenciasUnidad(scope.comunidadId, mergeado)
    if (corto) return corto

    const record = await prisma.unidad.update({
      where: { id },
      data: datos as never,
    })
    return Response.json(record)
  } catch (e) {
    logger.error({ err: e }, "[api/unidades] error inesperado")
    return errorGenerico(e)
  }
}
