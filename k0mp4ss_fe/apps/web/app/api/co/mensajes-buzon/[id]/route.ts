/**
 * /api/co/mensajes-buzon/[id] — detalle/actualización parcial/baja.
 *
 * Authz "co:buzon" (change co-lectura-residente D4). El detalle de un mensaje
 * ajeno responde 404, nunca 403: el residente no debe poder deducir que existe
 * (S10). PUT parcial vía put-merge y DELETE vía factory.
 */
import { MensajeBuzonCOSchema } from "@/lib/schemas"
import { puede } from "@/lib/authz"
import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import { createCrudHandlers, delegado } from "@/lib/api/crud-factory"
import { createPutMerge } from "@/lib/api/put-merge"
import { jsonError, withComunidadScope } from "@/lib/api/with-comunidad-scope"
import { personaIdDelUsuarioDb } from "@/lib/api/sesion-persona"
import { whereMensajeBuzon } from "../../_lib/buzon-alcance"

type Ctx = { params: Promise<{ id: string }> }

const modelo = delegado(prisma.mensajeBuzonCO)
const authzCheck = (rol: string, accion: "ver" | "crear" | "editar" | "eliminar" | "ejecutar") =>
  puede(rol, accion, "co:buzon")

const handlers = createCrudHandlers({
  model: modelo,
  schema: MensajeBuzonCOSchema,
  authzCheck,
})

export async function GET(_req: Request, ctx: Ctx): Promise<Response> {
  const resultado = await withComunidadScope()
  if (!resultado.ok) return resultado.response
  const { scope } = resultado

  if (!puede(scope.rol, "ver", "co:buzon")) return jsonError(403, "Permiso denegado.")

  const { id } = await ctx.params
  try {
    const personaId = await personaIdDelUsuarioDb(scope.usuarioId)
    const where = whereMensajeBuzon(scope.rol, id, personaId)
    if (!where) return jsonError(404, "Registro no encontrado.")
    const mensaje = await prisma.mensajeBuzonCO.findFirst({
      where: { ...where, comunidadId: scope.comunidadId },
    })
    if (!mensaje) return jsonError(404, "Registro no encontrado.")
    return Response.json(mensaje)
  } catch (e) {
    logger.error({ err: e }, "[api/co/mensajes-buzon/[id]] error en GET")
    return jsonError(500, "Error interno del servidor.")
  }
}

export const PUT = createPutMerge({
  model: modelo,
  schema: MensajeBuzonCOSchema,
  authzCheck,
  recurso: "co/mensajes-buzon",
})
export const DELETE = handlers.DELETE
