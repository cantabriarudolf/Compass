/**
 * /api/pe/personas/[id]/horas-extras — registra una hora extra en la ficha
 * laboral del trabajador.
 *
 * POST custom (`pe` editar): paridad server-side con `registrarHoraExtraPE` del
 * store legacy. La hora extra se AGREGA al historial de `Persona.datosLaborales`
 * (columna Json) y nunca se reescribe lo anterior; el sobretiempo se mide desde
 * los reportes de turno y se SUGIERE al administrador al liquidar (plan
 * SERIE-FASE2 §V2): por eso esta transición no crea liquidación, ni aprobación
 * separada, ni egreso FI. Solo deja el evento `PE_HORA_EXTRA_REGISTRADA`.
 *
 * Authz: `pe` editar — conserjería y mantención; el comité solo lee.
 * Scoping: la persona debe pertenecer a la comunidad de la sesión (404 si no).
 */
import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import { generarId } from "@/lib/id-utils"
import { HoraExtraPESchema } from "@/lib/schemas"
import { jsonError } from "@/lib/api/with-comunidad-scope"
import {
  cargarPersonaPE,
  contextoAccionPE,
  leerDatosLaborales,
  registrarEventoPE,
} from "../../../_acciones"

type Ctx = { params: Promise<{ id: string }> }

/** Entrada del POST: el `id` de la entrada lo deriva el servidor si falta. */
const EntradaHoraExtraSchema = HoraExtraPESchema.omit({ id: true })

/** POST agrega una hora extra al historial laboral de la persona. */
export async function POST(req: Request, ctx: Ctx): Promise<Response> {
  const contexto = await contextoAccionPE()
  if (!contexto.ok) return contexto.response
  const { scope } = contexto
  const { id } = await ctx.params

  const crudo = await req.json().catch(() => null)
  const parsed = EntradaHoraExtraSchema.safeParse(crudo)
  if (!parsed.success) {
    return jsonError(
      400,
      parsed.error.issues[0]?.message ?? "Datos de la hora extra inválidos."
    )
  }

  try {
    const persona = await cargarPersonaPE(id, scope)
    if (!persona) {
      return jsonError(404, "El trabajador no existe en el Maestro de Personas.")
    }
    const datos = leerDatosLaborales(persona)
    if (!datos) return jsonError(400, "La persona no tiene ficha laboral de PE.")

    const entrada = { id: generarId("he"), ...parsed.data }
    const historial = Array.isArray(datos.horasExtras) ? datos.horasExtras : []
    const datosLaborales = { ...datos, horasExtras: [...historial, entrada] }

    await prisma.$transaction(async (tx) => {
      await tx.persona.update({
        where: { id: persona.id },
        data: { datosLaborales: datosLaborales as never },
      })
      await registrarEventoPE(
        scope,
        "PE_HORA_EXTRA_REGISTRADA",
        persona.id,
        `${entrada.horas} h extra (${entrada.motivo}) registradas para ${persona.nombres} ${persona.apellidos}.`,
        tx
      )
    })

    return Response.json({ ok: true, id: entrada.id })
  } catch (e) {
    logger.error({ err: e }, "[api/pe/personas/horas-extras] error inesperado")
    return jsonError(500, "Error interno del servidor.")
  }
}
