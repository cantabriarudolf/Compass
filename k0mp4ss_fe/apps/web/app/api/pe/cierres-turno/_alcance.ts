/**
 * Alcance por filas de `pe/cierres-turno` — el dueño del cierre es
 * `CierreTurnoPE.trabajadorPersonaId`: la ficha del trabajador que cerró el turno.
 *
 * La matriz (`pe:cierre_turno` ver) decide quién ENTRA a la ruta; este módulo
 * decide qué FILAS ve y escribe. La decisión de rol/identidad NO se reimplementa
 * acá: sale de `alcancePorFilasDeSesion` (`lib/api/sesion-persona.ts`), que
 * distingue gestión (sin restricción por fila), rol acotado con identidad («lo
 * propio») y rol acotado SIN identidad (falla cerrado: ninguna fila). La persona
 * sale de la BD de la sesión, nunca del body/query.
 *
 * El cierre del otro trabajador responde 404 «Registro no encontrado.» y no 403:
 * el 403 confirmaría que la fila existe (mismo criterio que entregas de EPP,
 * certificados, liquidaciones y notificaciones). Con el seed real
 * (`scripts/seed-authz.mjs:55,57`) la conserjería y la mantención llevan
 * `personaId`, así que sin este alcance el portón leía, editaba y LISTABA el
 * cierre ajeno: lo declaran el detalle/PUT (`[id]/route.ts`) y la colección
 * (`route.ts`), los dos con este helper.
 *
 * El MISMO helper se pasa a la factory y al put-merge: dos filtros distintos para
 * la misma pertenencia es cómo se abre un PUT que la lectura ya cerraba.
 *
 * ESCRITURA (T17): el alcance no puede validar un alta —la fila todavía no existe— y
 * el POST de la factory es un upsert, así que un rol acotado podía crear un cierre a
 * nombre de OTRO trabajador (y, por el PUT parcial, regalar el propio). Por eso el
 * recurso declara además `rechazoDeCierreTurnoAjeno`, con la forma de
 * `rechazoDeSolicitudAjena` sobre el helper compartido
 * `lib/api/propiedad-de-alta.ts`: la conserjería (identidad P_A1 en la sesión) sigue
 * cerrando SU turno y la gestión sigue cerrando el de cualquiera.
 */
import type { Prisma } from "@prisma/client"
import { alcancePorFilasDeSesion } from "@/lib/api/sesion-persona"
import { rechazoDeAltaAjena } from "@/lib/api/propiedad-de-alta"
import type { ComunidadScope } from "@/lib/api/with-comunidad-scope"

/**
 * Fragmento de «lo propio», o `null` si el actor ve la comunidad completa.
 *
 * Un rol acotado sin `personaId` no tiene «lo propio» que comparar, así que el
 * fragmento no matchea NADA (`{ id: { in: [] } }`): la colección responde
 * `total: 0` y el detalle/PUT el 404 genérico. Devolver `null` en ese caso le
 * abriría al rol acotado la comunidad entera (fail-open).
 */
export async function alcanceCierresTurnoPE(
  scope: ComunidadScope
): Promise<Prisma.CierreTurnoPEWhereInput | null> {
  const alcance = await alcancePorFilasDeSesion(scope)
  if (alcance.tipo === "comunidad") return null
  if (alcance.tipo === "denegado") return { id: { in: [] } }
  return { trabajadorPersonaId: alcance.personaId }
}

/**
 * Guardia previa a la escritura del cierre: el rol acotado solo cierra turnos de SU
 * persona; la gestión cierra el de cualquiera.
 *
 * Corre en el POST (alta) y en el PUT parcial (mover el cierre a otro trabajador). El
 * dueño efectivo se calcula fusionando la fila previa con el payload —en el PUT parcial
 * el parche puede no traer `trabajadorPersonaId`, y en el POST `previo` es `null`—, así
 * que la guardia no depende de que el cliente repita el campo. Responde el 404 genérico
 * y no 403: el 403 confirmaría que la ficha reclamada existe.
 */
export function rechazoDeCierreTurnoAjeno({
  datos,
  previo,
  scope,
}: {
  datos: Record<string, unknown>
  previo: Record<string, unknown> | null
  scope: ComunidadScope
}): Promise<Response | null> {
  const efectivo = { ...(previo ?? {}), ...datos }
  return rechazoDeAltaAjena({
    scope,
    pretension: { personaId: efectivo.trabajadorPersonaId },
  })
}
