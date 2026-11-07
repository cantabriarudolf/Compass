/**
 * Alcance por filas de `fi/avisos-cobro` — el dueño de la fila es la UNIDAD
 * (`AvisoCobro.unidadId`), no la persona que la lee.
 *
 * La matriz decide quién ENTRA a la ruta y, con `fi:gasto_comun` ver, quién ve la
 * comunidad completa (administración y comité). F27 agrega la lectura del
 * RESIDENTE con `fi:aviso:propio` ver: puede leer el aviso de las unidades donde
 * tiene un vínculo VIGENTE (`unidadesVinculadasDb`, `fechaFin: null`), resuelto
 * desde la sesión y nunca desde el body/query.
 *
 * La decisión de rol/identidad NO se reimplementa acá: sale de
 * `alcancePorFilasDeSesion` (`lib/api/sesion-persona.ts`), que distingue gestión
 * (sin restricción por fila), rol acotado con identidad («lo propio») y rol
 * acotado SIN identidad (falla cerrado: ninguna fila). La composición con las
 * unidades es lo único propio de este recurso.
 *
 * Por qué importa el filtro en la MISMA unidad que abre la lectura: hasta T7 el
 * detalle solo aceptaba `fi:gasto_comun`, una clave que el residente no tiene.
 * Abrir el `ver` sin el `where` habría dejado leer la deuda de la unidad vecina
 * cambiando el id. La fila ajena responde el 404 genérico («Registro no
 * encontrado.»), nunca 403: el 403 confirmaría que el aviso existe.
 */
import type { Prisma } from "@prisma/client"
import { puede } from "@/lib/authz"
import {
  alcancePorFilasDeSesion,
  unidadesVinculadasDb,
} from "@/lib/api/sesion-persona"
import type { ComunidadScope } from "@/lib/api/with-comunidad-scope"

/**
 * El aviso es parte del gasto común: emitirlo, entregarlo y auditarlo. `ver` de
 * esta clave es la lectura de la gestión (administración y comité).
 */
export const RECURSO_AVISO = "fi:gasto_comun"

/**
 * F27 — la clave del RESIDENTE: lee el aviso de SU unidad.
 *
 * `ver` es su única acción (emitir y entregar siguen siendo `fi:gasto_comun`) y
 * el alcance por unidad es ABAC de ESTA ruta: el cliente nunca decide de quién
 * es el aviso, igual que `fi:cobranza:propia` en `cobros-fi/canales`.
 */
export const RECURSO_AVISO_PROPIO = "fi:aviso:propio"

/**
 * Quién puede LEER un aviso: la gestión con la clave del gasto común, o el
 * residente con la clave de lo propio. Es la compuerta de lectura de la
 * colección, del detalle y del PDF; la escritura sigue siendo de `fi:gasto_comun`.
 */
export function puedeLeerAvisosCobro(rol: string): boolean {
  return (
    puede(rol, "ver", RECURSO_AVISO) ||
    puede(rol, "ver", RECURSO_AVISO_PROPIO)
  )
}

/**
 * Fragmento de «lo propio» de `AvisoCobro`, o `null` si el actor ve la comunidad
 * completa.
 *
 * - gestión (`fi:gasto_comun` ver) → `null`: el `where` es solo la comunidad.
 * - rol acotado con identidad → `{ unidadId: { in: <vínculos vigentes> } }`.
 * - rol acotado SIN identidad MP → `{ unidadId: { in: [] } }`: sin «lo propio»
 *   que comparar, el fragmento no matchea NADA (fail closed). Devolver `null`
 *   acá le abriría la comunidad entera a una sesión sin ficha de persona, que es
 *   el fail-open que `alcancePorFilasDeSesion` documenta y cierra.
 */
export async function alcanceAvisosCobro(
  scope: ComunidadScope
): Promise<Prisma.AvisoCobroWhereInput | null> {
  if (puede(scope.rol, "ver", RECURSO_AVISO)) return null
  const alcance = await alcancePorFilasDeSesion(scope)
  // `comunidad` acá solo podría darse por una clave de lectura sin la de
  // gestión (no existe en la matriz): se trata como «sin filas» en vez de
  // ensanchar el alcance por la forma del rol.
  if (alcance.tipo !== "propio") return { unidadId: { in: [] } }
  const unidades = await unidadesVinculadasDb(
    alcance.personaId,
    scope.comunidadId
  )
  return { unidadId: { in: unidades } }
}
