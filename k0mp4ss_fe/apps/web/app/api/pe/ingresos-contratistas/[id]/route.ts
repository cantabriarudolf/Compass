/**
 * /api/pe/ingresos-contratistas/[id] — detalle/actualización parcial/baja.
 *
 * GET_ONE y DELETE vía factory. PUT parcial vía put-merge sobre "pe".
 *
 * Auditoría (T1c): el PUT conserva el evento `PE_CONTRATISTA_INGRESADO` del
 * store legacy vía el hook post-escritura de put-merge, SOLO si la fila pasa
 * a `ingresado` y el `previo` no estaba ya ingresado (un PUT repetido no
 * duplica). DELETE no emite evento, pero está **protegido**: un contratista ya
 * ingresado no se borra (F15).
 */
import { IngresoContratistaPESchema } from "@/lib/schemas"
import { puede } from "@/lib/authz"
import { prisma } from "@/lib/prisma"
import { jsonError } from "@/lib/api/with-comunidad-scope"
import { createCrudHandlers, delegado } from "@/lib/api/crud-factory"
import { createPutMerge } from "@/lib/api/put-merge"
import { registrarEventoPE } from "@/app/api/pe/_acciones"

const modelo = delegado(prisma.ingresoContratistaPE)
const authzCheck = (rol: string, accion: "ver" | "crear" | "editar" | "eliminar" | "ejecutar") =>
  puede(rol, accion, "pe")

/**
 * Baja protegida (F15): un ingreso ya sellado no se borra. El chequeo vive en el
 * servidor para que valga por cualquier camino, no solo por la UI del panel.
 */
const handlers = createCrudHandlers({
  model: modelo,
  schema: IngresoContratistaPESchema,
  authzCheck,
  beforeDelete: (record) => {
    const fila = record as { estado?: string }
    if (fila.estado === "ingresado") {
      return jsonError(409, "No se puede eliminar un contratista ya ingresado (registro auditable).")
    }
    return null
  },
})

export const GET = handlers.GET_ONE
export const PUT = createPutMerge({
  model: modelo,
  schema: IngresoContratistaPESchema,
  authzCheck,
  recurso: "pe/ingresos-contratistas",
  despuesDeEscribir: async ({ registro, previo, scope }) => {
    const fila = registro as {
      id: string
      estado: string
      contratistaId: string
      motivo: string
    }
    if (fila.estado !== "ingresado") return
    const previa = previo as { estado: string } | null
    if (previa?.estado === "ingresado") return
    const contratista = await prisma.contratista.findUnique({
      where: { id: fila.contratistaId },
    })
    const nombreContratista = contratista?.nombre ?? fila.contratistaId
    // Sin `.slice`: el motivo va completo al evento. El candado de patrones tardíos lee los
    // recortes de listas, y este era un recorte cosmético heredado del store, no un truncamiento
    // de pantalla.
    await registrarEventoPE(
      scope,
      "PE_CONTRATISTA_INGRESADO",
      fila.id,
      `Contratista ${nombreContratista} ingresó (${fila.motivo}).`
    )
  },
})
export const DELETE = handlers.DELETE
