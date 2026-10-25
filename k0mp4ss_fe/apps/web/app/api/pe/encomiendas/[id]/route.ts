/**
 * /api/pe/encomiendas/[id] — detalle/actualización parcial/baja.
 *
 * GET_ONE y DELETE vía factory. PUT parcial vía put-merge sobre "pe".
 *
 * Auditoría (T1c): el PUT conserva el evento `PE_ENCOMIENDA_RETIRADA` del
 * store legacy vía el hook post-escritura de put-merge, SOLO si la fila pasa
 * a `retirada`, el `previo` no estaba ya retirada (un PUT repetido no
 * duplica) y la fila escrita trae `retiro.retiradoPor` (sin retiro no hay
 * a quién entregar, no se emite). DELETE no emite evento, pero está
 * **protegido**: una encomienda ya retirada no se borra (F15).
 */
import { EncomiendaPESchema } from "@/lib/schemas"
import { puede } from "@/lib/authz"
import { prisma } from "@/lib/prisma"
import { jsonError } from "@/lib/api/with-comunidad-scope"
import { createCrudHandlers, delegado } from "@/lib/api/crud-factory"
import { createPutMerge } from "@/lib/api/put-merge"
import { registrarEventoPE } from "@/app/api/pe/_acciones"

const modelo = delegado(prisma.encomiendaPE)
const authzCheck = (rol: string, accion: "ver" | "crear" | "editar" | "eliminar" | "ejecutar") =>
  puede(rol, accion, "pe")

/**
 * Baja protegida (F15): una encomienda ya retirada tiene retiro registrado y no se
 * borra. El chequeo vive en el servidor para que valga por cualquier camino, no
 * solo por la UI del panel.
 */
const handlers = createCrudHandlers({
  model: modelo,
  schema: EncomiendaPESchema,
  authzCheck,
  beforeDelete: (record) => {
    const fila = record as { estado?: string }
    if (fila.estado === "retirada") {
      return jsonError(409, "No se puede eliminar una encomienda retirada (registro auditable).")
    }
    return null
  },
})

export const GET = handlers.GET_ONE
export const PUT = createPutMerge({
  model: modelo,
  schema: EncomiendaPESchema,
  authzCheck,
  recurso: "pe/encomiendas",
  despuesDeEscribir: async ({ registro, previo, scope }) => {
    const fila = registro as {
      id: string
      estado: string
      retiro?: { retiradoPor: string } | null
    }
    if (fila.estado !== "retirada") return
    const previa = previo as { estado: string } | null
    if (previa?.estado === "retirada") return
    const retiradoPor = fila.retiro?.retiradoPor
    if (!retiradoPor) return
    await registrarEventoPE(
      scope,
      "PE_ENCOMIENDA_RETIRADA",
      fila.id,
      `Encomienda entregada a ${retiradoPor}.`
    )
  },
})
export const DELETE = handlers.DELETE
