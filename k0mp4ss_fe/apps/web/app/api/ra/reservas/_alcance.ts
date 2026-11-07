/**
 * Alcance por filas de `ra/reservas` — el dueño de la reserva es
 * `ReservaRA.solicitantePersonaId`: la persona que la pidió.
 *
 * La matriz (`ra` ver) decide quién ENTRA a la ruta; este módulo decide qué
 * FILAS ve. La decisión de rol/identidad NO se reimplementa acá: sale de
 * `alcancePorFilasDeSesion` (`lib/api/sesion-persona.ts`), que distingue gestión
 * (sin restricción por fila), rol acotado con identidad («lo propio») y rol
 * acotado SIN identidad (falla cerrado: ninguna fila). La persona sale de la BD
 * de la sesión, nunca del body/query.
 *
 * Por qué la persona y no `unidadId`: la reserva se pide a nombre de quien
 * reserva, y `unidadId` es opcional en el modelo (una persona puede reservar sin
 * unidad). Acotar por unidad le abriría a cualquier miembro de la unidad las
 * reservas de los demás: la persona es el alcance más chico que conserva la
 * regla del dueño.
 *
 * La reserva ajena responde 404 «Registro no encontrado.» y no 403: el 403
 * confirmaría que la fila existe. La COLECCIÓN queda sin este alcance a
 * propósito: es el calendario de amenities que el residente necesita para ver
 * los tramos ocupados (`app/operaciones/reservas/page.tsx`) y de donde el
 * cliente deriva el folio siguiente; el dato de tercero del detalle —folio,
 * montos, cancelación, garantía— no viaja por ahí.
 */
import type { Prisma } from "@prisma/client"
import { alcancePorFilasDeSesion } from "@/lib/api/sesion-persona"
import type { ComunidadScope } from "@/lib/api/with-comunidad-scope"

/**
 * Fragmento de «lo propio», o `null` si el actor ve la comunidad completa.
 *
 * Un rol acotado sin `personaId` no tiene «lo propio» que comparar, así que el
 * fragmento no matchea NADA (`{ id: { in: [] } }`): el detalle y el PUT
 * responden el 404 genérico en vez de abrirse la comunidad entera (fail-open).
 */
export async function alcanceReservasRA(
  scope: ComunidadScope
): Promise<Prisma.ReservaRAWhereInput | null> {
  const alcance = await alcancePorFilasDeSesion(scope)
  if (alcance.tipo === "comunidad") return null
  if (alcance.tipo === "denegado") return { id: { in: [] } }
  return { solicitantePersonaId: alcance.personaId }
}
