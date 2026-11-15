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
 * La poda del Map es DELIBERADAMENTE distinta de la del contador
 * (`lib/rate-limit-volumen.ts` vacía el Map entero arriba de mil entradas): aquí
 * borrar entradas VIGENTES reabriría el dedup de sus dueños y reconstruiría la
 * inundación que el evento acotado existe para frenar. Lo encontró la revisión
 * nativa de `91df430` —dos lentes lo marcaron— y lo pinea
 * `test/lib/denegacion-co-volumen.test.ts`. Se borran sólo las entradas vencidas,
 * o sea que el Map queda acotado por la CANTIDAD de usuarios distintos que
 * cruzaron el techo dentro de la ventana de 60 s —proporcional al tráfico real y
 * auto-sanante en la primera pasada posterior al vencimiento—, NO por una
 * constante: un tope duro tipo «descarto el más viejo» evictaría ventanas
 * vigentes, que es justo el defecto que esta poda cierra. Este Map es ajeno
 * al contador y no importa sus internos: ese archivo es dueño del CONTADOR; este,
 * del EVENTO de auditoría.
 *
 * Sin PII: se identifica por `usuarioId`, nunca por email ni nombre.
 */
const eventosVolumenEmitidos = new Map<string, number>()

export function registrarLimiteVolumen(usuarioId: string, ahora: number = Date.now()): void {
  const expira = eventosVolumenEmitidos.get(usuarioId)
  if (expira !== undefined && ahora < expira) return
  // Poda por ENTRADA VENCIDA, nunca `clear()` ni un tope duro: barrer ventanas
  // vigentes reabriría el dedup de sus dueños, o sea la inundación de log que
  // este evento acotado evita. El Map queda acotado por los usuarios DISTINTOS
  // de la ventana y se auto-sana en la primera pasada posterior al vencimiento.
  if (eventosVolumenEmitidos.size > 1000) {
    for (const [clave, vence] of eventosVolumenEmitidos) {
      if (ahora >= vence) eventosVolumenEmitidos.delete(clave)
    }
  }
  eventosVolumenEmitidos.set(usuarioId, ahora + VENTANA_EVENTO_VOLUMEN_MS)
  logger.warn({ event: "RP_VOLUME_LIMITED", usuarioId }, "[authz] RP_VOLUME_LIMITED")
}
