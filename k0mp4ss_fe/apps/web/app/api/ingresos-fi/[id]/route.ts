/**
 * /api/ingresos-fi/[id] — detalle/actualización parcial/baja de un ingreso FI.
 *
 * GET_ONE y DELETE vía factory. PUT parcial: si el parche cambia el fondo,
 * el nuevo fondo debe existir y estar activo.
 */
import { IngresoFISchema } from "@/lib/schemas"
import { puede } from "@/lib/authz"
import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import {
  jsonError,
  withComunidadScope,
} from "@/lib/api/with-comunidad-scope"
import { errorGenerico } from "@/app/api/personas/route"
import { ingresosHandlers, verificarFondoActivo } from "../route"

type Ctx = { params: Promise<{ id: string }> }

export const GET = ingresosHandlers.GET_ONE
export const DELETE = ingresosHandlers.DELETE

/** PUT parcial con validación del fondo si viene en el parche. */
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
  const parcial = IngresoFISchema.partial().safeParse(body)
  if (!parcial.success) {
    return jsonError(400, "Datos inválidos.", {
      detalles: parcial.error.flatten(),
    })
  }

  try {
    const existente = await prisma.ingresoFI.findUnique({ where: { id } })
    if (!existente || existente.comunidadId !== scope.comunidadId) {
      return jsonError(404, "Registro no encontrado.")
    }
    // SAFETY: parcial.data ya pasó IngresoFISchema.partial().safeParse; el spread solo permite borrar id/comunidadId antes del update.
    const datos = { ...(parcial.data as Record<string, unknown>) }
    delete datos.id
    delete datos.comunidadId
    if (typeof datos.fondoId === "string") {
      const corto = await verificarFondoActivo(
        scope.comunidadId,
        datos.fondoId
      )
      if (corto) return corto
    }
    const record = await prisma.ingresoFI.update({
      where: { id },
      data: datos as never,
    })
    return Response.json(record)
  } catch (e) {
    logger.error({ err: e }, "[api/ingresos-fi] error inesperado")
    return errorGenerico(e)
  }
}
