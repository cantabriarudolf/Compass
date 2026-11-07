/**
 * Alcance por filas de `ir/solicitudes-insumo` — el dueño de la solicitud es
 * `SolicitudInsumoIR.solicitantePersonaId`. El modelo NO tiene `unidadId`
 * (`prisma/schema.prisma`), así que la unidad no sirve como campo de pertenencia:
 * quien pide el insumo es la persona.
 *
 * La matriz (`ir:mantenimiento` ver) decide quién ENTRA; este módulo decide qué
 * FILAS ve. La decisión de rol/identidad sale de `alcancePorFilasDeSesion`
 * (`lib/api/sesion-persona.ts`), una sola definición para los tres recursos con
 * dueño por fila; la persona de la sesión se resuelve en BD, nunca desde el
 * body/query.
 *
 * La solicitud ajena responde 404 «Registro no encontrado.» y no 403: el 403
 * confirmaría que existe.
 */
import type { Prisma } from "@prisma/client"
import { alcancePorFilasDeSesion } from "@/lib/api/sesion-persona"
import type { ComunidadScope } from "@/lib/api/with-comunidad-scope"

/**
 * Fragmento de «lo propio», o `null` si el actor ve la comunidad completa.
 *
 * Un rol acotado sin `personaId` no tiene «lo propio» que comparar: el fragmento
 * no matchea nada (`{ id: { in: [] } }`), en vez del `null` que antes le abría
 * todas las solicitudes de la comunidad.
 */
export async function alcanceSolicitudesInsumoIR(
  scope: ComunidadScope
): Promise<Prisma.SolicitudInsumoIRWhereInput | null> {
  const alcance = await alcancePorFilasDeSesion(scope)
  if (alcance.tipo === "comunidad") return null
  if (alcance.tipo === "denegado") return { id: { in: [] } }
  return { solicitantePersonaId: alcance.personaId }
}
