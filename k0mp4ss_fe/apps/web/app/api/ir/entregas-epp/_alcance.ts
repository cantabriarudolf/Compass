/**
 * Alcance por filas de `ir/entregas-epp` — el dueño de la entrega es
 * `EntregaEPP.personaId` (a quién se le entregó el equipo).
 *
 * La matriz (`ir:mantenimiento` ver) decide quién ENTRA a la ruta; este módulo
 * decide qué FILAS ve. La decisión de rol/identidad NO se reimplementa acá: sale
 * de `alcancePorFilasDeSesion` (`lib/api/sesion-persona.ts`), que distingue
 * gestión (sin restricción por fila), rol acotado con identidad («lo propio») y
 * rol acotado SIN identidad (falla cerrado: ninguna fila). La persona sale de la
 * BD de la sesión, nunca del body/query.
 *
 * La entrega ajena responde 404 «Registro no encontrado.» y no 403: el 403
 * confirmaría que la fila existe (mismo criterio que certificados, liquidaciones
 * y notificaciones).
 */
import type { Prisma } from "@prisma/client"
import { alcancePorFilasDeSesion } from "@/lib/api/sesion-persona"
import type { ComunidadScope } from "@/lib/api/with-comunidad-scope"

/**
 * Fragmento de «lo propio», o `null` si el actor ve la comunidad completa.
 *
 * Un rol acotado sin `personaId` no tiene «lo propio» que comparar, así que el
 * fragmento no matchea NADA (`{ id: { in: [] } }`, el patrón de
 * `alcanceCertificadosCT`): la colección responde `total: 0` y el detalle/PUT el
 * 404 genérico. Antes este caso devolvía `null` y el fail-open le abría a esa
 * sesión todas las entregas de la comunidad.
 */
export async function alcanceEntregasEPP(
  scope: ComunidadScope
): Promise<Prisma.EntregaEPPWhereInput | null> {
  const alcance = await alcancePorFilasDeSesion(scope)
  if (alcance.tipo === "comunidad") return null
  if (alcance.tipo === "denegado") return { id: { in: [] } }
  return { personaId: alcance.personaId }
}
