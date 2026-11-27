/**
 * /api/pe/mantenciones/[id] — detalle/actualización parcial/baja.
 *
 * GET_ONE y DELETE vía factory. PUT parcial vía put-merge sobre el recurso
 * propio "pe:mantenciones" (no el `pe` genérico): leer el calendario no es
 * gestionarlo, y conserjería solo conserva `ver`.
 */
import { MantencionPreventivaPESchema } from "@/lib/schemas"
import { puede } from "@/lib/authz"
import { prisma } from "@/lib/prisma"
import { createCrudHandlers, delegado } from "@/lib/api/crud-factory"
import { createPutMerge } from "@/lib/api/put-merge"
import { jsonError } from "@/lib/api/with-comunidad-scope"

const modelo = delegado(prisma.mantencionPreventivaPE)
const authzCheck = (rol: string, accion: "ver" | "crear" | "editar" | "eliminar" | "ejecutar") =>
  puede(rol, accion, "pe:mantenciones")

const handlers = createCrudHandlers({
  model: modelo,
  schema: MantencionPreventivaPESchema,
  authzCheck,
  /**
   * Guarda de baja (T6/S3): `VisitaTecnicaPE.mantencionId` es texto sin FK
   * (schema.prisma:2157) y `VisitaTecnicaPE` no tiene estado
   * (schema.prisma:2152-2160), así que toda visita cuenta: con la mantención
   * borrada quedaría nombrando una programación inexistente.
   */
  beforeDelete: async (record, scope) => {
    const id = (record as { id: string }).id
    const visitas = await prisma.visitaTecnicaPE.count({
      where: { comunidadId: scope.comunidadId, mantencionId: id },
    })
    if (visitas > 0) {
      return jsonError(
        409,
        `No se puede eliminar la mantención: tiene ${visitas} visita(s) técnica(s) asociada(s).`
      )
    }
    return null
  },
})

export const GET = handlers.GET_ONE
export const PUT = createPutMerge({
  model: modelo,
  schema: MantencionPreventivaPESchema,
  authzCheck,
  recurso: "pe/mantenciones",
})
export const DELETE = handlers.DELETE
