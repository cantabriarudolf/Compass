/**
 * /api/ra/elementos/[id] — detalle/actualización parcial/baja.
 *
 * GET_ONE y DELETE vía factory. PUT parcial vía put-merge (el schema es
 * ZodEffects por el refine de bloques horarios; la fusión + validación
 * completa preserva el invariante). Authz "ra".
 */
import { ElementoRASchema } from "@/lib/schemas"
import { puede } from "@/lib/authz"
import { prisma } from "@/lib/prisma"
import { createCrudHandlers, delegado } from "@/lib/api/crud-factory"
import { createPutMerge } from "@/lib/api/put-merge"
import { jsonError } from "@/lib/api/with-comunidad-scope"

const modelo = delegado(prisma.elementoRA)
const authzCheck = (rol: string, accion: "ver" | "crear" | "editar" | "eliminar" | "ejecutar") =>
  puede(rol, accion, "ra")

const handlers = createCrudHandlers({
  model: modelo,
  schema: ElementoRASchema,
  authzCheck,
  /**
   * Guarda de baja (T6/S3): `ReservaRA.elementoId` es texto sin FK
   * (schema.prisma:1436).
   *
   * `cancelada` también cuenta: libera el tramo de solape
   * (lib/schemas.ts:1689-1702), pero la reserva sigue en el historial y la tabla
   * la muestra con el nombre del elemento (reservas/page.tsx:386-398), así que
   * ninguna reserva es irrelevante y no se excluye ningún estado.
   */
  beforeDelete: async (record, scope) => {
    const id = (record as { id: string }).id
    const reservas = await prisma.reservaRA.count({
      where: { comunidadId: scope.comunidadId, elementoId: id },
    })
    if (reservas > 0) {
      return jsonError(
        409,
        `No se puede eliminar el elemento: tiene ${reservas} reserva(s) asociada(s).`
      )
    }
    return null
  },
})

export const GET = handlers.GET_ONE
export const PUT = createPutMerge({
  model: modelo,
  schema: ElementoRASchema,
  authzCheck,
  recurso: "ra/elementos",
})
export const DELETE = handlers.DELETE
