/**
 * /api/publicaciones-portal — colección de publicaciones PI (SERIE-GATED-API-BD P2).
 *
 * GET paginado vía factory (lectura abierta a cualquier rol autenticado del
 * scope: la vitrina es visible a residentes). POST upsert idempotente.
 * Authz escritura: solo administración (`puede(rol, accion, "pi")`).
 * DELETE bloqueado con 409 si la publicación tiene leads (paridad con el
 * guard legacy de `removePublicacionPortal` en el store).
 */
import { PublicacionPortalSchema } from "@/lib/schemas"
import { puede } from "@/lib/authz"
import { prisma } from "@/lib/prisma"
import { createCrudHandlers } from "@/lib/api/crud-factory"
import { jsonError } from "@/lib/api/with-comunidad-scope"

function delegado(modelo: unknown) {
  return modelo as import("@/lib/api/crud-factory").CrudDelegate
}

export const publicacionesHandlers = createCrudHandlers({
  model: delegado(prisma.publicacionPortal),
  schema: PublicacionPortalSchema,
  authzCheck: (rol, accion) =>
    accion === "ver" ? true : puede(rol, accion, "pi"),
  beforeDelete: async (record) => {
    const pub = record as { id?: string }
    if (!pub?.id) return null
    const asociados = await prisma.leadPortal.count({
      where: { publicacionId: pub.id },
    })
    if (asociados > 0) {
      return jsonError(
        409,
        `No se puede eliminar la publicación: tiene ${asociados} lead(s) asociado(s).`
      )
    }
    return null
  },
})

export const GET = publicacionesHandlers.GET
export const POST = publicacionesHandlers.POST
