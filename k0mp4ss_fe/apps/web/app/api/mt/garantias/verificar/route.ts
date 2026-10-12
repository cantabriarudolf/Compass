/**
 * /api/mt/garantias/verificar — verifica garantías de trabajos finalizados.
 *
 * POST custom (edición sobre "mt"): paridad server-side con
 * `verificarGarantiasMT` legacy. Recorre los trabajos Finalizados con
 * `garantiaFin` y alerta aún no enviada; si la garantía venció o expira dentro
 * de 30 días, marca `alertaGarantiaEnviada` (update condicional) y emite UN
 * evento `MT_GUARANTEE_EXPIRED`. La bandera vuelve al chequeo idempotente: una
 * segunda corrida no repite el evento.
 */
import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import { hoyISO } from "@/lib/date-utils"
import { errorGenerico } from "@/app/api/personas/route"
import { contextoAccionMT, registrarEventoMT } from "../../_acciones"

/** POST verifica las garantías vigentes y devuelve cuántas alertas emitió. */
export async function POST(): Promise<Response> {
  const contexto = await contextoAccionMT("editar")
  if (!contexto.ok) return contexto.response
  const { scope } = contexto

  try {
    const hoyStr = hoyISO()
    const limite30 = new Date()
    limite30.setDate(limite30.getDate() + 30)
    const limiteStr = limite30.toISOString().slice(0, 10)

    const trabajos = await prisma.trabajoMT.findMany({
      where: { comunidadId: scope.comunidadId, estado: "finalizado" },
      orderBy: { id: "asc" },
    })

    let alertadas = 0
    for (const trabajo of trabajos) {
      if (!trabajo.garantiaFin || trabajo.alertaGarantiaEnviada) continue
      const porVencer =
        trabajo.garantiaFin >= hoyStr && trabajo.garantiaFin <= limiteStr
      const vencida = trabajo.garantiaFin < hoyStr
      if (!porVencer && !vencida) continue

      // Update condicional: exactly-once del flag y del evento.
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
          ? `Garantía VENCIDA de ${trabajo.folio} "${trabajo.titulo}" (hasta ${trabajo.garantiaFin}); agendar inspección con proveedor.`
          : `Garantía por expirar (${trabajo.garantiaFin}) de ${trabajo.folio}; realizar inspección final.`
      )
    }

    return Response.json({ ok: true, alertadas })
  } catch (e) {
    logger.error({ err: e }, "[api/mt/garantias/verificar] error inesperado")
    return errorGenerico(e)
  }
}
