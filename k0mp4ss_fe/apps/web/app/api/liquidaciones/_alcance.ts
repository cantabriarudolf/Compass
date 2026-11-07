/**
 * Alcance de lectura de liquidaciones PL — UNA definición para la colección, el
 * detalle y el PDF (T6 + T10 de la serie «Permisos por objeto»).
 *
 * La matriz decide quién ENTRA y, con su clave, quién ve la comunidad completa:
 *
 *   - `pl` ver → gestión (administración): todas las liquidaciones de la
 *     comunidad, sin restricción por fila;
 *   - `pl:propia` ver → trabajador (hoy conserjería): SOLO las filas cuyo
 *     `trabajadorPersonaId` es SU persona, resuelta en el servidor con
 *     `personaIdDelUsuarioDb`. El cliente nunca aporta su identidad, ni en query
 *     ni en body.
 *
 * La decisión de rol/identidad NO se reimplementa acá: sale de `puede`
 * (`lib/authz`) y de la identidad MP del usuario de sesión. Lo único propio de
 * este recurso es el `where`, y vive en este archivo justamente para que la
 * colección, el detalle y el PDF no puedan divergir: un `where` copiado en cada
 * ruta es la segunda copia que un día deja bajar el sueldo del vecino por el
 * camino que nadie actualizó.
 *
 * Con `personaId` null la sesión no es dueña de ninguna fila y el `where` es
 * `null`, NUNCA un `where` sin `trabajadorPersonaId`: en Prisma el campo ausente
 * es «sin filtro», que es el fail-open que este archivo cierra. La fila ajena
 * responde el 404 genérico («Registro no encontrado.»), nunca 403: el 403
 * confirmaría que la liquidación existe.
 */
import type { Prisma } from "@prisma/client"
import { puede } from "@/lib/authz"
import { personaIdDelUsuarioDb } from "@/lib/api/sesion-persona"
import { jsonError, type ComunidadScope } from "@/lib/api/with-comunidad-scope"

/** Clave de la gestión: ve las liquidaciones de toda la comunidad. */
export const RECURSO_LIQUIDACION = "pl"

/** Clave del trabajador: ve su propia liquidación y solo la suya. */
export const RECURSO_LIQUIDACION_PROPIA = "pl:propia"

/**
 * Alcance de lectura resuelto:
 *
 * - `comunidad`: el rol tiene `pl` ver (administración) → todas las filas de la
 *   comunidad, con el comportamiento de siempre.
 * - `propia`: el rol tiene `pl:propia` ver (trabajador) → solo las filas cuyo
 *   `trabajadorPersonaId` es su persona; con `personaId` null no es dueño de
 *   ninguna y NO se ensancha a la comunidad.
 * - `ok: false`: no tiene ninguna de las dos claves → 403.
 */
export type AlcanceLiquidaciones =
  | { ok: true; tipo: "comunidad" }
  | { ok: true; tipo: "propia"; personaId: string | null }
  | { ok: false; response: Response }

/** Alcance ya resuelto, sin la rama del 403: es lo que reciben los `where`. */
export type AlcanceConFilas = Extract<AlcanceLiquidaciones, { ok: true }>

/**
 * Resuelve el alcance de lectura con las claves de la matriz.
 *
 * La identidad del trabajador sale de la BD (`personaIdDelUsuarioDb`, el mismo
 * helper de notificaciones y buzón): el `usuarioId` es del scope de comunidad,
 * resuelto desde la membresía, jamás del cliente.
 */
export async function alcanceDeLectura(
  scope: ComunidadScope
): Promise<AlcanceLiquidaciones> {
  if (puede(scope.rol, "ver", RECURSO_LIQUIDACION)) {
    return { ok: true, tipo: "comunidad" }
  }
  if (!puede(scope.rol, "ver", RECURSO_LIQUIDACION_PROPIA)) {
    return { ok: false, response: jsonError(403, "Permiso denegado.") }
  }
  return {
    ok: true,
    tipo: "propia",
    personaId: await personaIdDelUsuarioDb(scope.usuarioId),
  }
}

/**
 * `where` de «lo propio»: la comunidad + la persona de la sesión.
 *
 * `null` cuando la sesión acotada no tiene identidad MP: no hay fila propia que
 * consultar, y quien llama responde el vacío (colección) o el 404 (detalle y
 * PDF) en vez de consultar sin el filtro de persona.
 */
export function wherePropio(
  personaId: string | null,
  comunidadId: string
): Prisma.LiquidacionPLWhereInput | null {
  if (personaId === null) return null
  return { comunidadId, trabajadorPersonaId: personaId }
}

/**
 * `where` de UNA fila con el alcance de la sesión aplicado.
 *
 * `null` → no hay fila posible (identidad MP ausente): el llamador responde el
 * 404 genérico sin tocar la base. La gestión conserva su camino de siempre (la
 * factory resuelve `findUnique` + comunidad); el trabajador consulta con
 * `findFirst` porque su alcance no es una clave única.
 */
export function whereDeLiquidacion(
  alcance: AlcanceConFilas,
  comunidadId: string,
  id: string
): Prisma.LiquidacionPLWhereInput | null {
  if (alcance.tipo === "comunidad") return { id, comunidadId }
  const propio = wherePropio(alcance.personaId, comunidadId)
  return propio === null ? null : { id, ...propio }
}
