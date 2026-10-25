/**
 * /api/pe/bitacora-visitas/[id] — detalle/actualización parcial/baja.
 *
 * GET_ONE y DELETE vía factory. PUT parcial vía put-merge (fusión + validación
 * completa) sobre el recurso "pe".
 *
 * Auditoría (T1c): el PUT conserva el evento `PE_VISITA_INGRESADA` del store
 * legacy vía el hook post-escritura de put-merge, SOLO si la fila pasa a
 * `ingresada` y el `previo` no estaba ya ingresada (un PUT repetido no
 * duplica el evento). DELETE no emite: el store tampoco emitía al eliminar.
 */
import { BitacoraVisitaPESchema } from "@/lib/schemas"
import { puede } from "@/lib/authz"
import { prisma } from "@/lib/prisma"
import { createCrudHandlers, delegado } from "@/lib/api/crud-factory"
import { createPutMerge } from "@/lib/api/put-merge"
import { registrarEventoPE } from "@/app/api/pe/_acciones"

const modelo = delegado(prisma.bitacoraVisitaPE)
const authzCheck = (rol: string, accion: "ver" | "crear" | "editar" | "eliminar" | "ejecutar") =>
  puede(rol, accion, "pe")

const handlers = createCrudHandlers({
  model: modelo,
  schema: BitacoraVisitaPESchema,
  authzCheck,
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
