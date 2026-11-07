/**
 * Alcance por filas y guardia de escritura de `ge/solicitudes` — el dueño de la
 * solicitud es `SolicitudGE.unidadId` (+ `solicitantePersonaId`, quién la pidió).
 *
 * La matriz (`ge` ver/crear) decide quién ENTRA a la ruta; este módulo decide
 * qué FILAS puede leer y para quién puede escribir. Administrador y comité
 * conservan la visión de toda la comunidad (`null` = sin restricción por fila,
 * comportamiento de siempre). El residente lee solo las solicitudes de sus
 * unidades con vínculo vigente o las que pidió su persona; ambos datos salen de
 * la BD de la sesión (`unidadesVinculadasDb`, `personaIdDelUsuarioDb`), nunca
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
import { normalizaRol } from "@/lib/authz"
import {
  personaIdDelUsuarioDb,
  unidadesVinculadasDb,
} from "@/lib/api/sesion-persona"
import {
  jsonError,
  type ComunidadScope,
} from "@/lib/api/with-comunidad-scope"

/** Roles que ven la comunidad entera (mismo criterio que `certificados-ct`). */
const VE_TODA_LA_COMUNIDAD = new Set(["administrador", "comite"])

function veTodaLaComunidad(scope: ComunidadScope): boolean {
  const rol = normalizaRol(scope.rol) ?? scope.rol.trim().toLowerCase()
  return VE_TODA_LA_COMUNIDAD.has(rol)
}

/**
 * Vínculos del actor, resueltos en el servidor: `personaId` del `Usuario` de la
 * sesión y sus unidades con vínculo VIGENTE en la comunidad del scope.
 */
async function vinculosDelActor(
  scope: ComunidadScope
): Promise<{ personaId: string | null; unidades: string[] }> {
  const personaId = await personaIdDelUsuarioDb(scope.usuarioId)
  const unidades = personaId
    ? await unidadesVinculadasDb(personaId, scope.comunidadId)
    : []
  return { personaId, unidades }
}

/**
 * Fragmento de «lo propio», o `null` si el actor ve la comunidad completa.
 *
 * Sin persona ni vínculos no hay «lo propio» que comparar: el alcance no acota y
 * se conserva el acceso que el rol ya tenía (el hueco es del alta del usuario
 * sin ficha en el Maestro de Personas, no de la matriz). La ESCRITURA no usa
 * esta salida: `rechazoDeSolicitudAjena` no se abre por falta de identidad.
 */
export async function alcanceSolicitudesGE(
  scope: ComunidadScope
): Promise<Prisma.SolicitudGEWhereInput | null> {
  if (veTodaLaComunidad(scope)) return null
  const { personaId, unidades } = await vinculosDelActor(scope)
  if (!personaId && unidades.length === 0) return null

  const propios: Prisma.SolicitudGEWhereInput[] = []
  if (unidades.length > 0) propios.push({ unidadId: { in: unidades } })
  if (personaId) propios.push({ solicitantePersonaId: personaId })
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
  if (veTodaLaComunidad(scope)) return null // gestión: escribe para toda la comunidad

  const { personaId, unidades } = await vinculosDelActor(scope)
  const unidadPropia = unidadPedida === "" || unidades.includes(unidadPedida)
  const personaPropia = personaPedida === "" || personaPedida === personaId
  if (unidadPropia && personaPropia) return null
  return jsonError(404, "Registro no encontrado.")
}
