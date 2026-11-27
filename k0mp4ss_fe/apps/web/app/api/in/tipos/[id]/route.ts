/**
 * /api/in/tipos/[id] — detalle/actualización parcial/baja.
 *
 * GET_ONE y DELETE vía factory. PUT parcial vía put-merge sobre "in".
 */
import { TipoInfraccionINSchema } from "@/lib/schemas"
import { puede } from "@/lib/authz"
import { prisma } from "@/lib/prisma"
import { createCrudHandlers, delegado } from "@/lib/api/crud-factory"
import { createPutMerge } from "@/lib/api/put-merge"
import { jsonError } from "@/lib/api/with-comunidad-scope"

const modelo = delegado(prisma.tipoInfraccionIN)
const authzCheck = (rol: string, accion: "ver" | "crear" | "editar" | "eliminar" | "ejecutar") =>
  puede(rol, accion, "in")

const handlers = createCrudHandlers({
  model: modelo,
  schema: TipoInfraccionINSchema,
  authzCheck,
  /**
   * Guarda de baja (T6/S3): `InfraccionIN.tipoInfraccionId`
   * (schema.prisma:1317) y `PropuestaMultaVigencia.tipoInfraccionId`
   * (schema.prisma:699) son texto sin FK.
   *
   * Qué cuenta y qué no (riesgo item 1: una guarda celosa niega una baja legítima):
   * - `InfraccionIN` cuenta SIEMPRE, también `desestimada`: el listado de multas
   *   resuelve el nombre del tipo para toda fila (multas/page.tsx:156,298) y
   *   agrupa por su categoría (:164-166), así que borrar el tipo dejaría la
   *   infracción mostrando un id en vez de la falta.
   * - `PropuestaMultaVigencia` cuenta salvo `desestimada`: es el único estado
   *   terminal sin sanción (schema.prisma:700-701; la fila aplicada sí crea la
   *   infracción, :710-711), el monto y el ancla legal quedaron congelados en la
   *   propia fila (:695-697) y el único lector de `tipoInfraccionId` es la
   *   aplicación, que corta antes si `estado !== "propuesta"`
   *   (vigencia-registro/multa/[id]/aplicar/route.ts:140-144). Ninguna ruta GET
   *   sirve propuestas, así que la referencia no tiene lector.
   * La exclusión se escribe por negación a propósito: un estado nuevo sigue
   * bloqueando en vez de caer en un allow-list que lo dejaría pasar.
   */
  beforeDelete: async (record, scope) => {
    const id = (record as { id: string }).id
    const [infracciones, propuestas] = await Promise.all([
      prisma.infraccionIN.count({
        where: { comunidadId: scope.comunidadId, tipoInfraccionId: id },
      }),
      prisma.propuestaMultaVigencia.count({
        where: {
          comunidadId: scope.comunidadId,
          tipoInfraccionId: id,
          estado: { not: "desestimada" },
        },
      }),
    ])
    if (infracciones > 0) {
      return jsonError(
        409,
        `No se puede eliminar el tipo de infracción: tiene ${infracciones} infracción(es) asociada(s).`
      )
    }
    if (propuestas > 0) {
      return jsonError(
        409,
        `No se puede eliminar el tipo de infracción: tiene ${propuestas} propuesta(s) de multa asociada(s).`
      )
    }
    return null
  },
})

export const GET = handlers.GET_ONE
export const PUT = createPutMerge({
  model: modelo,
  schema: TipoInfraccionINSchema,
  authzCheck,
  recurso: "in/tipos",
})
export const DELETE = handlers.DELETE
