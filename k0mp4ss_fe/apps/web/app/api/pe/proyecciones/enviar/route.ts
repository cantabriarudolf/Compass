/**
 * /api/pe/proyecciones/enviar — envía la proyección de cobertura y costos del
 * mes a Finanzas.
 *
 * POST custom (`pe` editar): paridad server-side con `enviarProyeccionCostoFI`
 * del store legacy, con la decisión del plan SERIE-FASE2 §V2 bien visible:
 * **la proyección es un aviso/métrica, NO un gasto**. Por eso esta ruta:
 * - NO crea `EgresoFI` (ni ningún movimiento de fondo): no toca FI;
 * - deja la proyección como registro propio (`ProyeccionPE`) con
 *   `enviadoAFI` = true, que significa "el aviso salió", y
 *   `liquidacionPLReferencia: "pendiente"` (la liquidación la decide PL);
 * - emite UNA notificación a administración (mismo texto del legacy) y el
 *   evento `PE_PROYECCION_ENVIADA`.
 *
 * El cálculo se hace EN EL SERVIDOR desde el maestro de feriados de la
 * comunidad (`maestros_feriado`) y el personal de planta vigente, con las
 * mismas funciones puras que usaba la UI (`calcularProyeccionCobertura`,
 * `costoProyeccionPE`): un cliente no puede inventar el sobrecosto.
 */
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import { generarId } from "@/lib/id-utils"
import { hoyISO } from "@/lib/date-utils"
import { calcularProyeccionCobertura, costoProyeccionPE } from "@/lib/personal-utils"
import { jsonError } from "@/lib/api/with-comunidad-scope"
import { contextoAccionPE, registrarEventoPE } from "../../_acciones"

/** Entrada del POST: mes AAA-MM y los dos costos unitarios de la proyección. */
const EntradaProyeccionSchema = z.object({
  mesAnio: z
    .string({ required_error: "El mes de proyección es obligatorio." })
    .regex(/^\d{4}-\d{2}$/, "El mes debe tener formato AAAA-MM."),
  costoParche: z
    .number({ invalid_type_error: "El costo de parche debe ser un número." })
    .min(0, "Los costos de parche y día extra no pueden ser negativos."),
  costoDiaExtra: z
    .number({ invalid_type_error: "El pago de día extra debe ser un número." })
    .min(0, "Los costos de parche y día extra no pueden ser negativos."),
})

/** POST calcula, registra y notifica la proyección del mes (sin egreso FI). */
export async function POST(req: Request): Promise<Response> {
  const contexto = await contextoAccionPE()
  if (!contexto.ok) return contexto.response
  const { scope } = contexto

  const crudo = await req.json().catch(() => null)
  const parsed = EntradaProyeccionSchema.safeParse(crudo)
  if (!parsed.success) {
    return jsonError(
      400,
      parsed.error.issues[0]?.message ?? "Datos de la proyección inválidos."
    )
  }
  const { mesAnio, costoParche, costoDiaExtra } = parsed.data

  try {
    const [feriados, personal] = await Promise.all([
      prisma.feriado.findMany({
        where: { comunidadId: scope.comunidadId },
        select: { id: true, fecha: true, nombre: true, irrenunciable: true },
        orderBy: { fecha: "asc" },
      }),
      prisma.persona.findMany({
        where: { comunidadId: scope.comunidadId },
        select: { datosLaborales: true, estadoCuenta: true },
      }),
    ])

    const proyeccionBase = calcularProyeccionCobertura({ feriados, mesAnio })
    if (proyeccionBase.diasFeriados === 0) {
      return jsonError(
        400,
        `No hay feriados registrados para ${mesAnio}; cargue el calendario antes de proyectar.`
      )
    }

    // Paridad legacy: solo el personal con ficha laboral y cuenta activa cuenta
    // como planta (los feriados se cubren con parches + día extra de la planta).
    const personalPlanta = personal.filter(
      (p) => p.datosLaborales !== null && p.estadoCuenta === "activa"
    ).length
    const costoEstimado = costoProyeccionPE(
      proyeccionBase.reemplazosNecesarios,
      personalPlanta,
      costoParche,
      costoDiaExtra
    )

    const id = generarId("pe-proy")
    await prisma.$transaction(async (tx) => {
      await tx.proyeccionPE.create({
        data: {
          id,
          comunidadId: scope.comunidadId,
          mesAnio,
          feriados: proyeccionBase.feriados as never,
          diasFeriados: proyeccionBase.diasFeriados,
          reemplazosNecesarios: proyeccionBase.reemplazosNecesarios,
          costoEstimado,
          detalleCosto: {
            personalPlanta,
            costoParche,
            costoDiaExtra,
          } as never,
          enviadoAFI: true,
          liquidacionPLReferencia: "pendiente",
        },
      })

      // Aviso a administración (mismo texto del legacy). Sin SMTP queda como
      // notificación en la bandeja del rol; nunca se reporta como email enviado.
      await tx.notificacion.create({
        data: {
          id: generarId("not"),
          comunidadId: scope.comunidadId,
          destinatarioRol: "administracion",
          asunto: `Proyección operativa ${mesAnio}: ${proyeccionBase.diasFeriados} feriado(s)`,
          cuerpo: `Se requerirán ${proyeccionBase.reemplazosNecesarios} reemplazo(s) (parches) para cubrir los descansos legales. Sobrecosto estimado: $${costoEstimado.toLocaleString("es-CL")}. Proyección enviada a Finanzas.`,
          canal: "email_simulado",
          moduloOrigen: "PE",
          fecha: hoyISO(),
          leida: false,
        },
      })

      await registrarEventoPE(
        scope,
        "PE_PROYECCION_ENVIADA",
        id,
        `Proyección ${mesAnio}: ${proyeccionBase.diasFeriados} feriado(s), ${proyeccionBase.reemplazosNecesarios} reemplazo(s), costo estimado $${costoEstimado.toLocaleString("es-CL")} (liquidación pendiente en PL).`,
        tx
      )
    })

    return Response.json({ ok: true, id, costoEstimado })
  } catch (e) {
    logger.error({ err: e }, "[api/pe/proyecciones/enviar] error inesperado")
    return jsonError(500, "Error interno del servidor.")
  }
}
