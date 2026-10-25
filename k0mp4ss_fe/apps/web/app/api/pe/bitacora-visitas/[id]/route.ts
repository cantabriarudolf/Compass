/**
 * /api/pe/bitacora-visitas/[id] — detalle/actualización parcial/baja.
 *
 * GET_ONE y DELETE vía factory. PUT parcial vía put-merge (fusión + validación
 * completa) sobre el recurso "pe".
 *
 * Auditoría (T1c): el PUT conserva el evento `PE_VISITA_INGRESADA` del store
 * legacy vía el hook post-escritura de put-merge, SOLO si la fila pasa a
 * `ingresada` y el `previo` no estaba ya ingresada (un PUT repetido no
 * duplica el evento). DELETE no emite evento, pero está **protegido**: una
 * visita ya ingresada no se borra (F15).
 */
import { BitacoraVisitaPESchema } from "@/lib/schemas"
import { puede } from "@/lib/authz"
import { prisma } from "@/lib/prisma"
import { jsonError } from "@/lib/api/with-comunidad-scope"
import { createCrudHandlers, delegado } from "@/lib/api/crud-factory"
import { createPutMerge } from "@/lib/api/put-merge"
import { registrarEventoPE } from "@/app/api/pe/_acciones"

const modelo = delegado(prisma.bitacoraVisitaPE)
const authzCheck = (rol: string, accion: "ver" | "crear" | "editar" | "eliminar" | "ejecutar") =>
  puede(rol, accion, "pe")

/**
 * Baja protegida (F15): la bitácora es un registro y no se limpia. Una visita ya
 * ingresada no se borra — el chequeo vive en el servidor para que valga por
 * cualquier camino (panel, curl o script), no solo por la UI. Mismo mensaje que
 * daba la acción del store antes de migrar los paneles.
 */
const handlers = createCrudHandlers({
  model: modelo,
  schema: BitacoraVisitaPESchema,
  authzCheck,
  beforeDelete: (record) => {
    const fila = record as { estado?: string }
    if (fila.estado === "ingresada") {
      return jsonError(409, "No se puede eliminar una visita ya ingresada (registro auditable).")
    }
    return null
  },
})

export const GET = handlers.GET_ONE
export const PUT = createPutMerge({
  model: modelo,
  schema: BitacoraVisitaPESchema,
  authzCheck,
  recurso: "pe/bitacora-visitas",
  despuesDeEscribir: async ({ registro, previo, scope }) => {
    const fila = registro as {
      id: string
      nombre: string
      origenAgenda: string
      estado: string
      horaIngreso?: string | null
    }
    if (fila.estado !== "ingresada") return
    const previa = previo as { estado: string } | null
    if (previa?.estado === "ingresada") return
    const hora = fila.horaIngreso ?? new Date().toTimeString().slice(0, 5)
    await registrarEventoPE(
      scope,
      "PE_VISITA_INGRESADA",
      fila.id,
      `Visita ${fila.nombre} ingresada (${fila.origenAgenda === "pre_agendada" ? "agendada" : "sin aviso"}) a las ${hora}.`
    )
  },
})
export const DELETE = handlers.DELETE
