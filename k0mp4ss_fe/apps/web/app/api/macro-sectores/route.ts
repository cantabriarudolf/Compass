/**
 * /api/macro-sectores — colección de macro sectores EF (BD-FUENTE-VERDAD Fase 3).
 *
 * CRUD vía factory con authz "mp". Baja bloqueada con sub-sectores (409).
 */
import { MacroSectorSchema } from "@/lib/schemas"
import { puede } from "@/lib/authz"
import { prisma } from "@/lib/prisma"
import { createCrudHandlers, type CrudDelegate } from "@/lib/api/crud-factory"
import { jsonError } from "@/lib/api/with-comunidad-scope"

// Adaptador de delegate Prisma a la factory (mismo patrón que maestros/[tipo]).
function delegado(modelo: unknown): CrudDelegate {
  return modelo as CrudDelegate
}

export const macroHandlers = createCrudHandlers({
  model: delegado(prisma.macroSector),
  schema: MacroSectorSchema,
  authzCheck: (rol, accion) => puede(rol, accion, "mp"),
  beforeDelete: async (record, scope) => {
    const asociados = await prisma.microSector.count({
      where: {
        comunidadId: scope.comunidadId,
        macroSectorId: (record as { id: string }).id,
      },
    })
    if (asociados > 0) {
      return jsonError(
        409,
        `No se puede eliminar el macro sector: ${asociados} sub-sector(es) asociado(s).`
      )
    }
    return null
  },
})

export const GET = macroHandlers.GET
export const POST = macroHandlers.POST
