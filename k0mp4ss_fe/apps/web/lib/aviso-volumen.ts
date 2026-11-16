/**
 * Aviso de auditoría del TECHO DE VOLUMEN (`RP_VOLUME_LIMITED`, R4-001) — el
 * helper NEUTRO para cualquier ruta con techo de volumen (`lib/rate-limit-volumen.ts`),
 * sin saber nada de dominios.
 *
 * Por qué existe al lado del contador y no en `app/api/co/_lib/denegacion.ts`:
 * el evento nació allá para el alcance masivo, pero un helper de CO no se
 * importa desde una ruta de CT — los módulos de un dominio no son la biblioteca
 * de los otros. Los buscadores con techo (`certificados-ct`, `comunicacion`)
 * respondían 429 sin dejar rastro; con este helper responden el 429 Y emiten el
 * evento, con la misma forma que la copia de CO. Esa copia conserva el suyo para
 * su ruta: el invariante de dedup es POR EMISOR (una ventana por usuario por
 * emisor), así que dos emisores distintos producen a lo sumo dos eventos por
 * ventana — acotado por usuarios, no por respuestas.
 *
 * Sin PII en los logs: se identifica por `usuarioId`, nunca por email ni nombre.
 */
import { logger } from "@/lib/logger"

/** Ventana del evento del techo: un aviso por usuario cada 60 segundos. */
const VENTANA_EVENTO_VOLUMEN_MS = 60_000

/**
 * Ventanas ya emitidas, por usuario: el evento es por EVENTO del limitador (uno
 * por ventana de 60 s por usuario), NO por respuesta — una inundación produce un
 * 429 por request, y un evento por respuesta reconstruiría la misma inundación
 * de log que el techo existe para frenar.
 */
const eventosVolumenEmitidos = new Map<string, number>()

export function registrarLimiteVolumen(usuarioId: string, ahora: number = Date.now()): void {
  const expira = eventosVolumenEmitidos.get(usuarioId)
  if (expira !== undefined && ahora < expira) return
  // Poda por ENTRADA VENCIDA, nunca `clear()` ni un tope duro (T16,
  // R3-limiter-bulk-clear + R4-1): barrer ventanas VIGENTES reabriría el dedup
  // de sus dueños, o sea la inundación de log que este evento acotado evita.
  // El Map queda acotado por los usuarios DISTINTOS de la ventana y se
  // auto-sana en la primera pasada posterior al vencimiento.
  if (eventosVolumenEmitidos.size > 1000) {
    for (const [clave, vence] of eventosVolumenEmitidos) {
      if (ahora >= vence) eventosVolumenEmitidos.delete(clave)
    }
  }
  eventosVolumenEmitidos.set(usuarioId, ahora + VENTANA_EVENTO_VOLUMEN_MS)
  logger.warn({ event: "RP_VOLUME_LIMITED", usuarioId }, "[authz] RP_VOLUME_LIMITED")
}
