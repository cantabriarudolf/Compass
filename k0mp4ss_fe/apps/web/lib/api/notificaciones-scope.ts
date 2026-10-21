/**
 * notificaciones-scope — filtro ABAC por destinatario de la bandeja de notificaciones.
 *
 * Abrir el recurso `notificaciones` para residente, conserjería y mantención sin
 * filtrar exponía las notificaciones de otros vecinos/trabajadores: son datos
 * personales. El filtro se resuelve server-side, antes de responder cualquier
 * lectura (`GET` de colección y `GET` por id).
 *
 * Regla declarada (decisión owner 2026-10-21):
 * - administrador: todas las de su comunidad (wildcard RP).
 * - comité: todas las de su comunidad — es el órgano de gobierno y audita la
 *   operación; criterio declarado por el orquestador para esta ventana.
 * - conserjería, residente y mantención: solo las dirigidas a su `personaId` o a
 *   su rol (`destinatarioRol`), y — dentro de las de rol — solo las que no tienen
 *   destinatario puntual, para que un aviso dirigido a otra persona del mismo rol
 *   no se filtre por la puerta del rol.
 * - rol no declarado: ninguna (menor privilegio).
 *
 * Mapeo rol RBAC → `destinatarioRol` (según `NotificacionSchema` y los usos reales
 * del store): residente = "Propietario/Residente" de RP → `residente` y
 * `propietario`; conserjería y mantención son personal de servicio → `personal`.
 * El modelo no tiene "todos": el caso difusión es `destinatarioRol` sin
 * `destinatarioPersonaId`.
 */
import type { Prisma } from "@prisma/client"
import { normalizaRol } from "@/lib/authz"
import type { ComunidadScope } from "./with-comunidad-scope"

/** Roles con visión completa de la bandeja de su comunidad. */
const VE_TODA_LA_COMUNIDAD = new Set(["administrador", "comite"])

/** `destinatarioRol` que corresponde a cada rol de sesión (mínimo privilegio). */
const DESTINATARIOS_POR_ROL: Record<string, readonly string[]> = {
  residente: ["residente", "propietario"],
  conserjeria: ["personal"],
  mantencion: ["personal"],
}

/**
 * Construye el `where` de notificaciones visibles para el scope de sesión.
 * Puro: no toca BD, de modo que la regla se puede fijar con un test unitario.
 * `personaId` es el del usuario de sesión (`Usuario.personaId`), no el del body.
 */
export function filtroNotificaciones(
  scope: ComunidadScope,
  personaId: string | null
): Prisma.NotificacionWhereInput {
  const rol = normalizaRol(scope.rol) ?? scope.rol.trim().toLowerCase()
  if (VE_TODA_LA_COMUNIDAD.has(rol)) return { comunidadId: scope.comunidadId }

  const rolesDestinatario = DESTINATARIOS_POR_ROL[rol]
  if (!rolesDestinatario) return { comunidadId: scope.comunidadId, id: { in: [] } }

  return {
    comunidadId: scope.comunidadId,
    OR: [
      // Dirigida puntualmente a mi persona (cualquier rol de destinatario).
      ...(personaId ? [{ destinatarioPersonaId: personaId }] : []),
      // Difusión a mi rol: sin destinatario puntual, para no ver la de un par.
      {
        AND: [
          { destinatarioRol: { in: [...rolesDestinatario] } },
          { OR: [{ destinatarioPersonaId: null }, { destinatarioPersonaId: "" }] },
        ],
      },
    ],
  }
}
