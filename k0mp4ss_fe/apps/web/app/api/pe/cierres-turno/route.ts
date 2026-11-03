/**
 * /api/pe/cierres-turno — cierres de turno PE (Fase 4).
 *
 * GET paginado vía factory. POST upsert idempotente por id. Authz sobre el
 * recurso granular `pe:cierre_turno` (decisión owner 2026-11-05), el MISMO que ya
 * usa el `[id]`: iniciar/cerrar turno es de conserjería, el comité audita el panel
 * y mantención no entra (su `pe` de tareas ya no se hereda por prefijo). Hasta
 * ahora la colección pedía la raíz desnuda `pe` y por eso el par estaba partido:
 * mantención leía y creaba cierres por acá aunque el `[id]` le devolviera 403.
 *
 * INV-02 (docs/INVARIANTES.md): un trabajador cierra UN turno por fecha y
 * jornada. La regla vivía sólo en la pantalla de bitácora; ahora el servidor la
 * impone con la misma identidad que usa MP (ficha con RUT), no con el nombre.
 */
import { CierreTurnoPESchema } from "@/lib/schemas"
import { puede } from "@/lib/authz"
import { prisma } from "@/lib/prisma"
import { createCrudHandlers, delegado } from "@/lib/api/crud-factory"
import { guardiaCierreUnico } from "@/lib/invariantes/pe"

const handlers = createCrudHandlers({
  model: delegado(prisma.cierreTurnoPE),
  schema: CierreTurnoPESchema,
  authzCheck: (rol, accion) => puede(rol, accion, "pe:cierre_turno"),
  // INV-02: misma guardia en POST (crear) y en el PUT parcial de [id].
  antesDeEscribir: guardiaCierreUnico,
})

export const GET = handlers.GET
export const POST = handlers.POST
