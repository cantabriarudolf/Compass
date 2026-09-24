/**
 * /api/tipos-unidad — colección de tipos de unidad EF (BD-FUENTE-VERDAD Fase 3).
 *
 * CRUD vía factory con authz "mp" (precedente de maestros: la estructura
 * física sostiene a MP/VU). Baja bloqueada si hay unidades vinculadas (409).
 */
import { TipoUnidadSchema } from "@/lib/schemas"
import { puede } from "@/lib/authz"
import { prisma } from "@/lib/prisma"
import { createCrudHandlers, type CrudDelegate } from "@/lib/api/crud-factory"
import { jsonError } from "@/lib/api/with-comunidad-scope"

// Adaptador de delegate Prisma a la factory (mismo patrón que maestros/[tipo]).
function delegado(modelo: unknown): CrudDelegate {
  return modelo as CrudDelegate
}

export const tiposHandlers = createCrudHandlers({
  model: delegado(prisma.tipoUnidad),
  schema: TipoUnidadSchema,
  authzCheck: (rol, accion) => puede(rol, accion, "mp"),
  beforeDelete: async (record, scope) => {
    const vinculadas = await prisma.unidad.count({
      where: {
        comunidadId: scope.comunidadId,
        tipoUnidadId: (record as { id: string }).id,
      },
    })
    if (vinculadas > 0) {
      return jsonError(
        409,
        `No se puede eliminar el tipo de unidad: ${vinculadas} unidad(es) vinculada(s).`
      )
    }
    return null
  },
})

export const GET = tiposHandlers.GET
export const POST = tiposHandlers.POST
