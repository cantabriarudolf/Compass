/**
 * buzon-alcance — alcance del buzón ciudadano CO por rol (change
 * co-lectura-residente, S10 · decisión D4 del design).
 *
 * | rol           | mensajes que ve                              |
 * | administrador | todos los de la comunidad                    |
 * | comite        | solo `visibilidadComite === true`            |
 * | residente     | solo los que reportó él mismo                |
 *
 * El reportante NUNCA sale del cuerpo del pedido para residente ni comité: se
 * deriva de la sesión, así nadie puede reportar «como» otro vecino. La única
 * excepción es el administrador, que registra en el buzón los reclamos que
 * recibe en la oficina a nombre de un vecino (consola CO): ahí el `personaId`
 * del cuerpo se acepta **solo si pertenece a la comunidad** y el nombre se
 * deriva de la ficha del Maestro de Personas, no del texto enviado.
 */
import type { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { normalizaRol } from "@/lib/authz"
import { personaIdDelUsuarioDb } from "@/lib/api/sesion-persona"
import type { ComunidadScope } from "@/lib/api/with-comunidad-scope"

/**
 * `where` del alcance. `null` = el solicitante no puede ver ninguna fila
 * (residente sin persona vinculada en el Maestro de Personas).
 */
export function whereBuzon(
  rol: string,
  personaId: string | null
): Prisma.MensajeBuzonCOWhereInput | null {
  const normalizado = normalizaRol(rol)
  if (normalizado === "administrador") return {}
  if (normalizado === "comite") return { visibilidadComite: true }
  if (!personaId) return null
  return { reportantePersonaId: personaId }
}

/** `where` del detalle; `null` corta con 404 sin consultar la BD. */
export function whereMensajeBuzon(
  rol: string,
  id: string,
  personaId: string | null
): Prisma.MensajeBuzonCOWhereInput | null {
  const alcance = whereBuzon(rol, personaId)
  return alcance === null ? null : { ...alcance, id }
}

export interface Reportante {
  personaId: string | null
  nombre: string
}

/**
 * Reportante del mensaje: identidad de la sesión, o la persona indicada por el
 * administrador (validada contra la comunidad) cuando registra un reclamo ajeno.
 */
export async function resolverReportante(
  scope: ComunidadScope,
  personaIndicada: string | null
): Promise<Reportante> {
  const rol = normalizaRol(scope.rol)

  if (rol === "administrador" && personaIndicada) {
    const indicada = await prisma.persona.findFirst({
      where: { id: personaIndicada, comunidadId: scope.comunidadId },
      select: { id: true, nombreCompleto: true },
    })
    if (indicada) return { personaId: indicada.id, nombre: indicada.nombreCompleto }
  }

  const personaSesionId = await personaIdDelUsuarioDb(scope.usuarioId)
  const personaSesion = personaSesionId
    ? await prisma.persona.findFirst({
        where: { id: personaSesionId, comunidadId: scope.comunidadId },
        select: { nombreCompleto: true },
      })
    : null
  if (personaSesionId && personaSesion) {
    return { personaId: personaSesionId, nombre: personaSesion.nombreCompleto }
  }

  const usuario = await prisma.usuario.findUnique({
    where: { id: scope.usuarioId },
    select: { email: true },
  })
  return {
    personaId: null,
    nombre: usuario?.email ?? "Vecino de la comunidad",
  }
}
