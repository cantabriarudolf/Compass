/**
 * Garantías MT resueltas al leer (decisión del owner 2026-10-22).
 *
 * Antes la verificación solo corría si alguien pulsaba "Verificar garantías" en
 * el panel: una garantía vencida podía quedar sin alerta indefinidamente.
 *
 * Ahora el `GET` de trabajos la ejecuta al servir la lista, con las mismas
 * reglas del POST (`app/api/mt/garantias/verificar`), que a su vez la reusa.
 *
 * Diseño:
 * - Un solo `findMany` acotado a los trabajos con alerta pendiente (sin N+1).
 * - Candado idempotente: el `updateMany` condicional decide quién emite el
 *   evento, así dos lecturas simultáneas no duplican la alerta.
 * - Best-effort: quien la llama desde un `GET` debe capturar el error para no
 *   tumbar la lectura.
 */
import { prisma } from "@/lib/prisma"
import { hoyISO } from "@/lib/date-utils"
import type { ComunidadScope } from "@/lib/api/with-comunidad-scope"
import { registrarEventoMT } from "./_acciones"

/** Tope por lectura: no barrer un backlog enorme en una sola request. */
const MAX_POR_LECTURA = 200

/** Ventana de aviso previo al vencimiento de la garantía. */
const DIAS_AVISO = 30

/**
 * Archiva/alerta las garantías vencidas o por vencer de la comunidad.
 * Devuelve cuántas alertas nuevas emitió.
 */
export async function verificarGarantiasAlLeer(
  scope: ComunidadScope
): Promise<number> {
  const hoyStr = hoyISO()
  const limite = new Date()
  limite.setDate(limite.getDate() + DIAS_AVISO)
  const limiteStr = limite.toISOString().slice(0, 10)

  const trabajos = await prisma.trabajoMT.findMany({
    where: {
      comunidadId: scope.comunidadId,
      estado: "finalizado",
      alertaGarantiaEnviada: false,
      garantiaFin: { not: null },
    },
    select: { id: true, garantiaFin: true, folio: true, titulo: true },
    orderBy: { id: "asc" },
    take: MAX_POR_LECTURA,
  })

  let alertadas = 0
  for (const trabajo of trabajos) {
    const fin = trabajo.garantiaFin
    if (!fin) continue

    const porVencer = fin >= hoyStr && fin <= limiteStr
    const vencida = fin < hoyStr
    if (!porVencer && !vencida) continue

    // Candado exactly-once: solo quien gana el update condicional emite evento.
    const update = await prisma.trabajoMT.updateMany({
      where: {
        id: trabajo.id,
        comunidadId: scope.comunidadId,
        alertaGarantiaEnviada: false,
      },
      data: { alertaGarantiaEnviada: true },
    })
    if (update.count === 0) continue

    alertadas += 1
    await registrarEventoMT(
      scope,
      "MT_GUARANTEE_EXPIRED",
      trabajo.id,
      vencida
        ? `Garantía VENCIDA de ${trabajo.folio} "${trabajo.titulo}" (hasta ${fin}); agendar inspección con proveedor.`
        : `Garantía por expirar (${fin}) de ${trabajo.folio}; realizar inspección final.`
    )
  }

  return alertadas
}
