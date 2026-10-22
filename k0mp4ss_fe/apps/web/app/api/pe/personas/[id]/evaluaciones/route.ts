/**
 * /api/pe/personas/[id]/evaluaciones — registra una evaluación de desempeño.
 *
 * POST custom (`pe:evaluacion` crear): paridad server-side con
 * `registrarEvaluacionPE` del store legacy, con la regla del plan SERIE-FASE2
 * §V2: **la evaluación es histórica e inmutable**. Una vez registrada no se
 * edita; para corregir el rumbo se agrega OTRA evaluación, de modo que el
 * historial de desempeño nunca pierde lo que se informó en su momento.
 *
 * Cómo se garantiza la inmutabilidad:
 * 1. No existe PUT/PATCH/DELETE en esta ruta: el historial solo crece.
 * 2. El POST es un append puro sobre `Persona.datosLaborales.evaluaciones`.
 * 3. Si el cliente reenvía un `id` ya registrado, la ruta responde 409 y NO
 *    toca la entrada existente (candado explícito, ver `yaRegistrada`).
 * 4. El chequeo y el append ocurren dentro de la misma transacción.
 *
 * Authz: SOLO administrador (recurso `pe:evaluacion`, declarado vacío para el
 * resto de los roles): evaluar al personal no es una tarea operativa de
 * conserjería ni de mantención.
 */
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import { generarId } from "@/lib/id-utils"
import { EvaluacionPESchema } from "@/lib/schemas"
import { jsonError } from "@/lib/api/with-comunidad-scope"
import {
  cargarPersonaPE,
  contextoAccionPE,
  leerDatosLaborales,
  RECURSO_EVALUACION_PE,
  registrarEventoPE,
} from "../../../_acciones"

type Ctx = { params: Promise<{ id: string }> }

/**
 * Entrada del POST: el `id` es opcional y lo deriva el servidor cuando falta.
 * Si viene, se usa solo para DETECTAR un reintento sobre una evaluación ya
 * registrada (nunca para sobrescribirla).
 */
const EntradaEvaluacionSchema = EvaluacionPESchema.omit({ id: true }).extend({
  id: z.string().min(1).optional(),
})

/** POST agrega una evaluación inmutable al historial laboral de la persona. */
export async function POST(req: Request, ctx: Ctx): Promise<Response> {
  const contexto = await contextoAccionPE(RECURSO_EVALUACION_PE, "crear")
  if (!contexto.ok) return contexto.response
  const { scope } = contexto
  const { id } = await ctx.params

  const crudo = await req.json().catch(() => null)
  const parsed = EntradaEvaluacionSchema.safeParse(crudo)
  if (!parsed.success) {
    return jsonError(
      400,
      parsed.error.issues[0]?.message ?? "Datos de la evaluación inválidos."
    )
  }

  try {
    const persona = await cargarPersonaPE(id, scope)
    if (!persona) {
      return jsonError(404, "El trabajador no existe en el Maestro de Personas.")
    }
    const datos = leerDatosLaborales(persona)
    if (!datos) return jsonError(400, "La persona no tiene ficha laboral de PE.")

    const entrada = {
      id: parsed.data.id ?? generarId("ev"),
      fecha: parsed.data.fecha,
      puntaje: parsed.data.puntaje,
      ...(parsed.data.comentarios ? { comentarios: parsed.data.comentarios } : {}),
    }
    const historial = Array.isArray(datos.evaluaciones) ? datos.evaluaciones : []

    const resultado = await prisma.$transaction(async (tx) => {
      // Candado de inmutabilidad: releer dentro de la transacción para que dos
      // posts concurrentes con el mismo id no puedan escribir dos veces.
      const vigente = await tx.persona.findUnique({
        where: { id: persona.id },
        select: { datosLaborales: true },
      })
      const actuales = leerDatosLaborales({ datosLaborales: vigente?.datosLaborales })
      const yaRegistrada = (actuales?.evaluaciones ?? []).some((e) => e.id === entrada.id)
      if (yaRegistrada) return { tipo: "inmutable" as const }

      const previas = actuales?.evaluaciones ?? historial
      const datosLaborales = { ...(actuales ?? datos), evaluaciones: [...previas, entrada] }

      await tx.persona.update({
        where: { id: persona.id },
        data: { datosLaborales: datosLaborales as never },
      })
      await registrarEventoPE(
        scope,
        "PE_EVALUACION_REGISTRADA",
        persona.id,
        `Evaluación de desempeño (${entrada.puntaje}/7) registrada para ${persona.nombres} ${persona.apellidos}.`,
        tx
      )
      return { tipo: "ok" as const }
    })

    if (resultado.tipo === "inmutable") {
      return jsonError(
        409,
        "La evaluación ya fue registrada y no se puede modificar; registre una nueva."
      )
    }
    return Response.json({ ok: true, id: entrada.id })
  } catch (e) {
    logger.error({ err: e }, "[api/pe/personas/evaluaciones] error inesperado")
    return jsonError(500, "Error interno del servidor.")
  }
}
