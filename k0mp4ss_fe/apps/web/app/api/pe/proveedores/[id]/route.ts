/**
 * /api/pe/proveedores/[id] — detalle/actualización parcial/baja.
 *
 * GET_ONE y DELETE vía factory. PUT parcial vía put-merge sobre "pe:proveedor": el mismo
 * recurso de la colección, para que el par no se separe (la inconsistencia de
 * `cierres-turno` nació de flipear un solo archivo del par).
 */
import { ProveedorPESchema } from "@/lib/schemas"
import { puede } from "@/lib/authz"
import { prisma } from "@/lib/prisma"
import { createCrudHandlers, delegado } from "@/lib/api/crud-factory"
import { createPutMerge } from "@/lib/api/put-merge"
import { jsonError } from "@/lib/api/with-comunidad-scope"

const modelo = delegado(prisma.proveedorPE)
const authzCheck = (rol: string, accion: "ver" | "crear" | "editar" | "eliminar" | "ejecutar") =>
  puede(rol, accion, "pe:proveedor")

const handlers = createCrudHandlers({
  model: modelo,
  schema: ProveedorPESchema,
  authzCheck,
  /**
   * Guarda de baja (T6/S3): `MantencionPreventivaPE.proveedorId` y
   * `VisitaTecnicaPE.proveedorId` son texto sin FK (schema.prisma:2138 y :2156),
   * así que el DELETE dejaría huérfanas las dos filas.
   *
   * Cuenta TODO: `MantencionPreventivaPE.activo` (schema.prisma:2143) no anula el
   * registro —el panel la sigue listando con su badge «Inactiva»
   * (panel-mantenciones.tsx:407-408)— y `VisitaTecnicaPE` no tiene estado
   * (schema.prisma:2152-2160). No hay estado irrelevante que excluir.
   */
  beforeDelete: async (record, scope) => {
    const id = (record as { id: string }).id
    const [mantenciones, visitas] = await Promise.all([
      prisma.mantencionPreventivaPE.count({
        where: { comunidadId: scope.comunidadId, proveedorId: id },
      }),
      prisma.visitaTecnicaPE.count({
        where: { comunidadId: scope.comunidadId, proveedorId: id },
      }),
    ])
    if (mantenciones > 0) {
      return jsonError(
        409,
        `No se puede eliminar el proveedor: tiene ${mantenciones} mantención(es) preventiva(s) asociada(s).`
      )
    }
    if (visitas > 0) {
      return jsonError(
        409,
        `No se puede eliminar el proveedor: tiene ${visitas} visita(s) técnica(s) asociada(s).`
      )
    }
    return null
  },
})

export const GET = handlers.GET_ONE
export const PUT = createPutMerge({
  model: modelo,
  schema: ProveedorPESchema,
  authzCheck,
  recurso: "pe/proveedores",
})
export const DELETE = handlers.DELETE
