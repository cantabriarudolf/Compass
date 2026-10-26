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

/**
 * `destinatarioRol` que corresponde a cada rol de sesión (mínimo privilegio).
 * Exportado: también lo consume el POST /leer (H7) para validar quién es el
 * destinatario de una notificación. `comite → ["directiva"]` existe porque el
 * enum `destinatarioRol` de `NotificacionSchema` usa "directiva" para las
 * difusiones de rol al comité (el filtro de bandeja no lo necesita: el comité
 * ve toda la comunidad, pero sí lo necesita el chequeo de destinatario).
 * El administrador no tiene difusión de rol: solo le llega lo dirigido a su
 * `personaId`.
 */
export const DESTINATARIOS_POR_ROL: Record<string, readonly string[]> = {
  comite: ["directiva"],
  residente: ["residente", "propietario"],
  conserjeria: ["personal"],
  mantencion: ["personal"],
}

/**
 * Difusión a un rol SIN destinatario puntual (y sin unidad si `acotarPorUnidad`),
 * para no ver la de un par ni una difusión de unidad ajena.
 */
function difusionDeRol(
  rolesDestinatario: readonly string[],
  acotarPorUnidad: boolean
): Prisma.NotificacionWhereInput {
  const AND: Prisma.NotificacionWhereInput[] = [
    { destinatarioRol: { in: [...rolesDestinatario] } },
    { OR: [{ destinatarioPersonaId: null }, { destinatarioPersonaId: "" }] },
  ]
  if (acotarPorUnidad) AND.push({ unidadId: null })
  return { AND }
}

/**
 * Construye el `where` de notificaciones visibles para el scope de sesión.
 * Puro: no toca BD, de modo que la regla se puede fijar con un test unitario.
 * `personaId` es el del usuario de sesión (`Usuario.personaId`), no el del body.
 *
 * `unidadesVinculadas` (F5): unidades con vínculo vigente del usuario, resueltas
 * por el servidor (`unidadesVinculadasDb`, NUNCA del cliente). Solo SEGMENTA el
 * rol `residente` — minimización y finalidad (asesoría normativa 2026-10-25:
 * 19.628 art. 9; 21.719 art. 14 b) mandan avisar sólo al destinatario y a la
 * unidad que corresponde. Sin el parámetro (tests unitarios, o llamadas previas
 * a F5) la regla queda como estaba. administrador, comité, conserjería y
 * mantención conservan su visibilidad histórica intacta.
 */
export function filtroNotificaciones(
  scope: ComunidadScope,
  personaId: string | null,
  unidadesVinculadas?: string[]
): Prisma.NotificacionWhereInput {
  const rol = normalizaRol(scope.rol) ?? scope.rol.trim().toLowerCase()
  if (VE_TODA_LA_COMUNIDAD.has(rol)) return { comunidadId: scope.comunidadId }

  const rolesDestinatario = DESTINATARIOS_POR_ROL[rol]
  if (!rolesDestinatario) return { comunidadId: scope.comunidadId, id: { in: [] } }

  const acotaPorUnidad = rol === "residente" && unidadesVinculadas !== undefined
  const difusion: Prisma.NotificacionWhereInput = acotaPorUnidad
    ? difusionDeRol(rolesDestinatario, true)
    : difusionDeRol(rolesDestinatario, false)

  // F5 (c): difusión a mi rol CON una unidad de mis vínculos vigentes.
  const difusionMiUnidad: Prisma.NotificacionWhereInput[] =
    acotaPorUnidad && unidadesVinculadas.length > 0
      ? [
          {
            AND: [
              { destinatarioRol: { in: [...rolesDestinatario] } },
              { OR: [{ destinatarioPersonaId: null }, { destinatarioPersonaId: "" }] },
              { unidadId: { in: [...unidadesVinculadas] } },
            ],
          },
        ]
      : []

  return {
    comunidadId: scope.comunidadId,
    OR: [
      // Dirigida puntualmente a mi persona (cualquier rol de destinatario).
      ...(personaId ? [{ destinatarioPersonaId: personaId }] : []),
      difusion,
      ...difusionMiUnidad,
    ],
  }
}
