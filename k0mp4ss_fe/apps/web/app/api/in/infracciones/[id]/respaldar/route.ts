/**
 * /api/in/infracciones/[id]/respaldar — respaldo de directiva para aplicar multa IN.
 *
 * POST custom (solo administración): paridad server-side con
 * `respaldarInfraccionIN` legacy. Exige que la infracción siga sin resolución
 * final y que la persona sea un miembro vigente de la directiva; acumula el
 * respaldo y emite UN evento `IN_RESPALDO_DIRECTIVA`.
 */
import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import { jsonError } from "@/lib/api/with-comunidad-scope"
import {
  cargarInfraccion,
  contextoAccionIN,
  leerCuerpo,
  registrarEventoIN,
} from "../../_acciones"

type Ctx = { params: Promise<{ id: string }> }

/** POST agrega el respaldo de un directivo vigente sobre la multa. */
export async function POST(req: Request, ctx: Ctx): Promise<Response> {
  const contexto = await contextoAccionIN()
  if (!contexto.ok) return contexto.response
  const { scope } = contexto
  const { id } = await ctx.params

  const body = await leerCuerpo(req)
  if (body === null) return jsonError(400, "Cuerpo JSON inválido.")
  const personaId = typeof body.personaId === "string" ? body.personaId : ""

  try {
    const infraccion = await cargarInfraccion(id, scope)
    if (!infraccion) return jsonError(404, "Registro no encontrado.")
    if (["aplicada", "desestimada"].includes(infraccion.estado)) {
      return jsonError(400, "La infracción ya tiene resolución final.")
    }

    const firmante = await prisma.persona.findUnique({ where: { id: personaId } })
    if (
      !firmante ||
      firmante.comunidadId !== scope.comunidadId ||
      firmante.datosGobernanza === null ||
      firmante.estadoCuenta !== "activa"
    ) {
      return jsonError(
        400,
        "Solo un miembro vigente de la directiva puede respaldar la aplicación de la multa."
      )
    }

    // SAFETY: respaldosDirectiva es Json con shape string[] validado por InfraccionINSchema.
    const respaldos = (infraccion.respaldosDirectiva ?? []) as unknown as string[]
    if (respaldos.includes(personaId)) {
      return jsonError(400, "Este miembro de la directiva ya respaldó la multa.")
    }

    await prisma.infraccionIN.update({
      where: { id },
      data: { respaldosDirectiva: [...respaldos, personaId] as never },
    })

    await registrarEventoIN(
      scope,
      "IN_RESPALDO_DIRECTIVA",
      id,
      `${firmante.nombreCompleto} respalda la aplicación de la multa ${infraccion.folio}.`
    )

    return Response.json({ ok: true })
  } catch (e) {
    logger.error({ err: e }, "[api/in/infracciones/respaldar] error inesperado")
    return jsonError(500, "Error interno del servidor.")
  }
}
