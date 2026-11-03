/**
 * _avance-mantencion.ts — el ciclo preventivo lo cierra el SERVIDOR al registrar
 * la visita técnica (módulo co-locado, no es una ruta de Next).
 *
 * POR QUÉ VIVE ACÁ Y NO EN EL NAVEGADOR: registrar la visita avanzaba la
 * `proximaFecha` con un `PUT /api/pe/mantenciones/[id]` disparado desde la
 * pantalla, cuyo resultado nadie miraba. Cuando `pe:mantenciones` pasó a ser de
 * solo lectura para conserjería y mantención (`f7959cd`), ese PUT empezó a
 * responder 403 y la fecha dejó de avanzar SIN QUE NADIE SE ENTERARA: el maestro
 * quedaba con la fecha vieja y el panel de alertas no anunciaba la mantención a
 * tiempo. La causa raíz no fue el 403, fue hacer depender la coherencia del
 * registro de un permiso sobre el maestro: quien sabe que la visita ocurrió no
 * necesita administrar el calendario para que el dato quede coherente.
 *
 * DECISIONES (explicitas, no accidentes):
 * - ANCLA: la fecha de la VISITA (`visita.fecha`), no «ahora». La visita ES el
 *   evento que cierra el ciclo, así que cargar una visita atrasada produce el
 *   ciclo correcto en vez de saltar desde hoy. Efecto lateral deseado: reenviar
 *   la misma visita (upsert idempotente del POST) recalcula lo mismo y no deriva.
 * - Sin `mantencionId` → no hay nada que avanzar (`sin_mantencion`); es el caso
 *   normal de la visita puntual, no se registra ruido en el log.
 * - Mantención inexistente o de OTRA comunidad → la visita se guarda igual y el
 *   aviso es el mismo (`mantencion_no_encontrada`): no se filtra la existencia de
 *   datos de otro edificio. En el LOG sí se distingue el motivo, para que el
 *   operador pueda diagnosticar.
 * - Mantención sin periodicidad usable (dato derivado: ausente, 0, negativa o no
 *   entera) → no se inventa fecha (`sin_periodicidad`) y queda reportado.
 * - Si el cálculo da una fecha ANTERIOR a la vigente (visita cargada fuera de
 *   orden) se aplica igual —el ancla es la visita— pero se registra `retroceso`
 *   en el log: es la señal de que ese ciclo se está cargando tarde.
 * - NUNCA lanza: la visita ya está escrita y devolver un error haría que el
 *   cliente reintente y duplique el registro. Todo fallo se devuelve en el aviso.
 */
import { logger } from "@/lib/logger"
import { proximaFechaPreventiva } from "@/lib/personal-utils"
import { prisma } from "@/lib/prisma"

/** Resultado del intento de avanzar la próxima fecha de la mantención vinculada. */
export type EstadoAvanceMantencion =
  | "avanzada"
  | "sin_mantencion"
  | "mantencion_no_encontrada"
  | "sin_periodicidad"
  | "error"

/**
 * Aviso que viaja en la respuesta del POST (`avanceProximaFecha`).
 *
 * `mensaje` es texto para la pantalla y solo existe cuando hay algo que
 * advertir: la visita se registró, pero la mantención no se pudo reprogramar.
 */
export interface AvisoAvanceMantencion {
  estado: EstadoAvanceMantencion
  mantencionId?: string
  /** Nueva `proximaFecha` aplicada (solo en `avanzada`). */
  proximaFecha?: string
  mensaje?: string
}

/** Visita ya escrita, tal como la devuelve `POST /api/pe/visitas-tecnicas`. */
export interface VisitaRegistrada {
  id: string
  /** Comunidad resuelta desde la sesión por la factory: nunca la elige el cliente. */
  comunidadId: string
  fecha: string
  mantencionId?: string | null
}

const MSG_NO_ENCONTRADA =
  "La visita quedó registrada, pero la mantención vinculada no existe en esta comunidad: su próxima fecha no se reprogramó. Revisá el calendario preventivo."
