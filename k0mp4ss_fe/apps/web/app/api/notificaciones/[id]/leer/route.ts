/**
 * POST /api/notificaciones/[id]/leer — el destinatario marca leída la SUYA (H7).
 *
 * Decisión owner 2026-10-21: la gracia de una notificación es alertar al admin
 * de que se leyó. El que marca es el destinatario; el admin ve el estado
 * (`leida`). OJO: el modelo no guarda la fecha de lectura (`fechaLectura` no
 * existe en `Notificacion`); agregarla exige migración y queda como deuda
 * declarada. Por eso el permiso vive en la MATRIZ como recurso granular
 * `notificaciones:propias` (editar) y la pertenencia se valida AQUÍ
 * server-side: una notificación ajena responde 404, igual que una inexistente,
 * para no filtrar su existencia. Idempotente: marcar dos veces no falla.
 *
 * Dos compuertas, en este orden — escritura ⊆ lectura:
 * 1. ALCANCE: el `where` es el MISMO de la lectura por id
 *    (`filtroNotificaciones`, `lib/api/notificaciones-scope.ts`). Lo que el GET
 *    por id esconde, el POST no lo firma: sin esta compuerta un residente de
 *    otra unidad firmaba la difusión de rol dirigida a la unidad ajena (no la
 *    podía leer, pero sí marcar leída) e inflaba la tasa de apertura.
 * 2. FIRMA: `esDestinatarioDeNotificacion` mantiene la decisión del owner —
 *    solo el destinatario firma, ni el administrador ni el comité firman por
 *    otro aunque su alcance de lectura sea toda la comunidad.
 */
import { puede, normalizaRol } from "@/lib/authz"
import { prisma } from "@/lib/prisma"
import {
  jsonError,
  withComunidadScope,
} from "@/lib/api/with-comunidad-scope"
import {
  DESTINATARIOS_POR_ROL,
  filtroNotificaciones,
} from "@/lib/api/notificaciones-scope"
import { personaIdDelUsuarioDb, unidadesVinculadasDb } from "@/lib/api/sesion-persona"
import { logger } from "@/lib/logger"
import { hoyISO } from "@/lib/date-utils"

type Ctx = { params: Promise<{ id: string }> }

/**
 * ¿Es el destinatario de la notificación? Destinataria puntual por personaId,
 * o difusión a su rol sin destinatario puntual. Pura y exportada para que el
 * PUT de [id]/route.ts use la MISMA regla al proteger el campo `leida`.
 *
 * Es la compuerta de FIRMA, no la de alcance: dice «a quién se dirigió», no «qué
 * puede ver el actor». El POST /leer la aplica DESPUÉS de `filtroNotificaciones`
 * (misma verdad que la lectura por id), así que un rol con visión de toda la
 * comunidad —administrador, comité— no firma la lectura de otro.
 */
export function esDestinatarioDeNotificacion(
  notificacion: { destinatarioRol: string; destinatarioPersonaId: string | null },
  rol: string,
  personaId: string | null
): boolean {
  const sinPuntual =
    notificacion.destinatarioPersonaId === null || notificacion.destinatarioPersonaId === ""
  if (!sinPuntual) return personaId != null && notificacion.destinatarioPersonaId === personaId
  const rolNorm = normalizaRol(rol) ?? rol.trim().toLowerCase()
  const roles = DESTINATARIOS_POR_ROL[rolNorm] ?? []
  return roles.includes(notificacion.destinatarioRol)
}

export async function POST(_req: Request, ctx: Ctx): Promise<Response> {
  const resultado = await withComunidadScope()
  if (!resultado.ok) return resultado.response
  const scope = resultado.scope

  if (!puede(scope.rol, "editar", "notificaciones:propias")) {
    return jsonError(403, "Permiso denegado.")
  }

  const { id } = await ctx.params
  try {
    const personaId = await personaIdDelUsuarioDb(scope.usuarioId)
    // Las unidades vinculadas se resuelven server-side (`unidadesVinculadasDb`,
    // nunca del cliente), igual que en el GET por id: es lo que acota la difusión
    // de rol a la unidad propia (F5).
    const unidadesVinculadas = personaId
      ? await unidadesVinculadasDb(personaId, scope.comunidadId)
      : []
    const record = await prisma.notificacion.findFirst({
      where: { ...filtroNotificaciones(scope, personaId, unidadesVinculadas), id },
    })
    if (!record) return jsonError(404, "Registro no encontrado.")

    // ABAC de firma: solo el destinatario firma la lectura. Ajena → 404 (no 403)
    // para no filtrar su existencia. El alcance ya se aplicó arriba, así que acá
    // solo queda discriminar «dirigida a mí» (persona o rol sin puntual).
    if (!esDestinatarioDeNotificacion(record, scope.rol, personaId)) {
      return jsonError(404, "Registro no encontrado.")
    }

    // Primera lectura: la fecha se fija una sola vez. Marcar de nuevo no la mueve,
    // así el dato sirve como métrica auditable (enviados / fallidos / leídos).
    const fechaLectura = record.fechaLectura ?? hoyISO()
    await prisma.notificacion.update({
      where: { id },
      data: { leida: true, fechaLectura },
    })
    return Response.json({ ok: true, fechaLectura })
  } catch (e) {
    logger.error({ err: e }, "[notificaciones] error POST leer")
    return jsonError(500, "Error interno del servidor.")
  }
}
