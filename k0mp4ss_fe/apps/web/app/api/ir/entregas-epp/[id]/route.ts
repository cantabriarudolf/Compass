/**
 * /api/ir/entregas-epp/[id] — detalle/actualización parcial/baja.
 *
 * GET_ONE y DELETE vía factory. PUT parcial vía put-merge sobre
 * "ir:mantenimiento".
 *
 * Alcance por filas (`alcanceEntregasEPP`): la entrega hecha a otra persona
 * responde 404 y no se carga; gestión conserva la comunidad entera. El MISMO
 * helper se pasa al PUT de `put-merge` —no un segundo filtro— porque conserjería
 * y mantención tienen `ir:mantenimiento` editar y `personaId` en el seed
 * (`scripts/seed-authz.mjs`): sin él podían escribir la entrega de otra persona
 * aunque ya no podían leerla.
 */
import { EntregaEPPSchema } from "@/lib/schemas"
import { puede } from "@/lib/authz"
import { prisma } from "@/lib/prisma"
import { createCrudHandlers, delegado } from "@/lib/api/crud-factory"
import { createPutMerge } from "@/lib/api/put-merge"
import { alcanceEntregasEPP } from "../_alcance"

const modelo = delegado(prisma.entregaEPP)
const authzCheck = (rol: string, accion: "ver" | "crear" | "editar" | "eliminar" | "ejecutar") =>
  puede(rol, accion, "ir:mantenimiento")

const handlers = createCrudHandlers({
  model: modelo,
  schema: EntregaEPPSchema,
  authzCheck,
  alcance: alcanceEntregasEPP,
})

export const GET = handlers.GET_ONE
export const PUT = createPutMerge({
  model: modelo,
  schema: EntregaEPPSchema,
  authzCheck,
  recurso: "ir/entregas-epp",
  alcance: alcanceEntregasEPP,
})
export const DELETE = handlers.DELETE
