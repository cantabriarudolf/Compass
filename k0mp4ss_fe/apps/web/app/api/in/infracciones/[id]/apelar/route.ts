/**
 * /api/in/infracciones/[id]/apelar — descargos de apelación de una infracción IN.
 *
 * POST custom: paridad server-side con `apelarInfraccionIN` legacy. Exige estado
 * "en_revision" y descargos de al menos 10 caracteres; transiciona a "apelada" y
 * emite UN evento `IN_APELACION`.
 *
 * Authz (decisión owner 2026-10-21): `in:apelar` — la apelación es acto propio del
 * residente sobre SU infracción. El administrador registra descargos sin acotar
 * por unidad; cualquier otro rol solo dentro de sus unidades con vínculo vigente
 * (una infracción ajena responde 404, sin revelar que existe). El comité y la
 * conserjería no apelan: ellos gestionan el caso (aplicar/desestimar/respaldar).
 */
import { hoyISO } from "@/lib/date-utils"
import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import { jsonError } from "@/lib/api/with-comunidad-scope"
import {
  cargarInfraccion,
  contextoApelacionIN,
  leerCuerpo,
  registrarEventoIN,
} from "../../_acciones"

type Ctx = { params: Promise<{ id: string }> }

/** POST registra los descargos y pasa la infracción a Apelada. */
export async function POST(req: Request, ctx: Ctx): Promise<Response> {
  const contexto = await contextoApelacionIN()
  if (!contexto.ok) return contexto.response
  const { scope, unidadesVinculadas } = contexto
  const { id } = await ctx.params

  const body = await leerCuerpo(req)
  if (body === null) return jsonError(400, "Cuerpo JSON inválido.")
  const descargos =
    typeof body.descargos === "string" ? body.descargos.trim() : ""

  try {
    const infraccion = await cargarInfraccion(id, scope)
    if (!infraccion) return jsonError(404, "Registro no encontrado.")
    // Pertenencia: fuera de la vía administración, la infracción debe ser de una
    // unidad con vínculo vigente del usuario (404, igual que inexistente).
    if (unidadesVinculadas && !unidadesVinculadas.includes(infraccion.unidadId)) {
      return jsonError(404, "Registro no encontrado.")
    }
    if (infraccion.estado !== "en_revision") {
      return jsonError(
        400,
        "Solo una infracción En Revisión puede recibir descargos de apelación."
      )
    }
    if (descargos.length < 10) {
      return jsonError(
        400,
        "Los descargos deben detallar la posición del vecino (mínimo 10 caracteres)."
      )
    }

    await prisma.infraccionIN.update({
      where: { id },
      data: {
        estado: "apelada",
        apelacion: { descargos, fecha: hoyISO() } as never,
      },
    })

    await registrarEventoIN(
      scope,
      "IN_APELACION",
      id,
      `Descargos presentados en infracción ${infraccion.folio}: En Revisión → Apelada.`
    )

    return Response.json({ ok: true })
  } catch (e) {
    logger.error({ err: e }, "[api/in/infracciones/apelar] error inesperado")
    return jsonError(500, "Error interno del servidor.")
  }
}
