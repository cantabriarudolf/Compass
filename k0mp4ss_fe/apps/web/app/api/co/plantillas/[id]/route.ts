/**
 * /api/co/plantillas/[id] — detalle/actualización parcial/baja.
 *
 * GET_ONE y DELETE vía factory. PUT parcial vía put-merge sobre "co".
 */
import { PlantillaCOSchema } from "@/lib/schemas"
import { puede } from "@/lib/authz"
import { prisma } from "@/lib/prisma"
import { createCrudHandlers, delegado } from "@/lib/api/crud-factory"
import { createPutMerge } from "@/lib/api/put-merge"
import { jsonError } from "@/lib/api/with-comunidad-scope"

const modelo = delegado(prisma.plantillaCO)
const authzCheck = (rol: string, accion: "ver" | "crear" | "editar" | "eliminar" | "ejecutar") =>
  puede(rol, accion, "co")

const handlers = createCrudHandlers({
  model: modelo,
  schema: PlantillaCOSchema,
  authzCheck,
  /**
   * Guarda de baja (T6/S3): `EnvioCO.plantillaId` es texto sin FK
   * (schema.prisma:992). El envío es el snapshot inmutable de lo difundido y no
   * tiene estado (schema.prisma:986-1004); la consola lo sigue mostrando con el
   * nombre de la plantilla que lo originó (consola-comunicacion.tsx:681), así
   * que todo envío cuenta.
   */
  beforeDelete: async (record, scope) => {
    const id = (record as { id: string }).id
    const envios = await prisma.envioCO.count({
      where: { comunidadId: scope.comunidadId, plantillaId: id },
    })
    if (envios > 0) {
      return jsonError(
        409,
        `No se puede eliminar la plantilla: tiene ${envios} envío(s) asociado(s).`
      )
    }
    return null
  },
})

export const GET = handlers.GET_ONE
export const PUT = createPutMerge({
  model: modelo,
  schema: PlantillaCOSchema,
  authzCheck,
  recurso: "co/plantillas",
})
export const DELETE = handlers.DELETE
