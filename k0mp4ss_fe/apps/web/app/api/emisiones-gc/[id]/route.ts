/**
 * /api/emisiones-gc/[id] — detalle/actualización/baja de una emisión GC.
 *
 * GET_ONE vía factory. PUT parcial revalida la entidad completa mergeada.
 * DELETE bloqueada (409) si algún cobro de la emisión tiene pagos; si no,
 * borra sus cobros junto con la emisión.
 */
import { EmisionGCSchema } from "@/lib/schemas"
import { puede } from "@/lib/authz"
import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import {
  jsonError,
  withComunidadScope,
} from "@/lib/api/with-comunidad-scope"
import { errorGenerico } from "@/app/api/personas/route"
import { emisionesHandlers } from "../route"

type Ctx = { params: Promise<{ id: string }> }

export const GET = emisionesHandlers.GET_ONE

/** PUT parcial: valida la entidad completa mergeada antes de persistir. */
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
  const parcial = EmisionGCSchema.partial().safeParse(body)
  if (!parcial.success) {
    return jsonError(400, "Datos inválidos.", {
      detalles: parcial.error.flatten(),
    })
  }

  try {
    const existente = await prisma.emisionGC.findUnique({ where: { id } })
    if (!existente || existente.comunidadId !== scope.comunidadId) {
      return jsonError(404, "Registro no encontrado.")
    }
    const datos = { ...(parcial.data as Record<string, unknown>) }
    delete datos.id
    delete datos.comunidadId
    // SAFETY: merge del registro Prisma con el parche validado; solo se valida.
    const mergeado = {
      ...(existente as unknown as Record<string, unknown>),
      ...datos,
    }
    const completa = EmisionGCSchema.safeParse(mergeado)
    if (!completa.success) {
      return jsonError(400, "Datos inválidos.", {
        detalles: completa.error.flatten(),
      })
    }
    const record = await prisma.emisionGC.update({
      where: { id },
      data: datos as never,
    })
    return Response.json(record)
  } catch (e) {
    logger.error({ err: e }, "[api/emisiones-gc] error inesperado")
    return errorGenerico(e)
  }
}

/** DELETE: 409 si hay cobros con pagos; si no, borra cobros + emisión. */
export async function DELETE(_req: Request, ctx: Ctx): Promise<Response> {
  const resultado = await withComunidadScope()
  if (!resultado.ok) return resultado.response
  const scope = resultado.scope
  const { id } = await ctx.params
  if (!puede(scope.rol, "eliminar", "fi")) {
    return jsonError(403, "Permiso denegado.")
  }

  try {
    const existente = await prisma.emisionGC.findUnique({ where: { id } })
    if (!existente || existente.comunidadId !== scope.comunidadId) {
      return jsonError(404, "Registro no encontrado.")
    }
    const cobros = await prisma.cobroFI.findMany({
      where: { comunidadId: scope.comunidadId, origenRef: id },
      select: { id: true, pagos: true },
    })
    const conPagos = cobros.filter((c) => {
      // SAFETY: pagos es Json con shape PagoCobroFI[] según CobroFISchema.
      const pagos = (c.pagos as unknown as unknown[]) ?? []
      return pagos.length > 0
    })
    if (conPagos.length > 0) {
      return jsonError(
        409,
        `No se puede eliminar la emisión: ${conPagos.length} cobro(s) tienen pagos registrados.`
      )
    }
    await prisma.$transaction([
      prisma.cobroFI.deleteMany({
        where: { comunidadId: scope.comunidadId, origenRef: id },
      }),
      prisma.emisionGC.delete({ where: { id } }),
    ])
    return Response.json({ ok: true })
  } catch (e) {
    logger.error({ err: e }, "[api/emisiones-gc] error inesperado")
    return errorGenerico(e)
  }
}
