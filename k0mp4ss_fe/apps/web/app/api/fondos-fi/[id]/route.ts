/**
 * /api/fondos-fi/[id] — detalle/actualización parcial/baja de un fondo FI.
 *
 * GET_ONE y DELETE vía factory (la baja conserva el guard de movimientos de
 * removeFondoFI). PUT parcial con unicidad de nombre por comunidad.
 */
import { FondoFISchema } from "@/lib/schemas"
import { puede } from "@/lib/authz"
import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import {
  jsonError,
  withComunidadScope,
} from "@/lib/api/with-comunidad-scope"
import { errorGenerico } from "@/app/api/personas/route"
import { fondosHandlers } from "../route"

type Ctx = { params: Promise<{ id: string }> }

export const GET = fondosHandlers.GET_ONE
export const DELETE = fondosHandlers.DELETE

/** PUT parcial: solo valida el nombre si viene en el parche. */
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
  const parcial = FondoFISchema.partial().safeParse(body)
  if (!parcial.success) {
    return jsonError(400, "Datos inválidos.", {
      detalles: parcial.error.flatten(),
    })
  }

  try {
    const existente = await prisma.fondoFI.findUnique({ where: { id } })
    if (!existente || existente.comunidadId !== scope.comunidadId) {
      return jsonError(404, "Registro no encontrado.")
    }
    // SAFETY: parcial.data ya pasó FondoFISchema.partial().safeParse; el spread solo permite borrar id/comunidadId antes del update.
    const datos = { ...(parcial.data as Record<string, unknown>) }
    delete datos.id
    delete datos.comunidadId
    if (typeof datos.nombre === "string") {
      const nombre = datos.nombre.trim()
      const mismos = await prisma.fondoFI.findMany({
        where: { comunidadId: scope.comunidadId },
        select: { id: true, nombre: true },
      })
      if (
        mismos.some(
          (f) =>
            f.id !== id && f.nombre.toLowerCase() === nombre.toLowerCase()
        )
      ) {
        return jsonError(409, `Ya existe un fondo con el nombre "${nombre}".`)
      }
      datos.nombre = nombre
    }
    const record = await prisma.fondoFI.update({
      where: { id },
      data: datos as never,
    })
    return Response.json(record)
  } catch (e) {
    if (
      typeof e === "object" &&
      e !== null &&
      "code" in e &&
      (e as { code: string }).code === "P2002"
    ) {
      return jsonError(409, "Conflicto: registro duplicado.")
    }
    logger.error({ err: e }, "[api/fondos-fi] error inesperado")
    return errorGenerico(e)
  }
}
