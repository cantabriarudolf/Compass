/**
 * Alcance por filas y guardia de escritura de `ge/solicitudes` — el dueño de la
 * solicitud es `SolicitudGE.unidadId` (+ `solicitantePersonaId`, quién la pidió).
 *
 * La matriz (`ge` ver/crear) decide quién ENTRA a la ruta; este módulo decide
 * qué FILAS puede leer y para quién puede escribir. Administrador y comité
 * conservan la visión de toda la comunidad (`null` = sin restricción por fila,
 * comportamiento de siempre). El residente lee solo las solicitudes de sus
 * unidades con vínculo vigente o las que pidió su persona; ambos datos salen de
 * la BD de la sesión (`unidadesVinculadasDb`, `alcancePorFilasDeSesion`), nunca
 * del body ni del query.
 *
 * La solicitud ajena responde 404 «Registro no encontrado.» y no 403: el 403
 * confirmaría que existe.
 *
 * ESCRITURA: el alcance no puede validar un alta (la fila todavía no existe), y
 * el `POST` es un upsert — un residente podría mandar `unidadId`/`personaId` de
 * un tercero y crear (o reescribir) una fila a su nombre. Por eso la ruta
 * declara además `rechazoDeSolicitudAjena`, misma forma que
 * `rechazoDeEmisionAjena` en `app/api/certificados-ct/route.ts`.
 */
import type { Prisma } from "@prisma/client"
import {
  alcancePorFilasDeSesion,
  unidadesVinculadasDb,
} from "@/lib/api/sesion-persona"
import {
  jsonError,
  type ComunidadScope,
} from "@/lib/api/with-comunidad-scope"

/**
 * Fragmento de «lo propio», o `null` si el actor ve la comunidad completa.
 *
 * La decisión de rol/identidad sale de `alcancePorFilasDeSesion`
 * (`lib/api/sesion-persona.ts`): gestión → `null`; rol acotado sin `personaId` →
 * `{ id: { in: [] } }` (no hay unidad ni persona propia, así que no hay fila
 * legible); rol acotado con identidad → sus vínculos vigentes o su persona.
 */
export async function alcanceSolicitudesGE(
  scope: ComunidadScope
): Promise<Prisma.SolicitudGEWhereInput | null> {
  const alcance = await alcancePorFilasDeSesion(scope)
  if (alcance.tipo === "comunidad") return null
  if (alcance.tipo === "denegado") return { id: { in: [] } }

  const unidades = await unidadesVinculadasDb(alcance.personaId, scope.comunidadId)
  const propios: Prisma.SolicitudGEWhereInput[] = []
  if (unidades.length > 0) propios.push({ unidadId: { in: unidades } })
  propios.push({ solicitantePersonaId: alcance.personaId })
  return { OR: propios }
}

/**
 * Guardia previa a la escritura (POST upsert y PUT parcial): el actor acotado
 * solo escribe solicitudes de su unidad y de su persona.
 *
 * Corre después del authz y antes de tocar Prisma. `datos` es el payload ya
 * validado (en PUT, la fila existente fusionada con el parche), así que también
 * corta un intento de MOVER una solicitud propia a una unidad ajena. La
 * respuesta es el 404 genérico: no se filtra si la unidad/persona existe.
 *
 * La decisión gestión/acotado también sale de `alcancePorFilasDeSesion`, para no
 * tener dos definiciones. La guardia YA fallaba cerrado sin identidad —con
 * `personaId` nulo no hay unidad ni persona propia, así que cualquier payload que
 * nombre una unidad o una persona cae en el 404— y con el estado `denegado` sigue
 * igual: no se abre por falta de alta del usuario.
 */
export async function rechazoDeSolicitudAjena({
  datos,
  scope,
}: {
  datos: Record<string, unknown>
  scope: ComunidadScope
}): Promise<Response | null> {
  const unidadPedida =
    typeof datos.unidadId === "string" ? datos.unidadId.trim() : ""
  const personaPedida =
    typeof datos.solicitantePersonaId === "string"
      ? datos.solicitantePersonaId.trim()
      : ""
  if (!unidadPedida && !personaPedida) return null

  const alcance = await alcancePorFilasDeSesion(scope)
  if (alcance.tipo === "comunidad") return null // gestión: escribe para toda la comunidad

  const personaId = alcance.tipo === "propio" ? alcance.personaId : null
  const unidades = personaId
    ? await unidadesVinculadasDb(personaId, scope.comunidadId)
    : []
  const unidadPropia = unidadPedida === "" || unidades.includes(unidadPedida)
  const personaPropia = personaPedida === "" || personaPedida === personaId
  if (unidadPropia && personaPropia) return null
  return jsonError(404, "Registro no encontrado.")
}
