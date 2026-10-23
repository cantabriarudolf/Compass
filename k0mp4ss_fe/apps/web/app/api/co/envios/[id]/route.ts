/**
 * /api/co/envios/[id] — detalle/actualización parcial/baja.
 *
 * GET a medida (change co-lectura-residente, D2 · S2/S3): el residente solo abre
 * envíos donde figura como destinatario y **un envío ajeno responde 404**, igual
 * que un id inexistente: el 404 no distingue «no es tuyo» de «no existe».
 * PUT parcial vía put-merge y DELETE vía factory (authz `co`).
 */
import { EnvioCOSchema } from "@/lib/schemas"
import { puede } from "@/lib/authz"
import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import { createCrudHandlers, delegado } from "@/lib/api/crud-factory"
import { createPutMerge } from "@/lib/api/put-merge"
import { jsonError, withComunidadScope } from "@/lib/api/with-comunidad-scope"
import { personaIdDelUsuarioDb } from "@/lib/api/sesion-persona"
import {
  cargarDestinos,
  proyectarEnvio,
  rolProyeccion,
  whereEnvioDetalle,
} from "../../_lib/proyeccion-envio"

type Ctx = { params: Promise<{ id: string }> }

const modelo = delegado(prisma.envioCO)
const authzCheck = (rol: string, accion: "ver" | "crear" | "editar" | "eliminar" | "ejecutar") =>
  puede(rol, accion, "co")

const handlers = createCrudHandlers({
  model: modelo,
  schema: EnvioCOSchema,
  authzCheck,
})

export async function GET(_req: Request, ctx: Ctx): Promise<Response> {
  const resultado = await withComunidadScope()
  if (!resultado.ok) return resultado.response
  const { scope } = resultado

  if (!puede(scope.rol, "ver", "co")) return jsonError(403, "Permiso denegado.")

  const { id } = await ctx.params
  const rol = rolProyeccion(scope.rol)
  try {
    const personaId = rol === "residente" ? await personaIdDelUsuarioDb(scope.usuarioId) : null
    const fila = await prisma.envioCO.findFirst({
      where: whereEnvioDetalle(rol, scope.comunidadId, id, personaId),
    })
    if (!fila) return jsonError(404, "Registro no encontrado.")
    const destinos = await cargarDestinos([fila.id], rol === "residente" ? personaId : null)
    return Response.json(proyectarEnvio(rol, fila, destinos))
  } catch (e) {
    logger.error({ err: e }, "[api/co/envios/[id]] error en GET")
    return jsonError(500, "Error interno del servidor.")
  }
}

export const PUT = createPutMerge({
  model: modelo,
  schema: EnvioCOSchema,
  authzCheck,
  recurso: "co/envios",
})
export const DELETE = handlers.DELETE
