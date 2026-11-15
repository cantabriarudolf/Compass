/**
 * Auditoría de denegaciones de Comunicación con Vecinos (CO).
 *
 * RP §Menor Privilegio exige que todo acceso denegado emita `RP_PERMISSION_DENIED`
 * (AM). Los 403 propios de CO —ver envíos, emitir una difusión, consultar el
 * desglose nominativo de lecturas— se resuelven en handlers a medida, así que no
 * pasan por el `authzCheck` del factory y necesitan este registro explícito.
 *
 * Sin PII en los logs: se identifica por `usuario.id`, nunca por email.
 */
import { logger } from "@/lib/logger"

type AccionDenegada = "ver" | "crear" | "editar" | "eliminar" | "ejecutar"

export function registrarDenegacionCo(
  scope: { usuarioId: string; rol: string; comunidadId: string },
  recurso: "co" | "co:buzon" | "co:lecturas" | "co:difusiones",
  accion: AccionDenegada
): void {
  logger.warn(
    {
      event: "RP_PERMISSION_DENIED",
      usuarioId: scope.usuarioId,
      rol: scope.rol,
      recurso,
      accion,
      comunidadId: scope.comunidadId,
    },
    `[authz] RP_PERMISSION_DENIED ${recurso}`
  )
}

/** Ventana del evento del techo: un aviso por usuario cada 60 segundos. */
const VENTANA_EVENTO_VOLUMEN_MS = 60_000

/**
 * Evento de auditoría del TECHO DE VOLUMEN (`RP_VOLUME_LIMITED`, R4-001).
 *
 * Es SU PROPIO evento y NO una extensión de `RP_PERMISSION_DENIED`, a propósito:
 * un 429 no es una denegación de permiso. El llamador que agota el techo TIENE
 * `co:difusiones` crear —el portón se lo concede— y está inundando de forma
 * legítima; atribuirle una denegación de privilegio envenenaría la auditoría de
 * privilegios, que debe leerse como «quién intentó lo que no tiene».
 *
 * El evento es por EVENTO del limitador (uno por ventana por usuario), NO por
 * respuesta: una inundación produce un 429 por request, y un evento por respuesta
 * reconstruiría la misma inundación de log que el techo existe para frenar.
 *
 * La poda del Map replica el criterio oportunista de `lib/rate-limit-volumen.ts`
 * (tope de tamaño y limpieza) para que no crezca sin límite. Este Map es ajeno al
 * contador del techo y no importa sus internos: ese archivo es dueño del CONTADOR;
 * este, del EVENTO de auditoría.
 *
 * Sin PII: se identifica por `usuarioId`, nunca por email ni nombre.
 */
const eventosVolumenEmitidos = new Map<string, number>()

export function registrarLimiteVolumen(usuarioId: string, ahora: number = Date.now()): void {
  const expira = eventosVolumenEmitidos.get(usuarioId)
  if (expira !== undefined && ahora < expira) return
  // Poda oportunista, el mismo criterio del contador de volumen: fuera de
  // memoria antes de que el Map crezca sin límite.
  if (eventosVolumenEmitidos.size > 1000) eventosVolumenEmitidos.clear()
  eventosVolumenEmitidos.set(usuarioId, ahora + VENTANA_EVENTO_VOLUMEN_MS)
  logger.warn({ event: "RP_VOLUME_LIMITED", usuarioId }, "[authz] RP_VOLUME_LIMITED")
}
