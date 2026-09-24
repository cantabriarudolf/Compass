/**
 * /api/micro-sectores/[id] — detalle/actualización parcial/baja de un micro EF.
 *
 * GET_ONE y DELETE vía factory. PUT parcial: si cambia el macro, debe existir.
 */
import { MicroSectorSchema } from "@/lib/schemas"
import { puede } from "@/lib/authz"
import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import {
  jsonError,
  withComunidadScope,
} from "@/lib/api/with-comunidad-scope"
import { errorGenerico } from "@/app/api/personas/route"
import { microHandlers, verificarMacroExiste } from "../route"

type Ctx = { params: Promise<{ id: string }> }

export async function GET(req: Request, ctx: Ctx): Promise<Response> {
  return microHandlers.GET_ONE(req, ctx)
}

export async function DELETE(req: Request, ctx: Ctx): Promise<Response> {
  return microHandlers.DELETE(req, ctx)
}

/** PUT parcial con verificación del macro si viene en el parche. */
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
  const parcial = MicroSectorSchema.partial().safeParse(body)
  if (!parcial.success) {
    return jsonError(400, "Datos inválidos.", {
      detalles: parcial.error.flatten(),
    })
  }

  try {
    const existente = await prisma.microSector.findUnique({ where: { id } })
    if (!existente || existente.comunidadId !== scope.comunidadId) {
      return jsonError(404, "Registro no encontrado.")
    }
    // SAFETY: parcial.data ya pasó MicroSectorSchema.partial().safeParse.
    const datos = { ...(parcial.data as Record<string, unknown>) }
    delete datos.id
    delete datos.comunidadId
    if (typeof datos.macroSectorId === "string") {
      const corto = await verificarMacroExiste(
        scope.comunidadId,
        datos.macroSectorId
      )
      if (corto) return corto
    }
    const record = await prisma.microSector.update({
      where: { id },
      data: datos as never,
    })
    return Response.json(record)
  } catch (e) {
    logger.error({ err: e }, "[api/micro-sectores] error inesperado")
    return errorGenerico(e)
  }
}