const MSG_SIN_PERIODICIDAD =
  "La visita quedó registrada, pero la mantención vinculada no tiene una periodicidad declarada: su próxima fecha no se reprogramó. Definí la periodicidad en el calendario preventivo."
const MSG_ERROR =
  "La visita quedó registrada, pero no se pudo reprogramar la mantención vinculada. Revisá su próxima fecha a mano."

/**
 * Avanza la `proximaFecha` de la mantención vinculada a la visita por su
 * `periodicidadMeses`, anclada en la fecha de la visita.
 *
 * El `comunidadId` sale de la fila recién escrita (la puso el servidor desde la
 * sesión), así que el `update` no necesita volver a resolver el scope ni puede
 * caer en otro edificio.
 */
export async function avanzarProximaFechaPorVisita(
  visita: VisitaRegistrada
): Promise<AvisoAvanceMantencion> {
  const mantencionId = typeof visita.mantencionId === "string" ? visita.mantencionId.trim() : ""
  if (!mantencionId) return { estado: "sin_mantencion" }

  let mantencion: {
    id: string
    comunidadId: string
    proximaFecha: string
    periodicidadMeses: number
  } | null

  try {
    mantencion = await prisma.mantencionPreventivaPE.findUnique({
      where: { id: mantencionId },
      select: {
        id: true,
        comunidadId: true,
        proximaFecha: true,
        periodicidadMeses: true,
      },
    })
  } catch (e) {
    logger.error(
      { err: e, visitaId: visita.id, mantencionId, motivo: "lectura_fallida" },
      "[visitas-tecnicas] no se pudo leer la mantención vinculada a la visita"
    )
    return { estado: "error", mantencionId, mensaje: MSG_ERROR }
  }

  if (!mantencion || mantencion.comunidadId !== visita.comunidadId) {
    logger.warn(
      {
        visitaId: visita.id,
        mantencionId,
        motivo: mantencion ? "otra_comunidad" : "mantencion_inexistente",
      },
      "[visitas-tecnicas] la mantención vinculada no pertenece a esta comunidad: la visita se registró y la próxima fecha no se reprogramó"
    )
    return { estado: "mantencion_no_encontrada", mantencionId, mensaje: MSG_NO_ENCONTRADA }
  }

  const periodicidad = mantencion.periodicidadMeses
  if (!Number.isInteger(periodicidad) || periodicidad < 1) {
    logger.warn(
      { visitaId: visita.id, mantencionId, periodicidadMeses: periodicidad, motivo: "sin_periodicidad" },
      "[visitas-tecnicas] la mantención vinculada no tiene periodicidad usable: la próxima fecha no se reprogramó"
    )
    return { estado: "sin_periodicidad", mantencionId, mensaje: MSG_SIN_PERIODICIDAD }
  }

  const proximaFecha = proximaFechaPreventiva(visita.fecha, periodicidad)

  try {
    await prisma.mantencionPreventivaPE.update({
      where: { id: mantencion.id },
      data: { proximaFecha },
    })
  } catch (e) {
    logger.error(
      { err: e, visitaId: visita.id, mantencionId, motivo: "escritura_fallida" },
      "[visitas-tecnicas] no se pudo escribir la próxima fecha de la mantención vinculada"
    )
    return { estado: "error", mantencionId, mensaje: MSG_ERROR }
  }

  if (proximaFecha < mantencion.proximaFecha) {
    logger.warn(
      {
        visitaId: visita.id,
        mantencionId,
        motivo: "retroceso",
        proximaFechaAnterior: mantencion.proximaFecha,
        proximaFecha,
      },
      "[visitas-tecnicas] la visita se cargó fuera de orden y la próxima fecha quedó antes de la vigente"
    )
  }

  logger.info(
    {
      visitaId: visita.id,
      mantencionId,
      fechaVisita: visita.fecha,
      periodicidadMeses: periodicidad,
      proximaFechaAnterior: mantencion.proximaFecha,
      proximaFecha,
    },
    "[visitas-tecnicas] mantención reprogramada por la visita técnica"
  )

  return {
    estado: "avanzada",
    mantencionId,
    proximaFecha,
    mensaje: `Mantención reprogramada al ${proximaFecha}.`,
  }
}
