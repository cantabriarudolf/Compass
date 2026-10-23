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
  recurso: "co" | "co:buzon" | "co:lecturas",
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
